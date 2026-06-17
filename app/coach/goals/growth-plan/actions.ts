"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { GrowthPlanRow, GrowthPlanScenario, GrowthPlanClientSnapshot, GrowthPlanBundle } from "./types";

const WEEKLY_TARGET = 150_000 / 52;

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function listGrowthPlan(): Promise<GrowthPlanBundle> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") {
    return { rows: [], snapshots: {}, scenarios: [], weekly_target: WEEKLY_TARGET };
  }
  if (!hasSupabaseEnv()) {
    return { rows: [], snapshots: {}, scenarios: [], weekly_target: WEEKLY_TARGET };
  }
  const sb = createSupabaseAdmin();

  // 1) Existing plan rows
  const { data: rowData } = await sb
    .from("growth_plan_rows")
    .select("*")
    .eq("coach_id", me.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const rows: GrowthPlanRow[] = (rowData ?? []) as GrowthPlanRow[];

  // 2) Scenarios
  const { data: scData } = await sb
    .from("growth_plan_scenarios")
    .select("*")
    .eq("coach_id", me.id)
    .order("created_at", { ascending: true });
  const scenarios: GrowthPlanScenario[] = (scData ?? []) as GrowthPlanScenario[];

  // 3) Build a client snapshot for every client visible to this coach
  // (auto-seeds the row list — even brand-new coaches see every active
  // client before they create any explicit growth-plan rows).
  const { data: clients } = await sb
    .from("profiles")
    .select("id, full_name, details:client_details!client_details_profile_id_fkey ( coach_id, session_rate )")
    .eq("role", "client");
  const visibleClients = (clients ?? []).filter((p: { id: string; full_name: string; details: { coach_id: string | null; session_rate: number | null } | { coach_id: string | null; session_rate: number | null }[] | null }) => {
    const d = Array.isArray(p.details) ? p.details[0] : p.details;
    if (!d) return false;
    return !d.coach_id || d.coach_id === me.id;
  });

  // 4) Pull recent appointments for those clients to derive avg
  // sessions/week and applied rate increases.
  const sinceIso = new Date(Date.now() - 8 * 7 * 86400000).toISOString();
  const { data: appts } = await sb
    .from("appointments")
    .select("client_id, starts_at, rate, status, session_type")
    .eq("coach_id", me.id)
    .gte("starts_at", sinceIso);

  const apptsByClient = new Map<string, { starts_at: string; rate: number | null; status: string }[]>();
  for (const a of (appts ?? []) as { client_id: string | null; starts_at: string; rate: number | null; status: string; session_type: string }[]) {
    if (!a.client_id) continue;
    if (a.session_type !== "session") continue;
    if (a.status === "cancelled" || a.status === "no_show") continue;
    const arr = apptsByClient.get(a.client_id) ?? [];
    arr.push({ starts_at: a.starts_at, rate: a.rate, status: a.status });
    apptsByClient.set(a.client_id, arr);
  }

  // Pull the full historical rate ladder per client (cheap: just two
  // columns), used to detect every rate step-up.
  const { data: allAppts } = await sb
    .from("appointments")
    .select("client_id, starts_at, rate, session_type, status")
    .eq("coach_id", me.id);
  const fullByClient = new Map<string, { starts_at: string; rate: number | null }[]>();
  for (const a of (allAppts ?? []) as { client_id: string | null; starts_at: string; rate: number | null; session_type: string; status: string }[]) {
    if (!a.client_id) continue;
    if (a.session_type !== "session") continue;
    if (a.status === "cancelled" || a.status === "no_show") continue;
    if (a.rate == null) continue;
    const arr = fullByClient.get(a.client_id) ?? [];
    arr.push({ starts_at: a.starts_at, rate: a.rate });
    fullByClient.set(a.client_id, arr);
  }

  const snapshots: Record<string, GrowthPlanClientSnapshot> = {};
  for (const p of visibleClients) {
    const d = Array.isArray(p.details) ? p.details[0] : p.details;
    const recent = apptsByClient.get(p.id) ?? [];
    const weeks = new Map<string, number>();
    for (const a of recent) {
      const wk = weekKey(new Date(a.starts_at));
      weeks.set(wk, (weeks.get(wk) ?? 0) + 1);
    }
    const spw = weeks.size === 0
      ? null
      : Array.from(weeks.values()).reduce((s, n) => s + n, 0) / Math.max(1, weeks.size);

    // Applied rate increases: walk chronologically, log each step-up.
    const ladder = (fullByClient.get(p.id) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const applied: { date: string; from_rate: number; to_rate: number }[] = [];
    let prevRate: number | null = null;
    for (const a of ladder) {
      if (prevRate != null && a.rate! > prevRate) {
        applied.push({ date: a.starts_at, from_rate: prevRate, to_rate: a.rate! });
      }
      prevRate = a.rate;
    }

    const liveRate = d?.session_rate ?? (ladder[ladder.length - 1]?.rate ?? null);
    const cvi = liveRate != null && spw != null ? Math.round(liveRate * spw) : null;
    snapshots[p.id] = {
      client_id: p.id,
      full_name: p.full_name,
      current_rate: liveRate,
      current_spw: spw,
      applied_increases: applied,
      cvi_proxy: cvi,
    };
  }

  return { rows, snapshots, scenarios, weekly_target: WEEKLY_TARGET };
}

function weekKey(d: Date): string {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday-anchored
  return s.toISOString().slice(0, 10);
}

export async function upsertGrowthPlanRow(input: {
  id?: string;
  client_id?: string | null;
  label?: string | null;
  tested_rate?: number | null;
  tested_spw?: number | null;
  blackout_start?: string | null;
  blackout_end?: string | null;
  end_date?: string | null;
  notes?: string | null;
  sort_order?: number;
}): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const sb = createSupabaseAdmin();
  const payload: Record<string, unknown> = { coach_id: me.id };
  for (const k of [
    "client_id", "label", "tested_rate", "tested_spw",
    "blackout_start", "blackout_end", "end_date", "notes", "sort_order",
  ] as const) {
    if (k in input) payload[k] = (input as Record<string, unknown>)[k];
  }
  if (input.id) {
    const { error } = await sb.from("growth_plan_rows").update(payload).eq("id", input.id).eq("coach_id", me.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/coach/goals/growth-plan");
    return { ok: true, data: { id: input.id } };
  }
  const { data, error } = await sb.from("growth_plan_rows").insert(payload).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  revalidatePath("/coach/goals/growth-plan");
  return { ok: true, data: { id: data.id } };
}

export async function deleteGrowthPlanRow(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from("growth_plan_rows").delete().eq("id", id).eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/goals/growth-plan");
  return { ok: true };
}

export async function upsertGrowthPlanScenario(input: {
  id?: string;
  name: string;
  notes?: string | null;
  changes?: Record<string, { rate?: number; spw?: number; end_date?: string }>;
}): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const sb = createSupabaseAdmin();
  const payload: Record<string, unknown> = {
    coach_id: me.id,
    name: input.name.trim() || "Scenario",
    notes: input.notes ?? null,
    changes: input.changes ?? {},
  };
  if (input.id) {
    const { error } = await sb.from("growth_plan_scenarios").update(payload).eq("id", input.id).eq("coach_id", me.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/coach/goals/growth-plan");
    return { ok: true, data: { id: input.id } };
  }
  const { data, error } = await sb.from("growth_plan_scenarios").insert(payload).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  revalidatePath("/coach/goals/growth-plan");
  return { ok: true, data: { id: data.id } };
}

export async function deleteGrowthPlanScenario(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from("growth_plan_scenarios").delete().eq("id", id).eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/goals/growth-plan");
  return { ok: true };
}

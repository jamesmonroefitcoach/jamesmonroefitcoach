"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

export type DayLogEntry = {
  name: string;
  weights: string[];
  reps: string[];
  done: boolean;
  notes: string;
};

export type ProgramDayLog = {
  id: string;
  program_id: string;
  client_id: string;
  day_index: number;
  day_title: string | null;
  logged_date: string | null;
  entries: Record<string, DayLogEntry> | null;
  note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// ── client submits one logged day ──────────────────────────────────────
export async function submitProgramDayLog(input: {
  programId: string;
  dayIndex: number;
  dayTitle?: string;
  loggedDate?: string;          // YYYY-MM-DD; defaults to today
  entries: Record<string, DayLogEntry>;
  note?: string;
}): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "client") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!input.programId) return { ok: false, error: "Missing program." };

  const supabase = createSupabaseAdmin();
  // Confirm the program belongs to this client + grab the coach for the row.
  const { data: prog } = await supabase
    .from("programs")
    .select("id, client_id, coach_id")
    .eq("id", input.programId)
    .maybeSingle<{ id: string; client_id: string; coach_id: string | null }>();
  if (!prog || prog.client_id !== me.id) return { ok: false, error: "Program not found." };

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("program_day_logs")
    .insert({
      program_id: input.programId,
      client_id: me.id,
      coach_id: prog.coach_id,
      day_index: input.dayIndex ?? 0,
      day_title: input.dayTitle ?? null,
      logged_date: input.loggedDate || today,
      entries: input.entries ?? {},
      note: input.note?.trim() || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? "Save failed." };

  // Surface to James on the client profile + dashboard.
  revalidatePath(`/coach/clients/${me.id}`);
  revalidatePath("/coach");
  return { ok: true, data: { id: data.id } };
}

// ── coach: list a client's logged days ──────────────────────────────────
export async function listProgramDayLogsForClient(clientId: string): Promise<ProgramDayLog[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  if (!hasSupabaseEnv()) return [];
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("program_day_logs")
    .select("id, program_id, client_id, day_index, day_title, logged_date, entries, note, submitted_at, reviewed_at")
    .eq("coach_id", me.id)
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false })
    .limit(100);
  return (data ?? []) as ProgramDayLog[];
}

// ── coach: count of unreviewed logs (drives the "new" badge) ────────────
export async function countUnreviewedDayLogs(): Promise<number> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return 0;
  if (!hasSupabaseEnv()) return 0;
  const supabase = createSupabaseAdmin();
  const { count } = await supabase
    .from("program_day_logs")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", me.id)
    .is("reviewed_at", null);
  return count ?? 0;
}

// ── coach: mark a log reviewed ──────────────────────────────────────────
export async function markDayLogReviewed(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("program_day_logs")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach");
  return { ok: true };
}

"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForClient } from "@/lib/data";
import type { Category, ProgramKind } from "@/lib/programs";

export type SaveProgramItem = {
  movement_id?: string;     // existing movement
  movement_name: string;    // for ad-hoc / lookup
  category: Category;
  is_warmup: boolean;
  sets: number;
  reps: string;
  exertion: string;
  rest_seconds?: number | null;
  notes?: string | null;
};

export type SaveProgramDay = {
  day_number: number;
  title: string;
  focus?: string | null;
  notes?: string | null;
  items: SaveProgramItem[];
};

export type SaveProgramInput = {
  program_id?: string;
  client_id: string;
  name: string;
  starts_on: string;        // YYYY-MM-DD
  duration_weeks: number;
  based_on_program_id?: string | null;
  publish: boolean;
  days: SaveProgramDay[];
  program_kind: ProgramKind;
  at_home_cadence?: string | null;
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function saveProgram(input: SaveProgramInput): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = await createSupabaseServer();

  // compute ends_on from starts_on + duration_weeks
  const start = new Date(input.starts_on);
  const end = new Date(start);
  end.setDate(end.getDate() + 7 * Math.max(0, input.duration_weeks));

  let programId = input.program_id;

  if (programId) {
    const { error } = await supabase
      .from("programs")
      .update({
        name: input.name,
        starts_on: input.starts_on,
        ends_on: end.toISOString().slice(0, 10),
        duration_weeks: input.duration_weeks,
        based_on_program_id: input.based_on_program_id ?? null,
        is_published: input.publish,
        is_current: input.publish,
        program_kind: input.program_kind,
        at_home_cadence: input.at_home_cadence ?? null
      })
      .eq("id", programId);
    if (error) return { ok: false, error: error.message };

    // purge existing days/movements (simplest, given UI rebuilds in place)
    const { data: existingDays } = await supabase.from("program_days").select("id").eq("program_id", programId);
    const ids = (existingDays ?? []).map((d) => d.id);
    if (ids.length) await supabase.from("program_movements").delete().in("program_day_id", ids);
    await supabase.from("program_days").delete().eq("program_id", programId);
  } else {
    if (input.publish) {
      // Only unset previous "current" of the *same kind* — a client can have an
      // in-gym current AND an at-home current simultaneously.
      await supabase
        .from("programs")
        .update({ is_current: false })
        .eq("client_id", input.client_id)
        .eq("is_current", true)
        .eq("program_kind", input.program_kind);
    }
    const { data, error } = await supabase
      .from("programs")
      .insert({
        client_id: input.client_id,
        coach_id: me.id,
        name: input.name,
        starts_on: input.starts_on,
        ends_on: end.toISOString().slice(0, 10),
        duration_weeks: input.duration_weeks,
        based_on_program_id: input.based_on_program_id ?? null,
        is_published: input.publish,
        is_current: input.publish,
        program_kind: input.program_kind,
        at_home_cadence: input.at_home_cadence ?? null
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
    programId = data.id;
  }

  // resolve movements: lookup-or-create by name+category
  for (const day of input.days) {
    const { data: dayRow, error: dayErr } = await supabase
      .from("program_days")
      .insert({
        program_id: programId,
        day_number: day.day_number,
        title: day.title,
        focus: day.focus ?? null,
        notes: day.notes ?? null
      })
      .select("id")
      .single();
    if (dayErr || !dayRow) return { ok: false, error: dayErr?.message ?? "day insert failed" };

    for (let i = 0; i < day.items.length; i++) {
      const it = day.items[i];
      let movementId = it.movement_id;
      if (!movementId) {
        const { data: existing } = await supabase
          .from("movements")
          .select("id")
          .eq("name", it.movement_name)
          .eq("category", it.category)
          .maybeSingle();
        if (existing) movementId = existing.id;
        else {
          const { data: ins } = await supabase
            .from("movements")
            .insert({ name: it.movement_name, category: it.category, created_by: me.id })
            .select("id")
            .single();
          movementId = ins?.id;
        }
      }
      if (!movementId) continue;
      await supabase.from("program_movements").insert({
        program_day_id: dayRow.id,
        movement_id: movementId,
        order_index: i,
        is_warmup: it.is_warmup,
        sets: it.sets,
        reps: it.reps,
        exertion: it.exertion,
        rest_seconds: it.rest_seconds ?? null,
        notes: it.notes ?? null
      });
    }
  }

  revalidatePath(`/coach/clients/${input.client_id}`);
  revalidatePath("/coach/clients");
  revalidatePath("/coach/build-program");
  if (!programId) return { ok: false, error: "program id missing after save" };
  return { ok: true, data: { id: programId } };
}

export type ApptOption = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  program_status: string;
};

export async function getClientAppointments(clientId: string): Promise<ApptOption[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  const appts = await listAppointmentsForClient(clientId);
  const now = new Date().toISOString();
  return appts
    .filter((a) => a.session_type === "session" && (a.status === "scheduled" || a.status === "change_requested") && a.starts_at >= now)
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      status: a.status,
      program_status: a.program_status ?? "needs_programming"
    }));
}

// Client-side movement logging (per set). Used during/after a session.
export async function logMovementSet(input: {
  appointment_id?: string | null;
  program_movement_id: string;
  set_index: number;
  reps?: number | null;
  weight_lb?: number | null;
  rpe?: number | null;
  notes?: string | null;
}): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("movement_logs").insert({
    client_id: me.id,
    appointment_id: input.appointment_id ?? null,
    program_movement_id: input.program_movement_id,
    set_index: input.set_index,
    reps: input.reps ?? null,
    weight_lb: input.weight_lb ?? null,
    rpe: input.rpe ?? null,
    notes: input.notes ?? null
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/client");
  return { ok: true };
}

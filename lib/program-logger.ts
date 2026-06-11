// Per-set logger for the client side — read program + write actuals into
// program_movements.actuals, plus a markComplete that flips is_current off
// and posts an italic auto-message into the coach's Messages inbox.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { loadOrCreateClientThread, postSystemMessage } from "@/lib/messages";

export type LoggerSet = {
  set_index: number;
  reps_actual: string | null;
  weight_actual: string | null;
  done_at: string | null;
  adjusted: boolean;
};

export type LoggerRow = {
  id: string;
  order_index: number;
  movement_name: string;
  equipment: string | null;
  prescribed_sets: number;
  prescribed_reps: string | null;
  prescribed_weight: string | null;
  prescribed_notes: string | null;
  is_warmup: boolean;
  sets: LoggerSet[];
  note: string | null;
};

export type LoggerDay = {
  id: string;
  day_number: number;
  title: string;
  rows: LoggerRow[];
};

export type LoggerProgram = {
  id: string;
  name: string;
  program_kind: string;
  is_current: boolean;
  client_id: string;
  coach_id: string;
  days: LoggerDay[];
};

type ActualsJson = {
  sets?: Array<{
    set_index?: number;
    reps_actual?: string | null;
    weight_actual?: string | null;
    done_at?: string | null;
    adjusted?: boolean;
  }>;
  note?: string | null;
};

function buildSets(actuals: ActualsJson | null, prescribed: number): LoggerSet[] {
  const out: LoggerSet[] = [];
  const incoming = actuals?.sets ?? [];
  for (let i = 0; i < Math.max(prescribed, 1); i++) {
    const a = incoming.find((s) => (s.set_index ?? -1) === i);
    out.push({
      set_index: i,
      reps_actual: a?.reps_actual ?? null,
      weight_actual: a?.weight_actual ?? null,
      done_at: a?.done_at ?? null,
      adjusted: !!a?.adjusted,
    });
  }
  return out;
}

export async function getProgramForLogging(
  programId: string,
  viewerId: string
): Promise<LoggerProgram | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = createSupabaseAdmin();

  const { data: program } = await supabase
    .from("programs")
    .select("id, name, program_kind, is_current, client_id, coach_id")
    .eq("id", programId)
    .maybeSingle<{
      id: string;
      name: string;
      program_kind: string;
      is_current: boolean;
      client_id: string;
      coach_id: string;
    }>();
  if (!program) return null;

  // Visibility check: only the client themselves or their coach (or admins).
  if (program.client_id !== viewerId && program.coach_id !== viewerId) {
    return null;
  }

  const { data: days } = await supabase
    .from("program_days")
    .select("id, day_number, title")
    .eq("program_id", programId)
    .order("day_number", { ascending: true });
  const dayRows = (days ?? []) as { id: string; day_number: number; title: string | null }[];

  const dayIds = dayRows.map((d) => d.id);
  const { data: moves } = dayIds.length
    ? await supabase
        .from("program_movements")
        .select(
          "id, program_day_id, movement_id, order_index, sets, reps, weight, is_warmup, " +
          "name_text, equipment_text, notes_text, actuals"
        )
        .in("program_day_id", dayIds)
        .order("order_index", { ascending: true })
    : { data: [] };
  const moveRows = (moves ?? []) as unknown as Array<{
    id: string;
    program_day_id: string;
    movement_id: string | null;
    order_index: number;
    sets: number | null;
    reps: string | null;
    weight: string | null;
    is_warmup: boolean;
    name_text: string | null;
    equipment_text: string | null;
    notes_text: string | null;
    actuals: ActualsJson | null;
  }>;

  // movement names for FK rows
  const movementIds = Array.from(
    new Set(moveRows.map((m) => m.movement_id).filter((x): x is string => !!x))
  );
  const movementNameById = new Map<string, string>();
  if (movementIds.length) {
    const { data: mlist } = await supabase
      .from("movements")
      .select("id, name")
      .in("id", movementIds);
    (mlist as Array<{ id: string; name: string }> | null)?.forEach((m) =>
      movementNameById.set(m.id, m.name)
    );
  }

  const days_: LoggerDay[] = dayRows.map((d) => {
    const rows = moveRows
      .filter((m) => m.program_day_id === d.id)
      .map((m): LoggerRow => {
        const name = m.movement_id
          ? movementNameById.get(m.movement_id) ?? m.name_text ?? "—"
          : m.name_text ?? "—";
        return {
          id: m.id,
          order_index: m.order_index,
          movement_name: name,
          equipment: m.equipment_text ?? null,
          prescribed_sets: m.sets ?? 1,
          prescribed_reps: m.reps,
          prescribed_weight: m.weight,
          prescribed_notes: m.notes_text,
          is_warmup: m.is_warmup,
          sets: buildSets(m.actuals, m.sets ?? 1),
          note: m.actuals?.note ?? null,
        };
      });
    return {
      id: d.id,
      day_number: d.day_number,
      title: d.title ?? `Day ${d.day_number}`,
      rows,
    };
  });

  return {
    id: program.id,
    name: program.name,
    program_kind: program.program_kind,
    is_current: program.is_current,
    client_id: program.client_id,
    coach_id: program.coach_id,
    days: days_,
  };
}

// ─── writes ──────────────────────────────────────────────────────────

function isAdjusted(
  prescribedReps: string | null,
  prescribedWeight: string | null,
  actualReps: string | null,
  actualWeight: string | null
): boolean {
  const norm = (s: string | null) => (s ?? "").trim();
  // Weight: if James didn't prescribe it (null/empty), the client is filling
  // in what was blank — that's NOT an adjustment, that's data entry.
  const weightAdjusted = norm(prescribedWeight) !== "" && norm(prescribedWeight) !== norm(actualWeight);
  // Reps: a prescribed value of "8-12" is a range; only flag if the actual
  // is set to something that doesn't look like an exact match of the range
  // text. Simple equality for now.
  const repsAdjusted = norm(prescribedReps) !== "" && norm(prescribedReps) !== norm(actualReps);
  return weightAdjusted || repsAdjusted;
}

export async function logSet(input: {
  programMovementId: string;
  setIndex: number;
  repsActual: string | null;
  weightActual: string | null;
  done: boolean;
}): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = createSupabaseAdmin();
  const { data: row } = await supabase
    .from("program_movements")
    .select("reps, weight, actuals, sets")
    .eq("id", input.programMovementId)
    .maybeSingle<{
      reps: string | null;
      weight: string | null;
      sets: number | null;
      actuals: ActualsJson | null;
    }>();
  if (!row) return false;
  const adjusted = isAdjusted(row.reps, row.weight, input.repsActual, input.weightActual);
  const sets = row.actuals?.sets ?? [];
  const filtered = sets.filter((s) => (s.set_index ?? -1) !== input.setIndex);
  filtered.push({
    set_index: input.setIndex,
    reps_actual: input.repsActual,
    weight_actual: input.weightActual,
    done_at: input.done ? new Date().toISOString() : null,
    adjusted,
  });
  filtered.sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0));
  const next: ActualsJson = { ...(row.actuals ?? {}), sets: filtered };
  const { error } = await supabase
    .from("program_movements")
    .update({ actuals: next })
    .eq("id", input.programMovementId);
  return !error;
}

export async function updateRowNote(programMovementId: string, note: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = createSupabaseAdmin();
  const { data: row } = await supabase
    .from("program_movements")
    .select("actuals")
    .eq("id", programMovementId)
    .maybeSingle<{ actuals: ActualsJson | null }>();
  if (!row) return false;
  const next: ActualsJson = { ...(row.actuals ?? {}), note: note.trim() || null };
  const { error } = await supabase
    .from("program_movements")
    .update({ actuals: next })
    .eq("id", programMovementId);
  return !error;
}

export async function markProgramComplete(programId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured" };
  const supabase = createSupabaseAdmin();
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, client_id, coach_id, is_current")
    .eq("id", programId)
    .maybeSingle<{
      id: string;
      name: string;
      client_id: string;
      coach_id: string;
      is_current: boolean;
    }>();
  if (!program) return { ok: false, error: "Program not found" };

  const { error } = await supabase
    .from("programs")
    .update({ is_current: false })
    .eq("id", programId);
  if (error) return { ok: false, error: error.message };

  // Auto-message to the coach's Messages inbox.
  try {
    const thread = await loadOrCreateClientThread(program.client_id, program.coach_id);
    if (thread) {
      await postSystemMessage({
        thread_id: thread.id,
        sender_id: program.client_id,
        body: `Completed: ${program.name}`,
        link_url: `/coach/clients/${program.client_id}/programs/${program.id}`,
        link_label: "View",
      });
    }
  } catch (e) {
    console.warn("[markProgramComplete] message post failed", e);
  }

  return { ok: true };
}

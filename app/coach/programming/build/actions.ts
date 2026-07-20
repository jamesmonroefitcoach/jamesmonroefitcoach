"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForClient } from "@/lib/data";
import type { Category, ProgramKind } from "@/lib/programs";
import { syncProgramToSheet, getOrCreatePairedSheet } from "@/lib/programs-sheets-bridge";
import { getWorkoutSheet } from "@/lib/workout-sheets.server";

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
  appt_id?: string | null;  // if set, link this program back to the appointment via session_program_id
  client_id: string;
  name: string;
  starts_on: string;        // YYYY-MM-DD
  duration_weeks: number;
  based_on_program_id?: string | null;
  publish: boolean;
  days: SaveProgramDay[];
  program_kind: ProgramKind;
  at_home_cadence?: string | null;
  // Lossless snapshot of the builder UI state (set_rows, supersets, optional
  // fields, variations, etc.) — written to programs.builder_state. Lets us
  // restore and import programs without losing data the normalized tables
  // don't have columns for.
  builder_state?: unknown;
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function saveProgram(input: SaveProgramInput): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = createSupabaseAdmin();

  // compute ends_on from starts_on + duration_weeks
  const start = new Date(input.starts_on);
  const end = new Date(start);
  end.setDate(end.getDate() + 7 * Math.max(0, input.duration_weeks));

  let programId = input.program_id;

  const builderStateJson = input.builder_state ?? null;

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
        at_home_cadence: input.at_home_cadence ?? null,
        builder_state: builderStateJson,
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
        at_home_cadence: input.at_home_cadence ?? null,
        builder_state: builderStateJson,
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

  // Link the new program to its appointment (uses existing session_program_id
  // column — no schema change required). Re-saving the same draft reuses the
  // same programs row, so publishing naturally overwrites the prior draft.
  if (input.appt_id && programId) {
    await supabase
      .from("appointments")
      .update({ session_program_id: programId, updated_at: new Date().toISOString() })
      .eq("id", input.appt_id)
      .eq("coach_id", me.id);
  }

  // Bridge sync (Step 3): write the paired workout_sheets row so the
  // Template view auto-renders the same plan as sheet rows. Best-effort —
  // if the sheet write fails the structured save is still committed.
  if (programId) {
    try { await syncProgramToSheet(programId); } catch (e) { console.error("[saveProgram] syncProgramToSheet:", e); }
  }

  revalidatePath(`/coach/clients/${input.client_id}`);
  revalidatePath("/coach/clients");
  revalidatePath("/coach/programming/build");
  revalidatePath("/coach/programming/build/template");
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  if (!programId) return { ok: false, error: "program id missing after save" };
  return { ok: true, data: { id: programId } };
}

// ─── Load program metadata for editing ──────────────────────────────────────
// Builder-specific extras (set_rows, supersets, optional fields) live in
// localStorage keyed by program_id on the client. This action returns just the
// DB-backed metadata: id, name, dates, kind, published flag.
export type LoadedProgram = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  duration_weeks: number;
  is_published: boolean;
  program_kind: ProgramKind;
  at_home_cadence: string | null;
};

export async function loadProgramForAppointment(apptId: string): Promise<{ ok: true; data: LoadedProgram | null } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, data: null };
  const supabase = createSupabaseAdmin();
  const { data: appt } = await supabase
    .from("appointments")
    .select("session_program_id")
    .eq("id", apptId)
    .eq("coach_id", me.id)
    .maybeSingle();
  if (!appt?.session_program_id) return { ok: true, data: null };
  const { data: prog, error } = await supabase
    .from("programs")
    .select("id, name, starts_on, ends_on, duration_weeks, is_published, program_kind, at_home_cadence")
    .eq("id", appt.session_program_id)
    .eq("coach_id", me.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (prog as LoadedProgram | null) ?? null };
}

export type ApptOption = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  program_status: "programmed" | "draft" | "needs_programming" | "n/a";
  session_program_id?: string | null;
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
      program_status: a.program_status ?? "needs_programming",
      session_program_id: a.session_program_id ?? null,
    }));
}

// ─── Import: list importable past programs ─────────────────────────────────
export type ImportableProgram = {
  id: string;
  name: string;
  program_kind: ProgramKind;
  starts_on: string | null;
  ends_on: string | null;
  duration_weeks: number | null;
  day_count: number;
  exercise_count: number;
  is_current: boolean;
  has_builder_state: boolean;
};

/** Returns how a program was built ("template" = sheet-only). Returns
 *  "in_app" when the build_format column hasn't been migrated yet, so callers
 *  degrade to the structured builder until the migration runs. */
export async function getProgramBuildFormat(programId: string): Promise<"in_app" | "template"> {
  if (!programId || !hasSupabaseEnv()) return "in_app";
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("programs")
    .select("build_format")
    .eq("id", programId)
    .maybeSingle<{ build_format: string | null }>();
  if (error || !data) return "in_app";
  return data.build_format === "template" ? "template" : "in_app";
}

export async function listImportableProgramsForClient(clientId: string): Promise<ImportableProgram[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  if (!hasSupabaseEnv()) return [];
  const supabase = createSupabaseAdmin();
  // Pull this client's programs (current + past) so Step 4 can list them all.
  // Drafts are included too — James expects to find and reopen anything he
  // started, not just published work. Archived rows stay hidden.
  const { data: progs } = await supabase
    .from("programs")
    .select("id, name, program_kind, starts_on, ends_on, duration_weeks, is_current, builder_state")
    .eq("coach_id", me.id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("starts_on", { ascending: false, nullsFirst: false });
  if (!progs || progs.length === 0) return [];
  const ids = progs.map((p: { id: string }) => p.id);
  // Day + exercise counts from program_days/program_movements
  const { data: days } = await supabase
    .from("program_days")
    .select("id, program_id")
    .in("program_id", ids);
  const dayIds = (days ?? []).map((d: { id: string }) => d.id);
  const { data: moves } = dayIds.length > 0
    ? await supabase.from("program_movements").select("program_day_id").in("program_day_id", dayIds)
    : { data: [] as { program_day_id: string }[] };
  const dayCount = new Map<string, number>();
  for (const d of days ?? []) dayCount.set(d.program_id, (dayCount.get(d.program_id) ?? 0) + 1);
  const dayToProg = new Map<string, string>();
  for (const d of days ?? []) dayToProg.set(d.id, d.program_id);
  const exerciseCount = new Map<string, number>();
  for (const m of moves ?? []) {
    const pid = dayToProg.get(m.program_day_id);
    if (pid) exerciseCount.set(pid, (exerciseCount.get(pid) ?? 0) + 1);
  }
  return progs.map((p: any) => ({
    id: p.id,
    name: p.name,
    program_kind: p.program_kind,
    starts_on: p.starts_on,
    ends_on: p.ends_on,
    duration_weeks: p.duration_weeks,
    day_count: dayCount.get(p.id) ?? 0,
    exercise_count: exerciseCount.get(p.id) ?? 0,
    is_current: !!p.is_current,
    has_builder_state: p.builder_state != null,
  }));
}

// ─── In-gym (Template) programs for a client ──────────────────────────────
export type InGymProgram = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
};

export async function listInGymProgramsForClient(clientId: string): Promise<InGymProgram[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  if (!hasSupabaseEnv()) return [];
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("programs")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("coach_id", me.id)
    .eq("client_id", clientId)
    .eq("program_kind", "in_gym")
    .is("archived_at", null)
    .order("starts_on", { ascending: false, nullsFirst: false });
  return (data ?? []) as InGymProgram[];
}

// ─── Import: lightweight client list for the "other client" picker ─────────
export async function listClientsForImport(): Promise<{ id: string; full_name: string }[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  if (!hasSupabaseEnv()) return [];
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("profiles")
    .select(`
      id, full_name,
      details:client_details!client_details_profile_id_fkey ( coach_id, lifecycle )
    `)
    .order("full_name", { ascending: true });
  if (!data) return [];
  return (data as any[])
    .filter((r) => r.details?.coach_id === me.id)
    .map((r) => ({ id: r.id, full_name: r.full_name }));
}

// ─── Import: load full program for copying ─────────────────────────────────
// Returns the raw builder_state JSON when available (full fidelity). Falls
// back to reconstructing a minimal days[] structure from the normalized tables
// for programs saved before builder_state existed.
export type ImportedProgram = {
  id: string;
  name: string;
  program_kind: ProgramKind;
  starts_on: string | null;
  ends_on: string | null;
  duration_weeks: number | null;
  at_home_cadence: string | null;
  // The builder days[] array (typed as unknown — caller asserts to ProgramDay[])
  days: unknown[];
  // True if days came from builder_state (full fidelity); false if reconstructed
  full_fidelity: boolean;
};

export async function loadProgramForImport(programId: string): Promise<{ ok: true; data: ImportedProgram | null } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, data: null };
  const supabase = createSupabaseAdmin();
  const { data: prog, error } = await supabase
    .from("programs")
    .select("id, name, program_kind, starts_on, ends_on, duration_weeks, at_home_cadence, builder_state")
    .eq("id", programId)
    .eq("coach_id", me.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!prog) return { ok: true, data: null };

  // Preferred: builder_state JSON has the full UI state
  const bs = (prog as any).builder_state as { days?: unknown[] } | null;
  if (bs && Array.isArray(bs.days) && bs.days.length > 0) {
    return {
      ok: true,
      data: {
        id: prog.id,
        name: prog.name,
        program_kind: prog.program_kind,
        starts_on: prog.starts_on,
        ends_on: prog.ends_on,
        duration_weeks: prog.duration_weeks,
        at_home_cadence: (prog as any).at_home_cadence ?? null,
        days: bs.days,
        full_fidelity: true,
      },
    };
  }

  // Fallback: reconstruct from program_days + program_movements
  const { data: dayRows } = await supabase
    .from("program_days")
    .select("id, day_number, title, focus, notes")
    .eq("program_id", programId)
    .order("day_number", { ascending: true });
  const dayIds = (dayRows ?? []).map((d: any) => d.id);
  const { data: moves } = dayIds.length > 0
    ? await supabase
        .from("program_movements")
        .select("id, program_day_id, movement_id, order_index, is_warmup, sets, reps, exertion, rest_seconds, notes, equipment_list, equipment_specifics, exertion_score, movement:movements!program_movements_movement_id_fkey(id, name, category)")
        .in("program_day_id", dayIds)
        .order("order_index", { ascending: true })
    : { data: [] as any[] };

  // Map to builder ProgramDay[] shape (minimum fields — supersets/set_rows/etc. lost)
  const movesByDay = new Map<string, any[]>();
  for (const m of moves ?? []) {
    const arr = movesByDay.get(m.program_day_id) ?? [];
    arr.push(m);
    movesByDay.set(m.program_day_id, arr);
  }
  const days = (dayRows ?? []).map((d: any) => ({
    uid: `imp-day-${d.id}`,
    title: d.title || `Day ${d.day_number}`,
    focus: d.focus ?? undefined,
    collapsed: false,
    items: (movesByDay.get(d.id) ?? []).map((m: any, i: number) => ({
      uid: `imp-it-${m.id}`,
      movement: {
        id: m.movement?.id ?? `mv-${m.movement_id}`,
        name: m.movement?.name ?? "Exercise",
        category: m.movement?.category ?? "push",
      },
      is_warmup: !!m.is_warmup,
      sets: m.sets ?? 3,
      reps: m.reps ?? "",
      exertion_score: m.exertion_score ?? 5,
      same_format: true,
      set_rows: [],
      variations: [],
      rest_seconds: m.rest_seconds ?? undefined,
      notes: m.notes ?? undefined,
      equipment_list: m.equipment_list ?? [],
      equipment_specifics: m.equipment_specifics ?? undefined,
    })),
  }));

  return {
    ok: true,
    data: {
      id: prog.id,
      name: prog.name,
      program_kind: prog.program_kind,
      starts_on: prog.starts_on,
      ends_on: prog.ends_on,
      duration_weeks: prog.duration_weeks,
      at_home_cadence: (prog as any).at_home_cadence ?? null,
      days,
      full_fidelity: false,
    },
  };
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
  const supabase = createSupabaseAdmin();
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

// ─── Rework draft autosave (programs + sessions) ─────────────────────────
// Writes the WIP rework state into a real programs row marked as
// is_published=false. Drafts come back in the 'Recently drafted programs'
// quick action and survive browser data clears, private windows, and
// device switches.

export type SaveDraftInput = {
  /** Existing draft to update; omit for a fresh insert. */
  draftId?: string;
  clientId: string;
  name: string;
  programKind: "in_gym" | "at_home";
  /** The whole WIP state — stored verbatim in programs.builder_state. */
  builderState: unknown;
  /** When true, the new programs row is inserted with is_current=true so it
   *  surfaces in View Programs immediately (rather than staying hidden as a
   *  draft). In-App program builds set this; session builds do not. */
  markCurrent?: boolean;
  /** Session being edited (in_gym only). When the draft is first
   *  created, the appointment's session_program_id is linked to it so
   *  the Old Way builder and the Template view both find the same row. */
  apptId?: string;
  /** How this program is built. "template" marks it sheet-only — later
   *  views/edits open the workout sheet, not the In-App builder. Defaults
   *  to "in_app" (the DB column default) when omitted. */
  buildFormat?: "in_app" | "template";
};

export async function saveDraftProgram(input: SaveDraftInput): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!input.clientId) return { ok: false, error: "Client is required." };
  const supabase = createSupabaseAdmin();
  const name = input.name?.trim() || "Untitled draft";

  // Cross-builder bridge: if we're editing a session that already has a
  // linked program (set by an earlier draft save OR by the classic
  // builder), update THAT row instead of creating a new one. Both
  // builders converge on the same programs row this way.
  let effectiveDraftId = input.draftId;
  if (!effectiveDraftId && input.apptId && input.programKind === "in_gym") {
    const { data: appt } = await supabase
      .from("appointments")
      .select("session_program_id")
      .eq("id", input.apptId)
      .maybeSingle<{ session_program_id: string | null }>();
    if (appt?.session_program_id) {
      // Confirm the program is one of ours and isn't yet published — we
      // never want to overwrite a published session program with a WIP.
      const { data: prog } = await supabase
        .from("programs")
        .select("id, is_published")
        .eq("id", appt.session_program_id)
        .eq("coach_id", me.id)
        .maybeSingle<{ id: string; is_published: boolean }>();
      if (prog && !prog.is_published) effectiveDraftId = prog.id;
    }
  }

  if (effectiveDraftId) {
    // Update an existing draft — ownership guard via coach_id.
    const { data: existing } = await supabase
      .from("programs")
      .select("id")
      .eq("id", effectiveDraftId)
      .eq("coach_id", me.id)
      .maybeSingle<{ id: string }>();
    if (!existing) return { ok: false, error: "Draft not found." };
    const { error } = await supabase
      .from("programs")
      .update({
        name,
        builder_state: input.builderState,
        program_kind: input.programKind,
        client_id: input.clientId,
      })
      .eq("id", effectiveDraftId);
    if (error) return { ok: false, error: error.message };
    // Link the appt if it isn't yet — covers the case where the user
    // started in Old Way (which created a program row but maybe didn't
    // link session_program_id) and is continuing in New Way.
    if (input.apptId && input.programKind === "in_gym") {
      await supabase
        .from("appointments")
        .update({ session_program_id: effectiveDraftId })
        .eq("id", input.apptId)
        .is("session_program_id", null);
    }
    return { ok: true, draftId: effectiveDraftId };
  }

  // New draft.
  const baseInsert: Record<string, unknown> = {
    coach_id: me.id,
    client_id: input.clientId,
    name,
    program_kind: input.programKind,
    builder_state: input.builderState,
    is_published: false,
    is_current: !!input.markCurrent,
    starts_on: new Date().toISOString().slice(0, 10),
    duration_weeks: 1,
  };
  // Only set build_format for template builds; in-app relies on the DB default.
  if (input.buildFormat) baseInsert.build_format = input.buildFormat;
  let res = await supabase.from("programs").insert(baseInsert).select("id").single<{ id: string }>();
  // Graceful fallback if the build_format column hasn't been migrated yet.
  if (res.error && /build_format/i.test(res.error.message ?? "")) {
    delete baseInsert.build_format;
    res = await supabase.from("programs").insert(baseInsert).select("id").single<{ id: string }>();
  }
  const { data, error } = res;
  if (error || !data) return { ok: false, error: error?.message ?? "create failed" };

  // Link to the appointment so cross-builder hydration finds this row.
  if (input.apptId && input.programKind === "in_gym") {
    await supabase
      .from("appointments")
      .update({ session_program_id: data.id })
      .eq("id", input.apptId);
  }
  return { ok: true, draftId: data.id };
}

export async function loadDraftProgram(draftId: string): Promise<{ ok: true; data: { name: string; clientId: string; builderState: unknown } | null } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, data: null };
  const { data, error } = await createSupabaseAdmin()
    .from("programs")
    .select("name, client_id, builder_state, coach_id")
    .eq("id", draftId)
    .maybeSingle<{ name: string; client_id: string; builder_state: unknown; coach_id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data: null };
  if (data.coach_id !== me.id) return { ok: false, error: "Not allowed." };
  return { ok: true, data: { name: data.name, clientId: data.client_id, builderState: data.builder_state } };
}

// ─── New Way toggle helpers — paired sheet lookup ─────────────────────────
// Used by the In App / Template toggle in the New Way workspace. Given a
// programId, returns the paired workout_sheets row (creating one if it
// doesn't exist yet) so the Template iframe can load it via ?sheet=...
export async function getOrCreatePairedSheetAction(programId: string): Promise<{ ok: true; sheetId: string | null } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || (me.role !== "coach" && !me.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, sheetId: null };
  try {
    const sheetId = await getOrCreatePairedSheet(programId);
    return { ok: true, sheetId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Resolve the open-access client link for a sheet — the /s/<token> path James
// texts to a client so they can fill the at-home program like a PDF. Returns a
// relative path; the caller prefixes the origin.
export async function getPublicSheetLink(
  sheetId: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || (me.role !== "coach" && !me.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const sheet = await getWorkoutSheet(sheetId);
  if (!sheet) return { ok: false, error: "Sheet not found." };
  if (!sheet.public_token) return { ok: false, error: "Sheet has no share link yet — save it first." };
  return { ok: true, path: `/s/${sheet.public_token}` };
}

// ─── Delete helpers ───────────────────────────────────────────────────────────

// Delete a draft program (used by the "Recently drafted programs" quick-group).
export async function deleteDraftProgram(programId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getSessionUser();
  if (!me || (me.role !== "coach" && !me.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "no db" };

  const supabase = createSupabaseAdmin();

  // Unlink paired sheet before deleting
  await supabase.from("workout_sheets").update({ program_id: null }).eq("program_id", programId);

  const { data: days } = await supabase.from("program_days").select("id").eq("program_id", programId);
  const dayIds = (days ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length) {
    await supabase.from("program_movements").delete().in("program_day_id", dayIds);
    await supabase.from("program_days").delete().eq("program_id", programId);
  }

  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/programming", "layout");
  return { ok: true };
}

// Delete the draft program linked to an appointment, resetting it to "needs_programming".
export async function deleteDraftSession(apptId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getSessionUser();
  if (!me || (me.role !== "coach" && !me.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "no db" };

  const supabase = createSupabaseAdmin();

  const { data: appt } = await supabase
    .from("appointments")
    .select("session_program_id")
    .eq("id", apptId)
    .maybeSingle<{ session_program_id: string | null }>();

  const programId = appt?.session_program_id;

  // Reset the appointment back to needs_programming regardless
  await supabase
    .from("appointments")
    .update({ session_program_id: null, program_status: "needs_programming" })
    .eq("id", apptId);

  if (programId) {
    await supabase.from("workout_sheets").update({ program_id: null }).eq("program_id", programId);
    const { data: days } = await supabase.from("program_days").select("id").eq("program_id", programId);
    const dayIds = (days ?? []).map((d: { id: string }) => d.id);
    if (dayIds.length) {
      await supabase.from("program_movements").delete().in("program_day_id", dayIds);
      await supabase.from("program_days").delete().eq("program_id", programId);
    }
    await supabase.from("programs").delete().eq("id", programId);
  }

  revalidatePath("/coach/programming");
  return { ok: true };
}

// Look up an appointment's session_program_id so the lobby can find the
// program (and its paired sheet) for an existing session.
export async function getSessionProgramId(apptId: string): Promise<string | null> {
  const me = await getSessionUser();
  if (!me) return null;
  if (!hasSupabaseEnv()) return null;
  const { data } = await createSupabaseAdmin()
    .from("appointments")
    .select("session_program_id")
    .eq("id", apptId)
    .maybeSingle<{ session_program_id: string | null }>();
  return data?.session_program_id ?? null;
}

// Bridge sync between the structured Builder side (programs + program_days +
// program_movements) and the free-form Sheet side (workout_sheets.sheet_data).
//
// Goals (Step 3 of the bridge plan):
//   • Builder save → write a paired workout_sheets row so the Template view
//     auto-renders the same plan as free-form rows.
//   • Sheet save → mirror free-text rows back into program_movements so the
//     Builder side can see what the client/coach typed in the sheet.
//   • PDF upload → stub-create a paired programs row so PDFs surface in
//     View Programs / Past Programs alongside everything else.
//
// All helpers here are server-only (admin client).

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import type { SheetData, SheetDay } from "@/lib/workout-sheets";
import { loadLibrary, matchMovementByName } from "@/lib/movement-matcher";

// ─── shapes used internally ──────────────────────────────────────────
type ProgramRow = {
  id: string;
  name: string;
  client_id: string | null;
  coach_id: string | null;
  workout_sheet_id: string | null;
};
type ProgramDayRow = {
  id: string;
  program_id: string;
  day_number: number;
  title: string | null;
};
type ProgramMovementRow = {
  id: string;
  program_day_id: string;
  movement_id: string | null;
  order_index: number;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  name_text: string | null;
  equipment_text: string | null;
  notes_text: string | null;
};
type MovementLookup = { id: string; name: string };

// ─── Builder → Sheet ──────────────────────────────────────────────────

// Build a SheetData payload from a program's structured data. The sheet's
// row shape per row is [movement, reps1, wt1, reps2, wt2, …, notes].
export async function programToSheetData(programId: string): Promise<SheetData | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = createSupabaseAdmin();

  const { data: program } = await supabase
    .from("programs")
    .select("id, name, client_id, coach_id")
    .eq("id", programId)
    .maybeSingle<ProgramRow>();
  if (!program) return null;

  const { data: days } = await supabase
    .from("program_days")
    .select("id, program_id, day_number, title")
    .eq("program_id", programId)
    .order("day_number", { ascending: true });
  const dayRows = (days ?? []) as ProgramDayRow[];

  const dayIds = dayRows.map((d) => d.id);
  const { data: moves } = dayIds.length
    ? await supabase
        .from("program_movements")
        .select(
          "id, program_day_id, movement_id, order_index, sets, reps, weight, name_text, equipment_text, notes_text"
        )
        .in("program_day_id", dayIds)
        .order("order_index", { ascending: true })
    : { data: [] };
  const moveRows = (moves ?? []) as ProgramMovementRow[];

  // Resolve movement names for any FK rows
  const movementIds = Array.from(
    new Set(moveRows.map((m) => m.movement_id).filter((x): x is string => !!x))
  );
  const movementNameById = new Map<string, string>();
  if (movementIds.length) {
    const { data: mlist } = await supabase
      .from("movements")
      .select("id, name")
      .in("id", movementIds);
    (mlist as MovementLookup[] | null)?.forEach((m) => movementNameById.set(m.id, m.name));
  }

  // For sheet purposes we use a single "sets" column count (max sets across
  // all rows on a day). Each row becomes [name, reps×N, wt×N, notes].
  const sheetDays: SheetDay[] = dayRows.map((d) => {
    const rowsForDay = moveRows.filter((m) => m.program_day_id === d.id);
    const setsCount = Math.max(1, ...rowsForDay.map((r) => r.sets ?? 1));
    const rows: string[][] = rowsForDay.map((m) => {
      const name = m.movement_id
        ? movementNameById.get(m.movement_id) ?? m.name_text ?? "—"
        : m.name_text ?? "—";
      const eq = m.equipment_text ? ` / ${m.equipment_text}` : "";
      const movementCell = `${name}${eq}`;
      const cells: string[] = [movementCell];
      for (let i = 0; i < setsCount; i++) {
        cells.push(m.reps ?? "");           // reps (same across sets for now)
        cells.push(m.weight ?? "");         // wt
      }
      cells.push(m.notes_text ?? "");       // load/notes
      return cells;
    });
    return {
      sets: setsCount,
      rows,
    };
  });

  return {
    client: undefined,
    goal: undefined,
    nutrition: undefined,
    days: sheetDays,
  };
}

// ─── Sheet → Builder ──────────────────────────────────────────────────

// Replace a program's day/movement rows with what the sheet currently has,
// stored as free-text rows (movement_id = null, name_text populated). This
// preserves the bidirectional "they render each other" contract: anything
// typed in the sheet shows up as a row on the structured side too.
export async function syncSheetDataToProgram(programId: string, sheet: SheetData | null): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const supabase = createSupabaseAdmin();

  // wipe existing days/movements
  const { data: existingDays } = await supabase
    .from("program_days")
    .select("id")
    .eq("program_id", programId);
  const existingIds = (existingDays ?? []).map((d: { id: string }) => d.id);
  if (existingIds.length) {
    await supabase.from("program_movements").delete().in("program_day_id", existingIds);
    await supabase.from("program_days").delete().eq("program_id", programId);
  }

  // Library is loaded once per sync, reused across all rows.
  const library = await loadLibrary();

  const days = sheet?.days ?? [];
  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const { data: dayRow } = await supabase
      .from("program_days")
      .insert({
        program_id: programId,
        day_number: dayIdx + 1,
        title: day.date ? `Day ${dayIdx + 1} — ${day.date}` : `Day ${dayIdx + 1}`,
      })
      .select("id")
      .single<{ id: string }>();
    if (!dayRow) continue;

    for (let rowIdx = 0; rowIdx < day.rows.length; rowIdx++) {
      const row = day.rows[rowIdx];
      // Row shape: [movement, reps1, wt1, reps2, wt2, …, notes]
      const movementText = (row[0] ?? "").trim();
      const notesText = (row[row.length - 1] ?? "").trim();
      const pairs: { reps: string; wt: string }[] = [];
      for (let i = 1; i < row.length - 1; i += 2) {
        pairs.push({ reps: (row[i] ?? "").trim(), wt: (row[i + 1] ?? "").trim() });
      }
      if (!movementText && pairs.every((p) => !p.reps && !p.wt) && !notesText) continue;

      const reps = pairs.map((p) => p.reps).filter(Boolean).join(" / ") || null;
      const weight = pairs.map((p) => p.wt).filter(Boolean).join(" / ") || null;
      const setsCount = pairs.filter((p) => p.reps || p.wt).length || day.sets || 1;

      // Try to split equipment text off the movement string (e.g. "Lat Pulldown / Cable")
      let nameText = movementText;
      let equipmentText: string | null = null;
      const slash = movementText.indexOf(" / ");
      if (slash > 0) {
        nameText = movementText.slice(0, slash).trim();
        equipmentText = movementText.slice(slash + 3).trim() || null;
      }

      // Try to auto-map to a library movement. Confident match → 'auto',
      // otherwise the row stays unmapped and surfaces in the review queue.
      const match = await matchMovementByName(nameText, library);
      const mapping_source: "auto" | "unmapped" = match ? "auto" : "unmapped";
      const movement_id: string | null = match ? match.movement.id : null;

      await supabase.from("program_movements").insert({
        program_day_id: dayRow.id,
        movement_id,
        order_index: rowIdx,
        sets: setsCount,
        reps,
        weight,
        name_text: nameText || "—",
        equipment_text: equipmentText,
        notes_text: notesText || null,
        mapping_source,
      });
    }
  }
}

// ─── timeframe parser ────────────────────────────────────────────────

function parseTimeframeDates(tf: string | null | undefined, todayISO: string): { startsOn: string; endsOn: string | null } {
  if (!tf) return { startsOn: todayISO, endsOn: null };
  const yr = parseInt(todayISO.slice(0, 4), 10);
  const re = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g;
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(tf)) !== null) {
    const [, month, day, year] = m;
    const y = year ? parseInt(year, 10) : yr;
    dates.push(`${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  }
  if (dates.length === 0) return { startsOn: todayISO, endsOn: null };
  return { startsOn: dates[0], endsOn: dates[dates.length - 1] };
}

// ─── pair lookup / creation ───────────────────────────────────────────

export async function getOrCreatePairedSheet(programId: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = createSupabaseAdmin();

  const { data: program } = await supabase
    .from("programs")
    .select("id, name, client_id, coach_id, workout_sheet_id")
    .eq("id", programId)
    .maybeSingle<ProgramRow>();
  if (!program) return null;
  if (program.workout_sheet_id) return program.workout_sheet_id;
  if (!program.coach_id) return null;

  const { data: sheet } = await supabase
    .from("workout_sheets")
    .insert({
      name: program.name,
      kind: "app",
      coach_id: program.coach_id,
      client_id: program.client_id,
      program_id: program.id,
      last_edited_by: program.coach_id,
    })
    .select("id")
    .single<{ id: string }>();
  if (!sheet) return null;

  await supabase
    .from("programs")
    .update({ workout_sheet_id: sheet.id })
    .eq("id", program.id);
  return sheet.id;
}

export async function getOrCreatePairedProgram(sheetId: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = createSupabaseAdmin();

  const { data: sheet } = await supabase
    .from("workout_sheets")
    .select("id, name, coach_id, client_id, program_id, kind, sheet_data, session_id")
    .eq("id", sheetId)
    .maybeSingle<{
      id: string;
      name: string;
      coach_id: string;
      client_id: string | null;
      program_id: string | null;
      kind: "app" | "pdf";
      sheet_data: { timeframe?: string } | null;
      session_id: string | null;
    }>();
  if (!sheet) return null;
  if (sheet.program_id) return sheet.program_id;
  if (!sheet.client_id) return null; // can't create a programs row without a client

  const todayISO = new Date().toISOString().slice(0, 10);
  const { startsOn, endsOn } = parseTimeframeDates(sheet.sheet_data?.timeframe, todayISO);

  const { data: program } = await supabase
    .from("programs")
    .insert({
      client_id: sheet.client_id,
      coach_id: sheet.coach_id,
      name: sheet.name,
      program_kind: "in_gym",
      starts_on: startsOn,
      ends_on: endsOn,
      duration_weeks: 1,
      is_published: sheet.kind === "pdf",       // PDFs are inherently "submitted"
      is_current: true,
      workout_sheet_id: sheet.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (!program) return null;

  await supabase
    .from("workout_sheets")
    .update({ program_id: program.id })
    .eq("id", sheet.id);

  // If this sheet was saved against a specific appointment, link it so the
  // appointment shows "programmed" in the schedule and session views.
  if (sheet.session_id) {
    await supabase
      .from("appointments")
      .update({ session_program_id: program.id, program_status: "programmed" })
      .eq("id", sheet.session_id);
  }

  return program.id;
}

// ─── high-level sync entry points (called by save flows) ─────────────

export async function syncProgramToSheet(programId: string): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const sheetId = await getOrCreatePairedSheet(programId);
  if (!sheetId) return;
  const sheetData = await programToSheetData(programId);
  await createSupabaseAdmin()
    .from("workout_sheets")
    .update({ sheet_data: sheetData })
    .eq("id", sheetId);
}

export async function syncSheetToProgram(sheetId: string): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const supabase = createSupabaseAdmin();
  const { data: sheet } = await supabase
    .from("workout_sheets")
    .select("id, program_id, sheet_data, client_id, kind")
    .eq("id", sheetId)
    .maybeSingle<{
      id: string;
      program_id: string | null;
      sheet_data: SheetData | null;
      client_id: string | null;
      kind: "app" | "pdf";
    }>();
  if (!sheet) return;
  if (sheet.kind === "pdf") return; // no structured rows from PDFs

  // ensure paired program exists (only if we have enough info)
  let programId = sheet.program_id;
  if (!programId && sheet.client_id) {
    programId = await getOrCreatePairedProgram(sheetId);
  }
  if (!programId) return;

  await syncSheetDataToProgram(programId, sheet.sheet_data);
}

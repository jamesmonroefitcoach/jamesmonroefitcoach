"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { archiveWorkoutSheetsForProgram } from "@/lib/workout-sheets.server";

/**
 * Delete a program from the "Recently saved programs" list.
 *
 * Soft delete, on purpose. `programs.archived_at` is the schema's existing
 * delete bin (schema.sql: "delete bin") and every list query in the app
 * already filters on `.is("archived_at", null)`, so stamping it drops the
 * program out of Programs, the Build lobby and the import pickers at once
 * with no schema change. It also keeps a mis-click recoverable: these rows
 * hold real client work, and James can't undo a hard delete.
 *
 * The paired workout sheet is flipped to `status = 'archived'`, which is what
 * makes the open-access `/s/<token>` link stop resolving. Without that step
 * the sheet row and its public token outlive the program and keep serving an
 * editable sheet (the pre-existing `deleteDraftProgram` in build/actions.ts
 * has exactly that hole: it unlinks the sheet but leaves it reachable).
 */
export async function archiveProgram(
  programId: string
): Promise<{ ok: boolean; error?: string }> {
  const me = await getSessionUser();
  if (!me || (me.role !== "coach" && !me.is_admin)) return { ok: false, error: "Not allowed." };
  if (!hasSupabaseEnv()) return { ok: false, error: "No database connection." };
  if (!programId) return { ok: false, error: "Missing program." };

  const supabase = createSupabaseAdmin();

  const { data: program } = await supabase
    .from("programs")
    .select("id, coach_id, workout_sheet_id")
    .eq("id", programId)
    .maybeSingle<{ id: string; coach_id: string; workout_sheet_id: string | null }>();
  if (!program) return { ok: false, error: "Program not found." };
  if (!me.is_admin && program.coach_id !== me.id) return { ok: false, error: "Not allowed." };

  // is_current is cleared alongside the archive stamp so surfaces that check
  // only is_current (without the archive filter) stop treating a deleted
  // program as the client's active one.
  const { error } = await supabase
    .from("programs")
    .update({ archived_at: new Date().toISOString(), is_current: false })
    .eq("id", programId);
  if (error) return { ok: false, error: error.message };

  const sheetsOk = await archiveWorkoutSheetsForProgram(programId, program.workout_sheet_id);

  // An appointment still pointing at this program would keep showing it as
  // programmed and deep-link straight back into it, so reset those rows the
  // same way deleting a session draft already does.
  await supabase
    .from("appointments")
    .update({ session_program_id: null, program_status: "needs_programming" })
    .eq("session_program_id", programId);

  revalidatePath("/coach/programming", "layout");

  if (!sheetsOk) {
    // The program is gone from the lists but the shared link may still open.
    // Surfaced rather than swallowed: that is the part James was told is safe.
    return { ok: false, error: "Program deleted, but its shared link may still open. Tell Ryan." };
  }
  return { ok: true };
}

// Workout sheets — SERVER-ONLY data access. Uses the service-role Supabase
// client; keep out of client bundles.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  type WorkoutSheet,
  type WorkoutSheetKind,
  type WorkoutSheetStatus,
  type SheetData,
  isLockStale,
} from "@/lib/workout-sheets";

const COLS =
  "id, name, kind, coach_id, client_id, session_id, status, sheet_data, " +
  "pdf_storage_path, pdf_original_filename, lock_holder_id, lock_acquired_at, " +
  "last_edited_by, last_edited_at, created_at, updated_at, public_token";

function rowToSheet(r: unknown): WorkoutSheet {
  return r as WorkoutSheet;
}

export async function getWorkoutSheet(id: string): Promise<WorkoutSheet | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await createSupabaseAdmin()
    .from("workout_sheets")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToSheet(data);
}

// Resolve a sheet by its open-access token (backs the public /s/<token> link).
// Archived sheets deliberately resolve to null: when the coach deletes a
// program the sheet row survives (so the delete stays reversible) but its
// public link must go dead, otherwise the token keeps serving an editable
// sheet for work that's been deleted. Callers render "Link not found" / 404.
export async function getWorkoutSheetByPublicToken(token: string): Promise<WorkoutSheet | null> {
  if (!hasSupabaseEnv()) return null;
  if (!token) return null;
  const { data, error } = await createSupabaseAdmin()
    .from("workout_sheets")
    .select(COLS)
    .eq("public_token", token)
    .neq("status", "archived")
    .maybeSingle();
  if (error || !data) return null;
  return rowToSheet(data);
}

// Archive every sheet paired with a program. This is what actually kills the
// open-access /s/<token> link when a program is deleted — `status` already
// allows 'archived' (migration 0015), so no schema change is needed. Matches
// on both directions of the program↔sheet link because either side can be the
// one that's populated.
export async function archiveWorkoutSheetsForProgram(
  programId: string,
  sheetId?: string | null
): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const supabase = createSupabaseAdmin();
  const status: WorkoutSheetStatus = "archived";
  const { error } = await supabase
    .from("workout_sheets")
    .update({ status })
    .eq("program_id", programId);
  let ok = !error;
  if (sheetId) {
    const { error: sheetErr } = await supabase
      .from("workout_sheets")
      .update({ status })
      .eq("id", sheetId);
    ok = ok && !sheetErr;
  }
  return ok;
}

export type ListFilter = {
  coachId?: string;
  clientId?: string;
  sessionId?: string;
  kind?: WorkoutSheetKind;
  limit?: number;
};

export async function listWorkoutSheets(f: ListFilter): Promise<WorkoutSheet[]> {
  if (!hasSupabaseEnv()) return [];
  let q = createSupabaseAdmin()
    .from("workout_sheets")
    .select(COLS)
    .order("updated_at", { ascending: false });
  if (f.coachId) q = q.eq("coach_id", f.coachId);
  if (f.clientId) q = q.eq("client_id", f.clientId);
  if (f.sessionId) q = q.eq("session_id", f.sessionId);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.limit) q = q.limit(f.limit);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as unknown[]).map(rowToSheet);
}

export type CreateInput = {
  name: string;
  kind?: WorkoutSheetKind;
  coach_id: string;
  client_id?: string | null;
  session_id?: string | null;
  status?: WorkoutSheetStatus;
  sheet_data?: SheetData | null;
  pdf_storage_path?: string | null;
  pdf_original_filename?: string | null;
  last_edited_by?: string;
};

export async function createWorkoutSheet(input: CreateInput): Promise<WorkoutSheet | null> {
  if (!hasSupabaseEnv()) return null;
  const row = {
    name: input.name,
    kind: input.kind ?? "app",
    coach_id: input.coach_id,
    client_id: input.client_id ?? null,
    session_id: input.session_id ?? null,
    status: input.status ?? "active",
    sheet_data: input.sheet_data ?? null,
    pdf_storage_path: input.pdf_storage_path ?? null,
    pdf_original_filename: input.pdf_original_filename ?? null,
    last_edited_by: input.last_edited_by ?? input.coach_id,
    last_edited_at: new Date().toISOString(),
  };
  const { data, error } = await createSupabaseAdmin()
    .from("workout_sheets")
    .insert(row)
    .select(COLS)
    .single();
  if (error || !data) return null;
  return rowToSheet(data);
}

export type UpdateInput = {
  name?: string;
  client_id?: string | null;
  session_id?: string | null;
  status?: WorkoutSheetStatus;
  sheet_data?: SheetData | null;
  last_edited_by: string;
};

export async function updateWorkoutSheet(id: string, patch: UpdateInput): Promise<WorkoutSheet | null> {
  if (!hasSupabaseEnv()) return null;
  const upd: Record<string, unknown> = {
    last_edited_at: new Date().toISOString(),
    last_edited_by: patch.last_edited_by,
  };
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.client_id !== undefined) upd.client_id = patch.client_id;
  if (patch.session_id !== undefined) upd.session_id = patch.session_id;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.sheet_data !== undefined) upd.sheet_data = patch.sheet_data;
  const { data, error } = await createSupabaseAdmin()
    .from("workout_sheets")
    .update(upd)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error || !data) return null;
  return rowToSheet(data);
}

export async function deleteWorkoutSheet(id: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const { error } = await createSupabaseAdmin().from("workout_sheets").delete().eq("id", id);
  return !error;
}

// ─── lock ─────────────────────────────────────────────────────────────
// Acquire (or refresh) the soft lock. Allowed if no current holder, holder is me, or holder's lock is stale.
export type LockResult = {
  ok: boolean;
  holder: string | null;
  acquiredAt: string | null;
};

export async function acquireLock(id: string, userId: string): Promise<LockResult> {
  if (!hasSupabaseEnv()) return { ok: false, holder: null, acquiredAt: null };
  const sheet = await getWorkoutSheet(id);
  if (!sheet) return { ok: false, holder: null, acquiredAt: null };
  const isMine = sheet.lock_holder_id === userId;
  const stale = isLockStale(sheet.lock_acquired_at);
  if (sheet.lock_holder_id && !isMine && !stale) {
    return { ok: false, holder: sheet.lock_holder_id, acquiredAt: sheet.lock_acquired_at };
  }
  const now = new Date().toISOString();
  const { data, error } = await createSupabaseAdmin()
    .from("workout_sheets")
    .update({ lock_holder_id: userId, lock_acquired_at: now })
    .eq("id", id)
    .select("lock_holder_id, lock_acquired_at")
    .single();
  if (error || !data) return { ok: false, holder: null, acquiredAt: null };
  const row = data as { lock_holder_id: string | null; lock_acquired_at: string | null };
  return { ok: true, holder: row.lock_holder_id, acquiredAt: row.lock_acquired_at };
}

export async function releaseLock(id: string, userId: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || sheet.lock_holder_id !== userId) return false;
  const { error } = await createSupabaseAdmin()
    .from("workout_sheets")
    .update({ lock_holder_id: null, lock_acquired_at: null })
    .eq("id", id);
  return !error;
}

// ─── PDF storage ─────────────────────────────────────────────────────
export const WORKOUT_PDF_BUCKET = "workout-sheet-pdfs";

export async function uploadWorkoutPdf(
  path: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType = "application/pdf"
): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured" };
  const { error } = await createSupabaseAdmin()
    .storage.from(WORKOUT_PDF_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createSignedPdfUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await createSupabaseAdmin()
    .storage.from(WORKOUT_PDF_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

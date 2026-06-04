// Workout sheets — shared types + helpers (client-safe; no server imports).

export type WorkoutSheetKind = "app" | "pdf";
export type WorkoutSheetStatus = "draft" | "active" | "archived";

// Structured data captured by the in-app HTML editor for kind='app'.
// Mirrors the existing localStorage v4 schema so the same restore code works.
export type SheetDay = {
  date?: string;
  weight?: string;
  sleep?: string;
  sets: number;
  rows: string[][];        // each row = [movement, reps/wt..., notes]
};
export type SheetData = {
  client?: string;
  goal?: string;
  nutrition?: string;
  days: SheetDay[];
};

export type WorkoutSheet = {
  id: string;
  name: string;
  kind: WorkoutSheetKind;
  coach_id: string;
  client_id: string | null;
  session_id: string | null;
  status: WorkoutSheetStatus;
  sheet_data: SheetData | null;
  pdf_storage_path: string | null;
  pdf_original_filename: string | null;
  lock_holder_id: string | null;
  lock_acquired_at: string | null;       // ISO timestamp
  last_edited_by: string | null;
  last_edited_at: string;
  created_at: string;
  updated_at: string;
};

// ─── lock timing ─────────────────────────────────────────────────────
export const LOCK_TTL_MS = 10 * 60 * 1000;      // 10 min
export const POLL_INTERVAL_MS = 4000;            // sheet poll
export const HEARTBEAT_INTERVAL_MS = 60_000;     // lock heartbeat

export function isLockStale(lockAcquiredAt: string | null): boolean {
  if (!lockAcquiredAt) return true;
  return Date.now() - new Date(lockAcquiredAt).getTime() > LOCK_TTL_MS;
}

// Default file-name suggestion for the Save modal.
export function defaultSheetName(clientName: string | null | undefined): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const who = clientName?.trim() || "Untitled";
  return `Workout — ${who} — ${stamp}`;
}

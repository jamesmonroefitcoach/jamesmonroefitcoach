// Full per-set log history for an exercise, per client. Captured every time a
// coach hits "Complete" on an exercise in the plan view. Lets us show:
//   - previous set/weight reference next to the weight input
//   - PR star when the new heaviest exceeds prior heaviest
//   - a "View log" modal with the full timeline of weights × reps

export type LoggedSet = { weight_lb: number; reps: string };
export type ExerciseLogEntry = {
  recorded_at: string;        // ISO
  prescription: string;       // e.g. "3 × 8-10"
  sets: LoggedSet[];
  context?: { appt_id?: string; program_id?: string; day_uid?: string };
};
export type ExerciseLogs = Record<string, ExerciseLogEntry[]>;  // key → chronological entries

function storageKey(clientId: string) { return `exercise_logs_${clientId}`; }

function normalizeKey(movementId: string | undefined, name: string): string {
  if (movementId && !movementId.startsWith("ph-")) return movementId;
  return `name:${name.trim().toLowerCase()}`;
}

export function readLogs(clientId: string): ExerciseLogs {
  if (typeof window === "undefined" || !clientId) return {};
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    return raw ? (JSON.parse(raw) as ExerciseLogs) : {};
  } catch { return {}; }
}

function writeLogs(clientId: string, logs: ExerciseLogs): void {
  if (typeof window === "undefined" || !clientId) return;
  try { localStorage.setItem(storageKey(clientId), JSON.stringify(logs)); } catch {}
}

export function appendLog(clientId: string, opts: {
  movement_id?: string;
  name: string;
  prescription: string;
  sets: LoggedSet[];
  context?: ExerciseLogEntry["context"];
}): void {
  if (!clientId || !opts.name || opts.sets.length === 0) return;
  const logs = readLogs(clientId);
  const k = normalizeKey(opts.movement_id, opts.name);
  const cur = logs[k] ?? [];
  cur.push({
    recorded_at: new Date().toISOString(),
    prescription: opts.prescription,
    sets: opts.sets,
    context: opts.context,
  });
  logs[k] = cur;
  writeLogs(clientId, logs);
}

export function historyFor(clientId: string, movementId: string | undefined, name: string): ExerciseLogEntry[] {
  const logs = readLogs(clientId);
  return logs[normalizeKey(movementId, name)] ?? [];
}

/**
 * Most recent completed entry for this exercise — used to populate the
 * "previous set" hint next to weight inputs.
 */
export function lastEntry(clientId: string, movementId: string | undefined, name: string): ExerciseLogEntry | null {
  const list = historyFor(clientId, movementId, name);
  return list.length > 0 ? list[list.length - 1] : null;
}

/**
 * Highest weight ever logged for this exercise across all entries (before any
 * pending un-committed completion).
 */
export function priorHeaviest(clientId: string, movementId: string | undefined, name: string): number {
  const list = historyFor(clientId, movementId, name);
  let max = 0;
  for (const e of list) {
    for (const s of e.sets) if (s.weight_lb > max) max = s.weight_lb;
  }
  return max;
}

/**
 * Returns true if `candidate` exceeds the previous heaviest AND the exercise
 * has at least one prior entry (i.e. not a first-time exercise).
 */
export function isPR(clientId: string, movementId: string | undefined, name: string, candidate: number): boolean {
  const list = historyFor(clientId, movementId, name);
  if (list.length === 0) return false;
  const max = priorHeaviest(clientId, movementId, name);
  return candidate > max && candidate > 0;
}

export function hasHistory(clientId: string, movementId: string | undefined, name: string): boolean {
  return historyFor(clientId, movementId, name).length > 0;
}

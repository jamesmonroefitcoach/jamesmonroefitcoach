// Client-side tracker for exercises a client has performed.
// Stored in localStorage keyed by client_id, so it survives reloads but does
// not (yet) sync to Supabase. Heaviest weight + reps are recorded each time a
// coach hits "Complete" on an exercise in the published plan view.

export type LearnedExercise = {
  movement_id?: string;
  name: string;
  category: string;
  heaviest_weight_lb: number;
  reps_at_heaviest: string;
  recorded_at: string;     // ISO
};

// key = movement_id when available, otherwise the lowercased name
export type LearnedMap = Record<string, LearnedExercise>;

function storageKey(clientId: string) { return `exercises_learned_${clientId}`; }

function normalizeKey(movementId: string | undefined, name: string): string {
  if (movementId && !movementId.startsWith("ph-")) return movementId;
  return `name:${name.trim().toLowerCase()}`;
}

export function readLearned(clientId: string): LearnedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    return raw ? (JSON.parse(raw) as LearnedMap) : {};
  } catch { return {}; }
}

export function writeLearned(clientId: string, map: LearnedMap): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(storageKey(clientId), JSON.stringify(map)); } catch {}
}

/**
 * Record a learned exercise. If the entry already exists, only update the
 * heaviest weight if `weight` is higher than the stored heaviest.
 */
export function recordLearned(clientId: string, e: {
  movement_id?: string;
  name: string;
  category: string;
  weight_lb: number;
  reps: string;
}): void {
  if (typeof window === "undefined") return;
  if (!e.name) return;
  const map = readLearned(clientId);
  const k = normalizeKey(e.movement_id, e.name);
  const prev = map[k];
  if (prev && prev.heaviest_weight_lb >= e.weight_lb) {
    // Just touch the recorded_at without lowering the heaviest weight
    map[k] = { ...prev, recorded_at: new Date().toISOString() };
  } else {
    map[k] = {
      movement_id: e.movement_id,
      name: e.name,
      category: e.category,
      heaviest_weight_lb: e.weight_lb,
      reps_at_heaviest: e.reps,
      recorded_at: new Date().toISOString(),
    };
  }
  writeLearned(clientId, map);
}

/**
 * Mark an exercise as performed even without a weight (e.g. bodyweight).
 * Creates an entry with weight 0 if not present; otherwise leaves it alone.
 */
export function markPerformed(clientId: string, e: {
  movement_id?: string;
  name: string;
  category: string;
}): void {
  if (typeof window === "undefined") return;
  if (!e.name) return;
  const map = readLearned(clientId);
  const k = normalizeKey(e.movement_id, e.name);
  if (!map[k]) {
    map[k] = {
      movement_id: e.movement_id,
      name: e.name,
      category: e.category,
      heaviest_weight_lb: 0,
      reps_at_heaviest: "",
      recorded_at: new Date().toISOString(),
    };
    writeLearned(clientId, map);
  }
}

export function isLearned(clientId: string, movementId: string | undefined, name: string): boolean {
  const map = readLearned(clientId);
  return Boolean(map[normalizeKey(movementId, name)]);
}

export function lookupLearned(clientId: string, movementId: string | undefined, name: string): LearnedExercise | null {
  const map = readLearned(clientId);
  return map[normalizeKey(movementId, name)] ?? null;
}

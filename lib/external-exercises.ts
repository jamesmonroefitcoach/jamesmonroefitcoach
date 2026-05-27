// External exercise library integration — types, source mapping, and
// normalizers. CLIENT-SAFE: this module has no server-only imports, so both
// the Exercise Explorer client components and the server sync route can use it.
//
// Server-only DB access (read cache / run sync) lives in
// `lib/external-exercises.server.ts`.

import { LIBRARY_HIERARCHY, type Category } from "@/lib/programs";

// External media/data sources we can pull from.
export type ExerciseSource = "rapidapi" | "free-db";
// The Explorer also shows the app's own library, so the client view adds it.
export type ViewSource = ExerciseSource | "library";

// Movement patterns reuse the app's Category vocabulary (+ a catch-all) so the
// Explorer's filters line up with how the rest of the app classifies movement.
export type MovementPattern = Category | "other";

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  push: "Push",
  pull: "Pull",
  hinge: "Hinge",
  squat: "Squat / Lunge",
  core: "Core",
  leg_accessory: "Leg accessory",
  arm_accessory: "Arm accessory",
  shoulder: "Shoulder",
  cardio: "Cardio",
  mobility: "Mobility",
  other: "Other",
};

// Canonical, normalized exercise shape — stored in Supabase and rendered by
// the Explorer. `source: "library"` rows are synthesized from the app's own
// LIBRARY_HIERARCHY and never persisted.
export type ExternalExercise = {
  id: string;
  source: ViewSource;
  external_id: string;
  name: string;
  body_part: string | null;
  target_muscle: string | null;
  secondary_muscles: string[];
  equipment: string | null;
  movement_pattern: MovementPattern;
  gif_url: string | null;
  image_urls: string[];
  instructions: string[];
  // reserved for future AI coaching tags
  cues: string[];
  regressions: string[];
  progressions: string[];
  feel: string | null;
  difficulty: string | null;
};

// Rows we insert during a sync (DB assigns id/timestamps).
export type ExerciseInsert = Omit<ExternalExercise, "id"> & {
  source: ExerciseSource;
  raw?: unknown;
};

export const FREE_DB_EXERCISES_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const FREE_DB_IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// ─── movement-pattern heuristics ─────────────────────────────────────────────
// Name-based pass is the most specific signal; the source-specific functions
// pre-compute a sensible fallback from the taxonomy fields.

function patternFromName(name: string, fallback: MovementPattern): MovementPattern {
  const n = name.toLowerCase();
  if (/squat|leg press|goblet|hack squat/.test(n)) return "squat";
  if (/lunge|split squat|step-?up/.test(n)) return "leg_accessory";
  if (/deadlift|good ?morning|\brdl\b|hip thrust|hinge|kettlebell swing|\bswing\b/.test(n)) return "hinge";
  if (/row|pull-?up|pull-?down|chin-?up|pulldown|lat ?pull|face pull/.test(n)) return "pull";
  if (/bench|push-?up|press|\bdip\b|chest fly|pec|push press/.test(n)) return "push";
  if (/lateral raise|rear delt|front raise|overhead|military|arnold/.test(n)) return "shoulder";
  if (/curl|tricep|extension|kickback|skull ?crusher/.test(n)) return "arm_accessory";
  if (/crunch|plank|sit-?up|oblique|hollow|leg raise|dead ?bug|bird ?dog|\bab\b/.test(n)) return "core";
  if (/stretch|mobility|foam|cat-?cow|world'?s greatest/.test(n)) return "mobility";
  if (/run|bike|row erg|cardio|jump rope|sprint|assault|ski erg|elliptical/.test(n)) return "cardio";
  return fallback;
}

export function patternFromRapidApi(raw: Record<string, unknown>): MovementPattern {
  const b = String(raw.bodyPart ?? "").toLowerCase();
  const t = String(raw.target ?? "").toLowerCase();
  let base: MovementPattern = "other";
  if (b === "cardio") base = "cardio";
  else if (b === "waist" || t === "abs") base = "core";
  else if (b === "back" || t === "lats" || t === "upper back") base = "pull";
  else if (b === "chest" || t === "pectorals") base = "push";
  else if (b === "shoulders" || t === "delts") base = "shoulder";
  else if (b === "upper arms" || t === "biceps" || t === "triceps") base = "arm_accessory";
  else if (b === "upper legs" || b === "lower legs") base = "squat";
  else if (b === "neck") base = "mobility";
  return patternFromName(String(raw.name ?? ""), base);
}

export function patternFromFreeDb(raw: Record<string, unknown>): MovementPattern {
  const force = String(raw.force ?? "").toLowerCase();
  const cat = String(raw.category ?? "").toLowerCase();
  const prim = (Array.isArray(raw.primaryMuscles) ? raw.primaryMuscles : []).map((m) =>
    String(m).toLowerCase()
  );
  let base: MovementPattern = "other";
  if (cat === "cardio") base = "cardio";
  else if (cat === "stretching") base = "mobility";
  else if (prim.some((m) => /abdominal/.test(m))) base = "core";
  else if (prim.some((m) => /lats|middle back|lower back|traps/.test(m)) || force === "pull") base = "pull";
  else if (prim.some((m) => /chest|triceps/.test(m)) || force === "push") base = "push";
  else if (prim.some((m) => /shoulders/.test(m))) base = "shoulder";
  else if (prim.some((m) => /biceps|forearms/.test(m))) base = "arm_accessory";
  else if (prim.some((m) => /quadriceps|hamstrings|glutes|calves/.test(m))) base = "squat";
  return patternFromName(String(raw.name ?? ""), base);
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function normalizeRapidApi(raw: Record<string, unknown>): ExerciseInsert {
  return {
    source: "rapidapi",
    external_id: String(raw.id ?? raw.name),
    name: titleCase(String(raw.name ?? "")),
    body_part: (raw.bodyPart as string) ?? null,
    target_muscle: (raw.target as string) ?? null,
    secondary_muscles: Array.isArray(raw.secondaryMuscles) ? (raw.secondaryMuscles as string[]) : [],
    equipment: (raw.equipment as string) ?? null,
    movement_pattern: patternFromRapidApi(raw),
    gif_url: (raw.gifUrl as string) ?? null,
    image_urls: [],
    instructions: Array.isArray(raw.instructions) ? (raw.instructions as string[]) : [],
    cues: [],
    regressions: [],
    progressions: [],
    feel: null,
    difficulty: null,
    raw,
  };
}

export function normalizeFreeDb(raw: Record<string, unknown>): ExerciseInsert {
  const images = Array.isArray(raw.images)
    ? (raw.images as string[]).map((p) => FREE_DB_IMAGE_BASE + p)
    : [];
  const primary = Array.isArray(raw.primaryMuscles) ? (raw.primaryMuscles as string[]) : [];
  return {
    source: "free-db",
    external_id: String(raw.id ?? raw.name),
    name: String(raw.name ?? ""),
    body_part: (raw.category as string) ?? null,
    target_muscle: primary[0] ?? null,
    secondary_muscles: Array.isArray(raw.secondaryMuscles) ? (raw.secondaryMuscles as string[]) : [],
    equipment: (raw.equipment as string) ?? null,
    movement_pattern: patternFromFreeDb(raw),
    gif_url: null,
    image_urls: images,
    instructions: Array.isArray(raw.instructions) ? (raw.instructions as string[]) : [],
    cues: [],
    regressions: [],
    progressions: [],
    feel: null,
    difficulty: (raw.level as string) ?? null,
    raw,
  };
}

// ─── current-library view ────────────────────────────────────────────────────
// Flatten LIBRARY_HIERARCHY into the same card shape so the Explorer can show
// the app's own movements alongside (and compared to) the external sources.

export function libraryExercises(): ExternalExercise[] {
  const out: ExternalExercise[] = [];
  for (const group of LIBRARY_HIERARCHY) {
    for (const node of group.nodes) {
      const leaves = node.children && node.children.length ? node.children : [node];
      for (const leaf of leaves) {
        out.push({
          id: `lib-${group.id}-${leaf.id}`,
          source: "library",
          external_id: leaf.id,
          name: leaf.label,
          body_part: group.label,
          target_muscle: node.label === leaf.label ? null : node.label,
          secondary_muscles: [],
          equipment: null,
          movement_pattern: (leaf.category as MovementPattern) ?? "other",
          gif_url: null,
          image_urls: [],
          instructions: leaf.description ? [leaf.description] : [],
          cues: [],
          regressions: [],
          progressions: [],
          feel: null,
          difficulty: null,
        });
      }
    }
  }
  return out;
}

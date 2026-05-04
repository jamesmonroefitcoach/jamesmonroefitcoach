// Past program metadata + summaries — currently demo data, will swap to Supabase.

export type Category =
  | "push" | "pull" | "hinge" | "squat" | "core"
  | "leg_accessory" | "arm_accessory" | "shoulder" | "cardio" | "mobility";

export type Movement = {
  id: string;
  name: string;
  category: Category;
  subcategory?: string;
  muscles?: string[];
  equipment?: string;
  demo_url?: string;
  cues?: string;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  push: "Push",
  pull: "Pull",
  hinge: "Hinge",
  squat: "Squat / Lunge",
  core: "Core",
  leg_accessory: "Leg accessory",
  arm_accessory: "Arm accessory",
  shoulder: "Shoulder",
  cardio: "Cardio",
  mobility: "Mobility"
};

export const MOVEMENT_LIBRARY: Movement[] = [
  { id: "m1", name: "Goblet Squat", category: "squat", muscles: ["quads", "glutes"], equipment: "DB/KB", cues: "Knees track over toes; chest tall" },
  { id: "m2", name: "Romanian Deadlift", category: "hinge", muscles: ["hamstrings", "glutes"], equipment: "Barbell", cues: "Hinge from hips; soft knees" },
  { id: "m3", name: "DB Bench Press", category: "push", muscles: ["pec_major", "triceps", "front_delt"], equipment: "DB" },
  { id: "m4", name: "Chin-up", category: "pull", muscles: ["lats", "biceps"], equipment: "Bar" },
  { id: "m5", name: "Hollow Hold", category: "core", muscles: ["abs"], equipment: "—" },
  { id: "m6", name: "Walking Lunge", category: "leg_accessory", muscles: ["quads", "glutes"], equipment: "DB" },
  { id: "m7", name: "Bicep Curl", category: "arm_accessory", muscles: ["biceps"], equipment: "DB" },
  { id: "m8", name: "Lateral Raise", category: "shoulder", muscles: ["lateral_delt"], equipment: "DB" },
  { id: "m9", name: "Cat-Cow", category: "mobility", muscles: ["spine"], equipment: "—" },
  { id: "m10", name: "Assault Bike Intervals", category: "cardio", equipment: "Bike" },
  { id: "m11", name: "Back Squat", category: "squat", muscles: ["quads", "glutes"], equipment: "Barbell" },
  { id: "m12", name: "Conventional Deadlift", category: "hinge", muscles: ["hamstrings", "glutes", "low_back"], equipment: "Barbell" },
  { id: "m13", name: "Push-up", category: "push", muscles: ["pec_major", "triceps"], equipment: "—" },
  { id: "m14", name: "Bent-over Row", category: "pull", muscles: ["lats", "rhomboids"], equipment: "Barbell" },
  { id: "m15", name: "Plank", category: "core", muscles: ["abs"], equipment: "—" },
  { id: "m16", name: "Step-up", category: "leg_accessory", muscles: ["quads", "glutes"], equipment: "DB" },
  { id: "m17", name: "Tricep Pushdown", category: "arm_accessory", muscles: ["triceps"], equipment: "Cable" },
  { id: "m18", name: "Overhead Press", category: "shoulder", muscles: ["delts", "triceps"], equipment: "Barbell" },
  { id: "m19", name: "World's Greatest Stretch", category: "mobility", equipment: "—" },
  { id: "m20", name: "Row Erg 500m", category: "cardio", equipment: "Rower" }
];

// ─── Past programs (demo) ────────────────────────────────────────────
export type PastProgramSummary = {
  id: string;
  client_id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  duration_weeks: number | null;
  is_current: boolean;
  day_count: number;
  category_counts: Partial<Record<Category, number>>;
};

export type PastProgramDay = {
  day_number: number;
  title: string;
  items: { name: string; category: Category; sets: number; reps: string; exertion: string; notes?: string }[];
};

export type PastProgramFull = PastProgramSummary & { days: PastProgramDay[] };

const DEMO_PAST_PROGRAMS: PastProgramFull[] = [
  {
    id: "prog-acacia-current",
    client_id: "demo-client-acacia",
    name: "Block 3 — Recomp Hypertrophy",
    starts_on: "2026-04-06",
    ends_on: "2026-05-31",
    duration_weeks: 8,
    is_current: true,
    day_count: 3,
    category_counts: { squat: 1, push: 2, pull: 2, hinge: 1, core: 2 },
    days: [
      {
        day_number: 1,
        title: "Day 1 — Lower body",
        items: [
          { name: "Goblet Squat", category: "squat", sets: 4, reps: "8-10", exertion: "RPE 7" },
          { name: "Romanian Deadlift", category: "hinge", sets: 3, reps: "8", exertion: "RPE 7" },
          { name: "Walking Lunge", category: "leg_accessory", sets: 3, reps: "10/leg", exertion: "moderate" },
          { name: "Hollow Hold", category: "core", sets: 3, reps: "30s", exertion: "hard" }
        ]
      },
      {
        day_number: 2,
        title: "Day 2 — Upper push",
        items: [
          { name: "DB Bench Press", category: "push", sets: 4, reps: "8-10", exertion: "RPE 7" },
          { name: "Lateral Raise", category: "shoulder", sets: 3, reps: "12-15", exertion: "moderate" },
          { name: "Tricep Pushdown", category: "arm_accessory", sets: 3, reps: "10-12", exertion: "moderate" },
          { name: "Plank", category: "core", sets: 3, reps: "45s", exertion: "hard" }
        ]
      },
      {
        day_number: 3,
        title: "Day 3 — Upper pull",
        items: [
          { name: "Chin-up", category: "pull", sets: 4, reps: "AMRAP", exertion: "RPE 8" },
          { name: "Bent-over Row", category: "pull", sets: 3, reps: "8-10", exertion: "RPE 7" },
          { name: "Bicep Curl", category: "arm_accessory", sets: 3, reps: "10-12", exertion: "moderate" }
        ]
      }
    ]
  },
  {
    id: "prog-acacia-prev",
    client_id: "demo-client-acacia",
    name: "Block 2 — Foundation",
    starts_on: "2026-02-09",
    ends_on: "2026-04-05",
    duration_weeks: 8,
    is_current: false,
    day_count: 3,
    category_counts: { squat: 2, push: 2, pull: 2, hinge: 1, core: 2 },
    days: [
      {
        day_number: 1,
        title: "Day 1 — Full body A",
        items: [
          { name: "Back Squat", category: "squat", sets: 3, reps: "5", exertion: "RPE 7" },
          { name: "Push-up", category: "push", sets: 3, reps: "AMRAP", exertion: "RPE 7" },
          { name: "Bent-over Row", category: "pull", sets: 3, reps: "8", exertion: "RPE 7" }
        ]
      },
      { day_number: 2, title: "Day 2 — Full body B", items: [
        { name: "Conventional Deadlift", category: "hinge", sets: 3, reps: "5", exertion: "RPE 7" },
        { name: "Overhead Press", category: "shoulder", sets: 3, reps: "8", exertion: "RPE 7" }
      ]},
      { day_number: 3, title: "Day 3 — Conditioning", items: [
        { name: "Assault Bike Intervals", category: "cardio", sets: 5, reps: "30s", exertion: "hard" },
        { name: "Plank", category: "core", sets: 3, reps: "45s", exertion: "moderate" }
      ]}
    ]
  },
  {
    id: "prog-jen-current",
    client_id: "demo-client-jen",
    name: "Block 1 — First Pull-up Plan",
    starts_on: "2026-04-13",
    ends_on: "2026-06-08",
    duration_weeks: 8,
    is_current: true,
    day_count: 2,
    category_counts: { pull: 3, push: 1, core: 2 },
    days: [
      { day_number: 1, title: "Day 1 — Pull focus", items: [
        { name: "Chin-up", category: "pull", sets: 5, reps: "1-3", exertion: "RPE 8" },
        { name: "Bent-over Row", category: "pull", sets: 3, reps: "8", exertion: "RPE 7" }
      ]},
      { day_number: 2, title: "Day 2 — Whole body", items: [
        { name: "Goblet Squat", category: "squat", sets: 3, reps: "10", exertion: "moderate" },
        { name: "DB Bench Press", category: "push", sets: 3, reps: "8", exertion: "moderate" }
      ]}
    ]
  },
  {
    id: "prog-abbey-current",
    client_id: "demo-client-abbey",
    name: "Form Phase",
    starts_on: "2026-04-10",
    ends_on: "2026-05-08",
    duration_weeks: 4,
    is_current: true,
    day_count: 2,
    category_counts: { squat: 1, push: 1, pull: 1, mobility: 1 },
    days: [
      { day_number: 1, title: "Day 1 — Form A", items: [
        { name: "Goblet Squat", category: "squat", sets: 3, reps: "8", exertion: "light" },
        { name: "Push-up", category: "push", sets: 3, reps: "8", exertion: "light" }
      ]},
      { day_number: 2, title: "Day 2 — Form B", items: [
        { name: "Bent-over Row", category: "pull", sets: 3, reps: "8", exertion: "light" },
        { name: "World's Greatest Stretch", category: "mobility", sets: 2, reps: "5/side", exertion: "easy" }
      ]}
    ]
  }
];

export function pastProgramsForClient(clientId: string): PastProgramFull[] {
  return DEMO_PAST_PROGRAMS.filter((p) => p.client_id === clientId).sort((a, b) => (b.starts_on > a.starts_on ? 1 : -1));
}

export function currentProgramForClient(clientId: string): PastProgramFull | null {
  return DEMO_PAST_PROGRAMS.find((p) => p.client_id === clientId && p.is_current) ?? null;
}

export function isExpiringSoon(p: PastProgramSummary): boolean {
  if (!p.ends_on) return false;
  const end = new Date(p.ends_on).getTime();
  const now = Date.now();
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  return end - now < tenDays && end - now > -24 * 60 * 60 * 1000;
}

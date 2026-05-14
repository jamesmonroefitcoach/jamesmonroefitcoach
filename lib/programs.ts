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
  equipment?: string;            // legacy single string (back-compat)
  equipment_list?: string[];      // multi-select equipment values
  equipment_specifics?: string;   // free-text e.g. "preacher curl machine"
  demo_url?: string;
  cues?: string;
  is_core?: boolean;
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
  { id: "m1", name: "Goblet Squat", category: "squat", muscles: ["quads", "glutes"], equipment: "DB/KB", equipment_list: ["dumbbells", "kettlebell"], cues: "Knees track over toes; chest tall", is_core: true },
  { id: "m2", name: "Romanian Deadlift", category: "hinge", muscles: ["hamstrings", "glutes"], equipment: "Barbell", equipment_list: ["barbell"], cues: "Hinge from hips; soft knees", is_core: true },
  { id: "m3", name: "DB Bench Press", category: "push", muscles: ["pec_major", "triceps", "front_delt"], equipment: "DB", equipment_list: ["dumbbells"], is_core: true },
  { id: "m4", name: "Chin-up", category: "pull", muscles: ["lats", "biceps"], equipment: "Bar", equipment_list: ["bodyweight"], is_core: true },
  { id: "m5", name: "Hollow Hold", category: "core", muscles: ["abs"], equipment: "—", equipment_list: ["bodyweight"], is_core: true },
  { id: "m6", name: "Walking Lunge", category: "leg_accessory", muscles: ["quads", "glutes"], equipment: "DB", equipment_list: ["dumbbells"] },
  { id: "m7", name: "Bicep Curl", category: "arm_accessory", muscles: ["biceps"], equipment: "DB", equipment_list: ["dumbbells"] },
  { id: "m8", name: "Lateral Raise", category: "shoulder", muscles: ["lateral_delt"], equipment: "DB", equipment_list: ["dumbbells"] },
  { id: "m9", name: "Cat-Cow", category: "mobility", muscles: ["spine"], equipment: "—", equipment_list: ["bodyweight"] },
  { id: "m10", name: "Assault Bike Intervals", category: "cardio", equipment: "Bike", equipment_list: ["machine"], equipment_specifics: "Assault bike" },
  { id: "m11", name: "Back Squat", category: "squat", muscles: ["quads", "glutes"], equipment: "Barbell", equipment_list: ["barbell"], is_core: true },
  { id: "m12", name: "Conventional Deadlift", category: "hinge", muscles: ["hamstrings", "glutes", "low_back"], equipment: "Barbell", equipment_list: ["barbell"], is_core: true },
  { id: "m13", name: "Push-up", category: "push", muscles: ["pec_major", "triceps"], equipment: "—", equipment_list: ["bodyweight"], is_core: true },
  { id: "m14", name: "Bent-over Row", category: "pull", muscles: ["lats", "rhomboids"], equipment: "Barbell", equipment_list: ["barbell"], is_core: true },
  { id: "m15", name: "Plank", category: "core", muscles: ["abs"], equipment: "—", equipment_list: ["bodyweight"], is_core: true },
  { id: "m16", name: "Step-up", category: "leg_accessory", muscles: ["quads", "glutes"], equipment: "DB", equipment_list: ["dumbbells"] },
  { id: "m17", name: "Tricep Pushdown", category: "arm_accessory", muscles: ["triceps"], equipment: "Cable", equipment_list: ["cable"] },
  { id: "m18", name: "Overhead Press", category: "shoulder", muscles: ["delts", "triceps"], equipment: "Barbell", equipment_list: ["barbell"], is_core: true },
  { id: "m19", name: "World's Greatest Stretch", category: "mobility", equipment: "—", equipment_list: ["bodyweight"] },
  { id: "m20", name: "Row Erg 500m", category: "cardio", equipment: "Rower", equipment_list: ["machine"], equipment_specifics: "Concept2 rower" }
];

// ─── Past programs (demo) ────────────────────────────────────────────
export type ProgramKind = "in_gym" | "at_home";

export type Equipment = "machine" | "bands" | "dumbbells" | "barbell" | "bodyweight" | "kettlebell" | "cable" | "other";

export const EQUIPMENT_OPTIONS: { value: Equipment; label: string; allowsSpecifics?: boolean }[] = [
  { value: "machine", label: "Machine", allowsSpecifics: true },
  { value: "bands", label: "Bands" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "barbell", label: "Barbell" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "cable", label: "Cable" },
  { value: "other", label: "Other", allowsSpecifics: true }
];

// RPE bands: 3 options represented by values 2, 5, 8
export const EXERTION_LABELS: Record<number, string> = {
  2: "1–3 Warmup",
  5: "3–6 Working",
  8: "7–10 Maximum",
};

export const EXERTION_SHORT: Record<number, string> = {
  2: "Warmup",
  5: "Working",
  8: "Maximum",
};

/** Map any legacy 1-10 score to the nearest RPE band value */
export function toRpeBand(score: number): number {
  if (score <= 3) return 2;
  if (score <= 6) return 5;
  return 8;
}

export const PROGRAM_KIND_LABEL: Record<ProgramKind, string> = {
  in_gym: "Sessions",
  at_home: "Program"
};

// ─── Hierarchical exercise library ───────────────────────────────────────────
export type LibraryLeaf = {
  id: string;
  label: string;
  description?: string;
  category: Category;
  is_core?: boolean;
};

export type LibraryNode = {
  id: string;
  label: string;
  description?: string;
  category: Category;
  is_core?: boolean;
  children?: LibraryLeaf[];  // only two levels within a node
};

export type LibraryGroup = {
  id: string;
  label: string;
  nodes: LibraryNode[];
};

export const LIBRARY_HIERARCHY: LibraryGroup[] = [
  {
    id: "upper", label: "Upper",
    nodes: [
      { id: "vertical-pull",      label: "Vertical Pull",      category: "pull",         is_core: true },
      { id: "horizontal-pull",    label: "Horizontal Pull",    category: "pull",         is_core: true },
      { id: "vertical-push",      label: "Vertical Push",      category: "push",         is_core: true },
      { id: "horizontal-push",    label: "Horizontal Push",    category: "push",         is_core: true },
      { id: "downward-push",      label: "Downward Push",      category: "push",
        description: "chest, table decline, decline db press, dip" },
      { id: "lat-pushdown",       label: "Lat Pushdown",       category: "pull" },
      { id: "scapular-training",  label: "Scapular Training",  category: "shoulder" },
    ],
  },
  {
    id: "accessory", label: "Accessory",
    nodes: [
      { id: "bicep-curl",     label: "Bicep curl",    category: "arm_accessory" },
      { id: "tricep-ext",     label: "Tricep ext.",   category: "arm_accessory" },
      { id: "lateral-raise",  label: "Lateral raise", category: "shoulder" },
      { id: "rear-delt",      label: "Rear delt",     category: "shoulder" },
    ],
  },
  {
    id: "middle", label: "Middle",
    nodes: [
      { id: "back-extension", label: "Back extension", category: "hinge" },
      {
        id: "ab", label: "Ab", category: "core", is_core: true,
        children: [
          { id: "crunch",          label: "Crunch",          category: "core" },
          { id: "oblique-crunch",  label: "Oblique crunch",  category: "core" },
          { id: "oblique-twist",   label: "Oblique twist",   category: "core" },
          { id: "reverse-crunch",  label: "Reverse crunch",  category: "core" },
          { id: "vacuum",          label: "Vacuum",          category: "core" },
        ],
      },
    ],
  },
  {
    id: "lower", label: "Lower",
    nodes: [
      { id: "hinge", label: "Hinge", category: "hinge", is_core: true },
      { id: "squat", label: "Squat", category: "squat", is_core: true },
    ],
  },
  {
    id: "cardio", label: "Cardio",
    nodes: [
      { id: "running",     label: "Running",     category: "cardio" },
      { id: "biking",      label: "Biking",      category: "cardio" },
      { id: "rowing",      label: "Rowing",      category: "cardio" },
      { id: "ski-erg",     label: "Ski Erg",     category: "cardio" },
      { id: "boxing",      label: "Boxing",      category: "cardio" },
      { id: "jump-roping", label: "Jump roping", category: "cardio" },
      { id: "hiit",        label: "HIIT",        category: "cardio",
        description: "explosive combos of the above" },
      {
        id: "specialty-skills", label: "Specialty skills", category: "cardio",
        children: [
          { id: "speed",      label: "Speed",      category: "cardio" },
          { id: "agility",    label: "Agility",    category: "cardio" },
          { id: "quickness",  label: "Quickness",  category: "cardio" },
        ],
      },
    ],
  },
];

/** Special movement used to insert a timed rest block into a program. */
export const REST_MOVEMENT: Movement = {
  id: "rest",
  name: "Rest",
  category: "cardio",
};

/** All leaf nodes (individual movements) from the hierarchy. */
export function hierarchyLeaves(): LibraryLeaf[] {
  const out: LibraryLeaf[] = [];
  for (const g of LIBRARY_HIERARCHY) {
    for (const node of g.nodes) {
      if (node.children?.length) {
        out.push(...node.children);
      } else {
        out.push({ id: node.id, label: node.label, description: node.description, category: node.category, is_core: node.is_core });
      }
    }
  }
  return out;
}

/** Convert a LibraryLeaf into a Movement-compatible object for the program builder. */
export function leafToMovement(leaf: LibraryLeaf): Movement {
  const existing = MOVEMENT_LIBRARY.find((m) => m.id === leaf.id || m.name.toLowerCase() === leaf.label.toLowerCase());
  if (existing) return { ...existing, subcategory: existing.subcategory ?? leaf.label };
  return {
    id: leaf.id,
    name: leaf.label,
    category: leaf.category,
    subcategory: leaf.label,
    is_core: leaf.is_core ?? false,
    equipment_list: [],
    cues: leaf.description,
  };
}

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
  program_kind: ProgramKind;
  at_home_cadence?: string | null;
  // Authorship flag — true when the client built this themselves via the
  // client-side builder. Drives the split between Coach Assigned vs Client
  // Created on the Past Programs widget.
  created_by_client?: boolean;
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
    program_kind: "in_gym",
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
    program_kind: "in_gym",
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
    program_kind: "in_gym",
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
    program_kind: "in_gym",
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
  },
  {
    id: "prog-acacia-athome",
    client_id: "demo-client-acacia",
    name: "Off-day Mobility & Walks",
    starts_on: "2026-04-06",
    ends_on: "2026-05-31",
    duration_weeks: 8,
    is_current: true,
    day_count: 1,
    category_counts: { mobility: 2, cardio: 1, core: 1 },
    program_kind: "at_home",
    at_home_cadence: "On non-gym days",
    days: [
      { day_number: 1, title: "Anytime — 25 min", items: [
        { name: "World's Greatest Stretch", category: "mobility", sets: 2, reps: "5/side", exertion: "easy" },
        { name: "Cat-Cow", category: "mobility", sets: 2, reps: "10", exertion: "easy" },
        { name: "Walk", category: "cardio", sets: 1, reps: "20 min", exertion: "easy" },
        { name: "Plank", category: "core", sets: 3, reps: "30s", exertion: "moderate" }
      ]}
    ]
  },
  {
    id: "prog-jen-athome",
    client_id: "demo-client-jen",
    name: "Pull-up Practice (at home)",
    starts_on: "2026-04-13",
    ends_on: "2026-06-08",
    duration_weeks: 8,
    is_current: true,
    day_count: 1,
    category_counts: { pull: 2 },
    program_kind: "at_home",
    at_home_cadence: "3x/week between sessions",
    days: [
      { day_number: 1, title: "Pull-up greasing", items: [
        { name: "Chin-up", category: "pull", sets: 5, reps: "1 (slow negative)", exertion: "very hard" }
      ]}
    ]
  }
];

export function pastProgramsForClient(clientId: string): PastProgramFull[] {
  return DEMO_PAST_PROGRAMS.filter((p) => p.client_id === clientId).sort((a, b) => (b.starts_on > a.starts_on ? 1 : -1));
}

export function currentProgramsForClient(clientId: string): PastProgramFull[] {
  return DEMO_PAST_PROGRAMS.filter((p) => p.client_id === clientId && p.is_current);
}

export function currentProgramForClient(clientId: string): PastProgramFull | null {
  // Returns the in-gym current program by default (back-compat).
  return DEMO_PAST_PROGRAMS.find((p) => p.client_id === clientId && p.is_current && p.program_kind === "in_gym") ?? null;
}

export function isExpiringSoon(p: PastProgramSummary): boolean {
  if (!p.ends_on) return false;
  const end = new Date(p.ends_on).getTime();
  const now = Date.now();
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  return end - now < tenDays && end - now > -24 * 60 * 60 * 1000;
}

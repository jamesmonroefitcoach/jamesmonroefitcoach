// Plain constants used by both the public consult form and the coach inbox.
// These need to be importable from client components, so they cannot live in
// the "use server" actions.ts file (which only allows async function exports).

export const OFFERING_KEYS = [
  "in_person",
  "hybrid",
  "online_only",
  "tactical",
  "movement_restore",
  "consult_only",
] as const;
export type OfferingKey = typeof OFFERING_KEYS[number];

export const OFFERING_LABELS: Record<OfferingKey, string> = {
  in_person:        "1:1 In-person coaching",
  hybrid:           "Hybrid / at-home programming",
  online_only:      "Online-only programming",
  tactical:         "Tactical strength & endurance",
  movement_restore: "Movement restoration / return from injury",
  consult_only:     "Not sure — let's talk",
};

export const EXPERIENCE_LEVELS = [
  "new",
  "casual",
  "consistent",
  "advanced",
  "former_athlete",
] as const;
export type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  new:            "Brand new to training",
  casual:         "Casual / on-and-off",
  consistent:     "Consistent 3+ days/week",
  advanced:       "Advanced — programming my own",
  former_athlete: "Former athlete returning",
};

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export type ActivityLevel = typeof ACTIVITY_LEVELS[number];

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary:   "Sedentary — mostly sitting",
  light:       "Lightly active — on my feet sometimes",
  moderate:    "Moderately active — exercise a few times a week",
  active:      "Active — exercise most days",
  very_active: "Very active — daily training or a physical job",
};

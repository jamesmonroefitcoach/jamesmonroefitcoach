export const CANCEL_REASONS = [
  "sick", "travel", "schedule_conflict", "injury",
  "family_emergency", "weather", "coach_cancelled", "no_show", "other"
] as const;

export type CancelReason = typeof CANCEL_REASONS[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  sick:              "Sick",
  travel:            "Travel",
  schedule_conflict: "Schedule conflict",
  injury:            "Injury",
  family_emergency:  "Family emergency",
  weather:           "Weather",
  coach_cancelled:   "Coach cancelled",
  no_show:           "No-show",
  other:             "Other…",
};

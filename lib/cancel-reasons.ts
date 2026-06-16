// Updated 2026-06-15 to James's preferred set. Old codes (sick, travel,
// schedule_conflict, family_emergency, weather, coach_cancelled, no_show,
// injury) stay accepted at the DB layer (TEXT column) so any historical
// rows won't break; the picker just shows the new options going forward.
export const CANCEL_REASONS = [
  "accident", "no_reason", "personal", "client_schedule", "injury_ill", "other"
] as const;

export type CancelReason = typeof CANCEL_REASONS[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  accident:        "Accident",
  no_reason:       "No reason given",
  personal:        "Personal",
  client_schedule: "Client schedule",
  injury_ill:      "Injury / illness",
  other:           "Other…",
};

// Historical codes — keep a separate label map so already-saved
// cancellations still render readable text in the backlog dropdown.
const LEGACY_LABELS: Record<string, string> = {
  sick:              "Sick",
  travel:            "Travel",
  schedule_conflict: "Schedule conflict",
  injury:            "Injury",
  family_emergency:  "Family emergency",
  weather:           "Weather",
  coach_cancelled:   "Coach cancelled",
  no_show:           "No-show",
};

export function cancelReasonLabel(code: string | null | undefined, other?: string | null): string {
  if (!code) return "—";
  if (code === "other") return other?.trim() || "Other";
  if (code in CANCEL_REASON_LABELS) return CANCEL_REASON_LABELS[code as CancelReason];
  if (code in LEGACY_LABELS) return LEGACY_LABELS[code];
  return code;
}

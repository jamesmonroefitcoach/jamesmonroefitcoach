// Goals — shared types + format helpers.
//
// Pure helpers only — no server imports — so this file is safe to import
// from client components. Server-side fetches live in lib/goals.server.ts.

export type GoalKind =
  | "weekly_hours"   // weekly hour total (range allowed)
  | "weekly_count"   // weekly tally (sessions, runs)
  | "per_night"      // nightly average (sleep)
  | "pr"             // one-time PR target (max reps)
  | "one_time";      // single milestone, no numeric

export type GoalCategoryRow = {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_archived: boolean;
};

export type GoalRow = {
  id: string;
  category_id: string;
  parent_goal_id: string | null;
  name: string;
  kind: GoalKind;
  target_value: number | null;
  target_range_low: number | null;
  target_range_high: number | null;
  target_unit: string | null;
  current_value: number | null;
  is_achieved: boolean;
  notes: string | null;
  priority: number;
  is_archived: boolean;
};

export type GoalCategoryWithGoals = GoalCategoryRow & {
  goals: GoalRow[];
};

export function targetLabel(g: GoalRow): string {
  if (g.kind === "one_time") return "milestone";
  const unit = g.target_unit ? ` ${g.target_unit}` : "";
  if (g.target_range_low != null && g.target_range_high != null) {
    return `${g.target_range_low}–${g.target_range_high}${unit}`;
  }
  if (g.target_value != null) return `${g.target_value}${unit}`;
  return "—";
}

export function cadenceLabel(g: GoalRow): string {
  switch (g.kind) {
    case "weekly_hours": return "per week";
    case "weekly_count": return "per week";
    case "per_night":    return "per night";
    case "pr":           return "PR";
    case "one_time":     return "one-time";
  }
}

export function progressPct(g: GoalRow): number | null {
  if (g.kind === "one_time") return g.is_achieved ? 100 : 0;
  if (g.target_value == null) return null;
  if (g.current_value == null) return 0;
  const pct = (g.current_value / g.target_value) * 100;
  return Math.max(0, Math.min(100, pct));
}

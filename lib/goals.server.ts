// Server-only Goals helpers — anything that touches Supabase lives here.
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import type { GoalCategoryRow, GoalCategoryWithGoals, GoalRow } from "@/lib/goals";

/** This week's check-in entries for a set of goals, keyed by goal id.
 *  tableMissing flags a missing goal_weekly_checkins table (migration 0035
 *  not run yet) so the UI can say so instead of silently showing nothing. */
export async function listWeeklyCheckins(
  goalIds: string[],
  weekStart: string
): Promise<{ entries: Record<string, { value: number | null; stars: number | null }>; tableMissing: boolean }> {
  if (!hasSupabaseEnv() || goalIds.length === 0) return { entries: {}, tableMissing: false };
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("goal_weekly_checkins")
    .select("goal_id, value, stars")
    .in("goal_id", goalIds)
    .eq("week_start", weekStart);
  if (error) {
    // 42P01 = relation does not exist (raw Postgres); PGRST205 = table not in
    // PostgREST's schema cache — both mean migration 0035 hasn't been run.
    const code = (error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205") return { entries: {}, tableMissing: true };
    console.error("[listWeeklyCheckins] query error:", error);
    return { entries: {}, tableMissing: false };
  }
  const entries: Record<string, { value: number | null; stars: number | null }> = {};
  for (const r of (data ?? []) as { goal_id: string; value: number | null; stars: number | null }[]) {
    entries[r.goal_id] = { value: r.value, stars: r.stars };
  }
  return { entries, tableMissing: false };
}

export async function listGoalsForUser(ownerId: string): Promise<GoalCategoryWithGoals[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = createSupabaseAdmin();
  const { data: cats } = await supabase
    .from("goal_categories")
    .select("id, owner_id, name, color, sort_order, is_archived")
    .eq("owner_id", ownerId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });
  const categories = (cats ?? []) as GoalCategoryRow[];
  if (categories.length === 0) return [];

  const { data: goals } = await supabase
    .from("goals")
    .select("id, category_id, parent_goal_id, name, kind, target_value, target_range_low, target_range_high, target_unit, current_value, is_achieved, notes, priority, is_archived")
    .in("category_id", categories.map((c) => c.id))
    .eq("is_archived", false)
    .order("priority", { ascending: true });
  const goalRows = (goals ?? []) as GoalRow[];

  return categories.map((c) => ({
    ...c,
    goals: goalRows.filter((g) => g.category_id === c.id),
  }));
}

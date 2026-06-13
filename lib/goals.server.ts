// Server-only Goals helpers — anything that touches Supabase lives here.
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import type { GoalCategoryRow, GoalCategoryWithGoals, GoalRow } from "@/lib/goals";

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

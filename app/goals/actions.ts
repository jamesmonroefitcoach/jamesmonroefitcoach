"use server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import type { GoalKind } from "@/lib/goals";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const PATH = "/coach/goals";
const PATH_CLIENT = "/client/goals";

function revalidate() {
  revalidatePath(PATH);
  revalidatePath(PATH_CLIENT);
}

async function ownerId(): Promise<string | null> {
  const me = await getSessionUser();
  return me?.id ?? null;
}

// ── Categories ────────────────────────────────────────────────────────

export async function createCategory(input: { name: string; color?: string }): Promise<Result<{ id: string }>> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!input.name.trim()) return { ok: false, error: "Category name is required." };

  const supabase = createSupabaseAdmin();
  const { data: max } = await supabase
    .from("goal_categories")
    .select("sort_order")
    .eq("owner_id", id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  const sort_order = (max?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("goal_categories")
    .insert({
      owner_id: id,
      name: input.name.trim(),
      color: input.color ?? "#7a6f63",
      sort_order,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? "create failed" };
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function updateCategory(catId: string, patch: { name?: string; color?: string; sort_order?: number }): Promise<Result> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("goal_categories")
    .update(patch)
    .eq("id", catId)
    .eq("owner_id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteCategory(catId: string): Promise<Result> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  // Hard-delete cascades to goals + sub-goals (FK is on delete cascade).
  const { error } = await supabase
    .from("goal_categories")
    .delete()
    .eq("id", catId)
    .eq("owner_id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function reorderCategories(orderedIds: string[]): Promise<Result> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  await Promise.all(
    orderedIds.map((cid, i) =>
      supabase.from("goal_categories").update({ sort_order: i }).eq("id", cid).eq("owner_id", id)
    )
  );
  revalidate();
  return { ok: true };
}

// ── Goals ─────────────────────────────────────────────────────────────

export async function createGoal(input: {
  category_id: string;
  parent_goal_id?: string | null;
  name: string;
  kind: GoalKind;
  target_value?: number | null;
  target_range_low?: number | null;
  target_range_high?: number | null;
  target_unit?: string | null;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!input.name.trim()) return { ok: false, error: "Goal name is required." };

  const supabase = createSupabaseAdmin();
  // Confirm the category belongs to me.
  const { data: cat } = await supabase
    .from("goal_categories")
    .select("id")
    .eq("id", input.category_id)
    .eq("owner_id", id)
    .maybeSingle<{ id: string }>();
  if (!cat) return { ok: false, error: "Category not found." };

  const { data: max } = await supabase
    .from("goals")
    .select("priority")
    .eq("category_id", input.category_id)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle<{ priority: number }>();
  const priority = (max?.priority ?? -1) + 1;

  const { data, error } = await supabase
    .from("goals")
    .insert({
      category_id: input.category_id,
      parent_goal_id: input.parent_goal_id ?? null,
      name: input.name.trim(),
      kind: input.kind,
      target_value: input.target_value ?? null,
      target_range_low: input.target_range_low ?? null,
      target_range_high: input.target_range_high ?? null,
      target_unit: input.target_unit ?? null,
      notes: input.notes ?? null,
      priority,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? "create failed" };
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function updateGoal(goalId: string, patch: {
  name?: string;
  kind?: GoalKind;
  target_value?: number | null;
  target_range_low?: number | null;
  target_range_high?: number | null;
  target_unit?: string | null;
  current_value?: number | null;
  is_achieved?: boolean;
  notes?: string | null;
  priority?: number;
  category_id?: string;     // for moving between categories
  parent_goal_id?: string | null;
}): Promise<Result> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  // Ownership guard via the category.
  const { data: g } = await supabase
    .from("goals")
    .select("category_id, goal_categories:category_id ( owner_id )")
    .eq("id", goalId)
    .maybeSingle();
  type GuardRow = { category_id: string; goal_categories?: { owner_id: string } | { owner_id: string }[] | null };
  const guardRow = g as GuardRow | null;
  const cats = guardRow?.goal_categories;
  const owner = Array.isArray(cats) ? cats[0]?.owner_id : cats?.owner_id;
  if (!guardRow || owner !== id) return { ok: false, error: "Not allowed." };

  const { error } = await supabase.from("goals").update(patch).eq("id", goalId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteGoal(goalId: string): Promise<Result> {
  // Soft delete — flip is_archived. Ownership guard duplicated here so we
  // don't reroute through updateGoal (whose patch type omits is_archived).
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const { data: g } = await supabase
    .from("goals")
    .select("category_id, goal_categories:category_id ( owner_id )")
    .eq("id", goalId)
    .maybeSingle();
  type GuardRow = { category_id: string; goal_categories?: { owner_id: string } | { owner_id: string }[] | null };
  const guardRow = g as GuardRow | null;
  const cats = guardRow?.goal_categories;
  const owner = Array.isArray(cats) ? cats[0]?.owner_id : cats?.owner_id;
  if (!guardRow || owner !== id) return { ok: false, error: "Not allowed." };

  const { error } = await supabase.from("goals").update({ is_archived: true }).eq("id", goalId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Weekly check-in save — one row per goal per week. Numeric goals send
 *  `value` (and mirror it onto goals.current_value so the lists reflect the
 *  typed number immediately); non-numeric goals send `stars` (1-5). */
export async function saveWeeklyCheckin(
  goalId: string,
  weekStart: string,
  entry: { value?: number | null; stars?: number | null }
): Promise<Result> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { ok: false, error: "Bad week." };
  const stars = entry.stars ?? null;
  const value = entry.value ?? null;
  if (stars != null && (stars < 1 || stars > 5)) return { ok: false, error: "Stars must be 1-5." };
  if (stars == null && value == null) return { ok: false, error: "Nothing to save." };

  const supabase = createSupabaseAdmin();
  // Ownership guard via the category.
  const { data: g } = await supabase
    .from("goals")
    .select("category_id, goal_categories:category_id ( owner_id )")
    .eq("id", goalId)
    .maybeSingle();
  type GuardRow = { category_id: string; goal_categories?: { owner_id: string } | { owner_id: string }[] | null };
  const guardRow = g as GuardRow | null;
  const cats = guardRow?.goal_categories;
  const owner = Array.isArray(cats) ? cats[0]?.owner_id : cats?.owner_id;
  if (!guardRow || owner !== id) return { ok: false, error: "Not allowed." };

  const { error } = await supabase
    .from("goal_weekly_checkins")
    .upsert(
      { goal_id: goalId, week_start: weekStart, value, stars, updated_at: new Date().toISOString() },
      { onConflict: "goal_id,week_start" }
    );
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205") {
      return { ok: false, error: "Check-in table missing — run migration 0035 first." };
    }
    return { ok: false, error: error.message };
  }
  if (value != null) {
    await supabase.from("goals").update({ current_value: value }).eq("id", goalId);
  }
  revalidate();
  return { ok: true };
}

export async function reorderGoals(categoryId: string, orderedIds: string[]): Promise<Result> {
  const id = await ownerId();
  if (!id) return { ok: false, error: "Not signed in." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  // Ownership guard.
  const { data: cat } = await supabase
    .from("goal_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("owner_id", id)
    .maybeSingle<{ id: string }>();
  if (!cat) return { ok: false, error: "Not allowed." };

  await Promise.all(
    orderedIds.map((gid, i) =>
      supabase.from("goals").update({ priority: i }).eq("id", gid).eq("category_id", categoryId)
    )
  );
  revalidate();
  return { ok: true };
}

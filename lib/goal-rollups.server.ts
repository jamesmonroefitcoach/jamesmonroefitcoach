// Server-side goal rollups — keep goal.current_value in sync with the
// real activity stored elsewhere (appointments, actuals, check-ins).
// Called from the Goals page + Schedule page on read; rollups are
// cheap enough to run inline and idempotent so a missed run never
// causes drift.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

type AppointmentLite = {
  starts_at: string;
  ends_at: string;
  goal_id: string | null;
  session_type: "session" | "personal";
};

/** Roll up the last 7 nights of Sleep-tagged personal blocks into the
 *  current_value of each goal in the Sleep category. Picks the goal
 *  with kind='per_night' specifically (sleep duration) and writes the
 *  trailing-7-night average. */
export async function rollupSleepForUser(ownerId: string): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const supabase = createSupabaseAdmin();

  // Find the user's Sleep category and its per_night goal(s).
  const { data: cats } = await supabase
    .from("goal_categories")
    .select("id, name, goals:goals!goals_category_id_fkey ( id, kind )")
    .eq("owner_id", ownerId)
    .eq("is_archived", false);
  type CatRow = { id: string; name: string; goals: { id: string; kind: string }[] | { id: string; kind: string } | null };
  const sleepCat = (cats ?? []).find((c: unknown) => /sleep/i.test((c as CatRow).name)) as CatRow | undefined;
  if (!sleepCat) return;
  const goals = Array.isArray(sleepCat.goals) ? sleepCat.goals : sleepCat.goals ? [sleepCat.goals] : [];
  const perNightGoalIds = goals.filter((g) => g.kind === "per_night").map((g) => g.id);
  if (perNightGoalIds.length === 0) return;

  // Pull this user's personal blocks tagged with ANY sleep-category goal
  // from the last 7 days. We compute the trailing average from the actual
  // appointment durations.
  const goalIdSet = new Set(goals.map((g) => g.id));
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // Personal blocks live on appointments. For a coach owner they're keyed
  // by coach_id; for a client owner they're keyed by client_id. Match
  // either so the same rollup works for both surfaces.
  const { data: appts } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, goal_id, session_type")
    .or(`coach_id.eq.${ownerId},client_id.eq.${ownerId}`)
    .eq("session_type", "personal")
    .gte("starts_at", since);

  const sleepAppts = (appts ?? []).filter((a: AppointmentLite) =>
    a.goal_id != null && goalIdSet.has(a.goal_id)
  );
  let avgHours: number | null = null;
  if (sleepAppts.length > 0) {
    const totalMs = sleepAppts.reduce((s, a) => {
      const dur = new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime();
      return s + Math.max(0, dur);
    }, 0);
    avgHours = Math.round((totalMs / sleepAppts.length / 3_600_000) * 10) / 10;
  }

  // Write the rolled-up value into every per_night goal. We use the same
  // value for each since they all measure the same underlying metric.
  for (const goalId of perNightGoalIds) {
    await supabase
      .from("goals")
      .update({ current_value: avgHours })
      .eq("id", goalId);
  }
}

/** Roll up weekly_hours and weekly_count goals from this calendar week's
 *  goal-tagged personal blocks. Same pattern as sleep — keeps the Goals
 *  page in sync with whatever's on the calendar. */
export async function rollupWeeklyGoalsForUser(ownerId: string): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const supabase = createSupabaseAdmin();

  // Pull all goal ids + kinds for this owner.
  const { data: catRows } = await supabase
    .from("goal_categories")
    .select("id, goals:goals!goals_category_id_fkey ( id, kind )")
    .eq("owner_id", ownerId)
    .eq("is_archived", false);
  type GoalLite = { id: string; kind: string };
  const allGoals: GoalLite[] = (catRows ?? []).flatMap((c: unknown) => {
    const row = c as { goals: GoalLite[] | GoalLite | null };
    return Array.isArray(row.goals) ? row.goals : row.goals ? [row.goals] : [];
  });
  const weeklyHourIds = new Set(allGoals.filter((g) => g.kind === "weekly_hours").map((g) => g.id));
  const weeklyCountIds = new Set(allGoals.filter((g) => g.kind === "weekly_count").map((g) => g.id));
  if (weeklyHourIds.size === 0 && weeklyCountIds.size === 0) return;

  // Monday-anchored week start.
  const now = new Date();
  const ws = new Date(now);
  ws.setHours(0, 0, 0, 0);
  ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  const we = new Date(ws); we.setDate(ws.getDate() + 7);

  const { data: appts } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, goal_id, session_type")
    .or(`coach_id.eq.${ownerId},client_id.eq.${ownerId}`)
    .eq("session_type", "personal")
    .gte("starts_at", ws.toISOString())
    .lt("starts_at", we.toISOString());

  // Per goal: hours sum + count.
  const byGoal = new Map<string, { hours: number; count: number }>();
  for (const a of appts ?? []) {
    const row = a as AppointmentLite;
    if (!row.goal_id) continue;
    const cur = byGoal.get(row.goal_id) ?? { hours: 0, count: 0 };
    cur.hours += Math.max(0, (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 3_600_000);
    cur.count += 1;
    byGoal.set(row.goal_id, cur);
  }

  // Push the right metric to each goal kind. Reset goals with no activity
  // to 0 so a deleted/uncounted block clears the prior value too.
  await Promise.all([
    ...Array.from(weeklyHourIds).map((id) => {
      const v = Math.round(((byGoal.get(id)?.hours ?? 0)) * 10) / 10;
      return supabase.from("goals").update({ current_value: v }).eq("id", id);
    }),
    ...Array.from(weeklyCountIds).map((id) => {
      const v = byGoal.get(id)?.count ?? 0;
      return supabase.from("goals").update({ current_value: v }).eq("id", id);
    }),
  ]);
}

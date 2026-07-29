import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listGoalsForUser, listWeeklyCheckins } from "@/lib/goals.server";
import { rollupSleepForUser, rollupWeeklyGoalsForUser } from "@/lib/goal-rollups.server";
import GoalsClient from "@/components/goals-client";
import GoalsTabs from "./goals-tabs";

export default async function CoachGoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");
  // Sync current_value from the calendar before reading so the page
  // reflects this week's actual activity (sleep avg + weekly tallies).
  await Promise.all([
    rollupSleepForUser(user.id),
    rollupWeeklyGoalsForUser(user.id),
  ]);
  const categories = await listGoalsForUser(user.id);

  // Weekly check-in survey: this Monday-anchored week's entries for every
  // recurring (non-one_time) top-level goal.
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  const weeklyGoalIds = categories.flatMap((c) =>
    c.goals.filter((g) => !g.parent_goal_id && g.kind !== "one_time").map((g) => g.id)
  );
  const { entries, tableMissing } = await listWeeklyCheckins(weeklyGoalIds, weekStart);

  return (
    <>
      <main className="shell" style={{ paddingTop: "0.75rem", paddingBottom: 0 }}>
        <GoalsTabs />
      </main>
      <GoalsClient
        ownerLabel={user.name}
        categories={categories}
        checkin={{ weekStart, entries, tableMissing }}
      />
    </>
  );
}

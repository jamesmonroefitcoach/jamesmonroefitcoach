import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listGoalsForUser } from "@/lib/goals.server";
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
  return (
    <>
      <main className="shell" style={{ paddingTop: "0.75rem", paddingBottom: 0 }}>
        <GoalsTabs />
      </main>
      <GoalsClient ownerLabel={user.name} categories={categories} />
    </>
  );
}

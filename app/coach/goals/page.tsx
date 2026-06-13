import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listGoalsForUser } from "@/lib/goals.server";
import { rollupSleepForUser, rollupWeeklyGoalsForUser } from "@/lib/goal-rollups.server";
import GoalsClient from "@/components/goals-client";

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
  return <GoalsClient ownerLabel={user.name} categories={categories} />;
}

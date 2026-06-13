import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listGoalsForUser } from "@/lib/goals.server";
import GoalsClient from "@/components/goals-client";

export default async function CoachGoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");
  const categories = await listGoalsForUser(user.id);
  return <GoalsClient ownerLabel={user.name} categories={categories} />;
}

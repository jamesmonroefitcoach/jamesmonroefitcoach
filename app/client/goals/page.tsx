import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listGoalsForUser } from "@/lib/goals.server";
import GoalsClient from "@/components/goals-client";

export default async function ClientGoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");
  const categories = await listGoalsForUser(user.id);
  return <GoalsClient ownerLabel={user.name} categories={categories} />;
}

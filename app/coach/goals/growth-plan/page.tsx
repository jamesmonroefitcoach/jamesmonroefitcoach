import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listGrowthPlan } from "./actions";
import GoalsTabs from "../goals-tabs";
import GrowthPlanClient from "./growth-plan-client";

export default async function GrowthPlanPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");
  const bundle = await listGrowthPlan();
  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <GoalsTabs />
      <header style={{ marginBottom: "0.4rem" }}>
        <span className="badge">Growth plan</span>
        <h1 style={{ marginTop: "0.5rem" }}>Plan the path to $150k</h1>
        <p className="meta">
          Every client by month through end of year. Edit tested rates and sessions/week to model what hits the target ({fmtUsd(bundle.weekly_target)} weekly).
        </p>
      </header>
      <hr className="divider" />
      <GrowthPlanClient bundle={bundle} />
    </main>
  );
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

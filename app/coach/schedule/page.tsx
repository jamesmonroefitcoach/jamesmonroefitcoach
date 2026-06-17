import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek, listAppointmentsForMonth, listClients, startOfWeek } from "@/lib/data";
import { listGoalsForUser } from "@/lib/goals.server";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import ScheduleView from "./schedule-view";
import ScheduleTabs from "./schedule-tabs";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; month?: string; view?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  // Past-completed rule: flip any past session still in 'scheduled'
  // state to 'completed' before reading. Cheap, idempotent — only
  // touches rows that actually need flipping.
  if (hasSupabaseEnv()) {
    const sb = createSupabaseAdmin();
    await sb.from("appointments")
      .update({ status: "completed" })
      .eq("coach_id", user.id)
      .eq("session_type", "session")
      .eq("status", "scheduled")
      .lt("starts_at", new Date().toISOString());
  }

  const sp = await searchParams;
  const weekStart = sp.week ? new Date(sp.week) : startOfWeek(new Date());
  const monthStart = sp.month ? new Date(sp.month) : new Date();

  const [weekAppts, monthAppts, clients, goalCategoriesRaw] = await Promise.all([
    listAppointmentsForWeek(user.id, weekStart),
    listAppointmentsForMonth(user.id, monthStart),
    listClients(user.id),
    listGoalsForUser(user.id),
  ]);
  // Flatten to the lighter shape the schedule needs (id/name/color +
  // each category's goal id/name list).
  const goalCategories = goalCategoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    goals: c.goals.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      target_value: g.target_value,
      target_range_low: g.target_range_low,
      target_range_high: g.target_range_high,
      target_unit: g.target_unit,
    })),
  }));

  return (
    <>
    <ScheduleTabs />
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Schedule</h1>
          <p className="meta">Click an open block to add a session. Click an existing event to edit, cancel, mark no-show, or move.</p>
        </div>
      </header>
      <hr className="divider" />
      <ScheduleView
        weekStart={weekStart.toISOString().slice(0, 10)}
        monthStart={monthStart.toISOString().slice(0, 10)}
        initialView={sp.view === "month" ? "month" : "week"}
        weekAppts={weekAppts}
        monthAppts={monthAppts}
        clients={clients}
        goalCategories={goalCategories}
      />
    </main>
    </>
  );
}

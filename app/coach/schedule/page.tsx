import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek, listAppointmentsForMonth, listClients, startOfWeek } from "@/lib/data";
import ScheduleView from "./schedule-view";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; month?: string; view?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const weekStart = sp.week ? new Date(sp.week) : startOfWeek(new Date());
  const monthStart = sp.month ? new Date(sp.month) : new Date();

  const [weekAppts, monthAppts, clients] = await Promise.all([
    listAppointmentsForWeek(user.id, weekStart),
    listAppointmentsForMonth(user.id, monthStart),
    listClients(user.id)
  ]);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Schedule</h1>
          <p className="meta">Click an open block to add a session. Click an existing event to edit, cancel, mark no-show, or move.</p>
        </div>
      </header>
      <hr className="divider" />
      <ScheduleView
        weekStart={weekStart.toISOString()}
        monthStart={monthStart.toISOString()}
        initialView={sp.view === "month" ? "month" : "week"}
        weekAppts={weekAppts}
        monthAppts={monthAppts}
        clients={clients}
      />
    </main>
  );
}

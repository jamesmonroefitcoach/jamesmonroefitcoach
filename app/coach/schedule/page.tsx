import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek, startOfWeek } from "@/lib/data";
import ScheduleGrid from "./schedule-grid";

export default async function SchedulePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const weekStart = startOfWeek(new Date());
  const appts = await listAppointmentsForWeek(user.id, weekStart);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Schedule</h1>
          <p className="meta">Drag blocks to reschedule. Each move bumps the change counter on that appointment.</p>
        </div>
      </header>
      <hr className="divider" />
      <ScheduleGrid weekStart={weekStart.toISOString()} initialAppts={appts} />
    </main>
  );
}

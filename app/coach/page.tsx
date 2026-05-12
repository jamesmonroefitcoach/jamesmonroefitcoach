import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  listClients, listAppointmentsForWeek, listAppointmentsForMonth,
  countOpenRequests, listCoachThreads, startOfWeek,
} from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import DashboardClient from "./dashboard-client";

export default async function CoachDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const now = Date.now();
  const weekStart = startOfWeek(new Date());
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [clients, appts, monthAppts, openReq, threads] = await Promise.all([
    listClients(user.id),
    listAppointmentsForWeek(user.id),
    listAppointmentsForMonth(user.id, monthStart),
    countOpenRequests(user.id),
    listCoachThreads(user.id),
  ]);

  // Build client program info map (used in session table)
  const clientProgramInfo = new Map<string, { endsOn: string | null; daysLeft: number | null; name: string | null }>();
  for (const c of clients) {
    const current = pastProgramsForClient(c.id).find(
      (p) => p.is_current && p.program_kind === "at_home"
    ) ?? null;
    const daysLeft = current?.ends_on
      ? Math.ceil((new Date(current.ends_on).getTime() - now) / 86400000)
      : null;
    clientProgramInfo.set(c.id, {
      endsOn: current?.ends_on ?? null,
      daysLeft,
      name: current?.name ?? null,
    });
  }

  return (
    <main className="shell">
      <header className="page-hdr">
        <div>
          <span className="badge">Coach Dashboard</span>
          <h1 style={{ marginTop: "0.5rem" }}>Dashboard</h1>
          <p className="meta">Hi {user.name.split(" ")[0]} — here&apos;s what&apos;s on the floor.</p>
        </div>
      </header>

      <hr className="divider" />

      <DashboardClient
        clients={clients}
        initialWeekAppts={appts}
        monthAppts={monthAppts}
        openReq={openReq}
        threads={threads}
        baseWeekStart={weekStart}
        clientProgramInfo={clientProgramInfo}
      />
    </main>
  );
}

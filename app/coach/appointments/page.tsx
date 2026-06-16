import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek, listAppointmentsForMonth, startOfWeek, listChangeRequestHistory } from "@/lib/data";
import AppointmentsClient from "./appointments-client";
import ScheduleTabs from "../schedule/schedule-tabs";
import { listConsultationRequests } from "@/app/consult/actions";
import ConsultationRequestsPanel from "./consultation-requests-panel";
import CancellationBacklog from "./cancellation-backlog";

export default async function AppointmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const weekStart = startOfWeek(new Date());
  const thisMonth = new Date();
  const prevMonth = new Date();
  prevMonth.setMonth(prevMonth.getMonth() - 1);

  const [week, monthA, monthB, history, consults] = await Promise.all([
    listAppointmentsForWeek(user.id, weekStart),
    listAppointmentsForMonth(user.id, prevMonth),
    listAppointmentsForMonth(user.id, thisMonth),
    listChangeRequestHistory(user.id),
    listConsultationRequests(),
  ]);

  const seen = new Set<string>();
  const all = [...week, ...monthA, ...monthB].filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return (
    <>
    <ScheduleTabs />
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Appointments</h1>
        <p className="meta">Approve change requests, mark completed/no-show, and review history.</p>
      </header>
      <hr className="divider" />
      <ConsultationRequestsPanel initial={consults} />
      <CancellationBacklog appointments={all} />
      <AppointmentsClient initial={all} history={history} />
    </main>
    </>
  );
}

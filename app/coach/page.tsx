import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  listClients, listAppointmentsForWeek, listAppointmentsForMonth,
  countOpenRequests, listCoachThreads, startOfWeek,
  getAllTimeSessionStats,
} from "@/lib/data";
import { listSlotOffers } from "./availability/data";
import { pastProgramsForClient } from "@/lib/programs";
import { listAllTestimonials } from "@/app/testimonials/actions";
import { listConsultationRequests } from "@/app/consult/actions";
import DashboardClient from "./dashboard-client";

export default async function CoachDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const now = Date.now();
  const weekStart = startOfWeek(new Date());
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [clients, appts, monthAppts, openReq, threads, slotOffers, allTimeStats, allTestimonials, consultReqs] = await Promise.all([
    listClients(user.id),
    listAppointmentsForWeek(user.id),
    listAppointmentsForMonth(user.id, monthStart),
    countOpenRequests(user.id),
    listCoachThreads(user.id),
    listSlotOffers(user.id),
    getAllTimeSessionStats(user.id),
    listAllTestimonials(),
    listConsultationRequests(),
  ]);

  const newTestimonials = allTestimonials
    .filter((t) => t.status === "new")
    .map((t) => ({
      id: t.id,
      name: t.display_name || t.submitted_name,
      created_at: t.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const newConsultRequests = consultReqs
    .filter((c) => c.status === "new")
    .map((c) => ({
      id: c.id,
      name: c.name,
      created_at: c.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Inbox feeds — change-requested appointments + claimed slot offers
  const seenIds = new Set<string>();
  const allAppts = [...appts, ...monthAppts].filter((a) => {
    if (seenIds.has(a.id)) return false;
    seenIds.add(a.id);
    return true;
  });
  const clientNameById = new Map(clients.map((c) => [c.id, c.full_name]));
  const changeRequests = allAppts
    .filter((a) => a.status === "change_requested")
    .map((a) => ({
      id: a.id,
      client_name: a.client_name ?? (a.client_id ? clientNameById.get(a.client_id) ?? null : null),
      starts_at: a.starts_at,
      requested_starts_at: a.requested_starts_at ?? null,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const claimedSlots = slotOffers
    .filter((s) => s.status === "claimed" && !!s.claimed_at)
    .map((s) => ({
      id: s.id,
      starts_at: s.starts_at,
      claimed_by_name: s.claimed_by ? clientNameById.get(s.claimed_by) ?? null : null,
      claimed_at: s.claimed_at,
    }))
    .sort((a, b) => (a.claimed_at ?? "").localeCompare(b.claimed_at ?? ""));

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
        changeRequests={changeRequests}
        claimedSlots={claimedSlots}
        newTestimonials={newTestimonials}
        newConsultRequests={newConsultRequests}
        baseWeekStart={weekStart}
        clientProgramInfo={clientProgramInfo}
        allTimeStats={allTimeStats}
      />
    </main>
  );
}

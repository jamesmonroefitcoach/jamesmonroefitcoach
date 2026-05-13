import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForWeek, listAppointmentsForClient, startOfWeek } from "@/lib/data";
import { pastProgramsForClient, type PastProgramFull, PROGRAM_KIND_LABEL, CATEGORY_LABELS, type Category } from "@/lib/programs";
import { fmtDate } from "@/lib/format";
import ViewProgramsClient from "./view-programs-client";

export type ClientProgramBlock = {
  clientId: string;
  clientName: string;
  active: {
    sessions: PastProgramFull | null;       // current in_gym
    sessionsStatus: "draft" | "published" | "none";
    program: PastProgramFull | null;        // current at_home
    programStatus: "draft" | "published" | "none";
  };
  // Next upcoming session — surfaced on the subtext line
  nextSession: {
    id: string;
    starts_at: string;
    status: "Programmed" | "Drafted" | "Not Programmed";
  } | null;
  scheduledThisMonth: number;
  upcomingSessions: {
    id: string;
    starts_at: string;
    program_status: "programmed" | "draft" | "needs_programming" | "n/a";
    session_program_id: string | null;
  }[];
  historicalPrograms: PastProgramFull[];    // past at_home programs
  historicalSessions: {                      // past in_gym sessions (appointments) — grouped by month
    id: string;
    starts_at: string;
    program_status: "programmed" | "draft" | "needs_programming" | "n/a";
    session_program_id: string | null;
  }[];
};

export default async function ProgrammingLandingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const clients = await listClients(user.id);
  const activeClients = clients.filter((c) => c.lifecycle === "active" || c.lifecycle === "online");

  // Fetch each client's appointments + programs in parallel
  const blocks: ClientProgramBlock[] = await Promise.all(activeClients.map(async (c) => {
    const [appts, programs] = await Promise.all([
      listAppointmentsForClient(c.id),
      Promise.resolve(pastProgramsForClient(c.id)),
    ]);
    const sessions = programs.find((p) => p.is_current && p.program_kind === "in_gym") ?? null;
    const program = programs.find((p) => p.is_current && p.program_kind === "at_home") ?? null;
    const historicalPrograms = programs.filter((p) => !p.is_current && p.program_kind === "at_home");
    const now = Date.now();
    const sessionAppts = appts.filter((a) => a.session_type === "session" && a.client_id === c.id);
    const upcomingSessions = sessionAppts
      .filter((a) => new Date(a.starts_at).getTime() >= now && a.status !== "cancelled" && a.status !== "no_show")
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((a) => ({
        id: a.id,
        starts_at: a.starts_at,
        program_status: a.program_status,
        session_program_id: a.session_program_id ?? null,
      }));
    const historicalSessions = sessionAppts
      .filter((a) => new Date(a.starts_at).getTime() < now)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .map((a) => ({
        id: a.id,
        starts_at: a.starts_at,
        program_status: a.program_status,
        session_program_id: a.session_program_id ?? null,
      }));

    // Next-session metadata for the subtext line: the earliest upcoming
    // appointment + its program_status mapped to the display label.
    const next = upcomingSessions[0] ?? null;
    const statusLabel = (s: "programmed" | "draft" | "needs_programming" | "n/a"): "Programmed" | "Drafted" | "Not Programmed" =>
      s === "programmed" ? "Programmed" : s === "draft" ? "Drafted" : "Not Programmed";
    const nextSession = next ? { id: next.id, starts_at: next.starts_at, status: statusLabel(next.program_status) } : null;
    // Sessions scheduled this calendar month (any status except cancelled / no_show)
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
    const scheduledThisMonth = sessionAppts.filter((a) => {
      const t = new Date(a.starts_at).getTime();
      return t >= monthStart.getTime() && t < monthEnd.getTime()
        && a.status !== "cancelled" && a.status !== "no_show";
    }).length;

    return {
      clientId: c.id,
      clientName: c.full_name,
      active: {
        sessions,
        sessionsStatus: sessions ? "published" as const : "none" as const,
        program,
        programStatus: program ? "published" as const : "none" as const,
      },
      nextSession,
      scheduledThisMonth,
      upcomingSessions,
      historicalPrograms,
      historicalSessions,
    };
  }));

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>View Programs</h1>
        <p className="meta">Active programs, upcoming sessions, and historicals — by client.</p>
      </header>
      <hr className="divider" />
      <ViewProgramsClient blocks={blocks} />
    </main>
  );
}

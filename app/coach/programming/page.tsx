import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForWeek, listAppointmentsForClient, startOfWeek, listProgramsForClient, type ClientProgramRow } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import ViewProgramsClient from "./view-programs-client";

export type RecentDraft = {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  created_at: string;
  program_kind: "in_gym" | "at_home";
  build_format: "in_app" | "template";
};

export type ClientProgramBlock = {
  clientId: string;
  clientName: string;
  needsAtHomeProgramming: boolean;          // true when coach has hit + on the roster
  active: {
    sessions: ClientProgramRow | null;       // current in_gym
    sessionsStatus: "draft" | "published" | "none";
    program: ClientProgramRow | null;        // current at_home
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
    /** True when the linked program is paired with a PDF-kind workout_sheet. */
    is_pdf?: boolean;
    /** True when the linked program was built by the client themselves. */
    is_client_made?: boolean;
  }[];
  historicalPrograms: ClientProgramRow[];    // past at_home programs
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
      listProgramsForClient(c.id),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const sessions = programs.find((p) => p.is_current && p.program_kind === "in_gym" && (!p.ends_on || p.ends_on >= today)) ?? null;
    const program = programs.find((p) => p.is_current && p.program_kind === "at_home" && (!p.ends_on || p.ends_on >= today)) ?? null;
    const historicalPrograms = programs.filter((p) => p.program_kind === "at_home" && (!p.is_current || (p.ends_on && p.ends_on < today)));
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
      needsAtHomeProgramming: c.needs_at_home_programming,
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

  // Tag upcoming sessions whose linked program is paired with a PDF sheet, so
  // the Upcoming-this-week list can show a "PDF" pill next to the row.
  if (hasSupabaseEnv()) {
    const programIds = Array.from(
      new Set(
        blocks
          .flatMap((b) => b.upcomingSessions.map((s) => s.session_program_id))
          .filter((x): x is string => !!x)
      )
    );
    if (programIds.length) {
      const { data: progs } = await createSupabaseAdmin()
        .from("programs")
        .select("id, created_by_client, workout_sheets:workout_sheet_id ( kind )")
        .in("id", programIds);
      const pdfProgramIds = new Set<string>();
      const clientMadeProgramIds = new Set<string>();
      (progs ?? []).forEach((p: unknown) => {
        const r = p as {
          id?: string;
          created_by_client?: boolean | null;
          workout_sheets?: { kind: "app" | "pdf" } | { kind: "app" | "pdf" }[] | null;
        };
        if (!r.id) return;
        const ws = r.workout_sheets;
        const kind = Array.isArray(ws) ? ws[0]?.kind : ws?.kind;
        if (kind === "pdf") pdfProgramIds.add(r.id);
        if (r.created_by_client) clientMadeProgramIds.add(r.id);
      });
      for (const b of blocks) {
        for (const s of b.upcomingSessions) {
          if (!s.session_program_id) continue;
          if (pdfProgramIds.has(s.session_program_id)) s.is_pdf = true;
          if (clientMadeProgramIds.has(s.session_program_id)) s.is_client_made = true;
        }
      }
    }
  }

  // Recently saved / drafted programs — surfaced at the top of Programs so
  // James can jump back into in-progress work (and as the home for the queue
  // that used to live only in the Build lobby).
  const clientNameById = new Map(clients.map((c) => [c.id, c.full_name]));
  let recentDrafts: RecentDraft[] = [];
  if (hasSupabaseEnv()) {
    const { data } = await createSupabaseAdmin()
      .from("programs")
      .select("id, name, client_id, created_at, program_kind, build_format")
      .eq("coach_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    recentDrafts = (data ?? []).map((p: { id: string; name: string; client_id: string; created_at: string; program_kind: "in_gym" | "at_home"; build_format: string | null }) => ({
      id: p.id,
      name: p.name,
      client_id: p.client_id,
      client_name: clientNameById.get(p.client_id) ?? "—",
      created_at: p.created_at,
      program_kind: p.program_kind,
      build_format: p.build_format === "template" ? "template" : "in_app",
    }));
  }

  const clientPicker = activeClients
    .filter((c) => !!c.full_name)
    .map((c) => ({ id: c.id, full_name: c.full_name, flagged: c.needs_at_home_programming }));

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Programs</h1>
        <p className="meta">Active programs, upcoming sessions, and historicals — by client.</p>
      </header>
      <hr className="divider" />
      <ViewProgramsClient blocks={blocks} clients={clientPicker} recentDrafts={recentDrafts} />
    </main>
  );
}

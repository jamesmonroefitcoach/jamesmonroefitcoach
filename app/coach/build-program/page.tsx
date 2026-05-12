import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForClient, listAppointmentsForWeek, listMovements, startOfWeek } from "@/lib/data";
import BuildProgramClient from "./build-program-client";
import { pastProgramsForClient, type ProgramKind } from "@/lib/programs";

export type ClientProgramItem = {
  clientId: string;
  clientName: string;
  programName: string | null;
  endsOn: string | null;
  daysUntilEnd: number | null;  // negative = already expired, null = no end date
  hasCurrent: boolean;
};

export default async function BuildProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; appt?: string; type?: string; tab?: string; starts?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const [clients, dbMovements] = await Promise.all([
    listClients(user.id),
    listMovements(),
  ]);

  const initialClientId = sp.client ?? clients[0]?.id ?? "";
  const initialApptId = sp.appt ?? "";
  // starts param is the appointment's starts_at — used as title fallback
  const initialStartsAt = sp.starts ?? "";
  // tab=session|program takes precedence; appt param implies session tab
  const tabParam = sp.tab ?? sp.type ?? "";
  const initialType: ProgramKind =
    sp.appt || tabParam === "session" ? "in_gym"
    : tabParam === "program" || tabParam === "at_home" ? "at_home"
    : "in_gym";

  const now = new Date().toISOString();

  // Initial appointments for the pre-selected client (for the Select Session dropdown)
  const rawAppts = initialClientId ? await listAppointmentsForClient(initialClientId) : [];
  const initialAppts = rawAppts
    .filter((a) =>
      a.session_type === "session" && (
        // Always include the appointment we're specifically linking to (even if past or completed)
        a.id === initialApptId ||
        ((a.status === "scheduled" || a.status === "change_requested") && a.starts_at >= now)
      )
    )
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      status: a.status,
      program_status: a.program_status ?? "needs_programming"
    }));

  // All sessions this week — for the Session tab banner
  const weekAppts = await listAppointmentsForWeek(user.id, startOfWeek(new Date()));
  const weekSessions = weekAppts
    .filter((a) =>
      a.session_type === "session" &&
      a.status !== "cancelled" &&
      a.status !== "no_show" &&
      a.client_id !== null
    )
    .map((a) => ({
      id: a.id,
      client_id: a.client_id!,
      client_name: a.client_name,
      starts_at: a.starts_at,
      is_programmed: a.program_status === "programmed" || !!a.session_program_id
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // Active client program summary — for the Program tab banner
  const activeClients = clients.filter((c) => c.lifecycle === "active");
  const clientProgramSummary: ClientProgramItem[] = activeClients.map((c) => {
    const current = pastProgramsForClient(c.id).find(
      (p) => p.is_current && p.program_kind === "at_home"
    ) ?? null;
    const daysUntilEnd = current?.ends_on
      ? Math.ceil((new Date(current.ends_on).getTime() - Date.now()) / 86400000)
      : null;
    return {
      clientId: c.id,
      clientName: c.full_name,
      programName: current?.name ?? null,
      endsOn: current?.ends_on ?? null,
      daysUntilEnd,
      hasCurrent: !!current,
    };
  });

  return (
    <main className="shell">
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Build a program</h1>
        <p className="meta">Pick a client. Build the day. Add movements with sets, reps, weight, equipment, and demo links. Print for the floor.</p>
      </header>
      <hr className="divider" />
      <BuildProgramClient
        clients={clients}
        initialClientId={initialClientId}
        initialAppts={initialAppts}
        initialApptId={initialApptId}
        initialStartsAt={initialStartsAt}
        initialType={initialType}
        weekSessions={weekSessions}
        clientProgramSummary={clientProgramSummary}
        dbMovements={dbMovements}
      />
    </main>
  );
}

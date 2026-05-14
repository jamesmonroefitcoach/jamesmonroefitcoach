import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listMovements } from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import type { ClientProgramItem } from "../page";
// page.tsx for /coach/programming/build defines ClientProgramItem.
import ProgramsReworkClient from "./programs-rework-client";

export default async function ProgramsReworkPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const clients = await listClients(user.id);
  const libraryMovements = await listMovements();
  const initialClientId = sp.client ?? clients.filter((c) => c.needs_at_home_programming)[0]?.id ?? clients[0]?.id ?? "";

  // Same banner data the existing Program tab uses, filtered to clients
  // that have been flagged via the + on the Client Roster.
  const flaggedClients = clients.filter((c) => c.lifecycle === "active" && c.needs_at_home_programming);
  const clientProgramSummary: ClientProgramItem[] = flaggedClients.map((c) => {
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
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print">
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Build Program</h1>
        <p className="meta">Programs Rework — work in progress. Sandboxed in this browser; nothing here saves to Supabase yet.</p>
      </header>
      <hr className="divider no-print" />
      <ProgramsReworkClient
        clients={clients}
        initialClientId={initialClientId}
        libraryMovements={libraryMovements}
        clientProgramSummary={clientProgramSummary}
      />
    </main>
  );
}

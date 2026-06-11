import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForClient, listMovements } from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import type { ClientProgramItem } from "../page";
import NewWayClient from "./new-way-client";

// New Way — the unified Build sub-tab. Lobby (Step 1 client → Step 2 build
// type → Step 3 pick entity or new) → workspace with an In App | Template
// toggle that switches between the structured WIP builder and the
// interactive workout sheet for the same program. Both views save through
// the program↔sheet bridge so editing one updates the other.
export default async function NewWayPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: "session" | "program";
    client?: string;
    appt?: string;
    starts?: string;
    program?: string;
    view?: "inapp" | "template";
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const type: "session" | "program" = sp.type === "program" ? "program" : "session";

  const clients = await listClients(user.id);
  const libraryMovements = await listMovements();

  // ── Session-mode initial data ──
  const initialClientId =
    sp.client ??
    (type === "program"
      ? clients.filter((c) => c.needs_at_home_programming)[0]?.id ?? clients[0]?.id ?? ""
      : clients[0]?.id ?? "");
  const initialApptId = sp.appt ?? "";
  const initialStartsAt = sp.starts ?? "";

  const now = new Date().toISOString();
  const rawAppts = initialClientId ? await listAppointmentsForClient(initialClientId) : [];
  const initialAppts = rawAppts
    .filter(
      (a) =>
        a.session_type === "session" &&
        (a.id === initialApptId ||
          ((a.status === "scheduled" || a.status === "change_requested") && a.starts_at >= now))
    )
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      status: a.status,
      program_status: a.program_status,
      session_program_id: a.session_program_id ?? null,
    }));

  // ── Program-mode initial data ──
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
    <NewWayClient
      user={{ id: user.id, name: user.name, role: user.role }}
      initialType={type}
      clients={clients}
      libraryMovements={libraryMovements}
      initialClientId={initialClientId}
      initialAppts={initialAppts}
      initialApptId={initialApptId}
      initialStartsAt={initialStartsAt}
      initialProgramId={sp.program ?? ""}
      initialView={sp.view === "template" ? "template" : "inapp"}
      clientProgramSummary={clientProgramSummary}
    />
  );
}

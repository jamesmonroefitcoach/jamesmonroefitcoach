import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForClient, listMovements } from "@/lib/data";
import ReworkClient from "./rework-client";

export default async function ReworkPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; appt?: string; starts?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const clients = await listClients(user.id);
  const libraryMovements = await listMovements();

  const initialClientId = sp.client ?? clients[0]?.id ?? "";
  const initialApptId = sp.appt ?? "";
  const initialStartsAt = sp.starts ?? "";

  const now = new Date().toISOString();
  const rawAppts = initialClientId ? await listAppointmentsForClient(initialClientId) : [];
  const initialAppts = rawAppts
    .filter((a) =>
      a.session_type === "session" && (
        a.id === initialApptId ||
        ((a.status === "scheduled" || a.status === "change_requested") && a.starts_at >= now)
      )
    )
    .map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      status: a.status,
      program_status: (a.program_status ?? (a.session_program_id ? "draft" : "needs_programming")) as
        "programmed" | "draft" | "needs_programming" | "n/a",
      session_program_id: a.session_program_id ?? null,
    }));

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print">
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Build Program</h1>
        <p className="meta">Sessions Rework — work in progress. Sandboxed in this browser; nothing here saves to Supabase yet.</p>
      </header>
      <hr className="divider no-print" />
      <ReworkClient
        clients={clients}
        initialClientId={initialClientId}
        initialAppts={initialAppts}
        initialApptId={initialApptId}
        initialStartsAt={initialStartsAt}
        libraryMovements={libraryMovements}
      />
    </main>
  );
}

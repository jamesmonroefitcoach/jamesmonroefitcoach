import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients, listMovements } from "@/lib/data";
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
      />
    </main>
  );
}

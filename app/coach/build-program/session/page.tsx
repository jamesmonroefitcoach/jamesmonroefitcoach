import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient } from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import SessionProgramClient from "./session-program-client";

export default async function SessionProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ appt?: string; client?: string; starts?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const clientId = sp.client ?? "";
  const apptId = sp.appt ?? "";
  const startsAt = sp.starts ? decodeURIComponent(sp.starts) : "";

  const client = clientId ? await getClient(clientId) : null;
  const pastPrograms = clientId ? pastProgramsForClient(clientId) : [];

  const sessionLabel = startsAt
    ? new Date(startsAt).toLocaleString("en-US", {
        weekday: "long", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : "Unscheduled session";

  return (
    <main className="shell">
      <Link href="/coach/schedule" className="meta">← Back to schedule</Link>
      <header style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Session Program</span>
          <h1 style={{ marginTop: "0.5rem" }}>{sessionLabel}</h1>
          <p className="meta">{client?.full_name ?? "No client"}{client?.injuries ? <span style={{ color: "var(--red)", marginLeft: "0.5rem" }}>⚠ {client.injuries}</span> : null}</p>
        </div>
      </header>
      <hr className="divider" />
      <SessionProgramClient
        clientId={clientId}
        apptId={apptId}
        startsAt={startsAt}
        client={client}
        pastPrograms={pastPrograms}
      />
    </main>
  );
}

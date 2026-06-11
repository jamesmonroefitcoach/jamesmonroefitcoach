import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient } from "@/lib/data";
import {
  listCheckInsForClient,
  getCheckInCadenceDays,
  calcCadenceStatus,
} from "@/lib/check-ins";
import CheckInForm from "../../../../client/check-ins/check-in-form";
import CheckInsList from "../../../../client/check-ins/check-ins-list";
import CadenceBanner from "../../../../client/check-ins/cadence-banner";

// Coach-side check-ins log for a specific client. Same list as the client
// sees, plus a form to submit a check-in on their behalf (for clients
// without an account — James enters the data from a paper / verbal
// check-in).
export default async function CoachClientCheckInsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const [checkIns, cadenceDays] = await Promise.all([
    listCheckInsForClient(id),
    getCheckInCadenceDays(id),
  ]);
  const status = calcCadenceStatus(checkIns, cadenceDays);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <span className="badge">Check-ins</span>
          <h1 style={{ marginTop: "0.5rem" }}>{client.full_name}</h1>
          <p className="meta">Cadence: every {cadenceDays} days.</p>
        </div>
        <Link className="btn btn-ghost" href={`/coach/clients/${id}`}>← Back to profile</Link>
      </header>
      <hr className="divider" />

      <CadenceBanner status={status} />

      <details
        open={status.overdueDays >= 0 || checkIns.length === 0}
        style={{ marginBottom: "1.5rem" }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontFamily: "Oswald, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "var(--ink)",
            padding: "0.5rem 0.6rem",
            background: "rgba(0,0,0,0.025)",
            border: "1px solid var(--line)",
            borderRadius: 5,
          }}
        >
          Submit on behalf of {client.full_name.split(" ")[0]}
        </summary>
        <div style={{ marginTop: "0.6rem" }}>
          <CheckInForm forClientId={id} allowBackdate />
        </div>
      </details>

      <CheckInsList checkIns={checkIns} />
    </main>
  );
}

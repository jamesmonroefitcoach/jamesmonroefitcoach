import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  listCheckInsForClient,
  getCheckInCadenceDays,
  calcCadenceStatus,
} from "@/lib/check-ins";
import CheckInForm from "./check-in-form";
import CheckInsList from "./check-ins-list";
import CadenceBanner from "./cadence-banner";
import SessionFollowups from "./session-followups";

export default async function ClientCheckInsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const [checkIns, cadenceDays] = await Promise.all([
    listCheckInsForClient(user.id),
    getCheckInCadenceDays(user.id),
  ]);
  const status = calcCadenceStatus(checkIns, cadenceDays);

  return (
    <main className="shell">
      <header>
        <span className="badge">Check-in</span>
        <h1 style={{ marginTop: "0.5rem" }}>How are things going?</h1>
        <p className="meta">
          James checks in with you every {cadenceDays} days. You can submit any time you want —
          even if you&rsquo;re not due — and back-date it if you forgot.
        </p>
      </header>
      <hr className="divider" />

      <CadenceBanner status={status} />

      <SessionFollowups clientId={user.id} />

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
          Submit a new check-in
        </summary>
        <div style={{ marginTop: "0.6rem" }}>
          <CheckInForm allowBackdate />
        </div>
      </details>

      <CheckInsList checkIns={checkIns} />
    </main>
  );
}

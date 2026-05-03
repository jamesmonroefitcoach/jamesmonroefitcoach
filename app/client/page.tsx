import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForClient, getClient } from "@/lib/data";
import { fmtMoney } from "@/lib/format";

export default async function ClientHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const me = await getClient(user.id);
  const appts = await listAppointmentsForClient(user.id);
  const upcoming = appts.filter((a) => new Date(a.starts_at) >= new Date());

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">My Portal</span>
          <h1 style={{ marginTop: "0.5rem" }}>Hi {user.name.split(" ")[0]}</h1>
          <p className="meta">{me?.goals ? `Working toward: ${me.goals}` : "Welcome to Monroe Fit Coach."}</p>
        </div>
        <Link className="btn btn-primary" href="/client/check-ins">Submit check-in</Link>
      </header>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <div className="stat">
          <div className="stat-label">Cadence</div>
          <div className="stat-value">{me?.regular_frequency ?? "—"}</div>
          <div className="stat-sub">sessions / week</div>
        </div>
        <div className="stat">
          <div className="stat-label">Current weight</div>
          <div className="stat-value">{me?.current_weight_lb ?? "—"}</div>
          <div className="stat-sub">{me?.goal_weight_lb ? `goal ${me.goal_weight_lb} lb` : "no goal set"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Balance</div>
          <div className="stat-value" style={{ color: (me?.balance_owed ?? 0) > 0 ? "var(--red)" : "var(--sage)" }}>{fmtMoney(me?.balance_owed)}</div>
          <div className="stat-sub">{(me?.balance_owed ?? 0) > 0 ? "due — see invoices" : "all caught up"}</div>
        </div>
      </section>

      <hr className="divider" />

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Upcoming sessions</h2>
          <Link href="/client/check-ins" className="meta">Check-in →</Link>
        </div>
        <hr className="divider" />
        {upcoming.length === 0 ? (
          <p className="meta">No upcoming sessions yet. James will publish your week soon.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            {upcoming.map((a) => (
              <li key={a.id} className="day-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{new Date(a.starts_at).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong>
                    <p className="meta" style={{ margin: "0.25rem 0 0" }}>Hyde Park Gym · 60 min</p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn btn-ghost" style={{ padding: "0.4rem 0.7rem", fontSize: "0.75rem" }}>Request change</button>
                    <Link className="btn" href="/client/program" style={{ padding: "0.4rem 0.7rem", fontSize: "0.75rem" }}>See program</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

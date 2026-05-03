import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listClients, listAppointmentsForWeek, countOpenRequests, listCoachThreads, startOfWeek } from "@/lib/data";
import { fmtMoney } from "@/lib/format";

export default async function CoachDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const [clients, appts, openReq, threads] = await Promise.all([
    listClients(user.id),
    listAppointmentsForWeek(user.id),
    countOpenRequests(user.id),
    listCoachThreads(user.id)
  ]);

  const hours = appts.reduce((acc, a) => {
    const ms = new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime();
    return acc + ms / (1000 * 60 * 60);
  }, 0);
  const dollars = appts.reduce((acc, a) => acc + (a.rate ?? 0), 0);
  const weekStart = startOfWeek(new Date());
  const weekStartLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Coach Dashboard</span>
          <h1 style={{ marginTop: "0.5rem" }}>Week of {weekStartLabel}</h1>
          <p className="meta">Hi {user.name.split(" ")[0]} — here's what's on the floor.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn btn-ghost" href="/coach/build-program">Build program</Link>
          <Link className="btn btn-primary" href="/coach/schedule">Open schedule</Link>
        </div>
      </header>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="stat">
          <div className="stat-label">Hours this week</div>
          <div className="stat-value">{hours.toFixed(1)}</div>
          <div className="stat-sub">{appts.length} sessions booked</div>
        </div>
        <div className="stat">
          <div className="stat-label">Revenue this week</div>
          <div className="stat-value">{fmtMoney(dollars)}</div>
          <div className="stat-sub">at booked rates</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total clients</div>
          <div className="stat-value">{clients.length}</div>
          <div className="stat-sub">{clients.filter((c) => c.balance_owed > 0).length} with balance</div>
        </div>
        <div className="stat">
          <div className="stat-label">Open requests</div>
          <div className="stat-value" style={{ color: openReq > 0 ? "var(--rust)" : undefined }}>{openReq}</div>
          <div className="stat-sub">change requests + DMs</div>
        </div>
      </section>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.25rem" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>This week</h2>
            <Link href="/coach/schedule" className="meta">Full schedule →</Link>
          </div>
          <hr className="divider" />
          {appts.length === 0 ? (
            <p className="meta">No sessions booked yet this week.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>When</th><th>Client</th><th>Rate</th><th>Status</th></tr>
              </thead>
              <tbody>
                {appts.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}<br /><span className="meta">{new Date(a.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></td>
                    <td>{a.client_name}</td>
                    <td>{fmtMoney(a.rate)}</td>
                    <td>
                      {a.change_count > 0 ? <span className="badge badge-amber">{a.change_count}× changed</span> : <span className="badge">{a.status}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Inbox</h2>
            <Link href="/coach/messages" className="meta">All →</Link>
          </div>
          <hr className="divider" />
          {threads.length === 0 ? (
            <p className="meta">No messages.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {threads.slice(0, 6).map((t) => (
                <li key={t.id} style={{ borderLeft: t.unread ? "3px solid var(--rust)" : "3px solid transparent", paddingLeft: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{t.client_name}</strong>
                    <span className="meta">{t.last_at ? new Date(t.last_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                  </div>
                  <p style={{ margin: 0 }} className="meta">{t.last_message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

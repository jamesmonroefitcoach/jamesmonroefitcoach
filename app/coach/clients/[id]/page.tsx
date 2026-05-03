import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getClient, listAppointmentsForClient } from "@/lib/data";
import { fmtMoney, fmtDate } from "@/lib/format";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin") redirect("/");

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const appts = await listAppointmentsForClient(id);
  const past = appts.filter((a) => new Date(a.starts_at) < new Date());
  const upcoming = appts.filter((a) => new Date(a.starts_at) >= new Date());

  return (
    <main className="shell">
      <Link href="/coach/clients" className="meta">← All clients</Link>
      <header style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Client</span>
          <h1 style={{ marginTop: "0.5rem" }}>{client.full_name}</h1>
          <p className="meta">
            {client.tier?.replace("_", " ") ?? "—"}
            {client.member_since ? ` · member since ${fmtDate(client.member_since)}` : ""}
            {client.email ? ` · ${client.email}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn btn-ghost" href={`/coach/messages?client=${client.id}`}>Message</Link>
          <Link className="btn btn-primary" href={`/coach/build-program?client=${client.id}`}>New program</Link>
        </div>
      </header>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <div className="stat">
          <div className="stat-label">Cadence</div>
          <div className="stat-value">{client.regular_frequency ?? "—"}</div>
          <div className="stat-sub">sessions / week</div>
        </div>
        <div className="stat">
          <div className="stat-label">Current rate</div>
          <div className="stat-value">{fmtMoney(client.session_rate)}</div>
          <div className="stat-sub">{client.test_rate && client.session_rate && client.test_rate > client.session_rate ? `target ${fmtMoney(client.test_rate)}` : "no rate change"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Weight</div>
          <div className="stat-value">{client.current_weight_lb ?? "—"}</div>
          <div className="stat-sub">{client.goal_weight_lb ? `goal ${client.goal_weight_lb}` : "no goal weight"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Owed</div>
          <div className="stat-value" style={{ color: client.balance_owed > 0 ? "var(--red)" : undefined }}>{fmtMoney(client.balance_owed)}</div>
          <div className="stat-sub">{client.balance_owed > 0 ? "open invoices" : "all paid"}</div>
        </div>
      </section>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div className="card">
          <h2>Goals & profile</h2>
          <hr className="divider" />
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.4rem 1rem", margin: 0 }}>
            <dt className="meta">Goals</dt><dd>{client.goals ?? "—"}</dd>
            <dt className="meta">Age</dt><dd>{client.age_category ?? "—"}</dd>
            <dt className="meta">Status</dt><dd>{client.status ?? "—"}</dd>
            <dt className="meta">Frequency</dt><dd>{client.regular_frequency ?? "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <h2>Check-ins</h2>
          <hr className="divider" />
          <p className="meta">No check-ins submitted yet. Cadence: every 14 days.</p>
          <Link className="btn btn-ghost" href={`/coach/clients/${client.id}/check-ins`}>Open check-in log →</Link>
        </div>
      </section>

      <hr className="divider" />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div className="card">
          <h2>Upcoming sessions</h2>
          <hr className="divider" />
          {upcoming.length === 0 ? <p className="meta">No upcoming sessions.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {upcoming.map((a) => (
                <li key={a.id} className="day-card">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong>
                    <span className="badge">{a.status}</span>
                  </div>
                  <p className="meta" style={{ margin: "0.25rem 0 0" }}>{fmtMoney(a.rate)} · {a.paid ? "paid" : <span style={{ color: "var(--red)" }}>unpaid</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2>Past sessions</h2>
          <hr className="divider" />
          {past.length === 0 ? <p className="meta">No past sessions on record.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {past.slice(-8).reverse().map((a) => (
                <li key={a.id} className="day-card">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{new Date(a.starts_at).toLocaleString("en-US", { month: "short", day: "numeric" })}</strong>
                    <Link href={`/coach/sessions/${a.id}`} className="meta">see program →</Link>
                  </div>
                  <p style={{ margin: "0.25rem 0 0" }}>{a.notes ?? <span className="meta">no notes</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

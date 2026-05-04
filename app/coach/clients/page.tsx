import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";
import { currentProgramForClient, isExpiringSoon } from "@/lib/programs";
import { fmtMoney, fmtDate } from "@/lib/format";

export default async function ClientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin") redirect("/");

  const clients = await listClients(user.role === "coach" ? user.id : undefined);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Clients</span>
          <h1 style={{ marginTop: "0.5rem" }}>Roster</h1>
          <p className="meta">{clients.length} active clients</p>
        </div>
        <Link className="btn btn-primary" href="/admin">Add client →</Link>
      </header>

      <hr className="divider" />

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Goal</th>
              <th>Cadence</th>
              <th>Rate</th>
              <th>Test rate</th>
              <th>Monthly</th>
              <th>Member since</th>
              <th>Last program</th>
              <th>Time frame</th>
              <th>Owed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const prog = currentProgramForClient(c.id);
              const expiring = prog ? isExpiringSoon(prog) : false;
              return (
                <tr key={c.id}>
                  <td><strong>{c.full_name}</strong>{c.tier ? <><br /><span className="meta">{c.tier.replace("_", " ")}</span></> : null}</td>
                  <td className="meta">{c.goals ?? "—"}</td>
                  <td>{c.regular_frequency ?? "—"}</td>
                  <td>{fmtMoney(c.session_rate)}</td>
                  <td style={{ color: c.test_rate && c.session_rate && c.test_rate > c.session_rate ? "var(--rust)" : undefined }}>{fmtMoney(c.test_rate)}</td>
                  <td>{fmtMoney(c.monthly_revenue)}</td>
                  <td>{fmtDate(c.member_since)}</td>
                  <td>
                    {prog ? (
                      <>
                        <div>{fmtDate(prog.starts_on)}</div>
                        <div className="meta" style={{ fontSize: "0.74rem" }}>{prog.name}</div>
                      </>
                    ) : <span className="meta">none</span>}
                  </td>
                  <td>
                    {prog ? (
                      <>
                        <div>{prog.duration_weeks ?? "—"} wk</div>
                        <div className={expiring ? "" : "meta"} style={{ fontSize: "0.74rem", color: expiring ? "var(--red)" : undefined, fontWeight: expiring ? 700 : 400 }}>
                          {expiring ? `expires ${fmtDate(prog.ends_on)}` : `ends ${fmtDate(prog.ends_on)}`}
                        </div>
                      </>
                    ) : <span className="meta">—</span>}
                  </td>
                  <td>{c.balance_owed > 0 ? <span className="badge badge-red">{fmtMoney(c.balance_owed)}</span> : <span className="meta">—</span>}</td>
                  <td><Link href={`/coach/clients/${c.id}`}>open →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

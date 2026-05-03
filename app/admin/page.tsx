import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listAccountRequests, listClients } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [requests, clients] = await Promise.all([listAccountRequests(), listClients()]);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Admin</span>
          <h1 style={{ marginTop: "0.5rem" }}>Account requests</h1>
          <p className="meta">{requests.length} pending · {clients.length} active clients</p>
        </div>
        <Link className="btn btn-ghost" href="/admin/profiles">All profiles →</Link>
      </header>

      <hr className="divider" />

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Note</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={6} className="meta" style={{ padding: "1rem", textAlign: "center" }}>No pending requests.</td></tr>
            ) : requests.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.full_name}</strong></td>
                <td>{r.email}</td>
                <td>{r.phone ?? "—"}</td>
                <td className="meta">{r.message ?? "—"}</td>
                <td>{fmtDate(r.created_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>Approve</button>{" "}
                  <button className="btn btn-ghost" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", color: "var(--red)" }}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

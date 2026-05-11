import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";

export default async function AssignmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.is_admin && user.role !== "admin") redirect("/");

  const clients = await listClients();

  return (
    <main className="shell">
      <header>
        <span className="badge">Admin</span>
        <h1 style={{ marginTop: "0.5rem" }}>Coach ↔ client assignments</h1>
        <p className="meta">Single coach for now (James). When others are added, reassign here.</p>
      </header>
      <hr className="divider" />
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Client</th><th>Coach</th><th>Tier</th><th></th></tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>{c.full_name}</td>
                <td>James Monroe</td>
                <td>{c.tier?.replace("_", " ") ?? "—"}</td>
                <td><button className="btn btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.7rem" }}>Reassign</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

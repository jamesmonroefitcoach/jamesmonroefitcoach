import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listClients } from "@/lib/data";

export default async function AdminProfilesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.is_admin && user.role !== "admin") redirect("/");

  const clients = await listClients();

  return (
    <main className="shell">
      <header>
        <span className="badge">Admin</span>
        <h1 style={{ marginTop: "0.5rem" }}>All profiles</h1>
      </header>
      <hr className="divider" />
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td><strong>James Monroe</strong></td>
              <td>coach</td>
              <td>coachjamesmonroe@gmail.com</td>
              <td><span className="badge badge-sage">approved</span></td>
              <td><Link href="#">view →</Link></td>
            </tr>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>{c.full_name}</td>
                <td>client</td>
                <td>{c.email ?? "—"}</td>
                <td><span className="badge badge-sage">{c.status ?? "current"}</span></td>
                <td><Link href={`/coach/clients/${c.id}`}>view →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

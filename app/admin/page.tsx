import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listAccountRequests, listClients } from "@/lib/data";
import AdminRequestsList from "./admin-requests-list";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.is_admin && user.role !== "admin") redirect("/");

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
      <AdminRequestsList initial={requests} />
    </main>
  );
}

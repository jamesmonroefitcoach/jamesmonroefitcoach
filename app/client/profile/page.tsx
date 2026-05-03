import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getClient } from "@/lib/data";
import { fmtMoney, fmtDate } from "@/lib/format";

export default async function ClientProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");
  const me = await getClient(user.id);

  return (
    <main className="shell">
      <header>
        <span className="badge">Profile</span>
        <h1 style={{ marginTop: "0.5rem" }}>{user.name}</h1>
        <p className="meta">Member since {fmtDate(me?.member_since)}</p>
      </header>
      <hr className="divider" />
      <div className="card">
        <h2>Goals</h2>
        <p>{me?.goals ?? "—"}</p>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div>
            <div className="stat-label">Cadence</div>
            <div style={{ marginTop: "0.3rem" }}>{me?.regular_frequency ?? "—"} per week</div>
          </div>
          <div>
            <div className="stat-label">Session rate</div>
            <div style={{ marginTop: "0.3rem" }}>{fmtMoney(me?.session_rate)}</div>
          </div>
          <div>
            <div className="stat-label">Tier</div>
            <div style={{ marginTop: "0.3rem" }}>{me?.tier?.replace("_", " ") ?? "—"}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

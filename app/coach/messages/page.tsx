import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listCoachThreads } from "@/lib/data";

export default async function CoachMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const threads = await listCoachThreads(user.id);

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Messages</span>
          <h1 style={{ marginTop: "0.5rem" }}>Inbox</h1>
          <p className="meta">DMs and change requests. Use Announce to broadcast (e.g. "Gym closed Saturday").</p>
        </div>
        <button className="btn btn-primary">+ Announce</button>
      </header>
      <hr className="divider" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.25rem" }}>
        <div className="card" style={{ padding: 0 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {threads.map((t) => (
              <li key={t.id} style={{ padding: "0.7rem 0.9rem", borderBottom: "1px solid var(--line)", borderLeft: t.unread ? "3px solid var(--rust)" : "3px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{t.client_name}</strong>
                  <span className="meta">{new Date(t.last_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <p className="meta" style={{ margin: "0.2rem 0 0" }}>{t.last_message}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2>Pick a thread</h2>
          <p className="meta">Conversation view coming next phase.</p>
        </div>
      </div>
    </main>
  );
}

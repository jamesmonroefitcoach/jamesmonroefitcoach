import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function ClientMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell">
      <header>
        <span className="badge">Messages</span>
        <h1 style={{ marginTop: "0.5rem" }}>Talk to James</h1>
        <p className="meta">Schedule changes, questions, and check-in follow-ups all live here.</p>
      </header>
      <hr className="divider" />
      <div className="card" style={{ minHeight: 320 }}>
        <p className="meta">No messages yet. Send the first one below.</p>
      </div>
      <form className="card" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea className="textarea" rows={2} placeholder="Write a message..." />
        <button className="btn btn-primary" type="button">Send</button>
      </form>
    </main>
  );
}

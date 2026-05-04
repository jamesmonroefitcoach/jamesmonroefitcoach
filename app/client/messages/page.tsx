import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { loadOrCreateClientThread, loadThreadMessages } from "@/lib/messages";
import ClientMessagesView from "./client-messages-view";

const JAMES_ID = "00000000-0000-0000-0000-00000000c0a4";

export default async function ClientMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const thread = await loadOrCreateClientThread(user.id, JAMES_ID);
  const messages = thread ? await loadThreadMessages(thread.id) : [];

  return (
    <main className="shell">
      <header>
        <span className="badge">Messages</span>
        <h1 style={{ marginTop: "0.5rem" }}>Talk to James</h1>
        <p className="meta">Schedule changes, questions, and check-in follow-ups all live here.</p>
      </header>
      <hr className="divider" />
      <ClientMessagesView threadId={thread?.id ?? null} initial={messages} myId={user.id} />
    </main>
  );
}

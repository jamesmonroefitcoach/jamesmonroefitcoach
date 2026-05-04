import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listCoachThreads } from "@/lib/data";
import { loadThreadMessages } from "@/lib/messages";
import MessagesClient from "./messages-client";

export default async function CoachMessagesPage({ searchParams }: { searchParams: Promise<{ thread?: string; client?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const threads = await listCoachThreads(user.id);
  const activeId = sp.thread ?? threads[0]?.id ?? null;
  const messages = activeId ? await loadThreadMessages(activeId) : [];

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Messages</span>
          <h1 style={{ marginTop: "0.5rem" }}>Inbox</h1>
          <p className="meta">DMs and change requests. Use Announce to broadcast (e.g. "Gym closed Saturday").</p>
        </div>
      </header>
      <hr className="divider" />
      <MessagesClient threads={threads} activeId={activeId} initialMessages={messages} myId={user.id} />
    </main>
  );
}

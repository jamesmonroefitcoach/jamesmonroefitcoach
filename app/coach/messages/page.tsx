import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listCoachThreads, listClients } from "@/lib/data";
import { loadThreadMessages } from "@/lib/messages";
import MessagesClient from "./messages-client";
import MessagesTabs from "./messages-tabs";

export default async function CoachMessagesPage({ searchParams }: { searchParams: Promise<{ thread?: string; client?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const [threads, clients] = await Promise.all([
    listCoachThreads(user.id),
    listClients(user.id),
  ]);
  const activeId = sp.thread ?? threads[0]?.id ?? null;
  const messages = activeId ? await loadThreadMessages(activeId) : [];

  // Trim clients down to {id, full_name} for the new-message picker
  const clientPicker = clients.map((c) => ({ id: c.id, full_name: c.full_name }));

  return (
    <>
    <MessagesTabs />
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Messages</span>
          <h1 style={{ marginTop: "0.5rem" }}>Inbox</h1>
          <p className="meta">DMs and change requests. Use Announce to broadcast (e.g. &quot;Gym closed Saturday&quot;).</p>
        </div>
      </header>
      <hr className="divider" />
      <MessagesClient
        threads={threads}
        activeId={activeId}
        initialMessages={messages}
        myId={user.id}
        clients={clientPicker}
      />
    </main>
    </>
  );
}

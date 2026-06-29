import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listCoachThreads, listClients, listAppointmentsForWeek, startOfWeek } from "@/lib/data";
import { loadThreadMessages } from "@/lib/messages";
import MessagesClient from "./messages-client";
import MessagesTabs from "./messages-tabs";

export default async function CoachMessagesPage({ searchParams }: { searchParams: Promise<{ thread?: string; client?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const sp = await searchParams;
  const [threads, clients, weekAppts] = await Promise.all([
    listCoachThreads(user.id),
    listClients(user.id),
    listAppointmentsForWeek(user.id, startOfWeek(new Date())),
  ]);
  const activeId = sp.thread ?? threads[0]?.id ?? null;
  const messages = activeId ? await loadThreadMessages(activeId) : [];

  // The conversation that's shown counts as opened: zero its unread badge in the
  // list handed to the client. The client view marks it read in the DB on mount
  // (an effect, so prefetching the page can't clear unread prematurely), which
  // also drops it from the dashboard Inbox.
  const threadsForClient = threads.map((t) =>
    t.id === activeId ? { ...t, unread: false, unread_count: 0 } : t,
  );

  // Trim clients down to {id, full_name} for the new-message picker
  const clientPicker = clients.map((c) => ({ id: c.id, full_name: c.full_name }));

  // Derive distinct client IDs scheduled today vs this week — only "live"
  // statuses count (scheduled / completed / change_requested). Past
  // cancellations and no-shows shouldn't pull a client into the audience.
  const live = new Set(["scheduled", "completed", "change_requested"]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayClientIds = Array.from(new Set(
    weekAppts
      .filter((a) => a.client_id && live.has(a.status) && a.session_type === "session")
      .filter((a) => {
        const t = new Date(a.starts_at).getTime();
        return t >= today.getTime() && t < tomorrow.getTime();
      })
      .map((a) => a.client_id!)
  ));
  const weekClientIds = Array.from(new Set(
    weekAppts
      .filter((a) => a.client_id && live.has(a.status) && a.session_type === "session")
      .map((a) => a.client_id!)
  ));

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
        threads={threadsForClient}
        activeId={activeId}
        initialMessages={messages}
        myId={user.id}
        clients={clientPicker}
        todayClientIds={todayClientIds}
        weekClientIds={weekClientIds}
      />
    </main>
    </>
  );
}

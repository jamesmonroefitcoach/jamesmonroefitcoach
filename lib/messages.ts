import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

export type ThreadMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /** Auto-posted by the app (e.g. program completion). Renders italic + with a View button when link_url is set. */
  is_system?: boolean;
  link_url?: string | null;
  link_label?: string | null;
};

const DEMO_MSGS: Record<string, ThreadMessage[]> = {
  "thread-1": [
    { id: "m1", thread_id: "thread-1", sender_id: "demo-client-acacia", sender_name: "Acacia Chan", body: "Can we move Tuesday to Wed?", created_at: new Date(Date.now() - 3700000).toISOString(), read_at: null },
    { id: "m2", thread_id: "thread-1", sender_id: "demo-client-acacia", sender_name: "Acacia Chan", body: "Same time works for me — 7am.", created_at: new Date(Date.now() - 3600000).toISOString(), read_at: null }
  ],
  "thread-2": [
    { id: "m3", thread_id: "thread-2", sender_id: "demo-client-jen", sender_name: "Jen Loving", body: "Loved that pull session — knees felt great", created_at: new Date(Date.now() - 7200000).toISOString(), read_at: new Date(Date.now() - 7100000).toISOString() }
  ],
  "thread-3": [
    { id: "m4", thread_id: "thread-3", sender_id: "demo-client-abbey", sender_name: "Abbey Archer", body: "Heading out of town next week.", created_at: new Date(Date.now() - 26 * 3600000).toISOString(), read_at: null }
  ]
};

export async function loadThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  if (!hasSupabaseEnv()) return DEMO_MSGS[threadId] ?? [];
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at, read_at, is_system, link_url, link_label, profiles:sender_id ( full_name )")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) console.error("loadThreadMessages failed", threadId, error);
  if (!data) return [];
  return data.map((m: any) => ({
    id: m.id,
    thread_id: m.thread_id,
    sender_id: m.sender_id,
    sender_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name : m.profiles?.full_name,
    body: m.body,
    created_at: m.created_at,
    read_at: m.read_at,
    is_system: m.is_system ?? false,
    link_url: m.link_url ?? null,
    link_label: m.link_label ?? null,
  }));
}

// Auto-post a system message into a thread (e.g. "Completed: <program>").
// Caller still needs to pick a sender_id (typically the actor whose action
// triggered the auto-post — the client who completed the program, say).
export async function postSystemMessage(input: {
  thread_id: string;
  sender_id: string;
  body: string;
  link_url?: string | null;
  link_label?: string | null;
}): Promise<{ id: string } | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await createSupabaseAdmin()
    .from("messages")
    .insert({
      thread_id: input.thread_id,
      sender_id: input.sender_id,
      body: input.body,
      is_system: true,
      link_url: input.link_url ?? null,
      link_label: input.link_label ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: data.id };
}

/**
 * Resolve the one DM thread a coach/client pair share, creating it only when
 * none exists.
 *
 * The `(coach_id, client_id, topic)` unique index does NOT constrain rows where
 * topic is null — Postgres treats nulls as distinct — so some pairs already
 * have several topic-null threads. The old `.maybeSingle()` *errored* on those
 * pairs (multiple rows), the error was discarded, and the "no thread yet" path
 * inserted a brand new empty one on every single page load. That is why a
 * client's conversation looked empty and their messages didn't survive a
 * reload. Pick the thread with the most recent message instead (oldest thread
 * wins if none have messages) so both sides land on the same conversation.
 */
export async function loadOrCreateClientThread(clientId: string, coachId: string): Promise<{ id: string } | null> {
  if (!hasSupabaseEnv()) return { id: `demo-thread-${clientId}` };
  const supabase = createSupabaseAdmin();
  const { data: existing, error } = await supabase
    .from("message_threads")
    .select("id, created_at, messages ( created_at )")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .is("topic", null);
  if (error) {
    console.error("loadOrCreateClientThread: thread lookup failed", error);
    return null;
  }
  if (existing && existing.length > 0) {
    const ranked = [...existing].sort((a: any, b: any) => {
      const lastA = ((a.messages ?? []) as { created_at: string }[])
        .reduce((max, m) => (m.created_at > max ? m.created_at : max), "");
      const lastB = ((b.messages ?? []) as { created_at: string }[])
        .reduce((max, m) => (m.created_at > max ? m.created_at : max), "");
      if (lastA !== lastB) return lastB.localeCompare(lastA); // newest activity first
      return String(a.created_at).localeCompare(String(b.created_at)); // then oldest thread
    });
    return { id: (ranked[0] as any).id as string };
  }
  const { data: created, error: createError } = await supabase
    .from("message_threads")
    .insert({ coach_id: coachId, client_id: clientId })
    .select("id")
    .single();
  if (createError) console.error("loadOrCreateClientThread: thread create failed", createError);
  return created ?? null;
}

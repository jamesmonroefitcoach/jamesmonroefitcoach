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
  const { data } = await supabase
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at, read_at, is_system, link_url, link_label, profiles:sender_id ( full_name )")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
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

export async function loadOrCreateClientThread(clientId: string, coachId: string): Promise<{ id: string } | null> {
  if (!hasSupabaseEnv()) return { id: `demo-thread-${clientId}` };
  const supabase = createSupabaseAdmin();
  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .is("topic", null)
    .maybeSingle();
  if (existing) return existing;
  const { data: created } = await supabase
    .from("message_threads")
    .insert({ coach_id: coachId, client_id: clientId })
    .select("id")
    .single();
  return created ?? null;
}

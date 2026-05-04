import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";

export type ThreadMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
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
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at, read_at, profiles:sender_id ( full_name )")
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
    read_at: m.read_at
  }));
}

export async function loadOrCreateClientThread(clientId: string, coachId: string): Promise<{ id: string } | null> {
  if (!hasSupabaseEnv()) return { id: `demo-thread-${clientId}` };
  const supabase = await createSupabaseServer();
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

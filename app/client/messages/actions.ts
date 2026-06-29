"use server";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { loadThreadMessages, type ThreadMessage } from "@/lib/messages";

// Lightweight poll for the client's conversation with their coach: returns the
// latest messages so James's replies show up without a manual refresh. Marks
// the coach's messages read for this client (harmless today, keeps state tidy
// for any future client-side unread surface). Ownership-guarded.
export async function pollClientThread(
  threadId: string,
): Promise<{ ok: true; messages: ThreadMessage[] } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "client") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, messages: await loadThreadMessages(threadId) };
  const supabase = createSupabaseAdmin();
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id")
    .eq("id", threadId)
    .eq("client_id", me.id)
    .maybeSingle<{ id: string }>();
  if (!thread) return { ok: false, error: "Thread not found." };
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", me.id)
    .is("read_at", null);
  const messages = await loadThreadMessages(threadId);
  return { ok: true, messages };
}

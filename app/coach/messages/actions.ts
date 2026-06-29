"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { loadThreadMessages, type ThreadMessage } from "@/lib/messages";

type Result = { ok: true } | { ok: false; error: string };

// Load a thread's messages for the coach and mark received ones read. Used
// when a conversation is opened in the inbox so the chat actually shows (and
// persists) its messages instead of clearing.
export async function loadThread(
  threadId: string,
): Promise<{ ok: true; messages: ThreadMessage[] } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, messages: await loadThreadMessages(threadId) };
  const supabase = createSupabaseAdmin();
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id")
    .eq("id", threadId)
    .eq("coach_id", me.id)
    .maybeSingle<{ id: string }>();
  if (!thread) return { ok: false, error: "Thread not found." };
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", me.id)
    .is("read_at", null);
  const messages = await loadThreadMessages(threadId);
  revalidatePath("/coach/messages");
  // Also drop it from the dashboard "Inbox" unread list now that it's read.
  revalidatePath("/coach");
  return { ok: true, messages };
}

// Lightweight poll for the conversation that's currently open: returns the
// latest messages and keeps the thread marked read while the coach is looking
// at it. No revalidate — the inbox list isn't re-fetched on every tick.
export async function pollThread(
  threadId: string,
): Promise<{ ok: true; messages: ThreadMessage[] } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true, messages: await loadThreadMessages(threadId) };
  const supabase = createSupabaseAdmin();
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id")
    .eq("id", threadId)
    .eq("coach_id", me.id)
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

export async function sendMessage(threadId: string, body: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: me.id,
    body: trimmed
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/messages");
  revalidatePath("/client/messages");
  return { ok: true };
}

export async function markThreadRead(threadId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: true };
  const supabase = createSupabaseAdmin();
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", me.id)
    .is("read_at", null);
  return { ok: true };
}

export async function announceToAllClients(
  body: string,
  tier?: "tier_1" | "tier_2" | "tier_3",
  recipientIds?: string[],
): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = createSupabaseAdmin();
  // Same eligibility rule as listClients: any profile with role='client'
  // whose client_details either has no coach_id, or has one matching me.
  // (Querying client_details with eq("coach_id", me.id) silently dropped
  // any client whose coach_id was null — e.g. self-registered users.)
  const { data: profileRows } = await supabase
    .from("profiles")
    .select(`
      id,
      details:client_details!client_details_profile_id_fkey ( coach_id, tier )
    `)
    .eq("role", "client");
  if (!profileRows) return { ok: false, error: "no clients" };

  const explicit = recipientIds && recipientIds.length > 0
    ? new Set(recipientIds)
    : null;

  const eligible: string[] = profileRows
    .map((p: any) => {
      const d = Array.isArray(p.details) ? p.details[0] : p.details;
      if (d?.coach_id && d.coach_id !== me.id) return null;
      if (tier && d?.tier !== tier) return null;
      if (explicit && !explicit.has(p.id)) return null;
      return p.id as string;
    })
    .filter((id: string | null): id is string => !!id);

  if (eligible.length === 0) return { ok: false, error: "no recipients matched" };

  for (const pid of eligible) {
    // ensure announcement-marked thread exists
    const { data: th } = await supabase
      .from("message_threads")
      .upsert(
        { coach_id: me.id, client_id: pid, topic: "Announcement", is_announcement: true },
        { onConflict: "coach_id,client_id,topic" }
      )
      .select("id")
      .single();
    if (th?.id) {
      await supabase.from("messages").insert({ thread_id: th.id, sender_id: me.id, body: trimmed });
    }
  }
  revalidatePath("/coach/messages");
  return { ok: true };
}

/** Open (or create) a DM thread with a client and return its id. */
export async function startThreadWithClient(clientId: string): Promise<{ ok: true; thread_id: string } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!clientId) return { ok: false, error: "missing client" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = createSupabaseAdmin();
  // Use topic=null for the default DM thread (one per coach/client pair).
  const { data: th, error } = await supabase
    .from("message_threads")
    .upsert(
      { coach_id: me.id, client_id: clientId, topic: null },
      { onConflict: "coach_id,client_id,topic" }
    )
    .select("id")
    .single();
  if (error || !th?.id) return { ok: false, error: error?.message ?? "thread create failed" };
  revalidatePath("/coach/messages");
  return { ok: true, thread_id: th.id };
}

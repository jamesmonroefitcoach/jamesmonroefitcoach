"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

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

export async function announceToAllClients(body: string, tier?: "tier_1" | "tier_2" | "tier_3"): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = createSupabaseAdmin();
  const q = supabase.from("client_details").select("profile_id, tier").eq("coach_id", me.id);
  const { data: clients } = tier ? await q.eq("tier", tier) : await q;
  if (!clients) return { ok: false, error: "no clients" };

  for (const c of clients) {
    // ensure announcement-marked thread exists
    const { data: th } = await supabase
      .from("message_threads")
      .upsert(
        { coach_id: me.id, client_id: c.profile_id, topic: "Announcement", is_announcement: true },
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

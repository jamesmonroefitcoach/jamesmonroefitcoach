"use server";

import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { ReminderPrefs } from "@/lib/data";

export async function saveReminderPrefs(
  clientId: string,
  prefs: Pick<ReminderPrefs, "channel_email" | "channel_sms" | "offsets_min">
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("client_reminder_prefs").upsert(
    {
      client_id: clientId,
      channel_email: prefs.channel_email,
      channel_sms: prefs.channel_sms,
      offsets_min: prefs.offsets_min,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

export async function setRequiresConfirmation(
  clientId: string,
  value: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("client_details")
    .update({ requires_confirmation: value })
    .eq("profile_id", clientId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

export async function setLifecycle(
  clientId: string,
  lifecycle: "active" | "inactive" | "paused"
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("client_details")
    .update({ lifecycle })
    .eq("profile_id", clientId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

export async function sendConfirmationEmail(
  clientId: string,
  apptId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  // Email stub — will wire up to Resend/SendGrid in production.
  // For now, just log a message into the client thread.
  if (!hasSupabaseEnv()) return { ok: true };

  const supabase = await createSupabaseServer();
  const { data: thread } = await supabase
    .from("message_threads")
    .upsert(
      { coach_id: user.id, client_id: clientId, topic: null },
      { onConflict: "coach_id,client_id,topic" }
    )
    .select("id")
    .maybeSingle();

  if (thread?.id) {
    await supabase.from("messages").insert({
      thread_id: thread.id,
      sender_id: user.id,
      body: "Your session has been confirmed. See you then!",
    });
  }

  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

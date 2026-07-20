"use server";

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { ReminderPrefs } from "@/lib/data";
import { deleteWorkoutSheet } from "@/lib/workout-sheets.server";

// ── Delete a program and its associated days/movements ───────────────────────
export async function deleteProgram(
  programId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "no db" };

  const supabase = createSupabaseAdmin();

  // Unlink the paired workout sheet before deleting (avoid FK issues)
  await supabase
    .from("workout_sheets")
    .update({ program_id: null })
    .eq("program_id", programId);

  // Delete movements → days → program
  const { data: days } = await supabase
    .from("program_days")
    .select("id")
    .eq("program_id", programId);
  const dayIds = (days ?? []).map((d: { id: string }) => d.id);
  if (dayIds.length) {
    await supabase.from("program_movements").delete().in("program_day_id", dayIds);
    await supabase.from("program_days").delete().eq("program_id", programId);
  }

  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach/programming");
  return { ok: true };
}

// ── Delete a client profile entirely (for fixing mistakes) ───────────────────
// Hard-deletes the profile. The DB cascades to client_details, programs,
// appointments, messages, goals, workout_sheets, etc. (all client_id FKs are
// ON DELETE CASCADE). Guarded to client profiles only so a coach/admin can
// never be removed through this path.
export async function deleteClientProfile(
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "no db" };

  const supabase = createSupabaseAdmin();
  // Confirm the target is a client before touching anything.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", clientId)
    .maybeSingle<{ id: string; role: string; full_name: string }>();
  if (!target) return { ok: false, error: "Profile not found." };
  if (target.role !== "client") return { ok: false, error: "Only client profiles can be deleted here." };

  // Unlink workout sheets from any paired programs first so the program delete
  // can't trip the 1:1 bridge constraint, then let the cascade do the rest.
  const { data: progs } = await supabase
    .from("programs")
    .select("id")
    .eq("client_id", clientId);
  const progIds = (progs ?? []).map((p: { id: string }) => p.id);
  if (progIds.length) {
    await supabase.from("workout_sheets").update({ program_id: null }).in("program_id", progIds);
  }

  const { error } = await supabase.from("profiles").delete().eq("id", clientId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/clients");
  revalidatePath("/coach/programming");
  return { ok: true };
}

// ── Delete a workout sheet and unlink any paired program ─────────────────────
export async function deleteClientWorkoutSheet(
  sheetId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "no db" };

  const supabase = createSupabaseAdmin();

  // Unlink the paired program before deleting (avoid FK issues)
  await supabase
    .from("programs")
    .update({ workout_sheet_id: null })
    .eq("workout_sheet_id", sheetId);

  const ok = await deleteWorkoutSheet(sheetId);
  if (!ok) return { ok: false, error: "delete failed" };

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach/programming");
  return { ok: true };
}

// ── Coach-provided fields ──────────────────────────────────────────────────
export type CoachProfileInput = {
  session_rate?: number | null;
  trained_since_note?: string;
  time_window_note?: string;
  accountability?: string;
  education?: string;
  commitment?: string;
  dire_need_ranking?: string;
};

export async function updateCoachProfile(
  clientId: string,
  input: CoachProfileInput
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) { revalidatePath(`/coach/clients/${clientId}`); return { ok: true }; }

  const supabase = createSupabaseAdmin();
  const payload: Record<string, any> = {};
  if (input.session_rate       !== undefined) payload.session_rate        = input.session_rate;
  if (input.trained_since_note !== undefined) payload.trained_since_note  = input.trained_since_note?.trim() || null;
  if (input.time_window_note   !== undefined) payload.time_window_note    = input.time_window_note?.trim() || null;
  if (input.accountability     !== undefined) payload.accountability       = input.accountability?.trim() || null;
  if (input.education          !== undefined) payload.education            = input.education?.trim() || null;
  if (input.commitment         !== undefined) payload.commitment           = input.commitment?.trim() || null;
  if (input.dire_need_ranking  !== undefined) payload.dire_need_ranking    = input.dire_need_ranking?.trim() || null;

  if (Object.keys(payload).length) {
    // Upsert (not update): a client with no client_details row would otherwise
    // silently no-op (zero rows matched), so the rate never saves or shows.
    // Keying on the profile_id PK creates the row on first edit.
    const { error } = await supabase
      .from("client_details")
      .upsert({ ...payload, profile_id: clientId }, { onConflict: "profile_id" });
    if (error) return { ok: false, error: error.message };
  }

  // Rate propagation — when session_rate changes, update every future,
  // non-cancelled session appointment for this client so already-booked
  // programs reflect current pricing. Past + cancelled rows keep their
  // historical rate so revenue history stays accurate.
  if (input.session_rate !== undefined && input.session_rate !== null) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("appointments")
      .update({ rate: input.session_rate })
      .eq("client_id", clientId)
      .eq("session_type", "session")
      .gte("starts_at", nowIso)
      .not("status", "in", "(cancelled,no_show)");
    revalidatePath("/coach/schedule");
    revalidatePath("/coach");
  }

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach/clients");
  return { ok: true };
}

// ── Client Description ────────────────────────────────────────────────────
// Free-text "who they are" notes the coach writes for themselves on the
// client profile page. Stored in client_details.client_description.

export async function updateClientDescription(
  clientId: string,
  description: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) { revalidatePath(`/coach/clients/${clientId}`); return { ok: true }; }

  const supabase = createSupabaseAdmin();
  const value = description.trim() || null;
  const { error } = await supabase
    .from("client_details")
    .update({ client_description: value })
    .eq("profile_id", clientId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

// ── Client-provided / contact fields ──────────────────────────────────────
export type ClientInfoInput = {
  goals?: string;
  age_category?: string;
  birthday?: string;        // YYYY-MM-DD or ""
  gender?: string;
  email?: string;
  phone?: string;
};

export async function updateClientInfo(
  clientId: string,
  input: ClientInfoInput
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) { revalidatePath(`/coach/clients/${clientId}`); return { ok: true }; }

  const supabase = createSupabaseAdmin();

  // Update profiles table (email, phone)
  const profilePayload: Record<string, any> = {};
  if (input.email !== undefined) profilePayload.email = input.email?.trim() || null;
  if (input.phone !== undefined) profilePayload.phone = input.phone?.trim() || null;
  if (Object.keys(profilePayload).length) {
    const { error } = await supabase.from("profiles").update(profilePayload).eq("id", clientId);
    if (error) return { ok: false, error: error.message };
  }

  // Update client_details table
  const detailPayload: Record<string, any> = {};
  if (input.goals        !== undefined) detailPayload.goals         = input.goals?.trim() || null;
  if (input.age_category !== undefined) detailPayload.age_category  = input.age_category?.trim() || null;
  if (input.gender       !== undefined) detailPayload.gender         = input.gender?.trim() || null;
  if (input.birthday     !== undefined) detailPayload.birthday       = input.birthday?.trim() || null;
  if (Object.keys(detailPayload).length) {
    const { error } = await supabase.from("client_details").update(detailPayload).eq("profile_id", clientId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach/clients");
  return { ok: true };
}

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

  const supabase = createSupabaseAdmin();
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

  const supabase = createSupabaseAdmin();
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
  lifecycle: "active" | "inactive" | "paused" | "prospective" | "online"
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("client_details")
    .update({ lifecycle })
    .eq("profile_id", clientId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

// ── High Level Plan ───────────────────────────────────────────────────────────
export type HighLevelPlanInput = {
  recommended_monthly_sessions: number | null;
  strategy: string;
};

export async function saveHighLevelPlan(
  clientId: string,
  input: HighLevelPlanInput
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && user.role !== "admin" && !user.is_admin)) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) { revalidatePath(`/coach/clients/${clientId}`); return { ok: true }; }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("high_level_plans").upsert(
    {
      client_id: clientId,
      recommended_monthly_sessions: input.recommended_monthly_sessions,
      strategy: input.strategy?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" }
  );
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

  const supabase = createSupabaseAdmin();
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

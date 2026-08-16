"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  INTAKE_FIELDS, NAME_KEY, EMAIL_KEY, PHONE_KEY, MAX_ANSWER_LEN,
} from "./questions";

// Public new-client intake submit. No auth — this is linked from a text
// message, the same open-access posture as the /consult form and the
// /s/<token> sheet. Writes with the service-role client so the table never
// needs an insert policy for anon.

export type IntakeResult = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitIntake(
  input: Record<string, string>,
): Promise<IntakeResult> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "This form is not connected to the database yet." };
  }

  // Only keep keys we actually asked for, so a crafted post can't stuff
  // arbitrary content into the stored JSON. Same guard as the consult form's
  // offerings filter.
  const answers: Record<string, string> = {};
  for (const field of INTAKE_FIELDS) {
    const raw = input[field.key];
    if (typeof raw !== "string") continue;
    const value = raw.trim().slice(0, MAX_ANSWER_LEN);
    if (value) answers[field.key] = value;
  }

  for (const field of INTAKE_FIELDS) {
    if (field.required && !answers[field.key]) {
      return { ok: false, error: `Please answer: ${field.label}` };
    }
  }

  const name = answers[NAME_KEY] ?? "";
  const email = (answers[EMAIL_KEY] ?? "").toLowerCase();
  const phone = answers[PHONE_KEY] ?? "";

  if (name.length > 120) return { ok: false, error: "Name is too long." };
  if (!EMAIL.test(email)) return { ok: false, error: "Please enter a valid email address." };
  answers[EMAIL_KEY] = email;

  const sb = createSupabaseAdmin();

  // prospects.coach_id is not null. There is one coach on this app, so resolve
  // it here rather than widening the column — see migration 0038's note.
  const { data: coach, error: coachError } = await sb
    .from("profiles")
    .select("id")
    .eq("role", "coach")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (coachError || !coach) {
    console.error("[intake] could not resolve coach profile", coachError);
    return { ok: false, error: "Could not submit right now. Please text James directly." };
  }

  const { error } = await sb.from("prospects").insert({
    coach_id: coach.id,
    full_name: name,
    email,
    phone: phone || null,
    where_met: "Intake form",
    intake_data: answers,
    intake_received_at: new Date().toISOString(),
  });

  if (error) {
    // A missing column here means migration 0038 has not been run yet. Fail
    // loudly rather than dropping the answers to save the row — losing a real
    // person's questionnaire is worse than a visible error.
    console.error("[intake] insert failed", error);
    if (/intake_data|intake_received_at/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: "This form is not finished being set up yet. Please let James know.",
      };
    }
    return { ok: false, error: "Could not submit right now. Please text James directly." };
  }

  revalidatePath("/coach/clients");
  return { ok: true };
}

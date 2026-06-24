"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import {
  OFFERING_KEYS, EXPERIENCE_LEVELS, ACTIVITY_LEVELS,
  type OfferingKey,
} from "./offerings";

export type ConsultStatus = "new" | "contacted" | "booked" | "dismissed";

export type ConsultationRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: ConsultStatus;
  source: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  coach_notes: string | null;
  offerings_interest: string[] | null;
  goals_text: string | null;
  injuries_text: string | null;
  experience_level: string | null;
  activity_level: string | null;
  availability_text: string | null;
};


type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// ── public submit ──────────────────────────────────────────────────
// Called from the marketing form on / — no auth required. Validates
// minimally and writes via the service-role client so we don't have
// to expose an insert policy on the table.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitConsultationRequest(input: {
  name: string;
  email: string;
  phone?: string;
  message?: string;
  source?: string;
  offerings_interest?: string[];
  goals_text?: string;
  injuries_text?: string;
  experience_level?: string;
  activity_level?: string;
  availability_text?: string;
}): Promise<Result> {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim() || null;
  const message = (input.message ?? "").trim() || null;
  const source = (input.source ?? "").trim() || null;

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!EMAIL.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (name.length > 120 || email.length > 200) return { ok: false, error: "Input too long." };
  if (message && message.length > 2000) return { ok: false, error: "Message too long." };

  // Optional intake fields — filter to known keys so an attacker can't stuff
  // arbitrary strings into the array, and cap each free-text field length.
  const offerings = Array.isArray(input.offerings_interest)
    ? input.offerings_interest
        .map((s) => String(s).trim())
        .filter((s): s is OfferingKey => (OFFERING_KEYS as readonly string[]).includes(s))
    : [];
  const goalsText = (input.goals_text ?? "").trim().slice(0, 1000) || null;
  const injuriesText = (input.injuries_text ?? "").trim().slice(0, 1000) || null;
  const availabilityText = (input.availability_text ?? "").trim().slice(0, 500) || null;
  const experienceLevel = (input.experience_level ?? "").trim();
  const experience = (EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)
    ? experienceLevel
    : null;
  const activityLevel = (input.activity_level ?? "").trim();
  const activity = (ACTIVITY_LEVELS as readonly string[]).includes(activityLevel)
    ? activityLevel
    : null;

  const sb = createSupabaseAdmin();
  const base = {
    name, email, phone, message, source, status: "new" as const,
    offerings_interest: offerings.length > 0 ? offerings : null,
    goals_text: goalsText,
    injuries_text: injuriesText,
    experience_level: experience,
    availability_text: availabilityText,
  };
  let { error } = await sb.from("consultation_requests").insert({ ...base, activity_level: activity });
  // If the activity_level column hasn't been migrated on this DB yet, retry
  // without it so a live submission never fails on account of a pending column.
  if (error && /activity_level/i.test(error.message ?? "")) {
    ({ error } = await sb.from("consultation_requests").insert(base));
  }

  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/appointments");
  revalidatePath("/coach");
  return { ok: true };
}

// ── coach-side ─────────────────────────────────────────────────────

export async function listConsultationRequests(): Promise<ConsultationRequest[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from("consultation_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return data as ConsultationRequest[];
}

export async function setConsultationRequestStatus(
  id: string,
  status: ConsultStatus,
): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!["new", "contacted", "booked", "dismissed"].includes(status)) {
    return { ok: false, error: "invalid status" };
  }

  const sb = createSupabaseAdmin();
  const resolved = status === "new" ? null : new Date().toISOString();
  const { error } = await sb
    .from("consultation_requests")
    .update({
      status,
      resolved_at: resolved,
      resolved_by: status === "new" ? null : me.id,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/appointments");
  revalidatePath("/coach");
  return { ok: true };
}

export async function deleteConsultationRequest(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };

  const sb = createSupabaseAdmin();
  const { error } = await sb.from("consultation_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/appointments");
  revalidatePath("/coach");
  return { ok: true };
}

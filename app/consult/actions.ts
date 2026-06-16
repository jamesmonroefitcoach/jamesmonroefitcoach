"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

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

  const sb = createSupabaseAdmin();
  const { error } = await sb.from("consultation_requests").insert({
    name, email, phone, message, source, status: "new",
  });

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

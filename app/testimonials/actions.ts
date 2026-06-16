"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

export type TestimonialStatus = "new" | "approved" | "declined" | "hidden";

export type Testimonial = {
  id: string;
  client_id: string | null;
  submitted_name: string;
  display_name: string | null;
  meta_line: string | null;
  body: string;
  status: TestimonialStatus;
  is_published: boolean;
  before_image_url: string | null;
  after_image_url: string | null;
  sort_order: number;
  client_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const STATUSES: TestimonialStatus[] = ["new", "approved", "declined", "hidden"];

// ── client submit ─────────────────────────────────────────────────
// Posted from the client surface — must be a logged-in client.
export async function submitTestimonial(input: {
  body: string;
  meta_line?: string;
  before_image_url?: string;
  after_image_url?: string;
}): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Please sign in to leave feedback." };
  if (me.role !== "client") return { ok: false, error: "Only clients can submit feedback." };

  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Please write a few words." };
  if (body.length < 12) return { ok: false, error: "Tell James a bit more — at least a sentence." };
  if (body.length > 1800) return { ok: false, error: "Please keep it under 1800 characters." };

  const meta = (input.meta_line ?? "").trim().slice(0, 200) || null;
  const before = (input.before_image_url ?? "").trim().slice(0, 800) || null;
  const after = (input.after_image_url ?? "").trim().slice(0, 800) || null;

  const sb = createSupabaseAdmin();
  const { error } = await sb.from("testimonials").insert({
    client_id: me.id,
    submitted_name: me.name ?? "Client",
    body, meta_line: meta,
    before_image_url: before,
    after_image_url: after,
    status: "new",
    is_published: false,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/client");
  revalidatePath("/client/profile");
  revalidatePath("/coach/testimonials");
  revalidatePath("/coach");
  return { ok: true };
}

// ── coach moderation ──────────────────────────────────────────────

export async function listAllTestimonials(): Promise<Testimonial[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from("testimonials")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as Testimonial[];
}

export async function listMyTestimonials(): Promise<Testimonial[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "client") return [];
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from("testimonials")
    .select("*")
    .eq("client_id", me.id)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as Testimonial[];
}

export async function updateTestimonial(
  id: string,
  patch: {
    display_name?: string | null;
    meta_line?: string | null;
    body?: string;
    before_image_url?: string | null;
    after_image_url?: string | null;
    sort_order?: number;
    is_published?: boolean;
  },
): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };

  const sb = createSupabaseAdmin();
  const next: Record<string, unknown> = {};
  if (patch.display_name !== undefined) next.display_name = patch.display_name?.trim() || null;
  if (patch.meta_line !== undefined) next.meta_line = patch.meta_line?.trim() || null;
  if (patch.body !== undefined) next.body = patch.body.trim();
  if (patch.before_image_url !== undefined) next.before_image_url = patch.before_image_url?.trim() || null;
  if (patch.after_image_url !== undefined) next.after_image_url = patch.after_image_url?.trim() || null;
  if (patch.sort_order !== undefined) next.sort_order = patch.sort_order;
  if (patch.is_published !== undefined) next.is_published = patch.is_published;

  const { error } = await sb.from("testimonials").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/testimonials");
  revalidatePath("/");
  return { ok: true };
}

export async function setTestimonialStatus(
  id: string,
  status: TestimonialStatus,
): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!STATUSES.includes(status)) return { ok: false, error: "invalid status" };

  const sb = createSupabaseAdmin();
  // Approving auto-publishes; declining/hiding pulls the row off the
  // landing page in one click so James doesn't have to flip two toggles.
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: me.id,
  };
  if (status === "approved") {
    patch.is_published = true;
    patch.approved_at = new Date().toISOString();
  } else if (status === "declined" || status === "hidden") {
    patch.is_published = false;
  }

  const { error } = await sb.from("testimonials").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/testimonials");
  revalidatePath("/coach");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTestimonial(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from("testimonials").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/testimonials");
  revalidatePath("/");
  return { ok: true };
}

// ── public read (used by /) ───────────────────────────────────────
// Service-role read; row visibility is enforced by the status +
// is_published filter, not by an RLS policy, so this is safe for a
// public Server Component to call.
export async function listPublicTestimonials(): Promise<Testimonial[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from("testimonials")
    .select("*")
    .eq("status", "approved")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("approved_at", { ascending: false })
    .limit(12);
  if (error || !data) return [];
  return data as Testimonial[];
}

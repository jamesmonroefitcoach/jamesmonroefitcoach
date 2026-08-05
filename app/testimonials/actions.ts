"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { Testimonial, TestimonialStatus } from "./types";

// Re-export types via `export type` so client modules can still import
// Testimonial / TestimonialStatus through @/app/testimonials/actions
// without picking up the server-only constants. Functions like
// allBeforeUrls / allAfterUrls live in ./types.ts now.
export type { Testimonial, TestimonialStatus };

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

// New flow: client posts the form as multipart FormData so we can pull
// File objects out and upload them to Supabase Storage. The bucket is
// public-read so the rendered <img src=…> on the landing page Just Works.
const STORAGE_BUCKET = "testimonial-photos";
const MAX_FILE_BYTES = 8 * 1024 * 1024;   // 8 MB per file
const ALLOWED_TYPES = /^image\//;          // any image/*

async function uploadFiles(files: File[], prefix: string): Promise<string[]> {
  const sb = createSupabaseAdmin();
  const urls: string[] = [];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_FILE_BYTES) continue;
    if (!ALLOWED_TYPES.test(f.type)) continue;
    // Path keeps client_id namespace + a slugified original filename so
    // James can pick out whose photos he's reviewing in the bucket.
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, buf, {
      contentType: f.type,
      upsert: false,
    });
    if (error) continue;
    const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    if (pub?.publicUrl) urls.push(pub.publicUrl);
  }
  return urls;
}

export async function submitTestimonialWithFiles(formData: FormData): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Please sign in to leave feedback." };
  if (me.role !== "client") return { ok: false, error: "Only clients can submit feedback." };

  const body = String(formData.get("body") ?? "").trim();
  const meta = String(formData.get("meta_line") ?? "").trim().slice(0, 200) || null;
  if (!body) return { ok: false, error: "Please write a few words." };
  if (body.length < 12) return { ok: false, error: "Tell James a bit more — at least a sentence." };
  if (body.length > 1800) return { ok: false, error: "Please keep it under 1800 characters." };

  const beforeFiles = formData.getAll("before_files").filter((v) => v instanceof File) as File[];
  const afterFiles = formData.getAll("after_files").filter((v) => v instanceof File) as File[];

  const beforeUrls = beforeFiles.length > 0 ? await uploadFiles(beforeFiles, `${me.id}/before`) : [];
  const afterUrls  = afterFiles.length  > 0 ? await uploadFiles(afterFiles,  `${me.id}/after`)  : [];

  const sb = createSupabaseAdmin();
  const { error } = await sb.from("testimonials").insert({
    client_id: me.id,
    submitted_name: me.name ?? "Client",
    body, meta_line: meta,
    before_image_urls: beforeUrls.length > 0 ? beforeUrls : null,
    after_image_urls:  afterUrls.length  > 0 ? afterUrls  : null,
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

// Coach-side upload from the moderation edit form: takes one image file,
// returns its public URL for the before/after field. The row itself is
// still written by updateTestimonial when James hits Save.
export async function coachUploadTestimonialPhoto(formData: FormData): Promise<Result<{ url: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file received." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "Image is over 8 MB — please pick a smaller one." };
  if (!ALLOWED_TYPES.test(file.type)) return { ok: false, error: "Please choose an image file." };

  const kind = formData.get("kind") === "after" ? "after" : "before";
  const urls = await uploadFiles([file], `coach/${kind}`);
  if (urls.length === 0) return { ok: false, error: "Upload failed — please try again." };
  return { ok: true, data: { url: urls[0] } };
}

// Coach-created quote entry (no client submission behind it): lands
// approved + published so it shows on the site immediately. Photo fields
// live on coachCreateBeforeAfter below — this one is text-only, to match
// the Testimonials screen it belongs to.
export async function coachCreateTestimonial(input: {
  display_name: string;
  meta_line?: string | null;
  body?: string | null;
}): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };

  const name = (input.display_name ?? "").trim();
  if (!name) return { ok: false, error: "Give the entry a client name." };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from("testimonials")
    .insert({
      client_id: null,
      submitted_name: name,
      display_name: name,
      meta_line: (input.meta_line ?? "").trim().slice(0, 200) || null,
      body: (input.body ?? "").trim(),
      status: "approved",
      is_published: true,
      approved_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/testimonials");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
}

// ── coach moderation ──────────────────────────────────────────────

export async function listAllTestimonials(): Promise<Testimonial[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  if (!hasSupabaseEnv()) return [];
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

// Text-only edit — quote body, display name, subtitle, sort, publish.
// Photo fields live on updateBeforeAfterPhoto below: James edits before/after
// images from their own screen, separate from moderating the written quote,
// even though both write the same row.
export async function updateTestimonial(
  id: string,
  patch: {
    display_name?: string | null;
    meta_line?: string | null;
    body?: string;
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
  if (patch.sort_order !== undefined) next.sort_order = patch.sort_order;
  if (patch.is_published !== undefined) next.is_published = patch.is_published;

  const { error } = await sb.from("testimonials").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/testimonials");
  revalidatePath("/");
  return { ok: true };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Photo-only edit for the Before/After screen — never touches body/quote.
export async function updateBeforeAfterPhoto(
  id: string,
  patch: {
    display_name?: string | null;
    meta_line?: string | null;
    before_image_url?: string | null;
    after_image_url?: string | null;
    before_image_urls?: string[] | null;
    after_image_urls?: string[] | null;
    before_fit?: "cover" | "contain" | null;
    after_fit?: "cover" | "contain" | null;
    before_zoom?: number;
    before_pos_x?: number;
    before_pos_y?: number;
    after_zoom?: number;
    after_pos_x?: number;
    after_pos_y?: number;
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
  if (patch.before_image_url !== undefined) next.before_image_url = patch.before_image_url?.trim() || null;
  if (patch.after_image_url !== undefined) next.after_image_url = patch.after_image_url?.trim() || null;
  if (patch.before_image_urls !== undefined) next.before_image_urls = patch.before_image_urls;
  if (patch.after_image_urls !== undefined) next.after_image_urls = patch.after_image_urls;
  if (patch.before_fit !== undefined) next.before_fit = patch.before_fit;
  if (patch.after_fit !== undefined) next.after_fit = patch.after_fit;
  if (patch.before_zoom !== undefined) next.before_zoom = clamp(patch.before_zoom, 1, 4);
  if (patch.before_pos_x !== undefined) next.before_pos_x = clamp(patch.before_pos_x, 0, 100);
  if (patch.before_pos_y !== undefined) next.before_pos_y = clamp(patch.before_pos_y, 0, 100);
  if (patch.after_zoom !== undefined) next.after_zoom = clamp(patch.after_zoom, 1, 4);
  if (patch.after_pos_x !== undefined) next.after_pos_x = clamp(patch.after_pos_x, 0, 100);
  if (patch.after_pos_y !== undefined) next.after_pos_y = clamp(patch.after_pos_y, 0, 100);
  if (patch.sort_order !== undefined) next.sort_order = patch.sort_order;
  if (patch.is_published !== undefined) next.is_published = patch.is_published;

  const { error } = await sb.from("testimonials").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/before-after");
  revalidatePath("/");
  return { ok: true };
}

// Coach-created photo-only entry (no quote) — for the Before/After screen's
// own "Add entry +". Mirrors coachCreateTestimonial but forces an empty
// body so it never shows up in the quotes strip.
export async function coachCreateBeforeAfter(input: {
  display_name: string;
  meta_line?: string | null;
  before_image_url?: string | null;
  after_image_url?: string | null;
  before_fit?: "cover" | "contain" | null;
  after_fit?: "cover" | "contain" | null;
  before_zoom?: number;
  before_pos_x?: number;
  before_pos_y?: number;
  after_zoom?: number;
  after_pos_x?: number;
  after_pos_y?: number;
}): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };

  const name = (input.display_name ?? "").trim();
  if (!name) return { ok: false, error: "Give the entry a client name." };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from("testimonials")
    .insert({
      client_id: null,
      submitted_name: name,
      display_name: name,
      meta_line: (input.meta_line ?? "").trim().slice(0, 200) || null,
      body: "",
      before_image_url: (input.before_image_url ?? "").trim() || null,
      after_image_url: (input.after_image_url ?? "").trim() || null,
      before_fit: input.before_fit ?? null,
      after_fit: input.after_fit ?? null,
      before_zoom: input.before_zoom !== undefined ? clamp(input.before_zoom, 1, 4) : undefined,
      before_pos_x: input.before_pos_x !== undefined ? clamp(input.before_pos_x, 0, 100) : undefined,
      before_pos_y: input.before_pos_y !== undefined ? clamp(input.before_pos_y, 0, 100) : undefined,
      after_zoom: input.after_zoom !== undefined ? clamp(input.after_zoom, 1, 4) : undefined,
      after_pos_x: input.after_pos_x !== undefined ? clamp(input.after_pos_x, 0, 100) : undefined,
      after_pos_y: input.after_pos_y !== undefined ? clamp(input.after_pos_y, 0, 100) : undefined,
      status: "approved",
      is_published: true,
      approved_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/coach/before-after");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
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
  if (!hasSupabaseEnv()) return [];
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

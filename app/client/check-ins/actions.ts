"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { getCoachIdForClient, insertCheckIn } from "@/lib/check-ins";

export type CheckInInput = {
  weight_lb?: number | null;
  body_fat_pct?: number | null;
  satisfaction?: number | null;
  nutrition_conf?: number | null;
  sleep_recovery?: number | null;
  commitment?: number | null;
  goals_text?: string | null;
  improvement_text?: string | null;
  challenges?: string | null;
  injuries?: string | null;
  raw_survey?: Record<string, unknown> | null;
  /** Optional ISO timestamp — back-date or schedule. Defaults to now. */
  submitted_at?: string | null;
  /** Coach-only — submit on behalf of a client. */
  client_id?: string;
};

type Result = { ok: true; data: { id: string } } | { ok: false; error: string };

export async function submitCheckIn(input: CheckInInput): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  // Resolve whose check-in this is. Clients can only submit their own;
  // coaches/admins can submit on behalf of any of their clients.
  const isCoachLike = me.role === "coach" || me.role === "admin" || me.is_admin;
  const targetClientId = input.client_id ?? me.id;
  if (targetClientId !== me.id && !isCoachLike) {
    return { ok: false, error: "Not allowed to submit for another user." };
  }

  const coachId = await getCoachIdForClient(targetClientId);
  const row = await insertCheckIn({
    client_id: targetClientId,
    coach_id: coachId ?? (isCoachLike ? me.id : null),
    submitted_at: input.submitted_at ?? null,
    weight_lb: input.weight_lb ?? null,
    body_fat_pct: input.body_fat_pct ?? null,
    satisfaction: input.satisfaction ?? null,
    nutrition_conf: input.nutrition_conf ?? null,
    sleep_recovery: input.sleep_recovery ?? null,
    commitment: input.commitment ?? null,
    goals_text: input.goals_text ?? null,
    improvement_text: input.improvement_text ?? null,
    challenges: input.challenges ?? null,
    injuries: input.injuries ?? null,
    raw_survey: input.raw_survey ?? null,
  });
  if (!row) return { ok: false, error: "insert failed" };

  revalidatePath("/client/check-ins");
  revalidatePath("/client");
  revalidatePath(`/coach/clients/${targetClientId}`);
  revalidatePath(`/coach/clients/${targetClientId}/check-ins`);
  return { ok: true, data: { id: row.id } };
}

export async function uploadProgressPhoto(formData: FormData): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const file = formData.get("file") as File | null;
  const view = (formData.get("view") as string | null) ?? "other";
  const checkInId = (formData.get("check_in_id") as string | null) || null;
  if (!file) return { ok: false, error: "no file" };

  const supabase = createSupabaseAdmin();
  const path = `${me.id}/${Date.now()}-${view}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("progress-photos").upload(path, file, {
    upsert: false,
    contentType: file.type
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data, error } = await supabase
    .from("progress_photos")
    .insert({
      client_id: me.id,
      check_in_id: checkInId,
      storage_path: path,
      view
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "row insert failed" };
  return { ok: true, data };
}

"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

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
};

type Result = { ok: true; data: { id: string } } | { ok: false; error: string };

export async function submitCheckIn(input: CheckInInput): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const supabase = await createSupabaseServer();
  // grab assigned coach to stamp the row
  const { data: cd } = await supabase
    .from("client_details")
    .select("coach_id")
    .eq("profile_id", me.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("check_ins")
    .insert({
      client_id: me.id,
      coach_id: cd?.coach_id ?? null,
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
      raw_survey: input.raw_survey ?? null
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };

  revalidatePath("/client");
  revalidatePath(`/coach/clients/${me.id}`);
  return { ok: true, data };
}

export async function uploadProgressPhoto(formData: FormData): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };

  const file = formData.get("file") as File | null;
  const view = (formData.get("view") as string | null) ?? "other";
  const checkInId = (formData.get("check_in_id") as string | null) || null;
  if (!file) return { ok: false, error: "no file" };

  const supabase = await createSupabaseServer();
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

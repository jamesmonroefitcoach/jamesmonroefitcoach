"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

export type OfferInput = {
  id?: string;
  starts_at: string;
  ends_at: string;
  notes?: string | null;
  notify_only: boolean;
  target_tier?: "tier_1" | "tier_2" | "tier_3" | null;
  target_client_ids: string[];
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function saveSlotOffer(input: OfferInput): Promise<Result<{ id: string }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();

  let offerId = input.id;
  if (offerId) {
    const { error } = await supabase.from("slot_offers").update({
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes ?? null,
      notify_only: input.notify_only,
      target_tier: input.target_tier ?? null
    }).eq("id", offerId).eq("coach_id", me.id);
    if (error) return { ok: false, error: error.message };
    await supabase.from("slot_offer_targets").delete().eq("slot_offer_id", offerId);
  } else {
    const { data, error } = await supabase.from("slot_offers").insert({
      coach_id: me.id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes ?? null,
      notify_only: input.notify_only,
      target_tier: input.target_tier ?? null,
      status: "open"
    }).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
    offerId = data.id;
  }

  if (input.target_client_ids.length) {
    await supabase.from("slot_offer_targets").insert(
      input.target_client_ids.map((cid) => ({ slot_offer_id: offerId!, client_id: cid, can_claim: !input.notify_only }))
    );
  }

  revalidatePath("/coach/availability");
  return { ok: true, data: { id: offerId! } };
}

export async function cancelSlotOffer(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("slot_offers")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/availability");
  return { ok: true };
}

export async function deleteSlotOffer(id: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("slot_offers").delete().eq("id", id).eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/availability");
  return { ok: true };
}

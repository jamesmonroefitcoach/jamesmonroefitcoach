import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";

export type SlotOffer = {
  id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: "open" | "claimed" | "cancelled";
  notify_only: boolean;
  target_tier: "tier_1" | "tier_2" | "tier_3" | null;
  target_client_ids: string[];
  claimed_by: string | null;
  claimed_at: string | null;
};

const DEMO: SlotOffer[] = [
  {
    id: "demo-offer-1",
    starts_at: (() => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(11, 0, 0, 0); return d.toISOString(); })(),
    ends_at: (() => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(12, 0, 0, 0); return d.toISOString(); })(),
    notes: "Open hour — anyone in tier 1 can grab it",
    status: "open",
    notify_only: false,
    target_tier: "tier_1",
    target_client_ids: [],
    claimed_by: null,
    claimed_at: null
  },
  {
    id: "demo-offer-2",
    starts_at: (() => { const d = new Date(); d.setDate(d.getDate() + 4); d.setHours(15, 0, 0, 0); return d.toISOString(); })(),
    ends_at: (() => { const d = new Date(); d.setDate(d.getDate() + 4); d.setHours(16, 0, 0, 0); return d.toISOString(); })(),
    notes: "Notifying Acacia & Jen — first to text claims",
    status: "open",
    notify_only: true,
    target_tier: null,
    target_client_ids: ["demo-client-acacia", "demo-client-jen"],
    claimed_by: null,
    claimed_at: null
  }
];

export async function listSlotOffers(coachId: string): Promise<SlotOffer[]> {
  if (!hasSupabaseEnv()) return DEMO;
  const supabase = await createSupabaseServer();
  const { data: offers } = await supabase
    .from("slot_offers")
    .select("id, starts_at, ends_at, notes, status, notify_only, target_tier, claimed_by, claimed_at")
    .eq("coach_id", coachId)
    .order("starts_at", { ascending: true });
  if (!offers) return [];
  const ids = offers.map((o) => o.id);
  const { data: targets } = ids.length
    ? await supabase.from("slot_offer_targets").select("slot_offer_id, client_id").in("slot_offer_id", ids)
    : { data: [] as { slot_offer_id: string; client_id: string }[] };
  const byId: Record<string, string[]> = {};
  (targets ?? []).forEach((t: any) => { (byId[t.slot_offer_id] ??= []).push(t.client_id); });
  return offers.map((o: any) => ({ ...o, target_client_ids: byId[o.id] ?? [] }));
}

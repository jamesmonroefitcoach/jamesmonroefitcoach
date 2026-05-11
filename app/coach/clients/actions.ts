"use server";

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type ProspectInput = {
  full_name: string;
  phone?: string;
  email?: string;
  where_met?: string;
  connection?: string;
  last_followed_up?: string;
  notes?: string;
};

export async function addProspect(input: ProspectInput): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("prospects").insert({
    coach_id: user.id,
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    where_met: input.where_met?.trim() || null,
    connection: input.connection?.trim() || null,
    last_followed_up: input.last_followed_up || null,
    notes: input.notes?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  return { ok: true };
}

export async function logProspectFollowUp(
  prospectId: string,
  date: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("prospects")
    .update({ last_followed_up: date, updated_at: new Date().toISOString() })
    .eq("id", prospectId)
    .eq("coach_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  return { ok: true };
}

export async function updateProspect(
  prospectId: string,
  input: ProspectInput
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("prospects")
    .update({
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      where_met: input.where_met?.trim() || null,
      connection: input.connection?.trim() || null,
      last_followed_up: input.last_followed_up || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId)
    .eq("coach_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  return { ok: true };
}

export async function quickUpdateClient(
  clientId: string,
  input: { tier?: string | null; session_rate?: number | null; regular_frequency?: string | null; lifecycle?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && !user.is_admin)) return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const payload: Record<string, unknown> = {};
  if (input.tier !== undefined) payload.tier = input.tier || null;
  if (input.session_rate !== undefined) payload.session_rate = input.session_rate;
  if (input.regular_frequency !== undefined) payload.regular_frequency = input.regular_frequency?.trim() || null;
  if (input.lifecycle !== undefined) payload.lifecycle = input.lifecycle || null;

  if (!Object.keys(payload).length) return { ok: true };

  const { error } = await supabase.from("client_details").update(payload).eq("profile_id", clientId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true };
}

export async function deleteProspect(prospectId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("prospects")
    .delete()
    .eq("id", prospectId)
    .eq("coach_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  return { ok: true };
}

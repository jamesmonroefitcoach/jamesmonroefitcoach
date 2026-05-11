"use server";

import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
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

  const supabase = await createSupabaseServer();
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

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("prospects")
    .update({ last_followed_up: date, updated_at: new Date().toISOString() })
    .eq("id", prospectId)
    .eq("coach_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  return { ok: true };
}

export async function deleteProspect(prospectId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("prospects")
    .delete()
    .eq("id", prospectId)
    .eq("coach_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/clients");
  return { ok: true };
}

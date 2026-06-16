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
  input: { tier?: string | null; session_rate?: number | null; regular_frequency?: string | null; lifecycle?: string | null; needs_at_home_programming?: boolean }
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
  if (input.needs_at_home_programming !== undefined) payload.needs_at_home_programming = input.needs_at_home_programming;

  if (!Object.keys(payload).length) return { ok: true };

  const { error } = await supabase.from("client_details").update(payload).eq("profile_id", clientId);
  if (error) return { ok: false, error: error.message };

  // Rate propagation — when the client's session_rate changes, pull
  // every future, non-cancelled appointment for this client up to the
  // new rate so already-scheduled programs reflect current pricing.
  // Past sessions (or cancelled / no-show) keep their historical rate.
  if (input.session_rate !== undefined && input.session_rate !== null) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("appointments")
      .update({ rate: input.session_rate })
      .eq("client_id", clientId)
      .eq("session_type", "session")
      .gte("starts_at", nowIso)
      .not("status", "in", "(cancelled,no_show)");
  }

  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach/schedule");
  revalidatePath("/coach/programming");
  revalidatePath("/coach/programming/build");
  revalidatePath("/coach");
  return { ok: true };
}

// Convert a prospect row into an actual client profile. Mirrors the
// minimum subset of fields the clients table cares about (name, contact,
// notes -> goals) and removes the prospect entry on success so it
// doesn't show up in the prospects table anymore.
export async function activateProspect(prospectId: string): Promise<{ ok: boolean; error?: string; clientId?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/clients");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { data: p, error: readErr } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (readErr || !p) return { ok: false, error: readErr?.message ?? "prospect not found" };

  const newId = crypto.randomUUID();
  const { error: profileErr } = await supabase.from("profiles").insert({
    id: newId,
    full_name: p.full_name,
    email: p.email,
    role: "client",
  });
  if (profileErr) return { ok: false, error: profileErr.message };

  const detailsRow: Record<string, unknown> = {
    profile_id: newId,
    coach_id: user.id,
    lifecycle: "active",
    phone: p.phone,
    notes: p.notes,
    goals: p.notes ?? null,
  };
  await supabase.from("client_details").insert(detailsRow);

  await supabase.from("prospects").delete().eq("id", prospectId).eq("coach_id", user.id);

  revalidatePath("/coach/clients");
  revalidatePath("/coach");
  return { ok: true, clientId: newId };
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

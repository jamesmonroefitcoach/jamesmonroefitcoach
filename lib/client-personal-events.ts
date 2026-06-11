// Client-owned personal events — server-only helpers for the /client calendar.
// Writes always check the session user explicitly (the admin client bypasses
// RLS) so a logged-in client only sees / modifies their own rows.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

export type ClientPersonalEvent = {
  id: string;
  client_id: string;
  title: string;
  starts_at: string;          // ISO
  ends_at: string | null;     // ISO or null (all-day / no end)
  notes: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id, client_id, title, starts_at, ends_at, notes, color, created_at, updated_at";

export async function listClientPersonalEvents(
  clientId: string,
  range?: { from: string; to: string }
): Promise<ClientPersonalEvent[]> {
  if (!hasSupabaseEnv()) return [];
  let q = createSupabaseAdmin()
    .from("client_personal_events")
    .select(COLS)
    .eq("client_id", clientId)
    .order("starts_at", { ascending: true });
  if (range) {
    q = q.gte("starts_at", range.from).lt("starts_at", range.to);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data as unknown as ClientPersonalEvent[];
}

export type CreateInput = {
  client_id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  notes?: string | null;
  color?: string | null;
};

export async function createClientPersonalEvent(
  input: CreateInput
): Promise<ClientPersonalEvent | null> {
  if (!hasSupabaseEnv()) return null;
  const row = {
    client_id: input.client_id,
    title: input.title,
    starts_at: input.starts_at,
    ends_at: input.ends_at ?? null,
    notes: input.notes ?? null,
    color: input.color ?? null,
  };
  const { data, error } = await createSupabaseAdmin()
    .from("client_personal_events")
    .insert(row)
    .select(COLS)
    .single();
  if (error || !data) return null;
  return data as unknown as ClientPersonalEvent;
}

export type UpdateInput = {
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  notes?: string | null;
  color?: string | null;
};

export async function updateClientPersonalEvent(
  id: string,
  clientId: string,
  patch: UpdateInput
): Promise<ClientPersonalEvent | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await createSupabaseAdmin()
    .from("client_personal_events")
    .update(patch)
    .eq("id", id)
    .eq("client_id", clientId)
    .select(COLS)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ClientPersonalEvent;
}

export async function deleteClientPersonalEvent(
  id: string,
  clientId: string
): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const { error } = await createSupabaseAdmin()
    .from("client_personal_events")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId);
  return !error;
}

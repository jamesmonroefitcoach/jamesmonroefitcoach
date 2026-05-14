"use server";

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

// Save a client-created program. The client is the requester; the coach is
// derived from the client_details row. is_published is false (clients don't
// publish — that's a coach action) but created_by_client is true so the
// program shows up under "Created" on both the client portal and the coach
// profile's Past Programs widget.

export type SaveClientProgramInput = {
  // If set, updates the existing program; otherwise creates a new one.
  id?: string;
  name: string;
  program_kind: "in_gym" | "at_home";
  duration_weeks?: number | null;
  at_home_cadence?: string | null;
  // Whatever shape the client builder uses — stored as JSON.
  builder_state: unknown;
};

export async function saveClientProgram(
  input: SaveClientProgramInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const me = await getSessionUser();
  if (!me || me.role !== "client") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!input.name.trim()) return { ok: false, error: "Program needs a name." };

  const supabase = createSupabaseAdmin();
  // Find the client's coach to populate coach_id (programs.coach_id is NOT NULL).
  const { data: details } = await supabase
    .from("client_details")
    .select("coach_id")
    .eq("profile_id", me.id)
    .maybeSingle();
  const coachId = (details as any)?.coach_id;
  if (!coachId) return { ok: false, error: "No coach assigned to you yet — ask James to set up your account." };

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    program_kind: input.program_kind,
    duration_weeks: input.duration_weeks ?? null,
    at_home_cadence: input.at_home_cadence ?? null,
    builder_state: input.builder_state ?? null,
    is_published: false,
    created_by_client: true,
    coach_id: coachId,
    client_id: me.id,
  };

  if (input.id) {
    const { error } = await supabase
      .from("programs")
      .update(payload)
      .eq("id", input.id)
      .eq("client_id", me.id)
      .eq("created_by_client", true);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/client/programming");
    revalidatePath(`/client/programming/view/${input.id}`);
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase
    .from("programs")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/client/programming");
  return { ok: true, id: (data as any).id };
}

"use server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

// Manually assign a row to a library movement and mark it as 'manual' so
// it never gets re-mapped automatically on subsequent syncs.
export async function assignMovementToRow(
  programMovementId: string,
  movementId: string
): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.role !== "coach" && me.role !== "admin" && !me.is_admin) {
    return { ok: false, error: "Coach only." };
  }
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const { error } = await createSupabaseAdmin()
    .from("program_movements")
    .update({ movement_id: movementId, mapping_source: "manual" })
    .eq("id", programMovementId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/programming/library/review");
  return { ok: true };
}

// Create a brand-new library movement from the row's text and assign it.
export async function createMovementFromRow(
  programMovementId: string,
  input: { name: string; category: string; equipment?: string | null }
): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.role !== "coach" && me.role !== "admin" && !me.is_admin) {
    return { ok: false, error: "Coach only." };
  }
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!input.name.trim()) return { ok: false, error: "Name is required." };

  const supabase = createSupabaseAdmin();
  const { data: created, error: createErr } = await supabase
    .from("movements")
    .insert({
      name: input.name.trim(),
      category: input.category,
      equipment: input.equipment?.trim() || null,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (createErr || !created) return { ok: false, error: createErr?.message ?? "create failed" };

  const { error: assignErr } = await supabase
    .from("program_movements")
    .update({ movement_id: created.id, mapping_source: "manual" })
    .eq("id", programMovementId);
  if (assignErr) return { ok: false, error: assignErr.message };

  revalidatePath("/coach/programming/library/review");
  return { ok: true, data: { id: created.id } };
}

// Keep an auto-mapped row as-is but lock it (auto → manual) so it never
// gets re-mapped on subsequent syncs.
export async function confirmMapping(programMovementId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.role !== "coach" && me.role !== "admin" && !me.is_admin) {
    return { ok: false, error: "Coach only." };
  }
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const { error } = await createSupabaseAdmin()
    .from("program_movements")
    .update({ mapping_source: "manual" })
    .eq("id", programMovementId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/programming/library/review");
  return { ok: true };
}

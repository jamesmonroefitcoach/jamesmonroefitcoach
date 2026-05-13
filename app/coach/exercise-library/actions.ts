"use server";

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { Category } from "@/lib/programs";

export type MovementInput = {
  name: string;
  category: Category;
  subcategory?: string;
  muscles?: string[];
  equipment_list?: string[];
  equipment_specifics?: string;
  cues?: string;
  demo_url?: string;
};

export async function addMovement(
  input: MovementInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/exercise-library");
    return { ok: true, id: `static-${Date.now()}` };
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("movements")
    .insert({
      name: input.name.trim(),
      category: input.category,
      subcategory: input.subcategory?.trim() || null,
      muscles: input.muscles ?? [],
      equipment_list: input.equipment_list ?? [],
      equipment_specifics: input.equipment_specifics?.trim() || null,
      cues: input.cues?.trim() || null,
      demo_url: input.demo_url?.trim() || null,
      is_core: false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/exercise-library");
  revalidatePath("/coach/programming/build");
  return { ok: true, id: data.id };
}

export async function updateMovement(
  id: string,
  input: MovementInput
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/exercise-library");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("movements")
    .update({
      name: input.name.trim(),
      category: input.category,
      subcategory: input.subcategory?.trim() || null,
      muscles: input.muscles ?? [],
      equipment_list: input.equipment_list ?? [],
      equipment_specifics: input.equipment_specifics?.trim() || null,
      cues: input.cues?.trim() || null,
      demo_url: input.demo_url?.trim() || null,
      is_core: false,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/exercise-library");
  revalidatePath("/coach/programming/build");
  return { ok: true };
}

export async function archiveMovement(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") return { ok: false, error: "unauthorized" };

  if (!hasSupabaseEnv()) {
    revalidatePath("/coach/exercise-library");
    return { ok: true };
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("movements")
    .update({ archived: true })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/exercise-library");
  revalidatePath("/coach/programming/build");
  return { ok: true };
}

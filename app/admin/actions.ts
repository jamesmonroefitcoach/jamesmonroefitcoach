"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

export async function approveAccountRequest(reqId: string, coachId?: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "admin") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();

  const { data: req } = await supabase.from("account_requests").select("*").eq("id", reqId).maybeSingle();
  if (!req) return { ok: false, error: "request not found" };

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .insert({
      role: req.desired_role,
      full_name: req.full_name,
      email: req.email,
      phone: req.phone,
      approval_status: "approved"
    })
    .select("id")
    .single();
  if (profErr || !profile) return { ok: false, error: profErr?.message ?? "profile insert failed" };

  if (req.desired_role === "client") {
    await supabase.from("client_details").insert({
      profile_id: profile.id,
      coach_id: coachId ?? "00000000-0000-0000-0000-00000000c0a4"
    });
  } else if (req.desired_role === "coach") {
    await supabase.from("coach_details").insert({ profile_id: profile.id });
  }

  await supabase
    .from("account_requests")
    .update({
      status: "approved",
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      resulting_profile_id: profile.id
    })
    .eq("id", reqId);

  revalidatePath("/admin");
  revalidatePath("/coach/clients");
  return { ok: true };
}

export async function rejectAccountRequest(reqId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "admin") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("account_requests")
    .update({ status: "rejected", approved_by: me.id, approved_at: new Date().toISOString() })
    .eq("id", reqId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export type SignupInput = {
  full_name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
};

export async function submitSignupRequest(input: SignupInput): Promise<Result> {
  if (!input.full_name?.trim() || !input.email?.trim()) return { ok: false, error: "name and email required" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("account_requests").insert({
    full_name: input.full_name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || null,
    message: input.message?.trim() || null,
    desired_role: "client",
    status: "pending"
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

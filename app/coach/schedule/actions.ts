"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { AppointmentRow } from "@/lib/data";

export type ApptInput = {
  appt_id?: string;
  starts_at: string;
  ends_at: string;
  session_type: "session" | "personal";
  personal_label?: string | null;
  client_id?: string | null;
  rate?: number | null;
  paid?: boolean;
  status: AppointmentRow["status"];
  notes?: string | null;
  session_program_id?: string | null;
  program_status?: "programmed" | "needs_programming" | "n/a";
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function saveAppointment(input: ApptInput): Promise<Result<{ id: string; change_count: number }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and ANON_KEY in .env.local." };

  const supabase = await createSupabaseServer();
  const isPersonal = input.session_type === "personal";

  const payload = {
    coach_id: me.id,
    client_id: isPersonal ? null : input.client_id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    session_type: input.session_type,
    personal_label: isPersonal ? input.personal_label ?? null : null,
    is_blocking: isPersonal,
    rate: isPersonal ? null : input.rate ?? null,
    paid: input.paid ?? false,
    status: input.status,
    notes: input.notes ?? null,
    session_program_id: input.session_program_id ?? null,
    updated_at: new Date().toISOString()
  };

  if (input.appt_id) {
    // detect time change for change_count bump + log row
    const { data: prior } = await supabase
      .from("appointments")
      .select("starts_at, change_count")
      .eq("id", input.appt_id)
      .maybeSingle();
    let nextChangeCount = prior?.change_count ?? 0;
    if (prior?.starts_at && prior.starts_at !== input.starts_at) {
      nextChangeCount += 1;
      await supabase.from("schedule_changes").insert({
        appointment_id: input.appt_id,
        changed_by: me.id,
        before_starts_at: prior.starts_at,
        after_starts_at: input.starts_at,
        reason: "coach edit"
      });
    }
    const { data, error } = await supabase
      .from("appointments")
      .update({ ...payload, change_count: nextChangeCount })
      .eq("id", input.appt_id)
      .select("id, change_count")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/coach/schedule");
    revalidatePath("/coach");
    return { ok: true, data };
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({ ...payload, change_count: 0 })
    .select("id, change_count")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  return { ok: true, data };
}

export async function deleteAppointment(apptId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("appointments").delete().eq("id", apptId).eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  return { ok: true };
}

export async function requestSessionChange(apptId: string, kind: "reschedule" | "cancel", note?: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("appointments")
    .update({ status: "change_requested", notes: note ? `[${kind}] ${note}` : `[${kind}]` })
    .eq("id", apptId)
    .eq("client_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/client");
  revalidatePath("/coach/schedule");
  return { ok: true };
}

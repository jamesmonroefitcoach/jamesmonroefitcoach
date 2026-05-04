"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import type { AppointmentRow } from "@/lib/data";

export type RepeatInput = {
  enabled: boolean;
  cadence_weeks: 1 | 2;       // weekly or biweekly
  occurrences: number;        // how many to materialize (incl. first)
};

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
  repeat?: RepeatInput;
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

  // Repeat materialization: create a series row + N appointment rows
  if (input.repeat?.enabled && input.repeat.occurrences > 1 && !isPersonal) {
    const startBase = new Date(input.starts_at);
    const endBase = new Date(input.ends_at);
    const durationMin = Math.max(1, Math.round((endBase.getTime() - startBase.getTime()) / 60000));

    const { data: series, error: serErr } = await supabase
      .from("appointment_series")
      .insert({
        coach_id: me.id,
        client_id: input.client_id ?? null,
        starts_at: startBase.toISOString(),
        duration_min: durationMin,
        weekday: startBase.getDay(),
        cadence_weeks: input.repeat.cadence_weeks,
        occurrences: input.repeat.occurrences,
        rate: input.rate ?? null,
        notes: input.notes ?? null
      })
      .select("id")
      .single();
    if (serErr || !series) return { ok: false, error: serErr?.message ?? "series insert failed" };

    const rows: any[] = [];
    for (let i = 0; i < input.repeat.occurrences; i++) {
      const s = new Date(startBase);
      s.setDate(s.getDate() + i * 7 * input.repeat.cadence_weeks);
      const e = new Date(s.getTime() + durationMin * 60000);
      rows.push({
        ...payload,
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        change_count: 0,
        series_id: series.id
      });
    }
    const { data: inserted, error: insErr } = await supabase.from("appointments").insert(rows).select("id, change_count");
    if (insErr) return { ok: false, error: insErr.message };
    revalidatePath("/coach/schedule");
    revalidatePath("/coach");
    return { ok: true, data: { id: inserted?.[0]?.id ?? "", change_count: 0 } };
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

export async function cancelSeries(seriesId: string, opts: { fromDate?: string } = {}): Promise<Result<{ count: number }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  let q = supabase.from("appointments").update({ status: "cancelled" }).eq("series_id", seriesId).eq("coach_id", me.id);
  if (opts.fromDate) q = q.gte("starts_at", opts.fromDate);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  return { ok: true, data: { count: (data ?? []).length } };
}

export async function approveChangeRequest(apptId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();
  const { data: prior } = await supabase
    .from("appointments")
    .select("starts_at, change_count, requested_starts_at, requested_ends_at")
    .eq("id", apptId)
    .maybeSingle();
  if (!prior?.requested_starts_at) return { ok: false, error: "no requested time" };
  await supabase.from("schedule_changes").insert({
    appointment_id: apptId,
    changed_by: me.id,
    before_starts_at: prior.starts_at,
    after_starts_at: prior.requested_starts_at,
    reason: "client request approved"
  });
  const { error } = await supabase
    .from("appointments")
    .update({
      starts_at: prior.requested_starts_at,
      ends_at: prior.requested_ends_at,
      status: "scheduled",
      change_count: (prior.change_count ?? 0) + 1,
      requested_starts_at: null,
      requested_ends_at: null,
      requested_reason: null
    })
    .eq("id", apptId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach/appointments");
  return { ok: true };
}

export async function denyChangeRequest(apptId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createSupabaseServer();

  // Pull the appt so we can notify the client *before* deleting it.
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, client_id, starts_at, requested_starts_at, requested_reason")
    .eq("id", apptId)
    .maybeSingle();

  // Delete the session itself.
  const { error: delErr } = await supabase.from("appointments").delete().eq("id", apptId);
  if (delErr) return { ok: false, error: delErr.message };

  // Notify the client — find/create a thread, drop a message in.
  if (appt?.client_id) {
    const { data: thread } = await supabase
      .from("message_threads")
      .upsert(
        { coach_id: me.id, client_id: appt.client_id, topic: null },
        { onConflict: "coach_id,client_id,topic" }
      )
      .select("id")
      .single();
    if (thread?.id) {
      const orig = appt.starts_at ? new Date(appt.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "your session";
      const proposed = appt.requested_starts_at ? ` for ${new Date(appt.requested_starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";
      await supabase.from("messages").insert({
        thread_id: thread.id,
        sender_id: me.id,
        body: `Heads up — I wasn't able to accommodate your reschedule request${proposed} (${orig}). I cancelled that session; reach out and we'll find another slot.`
      });
    }
  }

  revalidatePath("/coach/schedule");
  revalidatePath("/coach/appointments");
  revalidatePath("/client");
  revalidatePath("/client/messages");
  return { ok: true };
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

"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";
import { listAppointmentsForWeek, listAppointmentsForMonth, type AppointmentRow } from "@/lib/data";
import type { CancelReason } from "@/lib/cancel-reasons";
import {
  autoFillCategoryForWeek,
  reorganizeCategoryForWeek,
  type AutoFillResult,
} from "@/lib/goal-scheduler.server";

// Auto-flip past sessions that are still 'scheduled' to 'completed'.
// Reflects the rule: past = completed unless explicitly marked
// otherwise (cancelled/no_show/change_requested). Idempotent — only
// touches rows that actually need flipping.
export async function autoCompletePastScheduled(): Promise<{ updated: number }> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { updated: 0 };
  if (!hasSupabaseEnv()) return { updated: 0 };

  const supabase = createSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "completed" })
    .eq("coach_id", me.id)
    .eq("session_type", "session")
    .eq("status", "scheduled")
    .lt("starts_at", nowIso)
    .select("id");
  if (error) return { updated: 0 };
  return { updated: data?.length ?? 0 };
}

export async function fetchWeekAppts(weekStart: string): Promise<AppointmentRow[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  return listAppointmentsForWeek(me.id, new Date(weekStart));
}

export async function fetchMonthAppts(monthStart: string): Promise<AppointmentRow[]> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return [];
  return listAppointmentsForMonth(me.id, new Date(monthStart));
}

export type RepeatInput = {
  enabled: boolean;
  cadence_weeks: 1 | 2;
  occurrences: number;
};

export type ApptInput = {
  appt_id?: string;
  starts_at: string;
  ends_at: string;
  session_type: "session" | "personal";
  personal_label?: string | null;
  /** Optional goal tag for personal blocks — drives schedule block color
   *  and feeds weekly goal-progress rollups. */
  goal_id?: string | null;
  client_id?: string | null;
  rate?: number | null;
  paid?: boolean;
  status: AppointmentRow["status"];
  notes?: string | null;
  session_program_id?: string | null;
  program_status?: "programmed" | "draft" | "needs_programming" | "n/a";
  cancel_reason?: CancelReason | null;
  cancel_reason_other?: string | null;
  repeat?: RepeatInput;
};

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function saveAppointment(input: ApptInput): Promise<Result<{ id: string; change_count: number }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and ANON_KEY in .env.local." };

  const supabase = createSupabaseAdmin();
  const isPersonal = input.session_type === "personal";

  const isCancelled = input.status === "cancelled" || input.status === "no_show";
  const payload = {
    coach_id: me.id,
    client_id: isPersonal ? null : input.client_id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    session_type: input.session_type,
    personal_label: isPersonal ? input.personal_label ?? null : null,
    // goal_id only sticks on personal blocks for now.
    goal_id: isPersonal ? input.goal_id ?? null : null,
    is_blocking: isPersonal,
    rate: isPersonal ? null : input.rate ?? null,
    paid: input.paid ?? false,
    status: input.status,
    notes: input.notes ?? null,
    session_program_id: input.session_program_id ?? null,
    cancel_reason: isCancelled ? (input.cancel_reason ?? null) : null,
    cancel_reason_other: isCancelled && input.cancel_reason === "other" ? (input.cancel_reason_other ?? null) : null,
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
    revalidatePath("/coach/clients", "layout");
    return { ok: true, data };
  }

  // Repeat materialization: create a series row + N appointment rows.
  // Works for both sessions and personal blocks — appointment_series
  // allows a null client_id, so a Sleep block series (or Piano, or
  // anything else James schedules nightly/weekly) flows through the
  // same path. Each materialized row inherits the payload's
  // personal_label, goal_id, is_blocking, etc.
  if (input.repeat?.enabled && input.repeat.occurrences > 1) {
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

export type EditSeriesInput = {
  series_id: string;
  from_date: string;          // ISO — update this appointment and all future ones in the series
  rate?: number | null;
  notes?: string | null;
  time_offset_min?: number;   // shift starts_at/ends_at by this many minutes (a whole-day
                              // multiple here also moves the series' day of week)
  duration_min?: number;      // when set, normalise every appointment's length to this
};

export async function editSeries(input: EditSeriesInput): Promise<Result<{ count: number }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();

  const baseUpdates: Record<string, unknown> = {};
  if (input.rate !== undefined) baseUpdates.rate = input.rate;
  if (input.notes !== undefined) baseUpdates.notes = input.notes;

  const offset = input.time_offset_min ?? 0;
  // Per-row pass when the time shifts (covers day-of-week via whole-day
  // multiples) or the duration is being normalised across the series.
  if (offset || input.duration_min !== undefined) {
    const { data: rows, error: fetchErr } = await supabase
      .from("appointments")
      .select("id, starts_at, ends_at")
      .eq("series_id", input.series_id)
      .eq("coach_id", me.id)
      .gte("starts_at", input.from_date)
      .not("status", "in", '("cancelled","no_show")');
    if (fetchErr) return { ok: false, error: fetchErr.message };
    for (const a of rows ?? []) {
      const newStart = new Date(new Date(a.starts_at).getTime() + offset * 60000);
      const newEnd = input.duration_min !== undefined
        ? new Date(newStart.getTime() + input.duration_min * 60000)
        : new Date(new Date(a.ends_at).getTime() + offset * 60000);
      const { error } = await supabase.from("appointments").update({
        ...baseUpdates,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString()
      }).eq("id", a.id);
      if (error) return { ok: false, error: error.message };
    }
  } else if (Object.keys(baseUpdates).length > 0) {
    const { error } = await supabase
      .from("appointments")
      .update(baseUpdates)
      .eq("series_id", input.series_id)
      .eq("coach_id", me.id)
      .gte("starts_at", input.from_date)
      .not("status", "in", '("cancelled","no_show")');
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  revalidatePath("/coach/clients", "layout");
  return { ok: true, data: { count: 0 } };
}

export async function cancelSeries(seriesId: string, opts: { fromDate?: string } = {}): Promise<Result<{ count: number }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  let q = supabase.from("appointments").update({ status: "cancelled" }).eq("series_id", seriesId).eq("coach_id", me.id);
  if (opts.fromDate) q = q.gte("starts_at", opts.fromDate);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach/clients", "layout");
  return { ok: true, data: { count: (data ?? []).length } };
}

// Add more occurrences to the end of a series, following its existing cadence
// (inferred from the gap between the last two appointments; defaults to weekly).
export async function extendSeries(seriesId: string, addCount: number): Promise<Result<{ count: number }>> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const n = Math.max(1, Math.min(52, Math.floor(addCount || 0)));
  const supabase = createSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("appointments")
    .select("client_id, coach_id, starts_at, ends_at, session_type, rate, call_type, notes")
    .eq("series_id", seriesId)
    .eq("coach_id", me.id)
    .order("starts_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  if (!rows || rows.length === 0) return { ok: false, error: "Series not found." };
  const last = rows[rows.length - 1] as Record<string, unknown> & { starts_at: string; ends_at: string };
  let cadenceDays = 7;
  if (rows.length >= 2) {
    const prev = rows[rows.length - 2] as { starts_at: string };
    const gap = Math.round((new Date(last.starts_at).getTime() - new Date(prev.starts_at).getTime()) / 86400000);
    if (gap >= 1) cadenceDays = gap;
  }
  const dayMs = 86400000;
  const inserts = [];
  for (let i = 1; i <= n; i++) {
    const start = new Date(new Date(last.starts_at).getTime() + i * cadenceDays * dayMs);
    const end = new Date(new Date(last.ends_at).getTime() + i * cadenceDays * dayMs);
    inserts.push({
      client_id: last.client_id,
      coach_id: last.coach_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      session_type: last.session_type,
      rate: last.rate,
      call_type: last.call_type,
      notes: last.notes,
      series_id: seriesId,
      status: "scheduled",
      change_count: 0,
    });
  }
  const { error: insErr } = await supabase.from("appointments").insert(inserts);
  if (insErr) return { ok: false, error: insErr.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  return { ok: true, data: { count: n } };
}

export async function approveChangeRequest(apptId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
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
  revalidatePath("/coach/clients", "layout");
  return { ok: true };
}

export async function denyChangeRequest(apptId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();

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
  revalidatePath("/coach/clients", "layout");
  revalidatePath("/client");
  revalidatePath("/client/messages");
  return { ok: true };
}

export async function markApptPaid(apptId: string, paid: boolean): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("appointments")
    .update({ paid, updated_at: new Date().toISOString() })
    .eq("id", apptId)
    .eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  revalidatePath("/coach/clients", "layout");
  return { ok: true };
}

// Inline-edit helpers for the dashboard's All Sessions Summary table.
// Smaller blast radius than going through saveAppointment (which expects
// the full edit-panel payload). Same revalidations so the change shows
// up on the schedule, dashboard totals, and client roster.

export async function setApptRate(apptId: string, rate: number | null): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    return { ok: false, error: "Rate must be a non-negative number." };
  }
  const { error } = await createSupabaseAdmin()
    .from("appointments")
    .update({ rate, updated_at: new Date().toISOString() })
    .eq("id", apptId)
    .eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  revalidatePath("/coach/clients", "layout");
  return { ok: true };
}

export async function setApptStatus(
  apptId: string,
  status: AppointmentRow["status"],
  opts: { cancel_reason?: string | null; cancel_reason_other?: string | null } = {},
): Promise<Result> {
  const me = await getSessionUser();
  if (!me || me.role !== "coach") return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  // Cancelled or no-show requires a reason; mirrors the rule in the
  // schedule's edit panel so inline edits can't bypass it.
  const needsReason = status === "cancelled" || status === "no_show";
  if (needsReason && !opts.cancel_reason) {
    return { ok: false, error: "Cancellation reason required." };
  }
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (needsReason) {
    payload.cancel_reason = opts.cancel_reason;
    payload.cancel_reason_other =
      opts.cancel_reason === "other" ? (opts.cancel_reason_other ?? null) : null;
  } else {
    // Status moved off cancelled — clear any stale reason fields.
    payload.cancel_reason = null;
    payload.cancel_reason_other = null;
  }
  const { error } = await createSupabaseAdmin()
    .from("appointments")
    .update(payload)
    .eq("id", apptId)
    .eq("coach_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/schedule");
  revalidatePath("/coach");
  revalidatePath("/coach/clients", "layout");
  return { ok: true };
}

export async function deleteAppointment(apptId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const isCoachLike = me.role === "coach" || me.role === "admin" || me.is_admin;
  if (!isCoachLike) return { ok: false, error: "Only coaches can delete appointments." };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  if (!apptId || typeof apptId !== "string") return { ok: false, error: "Missing appointment id." };

  const supabase = createSupabaseAdmin();
  try {
    // Look it up first so we can give a clear "not found / not yours" message
    // instead of letting the .eq filter silently no-op (the previous version
    // returned ok=true even when the coach_id filter excluded the row).
    const { data: existing, error: lookupErr } = await supabase
      .from("appointments")
      .select("id, coach_id, session_type")
      .eq("id", apptId)
      .maybeSingle();
    if (lookupErr) {
      console.error("[deleteAppointment] lookup error", { apptId, error: lookupErr.message });
      return { ok: false, error: `Couldn't load appointment: ${lookupErr.message}` };
    }
    if (!existing) {
      return { ok: false, error: "Appointment not found — it may have already been deleted." };
    }
    // Coaches can delete their own appointments; admins can delete any.
    const isAdmin = me.is_admin || me.role === "admin";
    if (!isAdmin && existing.coach_id && existing.coach_id !== me.id) {
      return { ok: false, error: "This appointment belongs to another coach." };
    }

    const { error: delErr } = await supabase.from("appointments").delete().eq("id", apptId);
    if (delErr) {
      console.error("[deleteAppointment] delete error", { apptId, error: delErr.message });
      return { ok: false, error: delErr.message };
    }

    revalidatePath("/coach/schedule");
    revalidatePath("/coach");
    revalidatePath("/coach/clients", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[deleteAppointment] threw", { apptId, error: e });
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

export async function requestSessionChange(apptId: string, kind: "reschedule" | "cancel", note?: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = createSupabaseAdmin();
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

// ── Goal auto-scheduling ─────────────────────────────────────────────
// Wraps the lib/goal-scheduler functions in server actions the
// schedule-view chip buttons can call directly.

export async function autoFillGoal(
  category: { id: string; name: string; goals: { id: string; name: string; kind: string }[] },
  targetWeekly: number,
): Promise<AutoFillResult> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  const result = await autoFillCategoryForWeek(me.id, category, targetWeekly);
  if (result.ok) {
    revalidatePath("/coach/schedule");
    revalidatePath("/coach");
  }
  return result;
}

export async function reorganizeGoal(
  category: { id: string; name: string; goals: { id: string; name: string; kind: string }[] },
  targetWeekly: number,
): Promise<AutoFillResult> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "unauthorized" };
  const result = await reorganizeCategoryForWeek(me.id, category, targetWeekly);
  if (result.ok) {
    revalidatePath("/coach/schedule");
    revalidatePath("/coach");
  }
  return result;
}

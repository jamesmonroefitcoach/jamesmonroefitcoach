"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { AppointmentRow, ClientRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { saveAppointment, deleteAppointment, approveChangeRequest, denyChangeRequest, cancelSeries, editSeries, fetchWeekAppts, fetchMonthAppts } from "./actions";
import { CANCEL_REASONS, CANCEL_REASON_LABELS } from "@/lib/cancel-reasons";

const HOUR_HEIGHT = 56; // px per hour cell
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6a–7p (start hours)
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type View = "week" | "month";

function startOfWeekLocal(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayIndex(d: Date): number { return (d.getDay() + 6) % 7; }
function minutesFromTop(d: Date): number { return (d.getHours() - HOURS[0]) * 60 + d.getMinutes(); }
function minToPx(min: number): number { return min * HOUR_HEIGHT / 60; }
function pxFromTop(d: Date): number { return minToPx(minutesFromTop(d)); }

const STATUS_COLORS: Record<AppointmentRow["status"], { bg: string; fg: string }> = {
  scheduled:        { bg: "#5b6d7a", fg: "#fff" },
  completed:        { bg: "#5a6b4a", fg: "#fff" },
  cancelled:        { bg: "#c0392b", fg: "#fff" },
  no_show:          { bg: "#7a3a55", fg: "#fff" },
  change_requested: { bg: "#d97706", fg: "#fff" }
};

const PERSONAL_COLOR = { bg: "#3a342f", fg: "#f5efe4" };
const ONLINE_COLOR   = { bg: "#1e6a8c", fg: "#ffffff" };

// ─── side-panel form state ──────────────────────────────────────────
type Draft = {
  appt_id?: string;
  starts_at: string;
  ends_at: string;
  session_type: "session" | "personal";
  personal_label: string;
  client_id: string;
  rate: string;
  paid: boolean;
  status: AppointmentRow["status"];
  notes: string;
  session_program_id: string;
  program_status: "programmed" | "draft" | "needs_programming" | "n/a";
  cancel_reason: string;
  cancel_reason_other: string;
  change_count: number;
  series_id?: string | null;
  call_type: "voice" | "video" | null;
  // repeat config (only used when creating new)
  repeat_enabled: boolean;
  repeat_cadence: 1 | 2;
  repeat_count: number;
};

function newDraft(starts_at: Date, ends_at: Date): Draft {
  return {
    starts_at: starts_at.toISOString(),
    ends_at: ends_at.toISOString(),
    session_type: "session",
    personal_label: "",
    client_id: "",
    rate: "",
    paid: false,
    status: "scheduled",
    notes: "",
    session_program_id: "",
    program_status: "needs_programming",
    cancel_reason: "",
    cancel_reason_other: "",
    change_count: 0,
    call_type: null,
    repeat_enabled: false,
    repeat_cadence: 1,
    repeat_count: 8
  };
}

function fromAppt(a: AppointmentRow): Draft {
  return {
    appt_id: a.id,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    session_type: a.session_type,
    personal_label: a.personal_label ?? "",
    client_id: a.client_id ?? "",
    rate: a.rate?.toString() ?? "",
    paid: a.paid,
    status: a.status,
    notes: a.notes ?? "",
    session_program_id: a.session_program_id ?? "",
    program_status: a.program_status,
    cancel_reason: (a as any).cancel_reason ?? "",
    cancel_reason_other: (a as any).cancel_reason_other ?? "",
    change_count: a.change_count,
    call_type: a.call_type ?? null,
    series_id: a.series_id ?? null,
    repeat_enabled: false,
    repeat_cadence: 1,
    repeat_count: 8
  };
}

// ─── overlap layout: lane assignment for side-by-side rendering ─────
type Laid = AppointmentRow & { lane: number; lanes: number };
function layOutDay(events: AppointmentRow[]): Laid[] {
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const lanes: { end: number }[] = [];
  const placed: Laid[] = [];
  for (const ev of sorted) {
    const startMs = new Date(ev.starts_at).getTime();
    const endMs = new Date(ev.ends_at).getTime();
    let lane = lanes.findIndex((l) => l.end <= startMs);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push({ end: endMs });
    } else {
      lanes[lane].end = endMs;
    }
    placed.push({ ...ev, lane, lanes: 0 });
  }
  // resolve "lanes" — for each event, max(lane+1) of all events overlapping it
  return placed.map((p) => {
    const ps = new Date(p.starts_at).getTime();
    const pe = new Date(p.ends_at).getTime();
    let maxLane = p.lane;
    placed.forEach((q) => {
      const qs = new Date(q.starts_at).getTime();
      const qe = new Date(q.ends_at).getTime();
      if (qs < pe && qe > ps) maxLane = Math.max(maxLane, q.lane);
    });
    return { ...p, lanes: maxLane + 1 };
  });
}

export default function ScheduleView({
  weekStart,
  monthStart,
  initialView,
  weekAppts,
  monthAppts,
  clients
}: {
  weekStart: string;
  monthStart: string;
  initialView: View;
  weekAppts: AppointmentRow[];
  monthAppts: AppointmentRow[];
  clients: ClientRow[];
}) {
  const [view, setView] = useState<View>(initialView);
  // Parse "YYYY-MM-DD" as local midnight (not UTC) to avoid timezone shift
  const [ws, setWs] = useState(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  const [ms, setMs] = useState(() => {
    const [y, m] = monthStart.split("-").map(Number);
    return new Date(y, m - 1, 1, 0, 0, 0, 0);
  });
  const [appts, setAppts] = useState<AppointmentRow[]>(weekAppts);
  const [monthCache, setMonthCache] = useState<AppointmentRow[]>(monthAppts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savePending, startSave] = useTransition();
  const [fetching, startFetch] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragClientId, setDragClientId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: number; hour: number } | null>(null);
  const [editingChangeCount, setEditingChangeCount] = useState(false);
  const [seriesScope, setSeriesScope] = useState<"series" | null>(null);
  const [clientsBarOpen, setClientsBarOpen] = useState(false);
  const touchDragRef = useRef<{ clientId: string; startX: number; startY: number; moved: boolean } | null>(null);

  const today = new Date();

  // Reset edit modes when switching between appointments
  useEffect(() => { setEditingChangeCount(false); setSeriesScope(null); }, [draft?.appt_id]);

  function shiftWeek(deltaDays: number) {
    const next = new Date(ws);
    next.setDate(next.getDate() + deltaDays);
    setWs(next);
    startFetch(async () => {
      const data = await fetchWeekAppts(next.toISOString());
      setAppts(data);
    });
  }
  function jumpToDate(iso: string) {
    if (!iso) return;
    const [y, m, d] = iso.split("-").map(Number);
    const next = startOfWeekLocal(new Date(y, m - 1, d));
    setWs(next);
    startFetch(async () => {
      const data = await fetchWeekAppts(next.toISOString());
      setAppts(data);
    });
  }
  function shiftMonth(delta: number) {
    const next = new Date(ms);
    next.setMonth(next.getMonth() + delta);
    setMs(next);
    startFetch(async () => {
      const data = await fetchMonthAppts(next.toISOString());
      setMonthCache(data);
    });
  }

  // Daily totals exclude personal blocks; cancellations stay in for visibility but not in revenue.
  const dayTotals = useMemo(() => {
    return DAYS.map((_, idx) => {
      // Same convention as the dashboard chart: a session counts if it
      // wasn't a no-show. Cancelled sessions DO count toward revenue
      // (cancellation fee charged) and toward the count.
      const list = appts.filter((a) =>
        dayIndex(new Date(a.starts_at)) === idx
        && a.session_type === "session"
        && a.status !== "no_show"
      );
      return {
        revenue: list.reduce((acc, b) => acc + (b.rate ?? 0), 0),
        count: list.length
      };
    });
  }, [appts]);

  const weekRevenue = dayTotals.reduce((acc, d) => acc + d.revenue, 0);

  function openCreate(day: number, hour: number) {
    const d = new Date(ws);
    d.setDate(d.getDate() + day);
    d.setHours(hour, 0, 0, 0);
    const e = new Date(d);
    e.setHours(hour + 1);
    setDraft(newDraft(d, e));
  }
  function openEdit(a: AppointmentRow) { setDraft(fromAppt(a)); }
  function close() { setDraft(null); setSaveError(null); setPickerOpen(false); setPickerQuery(""); setEditingChangeCount(false); setSeriesScope(null); }
  function openNewBooking() {
    const now = new Date();
    // Default to the next full hour, clamped to 7am–6pm, on today (or Monday of current week)
    const base = sameDay(now, today) ? new Date(now) : new Date(ws);
    base.setMinutes(0, 0, 0);
    if (sameDay(now, today)) base.setHours(Math.min(18, Math.max(7, now.getHours() + 1)));
    else base.setHours(9, 0, 0, 0);
    const end = new Date(base);
    end.setHours(end.getHours() + 1);
    setDraft(newDraft(base, end));
  }

  function openNewBookingForClient(clientId: string) {
    const now = new Date();
    const base = sameDay(now, today) ? new Date(now) : new Date(ws);
    base.setMinutes(0, 0, 0);
    if (sameDay(now, today)) base.setHours(Math.min(18, Math.max(7, now.getHours() + 1)));
    else base.setHours(9, 0, 0, 0);
    const end = new Date(base);
    end.setHours(end.getHours() + 1);
    const nd = newDraft(base, end);
    const client = clients.find((c) => c.id === clientId);
    setDraft({ ...nd, client_id: clientId, rate: client?.session_rate?.toString() ?? nd.rate });
  }

  // ─── Touch drag: pill → time cell ──────────────────────────────────
  function onPillTouchStart(e: React.TouchEvent<HTMLElement>, clientId: string) {
    const t = e.touches[0];
    touchDragRef.current = { clientId, startX: t.clientX, startY: t.clientY, moved: false };
  }
  function onPillTouchMove(e: React.TouchEvent<HTMLElement>) {
    if (!touchDragRef.current) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - touchDragRef.current.startX) > 10 ||
        Math.abs(t.clientY - touchDragRef.current.startY) > 10) {
      touchDragRef.current.moved = true;
    }
  }
  function onPillTouchEnd(e: React.TouchEvent<HTMLElement>) {
    const state = touchDragRef.current;
    touchDragRef.current = null;
    if (!state) return;
    const { clientId, moved } = state;
    const touch = e.changedTouches[0];
    if (moved) {
      // Briefly hide the pill so elementFromPoint sees what's beneath it
      const el = e.currentTarget as HTMLElement;
      el.style.pointerEvents = "none";
      const under = document.elementFromPoint(touch.clientX, touch.clientY);
      el.style.pointerEvents = "";
      const cell = under?.closest("[data-timecell]") as HTMLElement | null;
      if (cell) {
        const dayIdx = parseInt(cell.getAttribute("data-day") ?? "0");
        const hour   = parseInt(cell.getAttribute("data-hour") ?? "9");
        const d = new Date(ws);
        d.setDate(d.getDate() + dayIdx);
        d.setHours(hour, 0, 0, 0);
        const end = new Date(d.getTime() + 3600000);
        const nd = newDraft(d, end);
        const c = clients.find((cl) => cl.id === clientId);
        setDraft({ ...nd, client_id: clientId, rate: c?.session_rate?.toString() ?? nd.rate });
        return;
      }
    }
    // Tap (or drag that missed a cell): open booking with client pre-filled
    openNewBookingForClient(clientId);
  }

  function applyLocalSave() {
    if (!draft) return;
    if (draft.appt_id) {
      const isSeriesEdit = seriesScope === "series" && !!draft.series_id;
      // Compute time delta for series propagation
      const origAppt = isSeriesEdit ? appts.find((a) => a.id === draft.appt_id) : null;
      const timeOffsetMs = origAppt
        ? new Date(draft.starts_at).getTime() - new Date(origAppt.starts_at).getTime()
        : 0;
      const newDurMs = new Date(draft.ends_at).getTime() - new Date(draft.starts_at).getTime();

      setAppts((cur) =>
        cur.map((a) => {
          const isSelf = a.id === draft.appt_id;
          const isFutureSeries = isSeriesEdit
            && a.series_id === draft.series_id
            && a.starts_at >= draft.starts_at
            && !isSelf;

          if (isSelf) {
            const movedTime = a.starts_at !== draft.starts_at;
            return {
              ...a,
              starts_at: draft.starts_at,
              ends_at: draft.ends_at,
              session_type: draft.session_type,
              personal_label: draft.session_type === "personal" ? draft.personal_label || null : null,
              is_blocking: draft.session_type === "personal",
              client_id: draft.session_type === "personal" ? null : draft.client_id || null,
              client_name: draft.session_type === "personal" ? null : clients.find((c) => c.id === draft.client_id)?.full_name ?? null,
              rate: draft.session_type === "personal" ? null : (Number(draft.rate) || null),
              paid: draft.paid,
              status: draft.status,
              notes: draft.notes || null,
              session_program_id: draft.session_program_id || null,
              program_status: draft.session_type === "personal" ? "n/a" : draft.program_status,
              call_type: draft.session_type === "session" ? (draft.call_type ?? null) : null,
              change_count: movedTime ? a.change_count + 1 : a.change_count
            } satisfies AppointmentRow;
          }

          if (isFutureSeries) {
            // Propagate rate, notes, and time shift to all future series appointments
            const aStartMs = new Date(a.starts_at).getTime();
            const aEndMs   = new Date(a.ends_at).getTime();
            const newStart = timeOffsetMs !== 0 ? new Date(aStartMs + timeOffsetMs) : new Date(a.starts_at);
            const newEnd   = timeOffsetMs !== 0 ? new Date(newStart.getTime() + newDurMs) : new Date(aEndMs);
            return {
              ...a,
              starts_at: newStart.toISOString(),
              ends_at:   newEnd.toISOString(),
              rate: Number(draft.rate) || null,
              notes: draft.notes || null,
            };
          }

          return a;
        })
      );
    } else {
      const id = `local-${Date.now()}`;
      setAppts((cur) => [...cur, {
        id,
        client_id: draft.session_type === "personal" ? null : draft.client_id || null,
        client_name: draft.session_type === "personal" ? null : clients.find((c) => c.id === draft.client_id)?.full_name ?? null,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        status: draft.status,
        rate: draft.session_type === "personal" ? null : (Number(draft.rate) || null),
        paid: draft.paid,
        notes: draft.notes || null,
        change_count: 0,
        session_type: draft.session_type,
        personal_label: draft.session_type === "personal" ? (draft.personal_label || null) : null,
        is_blocking: draft.session_type === "personal",
        session_program_id: draft.session_program_id || null,
        program_status: draft.session_type === "personal" ? "n/a" : draft.program_status,
        call_type: draft.session_type === "session" ? (draft.call_type ?? null) : null,
      }]);
    }
  }

  function saveDraft() {
    if (!draft) return;
    setSaveError(null);
    startSave(async () => {
      // Series edit: propagate rate/notes/time to this and all future series appointments
      if (draft.appt_id && seriesScope === "series" && draft.series_id) {
        const origAppt = appts.find((a) => a.id === draft.appt_id);
        const timeOffsetMin = origAppt
          ? Math.round((new Date(draft.starts_at).getTime() - new Date(origAppt.starts_at).getTime()) / 60000)
          : 0;
        const res = await editSeries({
          series_id: draft.series_id,
          from_date: draft.starts_at,
          rate: draft.rate ? Number(draft.rate) : null,
          notes: draft.notes || null,
          time_offset_min: timeOffsetMin || undefined,
        });
        if (!res.ok) {
          if (res.error.startsWith("Supabase not configured")) {
            applyLocalSave();
            close();
            return;
          }
          setSaveError(res.error);
          return;
        }
        applyLocalSave();
        close();
        return;
      }

      const res = await saveAppointment({
        appt_id: draft.appt_id,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        session_type: draft.session_type,
        personal_label: draft.personal_label || null,
        client_id: draft.client_id || null,
        rate: draft.rate ? Number(draft.rate) : null,
        paid: draft.paid,
        status: draft.status,
        notes: draft.notes || null,
        session_program_id: draft.session_program_id || null,
        program_status: draft.program_status,
        cancel_reason: draft.cancel_reason ? (draft.cancel_reason as any) : null,
        cancel_reason_other: draft.cancel_reason === "other" ? draft.cancel_reason_other || null : null,
        repeat: !draft.appt_id && draft.repeat_enabled ? {
          enabled: true,
          cadence_weeks: draft.repeat_cadence,
          occurrences: Math.max(1, draft.repeat_count)
        } : undefined
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          applyLocalSave();
          close();
          return;
        }
        setSaveError(res.error);
        return;
      }
      applyLocalSave();
      close();
    });
  }

  function deleteDraft() {
    if (!draft?.appt_id) return;
    const id = draft.appt_id;
    setSaveError(null);
    startSave(async () => {
      const res = await deleteAppointment(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setSaveError(res.error);
        return;
      }
      setAppts((cur) => cur.filter((a) => a.id !== id));
      close();
    });
  }

  function cancelDraftSeries() {
    if (!draft?.series_id) return;
    const seriesId = draft.series_id;
    const fromDate = draft.starts_at;
    setSaveError(null);
    startSave(async () => {
      const res = await cancelSeries(seriesId, { fromDate });
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setSaveError(res.error);
        return;
      }
      // Remove all future series appointments from local state
      setAppts((cur) => cur.filter((a) => !(a.series_id === seriesId && a.starts_at >= fromDate)));
      close();
    });
  }

  function approveCR(id: string) {
    setSaveError(null);
    startSave(async () => {
      const res = await approveChangeRequest(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setSaveError(res.error);
        return;
      }
      setAppts((cur) =>
        cur.map((a) =>
          a.id !== id ? a : a.requested_starts_at
            ? { ...a, status: "scheduled", starts_at: a.requested_starts_at, ends_at: a.requested_ends_at!, change_count: a.change_count + 1, requested_starts_at: null, requested_ends_at: null, requested_reason: null }
            : { ...a, status: "scheduled" }
        )
      );
    });
  }
  function denyCR(id: string) {
    setSaveError(null);
    startSave(async () => {
      const res = await denyChangeRequest(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setSaveError(res.error);
        return;
      }
      setAppts((cur) =>
        cur.map((a) =>
          a.id === id ? { ...a, status: "scheduled", requested_starts_at: null, requested_ends_at: null, requested_reason: null } : a
        )
      );
    });
  }

  function quickStatus(status: AppointmentRow["status"]) {
    if (!draft) return;
    setDraft({ ...draft, status });
  }

  // ─── DRAG & DROP ─────────────────────────────────────────────────
  function onCellDrop(day: number, hour: number) {
    if (!dragId) return;
    const target = appts.find((a) => a.id === dragId);
    if (!target) { setDragId(null); return; }
    const oldStart = new Date(target.starts_at);
    const oldEnd = new Date(target.ends_at);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const newStart = new Date(ws);
    newStart.setDate(newStart.getDate() + day);
    newStart.setHours(hour, 0, 0, 0);
    if (newStart.getTime() === oldStart.getTime()) { setDragId(null); return; }
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Optimistic local move so the visual updates instantly.
    setAppts((cur) =>
      cur.map((a) => a.id !== dragId ? a : {
        ...a,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
        change_count: a.change_count + 1,
      })
    );
    setDragId(null);

    // Persist to Supabase so the move sticks across reloads. We send the
    // full appointment state so existing fields (status, paid, cancel
    // reason, etc.) stay intact — important for cancelled personal blocks
    // that otherwise wouldn't survive a refresh.
    startSave(async () => {
      const res = await saveAppointment({
        appt_id: target.id,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
        session_type: target.session_type,
        personal_label: target.personal_label ?? null,
        client_id: target.client_id ?? null,
        rate: target.rate ?? null,
        paid: target.paid,
        status: target.status,
        notes: target.notes ?? null,
        session_program_id: target.session_program_id ?? null,
        program_status: target.program_status,
        cancel_reason: null,
        cancel_reason_other: null,
      });
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        // Revert the optimistic move on hard failure.
        setAppts((cur) =>
          cur.map((a) => a.id !== target.id ? a : {
            ...a,
            starts_at: target.starts_at,
            ends_at: target.ends_at,
            change_count: target.change_count,
          })
        );
        setSaveError(res.error);
      }
    });
  }

  // ─── month view aggregation ─────────────────────────────────────
  const monthBlocks = useMemo(() => {
    const byDay: Record<string, AppointmentRow[]> = {};
    monthCache.forEach((a) => {
      const k = new Date(a.starts_at).toISOString().slice(0, 10);
      (byDay[k] ??= []).push(a);
    });
    Object.values(byDay).forEach((list) => list.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    return byDay;
  }, [monthCache]);

  const monthDays = useMemo(() => {
    const first = new Date(ms);
    const last = new Date(ms);
    last.setMonth(last.getMonth() + 1);
    last.setDate(0);
    const startOffset = (first.getDay() + 6) % 7;
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [ms]);

  // Same convention as the dashboard chart segments:
  //   paid      = $ paid (any non-cancelled session)
  //   unpaid    = $ booked but uncollected (non-cancelled, non-no-show)
  //   cancelled = $ from cancelled sessions (fee charged)
  // Replaces the prior 'completed / scheduled / unpaid' which silently
  // excluded scheduled-unpaid from the 'unpaid' total and ignored
  // cancellation fees entirely.
  const monthTotals = useMemo(() => {
    let paid = 0, unpaid = 0, cancelled = 0;
    let paidN = 0, unpaidN = 0, cancelledN = 0;
    monthCache.forEach((a) => {
      if (a.session_type !== "session") return;
      if (a.status === "no_show") return;
      const rate = a.rate ?? 0;
      if (a.status === "cancelled") {
        cancelled += rate; cancelledN += 1;
      } else if (a.paid) {
        paid += rate; paidN += 1;
      } else {
        unpaid += rate; unpaidN += 1;
      }
    });
    return { paid, unpaid, cancelled, paidN, unpaidN, cancelledN };
  }, [monthCache]);

  // Which clients have at least one non-cancelled session this week
  const sessionClientIdsThisWeek = useMemo(() => new Set(
    appts
      .filter((a) => a.status !== "cancelled" && a.status !== "no_show" && a.session_type === "session" && a.client_id)
      .map((a) => a.client_id!)
  ), [appts]);

  const activeClients = useMemo(() =>
    clients.filter((c) => c.lifecycle === "active" || c.lifecycle === "online"),
  [clients]);

  // Used elsewhere (drag hint etc.) — kept for convenience
  const noSessionClients = useMemo(() =>
    activeClients.filter((c) => !sessionClientIdsThisWeek.has(c.id)),
  [activeClients, sessionClientIdsThisWeek]);

  // Per-client session counts for the current calendar month, derived live from monthCache
  const clientMonthlyStats = useMemo(() => {
    const stats: Record<string, { done: number; sched: number }> = {};
    monthCache.forEach((a) => {
      if (a.session_type !== "session" || !a.client_id) return;
      if (a.status === "cancelled" || a.status === "no_show") return;
      const s = (stats[a.client_id] ??= { done: 0, sched: 0 });
      if (a.status === "completed") s.done++; else s.sched++;
    });
    return stats;
  }, [monthCache]);

  // Hide the original block while editing (we render a ghost in its place)
  const editingId = draft?.appt_id;

  return (
    <div style={{ position: "relative" }}>
      <div className="card no-print" style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          onClick={openNewBooking}
          style={{ padding: "0.4rem 0.9rem", fontSize: "0.82rem", fontWeight: 600 }}
        >
          + New Booking
        </button>

        <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 0.1rem" }} />

        <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
          <button onClick={() => setView("week")} className="btn" style={{ borderRadius: 0, borderColor: "transparent", background: view === "week" ? "var(--ink)" : "transparent", color: view === "week" ? "var(--paper)" : undefined, padding: "0.4rem 0.9rem" }}>Week</button>
          <button onClick={() => setView("month")} className="btn" style={{ borderRadius: 0, borderColor: "transparent", background: view === "month" ? "var(--ink)" : "transparent", color: view === "month" ? "var(--paper)" : undefined, padding: "0.4rem 0.9rem" }}>Month</button>
        </div>

        {view === "week" ? (
          <>
            <button className="btn btn-ghost" onClick={() => shiftWeek(-7)} style={{ padding: "0.35rem 0.65rem" }}>‹ prev</button>
            <button className="btn btn-ghost" onClick={() => {
              const next = startOfWeekLocal(new Date());
              setWs(next);
              startFetch(async () => {
                const data = await fetchWeekAppts(next.toISOString());
                setAppts(data);
              });
            }} style={{ padding: "0.35rem 0.65rem" }}>Today</button>
            <button className="btn btn-ghost" onClick={() => shiftWeek(7)} style={{ padding: "0.35rem 0.65rem" }}>next ›</button>
            <input type="date" className="input" style={{ width: 170 }} value={`${ws.getFullYear()}-${String(ws.getMonth()+1).padStart(2,"0")}-${String(ws.getDate()).padStart(2,"0")}`} onChange={(e) => jumpToDate(e.target.value)} />
            <span className="meta" style={{ marginLeft: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <strong style={{ color: "var(--ink)" }}>
                Week of {ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </strong>
              {(() => {
                const thisWeekStart = startOfWeekLocal(new Date());
                const same = ws.getTime() === thisWeekStart.getTime();
                return same ? (
                  <span
                    style={{
                      fontFamily: "Oswald, sans-serif",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontSize: "0.6rem",
                      fontWeight: 600,
                      color: "var(--rust)",
                      border: "1px solid var(--rust)",
                      padding: "0.1rem 0.45rem",
                      borderRadius: 999,
                    }}
                    title="You're viewing this week"
                  >
                    this week
                  </span>
                ) : null;
              })()}
              {fetching && <span style={{ marginLeft: "0.25rem", opacity: 0.6 }}>loading…</span>}
            </span>
            <span className="meta" style={{ marginLeft: "auto" }}>
              {dayTotals.reduce((a, d) => a + d.count, 0)} sessions · <strong style={{ color: "var(--ink)" }}>{fmtMoney(weekRevenue)}</strong>
            </span>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => shiftMonth(-1)} style={{ padding: "0.35rem 0.65rem" }} title="Previous month">‹ prev</button>
            <button className="btn btn-ghost" onClick={() => {
              const next = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
              setMs(next);
              startFetch(async () => {
                const data = await fetchMonthAppts(next.toISOString());
                setMonthCache(data);
              });
            }} style={{ padding: "0.35rem 0.65rem" }} title="Jump to current month">This month</button>
            <button className="btn btn-ghost" onClick={() => shiftMonth(1)} style={{ padding: "0.35rem 0.65rem" }} title="Next month">next ›</button>
            <span className="meta" style={{ marginLeft: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <strong style={{ color: "var(--ink)" }}>
                {ms.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </strong>
              {(ms.getFullYear() === today.getFullYear() && ms.getMonth() === today.getMonth()) && (
                <span
                  style={{
                    fontFamily: "Oswald, sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    color: "var(--rust)",
                    border: "1px solid var(--rust)",
                    padding: "0.1rem 0.45rem",
                    borderRadius: 999,
                  }}
                  title="You're viewing the current month"
                >
                  this month
                </span>
              )}
              {fetching && <span style={{ marginLeft: "0.25rem", opacity: 0.6 }}>loading…</span>}
            </span>
            <span className="meta" style={{ marginLeft: "auto" }} title={`paid ${monthTotals.paidN} · unpaid ${monthTotals.unpaidN} · cancelled ${monthTotals.cancelledN}`}>
              paid <strong style={{ color: "var(--sage)" }}>{fmtMoney(monthTotals.paid)}</strong>
              {" · "}unpaid <strong style={{ color: "var(--steel)" }}>{fmtMoney(monthTotals.unpaid)}</strong>
              {monthTotals.cancelled > 0 && (
                <>
                  {" · "}cancelled <strong style={{ color: "var(--rust)" }}>{fmtMoney(monthTotals.cancelled)}</strong>
                </>
              )}
            </span>
          </>
        )}
      </div>

      {/* ─── Scheduling bar: drag/tap client pills onto the calendar ─── */}
      {view === "week" && (
        <div className="no-print" style={{
          marginTop: "1rem",
          border: "1px solid var(--line)",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => setClientsBarOpen((o) => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(0,0,0,0.02)",
              border: "none",
              borderBottom: clientsBarOpen ? "1px solid var(--line)" : "none",
              padding: "0.4rem 0.75rem",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>
              {clientsBarOpen ? "▾" : "▸"} Clients &amp; Status
            </span>
            <span style={{ fontSize: "0.69rem", color: "var(--muted)" }}>
              {noSessionClients.length === 0
                ? <span style={{ color: "var(--sage)", fontWeight: 600 }}>✓ All scheduled</span>
                : `${noSessionClients.length} unscheduled`}
            </span>
          </button>

          {clientsBarOpen && (
          <div style={{ padding: "0.45rem 0.75rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
            {noSessionClients.length === 0 && (
              <span style={{ fontSize: "0.72rem", color: "var(--sage)", fontWeight: 600, marginRight: "0.2rem", flexShrink: 0 }}>
                ✓ All scheduled
              </span>
            )}
            {activeClients.map((c) => {
              const stats = clientMonthlyStats[c.id] ?? { done: 0, sched: 0 };
              const monthTotal = stats.done + stats.sched;
              const monthlyTarget = c.regular_frequency ? Math.round(parseFloat(c.regular_frequency)) : null;
              const hasSessionThisWeek = sessionClientIdsThisWeek.has(c.id);
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "copy";
                    setDragClientId(c.id);
                  }}
                  onDragEnd={() => { setDragClientId(null); setDropTarget(null); }}
                  onTouchStart={(e) => onPillTouchStart(e, c.id)}
                  onTouchMove={onPillTouchMove}
                  onTouchEnd={onPillTouchEnd}
                  onClick={() => { if (!dragClientId) openNewBookingForClient(c.id); }}
                  style={{
                    fontSize: "0.76rem",
                    padding: "0.2rem 0.45rem 0.2rem 0.38rem",
                    borderRadius: 3,
                    border: `1px solid ${!hasSessionThisWeek ? "var(--amber)" : "rgba(90,107,74,0.35)"}`,
                    background: !hasSessionThisWeek ? "rgba(217,119,6,0.05)" : "rgba(90,107,74,0.05)",
                    color: "var(--ink)",
                    cursor: "grab",
                    userSelect: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    WebkitUserSelect: "none",
                    touchAction: "none",
                  }}
                >
                  <span style={{ color: "var(--muted)", fontSize: "0.68rem", lineHeight: 1 }}>⠿</span>
                  <span>{c.full_name}</span>
                  {monthlyTarget != null && (
                    <span style={{
                      fontSize: "0.64rem",
                      color: monthTotal >= monthlyTarget ? "var(--sage)" : "var(--muted)",
                      background: "rgba(0,0,0,0.07)",
                      borderRadius: 2,
                      padding: "0.05rem 0.22rem",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.4,
                    }}>
                      {monthTotal}/{monthlyTarget}
                    </span>
                  )}
                </div>
              );
            })}
            {dragClientId && (
              <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontStyle: "italic", flexBasis: "100%", marginTop: "0.15rem" }}>
                Drop onto a time slot to schedule a session
              </span>
            )}
          </div>
          </div>
          )}
        </div>
      )}

      {/* ─── WEEK VIEW ─── */}
      {view === "week" ? (
        <div
          className="card"
          style={{
            marginTop: "1rem",
            padding: 0,
            overflow: "auto",
            // Bound the card so it becomes its own scrollport — required for
            // the day-header row's position:sticky top:0 to actually pin
            // during vertical scroll. Without this, the page would scroll
            // and the whole card (sticky headers and all) goes with it.
            maxHeight: "calc(100vh - 200px)",
          }}
        >
          <div style={{ minWidth: 980, display: "grid", gridTemplateColumns: "70px repeat(7, 1fr)" }}>
            {/* header row — corner cell sticks to top+left (highest z so it
                wins both seams); day headers stick to top so they stay
                visible while vertically scrolling past the grid. */}
            <div
              style={{
                borderBottom: "1px solid var(--line)",
                borderRight: "1px solid var(--line)",
                background: "var(--paper)",
                position: "sticky",
                left: 0,
                top: 0,
                zIndex: 30,
              }}
            ></div>
            {DAYS.map((d, i) => {
              const date = new Date(ws);
              date.setDate(ws.getDate() + i);
              const isToday = sameDay(date, today);
              // Backgrounds need to be fully opaque while sticky so events
              // scrolling underneath don't bleed through. Today's tint is
              // composited over the cream paper base.
              const headerBg = isToday
                ? "linear-gradient(rgba(168,61,43,0.10), rgba(168,61,43,0.10)), var(--paper)"
                : "var(--paper)";
              return (
                <div key={d} style={{
                  textAlign: "center",
                  padding: "0.55rem 0.4rem",
                  borderBottom: "1px solid var(--line)",
                  borderLeft: "1px solid var(--line)",
                  background: headerBg,
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: isToday ? "var(--rust)" : undefined }}>
                    {d}{isToday ? " · today" : ""}
                  </div>
                  <div className="meta" style={{ fontSize: "0.74rem" }}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  <div className="meta" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
                    {dayTotals[i].count} sess · <strong style={{ color: "var(--ink)" }}>{fmtMoney(dayTotals[i].revenue)}</strong>
                  </div>
                </div>
              );
            })}

            {/* time gutter — sticky-left, z above event blocks (which use
                z 2 and 3) so events scrolling underneath stay clipped. */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: `repeat(${HOURS.length}, ${HOUR_HEIGHT}px)`,
                position: "sticky",
                left: 0,
                zIndex: 10,
                background: "var(--paper)",
                borderRight: "1px solid var(--line)",
                boxShadow: "2px 0 4px rgba(0,0,0,0.06)",
              }}
            >
              {HOURS.map((h) => (
                <div key={h} className="meta" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", textAlign: "right", borderBottom: "1px solid var(--line)" }}>
                  {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "a" : "p"}
                </div>
              ))}
            </div>

            {/* day columns with absolute-positioned events */}
            {DAYS.map((_, dayIdx) => {
              const cellDate = new Date(ws);
              cellDate.setDate(ws.getDate() + dayIdx);
              const isToday = sameDay(cellDate, today);

              // Include change_requested events at their original time (amber block);
              // a separate dashed ghost renders at the requested time below.
              const dayEvents = appts.filter((a) => dayIndex(new Date(a.starts_at)) === dayIdx);
              const laid = layOutDay(dayEvents);

              // Ghost block while editing/creating
              const showGhost = draft && (
                draft.appt_id
                  ? laid.some((e) => e.id === draft.appt_id) === false ? false : dayIndex(new Date(draft.starts_at)) === dayIdx
                  : dayIndex(new Date(draft.starts_at)) === dayIdx
              );
              const ghost = showGhost ? {
                top: pxFromTop(new Date(draft.starts_at)),
                height: Math.max(20, minToPx((new Date(draft.ends_at).getTime() - new Date(draft.starts_at).getTime()) / 60000))
              } : null;

              return (
                <div
                  key={dayIdx}
                  style={{
                    position: "relative",
                    borderLeft: "1px solid var(--line)",
                    background: isToday ? "rgba(168,61,43,0.04)" : undefined,
                    height: HOUR_HEIGHT * HOURS.length,
                    overflow: "hidden"
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const h = HOURS[0] + Math.floor(y / HOUR_HEIGHT);
                    openCreate(dayIdx, Math.max(HOURS[0], Math.min(HOURS[HOURS.length - 1], h)));
                  }}
                >
                  {/* hour gridlines */}
                  {HOURS.map((h, i) => {
                    const isDropTarget = dropTarget?.day === dayIdx && dropTarget?.hour === h;
                    return (
                      <div
                        key={h}
                        data-timecell="1"
                        data-day={dayIdx}
                        data-hour={h}
                        onDragOver={(e) => {
                          if (dragId || dragClientId) {
                            e.preventDefault();
                            if (dragClientId) setDropTarget({ day: dayIdx, hour: h });
                          }
                        }}
                        onDragLeave={() => { if (dragClientId) setDropTarget(null); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragClientId) {
                            const d = new Date(ws);
                            d.setDate(ws.getDate() + dayIdx);
                            d.setHours(h, 0, 0, 0);
                            const end = new Date(d);
                            end.setHours(h + 1);
                            const nd = newDraft(d, end);
                            const client = clients.find((c) => c.id === dragClientId);
                            setDraft({ ...nd, client_id: dragClientId, rate: client?.session_rate?.toString() ?? nd.rate });
                            setDragClientId(null);
                            setDropTarget(null);
                          } else {
                            onCellDrop(dayIdx, h);
                          }
                        }}
                        style={{
                          position: "absolute",
                          top: i * HOUR_HEIGHT,
                          left: 0,
                          right: 0,
                          height: HOUR_HEIGHT,
                          borderBottom: "1px solid var(--line)",
                          cursor: dragClientId ? "copy" : "pointer",
                          background: isDropTarget ? "rgba(90,107,74,0.18)" : undefined,
                          transition: "background 0.1s",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.target === e.currentTarget) openCreate(dayIdx, h);
                        }}
                      />
                    );
                  })}

                  {/* WIP ghost */}
                  {ghost ? (
                    <div style={{
                      position: "absolute",
                      top: ghost.top,
                      left: 4,
                      right: 4,
                      height: ghost.height,
                      background: "rgba(120,120,120,0.18)",
                      border: "1px dashed rgba(80,80,80,0.6)",
                      borderRadius: 3,
                      pointerEvents: "none",
                      zIndex: 1
                    }} />
                  ) : null}

                  {/* change-request ghosts: light grey dashed outline; only Approve/Deny actions, no edit-panel */}
                  {appts
                    .filter((a) => a.status === "change_requested" && a.requested_starts_at && dayIndex(new Date(a.requested_starts_at)) === dayIdx)
                    .map((cr) => {
                      const ps = new Date(cr.requested_starts_at!);
                      const pe = new Date(cr.requested_ends_at ?? cr.ends_at);
                      const top = pxFromTop(ps);
                      const heightPx = Math.max(36, minToPx((pe.getTime() - ps.getTime()) / 60000));
                      return (
                        <div
                          key={`cr-${cr.id}`}
                          onClick={(ev) => ev.stopPropagation()}
                          title={cr.requested_reason ?? "Change requested"}
                          style={{
                            position: "absolute",
                            top, left: 4, right: 4, height: heightPx - 2,
                            background: "rgba(200, 200, 200, 0.22)",
                            color: "#3a342f",
                            border: "1.5px dashed rgba(80,80,80,0.6)",
                            borderRadius: 3,
                            padding: "0.25rem 0.4rem",
                            fontSize: "0.72rem",
                            zIndex: 3,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            cursor: "default"
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>↻ {cr.client_name ?? "Client"} requested</div>
                          <div style={{ fontSize: "0.66rem", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cr.requested_reason ?? "(no note)"}</div>
                          <div className="no-print" style={{ display: "flex", gap: 4, marginTop: "auto" }}>
                            <button onClick={(ev) => { ev.stopPropagation(); approveCR(cr.id); }} style={{ flex: 1, fontSize: "0.62rem", padding: "0.2rem 0.3rem", background: "var(--sage)", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Approve</button>
                            <button onClick={(ev) => { ev.stopPropagation(); denyCR(cr.id); }} style={{ flex: 1, fontSize: "0.62rem", padding: "0.2rem 0.3rem", background: "var(--red)", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Deny</button>
                          </div>
                        </div>
                      );
                    })}

                  {/* events */}
                  {laid.map((e) => {
                    if (editingId === e.id) return null; // hidden while editing — ghost shows position
                    const start = new Date(e.starts_at);
                    const end = new Date(e.ends_at);
                    const top = pxFromTop(start);
                    const heightPx = Math.max(20, minToPx((end.getTime() - start.getTime()) / 60000));
                    const widthPct = 100 / e.lanes;
                    const leftPct = e.lane * widthPct;
                    const eventClient = e.client_id ? clients.find((c) => c.id === e.client_id) : null;
                    const colors = e.session_type === "personal" ? PERSONAL_COLOR
                      : eventClient?.lifecycle === "online" ? ONLINE_COLOR
                      : STATUS_COLORS[e.status];
                    const cancelled = e.status === "cancelled";
                    return (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={() => setDragId(e.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                        title={`${e.client_name ?? e.personal_label ?? "—"} — ${e.status}${e.session_type === "session" ? ` · ${e.paid ? "paid" : "unpaid"}` : ""}${e.change_count > 0 ? ` (Moved ${e.change_count}×)` : ""}`}
                        style={{
                          position: "absolute",
                          top,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          height: heightPx - 2,
                          background: colors.bg,
                          color: colors.fg,
                          padding: "0.25rem 0.4rem 0.25rem 0.55rem",
                          borderRadius: 3,
                          fontSize: "0.74rem",
                          // Left-edge paid/unpaid/cancelled accent — same colors
                          // as the dashboard chart segments (sage/steel/rust).
                          // Lets a coach scan paid vs unpaid at a glance.
                          borderLeft:
                            e.session_type !== "session" ? "none"
                            : cancelled ? "3px solid var(--rust)"
                            : e.paid ? "3px solid var(--sage)"
                            : "3px solid var(--steel)",
                          border: cancelled && e.session_type !== "session" ? "1px dashed rgba(255,255,255,0.5)" : undefined,
                          opacity: cancelled ? 0.85 : 1,
                          boxShadow: "0 1px 0 rgba(0,0,0,0.15)",
                          cursor: "grab",
                          overflow: "hidden",
                          zIndex: 2
                        }}
                      >
                        <div style={{ fontWeight: 700, textDecoration: cancelled ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {e.status === "change_requested" && <span style={{ marginRight: 3 }}>↻</span>}
                          {e.session_type === "personal"
                            ? `⛔ ${e.personal_label ?? "Personal"}`
                            : eventClient?.lifecycle === "online"
                              ? `${e.call_type === "video" ? "🎥" : e.call_type === "voice" ? "📞" : "🌐"} ${e.client_name ?? "Client"}`
                              : (e.client_name ?? "Client")
                          }
                        </div>
                        <div style={{ opacity: 0.9, display: "flex", justifyContent: "space-between", gap: 4, fontSize: "0.7rem" }}>
                          <span>
                            {e.session_type === "session" ? (
                              <>
                                {`$${e.rate ?? "—"}`}
                                {/* paid checkmark next to the rate; unpaid stays
                                    blank so the bare $ implies "owed" */}
                                {e.paid && (
                                  <span style={{ marginLeft: 3, fontSize: "0.62rem", opacity: 0.95 }} title="Paid">
                                    ✓
                                  </span>
                                )}
                              </>
                            ) : ""}
                            {e.change_count > 0 ? <span style={{ marginLeft: 6 }}>Moved {e.change_count}×</span> : null}
                          </span>
                          {e.session_type === "session" ? (
                            <span style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.04em",
                              color: e.program_status === "programmed" ? "var(--sage)"
                                : e.program_status === "draft" ? "var(--amber)"
                                : e.status === "completed" ? "var(--sage)"
                                : undefined,
                            }}>
                              {e.program_status === "programmed" ? "✓ prog"
                                : e.program_status === "draft" ? "● draft"
                                : e.status === "completed" ? "✓ hist · no file"
                                : "● need"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ─── MONTH VIEW ─── */}
      {view === "month" ? (
        <>
        {/* Color key for the day-cell tints — same language as the dashboard
            chart: sage = paid, steel = unpaid, rust = owed/cancelled. */}
        <div className="meta" style={{ display: "flex", gap: "0.85rem", marginTop: "0.85rem", fontSize: "0.7rem", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, background: "rgba(168,61,43,0.14)", border: "1px solid var(--rust)", borderRadius: 2 }} />
            owed (completed unpaid)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, background: "rgba(62,96,121,0.14)", border: "1px solid var(--steel)", borderRadius: 2 }} />
            booked (unpaid future)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, background: "rgba(90,107,74,0.14)", border: "1px solid var(--sage)", borderRadius: 2 }} />
            paid
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, background: "rgba(168,61,43,0.06)", border: "1px solid var(--rust)", borderRadius: 2 }} />
            cancelled only
          </span>
        </div>
        <div className="card" style={{ marginTop: "0.55rem", padding: 0, overflow: "auto" }}>
          <div style={{ minWidth: 760, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {DAYS.map((d) => (
              <div key={d} style={{ textAlign: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--line)", borderLeft: "1px solid var(--line)", background: "rgba(0,0,0,0.02)", fontWeight: 700, fontSize: "0.8rem" }}>{d}</div>
            ))}
            {monthDays.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} style={{ minHeight: 116, borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "rgba(0,0,0,0.015)" }} />;
              const k = date.toISOString().slice(0, 10);
              const list = (monthBlocks[k] ?? []).filter((a) => a.session_type === "session" && a.status !== "no_show");
              const completed = list.filter((a) => a.status === "completed");
              const unpaidCompleted = completed.filter((a) => !a.paid);
              const cancelledList = list.filter((a) => a.status === "cancelled");
              const unpaidAny = list.filter((a) => a.status !== "cancelled" && !a.paid);
              const allPaid = list.length > 0 && list.every((a) => a.paid || a.status === "cancelled");
              const totalDollars = list.reduce((acc, a) => acc + (a.rate ?? 0), 0);
              const isToday = sameDay(date, today);

              // Color priority matches the chart's language:
              //   rust  — money owed for completed work (urgent)
              //   steel — booked but uncollected (future bookings)
              //   sage  — everything settled / paid
              //   faint rust — cancelled only (fee paid or owed, no live work)
              let bg: string | undefined = undefined;
              let fg: string | undefined = undefined;
              if (unpaidCompleted.length > 0) {
                bg = "rgba(168,61,43,0.14)"; fg = "var(--rust)";   // completed but not paid → owed
              } else if (allPaid) {
                bg = "rgba(90,107,74,0.14)"; fg = "var(--sage)";   // everything paid
              } else if (unpaidAny.length > 0) {
                bg = "rgba(62,96,121,0.14)"; fg = "var(--steel)";  // future bookings outstanding
              } else if (cancelledList.length > 0) {
                bg = "rgba(168,61,43,0.06)"; fg = "var(--rust)";   // only cancelled today
              }

              return (
                <div key={k} style={{
                  minHeight: 116,
                  borderLeft: "1px solid var(--line)",
                  borderBottom: "1px solid var(--line)",
                  padding: "0.4rem",
                  background: isToday ? "rgba(168,61,43,0.10)" : bg,
                  color: fg
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.85rem", color: isToday ? "var(--rust)" : undefined }}>{date.getDate()}</strong>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{list.length} · {fmtMoney(totalDollars)}</span>
                  </div>
                  {list.length > 0 ? (
                    <ul style={{ listStyle: "none", margin: "0.3rem 0 0", padding: 0, fontSize: "0.7rem", lineHeight: 1.25, color: "var(--muted)" }}>
                      {list.slice(0, 4).map((a) => (
                        <li key={a.id} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {new Date(a.starts_at).toLocaleTimeString("en-US", { hour: "numeric" }).replace(" ", "")}
                          </span>
                          {" "}{a.client_name ?? "—"}
                        </li>
                      ))}
                      {list.length > 4 ? <li style={{ fontStyle: "italic" }}>+{list.length - 4} more</li> : null}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        </>
      ) : null}

      {/* ─── side panel ─── */}
      {draft ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50 }} onClick={close}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              position: "absolute",
              top: 0, right: 0, bottom: 0,
              width: "min(440px, 95vw)",
              borderRadius: 0,
              borderLeft: "1px solid var(--line)",
              padding: "1.25rem 1.4rem",
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge">{draft.appt_id ? "Edit" : "New event"}</span>
              <button className="btn btn-ghost" onClick={close} style={{ padding: "0.25rem 0.55rem" }}>Close</button>
            </div>

            <h2>
              {new Date(draft.starts_at).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </h2>

            <div>
              <label className="stat-label">Type</label>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
                <button type="button" className="btn" style={{ flex: 1, background: draft.session_type === "session" ? "var(--ink)" : undefined, color: draft.session_type === "session" ? "var(--paper)" : undefined }} onClick={() => setDraft({ ...draft, session_type: "session" })}>Client session</button>
                <button type="button" className="btn" style={{ flex: 1, background: draft.session_type === "personal" ? "var(--ink)" : undefined, color: draft.session_type === "personal" ? "var(--paper)" : undefined }} onClick={() => setDraft({ ...draft, session_type: "personal" })}>Personal block</button>
              </div>
            </div>

            {draft.session_type === "personal" ? (
              <div>
                <label className="stat-label">Label</label>
                <input className="input" placeholder="Doctor / Out of town / Lunch" value={draft.personal_label} onChange={(e) => setDraft({ ...draft, personal_label: e.target.value })} style={{ marginTop: "0.3rem" }} />
                <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.4rem" }}>Personal blocks lock the calendar — clients can't request this slot.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="stat-label">Client</label>
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      {/* Searchable client combobox */}
                      <input
                        className="input"
                        placeholder="Type to search clients…"
                        value={
                          pickerOpen
                            ? pickerQuery
                            : draft.client_id
                              ? (clients.find((x) => x.id === draft.client_id)?.full_name ?? "")
                              : ""
                        }
                        onFocus={() => {
                          setPickerOpen(true);
                          setPickerQuery("");
                        }}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        onBlur={() => {
                          // Delay so mousedown on dropdown item fires first
                          setTimeout(() => setPickerOpen(false), 150);
                        }}
                        style={{ width: "100%" }}
                        autoComplete="off"
                      />
                      {pickerOpen && (() => {
                        const q = pickerQuery.trim().toLowerCase();
                        const filtered = clients
                          .filter((c) => (c.lifecycle === "active" || c.lifecycle === "online") && (q === "" || c.full_name.toLowerCase().includes(q)))
                          .sort((a, b) => a.full_name.localeCompare(b.full_name));
                        return filtered.length > 0 ? (
                          <div style={{
                            position: "absolute",
                            top: "calc(100% + 2px)",
                            left: 0,
                            right: 0,
                            background: "var(--paper)",
                            border: "1px solid var(--line)",
                            borderRadius: 6,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            zIndex: 50,
                            maxHeight: 220,
                            overflowY: "auto",
                          }}>
                            {filtered.map((c) => (
                              <div
                                key={c.id}
                                onMouseDown={() => {
                                  setDraft({ ...draft, client_id: c.id, rate: c.session_rate?.toString() ?? draft.rate, call_type: null });
                                  setPickerOpen(false);
                                  setPickerQuery("");
                                }}
                                style={{
                                  padding: "0.45rem 0.75rem",
                                  fontSize: "0.84rem",
                                  cursor: "pointer",
                                  background: draft.client_id === c.id ? "rgba(90,107,74,0.1)" : undefined,
                                  borderBottom: "1px solid var(--line)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.4rem",
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(90,107,74,0.08)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = draft.client_id === c.id ? "rgba(90,107,74,0.1)" : ""; }}
                              >
                                {c.full_name}
                                {c.lifecycle === "online" && (
                                  <span style={{ fontSize: "0.66rem", background: "rgba(30,106,140,0.12)", color: "#1e6a8c", borderRadius: 3, padding: "0.05rem 0.3rem", fontWeight: 600 }}>online</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{
                            position: "absolute",
                            top: "calc(100% + 2px)",
                            left: 0,
                            right: 0,
                            background: "var(--paper)",
                            border: "1px solid var(--line)",
                            borderRadius: 6,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            zIndex: 50,
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.82rem",
                            color: "var(--muted)",
                          }}>
                            No active clients match
                          </div>
                        );
                      })()}
                    </div>
                    {draft.client_id ? (
                      <Link href={`/coach/clients/${draft.client_id}`} className="btn btn-ghost" style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem", whiteSpace: "nowrap" }}>view profile →</Link>
                    ) : null}
                  </div>
                </div>

                {/* Voice/video toggle — only for online clients */}
                {draft.client_id && clients.find((c) => c.id === draft.client_id)?.lifecycle === "online" && (
                  <div>
                    <label className="stat-label">Call type</label>
                    <div style={{ display: "inline-flex", marginTop: "0.3rem", border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
                      {(["voice", "video"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setDraft({ ...draft, call_type: draft.call_type === t ? null : t })}
                          style={{
                            padding: "0.3rem 0.75rem",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            border: "none",
                            borderRadius: 0,
                            cursor: "pointer",
                            background: draft.call_type === t ? ONLINE_COLOR.bg : "transparent",
                            color: draft.call_type === t ? ONLINE_COLOR.fg : "var(--ink)",
                          }}
                        >
                          {t === "voice" ? "📞 Voice" : "🎥 Video"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div>
                    <label className="stat-label">Rate ($)</label>
                    <input className="input" type="number" inputMode="decimal" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} style={{ marginTop: "0.3rem" }} />
                  </div>
                  <div>
                    <label className="stat-label">Paid?</label>
                    <select className="select" value={draft.paid ? "yes" : "no"} onChange={(e) => setDraft({ ...draft, paid: e.target.value === "yes" })} style={{ marginTop: "0.3rem" }}>
                      <option value="no">unpaid</option>
                      <option value="yes">paid</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="stat-label">Session programming</label>
                  <div style={{ marginTop: "0.4rem" }}>
                    {draft.client_id ? (
                      <Link
                        href={`/coach/programming/build?tab=session&appt=${draft.appt_id ?? ""}&client=${draft.client_id}&starts=${encodeURIComponent(draft.starts_at)}`}
                        className="btn btn-primary"
                        style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", display: "inline-block" }}
                      >
                        {draft.program_status === "programmed" ? "View session program →"
                          : draft.program_status === "draft" ? "Edit draft program →"
                          : "Add session program →"}
                      </Link>
                    ) : (
                      <span className="meta" style={{ fontSize: "0.78rem" }}>Pick a client to program this session.</span>
                    )}
                    {draft.program_status === "programmed" && (
                      <span className="badge badge-sage" style={{ marginLeft: "0.5rem", fontSize: "0.7rem" }}>published</span>
                    )}
                    {draft.program_status === "draft" && (
                      <span className="badge badge-amber" style={{ marginLeft: "0.5rem", fontSize: "0.7rem" }}>draft</span>
                    )}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="stat-label">Status</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
                {(["scheduled", "completed", "cancelled", "no_show"] as const).map((st) => (
                  <button key={st} type="button" className="btn" style={{
                    padding: "0.3rem 0.55rem",
                    fontSize: "0.7rem",
                    background: draft.status === st ? STATUS_COLORS[st].bg : undefined,
                    color: draft.status === st ? STATUS_COLORS[st].fg : undefined,
                    borderColor: draft.status === st ? STATUS_COLORS[st].bg : undefined
                  }} onClick={() => quickStatus(st)}>
                    {st === "no_show" ? "No-show" : st[0].toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>
              {/* Reschedule count */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.4rem" }}>
                {editingChangeCount ? (
                  <>
                    <span style={{ fontSize: "0.71rem", color: "var(--muted)" }}>Rescheduled</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      autoFocus
                      value={draft.change_count}
                      onChange={(e) => setDraft({ ...draft, change_count: Math.max(0, Number(e.target.value) || 0) })}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingChangeCount(false); }}
                      style={{ width: 52, fontSize: "0.75rem", padding: "0.12rem 0.22rem", textAlign: "center" }}
                    />
                    <span style={{ fontSize: "0.71rem", color: "var(--muted)" }}>×</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.65rem", padding: "0.1rem 0.32rem" }}
                      onClick={() => setEditingChangeCount(false)}
                    >✓</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                      Rescheduled {draft.change_count}×
                    </span>
                    <button
                      type="button"
                      style={{
                        background: "transparent", border: "none",
                        cursor: "pointer", fontSize: "0.7rem",
                        color: "var(--muted)", padding: "0.05rem 0.15rem",
                        lineHeight: 1,
                      }}
                      title="Edit reschedule count"
                      onClick={() => setEditingChangeCount(true)}
                    >✏</button>
                  </>
                )}
              </div>
            </div>

            {(draft.status === "cancelled" || draft.status === "no_show") && (
              <div>
                <label className="stat-label">Cancellation reason</label>
                <select
                  className="select"
                  value={draft.cancel_reason}
                  onChange={(e) => setDraft({ ...draft, cancel_reason: e.target.value, cancel_reason_other: "" })}
                  style={{ marginTop: "0.3rem" }}
                >
                  <option value="">— select reason —</option>
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>{CANCEL_REASON_LABELS[r]}</option>
                  ))}
                </select>
                {draft.cancel_reason === "other" && (
                  <input
                    className="input"
                    placeholder="Specify reason…"
                    value={draft.cancel_reason_other}
                    onChange={(e) => setDraft({ ...draft, cancel_reason_other: e.target.value })}
                    style={{ marginTop: "0.4rem" }}
                  />
                )}
              </div>
            )}

            <div>
              <label className="stat-label">Notes</label>
              <textarea className="textarea" rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ marginTop: "0.3rem" }} />
            </div>

            <div>
              <label className="stat-label">Times</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.3rem" }}>
                {/* Date — shared for start and end */}
                <div>
                  <label style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Date</label>
                  <input
                    className="input"
                    type="date"
                    value={toLocalDate(draft.starts_at)}
                    onChange={(e) => {
                      const d = e.target.value;
                      if (!d) return;
                      setDraft({
                        ...draft,
                        starts_at: setDateOnIso(draft.starts_at, d),
                        ends_at:   setDateOnIso(draft.ends_at,   d),
                      });
                    }}
                    style={{ marginTop: "0.2rem" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div>
                    <label style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>Start time</label>
                    <input
                      className="input"
                      type="time"
                      value={toLocalTime(draft.starts_at)}
                      onChange={(e) => {
                        const t = e.target.value;
                        if (!t) return;
                        const newStart = setTimeOnIso(draft.starts_at, t);
                        setDraft({ ...draft, starts_at: newStart, ends_at: addOneHourToIso(newStart) });
                      }}
                      style={{ marginTop: "0.2rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>End time</label>
                    <input
                      className="input"
                      type="time"
                      value={toLocalTime(draft.ends_at)}
                      onChange={(e) => {
                        const t = e.target.value;
                        if (!t) return;
                        setDraft({ ...draft, ends_at: setTimeOnIso(draft.ends_at, t) });
                      }}
                      style={{ marginTop: "0.2rem" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {!draft.appt_id && draft.session_type === "session" ? (
              <div style={{ background: "rgba(0,0,0,0.025)", padding: "0.6rem 0.7rem", borderRadius: 3, border: "1px solid var(--line)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={draft.repeat_enabled} onChange={(e) => setDraft({ ...draft, repeat_enabled: e.target.checked })} />
                  <strong>Repeat for…</strong>
                </label>
                {draft.repeat_enabled ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.4rem" }}>
                    <div>
                      <label className="stat-label">Cadence</label>
                      <select className="select" value={draft.repeat_cadence} onChange={(e) => setDraft({ ...draft, repeat_cadence: Number(e.target.value) as 1 | 2 })} style={{ marginTop: "0.25rem" }}>
                        <option value={1}>Weekly</option>
                        <option value={2}>Every other week</option>
                      </select>
                    </div>
                    <div>
                      <label className="stat-label">Occurrences</label>
                      <input className="input" type="number" min={2} max={52} value={draft.repeat_count} onChange={(e) => setDraft({ ...draft, repeat_count: Number(e.target.value) || 0 })} style={{ marginTop: "0.25rem" }} />
                    </div>
                    <p className="meta" style={{ fontSize: "0.72rem", gridColumn: "1 / span 2", margin: 0 }}>
                      Creates {Math.max(1, draft.repeat_count)} sessions starting {new Date(draft.starts_at).toLocaleDateString()}, every {draft.repeat_cadence === 1 ? "week" : "other week"}. Cancel any one without affecting the rest, or use "Cancel series" later to drop the lot.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.appt_id && draft.series_id ? (
              <div style={{ background: "rgba(0,0,0,0.025)", padding: "0.55rem 0.7rem", borderRadius: 3, border: "1px solid var(--line)", fontSize: "0.82rem" }}>
                <strong>Part of a recurring series.</strong>
                {seriesScope === "series" && (
                  <div style={{
                    marginTop: "0.35rem", padding: "0.25rem 0.5rem",
                    background: "rgba(168,61,43,0.1)", borderRadius: 3,
                    fontSize: "0.74rem", color: "var(--rust)", fontWeight: 600
                  }}>
                    ↻ Changes will apply to this session and all future sessions in this series
                  </div>
                )}
                <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {seriesScope !== "series" ? (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "0.3rem 0.55rem", fontSize: "0.72rem" }}
                      onClick={() => setSeriesScope("series")}
                      disabled={savePending}
                    >
                      ✎ Edit series
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "0.3rem 0.55rem", fontSize: "0.72rem" }}
                      onClick={() => setSeriesScope(null)}
                      disabled={savePending}
                    >
                      Edit this session only
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "0.3rem 0.55rem", fontSize: "0.72rem", color: "var(--red)" }}
                    onClick={cancelDraftSeries}
                    disabled={savePending}
                  >
                    Cancel series from this date forward
                  </button>
                </div>
              </div>
            ) : null}

            {saveError ? <p style={{ color: "var(--red)", fontSize: "0.82rem", margin: 0 }}>{saveError}</p> : null}
            <div style={{ marginTop: "auto", display: "flex", gap: "0.5rem", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: "0.85rem" }}>
              {draft.appt_id ? (
                <button className="btn btn-ghost" style={{ color: "var(--red)" }} onClick={deleteDraft} disabled={savePending}>Delete</button>
              ) : <span />}
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button className="btn btn-ghost" onClick={close} disabled={savePending}>Cancel</button>
                <button className="btn btn-primary" onClick={saveDraft} disabled={savePending}>
                  {savePending ? "Saving…" : (draft.appt_id ? "Save" : "Schedule")}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}
/** Returns "YYYY-MM-DD" in local time */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Returns "HH:MM" in local time */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Replace only the date portion of an ISO string, keeping local time */
function setDateOnIso(iso: string, dateStr: string): string {
  const d = new Date(iso);
  const [y, m, day] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, day, d.getHours(), d.getMinutes(), 0, 0).toISOString();
}
/** Replace only the time portion of an ISO string, keeping local date */
function setTimeOnIso(iso: string, timeStr: string): string {
  const d = new Date(iso);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, 0, 0).toISOString();
}
/** Add exactly one hour to an ISO string */
function addOneHourToIso(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString();
}

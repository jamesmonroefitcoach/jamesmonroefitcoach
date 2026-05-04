"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { AppointmentRow, ClientRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { saveAppointment, deleteAppointment, approveChangeRequest, denyChangeRequest, cancelSeries } from "./actions";

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

const STATUS_COLORS: Record<AppointmentRow["status"], { bg: string; fg: string }> = {
  scheduled:        { bg: "#5b6d7a", fg: "#fff" },
  completed:        { bg: "#5a6b4a", fg: "#fff" },
  cancelled:        { bg: "#c0392b", fg: "#fff" },
  no_show:          { bg: "#7a3a55", fg: "#fff" },
  change_requested: { bg: "#d97706", fg: "#fff" }
};

const PERSONAL_COLOR = { bg: "#3a342f", fg: "#f5efe4" };

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
  program_status: "programmed" | "needs_programming" | "n/a";
  change_count: number;
  series_id?: string | null;
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
    change_count: 0,
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
    change_count: a.change_count,
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
  const [ws, setWs] = useState(() => new Date(weekStart));
  const [ms, setMs] = useState(() => {
    const d = new Date(monthStart);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [appts, setAppts] = useState<AppointmentRow[]>(weekAppts);
  const [monthCache, setMonthCache] = useState<AppointmentRow[]>(monthAppts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savePending, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const today = new Date();

  function shiftWeek(deltaDays: number) {
    const next = new Date(ws);
    next.setDate(next.getDate() + deltaDays);
    setWs(next);
    setAppts((cur) => cur.filter((a) => {
      const t = new Date(a.starts_at).getTime();
      return t >= next.getTime() && t < next.getTime() + 7 * 86400000;
    }));
  }
  function jumpToDate(iso: string) {
    if (!iso) return;
    setWs(startOfWeekLocal(new Date(iso)));
  }
  function shiftMonth(delta: number) {
    const next = new Date(ms);
    next.setMonth(next.getMonth() + delta);
    setMs(next);
    setMonthCache((cur) => cur.filter((a) => {
      const t = new Date(a.starts_at);
      return t.getMonth() === next.getMonth() && t.getFullYear() === next.getFullYear();
    }));
  }

  // Daily totals exclude personal blocks; cancellations stay in for visibility but not in revenue.
  const dayTotals = useMemo(() => {
    return DAYS.map((_, idx) => {
      const list = appts.filter((a) => dayIndex(new Date(a.starts_at)) === idx && a.session_type === "session");
      return {
        revenue: list.reduce((acc, b) => acc + (b.status !== "cancelled" ? (b.rate ?? 0) : 0), 0),
        count: list.filter((b) => b.status !== "cancelled").length
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
  function close() { setDraft(null); setSaveError(null); }

  function applyLocalSave() {
    if (!draft) return;
    if (draft.appt_id) {
      setAppts((cur) =>
        cur.map((a) => {
          if (a.id !== draft.appt_id) return a;
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
            change_count: movedTime ? a.change_count + 1 : a.change_count
          } satisfies AppointmentRow;
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
        program_status: draft.session_type === "personal" ? "n/a" : draft.program_status
      }]);
    }
  }

  function saveDraft() {
    if (!draft) return;
    setSaveError(null);
    startSave(async () => {
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
      setAppts((cur) =>
        cur.map((a) =>
          a.series_id === seriesId && a.starts_at >= fromDate ? { ...a, status: "cancelled" } : a
        )
      );
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
    setAppts((cur) =>
      cur.map((a) => {
        if (a.id !== dragId) return a;
        const oldStart = new Date(a.starts_at);
        const oldEnd = new Date(a.ends_at);
        const durationMs = oldEnd.getTime() - oldStart.getTime();
        const newStart = new Date(ws);
        newStart.setDate(newStart.getDate() + day);
        newStart.setHours(hour, 0, 0, 0);
        if (newStart.getTime() === oldStart.getTime()) return a;
        const newEnd = new Date(newStart.getTime() + durationMs);
        return { ...a, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), change_count: a.change_count + 1 };
      })
    );
    setDragId(null);
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

  const monthTotals = useMemo(() => {
    let completed = 0, scheduled = 0, unpaid = 0;
    monthCache.forEach((a) => {
      if (a.session_type !== "session") return;
      if (a.status === "completed") {
        completed += a.rate ?? 0;
        if (!a.paid) unpaid += a.rate ?? 0;
      } else if (a.status === "scheduled") {
        scheduled += a.rate ?? 0;
      }
    });
    return { completed, scheduled, unpaid };
  }, [monthCache]);

  // Hide the original block while editing (we render a ghost in its place)
  const editingId = draft?.appt_id;

  return (
    <div style={{ position: "relative" }}>
      <div className="card no-print" style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
          <button onClick={() => setView("week")} className="btn" style={{ borderRadius: 0, borderColor: "transparent", background: view === "week" ? "var(--ink)" : "transparent", color: view === "week" ? "var(--paper)" : undefined, padding: "0.4rem 0.9rem" }}>Week</button>
          <button onClick={() => setView("month")} className="btn" style={{ borderRadius: 0, borderColor: "transparent", background: view === "month" ? "var(--ink)" : "transparent", color: view === "month" ? "var(--paper)" : undefined, padding: "0.4rem 0.9rem" }}>Month</button>
        </div>

        {view === "week" ? (
          <>
            <button className="btn btn-ghost" onClick={() => shiftWeek(-7)} style={{ padding: "0.35rem 0.65rem" }}>‹ prev</button>
            <button className="btn btn-ghost" onClick={() => setWs(startOfWeekLocal(new Date()))} style={{ padding: "0.35rem 0.65rem" }}>Today</button>
            <button className="btn btn-ghost" onClick={() => shiftWeek(7)} style={{ padding: "0.35rem 0.65rem" }}>next ›</button>
            <input type="date" className="input" style={{ width: 170 }} value={ws.toISOString().slice(0, 10)} onChange={(e) => jumpToDate(e.target.value)} />
            <span className="meta" style={{ marginLeft: "0.5rem" }}>
              Week of {ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="meta" style={{ marginLeft: "auto" }}>
              {dayTotals.reduce((a, d) => a + d.count, 0)} sessions · <strong style={{ color: "var(--ink)" }}>{fmtMoney(weekRevenue)}</strong>
            </span>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => shiftMonth(-1)} style={{ padding: "0.35rem 0.65rem" }}>‹ prev</button>
            <button className="btn btn-ghost" onClick={() => setMs(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} style={{ padding: "0.35rem 0.65rem" }}>This month</button>
            <button className="btn btn-ghost" onClick={() => shiftMonth(1)} style={{ padding: "0.35rem 0.65rem" }}>next ›</button>
            <span className="meta" style={{ marginLeft: "0.5rem" }}>
              {ms.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <span className="meta" style={{ marginLeft: "auto" }}>
              completed <strong style={{ color: "var(--sage)" }}>{fmtMoney(monthTotals.completed)}</strong> · scheduled <strong style={{ color: "var(--ink)" }}>{fmtMoney(monthTotals.scheduled)}</strong> · unpaid <strong style={{ color: "var(--red)" }}>{fmtMoney(monthTotals.unpaid)}</strong>
            </span>
          </>
        )}
      </div>

      {/* ─── WEEK VIEW ─── */}
      {view === "week" ? (
        <div className="card" style={{ marginTop: "1rem", padding: 0, overflow: "auto" }}>
          <div style={{ minWidth: 980, display: "grid", gridTemplateColumns: "70px repeat(7, 1fr)" }}>
            {/* header row */}
            <div style={{ borderBottom: "1px solid var(--line)" }}></div>
            {DAYS.map((d, i) => {
              const date = new Date(ws);
              date.setDate(ws.getDate() + i);
              const isToday = sameDay(date, today);
              return (
                <div key={d} style={{
                  textAlign: "center",
                  padding: "0.55rem 0.4rem",
                  borderBottom: "1px solid var(--line)",
                  borderLeft: "1px solid var(--line)",
                  background: isToday ? "rgba(168,61,43,0.08)" : "rgba(0,0,0,0.02)"
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

            {/* time gutter */}
            <div style={{ display: "grid", gridTemplateRows: `repeat(${HOURS.length}, ${HOUR_HEIGHT}px)` }}>
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

              // Hide change-requested rows from the regular layout pass; they render as
              // a light-grey dashed ghost at the requested time below.
              const dayEvents = appts.filter((a) => dayIndex(new Date(a.starts_at)) === dayIdx && a.status !== "change_requested");
              const laid = layOutDay(dayEvents);

              // Ghost block while editing/creating
              const showGhost = draft && (
                draft.appt_id
                  ? laid.some((e) => e.id === draft.appt_id) === false ? false : dayIndex(new Date(draft.starts_at)) === dayIdx
                  : dayIndex(new Date(draft.starts_at)) === dayIdx
              );
              const ghost = showGhost ? {
                top: minutesFromTop(new Date(draft.starts_at)),
                height: Math.max(20, (new Date(draft.ends_at).getTime() - new Date(draft.starts_at).getTime()) / 60000)
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
                  {HOURS.map((h, i) => (
                    <div
                      key={h}
                      onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                      onDrop={() => onCellDrop(dayIdx, h)}
                      style={{
                        position: "absolute",
                        top: i * HOUR_HEIGHT,
                        left: 0,
                        right: 0,
                        height: HOUR_HEIGHT,
                        borderBottom: "1px solid var(--line)",
                        cursor: "pointer"
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // only respond if click is on the gridline itself, not on an event
                        if (e.target === e.currentTarget) openCreate(dayIdx, h);
                      }}
                    />
                  ))}

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
                      const top = minutesFromTop(ps);
                      const heightPx = Math.max(36, (pe.getTime() - ps.getTime()) / 60000);
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
                    const top = minutesFromTop(start);
                    const heightPx = Math.max(20, (end.getTime() - start.getTime()) / 60000);
                    const widthPct = 100 / e.lanes;
                    const leftPct = e.lane * widthPct;
                    const colors = e.session_type === "personal" ? PERSONAL_COLOR : STATUS_COLORS[e.status];
                    const cancelled = e.status === "cancelled";
                    return (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={() => setDragId(e.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                        title={`${e.client_name ?? e.personal_label ?? "—"} — ${e.status}${e.change_count > 0 ? ` (Moved ${e.change_count}×)` : ""}`}
                        style={{
                          position: "absolute",
                          top,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          height: heightPx - 2,
                          background: colors.bg,
                          color: colors.fg,
                          padding: "0.25rem 0.4rem",
                          borderRadius: 3,
                          fontSize: "0.74rem",
                          border: cancelled ? "1px dashed rgba(255,255,255,0.5)" : "none",
                          opacity: cancelled ? 0.85 : 1,
                          boxShadow: "0 1px 0 rgba(0,0,0,0.15)",
                          cursor: "grab",
                          overflow: "hidden",
                          zIndex: 2
                        }}
                      >
                        <div style={{ fontWeight: 700, textDecoration: cancelled ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {e.session_type === "personal" ? `⛔ ${e.personal_label ?? "Personal"}` : (e.client_name ?? "Client")}
                        </div>
                        <div style={{ opacity: 0.9, display: "flex", justifyContent: "space-between", gap: 4, fontSize: "0.7rem" }}>
                          <span>
                            {e.session_type === "session" ? `$${e.rate ?? "—"}` : ""}
                            {e.change_count > 0 ? <span style={{ marginLeft: 6 }}>Moved {e.change_count}×</span> : null}
                          </span>
                          {e.session_type === "session" ? (
                            <span style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              {e.program_status === "programmed" ? "✓ prog" : "● need"}
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
        <div className="card" style={{ marginTop: "1rem", padding: 0, overflow: "auto" }}>
          <div style={{ minWidth: 760, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {DAYS.map((d) => (
              <div key={d} style={{ textAlign: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--line)", borderLeft: "1px solid var(--line)", background: "rgba(0,0,0,0.02)", fontWeight: 700, fontSize: "0.8rem" }}>{d}</div>
            ))}
            {monthDays.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} style={{ minHeight: 116, borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "rgba(0,0,0,0.015)" }} />;
              const k = date.toISOString().slice(0, 10);
              const list = (monthBlocks[k] ?? []).filter((a) => a.session_type === "session");
              const completed = list.filter((a) => a.status === "completed");
              const upcoming = list.filter((a) => a.status === "scheduled" && date >= new Date(today.toISOString().slice(0, 10)));
              const unpaidCompleted = completed.filter((a) => !a.paid);
              const totalDollars = list.reduce((acc, a) => acc + (a.rate ?? 0), 0);
              const isToday = sameDay(date, today);

              let bg: string | undefined = undefined;
              let fg: string | undefined = undefined;
              if (unpaidCompleted.length > 0) { bg = "rgba(192,57,43,0.12)"; fg = "var(--red)"; }
              else if (completed.length > 0 && completed.length === list.length) { bg = "rgba(90,107,74,0.14)"; fg = "var(--sage)"; }
              else if (upcoming.length > 0) { bg = "rgba(91,109,122,0.14)"; fg = "#3d5a73"; }

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
            {draft.change_count > 0 ? <p className="meta" style={{ marginTop: "-0.25rem" }}>Moved {draft.change_count}×</p> : null}

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
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem", alignItems: "center" }}>
                    <select className="select" value={draft.client_id} onChange={(e) => {
                      const c = clients.find((x) => x.id === e.target.value);
                      setDraft({ ...draft, client_id: e.target.value, rate: c?.session_rate?.toString() ?? draft.rate });
                    }} style={{ flex: 1 }}>
                      <option value="">— pick client —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                    {draft.client_id ? (
                      <Link href={`/coach/clients/${draft.client_id}`} className="btn btn-ghost" style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem" }}>view profile →</Link>
                    ) : null}
                  </div>
                </div>

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
                  <label className="stat-label">Programming for this session</label>
                  <select className="select" value={draft.program_status} onChange={(e) => setDraft({ ...draft, program_status: e.target.value as Draft["program_status"] })} style={{ marginTop: "0.3rem" }}>
                    <option value="needs_programming">Needs programming</option>
                    <option value="programmed">Programmed</option>
                  </select>
                  <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.3rem" }}>
                    {draft.client_id ? (
                      <>Pull from program: <Link href={`/coach/build-program?client=${draft.client_id}`}>build / view →</Link></>
                    ) : "Pick a client to link an existing program."}
                  </p>
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
            </div>

            <div>
              <label className="stat-label">Notes</label>
              <textarea className="textarea" rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ marginTop: "0.3rem" }} />
            </div>

            <div>
              <label className="stat-label">Times</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.3rem" }}>
                <input className="input" type="datetime-local" value={toLocalInput(draft.starts_at)} onChange={(e) => setDraft({ ...draft, starts_at: fromLocalInput(e.target.value) })} />
                <input className="input" type="datetime-local" value={toLocalInput(draft.ends_at)} onChange={(e) => setDraft({ ...draft, ends_at: fromLocalInput(e.target.value) })} />
              </div>
              <p className="meta" style={{ fontSize: "0.72rem", marginTop: "0.3rem" }}>Adjust either side — the calendar block resizes as you type.</p>
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
                <strong>Part of a series.</strong> "Delete" removes only this session. To cancel this and all future sessions in the series:
                <div style={{ marginTop: "0.4rem" }}>
                  <button className="btn btn-ghost" style={{ padding: "0.3rem 0.55rem", fontSize: "0.72rem", color: "var(--red)" }} onClick={cancelDraftSeries} disabled={savePending}>Cancel series from this date forward</button>
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

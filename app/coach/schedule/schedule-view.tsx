"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppointmentRow, ClientRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { saveAppointment, deleteAppointment, approveChangeRequest, denyChangeRequest, cancelSeries, editSeries, fetchWeekAppts, fetchMonthAppts } from "./actions";
import { CANCEL_REASONS, CANCEL_REASON_LABELS, cancelReasonLabel } from "@/lib/cancel-reasons";

// 44 px per hour. 13-hour stretch (7am→8pm) = 572 px which fits inside
// the card's maxHeight on standard laptop viewports without scrolling.
// The full 20-row grid is still there (6a → 1a), just compressed so the
// 'normal day' window is above the fold.
// 60 px per hour gives a 30-min block ~30 px tall — enough room for
// the title + bottom-row "✓ paid | programmed" line without
// truncation, while keeping the full day visible without much scroll.
const HOUR_HEIGHT = 60;
// 6a–1a next day. Hours 24 and 25 are visual placeholders for midnight
// and 1am of the following calendar day so sleep blocks (which routinely
// span midnight) render cleanly.
const HOURS = Array.from({ length: 20 }, (_, i) => i + 6);
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

// dayIndex / minutesFromTop both treat early-morning hours (00:00–01:59)
// as continuations of the previous calendar day so a sleep block that
// runs 10pm–6am renders inside the previous day's column, ending in the
// 24/25 hour rows.
function dayIndex(d: Date): number {
  if (d.getHours() < 2) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return (prev.getDay() + 6) % 7;
  }
  return (d.getDay() + 6) % 7;
}
function minutesFromTop(d: Date): number {
  // Hours < HOURS[0] (i.e. < 6am) are treated as +24 so they slot into
  // the extension rows at the bottom of the previous day's column.
  const hr = d.getHours() < HOURS[0] ? d.getHours() + 24 : d.getHours();
  return (hr - HOURS[0]) * 60 + d.getMinutes();
}
function minToPx(min: number): number { return min * HOUR_HEIGHT / 60; }
function pxFromTop(d: Date): number { return minToPx(minutesFromTop(d)); }

// Render an HOURS entry as a label — handles the >23 extension hours.
function hourLabel(h: number): string {
  const real = h % 24;
  const hr12 = real % 12 === 0 ? 12 : real % 12;
  const ampm = real < 12 ? "a" : "p";
  return `${hr12}${ampm}`;
}

/** "10p", "6:30a", "12p" — compact time label. */
function compactTimeLabel(d: Date): string {
  const hr24 = d.getHours();
  const min = d.getMinutes();
  const hr12 = hr24 % 12 === 0 ? 12 : hr24 % 12;
  const ampm = hr24 < 12 ? "a" : "p";
  return min === 0 ? `${hr12}${ampm}` : `${hr12}:${String(min).padStart(2, "0")}${ampm}`;
}

/** "Sleep 10p–6a · 8h" — captures the time range + total hours so a
 *  sleep block reads at a glance even though the calendar only shows
 *  6a–1a (not the full day). */
function sleepBlockLabel(starts_at: string, ends_at: string): string {
  const s = new Date(starts_at);
  const e = new Date(ends_at);
  const durHr = Math.max(0, (e.getTime() - s.getTime()) / 3_600_000);
  const dur = Math.round(durHr * 10) / 10;
  const durLabel = Number.isInteger(dur) ? `${dur}h` : `${dur}h`;
  return `Sleep ${compactTimeLabel(s)}–${compactTimeLabel(e)} · ${durLabel}`;
}

// Colour-blind-safe palette (deuteranopia + protanopia friendly). Chosen
// for high luminance separation as well as hue so two adjacent blocks
// are distinguishable even when the hues collapse. Each status also
// pairs with a glyph in StatusIcon so colour is never the only signal.
//   scheduled        teal           — neutral upcoming
//   completed        dark navy      — far apart from cancelled in luminance
//   cancelled        bright orange  — high-luminance warning, distinct from teal
//   no_show          black-ink      — clear 'this didn't happen' visually
//   change_requested gold           — high-attention amber
const STATUS_COLORS: Record<AppointmentRow["status"], { bg: string; fg: string }> = {
  scheduled:        { bg: "#1f6f8b", fg: "#fff" },
  completed:        { bg: "#1d2d44", fg: "#fff" },
  cancelled:        { bg: "#e67e22", fg: "#fff" },
  no_show:          { bg: "#171311", fg: "#fff" },
  change_requested: { bg: "#d4a017", fg: "#171311" }
};

const STATUS_GLYPH: Record<AppointmentRow["status"], string> = {
  scheduled:        "●",
  completed:        "✓",
  cancelled:        "✕",
  no_show:          "⊘",
  change_requested: "↻",
};

const PERSONAL_COLOR = { bg: "#3a342f", fg: "#f5efe4" };

// Per-category 2-3 letter monogram for personal blocks. Same role the
// emoji table played — a non-colour cue James can read at a glance —
// but typographic instead of emoji so it lands cleaner on the calendar.
// Match is case-insensitive substring on the category name.
const PERSONAL_CATEGORY_TAG: { match: RegExp; tag: string }[] = [
  { match: /sleep/i,             tag: "SLP" },
  { match: /cook|food|meal/i,    tag: "CK"  },
  { match: /piano|music|song/i,  tag: "PNO" },
  { match: /cardio|run/i,        tag: "CRD" },
  { match: /body|train|gym|lift/i, tag: "BDY" },
  { match: /business|biz|admin/i, tag: "BIZ" },
  { match: /read|book|study/i,   tag: "RD"  },
  { match: /family|friend|social/i, tag: "FAM" },
  { match: /chore|clean|house/i, tag: "CH"  },
  { match: /travel|drive|commute/i, tag: "TVL" },
];
function categoryEmoji(categoryName: string | null | undefined): string {
  if (!categoryName) return "•";
  const match = PERSONAL_CATEGORY_TAG.find((m) => m.match.test(categoryName));
  return match?.tag ?? categoryName.slice(0, 3).toUpperCase();
}
const ONLINE_COLOR   = { bg: "#1e6a8c", fg: "#ffffff" };

// ─── three-signal pills ─────────────────────────────────────────────
// On the schedule, every session carries three independent facts: status
// (background colour + glyph), paid (left pill below), and programmed
// (right pill below). Each fact gets its own visual slot so James can
// scan them at a glance without having to disentangle one signal from
// another.

function PaymentPill({ paid }: { paid: boolean }) {
  return (
    <span
      title={paid ? "Paid" : "Unpaid"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontSize: "0.58rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "1px 5px 1px 4px",
        borderRadius: 2,
        background: paid ? "#5a6b4a" : "transparent",
        color: paid ? "#fff" : "#fff",
        border: paid ? "1px solid #5a6b4a" : "1px solid rgba(255,255,255,0.55)",
      }}
    >
      <span aria-hidden style={{ fontSize: "0.66rem", lineHeight: 1 }}>
        {paid ? "✓" : "○"}
      </span>
      {paid ? "paid" : "owed"}
    </span>
  );
}

function ProgramPill({
  status,
  sessionStatus,
}: {
  status: "programmed" | "draft" | "needs_programming" | "n/a";
  sessionStatus: AppointmentRow["status"];
}) {
  // Completed historicals with no file still show as "logged" rather than
  // "needs" — the workout already happened, so it isn't action-pending.
  const effective: "programmed" | "draft" | "needs" | "logged" =
    status === "programmed" ? "programmed"
      : status === "draft" ? "draft"
      : sessionStatus === "completed" ? "logged"
      : "needs";

  const cfg = {
    programmed: { label: "prog", glyph: "✓", bg: "#5a6b4a", fg: "#fff", bd: "#5a6b4a", solid: true  },
    draft:      { label: "draft", glyph: "●", bg: "transparent", fg: "#f3deba", bd: "#d97706", solid: false },
    needs:      { label: "needs", glyph: "○", bg: "transparent", fg: "#ffd2c8", bd: "#a83d2b", solid: false },
    logged:     { label: "logged", glyph: "✓", bg: "transparent", fg: "rgba(255,255,255,0.85)", bd: "rgba(255,255,255,0.45)", solid: false },
  }[effective];

  return (
    <span
      title={
        effective === "programmed" ? "Program ready"
          : effective === "draft" ? "Draft program — not finalized"
          : effective === "needs" ? "Needs programming"
          : "Historical session — no program file"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontSize: "0.58rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "1px 5px 1px 4px",
        borderRadius: 2,
        background: cfg.bg,
        color: cfg.fg,
        border: `1px solid ${cfg.bd}`,
      }}
    >
      <span aria-hidden style={{ fontSize: "0.66rem", lineHeight: 1 }}>{cfg.glyph}</span>
      {cfg.label}
    </span>
  );
}

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
  // Optional goal tag for personal blocks — color-codes the block by the
  // goal's category and counts toward the weekly goal rollup.
  goal_id: string | null;
  // repeat config (only used when creating new)
  repeat_enabled: boolean;
  repeat_cadence: 1 | 2;
  repeat_count: number;
};

// Goal data passed in from the page for the personal-block goal picker.
export type ScheduleGoalCategory = {
  id: string;
  name: string;
  color: string;
  goals: {
    id: string;
    name: string;
    kind: "weekly_hours" | "weekly_count" | "per_night" | "pr" | "one_time";
    target_value: number | null;
    target_range_low: number | null;
    target_range_high: number | null;
    target_unit: string | null;
  }[];
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
    goal_id: null,
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
    goal_id: (a as { goal_id?: string | null }).goal_id ?? null,
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
  clients,
  goalCategories = [],
}: {
  weekStart: string;
  monthStart: string;
  initialView: View;
  weekAppts: AppointmentRow[];
  monthAppts: AppointmentRow[];
  clients: ClientRow[];
  /** Coach's goal categories — feeds the personal-block goal picker
   *  and color-codes blocks by their tagged category. Optional so the
   *  client-side schedule (no goals yet) still compiles. */
  goalCategories?: ScheduleGoalCategory[];
}) {
  // Index goal_id → color for fast lookup when rendering personal blocks.
  const goalColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of goalCategories) {
      for (const g of cat.goals) m.set(g.id, cat.color);
    }
    return m;
  }, [goalCategories]);
  // Index goal_id → category NAME so block render can pull the right
  // category emoji for the top-left non-colour cue.
  const goalCategoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of goalCategories) {
      for (const g of cat.goals) m.set(g.id, cat.name);
    }
    return m;
  }, [goalCategories]);
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
  // Scroll container for the week view — initial scroll lands at 7am so
  // the 6am extension row is just above the fold.
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (view !== "week") return;
    const el = weekScrollRef.current;
    if (!el) return;
    // Row 0 = 6am, Row 1 = 7am. Scroll so 7am is at the top of the viewport.
    el.scrollTop = HOUR_HEIGHT;
  }, [view]);

  // SSR / hydration timezone guard. During SSR the server runs in UTC, so
  // `new Date(iso).getHours()` returns UTC hours. The events would render
  // 4–5 hours off and React's hydration wouldn't recompute. Defer all
  // time-positioned event rendering until after client mount so positions
  // are always computed in the user's local timezone.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [editingChangeCount, setEditingChangeCount] = useState(false);
  const [seriesScope, setSeriesScope] = useState<"series" | null>(null);
  const [clientsBarOpen, setClientsBarOpen] = useState(false);
  const touchDragRef = useRef<{ clientId: string; startX: number; startY: number; moved: boolean } | null>(null);

  // Long-press touch drag for event blocks on mobile. Hold a block ~400ms
  // to enter drag mode; finger move tracks the target cell; lift finger
  // drops into it. Reuses the existing onCellDrop logic so the persist
  // path is identical to desktop drag.
  const eventTouchRef = useRef<{
    apptId: string;
    startX: number;
    startY: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    dragging: boolean;
    moved: boolean;
  } | null>(null);
  const [touchDraggingApptId, setTouchDraggingApptId] = useState<string | null>(null);

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

  function applyLocalSave(realId?: string) {
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
              goal_id: draft.session_type === "personal" ? (draft.goal_id ?? null) : null,
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
      // Use the real UUID returned from Supabase when available. The
      // 'local-...' fallback only fires when Supabase isn't configured
      // (demo mode) — in production we always have a server id and must
      // store it so subsequent delete/edit calls hit the right row.
      const id = realId ?? `local-${Date.now()}`;
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
        goal_id: draft.session_type === "personal" ? (draft.goal_id ?? null) : null,
        session_program_id: draft.session_program_id || null,
        program_status: draft.session_type === "personal" ? "n/a" : draft.program_status,
        call_type: draft.session_type === "session" ? (draft.call_type ?? null) : null,
      }]);
    }
  }

  function saveDraft() {
    if (!draft) return;
    setSaveError(null);
    // Cancellation / no-show requires a reason. 'Other' requires the
    // free-text specifier too. Block save until both are filled.
    if (draft.status === "cancelled" || draft.status === "no_show") {
      if (!draft.cancel_reason) {
        setSaveError("Pick a cancellation reason before saving.");
        return;
      }
      if (draft.cancel_reason === "other" && !draft.cancel_reason_other.trim()) {
        setSaveError("Specify the other reason.");
        return;
      }
    }
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

      // A 'local-...' appt_id is a stale demo-mode placeholder — there's
      // no Supabase row yet, so send it through as a new insert.
      const apptIdForSave = draft.appt_id?.startsWith("local-") ? undefined : draft.appt_id;
      const res = await saveAppointment({
        appt_id: apptIdForSave,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        session_type: draft.session_type,
        personal_label: draft.personal_label || null,
        goal_id: draft.goal_id,
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
      // res.data.id is the canonical UUID for new inserts; for edits it's
      // the same id we already had. Pass it down so optimistic state holds
      // a real row reference.
      applyLocalSave(res.data?.id);
      close();
    });
  }

  function deleteDraft() {
    if (!draft?.appt_id) return;
    const id = draft.appt_id;
    setSaveError(null);
    // Guard: 'local-...' ids are demo-mode optimistic placeholders that
    // never made it to Supabase. Server delete would fail with a UUID
    // syntax error — just remove from local state directly.
    if (id.startsWith("local-")) {
      setAppts((cur) => cur.filter((a) => a.id !== id));
      close();
      return;
    }
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

  // ─── Mobile long-press drag for event blocks ────────────────────
  // Hold a block for ~400ms to enter drag mode; finger move tracks the
  // target cell via document.elementFromPoint reading data-day / data-hour
  // off the hour-cell. Lift finger to drop. Falls through to onClick
  // (openEdit) if the hold doesn't fire or the finger barely moves.
  const LONG_PRESS_MS = 400;
  const TOUCH_MOVE_TOLERANCE_PX = 8;

  function clearEventTouch() {
    if (eventTouchRef.current?.longPressTimer) {
      clearTimeout(eventTouchRef.current.longPressTimer);
    }
    eventTouchRef.current = null;
    setTouchDraggingApptId(null);
    setDropTarget(null);
  }

  function onEventTouchStart(e: React.TouchEvent, apptId: string) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (eventTouchRef.current?.longPressTimer) clearTimeout(eventTouchRef.current.longPressTimer);
    eventTouchRef.current = {
      apptId,
      startX: t.clientX,
      startY: t.clientY,
      longPressTimer: setTimeout(() => {
        if (!eventTouchRef.current || eventTouchRef.current.apptId !== apptId) return;
        eventTouchRef.current.dragging = true;
        setTouchDraggingApptId(apptId);
        setDragId(apptId);
        // Subtle haptic confirmation on supported devices.
        try { (navigator as { vibrate?: (n: number) => void }).vibrate?.(15); } catch {}
      }, LONG_PRESS_MS),
      dragging: false,
      moved: false,
    };
  }
  function onEventTouchMove(e: React.TouchEvent) {
    if (!eventTouchRef.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - eventTouchRef.current.startX);
    const dy = Math.abs(t.clientY - eventTouchRef.current.startY);
    if (!eventTouchRef.current.dragging) {
      if (dx > TOUCH_MOVE_TOLERANCE_PX || dy > TOUCH_MOVE_TOLERANCE_PX) {
        eventTouchRef.current.moved = true;
        if (eventTouchRef.current.longPressTimer) {
          clearTimeout(eventTouchRef.current.longPressTimer);
          eventTouchRef.current.longPressTimer = null;
        }
      }
      return;
    }
    // Dragging — find the cell under the finger and update dropTarget.
    e.preventDefault();
    const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
    const cell = el?.closest<HTMLElement>('[data-timecell="1"]');
    if (!cell) { setDropTarget(null); return; }
    const day = Number(cell.dataset.day);
    const hour = Number(cell.dataset.hour);
    if (Number.isFinite(day) && Number.isFinite(hour)) {
      setDropTarget({ day, hour });
    }
  }
  function onEventTouchEnd() {
    const state = eventTouchRef.current;
    clearEventTouch();
    if (!state) return;
    if (!state.dragging) return; // regular click falls through to onClick
    // Drop into the last targeted cell.
    if (dropTarget) {
      setDragId(state.apptId);
      onCellDrop(dropTarget.day, dropTarget.hour);
    }
  }
  function onEventTouchCancel() {
    clearEventTouch();
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
  // Per James's 2026-06-15 ask: include no-show in the totals (was being
  // silently dropped). Paid trumps status — any paid=true row lands in
  // the Paid bucket regardless of cancelled/no_show. Unpaid cancelled +
  // unpaid no_show both count as 'cancelled' (lost-revenue bucket); the
  // no-show count is surfaced separately for visibility.
  const monthTotals = useMemo(() => {
    let paid = 0, unpaid = 0, cancelled = 0;
    let paidN = 0, unpaidN = 0, cancelledN = 0, noShowN = 0;
    monthCache.forEach((a) => {
      if (a.session_type !== "session") return;
      const rate = a.rate ?? 0;
      if (a.status === "no_show") noShowN += 1;
      if (a.paid) {
        paid += rate; paidN += 1;
      } else if (a.status === "cancelled" || a.status === "no_show") {
        cancelled += rate; cancelledN += 1;
      } else {
        unpaid += rate; unpaidN += 1;
      }
    });
    return { paid, unpaid, cancelled, paidN, unpaidN, cancelledN, noShowN };
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
            <span className="meta" style={{ marginLeft: "auto" }} title={`paid ${monthTotals.paidN} · unpaid ${monthTotals.unpaidN} · cancelled ${monthTotals.cancelledN}${monthTotals.noShowN > 0 ? ` · no-show ${monthTotals.noShowN}` : ""}`}>
              paid <strong style={{ color: "var(--sage)" }}>{fmtMoney(monthTotals.paid)}</strong>
              {" · "}unpaid <strong style={{ color: "var(--steel)" }}>{fmtMoney(monthTotals.unpaid)}</strong>
              {monthTotals.cancelled > 0 && (
                <>
                  {" · "}cancelled <strong style={{ color: "var(--rust)" }}>{fmtMoney(monthTotals.cancelled)}</strong>
                </>
              )}
              {monthTotals.noShowN > 0 && (
                <>
                  {" · "}<span style={{ color: "var(--rust)", fontWeight: 700 }}>{monthTotals.noShowN} no-show</span>
                </>
              )}
            </span>
          </>
        )}
      </div>

      {/* Cancellations backlog now lives on /coach/appointments —
          all the "things to follow up on" sit on one page. */}

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
        <>
        {/* Schedule key — collapsed by default; click "Key" to expand.
            Smaller chips, plain-text examples of the new bottom-row
            format ("✓ PAID | PROGRAMMED" etc.) for the colour-blind cue. */}
        <details
          className="no-print"
          style={{
            marginTop: "0.85rem",
            border: "1px solid var(--line)",
            borderRadius: 4,
            background: "var(--paper)",
            fontSize: "0.7rem",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              padding: "0.32rem 0.65rem",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontFamily: "var(--font-heading), Oswald, sans-serif",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: "0.65rem",
              fontWeight: 700,
              color: "var(--muted)",
            }}
          >
            <span>Key</span>
            <span style={{ opacity: 0.5, fontSize: "0.6rem" }}>click to expand ▾</span>
          </summary>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.6rem",
              padding: "0.45rem 0.65rem 0.55rem",
              borderTop: "1px solid var(--line)",
              alignItems: "center",
            }}
          >
            {([
              ["scheduled",        "Scheduled"],
              ["completed",        "Completed"],
              ["cancelled",        "Cancelled"],
              ["no_show",          "No-show"],
              ["change_requested", "Reschedule"],
            ] as const).map(([key, label]) => (
              <span
                key={key}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                title={`Block glyph: ${STATUS_GLYPH[key]}`}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 14, height: 14, borderRadius: 2,
                  background: STATUS_COLORS[key].bg, color: STATUS_COLORS[key].fg,
                  fontSize: "0.66rem", fontWeight: 700,
                }}>{STATUS_GLYPH[key]}</span>
                <span>{label}</span>
              </span>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />
            <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
              Bottom row: <span style={{ color: "var(--ink)", fontWeight: 600 }}>✓ PAID</span>
              {" | "}
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>UNPAID</span>
              {" "}
              and{" "}
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>PROGRAMMED</span>
              {" | "}
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>NOT PROGRAMMED</span>
            </span>
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 26, padding: "0 3px", height: 14, borderRadius: 2,
                background: "rgba(255,255,255,0.55)",
                color: "#5a6b4a",
                border: "1px solid #5a6b4a",
                borderLeft: "2px solid #5a6b4a",
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}>CRD</span>
              <span>personal (goal-tagged)</span>
            </span>
          </div>
        </details>

        <div
          ref={weekScrollRef}
          className="card"
          style={{
            marginTop: "1rem",
            padding: 0,
            overflow: "auto",
            // Bound the card so it becomes its own scrollport — required for
            // the day-header row's position:sticky top:0 to actually pin
            // during vertical scroll. Without this, the page would scroll
            // and the whole card (sticky headers and all) goes with it.
            // Give the calendar a bit more room so the 7a–8p stretch
            // (572 px at HOUR_HEIGHT 44) fits without scrolling on
            // typical laptop viewports.
            maxHeight: "calc(100vh - 150px)",
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
                <div
                  key={h}
                  className="meta"
                  data-hour-label={h}
                  style={{
                    fontSize: "0.72rem",
                    // No top padding — label sits flush with the top of its
                    // row so it aligns with the gridline at y = i * HOUR_HEIGHT,
                    // which marks where that hour STARTS. Earlier padding-top
                    // of 4px pushed the '7a' text below the 7am gridline,
                    // making events at the exact hour appear offset.
                    padding: "0 0.5rem 0.25rem",
                    textAlign: "right",
                    borderBottom: "1px solid var(--line)",
                    lineHeight: 1,
                  }}
                >
                  {hourLabel(h)}
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

              // Morning continuations — overnight blocks (sleep that runs
              // past 6am the next day) get an extra mini-block in the
              // next day's column at the top showing the morning portion
              // that doesn't fit at the bottom of the previous day's
              // column.
              const morningContinuations = appts.filter((a) => {
                const s = new Date(a.starts_at);
                const e = new Date(a.ends_at);
                if (e.toDateString() === s.toDateString()) return false; // single-day
                const eHr = e.getHours();
                if (eHr < HOURS[0]) return false; // earlier than 6am still falls into prev-day extension
                if (eHr > 12) return false; // afternoon spans aren't 'morning' continuations
                return dayIndex(e) === dayIdx;
              });

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

                  {/* Time-positioned content (ghost, change-requests, events)
                      uses Date.getHours() which differs between the server
                      (UTC) and the client (local TZ). Only render once
                      mounted to avoid an SSR hydration mismatch shoving
                      everything 4–5 hours off on a hard refresh. */}
                  {mounted && <>
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

                  {/* morning continuations — the post-6am portion of an
                      overnight block (most commonly sleep). Renders at
                      the top of this column with a left-edge accent and
                      a wraparound icon so it's obvious it's a continuation. */}
                  {morningContinuations.map((c) => {
                    const e = new Date(c.ends_at);
                    const heightPx = Math.max(14, pxFromTop(e));
                    const isPersonal = c.session_type === "personal";
                    const personalGoalId = isPersonal
                      ? (c as { goal_id?: string | null }).goal_id ?? null
                      : null;
                    const personalGoalColor = personalGoalId
                      ? goalColorById.get(personalGoalId)
                      : undefined;
                    const catName = personalGoalId ? goalCategoryNameById.get(personalGoalId) : null;
                    const emoji = catName ? categoryEmoji(catName) : null;
                    const color = personalGoalColor ?? "#7a6f63";
                    // Quiet continuation — matches the daytime personal style
                    // so the eye reads them as the same kind of object.
                    return (
                      <div
                        key={`cont-${c.id}`}
                        onClick={(ev) => { ev.stopPropagation(); openEdit(c); }}
                        title={`${c.personal_label ?? "continuation"} — ends ${e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 4,
                          right: 4,
                          height: heightPx,
                          background: "rgba(255,255,255,0.55)",
                          color,
                          padding: "0.18rem 0.4rem 0.18rem 0.45rem",
                          borderRadius: "0 0 3px 3px",
                          border: `1px solid ${color}`,
                          borderTop: "none",
                          borderLeft: `2px solid ${color}`,
                          fontSize: "0.7rem",
                          opacity: 0.95,
                          cursor: "pointer",
                          overflow: "hidden",
                          zIndex: 2,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 600, fontSize: "0.66rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span title="continues from previous day">↩</span>
                          {emoji && (
                            <span style={{
                              padding: "0 3px",
                              borderRadius: 2,
                              background: color,
                              color: "#fff",
                              fontSize: "0.58rem",
                              fontWeight: 700,
                              letterSpacing: "0.04em",
                            }}>{emoji}</span>
                          )}
                          <span>{c.personal_label ?? "continued"}</span>
                        </div>
                        <div style={{ fontSize: "0.62rem", opacity: 0.8 }}>
                          ends {e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
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
                    const isPersonal = e.session_type === "personal";

                    // Personal block — quiet treatment: transparent fill with a
                    // 1px coloured outline + coloured text in the category hue.
                    // Sits over the time slot like a note rather than a slab so
                    // sessions stay the dominant visual.
                    const personalGoalId = isPersonal
                      ? (e as { goal_id?: string | null }).goal_id ?? null
                      : null;
                    const personalCatColor = personalGoalId
                      ? goalColorById.get(personalGoalId)
                      : undefined;
                    const personalCatName = personalGoalId
                      ? goalCategoryNameById.get(personalGoalId)
                      : null;
                    const personalTag = personalCatName
                      ? categoryEmoji(personalCatName)
                      : "—";
                    const personalColor = personalCatColor ?? "#7a6f63";

                    const sessionColors = eventClient?.lifecycle === "online"
                      ? ONLINE_COLOR
                      : STATUS_COLORS[e.status];
                    const cancelled = e.status === "cancelled";

                    // Three-signal session palette:
                    //   STATUS    → background colour + glyph at title start
                    //   PAID      → small pill in the bottom row (filled = paid)
                    //   PROGRAMMED→ small pill on the right (filled = ready)
                    // Left-edge stripe is uniform with the status background so
                    // it no longer competes for the paid signal.

                    return (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={() => setDragId(e.id)}
                        onDragEnd={() => setDragId(null)}
                        onTouchStart={(ev) => onEventTouchStart(ev, e.id)}
                        onTouchMove={onEventTouchMove}
                        onTouchEnd={(ev) => {
                          if (eventTouchRef.current?.dragging) {
                            ev.preventDefault();
                          }
                          onEventTouchEnd();
                        }}
                        onTouchCancel={onEventTouchCancel}
                        onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                        title={
                          isPersonal
                            ? `${e.personal_label ?? "Personal"} — ${e.status}`
                            : `${e.client_name ?? "—"} — ${e.status} · ${e.paid ? "paid" : "unpaid"} · ${e.program_status === "programmed" ? "programmed" : e.program_status === "draft" ? "draft program" : "needs programming"}${e.change_count > 0 ? ` (Moved ${e.change_count}×)` : ""}`
                        }
                        style={{
                          position: "absolute",
                          top,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          height: heightPx - 2,
                          // Quiet personal: transparent ground w/ thin outline.
                          background: isPersonal ? "rgba(255,255,255,0.55)" : sessionColors.bg,
                          color: isPersonal ? personalColor : sessionColors.fg,
                          padding: isPersonal
                            ? "0.18rem 0.4rem 0.18rem 0.45rem"
                            : "0.25rem 0.4rem 0.3rem 0.55rem",
                          borderRadius: 3,
                          fontSize: "0.74rem",
                          // Flex column so the bottom row pins to the
                          // bottom edge instead of crowding the title.
                          display: "flex",
                          flexDirection: "column",
                          borderLeft: isPersonal
                            ? `2px solid ${personalColor}`
                            : `4px solid ${cancelled ? "#e67e22" : sessionColors.bg}`,
                          border: isPersonal ? `1px solid ${personalColor}` : undefined,
                          opacity: cancelled ? 0.85 : 1,
                          boxShadow: touchDraggingApptId === e.id
                            ? "0 4px 14px rgba(0,0,0,0.4)"
                            : isPersonal ? "none" : "0 1px 0 rgba(0,0,0,0.15)",
                          outline: touchDraggingApptId === e.id ? "2px solid #fff" : undefined,
                          transform: touchDraggingApptId === e.id ? "scale(1.04)" : undefined,
                          transition: "transform 0.1s, box-shadow 0.1s",
                          cursor: "grab",
                          overflow: "hidden",
                          touchAction: touchDraggingApptId === e.id ? "none" : "pan-y",
                          zIndex: touchDraggingApptId === e.id ? 4 : 2,
                        }}
                      >
                        <div style={{
                          fontWeight: isPersonal ? 600 : 700,
                          textDecoration: cancelled ? "line-through" : "none",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {/* Sessions: no glyph for the default-completed
                              case (past or upcoming, status = scheduled or
                              completed). Only flag the exceptions —
                              cancelled and no-show — with an inline pill. */}
                          {!isPersonal && (e.status === "cancelled" || e.status === "no_show") && (
                            <span style={{
                              display: "inline-block",
                              padding: "0 5px",
                              marginRight: 4,
                              borderRadius: 2,
                              background: "rgba(255,255,255,0.2)",
                              color: "#fff",
                              fontSize: "0.58rem",
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              verticalAlign: "1px",
                            }}>
                              {e.status === "no_show" ? "No-show" : "Cancelled"}
                            </span>
                          )}
                          {isPersonal
                            ? (
                              <>
                                <span style={{
                                  display: "inline-block",
                                  padding: "0 4px",
                                  marginRight: 4,
                                  borderRadius: 2,
                                  background: personalColor,
                                  color: "#fff",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  letterSpacing: "0.04em",
                                  verticalAlign: "1px",
                                }}>{personalTag}</span>
                                {e.personal_label ?? "Personal"}
                              </>
                            )
                            : eventClient?.lifecycle === "online"
                              ? `${e.call_type === "video" ? "🎥" : e.call_type === "voice" ? "📞" : "🌐"} ${e.client_name ?? "Client"}`
                              : (e.client_name ?? "Client")
                          }
                        </div>

                        {/* Bottom strip — pinned to the bottom edge via
                            margin-top: auto. Format: "$X · PAID: ✓ · PROG: Y"
                            with ✓/✗ for paid and Y/N for programmed so the
                            three facts read at a glance. */}
                        {!isPersonal && (() => {
                          // Past sessions are assumed completed unless
                          // flagged otherwise — so a past block whose
                          // status is still 'scheduled' counts as logged.
                          const startTime = new Date(e.starts_at).getTime();
                          const isPastNonException = startTime < Date.now()
                            && e.status !== "cancelled"
                            && e.status !== "no_show"
                            && e.status !== "change_requested";
                          const hasProgram =
                            e.program_status === "programmed" ||
                            e.program_status === "draft" ||
                            e.status === "completed" ||
                            isPastNonException;
                          return (
                            <div style={{
                              marginTop: "auto",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: "0.64rem",
                              fontWeight: 700,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              <span style={{ opacity: 0.95 }}>{`$${e.rate ?? 0}`}</span>
                              <span style={{ opacity: 0.55 }}>·</span>
                              <span>PAID: {e.paid ? "✓" : "✗"}</span>
                              <span style={{ opacity: 0.55 }}>·</span>
                              <span>PROG: {hasProgram ? "Y" : "N"}</span>
                              {e.change_count > 0 && (
                                <span style={{ opacity: 0.78, marginLeft: "auto" }}>{e.change_count}↺</span>
                              )}
                            </div>
                          );
                        })()}

                        {/* Personal: tiny meta line if there's room (>32px) */}
                        {isPersonal && heightPx > 32 && (
                          <div style={{
                            fontSize: "0.62rem",
                            opacity: 0.75,
                            marginTop: 1,
                            color: personalColor,
                          }}>
                            {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            {e.change_count > 0 && ` · moved ${e.change_count}×`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </>}
                </div>
              );
            })}
          </div>
        </div>
        <GoalProgressStrip
          appts={appts}
          weekStart={ws}
          goalCategories={goalCategories}
        />
        </>
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
              <PersonalBlockFields
                draft={draft}
                setDraft={setDraft}
                goalCategories={goalCategories}
              />
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

// ─── Weekly goal-progress strip ──────────────────────────────────────
// Renders above the week view: one chip per goal that has a weekly
// target (weekly_hours or weekly_count) showing actual vs. target for
// the displayed week. Counts goal-tagged personal blocks only.
function GoalProgressStrip({
  appts, weekStart, goalCategories,
}: {
  appts: AppointmentRow[];
  weekStart: Date;
  goalCategories: ScheduleGoalCategory[];
}) {
  const router = useRouter();
  const [pending, startBusy] = useTransition();
  const [actErr, setActErr] = useState<string | null>(null);
  const weekEndMs = weekStart.getTime() + 7 * 86_400_000;

  // One chip per CATEGORY that has at least one weekly_hours or
  // weekly_count goal with a target. The chip's target is the FIRST such
  // goal in the category (the 'primary' goal); auto-scheduling tags new
  // blocks against that goal.
  const trackedCats = useMemo(() => {
    type Tracked = {
      cat: ScheduleGoalCategory;
      primaryGoalId: string;
      kind: "weekly_hours" | "weekly_count";
      target: number;
      rangeLow: number | null;
      rangeHigh: number | null;
      unit: string;
    };
    const out: Tracked[] = [];
    for (const cat of goalCategories) {
      // Work is filled by client sessions, not personal blocks — the
      // dashboard's WoW chart already tracks weekly sessions, so the
      // strip has nothing useful to show. Skip it entirely.
      if (/work/i.test(cat.name)) continue;
      const primary = cat.goals.find(
        (g) => (g.kind === "weekly_hours" || g.kind === "weekly_count") &&
               (g.target_value ?? g.target_range_high ?? g.target_range_low ?? 0) > 0
      );
      if (!primary) continue;
      out.push({
        cat,
        primaryGoalId: primary.id,
        kind: primary.kind as "weekly_hours" | "weekly_count",
        target: (primary.target_value ?? primary.target_range_high ?? primary.target_range_low ?? 0),
        rangeLow: primary.target_range_low,
        rangeHigh: primary.target_range_high,
        unit: primary.target_unit || (primary.kind === "weekly_hours" ? "hr" : ""),
      });
    }
    return out;
  }, [goalCategories]);

  // Per-category bucket per category:
  //   scheduled = TOTAL of every goal-tagged personal block this week
  //               (past + future, completed or not — anything 'on the cal')
  //   completed = subset that has actually happened (past OR status=completed)
  // Progress bar tracks completed only; the chip header shows both
  // alongside the goal so you can see your commitment vs your delivery.
  const actuals = useMemo(() => {
    const now = Date.now();
    type Bucket = { completedHr: number; completedCt: number; scheduledHr: number; scheduledCt: number };
    const m = new Map<string, Bucket>();
    const goalToCat = new Map<string, string>();
    for (const cat of goalCategories) {
      for (const g of cat.goals) goalToCat.set(g.id, cat.id);
    }
    for (const a of appts) {
      if (a.session_type !== "personal") continue;
      const goalId = (a as { goal_id?: string | null }).goal_id;
      if (!goalId) continue;
      const catId = goalToCat.get(goalId);
      if (!catId) continue;
      const startMs = new Date(a.starts_at).getTime();
      const endMs = new Date(a.ends_at).getTime();
      if (startMs < weekStart.getTime() || startMs >= weekEndMs) continue;
      const isDone = endMs <= now || a.status === "completed";
      const hrs = Math.max(0, (endMs - startMs) / 3_600_000);
      const cur = m.get(catId) ?? { completedHr: 0, completedCt: 0, scheduledHr: 0, scheduledCt: 0 };
      // Always count toward scheduled — that's 'on the cal'.
      cur.scheduledHr += hrs;
      cur.scheduledCt += 1;
      // Subset that's actually happened counts toward completed.
      if (isDone) {
        cur.completedHr += hrs;
        cur.completedCt += 1;
      }
      m.set(catId, cur);
    }
    return m;
  }, [appts, weekStart, weekEndMs, goalCategories]);

  // Helper: convert a tracked-cat row into the args the server action
  // wants, then call fill or reorg.
  async function runFor(actionKind: "fill" | "reorg", t: typeof trackedCats[number]) {
    const target = t.target ?? t.rangeHigh ?? 0;
    const cat = { id: t.cat.id, name: t.cat.name, goals: t.cat.goals.map((g) => ({ id: g.id, name: g.name, kind: g.kind })) };
    const mod = await import("./actions");
    const fn = actionKind === "fill" ? mod.autoFillGoal : mod.reorganizeGoal;
    return { name: t.cat.name, res: await fn(cat, target) };
  }

  function doAction(
    actionKind: "fill" | "reorg",
    t: typeof trackedCats[number],
  ) {
    setActErr(null);
    startBusy(async () => {
      const { res } = await runFor(actionKind, t);
      if (!res.ok) setActErr(`${t.cat.name}: ${res.error}`);
      router.refresh();
    });
  }

  function doAllAction(actionKind: "fill" | "reorg") {
    setActErr(null);
    startBusy(async () => {
      // Sequential, not parallel — a single coach is one user and
      // sequential keeps any race conditions in the busy-slot map
      // off the table.
      let added = 0;
      const failures: string[] = [];
      for (const t of trackedCats) {
        const { name, res } = await runFor(actionKind, t);
        if (res.ok) added += res.added;
        else failures.push(`${name}: ${res.error}`);
      }
      if (failures.length === trackedCats.length) {
        setActErr(failures.join(" · "));
      } else if (failures.length > 0) {
        setActErr(`Added ${added} block${added === 1 ? "" : "s"}. Skipped: ${failures.join(" · ")}`);
      }
      router.refresh();
    });
  }

  if (trackedCats.length === 0) return null;

  return (
    <div className="no-print" style={{ marginTop: "1rem" }}>
      {actErr && (
        <div style={{
          marginBottom: "0.45rem", padding: "0.35rem 0.55rem",
          background: "rgba(192,57,43,0.07)", border: "1px solid var(--red)",
          color: "var(--red)", borderRadius: 4, fontSize: "0.74rem",
        }}>
          {actErr}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.55rem",
          paddingBottom: "0.25rem",
        }}
      >
        {trackedCats.map((t) => {
          const a = actuals.get(t.cat.id) ?? { completedHr: 0, completedCt: 0, scheduledHr: 0, scheduledCt: 0 };
          const completed = t.kind === "weekly_hours" ? a.completedHr : a.completedCt;
          const scheduled = t.kind === "weekly_hours" ? a.scheduledHr : a.scheduledCt;
          const pct = Math.max(0, Math.min(100, (completed / Math.max(t.target, 0.0001)) * 100));
          const inRange = t.rangeLow != null && t.rangeHigh != null
            ? completed >= t.rangeLow && completed <= t.rangeHigh
            : completed >= t.target;
          const targetLabel = t.rangeLow != null && t.rangeHigh != null
            ? `${t.rangeLow}–${t.rangeHigh}`
            : `${t.target}`;
          const fmt = (v: number) => t.kind === "weekly_hours"
            ? Math.round(v * 10) / 10
            : v;
          const completedLabel = fmt(completed);
          const scheduledLabel = fmt(scheduled);
          return (
            <div
              key={t.cat.id}
              title={`${t.cat.name}\nCompleted: ${completedLabel} ${t.unit}\nScheduled (everything on cal this week): ${scheduledLabel} ${t.unit}\nGoal: ${targetLabel} ${t.unit}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                minWidth: 220,
                flex: "1 1 220px",
                padding: "0.4rem 0.55rem",
                border: `1px solid ${inRange ? t.cat.color : "var(--line)"}`,
                borderRadius: 4,
                background: "var(--paper)",
              }}
            >
              <div style={{
                display: "flex", justifyContent: "space-between", gap: "0.4rem", alignItems: "baseline",
                fontSize: "0.74rem", fontWeight: 600,
              }}>
                <span style={{ color: t.cat.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.cat.name}
                </span>
                {/* completed / scheduled / goal triplet — color codes each
                    value so it's parseable at a glance. */}
                <span style={{ whiteSpace: "nowrap", fontSize: "0.7rem", fontFamily: "Oswald, sans-serif", letterSpacing: "0.02em" }}>
                  <span title="Completed" style={{ color: inRange ? t.cat.color : "var(--ink)", fontWeight: 700 }}>
                    {completedLabel}
                  </span>
                  <span style={{ color: "var(--muted)" }}>/</span>
                  <span title="Scheduled — every block on the cal this week" style={{ color: "var(--steel)" }}>
                    {scheduledLabel}
                  </span>
                  <span style={{ color: "var(--muted)" }}>/</span>
                  <span title="Goal" style={{ color: "var(--muted)" }}>
                    {targetLabel}
                  </span>
                  <span style={{ color: "var(--muted)", marginLeft: "0.18rem", fontFamily: "inherit", fontSize: "0.62rem" }}>
                    {t.unit}
                  </span>
                </span>
              </div>
              {/* Progress bar — completed only (not scheduled) */}
              <div style={{
                height: 4, background: "rgba(0,0,0,0.08)", borderRadius: 999, overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%", background: t.cat.color, transition: "width 0.2s",
                }} />
              </div>
              <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.1rem" }}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => doAction("fill", t)}
                  title={`Schedule planned blocks across this week to hit ${targetLabel} ${t.unit}`}
                  style={miniBtnStyle(t.cat.color, true)}
                >+ add to cal</button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => doAction("reorg", t)}
                  title="Delete future planned blocks for this category and re-fill"
                  style={miniBtnStyle(t.cat.color, false)}
                >↻ reorg</button>
              </div>
            </div>
          );
        })}

        {/* Trailing 'All' chip — same shape as the per-category ones
            but runs the action across every chip in one go. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
            minWidth: 200,
            flex: "1 1 200px",
            padding: "0.4rem 0.55rem",
            border: "1px solid var(--ink)",
            borderRadius: 4,
            background: "var(--paper)",
          }}
        >
          <div style={{
            fontSize: "0.74rem", fontWeight: 700, color: "var(--ink)",
          }}>
            All categories
          </div>
          <div className="meta" style={{ fontSize: "0.66rem", lineHeight: 1.3 }}>
            Schedule or rebuild the week across every chip at once.
          </div>
          <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.1rem" }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => doAllAction("fill")}
              title="Run + add to cal for every category"
              style={miniBtnStyle("var(--ink)", true)}
            >+ add all</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => doAllAction("reorg")}
              title="Reorg every category"
              style={miniBtnStyle("var(--ink)", false)}
            >↻ reorg all</button>
          </div>
        </div>
      </div>
      <div className="meta" style={{ marginTop: "0.35rem", fontSize: "0.66rem", fontStyle: "italic" }}>
        chip reads <strong>completed / scheduled / goal</strong> · progress bar tracks completed only · Add / Reorg never touch history
      </div>
    </div>
  );
}

function miniBtnStyle(color: string, filled: boolean): React.CSSProperties {
  return {
    padding: "0.12rem 0.4rem",
    fontSize: "0.6rem",
    border: `1px solid ${color}`,
    background: filled ? color : "transparent",
    color: filled ? "#fff" : color,
    borderRadius: 3,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 600,
    letterSpacing: "0.02em",
    lineHeight: 1.3,
    flex: 1,
  };
}

// ─── Personal block edit fields with goal picker + Sleep specifics ────
function PersonalBlockFields({
  draft, setDraft, goalCategories,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  goalCategories: ScheduleGoalCategory[];
}) {
  // Work category is filled by client sessions, not personal blocks —
  // hide it from the dropdown so the coach can't mistakenly tag a
  // personal block against it.
  const pickableCategories = useMemo(
    () => goalCategories.filter((c) => !/work/i.test(c.name)),
    [goalCategories],
  );

  // Find the goal/cat for the current draft so we can show its color and
  // detect 'Sleep' specifically for the bed/wake quick inputs.
  const tagged = useMemo(() => {
    if (!draft.goal_id) return null;
    for (const cat of goalCategories) {
      const g = cat.goals.find((x) => x.id === draft.goal_id);
      if (g) return { goal: g, cat };
    }
    return null;
  }, [draft.goal_id, goalCategories]);
  const isSleepCategory = !!tagged && /sleep/i.test(tagged.cat.name);

  /** Apply a goal selection.
   *  - When `via='category'`, label = category name (compact, e.g. 'Sleep').
   *  - When `via='specifier'`, label = the specific goal name.
   *  The label remains a normal editable input so a coach can type over
   *  it (e.g. 'Sleep — restless') after the auto-fill. */
  function pickGoal(goalId: string, via: "category" | "specifier" = "specifier") {
    let nextCat: ScheduleGoalCategory | null = null;
    let nextGoal: { id: string; name: string } | null = null;
    for (const c of goalCategories) {
      const g = c.goals.find((x) => x.id === goalId);
      if (g) { nextCat = c; nextGoal = g; break; }
    }
    const isSleep = !!nextCat && /sleep/i.test(nextCat.name);
    if (isSleep && !draft.appt_id) {
      // Brand-new draft → auto-set 10pm → 6am next day.
      const start = new Date(draft.starts_at);
      start.setHours(22, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setHours(6, 0, 0, 0);
      setDraft({
        ...draft,
        goal_id: goalId,
        // Sleep label encodes bed→wake times and duration so the block
        // reads at a glance even though the calendar only shows 6a–1a.
        personal_label: sleepBlockLabel(start.toISOString(), end.toISOString()),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      });
    } else if (isSleep) {
      // Existing sleep block: refresh the time-range label against
      // whatever the current bed/wake times are.
      setDraft({
        ...draft,
        goal_id: goalId,
        personal_label: sleepBlockLabel(draft.starts_at, draft.ends_at),
      });
    } else {
      const labelFill = via === "category"
        ? (nextCat?.name ?? "")
        : (nextGoal?.name ?? "");
      setDraft({
        ...draft,
        goal_id: goalId,
        personal_label: labelFill,
      });
    }
  }

  // Quick bed/wake time editors for sleep blocks. They map directly to
  // the appointment's start/end (same source of truth).
  function bedAndWake(): { bedTime: string; wakeTime: string } {
    const s = new Date(draft.starts_at);
    const e = new Date(draft.ends_at);
    return {
      bedTime: `${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`,
      wakeTime: `${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`,
    };
  }
  function setBedTime(timeStr: string) {
    const [h, m] = timeStr.split(":").map(Number);
    const s = new Date(draft.starts_at);
    s.setHours(h, m, 0, 0);
    const nextStart = s.toISOString();
    // Refresh the auto-fill label if it still looks like our format —
    // user-typed labels are left alone.
    const label = /^Sleep \d/.test(draft.personal_label)
      ? sleepBlockLabel(nextStart, draft.ends_at)
      : draft.personal_label;
    setDraft({ ...draft, starts_at: nextStart, personal_label: label });
  }
  function setWakeTime(timeStr: string) {
    const [h, m] = timeStr.split(":").map(Number);
    const e = new Date(draft.ends_at);
    e.setHours(h, m, 0, 0);
    const nextEnd = e.toISOString();
    const label = /^Sleep \d/.test(draft.personal_label)
      ? sleepBlockLabel(draft.starts_at, nextEnd)
      : draft.personal_label;
    setDraft({ ...draft, ends_at: nextEnd, personal_label: label });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      {/* Goal picker — two-stage:
           1. Category (main dropdown): color-codes the block + chooses
              which bucket the block counts toward.
           2. Specific goal (smaller, optional): refines to a specific
              goal within the category. Defaults to the category's first
              goal so 'just pick Sleep' tags it without a second click. */}
      {pickableCategories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          <div>
            <label className="stat-label">Goal category</label>
            <select
              className="input"
              value={tagged?.cat.id ?? ""}
              onChange={(e) => {
                const catId = e.target.value;
                if (!catId) {
                  // Clearing the category: drop both goal + label.
                  setDraft({ ...draft, goal_id: null, personal_label: "" });
                  return;
                }
                const cat = goalCategories.find((c) => c.id === catId);
                const firstGoalId = cat?.goals[0]?.id;
                if (firstGoalId) pickGoal(firstGoalId, "category");
              }}
              style={{ marginTop: "0.3rem" }}
            >
              <option value="">— No goal —</option>
              {pickableCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {tagged && (
              <div className="meta" style={{ marginTop: "0.3rem", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: tagged.cat.color }} />
                <span>Block will render in {tagged.cat.name.toLowerCase()} color</span>
              </div>
            )}
          </div>

          {/* Specifier dropdown removed per user — categories are enough.
              When auto-scheduling lands we'll use the category's primary
              goal as the rollup target. */}
        </div>
      )}

      {/* Sleep-specific quick inputs (bed/wake times). Editing these
          updates the appointment's start/end — same source of truth as
          the regular date pickers below. Default 22:00 → 06:00 was set
          when Sleep was picked. */}
      {isSleepCategory && (() => {
        const t = bedAndWake();
        return (
          <div style={{
            background: "rgba(62,96,121,0.06)",
            border: "1px solid var(--steel)",
            borderRadius: 4,
            padding: "0.6rem 0.7rem",
          }}>
            <div style={{
              fontFamily: "Oswald, sans-serif", textTransform: "uppercase",
              letterSpacing: "0.08em", fontSize: "0.7rem", color: "var(--steel)",
              fontWeight: 600, marginBottom: "0.4rem",
            }}>Daily sleep entry</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.78rem" }}>
                <span className="meta" style={{ fontSize: "0.66rem" }}>Est. time went to bed</span>
                <input
                  type="time"
                  className="input"
                  value={t.bedTime}
                  onChange={(e) => setBedTime(e.target.value)}
                  style={{ marginTop: "0.2rem" }}
                />
              </label>
              <label style={{ fontSize: "0.78rem" }}>
                <span className="meta" style={{ fontSize: "0.66rem" }}>Est. time woke up</span>
                <input
                  type="time"
                  className="input"
                  value={t.wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  style={{ marginTop: "0.2rem" }}
                />
              </label>
            </div>
            <div className="meta" style={{ fontSize: "0.66rem", marginTop: "0.4rem", fontStyle: "italic" }}>
              Defaults to 10pm → 6am. Adjust per night.
            </div>
          </div>
        );
      })()}

      <div>
        <label className="stat-label">Label</label>
        <input
          className="input"
          placeholder="Doctor / Out of town / Lunch"
          value={draft.personal_label}
          onChange={(e) => setDraft({ ...draft, personal_label: e.target.value })}
          style={{ marginTop: "0.3rem" }}
        />
        <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.4rem" }}>
          Personal blocks lock the calendar — clients can&rsquo;t request this slot.
        </p>
      </div>
    </div>
  );
}

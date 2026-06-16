"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AppointmentRow, ClientRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { pastProgramsForClient } from "@/lib/programs";
import { fetchWeekAppts, fetchMonthAppts, markApptPaid, setApptRate, setApptStatus } from "@/app/coach/schedule/actions";
import { CANCEL_REASONS, CANCEL_REASON_LABELS, type CancelReason } from "@/lib/cancel-reasons";
import WeekBanners from "./week-banners";
import TodoBlock from "./todo-block";
import type { WeekSessionItem, WeekProgramItem, NoSessionClient } from "./week-banners";

// ── helpers ──────────────────────────────────────────────────────────────────

// Mirrors the schedule view's status pill colors so the dashboard's All
// Sessions Summary table reads the same as the schedule.
// Colour-blind safe palette matched to the schedule view (5 distinct
// luminance levels + glyph cue). Keeps dashboard badges visually
// aligned with the calendar so a coach scanning both screens isn't
// learning two colour languages.
const STATUS_COLORS: Record<AppointmentRow["status"], { bg: string; fg: string }> = {
  scheduled:        { bg: "#1f6f8b", fg: "#fff" },
  completed:        { bg: "#1d2d44", fg: "#fff" },
  cancelled:        { bg: "#e67e22", fg: "#fff" },
  no_show:          { bg: "#171311", fg: "#fff" },
  change_requested: { bg: "#d4a017", fg: "#171311" },
};
const STATUS_LABELS: Record<AppointmentRow["status"], string> = {
  scheduled:        "Scheduled",
  completed:        "Completed",
  cancelled:        "Cancelled",
  no_show:          "No-show",
  change_requested: "Change requested",
};
const STATUS_GLYPH: Record<AppointmentRow["status"], string> = {
  scheduled:        "●",
  completed:        "✓",
  cancelled:        "✕",
  no_show:          "⊘",
  change_requested: "↻",
};

function startOfWeekLocal(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday-anchored
  return s;
}

function fmtDaysAway(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  const days = Math.round((t.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days}d`;
}

function weekLabel(ws: Date): string {
  return ws.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Week-over-week bar chart ──────────────────────────────────────────────────

/** "Apr 28–May 4" for cross-month, "5–11" for same-month weeks */
function weekRangeLabel(start: Date, endExcl: Date): string {
  const last = new Date(endExcl.getTime() - 86400000);
  if (start.getMonth() !== last.getMonth()) {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(start)}–${fmt(last)}`;
  }
  return `${start.getDate()}–${last.getDate()}`;
}

type ChartSeg = "paid" | "unpaid" | "cancelled";

function WoWChart({ monthAppts, monthStart }: { monthAppts: AppointmentRow[]; monthStart?: Date }) {
  const now = new Date();
  const baseMonthStart = monthStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const [hover, setHover] = useState<{ weekIdx: number; seg: ChartSeg } | null>(null);

  const weeks = useMemo(() => {
    const firstWeek = startOfWeekLocal(baseMonthStart);
    const monthEnd = new Date(baseMonthStart.getFullYear(), baseMonthStart.getMonth() + 1, 1);
    const buckets: { rangeLabel: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new Date(firstWeek);
      s.setDate(firstWeek.getDate() + i * 7);
      if (s >= monthEnd) break;
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      buckets.push({ rangeLabel: weekRangeLabel(s, e), start: s, end: e });
    }
    return buckets.map((b) => {
      const isCurrentWeek = b.start <= now && now < b.end;
      const isPast = b.end <= now;
      // All sessions for the week, excluding no-shows (those produce no
      // signal on this chart). Cancelled sessions DO count toward the bar
      // height — coach still charges a cancellation fee, so the booked
      // revenue is real money owed.
      const sessions = monthAppts.filter((a) => {
        const t = new Date(a.starts_at).getTime();
        return t >= b.start.getTime() && t < b.end.getTime()
          && a.session_type === "session"
          && a.status !== "no_show";
      });
      // Three non-overlapping buckets for the bar segments. Cancellation
      // status trumps paid status here (a paid-then-cancelled session
      // lives in the cancelled bucket so the rust segment shows what was
      // charged for a no-go session).
      const cancelledSess = sessions.filter((a) => a.status === "cancelled");
      const active = sessions.filter((a) => a.status !== "cancelled");
      const paidSess = active.filter((a) => a.paid);
      const unpaidSess = active.filter((a) => !a.paid);
      const completedSess = active.filter((a) => a.status === "completed");

      const paidAmt = paidSess.reduce((s, a) => s + (a.rate ?? 0), 0);
      const unpaidAmt = unpaidSess.reduce((s, a) => s + (a.rate ?? 0), 0);
      const cancelledAmt = cancelledSess.reduce((s, a) => s + (a.rate ?? 0), 0);
      const bookings = paidAmt + unpaidAmt + cancelledAmt;

      // How far through this week is "today" (0–1), used to draw the progress split
      const weekPct = isCurrentWeek
        ? Math.min(1, (now.getTime() - b.start.getTime()) / (b.end.getTime() - b.start.getTime()))
        : isPast ? 1 : 0;
      return {
        ...b,
        bookings,
        paidAmt,
        unpaidAmt,
        cancelledAmt,
        paidSess,
        unpaidSess,
        cancelledSess,
        countAll: sessions.length,
        countCompleted: completedSess.length,
        countPaid: paidSess.length,
        countCancelled: cancelledSess.length,
        isCurrentWeek,
        isPast,
        weekPct,
      };
    });
  }, [monthAppts, baseMonthStart]);

  const maxVal = Math.max(...weeks.map((w) => w.bookings), 1);
  const chartH = 96;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {/* Per-week summary chips above each bar column.
          Top line is the $ booked total (paid + unpaid, cancelled excluded).
          Bottom line breaks the session counts out by status. */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.4rem" }}>
        {weeks.map((w, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center",
            padding: "0.18rem 0",
            borderRadius: 3,
            background: w.isCurrentWeek ? "rgba(168,61,43,0.07)" : "transparent",
            border: w.isCurrentWeek ? "1px solid rgba(168,61,43,0.18)" : "1px solid transparent",
          }}>
            {w.countAll > 0 ? (
              <>
                <div style={{ fontSize: "0.64rem", fontWeight: 700, color: w.isCurrentWeek ? "var(--rust)" : "var(--ink)", lineHeight: 1.2 }}>
                  {fmtMoney(w.bookings)}
                </div>
                {/* Counts shown side-by-side, color-coded.
                    ✓ completed  $ paid  ✗ cancelled — overlapping by design
                    (a completed+paid session shows in both totals). */}
                <div
                  style={{ fontSize: "0.56rem", lineHeight: 1.15, display: "flex", justifyContent: "center", gap: "0.4rem" }}
                  title={`${w.countCompleted} completed · ${w.countPaid} paid · ${w.countCancelled} cancelled`}
                >
                  <span style={{ color: "var(--ink)", fontWeight: 600 }} title="Completed">
                    ✓{w.countCompleted}
                  </span>
                  <span style={{ color: "var(--sage)", fontWeight: 600 }} title="Paid">
                    ${w.countPaid}
                  </span>
                  {w.countCancelled > 0 && (
                    <span style={{ color: "var(--red)", fontWeight: 600 }} title="Cancelled">
                      ✗{w.countCancelled}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: "0.58rem", color: "var(--line)", lineHeight: 1.8 }}>—</div>
            )}
          </div>
        ))}
      </div>

      {/* Bars — true stacked segments, no overlap:
            paid (green) → unpaid (steel) → cancelled (rust)
          Each segment is a real div with hover handlers so we can pop a
          per-segment tooltip showing the client list. */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "0.35rem", height: chartH, position: "relative" }}>
        {weeks.map((w, i) => {
          const barH = Math.max(3, Math.round((w.bookings / maxVal) * chartH));
          // Heights in px per segment. Round each then reconcile any
          // remainder onto the topmost non-zero segment so the bar total
          // matches barH exactly.
          let paidH = w.bookings > 0 ? Math.round((w.paidAmt / w.bookings) * barH) : 0;
          let unpaidH = w.bookings > 0 ? Math.round((w.unpaidAmt / w.bookings) * barH) : 0;
          let cancelledH = w.bookings > 0 ? Math.round((w.cancelledAmt / w.bookings) * barH) : 0;
          const totalH = paidH + unpaidH + cancelledH;
          if (totalH !== barH && barH > 0) {
            const diff = barH - totalH;
            if (cancelledH > 0) cancelledH += diff;
            else if (unpaidH > 0) unpaidH += diff;
            else paidH += diff;
          }
          const futureW = w.isCurrentWeek ? `${Math.round((1 - w.weekPct) * 100)}%` : "0%";
          // Past + current weeks get full saturation; future weeks get a
          // wash so they read as "not yet realised."
          const realised = w.isPast || w.isCurrentWeek;
          const paidBg = realised ? "var(--sage)" : "rgba(90,107,74,0.55)";
          const unpaidBg = realised ? "var(--steel)" : "rgba(62,96,121,0.55)";
          const cancelledBg = realised ? "var(--rust)" : "rgba(168,61,43,0.5)";

          // Segment renderer (DRY for the three).
          const Segment = (seg: "paid" | "unpaid" | "cancelled", h: number, bg: string) => {
            if (h <= 0) return null;
            return (
              <div
                onMouseEnter={() => setHover({ weekIdx: i, seg })}
                onMouseLeave={() => setHover(null)}
                style={{
                  height: h,
                  background: bg,
                  cursor: "default",
                  position: "relative",
                  outline: hover?.weekIdx === i && hover.seg === seg ? "1.5px solid rgba(255,255,255,0.85)" : "none",
                  outlineOffset: -1,
                }}
              />
            );
          };

          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: barH,
                alignSelf: "flex-end",
                position: "relative",
                borderRadius: "2px 2px 0 0",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column-reverse", // stack bottom-up: paid → unpaid → cancelled
              }}
            >
              {Segment("paid", paidH, paidBg)}
              {Segment("unpaid", unpaidH, unpaidBg)}
              {Segment("cancelled", cancelledH, cancelledBg)}

              {/* Future-days fade for current week — right portion is lighter */}
              {w.isCurrentWeek && (
                <div style={{
                  position: "absolute", top: 0, bottom: 0, right: 0,
                  width: futureW,
                  background: "rgba(255,255,255,0.45)",
                  borderLeft: "1px dashed rgba(168,61,43,0.35)",
                  pointerEvents: "none",
                }} />
              )}
              {/* Dashed border on current week */}
              {w.isCurrentWeek && (
                <div style={{
                  position: "absolute", inset: 0,
                  border: "1px dashed rgba(255,255,255,0.55)",
                  borderRadius: "2px 2px 0 0",
                  pointerEvents: "none",
                }} />
              )}
            </div>
          );
        })}

        {/* Hover popover — rendered as a sibling so it isn't clipped by
            the bar's overflow:hidden. Positioned absolutely over the chart
            area, centered on the hovered column. */}
        {hover && (() => {
          const w = weeks[hover.weekIdx];
          if (!w) return null;
          const list =
            hover.seg === "paid" ? w.paidSess
            : hover.seg === "unpaid" ? w.unpaidSess
            : w.cancelledSess;
          const amt =
            hover.seg === "paid" ? w.paidAmt
            : hover.seg === "unpaid" ? w.unpaidAmt
            : w.cancelledAmt;
          const labelColor =
            hover.seg === "paid" ? "var(--sage)"
            : hover.seg === "unpaid" ? "var(--steel)"
            : "var(--rust)";
          const segTitle =
            hover.seg === "paid" ? "Paid"
            : hover.seg === "unpaid" ? "Unpaid (booked)"
            : "Cancelled (fee charged)";
          // Position above the hovered column. weekIdx / weeks.length gives
          // its left fraction; add half a column width to center.
          const colPct = 100 / weeks.length;
          const leftPct = hover.weekIdx * colPct + colPct / 2;
          return (
            <div
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                bottom: "calc(100% + 6px)",
                transform: "translateX(-50%)",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: 4,
                boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                padding: "0.5rem 0.7rem",
                fontSize: "0.72rem",
                minWidth: 180,
                maxWidth: 260,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.3rem" }}>
                <span style={{ color: labelColor, fontWeight: 700 }}>{segTitle}</span>
                <span className="meta" style={{ fontSize: "0.66rem" }}>
                  {list.length} {list.length === 1 ? "session" : "sessions"} · {fmtMoney(amt)}
                </span>
              </div>
              {list.length === 0 ? (
                <div className="meta" style={{ fontStyle: "italic" }}>None.</div>
              ) : (() => {
                // Group sessions by client so multi-session clients collapse
                // to one row with a count. Then sort: clients with >1 session
                // float to the top (ordered by their total $ desc), followed
                // by single-session clients (ordered by $ desc).
                const groups = new Map<string, { name: string; count: number; total: number }>();
                for (const a of list) {
                  const key = a.client_id ?? `:${a.client_name ?? "—"}`;
                  const g = groups.get(key);
                  if (g) {
                    g.count += 1;
                    g.total += a.rate ?? 0;
                  } else {
                    groups.set(key, {
                      name: a.client_name ?? "—",
                      count: 1,
                      total: a.rate ?? 0,
                    });
                  }
                }
                const rows = Array.from(groups.values()).sort((x, y) => {
                  // multi-session clients first
                  if ((x.count > 1) !== (y.count > 1)) return x.count > 1 ? -1 : 1;
                  // then by total $ desc within each tier
                  return y.total - x.total;
                });
                return (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.18rem" }}>
                  {rows.slice(0, 8).map((g, idx) => (
                    <li key={`${g.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                        {g.count > 1 && (
                          <span
                            style={{
                              marginLeft: "0.3rem",
                              fontSize: "0.62rem",
                              color: labelColor,
                              fontWeight: 700,
                            }}
                          >
                            ×{g.count}
                          </span>
                        )}
                      </span>
                      <span className="meta" style={{ fontSize: "0.66rem", whiteSpace: "nowrap" }}>
                        {fmtMoney(g.total)}
                      </span>
                    </li>
                  ))}
                  {rows.length > 8 && (
                    <li className="meta" style={{ fontStyle: "italic", fontSize: "0.66rem", marginTop: "0.18rem" }}>
                      + {rows.length - 8} more
                    </li>
                  )}
                </ul>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {/* Baseline */}
      <div style={{ height: 1, background: "var(--line)", marginBottom: "0.35rem" }} />

      {/* Date-range labels */}
      <div style={{ display: "flex", gap: "0.35rem" }}>
        {weeks.map((w, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <span style={{
              fontSize: "0.57rem",
              color: w.isCurrentWeek ? "var(--rust)" : "var(--muted)",
              fontWeight: w.isCurrentWeek ? 700 : 400,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              display: "block",
            }}>
              {w.rangeLabel}
            </span>
            {w.isCurrentWeek && (
              <span style={{ fontSize: "0.54rem", color: "var(--muted)", lineHeight: 1 }}>in progress</span>
            )}
          </div>
        ))}
      </div>

      {/* Legend — three bar segments (no overlap) + the current-week
          progress wash. Hover a segment to see the client list. */}
      <div style={{ display: "flex", gap: "0.85rem", marginTop: "0.65rem", flexWrap: "wrap", rowGap: "0.35rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <div style={{ width: 10, height: 10, background: "var(--sage)", borderRadius: 2 }} />
          <span className="meta" style={{ fontSize: "0.68rem" }}>Paid $</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <div style={{ width: 10, height: 10, background: "var(--steel)", borderRadius: 2 }} />
          <span className="meta" style={{ fontSize: "0.68rem" }}>Unpaid $ (booked)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <div style={{ width: 10, height: 10, background: "var(--rust)", borderRadius: 2 }} />
          <span className="meta" style={{ fontSize: "0.68rem" }}>Cancelled $ (fee charged)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.45)", border: "1px dashed rgba(168,61,43,0.4)", borderRadius: 2 }} />
          <span className="meta" style={{ fontSize: "0.68rem" }}>Days remaining</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "auto" }}>
          <span className="meta" style={{ fontSize: "0.66rem", fontStyle: "italic" }}>
            chip: <span style={{ color: "var(--ink)", fontWeight: 600 }}>✓ completed</span> · <span style={{ color: "var(--sage)", fontWeight: 600 }}>$ paid</span> · <span style={{ color: "var(--red)", fontWeight: 600 }}>✗ cancelled</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible group shell ───────────────────────────────────────────────────

function GroupShell({
  title, badge, defaultOpen, right, children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.55rem",
          background: open ? "rgba(0,0,0,0.02)" : "transparent",
          border: "none", borderBottom: open ? "1px solid var(--line)" : "none",
          padding: "0.7rem 1.1rem", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 700, fontSize: "1rem", flex: 1, textAlign: "left" }}>{title}</span>
        {badge}
        {right && <span onClick={(e) => e.stopPropagation()}>{right}</span>}
      </button>
      {open && <div style={{ padding: "1rem 1.1rem" }}>{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardClient({
  clients,
  initialWeekAppts,
  monthAppts,
  openReq,
  threads,
  changeRequests,
  claimedSlots,
  baseWeekStart,
  clientProgramInfo,
  allTimeStats,
}: {
  clients: ClientRow[];
  initialWeekAppts: AppointmentRow[];
  monthAppts: AppointmentRow[];
  openReq: number;
  threads: { id: string; client_name: string | null; last_message: string | null; last_at: string | null; unread: boolean }[];
  changeRequests: { id: string; client_name: string | null; starts_at: string; requested_starts_at: string | null }[];
  claimedSlots: { id: string; starts_at: string; claimed_by_name: string | null; claimed_at: string | null }[];
  baseWeekStart: Date;
  clientProgramInfo: Map<string, { endsOn: string | null; daysLeft: number | null; name: string | null }>;
  allTimeStats: {
    weeks: { weekStart: string; count: number }[];
    totalSessions: number;
    avgPerWeek: number;
    firstWeek: string | null;
  };
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [displayAppts, setDisplayAppts] = useState<AppointmentRow[]>(initialWeekAppts);
  const [monthOffset, setMonthOffset] = useState(0);
  const [displayMonthAppts, setDisplayMonthAppts] = useState<AppointmentRow[]>(monthAppts);
  const [fetching, startFetch] = useTransition();

  // Compute displayed week start
  const weekStart = useMemo(() => {
    const d = new Date(baseWeekStart);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [baseWeekStart, weekOffset]);

  // Compute displayed month anchor (1st of the month, offset from today's month)
  const monthStart = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const isCurrentMonth = monthOffset === 0;

  function navigate(delta: number) {
    const newOffset = weekOffset + delta;
    const newWs = new Date(baseWeekStart);
    newWs.setDate(newWs.getDate() + newOffset * 7);
    setWeekOffset(newOffset);
    if (newOffset === 0) { setDisplayAppts(initialWeekAppts); return; }
    startFetch(async () => {
      const data = await fetchWeekAppts(newWs.toISOString());
      setDisplayAppts(data);
    });
  }

  function navigateMonth(delta: number) {
    const newOffset = monthOffset + delta;
    setMonthOffset(newOffset);
    if (newOffset === 0) { setDisplayMonthAppts(monthAppts); return; }
    const today = new Date();
    const newMs = new Date(today.getFullYear(), today.getMonth() + newOffset, 1);
    startFetch(async () => {
      const data = await fetchMonthAppts(newMs.toISOString());
      setDisplayMonthAppts(data);
    });
  }

  const router = useRouter();
  const [tableError, setTableError] = useState<string | null>(null);

  function handleMarkPaid(apptId: string, paid: boolean) {
    // Optimistic update so the checkbox feels instant
    setDisplayAppts((prev) => prev.map((a) => a.id === apptId ? { ...a, paid } : a));
    // Fire and forget — Supabase + schedule revalidated in background
    markApptPaid(apptId, paid).catch(() => {
      // Revert on failure
      setDisplayAppts((prev) => prev.map((a) => a.id === apptId ? { ...a, paid: !paid } : a));
    });
  }

  function handleSetRate(apptId: string, rate: number | null, prevRate: number | null) {
    setTableError(null);
    // Optimistic: paint the new rate immediately.
    setDisplayAppts((prev) => prev.map((a) => a.id === apptId ? { ...a, rate } : a));
    setApptRate(apptId, rate).then((res) => {
      if (!res.ok) {
        setTableError(res.error ?? "Rate save failed.");
        // Revert.
        setDisplayAppts((prev) => prev.map((a) => a.id === apptId ? { ...a, rate: prevRate } : a));
        return;
      }
      // Force a fresh fetch so every other surface using the same data
      // (schedule strip, dashboard totals, client roster) reflects the
      // new rate.
      router.refresh();
    });
  }

  function handleSetStatus(
    apptId: string,
    status: AppointmentRow["status"],
    opts: { cancel_reason?: string | null; cancel_reason_other?: string | null } | undefined,
    prevAppt: AppointmentRow,
  ) {
    setTableError(null);
    // Optimistic.
    setDisplayAppts((prev) => prev.map((a) => a.id === apptId ? {
      ...a,
      status,
      ...(opts ? { cancel_reason: opts.cancel_reason ?? null, cancel_reason_other: opts.cancel_reason_other ?? null } : {}),
    } as AppointmentRow : a));
    setApptStatus(apptId, status, opts).then((res) => {
      if (!res.ok) {
        setTableError(res.error ?? "Status save failed.");
        setDisplayAppts((prev) => prev.map((a) => a.id === apptId ? prevAppt : a));
        return;
      }
      router.refresh();
    });
  }

  // ── Derived week data ────────────────────────────────────────────────────
  const hours = displayAppts
    .filter((a) => a.session_type === "session")
    .reduce((acc, a) => {
      return acc + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 3_600_000;
    }, 0);
  const weekRevenue = displayAppts
    .filter((a) => a.session_type === "session")
    .reduce((acc, a) => acc + (a.rate ?? 0), 0);

  const weekSessions: WeekSessionItem[] = displayAppts
    .filter((a) => a.session_type === "session" && a.status !== "cancelled" && a.status !== "no_show" && !!a.client_id)
    .map((a) => {
      const status: "programmed" | "draft" | "needs_programming" =
        a.program_status === "programmed" ? "programmed"
        : a.program_status === "draft" ? "draft"
        : a.session_program_id ? "draft"
        : "needs_programming";
      return {
        id: a.id,
        client_id: a.client_id!,
        client_name: a.client_name,
        starts_at: a.starts_at,
        program_status: status,
        is_programmed: status === "programmed",
      };
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const activeClients = clients.filter((c) => c.lifecycle === "active");
  const sessionClientIds = new Set(weekSessions.map((s) => s.client_id));

  // The Programs banner now only counts clients the coach has flagged with
  // the + button on the Client Roster. Unflagged clients are intentionally
  // hidden here so the banner reflects the coach's active programming queue.
  const weekProgramItems: WeekProgramItem[] = activeClients
    .filter((c) => c.needs_at_home_programming)
    .map((c) => {
      const prog = clientProgramInfo.get(c.id);
      return {
        clientId: c.id,
        clientName: c.full_name,
        programName: prog?.name ?? null,
        endsOn: prog?.endsOn ?? null,
        daysUntilEnd: prog?.daysLeft ?? null,
        hasCurrent: !!prog?.name,
      };
    });

  const noSessionClients: NoSessionClient[] = activeClients
    .filter((c) => !sessionClientIds.has(c.id))
    .map((c) => {
      const monthly = c.regular_frequency ? parseFloat(c.regular_frequency) : null;
      const perWeek = (monthly != null && !isNaN(monthly))
        ? `~${Math.max(1, Math.round(monthly / 4.33))}×/wk`
        : null;
      return { id: c.id, name: c.full_name, perWeek };
    });

  // ── Derived month data ───────────────────────────────────────────────────
  const monthStats = useMemo(() => {
    const sessions = displayMonthAppts.filter(
      (a) => a.session_type === "session" && a.status !== "no_show"
    );
    return {
      bookings: sessions.reduce((s, a) => s + (a.rate ?? 0), 0),
      earned: sessions.filter((a) => a.paid).reduce((s, a) => s + (a.rate ?? 0), 0),
      count: sessions.length,
    };
  }, [displayMonthAppts]);

  const isCurrentWeek = weekOffset === 0;

  return (
    <>
      {/* ── Two-pane grid ────────────────────────────────────────────── */}
      <div className="grid-main">
        {/* ─ LEFT: Week + Month groups ─ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Week group */}
          <GroupShell
            title={`Week of ${weekLabel(weekStart)}`}
            badge={
              isCurrentWeek
                ? <span style={{ fontSize: "0.65rem", background: "var(--rust)", color: "#fff", borderRadius: 99, padding: "0.1rem 0.45rem", fontWeight: 700 }}>This Week</span>
                : <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600 }}>{weekOffset > 0 ? `+${weekOffset}w` : `${weekOffset}w`}</span>
            }
            defaultOpen={true}
            right={
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                  onClick={() => navigate(-1)}
                  disabled={fetching}
                >←</button>
                {!isCurrentWeek && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.72rem" }}
                    onClick={() => { setWeekOffset(0); setDisplayAppts(initialWeekAppts); }}
                    disabled={fetching}
                  >Today</button>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                  onClick={() => navigate(1)}
                  disabled={fetching}
                >→</button>
              </div>
            }
          >
            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
              <div className="stat">
                <div className="stat-label">Paid Hours</div>
                <div className="stat-value">{Math.round(hours)}</div>
                <div className="stat-sub">{displayAppts.filter((a) => a.session_type === "session" && a.status !== "cancelled" && a.status !== "no_show").length} sessions</div>
              </div>
              <div className="stat">
                <div className="stat-label">Revenue</div>
                <div className="stat-value">{fmtMoney(weekRevenue)}</div>
                <div className="stat-sub">at booked rates</div>
              </div>
            </div>

            {/* Week banners */}
            <WeekBanners
              sessions={weekSessions}
              programs={weekProgramItems}
              noSessions={noSessionClients}
            />

            {/* Sessions table — collapsible. Personal blocks are excluded
                from the list and counts so the summary only reflects real
                client sessions. */}
            {(() => {
              const sessionAppts = displayAppts.filter((a) => a.session_type === "session");
              return (
            <details style={{ marginTop: "0.75rem", overflow: "hidden" }}>
              <summary style={{
                cursor: "pointer", userSelect: "none",
                fontSize: "0.78rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.06em",
                color: "var(--muted)", padding: "0.3rem 0",
                listStyle: "none", display: "flex", alignItems: "center", gap: "0.4rem",
              }}>
                <span style={{ fontSize: "0.7rem" }}>▸</span>
                All Sessions Summary
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "0.74rem" }}>
                  ({sessionAppts.length} sessions)
                </span>
              </summary>
            {tableError && (
              <div style={{
                marginTop: "0.5rem",
                padding: "0.3rem 0.55rem",
                background: "rgba(192,57,43,0.08)",
                border: "1px solid var(--red)",
                color: "var(--red)",
                borderRadius: 3,
                fontSize: "0.74rem",
              }}>
                ⚠ {tableError}
              </div>
            )}
            {sessionAppts.length === 0 ? (
              <p className="meta" style={{ marginTop: "0.5rem" }}>No sessions booked for this week.</p>
            ) : (
              <div className="table-scroll-wrap" style={{ marginTop: "0.5rem" }}>
              <table className="table" style={{ minWidth: 600 }}>
                <thead>
                  <tr><th>When</th><th>Client</th><th>Rate</th><th>Paid</th><th>Status</th><th>Program</th></tr>
                </thead>
                <tbody>
                  {sessionAppts.map((a) => {
                    const progStatus: "programmed" | "draft" | "needs_programming" =
                      a.program_status === "programmed" ? "programmed"
                      : a.program_status === "draft" ? "draft"
                      : a.session_program_id ? "draft"
                      : "needs_programming";
                    const isProgrammed = progStatus === "programmed";
                    const isDraft = progStatus === "draft";
                    const isSession = a.session_type === "session" && !!a.client_id;
                    const sessionDate = new Date(a.starts_at);
                    const prog = a.client_id ? clientProgramInfo.get(a.client_id) : null;
                    return (
                      <tr key={a.id}>
                        <td>
                          {sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          <br /><span className="meta">{sessionDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                        </td>
                        <td>{a.client_name ?? <span className="meta">{a.personal_label ?? "—"}</span>}</td>
                        <td>
                          {a.session_type === "session" ? (
                            <RateEditor
                              value={a.rate}
                              onSave={(next) => handleSetRate(a.id, next, a.rate)}
                            />
                          ) : (
                            <span className="meta">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {a.session_type === "session" ? (
                            <input
                              type="checkbox"
                              checked={a.paid}
                              onChange={(e) => handleMarkPaid(a.id, e.target.checked)}
                              style={{ cursor: "pointer", width: 15, height: 15, accentColor: "var(--sage)" }}
                              title={a.paid ? "Marked paid — click to unmark" : "Mark as paid"}
                            />
                          ) : (
                            <span className="meta">—</span>
                          )}
                        </td>
                        <td>
                          <div className="meta" style={{ fontSize: "0.7rem", marginBottom: "0.25rem" }}>
                            {sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmtDaysAway(sessionDate)}
                          </div>
                          {a.change_count > 0 && (
                            <div style={{ marginBottom: "0.25rem" }}>
                              <span className="badge badge-amber">{a.change_count}× changed</span>
                            </div>
                          )}
                          <StatusEditor
                            appt={a}
                            onSave={(next, opts) => handleSetStatus(a.id, next, opts, a)}
                          />
                        </td>
                        <td>
                          {isSession ? (
                            (a.status === "completed" && !isProgrammed && !isDraft) ? (
                              // Backfilled past session — rendered alongside Published but
                              // tagged "historical · no file" since nothing's on file.
                              <span
                                style={{
                                  fontSize: "0.72rem", fontWeight: 600, padding: "0.15rem 0.45rem",
                                  borderRadius: 3,
                                  border: "1px solid var(--sage)",
                                  color: "var(--sage)",
                                  background: "rgba(90,107,74,0.07)",
                                  whiteSpace: "nowrap", display: "inline-block",
                                  cursor: "default",
                                }}
                                title="Historical session — no program file exists on this record."
                              >Published · historical · no file</span>
                            ) : (
                              <>
                                {prog?.endsOn && (
                                  <div className="meta" style={{ fontSize: "0.7rem", marginBottom: "0.25rem", whiteSpace: "nowrap" }}>
                                    {new Date(prog.endsOn).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    {" · "}
                                    <span style={{ color: prog.daysLeft !== null && prog.daysLeft <= 7 ? "var(--amber)" : undefined }}>
                                      {prog.daysLeft !== null ? (prog.daysLeft <= 0 ? "expired" : `${prog.daysLeft}d left`) : "no end"}
                                    </span>
                                  </div>
                                )}
                                <Link
                                  href={`/coach/programming/build?tab=session&client=${a.client_id}&appt=${a.id}`}
                                  style={{
                                    fontSize: "0.72rem", fontWeight: 600, padding: "0.15rem 0.45rem",
                                    borderRadius: 3,
                                    border: `1px ${isDraft ? "dashed" : "solid"} ${isProgrammed ? "var(--sage)" : "var(--amber)"}`,
                                    color: isProgrammed ? "var(--sage)" : "var(--amber)",
                                    background: isProgrammed ? "rgba(90,107,74,0.07)" : "rgba(217,119,6,0.07)",
                                    textDecoration: "none", whiteSpace: "nowrap", display: "inline-block",
                                  }}
                                >
                                  {isProgrammed ? "Published →" : isDraft ? "Draft →" : "Not Programmed →"}
                                </Link>
                              </>
                            )
                          ) : <span className="meta">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            </details>
              );
            })()}
          </GroupShell>

          {/* Month group */}
          <GroupShell
            title={monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            badge={
              isCurrentMonth
                ? <span style={{ fontSize: "0.65rem", background: "var(--rust)", color: "#fff", borderRadius: 99, padding: "0.1rem 0.45rem", fontWeight: 700 }}>This Month</span>
                : <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600 }}>{monthOffset > 0 ? `+${monthOffset}mo` : `${monthOffset}mo`}</span>
            }
            defaultOpen={false}
            right={
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                  onClick={() => navigateMonth(-1)}
                  disabled={fetching}
                >←</button>
                {!isCurrentMonth && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.72rem" }}
                    onClick={() => { setMonthOffset(0); setDisplayMonthAppts(monthAppts); }}
                    disabled={fetching}
                  >This Month</button>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                  onClick={() => navigateMonth(1)}
                  disabled={fetching}
                >→</button>
              </div>
            }
          >
            {/* Revenue stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="stat">
                <div className="stat-label">Bookings</div>
                <div className="stat-value">{fmtMoney(monthStats.bookings)}</div>
                <div className="stat-sub">{monthStats.count} sessions scheduled</div>
              </div>
              <div className="stat">
                <div className="stat-label">Earned</div>
                <div className="stat-value" style={{ color: "var(--sage)" }}>{fmtMoney(monthStats.earned)}</div>
                <div className="stat-sub">
                  {monthStats.bookings > 0
                    ? `${Math.round((monthStats.earned / monthStats.bookings) * 100)}% collected`
                    : "no sessions"}
                </div>
              </div>
            </div>

            {/* Week-over-week chart */}
            <div style={{ marginTop: "1rem" }}>
              <div className="stat-label" style={{ marginBottom: "0" }}>Week by week</div>
              <WoWChart monthAppts={displayMonthAppts} monthStart={monthStart} />
            </div>
          </GroupShell>

          {/* All-time session history — sits under the Month group on
              the left column, collapsed by default so the dashboard
              focuses on the current month at a glance. */}
          <GroupShell
            title="All-time session history"
            badge={
              <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600 }}>
                {allTimeStats.totalSessions} total
              </span>
            }
            defaultOpen={false}
          >
            <AllTimeSessionsBlock stats={allTimeStats} />
          </GroupShell>
        </div>

        {/* ─ RIGHT: Inbox + Open Requests ─ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Inbox</h2>
              <Link href="/coach/messages" className="meta">All →</Link>
            </div>
            <hr className="divider" />
            {(() => {
              const unread = threads.filter((t) => t.unread);
              const total = unread.length + changeRequests.length + claimedSlots.length;
              if (total === 0) {
                return <p className="meta">All caught up — nothing pending.</p>;
              }
              const fmtTime = (iso: string | null) => iso
                ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : "";
              return (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  {/* Availability reschedule requests (change-requested appointments) */}
                  {changeRequests.map((c) => (
                    <li
                      key={`cr-${c.id}`}
                      style={{
                        borderLeft: "3px solid var(--amber)",
                        paddingLeft: "0.6rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.4rem" }}>
                        <Link href="/coach/appointments" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700, fontSize: "0.88rem" }}>
                          <span style={{ color: "var(--amber)", marginRight: "0.3rem" }}>↻</span>
                          {c.client_name ?? "—"}
                        </Link>
                        <span className="meta" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>{fmtTime(c.starts_at)}</span>
                      </div>
                      <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                        Reschedule request{c.requested_starts_at ? <> → <strong style={{ color: "var(--ink)" }}>{fmtTime(c.requested_starts_at)}</strong></> : null}
                      </p>
                    </li>
                  ))}

                  {/* Appointment bids — slot_offers a client has claimed */}
                  {claimedSlots.map((s) => (
                    <li
                      key={`bid-${s.id}`}
                      style={{
                        borderLeft: "3px solid var(--clay)",
                        paddingLeft: "0.6rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.4rem" }}>
                        <Link href="/coach/availability" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700, fontSize: "0.88rem" }}>
                          <span style={{ color: "var(--clay)", marginRight: "0.3rem" }}>+</span>
                          {s.claimed_by_name ?? "—"}
                        </Link>
                        <span className="meta" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>{fmtTime(s.starts_at)}</span>
                      </div>
                      <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                        Claimed an open slot — confirm to schedule
                      </p>
                    </li>
                  ))}

                  {/* Unread messages */}
                  {unread.map((t) => (
                    <li
                      key={`m-${t.id}`}
                      style={{
                        borderLeft: "3px solid var(--rust)",
                        paddingLeft: "0.6rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.4rem" }}>
                        <Link href={`/coach/messages?thread=${t.id}`} style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700, fontSize: "0.88rem" }}>
                          <span style={{ color: "var(--rust)", marginRight: "0.3rem" }}>✉</span>
                          {t.client_name ?? "—"}
                        </Link>
                        <span className="meta" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>{t.last_at ? new Date(t.last_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                      </div>
                      <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>{t.last_message}</p>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>

          <TodoBlock />
        </div>
      </div>
    </>
  );
}

// ── All-time weekly session counts ───────────────────────────────────
// Sits at the bottom of the dashboard: one big stat (sessions/week avg
// since the first session on record) + a horizontal bar chart of every
// week with at least one session, so you can scan the long-term trend.
function AllTimeSessionsBlock({
  stats,
}: {
  stats: {
    weeks: { weekStart: string; count: number }[];
    totalSessions: number;
    avgPerWeek: number;
    firstWeek: string | null;
  };
}) {
  if (stats.weeks.length === 0) {
    return (
      <p className="meta" style={{ fontStyle: "italic" }}>
        No completed sessions on record yet.
      </p>
    );
  }
  const maxCount = Math.max(...stats.weeks.map((w) => w.count), 1);
  const avg = stats.avgPerWeek;
  const avgRounded = Math.round(avg * 10) / 10;
  const firstLabel = stats.firstWeek
    ? new Date(stats.firstWeek + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const lastLabel = stats.weeks.length > 0
    ? new Date(stats.weeks[stats.weeks.length - 1].weekStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  // Recent vs older average so we can show a trend hint.
  const recent12 = stats.weeks.slice(-12);
  const recentAvg = recent12.length > 0
    ? recent12.reduce((s, w) => s + w.count, 0) / recent12.length
    : 0;
  const trendDelta = recentAvg - avg;
  // Bar geometry — sized to fit data labels above each bar without
  // making the GroupShell ridiculously tall. Wider bars + bigger gaps
  // so the count text has room to breathe.
  const BAR_W = 14;
  const BAR_GAP = 3;
  const BAR_H = 110;
  return (
    <div>
      <div className="meta" style={{ fontSize: "0.74rem", marginBottom: "0.7rem" }}>
        {firstLabel} → {lastLabel} · {stats.totalSessions} sessions
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "0.85rem",
        }}
      >
        <div>
          <div className="stat-label">Avg sessions / wk</div>
          <div style={{ fontSize: "1.55rem", fontWeight: 700, color: "var(--rust)", lineHeight: 1.1, fontFamily: "Oswald, sans-serif" }}>
            {avgRounded}
          </div>
          <div className="meta" style={{ fontSize: "0.68rem" }}>
            over {stats.weeks.length} week{stats.weeks.length === 1 ? "" : "s"}
          </div>
        </div>
        <div>
          <div className="stat-label">Last 12 weeks</div>
          <div style={{ fontSize: "1.55rem", fontWeight: 700, color: "var(--ink)", lineHeight: 1.1, fontFamily: "Oswald, sans-serif" }}>
            {Math.round(recentAvg * 10) / 10}
          </div>
          <div className="meta" style={{ fontSize: "0.68rem", color: trendDelta >= 0 ? "var(--sage)" : "var(--red)", fontWeight: 600 }}>
            {trendDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(trendDelta * 10) / 10)}/wk
          </div>
        </div>
        <div>
          <div className="stat-label">Highest wk</div>
          <div style={{ fontSize: "1.55rem", fontWeight: 700, color: "var(--ink)", lineHeight: 1.1, fontFamily: "Oswald, sans-serif" }}>
            {maxCount}
          </div>
          <div className="meta" style={{ fontSize: "0.68rem" }}>peak</div>
        </div>
      </div>

      {/* Bar chart — one bar per week with the session count rendered as
          a data label directly above the bar. Scrolls horizontally
          inside the GroupShell when history is long. */}
      <div
        style={{
          overflowX: "auto",
          paddingBottom: "0.35rem",
          borderTop: "1px solid var(--line)",
          paddingTop: "0.85rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: BAR_GAP,
            height: BAR_H + 16, // bar area + label band above
            minWidth: "100%",
            position: "relative",
          }}
        >
          {stats.weeks.map((w) => {
            const pct = (w.count / maxCount) * 100;
            const barH = Math.max(2, Math.round((pct / 100) * BAR_H));
            const isAboveAvg = w.count >= avg;
            return (
              <div
                key={w.weekStart}
                title={`Week of ${new Date(w.weekStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${w.count} session${w.count === 1 ? "" : "s"}`}
                style={{
                  width: BAR_W,
                  flex: "0 0 auto",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  height: "100%",
                }}
              >
                {/* Data label sits in a 14px band above the bar */}
                <span style={{
                  fontSize: "0.58rem",
                  lineHeight: 1,
                  color: "var(--muted)",
                  marginBottom: 2,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {w.count}
                </span>
                <div style={{
                  width: BAR_W,
                  height: barH,
                  background: isAboveAvg ? "var(--rust)" : "rgba(168,61,43,0.35)",
                  borderRadius: "2px 2px 0 0",
                }} />
              </div>
            );
          })}
        </div>
        {/* Reference line for the avg */}
        <div style={{ height: 1, background: "var(--line)", marginTop: 4 }} />
        <div className="meta" style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", marginTop: "0.2rem" }}>
          <span>{firstLabel}</span>
          <span style={{ fontStyle: "italic" }}>
            Rust = at or above all-time avg · faded = below
          </span>
          <span>{lastLabel}</span>
        </div>
      </div>

      {/* Distribution histogram — actual % of weeks at light / target /
          heavy compared against the 20/60/20 target split. */}
      <SessionDistributionBlock weeks={stats.weeks} />
    </div>
  );
}

// ── Distribution vs target ───────────────────────────────────────────
// Per James's plan: 60% of weeks at 25 sessions, 20% at 30, 20% at 20.
// Bucket each week's count into Light (<=22) / Target (23-27) / Heavy
// (>=28) and show actual % vs. target %.
function SessionDistributionBlock({
  weeks,
}: {
  weeks: { weekStart: string; count: number }[];
}) {
  if (weeks.length === 0) return null;
  type Bucket = {
    key: "light" | "target" | "heavy";
    label: string;
    rangeLabel: string;
    targetPct: number;
    count: number;
    pct: number;
    color: string;
  };
  let light = 0, target = 0, heavy = 0;
  for (const w of weeks) {
    if (w.count <= 22) light += 1;
    else if (w.count <= 27) target += 1;
    else heavy += 1;
  }
  const total = weeks.length;
  const buckets: Bucket[] = [
    { key: "light",  label: "Light",  rangeLabel: "≤22 sess",   targetPct: 20, count: light,  pct: (light  / total) * 100, color: "var(--steel)" },
    { key: "target", label: "Target", rangeLabel: "23–27 sess", targetPct: 60, count: target, pct: (target / total) * 100, color: "var(--sage)"  },
    { key: "heavy",  label: "Heavy",  rangeLabel: "≥28 sess",   targetPct: 20, count: heavy,  pct: (heavy  / total) * 100, color: "var(--rust)"  },
  ];
  return (
    <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--line)", paddingTop: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.6rem", marginBottom: "0.55rem" }}>
        <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Weekly distribution</h3>
        <span className="meta" style={{ fontSize: "0.7rem" }}>
          target split: 20% Light · 60% Target · 20% Heavy
        </span>
      </div>

      {/* Single stacked bar showing the actual breakdown. */}
      <div style={{
        display: "flex", height: 10, borderRadius: 999, overflow: "hidden",
        border: "1px solid var(--line)", marginBottom: "0.45rem",
      }}>
        {buckets.map((b) => (
          <div
            key={b.key}
            title={`${b.label} (${b.rangeLabel}): ${b.count}/${total} weeks · ${Math.round(b.pct)}%`}
            style={{ width: `${b.pct}%`, background: b.color }}
          />
        ))}
      </div>

      {/* Per-bucket comparison rows. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.32rem" }}>
        {buckets.map((b) => {
          const delta = b.pct - b.targetPct;
          const deltaRounded = Math.round(delta * 10) / 10;
          const onTarget = Math.abs(delta) < 5;
          return (
            <div key={b.key} style={{
              display: "grid",
              gridTemplateColumns: "minmax(64px, 90px) minmax(80px, 110px) 1fr auto",
              gap: "0.55rem",
              alignItems: "center",
              fontSize: "0.78rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                <span style={{ width: 8, height: 8, background: b.color, borderRadius: 2, flexShrink: 0 }} />
                <strong>{b.label}</strong>
              </div>
              <span className="meta" style={{ fontSize: "0.7rem" }}>{b.rangeLabel}</span>
              <div style={{
                position: "relative",
                height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 999, overflow: "visible",
              }}>
                {/* Actual fill */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${Math.min(100, b.pct)}%`,
                  background: b.color, borderRadius: 999,
                }} />
                {/* Target marker — vertical line */}
                <div title={`Target ${b.targetPct}%`} style={{
                  position: "absolute", left: `${b.targetPct}%`, top: -3, bottom: -3,
                  width: 2, background: "var(--ink)", borderRadius: 1,
                }} />
              </div>
              <span className="meta" style={{
                fontSize: "0.7rem", whiteSpace: "nowrap",
                color: onTarget ? "var(--sage)" : (delta > 0 ? "var(--rust)" : "var(--steel)"),
                fontWeight: 600,
              }}>
                {Math.round(b.pct)}% {onTarget
                  ? "≈ target"
                  : `(${deltaRounded >= 0 ? "+" : ""}${deltaRounded}% vs ${b.targetPct}%)`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline editors for the All Sessions Summary table ────────────────

function RateEditor({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (next: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  // Keep draft synced when external (optimistic / refresh) updates change
  // the value prop while we're not editing.
  useMemo(() => { if (!editing) setDraft(value != null ? String(value) : ""); }, [value, editing]);
  function commit() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      // Bad input → revert without saving.
      setDraft(value != null ? String(value) : "");
      setEditing(false);
      return;
    }
    setEditing(false);
    if (next !== value) onSave(next);
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit rate"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", fontSize: "inherit",
          padding: "0.1rem 0.25rem", borderRadius: 2,
          color: "inherit",
        }}
      >
        {value != null ? `$${value}` : <span className="meta">—</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      min={0}
      step={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value != null ? String(value) : ""); setEditing(false); }
      }}
      style={{
        width: 76,
        padding: "0.2rem 0.35rem",
        fontFamily: "inherit",
        fontSize: "0.86rem",
        border: "1px solid var(--rust)",
        borderRadius: 3,
      }}
    />
  );
}

function StatusEditor({
  appt,
  onSave,
}: {
  appt: AppointmentRow;
  onSave: (
    next: AppointmentRow["status"],
    opts?: { cancel_reason?: string | null; cancel_reason_other?: string | null },
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<AppointmentRow["status"]>(appt.status);
  const [reason, setReason] = useState<string>((appt as unknown as { cancel_reason?: string | null }).cancel_reason ?? "");
  const [reasonOther, setReasonOther] = useState<string>((appt as unknown as { cancel_reason_other?: string | null }).cancel_reason_other ?? "");
  const [err, setErr] = useState<string | null>(null);

  const STATUSES: AppointmentRow["status"][] = ["scheduled", "completed", "cancelled", "no_show", "change_requested"];

  function commit() {
    setErr(null);
    const needsReason = draftStatus === "cancelled" || draftStatus === "no_show";
    if (needsReason && !reason) {
      setErr("Pick a reason.");
      return;
    }
    if (needsReason && reason === "other" && !reasonOther.trim()) {
      setErr("Specify the other reason.");
      return;
    }
    setEditing(false);
    onSave(draftStatus, needsReason ? { cancel_reason: reason, cancel_reason_other: reasonOther } : undefined);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit status"
        style={{
          background: STATUS_COLORS[appt.status].bg,
          color: STATUS_COLORS[appt.status].fg,
          fontWeight: 600,
          fontSize: "0.72rem",
          padding: "0.18rem 0.5rem",
          borderRadius: 3,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", gap: "0.3rem",
        }}
      >
        <span style={{ fontSize: "0.78rem" }}>{STATUS_GLYPH[appt.status]}</span>
        {STATUS_LABELS[appt.status]}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <select
        autoFocus
        value={draftStatus}
        onChange={(e) => setDraftStatus(e.target.value as AppointmentRow["status"])}
        style={{
          padding: "0.18rem 0.3rem",
          fontFamily: "inherit",
          fontSize: "0.78rem",
          border: "1px solid var(--rust)",
          borderRadius: 3,
        }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_GLYPH[s]} {STATUS_LABELS[s]}</option>
        ))}
      </select>
      {(draftStatus === "cancelled" || draftStatus === "no_show") && (
        <>
          <select
            value={reason}
            onChange={(e) => { setReason(e.target.value); setReasonOther(""); }}
            style={{
              padding: "0.18rem 0.3rem",
              fontFamily: "inherit",
              fontSize: "0.74rem",
              border: "1px solid var(--line)",
              borderRadius: 3,
            }}
          >
            <option value="">— Reason —</option>
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>{CANCEL_REASON_LABELS[r as CancelReason]}</option>
            ))}
          </select>
          {reason === "other" && (
            <input
              type="text"
              placeholder="Specify…"
              value={reasonOther}
              onChange={(e) => setReasonOther(e.target.value)}
              style={{
                padding: "0.18rem 0.35rem",
                fontFamily: "inherit",
                fontSize: "0.74rem",
                border: "1px solid var(--line)",
                borderRadius: 3,
              }}
            />
          )}
        </>
      )}
      {err && <span style={{ color: "var(--red)", fontSize: "0.7rem" }}>{err}</span>}
      <div style={{ display: "flex", gap: "0.3rem" }}>
        <button
          type="button"
          onClick={commit}
          style={{
            padding: "0.16rem 0.5rem", fontSize: "0.72rem", fontWeight: 600,
            background: "var(--ink)", color: "var(--paper)",
            border: "none", borderRadius: 2, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >Save</button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setDraftStatus(appt.status);
            setReason((appt as unknown as { cancel_reason?: string | null }).cancel_reason ?? "");
            setReasonOther((appt as unknown as { cancel_reason_other?: string | null }).cancel_reason_other ?? "");
            setErr(null);
          }}
          style={{
            padding: "0.16rem 0.5rem", fontSize: "0.72rem",
            background: "transparent", color: "var(--muted)",
            border: "1px solid var(--line)", borderRadius: 2, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >Cancel</button>
      </div>
    </div>
  );
}

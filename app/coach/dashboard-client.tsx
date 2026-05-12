"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import type { AppointmentRow, ClientRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { pastProgramsForClient } from "@/lib/programs";
import { fetchWeekAppts } from "@/app/coach/schedule/actions";
import WeekBanners from "./week-banners";
import TodoBlock from "./todo-block";
import type { WeekSessionItem, WeekProgramItem, NoSessionClient } from "./week-banners";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function WoWChart({ monthAppts }: { monthAppts: AppointmentRow[] }) {
  const weeks = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Build 5 buckets: find Monday-anchored week that contains day 1, then +7 each
    const firstWeek = startOfWeekLocal(monthStart);
    const buckets: { label: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new Date(firstWeek);
      s.setDate(firstWeek.getDate() + i * 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      // Only include weeks that overlap the current month
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      if (s >= monthEnd) break;
      buckets.push({
        label: s.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start: s,
        end: e,
      });
    }
    return buckets.map((b) => {
      const appts = monthAppts.filter((a) => {
        const t = new Date(a.starts_at).getTime();
        return t >= b.start.getTime() && t < b.end.getTime()
          && a.session_type === "session"
          && a.status !== "cancelled"
          && a.status !== "no_show";
      });
      const bookings = appts.reduce((s, a) => s + (a.rate ?? 0), 0);
      const earned = appts.filter((a) => a.paid).reduce((s, a) => s + (a.rate ?? 0), 0);
      return { ...b, bookings, earned, count: appts.length };
    });
  }, [monthAppts]);

  const maxVal = Math.max(...weeks.map((w) => w.bookings), 1);
  const chartH = 100;

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "0.35rem", height: chartH + 24 }}>
        {weeks.map((w, i) => {
          const barH = Math.max(3, Math.round((w.bookings / maxVal) * chartH));
          const earnedH = Math.max(0, Math.round((w.earned / maxVal) * chartH));
          const isCurrentWeek = w.start <= new Date() && new Date() < w.end;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
              {/* Value label */}
              <span style={{ fontSize: "0.62rem", color: "var(--muted)", lineHeight: 1 }}>
                {w.bookings > 0 ? fmtMoney(w.bookings) : ""}
              </span>
              {/* Bar stack */}
              <div style={{
                width: "100%", height: barH,
                background: isCurrentWeek ? "var(--rust)" : "rgba(168,61,43,0.25)",
                borderRadius: "2px 2px 0 0",
                position: "relative",
                alignSelf: "flex-end",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {/* Earned overlay */}
                {earnedH > 0 && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    height: earnedH,
                    background: isCurrentWeek ? "var(--sage)" : "rgba(90,107,74,0.4)",
                    borderRadius: "2px 2px 0 0",
                  }} />
                )}
                {/* Session count inside bar */}
                {w.count > 0 && barH >= 16 && (
                  <span style={{
                    position: "relative", zIndex: 1,
                    fontSize: "0.6rem", fontWeight: 700,
                    color: isCurrentWeek ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.45)",
                    lineHeight: 1,
                    userSelect: "none",
                  }}>
                    {w.count}
                  </span>
                )}
              </div>
              {/* Week label */}
              <span style={{ fontSize: "0.6rem", color: isCurrentWeek ? "var(--ink)" : "var(--muted)", fontWeight: isCurrentWeek ? 700 : 400, lineHeight: 1, textAlign: "center" }}>
                {w.label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: "0.85rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <div style={{ width: 10, height: 10, background: "var(--rust)", borderRadius: 2 }} />
          <span className="meta" style={{ fontSize: "0.68rem" }}>Bookings</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <div style={{ width: 10, height: 10, background: "var(--sage)", borderRadius: 2 }} />
          <span className="meta" style={{ fontSize: "0.68rem" }}>Earned (paid)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.9)", background: "var(--rust)", borderRadius: 2, padding: "0 3px", lineHeight: "14px" }}>n</span>
          <span className="meta" style={{ fontSize: "0.68rem" }}>Sessions</span>
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
  baseWeekStart,
  clientProgramInfo,
}: {
  clients: ClientRow[];
  initialWeekAppts: AppointmentRow[];
  monthAppts: AppointmentRow[];
  openReq: number;
  threads: { id: string; client_name: string | null; last_message: string | null; last_at: string | null; unread: boolean }[];
  baseWeekStart: Date;
  clientProgramInfo: Map<string, { endsOn: string | null; daysLeft: number | null; name: string | null }>;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [displayAppts, setDisplayAppts] = useState<AppointmentRow[]>(initialWeekAppts);
  const [fetching, startFetch] = useTransition();

  // Compute displayed week start
  const weekStart = useMemo(() => {
    const d = new Date(baseWeekStart);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [baseWeekStart, weekOffset]);

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

  // ── Derived week data ────────────────────────────────────────────────────
  const hours = displayAppts.reduce((acc, a) => {
    return acc + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 3_600_000;
  }, 0);
  const weekRevenue = displayAppts.reduce((acc, a) => acc + (a.rate ?? 0), 0);

  const weekSessions: WeekSessionItem[] = displayAppts
    .filter((a) => a.session_type === "session" && a.status !== "cancelled" && a.status !== "no_show" && !!a.client_id)
    .map((a) => ({
      id: a.id,
      client_id: a.client_id!,
      client_name: a.client_name,
      starts_at: a.starts_at,
      is_programmed: a.program_status === "programmed" || !!a.session_program_id,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const activeClients = clients.filter((c) => c.lifecycle === "active");
  const sessionClientIds = new Set(weekSessions.map((s) => s.client_id));

  const weekProgramItems: WeekProgramItem[] = activeClients.map((c) => {
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
    .map((c) => ({ id: c.id, name: c.full_name }));

  // ── Derived month data ───────────────────────────────────────────────────
  const monthStats = useMemo(() => {
    const sessions = monthAppts.filter(
      (a) => a.session_type === "session" && a.status !== "cancelled" && a.status !== "no_show"
    );
    return {
      bookings: sessions.reduce((s, a) => s + (a.rate ?? 0), 0),
      earned: sessions.filter((a) => a.paid).reduce((s, a) => s + (a.rate ?? 0), 0),
      count: sessions.length,
    };
  }, [monthAppts]);

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
                <div className="stat-label">Hours</div>
                <div className="stat-value">{Math.round(hours)}</div>
                <div className="stat-sub">{displayAppts.length} sessions</div>
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

            {/* Sessions table */}
            {displayAppts.length === 0 ? (
              <p className="meta">No sessions booked for this week.</p>
            ) : (
              <table className="table" style={{ marginTop: "0.5rem" }}>
                <thead>
                  <tr><th>When</th><th>Client</th><th>Rate</th><th>Status</th><th>Program</th></tr>
                </thead>
                <tbody>
                  {displayAppts.map((a) => {
                    const isProgrammed = a.program_status === "programmed" || !!a.session_program_id;
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
                        <td>{fmtMoney(a.rate)}</td>
                        <td>
                          <div className="meta" style={{ fontSize: "0.7rem", marginBottom: "0.25rem" }}>
                            {sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmtDaysAway(sessionDate)}
                          </div>
                          {a.change_count > 0
                            ? <span className="badge badge-amber">{a.change_count}× changed</span>
                            : <span className="badge">{a.status}</span>}
                        </td>
                        <td>
                          {isSession ? (
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
                                href={`/coach/build-program?tab=session&client=${a.client_id}&appt=${a.id}`}
                                style={{
                                  fontSize: "0.72rem", fontWeight: 600, padding: "0.15rem 0.45rem",
                                  borderRadius: 3,
                                  border: `1px solid ${isProgrammed ? "var(--sage)" : "var(--amber)"}`,
                                  color: isProgrammed ? "var(--sage)" : "var(--amber)",
                                  background: isProgrammed ? "rgba(90,107,74,0.07)" : "rgba(217,119,6,0.07)",
                                  textDecoration: "none", whiteSpace: "nowrap", display: "inline-block",
                                }}
                              >
                                {isProgrammed ? "Programmed →" : "Not Programmed →"}
                              </Link>
                            </>
                          ) : <span className="meta">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </GroupShell>

          {/* Month group */}
          <GroupShell
            title={new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            badge={<span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600 }}>Month</span>}
            defaultOpen={false}
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
              <div className="stat-label" style={{ marginBottom: "0.25rem" }}>Week over week</div>
              <WoWChart monthAppts={monthAppts} />
            </div>
          </GroupShell>
        </div>

        {/* ─ RIGHT: Inbox + Open Requests ─ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Inbox</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                {openReq > 0 && (
                  <Link
                    href="/coach/schedule"
                    style={{
                      fontSize: "0.72rem", fontWeight: 700, padding: "0.15rem 0.5rem",
                      borderRadius: 99,
                      background: "rgba(217,119,6,0.12)", color: "var(--amber)",
                      border: "1px solid rgba(217,119,6,0.3)",
                      textDecoration: "none", whiteSpace: "nowrap",
                    }}
                  >
                    {openReq} open request{openReq !== 1 ? "s" : ""} →
                  </Link>
                )}
                <Link href="/coach/messages" className="meta">All →</Link>
              </div>
            </div>
            <hr className="divider" />
            {threads.length === 0 ? (
              <p className="meta">No messages.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {threads.slice(0, 6).map((t) => (
                  <li key={t.id} style={{ borderLeft: t.unread ? "3px solid var(--rust)" : "3px solid transparent", paddingLeft: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{t.client_name}</strong>
                      <span className="meta">{t.last_at ? new Date(t.last_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                    </div>
                    <p style={{ margin: 0 }} className="meta">{t.last_message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <TodoBlock />
        </div>
      </div>
    </>
  );
}

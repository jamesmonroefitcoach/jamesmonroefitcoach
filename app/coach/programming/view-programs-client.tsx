"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClientProgramBlock } from "./page";
import { fmtDate } from "@/lib/format";

function fmtSessionTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: "programmed" | "draft" | "needs_programming" | "n/a" }) {
  if (status === "programmed") return <span className="badge badge-sage" style={{ fontSize: "0.58rem" }}>published</span>;
  if (status === "draft") return <span className="badge badge-amber" style={{ fontSize: "0.58rem" }}>draft</span>;
  if (status === "needs_programming") return <span className="badge" style={{ fontSize: "0.58rem", color: "var(--muted)" }}>—</span>;
  // n/a — backfilled past sessions. Render under "published" so they sit in
  // the same bucket as programmed work, with a "no file" flag so it's clear
  // there's no actual program record behind the row.
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      <span className="badge badge-sage" style={{ fontSize: "0.58rem" }}>published</span>
      <span className="badge" style={{ fontSize: "0.54rem", color: "var(--muted)" }} title="Historical — no program file on record">hist · no file</span>
    </span>
  );
}

function MonthGroup({ clientId, month, sessions }: {
  clientId: string;
  month: string;
  sessions: ClientProgramBlock["historicalSessions"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 3, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "rgba(0,0,0,0.025)", border: "none",
          padding: "0.28rem 0.5rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.74rem", fontWeight: 600 }}>{open ? "▾" : "▸"} {month}</span>
        <span className="meta" style={{ fontSize: "0.66rem" }}>{sessions.length}</span>
      </button>
      {open && (
        <div style={{ padding: "0.25rem 0.35rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {sessions.map((s) => {
            const viewParam = s.program_status === "programmed" ? "&view=plan" : "";
            return (
              <Link
                key={s.id}
                href={`/coach/programming/build?tab=session&client=${clientId}&appt=${s.id}${viewParam}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem",
                  padding: "0.2rem 0.35rem", borderRadius: 3,
                  textDecoration: "none", color: "var(--ink)",
                  fontSize: "0.74rem",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>{fmtSessionTime(s.starts_at)}</span>
                <StatusBadge status={s.program_status} />
                <span style={{ color: "var(--rust)", flexShrink: 0 }}>→</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientHistoricals({ block }: { block: ClientProgramBlock }) {
  const sessionsByMonth = useMemo(() => {
    const map = new Map<string, ClientProgramBlock["historicalSessions"]>();
    for (const s of block.historicalSessions) {
      const k = monthKey(s.starts_at);
      const cur = map.get(k) ?? [];
      cur.push(s);
      map.set(k, cur);
    }
    return Array.from(map.entries());
  }, [block.historicalSessions]);

  const programs = block.historicalPrograms;
  if (sessionsByMonth.length === 0 && programs.length === 0) {
    return <p className="meta" style={{ fontSize: "0.74rem", margin: 0 }}>No history yet.</p>;
  }

  return (
    <div className="banner-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
      {/* Left: Sessions grouped by Month Year */}
      <div>
        <div style={{
          fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.07em", color: "var(--rust)",
          paddingBottom: "0.25rem", borderBottom: "1px solid var(--line)",
          marginBottom: "0.4rem",
        }}>Sessions</div>
        {sessionsByMonth.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.72rem" }}>No past sessions.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {sessionsByMonth.map(([month, sessions]) => (
              <MonthGroup key={month} clientId={block.clientId} month={month} sessions={sessions} />
            ))}
          </div>
        )}
      </div>

      {/* Right: Programs listed by name + date range */}
      <div>
        <div style={{
          fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.07em", color: "var(--rust)",
          paddingBottom: "0.25rem", borderBottom: "1px solid var(--line)",
          marginBottom: "0.4rem",
        }}>Programs</div>
        {programs.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.72rem" }}>No past programs.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/coach/programming/build?tab=program&client=${block.clientId}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                  padding: "0.3rem 0.45rem", borderRadius: 3,
                  background: "rgba(0,0,0,0.025)",
                  border: "1px solid var(--line)",
                  textDecoration: "none", color: "var(--ink)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.78rem" }}>{p.name}</div>
                  <div className="meta" style={{ fontSize: "0.66rem" }}>
                    {fmtDate(p.starts_on)} → {fmtDate(p.ends_on)}
                  </div>
                </div>
                <span style={{ color: "var(--rust)", fontSize: "0.74rem", flexShrink: 0 }}>→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFullDateTime(iso: string): string {
  // e.g. "Wed, May 14 · 7:00 AM"
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function statusColor(status: "Programmed" | "Drafted" | "Not Programmed" | "published" | "draft" | "none"): string {
  if (status === "Programmed" || status === "published") return "var(--sage)";
  if (status === "Drafted" || status === "draft") return "var(--amber)";
  return "var(--muted)";
}

function ClientRow({ block, view }: { block: ClientProgramBlock; view: "sessions" | "programs" }) {
  const [open, setOpen] = useState(false);
  const { active, historicalSessions, historicalPrograms, nextSession, scheduledThisMonth } = block;
  const isSessionsView = view === "sessions";
  const isProgramsView = view === "programs";

  // Subtext bits — Next Session, Program, this-month count, past sessions, past programs
  const programStatusLabel: "Programmed" | "Drafted" | "Not Programmed" =
    active.programStatus === "published" ? "Programmed"
    : active.programStatus === "draft" ? "Drafted"
    : "Not Programmed";

  // Full date range when both ends are known; otherwise show what's available
  const programDateText = active.program
    ? (active.program.starts_on && active.program.ends_on
        ? `${fmtShortDate(active.program.starts_on)} → ${fmtShortDate(active.program.ends_on)}`
        : active.program.ends_on
          ? `ends ${fmtShortDate(active.program.ends_on)}`
          : active.program.starts_on
            ? `from ${fmtShortDate(active.program.starts_on)}`
            : "")
    : "";

  return (
    <div style={{
      borderBottom: "1px solid var(--line)",
      padding: "0.6rem 0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Link
            href={`/coach/clients/${block.clientId}`}
            style={{
              fontWeight: 700, fontSize: "0.92rem", color: "var(--ink)",
              textDecoration: "none",
            }}
          >{block.clientName}</Link>
          <div
            className="meta"
            style={{
              fontSize: "0.72rem",
              marginTop: "0.25rem",
              display: "grid",
              // Three columns when viewing Sessions (Next / This month / Past
              // sessions), two when viewing Programs (Program / Past programs).
              gridTemplateColumns: isSessionsView
                ? "minmax(0, 1.8fr) minmax(0, 0.85fr) minmax(0, 0.85fr)"
                : "minmax(0, 1.6fr) minmax(0, 0.85fr)",
              columnGap: "1rem",
              rowGap: "0.15rem",
              alignItems: "baseline",
            }}
          >
            {isSessionsView && (
              <>
                {/* Next Session — full date+time first, status link to the right */}
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>Next Session:</span>{" "}
                  {nextSession ? (() => {
                    const startsParam = encodeURIComponent(nextSession.starts_at);
                    const viewParam = nextSession.status === "Programmed" ? "&view=plan" : "";
                    const href = `/coach/programming/build?tab=session&appt=${nextSession.id}&client=${block.clientId}&starts=${startsParam}${viewParam}`;
                    const verb = nextSession.status === "Programmed" ? "View"
                      : nextSession.status === "Drafted" ? "Edit"
                      : "Build";
                    return (
                      <>
                        <span style={{ color: "var(--ink)" }}>{fmtFullDateTime(nextSession.starts_at)}</span>
                        {" · "}
                        <Link
                          href={href}
                          title={`${verb} session program`}
                          style={{ color: statusColor(nextSession.status), fontWeight: 600, textDecoration: "underline" }}
                        >{nextSession.status}</Link>
                      </>
                    );
                  })() : (
                    <span style={{ color: "var(--muted)" }}>None scheduled</span>
                  )}
                </span>
                {/* This-month count */}
                <span style={{ minWidth: 0, whiteSpace: "nowrap" }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>This month:</span>{" "}
                  <span style={{ color: "var(--ink)" }}>{scheduledThisMonth} session{scheduledThisMonth !== 1 ? "s" : ""}</span>
                </span>
                {/* Past sessions */}
                <span style={{ minWidth: 0, whiteSpace: "nowrap" }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>Past sessions:</span>{" "}
                  <span style={{ color: "var(--ink)" }}>{historicalSessions.length}</span>
                </span>
              </>
            )}
            {isProgramsView && (
              <>
                {/* Program — date range first, status link to the right */}
                {(() => {
                  const viewParam = programStatusLabel === "Programmed" ? "&view=plan" : "";
                  const href = `/coach/programming/build?tab=program&client=${block.clientId}${viewParam}`;
                  const verb = programStatusLabel === "Programmed" ? "View"
                    : programStatusLabel === "Drafted" ? "Edit"
                    : "Build";
                  return (
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>Program:</span>{" "}
                      {programDateText && <><span style={{ color: "var(--ink)" }}>{programDateText}</span>{" · "}</>}
                      <Link
                        href={href}
                        title={`${verb} program`}
                        style={{ color: statusColor(programStatusLabel), fontWeight: 600, textDecoration: "underline" }}
                      >{programStatusLabel}</Link>
                    </span>
                  );
                })()}
                {/* Past programs */}
                <span style={{ minWidth: 0, whiteSpace: "nowrap" }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>Past programs:</span>{" "}
                  <span style={{ color: "var(--ink)" }}>{historicalPrograms.length}</span>
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0, alignItems: "flex-start", paddingTop: "0.1rem" }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn btn-ghost"
            style={{ fontSize: "0.7rem", padding: "0.18rem 0.55rem", whiteSpace: "nowrap" }}
          >{open ? "▾" : "▸"} History</button>
          <Link
            href={`/coach/clients/${block.clientId}`}
            className="btn btn-ghost"
            style={{ fontSize: "0.7rem", padding: "0.18rem 0.55rem", whiteSpace: "nowrap" }}
          >Profile →</Link>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: "0.55rem", paddingTop: "0.55rem", borderTop: "1px dashed var(--line)" }}>
          <ClientHistoricals block={block} />
        </div>
      )}
    </div>
  );
}

// ─── Section header — collapsible wrapper for Sessions / Programs ─────────
function SectionHeader({ title, count, open, onToggle, subLabel }: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  subLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%", background: "transparent",
        border: "none", borderBottom: "2px solid var(--line)",
        padding: "0.6rem 0.4rem", cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 700, fontSize: "1.02rem" }}>{title}</span>
        <span className="badge" style={{ fontSize: "0.62rem" }}>{count}</span>
      </span>
      {subLabel && (
        <span className="meta" style={{ fontSize: "0.72rem" }}>{subLabel}</span>
      )}
    </button>
  );
}

// ─── Single row in the "Upcoming this week" flat list ─────────────────────
function WeekSessionRow({
  s,
}: {
  s: {
    clientId: string;
    clientName: string;
    apptId: string;
    starts_at: string;
    program_status: "programmed" | "draft" | "needs_programming" | "n/a";
    session_program_id: string | null;
    is_pdf: boolean;
    is_client_made: boolean;
  };
}) {
  const verb =
    s.program_status === "programmed"
      ? "View"
      : s.program_status === "draft"
      ? "Edit"
      : "Program";
  const startsParam = encodeURIComponent(s.starts_at);
  const viewParam = s.program_status === "programmed" ? "&view=plan" : "";
  const href = `/coach/programming/build?tab=session&appt=${s.apptId}&client=${s.clientId}&starts=${startsParam}${viewParam}`;
  const when = new Date(s.starts_at);
  const dayLabel = when.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr auto auto auto",
        gap: "0.6rem",
        alignItems: "center",
        padding: "0.55rem 0.8rem",
        borderBottom: "1px solid var(--line)",
        fontSize: "0.86rem",
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {dayLabel}
        <span className="meta" style={{ marginLeft: "0.4rem", fontWeight: 400 }}>{timeLabel}</span>
      </span>
      <Link
        href={`/coach/clients/${s.clientId}`}
        style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }}
      >
        {s.clientName}
        {s.is_pdf && (
          <span
            className="badge"
            style={{
              marginLeft: "0.45rem",
              fontSize: "0.56rem",
              color: "var(--rust)",
              borderColor: "var(--rust)",
              verticalAlign: "middle",
            }}
            title="Linked program came from an uploaded PDF sheet"
          >
            PDF
          </span>
        )}
        {s.is_client_made && (
          <span
            className="badge"
            style={{
              marginLeft: "0.45rem",
              fontSize: "0.56rem",
              color: "var(--clay)",
              borderColor: "var(--clay)",
              verticalAlign: "middle",
            }}
            title="Linked program was built by the client in the in-app builder"
          >
            Client made
          </span>
        )}
      </Link>
      <StatusBadge status={s.program_status} />
      <Link
        href={href}
        className="btn btn-ghost"
        style={{ padding: "0.22rem 0.6rem", fontSize: "0.74rem" }}
      >
        {verb}
      </Link>
    </div>
  );
}

export default function ViewProgramsClient({ blocks }: { blocks: ClientProgramBlock[] }) {
  const [query, setQuery] = useState("");
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [programsOpen, setProgramsOpen] = useState(true);
  const [clientListOpen, setClientListOpen] = useState(false);
  const [upcomingOpen, setUpcomingOpen] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) => b.clientName.toLowerCase().includes(q));
  }, [blocks, query]);

  // Sessions: every active client appears. Programs: only those flagged via
  // the + on the Client Roster.
  const sessionBlocks = filtered;
  const programBlocks = filtered.filter((b) => b.needsAtHomeProgramming);

  // Upcoming sessions across all clients for the next 7 days, sorted by time.
  const weekSessions = useMemo(() => {
    const now = Date.now();
    const cutoff = now + 7 * 86_400_000;
    type WeekSession = {
      key: string;
      clientId: string;
      clientName: string;
      apptId: string;
      starts_at: string;
      program_status: "programmed" | "draft" | "needs_programming" | "n/a";
      session_program_id: string | null;
      is_pdf: boolean;
      is_client_made: boolean;
    };
    const out: WeekSession[] = [];
    for (const b of blocks) {
      for (const s of b.upcomingSessions) {
        const t = new Date(s.starts_at).getTime();
        if (t < now || t > cutoff) continue;
        out.push({
          key: `${b.clientId}-${s.id}`,
          clientId: b.clientId,
          clientName: b.clientName,
          apptId: s.id,
          starts_at: s.starts_at,
          program_status: s.program_status,
          session_program_id: s.session_program_id,
          is_pdf: !!s.is_pdf,
          is_client_made: !!s.is_client_made,
        });
      }
    }
    out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return out;
  }, [blocks]);

  return (
    <div>
      {/* Upcoming this week — flat session list across all clients */}
      <section style={{ marginBottom: "1.25rem" }}>
        <SectionHeader
          title="Upcoming this week"
          count={weekSessions.length}
          open={upcomingOpen}
          onToggle={() => setUpcomingOpen((v) => !v)}
          subLabel="next 7 days · sorted by time"
        />
        {!upcomingOpen ? null : weekSessions.length === 0 ? (
          <p className="meta" style={{ padding: "0.85rem 0.4rem" }}>Nothing scheduled in the next 7 days.</p>
        ) : (
          <div className="card" style={{ padding: 0, marginTop: "0.4rem", overflow: "hidden" }}>
            {weekSessions.map((s) => <WeekSessionRow key={s.key} s={s} />)}
          </div>
        )}
      </section>

      <hr className="divider" />

      {/* Client List View — the legacy per-client layout, collapsed by default */}
      <section style={{ marginBottom: "1rem" }}>
        <SectionHeader
          title="Client list view"
          count={blocks.length}
          open={clientListOpen}
          onToggle={() => setClientListOpen((v) => !v)}
          subLabel="all clients · sessions + at-home programs"
        />
      </section>

      {!clientListOpen ? null : (
      <div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Filter by client…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280, fontSize: "0.82rem" }}
        />
        <span className="meta" style={{ fontSize: "0.78rem" }}>{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Sessions section — unfiltered, every active client */}
      <section style={{ marginBottom: "1.25rem" }}>
        <SectionHeader title="Sessions" count={sessionBlocks.length} open={sessionsOpen} onToggle={() => setSessionsOpen((v) => !v)} />
        {sessionsOpen && (
          sessionBlocks.length === 0 ? (
            <p className="meta" style={{ padding: "0.85rem 0.4rem" }}>No matching clients.</p>
          ) : (
            <div className="card" style={{ padding: 0, marginTop: "0.4rem" }}>
              {sessionBlocks.map((b) => (
                <ClientRow key={`s-${b.clientId}`} block={b} view="sessions" />
              ))}
            </div>
          )
        )}
      </section>

      {/* Programs section — only clients flagged via the + on the roster */}
      <section>
        <SectionHeader title="Programs" count={programBlocks.length} open={programsOpen} onToggle={() => setProgramsOpen((v) => !v)} />
        {programsOpen && (
          programBlocks.length === 0 ? (
            <p className="meta" style={{ padding: "0.85rem 0.4rem" }}>
              No clients flagged for programming. Hit the <strong>+</strong> on the Client Roster to add one.
            </p>
          ) : (
            <div className="card" style={{ padding: 0, marginTop: "0.4rem" }}>
              {programBlocks.map((b) => (
                <ClientRow key={`p-${b.clientId}`} block={b} view="programs" />
              ))}
            </div>
          )
        )}
      </section>
      </div>
      )}
    </div>
  );
}

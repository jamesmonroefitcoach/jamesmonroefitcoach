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
  return null;
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

function ClientRow({ block }: { block: ClientProgramBlock }) {
  const [open, setOpen] = useState(false);
  const { active, historicalSessions, historicalPrograms, nextSession, scheduledThisMonth } = block;

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
          <div className="meta" style={{ fontSize: "0.72rem", marginTop: "0.25rem", display: "flex", flexWrap: "wrap", gap: "0.15rem 0.85rem" }}>
            {/* Next Session — full date+time first, status link to the right */}
            <span>
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
            {/* Program — date range first, status link to the right */}
            {(() => {
              const viewParam = programStatusLabel === "Programmed" ? "&view=plan" : "";
              const href = `/coach/programming/build?tab=program&client=${block.clientId}${viewParam}`;
              const verb = programStatusLabel === "Programmed" ? "View"
                : programStatusLabel === "Drafted" ? "Edit"
                : "Build";
              return (
                <span>
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
            {/* This-month count */}
            <span>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>This month:</span>{" "}
              <span style={{ color: "var(--ink)" }}>{scheduledThisMonth} session{scheduledThisMonth !== 1 ? "s" : ""}</span>
            </span>
            {/* Past sessions */}
            <span>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>Past sessions:</span>{" "}
              <span style={{ color: "var(--ink)" }}>{historicalSessions.length}</span>
            </span>
            {/* Past programs */}
            <span>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.62rem", color: "#8a7e72" }}>Past programs:</span>{" "}
              <span style={{ color: "var(--ink)" }}>{historicalPrograms.length}</span>
            </span>
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

export default function ViewProgramsClient({ blocks }: { blocks: ClientProgramBlock[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) => b.clientName.toLowerCase().includes(q));
  }, [blocks, query]);

  return (
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

      {filtered.length === 0 ? (
        <p className="meta">No matching clients.</p>
      ) : (
        <section className="card" style={{ padding: 0 }}>
          {filtered.map((b) => (
            <ClientRow key={b.clientId} block={b} />
          ))}
        </section>
      )}
    </div>
  );
}

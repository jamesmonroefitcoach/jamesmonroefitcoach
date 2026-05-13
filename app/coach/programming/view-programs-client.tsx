"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClientProgramBlock } from "./page";
import { CATEGORY_LABELS, type Category, PROGRAM_KIND_LABEL } from "@/lib/programs";
import { fmtDate } from "@/lib/format";

function fmtSessionTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: "programmed" | "draft" | "needs_programming" | "n/a" }) {
  if (status === "programmed") {
    return <span className="badge badge-sage" style={{ fontSize: "0.6rem" }}>published</span>;
  }
  if (status === "draft") {
    return <span className="badge badge-amber" style={{ fontSize: "0.6rem" }}>draft</span>;
  }
  if (status === "needs_programming") {
    return <span className="badge" style={{ fontSize: "0.6rem", color: "var(--muted)" }}>not programmed</span>;
  }
  return null;
}

function ActiveSessionsCard({ block }: { block: ClientProgramBlock }) {
  const { active, upcomingSessions } = block;
  const nextUpcoming = upcomingSessions[0] ?? null;
  return (
    <div className="day-card" style={{ borderLeftColor: "var(--rust)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="badge badge-rust">Sessions</span>
          {active.sessionsStatus === "published" && (
            <span className="badge badge-sage" style={{ marginLeft: "0.4rem", fontSize: "0.6rem" }}>published</span>
          )}
          {active.sessionsStatus === "draft" && (
            <span className="badge badge-amber" style={{ marginLeft: "0.4rem", fontSize: "0.6rem" }}>draft</span>
          )}
          {active.sessions ? (
            <>
              <strong style={{ marginLeft: "0.5rem" }}>{active.sessions.name}</strong>
              <div className="meta" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
                {active.sessions.day_count} training day{active.sessions.day_count !== 1 ? "s" : ""}
                {upcomingSessions.length > 0 && (
                  <> · next {nextUpcoming ? fmtSessionTime(nextUpcoming.starts_at) : "—"}</>
                )}
              </div>
            </>
          ) : (
            <p className="meta" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              No active sessions block.{" "}
              <Link href={`/coach/programming/build?tab=session&client=${block.clientId}`}>Build →</Link>
            </p>
          )}
        </div>
        {active.sessions && (
          <Link
            className="btn btn-ghost"
            href={`/coach/programming/build?tab=session&client=${block.clientId}`}
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
          >view →</Link>
        )}
      </div>
    </div>
  );
}

function ActiveProgramCard({ block }: { block: ClientProgramBlock }) {
  const { active } = block;
  return (
    <div className="day-card" style={{ borderLeftColor: "var(--rust)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="badge badge-rust">Program</span>
          {active.programStatus === "published" && (
            <span className="badge badge-sage" style={{ marginLeft: "0.4rem", fontSize: "0.6rem" }}>published</span>
          )}
          {active.programStatus === "draft" && (
            <span className="badge badge-amber" style={{ marginLeft: "0.4rem", fontSize: "0.6rem" }}>draft</span>
          )}
          {active.program ? (
            <>
              <strong style={{ marginLeft: "0.5rem" }}>{active.program.name}</strong>
              <div className="meta" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
                {fmtDate(active.program.starts_on)} → {fmtDate(active.program.ends_on)}
                {active.program.at_home_cadence ? ` · ${active.program.at_home_cadence}` : ""}
              </div>
            </>
          ) : (
            <p className="meta" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              No active program.{" "}
              <Link href={`/coach/programming/build?tab=program&client=${block.clientId}`}>Build →</Link>
            </p>
          )}
        </div>
        {active.program && (
          <Link
            className="btn btn-ghost"
            href={`/coach/programming/build?tab=program&client=${block.clientId}`}
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
          >view →</Link>
        )}
      </div>
    </div>
  );
}

function ClientHistoricals({ block }: { block: ClientProgramBlock }) {
  const [open, setOpen] = useState(false);

  // Group historical sessions by Month Year
  const sessionsByMonth = useMemo(() => {
    const map = new Map<string, ClientProgramBlock["historicalSessions"]>();
    for (const s of block.historicalSessions) {
      const k = monthKey(s.starts_at);
      const cur = map.get(k) ?? [];
      cur.push(s);
      map.set(k, cur);
    }
    return Array.from(map.entries());  // already sorted desc since input is desc
  }, [block.historicalSessions]);

  const programs = block.historicalPrograms;

  if (sessionsByMonth.length === 0 && programs.length === 0) return null;

  return (
    <div style={{ marginTop: "0.65rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", padding: "0.35rem 0",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
          borderTop: "1px dashed var(--line)",
        }}
      >
        <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Past programs
        </span>
        <span className="meta" style={{ fontSize: "0.7rem" }}>
          {block.historicalSessions.length} sessions · {programs.length} program{programs.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="banner-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.6rem" }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
      )}
    </div>
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
          padding: "0.3rem 0.5rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.74rem", fontWeight: 600 }}>{open ? "▾" : "▸"} {month}</span>
        <span className="meta" style={{ fontSize: "0.66rem" }}>{sessions.length}</span>
      </button>
      {open && (
        <div style={{ padding: "0.25rem 0.35rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/coach/programming/build?tab=session&client=${clientId}&appt=${s.id}`}
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
          ))}
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
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {filtered.map((b) => (
            <section key={b.clientId} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{b.clientName}</h2>
                  <p className="meta" style={{ fontSize: "0.75rem", margin: 0 }}>
                    {b.upcomingSessions.length} upcoming · {b.historicalSessions.length} past · {b.historicalPrograms.length} past program{b.historicalPrograms.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Link
                  className="btn btn-ghost"
                  href={`/coach/clients/${b.clientId}`}
                  style={{ fontSize: "0.74rem", padding: "0.3rem 0.65rem" }}
                >Open profile →</Link>
              </div>

              <div className="grid-2col" style={{ gap: "0.85rem" }}>
                <ActiveSessionsCard block={b} />
                <ActiveProgramCard block={b} />
              </div>

              <ClientHistoricals block={b} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

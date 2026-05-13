"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import type { PastProgramFull } from "@/lib/programs";

export type PastSessionItem = {
  id: string;
  starts_at: string;
  program_status: "programmed" | "draft" | "needs_programming" | "n/a";
  session_program_id: string | null;
};

function fmtSessionTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: PastSessionItem["program_status"] }) {
  if (status === "programmed") return <span className="badge badge-sage" style={{ fontSize: "0.6rem" }}>published</span>;
  if (status === "draft") return <span className="badge badge-amber" style={{ fontSize: "0.6rem" }}>draft</span>;
  if (status === "needs_programming") return <span className="badge" style={{ fontSize: "0.6rem", color: "var(--muted)" }}>not programmed</span>;
  return null;
}

function MonthGroup({ clientId, month, sessions }: {
  clientId: string;
  month: string;
  sessions: PastSessionItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 3, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "rgba(0,0,0,0.025)", border: "none",
          padding: "0.35rem 0.55rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{open ? "▾" : "▸"} {month}</span>
        <span className="meta" style={{ fontSize: "0.68rem" }}>{sessions.length}</span>
      </button>
      {open && (
        <div style={{ padding: "0.3rem 0.4rem", display: "flex", flexDirection: "column", gap: "0.18rem" }}>
          {sessions.map((s) => {
            const viewParam = s.program_status === "programmed" ? "&view=plan" : "";
            return (
              <Link
                key={s.id}
                href={`/coach/programming/build?tab=session&client=${clientId}&appt=${s.id}${viewParam}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem",
                  padding: "0.22rem 0.4rem", borderRadius: 3,
                  textDecoration: "none", color: "var(--ink)",
                  fontSize: "0.76rem",
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

export default function PastPrograms({
  clientId,
  sessions,
  programs,
}: {
  clientId: string;
  sessions: PastSessionItem[];
  programs: PastProgramFull[];
}) {
  const [open, setOpen] = useState(false);

  const sessionsByMonth = useMemo(() => {
    // sessions are passed already sorted DESC by starts_at
    const map = new Map<string, PastSessionItem[]>();
    for (const s of sessions) {
      const k = monthKey(s.starts_at);
      const cur = map.get(k) ?? [];
      cur.push(s);
      map.set(k, cur);
    }
    return Array.from(map.entries());
  }, [sessions]);

  if (sessions.length === 0 && programs.length === 0) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none",
          borderTop: "1px dashed var(--line)",
          padding: "0.45rem 0",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Past programs
        </span>
        <span className="meta" style={{ fontSize: "0.72rem" }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} · {programs.length} program{programs.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="banner-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.6rem" }}>
          {/* Left: Sessions grouped by Month Year */}
          <div>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--rust)",
              paddingBottom: "0.3rem", borderBottom: "1px solid var(--line)",
              marginBottom: "0.5rem",
            }}>Sessions</div>
            {sessionsByMonth.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>No past sessions.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {sessionsByMonth.map(([month, items]) => (
                  <MonthGroup key={month} clientId={clientId} month={month} sessions={items} />
                ))}
              </div>
            )}
          </div>

          {/* Right: Programs listed by name + date range */}
          <div>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--rust)",
              paddingBottom: "0.3rem", borderBottom: "1px solid var(--line)",
              marginBottom: "0.5rem",
            }}>Programs</div>
            {programs.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>No past programs.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {programs.map((p) => (
                  <Link
                    key={p.id}
                    href={`/coach/programming/build?tab=program&client=${clientId}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                      padding: "0.35rem 0.5rem", borderRadius: 3,
                      background: "rgba(0,0,0,0.025)",
                      border: "1px solid var(--line)",
                      textDecoration: "none", color: "var(--ink)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>{p.name}</div>
                      <div className="meta" style={{ fontSize: "0.68rem" }}>
                        {fmtDate(p.starts_on)} → {fmtDate(p.ends_on)}
                      </div>
                    </div>
                    <span style={{ color: "var(--rust)", fontSize: "0.78rem", flexShrink: 0 }}>→</span>
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

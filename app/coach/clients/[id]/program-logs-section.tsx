"use client";

import { useState, useTransition } from "react";
import { markDayLogReviewed, type ProgramDayLog } from "@/app/client/programming/log-actions";

// James's view of the day logs a client has submitted from their program.
// Newest first; unreviewed ones show a "New" badge + a Mark reviewed button.
export default function ProgramDayLogsSection({ logs }: { logs: ProgramDayLog[] }) {
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  if (!logs || logs.length === 0) return null;

  const newCount = logs.filter((l) => !l.reviewed_at && !reviewed.has(l.id)).length;

  return (
    <div style={{ marginTop: "1.25rem" }}>
      <h2 style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        Logged sessions
        {newCount > 0 && (
          <span className="badge" style={{ fontSize: "0.58rem", color: "#fff", background: "var(--rust)", borderColor: "var(--rust)" }}>
            {newCount} new
          </span>
        )}
      </h2>
      <p className="meta" style={{ fontSize: "0.78rem", marginTop: "-0.2rem" }}>
        What the client logged after each day — their actual weights, reps, and notes.
      </p>
      <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {logs.map((l) => {
          const isNew = !l.reviewed_at && !reviewed.has(l.id);
          const entries = Object.values(l.entries ?? {});
          return (
            <li key={l.id} style={{
              border: "1px solid var(--line)", borderRadius: 5, padding: "0.6rem 0.75rem",
              background: isNew ? "rgba(168,61,43,0.04)" : "var(--paper)",
              borderLeft: isNew ? "3px solid var(--rust)" : "3px solid transparent",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.9rem" }}>
                  {l.day_title || `Day ${l.day_index + 1}`}
                  {l.logged_date && <span className="meta" style={{ fontWeight: 400, marginLeft: "0.5rem", fontSize: "0.78rem" }}>{l.logged_date}</span>}
                </strong>
                <span className="meta" style={{ fontSize: "0.68rem" }}>
                  submitted {new Date(l.submitted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              {entries.length > 0 && (
                <ul style={{ listStyle: "none", margin: "0.4rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  {entries.map((e, i) => {
                    const sets = (e.weights ?? []).map((w, k) => {
                      const r = (e.reps ?? [])[k] ?? "";
                      return (r || w) ? `${r || "?"}${w ? "×" + w : ""}` : "";
                    }).filter(Boolean).join(" · ");
                    return (
                      <li key={i} style={{ fontSize: "0.8rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span style={{ color: e.done ? "var(--sage)" : "var(--muted)" }}>{e.done ? "✓" : "○"}</span>
                        <span style={{ fontWeight: 600 }}>{e.name}</span>
                        {sets && <span className="meta">{sets}</span>}
                        {e.notes && <span className="meta" style={{ fontStyle: "italic" }}>— {e.notes}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {l.note && (
                <p className="meta" style={{ fontSize: "0.8rem", marginTop: "0.4rem", fontStyle: "italic" }}>“{l.note}”</p>
              )}
              {isNew && (
                <div style={{ marginTop: "0.45rem" }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "0.2rem 0.7rem", fontSize: "0.72rem" }}
                    disabled={pending}
                    onClick={() => start(async () => {
                      const res = await markDayLogReviewed(l.id);
                      if (res.ok) setReviewed((s) => new Set(s).add(l.id));
                    })}
                  >Mark reviewed</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

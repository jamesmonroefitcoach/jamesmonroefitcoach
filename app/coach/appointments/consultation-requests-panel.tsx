"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ConsultationRequest,
  type ConsultStatus,
  setConsultationRequestStatus,
  deleteConsultationRequest,
} from "@/app/consult/actions";

// Collapsible panel listing public-form submissions. Newest first, with
// triage buttons so James can flip a row to Contacted / Booked / Dismissed.
// Open count badge sits in the summary so he can see at a glance whether
// there's anything in the queue.

const STATUS_LABELS: Record<ConsultStatus, string> = {
  new: "New",
  contacted: "Contacted",
  booked: "Booked",
  dismissed: "Dismissed",
};

const STATUS_COLORS: Record<ConsultStatus, string> = {
  new: "#a83d2b",
  contacted: "#3e6079",
  booked: "#5a6b4a",
  dismissed: "#7a6f63",
};

export default function ConsultationRequestsPanel({
  initial,
}: {
  initial: ConsultationRequest[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ConsultStatus | "all" | "open">("open");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const newCount = useMemo(
    () => initial.filter((r) => r.status === "new").length,
    [initial],
  );

  const rows = useMemo(() => {
    if (filter === "all") return initial;
    if (filter === "open") return initial.filter((r) => r.status === "new" || r.status === "contacted");
    return initial.filter((r) => r.status === filter);
  }, [initial, filter]);

  function run<T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) {
    start(async () => {
      const res = await p;
      if (!res.ok) setErr(res.error);
      else { setErr(null); router.refresh(); }
    });
  }

  return (
    <section style={{ marginBottom: "1.4rem" }}>
      <details open={newCount > 0} style={{
        border: "1px solid var(--line)",
        borderLeft: "4px solid var(--rust)",
        background: "var(--paper)",
        borderRadius: 3,
        padding: "0",
      }}>
        <summary style={{
          cursor: "pointer",
          padding: "0.7rem 0.9rem",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          listStyle: "none",
          fontWeight: 600,
        }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: newCount > 0 ? "var(--rust)" : "var(--muted)",
            color: "var(--bg)",
            minWidth: 22,
            height: 22,
            borderRadius: 999,
            fontSize: "0.78rem",
            padding: "0 0.4rem",
            fontWeight: 700,
          }}>{newCount}</span>
          <span style={{
            fontFamily: "var(--font-heading), Oswald, sans-serif",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontSize: "0.92rem",
          }}>Consultation requests</span>
          <span className="meta" style={{ fontSize: "0.8rem", marginLeft: "0.4rem" }}>
            {initial.length} total · {newCount} new
          </span>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "0.78rem" }}>click to expand ▾</span>
        </summary>

        <div style={{
          padding: "0.6rem 0.9rem 0.9rem",
          borderTop: "1px solid var(--line)",
          background: "var(--bg)",
        }}>
          {err && (
            <div style={{
              marginBottom: "0.7rem",
              padding: "0.45rem 0.7rem",
              border: "1px solid var(--red)",
              background: "rgba(192,57,43,0.08)",
              color: "var(--red)",
              borderRadius: 3,
              fontSize: "0.84rem",
            }}>{err}</div>
          )}

          {/* Filter chips */}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.7rem" }}>
            {(["open", "new", "contacted", "booked", "dismissed", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? "var(--ink)" : "transparent",
                  color: filter === f ? "var(--bg)" : "var(--ink)",
                  border: "1px solid " + (filter === f ? "var(--ink)" : "var(--line)"),
                  borderRadius: 999,
                  padding: "0.2rem 0.65rem",
                  fontSize: "0.76rem",
                  fontFamily: "var(--font-heading), Oswald, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                }}
              >{f === "open" ? "Open" : f === "all" ? "All" : STATUS_LABELS[f]}</button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="meta" style={{ fontStyle: "italic", padding: "0.7rem 0.2rem" }}>
              No requests in this view.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {rows.map((r) => (
                <ConsultRow
                  key={r.id}
                  row={r}
                  pending={pending}
                  onSetStatus={(s) => run(setConsultationRequestStatus(r.id, s))}
                  onDelete={() => {
                    if (confirm(`Delete consultation request from ${r.name}?`)) {
                      run(deleteConsultationRequest(r.id));
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}

function ConsultRow({
  row, pending, onSetStatus, onDelete,
}: {
  row: ConsultationRequest;
  pending: boolean;
  onSetStatus: (s: ConsultStatus) => void;
  onDelete: () => void;
}) {
  const when = new Date(row.created_at);
  const whenLabel = when.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <li style={{
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderRadius: 3,
      padding: "0.7rem 0.85rem",
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "0.5rem 0.8rem",
      alignItems: "start",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.96rem" }}>{row.name}</strong>
          <span style={{
            display: "inline-flex",
            background: STATUS_COLORS[row.status],
            color: "var(--bg)",
            fontSize: "0.7rem",
            padding: "0.1rem 0.45rem",
            borderRadius: 2,
            fontFamily: "var(--font-heading), Oswald, sans-serif",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>{STATUS_LABELS[row.status]}</span>
          <span className="meta" style={{ fontSize: "0.76rem" }}>{whenLabel}</span>
          {row.source && (
            <span className="meta" style={{ fontSize: "0.72rem", fontStyle: "italic" }}>
              via {row.source}
            </span>
          )}
        </div>
        <div style={{ marginTop: "0.25rem", fontSize: "0.86rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
          <a href={`mailto:${row.email}`} style={{ color: "var(--rust)" }}>{row.email}</a>
          {row.phone && (
            <a href={`tel:${row.phone.replace(/\D/g, "")}`} style={{ color: "var(--rust)" }}>{row.phone}</a>
          )}
        </div>
        {row.message && (
          <p style={{
            marginTop: "0.4rem",
            fontSize: "0.88rem",
            lineHeight: 1.5,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
          }}>{row.message}</p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {(["contacted", "booked", "dismissed", "new"] as ConsultStatus[])
            .filter((s) => s !== row.status)
            .map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => onSetStatus(s)}
                style={{
                  background: "transparent",
                  border: `1px solid ${STATUS_COLORS[s]}`,
                  color: STATUS_COLORS[s],
                  padding: "0.2rem 0.55rem",
                  borderRadius: 2,
                  fontSize: "0.74rem",
                  fontFamily: "var(--font-heading), Oswald, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >→ {STATUS_LABELS[s]}</button>
            ))}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          title="Delete request"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--red)",
            fontSize: "0.74rem",
            cursor: pending ? "not-allowed" : "pointer",
            padding: "0.15rem 0.3rem",
          }}
        >delete</button>
      </div>
    </li>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow } from "@/lib/data";
import { cancelReasonLabel } from "@/lib/cancel-reasons";

// Cancellations + no-shows from the last two months, newest first, capped
// at 30 rows. Default closed. Was on /coach/schedule; lives here now so
// James's "things to follow up on" all sit on /coach/appointments.

export default function CancellationBacklog({
  appointments,
}: {
  appointments: AppointmentRow[];
}) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    return appointments
      .filter((a) =>
        a.session_type === "session" &&
        (a.status === "cancelled" || a.status === "no_show")
      )
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .slice(0, 30);
  }, [appointments]);

  if (rows.length === 0) return null;
  return (
    <section className="no-print" style={{
      marginBottom: "1.2rem",
      border: "1px solid var(--line)",
      borderRadius: 4,
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.55rem",
          background: open ? "rgba(0,0,0,0.02)" : "transparent",
          border: "none",
          borderBottom: open ? "1px solid var(--line)" : "none",
          padding: "0.5rem 0.85rem",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
        <strong style={{ fontSize: "0.86rem" }}>Cancellations backlog</strong>
        <span className="meta" style={{ fontSize: "0.72rem" }}>
          {rows.length} (newest first)
        </span>
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((a) => {
            const ar = a as AppointmentRow & { cancel_reason?: string | null; cancel_reason_other?: string | null };
            const reason = cancelReasonLabel(ar.cancel_reason, ar.cancel_reason_other);
            const whenLabel = new Date(a.starts_at).toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            });
            const isNoShow = a.status === "no_show";
            return (
              <li key={a.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(150px, 200px) minmax(120px, 1fr) 1fr auto",
                gap: "0.65rem",
                alignItems: "center",
                padding: "0.4rem 0.85rem",
                borderTop: "1px solid var(--line)",
                fontSize: "0.78rem",
              }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{whenLabel}</span>
                <span>{a.client_name ?? "—"}</span>
                <span className="meta" style={{ fontSize: "0.74rem" }}>{reason}</span>
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    padding: "0.08rem 0.4rem",
                    borderRadius: 2,
                    background: isNoShow ? "#171311" : "#e67e22",
                    color: "#fff",
                    whiteSpace: "nowrap",
                  }}
                  title={a.paid ? "Cancellation fee was paid" : "No fee charged"}
                >
                  {isNoShow ? "⊘ no-show" : "✕ cancelled"}{a.paid ? " · paid" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

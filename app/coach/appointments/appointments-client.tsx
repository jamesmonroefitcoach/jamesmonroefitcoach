"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { AppointmentRow, ChangeRequestHistoryRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { approveChangeRequest, denyChangeRequest } from "@/app/coach/schedule/actions";
import { saveAppointment } from "@/app/coach/schedule/actions";

// ── helpers ───────────────────────────────────────────────────────────────

function fmtApptTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function AccordionSection({
  title, count, badge, defaultOpen, children
}: {
  title: string;
  count: number;
  badge?: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card" style={{ padding: 0, marginBottom: "1rem" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          padding: "0.85rem 1rem", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "0.65rem",
          borderBottom: open ? "1px solid var(--line)" : "none",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
        {count > 0 && (
          <span style={{
            background: "var(--ink)", color: "var(--paper)",
            borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700,
            padding: "0.1rem 0.5rem", lineHeight: 1.6
          }}>{count}</span>
        )}
        {badge}
        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary, #888)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && children}
    </section>
  );
}

// ── main component ────────────────────────────────────────────────────────

export default function AppointmentsClient({
  initial,
  history,
}: {
  initial: AppointmentRow[];
  history: ChangeRequestHistoryRow[];
}) {
  const [appts, setAppts] = useState(initial);
  const [crHistory, setCrHistory] = useState(history);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const now = Date.now();
  const groups = useMemo(() => {
    const requests = appts.filter((a) => a.status === "change_requested");
    const future = appts
      .filter(
        (a) =>
          a.status !== "change_requested" &&
          new Date(a.starts_at).getTime() >= now &&
          a.status !== "completed" &&
          a.status !== "no_show"
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const past = appts
      .filter(
        (a) =>
          a.status === "completed" ||
          a.status === "no_show" ||
          (a.status === "cancelled" && new Date(a.starts_at).getTime() < now) ||
          (new Date(a.starts_at).getTime() < now && a.status === "scheduled")
      )
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    return { requests, future, past };
  }, [appts, now]);

  function approve(id: string) {
    setErr(null);
    const prev = appts.find((a) => a.id === id);
    if (!prev) return;
    setAppts((cur) =>
      cur.map((a) =>
        a.id === id
          ? { ...a, status: "scheduled", starts_at: a.requested_starts_at ?? a.starts_at, ends_at: a.requested_ends_at ?? a.ends_at, requested_starts_at: null, requested_ends_at: null }
          : a
      )
    );
    start(async () => {
      const res = await approveChangeRequest(id);
      if (!res.ok && !res.error?.startsWith("Supabase not configured")) {
        setErr(res.error ?? "Unknown error");
        setAppts((cur) => cur.map((a) => (a.id === id ? prev : a)));
      }
    });
  }

  function deny(id: string) {
    if (!confirm("Deny and delete this change request?")) return;
    setErr(null);
    const prev = appts.find((a) => a.id === id);
    if (!prev) return;
    setAppts((cur) => cur.filter((a) => a.id !== id));
    start(async () => {
      const res = await denyChangeRequest(id);
      if (!res.ok && !res.error?.startsWith("Supabase not configured")) {
        setErr(res.error ?? "Unknown error");
        setAppts((cur) => [...cur, prev]);
      }
    });
  }

  function markPaid(id: string) {
    setErr(null);
    const prev = appts.find((a) => a.id === id);
    if (!prev) return;
    setAppts((cur) => cur.map((a) => (a.id === id ? { ...a, paid: true } : a)));
    start(async () => {
      const res = await saveAppointment({
        appt_id: id,
        starts_at: prev.starts_at,
        ends_at: prev.ends_at,
        session_type: prev.session_type,
        personal_label: prev.personal_label,
        client_id: prev.client_id,
        rate: prev.rate,
        paid: true,
        status: prev.status,
        notes: prev.notes,
        session_program_id: prev.session_program_id ?? null,
        program_status: prev.program_status,
      });
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setErr(res.error);
        setAppts((cur) => cur.map((a) => (a.id === id ? prev : a)));
      }
    });
  }

  const crRequestBadge = groups.requests.length > 0 ? (
    <span style={{ fontSize: "0.72rem", color: "#b45309", background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 4, padding: "0.1rem 0.4rem" }}>
      action needed
    </span>
  ) : null;

  return (
    <>
      {err && <p style={{ color: "var(--red)", marginBottom: "0.75rem" }}>{err}</p>}

      {/* ── Change Requests ───────────────────────────────────────── */}
      <AccordionSection title="Change Requests" count={groups.requests.length} badge={crRequestBadge} defaultOpen>
        <table className="table">
          <thead>
            <tr><th>Current time</th><th>Requested time</th><th>Client</th><th>Reason</th><th></th></tr>
          </thead>
          <tbody>
            {groups.requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="meta" style={{ textAlign: "center", padding: "1.25rem" }}>
                  No pending change requests.
                </td>
              </tr>
            ) : groups.requests.map((a) => (
              <tr key={a.id}>
                <td style={{ fontSize: "0.82rem" }}>{fmtApptTime(a.starts_at)}</td>
                <td style={{ fontSize: "0.82rem", color: "var(--amber, #b45309)", fontWeight: 500 }}>
                  {a.requested_starts_at ? fmtApptTime(a.requested_starts_at) : "—"}
                </td>
                <td>{a.client_name ?? "—"}</td>
                <td className="meta" style={{ fontSize: "0.82rem" }}>{(a as any).requested_reason ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem" }}
                    onClick={() => approve(a.id)}
                    disabled={pending}
                  >
                    Approve
                  </button>{" "}
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem", color: "var(--red)" }}
                    onClick={() => deny(a.id)}
                    disabled={pending}
                  >
                    Deny
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AccordionSection>

      {/* ── Future ───────────────────────────────────────────────── */}
      <AccordionSection title="Upcoming" count={groups.future.length} defaultOpen={false}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Client</th><th>Status</th><th>Rate</th><th>Paid</th><th></th></tr>
          </thead>
          <tbody>
            {groups.future.length === 0 ? (
              <tr>
                <td colSpan={6} className="meta" style={{ textAlign: "center", padding: "1.25rem" }}>
                  Nothing on the books.
                </td>
              </tr>
            ) : groups.future.map((a) => (
              <tr key={a.id}>
                <td style={{ fontSize: "0.82rem" }}>{fmtApptTime(a.starts_at)}</td>
                <td>{a.client_name ?? (a.session_type === "personal" ? `⛔ ${a.personal_label ?? "Personal"}` : "—")}</td>
                <td><span className="badge">{a.status}</span></td>
                <td>{fmtMoney(a.rate)}</td>
                <td>{a.paid ? <span className="badge badge-sage">paid</span> : <span className="badge badge-red">unpaid</span>}</td>
                <td>
                  <Link href="/coach/schedule" className="meta" style={{ fontSize: "0.78rem" }}>
                    edit on schedule →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AccordionSection>

      {/* ── Past ─────────────────────────────────────────────────── */}
      <AccordionSection title="Past" count={groups.past.length} defaultOpen={false}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Client</th><th>Status</th><th>Rate</th><th>Paid</th><th></th></tr>
          </thead>
          <tbody>
            {groups.past.length === 0 ? (
              <tr>
                <td colSpan={6} className="meta" style={{ textAlign: "center", padding: "1.25rem" }}>
                  No history yet.
                </td>
              </tr>
            ) : groups.past.map((a) => (
              <tr key={a.id}>
                <td style={{ fontSize: "0.82rem" }}>{fmtApptTime(a.starts_at)}</td>
                <td>{a.client_name ?? "—"}</td>
                <td>
                  <span className="badge">{a.status}</span>
                  {a.change_count > 0 && <span className="meta" style={{ marginLeft: 6, fontSize: "0.72rem" }}>moved {a.change_count}×</span>}
                </td>
                <td>{fmtMoney(a.rate)}</td>
                <td>{a.paid ? <span className="badge badge-sage">paid</span> : <span className="badge badge-red">unpaid</span>}</td>
                <td>
                  {!a.paid && a.status === "completed" && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem" }}
                      onClick={() => markPaid(a.id)}
                      disabled={pending}
                    >
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AccordionSection>

      {/* ── Change Request History ────────────────────────────────── */}
      <AccordionSection title="Change Request History" count={crHistory.length} defaultOpen={false}>
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Client</th><th>Action</th><th>Was</th><th>Moved to</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {crHistory.length === 0 ? (
              <tr>
                <td colSpan={6} className="meta" style={{ textAlign: "center", padding: "1.25rem" }}>
                  No history yet.
                </td>
              </tr>
            ) : crHistory.map((h) => (
              <tr key={h.id}>
                <td style={{ fontSize: "0.78rem" }}>
                  {new Date(h.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td>{h.client_name ?? "—"}</td>
                <td>
                  <span className={`badge ${h.action === "approved" ? "badge-sage" : h.action === "denied" ? "badge-red" : ""}`}>
                    {h.action}
                  </span>
                </td>
                <td style={{ fontSize: "0.78rem" }} className="meta">
                  {h.before_starts_at ? fmtApptTime(h.before_starts_at) : "—"}
                </td>
                <td style={{ fontSize: "0.78rem" }} className="meta">
                  {h.after_starts_at ? fmtApptTime(h.after_starts_at) : "—"}
                </td>
                <td className="meta" style={{ fontSize: "0.78rem" }}>{h.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AccordionSection>
    </>
  );
}

"use client";
import { useMemo, useState, useTransition } from "react";
import type { AppointmentRow } from "@/lib/data";
import { fmtMoney } from "@/lib/format";
import { saveAppointment, deleteAppointment } from "@/app/coach/schedule/actions";

type Tab = "requests" | "future" | "past";

export default function AppointmentsClient({ initial, initialTab }: { initial: AppointmentRow[]; initialTab: Tab }) {
  const [appts, setAppts] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const now = Date.now();
  const groups = useMemo(() => {
    const requests = appts.filter((a) => a.status === "change_requested");
    const future = appts
      .filter((a) => a.status !== "change_requested" && new Date(a.starts_at).getTime() >= now && a.status !== "completed" && a.status !== "no_show")
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const past = appts
      .filter((a) => a.status === "completed" || a.status === "no_show" || (a.status === "cancelled" && new Date(a.starts_at).getTime() < now) || (new Date(a.starts_at).getTime() < now && a.status === "scheduled"))
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    return { requests, future, past };
  }, [appts, now]);

  const list = groups[tab];

  function setStatus(id: string, status: AppointmentRow["status"], paid?: boolean) {
    setErr(null);
    const prev = appts.find((a) => a.id === id);
    if (!prev) return;
    setAppts((cur) => cur.map((a) => (a.id === id ? { ...a, status, paid: paid ?? a.paid } : a)));
    start(async () => {
      const res = await saveAppointment({
        appt_id: id,
        starts_at: prev.starts_at,
        ends_at: prev.ends_at,
        session_type: prev.session_type,
        personal_label: prev.personal_label,
        client_id: prev.client_id,
        rate: prev.rate,
        paid: paid ?? prev.paid,
        status,
        notes: prev.notes,
        session_program_id: prev.session_program_id ?? null,
        program_status: prev.program_status
      });
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setErr(res.error);
        // revert
        setAppts((cur) => cur.map((a) => (a.id === id ? prev : a)));
      }
    });
  }

  function remove(id: string) {
    setErr(null);
    const prev = appts.find((a) => a.id === id);
    if (!prev) return;
    setAppts((cur) => cur.filter((a) => a.id !== id));
    start(async () => {
      const res = await deleteAppointment(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setErr(res.error);
        setAppts((cur) => [...cur, prev]);
      }
    });
  }

  return (
    <>
      <div className="card no-print" style={{ display: "flex", gap: "0.4rem", padding: "0.5rem", alignItems: "center" }}>
        {(["requests", "future", "past"] as const).map((t) => {
          const counts = groups[t].length;
          const label = t === "requests" ? "Change requests" : t === "future" ? "Future" : "Past";
          return (
            <button
              key={t}
              className="btn"
              onClick={() => setTab(t)}
              style={{
                padding: "0.4rem 0.85rem",
                background: tab === t ? "var(--ink)" : "transparent",
                color: tab === t ? "var(--paper)" : undefined,
                border: tab === t ? "1px solid var(--ink)" : "1px solid var(--line)",
                fontSize: "0.78rem"
              }}
            >
              {label} {counts > 0 ? <span style={{ marginLeft: 6, opacity: 0.85 }}>({counts})</span> : null}
            </button>
          );
        })}
      </div>

      {err ? <p style={{ color: "var(--red)", marginTop: "0.5rem" }}>{err}</p> : null}

      <div className="card" style={{ padding: 0, marginTop: "1rem" }}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Client</th><th>Status</th><th>Rate</th><th>Paid</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} className="meta" style={{ padding: "1.25rem", textAlign: "center" }}>
                {tab === "requests" ? "No pending change requests." : tab === "future" ? "Nothing on the books." : "No history yet."}
              </td></tr>
            ) : list.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td>{a.client_name ?? (a.session_type === "personal" ? `⛔ ${a.personal_label ?? "Personal"}` : "—")}</td>
                <td>
                  {a.status === "change_requested"
                    ? <span className="badge badge-amber">change requested</span>
                    : <span className="badge">{a.status}</span>}
                  {a.change_count > 0 ? <span className="meta" style={{ marginLeft: 6 }}>Moved {a.change_count}×</span> : null}
                </td>
                <td>{fmtMoney(a.rate)}</td>
                <td>{a.paid ? <span className="badge badge-sage">paid</span> : <span className="badge badge-red">unpaid</span>}</td>
                <td className="meta">{a.notes ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {tab === "requests" ? (
                    <>
                      <button className="btn btn-primary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => setStatus(a.id, "scheduled")} disabled={pending}>Approve</button>{" "}
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }} onClick={() => setStatus(a.id, "cancelled")} disabled={pending}>Deny</button>
                    </>
                  ) : tab === "future" ? (
                    <a href="/coach/schedule" className="meta" style={{ fontSize: "0.78rem" }}>edit on schedule →</a>
                  ) : (
                    <>
                      {!a.paid && a.status === "completed" ? (
                        <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => setStatus(a.id, "completed", true)} disabled={pending}>Mark paid</button>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

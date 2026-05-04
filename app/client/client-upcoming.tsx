"use client";
import { useState } from "react";
import Link from "next/link";
import type { AppointmentRow } from "@/lib/data";

type Mode = null | { kind: "reschedule" | "cancel"; apptId: string };

const SUGGESTED_TIMES = [
  "Tomorrow 7:00 AM",
  "Tomorrow 5:00 PM",
  "Wed 8:00 AM",
  "Wed 12:00 PM",
  "Thu 6:00 AM",
  "Sat 9:00 AM"
];

export default function ClientUpcoming({ initial }: { initial: AppointmentRow[] }) {
  const [appts, setAppts] = useState<AppointmentRow[]>(initial);
  const [mode, setMode] = useState<Mode>(null);
  const [requestedTime, setRequestedTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  function open(kind: "reschedule" | "cancel", apptId: string) {
    setMode({ kind, apptId });
    setRequestedTime("");
    setReason("");
    setSubmitted(null);
  }
  function close() { setMode(null); }
  function submit() {
    if (!mode) return;
    const verb = mode.kind === "reschedule" ? "Reschedule requested" : "Cancellation requested";
    setAppts((cur) => cur.map((a) => (a.id === mode.apptId ? { ...a, status: "change_requested" } : a)));
    setSubmitted(`${verb} — James will text you to confirm.`);
    setTimeout(close, 1500);
  }

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Upcoming sessions</h2>
        <Link href="/client/check-ins" className="meta">Check-in →</Link>
      </div>
      <hr className="divider" />
      {appts.length === 0 ? (
        <p className="meta">No upcoming sessions yet. James will publish your week soon.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {appts.map((a) => (
            <li key={a.id} className="day-card" style={a.status === "change_requested" ? { borderLeftColor: "var(--amber)" } : undefined}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.6rem" }}>
                <div>
                  <strong>{new Date(a.starts_at).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong>
                  <p className="meta" style={{ margin: "0.25rem 0 0" }}>Hyde Park Gym · 60 min{a.rate ? ` · $${a.rate}` : ""}</p>
                  {a.status === "change_requested" ? <p style={{ color: "var(--amber)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>Change requested — pending</p> : null}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <button className="btn btn-ghost" style={{ padding: "0.4rem 0.7rem", fontSize: "0.75rem" }} onClick={() => open("reschedule", a.id)} disabled={a.status === "change_requested"}>Reschedule</button>
                  <button className="btn btn-ghost" style={{ padding: "0.4rem 0.7rem", fontSize: "0.75rem", color: "var(--red)" }} onClick={() => open("cancel", a.id)} disabled={a.status === "change_requested"}>Cancel</button>
                  <Link className="btn" href="/client/program" style={{ padding: "0.4rem 0.7rem", fontSize: "0.75rem" }}>See program</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={close}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(440px, 95vw)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <span className="badge">{mode.kind === "reschedule" ? "Reschedule" : "Cancel"}</span>
            <h2>{mode.kind === "reschedule" ? "Pick a new time" : "Cancel this session"}</h2>
            {submitted ? (
              <p style={{ color: "var(--sage)" }}>{submitted}</p>
            ) : (
              <>
                {mode.kind === "reschedule" ? (
                  <div>
                    <label className="stat-label">Suggested times James has open</label>
                    <select className="select" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} style={{ marginTop: "0.3rem" }}>
                      <option value="">— pick one —</option>
                      {SUGGESTED_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.4rem" }}>James keeps these slots up to date in his schedule.</p>
                  </div>
                ) : null}
                <div>
                  <label className="stat-label">{mode.kind === "reschedule" ? "Note (optional)" : "Reason"}</label>
                  <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginTop: "0.3rem" }} placeholder={mode.kind === "reschedule" ? "Anything James should know" : "Sick / travel / conflict / other"} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button className="btn btn-ghost" onClick={close}>Back</button>
                  <button className="btn btn-primary" onClick={submit} disabled={mode.kind === "reschedule" && !requestedTime}>Submit request</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

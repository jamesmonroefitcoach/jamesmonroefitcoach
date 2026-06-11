"use client";
import { useMemo, useState, useTransition } from "react";
import type { AppointmentRow } from "@/lib/data";
import type { ClientPersonalEvent } from "@/lib/client-personal-events";
import { fmtDate } from "@/lib/format";
import { addPersonalEvent, editPersonalEvent, removePersonalEvent } from "./actions";

// Weekly mini-calendar on /client. Sessions with James are read-only (the
// reschedule/cancel flow already lives below on /client). Personal events
// (work, school, family stuff) the client can add/edit/delete here so they
// can plan around them.

type Item =
  | { kind: "session"; appt: AppointmentRow; starts_at: string; title: string; durationMin: number }
  | { kind: "event"; evt: ClientPersonalEvent; starts_at: string; title: string; durationMin: number };

const DAY_MS = 86400000;

function startOfDayLocal(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function startOfWeek(d: Date): Date {
  // Monday-first
  const x = startOfDayLocal(d);
  const dow = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function isoLocalNoSeconds(d: Date): string {
  // Format for <input type="datetime-local">: YYYY-MM-DDTHH:MM (no Z)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function durationMin(start: string, end: string | null): number {
  if (!end) return 60;
  return Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ClientSchedule({
  appointments,
  events,
}: {
  appointments: AppointmentRow[];
  events: ClientPersonalEvent[];
}) {
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [modal, setModal] = useState<
    | null
    | { kind: "view-session"; appt: AppointmentRow }
    | { kind: "edit-event"; evt: ClientPersonalEvent | null; presetDay?: Date }
  >(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  // Items in this week, grouped by day index 0..6
  const itemsByDay = useMemo(() => {
    const buckets: Item[][] = Array.from({ length: 7 }, () => []);
    const ws = weekStart.getTime();
    const we = weekEnd.getTime();
    appointments.forEach((a) => {
      const t = new Date(a.starts_at).getTime();
      if (t < ws || t >= we) return;
      const idx = Math.floor((t - ws) / DAY_MS);
      buckets[idx]?.push({
        kind: "session",
        appt: a,
        starts_at: a.starts_at,
        title:
          a.session_type === "personal"
            ? a.personal_label ?? "Coach block"
            : "Training session",
        durationMin: durationMin(a.starts_at, a.ends_at ?? null),
      });
    });
    events.forEach((e) => {
      const t = new Date(e.starts_at).getTime();
      if (t < ws || t >= we) return;
      const idx = Math.floor((t - ws) / DAY_MS);
      buckets[idx]?.push({
        kind: "event",
        evt: e,
        starts_at: e.starts_at,
        title: e.title,
        durationMin: durationMin(e.starts_at, e.ends_at),
      });
    });
    buckets.forEach((b) => b.sort((x, y) => x.starts_at.localeCompare(y.starts_at)));
    return buckets;
  }, [appointments, events, weekStart, weekEnd]);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const todayIdx = useMemo(() => {
    const today = startOfDayLocal(new Date()).getTime();
    const i = Math.floor((today - weekStart.getTime()) / DAY_MS);
    return i >= 0 && i < 7 ? i : -1;
  }, [weekStart]);

  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "0.85rem 0.95rem",
        background: "var(--paper)",
        marginBottom: "1.5rem",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.6rem",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "Oswald, sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: "0.66rem",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            My Week
          </div>
          <h2 style={{ margin: "0.1rem 0 0", fontSize: "1.05rem" }}>
            {fmtDate(weekStart.toISOString())}
            {" → "}
            {fmtDate(addDays(weekStart, 6).toISOString())}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setWeekStart((w) => addDays(w, -7))} style={{ padding: "0.32rem 0.7rem", fontSize: "0.8rem" }}>‹ Prev</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))} style={{ padding: "0.32rem 0.7rem", fontSize: "0.8rem" }}>Today</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart((w) => addDays(w, 7))} style={{ padding: "0.32rem 0.7rem", fontSize: "0.8rem" }}>Next ›</button>
          <button
            className="btn btn-primary"
            onClick={() => setModal({ kind: "edit-event", evt: null, presetDay: weekStart })}
            style={{ padding: "0.32rem 0.7rem", fontSize: "0.8rem" }}
          >
            + Add event
          </button>
        </div>
      </header>

      {/* Day grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: "0.35rem",
        }}
      >
        {DAY_LABELS.map((label, idx) => {
          const day = addDays(weekStart, idx);
          const items = itemsByDay[idx];
          const isToday = idx === todayIdx;
          return (
            <div
              key={idx}
              style={{
                border: isToday ? "1px solid var(--rust)" : "1px solid var(--line)",
                borderRadius: 5,
                minHeight: 130,
                padding: "0.35rem 0.4rem",
                background: isToday ? "#fbf7ef" : "#fff",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span
                  style={{
                    fontFamily: "Oswald, sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontSize: "0.58rem",
                    color: "var(--muted)",
                    fontWeight: 600,
                  }}
                >
                  {label}
                </span>
                <span style={{ fontSize: "0.85rem", fontWeight: isToday ? 700 : 500, color: isToday ? "var(--rust)" : "var(--ink)" }}>
                  {day.getDate()}
                </span>
              </div>
              {items.length === 0 ? (
                <button
                  onClick={() => setModal({ kind: "edit-event", evt: null, presetDay: day })}
                  style={{
                    border: "1px dashed var(--line)",
                    borderRadius: 3,
                    background: "transparent",
                    color: "var(--muted)",
                    fontSize: "0.66rem",
                    padding: "0.25rem",
                    cursor: "pointer",
                    marginTop: "0.2rem",
                  }}
                  title="Add an event on this day"
                >
                  +
                </button>
              ) : (
                items.map((it, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (it.kind === "session") setModal({ kind: "view-session", appt: it.appt });
                      else setModal({ kind: "edit-event", evt: it.evt });
                    }}
                    style={{
                      textAlign: "left",
                      border: "none",
                      borderRadius: 3,
                      padding: "0.3rem 0.4rem",
                      background:
                        it.kind === "session" ? "var(--rust)" : "#efe7d7",
                      color: it.kind === "session" ? "#fff" : "var(--ink)",
                      fontSize: "0.7rem",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      lineHeight: 1.2,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{fmtTime(it.starts_at)}</div>
                    <div
                      style={{
                        opacity: it.kind === "session" ? 0.9 : 0.85,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {it.title}
                    </div>
                  </button>
                ))
              )}
            </div>
          );
        })}
      </div>

      {modal?.kind === "view-session" && (
        <SessionDetailModal appt={modal.appt} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "edit-event" && (
        <EditEventModal
          evt={modal.evt}
          presetDay={modal.presetDay}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

function SessionDetailModal({
  appt,
  onClose,
}: {
  appt: AppointmentRow;
  onClose: () => void;
}) {
  const programStatusLabel: Record<string, string> = {
    programmed: "Programmed",
    draft: "Drafted",
    needs_programming: "Not programmed",
    "n/a": "—",
  };
  return (
    <Overlay onClose={onClose}>
      <h2 style={{ margin: 0 }}>{appt.session_type === "personal" ? appt.personal_label ?? "Coach block" : "Training session"}</h2>
      <p className="meta" style={{ marginTop: "0.25rem" }}>
        {new Date(appt.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        {appt.ends_at &&
          ` → ${new Date(appt.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
      </p>
      <hr className="divider" />
      <Field label="Status" value={appt.status ?? "—"} />
      <Field label="Program" value={programStatusLabel[appt.program_status] ?? appt.program_status} />
      {appt.rate != null && <Field label="Rate" value={`$${appt.rate}`} />}
      {appt.paid !== undefined && <Field label="Paid" value={appt.paid ? "Yes" : "No"} />}
      {appt.notes && <Field label="Notes" value={appt.notes} wrap />}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.85rem" }}>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Overlay>
  );
}

function EditEventModal({
  evt,
  presetDay,
  onClose,
}: {
  evt: ClientPersonalEvent | null;
  presetDay?: Date;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const initialStart = evt
    ? new Date(evt.starts_at)
    : (() => { const d = presetDay ? new Date(presetDay) : new Date(); d.setHours(9, 0, 0, 0); return d; })();
  const initialEnd = evt?.ends_at ? new Date(evt.ends_at) : null;
  const [title, setTitle] = useState(evt?.title ?? "");
  const [startsAt, setStartsAt] = useState(isoLocalNoSeconds(initialStart));
  const [endsAt, setEndsAt] = useState(initialEnd ? isoLocalNoSeconds(initialEnd) : "");
  const [notes, setNotes] = useState(evt?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    if (!title.trim()) { setErr("Give it a title."); return; }
    if (!startsAt) { setErr("Pick a start time."); return; }
    start(async () => {
      const startISO = new Date(startsAt).toISOString();
      const endISO = endsAt ? new Date(endsAt).toISOString() : null;
      const res = evt
        ? await editPersonalEvent(evt.id, { title, starts_at: startISO, ends_at: endISO, notes })
        : await addPersonalEvent({ title, starts_at: startISO, ends_at: endISO, notes });
      if (!res.ok) { setErr(res.error); return; }
      onClose();
    });
  }
  function remove() {
    if (!evt) return;
    if (!confirm("Delete this event?")) return;
    start(async () => {
      const res = await removePersonalEvent(evt.id);
      if (!res.ok) { setErr(res.error); return; }
      onClose();
    });
  }
  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "0.92rem",
    padding: "0.4rem 0.5rem",
    border: "1px solid var(--ink)",
    borderRadius: 4,
    background: "#fff",
    width: "100%",
  };

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{evt ? "Edit personal event" : "New personal event"}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
        <label>
          <div className="stat-label">Title</div>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Doctor appointment, work meeting, kids…" />
        </label>
        <label>
          <div className="stat-label">Starts</div>
          <input type="datetime-local" style={inputStyle} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label>
          <div className="stat-label">Ends (optional)</div>
          <input type="datetime-local" style={inputStyle} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <label>
          <div className="stat-label">Notes (optional)</div>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {err && <div style={{ color: "var(--red)", fontSize: "0.82rem" }}>{err}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginTop: "0.9rem" }}>
        {evt ? (
          <button className="btn btn-ghost" style={{ color: "var(--red)" }} onClick={remove} disabled={pending}>Delete</button>
        ) : <span />}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : evt ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div style={{ margin: "0.35rem 0", display: wrap ? "block" : "flex", justifyContent: "space-between", gap: "0.5rem" }}>
      <span className="meta" style={{ fontSize: "0.78rem" }}>{label}</span>
      <span style={{ fontWeight: 500, whiteSpace: wrap ? "pre-wrap" : "nowrap" }}>{value}</span>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23,19,17,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper)",
          border: "1px solid var(--ink)",
          borderRadius: 6,
          padding: "1rem 1.15rem 1.1rem",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

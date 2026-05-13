"use client";
import { useMemo, useState, useTransition } from "react";
import type { ClientRow, AppointmentRow } from "@/lib/data";
import type { SlotOffer } from "./data";
import { saveSlotOffer, cancelSlotOffer, deleteSlotOffer } from "./actions";

type Mode = null | { kind: "new" } | { kind: "edit"; offer: SlotOffer };

const TIERS: ("tier_1" | "tier_2" | "tier_3")[] = ["tier_1", "tier_2", "tier_3"];

const WORK_START_HOUR = 6;  // 6 am
const WORK_END_HOUR   = 20; // 8 pm (last slot is 7pm–8pm)

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): string { return new Date(s).toISOString(); }

function defaultDraft(): SlotOffer {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: "",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    notes: "",
    status: "open",
    notify_only: false,
    target_tier: null,
    target_client_ids: [],
    claimed_by: null,
    claimed_at: null
  };
}

// ── Week view panel ───────────────────────────────────────────────────────

type SlotState = "booked" | "booked-personal" | "booked-online" | "offered-claimable" | "offered-notify" | "free";

interface HourSlot {
  slotStart: Date;
  hour: number;
  state: SlotState;
  offer: SlotOffer | null;
  clientName: string | null;
}

function WeekViewPanel({
  offers,
  weekAppointments,
  clients,
}: {
  offers: SlotOffer[];
  weekAppointments: AppointmentRow[];
  clients: ClientRow[];
}) {
  const [open, setOpen] = useState(false);

  const { days, weekStart, slotsByDay, totalFree, totalOffered, totalBooked } = useMemo(() => {
    const today = new Date();
    const ws = new Date(today);
    ws.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday
    ws.setHours(0, 0, 0, 0);
    const weekEnd = ws.getTime() + 7 * 86400000;

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      return d;
    });

    // Only open offers in this week
    const weekOffers = offers.filter((o) => {
      if (o.status !== "open") return false;
      const t = new Date(o.starts_at).getTime();
      return t >= ws.getTime() && t < weekEnd;
    });

    // Only non-cancelled appointments in this week
    const activeAppts = weekAppointments.filter(
      (a) => a.status !== "cancelled" && a.status !== "no_show"
    );

    const slotsByDay = new Map<number, HourSlot[]>();
    let totalFree = 0;
    let totalOffered = 0;
    let totalBooked = 0;

    days.forEach((day, dayIdx) => {
      const daySlots: HourSlot[] = [];

      for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
        const slotStart = new Date(day);
        slotStart.setHours(h, 0, 0, 0);
        const slotStartMs = slotStart.getTime();
        const slotEndMs = slotStartMs + 3_600_000;

        // Check if overlaps a booked appointment — show it, don't skip
        const bookedAppt = activeAppts.find((a) => {
          const aStart = new Date(a.starts_at).getTime();
          const aEnd   = new Date(a.ends_at).getTime();
          return slotStartMs < aEnd && slotEndMs > aStart;
        });

        if (bookedAppt) {
          totalBooked++;
          let slotState: SlotState;
          let clientName: string | null;
          if (bookedAppt.session_type === "personal") {
            slotState = "booked-personal";
            clientName = bookedAppt.personal_label ?? "Personal";
          } else {
            const apptClient = bookedAppt.client_id ? clients.find((c) => c.id === bookedAppt.client_id) : null;
            slotState = apptClient?.lifecycle === "online" ? "booked-online" : "booked";
            clientName = bookedAppt.client_name ?? "Client";
          }
          daySlots.push({ slotStart, hour: h, state: slotState, offer: null, clientName });
          continue;
        }

        // Find matching offer
        const matchedOffer = weekOffers.find((o) => {
          const oStart = new Date(o.starts_at).getTime();
          const oEnd   = new Date(o.ends_at).getTime();
          return slotStartMs < oEnd && slotEndMs > oStart;
        }) ?? null;

        const state: SlotState = matchedOffer
          ? (matchedOffer.notify_only ? "offered-notify" : "offered-claimable")
          : "free";

        if (state === "free") totalFree++;
        else totalOffered++;

        daySlots.push({ slotStart, hour: h, state, offer: matchedOffer, clientName: null });
      }

      slotsByDay.set(dayIdx, daySlots);
    });

    return { days, weekStart: ws, slotsByDay, totalFree, totalOffered, totalBooked };
  }, [offers, weekAppointments]);

  const today = new Date();
  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  function fmtHour(h: number): string {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
  }

  const summaryParts: string[] = [];
  if (totalBooked  > 0) summaryParts.push(`${totalBooked} booked`);
  if (totalOffered > 0) summaryParts.push(`${totalOffered} offered`);
  if (totalFree    > 0) summaryParts.push(`${totalFree} open`);
  const summaryText = summaryParts.join(" · ") || "fully booked";

  const slotStyle = (state: SlotState): React.CSSProperties => ({
    fontSize: "0.67rem",
    padding: "0.14rem 0.32rem",
    borderRadius: 3,
    marginBottom: "0.12rem",
    whiteSpace: "nowrap",
    background:
      state === "booked"              ? "rgba(0,0,0,0.07)"
      : state === "booked-personal"   ? "rgba(58,52,47,0.12)"
      : state === "booked-online"     ? "rgba(30,106,140,0.14)"
      : state === "offered-claimable" ? "rgba(90,107,74,0.14)"
      : state === "offered-notify"    ? "rgba(217,119,6,0.11)"
      : "rgba(0,0,0,0.04)",
    border: `1px solid ${
      state === "booked"              ? "rgba(0,0,0,0.35)"
      : state === "booked-personal"   ? "rgba(58,52,47,0.5)"
      : state === "booked-online"     ? "rgba(30,106,140,0.6)"
      : state === "offered-claimable" ? "var(--sage)"
      : state === "offered-notify"    ? "var(--amber)"
      : "var(--line)"
    }`,
    color:
      state === "booked"              ? "var(--ink)"
      : state === "booked-personal"   ? "var(--ink)"
      : state === "booked-online"     ? "rgb(10,60,90)"
      : state === "offered-claimable" ? "rgb(60,80,50)"
      : state === "offered-notify"    ? "rgb(146,64,14)"
      : "var(--muted)",
    fontWeight: (state === "booked" || state === "booked-personal" || state === "booked-online") ? 600 : undefined,
  });

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: open ? "4px 4px 0 0" : 4,
          padding: "0.6rem 1rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          color: "var(--ink)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
          Week of {weekLabel}
        </span>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 400 }}>
          {summaryText}
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)" }}>
          {open ? "▲ hide" : "▼ show"}
        </span>
      </button>

      {open && (
        <div
          style={{
            border: "1px solid var(--line)",
            borderTop: "none",
            borderRadius: "0 0 4px 4px",
            background: "var(--paper)",
            padding: "0.85rem 1rem",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(88px, 1fr))",
              gap: "0.5rem",
              minWidth: 580,
            }}
          >
            {days.map((day, i) => {
              const daySlots = slotsByDay.get(i) ?? [];
              const isToday = day.toDateString() === today.toDateString();
              const isPast  = day < today && !isToday;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                  {/* Day header */}
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      paddingBottom: "0.3rem",
                      marginBottom: "0.3rem",
                      borderBottom: `2px solid ${isToday ? "var(--rust)" : "var(--line)"}`,
                      color: isToday ? "var(--rust)" : isPast ? "var(--muted)" : "var(--ink)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                    <span style={{ fontWeight: 400, marginLeft: "0.3rem" }}>
                      {day.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                    </span>
                  </div>

                  {/* Slots */}
                  {daySlots.length === 0 ? (
                    <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>fully booked</span>
                  ) : (
                    daySlots.map((slot) => (
                      <div
                        key={slot.hour}
                        style={slotStyle(slot.state)}
                        title={
                          slot.state === "booked"
                            ? (slot.clientName ?? "Booked")
                            : slot.offer?.notes
                            ? slot.offer.notes
                            : slot.state === "free"
                            ? "Open — not yet offered"
                            : undefined
                        }
                      >
                        {fmtHour(slot.hour)}
                        {(slot.state === "booked" || slot.state === "booked-online") && slot.clientName && (
                          <span style={{ marginLeft: "0.25rem" }}>{slot.clientName}</span>
                        )}
                        {slot.state === "booked-personal" && slot.clientName && (
                          <span style={{ marginLeft: "0.25rem" }}>⛔ {slot.clientName}</span>
                        )}
                        {slot.state === "offered-claimable" && <span style={{ opacity: 0.6, marginLeft: "0.2rem" }}>·c</span>}
                        {slot.state === "offered-notify"    && <span style={{ opacity: 0.6, marginLeft: "0.2rem" }}>·n</span>}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginTop: "0.75rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--line)",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Booked — in-person", color: "rgba(0,0,0,0.07)", border: "rgba(0,0,0,0.35)" },
              { label: "Booked — online client", color: "rgba(30,106,140,0.14)", border: "rgba(30,106,140,0.6)" },
              { label: "Personal block ⛔", color: "rgba(58,52,47,0.12)", border: "rgba(58,52,47,0.5)" },
              { label: "Claimable offer (·c)", color: "rgba(90,107,74,0.3)", border: "var(--sage)" },
              { label: "Notify-only offer (·n)", color: "rgba(217,119,6,0.2)", border: "var(--amber)" },
              { label: "Open — not offered", color: "rgba(0,0,0,0.06)", border: "var(--line)" },
            ].map(({ label, color, border }) => (
              <span
                key={label}
                style={{ fontSize: "0.68rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                    border: `1px solid ${border}`,
                    flexShrink: 0,
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function AvailabilityClient({
  clients,
  initialOffers,
  weekAppointments,
}: {
  clients: ClientRow[];
  initialOffers: SlotOffer[];
  weekAppointments: AppointmentRow[];
}) {
  const [offers, setOffers] = useState(initialOffers);
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState<SlotOffer>(defaultDraft());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const open    = offers.filter((o) => o.status === "open").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const claimed = offers.filter((o) => o.status === "claimed").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const past    = offers.filter((o) => o.status === "cancelled" || new Date(o.starts_at).getTime() < Date.now()).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    return { open, claimed, past };
  }, [offers]);

  const noSessionClients = useMemo(() => {
    const sessionClientIds = new Set(
      weekAppointments
        .filter((a) => a.status !== "cancelled" && a.status !== "no_show" && a.session_type === "session" && a.client_id)
        .map((a) => a.client_id!)
    );
    return clients.filter((c) => (c.lifecycle === "active" || c.lifecycle === "online") && !sessionClientIds.has(c.id));
  }, [clients, weekAppointments]);

  function openNew()  { setMode({ kind: "new" }); setDraft(defaultDraft()); setErr(null); }
  function openEdit(o: SlotOffer) { setMode({ kind: "edit", offer: o }); setDraft({ ...o }); setErr(null); }
  function close()    { setMode(null); }

  function toggleClient(id: string) {
    setDraft((d) => {
      const has = d.target_client_ids.includes(id);
      return { ...d, target_client_ids: has ? d.target_client_ids.filter((x) => x !== id) : [...d.target_client_ids, id] };
    });
  }

  function save() {
    setErr(null);
    // Slots are always 1 hour long — derive ends_at from starts_at at save
    // time so legacy offers with weird durations get normalized when re-saved.
    const oneHourEnd = new Date(new Date(draft.starts_at).getTime() + 60 * 60 * 1000).toISOString();
    start(async () => {
      const res = await saveSlotOffer({
        id: mode?.kind === "edit" ? mode.offer.id : undefined,
        starts_at: draft.starts_at,
        ends_at:   oneHourEnd,
        notes:     draft.notes,
        notify_only:      draft.notify_only,
        target_tier:      draft.target_tier,
        target_client_ids: draft.target_client_ids,
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          if (mode?.kind === "edit") {
            setOffers((cur) => cur.map((o) => (o.id === mode.offer.id ? { ...draft, id: o.id } : o)));
          } else {
            setOffers((cur) => [...cur, { ...draft, id: `local-${Date.now()}` }]);
          }
          close();
          return;
        }
        setErr(res.error);
        return;
      }
      if (mode?.kind === "edit") {
        setOffers((cur) => cur.map((o) => (o.id === mode.offer.id ? { ...draft, id: o.id } : o)));
      } else {
        setOffers((cur) => [...cur, { ...draft, id: res.data?.id ?? `local-${Date.now()}` }]);
      }
      close();
    });
  }

  function cancel(id: string) {
    setErr(null);
    start(async () => {
      const res = await cancelSlotOffer(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) { setErr(res.error); return; }
      setOffers((cur) => cur.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
    });
  }

  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteSlotOffer(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) { setErr(res.error); return; }
      setOffers((cur) => cur.filter((o) => o.id !== id));
    });
  }

  return (
    <>
      {/* ── Week view panel ─────────────────────────────────────── */}
      <WeekViewPanel offers={offers} weekAppointments={weekAppointments} clients={clients} />

      {/* ── Active clients session status this week ─────────────── */}
      <div style={{
        marginBottom: "0.9rem",
        padding: "0.55rem 0.85rem",
        background: noSessionClients.length === 0 ? "rgba(90,107,74,0.07)" : "rgba(0,0,0,0.025)",
        border: `1px solid ${noSessionClients.length === 0 ? "var(--sage)" : "var(--line)"}`,
        borderRadius: 4,
      }}>
        {noSessionClients.length === 0 ? (
          <span style={{ fontSize: "0.76rem", color: "var(--sage)", fontWeight: 600 }}>
            All active clients are scheduled this week 🙂
          </span>
        ) : (
          <>
            <span style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "var(--muted)",
            }}>
              No session this week
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }}>
              {noSessionClients.map((c) => (
                <span key={c.id} style={{
                  fontSize: "0.76rem", padding: "0.18rem 0.5rem",
                  borderRadius: 3, border: "1px solid var(--line)",
                  background: "var(--paper)", color: "var(--ink)",
                }}>
                  {c.full_name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button className="btn btn-primary" onClick={openNew}>+ Open a slot</button>
      </div>

      {err ? <p style={{ color: "var(--red)" }}>{err}</p> : null}

      <Section title="Open offers"  rows={grouped.open}    clients={clients} onEdit={openEdit} onCancel={cancel} onDelete={remove} />
      <Section title="Claimed"      rows={grouped.claimed} clients={clients} onEdit={openEdit} onCancel={cancel} onDelete={remove} />
      <Section title="History"      rows={grouped.past}    clients={clients} onEdit={openEdit} onCancel={cancel} onDelete={remove} dim />

      {mode ? (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50 }}
          onClick={close}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              position: "absolute", top: 0, right: 0, bottom: 0,
              width: "min(440px, 95vw)", borderRadius: 0,
              borderLeft: "1px solid var(--line)",
              padding: "1.25rem 1.4rem", overflow: "auto",
              display: "flex", flexDirection: "column", gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge">{mode.kind === "edit" ? "Edit slot" : "New slot"}</span>
              <button className="btn btn-ghost" onClick={close} style={{ padding: "0.25rem 0.55rem" }}>Close</button>
            </div>

            <div>
              <label className="stat-label">Start time</label>
              <div style={{ marginTop: "0.3rem" }}>
                <input
                  className="input"
                  type="datetime-local"
                  value={toLocalInput(draft.starts_at)}
                  onChange={(e) => {
                    // 1-hour slots assumed — set end automatically from start.
                    const newStart = fromLocalInput(e.target.value);
                    const newEnd = new Date(new Date(newStart).getTime() + 60 * 60 * 1000).toISOString();
                    setDraft({ ...draft, starts_at: newStart, ends_at: newEnd });
                  }}
                />
              </div>
              <p className="meta" style={{ fontSize: "0.7rem", marginTop: "0.25rem", fontStyle: "italic" }}>
                Slot is always 1 hour long.
              </p>
            </div>

            <div>
              <label className="stat-label">Visibility</label>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
                <button type="button" className="btn" style={{ flex: 1, background: !draft.notify_only ? "var(--ink)" : undefined, color: !draft.notify_only ? "var(--paper)" : undefined }} onClick={() => setDraft({ ...draft, notify_only: false })}>Claimable</button>
                <button type="button" className="btn" style={{ flex: 1, background:  draft.notify_only ? "var(--ink)" : undefined, color:  draft.notify_only ? "var(--paper)" : undefined }} onClick={() => setDraft({ ...draft, notify_only: true  })}>Notify only</button>
              </div>
              <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.3rem" }}>
                {draft.notify_only
                  ? "Targeted clients see it but can't grab it directly — they'll text you."
                  : "First targeted client to claim books the slot."}
              </p>
            </div>

            <div>
              <label className="stat-label">Tier audience (optional)</label>
              <select
                className="select"
                value={draft.target_tier ?? ""}
                onChange={(e) => setDraft({ ...draft, target_tier: (e.target.value || null) as any })}
                style={{ marginTop: "0.3rem" }}
              >
                <option value="">— none —</option>
                {TIERS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>

            <div>
              <label className="stat-label">Specific clients</label>
              <div style={{ marginTop: "0.3rem", maxHeight: 220, overflow: "auto", border: "1px solid var(--line)", borderRadius: 3, padding: "0.4rem 0.6rem" }}>
                {clients.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={draft.target_client_ids.includes(c.id)} onChange={() => toggleClient(c.id)} />
                    <span>{c.full_name}</span>
                    <span className="meta" style={{ marginLeft: "auto", fontSize: "0.72rem" }}>{c.tier?.replace("_", " ") ?? ""}</span>
                  </label>
                ))}
              </div>
              <p className="meta" style={{ fontSize: "0.72rem", marginTop: "0.3rem" }}>
                If you set a Tier above, every client in that tier sees it automatically. Pick specific clients to add anyone outside that tier.
              </p>
            </div>

            <div>
              <label className="stat-label">Note</label>
              <input
                className="input"
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                style={{ marginTop: "0.3rem" }}
                placeholder="(optional) e.g. Backfill — short notice"
              />
            </div>

            <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid var(--line)", paddingTop: "0.85rem" }}>
              <button className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

// ── Section ───────────────────────────────────────────────────────────────

function Section({
  title, rows, clients, onEdit, onCancel, onDelete, dim,
}: {
  title: string;
  rows: SlotOffer[];
  clients: ClientRow[];
  onEdit:   (o: SlotOffer) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  dim?: boolean;
}) {
  if (!rows.length) return null;
  const idToName = Object.fromEntries(clients.map((c) => [c.id, c.full_name]));
  return (
    <div className="card" style={{ marginTop: "0.85rem", padding: 0, opacity: dim ? 0.7 : 1 }}>
      <div style={{ padding: "0.7rem 1rem", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ margin: 0 }}>{title} <span className="meta" style={{ fontSize: "0.74rem", marginLeft: 6 }}>({rows.length})</span></h3>
      </div>
      <table className="table">
        <thead>
          <tr><th>When</th><th>Visibility</th><th>Audience</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>{new Date(o.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td>
                {o.notify_only
                  ? <span className="badge badge-amber">notify only</span>
                  : <span className="badge badge-sage">claimable</span>}
                {o.status === "cancelled" && <span className="badge badge-red"  style={{ marginLeft: 4 }}>cancelled</span>}
                {o.status === "claimed"   && <span className="badge"            style={{ marginLeft: 4 }}>claimed</span>}
              </td>
              <td className="meta" style={{ fontSize: "0.78rem" }}>
                {o.target_tier ? <>tier {o.target_tier.replace("tier_", "")}</> : null}
                {o.target_tier && o.target_client_ids.length ? " · " : null}
                {o.target_client_ids.length ? o.target_client_ids.map((id) => idToName[id] ?? id).join(", ") : null}
                {!o.target_tier && !o.target_client_ids.length ? "— pick at least one —" : null}
              </td>
              <td className="meta">{o.notes ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => onEdit(o)}>Edit</button>{" "}
                {o.status === "open" && <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }} onClick={() => onCancel(o.id)}>Cancel</button>}{" "}
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }} onClick={() => onDelete(o.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import type { ClientRow, Prospect } from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import { fmtMoney, fmtDate, fmtSessionAgo, fmtSessionAway } from "@/lib/format";
import { addProspect, deleteProspect, logProspectFollowUp, type ProspectInput } from "./actions";
import type { NextSessionStatus } from "./page";

// ── helpers ───────────────────────────────────────────────────────────────

function daysAgo(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const BLANK_PROSPECT: ProspectInput = {
  full_name: "", phone: "", email: "", where_met: "", connection: "",
  last_followed_up: "", notes: "",
};

// ── sub-components ────────────────────────────────────────────────────────

function LastSessionCell({ iso }: { iso: string | null }) {
  const f = fmtSessionAgo(iso);
  if (!f) return <span className="meta">—</span>;
  const stale = daysAgo(iso) >= 30;
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{f.line1}</div>
      <div className="meta" style={{ fontSize: "0.74rem", color: stale ? "var(--red)" : undefined }}>
        {f.line2}
      </div>
    </div>
  );
}

function NextSessionCell({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <span className="badge badge-red" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>
        No Planned Session
      </span>
    );
  }
  const f = fmtSessionAway(iso);
  if (!f) return <span className="meta">—</span>;
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{f.line1}</div>
      <div className="meta" style={{ fontSize: "0.74rem" }}>{f.line2}</div>
    </div>
  );
}

function ActiveClientRow({ c, nextSessionStatus }: { c: ClientRow; nextSessionStatus: NextSessionStatus }) {
  const atHomeProg = pastProgramsForClient(c.id).find(
    (p) => p.is_current && p.program_kind === "at_home"
  ) ?? null;
  const daysLeft = atHomeProg?.ends_on
    ? Math.ceil((new Date(atHomeProg.ends_on).getTime() - Date.now()) / 86400000)
    : null;
  const nextStatus = c.next_session_at ? nextSessionStatus[c.id] : undefined;

  return (
    <tr>
      <td>
        <strong>{c.full_name}</strong>
        {c.tier && <><br /><span className="meta" style={{ fontSize: "0.72rem" }}>{c.tier.replace("_", " ")}</span></>}
        {c.requires_confirmation && <><br /><span className="badge" style={{ fontSize: "0.68rem", background: "var(--amber-light, #fff8e1)", color: "#8a6200" }}>confirm</span></>}
      </td>
      <td className="meta" style={{ maxWidth: 200, fontSize: "0.82rem" }}>{c.goals ?? "—"}</td>
      <td>
        <div>{c.regular_frequency ? `${c.regular_frequency}×/wk` : "—"}</div>
        <div className="meta" style={{ fontSize: "0.74rem" }}>{fmtMoney(c.session_rate)}/session</div>
      </td>
      <td><LastSessionCell iso={c.last_session_at} /></td>
      <td>
        <NextSessionCell iso={c.next_session_at} />
        {c.next_session_at && (
          <Link
            href={`/coach/build-program?tab=session&client=${c.id}${nextStatus ? `&appt=${nextStatus.apptId}` : ""}`}
            style={{
              display: "inline-block",
              marginTop: "0.3rem",
              fontSize: "0.7rem",
              fontWeight: 600,
              padding: "0.15rem 0.45rem",
              borderRadius: 3,
              border: `1px solid ${nextStatus?.programmed ? "var(--sage)" : "var(--amber)"}`,
              color: nextStatus?.programmed ? "var(--sage)" : "var(--amber)",
              background: nextStatus?.programmed ? "rgba(90,107,74,0.07)" : "rgba(217,119,6,0.07)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {nextStatus?.programmed ? "Programmed →" : "Not Programmed →"}
          </Link>
        )}
      </td>
      <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.total_sessions}</td>
      <td>
        <div className="meta" style={{ fontSize: "0.7rem", marginBottom: "0.25rem" }}>
          {atHomeProg?.ends_on ? (
            <>
              {new Date(atHomeProg.ends_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" · "}
              <span style={{ color: daysLeft !== null && daysLeft <= 7 ? "var(--amber)" : undefined }}>
                {daysLeft !== null
                  ? daysLeft <= 0 ? "expired" : `${daysLeft}d left`
                  : "no end"}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>No current program</span>
          )}
        </div>
        <Link
          href={`/coach/build-program?tab=program&client=${c.id}`}
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            padding: "0.15rem 0.45rem",
            borderRadius: 3,
            border: "1px solid var(--sage)",
            color: "var(--sage)",
            background: "rgba(90,107,74,0.07)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            display: "inline-block",
          }}
        >
          View Program →
        </Link>
      </td>
      <td>{c.balance_owed > 0 ? <span className="badge badge-red">{fmtMoney(c.balance_owed)}</span> : <span className="meta">—</span>}</td>
      <td><Link href={`/coach/clients/${c.id}`}>open →</Link></td>
    </tr>
  );
}

function InactiveClientRow({ c }: { c: ClientRow }) {
  return (
    <tr>
      <td>
        <strong>{c.full_name}</strong>
        <br />
        <span className="badge" style={{
          fontSize: "0.68rem",
          background: c.lifecycle === "paused" ? "#e8f0fe" : "#fce8e8",
          color: c.lifecycle === "paused" ? "#1a56db" : "var(--red)"
        }}>{c.lifecycle}</span>
      </td>
      <td className="meta" style={{ fontSize: "0.82rem" }}>{c.goals ?? "—"}</td>
      <td><LastSessionCell iso={c.last_session_at} /></td>
      <td className="meta" style={{ fontSize: "0.82rem" }}>
        {c.injuries ? <span style={{ color: "var(--red)", fontSize: "0.78rem" }}>{c.injuries}</span> : "—"}
      </td>
      <td>{c.balance_owed > 0 ? <span className="badge badge-red">{fmtMoney(c.balance_owed)}</span> : <span className="meta">—</span>}</td>
      <td><Link href={`/coach/clients/${c.id}`}>open →</Link></td>
    </tr>
  );
}

function ProspectRow({ p, onFollowUp, onDelete }: {
  p: Prospect;
  onFollowUp: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const daysSince = p.last_followed_up
    ? Math.floor((Date.now() - new Date(p.last_followed_up).getTime()) / 86400000)
    : null;
  return (
    <tr>
      <td><strong>{p.full_name}</strong></td>
      <td>
        <div className="meta" style={{ fontSize: "0.82rem" }}>{p.phone ?? "—"}</div>
        <div className="meta" style={{ fontSize: "0.82rem" }}>{p.email ?? "—"}</div>
      </td>
      <td>
        {p.where_met && <div style={{ fontSize: "0.82rem" }}>{p.where_met}</div>}
        {p.connection && <div className="meta" style={{ fontSize: "0.78rem" }}>{p.connection}</div>}
        {!p.where_met && !p.connection && <span className="meta">—</span>}
      </td>
      <td>
        {p.last_followed_up ? (
          <>
            <div style={{ fontSize: "0.82rem" }}>{fmtDate(p.last_followed_up)}</div>
            <div className="meta" style={{ fontSize: "0.74rem", color: daysSince! >= 14 ? "var(--red)" : undefined }}>
              {daysSince}d ago
            </div>
          </>
        ) : <span className="meta" style={{ color: "var(--red)", fontSize: "0.82rem" }}>never</span>}
      </td>
      <td className="meta" style={{ maxWidth: 240, fontSize: "0.8rem" }}>{p.notes ?? "—"}</td>
      <td>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem" }}
            onClick={() => onFollowUp(p.id)}>
            log follow-up
          </button>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem", color: "var(--red)" }}
            onClick={() => onDelete(p.id)}>
            remove
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add Prospect Modal ────────────────────────────────────────────────────

function ProspectModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<ProspectInput>(BLANK_PROSPECT);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof ProspectInput, val: string) {
    setDraft((d) => ({ ...d, [field]: val }));
  }

  function submit() {
    if (!draft.full_name.trim()) { setError("Name is required."); return; }
    setError(null);
    start(async () => {
      const res = await addProspect(draft);
      if (res.ok) onClose();
      else setError(res.error ?? "Unknown error");
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center"
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: "min(520px, 96vw)", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem", position: "relative" }}>
        <h3 style={{ marginBottom: "1.25rem" }}>Add Prospect</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1rem" }}>
          <label className="field" style={{ gridColumn: "1/-1" }}>
            <span className="field-label">Name *</span>
            <input className="input" value={draft.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Full name" />
          </label>
          <label className="field">
            <span className="field-label">Phone</span>
            <input className="input" value={draft.phone} onChange={e => set("phone", e.target.value)} placeholder="512-555-…" />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input className="input" type="email" value={draft.email} onChange={e => set("email", e.target.value)} placeholder="email@…" />
          </label>
          <label className="field">
            <span className="field-label">Where met</span>
            <input className="input" value={draft.where_met} onChange={e => set("where_met", e.target.value)} placeholder="Gym floor, event…" />
          </label>
          <label className="field">
            <span className="field-label">Connection</span>
            <input className="input" value={draft.connection} onChange={e => set("connection", e.target.value)} placeholder="Referred by Jen…" />
          </label>
          <label className="field">
            <span className="field-label">Last followed up</span>
            <input className="input" type="date" value={draft.last_followed_up} onChange={e => set("last_followed_up", e.target.value)} />
          </label>
          <label className="field" style={{ gridColumn: "1/-1" }}>
            <span className="field-label">Notes</span>
            <textarea className="input" rows={3} value={draft.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Goals, schedule preferences, context…" style={{ resize: "vertical" }} />
          </label>
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</p>}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Add Prospect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible section wrapper ───────────────────────────────────────────

function RosterSection({ title, count, defaultOpen, extra, children }: {
  title: string;
  count: number;
  defaultOpen: boolean;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: "1rem" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          padding: "0.6rem 0", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "0.6rem",
          borderBottom: "1px solid var(--line)",
          marginBottom: open ? "0.75rem" : 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
        <span style={{
          background: "var(--ink)", color: "var(--paper)",
          borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700,
          padding: "0.1rem 0.5rem", lineHeight: 1.6
        }}>{count}</span>
        {extra}
        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>
          {open ? "▲ collapse" : "▼ expand"}
        </span>
      </button>
      {open && children}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ClientsClient({ clients, prospects, nextSessionStatus }: { clients: ClientRow[]; prospects: Prospect[]; nextSessionStatus: NextSessionStatus }) {
  const [showModal, setShowModal] = useState(false);
  const [, startFU] = useTransition();
  const [, startDel] = useTransition();

  const active = clients.filter((c) => c.lifecycle === "active");
  const inactive = clients.filter((c) => c.lifecycle === "inactive" || c.lifecycle === "paused");

  const needsReview = active.filter((c) => daysAgo(c.last_session_at) >= 30 && !c.next_session_at);

  function handleFollowUp(id: string) {
    const today = new Date().toISOString().split("T")[0];
    startFU(async () => { await logProspectFollowUp(id, today); });
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this prospect?")) return;
    startDel(async () => { await deleteProspect(id); });
  }

  return (
    <main className="shell">
      {showModal && <ProspectModal onClose={() => setShowModal(false)} />}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="badge">Clients</span>
          <h1 style={{ marginTop: "0.5rem" }}>Roster</h1>
          <p className="meta">
            {active.length} active · {inactive.length} inactive/paused · {prospects.length} prospects
          </p>
        </div>
      </header>

      <hr className="divider" />

      {/* ── Needs Review Banner ───────────────────────────────────── */}
      {needsReview.length > 0 && (
        <div style={{
          background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 8,
          padding: "0.75rem 1rem", marginBottom: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "center"
        }}>
          <span style={{ fontSize: "1.1rem" }}>⚠</span>
          <div>
            <strong>Needs review:</strong>{" "}
            {needsReview.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/coach/clients/${c.id}`}>{c.full_name}</Link>
              </span>
            ))}
            {" "}— no session in 30+ days and nothing scheduled.
          </div>
        </div>
      )}

      {/* ── Active Clients (expanded by default) ─────────────────── */}
      <RosterSection
        title="Active"
        count={active.length}
        defaultOpen={true}
        extra={
          <Link
            href="/signup"
            className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", marginLeft: "0.25rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            + Add
          </Link>
        }
      >
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Goal</th>
                <th>Cadence / Rate</th>
                <th>Last session</th>
                <th>Next session</th>
                <th>Sessions</th>
                <th>Program</th>
                <th>Owed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => <ActiveClientRow key={c.id} c={c} nextSessionStatus={nextSessionStatus} />)}
              {active.length === 0 && (
                <tr><td colSpan={9} className="meta" style={{ textAlign: "center", padding: "1.5rem" }}>No active clients.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </RosterSection>

      {/* ── Prospects (collapsed by default) ─────────────────────── */}
      <RosterSection
        title="Prospects"
        count={prospects.length}
        defaultOpen={false}
        extra={
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", marginLeft: "0.25rem" }}
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
          >
            + Add
          </button>
        }
      >
        {prospects.length === 0 ? (
          <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
            <p className="meta">No prospects yet.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Where met / Connection</th>
                  <th>Last follow-up</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <ProspectRow key={p.id} p={p} onFollowUp={handleFollowUp} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RosterSection>

      {/* ── Inactive / Paused (collapsed by default) ─────────────── */}
      <RosterSection
        title="Inactive / Paused"
        count={inactive.length}
        defaultOpen={false}
        extra={
          <Link
            href="/signup"
            className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", marginLeft: "0.25rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            + Add
          </Link>
        }
      >
        {inactive.length === 0 ? (
          <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
            <p className="meta">No inactive clients.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Goal</th>
                  <th>Last session</th>
                  <th>Injuries / notes</th>
                  <th>Owed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inactive.map((c) => <InactiveClientRow key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>
        )}
      </RosterSection>
    </main>
  );
}

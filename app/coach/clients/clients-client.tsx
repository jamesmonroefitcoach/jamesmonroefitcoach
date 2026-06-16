"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientRow, Prospect } from "@/lib/data";
import { pastProgramsForClient } from "@/lib/programs";
import { fmtMoney, fmtDate, fmtSessionAgo, fmtSessionAway } from "@/lib/format";
import { addProspect, activateProspect, deleteProspect, updateProspect, quickUpdateClient, type ProspectInput } from "./actions";
import type { NextSessionStatus } from "./page";
import TierBoardModal from "./tier-board-modal";
import QuickView from "./quick-view";

// ── helpers ───────────────────────────────────────────────────────────────

function daysAgo(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Parse monthly session count from frequency string for sorting.
 *  regular_frequency now stores sessions/month directly (e.g. "4"). */
function monthlyNum(c: ClientRow): number {
  const form = c.form_data?.["Sessions per month (preferred)"] ?? c.form_data?.["Sessions per month"];
  if (form) { const n = parseInt(form); if (!isNaN(n)) return n; }
  if (c.regular_frequency) { const n = parseFloat(c.regular_frequency); if (!isNaN(n)) return n; }
  return 0;
}

const TIER_ORDER: Record<string, number> = { tier_1: 1, tier_2: 2, tier_3: 3 };
const TIER_LABEL: Record<string, string> = { tier_1: "1", tier_2: "2", tier_3: "3" };

const BLANK_PROSPECT: ProspectInput = {
  full_name: "", phone: "", email: "", where_met: "", connection: "",
  last_followed_up: "", notes: "",
};

// ── sort header ──────────────────────────────────────────────────────────

type SortKey = "name" | "tier" | "rate" | "monthly" | "completed" | "scheduled" | "last" | "next" | "program" | "owed";

function SortTh({
  label, col, current, dir, onClick, style, className,
}: {
  label: React.ReactNode; col: SortKey; current: SortKey; dir: "asc" | "desc";
  onClick: (c: SortKey) => void; style?: React.CSSProperties; className?: string;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={className}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...style }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
        {label}
        <span style={{ fontSize: "0.65rem", opacity: active ? 1 : 0.3, color: active ? "var(--rust)" : undefined }}>
          {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </span>
    </th>
  );
}

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

const INPUT_SM: React.CSSProperties = {
  fontSize: "0.82rem", padding: "0.2rem 0.35rem",
  width: "100%", minWidth: 0, boxSizing: "border-box",
};
const SELECT_SM: React.CSSProperties = { ...INPUT_SM, height: "auto" };

// Program column cell — handles the +/x flag and renders the standard view
// (date range, status link) only when the client has been flagged as needing
// at-home programming. The flag is optimistic so the +/x toggle feels instant.
function ProgramCell({ client, atHomeProg, daysLeft }: {
  client: ClientRow;
  atHomeProg: ReturnType<typeof pastProgramsForClient>[number] | null;
  daysLeft: number | null;
}) {
  const [flagged, setFlagged] = useState(client.needs_at_home_programming);
  const [, startToggle] = useTransition();

  function toggle(next: boolean) {
    setFlagged(next); // optimistic
    startToggle(async () => {
      const res = await quickUpdateClient(client.id, { needs_at_home_programming: next });
      if (!res.ok) setFlagged(!next); // revert on failure
    });
  }

  if (!flagged) {
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        title="Flag this client as needing at-home programming"
        style={{
          fontSize: "0.78rem", fontWeight: 700,
          padding: "0.2rem 0.55rem", borderRadius: 3,
          border: "1px solid var(--line)", background: "transparent",
          color: "var(--muted)", cursor: "pointer", fontFamily: "inherit",
        }}
      >+</button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div className="meta" style={{ fontSize: "0.72rem" }}>
        {atHomeProg?.ends_on ? (
          <>
            {new Date(atHomeProg.ends_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" · "}
            <span style={{ color: daysLeft !== null && daysLeft <= 7 ? "var(--amber)" : undefined }}>
              {daysLeft !== null ? (daysLeft <= 0 ? "expired" : `${daysLeft}d left`) : "no end"}
            </span>
          </>
        ) : <span style={{ color: "var(--muted)" }}>No program yet</span>}
      </div>
      <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
        <Link
          href={`/coach/programming/build?tab=program&client=${client.id}`}
          style={{
            fontSize: "0.72rem", fontWeight: 600, padding: "0.15rem 0.45rem",
            borderRadius: 3, border: "1px solid var(--sage)", color: "var(--sage)",
            background: "rgba(90,107,74,0.07)", textDecoration: "none",
            whiteSpace: "nowrap", display: "inline-block",
          }}
        >{atHomeProg ? "View →" : "Build →"}</Link>
        <button
          type="button"
          onClick={() => toggle(false)}
          title="Remove the need for programming (past programs stay in historicals)"
          style={{
            fontSize: "0.68rem", lineHeight: 1,
            padding: "0.15rem 0.32rem", borderRadius: 3,
            border: "1px solid var(--line)", background: "transparent",
            color: "var(--muted)", cursor: "pointer", fontFamily: "inherit",
          }}
        >✕</button>
      </div>
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

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    tier: c.tier ?? "",
    session_rate: c.session_rate != null ? String(c.session_rate) : "",
    regular_frequency: c.regular_frequency ?? "",
  });
  const [saving, startSave] = useTransition();
  // Surfaces a failure if the server save returns ok:false. Previously
  // the result was discarded and the editor closed silently, so rate
  // changes that the server rejected (e.g. a transient RLS error)
  // looked like they saved.
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  // Monthly sessions: regular_frequency stores sessions/month; per-week is auto-calculated
  const formMonthly = c.form_data?.["Sessions per month (preferred)"] ?? c.form_data?.["Sessions per month"] ?? null;
  const coachMonthly = c.regular_frequency ? parseFloat(c.regular_frequency) : null;
  const coachPerWk = (coachMonthly != null && !isNaN(coachMonthly))
    ? `~${Math.max(1, Math.round(coachMonthly / 4.33))}×/wk`
    : null;

  function saveEdit() {
    setSaveError(null);
    // Validate parsed rate before we send.
    const parsedRate = draft.session_rate !== "" ? parseFloat(draft.session_rate) : null;
    if (parsedRate !== null && (isNaN(parsedRate) || parsedRate < 0)) {
      setSaveError("Session rate must be a non-negative number.");
      return;
    }
    startSave(async () => {
      const res = await quickUpdateClient(c.id, {
        tier: draft.tier || null,
        session_rate: parsedRate,
        regular_frequency: draft.regular_frequency || null,
      });
      if (!res.ok) {
        setSaveError(res.error ?? "Save failed — try again.");
        return;
      }
      setEditing(false);
      // Force the server component to re-fetch so the row's displayed
      // rate updates immediately instead of waiting for a manual reload.
      router.refresh();
    });
  }

  if (editing) {
    return (
      <tr style={{ background: "rgba(168,61,43,0.03)" }}>
        {/* Client — save/cancel on left, name beside them */}
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flexShrink: 0 }}>
              <button className="btn btn-primary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={saveEdit} disabled={saving}>
                {saving ? "…" : "✓"}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() => setEditing(false)} disabled={saving}>
                ✕
              </button>
            </div>
            <strong style={{ fontSize: "0.88rem" }}>{c.full_name}</strong>
          </div>
          {saveError && (
            <div style={{
              marginTop: "0.35rem",
              padding: "0.25rem 0.45rem",
              background: "rgba(192,57,43,0.08)",
              border: "1px solid var(--red)",
              color: "var(--red)",
              borderRadius: 3,
              fontSize: "0.72rem",
              maxWidth: 220,
            }}>
              ⚠ {saveError}
            </div>
          )}
        </td>
        {/* Goal — read-only */}
        <td className="meta" style={{ fontSize: "0.82rem", maxWidth: 160 }}>{c.goals ?? "—"}</td>
        {/* Tier */}
        <td>
          <select className="select" style={SELECT_SM} value={draft.tier}
            onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value }))}>
            <option value="">—</option>
            <option value="tier_1">Tier 1</option>
            <option value="tier_2">Tier 2</option>
            <option value="tier_3">Tier 3</option>
          </select>
        </td>
        {/* Session Rate */}
        <td>
          <input className="input" style={{ ...INPUT_SM, maxWidth: 70 }} type="number" min={0} step={5}
            value={draft.session_rate} placeholder="$"
            onChange={(e) => setDraft((d) => ({ ...d, session_rate: e.target.value }))} />
        </td>
        {/* Monthly Sessions — form value read-only, coach monthly freq editable */}
        <td>
          {formMonthly && <div className="meta" style={{ fontSize: "0.72rem", marginBottom: "0.2rem" }}>Form: {formMonthly}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <input className="input" style={{ ...INPUT_SM, maxWidth: 52 }}
              type="number" min={1} step={1}
              value={draft.regular_frequency} placeholder="4"
              onChange={(e) => setDraft((d) => ({ ...d, regular_frequency: e.target.value }))} />
            <span className="meta" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>/mo</span>
          </div>
        </td>
        {/* Completed this mo */}
        <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "center" }}>{c.sessions_this_month_completed}</td>
        {/* Scheduled this mo */}
        <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "center" }}>{c.sessions_this_month_scheduled}</td>
        {/* Last / Next / Program / Owed — read-only */}
        <td><LastSessionCell iso={c.last_session_at} /></td>
        <td><NextSessionCell iso={c.next_session_at} /></td>
        <td className="meta" style={{ fontSize: "0.78rem" }}>
          {atHomeProg ? atHomeProg.name : <span style={{ color: "var(--muted)" }}>No program</span>}
        </td>
        <td>{c.balance_owed > 0 ? <span className="badge badge-red">{fmtMoney(c.balance_owed)}</span> : <span className="meta">—</span>}</td>
        {/* Actions — empty while editing */}
        <td></td>
      </tr>
    );
  }

  return (
    <tr>
      {/* Client — sticky left */}
      <td className="tbl-sticky-first">
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <button
            className="btn btn-ghost"
            title="Edit"
            style={{ fontSize: "1rem", padding: "0.1rem 0.4rem", lineHeight: 1, flexShrink: 0 }}
            onClick={() => setEditing(true)}
          >✎</button>
          <div>
            <strong style={{ fontSize: "0.88rem" }}>{c.full_name}</strong>
            {c.lifecycle === "online" && (
              <><br /><span className="badge" style={{ fontSize: "0.67rem", background: "rgba(30,106,140,0.12)", color: "#1e6a8c" }}>online</span></>
            )}
            {c.requires_confirmation && (
              <><br /><span className="badge" style={{ fontSize: "0.67rem", background: "var(--amber-light, #fff8e1)", color: "#8a6200" }}>confirm</span></>
            )}
          </div>
        </div>
      </td>
      {/* Goal */}
      <td className="meta" style={{ maxWidth: 180, fontSize: "0.82rem" }}>{c.goals ?? "—"}</td>
      {/* Tier */}
      <td>
        {c.tier
          ? <span className="badge" style={{ fontSize: "0.72rem" }}>{TIER_LABEL[c.tier] ?? c.tier}</span>
          : <span className="meta">—</span>}
      </td>
      {/* Session Rate */}
      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {c.session_rate != null ? <strong>{fmtMoney(c.session_rate)}</strong> : <span className="meta">—</span>}
      </td>
      {/* Monthly Sessions */}
      <td>
        {(coachMonthly != null && !isNaN(coachMonthly))
          ? <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{coachMonthly}<span className="meta" style={{ fontWeight: 400 }}>/mo</span></div>
          : formMonthly
            ? <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{formMonthly}<span className="meta" style={{ fontWeight: 400 }}>/mo</span></div>
            : null}
        {coachPerWk
          ? <div className="meta" style={{ fontSize: "0.74rem" }}>{coachPerWk}</div>
          : (coachMonthly == null && !formMonthly ? <span className="meta">—</span> : null)}
      </td>
      {/* Completed this mo */}
      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
        <span style={{ fontWeight: c.sessions_this_month_completed > 0 ? 600 : 400, color: c.sessions_this_month_completed === 0 ? "var(--muted)" : undefined }}>
          {c.sessions_this_month_completed}
        </span>
      </td>
      {/* Scheduled this mo */}
      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
        <span style={{ fontWeight: c.sessions_this_month_scheduled > 0 ? 600 : 400, color: c.sessions_this_month_scheduled === 0 ? "var(--muted)" : undefined }}>
          {c.sessions_this_month_scheduled}
        </span>
      </td>
      {/* Last Session */}
      <td><LastSessionCell iso={c.last_session_at} /></td>
      {/* Next Session */}
      <td>
        <NextSessionCell iso={c.next_session_at} />
        {c.next_session_at && (
          <Link
            href={`/coach/programming/build?tab=session&client=${c.id}${nextStatus ? `&appt=${nextStatus.apptId}` : ""}`}
            style={{
              display: "inline-block", marginTop: "0.3rem",
              fontSize: "0.7rem", fontWeight: 600,
              padding: "0.15rem 0.45rem", borderRadius: 3,
              border: `1px solid ${nextStatus?.programmed ? "var(--sage)" : "var(--amber)"}`,
              color: nextStatus?.programmed ? "var(--sage)" : "var(--amber)",
              background: nextStatus?.programmed ? "rgba(90,107,74,0.07)" : "rgba(217,119,6,0.07)",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            {nextStatus?.programmed ? "Programmed →" : "Not Programmed →"}
          </Link>
        )}
      </td>
      {/* Program — + to flag this client as needing programming. Once flagged
          the cell shows the standard program view + a small x to clear the
          flag. Clearing does NOT erase any past program data. */}
      <td>
        <ProgramCell client={c} atHomeProg={atHomeProg} daysLeft={daysLeft} />
      </td>
      {/* Owed */}
      <td>{c.balance_owed > 0 ? <span className="badge badge-red">{fmtMoney(c.balance_owed)}</span> : <span className="meta">—</span>}</td>
      {/* Actions — sticky right */}
      <td className="tbl-sticky-last">
        <Link href={`/coach/clients/${c.id}`} style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>→</Link>
      </td>
    </tr>
  );
}

const LIFECYCLE_COLORS: Record<string, { bg: string; color: string }> = {
  inactive:    { bg: "#fce8e8", color: "var(--red)" },
  paused:      { bg: "#e8f0fe", color: "#1a56db" },
  prospective: { bg: "#fef9e7", color: "#8a6200" },
};

function InactiveClientRow({ c }: { c: ClientRow }) {
  const router = useRouter();
  const [lifecycle, setLifecycle] = useState(c.lifecycle);
  const [saving, startSave] = useTransition();

  function handleLifecycleChange(val: string) {
    setLifecycle(val as ClientRow["lifecycle"]);
    startSave(async () => {
      await quickUpdateClient(c.id, { lifecycle: val });
      // Refresh so a promotion to 'active' moves the row into the
      // active list rather than leaving it stuck in the past section.
      router.refresh();
    });
  }

  const lc = lifecycle as string;
  const colors = LIFECYCLE_COLORS[lc] ?? LIFECYCLE_COLORS.inactive;

  return (
    <tr style={{ opacity: saving ? 0.6 : 1 }}>
      <td className="tbl-sticky-first">
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <Link
            href={`/coach/clients/${c.id}`}
            className="btn btn-ghost"
            title="Open profile"
            style={{ fontSize: "1rem", padding: "0.1rem 0.4rem", lineHeight: 1, flexShrink: 0 }}
          >✎</Link>
          <strong style={{ fontSize: "0.88rem" }}>{c.full_name}</strong>
        </div>
      </td>
      <td>
        <select
          className="select"
          style={{ fontSize: "0.78rem", padding: "0.15rem 0.3rem", height: "auto",
            background: colors.bg, color: colors.color, border: "none", borderRadius: 4, fontWeight: 600 }}
          value={lifecycle}
          onChange={(e) => handleLifecycleChange(e.target.value)}
          disabled={saving}
          title="Promote to Active to move this client back into the active section"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="paused">Paused</option>
          <option value="prospective">Prospective</option>
        </select>
      </td>
      <td className="meta" style={{ fontSize: "0.82rem" }}>{c.goals ?? "—"}</td>
      <td><LastSessionCell iso={c.last_session_at} /></td>
      <td className="meta" style={{ fontSize: "0.82rem" }}>
        {c.injuries ? <span style={{ color: "var(--red)", fontSize: "0.78rem" }}>{c.injuries}</span> : "—"}
      </td>
      <td>{c.balance_owed > 0 ? <span className="badge badge-red">{fmtMoney(c.balance_owed)}</span> : <span className="meta">—</span>}</td>
      <td className="tbl-sticky-last">
        <Link href={`/coach/clients/${c.id}`} style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>→</Link>
      </td>
    </tr>
  );
}

const INLINE_INPUT: React.CSSProperties = {
  fontSize: "0.82rem", padding: "0.25rem 0.4rem",
  width: "100%", minWidth: 0, boxSizing: "border-box",
};

function ProspectRow({ p, onDelete, onSave }: {
  p: Prospect;
  onDelete: (id: string) => void;
  onSave: (id: string, data: ProspectInput) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProspectInput>({
    full_name: p.full_name ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    where_met: p.where_met ?? "",
    connection: p.connection ?? "",
    last_followed_up: p.last_followed_up ? p.last_followed_up.split("T")[0] : "",
    notes: p.notes ?? "",
  });
  const [saving, startSave] = useTransition();

  const daysSince = p.last_followed_up
    ? Math.floor((Date.now() - new Date(p.last_followed_up).getTime()) / 86400000)
    : null;

  function set(field: keyof ProspectInput, val: string) {
    setDraft((d) => ({ ...d, [field]: val }));
  }

  function save() {
    if (!draft.full_name.trim()) return;
    startSave(async () => {
      await onSave(p.id, draft);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <tr style={{ background: "var(--paper-alt, #f9f9f7)" }}>
        <td>
          <input className="input" style={INLINE_INPUT} value={draft.full_name}
            onChange={(e) => set("full_name", e.target.value)} placeholder="Full name" />
        </td>
        <td>
          <input className="input" style={{ ...INLINE_INPUT, marginBottom: "0.3rem" }}
            value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone" />
          <input className="input" style={INLINE_INPUT}
            value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="Email" />
        </td>
        <td>
          <input className="input" style={{ ...INLINE_INPUT, marginBottom: "0.3rem" }}
            value={draft.where_met} onChange={(e) => set("where_met", e.target.value)} placeholder="Where met" />
          <input className="input" style={INLINE_INPUT}
            value={draft.connection} onChange={(e) => set("connection", e.target.value)} placeholder="Connection" />
        </td>
        <td>
          <input className="input" type="date" style={INLINE_INPUT}
            value={draft.last_followed_up} onChange={(e) => set("last_followed_up", e.target.value)} />
        </td>
        <td>
          <textarea className="input" rows={2} style={{ ...INLINE_INPUT, resize: "vertical" }}
            value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes…" />
        </td>
        <td>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <button className="btn btn-primary" style={{ fontSize: "0.78rem", padding: "0.2rem 0.55rem" }}
              onClick={save} disabled={saving}>
              {saving ? "…" : "✓ Save"}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.55rem" }}
              onClick={() => setEditing(false)} disabled={saving}>
              ✕ Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="tbl-sticky-first"><strong>{p.full_name}</strong></td>
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
      <td className="tbl-sticky-last">
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <button
            className="btn btn-ghost"
            title="Edit"
            style={{ fontSize: "1rem", padding: "0.1rem 0.4rem", lineHeight: 1 }}
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
          <ActivateProspectButton id={p.id} name={p.full_name} />
          <button
            className="btn btn-ghost"
            title="Remove"
            style={{ fontSize: "1rem", padding: "0.1rem 0.4rem", lineHeight: 1, color: "var(--red)" }}
            onClick={() => onDelete(p.id)}
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  );
}

// Single-click promotion from "potential new client" to a real client
// profile. Confirms before firing because it's a destructive move —
// the prospect row goes away and a new profile is created.
function ActivateProspectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost"
      title="Activate — create a client profile from this prospect"
      style={{
        fontSize: "0.75rem",
        padding: "0.15rem 0.55rem",
        lineHeight: 1,
        color: "var(--sage)",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Convert ${name} to an active client? This creates a new profile.`)) return;
        start(async () => {
          const res = await activateProspect(id);
          if (!res.ok) { alert(res.error ?? "Failed to activate."); return; }
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "✓ activate"}
    </button>
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
      <div
        style={{
          display: "flex", alignItems: "center", gap: "0.6rem",
          borderBottom: "1px solid var(--line)",
          marginBottom: open ? "0.75rem" : 0,
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            flex: 1, textAlign: "left", background: "none", border: "none",
            padding: "0.6rem 0", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "0.6rem",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
          <span style={{
            background: "var(--ink)", color: "var(--paper)",
            borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700,
            padding: "0.1rem 0.5rem", lineHeight: 1.6
          }}>{count}</span>
          <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>
            {open ? "▲ collapse" : "▼ expand"}
          </span>
        </button>
        {extra}
      </div>
      {open && children}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ClientsClient({ clients, prospects, nextSessionStatus }: { clients: ClientRow[]; prospects: Prospect[]; nextSessionStatus: NextSessionStatus }) {
  const [showModal, setShowModal] = useState(false);
  const [tierBoardOpen, setTierBoardOpen] = useState(false);
  const [, startDel] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const active = clients.filter((c) => c.lifecycle === "active" || c.lifecycle === "online");
  const inactive = clients.filter((c) => c.lifecycle === "inactive" || c.lifecycle === "paused" || c.lifecycle === "prospective");

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortClients(list: ClientRow[]): ClientRow[] {
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":    cmp = a.full_name.localeCompare(b.full_name); break;
        case "tier":    cmp = (TIER_ORDER[a.tier ?? ""] ?? 99) - (TIER_ORDER[b.tier ?? ""] ?? 99); break;
        case "rate":    cmp = (a.session_rate ?? -1) - (b.session_rate ?? -1); break;
        case "monthly": cmp = monthlyNum(a) - monthlyNum(b); break;
        case "completed": cmp = a.sessions_this_month_completed - b.sessions_this_month_completed; break;
        case "scheduled": cmp = a.sessions_this_month_scheduled - b.sessions_this_month_scheduled; break;
        case "last":    cmp = (a.last_session_at ?? "").localeCompare(b.last_session_at ?? ""); break;
        case "next":    cmp = (a.next_session_at ?? "zzz").localeCompare(b.next_session_at ?? "zzz"); break;
        case "program": cmp = Number(a.needs_at_home_programming) - Number(b.needs_at_home_programming); break;
        case "owed":    cmp = a.balance_owed - b.balance_owed; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const needsReview = active.filter((c) => daysAgo(c.last_session_at) >= 30 && !c.next_session_at);

  function handleDelete(id: string) {
    if (!confirm("Remove this prospect?")) return;
    startDel(async () => { await deleteProspect(id); });
  }

  async function handleSave(id: string, data: ProspectInput) {
    await updateProspect(id, data);
  }

  return (
    <main className="shell">
      {showModal && <ProspectModal onClose={() => setShowModal(false)} />}
      {tierBoardOpen && <TierBoardModal clients={active} onClose={() => setTierBoardOpen(false)} />}

      <header className="page-hdr">
        <div>
          <span className="badge">Clients</span>
          <h1 style={{ marginTop: "0.5rem" }}>Roster</h1>
          <p className="meta">
            {active.length} active · {inactive.length} past · {prospects.length} potential new
          </p>
        </div>
      </header>

      <hr className="divider" />

      {/* ── Quick View dropdown ───────────────────────────────────── */}
      <QuickView clients={clients} />

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
          <>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", marginLeft: "0.25rem" }}
              onClick={(e) => { e.stopPropagation(); setTierBoardOpen(true); }}
              title="Drag clients between tiers"
            >
              ⇆ Edit Tiering
            </button>
            <Link
              href="/signup"
              className="btn btn-ghost"
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", marginLeft: "0.25rem" }}
              onClick={(e) => e.stopPropagation()}
            >
              + Add
            </Link>
          </>
        }
      >
        <div className="card roster-card">
          <div className="roster-scroll">
            <table className="table table-sticky-head">
              <thead>
                <tr>
                  <SortTh label="Client"         col="name"      current={sortKey} dir={sortDir} onClick={toggleSort} className="tbl-sticky-first" />
                  <th>Goal</th>
                  <SortTh label="Tier"           col="tier"      current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="Session Rate"   col="rate"      current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="Monthly Sess."  col="monthly"   current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="Completed"      col="completed" current={sortKey} dir={sortDir} onClick={toggleSort} style={{ textAlign: "center" }} />
                  <SortTh label="Scheduled"      col="scheduled" current={sortKey} dir={sortDir} onClick={toggleSort} style={{ textAlign: "center" }} />
                  <SortTh label="Last Session"   col="last"      current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="Next Session"   col="next"      current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="Program"        col="program"   current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="Owed"           col="owed"      current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="tbl-sticky-last"></th>
                </tr>
              </thead>
              <tbody>
                {sortClients(active).map((c) => <ActiveClientRow key={c.id} c={c} nextSessionStatus={nextSessionStatus} />)}
                {active.length === 0 && (
                  <tr><td colSpan={12} className="meta" style={{ textAlign: "center", padding: "1.5rem" }}>No active clients.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </RosterSection>

      {/* ── Past Clients (collapsed by default) ──────────────────── */}
      <RosterSection
        title="Past Clients"
        count={inactive.length}
        defaultOpen={false}
      >
        {inactive.length === 0 ? (
          <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
            <p className="meta">No past clients.</p>
          </div>
        ) : (
          <div className="card roster-card">
            <div className="roster-scroll">
              <table className="table table-sticky-head">
                <thead>
                  <tr>
                    <th className="tbl-sticky-first">Client</th>
                    <th>Status</th>
                    <th>Goal</th>
                    <th>Last session</th>
                    <th>Injuries / notes</th>
                    <th>Owed</th>
                    <th className="tbl-sticky-last"></th>
                  </tr>
                </thead>
                <tbody>
                  {inactive.map((c) => <InactiveClientRow key={c.id} c={c} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </RosterSection>

      {/* ── Potential New Clients (collapsed by default) ──────────── */}
      <RosterSection
        title="Potential New Clients"
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
            <p className="meta">No potential new clients yet.</p>
          </div>
        ) : (
          <div className="card roster-card">
            <div className="roster-scroll">
              <table className="table table-sticky-head">
                <thead>
                  <tr>
                    <th className="tbl-sticky-first">Name</th>
                    <th>Contact</th>
                    <th>Where met / Connection</th>
                    <th>Last follow-up</th>
                    <th>Notes</th>
                    <th className="tbl-sticky-last"></th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p) => (
                    <ProspectRow key={p.id} p={p} onDelete={handleDelete} onSave={handleSave} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </RosterSection>
    </main>
  );
}

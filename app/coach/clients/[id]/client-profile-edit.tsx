"use client";

import { useState, useTransition } from "react";
import type { ClientRow } from "@/lib/data";
import {
  updateCoachProfile, type CoachProfileInput,
  updateClientInfo,  type ClientInfoInput,
  setLifecycle,
} from "./actions";

// ── shared helpers ──────────────────────────────────────────────────────────

const LEVEL_OPTIONS  = ["", "Low", "Medium", "High"] as const;
const GENDER_OPTIONS = ["", "Male", "Female", "Non-binary", "Prefer not to say"] as const;

const LIFECYCLE_COLORS: Record<string, { bg: string; color: string }> = {
  active:      { bg: "rgba(90,107,74,0.12)",  color: "var(--sage)" },
  online:      { bg: "rgba(30,106,140,0.12)", color: "#1e6a8c"    },
  paused:      { bg: "#e8f0fe",               color: "#1a56db"    },
  inactive:    { bg: "#fce8e8",               color: "var(--red)" },
  prospective: { bg: "#fef9e7",               color: "#8a6200"    },
};

function fmtBirthday(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field" style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <span className="meta" style={{ fontSize: "0.74rem" }}>{label}</span>
      {children}
    </label>
  );
}

function numOrNull(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Coach Profile Card ─────────────────────────────────────────────────────

export function CoachProfileCard({ client }: { client: ClientRow }) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState<CoachProfileInput>({
    session_rate:       client.session_rate ?? null,
    trained_since_note: client.trained_since_note ?? "",
    time_window_note:   client.time_window_note ?? "",
    accountability:     client.accountability ?? "",
    education:          client.education ?? "",
    commitment:         client.commitment ?? "",
    dire_need_ranking:  client.dire_need_ranking ?? "",
  });
  const [lifecycleDraft, setLifecycleDraft] = useState(client.lifecycle);
  const [saving, startSave] = useTransition();
  const [error,  setError]  = useState<string | null>(null);

  function set<K extends keyof CoachProfileInput>(k: K, v: CoachProfileInput[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function save() {
    setError(null);
    startSave(async () => {
      const [r1, r2] = await Promise.all([
        updateCoachProfile(client.id, draft),
        lifecycleDraft !== client.lifecycle ? setLifecycle(client.id, lifecycleDraft) : Promise.resolve({ ok: true }),
      ]);
      if (!r1.ok) { setError(r1.error ?? "Save failed"); return; }
      if (!r2.ok) { setError((r2 as any).error ?? "Save failed"); return; }
      setEditing(false);
    });
  }

  const lc = client.lifecycle;
  const lcColor = LIFECYCLE_COLORS[lc] ?? LIFECYCLE_COLORS.active;

  if (!editing) {
    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1rem" }}>Coach Profile</h2>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.55rem" }}
            onClick={() => setEditing(true)}>✎ Edit</button>
        </div>
        <hr className="divider" />
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.4rem 1rem", margin: 0, alignItems: "baseline" }}>
          <dt className="meta">Status</dt>
          <dd>
            <span style={{ background: lcColor.bg, color: lcColor.color, borderRadius: 4, padding: "0.1rem 0.45rem", fontSize: "0.78rem", fontWeight: 700 }}>
              {lc}
            </span>
          </dd>
          <dt className="meta">Rate</dt>
          <dd>{client.session_rate != null ? `$${client.session_rate}/session` : "—"}</dd>
          {client.trained_since_note && (
            <><dt className="meta">Trained since</dt><dd>{client.trained_since_note}</dd></>
          )}
          {client.time_window_note && (
            <><dt className="meta">Time window</dt><dd>{client.time_window_note}</dd></>
          )}
          {(client.dire_need_ranking || client.accountability || client.education || client.commitment) && (
            <>
              <dt className="meta" style={{
                gridColumn: "1 / -1", marginTop: "0.5rem",
                fontWeight: 700, fontSize: "0.72rem",
                textTransform: "uppercase", letterSpacing: "0.07em"
              }}>Assessment</dt>
              {client.dire_need_ranking && <><dt className="meta">Dire need</dt><dd>{client.dire_need_ranking}</dd></>}
              {client.accountability    && <><dt className="meta">Accountability</dt><dd>{client.accountability}</dd></>}
              {client.education         && <><dt className="meta">Education</dt><dd>{client.education}</dd></>}
              {client.commitment        && <><dt className="meta">Commitment</dt><dd>{client.commitment}</dd></>}
            </>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1rem" }}>Coach Profile</h2>
        <span className="badge" style={{ fontSize: "0.7rem", background: "#fff8e1", color: "#8a6200" }}>editing</span>
      </div>
      <hr className="divider" />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <Field label="Status">
          <select className="select" value={lifecycleDraft} onChange={(e) => setLifecycleDraft(e.target.value as typeof lifecycleDraft)}>
            <option value="active">Active</option>
            <option value="online">Online</option>
            <option value="paused">Paused</option>
            <option value="inactive">Inactive</option>
            <option value="prospective">Prospective</option>
          </select>
        </Field>
        <Field label="Session rate ($)">
          <input className="input" type="number" value={draft.session_rate ?? ""}
            onChange={(e) => set("session_rate", numOrNull(e.target.value))} placeholder="65" />
        </Field>
        <Field label="Trained since">
          <input className="input" value={draft.trained_since_note ?? ""}
            onChange={(e) => set("trained_since_note", e.target.value)} placeholder="e.g. Feb 2025" />
        </Field>
        <Field label="Time window / deadline">
          <input className="input" value={draft.time_window_note ?? ""}
            onChange={(e) => set("time_window_note", e.target.value)} placeholder="e.g. Oct 2025" />
        </Field>

        <p className="meta" style={{ fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "0.25rem" }}>
          Assessment
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem 0.65rem" }}>
          <Field label="Dire need">
            <select className="select" value={draft.dire_need_ranking ?? ""} onChange={(e) => set("dire_need_ranking", e.target.value)}>
              {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
          <Field label="Accountability">
            <select className="select" value={draft.accountability ?? ""} onChange={(e) => set("accountability", e.target.value)}>
              {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
          <Field label="Education">
            <select className="select" value={draft.education ?? ""} onChange={(e) => set("education", e.target.value)}>
              {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
          <Field label="Commitment">
            <select className="select" value={draft.commitment ?? ""} onChange={(e) => set("commitment", e.target.value)}>
              {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-ghost" onClick={() => { setEditing(false); setError(null); }} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

// ── Client Profile Card ────────────────────────────────────────────────────

export function ClientProfileCard({ client }: { client: ClientRow }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<ClientInfoInput>({
    goals:        client.goals ?? "",
    age_category: client.age_category ?? "",
    birthday:     client.birthday ?? "",
    gender:       client.gender ?? "",
    email:        client.email ?? "",
    phone:        client.phone ?? "",
  });
  const [saving, startSave] = useTransition();
  const [error,  setError]  = useState<string | null>(null);

  function set<K extends keyof ClientInfoInput>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function save() {
    setError(null);
    startSave(async () => {
      const res = await updateClientInfo(client.id, draft);
      if (res.ok) setEditing(false);
      else setError(res.error ?? "Save failed");
    });
  }

  if (!editing) {
    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1rem" }}>Client Profile</h2>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.2rem 0.55rem" }}
            onClick={() => setEditing(true)}>✎ Edit</button>
        </div>
        <hr className="divider" />
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.4rem 1rem", margin: 0, alignItems: "baseline" }}>
          <dt className="meta">Goals</dt>
          <dd style={{ fontSize: "0.86rem" }}>{client.goals ?? "—"}</dd>
          <dt className="meta">Birthday</dt>
          <dd>{fmtBirthday(client.birthday)}</dd>
          <dt className="meta">Age</dt>
          <dd>{client.age_category ?? "—"}</dd>
          <dt className="meta">Gender</dt>
          <dd>{client.gender ?? "—"}</dd>
          <dt className="meta">Email</dt>
          <dd style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
            {client.email ? <a href={`mailto:${client.email}`} style={{ color: "var(--ink)" }}>{client.email}</a> : "—"}
          </dd>
          <dt className="meta">Phone</dt>
          <dd style={{ fontSize: "0.82rem" }}>
            {client.phone ? <a href={`tel:${client.phone}`} style={{ color: "var(--ink)" }}>{client.phone}</a> : "—"}
          </dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1rem" }}>Client Profile</h2>
        <span className="badge" style={{ fontSize: "0.7rem", background: "#fff8e1", color: "#8a6200" }}>editing</span>
      </div>
      <hr className="divider" />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <Field label="Goals">
          <textarea className="input" rows={3} style={{ resize: "vertical" }}
            value={draft.goals ?? ""} onChange={(e) => set("goals", e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem 0.65rem" }}>
          <Field label="Birthday">
            <input className="input" type="date" value={draft.birthday ?? ""}
              onChange={(e) => set("birthday", e.target.value)} />
          </Field>
          <Field label="Age / category">
            <input className="input" value={draft.age_category ?? ""}
              onChange={(e) => set("age_category", e.target.value)} placeholder="e.g. 35" />
          </Field>
          <Field label="Gender">
            <select className="select" value={draft.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
              {GENDER_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Email">
          <input className="input" type="email" value={draft.email ?? ""}
            onChange={(e) => set("email", e.target.value)} placeholder="client@email.com" />
        </Field>
        <Field label="Phone">
          <input className="input" type="tel" value={draft.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)} placeholder="512-555-0100" />
        </Field>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-ghost" onClick={() => { setEditing(false); setError(null); }} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

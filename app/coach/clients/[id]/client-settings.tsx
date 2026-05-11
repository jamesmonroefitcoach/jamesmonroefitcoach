"use client";

import { useState, useTransition } from "react";
import type { ClientRow, ReminderPrefs } from "@/lib/data";
import { saveReminderPrefs, setRequiresConfirmation, setLifecycle } from "./actions";

const OFFSET_OPTIONS: { value: number; label: string }[] = [
  { value: 2880, label: "2 days before" },
  { value: 1440, label: "1 day before" },
  { value: 240,  label: "4 hours before" },
  { value: 60,   label: "1 hour before" },
  { value: 30,   label: "30 min before" },
];

type Lifecycle = "active" | "inactive" | "paused";

export default function ClientSettings({
  client,
  reminderPrefs,
}: {
  client: ClientRow;
  reminderPrefs: ReminderPrefs;
}) {
  const [prefs, setPrefs] = useState(reminderPrefs);
  const [reqConfirm, setReqConfirm] = useState(client.requires_confirmation);
  const [lifecycle, setLifecycleState] = useState<Lifecycle>(client.lifecycle);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggleOffset(val: number) {
    setPrefs((p) => ({
      ...p,
      offsets_min: p.offsets_min.includes(val)
        ? p.offsets_min.filter((v) => v !== val)
        : [...p.offsets_min, val].sort((a, b) => b - a),
    }));
  }

  function savePrefs() {
    setSaved(null); setErr(null);
    start(async () => {
      const res = await saveReminderPrefs(client.id, {
        channel_email: prefs.channel_email,
        channel_sms: prefs.channel_sms,
        offsets_min: prefs.offsets_min,
      });
      if (res.ok) setSaved("Reminder preferences saved.");
      else setErr(res.error ?? "Failed to save.");
    });
  }

  function handleConfirmToggle(val: boolean) {
    setReqConfirm(val);
    start(async () => {
      const res = await setRequiresConfirmation(client.id, val);
      if (!res.ok) { setReqConfirm(!val); setErr(res.error ?? "Failed."); }
    });
  }

  function handleLifecycleChange(val: Lifecycle) {
    setLifecycleState(val);
    start(async () => {
      const res = await setLifecycle(client.id, val);
      if (!res.ok) { setLifecycleState(lifecycle); setErr(res.error ?? "Failed."); }
    });
  }

  return (
    <div className="card">
      <h2>Client settings</h2>
      <hr className="divider" />

      {/* Lifecycle */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.4rem" }}>Lifecycle status</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["active", "paused", "inactive"] as Lifecycle[]).map((lc) => (
            <button
              key={lc}
              className="btn"
              disabled={pending}
              onClick={() => handleLifecycleChange(lc)}
              style={{
                padding: "0.3rem 0.7rem",
                fontSize: "0.78rem",
                background: lifecycle === lc ? "var(--ink)" : "transparent",
                color: lifecycle === lc ? "var(--paper)" : undefined,
                border: `1px solid ${lifecycle === lc ? "var(--ink)" : "var(--line)"}`,
                textTransform: "capitalize",
              }}
            >
              {lc}
            </button>
          ))}
        </div>
        <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.4rem" }}>
          Inactive and paused clients appear in a separate section on the roster.
        </p>
      </div>

      {/* Requires confirmation */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.65rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={reqConfirm}
            onChange={(e) => handleConfirmToggle(e.target.checked)}
            disabled={pending}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>Requires session confirmation</div>
            <div className="meta" style={{ fontSize: "0.74rem" }}>
              When enabled, manually confirm each booking before it's locked in.
            </div>
          </div>
        </label>
      </div>

      <hr className="divider" />

      {/* Reminder preferences */}
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.75rem" }}>Session reminders</div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div className="meta" style={{ fontSize: "0.74rem", marginBottom: "0.35rem" }}>Channels</div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={prefs.channel_email}
                onChange={(e) => setPrefs((p) => ({ ...p, channel_email: e.target.checked }))}
              />
              Email
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={prefs.channel_sms}
                onChange={(e) => setPrefs((p) => ({ ...p, channel_sms: e.target.checked }))}
              />
              <span>SMS <span className="meta" style={{ fontSize: "0.72rem" }}>(coming soon)</span></span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div className="meta" style={{ fontSize: "0.74rem", marginBottom: "0.35rem" }}>Send reminder</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {OFFSET_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.offsets_min.includes(opt.value)}
                  onChange={() => toggleOffset(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button className="btn btn-primary" onClick={savePrefs} disabled={pending} style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}>
            {pending ? "Saving…" : "Save reminders"}
          </button>
          {saved && <span style={{ fontSize: "0.78rem", color: "var(--sage, #4a7c59)" }}>{saved}</span>}
        </div>
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: "0.78rem", marginTop: "0.5rem" }}>{err}</p>}
    </div>
  );
}

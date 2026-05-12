"use client";

import { useState, useTransition } from "react";
import type { HighLevelPlan } from "@/lib/data";
import { saveHighLevelPlan } from "./actions";

function perWeek(monthly: number): string {
  const pw = monthly / 4.33;
  return pw < 1 ? `~${pw.toFixed(1)}×/wk` : `~${Math.round(pw)}×/wk`;
}

export function HighLevelPlanSection({
  clientId,
  initialPlan,
  currentMonthlyFreq,
}: {
  clientId: string;
  initialPlan: HighLevelPlan | null;
  currentMonthlyFreq: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [plan, setPlan] = useState<HighLevelPlan | null>(initialPlan);
  const [editing, setEditing] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sessionsInput, setSessionsInput] = useState(
    initialPlan?.recommended_monthly_sessions?.toString() ?? ""
  );
  const [strategyInput, setStrategyInput] = useState(initialPlan?.strategy ?? "");

  const currentMonthly =
    currentMonthlyFreq && !isNaN(parseFloat(currentMonthlyFreq))
      ? parseFloat(currentMonthlyFreq)
      : null;

  function startEdit() {
    setSessionsInput(plan?.recommended_monthly_sessions?.toString() ?? "");
    setStrategyInput(plan?.strategy ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function submit() {
    setError(null);
    const sessions = sessionsInput ? parseInt(sessionsInput, 10) : null;
    startSave(async () => {
      const res = await saveHighLevelPlan(clientId, {
        recommended_monthly_sessions: sessions,
        strategy: strategyInput,
      });
      if (!res.ok) { setError(res.error ?? "Save failed"); return; }
      setPlan({
        client_id: clientId,
        recommended_monthly_sessions: sessions,
        strategy: strategyInput.trim() || null,
        updated_at: new Date().toISOString(),
      });
      setEditing(false);
    });
  }

  const showForm = editing || !plan;
  const recSessions =
    sessionsInput && !isNaN(parseInt(sessionsInput, 10))
      ? parseInt(sessionsInput, 10)
      : null;

  return (
    <div className="card">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            display: "flex", alignItems: "center", gap: "0.4rem",
          }}
        >
          <h2 style={{ fontSize: "1rem" }}>High Level Plan</h2>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", lineHeight: 1 }}>
            {open ? "▲" : "▼"}
          </span>
        </button>
        {open && !showForm && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.78rem", padding: "0.2rem 0.55rem" }}
            onClick={startEdit}
          >
            ✎ Edit
          </button>
        )}
        {open && !plan && !editing && (
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.78rem", padding: "0.2rem 0.55rem" }}
            onClick={startEdit}
          >
            + Add Plan
          </button>
        )}
      </div>

      {open && (
        <>
          <hr className="divider" />

          {showForm ? (
            /* ── Add / Edit form ──────────────────────────────── */
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Recommended sessions input */}
              <div>
                <label
                  className="stat-label"
                  style={{ display: "block", marginBottom: "0.35rem" }}
                >
                  Recommended Monthly Sessions
                </label>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem", flexWrap: "wrap" }}>
                  {/* Recommended input + per-week */}
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={30}
                        value={sessionsInput}
                        onChange={(e) => setSessionsInput(e.target.value)}
                        placeholder="4"
                        style={{ width: 72 }}
                      />
                      <span className="meta" style={{ fontSize: "0.8rem" }}>/mo</span>
                    </div>
                    <div className="meta" style={{ fontSize: "0.71rem", marginTop: "0.18rem" }}>
                      {recSessions ? perWeek(recSessions) : <span style={{ opacity: 0 }}>—</span>}
                    </div>
                  </div>

                  {/* Current schedule (greyed) */}
                  {currentMonthly != null && (
                    <div style={{ color: "var(--muted)" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                          current: {currentMonthly}
                        </span>
                        <span style={{ fontSize: "0.72rem" }}>/mo</span>
                      </div>
                      <div style={{ fontSize: "0.71rem", marginTop: "0.18rem" }}>
                        {perWeek(currentMonthly)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Strategy textarea */}
              <div>
                <label
                  className="stat-label"
                  style={{ display: "block", marginBottom: "0.35rem" }}
                >
                  Strategy
                </label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={strategyInput}
                  onChange={(e) => setStrategyInput(e.target.value)}
                  placeholder="Outline the overall training approach, priorities, key constraints…"
                  style={{ resize: "vertical" }}
                />
              </div>

              {error && (
                <p style={{ color: "var(--red)", fontSize: "0.82rem", margin: 0 }}>{error}</p>
              )}

              <div style={{
                display: "flex", gap: "0.5rem", justifyContent: "flex-end",
                paddingTop: "0.5rem", borderTop: "1px solid var(--line)",
              }}>
                {plan && (
                  <button className="btn btn-ghost" onClick={cancel} disabled={saving}>
                    Cancel
                  </button>
                )}
                <button className="btn btn-primary" onClick={submit} disabled={saving}>
                  {saving ? "Saving…" : plan ? "Save" : "Submit"}
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ────────────────────────────────────── */
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Sessions comparison */}
              <div>
                <div
                  className="stat-label"
                  style={{ marginBottom: "0.45rem" }}
                >
                  Monthly Sessions
                </div>
                <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                  {/* Recommended */}
                  <div>
                    <div style={{
                      fontSize: "0.63rem", textTransform: "uppercase",
                      letterSpacing: "0.08em", color: "var(--muted)",
                      marginBottom: "0.2rem",
                    }}>
                      Recommended
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.22rem" }}>
                      <span style={{
                        fontFamily: "var(--font-heading, Oswald, Arial Narrow, sans-serif)",
                        fontSize: "1.75rem", fontWeight: 700, lineHeight: 1,
                      }}>
                        {plan!.recommended_monthly_sessions ?? "—"}
                      </span>
                      {plan!.recommended_monthly_sessions != null && (
                        <span className="meta" style={{ fontSize: "0.78rem" }}>/mo</span>
                      )}
                    </div>
                    {plan!.recommended_monthly_sessions != null && (
                      <div className="meta" style={{ fontSize: "0.71rem", marginTop: "0.12rem" }}>
                        {perWeek(plan!.recommended_monthly_sessions)}
                      </div>
                    )}
                  </div>

                  {/* Current schedule */}
                  {currentMonthly != null && (
                    <div style={{ color: "var(--muted)" }}>
                      <div style={{
                        fontSize: "0.63rem", textTransform: "uppercase",
                        letterSpacing: "0.08em", marginBottom: "0.2rem",
                      }}>
                        Current schedule
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.22rem" }}>
                        <span style={{
                          fontFamily: "var(--font-heading, Oswald, Arial Narrow, sans-serif)",
                          fontSize: "1.75rem", fontWeight: 700, lineHeight: 1,
                        }}>
                          {currentMonthly}
                        </span>
                        <span style={{ fontSize: "0.78rem" }}>/mo</span>
                      </div>
                      <div style={{ fontSize: "0.71rem", marginTop: "0.12rem" }}>
                        {perWeek(currentMonthly)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Strategy */}
              {plan!.strategy && (
                <div>
                  <div className="stat-label" style={{ marginBottom: "0.35rem" }}>
                    Strategy
                  </div>
                  <p style={{
                    margin: 0, fontSize: "0.86rem",
                    lineHeight: 1.65, whiteSpace: "pre-wrap",
                    color: "var(--ink)",
                  }}>
                    {plan!.strategy}
                  </p>
                </div>
              )}

              {/* Updated at */}
              {plan!.updated_at && (
                <div className="meta" style={{ fontSize: "0.72rem", borderTop: "1px solid var(--line)", paddingTop: "0.5rem" }}>
                  Last updated{" "}
                  {new Date(plan!.updated_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

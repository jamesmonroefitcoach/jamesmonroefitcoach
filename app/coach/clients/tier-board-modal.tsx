"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ClientRow } from "@/lib/data";
import { quickUpdateClient } from "./actions";

type Tier = "tier_1" | "tier_2" | "tier_3" | "";
const TIERS: { key: "tier_1" | "tier_2" | "tier_3"; label: string }[] = [
  { key: "tier_1", label: "Tier 1" },
  { key: "tier_2", label: "Tier 2" },
  { key: "tier_3", label: "Tier 3" },
];

function avg(nums: number[]): number | null {
  const filtered = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function fmtRate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n)}`;
}

// ─── CVI formula display with editable (sum-to-1) weights ───────────────────
function WeightInput({ value, onChange, locked = false }: { value: number; onChange: (v: number) => void; locked?: boolean }) {
  return (
    <input
      type="number"
      min={0}
      max={1}
      step={0.05}
      value={value}
      disabled={locked}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
      }}
      style={{
        width: 52,
        fontSize: "0.72rem",
        padding: "0.12rem 0.25rem",
        border: "1px solid var(--line)",
        borderRadius: 3,
        textAlign: "center",
        background: locked ? "rgba(0,0,0,0.04)" : "#fff",
      }}
    />
  );
}

function FormulaCard() {
  // Top-level weights (must sum to 1)
  const [wFin, setWFin] = useState(0.6);
  const [wBeh, setWBeh] = useState(0.4);
  // Financial sub-weights (must sum to 1)
  const [wRate, setWRate] = useState(0.7);
  const [wSess, setWSess] = useState(0.3);
  // Behavioral sub-weights (must sum to 1)
  const [wDire, setWDire] = useState(0.3);
  const [wAcc, setWAcc] = useState(0.25);
  const [wEdu, setWEdu] = useState(0.2);
  const [wCom, setWCom] = useState(0.25);

  const topSum = +(wFin + wBeh).toFixed(2);
  const finSum = +(wRate + wSess).toFixed(2);
  const behSum = +(wDire + wAcc + wEdu + wCom).toFixed(2);

  function SumChip({ sum }: { sum: number }) {
    const ok = Math.abs(sum - 1) < 0.001;
    return (
      <span style={{
        fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.04em",
        padding: "0.05rem 0.4rem", borderRadius: 999,
        background: ok ? "rgba(90,107,74,0.12)" : "rgba(217,119,6,0.12)",
        color: ok ? "var(--sage)" : "var(--amber)",
        border: `1px solid ${ok ? "var(--sage)" : "var(--amber)"}`,
        marginLeft: "0.4rem",
      }}>Σ = {sum.toFixed(2)}</span>
    );
  }

  return (
    <div style={{ padding: "0.75rem 0.85rem", border: "1px dashed var(--line)", borderRadius: 4, background: "rgba(0,0,0,0.015)" }}>
      <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: "0.35rem" }}>
        Note: Client Value Index formula coming soon
      </div>
      <div style={{ fontSize: "0.78rem", marginBottom: "0.6rem", color: "var(--muted)" }}>
        Sample weighting (weights at each level must sum to 1):
      </div>

      {/* Top-level: Financial × Behavioral */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.55rem", fontSize: "0.82rem" }}>
        <strong>CVI =</strong>
        <WeightInput value={wFin} onChange={setWFin} />
        <span style={{ color: "var(--rust)", fontWeight: 600 }}>× Financial</span>
        <span>+</span>
        <WeightInput value={wBeh} onChange={setWBeh} />
        <span style={{ color: "var(--rust)", fontWeight: 600 }}>× Behavioral</span>
        <SumChip sum={topSum} />
      </div>

      {/* Financial subcomponents */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem", fontSize: "0.78rem", paddingLeft: "0.8rem", borderLeft: "2px solid var(--line)" }}>
        <span className="meta" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Financial =</span>
        <WeightInput value={wRate} onChange={setWRate} />
        <span>× Rate</span>
        <span>+</span>
        <WeightInput value={wSess} onChange={setWSess} />
        <span>× Sessions/Month</span>
        <SumChip sum={finSum} />
      </div>

      {/* Behavioral subcomponents */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", fontSize: "0.78rem", paddingLeft: "0.8rem", borderLeft: "2px solid var(--line)" }}>
        <span className="meta" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Behavioral =</span>
        <WeightInput value={wDire} onChange={setWDire} />
        <span>× Dire Need</span>
        <span>+</span>
        <WeightInput value={wAcc} onChange={setWAcc} />
        <span>× Accountability</span>
        <span>+</span>
        <WeightInput value={wEdu} onChange={setWEdu} />
        <span>× Education</span>
        <span>+</span>
        <WeightInput value={wCom} onChange={setWCom} />
        <span>× Commitment</span>
        <SumChip sum={behSum} />
      </div>
    </div>
  );
}

// ─── Draggable client card ─────────────────────────────────────────────────
function ClientChip({
  c,
  onDragStart,
  dragging,
}: {
  c: ClientRow;
  onDragStart: (c: ClientRow) => void;
  dragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(c)}
      style={{
        padding: "0.4rem 0.55rem",
        borderRadius: 3,
        border: "1px solid var(--line)",
        background: dragging ? "rgba(168,61,43,0.08)" : "var(--paper)",
        cursor: "grab",
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: "0.4rem",
        userSelect: "none",
      }}
      title="Drag to another tier"
    >
      <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{c.full_name}</span>
      <span className="meta" style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}>
        {c.session_rate != null ? `$${c.session_rate}` : "—"}
      </span>
    </div>
  );
}

function TierColumn({
  label, count, average, isActive, children, onDragEnter, onDragLeave, onDrop, onDragOver,
}: {
  label: string;
  count: number;
  average: number | null;
  isActive: boolean;
  children: React.ReactNode;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        borderRadius: 4,
        border: `2px ${isActive ? "dashed" : "solid"} ${isActive ? "var(--rust)" : "var(--line)"}`,
        background: isActive ? "rgba(168,61,43,0.04)" : "var(--paper)",
        padding: "0.5rem",
        display: "flex", flexDirection: "column", gap: "0.4rem",
        minHeight: 220,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: "0.35rem", borderBottom: "1px solid var(--line)" }}>
        <div>
          <span style={{ fontFamily: "var(--font-heading,Oswald)", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
          <span className="meta" style={{ marginLeft: "0.4rem", fontSize: "0.74rem" }}>{count}</span>
        </div>
        <div className="meta" style={{ fontSize: "0.7rem" }}>
          avg rate <strong style={{ color: "var(--ink)" }}>{fmtRate(average)}</strong>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>{children}</div>
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────
export default function TierBoardModal({
  clients,
  onClose,
}: {
  clients: ClientRow[];
  onClose: () => void;
}) {
  // Local copy of tier assignments — committed to server on each drop, but kept
  // in local state to drive the UI instantly.
  const [tierMap, setTierMap] = useState<Record<string, Tier>>(() => {
    const m: Record<string, Tier> = {};
    for (const c of clients) m[c.id] = (c.tier ?? "") as Tier;
    return m;
  });

  // If the parent re-renders with updated clients (e.g. after manual edit in the
  // table), sync local state to reflect the new tier values.
  useEffect(() => {
    setTierMap((prev) => {
      const next: Record<string, Tier> = { ...prev };
      let changed = false;
      for (const c of clients) {
        const incoming = (c.tier ?? "") as Tier;
        if (next[c.id] !== incoming) { next[c.id] = incoming; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [clients]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeColumn, setActiveColumn] = useState<Tier | null>(null);
  const [, startSave] = useTransition();

  function moveTo(clientId: string, tier: "tier_1" | "tier_2" | "tier_3") {
    setTierMap((m) => (m[clientId] === tier ? m : { ...m, [clientId]: tier }));
    startSave(async () => {
      await quickUpdateClient(clientId, { tier });
    });
  }

  function bucketed(tier: "tier_1" | "tier_2" | "tier_3"): ClientRow[] {
    return clients
      .filter((c) => tierMap[c.id] === tier)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  const buckets = useMemo(() => {
    return {
      tier_1: bucketed("tier_1"),
      tier_2: bucketed("tier_2"),
      tier_3: bucketed("tier_3"),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierMap, clients]);

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(23,19,17,0.45)",
        zIndex: 1100,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "min(1080px, 96vw)",
          padding: "1.1rem 1.25rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.8rem" }}>
          <div>
            <span className="badge">Tiering</span>
            <h2 style={{ margin: "0.35rem 0 0.15rem" }}>Edit Tiering</h2>
            <p className="meta" style={{ fontSize: "0.78rem", margin: 0 }}>Drag clients between columns. Saves automatically.</p>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={onClose}>✕ Close</button>
        </div>

        {/* CVI formula display */}
        <FormulaCard />

        <hr className="divider" />

        {/* 3-column tier board */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.85rem" }}>
          {TIERS.map((t) => {
            const list = buckets[t.key];
            const average = avg(list.map((c) => c.session_rate ?? 0));
            return (
              <TierColumn
                key={t.key}
                label={t.label}
                count={list.length}
                average={average}
                isActive={activeColumn === t.key}
                onDragEnter={() => setActiveColumn(t.key)}
                onDragLeave={(e) => {
                  // Only clear when leaving the column itself, not a child element
                  if (e.currentTarget === e.target) setActiveColumn(null);
                }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setActiveColumn(null);
                  if (draggingId) moveTo(draggingId, t.key);
                  setDraggingId(null);
                }}
              >
                {list.length === 0 ? (
                  <p className="meta" style={{ fontSize: "0.74rem", fontStyle: "italic", margin: "0.2rem 0" }}>Drop clients here</p>
                ) : (
                  list.map((c) => (
                    <ClientChip
                      key={c.id}
                      c={c}
                      dragging={draggingId === c.id}
                      onDragStart={(client) => setDraggingId(client.id)}
                    />
                  ))
                )}
              </TierColumn>
            );
          })}
        </div>

        {/* Untiered (clients with no tier assigned) */}
        {(() => {
          const untiered = clients
            .filter((c) => tierMap[c.id] === "")
            .sort((a, b) => a.full_name.localeCompare(b.full_name));
          if (untiered.length === 0) return null;
          return (
            <div style={{ marginTop: "1rem" }}>
              <div className="meta" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
                Untiered ({untiered.length}) — drag into a tier
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {untiered.map((c) => (
                  <ClientChip
                    key={c.id}
                    c={c}
                    dragging={draggingId === c.id}
                    onDragStart={(client) => setDraggingId(client.id)}
                  />
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

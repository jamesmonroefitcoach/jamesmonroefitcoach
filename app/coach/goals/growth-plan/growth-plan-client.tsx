"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrowthPlanBundle, GrowthPlanRow, GrowthPlanScenario, GrowthPlanClientSnapshot } from "./types";
import {
  upsertGrowthPlanRow, deleteGrowthPlanRow,
  upsertGrowthPlanScenario, deleteGrowthPlanScenario,
} from "./actions";

// ─── Date helpers ───────────────────────────────────────────────────
function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) {
    out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}
function weeksBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // Mon
  while (cursor <= to) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}
function fmtMonth(d: Date): string { return d.toLocaleDateString("en-US", { month: "short" }); }
function fmtWeek(d: Date): string { return `${d.getMonth() + 1}/${d.getDate()}`; }
function fmtUsd(n: number): string { return `$${Math.round(n).toLocaleString()}`; }
function fmtUsdc(n: number): string { return `$${Math.round(n).toLocaleString()}`; }
function fmtRate(n: number | null): string { return n == null ? "—" : `$${Math.round(n)}`; }
function fmtSpw(n: number | null): string { return n == null ? "—" : n.toFixed(1); }
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function isoDate(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Is a date `d` inside [start, end]?
function within(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

// ─── Component ──────────────────────────────────────────────────────
type Mode = "month" | "week";

export default function GrowthPlanClient({ bundle }: { bundle: GrowthPlanBundle }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("month");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showNewScenario, setShowNewScenario] = useState(false);

  function run<T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>): Promise<void> {
    return new Promise((resolve) => {
      start(async () => {
        const res = await p;
        if (!res.ok) setErr(res.error); else { setErr(null); router.refresh(); }
        resolve();
      });
    });
  }

  // Time axis: today (rounded to month start) → 2026-12-31.
  const horizon = useMemo(() => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(2026, 11, 31);
    return { from, to, months: monthsBetween(from, to), weeks: weeksBetween(from, to) };
  }, []);

  const cols = mode === "month" ? horizon.months : horizon.weeks;

  // Auto-seed rows for every client snapshot that doesn't yet have a
  // matching plan row. We keep these as in-memory rows so the user can
  // edit them; on first save we upsert a real row.
  const allRows = useMemo(() => {
    const byClient = new Map<string, GrowthPlanRow>();
    for (const r of bundle.rows) {
      if (r.client_id) byClient.set(r.client_id, r);
    }
    const synth: GrowthPlanRow[] = [];
    for (const [cid] of Object.entries(bundle.snapshots)) {
      if (byClient.has(cid)) continue;
      synth.push({
        id: `synth-${cid}`,
        coach_id: "",
        client_id: cid,
        label: null,
        tested_rate: null,
        tested_spw: null,
        blackout_start: null, blackout_end: null,
        end_date: null,
        notes: null,
        sort_order: 9999,
        created_at: new Date(0).toISOString(),
      });
    }
    return [...bundle.rows, ...synth];
  }, [bundle.rows, bundle.snapshots]);

  // Active scenario overlay — apply its changes on top of the row data
  // when computing tested values.
  const activeScenario: GrowthPlanScenario | null = useMemo(() => {
    if (!activeScenarioId) return null;
    return bundle.scenarios.find((s) => s.id === activeScenarioId) ?? null;
  }, [activeScenarioId, bundle.scenarios]);

  function resolveTested(row: GrowthPlanRow): { rate: number | null; spw: number | null; end: string | null } {
    const snap = row.client_id ? bundle.snapshots[row.client_id] : null;
    let rate = row.tested_rate ?? snap?.current_rate ?? null;
    let spw = row.tested_spw ?? snap?.current_spw ?? null;
    let end = row.end_date ?? null;
    if (activeScenario) {
      const ch = activeScenario.changes?.[row.id];
      if (ch?.rate != null) rate = ch.rate;
      if (ch?.spw != null) spw = ch.spw;
      if (ch?.end_date) end = ch.end_date;
    }
    return { rate, spw, end };
  }

  function currentWeeklyRevenue(): number {
    let sum = 0;
    for (const cid of Object.keys(bundle.snapshots)) {
      const snap = bundle.snapshots[cid];
      if (snap.current_rate == null || snap.current_spw == null) continue;
      sum += snap.current_rate * snap.current_spw;
    }
    return sum;
  }

  function testedWeeklyRevenue(): number {
    let sum = 0;
    for (const row of allRows) {
      const t = resolveTested(row);
      if (t.rate == null || t.spw == null) continue;
      sum += t.rate * t.spw;
    }
    return sum;
  }

  const currentWeekly = currentWeeklyRevenue();
  const testedWeekly = testedWeeklyRevenue();
  const testedAnnual = testedWeekly * 52;
  const delta = testedAnnual - 150_000;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {err && <p style={{ background: "rgba(192,57,43,0.08)", border: "1px solid var(--red)", padding: "0.5rem 0.7rem", fontSize: "0.78rem", color: "var(--red)" }}>{err}</p>}

      {/* Header strip: mode toggle + scenario selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
        <ModeToggle mode={mode} onChange={setMode} />
        <ScenarioPicker
          scenarios={bundle.scenarios}
          active={activeScenarioId}
          onChange={setActiveScenarioId}
          onNew={() => setShowNewScenario(true)}
        />
        <div style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)" }}>
          Showing {cols.length} {mode === "month" ? "months" : "weeks"}
        </div>
      </div>

      {/* Gantt table */}
      <GanttTable
        cols={cols}
        mode={mode}
        rows={allRows}
        bundle={bundle}
        resolveTested={resolveTested}
        onSave={(input) => run(upsertGrowthPlanRow(input))}
        onDelete={(id) => run(deleteGrowthPlanRow(id))}
        pending={pending}
      />

      {/* "+ Add potential" */}
      <AddPotentialButton onAdd={(label) => run(upsertGrowthPlanRow({ client_id: null, label, sort_order: 9000 }))} />

      {/* Summary footer */}
      <SummaryFooter
        currentWeekly={currentWeekly}
        testedWeekly={testedWeekly}
        testedAnnual={testedAnnual}
        delta={delta}
        target={bundle.weekly_target}
      />

      {/* What-if scenarios */}
      <ScenariosCard
        scenarios={bundle.scenarios}
        rows={allRows}
        snapshots={bundle.snapshots}
        target={150_000}
        showNew={showNewScenario}
        onCloseNew={() => setShowNewScenario(false)}
        onSave={(input) => run(upsertGrowthPlanScenario(input))}
        onDelete={(id) => run(deleteGrowthPlanScenario(id))}
        pending={pending}
      />
    </div>
  );
}

// ─── Mode + Scenario controls ───────────────────────────────────────
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const btn = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      style={{
        padding: "0.32rem 0.7rem",
        border: "1px solid var(--line)",
        background: mode === m ? "var(--ink)" : "var(--paper)",
        color: mode === m ? "#fff" : "var(--ink)",
        fontSize: "0.74rem",
        letterSpacing: "0.04em",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >{label}</button>
  );
  return (
    <div style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden" }}>
      {btn("month", "Month")}
      {btn("week", "Week")}
    </div>
  );
}

function ScenarioPicker({
  scenarios, active, onChange, onNew,
}: {
  scenarios: GrowthPlanScenario[];
  active: string | null;
  onChange: (id: string | null) => void;
  onNew: () => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <span style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Scenario</span>
      <select
        className="select"
        value={active ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ fontSize: "0.78rem", padding: "0.25rem 0.4rem" }}
      >
        <option value="">Base (tested values only)</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.28rem 0.6rem" }} onClick={onNew}>+ New scenario</button>
    </div>
  );
}

// ─── Gantt table ────────────────────────────────────────────────────
function GanttTable({
  cols, mode, rows, bundle, resolveTested, onSave, onDelete, pending,
}: {
  cols: Date[];
  mode: Mode;
  rows: GrowthPlanRow[];
  bundle: GrowthPlanBundle;
  resolveTested: (row: GrowthPlanRow) => { rate: number | null; spw: number | null; end: string | null };
  onSave: (input: Parameters<typeof upsertGrowthPlanRow>[0]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pending: boolean;
}) {
  const colWidth = mode === "month" ? 60 : 18;
  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <div style={{ minWidth: 720 + cols.length * colWidth }}>
        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: `170px 110px 110px 1fr`, alignItems: "stretch", borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
          <div style={hCellStyle}>Client</div>
          <div style={hCellStyle}>Current</div>
          <div style={hCellStyle}>Tested</div>
          <div style={{ position: "relative", display: "flex" }}>
            {cols.map((d, i) => (
              <div key={i} style={{
                width: colWidth, padding: "0.22rem 0.2rem", borderLeft: i === 0 ? "1px solid var(--line)" : "1px solid rgba(0,0,0,0.04)",
                fontSize: mode === "month" ? "0.62rem" : "0.52rem",
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                textAlign: "center",
                fontWeight: d.getMonth() === 0 ? 700 : 500,
                whiteSpace: "nowrap",
              }}>
                {mode === "month" ? fmtMonth(d) : fmtWeek(d)}
                {mode === "month" && d.getMonth() === 0 && (
                  <div style={{ fontSize: "0.5rem", color: "var(--ink)", fontWeight: 700 }}>{d.getFullYear()}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* rows */}
        {rows.length === 0 ? (
          <p className="meta" style={{ padding: "0.85rem", fontStyle: "italic" }}>No clients yet — once you add a client, they show up here automatically.</p>
        ) : rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            cols={cols}
            mode={mode}
            colWidth={colWidth}
            snapshot={row.client_id ? bundle.snapshots[row.client_id] : null}
            tested={resolveTested(row)}
            onSave={onSave}
            onDelete={onDelete}
            pending={pending}
          />
        ))}
      </div>
    </div>
  );
}

const hCellStyle: React.CSSProperties = {
  padding: "0.28rem 0.5rem",
  fontSize: "0.62rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--muted)",
  fontWeight: 700,
  borderRight: "1px solid var(--line)",
  background: "var(--bg)",
  display: "flex",
  alignItems: "center",
};

function Row({
  row, cols, mode, colWidth, snapshot, tested, onSave, onDelete, pending,
}: {
  row: GrowthPlanRow;
  cols: Date[];
  mode: Mode;
  colWidth: number;
  snapshot: GrowthPlanClientSnapshot | null;
  tested: { rate: number | null; spw: number | null; end: string | null };
  onSave: (input: Parameters<typeof upsertGrowthPlanRow>[0]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{
    tested_rate: string;
    tested_spw: string;
    blackout_start: string;
    blackout_end: string;
    end_date: string;
    label: string;
    notes: string;
  }>({
    tested_rate: row.tested_rate?.toString() ?? "",
    tested_spw: row.tested_spw?.toString() ?? "",
    blackout_start: row.blackout_start ?? "",
    blackout_end: row.blackout_end ?? "",
    end_date: row.end_date ?? "",
    label: row.label ?? "",
    notes: row.notes ?? "",
  });

  const name = snapshot?.full_name ?? row.label ?? "Potential client";
  const isSynth = row.id.startsWith("synth-");

  async function save() {
    await onSave({
      id: isSynth ? undefined : row.id,
      client_id: row.client_id ?? null,
      label: draft.label.trim() || null,
      tested_rate: draft.tested_rate ? Number(draft.tested_rate) : null,
      tested_spw: draft.tested_spw ? Number(draft.tested_spw) : null,
      blackout_start: draft.blackout_start || null,
      blackout_end: draft.blackout_end || null,
      end_date: draft.end_date || null,
      notes: draft.notes.trim() || null,
      sort_order: row.sort_order,
    });
    setEditing(false);
  }

  // Bar geometry: start = today's first column, end = end_date (or last col).
  const bar = useMemo(() => {
    const firstCol = cols[0];
    const lastCol = cols[cols.length - 1];
    const periodEnd = tested.end ? new Date(tested.end) : lastCol;
    const startIdx = 0;
    let endIdx = cols.length - 1;
    for (let i = cols.length - 1; i >= 0; i--) {
      if (cols[i].getTime() <= periodEnd.getTime()) { endIdx = i; break; }
    }
    const blackoutS = row.blackout_start ? new Date(row.blackout_start) : null;
    const blackoutE = row.blackout_end ? new Date(row.blackout_end) : null;
    return { startIdx, endIdx, blackoutS, blackoutE, firstCol, lastCol };
  }, [cols, tested.end, row.blackout_start, row.blackout_end]);

  const liveDelta = tested.rate != null && snapshot?.current_rate != null && tested.rate !== snapshot.current_rate
    ? tested.rate - snapshot.current_rate
    : null;

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "grid", gridTemplateColumns: `170px 110px 110px 1fr`, alignItems: "stretch", minHeight: 28 }}>
        {/* name */}
        <div style={cellStyle}>
          <strong style={{ fontSize: "0.76rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</strong>
          {snapshot?.cvi_proxy != null && (
            <span title="CVI proxy = rate × spw" style={{ fontSize: "0.58rem", color: "var(--muted)", padding: "0 4px", border: "1px solid var(--line)", borderRadius: 2 }}>
              {snapshot.cvi_proxy}
            </span>
          )}
          {snapshot?.applied_increases?.length ? (
            <span title={`${snapshot.applied_increases.length} applied rate increase${snapshot.applied_increases.length === 1 ? "" : "s"}`} style={{ fontSize: "0.58rem", color: "var(--sage)" }}>↑{snapshot.applied_increases.length}</span>
          ) : null}
          <button type="button" onClick={() => setEditing(!editing)} style={iconBtn} title={editing ? "Close" : "Edit"}>✎</button>
          {!isSynth && (
            <button type="button" onClick={() => { if (confirm(`Delete plan row for ${name}?`)) onDelete(row.id); }} style={{ ...iconBtn, color: "var(--red)" }}>×</button>
          )}
        </div>

        {/* current */}
        <div style={cellStyle}>
          <span style={{ fontSize: "0.74rem", fontWeight: 700 }}>{fmtRate(snapshot?.current_rate ?? null)}</span>
          <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>·</span>
          <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>{fmtSpw(snapshot?.current_spw ?? null)}/wk</span>
        </div>

        {/* tested */}
        <div style={cellStyle}>
          <span style={{ fontSize: "0.74rem", fontWeight: 700, color: liveDelta ? "var(--rust)" : "var(--ink)" }}>{fmtRate(tested.rate)}</span>
          <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>·</span>
          <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>{fmtSpw(tested.spw)}/wk</span>
        </div>

        {/* gantt bar lane */}
        <div style={{ position: "relative", display: "flex", borderLeft: "1px solid var(--line)" }}>
          {cols.map((d, i) => (
            <div key={i} style={{
              width: colWidth,
              borderRight: i < cols.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
              background: d.getMonth() % 2 === 0 ? "rgba(0,0,0,0.015)" : "transparent",
            }} />
          ))}
          {/* bar */}
          {(() => {
            const left = bar.startIdx * colWidth;
            const width = (bar.endIdx - bar.startIdx + 1) * colWidth;
            return (
              <div style={{
                position: "absolute",
                top: 5, bottom: 5,
                left, width,
                background: "rgba(168,61,43,0.18)",
                border: "1px solid var(--rust)",
                borderRadius: 2,
              }} />
            );
          })()}
          {/* blackout overlay */}
          {bar.blackoutS && bar.blackoutE && cols.length > 0 && (() => {
            const firstMs = bar.firstCol.getTime();
            const lastMs = bar.lastCol.getTime();
            const sMs = Math.max(firstMs, bar.blackoutS.getTime());
            const eMs = Math.min(lastMs, bar.blackoutE.getTime());
            if (eMs <= sMs) return null;
            const totalMs = lastMs - firstMs;
            const leftPct = ((sMs - firstMs) / totalMs);
            const widthPct = ((eMs - sMs) / totalMs);
            const totalWidth = cols.length * colWidth;
            return (
              <div style={{
                position: "absolute",
                top: 5, bottom: 5,
                left: leftPct * totalWidth,
                width: widthPct * totalWidth,
                background: "repeating-linear-gradient(45deg, rgba(80,80,80,0.18) 0 6px, transparent 6px 12px)",
                border: "1px dashed rgba(80,80,80,0.5)",
                borderRadius: 2,
              }} title="Blackout period" />
            );
          })()}
          {/* applied rate-increase markers */}
          {snapshot?.applied_increases?.map((inc, idx) => {
            const d = new Date(inc.date);
            const totalMs = bar.lastCol.getTime() - bar.firstCol.getTime();
            if (d.getTime() < bar.firstCol.getTime() || d.getTime() > bar.lastCol.getTime()) return null;
            const offset = ((d.getTime() - bar.firstCol.getTime()) / totalMs) * cols.length * colWidth;
            return (
              <div key={idx}
                title={`Rate raised from $${inc.from_rate} → $${inc.to_rate} on ${d.toLocaleDateString()}`}
                style={{
                  position: "absolute",
                  top: 2, bottom: 2,
                  left: offset,
                  width: 2,
                  background: "var(--sage)",
                  pointerEvents: "auto",
                }} />
            );
          })}
        </div>
      </div>

      {editing && (
        <div style={{ background: "rgba(0,0,0,0.02)", padding: "0.6rem 0.85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem", alignItems: "end", borderTop: "1px solid var(--line)" }}>
          {row.client_id == null && (
            <div>
              <label className="stat-label">Label</label>
              <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Sarah's referral" />
            </div>
          )}
          <div>
            <label className="stat-label">Tested rate</label>
            <input className="input" type="number" step="5" value={draft.tested_rate} onChange={(e) => setDraft({ ...draft, tested_rate: e.target.value })} placeholder={snapshot?.current_rate?.toString() ?? ""} />
          </div>
          <div>
            <label className="stat-label">Tested spw</label>
            <input className="input" type="number" step="0.5" value={draft.tested_spw} onChange={(e) => setDraft({ ...draft, tested_spw: e.target.value })} placeholder={snapshot?.current_spw?.toFixed(1) ?? ""} />
          </div>
          <div>
            <label className="stat-label">Blackout start</label>
            <input className="input" type="date" value={draft.blackout_start} onChange={(e) => setDraft({ ...draft, blackout_start: e.target.value })} />
          </div>
          <div>
            <label className="stat-label">Blackout end</label>
            <input className="input" type="date" value={draft.blackout_end} onChange={(e) => setDraft({ ...draft, blackout_end: e.target.value })} />
          </div>
          <div>
            <label className="stat-label">End date</label>
            <input className="input" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="stat-label">Notes</label>
            <input className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "0.22rem 0.5rem",
  borderRight: "1px solid var(--line)",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "0.35rem",
  background: "var(--paper)",
};
const iconBtn: React.CSSProperties = {
  background: "transparent", border: "none", padding: "1px 4px",
  fontSize: "0.74rem", cursor: "pointer", color: "var(--muted)",
};

// ─── Add potential ──────────────────────────────────────────────────
function AddPotentialButton({ onAdd }: { onAdd: (label: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  if (!adding) {
    return (
      <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>+ Add potential client</button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = label.trim();
        if (!v) return;
        await onAdd(v);
        setLabel("");
        setAdding(false);
      }}
      style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
    >
      <input className="input" placeholder="Label (e.g. Sarah's referral)" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus style={{ flex: "0 1 320px" }} />
      <button type="submit" className="btn btn-primary">Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setLabel(""); }}>Cancel</button>
    </form>
  );
}

// ─── Summary footer ─────────────────────────────────────────────────
function SummaryFooter({
  currentWeekly, testedWeekly, testedAnnual, delta, target,
}: {
  currentWeekly: number;
  testedWeekly: number;
  testedAnnual: number;
  delta: number;
  target: number;
}) {
  const onTarget = delta >= 0;
  return (
    <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
      <Stat label="Current weekly" value={fmtUsd(currentWeekly)} />
      <Stat label="Tested weekly" value={fmtUsd(testedWeekly)} accent={testedWeekly > currentWeekly ? "var(--sage)" : undefined} />
      <Stat label="Tested annual" value={fmtUsd(testedAnnual)} />
      <Stat
        label="Vs $150k goal"
        value={`${onTarget ? "+" : ""}${fmtUsd(Math.abs(delta))}`}
        accent={onTarget ? "var(--sage)" : "var(--rust)"}
        sub={`Need ${fmtUsd(target)} / wk`}
      />
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.66rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: accent ?? "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.66rem", color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

// ─── Scenarios card ─────────────────────────────────────────────────
function ScenariosCard({
  scenarios, rows, snapshots, target, showNew, onCloseNew, onSave, onDelete, pending,
}: {
  scenarios: GrowthPlanScenario[];
  rows: GrowthPlanRow[];
  snapshots: Record<string, GrowthPlanClientSnapshot>;
  target: number;
  showNew: boolean;
  onCloseNew: () => void;
  onSave: (input: Parameters<typeof upsertGrowthPlanScenario>[0]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pending: boolean;
}) {
  function projectedAnnual(s: GrowthPlanScenario): number {
    let weekly = 0;
    for (const row of rows) {
      const snap = row.client_id ? snapshots[row.client_id] : null;
      const ch = s.changes?.[row.id] ?? {};
      const rate = ch.rate ?? row.tested_rate ?? snap?.current_rate ?? 0;
      const spw = ch.spw ?? row.tested_spw ?? snap?.current_spw ?? 0;
      weekly += rate * spw;
    }
    return weekly * 52;
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>What-if scenarios</h2>
        <p className="meta" style={{ fontSize: "0.7rem", margin: 0 }}>
          Save a named bundle of changes (rate, spw, end-date) and switch between them with the scenario picker above.
        </p>
      </div>
      <hr className="divider" />
      {scenarios.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic", fontSize: "0.78rem" }}>No scenarios yet — create one with the + above to model a what-if.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {scenarios.map((s) => {
            const ann = projectedAnnual(s);
            const dx = ann - target;
            return (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.45rem 0.6rem", border: "1px solid var(--line)", borderRadius: 3, background: "var(--paper)" }}>
                <strong style={{ fontSize: "0.86rem", flex: 1 }}>{s.name}</strong>
                <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{fmtUsdc(ann)} annual</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: dx >= 0 ? "var(--sage)" : "var(--rust)" }}>
                  {dx >= 0 ? "+" : "−"}{fmtUsdc(Math.abs(dx))}
                </span>
                <button type="button" onClick={() => { if (confirm(`Delete scenario "${s.name}"?`)) onDelete(s.id); }} style={{ ...iconBtn, color: "var(--red)" }}>×</button>
              </li>
            );
          })}
        </ul>
      )}
      {showNew && (
        <NewScenarioForm onCancel={onCloseNew} onSave={onSave} onDone={onCloseNew} pending={pending} />
      )}
    </div>
  );
}

function NewScenarioForm({
  onCancel, onSave, onDone, pending,
}: {
  onCancel: () => void;
  onSave: (input: Parameters<typeof upsertGrowthPlanScenario>[0]) => Promise<void>;
  onDone: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSave({ name: name.trim(), notes: notes.trim() || null, changes: {} });
        setName(""); setNotes("");
        onDone();
      }}
      style={{ marginTop: "0.6rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", alignItems: "end" }}
    >
      <div>
        <label className="stat-label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aggressive raise" autoFocus />
      </div>
      <div>
        <label className="stat-label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bumps top 3 clients to $100, +1 spw" />
      </div>
      <p className="meta" style={{ gridColumn: "1 / -1", fontSize: "0.7rem", margin: 0 }}>
        Create the scenario first, then edit rows individually while it&apos;s active to record per-row overrides. (Scenario-specific row edits will land next iteration.)
      </p>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save scenario"}</button>
      </div>
    </form>
  );
}

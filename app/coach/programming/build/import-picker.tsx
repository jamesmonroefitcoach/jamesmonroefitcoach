"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  listImportableProgramsForClient,
  listClientsForImport,
  loadProgramForImport,
  type ImportableProgram,
  type ImportedProgram,
} from "./actions";

// Scope of the import — what the caller is building right now.
//   "session"        : building an in-gym session (single day). Picker filters
//                      to importable items that produce a single day. For a
//                      multi-day program, the coach picks which day to import.
//   "program-whole"  : building an at-home program. Imports the whole multi-
//                      day program in one shot. Single-day sources become a
//                      one-day program.
//   "program-day"    : building an at-home program, importing into a specific
//                      day slot. Coach picks one day from a multi-day source.
export type ImportScope = "session" | "program-whole" | "program-day";

export type ImportResult = {
  // Days the caller should consume. For session / program-day this is a
  // single-element array; for program-whole it's all of them.
  days: unknown[];
  // The source program metadata (used to populate name/dates when whole-import
  // and the destination is empty).
  source: ImportedProgram;
};

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ImportPickerModal({
  scope,
  currentClientId,
  currentClientName,
  destinationIsEmpty,
  onClose,
  onImport,
}: {
  scope: ImportScope;
  currentClientId: string;
  currentClientName: string;
  destinationIsEmpty: boolean;
  onClose: () => void;
  onImport: (result: ImportResult) => void;
}) {
  const [tab, setTab] = useState<"this" | "other">("this");
  const [otherClients, setOtherClients] = useState<{ id: string; full_name: string }[]>([]);
  const [otherClientId, setOtherClientId] = useState<string>("");
  const [programs, setPrograms] = useState<ImportableProgram[]>([]);
  const [loadingClients, startLoadClients] = useTransition();
  const [loadingProgs, startLoadProgs] = useTransition();
  const [previewProg, setPreviewProg] = useState<ImportedProgram | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportableProgram | null>(null);
  const [pendingDayIdx, setPendingDayIdx] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ program: ImportableProgram; days: unknown[]; source: ImportedProgram } | null>(null);

  // Load the "other client" picker list once when that tab is selected
  useEffect(() => {
    if (tab !== "other" || otherClients.length > 0) return;
    startLoadClients(async () => {
      const list = await listClientsForImport();
      setOtherClients(list.filter((c) => c.id !== currentClientId));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Load programs for the selected client
  const activeClientId = tab === "this" ? currentClientId : otherClientId;
  useEffect(() => {
    if (!activeClientId) { setPrograms([]); return; }
    startLoadProgs(async () => {
      const list = await listImportableProgramsForClient(activeClientId);
      setPrograms(list);
    });
  }, [activeClientId]);

  // Preview = load full program + show in scrollable popup
  function handlePreview(p: ImportableProgram) {
    startLoadProgs(async () => {
      const res = await loadProgramForImport(p.id);
      if (res.ok && res.data) setPreviewProg(res.data);
    });
  }

  // Begin import — for cross-scope cases, prompt for day selection first
  async function handleImportClick(p: ImportableProgram) {
    const res = await loadProgramForImport(p.id);
    if (!res.ok || !res.data) return;
    const source = res.data;

    if (scope === "program-whole") {
      // Take all days from the source
      confirmImport(p, source.days, source);
      return;
    }
    if (scope === "session") {
      if (source.days.length === 1) {
        confirmImport(p, source.days, source);
      } else {
        // Multi-day source → pick which day for the session
        setPendingImport(p);
        setPendingDayIdx(0);
      }
      return;
    }
    // program-day: always picks ONE day from the source
    if (source.days.length === 1) {
      confirmImport(p, source.days, source);
    } else {
      setPendingImport(p);
      setPendingDayIdx(0);
    }
  }

  function confirmDaySelection() {
    if (!pendingImport || pendingDayIdx == null) return;
    (async () => {
      const res = await loadProgramForImport(pendingImport.id);
      if (!res.ok || !res.data) return;
      const oneDay = [res.data.days[pendingDayIdx]];
      setPendingImport(null);
      setPendingDayIdx(null);
      confirmImport(pendingImport, oneDay, res.data);
    })();
  }

  function confirmImport(p: ImportableProgram, days: unknown[], source: ImportedProgram) {
    if (destinationIsEmpty) {
      onImport({ days, source });
      onClose();
    } else {
      setConfirming({ program: p, days, source });
    }
  }

  function doConfirmedImport() {
    if (!confirming) return;
    onImport({ days: confirming.days, source: confirming.source });
    setConfirming(null);
    onClose();
  }

  const scopeBlurb =
    scope === "session" ? "Building a session — pick a past session or one day of a past program to copy from."
    : scope === "program-whole" ? "Building a program — pick a past program to copy all days from."
    : "Pick a day from a past session or program to drop into this day.";

  // Filter & label items to match scope intent (we still allow any choice;
  // a multi-day source just means the coach must pick a day for session/day).
  const items = useMemo(() => programs.slice().sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return (b.starts_on ?? "").localeCompare(a.starts_on ?? "");
  }), [programs]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(720px, 96vw)", padding: "1.1rem 1.25rem", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
          <div>
            <span className="badge">Import</span>
            <h2 style={{ margin: "0.35rem 0 0.15rem" }}>
              {scope === "session" ? "Import session" : scope === "program-whole" ? "Import whole program" : "Import a day"}
            </h2>
            <p className="meta" style={{ fontSize: "0.78rem", margin: 0 }}>{scopeBlurb}</p>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={onClose}>✕ Close</button>
        </div>

        {/* Source tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 999, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setTab("this")}
              style={{
                background: tab === "this" ? "var(--rust)" : "transparent",
                color: tab === "this" ? "#fff" : "var(--muted)",
                border: "none", padding: "0.32rem 0.85rem", fontSize: "0.78rem", cursor: "pointer",
              }}
            >This client ({currentClientName})</button>
            <button
              type="button"
              onClick={() => setTab("other")}
              style={{
                background: tab === "other" ? "var(--rust)" : "transparent",
                color: tab === "other" ? "#fff" : "var(--muted)",
                border: "none", padding: "0.32rem 0.85rem", fontSize: "0.78rem", cursor: "pointer",
              }}
            >Other client</button>
          </div>
          {tab === "other" && (
            <select
              className="select"
              value={otherClientId}
              onChange={(e) => setOtherClientId(e.target.value)}
              disabled={loadingClients}
              style={{ flex: 1, maxWidth: 280, fontSize: "0.82rem" }}
            >
              <option value="">{loadingClients ? "loading…" : "— pick a client —"}</option>
              {otherClients.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          )}
        </div>

        <hr className="divider" />

        {/* Program list */}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 100 }}>
          {!activeClientId ? (
            <p className="meta">Pick a client to see their published programs.</p>
          ) : loadingProgs ? (
            <p className="meta">Loading…</p>
          ) : items.length === 0 ? (
            <p className="meta">No published programs found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {items.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: "0.55rem 0.7rem",
                    border: "1px solid var(--line)",
                    borderRadius: 4,
                    background: p.is_current ? "rgba(168,61,43,0.04)" : "var(--paper)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: "0.6rem", flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.88rem" }}>{p.name}</strong>
                      <span className="badge" style={{ fontSize: "0.6rem" }}>
                        {p.program_kind === "in_gym" ? "Session" : "Program"}
                      </span>
                      {p.is_current && <span className="badge badge-sage" style={{ fontSize: "0.6rem" }}>current</span>}
                      {!p.has_builder_state && (
                        <span className="badge badge-amber" style={{ fontSize: "0.58rem" }} title="Older program — some advanced builder state may be missing">partial</span>
                      )}
                    </div>
                    <div className="meta" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>
                      {p.day_count} day{p.day_count !== 1 ? "s" : ""} · {p.exercise_count} exercise{p.exercise_count !== 1 ? "s" : ""}
                      {p.starts_on ? ` · ${fmtShortDate(p.starts_on)}${p.ends_on ? ` → ${fmtShortDate(p.ends_on)}` : ""}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.74rem", padding: "0.25rem 0.65rem" }}
                      onClick={() => handlePreview(p)}
                    >Preview</button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: "0.74rem", padding: "0.25rem 0.65rem" }}
                      onClick={() => handleImportClick(p)}
                    >Import</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview sub-popup */}
        {previewProg && <ProgramPreview prog={previewProg} onClose={() => setPreviewProg(null)} />}

        {/* Day-selection sub-popup for cross-scope imports */}
        {pendingImport && pendingDayIdx != null && (
          <DayPicker
            program={pendingImport}
            onCancel={() => { setPendingImport(null); setPendingDayIdx(null); }}
            onConfirm={(idx) => { setPendingDayIdx(idx); confirmDaySelection(); }}
          />
        )}

        {/* Confirm replace sub-popup */}
        {confirming && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setConfirming(null)}
          >
            <div className="card" style={{ width: "min(420px, 92vw)", padding: "1.1rem 1.25rem" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Replace existing?</h3>
              <p className="meta" style={{ marginTop: "0.5rem", fontSize: "0.84rem" }}>
                This {scope === "program-whole" ? "program" : "day"} already has exercises. Importing <strong>{confirming.program.name}</strong> will replace them.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", marginTop: "0.85rem" }}>
                <button className="btn btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={doConfirmedImport}>Replace</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Program preview (scrollable plan-view-style read-only popup) ───────────
function ProgramPreview({ prog, onClose }: { prog: ImportedProgram; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.55)", zIndex: 1200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem", overflowY: "auto" }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(680px, 96vw)", maxHeight: "90vh", padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="badge">Preview</span>
            <h3 style={{ margin: "0.3rem 0 0.15rem" }}>{prog.name}</h3>
            <p className="meta" style={{ fontSize: "0.74rem", margin: 0 }}>
              {prog.program_kind === "in_gym" ? "Session" : "Program"} · {prog.days.length} day{prog.days.length !== 1 ? "s" : ""}
              {prog.starts_on ? ` · ${fmtShortDate(prog.starts_on)}${prog.ends_on ? ` → ${fmtShortDate(prog.ends_on)}` : ""}` : ""}
              {!prog.full_fidelity && <> · <span style={{ color: "var(--amber)" }}>partial fidelity (older program)</span></>}
            </p>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "0.78rem" }} onClick={onClose}>✕</button>
        </div>
        <hr className="divider" />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {prog.days.map((dRaw, di) => {
            const d = dRaw as { title?: string; items?: any[] };
            return (
              <div key={di} style={{ marginBottom: "1rem" }}>
                <h4 style={{ margin: "0 0 0.4rem", fontSize: "0.92rem" }}>{d.title ?? `Day ${di + 1}`}</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(d.items ?? []).map((it: any, ii: number) => (
                    <PreviewExercise key={ii} it={it} />
                  ))}
                  {(d.items ?? []).length === 0 && (
                    <p className="meta" style={{ fontSize: "0.74rem", margin: 0 }}>(empty)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PreviewExercise({ it }: { it: any }) {
  const setCount = it.same_format ? it.sets : Math.max(it.sets ?? 0, (it.set_rows ?? []).length);
  const metaBits: string[] = [];
  if (it.equipment_list?.length) metaBits.push(it.equipment_list.join(", "));
  if (it.equipment_specifics) metaBits.push(it.equipment_specifics);
  if (it.tempo) metaBits.push(`Tempo ${it.tempo}`);
  if (it.position) metaBits.push(`Pos ${it.position}`);
  if (it.rir != null) metaBits.push(`RIR ${it.rir}`);
  if (it.half_reps) metaBits.push(`½×${it.half_reps}`);
  if (it.rest_seconds) metaBits.push(`Rest ${it.rest_seconds}s`);
  if (it.variations?.length) metaBits.push(it.variations.join("/"));
  return (
    <div style={{ borderLeft: "3px solid var(--line)", paddingLeft: "0.6rem" }}>
      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
        {it.movement?.name ?? "Exercise"}
        {it.is_warmup && <span className="badge" style={{ marginLeft: "0.4rem", fontSize: "0.58rem" }}>Warmup</span>}
        {it.superset_id && <span className="badge badge-amber" style={{ marginLeft: "0.3rem", fontSize: "0.58rem" }}>Superset</span>}
      </div>
      {metaBits.length > 0 && (
        <div className="meta" style={{ fontSize: "0.7rem", marginTop: "0.15rem" }}>{metaBits.join(" · ")}</div>
      )}
      <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
        {setCount} × {it.same_format ? (it.reps ?? "—") : "(varies per set)"}
      </div>
      {!it.same_format && (it.set_rows ?? []).length > 0 && (
        <div style={{ marginTop: "0.2rem", fontSize: "0.7rem", color: "var(--muted)" }}>
          {(it.set_rows ?? []).map((r: any, i: number) => (
            <div key={i}>Set {i + 1}: {r.reps}{r.tempo ? ` · tempo ${r.tempo}` : ""}{r.rir != null ? ` · RIR ${r.rir}` : ""}{r.position ? ` · ${r.position}` : ""}</div>
          ))}
        </div>
      )}
      {it.notes && (
        <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.2rem", fontStyle: "italic" }}>{it.notes}</div>
      )}
    </div>
  );
}

// ─── Day picker (when importing one day from a multi-day source) ───────────
function DayPicker({
  program,
  onCancel,
  onConfirm,
}: {
  program: ImportableProgram;
  onCancel: () => void;
  onConfirm: (idx: number) => void;
}) {
  const [src, setSrc] = useState<ImportedProgram | null>(null);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    (async () => {
      const res = await loadProgramForImport(program.id);
      if (res.ok && res.data) setSrc(res.data);
    })();
  }, [program.id]);
  if (!src) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.55)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onCancel}
    >
      <div className="card" style={{ width: "min(440px, 92vw)", padding: "1.1rem 1.25rem" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Pick a day to import</h3>
        <p className="meta" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
          From <strong>{program.name}</strong>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.6rem" }}>
          {src.days.map((dRaw, idx) => {
            const d = dRaw as { title?: string; items?: any[] };
            return (
              <label
                key={idx}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.4rem 0.55rem", borderRadius: 3,
                  background: selected === idx ? "rgba(168,61,43,0.07)" : "transparent",
                  border: `1px solid ${selected === idx ? "var(--rust)" : "var(--line)"}`,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="day"
                  checked={selected === idx}
                  onChange={() => setSelected(idx)}
                  style={{ accentColor: "var(--rust)" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{d.title ?? `Day ${idx + 1}`}</div>
                  <div className="meta" style={{ fontSize: "0.68rem" }}>
                    {(d.items ?? []).length} exercise{(d.items ?? []).length !== 1 ? "s" : ""}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", marginTop: "0.85rem" }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm(selected)}>Import this day</button>
        </div>
      </div>
    </div>
  );
}

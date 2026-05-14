"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MovementRow } from "@/lib/data";
import {
  EQUIPMENT_OPTIONS, LIBRARY_HIERARCHY, MOVEMENT_LIBRARY,
  type Category, type LibraryNode, type LibraryGroup,
} from "@/lib/programs";
import { addMovement, updateMovement, archiveMovement, type MovementInput } from "./actions";
import { decodeSpecs, encodeSpecs } from "@/lib/equipment-specs";

// ── Coach-added custom categories/subcategories ──────────────────────────
// Stored in localStorage on top of the static LIBRARY_HIERARCHY. New groups
// get their own tab; new subs nest under whichever group they were added to.
// Subtle + buttons in the tab bar and section headers drive this. Until a
// proper database table exists, these are per-browser only — note shown next
// to the buttons.

type CustomExtras = {
  groups: { id: string; label: string }[];
  subs: Record<string, { id: string; label: string }[]>;
};
const CUSTOM_EXTRAS_KEY = "monroe-library-extras-v1";

function loadCustomExtras(): CustomExtras {
  if (typeof window === "undefined") return { groups: [], subs: {} };
  try {
    const raw = localStorage.getItem(CUSTOM_EXTRAS_KEY);
    return raw ? (JSON.parse(raw) as CustomExtras) : { groups: [], subs: {} };
  } catch { return { groups: [], subs: {} }; }
}
function saveCustomExtras(c: CustomExtras) {
  try { localStorage.setItem(CUSTOM_EXTRAS_KEY, JSON.stringify(c)); } catch {}
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function mergeHierarchy(extras: CustomExtras): LibraryGroup[] {
  // Static groups first, then any custom group tabs at the end. For each
  // group (static or custom), append the matching custom subs.
  const out: LibraryGroup[] = LIBRARY_HIERARCHY.map((g) => ({
    ...g,
    nodes: [
      ...g.nodes,
      ...(extras.subs[g.id] ?? []).map((s) => ({
        id: s.id, label: s.label, category: "mobility" as Category,
      })),
    ],
  }));
  for (const g of extras.groups) {
    out.push({
      id: g.id,
      label: g.label,
      nodes: (extras.subs[g.id] ?? []).map((s) => ({
        id: s.id, label: s.label, category: "mobility" as Category,
      })),
    });
  }
  return out;
}

// ── Local-preset backfill helpers ─────────────────────────────────────────────
// Mirrors the ExercisePreset shape from build-program-client.tsx so we can
// read presets the coach already saved to localStorage before the +Name flow
// began writing to the Exercise Library.
type LocalPreset = {
  id: string;
  name: string;
  movementId: string;
  sets?: number;
  reps?: string;
  exertion_score?: number;
  variations?: string[];
  equipment_list?: string[];
  equipment_specifics?: string;
  notes?: string;
};
const PRESET_KEY = "monroe-exercise-presets";

/** Look up parent-movement metadata (category + subcategory) given a movementId
 *  stored in a preset. We try, in order: the library hierarchy (where most
 *  presets originate from), the static MOVEMENT_LIBRARY demo set, and finally
 *  the Supabase movements rows passed in as props. */
function lookupParent(
  movementId: string,
  movements: MovementRow[]
): { category: Category; subcategory: string } | null {
  // 1) Library hierarchy — both nodes and their children
  for (const g of LIBRARY_HIERARCHY) {
    for (const node of g.nodes) {
      if (node.id === movementId) {
        return { category: node.category, subcategory: node.label };
      }
      for (const child of node.children ?? []) {
        if (child.id === movementId) {
          return { category: child.category, subcategory: child.label };
        }
      }
    }
  }
  // 2) Static MOVEMENT_LIBRARY (the m1..m20 demo seeds)
  const stat = MOVEMENT_LIBRARY.find((m) => m.id === movementId);
  if (stat) return { category: stat.category, subcategory: stat.subcategory || stat.name };
  // 3) Supabase rows
  const row = movements.find((m) => m.id === movementId);
  if (row) return { category: row.category as Category, subcategory: row.subcategory || row.name };
  return null;
}

function readLocalPresets(): Record<string, LocalPreset[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}") as Record<string, LocalPreset[]>;
  } catch {
    return {};
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Return all exercises whose subcategory matches a node or child label. */
function matchExercises(movements: MovementRow[], nodeLabel: string): MovementRow[] {
  const key = nodeLabel.toLowerCase();
  return movements.filter((m) => (m.subcategory ?? "").toLowerCase() === key);
}

// ── blank form ────────────────────────────────────────────────────────────────

const BLANK: MovementInput = {
  name: "", category: "push", subcategory: "",
  muscles: [], equipment_list: [], equipment_specifics: "", position: "",
  cues: "", demo_url: "",
};

function movementToInput(m: MovementRow): MovementInput {
  return {
    name: m.name,
    category: m.category as Category,
    subcategory: m.subcategory ?? "",
    muscles: m.muscles ?? [],
    equipment_list: m.equipment_list ?? [],
    equipment_specifics: m.equipment_specifics ?? "",
    position: m.position ?? "",
    cues: m.cues ?? "",
    demo_url: m.demo_url ?? "",
  };
}

// ── Exercise form ─────────────────────────────────────────────────────────────

function ExerciseForm({
  initial, defaultCategory, defaultSubcategory, mode = "quick", onSave, onCancel,
}: {
  initial?: MovementInput;
  defaultCategory?: Category;
  defaultSubcategory?: string;
  /** quick = name + equipment + specification + position (for adding new
   *  exercises). full = all fields including cues, muscles, demo URL (for
   *  editing existing exercises). */
  mode?: "quick" | "full";
  onSave: (input: MovementInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<MovementInput>(
    initial ?? { ...BLANK, category: defaultCategory ?? "push", subcategory: defaultSubcategory ?? "" }
  );
  // machineSpec and otherSpec are split out from equipment_specifics so each
  // checkbox can have its own inline input. They get re-encoded into the
  // single equipment_specifics column on submit.
  const initialSpecs = useMemo(
    () => decodeSpecs(draft.equipment_list ?? [], draft.equipment_specifics),
    // Only seed from the initial draft — subsequent edits flow through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [machineSpec, setMachineSpec] = useState(initialSpecs.machineSpec);
  const [otherSpec, setOtherSpec] = useState(initialSpecs.otherSpec);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof MovementInput>(k: K, v: MovementInput[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function submit() {
    if (!draft.name.trim()) { setError("Name is required."); return; }
    if (!draft.subcategory?.trim()) { setError("This form was opened without a library section — open it via the + Add button on the section you want to add to."); return; }
    const list = draft.equipment_list ?? [];
    if (list.includes("machine") && !machineSpec.trim()) {
      setError("Specify the machine — required when Machine is checked.");
      return;
    }
    if (list.includes("other") && !otherSpec.trim()) {
      setError("Specify the equipment — required when Other is checked.");
      return;
    }
    setError(null);
    const finalSpecs = encodeSpecs(list, machineSpec, otherSpec);
    const finalDraft: MovementInput = { ...draft, equipment_specifics: finalSpecs };
    startSave(async () => { await onSave(finalDraft); });
  }

  // Position is now multi-check. Stored as comma-separated values; one token
  // can be "incline:<angle>" to preserve the angle when Incline is selected.
  const positionRaw = (draft.position ?? "").trim();
  const positionTokens = positionRaw ? positionRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const positionsSelected = new Set(positionTokens.map((t) => t.startsWith("incline") ? "incline" : t));
  const inclineToken = positionTokens.find((t) => t.startsWith("incline"));
  const inclineAngle = inclineToken && inclineToken.includes(":") ? inclineToken.slice("incline:".length) : "";

  function setPositionTokens(next: Set<string>, angle: string) {
    const out: string[] = [];
    if (next.has("standing"))  out.push("standing");
    if (next.has("seated"))    out.push("seated");
    if (next.has("bent_over")) out.push("bent_over");
    if (next.has("kneeling"))  out.push("kneeling");
    if (next.has("incline"))   out.push(angle ? `incline:${angle}` : "incline");
    if (next.has("lying"))     out.push("lying");
    set("position", out.join(","));
  }
  function togglePosition(v: string) {
    const next = new Set(positionsSelected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setPositionTokens(next, inclineAngle);
  }

  return (
    <div style={{
      background: "rgba(168,61,43,0.03)", border: "1px solid var(--line)",
      borderRadius: 4, padding: "0.85rem 1rem", marginTop: "0.5rem",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem 1rem" }}>
        {/* Name */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Name *</span>
          <input className="input" value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Incline DB Press" autoFocus />
        </label>

        {/* Category & subcategory are implicit from the library section the
            form was opened under, so no picker is shown. */}

        {/* Equipment — inline multi-check pills. Same 8 options the program
            builder offers. Machine and Other show their inline specifics
            text fields directly under the checkbox row when toggled on. */}
        <div style={{ gridColumn: "1/-1" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Equipment</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 0.55rem", marginTop: "0.3rem" }}>
            {EQUIPMENT_OPTIONS.map((opt) => {
              const checked = (draft.equipment_list ?? []).includes(opt.value);
              return (
                <label key={opt.value} style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.2rem 0.5rem", borderRadius: 999,
                  border: `1px solid ${checked ? "var(--rust)" : "var(--line)"}`,
                  background: checked ? "rgba(168,61,43,0.06)" : "transparent",
                  cursor: "pointer", fontSize: "0.78rem",
                  fontWeight: checked ? 600 : 500,
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const list = draft.equipment_list ?? [];
                      const next = list.includes(opt.value)
                        ? list.filter((x) => x !== opt.value)
                        : [...list, opt.value];
                      set("equipment_list", next);
                    }}
                    style={{ accentColor: "var(--rust)" }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          {(draft.equipment_list ?? []).includes("machine") && (
            <div style={{ marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="meta" style={{ fontSize: "0.7rem", minWidth: 64 }}>Machine spec</span>
              <input className="input"
                value={machineSpec}
                onChange={(e) => setMachineSpec(e.target.value)}
                placeholder="e.g. Preacher curl machine"
                style={{ flex: 1, maxWidth: 320, fontSize: "0.82rem" }} />
            </div>
          )}
          {(draft.equipment_list ?? []).includes("other") && (
            <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="meta" style={{ fontSize: "0.7rem", minWidth: 64 }}>Other spec</span>
              <input className="input"
                value={otherSpec}
                onChange={(e) => setOtherSpec(e.target.value)}
                placeholder="e.g. Resistance band"
                style={{ flex: 1, maxWidth: 320, fontSize: "0.82rem" }} />
            </div>
          )}
        </div>

        {/* Position — multi-check pills. Incline checkbox exposes an angle
            input. Stored as a comma-separated string in the position column
            (e.g. "standing,incline:45"). */}
        <div style={{ gridColumn: "1/-1" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Position</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 0.55rem", marginTop: "0.3rem", alignItems: "center" }}>
            {([
              { value: "standing",  label: "Standing"  },
              { value: "seated",    label: "Seated"    },
              { value: "bent_over", label: "Bent over" },
              { value: "kneeling",  label: "Kneeling"  },
              { value: "incline",   label: "Incline"   },
              { value: "lying",     label: "Lying"     },
            ] as const).map((p) => {
              const checked = positionsSelected.has(p.value);
              return (
                <label key={p.value} style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.2rem 0.5rem", borderRadius: 999,
                  border: `1px solid ${checked ? "var(--rust)" : "var(--line)"}`,
                  background: checked ? "rgba(168,61,43,0.06)" : "transparent",
                  cursor: "pointer", fontSize: "0.78rem",
                  fontWeight: checked ? 600 : 500,
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePosition(p.value)}
                    style={{ accentColor: "var(--rust)" }}
                  />
                  {p.label}
                </label>
              );
            })}
            {positionsSelected.has("incline") && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <input className="input" type="number" min={0} max={90} placeholder="°"
                  value={inclineAngle}
                  onChange={(e) => setPositionTokens(positionsSelected, e.target.value)}
                  style={{ width: 64, fontSize: "0.8rem", padding: "0.18rem 0.32rem" }} />
                <span className="meta" style={{ fontSize: "0.7rem" }}>°</span>
              </span>
            )}
          </div>
        </div>

        {/* Muscles — full mode only */}
        {mode === "full" && (
          <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="meta" style={{ fontSize: "0.74rem" }}>Muscles (comma-separated)</span>
            <input className="input"
              value={(draft.muscles ?? []).join(", ")}
              onChange={(e) => set("muscles", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="e.g. pec_major, triceps" />
          </label>
        )}

        {/* Cues — full mode only */}
        {mode === "full" && (
          <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="meta" style={{ fontSize: "0.74rem" }}>Coaching cues</span>
            <textarea className="input" rows={2} style={{ resize: "vertical" }}
              value={draft.cues ?? ""}
              onChange={(e) => set("cues", e.target.value)}
              placeholder="Key cues or notes…" />
          </label>
        )}

        {/* Demo URL — full mode only */}
        {mode === "full" && (
          <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span className="meta" style={{ fontSize: "0.74rem" }}>Demo URL</span>
            <input className="input" type="url" value={draft.demo_url ?? ""}
              onChange={(e) => set("demo_url", e.target.value)} placeholder="https://…" />
          </label>
        )}
      </div>

      {mode === "quick" && (
        <p className="meta" style={{ fontSize: "0.72rem", marginTop: "0.6rem", fontStyle: "italic" }}>
          Cues, muscles, and demo link can be added later by editing this exercise.
        </p>
      )}

      {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.85rem", paddingTop: "0.65rem", borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

// ── Exercise dropdown row ───────────────────────────────────────────────────
// Collapsed: single-line list row with name + ▸ chevron + edit/archive.
// Expanded: a labeled field grid showing every column on the movements row,
// with "No Data" rendered for anything blank.

const NO_DATA = <span style={{ color: "var(--muted)", fontStyle: "italic", fontWeight: 400 }}>No Data</span>;

function fieldOr<T extends string | null | undefined>(v: T): React.ReactNode {
  if (v === null || v === undefined) return NO_DATA;
  const s = String(v).trim();
  return s.length === 0 ? NO_DATA : s;
}
function listFieldOr(list: string[] | null | undefined, map?: (v: string) => string): React.ReactNode {
  if (!list || list.length === 0) return NO_DATA;
  return list.map((v) => (map ? map(v) : v)).join(", ");
}

function ExerciseDropdown({ m, onEdit, onArchive }: {
  m: MovementRow;
  onEdit: () => void;
  onArchive: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Decode machine/other specifics back out for display when present
  const decoded = decodeSpecs(m.equipment_list ?? [], m.equipment_specifics);
  const equipLabel = (m.equipment_list ?? [])
    .map((e) => EQUIPMENT_OPTIONS.find((o) => o.value === e)?.label ?? e)
    .join(", ");

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      {/* Collapsed row — single line, no box, subtle icons */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.28rem 0.35rem" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent", border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: "0.4rem", flex: 1, minWidth: 0,
            fontFamily: "inherit", textAlign: "left",
          }}
        >
          <span style={{ fontSize: "0.66rem", color: "var(--muted)", width: 10, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontSize: "0.84rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
        </button>
        <div style={{ display: "flex", gap: "0.05rem", flexShrink: 0 }}>
          {m.demo_url && (
            <a href={m.demo_url} target="_blank" rel="noopener"
              style={{ fontSize: "0.7rem", padding: "0.06rem 0.22rem", color: "var(--muted)", opacity: 0.55, textDecoration: "none" }}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
              title="Open demo">▶</a>
          )}
          <button onClick={onEdit}
            style={{
              background: "transparent", border: "none", cursor: "pointer", padding: "0.06rem 0.22rem",
              color: "var(--muted)", opacity: 0.45, fontSize: "0.74rem", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.45")}
            title="Edit">✎</button>
          <button onClick={() => onArchive(m.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer", padding: "0.06rem 0.22rem",
              color: "var(--muted)", opacity: 0.4, fontSize: "0.74rem", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
            title="Archive">✕</button>
        </div>
      </div>

      {/* Expanded body — fields combined onto fewer lines, "No Data" for blanks */}
      {open && (
        <div style={{ padding: "0.3rem 1.1rem 0.55rem", fontSize: "0.78rem", lineHeight: 1.5 }}>
          {/* Line 1 — classification */}
          <FieldRow>
            <Field label="Category" value={fieldOr(m.category)} />
            <Field label="Subcategory" value={fieldOr(m.subcategory)} />
            <Field label="Core" value={m.is_core ? "Yes" : "No"} />
          </FieldRow>
          {/* Line 2 — equipment + specifications */}
          <FieldRow>
            <Field label="Equipment" value={equipLabel || NO_DATA} />
            <Field label="Machine" value={fieldOr(decoded.machineSpec)} />
            <Field label="Other" value={fieldOr(decoded.otherSpec)} />
          </FieldRow>
          {/* Line 3 — position + muscles */}
          <FieldRow>
            <Field label="Position" value={fieldOr(m.position)} />
            <Field label="Muscles" value={listFieldOr(m.muscles)} />
          </FieldRow>
          {/* Line 4 — cues span full width */}
          <FieldRow>
            <Field label="Cues" value={m.cues ? <em>{m.cues}</em> : NO_DATA} fullWidth />
          </FieldRow>
          {/* Line 5 — demo + added */}
          <FieldRow>
            <Field label="Demo" value={m.demo_url
              ? <a href={m.demo_url} target="_blank" rel="noopener" style={{ color: "var(--rust)", wordBreak: "break-all" }}>{m.demo_url}</a>
              : NO_DATA} fullWidth />
          </FieldRow>
          <FieldRow>
            <Field label="Added" value={m.created_at
              ? new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : NO_DATA} />
          </FieldRow>
        </div>
      )}
    </div>
  );
}

// ─── Compact field components for the expanded summary ──────────────────
function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.15rem 1.2rem", marginBottom: "0.18rem" }}>
      {children}
    </div>
  );
}
function Field({ label, value, fullWidth }: { label: string; value: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{ minWidth: fullWidth ? "100%" : undefined }}>
      <span style={{ color: "var(--muted)", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: "0.35rem" }}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

// ── Node section (leaf level) ─────────────────────────────────────────────────

function NodeSection({
  node, movements, isChild, searchActive,
}: {
  node: LibraryNode;
  movements: MovementRow[];
  isChild?: boolean;
  searchActive: boolean;
}) {
  const exercises = useMemo(() => matchExercises(movements, node.label), [movements, node.label]);
  const [open, setOpen] = useState(searchActive || exercises.length > 0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [, startArchive] = useTransition();

  // keep open when search activates
  const isOpen = open || searchActive;

  async function handleAdd(input: MovementInput) {
    const res = await addMovement(input);
    if (res.ok) setAdding(false);
  }

  async function handleUpdate(id: string, input: MovementInput) {
    await updateMovement(id, input);
    setEditingId(null);
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this exercise?")) return;
    startArchive(async () => { await archiveMovement(id); });
  }

  // If this node has children (e.g. "Ab"), render them as sub-nodes
  if (node.children && node.children.length > 0) {
    return (
      <div style={{ marginLeft: isChild ? "1rem" : 0, marginBottom: "0.15rem" }}>
        {/* Node header with expand toggle */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: isChild ? "0.3rem 0" : "0.4rem 0",
        }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "0.45rem" }}
          >
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", width: 10 }}>{isOpen ? "▾" : "▸"}</span>
            <span style={{ fontWeight: 600, fontSize: isChild ? "0.84rem" : "0.92rem" }}>{node.label}</span>
          </button>
          {exercises.length > 0 && (
            <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{exercises.length}</span>
          )}
        </div>
        {isOpen && (
          <div style={{ marginLeft: "1.1rem" }}>
            {/* Exercises at parent node level */}
            {exercises.map((m) => (
              editingId === m.id
                ? <ExerciseForm key={m.id} initial={movementToInput(m)}
                    onSave={(input) => handleUpdate(m.id, input)}
                    onCancel={() => setEditingId(null)} />
                : <ExerciseDropdown key={m.id} m={m}
                    onEdit={() => { setEditingId(m.id); setAdding(false); }}
                    onArchive={handleArchive} />
            ))}
            {/* Child sub-nodes */}
            {node.children.map((child) => (
              <NodeSection
                key={child.id}
                node={{ ...child, children: undefined }}
                movements={movements}
                isChild
                searchActive={searchActive}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf node — show [+] Add button inline when no exercises, or as a button when open
  return (
    <div style={{ marginBottom: "0.15rem", marginLeft: isChild ? "1rem" : 0 }}>
      {/* Row: toggle + node label + count + Add button */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0" }}>
        {exercises.length > 0 ? (
          <button
            onClick={() => setOpen((o) => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "0.45rem", flex: 1, minWidth: 0 }}
          >
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", width: 10, flexShrink: 0 }}>{isOpen ? "▾" : "▸"}</span>
            <span style={{ fontWeight: 600, fontSize: isChild ? "0.84rem" : "0.92rem" }}>{node.label}</span>
            <span style={{ fontSize: "0.67rem", color: "var(--muted)", fontWeight: 400 }}>{exercises.length}</span>
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.7rem", color: "var(--line)", width: 10, flexShrink: 0 }}>—</span>
            <span style={{ fontWeight: 600, fontSize: isChild ? "0.84rem" : "0.92rem", color: "var(--muted)" }}>{node.label}</span>
            <span className="meta" style={{ fontSize: "0.7rem" }}>empty</span>
          </div>
        )}
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.7rem", padding: "0.12rem 0.45rem", flexShrink: 0 }}
          onClick={() => { setOpen(true); setAdding(true); setEditingId(null); }}
        >+ Add</button>
      </div>

      {/* Exercise list + add form when open */}
      {(isOpen || adding) && (
        <div style={{ marginLeft: "1.1rem" }}>
          {exercises.map((m) => (
            editingId === m.id
              ? <ExerciseForm key={m.id} initial={movementToInput(m)}
                  mode="full"
                  onSave={(input) => handleUpdate(m.id, input)}
                  onCancel={() => setEditingId(null)} />
              : <ExerciseDropdown key={m.id} m={m}
                  onEdit={() => { setEditingId(m.id); setAdding(false); }}
                  onArchive={handleArchive} />
          ))}
          {adding && (
            <ExerciseForm
              defaultCategory={node.category}
              defaultSubcategory={node.label}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExerciseLibraryClient({ movements }: { movements: MovementRow[] }) {
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const router = useRouter();
  // Active file tab — each LIBRARY_HIERARCHY group is one tab. Coach-added
  // custom categories live in localStorage and merge on top of the static
  // tree below.
  const [activeGroupId, setActiveGroupId] = useState<string>(LIBRARY_HIERARCHY[0]?.id ?? "");
  const [customExtras, setCustomExtras] = useState<CustomExtras>({ groups: [], subs: {} });
  useEffect(() => { setCustomExtras(loadCustomExtras()); }, []);

  // Effective hierarchy = static LIBRARY_HIERARCHY ⊕ localStorage extras.
  const fullHierarchy = useMemo(() => mergeHierarchy(customExtras), [customExtras]);

  function addCustomGroup(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const id = `cust-grp-${slug(trimmed)}-${Date.now().toString(36)}`;
    const next: CustomExtras = {
      ...customExtras,
      groups: [...customExtras.groups, { id, label }],
    };
    setCustomExtras(next);
    saveCustomExtras(next);
    setActiveGroupId(id);
  }
  function addCustomSub(groupId: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const id = `cust-sub-${slug(trimmed)}-${Date.now().toString(36)}`;
    const next: CustomExtras = {
      ...customExtras,
      subs: {
        ...customExtras.subs,
        [groupId]: [...(customExtras.subs[groupId] ?? []), { id, label }],
      },
    };
    setCustomExtras(next);
    saveCustomExtras(next);
  }

  // Count of presets sitting in localStorage but not yet in the database. Drives
  // the "Import N saved presets" button so coaches know there's work to do.
  const pendingImportCount = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const all = readLocalPresets();
    const existingKeys = new Set(
      movements.map((m) => `${m.name.trim().toLowerCase()}::${(m.subcategory ?? "").trim().toLowerCase()}`)
    );
    let n = 0;
    for (const [movementId, list] of Object.entries(all)) {
      const parent = lookupParent(movementId, movements);
      if (!parent) continue;
      for (const p of list) {
        const key = `${p.name.trim().toLowerCase()}::${parent.subcategory.trim().toLowerCase()}`;
        if (!existingKeys.has(key)) n++;
      }
    }
    return n;
  }, [movements]);

  async function importLocalPresets() {
    if (importing) return;
    const all = readLocalPresets();
    const existingKeys = new Set(
      movements.map((m) => `${m.name.trim().toLowerCase()}::${(m.subcategory ?? "").trim().toLowerCase()}`)
    );
    const queue: { name: string; parent: { category: Category; subcategory: string }; preset: LocalPreset }[] = [];
    const unmatched: string[] = [];
    for (const [movementId, list] of Object.entries(all)) {
      const parent = lookupParent(movementId, movements);
      if (!parent) {
        for (const p of list) unmatched.push(p.name);
        continue;
      }
      for (const p of list) {
        const key = `${p.name.trim().toLowerCase()}::${parent.subcategory.trim().toLowerCase()}`;
        if (existingKeys.has(key)) continue;
        queue.push({ name: p.name, parent, preset: p });
        existingKeys.add(key);
      }
    }
    if (queue.length === 0) {
      alert(unmatched.length
        ? `Nothing new to import. ${unmatched.length} preset(s) couldn't be matched to a library node and were skipped: ${unmatched.join(", ")}`
        : "All saved presets are already in the Exercise Library.");
      return;
    }
    if (!confirm(`Import ${queue.length} preset${queue.length === 1 ? "" : "s"} into the Exercise Library?`)) return;

    setImporting(true);
    let ok = 0;
    const errors: string[] = [];
    for (const item of queue) {
      try {
        const res = await addMovement({
          name: item.name,
          category: item.parent.category,
          subcategory: item.parent.subcategory,
          muscles: [],
          equipment_list: (item.preset.equipment_list ?? []) as string[],
          equipment_specifics: item.preset.equipment_specifics,
          position: undefined,
          cues: "",
          demo_url: "",
        });
        if (res.ok) ok++;
        else errors.push(`${item.name}: ${res.error ?? "unknown error"}`);
      } catch (e) {
        errors.push(`${item.name}: ${(e as Error).message}`);
      }
    }
    setImporting(false);
    const lines = [`Imported ${ok} of ${queue.length} preset${queue.length === 1 ? "" : "s"}.`];
    if (unmatched.length) lines.push(`Skipped (no library match): ${unmatched.join(", ")}`);
    if (errors.length) lines.push(`Errors:\n${errors.join("\n")}`);
    alert(lines.join("\n\n"));
    if (ok > 0) router.refresh();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return movements;
    const q = search.toLowerCase();
    return movements.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.subcategory?.toLowerCase().includes(q) ||
      m.muscles?.some((x) => x.toLowerCase().includes(q)) ||
      m.cues?.toLowerCase().includes(q)
    );
  }, [movements, search]);

  const searchActive = !!search.trim();

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="page-hdr">
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Exercise Library</h1>
          <p className="meta">{movements.length} exercises — use the + Add button on any section to add an exercise to that group.</p>
        </div>
        {pendingImportCount > 0 && (
          <button
            className="btn btn-ghost"
            onClick={importLocalPresets}
            disabled={importing}
            title="Import named presets saved on this browser into the Exercise Library"
          >
            {importing ? "Importing…" : `Import ${pendingImportCount} saved preset${pendingImportCount === 1 ? "" : "s"}`}
          </button>
        )}
      </header>

      <hr className="divider" />

      {/* Search */}
      <div style={{ marginBottom: "1.25rem" }}>
        <input
          className="input"
          placeholder="Search exercises, muscles, cues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 380 }}
        />
      </div>

      {/* File tabs — one per group, side by side. Active tab gets a rust
          bottom border; inactive ones sit flush so the active tab "files"
          into the body below. A subtle + at the end opens an inline input
          for adding a new category tab (persisted in localStorage). */}
      <div
        className="no-print"
        style={{
          display: "flex", gap: 0, borderBottom: "2px solid var(--rust)",
          marginBottom: "1.1rem", flexWrap: "wrap", alignItems: "flex-end",
        }}
      >
        {fullHierarchy.map((g) => {
          const allLabels = g.nodes.flatMap((n) => [n.label, ...(n.children?.map((c) => c.label) ?? [])]);
          const total = filtered.filter((m) => allLabels.some((l) => (m.subcategory ?? "").toLowerCase() === l.toLowerCase())).length;
          const isActive = activeGroupId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroupId(g.id)}
              style={{
                padding: "0.5rem 1.1rem",
                fontSize: "0.92rem",
                fontFamily: "inherit", cursor: "pointer",
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "var(--rust)" : "var(--muted)",
                background: isActive ? "var(--paper)" : "transparent",
                border: isActive ? "1px solid var(--rust)" : "1px solid transparent",
                borderBottom: isActive ? "1px solid var(--paper)" : "1px solid var(--rust)",
                marginBottom: -2,
                borderTopLeftRadius: 4, borderTopRightRadius: 4,
                display: "flex", alignItems: "center", gap: "0.45rem",
              }}
            >
              {g.label}
              {total > 0 && (
                <span style={{
                  background: isActive ? "var(--rust)" : "rgba(0,0,0,0.08)",
                  color: isActive ? "var(--paper)" : "var(--muted)",
                  borderRadius: 999, fontSize: "0.62rem", fontWeight: 700,
                  padding: "0.06rem 0.4rem", lineHeight: 1.5,
                }}>{total}</span>
              )}
            </button>
          );
        })}
        <AddInlineButton
          title="Add a new category tab (saved in this browser only)"
          placeholder="Category name…"
          onSubmit={(name) => addCustomGroup(name)}
        />
      </div>

      {/* When a search is active, show a flat list of all matches across
          every group. Otherwise just render the active tab's group. */}
      {searchActive ? (
        filtered.length === 0 ? (
          <p className="meta" style={{ textAlign: "center", padding: "2rem 0" }}>
            No exercises match &quot;{search}&quot;.
          </p>
        ) : (
          <div>
            {filtered.map((m) => (
              <ExerciseDropdown
                key={m.id}
                m={m}
                onEdit={() => {/* search-view edit not wired — clear search to edit */}}
                onArchive={async (id) => {
                  if (!confirm("Archive this exercise?")) return;
                  await archiveMovement(id);
                  router.refresh();
                }}
              />
            ))}
          </div>
        )
      ) : (
        (() => {
          const activeGroup = fullHierarchy.find((g) => g.id === activeGroupId) ?? fullHierarchy[0];
          if (!activeGroup) return null;
          return (
            <div>
              {/* Subcategories laid out as side-by-side columns. Each column
                  is its own NodeSection — exercises stack vertically inside
                  the column. Auto-fit keeps the columns sized sensibly as
                  the viewport changes. */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "0.85rem 1rem",
                alignItems: "start",
              }}>
                {activeGroup.nodes.map((node) => (
                  <div key={node.id} style={{ minWidth: 0 }}>
                    <NodeSection
                      node={node}
                      movements={filtered}
                      searchActive={false}
                    />
                  </div>
                ))}
              </div>
              {/* Subtle + for adding a new subcategory under this tab. */}
              <div style={{ marginTop: "0.85rem", paddingTop: "0.5rem", borderTop: "1px dashed var(--line)", display: "flex" }}>
                <AddInlineButton
                  title="Add a new subcategory under this tab (saved in this browser only)"
                  placeholder="Subcategory name…"
                  onSubmit={(name) => addCustomSub(activeGroup.id, name)}
                  label="+ Add subcategory"
                />
              </div>
            </div>
          );
        })()
      )}
    </main>
  );
}

// ─── Subtle + button + inline input ─────────────────────────────────────
// Used both in the tab bar (for adding a new top-level category) and at the
// bottom of the active tab (for adding a new subcategory).
function AddInlineButton({
  title, placeholder, onSubmit, label = "+",
}: {
  title: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  function submit() {
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
    setOpen(false);
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--muted)", fontSize: "0.82rem", fontFamily: "inherit",
          padding: "0.45rem 0.55rem", opacity: 0.55,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
      >{label}</button>
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.3rem",
      padding: "0.32rem 0.45rem",
      background: "var(--paper)",
      border: "1px solid var(--rust)",
      borderTopLeftRadius: 4, borderTopRightRadius: 4,
      marginBottom: -2,
    }}>
      <input
        autoFocus
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setOpen(false); setValue(""); }
        }}
        style={{ fontSize: "0.78rem", padding: "0.16rem 0.32rem", maxWidth: 200 }}
      />
      <button type="button" onClick={submit} disabled={!value.trim()} className="btn btn-primary"
        style={{ fontSize: "0.7rem", padding: "0.12rem 0.45rem" }}>Save</button>
      <button type="button" onClick={() => { setOpen(false); setValue(""); }} className="btn btn-ghost"
        style={{ fontSize: "0.7rem", padding: "0.12rem 0.32rem" }}>✕</button>
    </div>
  );
}

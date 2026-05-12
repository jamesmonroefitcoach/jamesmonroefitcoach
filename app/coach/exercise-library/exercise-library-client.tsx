"use client";

import { useState, useTransition, useMemo } from "react";
import type { MovementRow } from "@/lib/data";
import {
  CATEGORY_LABELS, EQUIPMENT_OPTIONS, LIBRARY_HIERARCHY,
  type Category,
} from "@/lib/programs";
import { addMovement, updateMovement, archiveMovement, type MovementInput } from "./actions";

// ── constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

// Map each category to the LIBRARY_HIERARCHY group it lives under
const CAT_TO_GROUP: Record<string, string> = {
  push: "upper", pull: "upper", shoulder: "accessory",
  arm_accessory: "accessory", core: "middle", hinge: "lower",
  squat: "lower", leg_accessory: "lower", cardio: "cardio", mobility: "mobility",
};

// Build subcategory suggestions from the hierarchy per category
function subSuggestionsFor(cat: Category): string[] {
  const groupId = CAT_TO_GROUP[cat];
  const group = LIBRARY_HIERARCHY.find((g) => g.id === groupId);
  if (!group) return [];
  return group.nodes
    .filter((n) => n.category === cat || cat === "push" || cat === "pull" || cat === "shoulder")
    .map((n) => n.label);
}

// All nodes from the hierarchy, flat, as subcategory suggestions
const ALL_NODES = LIBRARY_HIERARCHY.flatMap((g) =>
  g.nodes.map((n) => ({ groupLabel: g.label, nodeLabel: n.label, nodeId: n.id, category: n.category }))
);

// ── blank form ────────────────────────────────────────────────────────────────

const BLANK: MovementInput = {
  name: "", category: "push", subcategory: "",
  muscles: [], equipment_list: [], equipment_specifics: "",
  cues: "", demo_url: "", is_core: false,
};

function movementToInput(m: MovementRow): MovementInput {
  return {
    name: m.name,
    category: m.category as Category,
    subcategory: m.subcategory ?? "",
    muscles: m.muscles ?? [],
    equipment_list: m.equipment_list ?? [],
    equipment_specifics: m.equipment_specifics ?? "",
    cues: m.cues ?? "",
    demo_url: m.demo_url ?? "",
    is_core: m.is_core,
  };
}

// ── Exercise form ─────────────────────────────────────────────────────────────

function ExerciseForm({
  initial,
  defaultCategory,
  defaultSubcategory,
  onSave,
  onCancel,
}: {
  initial?: MovementInput;
  defaultCategory?: Category;
  defaultSubcategory?: string;
  onSave: (input: MovementInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<MovementInput>(
    initial ?? { ...BLANK, category: defaultCategory ?? "push", subcategory: defaultSubcategory ?? "" }
  );
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof MovementInput>(k: K, v: MovementInput[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function toggleEquip(val: string) {
    setDraft((d) => {
      const list = d.equipment_list ?? [];
      return { ...d, equipment_list: list.includes(val) ? list.filter((x) => x !== val) : [...list, val] };
    });
  }

  function submit() {
    if (!draft.name.trim()) { setError("Name is required."); return; }
    setError(null);
    startSave(async () => {
      await onSave(draft);
    });
  }

  const needsSpecifics = (draft.equipment_list ?? []).some((e) => {
    const opt = EQUIPMENT_OPTIONS.find((o) => o.value === e);
    return opt?.allowsSpecifics;
  });

  // Subcategory suggestions based on selected category
  const nodeSuggestions = ALL_NODES.filter((n) => {
    if (draft.category === "push" || draft.category === "pull") return n.category === draft.category;
    if (draft.category === "shoulder" || draft.category === "arm_accessory") return CAT_TO_GROUP[draft.category] === "accessory";
    if (draft.category === "hinge" || draft.category === "squat" || draft.category === "leg_accessory") return CAT_TO_GROUP[draft.category] === "lower";
    if (draft.category === "core") return CAT_TO_GROUP[draft.category] === "middle";
    if (draft.category === "cardio") return n.category === "cardio";
    return false;
  });

  return (
    <div className="card" style={{ background: "rgba(168,61,43,0.03)", marginTop: "0.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem 1rem" }}>
        {/* Name */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Name *</span>
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Incline DB Press" autoFocus />
        </label>

        {/* Category */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Category *</span>
          <select className="select" value={draft.category}
            onChange={(e) => set("category", e.target.value as Category)}>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>

        {/* Subcategory / node */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Subcategory / node</span>
          <input className="input" list="node-suggestions" value={draft.subcategory ?? ""}
            onChange={(e) => set("subcategory", e.target.value)}
            placeholder={nodeSuggestions[0]?.nodeLabel ?? "e.g. Vertical Pull"} />
          <datalist id="node-suggestions">
            {nodeSuggestions.map((n) => (
              <option key={n.nodeId} value={n.nodeLabel} />
            ))}
          </datalist>
        </label>

        {/* Equipment */}
        <div style={{ gridColumn: "1/-1" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Equipment</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 0.6rem", marginTop: "0.3rem" }}>
            {EQUIPMENT_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", cursor: "pointer" }}>
                <input type="checkbox"
                  checked={(draft.equipment_list ?? []).includes(opt.value)}
                  onChange={() => toggleEquip(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
          {needsSpecifics && (
            <input className="input" style={{ marginTop: "0.4rem" }}
              value={draft.equipment_specifics ?? ""}
              onChange={(e) => set("equipment_specifics", e.target.value)}
              placeholder="e.g. Preacher curl machine, Assault bike…" />
          )}
        </div>

        {/* Muscles */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Muscles (comma-separated)</span>
          <input className="input"
            value={(draft.muscles ?? []).join(", ")}
            onChange={(e) => set("muscles", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="e.g. pec_major, triceps, front_delt" />
        </label>

        {/* Cues */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Coaching cues / description</span>
          <textarea className="input" rows={2} style={{ resize: "vertical" }}
            value={draft.cues ?? ""}
            onChange={(e) => set("cues", e.target.value)}
            placeholder="e.g. Knees track over toes; chest tall" />
        </label>

        {/* Demo URL */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Demo URL (video / gif)</span>
          <input className="input" type="url"
            value={draft.demo_url ?? ""}
            onChange={(e) => set("demo_url", e.target.value)}
            placeholder="https://…" />
        </label>

        {/* Is Core */}
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.88rem" }}>
          <input type="checkbox" checked={!!draft.is_core} onChange={(e) => set("is_core", e.target.checked)} />
          <span>Core movement <span className="meta">(highlighted in coverage)</span></span>
        </label>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.85rem", paddingTop: "0.65rem", borderTop: "1px solid var(--line)" }}>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

// ── Exercise row ──────────────────────────────────────────────────────────────

function ExerciseRow({ m, onEdit, onArchive }: {
  m: MovementRow;
  onEdit: () => void;
  onArchive: (id: string) => void;
}) {
  const equipLabel = (m.equipment_list ?? [])
    .map((e) => EQUIPMENT_OPTIONS.find((o) => o.value === e)?.label ?? e)
    .join(", ");

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "0.5rem",
      padding: "0.5rem 0.6rem", borderRadius: 3,
      borderBottom: "1px solid var(--line)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.88rem" }}>{m.name}</strong>
          {m.is_core && (
            <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "rgba(90,107,74,0.12)", color: "var(--sage)", borderRadius: 3, padding: "0.05rem 0.3rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>core</span>
          )}
          {m.subcategory && (
            <span className="meta" style={{ fontSize: "0.72rem" }}>· {m.subcategory}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.18rem", flexWrap: "wrap" }}>
          {equipLabel && <span className="meta" style={{ fontSize: "0.74rem" }}>{equipLabel}{m.equipment_specifics ? ` (${m.equipment_specifics})` : ""}</span>}
          {(m.muscles ?? []).length > 0 && <span className="meta" style={{ fontSize: "0.74rem" }}>{m.muscles.join(", ")}</span>}
          {m.cues && <span className="meta" style={{ fontSize: "0.74rem", fontStyle: "italic" }}>{m.cues}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0, marginTop: "0.15rem" }}>
        {m.demo_url && (
          <a href={m.demo_url} target="_blank" rel="noopener" className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem" }} title="Demo video">▶</a>
        )}
        <button className="btn btn-ghost" onClick={onEdit}
          style={{ fontSize: "0.78rem", padding: "0.15rem 0.4rem" }} title="Edit">✎</button>
        <button className="btn btn-ghost" onClick={() => onArchive(m.id)}
          style={{ fontSize: "0.78rem", padding: "0.15rem 0.4rem", color: "var(--muted)" }} title="Archive">✕</button>
      </div>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category, movements, searchActive,
}: {
  category: Category;
  movements: MovementRow[];
  searchActive: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [addingSubcat, setAddingSubcat] = useState<string | null>(null); // subcategory name or "" for top-level
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [, startArchive] = useTransition();

  // Group by subcategory within this category section
  const bySubcat = useMemo(() => {
    const map = new Map<string, MovementRow[]>();
    for (const m of movements) {
      const key = m.subcategory?.trim() || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [movements]);

  // Suggested subcategories from hierarchy for this category
  const hierarchySubs = useMemo(() => {
    const groupId = CAT_TO_GROUP[category];
    const group = LIBRARY_HIERARCHY.find((g) => g.id === groupId);
    if (!group) return [];
    return group.nodes.map((n) => n.label);
  }, [category]);

  async function handleSaveNew(input: MovementInput) {
    const res = await addMovement(input);
    if (res.ok) setAddingSubcat(null);
  }

  async function handleUpdate(id: string, input: MovementInput) {
    await updateMovement(id, input);
    setEditingId(null);
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this exercise? It will be hidden from the library.")) return;
    startArchive(async () => { await archiveMovement(id); });
  }

  // Collect all subcategory keys in a predictable order:
  // 1. hierarchy nodes that have movements first
  // 2. custom subcats
  // 3. blank (no subcat) last
  const subcatOrder = [
    ...hierarchySubs.filter((s) => bySubcat.has(s)),
    ...[...bySubcat.keys()].filter((k) => k && !hierarchySubs.includes(k)),
    ...(bySubcat.has("") ? [""] : []),
  ];

  const isOpen = open || searchActive;

  return (
    <section style={{ marginBottom: "0.75rem" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", borderBottom: "2px solid var(--line)", paddingBottom: "0.4rem", marginBottom: isOpen ? "0.5rem" : 0 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0" }}
        >
          <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{isOpen ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{CATEGORY_LABELS[category]}</span>
          <span style={{
            background: "var(--ink)", color: "var(--paper)",
            borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700,
            padding: "0.08rem 0.45rem", lineHeight: 1.5
          }}>{movements.length}</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem" }}
          onClick={() => { setOpen(true); setAddingSubcat(""); }}
        >+ Add</button>
      </div>

      {isOpen && (
        <>
          {/* Add form at top level (no subcategory) */}
          {addingSubcat === "" && (
            <ExerciseForm
              defaultCategory={category}
              onSave={handleSaveNew}
              onCancel={() => setAddingSubcat(null)}
            />
          )}

          {/* Subcategory groups */}
          {subcatOrder.map((subcat) => {
            const items = bySubcat.get(subcat) ?? [];
            return (
              <div key={subcat || "__none__"} style={{ marginBottom: "0.6rem" }}>
                {subcat && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0", marginBottom: "0.2rem" }}>
                    <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{subcat}</span>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: "0.65rem", padding: "0.08rem 0.35rem", color: "var(--muted)" }}
                      onClick={() => { setOpen(true); setAddingSubcat(subcat); }}
                    >+ Add</button>
                  </div>
                )}

                {/* Add form targeting this subcategory */}
                {addingSubcat === subcat && addingSubcat !== "" && (
                  <ExerciseForm
                    defaultCategory={category}
                    defaultSubcategory={subcat}
                    onSave={handleSaveNew}
                    onCancel={() => setAddingSubcat(null)}
                  />
                )}

                {items.map((m) => (
                  editingId === m.id ? (
                    <ExerciseForm
                      key={m.id}
                      initial={movementToInput(m)}
                      onSave={(input) => handleUpdate(m.id, input)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <ExerciseRow
                      key={m.id}
                      m={m}
                      onEdit={() => { setEditingId(m.id); setAddingSubcat(null); }}
                      onArchive={handleArchive}
                    />
                  )
                ))}
              </div>
            );
          })}

          {/* Hierarchy-suggested subcategories with no exercises yet */}
          {hierarchySubs
            .filter((s) => !bySubcat.has(s))
            .map((subcat) => (
              <div key={subcat} style={{ marginBottom: "0.35rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0" }}>
                  <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--line)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{subcat}</span>
                  <span className="meta" style={{ fontSize: "0.7rem" }}>empty</span>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: "0.65rem", padding: "0.08rem 0.35rem", color: "var(--muted)" }}
                    onClick={() => { setOpen(true); setAddingSubcat(subcat); }}
                  >+ Add</button>
                </div>
                {addingSubcat === subcat && (
                  <ExerciseForm
                    defaultCategory={category}
                    defaultSubcategory={subcat}
                    onSave={handleSaveNew}
                    onCancel={() => setAddingSubcat(null)}
                  />
                )}
              </div>
            ))}
        </>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExerciseLibraryClient({ movements }: { movements: MovementRow[] }) {
  const [search, setSearch] = useState("");
  const [addingGlobal, setAddingGlobal] = useState(false);

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

  const byCategory = useMemo(() => {
    const map = new Map<Category, MovementRow[]>();
    for (const cat of ALL_CATEGORIES) map.set(cat, []);
    for (const m of filtered) {
      const cat = m.category as Category;
      if (map.has(cat)) map.get(cat)!.push(m);
    }
    return map;
  }, [filtered]);

  const coreCount = movements.filter((m) => m.is_core).length;
  const searchActive = !!search.trim();

  async function handleGlobalAdd(input: MovementInput) {
    const res = await addMovement(input);
    if (res.ok) setAddingGlobal(false);
  }

  return (
    <main className="shell">
      <header className="page-hdr">
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Exercise Library</h1>
          <p className="meta">{movements.length} exercises · {coreCount} core movements</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddingGlobal((o) => !o)}>
          {addingGlobal ? "Cancel" : "+ Add Exercise"}
        </button>
      </header>

      <hr className="divider" />

      {/* Global add form */}
      {addingGlobal && (
        <div style={{ marginBottom: "1.5rem" }}>
          <ExerciseForm
            onSave={handleGlobalAdd}
            onCancel={() => setAddingGlobal(false)}
          />
        </div>
      )}

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

      {/* Categories */}
      {ALL_CATEGORIES.map((cat) => {
        const items = byCategory.get(cat) ?? [];
        if (searchActive && items.length === 0) return null;
        return (
          <CategorySection
            key={cat}
            category={cat}
            movements={items}
            searchActive={searchActive}
          />
        );
      })}

      {searchActive && filtered.length === 0 && (
        <p className="meta" style={{ textAlign: "center", padding: "2rem 0" }}>No exercises match "{search}".</p>
      )}
    </main>
  );
}

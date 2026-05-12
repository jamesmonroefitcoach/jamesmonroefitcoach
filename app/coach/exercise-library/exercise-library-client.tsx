"use client";

import { useState, useTransition, useMemo } from "react";
import type { MovementRow } from "@/lib/data";
import {
  EQUIPMENT_OPTIONS, LIBRARY_HIERARCHY,
  type Category, type LibraryNode, type LibraryGroup,
} from "@/lib/programs";
import { addMovement, updateMovement, archiveMovement, type MovementInput } from "./actions";

// ── helpers ───────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = Array.from(
  new Set(LIBRARY_HIERARCHY.flatMap((g) => g.nodes.map((n) => n.category)))
) as Category[];

/** Return all exercises whose subcategory matches a node or child label. */
function matchExercises(movements: MovementRow[], nodeLabel: string): MovementRow[] {
  const key = nodeLabel.toLowerCase();
  return movements.filter((m) => (m.subcategory ?? "").toLowerCase() === key);
}

// ── blank form ────────────────────────────────────────────────────────────────

const BLANK: MovementInput = {
  name: "", category: "push", subcategory: "",
  muscles: [], equipment_list: [], equipment_specifics: "",
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
    cues: m.cues ?? "",
    demo_url: m.demo_url ?? "",
  };
}

// ── Exercise form ─────────────────────────────────────────────────────────────

function ExerciseForm({
  initial, defaultCategory, defaultSubcategory, onSave, onCancel,
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
    startSave(async () => { await onSave(draft); });
  }

  const needsSpecifics = (draft.equipment_list ?? []).some(
    (e) => EQUIPMENT_OPTIONS.find((o) => o.value === e)?.allowsSpecifics
  );

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

        {/* Category (hidden if locked) */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Category</span>
          <select className="select" value={draft.category}
            onChange={(e) => set("category", e.target.value as Category)}>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
        </label>

        {/* Subcategory locked to node */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Node / subcategory</span>
          <input className="input" value={draft.subcategory ?? ""}
            onChange={(e) => set("subcategory", e.target.value)}
            placeholder="e.g. Vertical Pull" />
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
              placeholder="e.g. Preacher curl machine" />
          )}
        </div>

        {/* Muscles */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Muscles (comma-separated)</span>
          <input className="input"
            value={(draft.muscles ?? []).join(", ")}
            onChange={(e) => set("muscles", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="e.g. pec_major, triceps" />
        </label>

        {/* Cues */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Coaching cues</span>
          <textarea className="input" rows={2} style={{ resize: "vertical" }}
            value={draft.cues ?? ""}
            onChange={(e) => set("cues", e.target.value)}
            placeholder="Key cues or notes…" />
        </label>

        {/* Demo URL */}
        <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span className="meta" style={{ fontSize: "0.74rem" }}>Demo URL</span>
          <input className="input" type="url" value={draft.demo_url ?? ""}
            onChange={(e) => set("demo_url", e.target.value)} placeholder="https://…" />
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
      padding: "0.45rem 0.75rem", borderRadius: 3,
      background: "rgba(0,0,0,0.015)",
      border: "1px solid var(--line)",
      marginBottom: "0.3rem",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.88rem" }}>{m.name}</strong>
        </div>
        {(equipLabel || (m.muscles ?? []).length > 0 || m.cues) && (
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.12rem", flexWrap: "wrap" }}>
            {equipLabel && <span className="meta" style={{ fontSize: "0.73rem" }}>{equipLabel}{m.equipment_specifics ? ` (${m.equipment_specifics})` : ""}</span>}
            {(m.muscles ?? []).length > 0 && <span className="meta" style={{ fontSize: "0.73rem" }}>{m.muscles.join(", ")}</span>}
            {m.cues && <span className="meta" style={{ fontSize: "0.73rem", fontStyle: "italic" }}>{m.cues}</span>}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0, marginTop: "0.1rem" }}>
        {m.demo_url && (
          <a href={m.demo_url} target="_blank" rel="noopener" className="btn btn-ghost"
            style={{ fontSize: "0.7rem", padding: "0.12rem 0.35rem" }}>▶</a>
        )}
        <button className="btn btn-ghost" onClick={onEdit}
          style={{ fontSize: "0.75rem", padding: "0.12rem 0.35rem" }}>✎</button>
        <button className="btn btn-ghost" onClick={() => onArchive(m.id)}
          style={{ fontSize: "0.75rem", padding: "0.12rem 0.35rem", color: "var(--muted)" }}>✕</button>
      </div>
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
                : <ExerciseRow key={m.id} m={m}
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
                  onSave={(input) => handleUpdate(m.id, input)}
                  onCancel={() => setEditingId(null)} />
              : <ExerciseRow key={m.id} m={m}
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

// ── Group section ─────────────────────────────────────────────────────────────

function GroupSection({
  group, movements, searchActive,
}: {
  group: LibraryGroup;
  movements: MovementRow[];
  searchActive: boolean;
}) {
  const [open, setOpen] = useState(true);

  // Total exercises in this group
  const total = useMemo(() => {
    const allNodeLabels = group.nodes.flatMap((n) =>
      [n.label, ...(n.children?.map((c) => c.label) ?? [])]
    );
    return movements.filter((m) =>
      allNodeLabels.some((label) => (m.subcategory ?? "").toLowerCase() === label.toLowerCase())
    ).length;
  }, [movements, group]);

  const isOpen = open || searchActive;

  return (
    <section style={{ marginBottom: "1rem" }}>
      {/* Group header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.6rem",
        borderBottom: "2px solid var(--line)",
        paddingBottom: "0.45rem", marginBottom: isOpen ? "0.6rem" : 0,
      }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0" }}
        >
          <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{isOpen ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{group.label}</span>
          {total > 0 && (
            <span style={{
              background: "var(--ink)", color: "var(--paper)",
              borderRadius: 999, fontSize: "0.65rem", fontWeight: 700,
              padding: "0.08rem 0.45rem", lineHeight: 1.5,
            }}>{total}</span>
          )}
        </button>
      </div>

      {isOpen && (
        <div style={{ paddingLeft: "0.5rem" }}>
          {group.nodes.map((node) => (
            <NodeSection
              key={node.id}
              node={node}
              movements={movements}
              searchActive={searchActive}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExerciseLibraryClient({ movements }: { movements: MovementRow[] }) {
  const [search, setSearch] = useState("");
  const [addingGlobal, setAddingGlobal] = useState(false);
  const [, startSave] = useTransition();

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
          <p className="meta">{movements.length} exercises</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddingGlobal((o) => !o)}>
          {addingGlobal ? "Cancel" : "+ Add Exercise"}
        </button>
      </header>

      <hr className="divider" />

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

      {/* Unmatched exercises (subcategory doesn't match any node) */}
      {(() => {
        const allNodeLabels = new Set(
          LIBRARY_HIERARCHY.flatMap((g) =>
            g.nodes.flatMap((n) => [n.label.toLowerCase(), ...(n.children?.map((c) => c.label.toLowerCase()) ?? [])])
          )
        );
        const unmatched = filtered.filter(
          (m) => m.subcategory && !allNodeLabels.has(m.subcategory.toLowerCase())
        );
        const noSubcat = filtered.filter((m) => !m.subcategory);
        const orphans = [...unmatched, ...noSubcat];
        if (orphans.length === 0) return null;
        return (
          <section style={{ marginBottom: "1rem" }}>
            <div style={{ borderBottom: "2px solid var(--line)", paddingBottom: "0.45rem", marginBottom: "0.6rem" }}>
              <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--muted)" }}>Uncategorized</span>
              <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "var(--muted)" }}>{orphans.length}</span>
            </div>
            <div style={{ paddingLeft: "0.5rem" }}>
              {orphans.map((m) => (
                <ExerciseRow key={m.id} m={m}
                  onEdit={() => {}}
                  onArchive={async (id) => { if (confirm("Archive?")) await archiveMovement(id); }} />
              ))}
            </div>
          </section>
        );
      })()}

      {/* Hierarchy groups */}
      {LIBRARY_HIERARCHY.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          movements={filtered}
          searchActive={searchActive}
        />
      ))}

      {searchActive && filtered.length === 0 && (
        <p className="meta" style={{ textAlign: "center", padding: "2rem 0" }}>
          No exercises match &quot;{search}&quot;.
        </p>
      )}
    </main>
  );
}

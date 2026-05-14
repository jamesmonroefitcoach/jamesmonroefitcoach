"use client";
// Read-only client view of the Exercise Library. Mirrors the coach side's
// grouping (Library Hierarchy → subcategory) but without any edit, archive,
// or add controls — clients see exactly what James has published.

import { useMemo, useState } from "react";
import type { MovementRow } from "@/lib/data";
import { EQUIPMENT_OPTIONS, LIBRARY_HIERARCHY, type LibraryGroup, type LibraryNode } from "@/lib/programs";

function matches(movements: MovementRow[], nodeLabel: string): MovementRow[] {
  const key = nodeLabel.trim().toLowerCase();
  return movements.filter((m) => (m.subcategory ?? "").trim().toLowerCase() === key);
}

export default function ClientExerciseLibraryView({ movements }: { movements: MovementRow[] }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return movements;
    const q = search.toLowerCase();
    return movements.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.subcategory ?? "").toLowerCase().includes(q) ||
      (m.muscles ?? []).some((mu) => mu.toLowerCase().includes(q)) ||
      (m.cues ?? "").toLowerCase().includes(q)
    );
  }, [movements, search]);
  const searchActive = !!search.trim();

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Exercise Library</h1>
        <p className="meta">{movements.length} exercise{movements.length === 1 ? "" : "s"} published by James.</p>
      </header>
      <hr className="divider" />

      <div style={{ marginBottom: "1rem" }}>
        <input
          className="input"
          placeholder="Search by name, muscle, or cue…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 380, fontSize: "0.82rem" }}
        />
      </div>

      {(LIBRARY_HIERARCHY as LibraryGroup[]).map((group) => (
        <GroupSection key={group.id} group={group} movements={filtered} searchActive={searchActive} />
      ))}
    </main>
  );
}

function GroupSection({ group, movements, searchActive }: { group: LibraryGroup; movements: MovementRow[]; searchActive: boolean }) {
  const [open, setOpen] = useState(true);
  const allNodeLabels = group.nodes.flatMap((n) => [n.label, ...(n.children?.map((c) => c.label) ?? [])]);
  const total = movements.filter((m) =>
    allNodeLabels.some((l) => (m.subcategory ?? "").toLowerCase() === l.toLowerCase())
  ).length;
  const isOpen = open || searchActive;
  return (
    <section style={{ marginBottom: "1rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "transparent", border: "none",
          borderBottom: "2px solid var(--line)", padding: "0.55rem 0.3rem",
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: isOpen ? "0.55rem" : 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{isOpen ? "▾" : "▸"}</span>
          <strong style={{ fontSize: "1rem" }}>{group.label}</strong>
          {total > 0 && (
            <span className="badge" style={{ fontSize: "0.62rem" }}>{total}</span>
          )}
        </span>
      </button>
      {isOpen && (
        <div style={{ paddingLeft: "0.5rem" }}>
          {group.nodes.map((node) => (
            <NodeSection key={node.id} node={node} movements={movements} searchActive={searchActive} />
          ))}
        </div>
      )}
    </section>
  );
}

function NodeSection({ node, movements, searchActive }: { node: LibraryNode; movements: MovementRow[]; searchActive: boolean }) {
  const exs = matches(movements, node.label);
  const [open, setOpen] = useState(searchActive || exs.length > 0);
  const isOpen = open || searchActive;
  const hasChildren = !!node.children?.length;
  return (
    <div style={{ marginBottom: "0.2rem", marginLeft: hasChildren ? 0 : "0.15rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", padding: "0.25rem 0" }}>
        {exs.length > 0 || hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <span style={{ fontSize: "0.66rem", color: "var(--muted)", width: 10 }}>{isOpen ? "▾" : "▸"}</span>
            <span style={{ fontWeight: 600, fontSize: "0.86rem" }}>{node.label}</span>
            {exs.length > 0 && <span className="meta" style={{ fontSize: "0.66rem" }}>{exs.length}</span>}
          </button>
        ) : (
          <>
            <span style={{ fontSize: "0.66rem", color: "var(--line)", width: 10 }}>—</span>
            <span style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--muted)" }}>{node.label}</span>
            <span className="meta" style={{ fontSize: "0.66rem" }}>empty</span>
          </>
        )}
      </div>
      {isOpen && (
        <div style={{ marginLeft: "1rem" }}>
          {exs.map((m) => <ExerciseRow key={m.id} m={m} />)}
          {hasChildren && node.children!.map((c) => (
            <NodeSection key={c.id} node={{ ...c, children: undefined }} movements={movements} searchActive={searchActive} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ m }: { m: MovementRow }) {
  const equipLabel = (m.equipment_list ?? []).map((e) => EQUIPMENT_OPTIONS.find((o) => o.value === e)?.label ?? e).join(", ");
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "0.5rem",
      padding: "0.4rem 0.6rem", borderRadius: 3,
      background: "rgba(0,0,0,0.015)",
      border: "1px solid var(--line)",
      marginBottom: "0.25rem",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: "0.84rem" }}>{m.name}</strong>
        {(equipLabel || m.position || (m.muscles ?? []).length > 0 || m.cues) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.1rem" }}>
            {equipLabel && <span className="meta" style={{ fontSize: "0.7rem" }}>{equipLabel}{m.equipment_specifics ? ` (${m.equipment_specifics})` : ""}</span>}
            {m.position && <span className="meta" style={{ fontSize: "0.7rem" }}>{m.position}</span>}
            {(m.muscles ?? []).length > 0 && <span className="meta" style={{ fontSize: "0.7rem" }}>{m.muscles.join(", ")}</span>}
            {m.cues && <span className="meta" style={{ fontSize: "0.7rem", fontStyle: "italic" }}>{m.cues}</span>}
          </div>
        )}
      </div>
      {m.demo_url && (
        <a
          href={m.demo_url}
          target="_blank"
          rel="noopener"
          className="btn btn-ghost"
          style={{ fontSize: "0.7rem", padding: "0.12rem 0.4rem", flexShrink: 0 }}
        >▶ Demo</a>
      )}
    </div>
  );
}

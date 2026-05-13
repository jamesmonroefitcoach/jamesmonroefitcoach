"use client";
import { useEffect, useMemo, useState } from "react";
import {
  LIBRARY_HIERARCHY,
  CATEGORY_LABELS,
  type Category,
  type LibraryGroup,
  type LibraryLeaf,
} from "@/lib/programs";
import { readLearned, type LearnedExercise } from "@/lib/exercises-learned";

function normalizeKey(movementId: string | undefined, name: string): string {
  if (movementId && !movementId.startsWith("ph-")) return movementId;
  return `name:${name.trim().toLowerCase()}`;
}

// Flatten a LibraryGroup → list of leaves (handles nodes with `children`)
function leavesForGroup(g: LibraryGroup): LibraryLeaf[] {
  const out: LibraryLeaf[] = [];
  for (const node of g.nodes) {
    if (node.children && node.children.length > 0) {
      out.push(...node.children);
    } else {
      out.push({
        id: node.id,
        label: node.label,
        description: node.description,
        category: node.category,
        is_core: node.is_core,
      });
    }
  }
  return out;
}

type Row = {
  key: string;
  name: string;
  category: Category;
  learned: LearnedExercise | null;
};

// One library group → its rows, plus the rows split into learned/unlearned arrays.
type GroupView = {
  id: string;
  label: string;
  rows: Row[];
  learned: Row[];
  unlearned: Row[];
};

function GroupBlock({ g }: { g: GroupView }) {
  const [open, setOpen] = useState(false);
  // Build a side-by-side row layout so learned and unlearned line up. Two
  // separate vertical columns; their items are independent (no row matching),
  // but they share the same group context so it's visually paired.
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "rgba(0,0,0,0.025)", border: "none",
          padding: "0.4rem 0.6rem", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em" }}>
          {open ? "▾" : "▸"} {g.label}
        </span>
        <span className="meta" style={{ fontSize: "0.68rem" }}>
          <span style={{ color: "var(--sage)" }}>{g.learned.length} learned</span>
          {" · "}
          <span style={{ color: "var(--clay)" }}>{g.unlearned.length} to learn</span>
        </span>
      </button>
      {open && (
        <div
          className="banner-two-col"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0",
            borderTop: "1px solid var(--line)",
          }}
        >
          {/* Learned column */}
          <div style={{ padding: "0.4rem 0.55rem", borderRight: "1px solid var(--line)" }}>
            {g.learned.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.7rem", margin: 0, fontStyle: "italic" }}>None yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.18rem" }}>
                {g.learned.map((r) => (
                  <div key={r.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: "0.4rem", padding: "0.18rem 0.35rem", borderRadius: 3,
                    background: "rgba(90,107,74,0.06)",
                  }}>
                    <span style={{ fontSize: "0.74rem", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    {r.learned && r.learned.heaviest_weight_lb > 0 && (
                      <span style={{ fontSize: "0.66rem", color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {r.learned.heaviest_weight_lb}{r.learned.reps_at_heaviest ? `×${r.learned.reps_at_heaviest}` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* To-learn column */}
          <div style={{ padding: "0.4rem 0.55rem" }}>
            {g.unlearned.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.7rem", margin: 0, fontStyle: "italic" }}>All learned 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.18rem" }}>
                {g.unlearned.map((r) => (
                  <div key={r.key} style={{
                    fontSize: "0.74rem", padding: "0.18rem 0.35rem", color: "var(--ink)",
                  }}>{r.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExercisesLearnedSection({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const { totalLearned, totalToLearn, groups } = useMemo(() => {
    if (!mounted) return { totalLearned: 0, totalToLearn: 0, groups: [] as GroupView[] };
    const learnedMap = readLearned(clientId);
    const groups: GroupView[] = LIBRARY_HIERARCHY.map((g) => {
      const leaves = leavesForGroup(g);
      const rows: Row[] = leaves.map((leaf) => {
        const key = normalizeKey(leaf.id, leaf.label);
        const learnedEntry = learnedMap[key] ?? null;
        return { key, name: leaf.label, category: leaf.category, learned: learnedEntry };
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      const learned = rows.filter((r) => r.learned !== null);
      const unlearned = rows.filter((r) => r.learned === null);
      return { id: g.id, label: g.label, rows, learned, unlearned };
    });
    const totalLearned = groups.reduce((s, g) => s + g.learned.length, 0);
    const totalToLearn = groups.reduce((s, g) => s + g.unlearned.length, 0);
    return { totalLearned, totalToLearn, groups };
  }, [clientId, mounted]);

  return (
    <div style={{ marginTop: "1rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none",
          borderTop: "1px dashed var(--line)",
          padding: "0.45rem 0",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>
          {open ? "▾" : "▸"} Exercises {mounted ? `(${totalLearned} learned · ${totalToLearn} to learn)` : ""}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: "0.5rem" }}>
          {!mounted ? (
            <p className="meta" style={{ fontSize: "0.74rem" }}>Loading…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {/* Header row — labels align with the per-group two-column grid */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
                paddingLeft: "0.6rem", paddingRight: "0.6rem",
              }}>
                <div style={{
                  fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--sage)",
                }}>Learned</div>
                <div style={{
                  fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--clay)",
                }}>To Learn</div>
              </div>

              {groups.map((g) => (
                <GroupBlock key={g.id} g={g} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

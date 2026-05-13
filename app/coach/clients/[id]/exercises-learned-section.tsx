"use client";
import { useEffect, useMemo, useState } from "react";
import { hierarchyLeaves, CATEGORY_LABELS, type Category } from "@/lib/programs";
import { readLearned, type LearnedExercise } from "@/lib/exercises-learned";

type LeafEntry = {
  key: string;            // movement_id when available, else name-based key
  name: string;
  category: Category;
  learned: LearnedExercise | null;
};

function normalizeKey(movementId: string | undefined, name: string): string {
  if (movementId && !movementId.startsWith("ph-")) return movementId;
  return `name:${name.trim().toLowerCase()}`;
}

export default function ExercisesLearnedSection({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);  // re-read storage on tab focus

  useEffect(() => {
    setMounted(true);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const { learned, toLearn } = useMemo(() => {
    if (!mounted) return { learned: [] as LeafEntry[], toLearn: [] as LeafEntry[] };
    const learnedMap = readLearned(clientId);
    // Build a unified leaf list from the library hierarchy.
    const leaves = hierarchyLeaves();
    const lEntries: LeafEntry[] = [];
    const tEntries: LeafEntry[] = [];
    const seenKeys = new Set<string>();
    for (const leaf of leaves) {
      const key = normalizeKey(leaf.id, leaf.label);
      seenKeys.add(key);
      const learnedEntry = learnedMap[key] ?? null;
      const row: LeafEntry = { key, name: leaf.label, category: leaf.category, learned: learnedEntry };
      if (learnedEntry) lEntries.push(row);
      else tEntries.push(row);
    }
    // Include any learned entries that aren't in the hierarchy (ad-hoc additions).
    for (const [k, val] of Object.entries(learnedMap)) {
      if (!seenKeys.has(k)) {
        lEntries.push({ key: k, name: val.name, category: val.category as Category, learned: val });
      }
    }
    // Sort
    lEntries.sort((a, b) => a.name.localeCompare(b.name));
    tEntries.sort((a, b) => a.name.localeCompare(b.name));
    return { learned: lEntries, toLearn: tEntries };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, mounted, tick]);

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
          {open ? "▾" : "▸"} Exercises {mounted ? `(${learned.length} learned · ${toLearn.length} to learn)` : ""}
        </span>
      </button>

      {open && (
        <div className="banner-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.6rem" }}>
          {/* Learned column */}
          <div>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--sage)",
              paddingBottom: "0.3rem", borderBottom: "1px solid var(--line)",
              marginBottom: "0.5rem",
            }}>Exercises Learned</div>
            {!mounted ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>Loading…</p>
            ) : learned.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>None yet — complete an exercise to add it here.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {learned.map((e) => (
                  <div key={e.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: "0.5rem", padding: "0.25rem 0.4rem", borderRadius: 3,
                    background: "rgba(90,107,74,0.05)",
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{e.name}</span>
                      <span className="meta" style={{ fontSize: "0.66rem", marginLeft: "0.4rem" }}>{CATEGORY_LABELS[e.category]}</span>
                    </div>
                    {e.learned && e.learned.heaviest_weight_lb > 0 && (
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        heaviest: {e.learned.heaviest_weight_lb} lbs
                        {e.learned.reps_at_heaviest ? ` × ${e.learned.reps_at_heaviest}` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* To learn column */}
          <div>
            <div style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: "var(--clay)",
              paddingBottom: "0.3rem", borderBottom: "1px solid var(--line)",
              marginBottom: "0.5rem",
            }}>Exercises to Learn</div>
            {!mounted ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>Loading…</p>
            ) : toLearn.length === 0 ? (
              <p className="meta" style={{ fontSize: "0.74rem" }}>All library exercises completed 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {toLearn.map((e) => (
                  <div key={e.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: "0.5rem", padding: "0.25rem 0.4rem", borderRadius: 3,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: "0.78rem" }}>{e.name}</span>
                      <span className="meta" style={{ fontSize: "0.66rem", marginLeft: "0.4rem" }}>{CATEGORY_LABELS[e.category]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

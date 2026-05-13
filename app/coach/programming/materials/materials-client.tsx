"use client";
import { useEffect, useMemo, useState } from "react";

// Materials sub-tab content. Each item is a small card the coach can edit
// in-place. Edits are persisted in localStorage today — when the client
// view is built out (right now it shows "coming soon"), this should move
// to a Supabase table so clients can see the same content the coach edits.

type Material = {
  id: string;
  category: MaterialCategory;
  title: string;
  body: string;
};

type MaterialCategory =
  | "Fundamentals"
  | "Body Mechanics"
  | "Training Concepts"
  | "Injury Prevention"
  | "Balance Training"
  | "Suggested Additions"
  | "Sources";

const CATEGORIES: MaterialCategory[] = [
  "Fundamentals",
  "Body Mechanics",
  "Training Concepts",
  "Injury Prevention",
  "Balance Training",
  "Suggested Additions",
  "Sources",
];

// Seed library. James can edit the text on each card; structure is fixed
// in code (add new items here, deploy, then edit text in the UI).
const DEFAULT_MATERIALS: Material[] = [
  // ─── Fundamentals (the "Demystifying Exercises and Nutrition" 10-pager) ───
  {
    id: "metabolism",
    category: "Fundamentals",
    title: "Metabolism, Weight, Calories & Energy",
    body: "How the body turns food into usable energy, why bodyweight is a lagging indicator, and where calories actually come from / go to.",
  },
  {
    id: "macros",
    category: "Fundamentals",
    title: "Macronutrients (Carbs, Protein, Fat)",
    body: "What each macro does, examples of each, and how to think about ratios without obsessing over them.",
  },
  {
    id: "balanced-eating",
    category: "Fundamentals",
    title: "Balanced Eating",
    body: "What 'balanced' actually looks like on a plate — and why it changes by training day vs rest day.",
  },
  {
    id: "muscle-built",
    category: "Fundamentals",
    title: "Why & How Muscle Gets Built",
    body: "Stimulus → recovery → adaptation. Protein synthesis basics. Why training without eating doesn't work.",
  },
  {
    id: "progressive-overload",
    category: "Fundamentals",
    title: "Progressive Overload",
    body: "Adding load, reps, or quality over time. The single most important training principle.",
  },
  {
    id: "muscle-benefits",
    category: "Fundamentals",
    title: "Benefits of Building Muscle",
    body: "Metabolic, postural, joint-protective, and longevity benefits — beyond the visible.",
  },

  // ─── Body Mechanics & Anatomy ───────────────────────────────────────────
  {
    id: "push-vs-pull",
    category: "Body Mechanics",
    title: "Push vs Pull (Movement Patterns)",
    body: "The six core patterns — push, pull, hinge, squat, carry, rotate — and how to balance them across a week.",
  },
  {
    id: "muscle-exercise-map",
    category: "Body Mechanics",
    title: "Muscle Group → Exercise Reference",
    body: "Which exercises hit which muscle groups. Use for filling coverage gaps in a program.",
  },
  {
    id: "body-map",
    category: "Body Mechanics",
    title: "Body Map Reference",
    body: "Annotated diagram — major muscles front and back. Use as a visual aid for clients.",
  },

  // ─── Training Concepts ──────────────────────────────────────────────────
  {
    id: "hypertrophy-vs-strength",
    category: "Training Concepts",
    title: "Hypertrophy vs Strength",
    body: "Different rep ranges, different rest, different goals. When to pick which — and how to combine them.",
  },
  {
    id: "periodization",
    category: "Training Concepts",
    title: "Periodization Basics",
    body: "Linear, undulating, and block periodization explained. How to plan blocks across months.",
  },
  {
    id: "sdt",
    category: "Training Concepts",
    title: "Self-Determination Theory (SDT)",
    body: "Autonomy + competence + relatedness — the three needs that drive durable behavior change. How to coach with them in mind.",
  },

  // ─── Injury Prevention & Recovery ──────────────────────────────────────
  {
    id: "postural-imbalances",
    category: "Injury Prevention",
    title: "Postural Imbalances",
    body: "Hiked hip and hiked shoulder — how to spot them, what causes them, and the corrective drills that fix them.",
  },
  {
    id: "joint-injuries",
    category: "Injury Prevention",
    title: "Common Joint Injuries",
    body: "Runner's knee, tennis elbow, golfer's elbow, shoulder impingement. Mechanism, screen, modifications, and when to refer out.",
  },
  {
    id: "soft-tissue",
    category: "Injury Prevention",
    title: "Soft-Tissue Issues",
    body: "Piriformis, quadratus lumborum, bicep tendonitis. Common triggers and decompression / loading strategies.",
  },
  {
    id: "repetitive-motion",
    category: "Injury Prevention",
    title: "Repetitive Motion Injuries",
    body: "What overuse looks like, why deload weeks matter, and how to spot a brewing problem before it sidelines a client.",
  },
  {
    id: "injury-protocol",
    category: "Injury Prevention",
    title: "Injury Recovery Protocol",
    body: "Breaking the half-healed / reinjury pendulum. Phased return-to-load and the markers for moving forward.",
  },

  // ─── Balance Training ──────────────────────────────────────────────────
  {
    id: "tandem-stances",
    category: "Balance Training",
    title: "Tandem Stances",
    body: "Heel-to-toe progression. Static hold, then add perturbation (head turn, eyes closed, arm reach).",
  },
  {
    id: "one-legged",
    category: "Balance Training",
    title: "One-Legged Balance",
    body: "Standing single-leg progression. From bare static to dynamic reach to weighted.",
  },
  {
    id: "walking-tandem",
    category: "Balance Training",
    title: "Walking Tandem (Forward / Backward)",
    body: "Heel-to-toe walking, both directions. Builds proprioception and gait stability.",
  },
  {
    id: "eyes-closed",
    category: "Balance Training",
    title: "Eyes-Closed Variants",
    body: "Removing visual input forces the vestibular and proprioceptive systems to take over. Add to any stable balance drill.",
  },
  {
    id: "catch-tandem",
    category: "Balance Training",
    title: "Catch-a-Ball Tandem",
    body: "Reactive balance — coach tosses, client catches while holding tandem stance. Cognitive + motor load.",
  },

  // ─── Suggested additions (Claude proposed; James can promote or drop) ─
  {
    id: "sleep-recovery",
    category: "Suggested Additions",
    title: "Sleep & Recovery",
    body: "Why sleep is the biggest under-coached lever for performance and fat loss. Targets and bedtime habits.",
  },
  {
    id: "hydration",
    category: "Suggested Additions",
    title: "Hydration",
    body: "How much, when, and the signs you're under-hydrated for training.",
  },
  {
    id: "mobility-flexibility",
    category: "Suggested Additions",
    title: "Mobility vs Flexibility vs Stretching",
    body: "Three things that get conflated — what each actually means and when each matters.",
  },
  {
    id: "rpe-card",
    category: "Suggested Additions",
    title: "RPE Reference Card",
    body: "1–10 scale of effort with anchor descriptions. Used throughout the program builder's exertion field.",
  },
  {
    id: "warmup",
    category: "Suggested Additions",
    title: "Warm-up Protocols",
    body: "General warm-up + movement-specific prep. What to do before lifting, before cardio, before mixed.",
  },
  {
    id: "doms",
    category: "Suggested Additions",
    title: "DOMS Explained",
    body: "Delayed-onset muscle soreness — what soreness means, what it doesn't mean, and when it's a problem.",
  },
  {
    id: "heart-rate",
    category: "Suggested Additions",
    title: "Heart Rate Zones / Energy Systems",
    body: "Zones 1–5, the three energy systems (ATP-PC, glycolytic, oxidative), and which to target for which goal.",
  },
  {
    id: "plateau",
    category: "Suggested Additions",
    title: "Plateau Strategies",
    body: "What to change first when progress stalls — volume, intensity, variation, or recovery.",
  },
  {
    id: "special-pops",
    category: "Suggested Additions",
    title: "Special Populations",
    body: "Pregnancy / postpartum, seniors, youth athletes — when standard programming needs to bend.",
  },
  {
    id: "glossary",
    category: "Suggested Additions",
    title: "Glossary",
    body: "1RM, AMRAP, EMOM, RIR, tempo notation, drop set, superset. Quick-lookup for anyone new to the lingo.",
  },

  // ─── Sources ───────────────────────────────────────────────────────────
  {
    id: "src-nsca",
    category: "Sources",
    title: "NSCA",
    body: "National Strength and Conditioning Association. Peer-reviewed practitioner standard. https://www.nsca.com",
  },
  {
    id: "src-acsm",
    category: "Sources",
    title: "ACSM",
    body: "American College of Sports Medicine. Clinical guidelines for exercise and health. https://www.acsm.org",
  },
  {
    id: "src-sbs",
    category: "Sources",
    title: "Stronger By Science",
    body: "Greg Nuckols — readable research summaries for lifters and coaches. https://www.strongerbyscience.com",
  },
  {
    id: "src-examine",
    category: "Sources",
    title: "Examine.com",
    body: "Independent, evidence-graded nutrition + supplement database. https://examine.com",
  },
  {
    id: "src-pubmed",
    category: "Sources",
    title: "PubMed / NIH",
    body: "Primary research literature. Slow but authoritative. https://pubmed.ncbi.nlm.nih.gov",
  },
  {
    id: "src-rp",
    category: "Sources",
    title: "Renaissance Periodization",
    body: "Mike Israetel et al — hypertrophy science applied. https://renaissanceperiodization.com",
  },
  {
    id: "src-pn",
    category: "Sources",
    title: "Precision Nutrition",
    body: "Coach-facing nutrition reference and certification body. https://www.precisionnutrition.com",
  },
  {
    id: "src-nasm",
    category: "Sources",
    title: "NASM",
    body: "National Academy of Sports Medicine — corrective exercise specialist materials. https://www.nasm.org",
  },
  {
    id: "src-fms",
    category: "Sources",
    title: "Functional Movement Systems (FMS)",
    body: "Movement screen + corrective exercise framework. https://www.functionalmovement.com",
  },
];

const STORAGE_KEY = "monroe-materials-edits-v1";

type EditMap = Record<string, { title?: string; body?: string }>;

function loadEdits(): EditMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as EditMap;
  } catch {
    return {};
  }
}

function saveEdits(edits: EditMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    /* localStorage quota or disabled — silently no-op */
  }
}

export default function MaterialsClient() {
  const [edits, setEdits] = useState<EditMap>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  useEffect(() => {
    setEdits(loadEdits());
  }, []);

  // Merge defaults with any per-card overrides from localStorage.
  const materials = useMemo<Material[]>(() => {
    return DEFAULT_MATERIALS.map((m) => {
      const e = edits[m.id];
      if (!e) return m;
      return { ...m, title: e.title ?? m.title, body: e.body ?? m.body };
    });
  }, [edits]);

  function startEdit(m: Material) {
    setEditingId(m.id);
    setDraftTitle(m.title);
    setDraftBody(m.body);
  }
  function cancelEdit() {
    setEditingId(null);
    setDraftTitle("");
    setDraftBody("");
  }
  function commitEdit() {
    if (!editingId) return;
    const next: EditMap = { ...edits, [editingId]: { title: draftTitle.trim(), body: draftBody.trim() } };
    setEdits(next);
    saveEdits(next);
    cancelEdit();
  }
  function resetCard(id: string) {
    if (!confirm("Reset this card to its default text?")) return;
    const next: EditMap = { ...edits };
    delete next[id];
    setEdits(next);
    saveEdits(next);
  }

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="page-hdr">
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Materials</h1>
          <p className="meta">Reference articles for training, nutrition, and recovery — edit any card inline. Clients will see a curated version with required-review tracking once that view ships.</p>
        </div>
      </header>

      <hr className="divider" />

      <section style={{
        background: "rgba(168,61,43,0.04)",
        border: "1px dashed var(--rust)",
        borderRadius: 4,
        padding: "0.55rem 0.85rem",
        marginBottom: "1.25rem",
        fontSize: "0.78rem",
      }}>
        <strong style={{ color: "var(--rust)" }}>Client view: Coming soon — required reviews.</strong>{" "}
        <span className="meta">Clients will see selected materials with check-off tracking. Your edits today live in this browser until that view is wired to the database.</span>
      </section>

      {CATEGORIES.map((cat) => {
        const items = materials.filter((m) => m.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.55rem", paddingBottom: "0.35rem", borderBottom: "2px solid var(--line)" }}>
              {cat}
              <span style={{ color: "var(--muted)", fontSize: "0.7rem", fontWeight: 400, marginLeft: "0.6rem" }}>{items.length} card{items.length === 1 ? "" : "s"}</span>
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "0.7rem",
            }}>
              {items.map((m) => {
                const editing = editingId === m.id;
                const isCustomized = !!edits[m.id];
                return (
                  <div
                    key={m.id}
                    style={{
                      border: "1px solid var(--line)",
                      borderLeft: isCustomized ? "3px solid var(--rust)" : "1px solid var(--line)",
                      borderRadius: 4,
                      padding: "0.6rem 0.75rem",
                      background: editing ? "rgba(168,61,43,0.04)" : "var(--paper)",
                      display: "flex", flexDirection: "column", gap: "0.4rem",
                      minWidth: 0,
                    }}
                  >
                    {editing ? (
                      <>
                        <input
                          className="input"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder="Title"
                          style={{ fontSize: "0.85rem", fontWeight: 700, padding: "0.25rem 0.4rem" }}
                          autoFocus
                        />
                        <textarea
                          className="textarea"
                          rows={6}
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          placeholder="Body"
                          style={{ fontSize: "0.78rem", resize: "vertical", minHeight: 120 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                          <button className="btn btn-ghost" onClick={cancelEdit} style={{ fontSize: "0.72rem", padding: "0.18rem 0.55rem" }}>Cancel</button>
                          <button className="btn btn-primary" onClick={commitEdit} style={{ fontSize: "0.72rem", padding: "0.18rem 0.65rem" }}>Save</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
                          <strong style={{ fontSize: "0.88rem", lineHeight: 1.25 }}>{m.title}</strong>
                          <div style={{ display: "flex", gap: "0.18rem", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: "0.66rem", padding: "0.1rem 0.35rem", color: "var(--muted)" }}
                              onClick={() => startEdit(m)}
                              title="Edit this card"
                            >✎ Edit</button>
                            {isCustomized && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: "0.66rem", padding: "0.1rem 0.35rem", color: "var(--muted)" }}
                                onClick={() => resetCard(m.id)}
                                title="Reset to default text"
                              >↺</button>
                            )}
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{m.body}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

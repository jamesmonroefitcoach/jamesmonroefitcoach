"use client";
import { useEffect } from "react";
import type { ExternalExercise } from "@/lib/external-exercises";
import { MOVEMENT_PATTERN_LABELS } from "@/lib/external-exercises";

// Detail overlay: larger media, full taxonomy + instructions, and a reserved
// panel previewing the future AI coaching tags (cues / regressions /
// progressions / feel / difficulty).
export default function ExerciseDetailModal({
  exercise,
  onClose,
}: {
  exercise: ExternalExercise | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (exercise) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [exercise, onClose]);

  if (!exercise) return null;
  const media = exercise.gif_url || exercise.image_urls[0] || null;

  const taxonomy = [
    ["Pattern", MOVEMENT_PATTERN_LABELS[exercise.movement_pattern]],
    ["Body part", exercise.body_part],
    ["Target", exercise.target_muscle],
    ["Equipment", exercise.equipment],
    ["Secondary", exercise.secondary_muscles.join(", ") || null],
  ].filter(([, v]) => Boolean(v)) as [string, string][];

  const aiTags: [string, string][] = [
    ["Cues", exercise.cues.join(" · ")],
    ["Regressions", exercise.regressions.join(" · ")],
    ["Progressions", exercise.progressions.join(" · ")],
    ["Feel", exercise.feel ?? ""],
    ["Difficulty", exercise.difficulty ?? ""],
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23,19,17,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          maxWidth: 720,
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(23,19,17,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "1rem 1.25rem 0.5rem",
            gap: "1rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.3rem" }}>{exercise.name}</h2>
            <p className="meta" style={{ marginTop: "0.15rem" }}>
              {MOVEMENT_PATTERN_LABELS[exercise.movement_pattern]}
              {exercise.source !== "library" ? ` · ${exercise.source}` : " · current library"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: "1.4rem",
              lineHeight: 1,
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) 1fr", gap: "1.25rem", padding: "0.5rem 1.25rem 1.25rem" }}>
          <div
            style={{
              aspectRatio: "1 / 1",
              background: "#efe7d7",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {media ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media} alt={exercise.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>No media</span>
            )}
          </div>

          <div>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.3rem 0.75rem", margin: 0, fontSize: "0.84rem" }}>
              {taxonomy.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.66rem", alignSelf: "center" }}>{k}</dt>
                  <dd style={{ margin: 0 }}>{v}</dd>
                </div>
              ))}
            </dl>

            {exercise.instructions.length > 0 && (
              <div style={{ marginTop: "0.9rem" }}>
                <h3 style={{ fontSize: "0.7rem" }}>Instructions</h3>
                <ol style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem", fontSize: "0.82rem", lineHeight: 1.5 }}>
                  {exercise.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Reserved AI-coaching panel */}
        <div style={{ borderTop: "1px solid var(--line)", padding: "0.9rem 1.25rem 1.25rem", background: "#fbf7ef" }}>
          <h3 style={{ fontSize: "0.7rem", color: "var(--rust)" }}>AI Coaching Tags — reserved</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem", marginTop: "0.5rem" }}>
            {aiTags.map(([k, v]) => (
              <div key={k}>
                <div style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.62rem", color: "var(--muted)" }}>{k}</div>
                <div style={{ fontSize: "0.82rem", color: v ? "var(--ink)" : "var(--line)" }}>{v || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import type { ExternalExercise } from "@/lib/external-exercises";
import { MOVEMENT_PATTERN_LABELS } from "@/lib/external-exercises";

// A single exercise tile: media (GIF / image / placeholder), name, pattern
// badge, and a compact equipment · muscle meta line.
export default function ExerciseCard({
  exercise,
  onSelect,
}: {
  exercise: ExternalExercise;
  onSelect: (e: ExternalExercise) => void;
}) {
  const media = exercise.gif_url || exercise.image_urls[0] || null;
  const meta = [exercise.equipment, exercise.target_muscle].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => onSelect(exercise)}
      style={{
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        padding: 0,
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        overflow: "hidden",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "inherit",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          background: "#efe7d7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media}
            alt={exercise.name}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-heading), Oswald, sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: "0.66rem",
              color: "var(--muted)",
              padding: "0 0.5rem",
              textAlign: "center",
            }}
          >
            No media
          </span>
        )}
        <span
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            background: "var(--rust)",
            color: "#fff",
            fontFamily: "var(--font-heading), Oswald, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "0.58rem",
            fontWeight: 600,
            padding: "0.12rem 0.4rem",
            borderRadius: 3,
          }}
        >
          {MOVEMENT_PATTERN_LABELS[exercise.movement_pattern]}
        </span>
      </div>
      <div style={{ padding: "0.5rem 0.6rem 0.6rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.84rem", lineHeight: 1.25 }}>{exercise.name}</div>
        {meta && (
          <div style={{ marginTop: "0.2rem", fontSize: "0.72rem", color: "var(--muted)" }}>{meta}</div>
        )}
      </div>
    </button>
  );
}

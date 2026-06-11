"use client";
import type { ExternalExercise } from "@/lib/external-exercises";
import ExerciseCard from "./ExerciseCard";

// Responsive auto-fill grid of exercise cards. Empty state is handled by the
// parent (it needs context: which source, whether Supabase is connected, etc).
export default function ExerciseGrid({
  items,
  onSelect,
}: {
  items: ExternalExercise[];
  onSelect: (e: ExternalExercise) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
        gap: "1rem",
      }}
    >
      {items.map((e) => (
        <ExerciseCard key={e.id} exercise={e} onSelect={onSelect} />
      ))}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkoutSheet } from "@/lib/workout-sheets";
import { deleteClientWorkoutSheet } from "./actions";

export default function WorkoutSheetsList({
  clientId,
  initialSheets,
}: {
  clientId: string;
  initialSheets: WorkoutSheet[];
}) {
  const router = useRouter();
  const [sheets, setSheets] = useState(initialSheets);

  function onDeleted(id: string) {
    setSheets((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  if (sheets.length === 0) {
    return (
      <p className="meta" style={{ marginBottom: "1rem" }}>
        No sheets yet. Start a new one above or upload a filled PDF below.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "1rem" }}>
      {sheets.map((s) => (
        <SheetRow key={s.id} sheet={s} clientId={clientId} onDeleted={() => onDeleted(s.id)} />
      ))}
    </div>
  );
}

function SheetRow({
  sheet,
  clientId,
  onDeleted,
}: {
  sheet: WorkoutSheet;
  clientId: string;
  onDeleted: () => void;
}) {
  const [deleting, startDelete] = useTransition();
  const isPdf = sheet.kind === "pdf";
  const href = isPdf ? `/api/workout-sheets/${sheet.id}/pdf` : `/coach/programming/templates?sheet=${sheet.id}`;

  function handleDelete() {
    if (!confirm(`Delete "${sheet.name}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const res = await deleteClientWorkoutSheet(sheet.id, clientId);
      if (res.ok) onDeleted();
    });
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.45rem",
      padding: "0.5rem 0.7rem",
      border: "1px solid var(--line)", borderRadius: 4,
      background: "var(--paper)",
    }}>
      <Link
        href={href}
        target={isPdf ? "_blank" : undefined}
        rel={isPdf ? "noopener" : undefined}
        style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.6rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
            {sheet.name}
            {isPdf && (
              <span style={{
                marginLeft: "0.5rem",
                fontFamily: "var(--font-heading), Oswald, sans-serif",
                fontSize: "0.6rem", letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--rust)",
              }}>PDF</span>
            )}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
            {new Date(sheet.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        title="Delete this sheet"
        style={{
          fontSize: "0.68rem", lineHeight: 1,
          padding: "0.18rem 0.38rem", borderRadius: 3,
          border: "1px solid var(--line)", background: "transparent",
          color: "var(--muted)", cursor: "pointer", fontFamily: "inherit",
          flexShrink: 0,
        }}
      >{deleting ? "…" : "✕"}</button>
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientProgramRow } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { deleteProgram } from "./actions";

function kindLabel(p: ClientProgramRow): string {
  return p.program_kind === "at_home" ? "In App" : "Template";
}

function programHref(p: ClientProgramRow, clientId: string): string {
  if (p.program_kind === "at_home") {
    return `/coach/programming/build/new-way?type=program&client=${clientId}&program=${p.id}`;
  }
  if (p.workout_sheet_id) {
    return `/coach/programming/templates?sheet=${p.workout_sheet_id}`;
  }
  return `/coach/programming/templates`;
}

function ProgramRow({
  program,
  clientId,
  onDeleted,
}: {
  program: ClientProgramRow;
  clientId: string;
  onDeleted: () => void;
}) {
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete "${program.name}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const res = await deleteProgram(program.id, clientId);
      if (res.ok) onDeleted();
    });
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.5rem",
      padding: "0.4rem 0.55rem",
      border: "1px solid var(--line)", borderRadius: 4,
      background: "var(--paper)",
    }}>
      <Link
        href={programHref(program, clientId)}
        style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "var(--ink)" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "var(--font-heading), Oswald, sans-serif",
            fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--rust)", flexShrink: 0,
          }}>{kindLabel(program)}</span>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{program.name}</span>
        </div>
        <div className="meta" style={{ fontSize: "0.68rem", marginTop: "0.1rem" }}>
          {fmtDate(program.starts_on)}{program.ends_on ? ` → ${fmtDate(program.ends_on)}` : ""}
          {!program.is_current && (
            <span style={{ marginLeft: "0.4rem", color: "var(--muted)" }}>· past</span>
          )}
          {program.is_published && (
            <span className="badge badge-sage" style={{ marginLeft: "0.4rem", fontSize: "0.58rem" }}>published</span>
          )}
        </div>
      </Link>
      <Link
        href={programHref(program, clientId)}
        style={{ color: "var(--rust)", fontSize: "0.76rem", flexShrink: 0 }}
      >→</Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        title="Delete this program"
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

export default function ProgramsSection({
  clientId,
  initialPrograms,
}: {
  clientId: string;
  initialPrograms: ClientProgramRow[];
}) {
  const router = useRouter();
  const [programs, setPrograms] = useState(initialPrograms);
  const [pastOpen, setPastOpen] = useState(false);

  function onDeleted(id: string) {
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  const current = programs.filter((p) => p.is_current);
  const past = programs.filter((p) => !p.is_current);

  if (programs.length === 0) {
    return (
      <p className="meta" style={{ marginTop: "0.5rem" }}>
        No programs yet.{" "}
        <Link href={`/coach/programming/build/new-way?type=program&client=${clientId}`}>Build one →</Link>
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
      {current.map((p) => (
        <ProgramRow key={p.id} program={p} clientId={clientId} onDeleted={() => onDeleted(p.id)} />
      ))}

      {past.length > 0 && (
        <div style={{ marginTop: "0.25rem" }}>
          <button
            type="button"
            onClick={() => setPastOpen((v) => !v)}
            style={{
              background: "none", border: "none",
              borderTop: "1px dashed var(--line)",
              width: "100%", padding: "0.35rem 0",
              cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "space-between",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
              {pastOpen ? "▾" : "▸"} Past programs
            </span>
            <span className="meta" style={{ fontSize: "0.7rem" }}>{past.length}</span>
          </button>
          {pastOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.3rem" }}>
              {past.map((p) => (
                <ProgramRow key={p.id} program={p} clientId={clientId} onDeleted={() => onDeleted(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

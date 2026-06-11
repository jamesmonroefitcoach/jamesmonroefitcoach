"use client";
import { useState } from "react";
import Link from "next/link";
import type { ClientProgramRow } from "@/lib/data";
import { fmtDate } from "@/lib/format";

// Current + Completed collapsible sections. Current cards have a Complete
// button that jumps to the Sheet vs In-App Inputs choice page.
export default function ViewProgramsClient({
  current,
  completed,
}: {
  current: ClientProgramRow[];
  completed: ClientProgramRow[];
}) {
  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Programming</h1>
        <p className="meta">
          Programs your coach has assigned plus the ones you&rsquo;ve built. Tap a current
          program to complete it — fill in the sheet, upload a filled PDF, or log set-by-set
          in the app.
        </p>
      </header>
      <hr className="divider" />

      <Section title="Current" count={current.length} defaultOpen={true}>
        {current.length === 0 ? (
          <Empty text="Nothing in progress. New programs from James will show up here." />
        ) : (
          current.map((p) => <ProgramCard key={p.id} p={p} isCurrent />)
        )}
      </Section>

      <Section title="Completed" count={completed.length} defaultOpen={false}>
        {completed.length === 0 ? (
          <Empty text="Nothing completed yet. Sessions you finish move here automatically." />
        ) : (
          completed.map((p) => <ProgramCard key={p.id} p={p} isCurrent={false} />)
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  count,
  children,
  defaultOpen,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        marginBottom: "0.85rem",
        overflow: "hidden",
        background: "var(--paper)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "rgba(0,0,0,0.025)",
          border: "none",
          padding: "0.55rem 0.85rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-heading), Oswald, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {open ? "▾" : "▸"} {title}
        </span>
        <span className="meta" style={{ fontSize: "0.74rem" }}>
          {count} {count === 1 ? "program" : "programs"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0.65rem 0.85rem 0.95rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {children}
        </div>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="meta" style={{ fontStyle: "italic", margin: "0.4rem 0.1rem", fontSize: "0.82rem" }}>
      {text}
    </p>
  );
}

function ProgramCard({ p, isCurrent }: { p: ClientProgramRow; isCurrent: boolean }) {
  const range = p.starts_on
    ? `${fmtDate(p.starts_on)}${p.ends_on ? ` → ${fmtDate(p.ends_on)}` : ""}`
    : null;
  const kindLabel = p.program_kind === "at_home" ? "At-home" : "In-gym session";

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.6rem",
        padding: "0.7rem 0.85rem",
        borderLeft: isCurrent ? "4px solid var(--rust)" : undefined,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.95rem" }}>{p.name}</strong>
          <span className="badge" style={{ fontSize: "0.6rem" }}>{kindLabel}</span>
          {p.workout_sheet_kind === "pdf" && (
            <span
              className="badge"
              style={{ fontSize: "0.58rem", color: "var(--rust)", borderColor: "var(--rust)" }}
              title="Uploaded PDF on file"
            >
              PDF
            </span>
          )}
          {p.created_by_client && (
            <span
              className="badge"
              style={{ fontSize: "0.58rem", color: "var(--clay)", borderColor: "var(--clay)" }}
              title="Built by you in the in-app builder"
            >
              Client made
            </span>
          )}
        </div>
        <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>
          {range ?? "no dates set"}
          {p.duration_weeks ? ` · ${p.duration_weeks}wk` : ""}
          {p.at_home_cadence ? ` · ${p.at_home_cadence}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flex: "none" }}>
        <Link
          href={`/client/programming/view/${p.id}`}
          className="btn btn-ghost"
          style={{ padding: "0.36rem 0.7rem", fontSize: "0.78rem", whiteSpace: "nowrap" }}
        >
          View
        </Link>
        {isCurrent && (
          <Link
            href={`/client/programming/programs/${p.id}/complete`}
            className="btn btn-primary"
            style={{ padding: "0.36rem 0.7rem", fontSize: "0.78rem", whiteSpace: "nowrap" }}
          >
            Complete →
          </Link>
        )}
      </div>
    </div>
  );
}

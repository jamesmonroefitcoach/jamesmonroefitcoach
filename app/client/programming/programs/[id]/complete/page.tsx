import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listProgramsForClient } from "@/lib/data";

// Per-program completion choice page.
//   ┌ Fill in the SHEET     ┐   ┌ Use IN-APP INPUTS     ┐
//   │ Type into the workout │   │ Per-set logger:       │
//   │ sheet OR upload a     │   │ reps, weight, notes,  │
//   │ filled PDF.           │   │ tap to mark each set. │
//   └───────────────────────┘   └───────────────────────┘
// Both write to the same underlying program record so James sees progress
// from either side automatically.
export default async function CompleteProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const { id } = await params;
  const programs = await listProgramsForClient(user.id);
  const program = programs.find((p) => p.id === id);
  if (!program) notFound();

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>{program.name}</h1>
        <p className="meta">
          {program.program_kind === "at_home" ? "At-home program" : "In-gym session"}
          {program.duration_weeks ? ` · ${program.duration_weeks} weeks` : ""}
          {program.at_home_cadence ? ` · ${program.at_home_cadence}` : ""}
        </p>
      </header>
      <hr className="divider" />

      <section style={{ marginBottom: "0.85rem" }}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
          How do you want to complete this?
        </h2>
        <p className="meta" style={{ fontSize: "0.84rem" }}>
          Pick either — both update the same program record. Anything you adjust from what James
          prescribed gets flagged on his side so he can see what changed.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <ChoiceCard
          title="Fill in the Sheet"
          tag="Sheet"
          description="Open the workout sheet and type set-by-set as you go. Or, after the workout, upload a filled-in PDF and James will see it the same way."
          ctaLabel="Open Sheet →"
          ctaHref={
            program.workout_sheet_id
              ? `/client/programming/build/template?sheet=${program.workout_sheet_id}`
              : `/client/programming/build/sheets?program=${program.id}`
          }
        />
        <ChoiceCard
          title="Use In-App Inputs"
          tag="In-App"
          description="Per-set logger: enter reps and weight for each set, add a quick note, tap to mark sets complete. Anything you change from what James prescribed gets flagged automatically."
          ctaLabel="Open Logger →"
          ctaHref={`/client/programming/build/rework?program=${program.id}`}
        />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <Link
          href="/client/programming"
          className="btn btn-ghost"
          style={{ fontSize: "0.84rem" }}
        >
          ← Back to Programming
        </Link>
      </div>
    </main>
  );
}

function ChoiceCard({
  title,
  tag,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  tag: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "1rem 1.1rem",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          fontFamily: "Oswald, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: "0.6rem",
          fontWeight: 600,
          color: "var(--rust)",
        }}
      >
        {tag}
      </div>
      <h3 style={{ margin: "0.2rem 0 0.5rem", fontSize: "1.05rem" }}>{title}</h3>
      <p className="meta" style={{ fontSize: "0.82rem", lineHeight: 1.45, flex: 1 }}>{description}</p>
      <Link
        href={ctaHref}
        className="btn btn-primary"
        style={{ marginTop: "0.85rem", alignSelf: "flex-start" }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

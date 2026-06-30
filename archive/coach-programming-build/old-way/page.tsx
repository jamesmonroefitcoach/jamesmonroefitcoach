import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";

// Legacy holding pen — the four entry points that pre-date the merged
// In App Build. Kept around so nothing's lost while the new flow matures.
export default async function OldWayPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "1rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Old Way</h1>
        <p className="meta">
          The legacy program-build entry points, kept here while the merged{" "}
          <strong>In App Build</strong> matures. Anything saved through these still
          flows into the same program records.
        </p>
      </header>
      <hr className="divider" />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <Card
          title="Build (Classic)"
          href="/coach/programming/build"
          description="The original Build Program UI — the one that pre-dates all the WIPs. Works for both in-gym sessions and at-home programs via the program_kind toggle."
        />
        <Card
          title="Build Session"
          href="/coach/programming/build/session"
          description="Per-appointment session program editor. Tied to a scheduled appointment row; use this when the session is already on the calendar."
        />
        <Card
          title="Sessions Rework (standalone)"
          href="/coach/programming/build/rework"
          description="The in-gym session planner with Perform mode, accessed directly. Same as the In App Build → Session view but reachable without the type selector."
        />
        <Card
          title="Programs Rework (standalone)"
          href="/coach/programming/build/programs-rework"
          description="The at-home builder with Day ↔ Week toggle, accessed directly. Same as the In App Build → Program view but reachable without the type selector."
        />
      </section>
    </main>
  );
}

function Card({
  title,
  href,
  description,
}: {
  title: string;
  href: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "0.9rem 1rem",
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--paper)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{title}</div>
      <p
        className="meta"
        style={{ marginTop: "0.4rem", fontSize: "0.78rem", lineHeight: 1.4 }}
      >
        {description}
      </p>
      <div
        style={{
          marginTop: "0.6rem",
          fontFamily: "Oswald, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: "0.62rem",
          fontWeight: 600,
          color: "var(--rust)",
        }}
      >
        Open →
      </div>
    </Link>
  );
}

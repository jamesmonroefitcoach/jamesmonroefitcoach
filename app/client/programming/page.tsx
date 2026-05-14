import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { listProgramsForClient, type ClientProgramRow } from "@/lib/data";
import { fmtDate } from "@/lib/format";

// Client-side Programming landing — View Program.
// Lists are split into Coach Assigned (created_by_client=false) and Created
// (created_by_client=true). Each row links to the per-program log view.

export default async function ClientProgrammingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const programs = await listProgramsForClient(user.id);
  const assigned = programs.filter((p) => !p.created_by_client && p.is_published);
  const created  = programs.filter((p) => p.created_by_client);

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>View Program</h1>
        <p className="meta">Your assigned programs and the ones you&apos;ve built yourself.</p>
      </header>
      <hr className="divider" />

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.45rem", paddingBottom: "0.3rem", borderBottom: "2px solid var(--line)" }}>
          Coach Assigned <span className="meta" style={{ fontSize: "0.74rem", fontWeight: 400, marginLeft: "0.5rem" }}>{assigned.length}</span>
        </h2>
        {assigned.length === 0 ? (
          <p className="meta" style={{ fontStyle: "italic", margin: "0.4rem 0.1rem" }}>
            Nothing here yet. Programs James pushes to you will show up here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {assigned.map((p) => <ProgramCard key={p.id} p={p} />)}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.45rem", paddingBottom: "0.3rem", borderBottom: "2px solid var(--line)" }}>
          Created <span className="meta" style={{ fontSize: "0.74rem", fontWeight: 400, marginLeft: "0.5rem" }}>{created.length}</span>
        </h2>
        {created.length === 0 ? (
          <p className="meta" style={{ fontStyle: "italic", margin: "0.4rem 0.1rem" }}>
            Nothing here yet. Build your own programs from the <strong>Build Program</strong> tab — they&apos;ll show up here once you save.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {created.map((p) => <ProgramCard key={p.id} p={p} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function ProgramCard({ p }: { p: ClientProgramRow }) {
  const range = p.starts_on
    ? `${fmtDate(p.starts_on)}${p.ends_on ? ` → ${fmtDate(p.ends_on)}` : ""}`
    : null;
  const kindLabel = p.program_kind === "at_home" ? "At-home" : "In-gym session";
  return (
    <Link
      href={`/client/programming/view/${p.id}`}
      className="card"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "0.6rem", padding: "0.65rem 0.85rem",
        textDecoration: "none", color: "var(--ink)",
        borderLeft: p.is_current ? "4px solid var(--rust)" : undefined,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.95rem" }}>{p.name}</strong>
          <span className="badge" style={{ fontSize: "0.6rem" }}>{kindLabel}</span>
          {p.is_current && <span className="badge badge-sage" style={{ fontSize: "0.6rem" }}>current</span>}
        </div>
        <div className="meta" style={{ fontSize: "0.74rem", marginTop: "0.18rem" }}>
          {range ?? "no dates set"}
          {p.duration_weeks ? ` · ${p.duration_weeks}wk` : ""}
          {p.at_home_cadence ? ` · ${p.at_home_cadence}` : ""}
        </div>
      </div>
      <span style={{ color: "var(--rust)", fontSize: "0.86rem", fontWeight: 600 }}>Open →</span>
    </Link>
  );
}

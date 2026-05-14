import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

// Client-side Programming landing — View Program is the first sub-tab.
// Lists are split into Coach Assigned and Created (built by the client).
// Content here is intentionally minimal in this chunk — Log Day / Log Week
// flows + program rendering ship in the next chunk.

export default async function ClientProgrammingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>View Program</h1>
        <p className="meta">Your assigned programs and the ones you&apos;ve built yourself.</p>
      </header>
      <hr className="divider" />

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.4rem", paddingBottom: "0.3rem", borderBottom: "2px solid var(--line)" }}>
          Coach Assigned
        </h2>
        <p className="meta" style={{ fontStyle: "italic", margin: "0.4rem 0.1rem" }}>
          Nothing here yet. Programs James pushes to you will show up here.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.4rem", paddingBottom: "0.3rem", borderBottom: "2px solid var(--line)" }}>
          Created
        </h2>
        <p className="meta" style={{ fontStyle: "italic", margin: "0.4rem 0.1rem" }}>
          Nothing here yet. Build your own programs from the <strong>Build Program</strong> tab — they&apos;ll show up here once you save.
        </p>
      </section>
    </main>
  );
}

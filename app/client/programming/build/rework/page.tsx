import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

// Sessions Rework / live per-set logger — client side.
// Stub for now; the full Perform-mode port (Phase 4) lands here.
export default async function ClientSessionsReworkPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "1.25rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Sessions Rework</h1>
        <p className="meta">
          Live in-app workout logger — coming soon. For now use the Sheets tab to fill out a workout
          sheet, or have James upload a filled PDF on your behalf.
        </p>
      </header>
      <hr className="divider" />
      <section
        style={{
          border: "1px dashed var(--line)",
          borderRadius: 6,
          padding: "1.5rem",
          textAlign: "center",
          color: "var(--muted)",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.92rem" }}>
          A structured per-set logger (weight + reps + notes for every set) is being built here.
          It&rsquo;ll write directly to the same program your coach sees, so anything you log shows
          up on his side in real time.
        </p>
      </section>
    </main>
  );
}

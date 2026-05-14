import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function ClientBuildProgramPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Build Program</h1>
        <p className="meta">Build your own program with the same toolkit James uses.</p>
      </header>
      <hr className="divider" />
      <section className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Coming soon</h2>
        <p style={{ fontSize: "0.86rem", marginTop: "0.45rem", lineHeight: 1.5 }}>
          The client-side builder is being wired up next. When it lands, you&apos;ll be able to draft Day-level or
          Week-level programs for yourself, save them, and (optionally) request notes from James. Imports will be
          limited to your past programs — both ones you built and ones James has assigned to you.
        </p>
      </section>
    </main>
  );
}

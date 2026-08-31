import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import PeriodizationEmbed from "./periodization-embed";

// Coach-only printable periodization reference. Same shape as the Week Plan
// and Vocabulary sheets: two pages James prints or saves as a PDF and hands to
// a client. Every number on it is sourced, and the sources print with it.
export default async function CoachPeriodizationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print">
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Periodized Training</h1>
        <p className="meta">
          Two pages: the load, rep, set, rest and effort ranges on page one, how they move across a
          block on page two, with the research each number came from listed at the end. Hit Save PDF
          and send it.{" "}
          <a href="/periodization.html" target="_blank" rel="noopener noreferrer">
            Open in its own tab
          </a>
          .
        </p>
      </header>
      <PeriodizationEmbed />
    </main>
  );
}

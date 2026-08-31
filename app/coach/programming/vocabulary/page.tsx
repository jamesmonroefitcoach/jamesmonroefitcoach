import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import VocabularyEmbed from "./vocabulary-embed";

// Coach-only printable exercise vocabulary. Same shape as the Week Plan: a
// sheet James prints or saves as a PDF and hands to a client, so the names on
// their workout sheet mean something. Clients get no link to it.
export default async function CoachVocabularyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print">
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Exercise Vocabulary</h1>
        <p className="meta">
          Every movement in the library, grouped the way it gets written on a sheet. Tick what a
          client has already done, or leave it blank as a plain reference, then hit Save PDF and
          send it.{" "}
          <a href="/exercise-vocabulary.html" target="_blank" rel="noopener noreferrer">
            Open in its own tab
          </a>
          .
        </p>
      </header>
      <VocabularyEmbed />
    </main>
  );
}

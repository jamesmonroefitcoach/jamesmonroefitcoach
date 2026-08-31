import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import CueCardsEmbed from "./cue-cards-embed";

// Coach-only printable cue cards. James ticks the movements a client just
// learned, edits any cue wording he disagrees with, and sends the PDF along
// with their gym homework. Cue text starts from the generated library in
// docs/research/exercise-backfill-content-partial.json, which was never
// coach-verified, so every card is editable by design.
export default async function CoachCuesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print">
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Exercise Cues</h1>
        <p className="meta">
          Tick the movements a client just learned and only those print. Read the cues before you
          send them, they are a starting draft and every one is editable.{" "}
          <a href="/cue-cards.html" target="_blank" rel="noopener noreferrer">
            Open in its own tab
          </a>
          .
        </p>
      </header>
      <CueCardsEmbed />
    </main>
  );
}

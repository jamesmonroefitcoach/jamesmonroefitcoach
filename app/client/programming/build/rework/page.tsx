import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getProgramForLogging } from "@/lib/program-logger";
import PerSetLogger from "./per-set-logger";

// Live in-app per-set logger for clients. Ported from the coach Sessions
// Rework "Perform" mode and adapted for the client side.
//
//   /client/programming/build/rework?program=<id>
//
// Without a ?program= we fall back to a friendly "pick something from View"
// landing page.
export default async function ClientPerSetLoggerPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const sp = await searchParams;
  const programId = sp.program;

  if (!programId) {
    return (
      <main className="shell" style={{ paddingTop: "1.25rem" }}>
        <header>
          <span className="badge">My Portal</span>
          <h1 style={{ marginTop: "0.5rem" }}>Per-set Logger</h1>
          <p className="meta">
            Open this from a current program in <Link href="/client/programming">View</Link> — tap
            <strong> Complete </strong>and pick <strong>Use In-App Inputs</strong>.
          </p>
        </header>
      </main>
    );
  }

  const program = await getProgramForLogging(programId, user.id);
  if (!program) {
    return (
      <main className="shell" style={{ paddingTop: "1.25rem" }}>
        <header>
          <span className="badge">My Portal</span>
          <h1 style={{ marginTop: "0.5rem" }}>Per-set Logger</h1>
          <p className="meta">Program not found. <Link href="/client/programming">Back to View</Link></p>
        </header>
      </main>
    );
  }

  return <PerSetLogger program={program} />;
}

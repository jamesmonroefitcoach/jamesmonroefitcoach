import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getProgramForClient } from "@/lib/data";
import ClientProgramLogView from "./client-program-log-view";
import WorkoutSheetEmbed from "@/components/workout-sheet-embed";

export default async function ClientProgramViewPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/");

  const { programId } = await params;
  const prog = await getProgramForClient(programId, user.id);
  if (!prog) return notFound();

  // Template-built programs keep their content in the workout sheet, so
  // builder_state is empty and the per-day logger would show "no exercises".
  // Render the sheet itself instead: James's structure is frozen (client-lock),
  // and the client fills in their own weights and notes.
  const bs = (prog.builder_state ?? {}) as { days?: unknown[]; kind?: string; weekItems?: unknown[] };
  const hasBuilderDays =
    (Array.isArray(bs.days) && bs.days.length > 0) ||
    (bs.kind === "week" && Array.isArray(bs.weekItems) && bs.weekItems.length > 0);
  const showSheet = !!prog.workout_sheet_id && (prog.build_format === "template" || !hasBuilderDays);

  if (showSheet) {
    return (
      <main className="shell" style={{ paddingTop: "0.75rem" }}>
        <header>
          <Link href="/client/programming" className="meta" style={{ fontSize: "0.74rem" }}>← Back to Programming</Link>
          <h1 style={{ margin: "0.3rem 0 0.2rem" }}>{prog.name}</h1>
          <p className="meta" style={{ fontSize: "0.82rem", margin: 0 }}>
            James&rsquo;s plan is locked. Fill in your weights and notes as you train and he&rsquo;ll see your inputs.
          </p>
        </header>
        <hr className="divider" />
        <WorkoutSheetEmbed
          user={{ id: user.id, name: user.name, role: user.role }}
          sheetId={prog.workout_sheet_id ?? undefined}
        />
      </main>
    );
  }

  return <ClientProgramLogView program={prog} clientId={user.id} />;
}

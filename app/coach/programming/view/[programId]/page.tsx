import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { getOrCreatePairedSheet } from "@/lib/programs-sheets-bridge";
import WorkoutSheetEmbed from "@/components/workout-sheet-embed";

// Coach read-only view of a program. Shows the program's latest sheet
// (including any client updates) — not the build workspace. "Edit" jumps to
// the builder. No In App | Template toggle: a program is shown as the one
// thing it is.
export default async function CoachProgramView({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/");

  const { programId } = await params;
  if (!hasSupabaseEnv()) return notFound();
  const supabase = createSupabaseAdmin();
  const { data: prog } = await supabase
    .from("programs")
    .select("id, name, coach_id, client_id, starts_on, ends_on")
    .eq("id", programId)
    .eq("coach_id", user.id)
    .maybeSingle<{ id: string; name: string; coach_id: string; client_id: string | null; starts_on: string | null; ends_on: string | null }>();
  if (!prog) return notFound();

  const sheetId = await getOrCreatePairedSheet(programId);
  const editHref = `/coach/programming/build/new-way?type=program&client=${prog.client_id ?? ""}&program=${prog.id}`;

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <Link href="/coach/programming" className="meta" style={{ fontSize: "0.74rem" }}>← View Programs</Link>
          <h1 style={{ margin: "0.3rem 0 0.1rem" }}>{prog.name}</h1>
          <p className="meta" style={{ fontSize: "0.82rem", margin: 0 }}>
            Read-only · latest version, including any client updates
          </p>
        </div>
        <Link href={editHref} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>Edit →</Link>
      </header>
      <hr className="divider" />
      {sheetId ? (
        <WorkoutSheetEmbed
          user={{ id: user.id, name: user.name, role: user.role }}
          clients={[]}
          sessions={[]}
          sheetId={sheetId}
          viewOnly
        />
      ) : (
        <p className="meta" style={{ fontStyle: "italic" }}>This program doesn&apos;t have a sheet yet. Hit Edit to build it.</p>
      )}
    </main>
  );
}

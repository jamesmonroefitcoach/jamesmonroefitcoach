import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/programs";
import { loadLibrary } from "@/lib/movement-matcher";
import ReviewQueueClient from "./review-queue-client";

// Movement Mapping Review Queue.
//
// When the bridge syncs sheet rows into program_movements, the matcher tries
// to identify which library movement each free-text row refers to. Confident
// matches stamp mapping_source='auto'; anything below the threshold lands
// here as 'unmapped'. James reviews these and either:
//   - assigns the row to an existing library movement, or
//   - creates a new movement from the typed text.
export default async function MovementReviewQueuePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && user.role !== "admin" && !user.is_admin) redirect("/");

  type Row = {
    id: string;
    name_text: string | null;
    equipment_text: string | null;
    notes_text: string | null;
    sets: number | null;
    reps: string | null;
    weight: string | null;
    program_id: string;
    program_name: string;
    client_id: string;
    client_name: string;
  };

  let rows: Row[] = [];
  if (hasSupabaseEnv()) {
    const { data } = await createSupabaseAdmin()
      .from("program_movements")
      .select(
        "id, name_text, equipment_text, notes_text, sets, reps, weight, " +
        "program_days:program_day_id ( program_id, programs:program_id ( id, name, client_id, profiles:client_id ( full_name ) ) )"
      )
      .eq("mapping_source", "unmapped")
      .order("name_text");
    rows = (data ?? []).flatMap((r: unknown): Row[] => {
      const x = r as {
        id: string;
        name_text: string | null;
        equipment_text: string | null;
        notes_text: string | null;
        sets: number | null;
        reps: string | null;
        weight: string | null;
        program_days?: {
          program_id?: string;
          programs?: {
            id?: string;
            name?: string;
            client_id?: string;
            profiles?: { full_name?: string } | { full_name?: string }[] | null;
          } | { id?: string; name?: string; client_id?: string; profiles?: { full_name?: string } | { full_name?: string }[] | null }[] | null;
        } | { program_id?: string; programs?: unknown }[] | null;
      };
      const days = Array.isArray(x.program_days) ? x.program_days[0] : x.program_days;
      const progRaw = days?.programs;
      const prog = Array.isArray(progRaw) ? progRaw[0] : (progRaw as { id?: string; name?: string; client_id?: string; profiles?: { full_name?: string } | { full_name?: string }[] | null } | undefined);
      if (!prog?.id || !prog.client_id) return [];
      const profilesRaw = prog.profiles;
      const profile = Array.isArray(profilesRaw) ? profilesRaw[0] : profilesRaw;
      return [{
        id: x.id,
        name_text: x.name_text,
        equipment_text: x.equipment_text,
        notes_text: x.notes_text,
        sets: x.sets,
        reps: x.reps,
        weight: x.weight,
        program_id: prog.id,
        program_name: prog.name ?? "Untitled program",
        client_id: prog.client_id,
        client_name: profile?.full_name ?? "—",
      }];
    });
  }

  const library = await loadLibrary();
  const categories = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Movement Mapping Review</h1>
        <p className="meta">
          Free-text movements typed into the sheet that the matcher couldn&rsquo;t confidently link
          to a library entry. Either pick the right movement or create a new one — once mapped,
          a row won&rsquo;t reappear here.
        </p>
      </header>
      <hr className="divider" />

      {rows.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic", padding: "0.85rem 0.4rem" }}>
          Nothing to review — every free-text row has been mapped or is still pending sync.
        </p>
      ) : (
        <ReviewQueueClient
          rows={rows}
          library={library.map((m) => ({ id: m.id, name: m.name, category: m.category, equipment: m.equipment }))}
          categories={categories}
        />
      )}
    </main>
  );
}

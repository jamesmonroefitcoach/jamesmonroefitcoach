import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { libraryExercises } from "@/lib/external-exercises";
import { listCachedExercises } from "@/lib/external-exercises.server";
import ExplorerClient from "./explorer-client";

// Directional sandbox to compare external GIF/image libraries against the
// app's own movement taxonomy. Cached rows come from Supabase; the current
// library is derived from LIBRARY_HIERARCHY and always available.
export default async function ExerciseExplorerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach" && !user.is_admin) redirect("/");

  const supabaseReady = hasSupabaseEnv();
  const cached = supabaseReady ? await listCachedExercises() : [];
  const library = libraryExercises();

  return <ExplorerClient cached={cached} library={library} supabaseReady={supabaseReady} />;
}

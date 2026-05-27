// External exercise library — SERVER-ONLY data access (read cache + run sync).
// Uses the service-role Supabase client, so keep this out of client bundles.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  type ExternalExercise,
  type ExerciseSource,
  type ExerciseInsert,
  type MovementPattern,
  normalizeRapidApi,
  normalizeFreeDb,
  FREE_DB_EXERCISES_URL,
} from "@/lib/external-exercises";

const CACHE_COLUMNS =
  "id, source, external_id, name, body_part, target_muscle, secondary_muscles, " +
  "equipment, movement_pattern, gif_url, image_urls, instructions, cues, " +
  "regressions, progressions, feel, difficulty";

export async function listCachedExercises(): Promise<ExternalExercise[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("external_exercises")
    .select(CACHE_COLUMNS)
    .order("name");
  if (error || !data) return [];
  const rows = data as unknown as Record<string, unknown>[];
  return rows.map((row): ExternalExercise => {
    return {
      id: String(row.id),
      source: row.source as ExternalExercise["source"],
      external_id: String(row.external_id),
      name: String(row.name),
      body_part: (row.body_part as string) ?? null,
      target_muscle: (row.target_muscle as string) ?? null,
      secondary_muscles: (row.secondary_muscles as string[]) ?? [],
      equipment: (row.equipment as string) ?? null,
      movement_pattern: ((row.movement_pattern as MovementPattern) ?? "other"),
      gif_url: (row.gif_url as string) ?? null,
      image_urls: (row.image_urls as string[]) ?? [],
      instructions: (row.instructions as string[]) ?? [],
      cues: (row.cues as string[]) ?? [],
      regressions: (row.regressions as string[]) ?? [],
      progressions: (row.progressions as string[]) ?? [],
      feel: (row.feel as string) ?? null,
      difficulty: (row.difficulty as string) ?? null,
    };
  });
}

const RAPIDAPI_HOST = process.env.EXERCISEDB_RAPIDAPI_HOST ?? "exercisedb.p.rapidapi.com";

async function fetchRapidApi(limit: number): Promise<Record<string, unknown>[]> {
  const key = process.env.EXERCISEDB_RAPIDAPI_KEY;
  if (!key) {
    throw new Error(
      "Add EXERCISEDB_RAPIDAPI_KEY to your environment to sync RapidAPI ExerciseDB " +
        "(free key at rapidapi.com → ExerciseDB)."
    );
  }
  const res = await fetch(`https://${RAPIDAPI_HOST}/exercises?limit=${limit}&offset=0`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": RAPIDAPI_HOST },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ExerciseDB responded ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

async function fetchFreeDb(limit: number): Promise<Record<string, unknown>[]> {
  const res = await fetch(FREE_DB_EXERCISES_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`free-exercise-db responded ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as Record<string, unknown>[]).slice(0, limit) : [];
}

export type SyncResult = {
  source: ExerciseSource;
  fetched: number;
  inserted: number;
  skipped: number;
};

export async function syncSource(source: ExerciseSource, limit: number): Promise<SyncResult> {
  if (!hasSupabaseEnv()) {
    throw new Error(
      "Supabase isn't connected — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first."
    );
  }
  const raws = source === "rapidapi" ? await fetchRapidApi(limit) : await fetchFreeDb(limit);
  const normalize = source === "rapidapi" ? normalizeRapidApi : normalizeFreeDb;
  const rows: ExerciseInsert[] = raws.map(normalize);

  const supabase = createSupabaseAdmin();
  // Caching/dedup: unique (source, external_id) + ignoreDuplicates means a
  // re-sync inserts only genuinely new exercises; existing ones are skipped.
  const { data, error } = await supabase
    .from("external_exercises")
    .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);

  const inserted = data?.length ?? 0;
  return { source, fetched: rows.length, inserted, skipped: rows.length - inserted };
}

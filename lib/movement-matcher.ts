// Lexical movement matcher — given a free-text movement string from the
// sheet view, try to identify which library movement it refers to. Pure
// JS, no ML; light enough to run on every row of every sync.
//
// Algorithm: token-set Jaccard similarity between the input and each
// candidate movement name. Score above the threshold → auto-mapped.
// Otherwise the row stays unmapped and lands in the coach review queue.

import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";

const MATCH_THRESHOLD = 0.5;

export type LibraryMovement = {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
};

// Cache library movements per server-request to avoid re-fetching the
// list for every row in a batch sync.
let _libraryCache: { at: number; rows: LibraryMovement[] } | null = null;
const CACHE_MS = 30_000;

export async function loadLibrary(): Promise<LibraryMovement[]> {
  if (!hasSupabaseEnv()) return [];
  const now = Date.now();
  if (_libraryCache && now - _libraryCache.at < CACHE_MS) return _libraryCache.rows;
  const { data } = await createSupabaseAdmin()
    .from("movements")
    .select("id, name, category, equipment")
    .eq("archived", false);
  const rows = (data ?? []) as LibraryMovement[];
  _libraryCache = { at: now, rows };
  return rows;
}

const STOP_TOKENS = new Set([
  "the", "a", "an", "of", "with", "and", "or", "to", "for", "on", "in",
  // strip vague equipment qualifiers when they appear as bare words
  "machine", "bar", "weight",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s\/+-]/g, " ")
      .split(/[\s/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && !STOP_TOKENS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type MatchResult = {
  movement: LibraryMovement;
  score: number;
};

export async function matchMovementByName(
  input: string,
  candidates?: LibraryMovement[]
): Promise<MatchResult | null> {
  const text = input.trim();
  if (!text) return null;
  const library = candidates ?? (await loadLibrary());
  if (library.length === 0) return null;

  const inputTokens = tokenize(text);
  if (inputTokens.size === 0) return null;

  let best: MatchResult | null = null;
  for (const mv of library) {
    const cand = tokenize(mv.name);
    if (cand.size === 0) continue;
    const score = jaccard(inputTokens, cand);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { movement: mv, score };
    }
  }
  return best;
}

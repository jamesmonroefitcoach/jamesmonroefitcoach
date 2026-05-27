import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { syncSource } from "@/lib/external-exercises.server";

// POST /api/exercise-explorer/sync?source=rapidapi|free-db&limit=80
// Fetches the chosen external library, normalizes it, and upserts into the
// `external_exercises` cache (dedup on source + external_id). Coach-only.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || (user.role !== "coach" && !user.is_admin)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "80"), 1), 300);

  if (source !== "rapidapi" && source !== "free-db") {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  try {
    const result = await syncSource(source, limit);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

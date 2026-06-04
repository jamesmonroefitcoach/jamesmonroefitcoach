import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";
import { createSignedPdfUrl, getWorkoutSheet } from "@/lib/workout-sheets.server";

function canSee(user: SessionUser, sheet: { coach_id: string; client_id: string | null }): boolean {
  if (user.is_admin || user.role === "admin") return true;
  if (user.role === "coach" && sheet.coach_id === user.id) return true;
  if (user.role === "client" && sheet.client_id === user.id) return true;
  return false;
}

// GET /api/workout-sheets/[id]/pdf
//   Default: 302 redirect to a short-lived signed URL (so the link Just Works).
//   ?as=json returns { url, filename } instead (for programmatic use).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || !canSee(user, sheet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (sheet.kind !== "pdf" || !sheet.pdf_storage_path) {
    return NextResponse.json({ error: "Not a PDF sheet" }, { status: 400 });
  }
  const url = await createSignedPdfUrl(sheet.pdf_storage_path, 60 * 60);
  if (!url) return NextResponse.json({ error: "Signed URL failed" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  if (searchParams.get("as") === "json") {
    return NextResponse.json({ url, filename: sheet.pdf_original_filename });
  }
  return NextResponse.redirect(url, 302);
}

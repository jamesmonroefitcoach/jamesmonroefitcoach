import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  createWorkoutSheet,
  uploadWorkoutPdf,
} from "@/lib/workout-sheets.server";
import { getOrCreatePairedProgram } from "@/lib/programs-sheets-bridge";

// POST /api/workout-sheets/pdf-upload
//   multipart/form-data with fields:
//     file        — the PDF file
//     name        — display name (optional; defaults to the filename)
//     client_id   — optional
//     session_id  — optional
// Coaches/admins only.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isCoach = user.role === "coach" || user.role === "admin" || user.is_admin;
  if (!isCoach) return NextResponse.json({ error: "Only coaches can upload" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const explicitName = (form.get("name") as string | null) || null;
  const clientId = (form.get("client_id") as string | null) || null;
  const sessionId = (form.get("session_id") as string | null) || null;
  const displayName = explicitName?.trim() || file.name;

  // Path layout: {coachId}/{epoch}-{safeName}
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const bytes = await file.arrayBuffer();
  const up = await uploadWorkoutPdf(path, bytes, file.type || "application/pdf");
  if (!up.ok) return NextResponse.json({ error: up.error || "Upload failed" }, { status: 500 });

  const sheet = await createWorkoutSheet({
    name: displayName,
    kind: "pdf",
    coach_id: user.id,
    client_id: clientId,
    session_id: sessionId,
    pdf_storage_path: path,
    pdf_original_filename: file.name,
    last_edited_by: user.id,
  });
  if (!sheet) return NextResponse.json({ error: "Record save failed" }, { status: 500 });

  // Bridge sync (Step 3): stub-create the paired programs row so the PDF
  // shows up in View Programs / Past Programs alongside non-PDF programs.
  // Only when we have a client_id — orphan PDFs stay PDF-only.
  if (clientId) {
    try { await getOrCreatePairedProgram(sheet.id); } catch (e) { console.error("[pdf-upload] getOrCreatePairedProgram:", e); }
  }

  return NextResponse.json({ sheet });
}

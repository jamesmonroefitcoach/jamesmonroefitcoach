import { NextRequest, NextResponse } from "next/server";
import {
  getWorkoutSheetByPublicToken,
  updateWorkoutSheet,
} from "@/lib/workout-sheets.server";
import { type SheetData } from "@/lib/workout-sheets";
import { syncSheetToProgram } from "@/lib/programs-sheets-bridge";

// Open-access sheet endpoints. No session required — the unguessable token IS
// the capability. Scoped to the single sheet the token resolves to, and writes
// only accept sheet_data (a public caller can't rename or reassign the sheet).

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await getWorkoutSheetByPublicToken(token);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sheet });
}

// PUT /api/public/workout-sheets/[token]   { sheet_data }
// Last-write-wins (no lock), mirroring the authed sheet PUT. Runs the same
// bridge sync so the client's inputs land on the paired program → schedule/log.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await getWorkoutSheetByPublicToken(token);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (body.sheet_data === undefined) {
    return NextResponse.json({ error: "Missing sheet_data" }, { status: 400 });
  }

  const updated = await updateWorkoutSheet(sheet.id, {
    sheet_data: body.sheet_data as SheetData,
    // Attribute the edit to the assigned client when there is one; fall back to
    // the coach so the NOT NULL FK is always satisfied.
    last_edited_by: sheet.client_id ?? sheet.coach_id,
  });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  try {
    await syncSheetToProgram(sheet.id);
  } catch (e) {
    console.error("[public sheet PUT] syncSheetToProgram:", e);
  }

  return NextResponse.json({ sheet: updated });
}

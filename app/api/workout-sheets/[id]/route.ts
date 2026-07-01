import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";
import {
  getWorkoutSheet,
  updateWorkoutSheet,
  deleteWorkoutSheet,
} from "@/lib/workout-sheets.server";
import { type SheetData, type WorkoutSheetStatus } from "@/lib/workout-sheets";
import { syncSheetToProgram } from "@/lib/programs-sheets-bridge";

function canSee(user: SessionUser, sheet: { coach_id: string; client_id: string | null }): boolean {
  if (user.is_admin || user.role === "admin") return true;
  if (user.role === "coach" && sheet.coach_id === user.id) return true;
  if (user.role === "client" && sheet.client_id === user.id) return true;
  return false;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || !canSee(user, sheet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ sheet });
}

// PUT /api/workout-sheets/[id]   { sheet_data?, name?, client_id?, session_id?, status? }
// No edit lock: coach and client can both save (last-write-wins). A session
// left open must never lock the other side out.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || !canSee(user, sheet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const updated = await updateWorkoutSheet(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    client_id: body.client_id === undefined ? undefined : ((body.client_id as string) || null),
    session_id: body.session_id === undefined ? undefined : ((body.session_id as string) || null),
    status: (body.status as WorkoutSheetStatus) ?? undefined,
    sheet_data: (body.sheet_data as SheetData) ?? undefined,
    last_edited_by: user.id,
  });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  // Bridge sync (Step 3): mirror sheet_data into the paired program as
  // free-text rows so the Builder side sees what was typed into the sheet.
  // Best-effort — the sheet save itself is already committed.
  if (body.sheet_data !== undefined) {
    try { await syncSheetToProgram(id); } catch (e) { console.error("[sheet PUT] syncSheetToProgram:", e); }
  }

  return NextResponse.json({ sheet: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isCoach = user.role === "coach" || user.role === "admin" || user.is_admin;
  if (!isCoach) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || !canSee(user, sheet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ok = await deleteWorkoutSheet(id);
  return NextResponse.json({ ok });
}

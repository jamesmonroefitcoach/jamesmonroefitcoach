import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";
import {
  getWorkoutSheet,
  updateWorkoutSheet,
  deleteWorkoutSheet,
  acquireLock,
} from "@/lib/workout-sheets.server";
import { isLockStale, type SheetData, type WorkoutSheetStatus } from "@/lib/workout-sheets";

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
// Soft-locked: if someone else holds a fresh lock, return 423.
// Otherwise, auto-acquire (or refresh) the lock and apply the patch.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || !canSee(user, sheet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isMine = sheet.lock_holder_id === user.id;
  const stale = isLockStale(sheet.lock_acquired_at);
  if (sheet.lock_holder_id && !isMine && !stale) {
    return NextResponse.json(
      { error: "Locked by another user", lock_holder_id: sheet.lock_holder_id, lock_acquired_at: sheet.lock_acquired_at },
      { status: 423 }
    );
  }
  if (!isMine) {
    const lock = await acquireLock(id, user.id);
    if (!lock.ok) {
      return NextResponse.json(
        { error: "Could not acquire lock", lock_holder_id: lock.holder, lock_acquired_at: lock.acquiredAt },
        { status: 423 }
      );
    }
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

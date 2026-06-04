import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/types";
import { acquireLock, getWorkoutSheet, releaseLock } from "@/lib/workout-sheets.server";

function canSee(user: SessionUser, sheet: { coach_id: string; client_id: string | null }): boolean {
  if (user.is_admin || user.role === "admin") return true;
  if (user.role === "coach" && sheet.coach_id === user.id) return true;
  if (user.role === "client" && sheet.client_id === user.id) return true;
  return false;
}

// POST /api/workout-sheets/[id]/lock — acquire (or heartbeat refresh) the lock.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sheet = await getWorkoutSheet(id);
  if (!sheet || !canSee(user, sheet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await acquireLock(id, user.id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, lock_holder_id: result.holder, lock_acquired_at: result.acquiredAt },
      { status: 423 }
    );
  }
  return NextResponse.json({
    ok: true,
    lock_holder_id: result.holder,
    lock_acquired_at: result.acquiredAt,
  });
}

// DELETE /api/workout-sheets/[id]/lock — release if I hold it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await releaseLock(id, user.id);
  return NextResponse.json({ ok });
}

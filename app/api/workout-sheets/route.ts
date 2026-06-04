import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createWorkoutSheet, listWorkoutSheets } from "@/lib/workout-sheets.server";
import type { WorkoutSheetKind } from "@/lib/workout-sheets";

// GET /api/workout-sheets?clientId=&sessionId=&kind=
//   Coaches: see their own sheets (optionally filtered by client/session).
//   Clients: see only their own sheets, always.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdParam = searchParams.get("clientId") || undefined;
  const sessionId = searchParams.get("sessionId") || undefined;
  const kindParam = searchParams.get("kind");
  const kind: WorkoutSheetKind | undefined =
    kindParam === "app" || kindParam === "pdf" ? kindParam : undefined;

  const isCoach = user.role === "coach" || user.role === "admin" || user.is_admin;

  const sheets = await listWorkoutSheets({
    coachId: isCoach ? user.id : undefined,
    clientId: isCoach ? clientIdParam : user.id,
    sessionId,
    kind,
    limit: 100,
  });

  // Admin/coach can see anything they own; client only sees their own.
  return NextResponse.json({ sheets });
}

// POST /api/workout-sheets   { name, kind?, client_id?, session_id?, sheet_data?, status? }
// Only coaches/admins create new sheets. Clients edit existing ones.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isCoach = user.role === "coach" || user.role === "admin" || user.is_admin;
  if (!isCoach) return NextResponse.json({ error: "Only coaches can create sheets" }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }

  const sheet = await createWorkoutSheet({
    name: (body.name as string) || "Untitled",
    kind: (body.kind as WorkoutSheetKind) || "app",
    coach_id: user.id,
    client_id: (body.client_id as string) || null,
    session_id: (body.session_id as string) || null,
    sheet_data: (body.sheet_data as never) || null,
    last_edited_by: user.id,
  });
  if (!sheet) return NextResponse.json({ error: "Create failed" }, { status: 500 });
  return NextResponse.json({ sheet });
}

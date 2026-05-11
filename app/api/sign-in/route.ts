import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, type SessionUser } from "@/lib/types";
import { buildSessionCookieValue } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<SessionUser>;
  if (!body?.id || !body?.name || !body?.role) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!["coach", "client", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "bad role" }, { status: 400 });
  }
  const user: SessionUser = {
    id: String(body.id),
    name: String(body.name),
    role: body.role,
    email: body.email ?? null,
    ...(body.is_admin ? { is_admin: true } : {})
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, buildSessionCookieValue(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return NextResponse.json({ ok: true });
}

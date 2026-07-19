import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/types";
import { buildSessionCookieValue } from "@/lib/session";
import { createSupabaseServerForResponse, hasSupabaseEnv } from "@/lib/supabase/server";

// POST /api/sign-in-password   { email, password }
//   Calls supabase.auth.signInWithPassword, attaching the resulting session
//   cookies directly to the NextResponse so they survive the round-trip.
//   Also clears the legacy mfc_session cookie so getSessionUser resolves via
//   Auth on the next request.
export async function POST(req: NextRequest) {
  if (!hasSupabaseEnv()) {
    // Local/offline demo mode: there's no Supabase to authenticate against, so
    // sign in as the demo coach and let the app run end-to-end against the
    // built-in sample roster. Any email/password is accepted. This branch is
    // impossible once NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are set (production).
    const response = NextResponse.json({ ok: true, demo: true });
    response.cookies.set(
      SESSION_COOKIE,
      buildSessionCookieValue({ id: "demo-coach", name: "James Monroe", role: "coach" }),
      { path: "/", httpOnly: true, sameSite: "lax" },
    );
    return response;
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").trim();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const sb = await createSupabaseServerForResponse(response);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

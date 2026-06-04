import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/types";
import { createSupabaseServerForResponse, hasSupabaseEnv } from "@/lib/supabase/server";

// POST /api/sign-in-password   { email, password }
//   Calls supabase.auth.signInWithPassword, attaching the resulting session
//   cookies directly to the NextResponse so they survive the round-trip.
//   Also clears the legacy mfc_session cookie so getSessionUser resolves via
//   Auth on the next request.
export async function POST(req: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
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

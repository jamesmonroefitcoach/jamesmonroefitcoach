import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/types";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";

// POST /api/sign-in-password   { email, password }
//   Calls supabase.auth.signInWithPassword which (via @supabase/ssr) sets the
//   Supabase Auth session cookies. We also clear the legacy mfc_session cookie
//   so getSessionUser resolves through Auth on the next request.
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

  const sb = await createSupabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  // Clear any stale picker session so Auth wins cleanly.
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

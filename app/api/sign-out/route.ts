import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/types";
import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST() {
  // Clear the legacy profile-picker cookie.
  const store = await cookies();
  store.delete(SESSION_COOKIE);

  // Also sign out of Supabase Auth so the next request doesn't resolve back.
  if (hasSupabaseEnv()) {
    try {
      const sb = await createSupabaseServer();
      await sb.auth.signOut();
    } catch {
      /* nothing to do — best-effort cleanup */
    }
  }

  return NextResponse.json({ ok: true });
}

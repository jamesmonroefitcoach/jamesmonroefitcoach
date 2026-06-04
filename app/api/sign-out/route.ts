import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/types";
import { createSupabaseServerForResponse, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear the legacy profile-picker cookie on the outgoing response.
  response.cookies.delete(SESSION_COOKIE);

  // Sign out of Supabase Auth too. Using the response-aware client so
  // Supabase's `setAll` (which clears sb-* tokens) actually writes onto the
  // response that reaches the browser — otherwise the tokens often survive
  // and the next page load re-resolves the auth user.
  if (hasSupabaseEnv()) {
    try {
      const sb = await createSupabaseServerForResponse(response);
      await sb.auth.signOut();
    } catch {
      /* best-effort */
    }
  }

  return response;
}

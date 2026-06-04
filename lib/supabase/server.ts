import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Cookie-aware client — used for auth flows (sign-in, session checks).
// In server components / pages where there's no NextResponse to attach to,
// we write cookies via next/headers `cookies().set` — works for reading the
// current session but, in route handlers, this often does NOT propagate to
// the outgoing response (a Next 15 quirk). Use createSupabaseServerForResponse
// inside route handlers that need to set/clear session cookies reliably.
export async function createSupabaseServer() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items: CookieToSet[]) {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* read-only context */
        }
      }
    }
  });
}

// Route-handler variant: writes cookie changes onto the passed NextResponse so
// they actually reach the browser. Use this for any sign-in / sign-out / session
// flow that modifies auth cookies — otherwise Supabase's `auth.signOut()` /
// `signInWithPassword()` cookie writes can silently fail to propagate.
export async function createSupabaseServerForResponse(response: NextResponse) {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items: CookieToSet[]) {
        items.forEach(({ name, value, options }) => {
          // Write onto the outgoing response (this is what reaches the browser)
          response.cookies.set({ name, value, ...(options ?? {}) });
          // And keep the in-memory store in sync for any later same-request reads.
          try {
            store.set(name, value, options);
          } catch {
            /* read-only context */
          }
        });
      }
    }
  });
}

// Service-role client — bypasses RLS, used for all server-side data fetching
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

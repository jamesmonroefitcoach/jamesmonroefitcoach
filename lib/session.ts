import { cookies } from "next/headers";
import { SESSION_COOKIE, type SessionUser, type Role } from "./types";
import {
  createSupabaseServer,
  createSupabaseAdmin,
  hasSupabaseEnv,
} from "./supabase/server";

// Profiles that get admin privileges regardless of their DB role. Mirrors the
// list in app/login/page.tsx — keep them in sync. (Ryan Mecca has role='client'
// for the clients list but is also an admin.)
const ADMIN_PROFILE_IDS = new Set(["00000000-0000-0000-0000-000000000ad1"]);

type ProfileLite = {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
};

function toSessionUser(p: ProfileLite): SessionUser {
  const admin = ADMIN_PROFILE_IDS.has(p.id) || p.role === "admin";
  return {
    id: p.id,
    name: p.full_name,
    role: p.role,
    email: p.email,
    ...(admin ? { is_admin: true } : {}),
  };
}

function readCookieSession(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SessionUser;
  } catch {
    return null;
  }
}

// Auth resolution:
//   1. Supabase Auth session (real email+password) — preferred when present.
//      Look up the profile by auth_user_id; if no match, fall back to matching
//      by email and back-fill auth_user_id so subsequent sign-ins resolve directly.
//      If Auth says we ARE someone but we can't resolve a profile, we return null
//      (i.e. signed-in but no profile) rather than silently dropping to the
//      legacy cookie — otherwise a stale picker cookie would impersonate the
//      auth-user, which was the previous source of "weird session state".
//   2. Profile-picker cookie (`mfc_session`) — only consulted when no Auth user.
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const legacyRaw = store.get(SESSION_COOKIE)?.value;

  if (hasSupabaseEnv()) {
    let sb;
    try {
      sb = await createSupabaseServer();
    } catch {
      // Couldn't even instantiate the client — leave Auth out of it.
      return readCookieSession(legacyRaw);
    }

    const { data: authData, error: authErr } = await sb.auth.getUser();
    if (authErr) {
      // Network / JWT validation error. Don't silently downgrade — the user
      // explicitly has an auth token, so treat this as a "signed out, please
      // try again" rather than masquerading as their old picker identity.
      // (We still allow the legacy cookie when there's no Auth signal at all.)
      if (!legacyRaw) return null;
      // If they ONLY have the legacy cookie (never signed in via Auth), keep it.
      return readCookieSession(legacyRaw);
    }

    const authUser = authData.user;
    if (authUser) {
      const admin = createSupabaseAdmin();
      const direct = await admin
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("auth_user_id", authUser.id)
        .maybeSingle<ProfileLite>();
      if (direct.error) {
        // Resolved auth user but profile lookup failed — don't fall back.
        return null;
      }
      if (direct.data) return toSessionUser(direct.data);

      // Try linking by email on first sign-in. Only accept an *exact* match
      // (case-folded) — `ilike` could match wildcards. This also rejects empty
      // auth emails.
      const authEmail = authUser.email?.trim().toLowerCase();
      if (authEmail) {
        const byEmail = await admin
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("email", authEmail)
          .maybeSingle<ProfileLite>();
        if (byEmail.error) return null;
        if (byEmail.data) {
          await admin
            .from("profiles")
            .update({ auth_user_id: authUser.id })
            .eq("id", byEmail.data.id);
          return toSessionUser(byEmail.data);
        }
      }

      // Auth user exists but no profile matches. Signed-in-but-nobody.
      return null;
    }
    // No auth user — legitimate picker-user path.
  }

  return readCookieSession(legacyRaw);
}

export function buildSessionCookieValue(user: SessionUser): string {
  return encodeURIComponent(JSON.stringify(user));
}

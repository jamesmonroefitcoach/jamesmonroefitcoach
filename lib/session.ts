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

// Auth resolution:
//   1. Supabase Auth session (real email+password) — preferred when present.
//      Look up the profile by auth_user_id; if no match, fall back to matching
//      by email and back-fill auth_user_id so subsequent sign-ins resolve directly.
//   2. Profile-picker cookie (`mfc_session`) — the legacy login this app shipped
//      with. Stays as the fallback so existing flows keep working while users
//      move to passworded auth.
export async function getSessionUser(): Promise<SessionUser | null> {
  if (hasSupabaseEnv()) {
    try {
      const sb = await createSupabaseServer();
      const {
        data: { user: authUser },
      } = await sb.auth.getUser();
      if (authUser) {
        const admin = createSupabaseAdmin();
        // 1a — direct match on auth_user_id
        let { data: profile } = await admin
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("auth_user_id", authUser.id)
          .maybeSingle<ProfileLite>();
        // 1b — link an existing profile by email on first sign-in
        if (!profile && authUser.email) {
          const { data: byEmail } = await admin
            .from("profiles")
            .select("id, full_name, email, role")
            .ilike("email", authUser.email)
            .maybeSingle<ProfileLite>();
          if (byEmail) {
            await admin
              .from("profiles")
              .update({ auth_user_id: authUser.id })
              .eq("id", byEmail.id);
            profile = byEmail;
          }
        }
        if (profile) return toSessionUser(profile);
      }
    } catch {
      /* fall through to the cookie path */
    }
  }

  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SessionUser;
  } catch {
    return null;
  }
}

export function buildSessionCookieValue(user: SessionUser): string {
  return encodeURIComponent(JSON.stringify(user));
}

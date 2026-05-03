import { cookies } from "next/headers";
import { SESSION_COOKIE, type SessionUser } from "./types";

export async function getSessionUser(): Promise<SessionUser | null> {
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

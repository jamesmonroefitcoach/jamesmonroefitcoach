export type Role = "coach" | "client" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  email?: string | null;
  /** True when this profile has admin privileges regardless of their DB role */
  is_admin?: boolean;
};

export const SESSION_COOKIE = "mfc_session";

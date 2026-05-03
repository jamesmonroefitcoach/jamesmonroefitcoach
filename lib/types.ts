export type Role = "coach" | "client" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  email?: string | null;
};

export const SESSION_COOKIE = "mfc_session";

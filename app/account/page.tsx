import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import AccountForm from "./account-form";

// Signed-in users can set (first time) or change their password here.
// Profile-picker users land here without a Supabase Auth user — the form
// creates and links one on first save; thereafter "Change password" just
// updates the existing auth user.
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let hasPassword = false;
  let email: string | null = user.email ?? null;
  if (hasSupabaseEnv()) {
    const { data } = await createSupabaseAdmin()
      .from("profiles")
      .select("auth_user_id, email")
      .eq("id", user.id)
      .maybeSingle<{ auth_user_id: string | null; email: string | null }>();
    if (data) {
      hasPassword = !!data.auth_user_id;
      email = data.email ?? email;
    }
  }

  return (
    <main
      className="shell"
      style={{ maxWidth: 540, paddingTop: "1.25rem", minHeight: "calc(100vh - 2rem)" }}
    >
      <header>
        <span className="badge">Account</span>
        <h1 style={{ marginTop: "0.5rem" }}>{user.name}</h1>
        <p className="meta">
          {hasPassword
            ? "Update your password. Email + password is the only way you'll sign in once a password is set."
            : "Set a password so you can sign in with email + password instead of picking your profile from a list."}
        </p>
      </header>
      <hr className="divider" />
      <AccountForm
        initialEmail={email ?? ""}
        emailLocked={!!email}
        hasPassword={hasPassword}
      />
    </main>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  createSupabaseAdmin,
  createSupabaseServer,
  hasSupabaseEnv,
} from "@/lib/supabase/server";

// POST /api/account/password   { email?, password }
//   * If the signed-in user has no auth_user_id yet, create a Supabase Auth
//     user with the given email + password and link it to their profile.
//   * If they're already linked, just update the password.
//   In both cases we end by calling auth.signInWithPassword so the Supabase
//   Auth session cookies are set and getSessionUser starts resolving via Auth.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const password = (body.password ?? "").trim();
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, auth_user_id, full_name, role")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      email: string | null;
      auth_user_id: string | null;
      full_name: string;
      role: string;
    }>();
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  // Profile email wins when set; only allow body.email when profile.email is missing.
  const submittedEmail = (body.email ?? "").trim().toLowerCase();
  const email = (profile.email ?? submittedEmail).toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  if (profile.auth_user_id) {
    // Change password on an already-linked auth user.
    const { error } = await admin.auth.admin.updateUserById(profile.auth_user_id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // First-time set: create the auth user + link it onto the profile.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification (extras intentionally out of scope)
      user_metadata: { full_name: profile.full_name, role: profile.role },
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create auth user." },
        { status: 500 }
      );
    }
    const updates: { auth_user_id: string; email?: string } = { auth_user_id: created.user.id };
    if (!profile.email) updates.email = email;
    const { error: linkErr } = await admin.from("profiles").update(updates).eq("id", profile.id);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  // Establish the Supabase Auth session so subsequent requests resolve via Auth.
  const sb = await createSupabaseServer();
  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return NextResponse.json({ error: signInErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

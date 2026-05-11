import { createSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase/server";
import LoginForm from "./login-form";

type ProfileRow = { id: string; full_name: string; email: string | null; role: "coach" | "client" | "admin" };

const FALLBACK_PROFILES: ProfileRow[] = [
  { id: "demo-coach", full_name: "James Monroe", email: "coachjamesmonroe@gmail.com", role: "coach" },
  { id: "demo-admin", full_name: "Admin (you)", email: "ramecca0711@gmail.com", role: "admin" },
  { id: "demo-client-abbey", full_name: "Abbey Archer", email: null, role: "client" },
  { id: "demo-client-acacia", full_name: "Acacia Chan", email: null, role: "client" },
  { id: "demo-client-jen", full_name: "Jen Loving", email: null, role: "client" }
];

async function loadProfiles(): Promise<ProfileRow[]> {
  const hasEnv = hasSupabaseEnv();
  console.log("[login] hasSupabaseEnv:", hasEnv, "| URL:", process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40));
  if (!hasEnv) return FALLBACK_PROFILES;
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });
    console.log("[login] profiles query — count:", data?.length, "| error:", error?.message);
    if (error || !data || data.length === 0) return FALLBACK_PROFILES;
    return data as ProfileRow[];
  } catch (e) {
    console.error("[login] caught exception:", e);
    return FALLBACK_PROFILES;
  }
}

export default async function LoginPage() {
  const profiles = await loadProfiles();
  return (
    <main className="shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <section className="card" style={{ width: "100%", maxWidth: 520 }}>
        <span className="badge">Monroe Fit Coach</span>
        <h1 style={{ marginTop: "0.75rem" }}>Sign in</h1>
        <p className="meta" style={{ marginTop: "0.4rem" }}>
          Pick your profile to continue. (No password — auth comes later.)
        </p>
        <hr className="divider" />
        <LoginForm profiles={profiles} />
        <p className="meta" style={{ marginTop: "1rem", fontSize: "0.82rem", textAlign: "center" }}>
          New here? <a href="/signup">Request an account →</a>
        </p>
      </section>
    </main>
  );
}

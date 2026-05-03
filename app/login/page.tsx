import { createSupabaseServer, hasSupabaseEnv } from "@/lib/supabase/server";
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
  if (!hasSupabaseEnv()) return FALLBACK_PROFILES;
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK_PROFILES;
    return data as ProfileRow[];
  } catch {
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
      </section>
    </main>
  );
}

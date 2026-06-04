"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRow } from "./page";

type Mode = "picker" | "password";

export default function LoginForm({ profiles }: { profiles: ProfileRow[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("picker");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ─── profile-picker state ───
  const [selected, setSelected] = useState(profiles[0]?.id ?? "");
  const grouped = useMemo(() => {
    const g: Record<string, ProfileRow[]> = { coach: [], admin: [], client: [] };
    profiles.forEach((p) => {
      const bucket = p.is_admin ? "admin" : p.role;
      (g[bucket] ??= []).push(p);
    });
    return g;
  }, [profiles]);

  async function submitPicker(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const profile = profiles.find((p) => p.id === selected);
    if (!profile) {
      setErr("Pick a profile.");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: profile.id,
        name: profile.full_name,
        role: profile.role,
        email: profile.email,
        is_admin: profile.is_admin ?? false,
      }),
    });
    if (!res.ok) {
      setErr("Sign in failed.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  // ─── password state ───
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/sign-in-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(json.error ?? "Sign in failed.");
      setBusy(false);
      return;
    }
    // Hard navigation — see app/account/account-form.tsx for why
    // router.refresh() races the Auth cookie write here.
    window.location.assign("/");
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "0.5rem 0.75rem",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--rust)" : "2px solid var(--line)",
    fontFamily: "inherit",
    fontSize: "0.88rem",
    fontWeight: active ? 700 : 400,
    color: active ? "var(--rust)" : "var(--muted)",
    cursor: "pointer",
    letterSpacing: active ? "0.01em" : undefined,
  });
  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "0.95rem",
    padding: "0.45rem 0.55rem",
    border: "1px solid var(--ink)",
    borderRadius: 4,
    background: "var(--paper)",
    color: "var(--ink)",
    width: "100%",
    marginTop: "0.3rem",
  };

  return (
    <div>
      <div style={{ display: "flex", marginBottom: "1rem" }}>
        <button type="button" onClick={() => { setMode("picker"); setErr(""); }} style={tabStyle(mode === "picker")}>
          Pick profile
        </button>
        <button type="button" onClick={() => { setMode("password"); setErr(""); }} style={tabStyle(mode === "password")}>
          Email + Password
        </button>
      </div>

      {mode === "picker" ? (
        <form onSubmit={submitPicker} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="stat-label" htmlFor="profile">Profile</label>
            <select
              id="profile"
              className="select"
              style={{ marginTop: "0.4rem" }}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {(["coach", "admin", "client"] as const).map((role) =>
                (grouped[role] ?? []).length > 0 ? (
                  <optgroup key={role} label={role.toUpperCase()}>
                    {grouped[role]!.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}{p.email ? ` — ${p.email}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              )}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Signing in..." : "Continue"}
          </button>
          {err ? <p style={{ color: "var(--red)" }}>{err}</p> : null}
          <p className="meta" style={{ fontSize: "0.78rem" }}>
            New client? Account requests come in via the public sign-up form (coming soon). For now, ask James to add you.
          </p>
        </form>
      ) : (
        <form onSubmit={submitPassword} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <label className="stat-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="stat-label" htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Signing in..." : "Sign in"}
          </button>
          {err ? <p style={{ color: "var(--red)" }}>{err}</p> : null}
          <p className="meta" style={{ fontSize: "0.78rem" }}>
            Don&rsquo;t have a password yet? Sign in via the picker once, then visit <a href="/account">/account</a> to set one.
          </p>
        </form>
      )}
    </div>
  );
}

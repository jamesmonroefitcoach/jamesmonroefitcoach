"use client";
import { FormEvent, useState } from "react";

// Email + password sign-in only. The Supabase password handler at
// /api/sign-in-password writes the auth cookie and the home page
// redirects each role to its proper surface from there.

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
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
    // router.refresh() races the auth-cookie write here.
    window.location.assign("/");
  }

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
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div>
        <label className="stat-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
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
    </form>
  );
}

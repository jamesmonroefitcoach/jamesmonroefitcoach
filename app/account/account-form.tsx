"use client";
import { FormEvent, useState } from "react";

export default function AccountForm({
  initialEmail,
  emailLocked,
  hasPassword,
}: {
  initialEmail: string;
  emailLocked: boolean;
  hasPassword: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save password.");
      setMsg(
        hasPassword
          ? "Password updated."
          : "Password set — you can now sign in with email + password."
      );
      setPassword("");
      setConfirm("");
      // Hard navigation so the freshly-set Supabase Auth cookies are visible
      // on the next request (router.refresh() reuses the same RSC payload and
      // can race the cookie write).
      setTimeout(() => {
        window.location.replace("/account");
      }, 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save password.");
    } finally {
      setBusy(false);
    }
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
          disabled={emailLocked || hasPassword}
          autoComplete="email"
          style={{ ...inputStyle, opacity: emailLocked || hasPassword ? 0.7 : 1 }}
        />
      </div>
      <div>
        <label className="stat-label" htmlFor="pw">
          {hasPassword ? "New password" : "Password"} <span style={{ fontWeight: 400, color: "var(--muted)" }}>(8+ characters)</span>
        </label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="stat-label" htmlFor="pw2">Confirm password</label>
        <input
          id="pw2"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={inputStyle}
        />
      </div>
      {err && <div style={{ color: "var(--rust)", fontSize: "0.85rem" }}>{err}</div>}
      {msg && <div style={{ color: "var(--sage)", fontSize: "0.85rem" }}>{msg}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: "0.4rem" }}>
        {busy ? "Saving…" : hasPassword ? "Update password" : "Set password"}
      </button>
    </form>
  );
}

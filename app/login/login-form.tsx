"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProfileRow = { id: string; full_name: string; email: string | null; role: "coach" | "client" | "admin" };

export default function LoginForm({ profiles }: { profiles: ProfileRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(profiles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, ProfileRow[]> = { coach: [], admin: [], client: [] };
    profiles.forEach((p) => { (g[p.role] ??= []).push(p); });
    return g;
  }, [profiles]);

  async function onSubmit(e: FormEvent) {
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
      body: JSON.stringify({ id: profile.id, name: profile.full_name, role: profile.role, email: profile.email })
    });
    if (!res.ok) {
      setErr("Sign in failed.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
  );
}

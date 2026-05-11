"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SessionUser } from "@/lib/types";

type NavLink = { href: string; label: string };

const COACH_NAV: NavLink[] = [
  { href: "/coach", label: "Dashboard" },
  { href: "/coach/clients", label: "Clients" },
  { href: "/coach/build-program", label: "Build Program" },
  { href: "/coach/schedule", label: "Schedule" },
  { href: "/coach/availability", label: "Availability" },
  { href: "/coach/appointments", label: "Appointments" },
  { href: "/coach/messages", label: "Messages" }
];

const CLIENT_NAV: NavLink[] = [
  { href: "/client", label: "My Schedule" },
  { href: "/client/profile", label: "Profile" },
  { href: "/client/check-ins", label: "Check-ins" },
  { href: "/client/messages", label: "Messages" }
];

const ADMIN_NAV: NavLink[] = [
  { href: "/admin", label: "Approvals" },
  { href: "/admin/assignments", label: "Assignments" },
  { href: "/admin/profiles", label: "All Profiles" }
];

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [collapsed, setCollapsed] = useState(false);

  const links = user.role === "coach" ? COACH_NAV : user.role === "client" ? CLIENT_NAV : ADMIN_NAV;

  function signOut() {
    start(async () => {
      await fetch("/api/sign-out", { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  /* ── Collapsed strip ─────────────────────────────────────── */
  if (collapsed) {
    return (
      <aside
        className="sidebar no-print"
        style={{ width: 44, minWidth: 44, padding: "0.75rem 0", alignItems: "center", gap: 0, overflow: "hidden" }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          style={{
            background: "none", border: "none", color: "#d4c9bb",
            fontSize: "1.25rem", cursor: "pointer", lineHeight: 1,
            padding: "0.3rem 0", width: "100%", textAlign: "center",
          }}
        >
          ›
        </button>
        <span style={{
          marginTop: "2.5rem",
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          color: "#3a322d",
          fontSize: "0.58rem",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          userSelect: "none",
        }}>
          Monroe Fit
        </span>
      </aside>
    );
  }

  /* ── Expanded full sidebar ───────────────────────────────── */
  return (
    <aside className="sidebar no-print" style={{ width: 240, minWidth: 240 }}>
      {/* Brand + collapse toggle */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingBottom: "0.75rem",
        borderBottom: "1px solid #2a2522",
        marginBottom: 0,
      }}>
        <div style={{
          fontFamily: "var(--font-heading), 'Oswald', sans-serif",
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "#f5efe4",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "0.25rem 0.5rem 0",
          lineHeight: 1.25,
        }}>
          Monroe<br />
          <span style={{ color: "var(--clay)" }}>Fit Coach</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          style={{
            background: "none", border: "none", color: "#6b6157",
            fontSize: "1.1rem", cursor: "pointer", lineHeight: 1,
            padding: "0.35rem 0.4rem", flexShrink: 0, marginTop: "2px",
          }}
        >
          ‹
        </button>
      </div>

      <nav className="sidebar-section">
        <div className="sidebar-header">{user.role}</div>
        {links.map((link) => {
          const active = pathname === link.href || (link.href !== "/" + user.role && pathname.startsWith(link.href));
          return (
            <Link key={link.href} href={link.href} className={`sidebar-link${active ? " active" : ""}`}>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div style={{ color: "#d4c9bb", fontWeight: 600 }}>{user.name}</div>
        <div>{user.email ?? ""}</div>
        <button
          className="btn btn-ghost"
          style={{ marginTop: "0.5rem", width: "100%", color: "#d4c9bb", borderColor: "#3a322d" }}
          onClick={signOut}
          disabled={pending}
        >
          {pending ? "..." : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

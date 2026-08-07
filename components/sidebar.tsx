"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { SessionUser } from "@/lib/types";

type NavLink = { href: string; label: string };

const COACH_NAV: NavLink[] = [
  { href: "/coach", label: "Dashboard" },
  { href: "/coach/schedule", label: "Schedule" },        // Appointments + Availability live as subtabs under Schedule
  { href: "/coach/programming", label: "Programming" },  // Build Program + Exercise Library live as subtabs under Programming
  { href: "/coach/clients", label: "Clients" },
  { href: "/coach/goals", label: "Goals" },
  { href: "/coach/messages", label: "Messages" },        // Testimonials lives as a subtab under Messages
];

const CLIENT_NAV: NavLink[] = [
  { href: "/client", label: "My Schedule" },
  { href: "/client/profile", label: "Profile" },
  { href: "/client/programming", label: "Programming" },   // View / Build / Library / Materials live as subtabs
  { href: "/client/goals", label: "Goals" },
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Last-view persistence (mainly for phones) ──────────────────────────
  // Remember the last meaningful route so backgrounding the app and coming
  // back returns you to where you were instead of snapping to the dashboard.
  // sessionStorage marks "this app session" — it survives reloads/backgrounding
  // but is cleared on a complete close, so only a full close+reopen resets to
  // the dashboard (matches the requested behavior).
  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/preview" || pathname.startsWith("/preview/")) return;
    // Don't store the bare home roots — we want to restore to a real view.
    if (pathname !== "/coach" && pathname !== "/client" && pathname !== "/admin") {
      try { localStorage.setItem("mfc:lastPath", pathname); } catch {}
    }
  }, [pathname]);

  useEffect(() => {
    // Runs once per full page load (Sidebar persists across client nav).
    try {
      const fresh = !sessionStorage.getItem("mfc:alive");
      sessionStorage.setItem("mfc:alive", "1");
      if (fresh) return; // complete reopen → leave on the dashboard
      const onHomeRoot = pathname === "/coach" || pathname === "/client" || pathname === "/admin";
      if (onHomeRoot) {
        const last = localStorage.getItem("mfc:lastPath");
        if (last && last !== pathname) router.replace(last);
      }
    } catch { /* storage unavailable — no-op */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /preview is the marketing site rendered inside an app tab. The
  // sidebar would be useless overhead there, so suppress it entirely.
  if (pathname === "/preview" || pathname?.startsWith("/preview/")) {
    return null;
  }

  const links = user.role === "coach" ? COACH_NAV : user.role === "client" ? CLIENT_NAV : ADMIN_NAV;

  function signOut() {
    start(async () => {
      await fetch("/api/sign-out", { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  // Sub-tabbed sections — when the user is on a subroute of these "sections",
  // the top-level link still lights up as active.
  const SECTION_ROUTES: Record<string, string[]> = {
    "/coach/schedule": ["/coach/schedule", "/coach/appointments", "/coach/availability"],
    "/coach/messages": ["/coach/messages", "/coach/testimonials", "/coach/before-after"],
  };

  const navLinks = links.map((link) => {
    const sectionPrefixes = SECTION_ROUTES[link.href];
    const inSection = sectionPrefixes
      ? sectionPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
      : false;
    const active = inSection || pathname === link.href || (link.href !== "/" + user.role && pathname.startsWith(link.href));
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`sidebar-link${active ? " active" : ""}`}
        onClick={() => setMobileOpen(false)}
      >
        {link.label}
      </Link>
    );
  });

  return (
    <>
      {/* ── Mobile top bar (shown only on small screens via CSS) ─── */}
      <aside className={`sidebar-mobile no-print${mobileOpen ? " is-open" : ""}`}>
        <div className="sidebar-mobile-bar">
          <div style={{
            fontFamily: "var(--font-heading), 'Oswald', sans-serif",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#f5efe4",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            Monroe <span style={{ color: "var(--clay)" }}>Fit Coach</span>
          </div>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            style={{
              background: "none", border: "none",
              color: "#d4c9bb", fontSize: "1.4rem",
              cursor: "pointer", lineHeight: 1,
              padding: "0.25rem 0.5rem",
            }}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>

        {mobileOpen && (
          <nav className="sidebar-mobile-nav">
            <div className="sidebar-header">{user.role}</div>
            {navLinks}
            <div style={{ borderTop: "1px solid #2a2522", marginTop: "0.5rem", paddingTop: "0.5rem" }}>
              <div style={{ color: "#d4c9bb", fontWeight: 600, fontSize: "0.8rem", padding: "0.15rem 0.55rem 0.25rem" }}>
                {user.name}
              </div>
              <Link
                href="/account"
                className="sidebar-link"
                onClick={() => setMobileOpen(false)}
              >
                Account
              </Link>
              <a
                href="https://jamesmonroefitcoach.vercel.app/preview"
                target="_blank"
                rel="noopener"
                className="sidebar-link"
                onClick={() => setMobileOpen(false)}
              >
                Open Website ↗
              </a>
              <button
                className="sidebar-link"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                onClick={signOut}
                disabled={pending}
              >
                {pending ? "…" : "Sign out"}
              </button>
            </div>
          </nav>
        )}
      </aside>

      {/* ── Desktop sidebar (hidden on small screens via CSS) ────── */}
      {collapsed ? (
        <aside
          className="sidebar sidebar-desktop no-print"
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
      ) : (
        <aside className="sidebar sidebar-desktop no-print" style={{ width: 240, minWidth: 240 }}>
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
            {navLinks}
          </nav>

          <div className="sidebar-foot">
            <div style={{ color: "#d4c9bb", fontWeight: 600 }}>{user.name}</div>
            <div>{user.email ?? ""}</div>
            <Link
              href="/account"
              className="btn btn-ghost"
              style={{ marginTop: "0.5rem", width: "100%", color: "#d4c9bb", borderColor: "#3a322d", textAlign: "center" }}
            >
              Account
            </Link>
            <a
              href="https://jamesmonroefitcoach.vercel.app/preview"
              target="_blank"
              rel="noopener"
              style={{
                display: "block",
                marginTop: "0.7rem",
                textAlign: "center",
                color: "#a3927a",
                fontSize: "0.8rem",
                textDecoration: "underline",
                textDecorationColor: "#3a322d",
                textUnderlineOffset: "3px",
              }}
              title="Open the public site in a new tab"
            >
              Open Website ↗
            </a>
            <button
              className="btn btn-ghost"
              style={{ marginTop: "0.35rem", width: "100%", color: "#d4c9bb", borderColor: "#3a322d" }}
              onClick={signOut}
              disabled={pending}
            >
              {pending ? "…" : "Sign out"}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { SessionUser } from "@/lib/types";

type NavLink = { href: string; label: string };

const COACH_NAV: NavLink[] = [
  { href: "/coach", label: "Dashboard" },
  { href: "/coach/clients", label: "Clients" },
  { href: "/coach/build-program", label: "Build Program" },
  { href: "/coach/schedule", label: "Schedule" },
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

  const links = user.role === "coach" ? COACH_NAV : user.role === "client" ? CLIENT_NAV : ADMIN_NAV;

  function signOut() {
    start(async () => {
      await fetch("/api/sign-out", { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <aside className="sidebar no-print">
      <div className="sidebar-brand">
        Monroe<br />
        <span className="accent">Fit Coach</span>
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
        <button className="btn btn-ghost" style={{ marginTop: "0.5rem", width: "100%", color: "#d4c9bb", borderColor: "#3a322d" }} onClick={signOut} disabled={pending}>
          {pending ? "..." : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

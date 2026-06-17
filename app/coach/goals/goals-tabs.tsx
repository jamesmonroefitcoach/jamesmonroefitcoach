"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/coach/goals", label: "Goals" },
  { href: "/coach/goals/growth-plan", label: "Growth plan" },
];

export default function GoalsTabs() {
  const path = usePathname() ?? "";
  return (
    <div className="no-print" style={{ display: "flex", gap: "0.4rem", borderBottom: "1px solid var(--line)", marginBottom: "0.6rem" }}>
      {TABS.map((t) => {
        const active = path === t.href || (t.href !== "/coach/goals" && path.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: "0.45rem 0.85rem",
              fontFamily: "var(--font-heading), Oswald, sans-serif",
              fontSize: "0.78rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: active ? "var(--rust)" : "var(--muted)",
              borderBottom: `2px solid ${active ? "var(--rust)" : "transparent"}`,
              marginBottom: -1,
              textDecoration: "none",
              fontWeight: active ? 700 : 500,
            }}
          >{t.label}</Link>
        );
      })}
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-tab nav for Build Program: Template (first) | Build.
// Only renders on the two relevant routes — the WIP rework / programs-rework
// / session pages keep their own chrome.
export default function BuildTabs() {
  const path = usePathname() ?? "";
  const isTemplate = path === "/coach/programming/build/template";
  const isBuilder = path === "/coach/programming/build";
  if (!isTemplate && !isBuilder) return null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.45rem 1.1rem",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
    marginBottom: "-2px",
    fontFamily: "inherit",
    fontSize: "0.86rem",
    fontWeight: active ? 700 : 400,
    color: active ? "var(--rust)" : "var(--muted)",
    cursor: "pointer",
    letterSpacing: active ? "0.01em" : undefined,
    textDecoration: "none",
  });

  return (
    <div
      className="no-print"
      style={{
        width: "min(1180px, 100% - 2rem)",
        margin: "0.45rem auto 0",
      }}
    >
      <nav
        style={{
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.2rem",
          overflowX: "auto",
        }}
      >
        <Link href="/coach/programming/build/template" style={tabStyle(isTemplate)}>Template</Link>
        <Link href="/coach/programming/build" style={tabStyle(isBuilder)}>Build</Link>
      </nav>
    </div>
  );
}

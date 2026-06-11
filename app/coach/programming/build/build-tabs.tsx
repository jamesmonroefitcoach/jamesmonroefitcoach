"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Build Program sub-tabs:
//   Template | In App Build | Old Way
// Old Way is a legacy landing page that links to the four pre-merge entry
// points (Build / Build Session / standalone Sessions Rework + Programs
// Rework). Sub-tab highlights when on the merged In App Build OR on any of
// the legacy routes it gathers.
const BASE = "/coach/programming/build";

export default function BuildTabs() {
  const path = usePathname() ?? "";
  if (!path.startsWith(BASE)) return null;

  const isTemplate = path.startsWith(`${BASE}/template`);
  const isInApp = path.startsWith(`${BASE}/in-app`);
  // Old Way covers the landing page plus every legacy route it points at.
  const isOldWay =
    path.startsWith(`${BASE}/old-way`) ||
    path.startsWith(`${BASE}/rework`) ||
    path.startsWith(`${BASE}/programs-rework`) ||
    path.startsWith(`${BASE}/session`) ||
    // /build itself = classic Builder (and the catch-all when nothing else matches)
    path === BASE;

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
    whiteSpace: "nowrap",
  });

  return (
    <div className="no-print" style={{ width: "min(1180px, 100% - 2rem)", margin: "0.45rem auto 0" }}>
      <nav
        style={{
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.1rem",
          overflowX: "auto",
        }}
      >
        <Link href={`${BASE}/template`} style={tabStyle(isTemplate)}>Template</Link>
        <Link href={`${BASE}/in-app`} style={tabStyle(isInApp)}>In App Build</Link>
        <Link href={`${BASE}/old-way`} style={tabStyle(isOldWay)}>Old Way</Link>
      </nav>
    </div>
  );
}

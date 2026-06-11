"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Client Build Program sub-tabs:
//   Sheets (first) | Sessions Rework | Build
const BASE = "/client/programming/build";

export default function ClientBuildTabs() {
  const path = usePathname() ?? "";
  if (!path.startsWith(BASE)) return null;

  const isSheets = path.startsWith(`${BASE}/sheets`);
  const isRework = path.startsWith(`${BASE}/rework`);
  const isBuilder = !isSheets && !isRework;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.45rem 1rem",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
    marginBottom: "-2px",
    fontFamily: "inherit",
    fontSize: "0.84rem",
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
        <Link href={`${BASE}/sheets`} style={tabStyle(isSheets)}>Sheets</Link>
        <Link href={`${BASE}/rework`} style={tabStyle(isRework)}>Sessions Rework <span style={{ fontSize: "0.6rem", color: "var(--muted)", marginLeft: "0.25rem" }}>WIP</span></Link>
        <Link href={BASE} style={tabStyle(isBuilder)}>Build</Link>
      </nav>
    </div>
  );
}

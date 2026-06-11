"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Client Build sub-tabs:
//   Template | In App Build
// Mirrors the coach's Build sub-nav (without the Old Way landing — that
// only exists on the coach side). Template = the interactive workout
// sheet UI; In App Build = the structured Day/Week builder.
const BASE = "/client/programming/build";

export default function BuildTabsClient() {
  const path = usePathname() ?? "";
  if (!path.startsWith(BASE)) return null;

  const isTemplate = path.startsWith(`${BASE}/template`) || path.startsWith(`${BASE}/sheets`);
  const isInApp = path.startsWith(`${BASE}/in-app`);

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
      </nav>
    </div>
  );
}

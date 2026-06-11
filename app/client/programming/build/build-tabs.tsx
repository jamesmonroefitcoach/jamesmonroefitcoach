"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-tab nav for client Build Program: Sheets (first) | Build.
// Only renders on the two relevant routes.
export default function ClientBuildTabs() {
  const path = usePathname() ?? "";
  const isSheets = path.startsWith("/client/programming/build/sheets");
  const isBuilder = path === "/client/programming/build";
  if (!isSheets && !isBuilder) return null;

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
    <div className="no-print" style={{ width: "min(1180px, 100% - 2rem)", margin: "0.45rem auto 0" }}>
      <nav
        style={{
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.2rem",
          overflowX: "auto",
        }}
      >
        <Link href="/client/programming/build/sheets" style={tabStyle(isSheets)}>Sheets</Link>
        <Link href="/client/programming/build" style={tabStyle(isBuilder)}>Build</Link>
      </nav>
    </div>
  );
}

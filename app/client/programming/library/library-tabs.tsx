"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Client Library sub-tabs: Exercise Library | Materials.
// (No Exercise Explorer on the client side — it's a coach-only sandbox.)
export default function ClientLibraryTabs() {
  const path = usePathname() ?? "";
  const isExLib = path.startsWith("/client/programming/library/exercise-library");
  const isMaterials = path.startsWith("/client/programming/library/materials");

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
        <Link href="/client/programming/library/exercise-library" style={tabStyle(isExLib)}>Exercise Library</Link>
        <Link href="/client/programming/library/materials" style={tabStyle(isMaterials)}>Materials</Link>
      </nav>
    </div>
  );
}

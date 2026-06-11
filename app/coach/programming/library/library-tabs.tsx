"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-tab nav for the Library section: Exercise Library | Exercise Explorer | Materials.
export default function LibraryTabs() {
  const path = usePathname() ?? "";
  const isExLib = path.startsWith("/coach/programming/library/exercise-library");
  const isExplorer = path.startsWith("/coach/programming/library/exercise-explorer");
  const isMaterials = path.startsWith("/coach/programming/library/materials");
  const isReview = path.startsWith("/coach/programming/library/review");

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
        <Link href="/coach/programming/library/exercise-library" style={tabStyle(isExLib)}>Exercise Library</Link>
        <Link href="/coach/programming/library/exercise-explorer" style={tabStyle(isExplorer)}>Exercise Explorer</Link>
        <Link href="/coach/programming/library/materials" style={tabStyle(isMaterials)}>Materials</Link>
        <Link href="/coach/programming/library/review" style={tabStyle(isReview)}>Mapping Review</Link>
      </nav>
    </div>
  );
}

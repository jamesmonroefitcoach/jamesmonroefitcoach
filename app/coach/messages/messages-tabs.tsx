"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-nav for the Messages section. Used at the top of:
//   /coach/messages       → Direct messages with clients
//   /coach/testimonials   → Client testimonial quote moderation
//   /coach/before-after   → Client transformation photo editing
export default function MessagesTabs() {
  const path = usePathname() ?? "";
  const isTestimonials = path.startsWith("/coach/testimonials");
  const isBeforeAfter = path.startsWith("/coach/before-after");
  const isMessages = !isTestimonials && !isBeforeAfter;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.55rem 1.4rem",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--rust)" : "2px solid transparent",
    marginBottom: "-2px",
    fontFamily: "inherit",
    fontSize: "0.95rem",
    fontWeight: active ? 700 : 400,
    color: active ? "var(--rust)" : "var(--muted)",
    cursor: "pointer",
    letterSpacing: active ? "0.01em" : undefined,
    textDecoration: "none",
  });

  return (
    <div className="no-print" style={{ width: "min(1180px, 100% - 2rem)", margin: "1rem auto 0" }}>
      <nav
        style={{
          borderBottom: "2px solid var(--line)",
          display: "flex",
          alignItems: "flex-end",
          gap: "0.25rem",
        }}
      >
        <Link href="/coach/messages" style={tabStyle(isMessages)}>Messages</Link>
        <Link href="/coach/testimonials" style={tabStyle(isTestimonials)}>Testimonials</Link>
        <Link href="/coach/before-after" style={tabStyle(isBeforeAfter)}>Before / After</Link>
      </nav>
    </div>
  );
}

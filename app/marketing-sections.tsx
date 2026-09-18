"use client";

import { createContext, useContext, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

// Homepage navigation, per Ryan's suggestion: a menu button in the
// upper-left corner of the header that opens a small box of section
// names, plus a collapse arrow on each section heading.
//
// Sections start closed on phones and open on computers. That default is
// decided by CSS (data-fold="auto" + the 700px media query in globals.css)
// so a phone never flashes the full page before folding it up. Tapping a
// heading, or jumping to a section from the menu or any "#section" link,
// switches that section to an explicit open/closed.

const PHONE_QUERY = "(max-width: 700px)";

const SECTIONS: { id: string; label: string }[] = [
  { id: "about", label: "About" },
  { id: "offerings", label: "Specialties" },
  { id: "services", label: "What’s included" },
  { id: "timeline", label: "Timeline" },
  { id: "pricing", label: "Pricing" },
  { id: "results", label: "Results" },
  { id: "location", label: "Location" },
  { id: "start", label: "Get started" },
];

type Fold = "auto" | "open" | "closed";

const FoldCtx = createContext<{ expanded: boolean; toggle: () => void } | null>(null);

export function FoldSection({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: ReactNode;
}) {
  const [fold, setFold] = useState<Fold>("auto");
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const syncPhone = () => setPhone(mq.matches);
    syncPhone();
    mq.addEventListener("change", syncPhone);

    // Any link pointing at this section opens it: the menu, the header,
    // the hero's "See offerings" link, or a shared URL ending in #pricing.
    const openIfHash = () => {
      if (window.location.hash === `#${id}`) setFold("open");
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a && a.getAttribute("href") === `#${id}`) setFold("open");
    };
    openIfHash();
    window.addEventListener("hashchange", openIfHash);
    document.addEventListener("click", onClick);
    return () => {
      mq.removeEventListener("change", syncPhone);
      window.removeEventListener("hashchange", openIfHash);
      document.removeEventListener("click", onClick);
    };
  }, [id]);

  const expanded = fold === "open" || (fold === "auto" && !phone);
  const toggle = () => setFold(expanded ? "closed" : "open");

  return (
    <section id={id} className={className} data-fold={fold}>
      <FoldCtx.Provider value={{ expanded, toggle }}>{children}</FoldCtx.Provider>
    </section>
  );
}

// The section's h2, as a button with the arrow on the right.
export function FoldHeading({ className, children }: { className: string; children: ReactNode }) {
  const ctx = useContext(FoldCtx);
  return (
    <h2 className={className}>
      <button
        type="button"
        className="public-fold-toggle"
        aria-expanded={ctx?.expanded ?? true}
        onClick={ctx?.toggle}
      >
        <span>{children}</span>
        <span className="public-fold-arrow" aria-hidden />
      </button>
    </h2>
  );
}

// Wraps the part of a section that hides when it's closed. Uses
// display: contents while open, so it never changes the existing layout.
export function FoldBody({ children }: { children: ReactNode }) {
  return <div className="public-fold-body">{children}</div>;
}

export function SectionMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a tap outside the box or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Scroll by hand instead of letting the link navigate: closing the box
  // removes the link from the page, which would cancel a native jump.
  // FoldSection still sees the click and opens the section.
  const jump = (e: ReactMouseEvent, id: string) => {
    e.preventDefault();
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="public-menu" ref={ref}>
      <button
        type="button"
        className="public-menu-btn"
        aria-label={open ? "Close section menu" : "Open section menu"}
        aria-expanded={open}
        aria-controls="public-menu-list"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>
      {open && (
        <nav id="public-menu-list" className="public-menu-list" aria-label="Page sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => jump(e, s.id)}>
              {s.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

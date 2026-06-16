"use client";

import { useState } from "react";

// Collapsible before/after row. Closed shows the case label + summary line;
// open reveals two side-by-side placeholder photo panels. Real images get
// dropped in later — keeping the API simple now so a swap is a one-prop
// change.

export default function BeforeAfterToggle({
  label,
  summary,
  index,
  beforeSrc,
  afterSrc,
}: {
  label: string;
  summary: string;
  index: number;
  beforeSrc?: string;
  afterSrc?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="public-result">
      <button
        type="button"
        onClick={() => setOpen((b) => !b)}
        className="public-result-toggle"
        aria-expanded={open}
      >
        <span className="public-result-index">{(index + 1).toString().padStart(2, "0")}</span>
        <span className="public-result-label">
          <strong>{label}</strong>
          <span>{summary}</span>
        </span>
        <span className="public-result-chev" aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="public-result-body">
          <div className="public-photo">
            {beforeSrc
              ? <img src={beforeSrc} alt={`${label} — before`} />
              : <span>PLACEHOLDER — BEFORE photo</span>}
            <span className="public-photo-tag">BEFORE</span>
          </div>
          <div className="public-photo">
            {afterSrc
              ? <img src={afterSrc} alt={`${label} — after`} />
              : <span>PLACEHOLDER — AFTER photo</span>}
            <span className="public-photo-tag">AFTER</span>
          </div>
        </div>
      )}
    </div>
  );
}

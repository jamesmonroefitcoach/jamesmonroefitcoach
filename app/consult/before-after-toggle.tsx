"use client";

// Consolidated client result row. Photo pair on the left (before + after,
// labelled), label + summary on the right. Always visible — no toggle —
// so the page reads as a real "look what's possible" strip rather than a
// collapsed FAQ list. Drops to a stacked layout on phone.

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
  return (
    <div className="public-result">
      <div className="public-result-row">
        <div className="public-result-photos">
          <div className="public-photo">
            {beforeSrc
              ? <img src={beforeSrc} alt={`${label} — before`} />
              : <span>BEFORE</span>}
            <span className="public-photo-tag">BEFORE</span>
          </div>
          <div className="public-photo">
            {afterSrc
              ? <img src={afterSrc} alt={`${label} — after`} />
              : <span>AFTER</span>}
            <span className="public-photo-tag">AFTER</span>
          </div>
        </div>
        <div className="public-result-text">
          <span className="public-result-index">
            {(index + 1).toString().padStart(2, "0")}
          </span>
          <strong className="public-result-title">{label}</strong>
          <p className="public-result-summary">{summary}</p>
        </div>
      </div>
    </div>
  );
}

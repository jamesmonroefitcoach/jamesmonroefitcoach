"use client";

// Consolidated client result row. Photo pair on the left (before + after,
// labelled), label + summary on the right. Always visible. Drops to a
// stacked layout on phone.

export default function BeforeAfterToggle({
  label,
  summary,
  index,
  beforeSrc,
  afterSrc,
  fit = "cover",
}: {
  label: string;
  summary: string;
  index: number;
  beforeSrc?: string;
  afterSrc?: string;
  // "cover" crops to the 4/5 frame, head anchored at top. "contain"
  // letterboxes so the full body shows (useful when feet/legs would
  // otherwise get clipped).
  fit?: "cover" | "contain";
}) {
  const photoClass = "public-photo" + (fit === "contain" ? " is-contain" : "");
  return (
    <div className="public-result">
      <div className="public-result-row">
        <div className="public-result-photos">
          <div className={photoClass}>
            {beforeSrc
              ? <img src={beforeSrc} alt={`${label} - before`} />
              : <span>BEFORE</span>}
            <span className="public-photo-tag">BEFORE</span>
          </div>
          <div className={photoClass}>
            {afterSrc
              ? <img src={afterSrc} alt={`${label} - after`} />
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

"use client";

// Consolidated client result row. Photo pair on the left (before + after,
// labelled), label + summary on the right. Always visible. Drops to a
// stacked layout on phone.

export default function BeforeAfterToggle({
  label,
  summary,
  weights,
  index,
  beforeSrc,
  afterSrc,
  fit = "cover",
  beforeFit,
  afterFit,
}: {
  label: string;
  summary: string;
  // Small caption under the summary for before → after lift numbers.
  weights?: string;
  index: number;
  beforeSrc?: string;
  afterSrc?: string;
  // "cover" crops to the 4/5 frame, head anchored at top. "contain"
  // letterboxes so the full body shows (useful when feet/legs would
  // otherwise get clipped). Per-photo overrides win over the shared
  // `fit` prop so a row can mix (e.g. crop the BEFORE, letterbox the
  // AFTER) when only one of the two photos has legs/feet at the edge.
  fit?: "cover" | "contain";
  beforeFit?: "cover" | "contain";
  afterFit?: "cover" | "contain";
}) {
  const bFit = beforeFit ?? fit;
  const aFit = afterFit ?? fit;
  const photoClassFor = (f: "cover" | "contain") =>
    "public-photo" + (f === "contain" ? " is-contain" : "");
  return (
    <div className="public-result">
      <div className="public-result-row">
        <div className="public-result-photos">
          <div className={photoClassFor(bFit)}>
            {beforeSrc
              ? <img src={beforeSrc} alt={`${label} - before`} />
              : <span>BEFORE</span>}
            <span className="public-photo-tag">BEFORE</span>
          </div>
          <div className={photoClassFor(aFit)}>
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
          {weights && <p className="public-result-weights">{weights}</p>}
        </div>
      </div>
    </div>
  );
}

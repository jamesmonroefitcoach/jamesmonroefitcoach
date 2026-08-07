"use client";

// Consolidated client result row. Photo pair on the left (before + after,
// labelled), label + summary on the right. Always visible. Drops to a
// stacked layout on phone.

export default function BeforeAfterToggle({
  label,
  tag,
  summary,
  weights,
  index,
  beforeSrc,
  afterSrc,
  fit = "cover",
  beforeFit,
  afterFit,
  beforeZoom,
  beforePosX,
  beforePosY,
  afterZoom,
  afterPosX,
  afterPosY,
}: {
  label: string;
  // Short category line above the name (e.g. "Body Recomposition").
  tag?: string;
  // James's write-up for this client. Empty on photo-only entries.
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
  // Zoom (1 = none) + focal point as a % of the image, set by James in the
  // Before/After editor. Only meaningful when the corresponding fit is
  // "cover" — undefined/1/50/0 reproduces the old fixed "center top" crop.
  beforeZoom?: number;
  beforePosX?: number;
  beforePosY?: number;
  afterZoom?: number;
  afterPosX?: number;
  afterPosY?: number;
}) {
  const bFit = beforeFit ?? fit;
  const aFit = afterFit ?? fit;
  const photoClassFor = (f: "cover" | "contain") =>
    "public-photo" + (f === "contain" ? " is-contain" : "");
  const cropStyle = (f: "cover" | "contain", zoom?: number, posX?: number, posY?: number) => {
    if (f !== "cover") return undefined;
    const x = posX ?? 50;
    const y = posY ?? 0;
    const z = zoom ?? 1;
    return {
      objectPosition: `${x}% ${y}%`,
      transform: z !== 1 ? `scale(${z})` : undefined,
      transformOrigin: `${x}% ${y}%`,
    };
  };
  return (
    <div className="public-result">
      <div className="public-result-row">
        <div className="public-result-photos">
          <div className={photoClassFor(bFit)}>
            {beforeSrc
              ? <img src={beforeSrc} alt={`${label} - before`} style={cropStyle(bFit, beforeZoom, beforePosX, beforePosY)} />
              : <span>BEFORE</span>}
            <span className="public-photo-tag">BEFORE</span>
          </div>
          <div className={photoClassFor(aFit)}>
            {afterSrc
              ? <img src={afterSrc} alt={`${label} - after`} style={cropStyle(aFit, afterZoom, afterPosX, afterPosY)} />
              : <span>AFTER</span>}
            <span className="public-photo-tag">AFTER</span>
          </div>
        </div>
        <div className="public-result-text">
          <span className="public-result-index">
            {(index + 1).toString().padStart(2, "0")}
          </span>
          <strong className="public-result-title">{label}</strong>
          {tag && <span className="public-result-tag">{tag}</span>}
          {summary && <p className="public-result-summary">{summary}</p>}
          {weights && <p className="public-result-weights">{weights}</p>}
        </div>
      </div>
    </div>
  );
}

"use client";
// Blank handwriting template for the gym floor.
//
// Coach prints (or saves to PDF for a Kindle Scribe), writes set-by-set in
// the gym, then later snaps a photo so an AI parse can pull the table back
// into a session. NOTHING here is pre-filled — Name, Date, and every cell in
// the table are blank lines for handwriting.

// Exercise / Cues / Equipment / Notes are left without an explicit width so
// they share the remaining horizontal space — those are the cells coaches
// actually write paragraphs in. Numeric columns stay tight.
const PRINTOUT_BLANK_ROW_COUNT = 18;
const PRINTOUT_COLUMNS: { label: string; width?: string }[] = [
  { label: "Exercise" },
  { label: "Set Number",             width: "52px" },
  { label: "Target Reps / Time (s)", width: "82px" },
  { label: "Target Intensity",       width: "72px" },
  { label: "Set Rest",               width: "52px" },
  { label: "Cues" },
  { label: "Actual Reps",            width: "56px" },
  { label: "Weight",                 width: "54px" },
  { label: "Equipment" },
  { label: "Tempo",                  width: "48px" },
  { label: "Notes" },
];

export default function TemplatePrintout() {
  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <span className="badge">Coach</span>
          <h1 style={{ marginTop: "0.5rem" }}>Template</h1>
          <p className="meta">Blank handwriting template for the gym floor. Print or save as PDF, fill in by hand, photograph to upload later.</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
      </header>
      <hr className="divider no-print" />

      <div className="rework-printout" style={{
        padding: "0.35in", fontFamily: "Georgia, serif",
        color: "#000", background: "#fff",
        fontSize: "0.74rem", lineHeight: 1.3,
        border: "1px solid var(--line)",
        borderRadius: 4,
        maxWidth: "100%",
        overflowX: "auto",
      }}>
        {/* Header — blank Name + Date for handwriting */}
        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(220px, 1fr) auto minmax(160px, 1fr)", gap: "0.35rem 0.5rem", fontSize: "0.78rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontWeight: 700 }}>Name:</span>
          <span style={{ borderBottom: "1px solid #000", padding: "0 0.25rem", minHeight: "1.1rem" }}>&nbsp;</span>
          <span style={{ fontWeight: 700 }}>Date:</span>
          <span style={{ borderBottom: "1px solid #000", padding: "0 0.25rem", minHeight: "1.1rem" }}>&nbsp;</span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
          <colgroup>
            {PRINTOUT_COLUMNS.map((c, i) => (
              <col key={i} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: "#eee", textAlign: "left" }}>
              {PRINTOUT_COLUMNS.map((c) => (
                <th key={c.label} style={{ border: "1px solid #000", padding: "0.22rem 0.32rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Blank rows — one set per row. Coach can write a ditto mark
                (〃) in a cell that matches the row above. To mark a
                between-exercise rest, write "Rest" in the Exercise column
                and the duration in the Rest column. */}
            {Array.from({ length: PRINTOUT_BLANK_ROW_COUNT }, (_, i) => (
              <tr key={i}>
                {PRINTOUT_COLUMNS.map((c, ci) => (
                  <td
                    key={ci}
                    style={{
                      border: "1px solid #000",
                      padding: "0.4rem 0.32rem",
                      minHeight: "1.85rem",
                      height: "1.85rem",
                    }}
                  >
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: "0.4rem", fontSize: "0.62rem", color: "#444" }}>
          Tip: write 〃 (ditto) when a cell repeats the row above. For a rest between exercises, write &ldquo;Rest&rdquo; in the Exercise column.
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: letter landscape; margin: 0.35in; }
          body * { visibility: hidden !important; }
          .rework-printout, .rework-printout * { visibility: visible !important; }
          .rework-printout { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: none !important; }
        }
      `}</style>
    </main>
  );
}

import Link from "next/link";
import { listWorkoutSheets } from "@/lib/workout-sheets.server";
import PdfUpload from "./pdf-upload";

// Programs / Workout Sheets section on the coach client profile page.
// Lists every sheet saved against this client (both in-app and uploaded
// PDFs), plus a quick "new sheet" link to the Template editor and a PDF
// upload form.
export default async function WorkoutSheetsSection({ clientId }: { clientId: string }) {
  const sheets = await listWorkoutSheets({ clientId, limit: 50 });

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Workout Sheets</h2>
        <Link
          className="btn btn-primary"
          href={`/coach/programming/build/template`}
        >
          + New Sheet
        </Link>
      </div>
      <hr className="divider" />

      {sheets.length === 0 ? (
        <p className="meta" style={{ marginBottom: "1rem" }}>
          No sheets yet. Start a new one above or upload a filled PDF below.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "1rem" }}>
          {sheets.map((s) => {
            const isPdf = s.kind === "pdf";
            const href = isPdf ? `/api/workout-sheets/${s.id}/pdf` : `/coach/programming/build/template?sheet=${s.id}`;
            return (
              <Link
                key={s.id}
                href={href}
                target={isPdf ? "_blank" : undefined}
                rel={isPdf ? "noopener" : undefined}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                  padding: "0.5rem 0.7rem",
                  border: "1px solid var(--line)",
                  borderRadius: 4,
                  background: "var(--paper)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.6rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                    {s.name}
                    {isPdf && (
                      <span style={{
                        marginLeft: "0.5rem",
                        fontFamily: "var(--font-heading), Oswald, sans-serif",
                        fontSize: "0.6rem",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--rust)",
                      }}>PDF</span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <PdfUpload clientId={clientId} />
    </div>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WorkoutSheetEmbed, { type UserLite } from "@/components/workout-sheet-embed";
import type { WorkoutSheet } from "@/lib/workout-sheets";

// Client-side view of their saved workout sheets. They can open any sheet
// in the same editor as the coach (lock-when-editing keeps both sides from
// stepping on each other). PDF sheets open in a new tab via signed URL.
export default function SheetsClient({
  user,
  sheets,
  currentSheetId,
}: {
  user: UserLite;
  sheets: WorkoutSheet[];
  currentSheetId: string | null;
}) {
  const router = useRouter();
  function openSheet(id: string) {
    router.push(`/client/programming/sheets?sheet=${id}`);
  }
  const current = currentSheetId ? sheets.find((s) => s.id === currentSheetId) ?? null : null;

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">My Portal</span>
        <h1 style={{ marginTop: "0.5rem" }}>Workout Sheets</h1>
        <p className="meta">
          Sheets your coach has saved for you. Open one to view or edit — anything you change shows
          on the coach&rsquo;s side too.
        </p>
      </header>
      <hr className="divider" />

      {sheets.length === 0 ? (
        <p className="meta">No sheets yet. Your coach will share one once you start.</p>
      ) : (
        <div style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 0.4rem" }}>Your sheets</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {sheets.map((s) => {
              const active = s.id === currentSheetId;
              const isPdf = s.kind === "pdf";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (isPdf ? window.open(`/api/workout-sheets/${s.id}/pdf`, "_blank") : openSheet(s.id))}
                  style={{
                    textAlign: "left",
                    padding: "0.55rem 0.7rem",
                    border: active ? "1px solid var(--rust)" : "1px solid var(--line)",
                    borderRadius: 4,
                    background: active ? "#fbf7ef" : "var(--paper)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.86rem", lineHeight: 1.25 }}>
                    {s.name}
                    {isPdf && (
                      <span style={{
                        marginLeft: "0.5rem",
                        fontFamily: "var(--font-heading), Oswald, sans-serif",
                        fontSize: "0.58rem",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--rust)",
                      }}>PDF</span>
                    )}
                  </div>
                  <div style={{ marginTop: "0.18rem", fontSize: "0.72rem", color: "var(--muted)" }}>
                    {new Date(s.updated_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Editor for in-app sheets; PDFs open in a new tab and don't render here. */}
      {current && current.kind !== "pdf" ? (
        <WorkoutSheetEmbed
          sheetId={currentSheetId}
          user={user}
          clients={[]}      // client side doesn't need the combo list
          sessions={[]}
        />
      ) : !current && sheets.some((s) => s.kind !== "pdf") ? (
        <p className="meta">Pick a sheet above to open it.</p>
      ) : null}

      {current?.kind === "pdf" && (
        <div style={{
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "1rem 1.25rem",
          background: "var(--paper)",
        }}>
          <h3 style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Uploaded PDF</h3>
          <p style={{ marginTop: "0.3rem" }}>
            <strong>{current.pdf_original_filename ?? current.name}</strong>
          </p>
          <Link
            href={`/api/workout-sheets/${current.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="btn btn-primary"
            style={{ display: "inline-block", marginTop: "0.5rem" }}
          >
            Open PDF
          </Link>
        </div>
      )}
    </main>
  );
}

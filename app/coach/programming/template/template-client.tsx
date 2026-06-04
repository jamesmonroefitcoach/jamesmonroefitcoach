"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WorkoutSheetEmbed, {
  type ClientLite,
  type SessionLite,
  type UserLite,
} from "./workout-sheet-embed";
import type { WorkoutSheet } from "@/lib/workout-sheets";

export default function TemplateClient({
  user,
  clients,
  sheets,
  currentSheetId,
}: {
  user: UserLite;
  clients: ClientLite[];
  sheets: WorkoutSheet[];
  currentSheetId: string | null;
}) {
  const router = useRouter();
  const sessions: SessionLite[] = []; // populated per-client in a later pass
  const byId = new Map(clients.map((c) => [c.id, c.name]));

  function openSheet(id: string) {
    router.push(`/coach/programming/template?sheet=${id}`);
  }
  function newSheet() {
    router.push(`/coach/programming/template`);
  }

  const current = currentSheetId ? sheets.find((s) => s.id === currentSheetId) ?? null : null;

  return (
    <main className="shell" style={{ paddingTop: "0.75rem" }}>
      <header>
        <span className="badge">Coach</span>
        <h1 style={{ marginTop: "0.5rem" }}>Workout Sheets</h1>
        <p className="meta">
          Type a sheet against a client, attach it to a session (or leave it in their Programs).
          Edits auto-sync once saved — your client sees them too, and theirs come back to you.
        </p>
      </header>
      <hr className="divider" />

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "0.85rem",
        }}
      >
        <button
          type="button"
          onClick={newSheet}
          className="btn btn-primary"
          disabled={!currentSheetId}
          style={{
            opacity: currentSheetId ? 1 : 0.6,
            cursor: currentSheetId ? "pointer" : "default",
          }}
        >
          + New Sheet
        </button>
        {current && (
          <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
            Editing: <strong style={{ color: "var(--ink)" }}>{current.name}</strong>
            {current.client_id && (
              <> · for {byId.get(current.client_id) ?? "—"}</>
            )}
          </div>
        )}
      </div>

      {sheets.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 0.4rem" }}>Recent</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {sheets.slice(0, 12).map((s) => {
              const active = s.id === currentSheetId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSheet(s.id)}
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
                  <div style={{ fontWeight: 600, fontSize: "0.86rem", lineHeight: 1.25 }}>{s.name}</div>
                  <div style={{ marginTop: "0.18rem", fontSize: "0.72rem", color: "var(--muted)" }}>
                    {s.client_id ? byId.get(s.client_id) ?? "—" : "Unassigned"}
                    {" · "}
                    {new Date(s.updated_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {s.kind === "pdf" && " · PDF"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* The editor (or PDF link, for kind=pdf) */}
      {current?.kind === "pdf" ? (
        <PdfSheetPanel sheet={current} />
      ) : (
        <WorkoutSheetEmbed
          sheetId={currentSheetId}
          user={user}
          clients={clients}
          sessions={sessions}
        />
      )}
    </main>
  );
}

function PdfSheetPanel({ sheet }: { sheet: WorkoutSheet }) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "1rem 1.25rem",
        background: "var(--paper)",
      }}
    >
      <h3 style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Uploaded PDF</h3>
      <p style={{ marginTop: "0.3rem" }}>
        <strong>{sheet.pdf_original_filename ?? sheet.name}</strong>
      </p>
      <p className="meta">PDF sheets aren&rsquo;t edited inline; open or download via the link below.</p>
      <Link
        href={`/api/workout-sheets/${sheet.id}/pdf`}
        target="_blank"
        rel="noopener"
        className="btn btn-primary"
        style={{ display: "inline-block", marginTop: "0.5rem" }}
      >
        Open PDF
      </Link>
    </section>
  );
}

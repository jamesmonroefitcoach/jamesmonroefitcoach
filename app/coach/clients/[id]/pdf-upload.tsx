"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Tiny upload form used inside WorkoutSheetsSection (and reusable elsewhere).
// File-picker + optional display-name + Upload button → POSTs multipart to
// /api/workout-sheets/pdf-upload, then router.refresh() to surface the new row.
export default function PdfUpload({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (name.trim()) fd.append("name", name.trim());
      fd.append("client_id", clientId);
      const res = await fetch("/api/workout-sheets/pdf-upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setFile(null);
      setName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "0.82rem",
    padding: "0.36rem 0.45rem",
    border: "1px solid var(--line)",
    borderRadius: 4,
    background: "var(--paper)",
    color: "var(--ink)",
  };

  return (
    <div
      style={{
        border: "1px dashed var(--line)",
        borderRadius: 6,
        padding: "0.7rem 0.85rem",
        background: "var(--paper)",
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
        Upload a filled PDF sheet for this client
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ ...inputStyle, padding: "0.2rem" }}
        />
        <input
          type="text"
          placeholder="Sheet name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 180px", minWidth: 140 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={upload}
          disabled={!file || uploading}
          style={{ opacity: !file || uploading ? 0.6 : 1 }}
        >
          {uploading ? "Uploading…" : "Upload PDF"}
        </button>
      </div>
      {error && (
        <div style={{ color: "var(--rust)", fontSize: "0.78rem", marginTop: "0.4rem" }}>{error}</div>
      )}
    </div>
  );
}

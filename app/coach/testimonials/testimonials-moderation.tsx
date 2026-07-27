"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setTestimonialStatus,
  updateTestimonial,
  deleteTestimonial,
  coachUploadTestimonialPhoto,
  coachCreateTestimonial,
} from "@/app/testimonials/actions";
import {
  type Testimonial,
  type TestimonialStatus,
  allBeforeUrls,
  allAfterUrls,
} from "@/app/testimonials/types";

const STATUS_LABELS: Record<TestimonialStatus, string> = {
  new:      "Pending",
  approved: "Approved",
  declined: "Declined",
  hidden:   "Hidden",
};
const STATUS_COLORS: Record<TestimonialStatus, string> = {
  new:      "#a83d2b",
  approved: "#5a6b4a",
  declined: "#7a6f63",
  hidden:   "#7a6f63",
};

export default function TestimonialsModeration({ initial }: { initial: Testimonial[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<TestimonialStatus | "all">("new");
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const c: Record<TestimonialStatus, number> = { new: 0, approved: 0, declined: 0, hidden: 0 };
    for (const t of initial) c[t.status] += 1;
    return c;
  }, [initial]);

  const rows = useMemo(() => {
    if (filter === "all") return initial;
    return initial.filter((t) => t.status === filter);
  }, [initial, filter]);

  function run<T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) {
    start(async () => {
      const res = await p;
      if (!res.ok) setErr(res.error);
      else { setErr(null); router.refresh(); }
    });
  }

  return (
    <section>
      {err && (
        <div style={{
          marginBottom: "0.7rem",
          padding: "0.5rem 0.75rem",
          border: "1px solid var(--red)",
          background: "rgba(192,57,43,0.08)",
          color: "var(--red)",
          borderRadius: 3,
          fontSize: "0.84rem",
        }}>{err}</div>
      )}

      {/* Coach-created entry: for clients who never submitted a testimonial */}
      <div style={{ marginBottom: "0.9rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Close" : "Add entry +"}
        </button>
        {adding ? (
          <AddEntryForm
            pending={pending}
            run={run}
            onDone={() => setAdding(false)}
          />
        ) : null}
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
        {(["new", "approved", "declined", "hidden", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "var(--ink)" : "transparent",
              color: filter === f ? "var(--bg)" : "var(--ink)",
              border: "1px solid " + (filter === f ? "var(--ink)" : "var(--line)"),
              borderRadius: 999,
              padding: "0.22rem 0.7rem",
              fontSize: "0.78rem",
              fontFamily: "var(--font-heading), Oswald, sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: "pointer",
            }}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
            {f !== "all" && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{counts[f]}</span>
            )}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic", padding: "1.5rem 0.4rem", textAlign: "center" }}>
          {filter === "new"
            ? "No pending testimonials. James gets a chance to review the moment a client submits one."
            : "Nothing in this view."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          {rows.map((t) => (
            <TestimonialCard
              key={t.id}
              t={t}
              isEditing={editingId === t.id}
              onEdit={() => setEditingId(t.id)}
              onClose={() => setEditingId(null)}
              run={run}
              pending={pending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TestimonialCard({
  t, isEditing, onEdit, onClose, run, pending,
}: {
  t: Testimonial;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  run: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
  pending: boolean;
}) {
  const displayed = t.display_name || t.submitted_name;

  return (
    <li style={{
      background: "var(--paper)",
      border: "1px solid var(--line)",
      borderLeft: `4px solid ${STATUS_COLORS[t.status]}`,
      borderRadius: 3,
      padding: "0.85rem 0.95rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.96rem" }}>{displayed}</strong>
        {t.display_name && t.display_name !== t.submitted_name && (
          <span className="meta" style={{ fontSize: "0.72rem" }}>
            (submitted as &ldquo;{t.submitted_name}&rdquo;)
          </span>
        )}
        <span style={{
          background: STATUS_COLORS[t.status],
          color: "var(--bg)",
          fontSize: "0.7rem",
          padding: "0.1rem 0.45rem",
          borderRadius: 2,
          fontFamily: "var(--font-heading), Oswald, sans-serif",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>{STATUS_LABELS[t.status]}</span>
        {t.is_published && t.status === "approved" && (
          <span className="meta" style={{ fontSize: "0.7rem" }}>· live on /</span>
        )}
        <span className="meta" style={{ fontSize: "0.74rem", marginLeft: "auto" }}>
          submitted {new Date(t.created_at).toLocaleDateString()}
        </span>
      </div>

      {t.meta_line && (
        <div className="meta" style={{ marginTop: "0.2rem", fontSize: "0.82rem", fontStyle: "italic" }}>
          {t.meta_line}
        </div>
      )}

      <blockquote style={{
        margin: "0.5rem 0 0",
        padding: "0.55rem 0.8rem",
        borderLeft: "2px solid var(--rust)",
        background: "var(--bg)",
        whiteSpace: "pre-wrap",
        fontSize: "0.92rem",
        lineHeight: 1.55,
      }}>{t.body}</blockquote>

      {/* Image grid — collapses legacy single-URL + new array columns
          into one flat list per side. Each side renders all attached
          photos as small tiles so James can scan the set. */}
      {(allBeforeUrls(t).length > 0 || allAfterUrls(t).length > 0) && (
        <div style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <PhotoStrip urls={allBeforeUrls(t)} label="Before" />
          <PhotoStrip urls={allAfterUrls(t)}  label="After"  />
        </div>
      )}

      {isEditing ? (
        <EditForm t={t} onClose={onClose} run={run} pending={pending} />
      ) : (
        <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {/* Big moves */}
          {t.status !== "approved" && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
              disabled={pending}
              onClick={() => run(setTestimonialStatus(t.id, "approved"))}
            >✓ Approve &amp; publish</button>
          )}
          {t.status === "approved" && t.is_published && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
              disabled={pending}
              onClick={() => run(updateTestimonial(t.id, { is_published: false }))}
            >Unpublish</button>
          )}
          {t.status === "approved" && !t.is_published && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
              disabled={pending}
              onClick={() => run(updateTestimonial(t.id, { is_published: true }))}
            >Publish</button>
          )}
          {t.status !== "declined" && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
              disabled={pending}
              onClick={() => run(setTestimonialStatus(t.id, "declined"))}
            >Decline</button>
          )}
          {t.status !== "hidden" && t.status !== "new" && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
              disabled={pending}
              onClick={() => run(setTestimonialStatus(t.id, "hidden"))}
            >Hide</button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
            onClick={onEdit}
          >✎ Edit / name / photos</button>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--red)",
              fontSize: "0.78rem",
              cursor: pending ? "not-allowed" : "pointer",
              padding: "0.25rem 0.45rem",
              marginLeft: "auto",
            }}
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this testimonial?")) run(deleteTestimonial(t.id));
            }}
          >delete</button>
        </div>
      )}
    </li>
  );
}

function PhotoStrip({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) {
    return (
      <div>
        <span style={{
          display: "inline-block",
          marginBottom: "0.25rem",
          background: "var(--ink)",
          color: "var(--bg)",
          padding: "0.12rem 0.42rem",
          fontSize: "0.66rem",
          letterSpacing: "0.08em",
          borderRadius: 2,
        }}>{label.toUpperCase()}</span>
        <div style={{
          aspectRatio: "4 / 5",
          background: "repeating-linear-gradient(45deg, var(--paper) 0 10px, #efe6d3 10px 20px)",
          border: "1px dashed var(--line)",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: "0.74rem",
        }}>(no {label.toLowerCase()})</div>
      </div>
    );
  }
  return (
    <div>
      <span style={{
        display: "inline-block",
        marginBottom: "0.25rem",
        background: "var(--ink)",
        color: "var(--bg)",
        padding: "0.12rem 0.42rem",
        fontSize: "0.66rem",
        letterSpacing: "0.08em",
        borderRadius: 2,
      }}>{label.toUpperCase()} · {urls.length}</span>
      <div style={{
        display: "grid",
        gridTemplateColumns: urls.length > 1 ? "repeat(auto-fill, minmax(80px, 1fr))" : "1fr",
        gap: "0.3rem",
      }}>
        {urls.map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noopener" style={{
            display: "block",
            aspectRatio: "4 / 5",
            border: "1px solid var(--line)",
            borderRadius: 2,
            overflow: "hidden",
            background: "var(--bg)",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`${label} ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </a>
        ))}
      </div>
    </div>
  );
}

function EditForm({
  t, onClose, run, pending,
}: {
  t: Testimonial;
  onClose: () => void;
  run: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(t.display_name ?? "");
  const [meta, setMeta] = useState(t.meta_line ?? "");
  const [body, setBody] = useState(t.body);
  const [before, setBefore] = useState(t.before_image_url ?? "");
  const [after, setAfter] = useState(t.after_image_url ?? "");
  const [order, setOrder] = useState(String(t.sort_order));

  return (
    <div style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      <div className="test-mod-edit-row" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px", gap: "0.45rem" }}>
        <label style={col}>
          <span style={lbl}>Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.submitted_name}
            style={inp}
          />
        </label>
        <label style={col}>
          <span style={lbl}>Subtitle</span>
          <input
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            placeholder='e.g. "Down 22 lb · DL 405"'
            style={inp}
          />
        </label>
        <label style={col}>
          <span style={lbl}>Sort</span>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            style={inp}
          />
        </label>
      </div>

      <label style={col}>
        <span style={lbl}>Body</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          style={inp}
        />
      </label>

      <div className="test-mod-image-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <PhotoField kind="before" label="Before photo" value={before} onChange={setBefore} />
        <PhotoField kind="after" label="After photo" value={after} onChange={setAfter} />
      </div>

      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
          onClick={onClose}
        >Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
          disabled={pending}
          onClick={() => {
            run(updateTestimonial(t.id, {
              display_name: name || null,
              meta_line: meta || null,
              body,
              before_image_url: before || null,
              after_image_url: after || null,
              sort_order: Number(order) || 0,
            }));
            onClose();
          }}
        >Save</button>
      </div>
    </div>
  );
}

// Coach-authored entry: name + optional subtitle/quote + photos. Lands
// approved & published, so it's on the site as soon as it's saved.
function AddEntryForm({
  pending, run, onDone,
}: {
  pending: boolean;
  run: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [meta, setMeta] = useState("");
  const [body, setBody] = useState("");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");

  return (
    <div style={{ marginTop: "0.6rem", padding: "0.7rem", border: "1px solid var(--line)", borderRadius: 4, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      <div className="test-mod-edit-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <label style={col}>
          <span style={lbl}>Client name (shown on site)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rexton L." style={inp} />
        </label>
        <label style={col}>
          <span style={lbl}>Subtitle (optional)</span>
          <input value={meta} onChange={(e) => setMeta(e.target.value)} placeholder='e.g. "Down 22 lb · DL 405"' style={inp} />
        </label>
      </div>
      <label style={col}>
        <span style={lbl}>Quote (optional — leave blank for photos only)</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} style={inp} />
      </label>
      <div className="test-mod-image-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <PhotoField kind="before" label="Before photo" value={before} onChange={setBefore} />
        <PhotoField kind="after" label="After photo" value={after} onChange={setAfter} />
      </div>
      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }} onClick={onDone}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
          disabled={pending || !name.trim()}
          onClick={() => {
            run(coachCreateTestimonial({
              display_name: name,
              meta_line: meta || null,
              body: body || null,
              before_image_url: before || null,
              after_image_url: after || null,
            }));
            onDone();
          }}
        >Add to site</button>
      </div>
    </div>
  );
}

// URL field + phone-friendly upload button. Picking a file uploads it to the
// testimonial-photos bucket right away and drops the public URL into the
// field; James still hits Save to persist it on the row.
function PhotoField({
  kind, label, value, onChange,
}: {
  kind: "before" | "after";
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const res = await coachUploadTestimonialPhoto(fd);
    setBusy(false);
    if (res.ok && res.data?.url) onChange(res.data.url);
    else setErr(res.ok ? "Upload failed — please try again." : res.error);
  }

  return (
    <label style={col}>
      <span style={lbl}>{label}</span>
      <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload →"
          style={{ ...inp, flex: "1 1 0", minWidth: 0 }}
        />
        <label
          className="btn btn-ghost"
          style={{ padding: "0.25rem 0.55rem", fontSize: "0.74rem", cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}
        >
          {busy ? "Uploading…" : "📷 Upload"}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {value ? (
        <img
          src={value}
          alt={`${label} preview`}
          style={{ marginTop: "0.25rem", maxWidth: 96, maxHeight: 96, objectFit: "cover", borderRadius: 3, border: "1px solid var(--line)" }}
        />
      ) : null}
      {err ? <span style={{ fontSize: "0.72rem", color: "var(--rust)" }}>{err}</span> : null}
    </label>
  );
}

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.2rem" };
const lbl: React.CSSProperties = {
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--muted)",
  fontFamily: "var(--font-heading), Oswald, sans-serif",
};
const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: "0.4rem 0.55rem",
  font: "inherit",
  color: "var(--ink)",
  fontSize: "0.88rem",
};

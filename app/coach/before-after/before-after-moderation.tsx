"use client";

// Photo-only editing surface for the "Client results" section on the public
// site. Reads/writes the same `testimonials` rows as the Testimonials
// screen (client submissions carry a quote + photos together), but only
// ever touches the photo fields — approving/declining a submission and
// editing the quote text stay on /coach/testimonials.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateBeforeAfterPhoto,
  coachUploadTestimonialPhoto,
  coachCreateBeforeAfter,
} from "@/app/testimonials/actions";
import {
  type Testimonial,
  type TestimonialStatus,
  allBeforeUrls,
  allAfterUrls,
} from "@/app/testimonials/types";

type Fit = "cover" | "contain";
// One photo side's full edit state: url + crop mode + zoom/focal point.
// Zoom/pos only apply when fit === "cover" — matches how the row is
// actually rendered on the public site.
type PhotoState = { url: string; fit: Fit; zoom: number; posX: number; posY: number };

function photoStateFor(t: Testimonial, side: "before" | "after"): PhotoState {
  const urls = side === "before" ? allBeforeUrls(t) : allAfterUrls(t);
  const fit = (side === "before" ? t.before_fit : t.after_fit) ?? "cover";
  const zoom = (side === "before" ? t.before_zoom : t.after_zoom) ?? 1;
  const posX = (side === "before" ? t.before_pos_x : t.after_pos_x) ?? 50;
  const posY = (side === "before" ? t.before_pos_y : t.after_pos_y) ?? 0;
  return { url: urls[0] ?? "", fit, zoom, posX, posY };
}
const BLANK_PHOTO: PhotoState = { url: "", fit: "cover", zoom: 1, posX: 50, posY: 0 };

const STATUS_LABELS: Record<TestimonialStatus, string> = {
  new:      "Pending approval",
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

export default function BeforeAfterModeration({ initial }: { initial: Testimonial[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(true);

  const rows = useMemo(() => {
    if (!onlyWithPhotos) return initial;
    return initial.filter((t) => allBeforeUrls(t).length > 0 || allAfterUrls(t).length > 0);
  }, [initial, onlyWithPhotos]);

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

      {/* Coach-created photo-only entry — for clients who never submitted */}
      <div style={{ marginBottom: "0.9rem", display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Close" : "Add entry +"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={onlyWithPhotos}
            onChange={(e) => setOnlyWithPhotos(e.target.checked)}
          />
          Only show entries with photos
        </label>
      </div>
      {adding ? <AddEntryForm pending={pending} run={run} onDone={() => setAdding(false)} /> : null}

      {rows.length === 0 ? (
        <p className="meta" style={{ fontStyle: "italic", padding: "1.5rem 0.4rem", textAlign: "center" }}>
          Nothing here yet. Add an entry, or uncheck &ldquo;Only show entries with photos&rdquo; to see
          every submission.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          {rows.map((t) => (
            <BeforeAfterCard
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

function BeforeAfterCard({
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
  const before = photoStateFor(t, "before");
  const after = photoStateFor(t, "after");

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
        {t.status !== "approved" && (
          <span className="meta" style={{ fontSize: "0.72rem" }}>
            (approve this submission on Testimonials first)
          </span>
        )}
      </div>

      {t.meta_line && !isEditing && (
        <div className="meta" style={{ marginTop: "0.2rem", fontSize: "0.82rem", fontStyle: "italic" }}>
          {t.meta_line}
        </div>
      )}

      {isEditing ? (
        <EditForm t={t} onClose={onClose} run={run} pending={pending} />
      ) : (
        <>
          <div style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <Preview state={before} label="Before" />
            <Preview state={after} label="After" />
          </div>
          <div style={{ marginTop: "0.7rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {t.status === "approved" && t.is_published && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
                disabled={pending}
                onClick={() => run(updateBeforeAfterPhoto(t.id, { is_published: false }))}
              >Unpublish</button>
            )}
            {t.status === "approved" && !t.is_published && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
                disabled={pending}
                onClick={() => run(updateBeforeAfterPhoto(t.id, { is_published: true }))}
              >Publish</button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
              onClick={onEdit}
            >✎ Edit photos</button>
          </div>
        </>
      )}
    </li>
  );
}

// Read-only, crop-accurate preview — mirrors exactly what the public site
// renders (same object-position + transform math as BeforeAfterToggle).
function Preview({ state, label }: { state: PhotoState; label: string }) {
  const { url, fit, zoom, posX, posY } = state;
  const cropStyle = fit === "cover"
    ? { objectPosition: `${posX}% ${posY}%`, transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: `${posX}% ${posY}%` }
    : undefined;
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
        background: url ? "var(--bg)" : "repeating-linear-gradient(45deg, var(--paper) 0 10px, #efe6d3 10px 20px)",
        border: url ? "1px solid var(--line)" : "1px dashed var(--line)",
        borderRadius: 2,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted)",
        fontSize: "0.74rem",
      }}>
        {url
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: fit, display: "block", ...cropStyle }} />
          : `(no ${label.toLowerCase()})`}
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
  const [before, setBefore] = useState<PhotoState>(photoStateFor(t, "before"));
  const [after, setAfter] = useState<PhotoState>(photoStateFor(t, "after"));
  const [order, setOrder] = useState(String(t.sort_order));

  return (
    <div style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      <div className="test-mod-edit-row" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px", gap: "0.45rem" }}>
        <label style={col}>
          <span style={lbl}>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.submitted_name} style={inp} />
        </label>
        <label style={col}>
          <span style={lbl}>Caption</span>
          <input value={meta} onChange={(e) => setMeta(e.target.value)} placeholder='e.g. "Strength + recomp focus…"' style={inp} />
        </label>
        <label style={col}>
          <span style={lbl}>Sort</span>
          <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} style={inp} />
        </label>
      </div>

      <div className="test-mod-image-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <CropField kind="before" label="Before photo" state={before} onChange={setBefore} />
        <CropField kind="after" label="After photo" state={after} onChange={setAfter} />
      </div>

      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }} onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
          disabled={pending}
          onClick={() => {
            run(updateBeforeAfterPhoto(t.id, {
              display_name: name || null,
              meta_line: meta || null,
              before_image_url: before.url || null,
              after_image_url: after.url || null,
              before_fit: before.fit,
              after_fit: after.fit,
              before_zoom: before.zoom,
              before_pos_x: before.posX,
              before_pos_y: before.posY,
              after_zoom: after.zoom,
              after_pos_x: after.posX,
              after_pos_y: after.posY,
              sort_order: Number(order) || 0,
            }));
            onClose();
          }}
        >Save</button>
      </div>
    </div>
  );
}

// Coach-authored photo-only entry: no quote text at all (that field lives
// on the Testimonials screen's "Add entry +").
function AddEntryForm({
  pending, run, onDone,
}: {
  pending: boolean;
  run: <T>(p: Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [meta, setMeta] = useState("");
  const [before, setBefore] = useState<PhotoState>(BLANK_PHOTO);
  const [after, setAfter] = useState<PhotoState>(BLANK_PHOTO);

  return (
    <div style={{ marginBottom: "0.9rem", padding: "0.7rem", border: "1px solid var(--line)", borderRadius: 4, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      <div className="test-mod-edit-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <label style={col}>
          <span style={lbl}>Client name (shown on site)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rexton L." style={inp} />
        </label>
        <label style={col}>
          <span style={lbl}>Caption (optional)</span>
          <input value={meta} onChange={(e) => setMeta(e.target.value)} placeholder='e.g. "Strength + recomp focus…"' style={inp} />
        </label>
      </div>
      <div className="test-mod-image-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <CropField kind="before" label="Before photo" state={before} onChange={setBefore} />
        <CropField kind="after" label="After photo" state={after} onChange={setAfter} />
      </div>
      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }} onClick={onDone}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
          disabled={pending || !name.trim()}
          onClick={() => {
            run(coachCreateBeforeAfter({
              display_name: name,
              meta_line: meta || null,
              before_image_url: before.url || null,
              after_image_url: after.url || null,
              before_fit: before.fit,
              after_fit: after.fit,
              before_zoom: before.zoom,
              before_pos_x: before.posX,
              before_pos_y: before.posY,
              after_zoom: after.zoom,
              after_pos_x: after.posX,
              after_pos_y: after.posY,
            }));
            onDone();
          }}
        >Add to site</button>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// URL field + phone-friendly upload button + crop mode. When "Crop to fill"
// is selected, an interactive frame lets James drag the photo to reposition
// it and use a slider to zoom in — same math the public site renders with,
// so what he sees here is what ships.
function CropField({
  kind, label, state, onChange,
}: {
  kind: "before" | "after";
  label: string;
  state: PhotoState;
  onChange: (next: PhotoState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const res = await coachUploadTestimonialPhoto(fd);
    setBusy(false);
    if (res.ok && res.data?.url) onChange({ ...state, url: res.data.url });
    else setErr(res.ok ? "Upload failed — please try again." : res.error);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (state.fit !== "cover" || !state.url) return;
    dragging.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = e.clientX - dragging.current.x;
    const dy = e.clientY - dragging.current.y;
    dragging.current = { x: e.clientX, y: e.clientY };
    const nextX = clamp(state.posX - (dx / rect.width) * 100 / state.zoom, 0, 100);
    const nextY = clamp(state.posY - (dy / rect.height) * 100 / state.zoom, 0, 100);
    onChange({ ...state, posX: nextX, posY: nextY });
  }
  function onPointerUp() {
    dragging.current = null;
  }

  const showCropTools = state.fit === "cover" && !!state.url;

  return (
    <label style={col}>
      <span style={lbl}>{label}</span>
      <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
        <input
          type="url"
          value={state.url}
          onChange={(e) => onChange({ ...state, url: e.target.value })}
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

      <div style={{ display: "flex", gap: "0.8rem", marginTop: "0.15rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem", color: "var(--muted)" }}>
          <input type="radio" checked={state.fit === "cover"} onChange={() => onChange({ ...state, fit: "cover" })} />
          Crop to fill
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem", color: "var(--muted)" }}>
          <input type="radio" checked={state.fit === "contain"} onChange={() => onChange({ ...state, fit: "contain" })} />
          Show full body
        </span>
      </div>

      {showCropTools ? (
        <>
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{
              marginTop: "0.3rem",
              width: 120,
              aspectRatio: "4 / 5",
              overflow: "hidden",
              borderRadius: 3,
              border: "1px solid var(--line)",
              cursor: "grab",
              touchAction: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.url}
              alt={`${label} preview`}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${state.posX}% ${state.posY}%`,
                transform: `scale(${state.zoom})`,
                transformOrigin: `${state.posX}% ${state.posY}%`,
                display: "block",
                pointerEvents: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>Zoom</span>
            <input
              type="range"
              min="1" max="3" step="0.05"
              value={state.zoom}
              onChange={(e) => onChange({ ...state, zoom: Number(e.target.value) })}
              style={{ flex: "1 1 0" }}
            />
            <button
              type="button"
              onClick={() => onChange({ ...state, zoom: 1, posX: 50, posY: 0 })}
              style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: "0.68rem", cursor: "pointer", textDecoration: "underline" }}
            >reset</button>
          </div>
          <span className="meta" style={{ fontSize: "0.68rem" }}>Drag the photo to reposition.</span>
        </>
      ) : state.url ? (
        <img
          src={state.url}
          alt={`${label} preview`}
          style={{ marginTop: "0.25rem", maxWidth: 96, maxHeight: 96, objectFit: "contain", borderRadius: 3, border: "1px solid var(--line)" }}
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

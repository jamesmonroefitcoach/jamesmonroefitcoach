"use client";
import { useMemo, useState, useTransition } from "react";
import type { ClientRow } from "@/lib/data";
import type { SlotOffer } from "./data";
import { saveSlotOffer, cancelSlotOffer, deleteSlotOffer } from "./actions";

type Mode = null | { kind: "new" } | { kind: "edit"; offer: SlotOffer };

const TIERS: ("tier_1" | "tier_2" | "tier_3")[] = ["tier_1", "tier_2", "tier_3"];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): string { return new Date(s).toISOString(); }

function defaultDraft(): SlotOffer {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: "",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    notes: "",
    status: "open",
    notify_only: false,
    target_tier: null,
    target_client_ids: [],
    claimed_by: null,
    claimed_at: null
  };
}

export default function AvailabilityClient({ clients, initialOffers }: { clients: ClientRow[]; initialOffers: SlotOffer[] }) {
  const [offers, setOffers] = useState(initialOffers);
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState<SlotOffer>(defaultDraft());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const open = offers.filter((o) => o.status === "open").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const claimed = offers.filter((o) => o.status === "claimed").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const past = offers.filter((o) => o.status === "cancelled" || new Date(o.starts_at).getTime() < Date.now()).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    return { open, claimed, past };
  }, [offers]);

  function openNew() { setMode({ kind: "new" }); setDraft(defaultDraft()); setErr(null); }
  function openEdit(o: SlotOffer) { setMode({ kind: "edit", offer: o }); setDraft({ ...o }); setErr(null); }
  function close() { setMode(null); }

  function toggleClient(id: string) {
    setDraft((d) => {
      const has = d.target_client_ids.includes(id);
      return { ...d, target_client_ids: has ? d.target_client_ids.filter((x) => x !== id) : [...d.target_client_ids, id] };
    });
  }

  function save() {
    setErr(null);
    start(async () => {
      const res = await saveSlotOffer({
        id: mode?.kind === "edit" ? mode.offer.id : undefined,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        notes: draft.notes,
        notify_only: draft.notify_only,
        target_tier: draft.target_tier,
        target_client_ids: draft.target_client_ids
      });
      if (!res.ok) {
        if (res.error.startsWith("Supabase not configured")) {
          // local-only fallback
          if (mode?.kind === "edit") {
            setOffers((cur) => cur.map((o) => (o.id === mode.offer.id ? { ...draft, id: o.id } : o)));
          } else {
            setOffers((cur) => [...cur, { ...draft, id: `local-${Date.now()}` }]);
          }
          close();
          return;
        }
        setErr(res.error);
        return;
      }
      // best-effort optimistic refresh
      if (mode?.kind === "edit") {
        setOffers((cur) => cur.map((o) => (o.id === mode.offer.id ? { ...draft, id: o.id } : o)));
      } else {
        setOffers((cur) => [...cur, { ...draft, id: res.data?.id ?? `local-${Date.now()}` }]);
      }
      close();
    });
  }

  function cancel(id: string) {
    setErr(null);
    start(async () => {
      const res = await cancelSlotOffer(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setErr(res.error);
        return;
      }
      setOffers((cur) => cur.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
    });
  }
  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteSlotOffer(id);
      if (!res.ok && !res.error.startsWith("Supabase not configured")) {
        setErr(res.error);
        return;
      }
      setOffers((cur) => cur.filter((o) => o.id !== id));
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button className="btn btn-primary" onClick={openNew}>+ Open a slot</button>
      </div>

      {err ? <p style={{ color: "var(--red)" }}>{err}</p> : null}

      <Section title="Open offers" rows={grouped.open} clients={clients} onEdit={openEdit} onCancel={cancel} onDelete={remove} />
      <Section title="Claimed" rows={grouped.claimed} clients={clients} onEdit={openEdit} onCancel={cancel} onDelete={remove} />
      <Section title="History" rows={grouped.past} clients={clients} onEdit={openEdit} onCancel={cancel} onDelete={remove} dim />

      {mode ? (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(23,19,17,0.4)", zIndex: 50 }} onClick={close}>
          <aside onClick={(e) => e.stopPropagation()} className="card" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(440px, 95vw)", borderRadius: 0, borderLeft: "1px solid var(--line)", padding: "1.25rem 1.4rem", overflow: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge">{mode.kind === "edit" ? "Edit slot" : "New slot"}</span>
              <button className="btn btn-ghost" onClick={close} style={{ padding: "0.25rem 0.55rem" }}>Close</button>
            </div>

            <div>
              <label className="stat-label">Window</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.3rem" }}>
                <input className="input" type="datetime-local" value={toLocalInput(draft.starts_at)} onChange={(e) => setDraft({ ...draft, starts_at: fromLocalInput(e.target.value) })} />
                <input className="input" type="datetime-local" value={toLocalInput(draft.ends_at)} onChange={(e) => setDraft({ ...draft, ends_at: fromLocalInput(e.target.value) })} />
              </div>
            </div>

            <div>
              <label className="stat-label">Visibility</label>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
                <button type="button" className="btn" style={{ flex: 1, background: !draft.notify_only ? "var(--ink)" : undefined, color: !draft.notify_only ? "var(--paper)" : undefined }} onClick={() => setDraft({ ...draft, notify_only: false })}>Claimable</button>
                <button type="button" className="btn" style={{ flex: 1, background: draft.notify_only ? "var(--ink)" : undefined, color: draft.notify_only ? "var(--paper)" : undefined }} onClick={() => setDraft({ ...draft, notify_only: true })}>Notify only</button>
              </div>
              <p className="meta" style={{ fontSize: "0.74rem", marginTop: "0.3rem" }}>
                {draft.notify_only ? "Targeted clients see it but can't grab it directly — they'll text you." : "First targeted client to claim books the slot."}
              </p>
            </div>

            <div>
              <label className="stat-label">Tier audience (optional)</label>
              <select className="select" value={draft.target_tier ?? ""} onChange={(e) => setDraft({ ...draft, target_tier: (e.target.value || null) as any })} style={{ marginTop: "0.3rem" }}>
                <option value="">— none —</option>
                {TIERS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>

            <div>
              <label className="stat-label">Specific clients</label>
              <div style={{ marginTop: "0.3rem", maxHeight: 220, overflow: "auto", border: "1px solid var(--line)", borderRadius: 3, padding: "0.4rem 0.6rem" }}>
                {clients.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={draft.target_client_ids.includes(c.id)} onChange={() => toggleClient(c.id)} />
                    <span>{c.full_name}</span>
                    <span className="meta" style={{ marginLeft: "auto", fontSize: "0.72rem" }}>{c.tier?.replace("_", " ") ?? ""}</span>
                  </label>
                ))}
              </div>
              <p className="meta" style={{ fontSize: "0.72rem", marginTop: "0.3rem" }}>
                If you set a Tier above, every client in that tier sees it automatically. Pick specific clients to add anyone outside that tier.
              </p>
            </div>

            <div>
              <label className="stat-label">Note</label>
              <input className="input" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ marginTop: "0.3rem" }} placeholder="(optional) e.g. Backfill — short notice" />
            </div>

            <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid var(--line)", paddingTop: "0.85rem" }}>
              <button className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Section({
  title, rows, clients, onEdit, onCancel, onDelete, dim
}: {
  title: string;
  rows: SlotOffer[];
  clients: ClientRow[];
  onEdit: (o: SlotOffer) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  dim?: boolean;
}) {
  if (!rows.length) return null;
  const idToName: Record<string, string> = Object.fromEntries(clients.map((c) => [c.id, c.full_name]));
  return (
    <div className="card" style={{ marginTop: "0.85rem", padding: 0, opacity: dim ? 0.7 : 1 }}>
      <div style={{ padding: "0.7rem 1rem", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ margin: 0 }}>{title} <span className="meta" style={{ fontSize: "0.74rem", marginLeft: 6 }}>({rows.length})</span></h3>
      </div>
      <table className="table">
        <thead>
          <tr><th>When</th><th>Visibility</th><th>Audience</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>{new Date(o.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td>{o.notify_only ? <span className="badge badge-amber">notify only</span> : <span className="badge badge-sage">claimable</span>}{o.status === "cancelled" ? <span className="badge badge-red" style={{ marginLeft: 4 }}>cancelled</span> : null}{o.status === "claimed" ? <span className="badge" style={{ marginLeft: 4 }}>claimed</span> : null}</td>
              <td className="meta" style={{ fontSize: "0.78rem" }}>
                {o.target_tier ? <>tier {o.target_tier.replace("tier_", "")}</> : null}
                {o.target_tier && o.target_client_ids.length ? " · " : null}
                {o.target_client_ids.length ? o.target_client_ids.map((id) => idToName[id] ?? id).join(", ") : null}
                {!o.target_tier && !o.target_client_ids.length ? "— pick at least one —" : null}
              </td>
              <td className="meta">{o.notes ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => onEdit(o)}>Edit</button>{" "}
                {o.status === "open" ? <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }} onClick={() => onCancel(o.id)}>Cancel</button> : null}{" "}
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", color: "var(--red)" }} onClick={() => onDelete(o.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

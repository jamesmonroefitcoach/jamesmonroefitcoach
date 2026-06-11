"use client";
import { useState } from "react";
import type { CheckInRow } from "@/lib/check-ins";
import { fmtDate } from "@/lib/format";

// Past check-ins — collapsible cards. Header row shows date + weight; expand
// to see the full survey answers.
export default function CheckInsList({ checkIns }: { checkIns: CheckInRow[] }) {
  if (checkIns.length === 0) {
    return (
      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Past check-ins</h2>
        <p className="meta" style={{ fontStyle: "italic" }}>
          Nothing yet. Submit your first one above.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
        Past check-ins <span className="meta" style={{ fontSize: "0.78rem", fontWeight: 400, marginLeft: "0.4rem" }}>{checkIns.length}</span>
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {checkIns.map((c) => <Row key={c.id} c={c} />)}
      </div>
    </section>
  );
}

function Row({ c }: { c: CheckInRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "0.55rem 0.8rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.6rem",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
          {open ? "▾" : "▸"} {fmtDate(c.submitted_at)}
        </span>
        <span className="meta" style={{ fontSize: "0.74rem" }}>
          {c.weight_lb != null ? `${c.weight_lb} lb` : "—"}
          {c.satisfaction != null ? ` · ${c.satisfaction}/5 satisfaction` : ""}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 0.85rem 0.85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem 1rem" }}>
          <Stat label="Weight" value={c.weight_lb != null ? `${c.weight_lb} lb` : "—"} />
          <Stat label="Body fat %" value={c.body_fat_pct != null ? `${c.body_fat_pct}%` : "—"} />
          <Stat label="Sleep / recovery" value={c.sleep_recovery != null ? `${c.sleep_recovery}/5` : "—"} />
          <Stat label="Satisfaction" value={c.satisfaction != null ? `${c.satisfaction}/5` : "—"} />
          <Stat label="Nutrition confidence" value={c.nutrition_conf != null ? `${c.nutrition_conf}/5` : "—"} />
          <Stat label="Commitment" value={c.commitment != null ? `${c.commitment}/10` : "—"} />

          <Block label="Goals" value={c.goals_text} />
          <Block label="Where you want support" value={c.improvement_text} />
          <Block label="Challenges" value={c.challenges} />
          <Block label="Injuries / pain" value={c.injuries} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label" style={{ fontSize: "0.6rem" }}>{label}</div>
      <div style={{ fontSize: "0.86rem", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div className="stat-label" style={{ fontSize: "0.6rem" }}>{label}</div>
      <div style={{ fontSize: "0.84rem", whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

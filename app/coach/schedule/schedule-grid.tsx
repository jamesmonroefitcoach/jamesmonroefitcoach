"use client";
import { useMemo, useState } from "react";
import type { AppointmentRow } from "@/lib/data";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6a–7p
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Block = AppointmentRow & { day: number; hour: number };

function toBlock(a: AppointmentRow, weekStart: Date): Block {
  const start = new Date(a.starts_at);
  const day = (start.getDay() + 6) % 7; // Mon=0
  const hour = start.getHours();
  return { ...a, day, hour };
}

export default function ScheduleGrid({ weekStart, initialAppts }: { weekStart: string; initialAppts: AppointmentRow[] }) {
  const ws = useMemo(() => new Date(weekStart), [weekStart]);
  const [blocks, setBlocks] = useState<Block[]>(() => initialAppts.map((a) => toBlock(a, ws)));
  const [drag, setDrag] = useState<string | null>(null);

  function onDragStart(id: string) { setDrag(id); }
  function onDrop(day: number, hour: number) {
    if (!drag) return;
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== drag) return b;
        if (b.day === day && b.hour === hour) return b;
        return { ...b, day, hour, change_count: b.change_count + 1 };
      })
    );
    setDrag(null);
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "auto" }}>
      <div style={{ minWidth: 880, display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        <div style={{ borderBottom: "1px solid var(--line)" }}></div>
        {DAYS.map((d, i) => {
          const date = new Date(ws);
          date.setDate(ws.getDate() + i);
          return (
            <div key={d} style={{ textAlign: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--line)", borderLeft: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{d}</div>
              <div className="meta" style={{ fontSize: "0.75rem" }}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
            </div>
          );
        })}

        {HOURS.map((h) => (
          <div key={`row-${h}`} style={{ display: "contents" }}>
            <div className="meta" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", textAlign: "right", borderBottom: "1px solid var(--line)" }}>
              {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "a" : "p"}
            </div>
            {DAYS.map((_, dayIdx) => {
              const block = blocks.find((b) => b.day === dayIdx && b.hour === h);
              return (
                <div
                  key={`${h}-${dayIdx}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(dayIdx, h)}
                  style={{ minHeight: 52, borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: 4, position: "relative" }}
                >
                  {block ? (
                    <div
                      draggable
                      onDragStart={() => onDragStart(block.id)}
                      style={{
                        background: "var(--rust)",
                        color: "#fff",
                        padding: "0.3rem 0.45rem",
                        borderRadius: 3,
                        fontSize: "0.78rem",
                        cursor: "grab",
                        boxShadow: "0 1px 0 rgba(0,0,0,0.2)"
                      }}
                      title={`${block.client_name} — ${block.status}${block.change_count > 0 ? ` (${block.change_count}× changed)` : ""}`}
                    >
                      <div style={{ fontWeight: 700 }}>{block.client_name}</div>
                      <div style={{ opacity: 0.85 }}>${block.rate ?? "—"}{block.change_count > 0 ? ` · ${block.change_count}×` : ""}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

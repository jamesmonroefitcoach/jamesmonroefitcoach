"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow, MovementRow } from "@/lib/data";
import type { ClientProgramItem } from "../page";
import type { ApptOption } from "../actions";
import ReworkClient from "../rework/rework-client";
import ProgramsReworkClient from "../programs-rework/programs-rework-client";

// Wraps the two existing rework UIs behind a Session / Program selector.
// Switching the selector rewrites the URL (?type=...) so the chosen mode
// survives reloads and links from elsewhere in the app.
export default function InAppBuildClient({
  initialType,
  clients,
  libraryMovements,
  initialClientId,
  initialAppts,
  initialApptId,
  initialStartsAt,
  clientProgramSummary,
}: {
  initialType: "session" | "program";
  clients: ClientRow[];
  libraryMovements: MovementRow[];
  initialClientId: string;
  initialAppts: ApptOption[];
  initialApptId: string;
  initialStartsAt: string;
  clientProgramSummary: ClientProgramItem[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"session" | "program">(initialType);

  function pickType(next: "session" | "program") {
    if (next === type) return;
    setType(next);
    const url = new URL(window.location.href);
    url.searchParams.set("type", next);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <>
      {/* Type selector — segmented pill at the top of the In App Build tab */}
      <div
        className="no-print"
        style={{
          width: "min(1180px, 100% - 2rem)",
          margin: "0.5rem auto 0",
          display: "flex",
          gap: "0.4rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "Oswald, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontSize: "0.62rem",
            color: "var(--muted)",
            fontWeight: 600,
          }}
        >
          Build type
        </span>
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "0.15rem",
            background: "var(--paper)",
          }}
        >
          <Pill active={type === "session"} onClick={() => pickType("session")} label="Session" sub="In-gym" />
          <Pill active={type === "program"} onClick={() => pickType("program")} label="Program" sub="At-home" />
        </div>
      </div>

      {type === "session" ? (
        <ReworkClient
          clients={clients}
          initialClientId={initialClientId}
          initialAppts={initialAppts}
          initialApptId={initialApptId}
          initialStartsAt={initialStartsAt}
          libraryMovements={libraryMovements}
        />
      ) : (
        <ProgramsReworkClient
          clients={clients}
          initialClientId={initialClientId}
          libraryMovements={libraryMovements}
          clientProgramSummary={clientProgramSummary}
        />
      )}
    </>
  );
}

function Pill({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "0.32rem 0.85rem",
        background: active ? "var(--rust)" : "transparent",
        color: active ? "#fff" : "var(--ink)",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "0.84rem",
        fontWeight: active ? 600 : 400,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        lineHeight: 1.05,
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: "0.58rem", opacity: 0.8, marginTop: 1, fontWeight: 400, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {sub}
      </span>
    </button>
  );
}

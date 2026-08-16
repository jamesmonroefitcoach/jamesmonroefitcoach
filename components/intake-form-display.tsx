// Shared render for a client's intake form answers. Used by the coach client
// profile and by the client's own profile so they see the same layout.

export const FORM_SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: "General Info",
    // Name/Email are only present on answers that came from the public
    // /intake form; existing clients' Google Form imports don't carry them.
    // Empty sections are skipped below, so listing them costs nothing.
    keys: ["Name", "Email", "Phone", "Birthday", "Emergency contact", "Emergency contact phone"],
  },
  {
    title: "Goals & Progress",
    keys: [
      "Training goals",
      "Primary goal / motivation",
      "Strengths / most improved",
      "Needs most improvement",
      "Satisfaction with training (1-5)",
      "Exercises to learn / work on",
      "Commitment (1-10)",
      "Training history",
      "Event or deadline",
    ],
  },
  {
    title: "Nutrition, Injuries & Weight",
    keys: [
      "Nutrition confidence (1-5)",
      "Nutrition tracking",
      "Activity level outside training (1-5)",
      "Self-exercise days per week",
      "Sleep / recovery (1-5)",
      "Injuries / limitations",
      "Height",
      "Starting weight (lbs)",
      "Current weight (lbs)",
    ],
  },
  // The three sections below only appear on submissions from the public
  // /intake form, which adds NASM-style health screening the older Google
  // Form never asked. Existing clients render exactly as they did before.
  {
    title: "Readiness to Exercise",
    keys: [
      "Heart condition (doctor advised)",
      "Chest pain",
      "Dizziness or loss of consciousness",
      "Bone or joint problem",
      "Blood pressure or heart medication",
      "Chronic condition affecting exercise",
      "Pregnant or recent birth",
      "Other reason not to exercise",
      "Readiness details",
    ],
  },
  {
    title: "Medical & Injury History",
    keys: [
      "Past pain or injury areas",
      "Surgeries",
      "Surgery details",
      "Medical conditions",
      "Medications / supplements",
    ],
  },
  {
    title: "Daily Life & Occupation",
    keys: [
      "Occupation",
      "Extended sitting at work",
      "Repetitive movement at work",
      "Heeled shoes or boots",
      "Daily stress (1-5)",
      "Sports / hobbies",
    ],
  },
  {
    title: "Scheduling",
    keys: [
      "Sessions per month (preferred)",
      "Available days",
      "Available times",
      "Ideal session times",
      "Preferred coaching style",
      "Past consistency barriers",
      "Time frame",
    ],
  },
  {
    title: "Additional Feedback",
    keys: ["Additional requests / notes", "Questions / feedback", "Questions for James"],
  },
];

export type FormData = Record<string, string>;

export default function IntakeFormDisplay({
  formData,
  defaultOpen = true,
  emptyText = "No form received yet.",
}: {
  formData: FormData | null | undefined;
  defaultOpen?: boolean;
  emptyText?: string;
}) {
  if (!formData) {
    return <p className="meta" style={{ fontStyle: "italic" }}>{emptyText}</p>;
  }
  const covered = new Set(FORM_SECTIONS.flatMap((s) => s.keys));
  const extra = Object.entries(formData).filter(
    ([k]) => !covered.has(k) && k !== "Phone" && k !== "Birthday"
  );

  return (
    <details open={defaultOpen}>
      <summary
        style={{
          cursor: "pointer",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "var(--rust)",
          userSelect: "none",
        }}
      >
        View full response ▾
      </summary>
      <div style={{ margin: "0.85rem 0 0", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {FORM_SECTIONS.map(({ title, keys }) => {
          const entries = keys
            .filter((k) => formData[k] != null && formData[k] !== "")
            .map((k) => [k, formData[k]] as [string, string]);
          if (entries.length === 0) return null;
          return <FormSection key={title} title={title} entries={entries} />;
        })}
        {extra.length > 0 && <FormSection title="Other" entries={extra} />}
      </div>
    </details>
  );
}

function FormSection({
  title,
  entries,
}: {
  title: string;
  entries: [string, string][];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.69rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--rust)",
          marginBottom: "0.5rem",
          paddingBottom: "0.25rem",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "0.35rem 2rem",
        }}
      >
        {entries.map(([q, a]) => (
          <div
            key={q}
            style={{
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              gap: "0.2rem 0.65rem",
              alignItems: "baseline",
            }}
          >
            <span className="meta" style={{ fontSize: "0.74rem", whiteSpace: "nowrap" }}>{q}</span>
            <span style={{ fontSize: "0.84rem", whiteSpace: "pre-wrap" }}>{a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

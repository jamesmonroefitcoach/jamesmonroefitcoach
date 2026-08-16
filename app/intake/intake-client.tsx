"use client";

import { useMemo, useRef, useState } from "react";
import { submitIntake } from "./actions";
import {
  INTAKE_SECTIONS, INTAKE_FIELDS, OTHER_SUFFIX, PARQ_PDF_URL,
  type IntakeField,
} from "./questions";

function ParqCallout({ tone }: { tone: "inline" | "final" }) {
  return (
    <div className="intake-callout">
      <p>
        {tone === "final"
          ? "One last thing, and then you're done."
          : "There is one more form to fill in."}{" "}
        Please also complete the <strong>PAR-Q+</strong>, the standard health
        screening form used across the fitness industry. It opens as a PDF you
        can fill in on your phone or print. Bring it to your consultation or
        send it back to James.
      </p>
      <a
        className="public-cta public-cta-ghost intake-parq-link"
        href={PARQ_PDF_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open the official PAR-Q+ (PDF)
      </a>
    </div>
  );
}

// Public new-client intake. Built as one section per screen rather than a
// single long scroll: this is filled out on a phone from a text message, and
// the full question set is roughly 50 fields.

type Answers = Record<string, string>;

function autoComplete(field: IntakeField): string | undefined {
  switch (field.type) {
    case "email": return "email";
    case "tel":   return "tel";
    case "date":  return "bday";
    case "text":  return field.key === "Name" ? "name" : undefined;
    default:      return undefined;
  }
}

export default function IntakeClient() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const section = INTAKE_SECTIONS[step];
  const isLast = step === INTAKE_SECTIONS.length - 1;

  function set(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function toggleInList(key: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[key] ?? "").split(", ").filter(Boolean);
      const next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      return { ...prev, [key]: next.join(", ") };
    });
    setError(null);
  }

  const missing = useMemo(() => {
    return section.fields.filter(
      (f) => f.required && !(answers[f.key] ?? "").trim(),
    );
  }, [section, answers]);

  function goTo(next: number) {
    setStep(next);
    setError(null);
    // Jump back to the top: on a phone the next section otherwise opens
    // scrolled to wherever the last one ended.
    requestAnimationFrame(() =>
      topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }

  function next() {
    if (missing.length > 0) {
      setError(`Please answer: ${missing[0].label}`);
      return;
    }
    goTo(step + 1);
  }

  function buildPayload(): Answers {
    const out: Answers = { ...answers };
    for (const f of INTAKE_FIELDS) {
      if (f.type === "check" && f.other) {
        const extra = (out[f.key + OTHER_SUFFIX] ?? "").trim();
        if (extra) {
          const base = (out[f.key] ?? "").trim();
          out[f.key] = base ? `${base}, ${extra}` : extra;
        }
        delete out[f.key + OTHER_SUFFIX];
      }
    }
    return out;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (missing.length > 0) {
      setError(`Please answer: ${missing[0].label}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await submitIntake(buildPayload());
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    requestAnimationFrame(() =>
      topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }

  if (done) {
    return (
      <div className="intake-wrap" ref={topRef}>
        <div className="intake-done">
          <span className="public-eyebrow">Sent</span>
          <h1 className="intake-title">Thanks, that&rsquo;s everything.</h1>
          <p className="public-p">
            James has your answers and will be in touch to set up your consultation.
          </p>
          <ParqCallout tone="final" />
        </div>
      </div>
    );
  }

  return (
    <div className="intake-wrap" ref={topRef}>
      <header className="intake-head">
        <span className="public-eyebrow">Before your consultation</span>
        <h1 className="intake-title">New Client Intake</h1>
        <p className="public-p intake-lede">
          Your answers tell James where to start, what to keep you away from, and
          how to build a plan that fits your week. It takes about five minutes.
        </p>
      </header>

      <div className="intake-progress" aria-hidden="true">
        {INTAKE_SECTIONS.map((s, i) => (
          <span
            key={s.title}
            className={`intake-pip${i === step ? " is-current" : ""}${i < step ? " is-done" : ""}`}
          />
        ))}
      </div>
      <p className="intake-step-label">
        Step {step + 1} of {INTAKE_SECTIONS.length} &middot; {section.title}
      </p>

      <form onSubmit={submit} className="intake-form" noValidate>
        <h2 className="intake-section-title">{section.title}</h2>
        {section.blurb && <p className="intake-blurb">{section.blurb}</p>}
        {section.parqLink && <ParqCallout tone="inline" />}

        {section.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            answers={answers}
            set={set}
            toggleInList={toggleInList}
          />
        ))}

        {error && <div className="public-modal-error">{error}</div>}

        <div className="intake-nav">
          {step > 0 && (
            <button
              type="button"
              className="public-cta public-cta-ghost"
              onClick={() => goTo(step - 1)}
              disabled={submitting}
            >
              Back
            </button>
          )}
          {isLast ? (
            <button type="submit" className="public-cta" disabled={submitting}>
              {submitting ? "Sending…" : "Send to James"}
            </button>
          ) : (
            <button type="button" className="public-cta" onClick={next}>
              Next
            </button>
          )}
        </div>

        <p className="public-modal-note">
          Your answers go straight to James. Questions marked with * are required.
        </p>
      </form>
    </div>
  );
}

function Field({
  field,
  answers,
  set,
  toggleInList,
}: {
  field: IntakeField;
  answers: Answers;
  set: (key: string, value: string) => void;
  toggleInList: (key: string, option: string) => void;
}) {
  const value = answers[field.key] ?? "";
  const label = (
    <span>
      {field.label}
      {field.required ? " *" : <em> (optional)</em>}
    </span>
  );

  if (field.type === "textarea") {
    return (
      <label className="public-field">
        {label}
        <textarea
          rows={3}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => set(field.key, e.target.value)}
        />
      </label>
    );
  }

  if (field.type === "text" || field.type === "email" || field.type === "tel" || field.type === "date") {
    return (
      <label className="public-field">
        {label}
        <input
          type={field.type === "text" ? "text" : field.type}
          value={value}
          placeholder={field.placeholder}
          autoComplete={autoComplete(field)}
          onChange={(e) => set(field.key, e.target.value)}
        />
      </label>
    );
  }

  if (field.type === "yesno") {
    const selected = value;
    return (
      <fieldset className="public-fieldset intake-yesno">
        <legend>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        <div className="intake-yesno-row">
          {["Yes", "No"].map((opt) => (
            <label
              key={opt}
              className={`public-check${selected === opt ? " is-checked" : ""}`}
            >
              <input
                type="radio"
                name={field.key}
                checked={selected === opt}
                onChange={() => set(field.key, opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "scale") {
    const ticks = Array.from(
      { length: field.max - field.min + 1 },
      (_, i) => String(field.min + i),
    );
    return (
      <fieldset className="public-fieldset">
        <legend>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        <div className="intake-scale">
          {ticks.map((t) => (
            <label
              key={t}
              className={`intake-tick${value === t ? " is-checked" : ""}`}
            >
              <input
                type="radio"
                name={field.key}
                checked={value === t}
                onChange={() => set(field.key, t)}
              />
              <span>{t}</span>
            </label>
          ))}
        </div>
        <div className="intake-scale-anchors">
          <span>{field.lowLabel}</span>
          <span>{field.highLabel}</span>
        </div>
      </fieldset>
    );
  }

  // check (multi) and choice (single). The explicit guard is what narrows the
  // union for TypeScript — the text/textarea/date variants share one member,
  // so returning early on each of their `type` values isn't enough.
  if (field.type !== "check" && field.type !== "choice") return null;

  const selectedList = value.split(", ").filter(Boolean);
  return (
    <fieldset className="public-fieldset">
      <legend>
        {field.label}
        {field.required ? " *" : <em> (optional)</em>}
      </legend>
      <div className="public-checkgrid">
        {field.options.map((opt) => {
          const checked =
            field.type === "check" ? selectedList.includes(opt) : value === opt;
          return (
            <label
              key={opt}
              className={`public-check${checked ? " is-checked" : ""}`}
            >
              <input
                type={field.type === "check" ? "checkbox" : "radio"}
                name={field.key}
                checked={checked}
                onChange={() =>
                  field.type === "check"
                    ? toggleInList(field.key, opt)
                    : set(field.key, opt)
                }
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      {field.type === "check" && field.other && (
        <label className="public-field intake-other">
          <span>Other</span>
          <input
            type="text"
            value={answers[field.key + OTHER_SUFFIX] ?? ""}
            onChange={(e) => set(field.key + OTHER_SUFFIX, e.target.value)}
          />
        </label>
      )}
    </fieldset>
  );
}

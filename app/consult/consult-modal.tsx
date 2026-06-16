"use client";

import { useEffect, useRef, useState } from "react";
import { submitConsultationRequest } from "./actions";
import {
  OFFERING_KEYS, OFFERING_LABELS,
  EXPERIENCE_LEVELS, EXPERIENCE_LABELS,
  type OfferingKey, type ExperienceLevel,
} from "./offerings";

// CTA button → centered modal with the full consult intake form.
// Required: name + email. Everything else is optional so the form
// doesn't feel like a wall — visitors can submit fast and James can
// fill in the rest on the call.

export default function ConsultModal({
  triggerLabel,
  source,
}: {
  triggerLabel: string;
  source: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [offerings, setOfferings] = useState<OfferingKey[]>([]);
  const [goalsText, setGoalsText] = useState("");
  const [injuriesText, setInjuriesText] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | "">("");
  const [availabilityText, setAvailabilityText] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
  }

  function toggleOffering(key: OfferingKey) {
    setOfferings((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function resetFields() {
    setName(""); setEmail(""); setPhone("");
    setOfferings([]); setGoalsText(""); setInjuriesText("");
    setExperienceLevel(""); setAvailabilityText("");
    setMessage("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await submitConsultationRequest({
      name, email, phone, message, source,
      offerings_interest: offerings,
      goals_text: goalsText,
      injuries_text: injuriesText,
      experience_level: experienceLevel || undefined,
      availability_text: availabilityText,
    });
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    resetFields();
    setTimeout(() => { setDone(false); close(); }, 2200);
  }

  return (
    <>
      <button type="button" className="public-cta" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && (
        <div
          className="public-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="public-modal public-modal-wide">
            <button
              type="button"
              onClick={close}
              className="public-modal-close"
              aria-label="Close"
            >×</button>

            {done ? (
              <div className="public-modal-done">
                <span className="public-eyebrow">Sent</span>
                <h3 style={{ marginTop: "0.4rem", marginBottom: "0.4rem", fontSize: "1.4rem" }}>
                  Thanks — you&rsquo;ll hear from James shortly.
                </h3>
                <p className="public-p">Watch for a reply at the email you provided.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="public-modal-form">
                <span className="public-eyebrow">Free consultation</span>
                <h3 style={{ marginTop: "0.35rem", marginBottom: "0.7rem", fontSize: "1.5rem" }}>
                  Tell James a little about you.
                </h3>

                {/* Contact */}
                <div className="public-field-grid">
                  <label className="public-field">
                    <span>Name *</span>
                    <input
                      ref={firstFieldRef}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                  <label className="public-field">
                    <span>Email *</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </label>
                  <label className="public-field">
                    <span>Phone <em>(optional)</em></span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </label>
                  <label className="public-field">
                    <span>Best times to train <em>(optional)</em></span>
                    <input
                      type="text"
                      placeholder="e.g. weekday mornings, M/W/F evenings"
                      value={availabilityText}
                      onChange={(e) => setAvailabilityText(e.target.value)}
                    />
                  </label>
                </div>

                {/* Offerings of interest */}
                <fieldset className="public-fieldset">
                  <legend>What are you interested in? <em>(check any)</em></legend>
                  <div className="public-checkgrid">
                    {OFFERING_KEYS.map((k) => {
                      const checked = offerings.includes(k);
                      return (
                        <label key={k} className={`public-check${checked ? " is-checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOffering(k)}
                          />
                          <span>{OFFERING_LABELS[k]}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Experience */}
                <label className="public-field">
                  <span>Training experience <em>(optional)</em></span>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel | "")}
                  >
                    <option value="">— pick one —</option>
                    {EXPERIENCE_LEVELS.map((k) => (
                      <option key={k} value={k}>{EXPERIENCE_LABELS[k]}</option>
                    ))}
                  </select>
                </label>

                {/* Goals + injuries */}
                <label className="public-field">
                  <span>What are you hoping to accomplish? <em>(optional)</em></span>
                  <textarea
                    value={goalsText}
                    onChange={(e) => setGoalsText(e.target.value)}
                    rows={3}
                    placeholder="A goal, a timeline, a deadline, anything."
                  />
                </label>
                <label className="public-field">
                  <span>Any injuries or limitations? <em>(optional)</em></span>
                  <textarea
                    value={injuriesText}
                    onChange={(e) => setInjuriesText(e.target.value)}
                    rows={2}
                    placeholder="Past or current — knee, shoulder, back, surgery, pregnancy, etc."
                  />
                </label>

                {/* Free-form */}
                <label className="public-field">
                  <span>Anything else James should know? <em>(optional)</em></span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                  />
                </label>

                {error && <div className="public-modal-error">{error}</div>}

                <div className="public-modal-row">
                  <button
                    type="button"
                    className="public-cta public-cta-ghost"
                    onClick={close}
                    disabled={submitting}
                  >Cancel</button>
                  <button
                    type="submit"
                    className="public-cta"
                    disabled={submitting}
                  >{submitting ? "Sending…" : "Send request"}</button>
                </div>

                <p className="public-modal-note">
                  Your info goes straight to James — no spam, no email list.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

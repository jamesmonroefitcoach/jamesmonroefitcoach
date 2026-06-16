"use client";

import { useEffect, useRef, useState } from "react";
import { submitConsultationRequest } from "./actions";

// CTA button → centered modal with name/email/phone/message form.
// On success the modal flips to a thank-you state for 2 s, then closes.

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
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    // Focus the first field shortly after open so the focus ring is visible.
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    // Leave fields populated in case the user reopens; reset only after a
    // successful submission so the next visit is clean.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await submitConsultationRequest({ name, email, phone, message, source });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setName(""); setEmail(""); setPhone(""); setMessage("");
    setTimeout(() => { setDone(false); close(); }, 2000);
  }

  return (
    <>
      <button
        type="button"
        className="public-cta"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="public-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="public-modal">
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

                <label className="public-field">
                  <span>Name</span>
                  <input
                    ref={firstFieldRef}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </label>

                <label className="public-field">
                  <span>Email</span>
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
                  <span>What are you hoping to work on? <em>(optional)</em></span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
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

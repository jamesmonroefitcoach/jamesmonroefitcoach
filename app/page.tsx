import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import ConsultModal from "@/app/consult/consult-modal";
import BeforeAfterToggle from "@/app/consult/before-after-toggle";

// Public flyer / landing page for James Monroe Fit Coach.
//
// Signed-in users are still redirected to their role surface — the flyer is
// for prospective clients only. Placeholder content is marked PLACEHOLDER so
// Ryan can swap copy + photos when James sends them. The "Free consultation"
// CTA opens a modal that posts via submitConsultationRequest, landing in
// /coach/appointments under "Consultation requests".

const OFFERINGS = [
  {
    title: "1:1 In-Person Coaching",
    blurb: "Programming, hands-on cueing, and accountability inside the gym.",
  },
  {
    title: "Hybrid / At-Home Programming",
    blurb: "Custom weekly plan delivered through the app — train when life allows.",
  },
  {
    title: "Tactical Strength & Endurance",
    blurb: "Built for first responders, military, and athletes preparing for selection.",
  },
  {
    title: "Movement Restoration",
    blurb: "Rebuild from injury with progressive loading and joint-by-joint screening.",
  },
];

const TESTIMONIALS = [
  {
    quote: "James got me back to deadlifting heavy after two surgeries thought I'd never lift again.",
    name: "PLACEHOLDER — Client A",
    meta: "Down 28 lb · Deadlift 405 lb",
  },
  {
    quote: "He coaches the boring stuff that actually moves the needle.",
    name: "PLACEHOLDER — Client B",
    meta: "First sub-23 5K at 47",
  },
  {
    quote: "I haven't missed a Monday in 14 months. That alone changed my life.",
    name: "PLACEHOLDER — Client C",
    meta: "Body comp + bloodwork dialed",
  },
];

const BEFORE_AFTER = [
  {
    label: "PLACEHOLDER — 12-week fat loss",
    summary: "M / 38 — down 22 lb, added 2 reps to every working set.",
  },
  {
    label: "PLACEHOLDER — Postpartum return",
    summary: "F / 32 — rebuilt deadlift and pull-up over 16 weeks.",
  },
  {
    label: "PLACEHOLDER — Tactical prep",
    summary: "M / 26 — passed selection on first attempt after 6 months.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    if (user.is_admin || user.role === "admin") redirect("/admin");
    if (user.role === "coach") redirect("/coach");
    redirect("/client");
  }

  return (
    <main className="public-shell">
      <PublicHeader />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="public-hero">
        <div className="public-hero-inner">
          <span className="public-eyebrow">Monroe Fit Coach</span>
          <h1 className="public-headline">
            Train under a coach who actually shows up.
          </h1>
          <p className="public-sub">
            PLACEHOLDER — James Monroe builds programs around your life, your
            injuries, and your real schedule. No templates. No guessing. Just
            the next thing you need to do.
          </p>
          <div className="public-cta-row">
            <ConsultModal triggerLabel="Book a free consultation" source="hero" />
            <a href="#offerings" className="public-link-arrow">See offerings ↓</a>
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────── */}
      <section id="about" className="public-section">
        <div className="public-section-inner public-two-col">
          <div>
            <span className="public-eyebrow">About</span>
            <h2 className="public-h2">Coaching that travels with you.</h2>
            <p className="public-p">
              PLACEHOLDER — Bio paragraph. Background, certifications, what
              James cares about, who he works best with. (Swap when James sends
              copy.)
            </p>
            <p className="public-p">
              PLACEHOLDER — Second paragraph: philosophy, training style, what
              a first month looks like.
            </p>
          </div>
          <div className="public-card public-card-portrait">
            <div className="public-portrait-placeholder">
              <span>PLACEHOLDER — portrait</span>
            </div>
            <ul className="public-credit-list">
              <li>PLACEHOLDER — Certification 1</li>
              <li>PLACEHOLDER — Certification 2</li>
              <li>PLACEHOLDER — 10+ years coaching</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Offerings ────────────────────────────────────────── */}
      <section id="offerings" className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Offerings</span>
          <h2 className="public-h2">Pick the format that fits this season.</h2>
          <div className="public-offerings-grid">
            {OFFERINGS.map((o) => (
              <div key={o.title} className="public-offering">
                <h3 className="public-offering-title">{o.title}</h3>
                <p className="public-offering-blurb">{o.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Before / After ───────────────────────────────────── */}
      <section id="results" className="public-section">
        <div className="public-section-inner">
          <span className="public-eyebrow">Client results</span>
          <h2 className="public-h2">Real before &amp; afters.</h2>
          <p className="public-p public-p-meta">
            Click any case to open it. PLACEHOLDER — swap with real photos
            when James approves which to publish.
          </p>
          <div className="public-results-stack">
            {BEFORE_AFTER.map((b, i) => (
              <BeforeAfterToggle key={i} label={b.label} summary={b.summary} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Testimonials</span>
          <h2 className="public-h2">In their words.</h2>
          <div className="public-testimonial-grid">
            {TESTIMONIALS.map((t, i) => (
              <figure key={i} className="public-testimonial">
                <blockquote className="public-quote">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="public-quote-cite">
                  <strong>{t.name}</strong>
                  <span>{t.meta}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Rate / consult CTA ───────────────────────────────── */}
      <section id="rate" className="public-section">
        <div className="public-section-inner public-rate-block">
          <span className="public-eyebrow">Getting started</span>
          <h2 className="public-h2">First call is free.</h2>
          <p className="public-p">
            A 20-minute conversation to hear what you&rsquo;re after, what&rsquo;s
            in the way, and whether we&rsquo;re a fit. No pitch. Rate &amp; format
            confirmed after that call.
          </p>
          <div className="public-cta-row">
            <ConsultModal triggerLabel="Request your free consultation" source="rate" />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span>© {new Date().getFullYear()} Monroe Fit Coach.</span>
          <span className="public-footer-spacer">·</span>
          <span>PLACEHOLDER — city, contact email</span>
          <span className="public-footer-spacer">·</span>
          <Link href="/login" className="public-footer-signin">Coach &amp; client sign-in</Link>
        </div>
      </footer>
    </main>
  );
}

function PublicHeader() {
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Link href="/" className="public-brand">
          <span className="public-brand-mark">MFC</span>
          <span className="public-brand-text">Monroe Fit Coach</span>
        </Link>
        <nav className="public-nav">
          <a href="#about">About</a>
          <a href="#offerings">Offerings</a>
          <a href="#results">Results</a>
          <a href="#rate">Rate</a>
          <Link href="/login" className="public-nav-signin">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

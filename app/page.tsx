import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import ConsultModal from "@/app/consult/consult-modal";
import BeforeAfterToggle from "@/app/consult/before-after-toggle";
import Portrait from "@/app/consult/portrait";
import { listPublicTestimonials } from "@/app/testimonials/actions";

// Public flyer / landing page for James Monroe Fit Coach.
//
// Signed-in users are still redirected to their role surface — the flyer is
// for prospective clients only. Placeholder content is marked PLACEHOLDER so
// Ryan can swap copy + photos when James sends them. The "Free consultation"
// CTA opens a modal that posts via submitConsultationRequest, landing in
// /coach/appointments under "Consultation requests".

// James's six specialties. Each maps to a real coaching focus he takes
// clients in for — strength training is the core; boxing, body recomp,
// nutrition, recovery are the surrounding pillars; coaching-coaching is
// the meta offering for trainers wanting to sharpen their own craft.
const OFFERINGS = [
  {
    title: "Strength",
    blurb: "Progressive overload, real lifts, real loading. Built so you peak — and keep peaking.",
  },
  {
    title: "Boxing",
    blurb: "Footwork, hands, conditioning, sparring prep. Whether you compete or just want sharper movement.",
  },
  {
    title: "Body Recomposition",
    blurb: "Lose fat and add muscle at the same time — paced for the long haul, not crash dieting.",
  },
  {
    title: "Nutrition",
    blurb: "Practical fueling, recovery, and meal structure. No restrictive plan you can't keep up with.",
  },
  {
    title: "Recovery",
    blurb: "Mobility, sleep, stress, return-from-injury. The unsexy work that lets you train hard for years.",
  },
  {
    title: "Coaching Training",
    blurb: "For trainers and coaches: years of experience shared 1:1 to sharpen your skill, programming, and eye.",
  },
];

// What's actually included with every client — granular deliverables that
// run alongside whichever offering above they pick.
const SERVICES = [
  { title: "Custom weekly programming",  blurb: "Built around your gym, schedule, and goals — not pulled from a template." },
  { title: "Form review & cueing",       blurb: "Live in person, or video review for online clients." },
  { title: "Movement & mobility screen",  blurb: "Identify weak links before they become injuries." },
  { title: "Nutrition guidance",          blurb: "Practical fuel + recovery without a meal plan you'll hate." },
  { title: "Weekly check-ins",            blurb: "Body comp, energy, sleep, soreness — all tracked in the app." },
  { title: "Direct messaging access",     blurb: "Reach James between sessions when you need a quick answer." },
];

// What the first 90 days look like, set up as a small numbered timeline.
const TIMELINE = [
  {
    label: "Week 1",
    title: "Assessment & first programming block",
    blurb: "Movement screen, baseline lifts, history. Your first week of programming lands in the app the day we finish.",
  },
  {
    label: "Weeks 2-4",
    title: "Pattern + progression",
    blurb: "Dial in form on the big movements. Reps & loads progress on a real schedule. Weekly check-ins start.",
  },
  {
    label: "Weeks 5-8",
    title: "Build phase",
    blurb: "Strength, capacity, and body comp targets begin to compound. We adjust based on what's actually working for you.",
  },
  {
    label: "Weeks 9-12",
    title: "Performance & next chapter",
    blurb: "Test the lifts, reassess, set the next 90-day target. Most clients renew here — many stay for years.",
  },
];

// One-rate pricing, plus the free consult. Keep it simple — James can
// adjust packages on the consult call rather than try to encode every
// permutation on the flyer.
const PRICING = [
  {
    name: "Free consultation",
    price: "Free",
    cadence: "20 minutes",
    bullets: [
      "Hear your goals + history",
      "See if we're a fit",
      "No pitch, no pressure",
      "Book the first session if it clicks",
    ],
  },
  {
    name: "1:1 Session",
    price: "$100",
    cadence: "per hour",
    featured: true,
    bullets: [
      "Strength, boxing, recomp — pick the focus",
      "Programming built in",
      "In-person at Hyde Park Gym, Austin",
      "Packages available — ask on the consult",
    ],
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

const BEFORE_AFTER: { label: string; summary: string; beforeSrc?: string; afterSrc?: string }[] = [
  {
    label: "Body recomposition — Austin client",
    summary: "Strength + recomp focus. Same shirt, leaner build, less softness around the midsection.",
    beforeSrc: "/results/client-1-before.jpg",
    afterSrc: "/results/client-1-after.jpg",
  },
  {
    label: "Lean-out — Austin client",
    summary: "Strength + recomp. Visible torso definition, tighter waist after consistent training.",
    beforeSrc: "/results/client-2-before.jpg",
    afterSrc: "/results/client-2-after.jpg",
  },
  {
    label: "PLACEHOLDER — Third client story",
    summary: "Open slot — share another transformation here.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    if (user.is_admin || user.role === "admin") redirect("/admin");
    if (user.role === "coach") redirect("/coach");
    redirect("/client");
  }

  // Approved & published testimonials shown first; fall back to PLACEHOLDER
  // set when there are zero so a fresh deploy still looks complete.
  const approvedTestimonials = await listPublicTestimonials();
  const approvedBeforeAfters = approvedTestimonials.filter(
    (t) => t.before_image_url && t.after_image_url,
  );
  const renderedTestimonials = approvedTestimonials.length > 0
    ? approvedTestimonials.map((t) => ({
        quote: t.body,
        name: t.display_name || t.submitted_name,
        meta: t.meta_line ?? "",
      }))
    : TESTIMONIALS;
  const renderedBeforeAfters = approvedBeforeAfters.length > 0
    ? approvedBeforeAfters.map((t) => ({
        label: t.display_name || t.submitted_name,
        summary: t.meta_line ?? t.body.slice(0, 120),
        beforeSrc: t.before_image_url ?? undefined,
        afterSrc: t.after_image_url ?? undefined,
      }))
    : BEFORE_AFTER;

  return (
    <main className="public-shell">
      <PublicHeader />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="public-hero">
        <div className="public-hero-inner">
          <AvailabilityBadge />
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
            <h2 className="public-h2">To move is to live, and to live is to move.</h2>
            <p className="public-p">
              Born and raised in Portland, Oregon, James grew up playing
              sports from soccer to wrestling. He started weight training at
              twelve and later took up boxing, Muay Thai, and yoga. Over the
              years he&rsquo;s worked with clients from eight to eighty —
              physique competitors, recreational athletes, and people coming
              back from injury — helping them lose body fat, gain muscle,
              and lead more active lives.
            </p>
            <p className="public-p">
              He got into coaching because of family members and close
              friends who struggled to build healthy habits and lose weight.
              His sessions are concentrated, but also fun and enjoyable —
              your goal is his goal. Whether you want to compete, recover,
              or just feel like yourself again, the plan gets built around
              you.
            </p>
          </div>
          <div className="public-card public-card-portrait">
            {/* Drop the portrait file at public/james-portrait.jpg and
                the hatched placeholder is replaced automatically. */}
            <Portrait
              src="/james-portrait.jpg"
              alt="James Monroe"
              fallback="Drop public/james-portrait.jpg"
            />
            <ul className="public-credit-list">
              <li>Hyde Park Gym &mdash; Austin, TX</li>
              <li>Strength, boxing, Muay Thai, yoga background</li>
              <li>Ages 8 to 80 &mdash; recreational to competitive</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Specialties ─────────────────────────────────────── */}
      <section id="offerings" className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Specialties</span>
          <h2 className="public-h2">What James coaches.</h2>
          <p className="public-p public-p-meta">
            Six focus areas. Most clients overlap two or three — pick whichever pulls you in.
          </p>
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

      {/* ── Services (what's included) ───────────────────────── */}
      <section id="services" className="public-section">
        <div className="public-section-inner">
          <span className="public-eyebrow">What&rsquo;s included</span>
          <h2 className="public-h2">Every plan runs on the same foundation.</h2>
          <p className="public-p public-p-meta">
            Whatever format you pick, these are the things you get from day one.
          </p>
          <div className="public-services-grid">
            {SERVICES.map((s) => (
              <div key={s.title} className="public-service">
                <span className="public-service-dot" aria-hidden>✓</span>
                <div>
                  <strong className="public-service-title">{s.title}</strong>
                  <p className="public-service-blurb">{s.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Timeline ─────────────────────────────────────────── */}
      <section id="timeline" className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Timeline &amp; expectations</span>
          <h2 className="public-h2">What the first 90 days look like.</h2>
          <p className="public-p public-p-meta">
            Real progress is paced. Here&rsquo;s how the early arc tends to run.
          </p>
          <ol className="public-timeline">
            {TIMELINE.map((t, i) => (
              <li key={i} className="public-timeline-item">
                <span className="public-timeline-mark">{(i + 1).toString().padStart(2, "0")}</span>
                <div>
                  <span className="public-timeline-label">{t.label}</span>
                  <h3 className="public-timeline-title">{t.title}</h3>
                  <p className="public-timeline-blurb">{t.blurb}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="public-section">
        <div className="public-section-inner">
          <span className="public-eyebrow">Pricing</span>
          <h2 className="public-h2">One rate. No upsells.</h2>
          <p className="public-p public-p-meta">
            Start with the free 20-minute consult. If we click, sessions are
            a flat $100 per hour. Packages available — ask on the call.
          </p>
          <div className="public-pricing-grid">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={`public-price${p.featured ? " is-featured" : ""}`}
              >
                {p.featured && <span className="public-price-tag">Standard rate</span>}
                <h3 className="public-price-name">{p.name}</h3>
                <div className="public-price-row">
                  <span className="public-price-amount">{p.price}</span>
                  <span className="public-price-cadence">{p.cadence}</span>
                </div>
                <ul className="public-price-list">
                  {p.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Location ─────────────────────────────────────────── */}
      <section id="location" className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Where we train</span>
          <h2 className="public-h2">Hyde Park Gym &mdash; Austin, TX.</h2>
          <p className="public-p public-p-meta">
            Old-school iron house in central Austin. Free racks, real plates, the kind of room you can actually train in.
          </p>

          <div className="public-location-grid">
            <div className="public-location-meta">
              <div className="public-location-block">
                <span className="public-location-label">Address</span>
                <a
                  href="https://maps.google.com/?q=Hyde+Park+Gym+Austin+TX"
                  target="_blank"
                  rel="noopener"
                  className="public-location-link"
                >
                  4125 Guadalupe St<br />
                  Austin, TX 78751
                </a>
              </div>
              <div className="public-location-block">
                <span className="public-location-label">Gym website</span>
                <a
                  href="https://hydeparkgym.com"
                  target="_blank"
                  rel="noopener"
                  className="public-location-link"
                >
                  hydeparkgym.com ↗
                </a>
              </div>
              <p className="public-p" style={{ marginTop: "0.4rem", fontSize: "0.9rem" }}>
                Free parking on-site. Day-passes available if you want to try the room before signing up.
              </p>
            </div>

            <div className="public-location-map">
              <iframe
                title="Hyde Park Gym map"
                src="https://www.google.com/maps?q=Hyde+Park+Gym+Austin+TX&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
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
            {renderedBeforeAfters.map((b, i) => {
              const beforeSrc = (b as { beforeSrc?: string }).beforeSrc;
              const afterSrc = (b as { afterSrc?: string }).afterSrc;
              return (
                <BeforeAfterToggle
                  key={i}
                  label={b.label}
                  summary={b.summary}
                  index={i}
                  beforeSrc={beforeSrc}
                  afterSrc={afterSrc}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Testimonials</span>
          <h2 className="public-h2">In their words.</h2>
          <div className="public-testimonial-grid">
            {renderedTestimonials.map((t, i) => (
              <figure key={i} className="public-testimonial">
                <blockquote className="public-quote">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="public-quote-cite">
                  <strong>{t.name}</strong>
                  {t.meta && <span>{t.meta}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Consult CTA ──────────────────────────────────────── */}
      <section id="start" className="public-section public-section-tinted">
        <div className="public-section-inner public-rate-block">
          <span className="public-eyebrow">Getting started</span>
          <h2 className="public-h2">First call is free.</h2>
          <p className="public-p">
            A 20-minute conversation to hear what you&rsquo;re after, what&rsquo;s
            in the way, and whether we&rsquo;re a fit. No pitch. Rate &amp; format
            confirmed after that call.
          </p>
          <div className="public-cta-row">
            <ConsultModal triggerLabel="Request your free consultation" source="bottom" />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span>© {new Date().getFullYear()} Monroe Fit Coach.</span>
          <span className="public-footer-spacer">·</span>
          <span>Hyde Park Gym &mdash; 4125 Guadalupe St, Austin, TX</span>
          <span className="public-footer-spacer">·</span>
          <a href="tel:+15034846052" className="public-footer-signin" style={{ marginLeft: 0 }}>
            (503) 484-6052
          </a>
          <span className="public-footer-spacer">·</span>
          <a href="mailto:coachjamesmonroe@gmail.com" className="public-footer-signin" style={{ marginLeft: 0 }}>
            coachjamesmonroe@gmail.com
          </a>
          <span className="public-footer-spacer">·</span>
          <Link href="/login" className="public-footer-signin">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}

// "Accepting clients — N hrs/week available" pill anchored above the hero
// headline. Tweak HOURS_AVAILABLE in app/consult/availability.ts to keep
// the badge honest as James fills the schedule. The badge has two visual
// states: "open" (sage with a pulse dot) and "limited" / "full" (muted).
function AvailabilityBadge() {
  const HOURS_AVAILABLE = 30;          // PLACEHOLDER — adjust as James fills up
  const ACCEPTING = HOURS_AVAILABLE > 0;
  return (
    <div className="public-availability" data-state={ACCEPTING ? "open" : "closed"}>
      <span className="public-availability-dot" aria-hidden />
      {ACCEPTING
        ? <>Accepting new clients &mdash; <strong>~{HOURS_AVAILABLE} hrs/week</strong> open this season</>
        : <>Currently full &mdash; waitlist open</>}
    </div>
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
          <a href="#offerings">Specialties</a>
          <a href="#timeline">Timeline</a>
          <a href="#pricing">Pricing</a>
          <a href="#location">Location</a>
          <a href="#results">Results</a>
          <Link href="/login" className="public-nav-signin">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

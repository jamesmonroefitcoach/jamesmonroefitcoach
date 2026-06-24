import Link from "next/link";
import ConsultModal from "@/app/consult/consult-modal";
import BeforeAfterToggle from "@/app/consult/before-after-toggle";
import Portrait from "@/app/consult/portrait";
import { listPublicTestimonials } from "@/app/testimonials/actions";
import { allBeforeUrls, allAfterUrls } from "@/app/testimonials/types";

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
    blurb: "Progressive overload built to your goal, whether that's a bigger lift, athletic power, or just getting genuinely strong. Real lifts, loaded on a real schedule.",
  },
  {
    title: "Boxing",
    blurb: "Beginner boxing, footwork, conditioning, mitt-work drills, and explosive movement.",
  },
  {
    title: "Body Recomposition",
    blurb: "Lose fat and add muscle at the same time, paced for the long haul, not crash dieting.",
  },
  {
    title: "Nutrition",
    blurb: "Welcome back to Biology 101. Learn the ins and outs of metabolism, how and why we gain weight, how to push through plateaus, and how to eat well around your real lifestyle.",
  },
  {
    title: "Recovery",
    blurb: "Mobility, sleep, stress, return-from-injury. The necessary, often overlooked work that lets you train hard for years.",
  },
  {
    title: "Coaching Training",
    blurb: "For trainers and coaches: years of experience shared 1:1 to sharpen your skill, programming, and eye, including how to build and keep a clientele roster.",
  },
];

// What's actually included with every client — granular deliverables that
// run alongside whichever offering above they pick.
const SERVICES = [
  { title: "Custom weekly programming",  blurb: "Built around your gym, schedule, and goals. Never pulled from a template." },
  { title: "Form review & cueing",       blurb: "Constant monitoring and feedback on your form, in and outside of sessions." },
  { title: "Movement & range-of-motion development", blurb: "Identify and strengthen weak links before they become injuries." },
  { title: "Nutrition education",         blurb: "Prescribed, not suggested. The why behind how you eat, structured to your lifestyle and dialed in to push through plateaus." },
  { title: "Progress tracking",           blurb: "Body comp, energy, sleep, soreness, and weight, all reviewed regularly with James and trackable in your account." },
  { title: "Direct messaging access",     blurb: "Reach James between sessions when you need a quick answer." },
  { title: "Optional coaching app",       blurb: "Schedule, reschedule, log your sets, see programs, track payments, and view progress in one place. Use it as much or as little as you like." },
];

// How the early work unfolds, set up as a small numbered set of phases.
const TIMELINE = [
  {
    label: "Phase 1",
    title: "Assess & build the foundation",
    blurb: "Education on how your body actually works. An LPHC (lumbo-pelvic-hip complex) routine maps your range of motion: what moves where, where it's tight, where pain shows up. Deep core and lower-back work start right away, the weak links James goes after first. You learn the six basic movements, then we layer in accessories. On nutrition, we lock in one or two habits.",
  },
  {
    label: "Phase 2",
    title: "Strength & load",
    blurb: "Fewer reps, heavier weight. The basics progress on a real schedule while we habit-stack the nutrition wins from Phase 1.",
  },
  {
    label: "Phase 3",
    title: "Explosive & repeat",
    blurb: "We reassess and run it back, then layer explosive, powerful movement on top of the strength base. Every cycle compounds on the last.",
  },
];

// One-rate pricing, plus the free consult. Keep it simple — James can
// adjust packages on the consult call rather than try to encode every
// permutation on the flyer.
const PRICING = [
  {
    name: "Free consultation",
    price: "Free",
    cadence: "60 minutes",
    bullets: [
      "A full hour, no rush. We talk through what you're after and what's in the way, then run the LPHC routine so you get a real taste of training and cueing, and see where your body needs work head to toe.",
    ],
  },
  {
    name: "1:1 Session",
    price: "$100",
    cadence: "per hour",
    featured: true,
    bullets: [
      "Strength, boxing, recomp. Pick the focus.",
      "Weekly programming available",
      "In-person at Hyde Park Gym, Austin",
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: "James got me back to deadlifting heavy after two surgeries thought I'd never lift again.",
    name: "PLACEHOLDER · Client A",
    meta: "Down 28 lb · Deadlift 405 lb",
  },
  {
    quote: "He coaches the boring stuff that actually moves the needle.",
    name: "PLACEHOLDER · Client B",
    meta: "First sub-23 5K at 47",
  },
  {
    quote: "I haven't missed a Monday in 14 months. That alone changed my life.",
    name: "PLACEHOLDER · Client C",
    meta: "Body comp + bloodwork dialed",
  },
];

const BEFORE_AFTER: { label: string; summary: string; weights?: string; beforeSrc?: string; afterSrc?: string; fit?: "cover" | "contain"; beforeFit?: "cover" | "contain"; afterFit?: "cover" | "contain" }[] = [
  {
    label: "Body recomposition · Austin client",
    summary: "Strength + recomp focus. Leaner build, less softness, more confidence. Same person, different season.",
    weights: "Lifts placeholder, James to add (e.g. Squat 135 → 225 lb · Deadlift 185 → 315 lb)",
    beforeSrc: "/results/client-1-before.jpg",
    afterSrc: "/results/client-1-after.jpg",
    // BEFORE crops like every other entry; AFTER letterboxes so the
    // full body shows (feet/legs would otherwise clip).
    afterFit: "contain",
  },
  {
    label: "Lean-out · Austin client",
    summary: "Strength + recomp. Visible torso definition and tighter waist after consistent programming.",
    weights: "Lifts placeholder, James to add (e.g. Bench 95 → 155 lb · Squat 135 → 225 lb)",
    beforeSrc: "/results/client-2-before.jpg",
    afterSrc: "/results/client-2-after.jpg",
  },
  {
    label: "Strength + lean-out · Austin client",
    summary: "Dropped body fat while keeping muscle mass. Clear waist taper and visible abs.",
    weights: "Lifts placeholder, James to add (e.g. Deadlift 185 → 315 lb · Bench 135 → 205 lb)",
    beforeSrc: "/results/client-3-before.jpg",
    afterSrc: "/results/client-3-after.jpg",
  },
];

export default async function MarketingPage({
  hideHeader = false,
}: {
  // /preview passes hideHeader=true so the prospect-facing sticky nav
  // doesn't show when James opens the public site from inside the app.
  hideHeader?: boolean;
} = {}) {
  // Approved & published testimonials shown first; fall back to PLACEHOLDER
  // set when there are zero so a fresh deploy still looks complete.
  const approvedTestimonials = await listPublicTestimonials();
  // Pull the first before / after URL out of each row's combined set
  // (legacy single-URL + new array column). A row qualifies for the
  // results grid only if it has at least one of each.
  const approvedBeforeAfters = approvedTestimonials
    .map((t) => ({
      t,
      before: allBeforeUrls(t)[0],
      after:  allAfterUrls(t)[0],
    }))
    .filter((r) => r.before && r.after);
  const renderedTestimonials = approvedTestimonials.length > 0
    ? approvedTestimonials.map((t) => ({
        quote: t.body,
        name: t.display_name || t.submitted_name,
        meta: t.meta_line ?? "",
      }))
    : TESTIMONIALS;
  const renderedBeforeAfters = approvedBeforeAfters.length > 0
    ? approvedBeforeAfters.map(({ t, before, after }) => ({
        label: t.display_name || t.submitted_name,
        summary: t.meta_line ?? t.body.slice(0, 120),
        beforeSrc: before,
        afterSrc:  after,
      }))
    : BEFORE_AFTER;

  return (
    <main className="public-shell">
      {!hideHeader && <PublicHeader />}

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="public-hero">
        <div className="public-hero-inner">
          <AvailabilityBadge />
          <span className="public-eyebrow">Monroe Fit Coach</span>
          <h1 className="public-headline">
            Set a goal. Set a pace. Follow through.
          </h1>
          <p className="public-sub">
            James Monroe takes a comprehensive approach to fitness, with
            experience stemming from over five years of helping people lose
            body fat, build muscle, and become more athletic overall. Whether
            it&rsquo;s becoming wedding-ready or rehabbing an injury, James will
            find a path to your goals.
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
              years he&rsquo;s worked with clients from eight to eighty,
              including physique competitors, recreational athletes, and
              people coming back from injury, helping them lose body fat,
              gain muscle, and lead more active lives.
            </p>
            <p className="public-p">
              He got into coaching because of family members and close
              friends who struggled to build healthy habits and lose weight.
              His sessions are concentrated, but also fun and enjoyable.
              Your goal is his goal. Whether you want to compete, recover,
              or just feel like yourself again, the plan gets built around
              you.
            </p>
            <p className="public-p">
              The current roster runs the full range: men, women, kids,
              families, couples, and groups training together. Ages eight to
              eighty, beginners through competitive athletes. James works with
              LGBTQIA+ clients and has experience supporting transitioning men
              and women through training that meets them where they are.
              Goals run just as wide: first pull-up, getting back to lifting
              after surgery, a stage-ready physique, a tactical selection,
              menopause-stage strength, a 5K under 23 minutes, or simply
              moving without pain again.
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
              <li>NASM Certified Personal Trainer</li>
              <li>Hyde Park Gym, Austin TX</li>
              <li>Strength, boxing, Muay Thai, skateboarding, yoga background</li>
              <li>Ages 8 to 80, recreational to competitive</li>
              <li>Off the clock: piano, guitar, running, reading</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Coaching band ────────────────────────────────────── */}
      {/* Photo lives on the left as a real <img> so it renders in its
          natural aspect — no crop, no upscale. Text sits next to it
          on the right. */}
      <section className="public-band">
        <div className="public-band-inner">
          <div className="public-band-photo">
            <img
              src="/coaching-action.jpg"
              alt="James coaching a client through a plank holding boxing gloves"
            />
          </div>
          <div className="public-band-text">
            <span className="public-eyebrow">In the gym</span>
            <h2 className="public-band-quote">
              Training with the full picture in mind.
            </h2>
          </div>
        </div>
      </section>

      {/* ── Specialties ─────────────────────────────────────── */}
      <section id="offerings" className="public-section public-section-tinted">
        <div className="public-section-inner">
          <span className="public-eyebrow">Specialties</span>
          <h2 className="public-h2">What James coaches.</h2>
          <p className="public-p public-p-meta">
            Six focus areas. Most clients overlap two or three. Pick whichever pulls you in.
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
          <h2 className="public-h2">It all comes standard.</h2>
          <p className="public-p public-p-meta">
            Every client gets the whole foundation. On the consult we figure
            out where you actually need the focus.
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
          <h2 className="public-h2">How the work unfolds.</h2>
          <p className="public-p public-p-meta">
            Every client is unique. The plan gets tailored to your body,
            history, and schedule. This is how the early arc typically runs.
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
          <p className="public-p public-p-meta" style={{ marginTop: "1.25rem" }}>
            From here the work is continuous: reassess, rebuild, repeat. Every
            body is different, so the pace shifts from person to person. This is
            the typical arc, not a fixed calendar.
          </p>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="public-section">
        <div className="public-section-inner">
          <span className="public-eyebrow">Pricing</span>
          <h2 className="public-h2">Transparency. Always.</h2>
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
          <h2 className="public-h2">Hyde Park Gym, Austin TX.</h2>
          <p className="public-p public-p-meta">
            Old-school iron house in central Austin.
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
                Free parking on-site. <strong>Free 7-day trial</strong> available so you can try the room before
                signing up. Gym membership is <strong>$79/month</strong> (no commitment, no initiation fee),
                <strong> $15</strong> for a single-visit day pass, or <strong>$90</strong> for a
                10-visit punch card good for 6 months.
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
            Real clients, real arcs. Published with permission.
          </p>
          <div className="public-results-stack">
            {renderedBeforeAfters.map((b, i) => {
              const beforeSrc = (b as { beforeSrc?: string }).beforeSrc;
              const afterSrc = (b as { afterSrc?: string }).afterSrc;
              const fit = (b as { fit?: "cover" | "contain" }).fit;
              const beforeFit = (b as { beforeFit?: "cover" | "contain" }).beforeFit;
              const afterFit = (b as { afterFit?: "cover" | "contain" }).afterFit;
              const weights = (b as { weights?: string }).weights;
              return (
                <BeforeAfterToggle
                  key={i}
                  label={b.label}
                  summary={b.summary}
                  weights={weights}
                  index={i}
                  beforeSrc={beforeSrc}
                  afterSrc={afterSrc}
                  fit={fit}
                  beforeFit={beforeFit}
                  afterFit={afterFit}
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
          <h2 className="public-h2">You don&rsquo;t start until you start.</h2>
          <p className="public-p">
            Let&rsquo;s find the path to your goals together. Book the call, a
            full hour with no pressure. I want to help you get there.
          </p>
          <p className="public-p public-compassion-line">
            Every plan is driven by compassion, led by science.
          </p>
          <div className="public-cta-row">
            <ConsultModal triggerLabel="Book your free consultation" source="bottom" />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span>© {new Date().getFullYear()} Monroe Fit Coach.</span>
          <span className="public-footer-spacer">·</span>
          <span>Hyde Park Gym · 4125 Guadalupe St, Austin TX</span>
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
        <div className="public-footer-credit">
          Website &amp; app built by Ryan Mecca. See{" "}
          <a href="https://ryanmecca.com" target="_blank" rel="noopener">
            ryanmecca.com
          </a>{" "}
          for consulting services.
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
  const HOURS_AVAILABLE = 6;           // Adjust as James fills up
  const ACCEPTING = HOURS_AVAILABLE > 0;
  return (
    <div className="public-availability" data-state={ACCEPTING ? "open" : "closed"}>
      <span className="public-availability-dot" aria-hidden />
      {ACCEPTING
        ? <>Accepting new clients · <strong>{HOURS_AVAILABLE} hours per week</strong> open currently</>
        : <>Currently full · waitlist open</>}
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

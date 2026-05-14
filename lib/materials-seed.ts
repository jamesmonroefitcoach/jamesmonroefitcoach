// Shared seed for the Materials sub-tab. Coach side (with editing) and
// client side (read-only) both read from this list. Until edits move to
// Supabase, James's edits remain coach-local in localStorage and clients
// see these defaults.

export type MaterialCategory =
  | "Fundamentals"
  | "Body Mechanics"
  | "Training Concepts"
  | "Injury Prevention"
  | "Balance Training"
  | "Suggested Additions"
  | "Sources";

export type Material = {
  id: string;
  category: MaterialCategory;
  title: string;
  body: string;
};

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "Fundamentals",
  "Body Mechanics",
  "Training Concepts",
  "Injury Prevention",
  "Balance Training",
  "Suggested Additions",
  "Sources",
];

export const DEFAULT_MATERIALS: Material[] = [
  // ─── Fundamentals (the "Demystifying Exercises and Nutrition" 10-pager) ───
  { id: "metabolism",            category: "Fundamentals",    title: "Metabolism, Weight, Calories & Energy", body: "How the body turns food into usable energy, why bodyweight is a lagging indicator, and where calories actually come from / go to." },
  { id: "macros",                category: "Fundamentals",    title: "Macronutrients (Carbs, Protein, Fat)",  body: "What each macro does, examples of each, and how to think about ratios without obsessing over them." },
  { id: "balanced-eating",       category: "Fundamentals",    title: "Balanced Eating",                       body: "What 'balanced' actually looks like on a plate — and why it changes by training day vs rest day." },
  { id: "muscle-built",          category: "Fundamentals",    title: "Why & How Muscle Gets Built",           body: "Stimulus → recovery → adaptation. Protein synthesis basics. Why training without eating doesn't work." },
  { id: "progressive-overload",  category: "Fundamentals",    title: "Progressive Overload",                  body: "Adding load, reps, or quality over time. The single most important training principle." },
  { id: "muscle-benefits",       category: "Fundamentals",    title: "Benefits of Building Muscle",           body: "Metabolic, postural, joint-protective, and longevity benefits — beyond the visible." },
  // ─── Body Mechanics & Anatomy ────────────────────────────────────────────
  { id: "push-vs-pull",          category: "Body Mechanics",  title: "Push vs Pull (Movement Patterns)",      body: "The six core patterns — push, pull, hinge, squat, carry, rotate — and how to balance them across a week." },
  { id: "muscle-exercise-map",   category: "Body Mechanics",  title: "Muscle Group → Exercise Reference",     body: "Which exercises hit which muscle groups. Use for filling coverage gaps in a program." },
  { id: "body-map",              category: "Body Mechanics",  title: "Body Map Reference",                    body: "Annotated diagram — major muscles front and back. Use as a visual aid for clients." },
  // ─── Training Concepts ───────────────────────────────────────────────────
  { id: "hypertrophy-vs-strength", category: "Training Concepts", title: "Hypertrophy vs Strength",           body: "Different rep ranges, different rest, different goals. When to pick which — and how to combine them." },
  { id: "periodization",         category: "Training Concepts", title: "Periodization Basics",                body: "Linear, undulating, and block periodization explained. How to plan blocks across months." },
  { id: "sdt",                   category: "Training Concepts", title: "Self-Determination Theory (SDT)",     body: "Autonomy + competence + relatedness — the three needs that drive durable behavior change. How to coach with them in mind." },
  // ─── Injury Prevention & Recovery ────────────────────────────────────────
  { id: "postural-imbalances",   category: "Injury Prevention", title: "Postural Imbalances",                 body: "Hiked hip and hiked shoulder — how to spot them, what causes them, and the corrective drills that fix them." },
  { id: "joint-injuries",        category: "Injury Prevention", title: "Common Joint Injuries",               body: "Runner's knee, tennis elbow, golfer's elbow, shoulder impingement. Mechanism, screen, modifications, and when to refer out." },
  { id: "soft-tissue",           category: "Injury Prevention", title: "Soft-Tissue Issues",                  body: "Piriformis, quadratus lumborum, bicep tendonitis. Common triggers and decompression / loading strategies." },
  { id: "repetitive-motion",     category: "Injury Prevention", title: "Repetitive Motion Injuries",          body: "What overuse looks like, why deload weeks matter, and how to spot a brewing problem before it sidelines a client." },
  { id: "injury-protocol",       category: "Injury Prevention", title: "Injury Recovery Protocol",            body: "Breaking the half-healed / reinjury pendulum. Phased return-to-load and the markers for moving forward." },
  // ─── Balance Training ────────────────────────────────────────────────────
  { id: "tandem-stances",        category: "Balance Training", title: "Tandem Stances",                       body: "Heel-to-toe progression. Static hold, then add perturbation (head turn, eyes closed, arm reach)." },
  { id: "one-legged",            category: "Balance Training", title: "One-Legged Balance",                   body: "Standing single-leg progression. From bare static to dynamic reach to weighted." },
  { id: "walking-tandem",        category: "Balance Training", title: "Walking Tandem (Forward / Backward)",  body: "Heel-to-toe walking, both directions. Builds proprioception and gait stability." },
  { id: "eyes-closed",           category: "Balance Training", title: "Eyes-Closed Variants",                 body: "Removing visual input forces the vestibular and proprioceptive systems to take over. Add to any stable balance drill." },
  { id: "catch-tandem",          category: "Balance Training", title: "Catch-a-Ball Tandem",                  body: "Reactive balance — coach tosses, client catches while holding tandem stance. Cognitive + motor load." },
  // ─── Suggested additions ────────────────────────────────────────────────
  { id: "sleep-recovery",        category: "Suggested Additions", title: "Sleep & Recovery",                  body: "Why sleep is the biggest under-coached lever for performance and fat loss. Targets and bedtime habits." },
  { id: "hydration",             category: "Suggested Additions", title: "Hydration",                         body: "How much, when, and the signs you're under-hydrated for training." },
  { id: "mobility-flexibility",  category: "Suggested Additions", title: "Mobility vs Flexibility vs Stretching", body: "Three things that get conflated — what each actually means and when each matters." },
  { id: "rpe-card",              category: "Suggested Additions", title: "RPE Reference Card",                body: "1–10 scale of effort with anchor descriptions. Used throughout the program builder's exertion field." },
  { id: "warmup",                category: "Suggested Additions", title: "Warm-up Protocols",                 body: "General warm-up + movement-specific prep. What to do before lifting, before cardio, before mixed." },
  { id: "doms",                  category: "Suggested Additions", title: "DOMS Explained",                    body: "Delayed-onset muscle soreness — what soreness means, what it doesn't mean, and when it's a problem." },
  { id: "heart-rate",            category: "Suggested Additions", title: "Heart Rate Zones / Energy Systems", body: "Zones 1–5, the three energy systems (ATP-PC, glycolytic, oxidative), and which to target for which goal." },
  { id: "plateau",               category: "Suggested Additions", title: "Plateau Strategies",                body: "What to change first when progress stalls — volume, intensity, variation, or recovery." },
  { id: "special-pops",          category: "Suggested Additions", title: "Special Populations",               body: "Pregnancy / postpartum, seniors, youth athletes — when standard programming needs to bend." },
  { id: "glossary",              category: "Suggested Additions", title: "Glossary",                          body: "1RM, AMRAP, EMOM, RIR, tempo notation, drop set, superset. Quick-lookup for anyone new to the lingo." },
  // ─── Sources ────────────────────────────────────────────────────────────
  { id: "src-nsca",      category: "Sources", title: "NSCA",                            body: "National Strength and Conditioning Association. Peer-reviewed practitioner standard. https://www.nsca.com" },
  { id: "src-acsm",      category: "Sources", title: "ACSM",                            body: "American College of Sports Medicine. Clinical guidelines for exercise and health. https://www.acsm.org" },
  { id: "src-sbs",       category: "Sources", title: "Stronger By Science",             body: "Greg Nuckols — readable research summaries for lifters and coaches. https://www.strongerbyscience.com" },
  { id: "src-examine",   category: "Sources", title: "Examine.com",                     body: "Independent, evidence-graded nutrition + supplement database. https://examine.com" },
  { id: "src-pubmed",    category: "Sources", title: "PubMed / NIH",                    body: "Primary research literature. Slow but authoritative. https://pubmed.ncbi.nlm.nih.gov" },
  { id: "src-rp",        category: "Sources", title: "Renaissance Periodization",       body: "Mike Israetel et al — hypertrophy science applied. https://renaissanceperiodization.com" },
  { id: "src-pn",        category: "Sources", title: "Precision Nutrition",             body: "Coach-facing nutrition reference and certification body. https://www.precisionnutrition.com" },
  { id: "src-nasm",      category: "Sources", title: "NASM",                            body: "National Academy of Sports Medicine — corrective exercise specialist materials. https://www.nasm.org" },
  { id: "src-fms",       category: "Sources", title: "Functional Movement Systems (FMS)", body: "Movement screen + corrective exercise framework. https://www.functionalmovement.com" },
];

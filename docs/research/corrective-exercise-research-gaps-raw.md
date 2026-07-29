# Corrective exercise gap research — RAW, unsynthesized

Source: deep-research workflow run `wf_1ec5c064-8df` (task `wug1obqk0`),
2026-07-28. This was a follow-up pass targeting exactly the gaps flagged in
[`corrective-exercise-research.md`](corrective-exercise-research.md):
rotator cuff/shoulder, tennis/golfer's elbow, hip tightness/anterior pelvic
tilt, ankle dorsiflexion, neck pain beyond posture, and refer-out red flags.

**This run did not finish.** The verification pass hit the session's usage
limit (reset 2am America/Chicago) partway through — 40 of 104 planned
subagent calls completed, then 64 failed on "You've hit your session limit."
The final synthesis step never ran. **Do not treat anything below as
adversarially verified** the way the first pass's findings were (that one
got a clean 3-0-vote treatment). What's here is closer to "leads worth
re-verifying" than "confirmed findings" — re-run the verify + synthesis
steps once the limit resets before using any of this in client-facing copy.

## Confirmed (did get a real 3-0 or 2-0 vote before the limit hit)

Only 4 claims made it through verification — all about the same rotator
cuff source:

- The 2024 JOSPT systematic review (Lafrance et al., *J Orthop Sports Phys
  Ther* 54(8):499-512, PMID 38848304) on exercise therapy for rotator
  cuff-related shoulder pain (RCRSP) organized by the FITT principle is a
  real, current source.
- **Motor control exercise reduces disability more than nonspecific
  exercise** in RCRSP: moderate-certainty evidence, short term (SMD -0.29,
  95% CI -0.51 to -0.07, 7 RCTs, n=323) and medium term (SMD -0.33, 95% CI
  -0.57 to -0.09, 5 RCTs, n=286).
- It did **not** significantly reduce short-term **pain** vs. nonspecific
  exercise (SMD -0.19, 95% CI -0.41 to 0.03) — the benefit is on
  disability, not pain.
- **Dosing evidence is thin**: no included trials compared frequency or
  duration parameters; eccentric/scapula-focused program evidence is
  low-to-very-low certainty; can't attribute the benefit to motor control
  specifically vs. general program quality (progression, individualization).
  Source: https://www.jospt.org/doi/10.2519/jospt.2024.12453

## Unverified — infrastructure failure (21 claims), re-verify before use

Grouped by topic. Each has a source; none were judged false, they just
never got a valid vote.

**Rotator cuff dosing detail** (companion scoping review,
jospt.org/doi/10.2519/jospt.2024.12452): FITT characteristics extracted
from 46 programs / 22 RCTs; dosing ranged 2-7 sessions/week, 1-3 sets of
4-30 reps, 4-16 week durations across all program types; authors concluded
no single evidence-backed dosing prescription exists — apply cautiously.

**Rotator cuff outcomes** (PMC12011739): specific exercise gave modest
pain/function improvement (pain SMD -0.31, Constant-Murley SMD 0.59, DASH
SMD -0.60); scapular stabilization + mobilization helped pain/function over
2 months, eccentric helped function but not short-term pain, proprioceptive
training showed no benefit; specific exercise wasn't significantly better
than general exercise/conventional PT overall — supports a "graded exercise
of several forms helps, individualize" client message rather than one
protocol.

**Tennis elbow (lateral epicondylalgia)** — eccentric loading:
pubmed.ncbi.nlm.nih.gov/20579907 (n=21 RCT): eccentric wrist-extensor
loading with a rubber bar added to standard PT beat standard PT alone on
every outcome (DASH 76% vs 13% improvement p=.01; pain VAS 81% vs 22%
p=.002; tenderness 71% vs 5% p=.003; extension strength 79% vs 15% p=.011).
Mixed-contraction (isometric + eccentric-concentric) also outperformed
isotonic-only loading at follow-up per PMC7406028, which also found
isometric was NOT superior to isotonic across 10 tendinopathy RCTs
(patellar, rotator cuff, lateral elbow, Achilles, gluteal) — so don't
privilege isometrics by default. An 8-week unsupervised isometric program
beat wait-and-see on PRTEE disability, but evidence was judged insufficient
for a firm conclusion. Subgrouping matters: Coombes et al.
(jospt.org/doi/pdfplus/10.2519/jospt.2015.5841) argue against one uniform
protocol and flag neck pain, tendon tears, and central sensitization as
prognostic factors worth screening for.

**Golfer's elbow (medial epicondylalgia)** — pubmed.ncbi.nlm.nih.gov/24944855
(n=20): eccentric wrist-flexor loading with a FlexBar added to standard PT,
**dosed 3×15 reps twice daily** (concentric flexion with the uninvolved arm
to twist the bar, eccentric release with the involved arm), over ~6 weeks /
~12 PT visits. DASH improved from ~34.7 to ~7.9 (p<.001).

**Hip tightness / anterior pelvic tilt** — the most consequential lead:
a 2020 systematic review (eor.bioscientifica.com/.../2058-5241.5.190017)
found the evidence that non-surgical treatment reduces excessive anterior
pelvic tilt is **"very low" certainty overall — no evidence of effect**.
Only 4 studies existed total (2 RCTs n=72, 2 non-RCTs n=23); the one
exercise-program RCT (8 weeks, 5×/week abdominal strengthening + hip/lumbar
stretching) produced a non-significant 0.5° change (8.7°→8.2°, p=.17). The
same review found **no causal link between APT and pain** — a 600-person
study found no APT/low-back-pain association. A separate source
(PMC11150224) found stretching, acute or chronic, does not significantly
improve spinal/lumbopelvic posture. **If this holds up under
re-verification, it's a real finding worth leading with**: it would mean
the app's existing "Postural Imbalances" framing (hiked hip/shoulder
correctives) and any APT-focused corrective content should be presented
much more conservatively than typical fitness-industry content — the
evidence doesn't support the premise that correcting APT reduces pain.

**Not yet reached / no claims extracted despite sources found:** ankle
dorsiflexion mobility (no confirmed or unverified claims — the angle didn't
surface usable content before the limit hit) and neck pain beyond posture
(same — though see sources below). Refer-out red-flag criteria were also
not reached as synthesized claims.

## Sources found but not yet turned into claims — worth fetching first on retry

- Ankle dorsiflexion / weight-bearing lunge test:
  researchgate.net/publication/272524534 (reliability/MDC of the WB lunge
  test — a coach-usable ankle mobility screen)
- Neck pain CPG: orthopt.org's 2017 revision of the APTA neck pain CPG
  (PDF), plus jospt.org/doi/10.2519/jospt.2020.9971 and
  jospt.org/doi/10.2519/jospt.2025.13182
- Neck pain exercise evidence: Cochrane review
  cochranelibrary.com/cdsr/doi/10.1002/14651858.CD004250.pub5 (and its
  plain-language cochrane.org/evidence/CD004250 summary), PMC5814665
- Scope-of-practice framing: blog.nasm.org/personal-trainer-role-circle-of-care

## What to do with this on the next pass

1. Re-run verification (and synthesis) on the 21 unverified claims above —
   most look strong (specific numbers, named RCTs, PMC/JOSPT sources) and
   likely just need a clean run once the session limit resets.
2. Run a fresh angle specifically on ankle dorsiflexion and neck pain
   exercise evidence — this pass found sources but never extracted/verified
   claims from them.
3. Run a fresh angle specifically on refer-out red flags per condition —
   never reached.
4. The APT "no evidence of effect" finding is the one item here worth
   flagging to Ryan/James even before full re-verification, since it
   contradicts a framing already live in the app's Materials tab
   ("Postural Imbalances" — hiked hip/shoulder correctives). Don't publish
   anything asserting APT correction reduces pain until this is confirmed.

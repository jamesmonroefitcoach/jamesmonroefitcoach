# Corrective exercise deep research (raw findings)

Source: `deep-research` workflow run `wf_c78433d4-bda` (task `w1w7yo2y7`), 2026-07-27.
104 subagent calls, 22 sources fetched, 102 claims extracted, 25 adversarially
verified (3-vote). This is the **raw verified output** — not yet turned into
client-facing copy. See `docs/HANDOFF.md` for what to do with it.

## Question researched

Evidence-based corrective exercise procedures for the most common injuries and
body issues seen in general-population personal training clients, covering:
low back pain, shoulder impingement/rotator cuff, patellofemoral knee pain,
hip tightness/anterior pelvic tilt, ankle mobility, neck/upper-cross syndrome,
tennis/golfer's elbow, plantar fasciitis. For each: assessment cues, exercise
progressions with sets/reps/frequency, contraindications + refer-out
criteria, and reputable sources (NASM-CES, ACSM, peer-reviewed literature).

## Summary

Evidence-based corrective exercise material for a general-population personal
training practice rests on two complementary layers: NASM's
assessment-and-correction framework (Overhead Squat Assessment plus the
four-phase Inhibit-Lengthen-Activate-Integrate continuum) for coach-administered
screening and programming, and condition-specific clinical practice guidelines
(JOSPT/APTA CPGs, ACSM/Exercise is Medicine) for what actually works per
condition. The strongest verified protocols are: combined hip- and
knee-targeted exercise for patellofemoral pain (Grade A, with an explicit "do
not use" list covering braces, dry needling, ultrasound and similar passive
modalities); plantar fascia-specific and calf stretching for plantar
fasciitis (Grade A, 10-30s holds, 4 days to 8 weeks); the Alfredson eccentric
heel-drop protocol for Achilles tendinopathy (2x(3x15) daily, both knee
positions, 12 weeks, with durable 5-year VISA-A improvement); stay-active /
avoid-bed-rest plus normal population activity targets for low back pain; and
an 8-week, 3x/week NASM-continuum program for upper crossed syndrome posture.
**Rotator cuff/shoulder evidence and the 2021 LBP CPG grading details could
not be verified** (infrastructure errors mid-run — see Gaps below), and
several specific dosing claims were refuted, so those must be excluded or
re-sourced before anything goes in front of a client.

## Verified findings (confidence: high unless noted)

1. **NASM Corrective Exercise Continuum** — Inhibit (foam roll/manual, for
   overactive muscles) → Lengthen (static stretch, shortened muscles) →
   Activate (isolated strengthening, underactive muscles) → Integrate
   (multi-joint functional retraining). Verified against NASM's own CES docs
   and an RCT that operationalized it as a real client program.
   Sources: [NASM CES continuum](https://blog.nasm.org/ces/a-guide-to-nasms-corrective-exercise-continuum), [ResearchGate RCT](https://www.researchgate.net/publication/343377516_The_Effect_of_an_8-week_NASM_Corrective_Exercise_Program_on_Upper_Crossed_Syndrome)

2. **NASM Overhead Squat Assessment (OSA)** — shoes off, arms overhead
   aligned with ears, squat to chair-seat depth for 5 reps, viewed
   anterior + lateral. Knee valgus → NASM model attributes to weak hip
   abductors/external rotators + overactive adductors. Heels-elevated
   retest (2x4 board or plates) differentiates driver: valgus resolves →
   ankle dorsiflexion restriction; valgus persists → hip weakness.
   Correction: side-lying hip abduction (Activate) → ball-wall squat with
   mini-band (Integrate).
   **Caveat:** peer-reviewed reviews find the hip-strength-to-valgus
   correlation inconsistent/task-dependent — frame as NASM's assessment
   model, not proven causation.
   Sources: [OSA how-to](https://blog.nasm.org/certified-personal-trainer/how-to-perform-an-overhead-squat-assessment-osa), [continuum](https://blog.nasm.org/ces/a-guide-to-nasms-corrective-exercise-continuum)

3. **Patellofemoral (anterior knee) pain — diagnosis/screening** — 2019
   JOSPT/AOPT CPG: defined by retropatellar/peripatellar pain +
   reproduction with squatting/stairs/prolonged sitting/flexed-knee
   loading + exclusion of other causes (Grade B). Pain reproduction during
   squatting is a Grade A screening cue.
   **Treatment (Grade A):** combined hip- and knee-targeted exercise. Hip
   work emphasizes posterolateral hip musculature (may be preferred
   early). Knee work via weight-bearing (resisted squats) or
   non-weight-bearing (resisted knee extension) — equivalent outcomes.
   Source: [JOSPT 2019 PFP CPG](https://www.jospt.org/doi/10.2519/jospt.2019.0302)

4. **Patellofemoral pain — do NOT use** — dry needling and manual therapy
   used in isolation (Grade A against); knee braces/sleeves/straps, EMG
   biofeedback, visual alignment biofeedback during exercise, and
   biophysical agents (ultrasound, cryotherapy, e-stim, laser) — Grade B
   against. Framing: "not recommended, evidence of no effect," not a harm
   warning.
   Source: [JOSPT 2019 PFP CPG](https://www.jospt.org/doi/10.2519/jospt.2019.0302)

5. **Low back pain — activity guidance** — avoid symptom-provoking
   movements initially, return to normal activity ASAP, avoid bed rest
   except during severe pain. LBP clients should meet the same minimum
   activity targets as the general public (150 min moderate or 75 min
   vigorous aerobic/week, plus muscle strengthening 2x/week), via FITT.
   **Caveat:** modern guidance favors graded exposure ("hurt ≠ harm") for
   chronic LBP — say "modify aggravating movements initially," not blanket
   pain avoidance.
   Source: [ACSM/EIM LBP handout](https://exerciseismedicine.org/assets/page_documents/EIM%20Rx%20series_Exercising%20with%20Lower%20Back%20Pain.pdf)
   ⚠️ This same handout's specific dosing claims (2-week core-exercise
   delay; 1-set/10-15-rep resistance progression) were **refuted** — do
   not publish those.

6. **Upper crossed syndrome (forward head, rounded shoulders, thoracic
   kyphosis)** — confidence: medium (small n=30, single-sex sample,
   lower-tier journal). An 8-week NASM-continuum program, 3x/week,
   30-70 min/session, significantly reduced forward head, forward
   shoulder, and thoracic kyphosis angles vs. control.
   Source: [Journal of Sport Biomechanics 2019 RCT](https://www.researchgate.net/publication/343377516_The_Effect_of_an_8-week_NASM_Corrective_Exercise_Program_on_Upper_Crossed_Syndrome)

7. **Plantar fasciitis — screening + treatment** — 2023 APTA/JOSPT heel
   pain CPG (Grade B). Screening cues: plantar medial heel pain worst on
   first steps after inactivity and after prolonged weight-bearing; onset
   after a recent activity increase; pain on palpating the proximal
   plantar fascia insertion; positive windlass test; limited talocrural
   dorsiflexion; high BMI in nonathletic clients.
   **Treatment (Grade A, strongest):** plantar fascia-specific stretching +
   gastrocnemius/soleus stretching. Dosing: 10-30s holds per stretch,
   4 days to 8 weeks studied duration.
   **Caveat:** limited evidence beyond 3 months; diagnostic criteria are
   written for PTs — coach uses as screening cues only, not diagnosis.
   Source: [JOSPT 2023 heel pain CPG](https://www.jospt.org/doi/10.2519/jospt.2023.0303)
   ⚠️ A related claim (high-load strengthening beats stretching, Rathleff
   et al.) was **refuted** — do not publish.

8. **Achilles tendinopathy (chronic midportion) — Alfredson protocol** —
   classical eccentric heel-drop: 3x15 reps, twice daily (180 reps/day),
   12 weeks, two variants (straight knee + bent knee). 5-year follow-up:
   mean VISA-A 49.2 → 83.6 (p<0.001).
   **Caveat:** 48.3% of the follow-up cohort had co-interventions, only
   ~40% were fully pain-free, no untreated control — supports durable
   improvement *after the program*, not clean causal attribution.
   Lower-volume variants show comparable outcomes in later trials.
   Source: [BJSM 5-year follow-up](https://pmc.ncbi.nlm.nih.gov/articles/PMC3277725/)

## Refuted — do not publish

- LBP: "delay core exercise 2 weeks, aerobic restarts at 10-15 min adding
  5 min every 2-4 weeks" (0-3 vote, EIM handout)
- LBP: "1 set of 10-15 reps for all major muscle groups, rest day between
  sessions, build to 15-20 reps before adding a 2nd set" (0-3 vote, EIM
  handout)
- Plantar fasciitis: "Grade C therapeutic exercise incl. high-load
  strengthening beats stretching (Rathleff et al., 29-point FFI
  difference)" (0-3 vote, JOSPT heel pain CPG)

## Unverified — infrastructure failure, needs re-run before use

All failed on JOSPT fetch errors during the verify pass (session-limit /
tool errors), not because the claims were judged false:

- Rotator cuff/shoulder: motor control exercise reduces disability
  short/medium-term vs. nonspecific exercise but not pain short-term
  ([JOSPT 2024](https://www.jospt.org/doi/10.2519/jospt.2024.12453))
- Rotator cuff/shoulder: motor control exercise "probably only slightly
  superior" to nonspecific exercise; benefit mechanism unclear (same
  source)
- Rotator cuff/shoulder: no RCTs found comparing exercise frequency/
  duration as of the source's May 2023 search date (same source)
- LBP: 2021 APTA/JOSPT CPG's A/B/C grading scale definitions
  ([JOSPT 2021](https://www.jospt.org/doi/10.2519/jospt.2021.0304))
- LBP: 2021 CPG's scope (PT-delivered/studied nonpharmacologic treatment
  only) (same source)

## Coverage gaps — not researched at all this pass

No verified findings for: **tennis/golfer's elbow, hip tightness/anterior
pelvic tilt, ankle mobility as a standalone complaint, neck pain beyond UCS
posture, or explicit refer-out red-flag criteria per condition.** These need
a follow-up research pass before the Resources page can claim to cover "the
most common issues."

## Source quality note

JOSPT/APTA CPGs and BJSM follow-ups are strong (primary, peer-reviewed
clinical practice guidelines). The UCS trial is a small, low-tier-journal
RCT — use with the medium-confidence caveat attached. NASM's mechanistic
attributions (e.g., "hip weakness causes valgus") have inconsistent
peer-reviewed support — present as NASM's assessment model/rationale, not
established causation.

**Scope of practice reminder for whatever copy gets written from this:** a
trainer screens and programs, does not diagnose. The CPG diagnostic criteria
above are written for physical therapists — a coach uses them as screening
cues that inform a referral decision, not as a diagnosis to give a client.

Guideline currency: verified as of July 2026 (2019 PFP CPG, 2023 plantar
fasciitis CPG — neither superseded as of the research date). Guidelines are
periodically revised; re-check currency before finalizing client copy if
this sits unused for long.

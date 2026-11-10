# Astra — NASA Space Apps 2026 submission kit

**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions · **Hub:** Dushanbe · **Deadline:** 13 Nov 2026

## One-line pitch
Astra watches an astronaut's own numbers against their own baseline, warns early when something drifts, adapts the day's plan with a cited reason, and hands the flight surgeon a one-page report.

## Judging criteria → where to look
| Criterion | Evidence in the project |
|---|---|
| **Relevance** | Built on the challenge text: gathers indicators (wearable, manual, labs, environment), lets the astronaut evaluate and act, colour-codes, trends, explains, gamifies, escalates. RIDGE hazards map to 6 body systems — `docs/CONCEPT.md`. |
| **Validity** | Every indicator states the basis of its thresholds and cites spaceflight research (`server/src/health/references.js`). Method is pure functions, unit-tested. `docs/VALIDATION.md` reports detection and false alarms **and its own limits**. |
| **Impact** | Long missions (Mars: up to ~22 min one-way delay) make self-monitoring essential; store-and-forward surgeon report; works offline-first by design. Also useful for analog crews (HI-SEAS, SIRIUS, Antarctic stations). |
| **Creativity** | Fixed personal baseline + early-drift detection; Mars-transit **mission replay** with hidden ground truth; adaptive plan that never overrides the mission plan. |
| **Presentation** | One-tap demo crew, replay scrubber, body map, 2–3 min video script below. |

## 3-minute video script
1. **0:00 – The problem (20 s).** Mars crew, 22-minute delay, no clinic. "Astronauts must notice changes in themselves."
2. **0:20 – Try the demo crew (10 s).** Tap *Try the demo crew*. No sign-up.
3. **0:30 – Replay (60 s).** Press play on the Mars-transit replay. Day 60 bone marker starts rising → *early warning* appears before the threshold → body map bones turn amber → plan adds +1 km loaded treadmill with the reason and evidence ids. Day 75 sleep/HRV/mood slide. Day 96 solar particle event → red alert, shelter task, surgeon report.
4. **1:30 – Evidence (30 s).** Open a metric → "Evidence behind this rule": basis, references, baseline confidence.
5. **2:00 – Honesty (30 s).** Show `docs/VALIDATION.md`: drift false alarms ≈0.04 vs ≈14 per crew-month for static thresholds (numbers in the file are authoritative); earlier on weight loss; **no earlier on noisy slow drifts** — and next step is real analog/flight data.
6. **2:30 – Close (30 s).** Surgeon report, "not a medical device", roadmap: NASA OSDR data, WHOOP/Oura/Astroskin adapters, FHIR import.

## NASA data and AI disclosure (fill in before submitting)
- **Real NASA data (ingested):** NASA Open Science Data Repository **OSD-569** — Inspiration4 complete blood counts (hemoglobin, WBC, lymphocytes, platelets; 4 anonymised crew x 7 time points, L-92 to R+194 days). Fixture + provenance: `server/fixtures/osdr/`; loader: `server/src/osdr.js`; try it via *See real NASA data (Inspiration4)* on the welcome screen. Values are imported exactly as published; calendar dates are shifted so the last sample is "today" (day offsets are real). **Limits, stated in the app:** pre/post-flight only (the mission lasted 3 days — no in-flight samples), 3 pre-flight baseline points per person, so drift detection is not applicable and baseline confidence is shown as *moderate*.
- Other NASA material used: HRP hazards (RIDGE) and published studies in `references.js`.
- Demo data is synthetic and labelled (`source = scenario | demo`); real data is labelled `nasa-osdr`.
- AI use: code and documentation were written with Claude (Anthropic) assistance. In the app, the *Ask Astra* helper runs offline by default; if the operator sets an Anthropic key and the user opts in, Claude (`claude-opus-5-5`) phrases answers from the user's own readings (no identity data) under the guardrails in the README.

## Before you submit — checklist
- [ ] Re-verify every citation in `server/src/health/references.js` (authors, journal, year).
- [ ] Deploy (`server/Dockerfile`) and confirm `Try the demo crew` works on the public URL.
- [ ] Record the video; add the link, repo URL and demo URL to the Space Apps project page.
- [ ] Move `docs/ad/*.mp4` out of git history or to releases (repo is heavy).

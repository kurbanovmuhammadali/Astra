# ASTRA — Crew Health Companion (NASA Space Apps 2026)

**Challenge:** *Create Health Monitoring Software for Astronauts on Space Missions* — Dushanbe hub.

Health monitoring for astronauts: WHOOP + manual vitals + labs → personal-baseline evaluation with **early-drift warnings** → clickable 3D body map → **adaptive mission plan** → flight-surgeon report. Every rule shows its evidence.

## Try it in 60 seconds
Open the app → **Try the demo crew** (no sign-up) → on *Today*, press **play** on the Mars-transit replay. Four problems are hidden in 120 days of synthetic data (bone-marker rise, isolation fatigue, body-mass loss, a solar particle event). Watch alerts, body map and plan react day by day; the ground truth is revealed as you go.

## What makes it different
| | |
|---|---|
| **Personal baseline, fixed** | Median of your first 14 days. A slow decline can never become "the new normal". |
| **Early drift warning** | 7-day median ≥ 3 robust SE worse than baseline, ≥ a minimum clinical % change, and a consistent Theil–Sen trend — or a significant Mann–Kendall trend. Only ever raises green → amber. |
| **Evidence on every rule** | Each indicator states its basis (clinical / spaceflight-informed / Astra default) and cites NASA HRP, Twins Study, ISS studies. `server/src/health/references.js` — please re-verify citations before publishing. |
| **Honest validation** | `cd server && npm run validate` replays synthetic crews → [docs/VALIDATION.md](docs/VALIDATION.md). It states plainly where drift detection helps (fewer false alarms, earlier on body-mass loss) and where it does not (no earlier than a 10 % threshold for noisy slow drifts). |
| **Explainable plan** | Mission plan stays as prescribed; Astra adds tasks with a "why" and evidence ids, and routes protocol changes to the flight surgeon. |
| **Real NASA data** | *See real NASA data (Inspiration4)* loads actual OSDR OSD-569 blood counts through the same engine: pre-flight baseline → launch → recovery, with provenance and limits shown. `npm run import:osdr` verifies/refreshes the file. |
| **Not a medical device** | Guidance and escalation only. Synthetic data is always labelled. |

## Apple Watch / Apple Health
**Built:** *Data sources → Apple Health · Apple Watch → Import Health export* (web). On the iPhone: Health → your photo → Export All Health Data → unzip → pick `export.xml`. The browser reads the (often huge) file locally and uploads only resting HR, HRV (SDNN), SpO₂, sleep, weight, blood pressure, temperature and exercise minutes for the last 90 days; the server validates, aggregates per day (sleep stages merged, units converted) and upserts idempotently. Everything then flows through the same baseline / drift / evidence engine. Tested on a synthetic export in Apple's attribute layout (`server/test/applehealth.test.js`) — **not yet on a real Apple Watch export.**

**Not built:** live HealthKit sync from an iPhone app. That needs a native iOS build (Expo dev client + HealthKit entitlement) and a physical iPhone + Watch to test. `POST /api/integrations/apple-health/batch` is the contract that app would call.

## Food & calories
Home → **Log food & calories** (also Profile). Search built-in staples (incl. Central Asian dishes), the USDA database (optional free `USDA_API_KEY`) or Open Food Facts (no key); set grams; log to breakfast / lunch / dinner / snack. Shows kcal and macros against a goal (default 2500 kcal / 90 g protein, editable via `PUT /api/food/goal`), a 7-day chart, and a heuristic note when the last 3 logged days average under 75% of the goal. Only the search words leave the server. Values are estimates.

**Photo estimate** (web / iPhone browser): take or choose a photo; Claude (needs `ANTHROPIC_API_KEY`) lists the foods with approximate grams, kcal and macros, which you review before adding. Sent only after an explicit per-photo agreement, resized to 1024 px, not stored, no name or email included. Expect errors of 20–30%.

## Ask Astra (grounded AI helper)
*Insights tab.* Answers are built from one snapshot of the user's own data plus the cited rules — flagged indicators, baselines, early-drift flags, today's plan changes, evidence ids. Two engines share the same guardrails:
- **Offline** (default): deterministic, computed on our server, no external call. Includes a ready-to-edit SBAR message for the flight surgeon.
- **Claude** (optional): set `ANTHROPIC_API_KEY` (left empty in `.env.example`) **and** the user switches "Let Claude phrase answers" on. Only readings + rule evidence are sent — never name, e-mail, ids or mission text. Model `claude-opus-5-5` (override with `ASTRA_AI_MODEL`), effort low.

Guardrails enforced in code, whatever the model says: red alerts always start with a flight-surgeon line; citations limited to ids present in the data; refusal or API failure falls back to the offline answer; the model is told not to diagnose or prescribe. Tests use an injected fake client (no network, no key).

## Email verification (real)
Sign-up and log-in use a 6-digit emailed code (10 min, single use, 5 tries, 45 s resend cooldown, HMAC-hashed at rest). Configure **one** provider in `server/.env` — all keys ship **empty** in `.env.example`:
- `RESEND_API_KEY` (+ verified `MAIL_FROM` domain), or
- `SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`).

Without a provider, development shows the code in the server log and auto-fills it; **production refuses (503) instead of leaking codes**, and answers identically for known/unknown emails so accounts cannot be enumerated. Covered by `server/test/mail.test.js` (captured delivery, Resend request shape, a fake SMTP conversation).

Read **[docs/CONCEPT.md](docs/CONCEPT.md)** for the challenge analysis (RIDGE hazards → measurable indicators).

```
claude version/
├── server/   Node 22+ API · SQLite · auth/sessions · consents · WHOOP OAuth · health engine · serves the web build
├── mobile/   Expo (React Native) app → iOS App Store build AND the web version (same code)
└── docs/     CONCEPT · APP_STORE · INTEGRATIONS
```

## Run it locally

Terminal 1 — API (port 4000):

```bash
cd server && npm install && npm run dev
```

Terminal 2 — app in the browser with hot reload (port 8082):

```bash
cd mobile && npm install && npm run web
```

Open http://localhost:8082. Create an account (age gate → profile → consents). Every new account gets a clearly-labelled 30-day **demo dataset** so all screens have data; remove it under Profile → Data sources.

Local test account used during development (exists only in your local `server/data/perigee.db`): `ada@crew.test` / `orbit2026`.

### Web version (backup plan) — one server

```bash
cd mobile && npm run build:web     # exports into server/public
cd ../server && npm start          # http://localhost:4000 serves app + API, same origin
```

Deploy `server/` anywhere that runs Node 22+ or Docker (Render, Fly.io, Railway, a VPS). See `server/Dockerfile`. Set `NODE_ENV=production`, `APP_URL=https://your-domain`, `TOKEN_ENC_KEY`, and mount a volume for `server/data/`.

### iPhone

- **Fastest:** install *Expo Go* on the iPhone, run `cd mobile && EXPO_PUBLIC_API_URL=http://<your-mac-LAN-IP>:4000 npx expo start`, scan the QR code.
- **Simulator:** needs full Xcode (this Mac currently only has Command Line Tools). Install Xcode from the App Store, then `sudo xcode-select -s /Applications/Xcode.app` and `npm run ios`.
- **App Store / TestFlight:** cloud build with EAS — no local Xcode required. See [docs/APP_STORE.md](docs/APP_STORE.md).

## Tests

```bash
cd server && npm test        # auth, age gate, consent, CSRF, plan adaptation, ingest, account deletion
cd mobile && npm run typecheck
```

## What's implemented

| Area | Details |
|---|---|
| Onboarding | 3-slide intro with real-time 3D copper biometric ring (three.js / react-three-fiber) |
| Age gate | DOB check on device (18+); blocked users' DOB is never sent; server re-validates |
| Registration | name, email, password policy, role (astronaut / analog crew / flight surgeon), mission, environment (station, spacecraft, lunar, Mars, analog) |
| Consent | Terms + Privacy acceptance and **separate explicit health-data consent**, versioned & stored per user |
| Sessions | web: HttpOnly SameSite=Lax cookie (+ custom-header CSRF guard); iOS: bearer token in Keychain (expo-secure-store) |
| Password reset | token flow (dev mode shows link; plug an SMTP provider for production) |
| Cookies | essential-only banner + cookie policy; no analytics/trackers |
| Legal | Terms of Use, Privacy Policy, Cookie Policy screens |
| Account | export all data (JSON), delete account with password (App Store guideline 5.1.1(v)) |
| Today | readiness score, recovery, sleep, strain, colour-coded alerts, daily metric tiles with charts, check-in CTA |
| Body map | clickable 3D body, 6 systems with pulsing status hotspots |
| Plan | mission plan kept as prescribed + Perigee adaptations with "why", surgeon-approval flags, XP, levels, streaks, mission patches |
| Trends | dot-matrix charts per metric, week/month, baseline |
| Check-in | draggable mood dial + symptoms (red symptoms escalate) |
| Logging | BP, glucose, temp, mass, bone NTx, vitamin D, radiation, CO₂ — each with "how to measure" |
| Education | every metric: what it is, why it matters in space, how to measure |
| Report | flight-surgeon summary, copy/share (store-and-forward) |
| Integrations | WHOOP v2 OAuth + sync, demo dataset, `/api/ingest` for NASA labs / dosimeters / other wearables |

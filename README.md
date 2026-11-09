# PERIGEE — Crew Health Companion (NASA Space Apps 2026)

Health monitoring for astronauts: WHOOP + manual vitals + labs → personal-baseline evaluation → clickable 3D body map → **adaptive mission plan** → flight-surgeon report.

Read **[docs/CONCEPT.md](docs/CONCEPT.md)** first — it explains the challenge and how the app helps astronauts.

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

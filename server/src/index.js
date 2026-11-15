import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, tx } from './db.js';
import {
  hashPassword, verifyPassword, passwordProblem, ageFrom, createSession, setSessionCookie, SESSION_COOKIE,
  requireAuth, publicUser, rateLimit, sha256, token, LEGAL_VERSION, sessionUser,
} from './auth.js';
import { METRICS, SYSTEMS, SYMPTOMS } from './health/catalog.js';
import { dashboard, series, metricSnapshot, adaptivePlan, missionPlan, today, toSql, baselineOf, evaluate } from './health/engine.js';
import { seedDemo, clearDemo } from './demo.js';
import { whoopConfigured, authorizeUrl, consumeState, exchangeCode, syncWhoop, disconnectWhoop } from './whoop.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const PROD = process.env.NODE_ENV === 'production';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const ORIGINS = new Set([APP_URL, ...(process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:8082').split(',').map(s => s.trim()).filter(Boolean)]);
const MIN_AGE = 18;

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// security headers + CORS (credentials only for allow-listed origins)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const o = req.headers.origin;
  if (o && ORIGINS.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const clientOf = req => (req.headers['x-client'] === 'native' ? 'native' : 'web');
const authResponse = (req, res, user) => {
  const t = createSession(user.id, clientOf(req));
  if (clientOf(req) === 'web') setSessionCookie(res, t);
  res.json({ user: publicUser(user), ...(clientOf(req) === 'native' ? { token: t } : {}) });
};

// ------------------------------------------------------------------ meta / legal
app.get('/api/health', (_req, res) => res.json({ ok: true, whoop: whoopConfigured(), legalVersion: LEGAL_VERSION, minAge: MIN_AGE }));
app.get('/api/catalog', (_req, res) => res.json({ metrics: METRICS, systems: SYSTEMS, symptoms: SYMPTOMS }));

// ------------------------------------------------------------------ auth
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, dob, role = 'astronaut', mission = 'ISS Expedition 74', environment = 'station', acceptTerms, acceptPrivacy, consentHealth } = req.body ?? {};
  if (!rateLimit(`reg:${req.ip}`, 10, 60 * 60e3)) return bad(res, 'Too many sign-ups from this network. Try later.', 429);
  if (typeof name !== 'string' || name.trim().length < 2) return bad(res, 'Please enter your name.');
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Please enter a valid email.');
  const pp = passwordProblem(password); if (pp) return bad(res, pp);
  const age = ageFrom(String(dob || ''));
  if (!Number.isFinite(age) || age > 120) return bad(res, 'Please enter a valid date of birth.');
  if (age < MIN_AGE) return bad(res, `You must be at least ${MIN_AGE} to use PERIGEE.`, 403);
  if (!acceptTerms || !acceptPrivacy) return bad(res, 'You need to accept the Terms and Privacy Policy.');
  if (!consentHealth) return bad(res, 'Explicit consent to process health data is required.');
  if (!['astronaut', 'surgeon', 'analog'].includes(role)) return bad(res, 'Invalid role.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return bad(res, 'An account with this email already exists.', 409);
  const user = tx(() => {
    const { lastInsertRowid: id } = db.prepare('INSERT INTO users (email, name, password_hash, dob, role, mission, environment) VALUES (?,?,?,?,?,?,?)')
      .run(email.trim().toLowerCase(), name.trim(), hashPassword(password), dob, role, String(mission).slice(0, 80), environment);
    const c = db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?,?,?)');
    ['terms', 'privacy', 'health_data'].forEach(k => c.run(id, k, LEGAL_VERSION));
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  seedDemo(user.id); // every new crew member starts with a clearly-labelled demo dataset
  authResponse(req, res, user);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!rateLimit(`login:${req.ip}:${String(email).toLowerCase()}`, 8, 15 * 60e3)) return bad(res, 'Too many attempts. Wait 15 minutes.', 429);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || ''));
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) return bad(res, 'Email or password is incorrect.', 401);
  authResponse(req, res, user);
});

// ------------------------------------------------------------------ demo crew account (development only)
// A ready-made crew member with sample data so the log-in flow can be tested without a real mailbox.
export const DEMO_EMAIL = 'crew@astra.demo';
if (!PROD && !db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_EMAIL)) {
  const { lastInsertRowid: id } = db.prepare('INSERT INTO users (email, name, password_hash, dob, role, mission, environment, mission_years) VALUES (?,?,?,?,?,?,?,?)')
    .run(DEMO_EMAIL, 'Alex Morgan', '!', '1988-01-01', 'astronaut', '2.5-year mission', 'mars', 2.5);
  ['terms', 'privacy', 'health_data'].forEach(k => db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?,?,?)').run(id, k, LEGAL_VERSION));
  seedDemo(Number(id));
}

// ------------------------------------------------------------------ passwordless: email + 4-digit code
// purpose 'signup' = new account from the onboarding flow, 'login' = crew account prepared by the mission.
const CODE_TTL = 10 * 60e3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const envForYears = y => (y <= 1 ? 'station' : y <= 2 ? 'lunar' : y <= 4 ? 'mars' : 'spacecraft');

app.post('/api/auth/code', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const purpose = req.body?.purpose === 'login' ? 'login' : 'signup';
  if (!EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email.');
  // the shared demo crew account is used by many judges at once → no per-email cap for it (per-IP limit still applies)
  const demo = email.toLowerCase() === DEMO_EMAIL;
  if (!rateLimit(`code:${req.ip}`, demo ? 30 : 10, 15 * 60e3) || (!demo && !rateLimit(`code:${email}`, 5, 15 * 60e3))) return bad(res, 'Too many codes requested. Wait a few minutes.', 429);
  const exists = !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (purpose === 'signup' && exists) return bad(res, 'This email already has an account. Use Log in instead.', 409);
  if (purpose === 'login' && !exists) return bad(res, 'We could not find a crew account for this email.', 404);
  const code = String(Math.floor(1000 + Math.random() * 9000));
  db.prepare('INSERT OR REPLACE INTO email_codes (email, purpose, code_hash, attempts, expires_at) VALUES (?,?,?,0,?)')
    .run(email, purpose, sha256(`${email}:${code}`), Date.now() + CODE_TTL);
  console.log(`[mail] ${purpose} code for ${email}: ${code}`); // TODO: plug an email provider (SMTP / Resend)
  res.json({ ok: true, ...(PROD ? {} : { devCode: code }) });
});

app.post('/api/auth/code/verify', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const purpose = req.body?.purpose === 'login' ? 'login' : 'signup';
  const code = String(req.body?.code || '');
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ? AND purpose = ?').get(email, purpose);
  if (!row || row.expires_at < Date.now()) return bad(res, 'This code has expired. Request a new one.');
  if (row.attempts >= 5) return bad(res, 'Too many wrong codes. Request a new one.', 429);
  if (sha256(`${email}:${code}`) !== row.code_hash) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?').run(email, purpose);
    return bad(res, 'That code is not right. Try again.');
  }

  if (purpose === 'login') {
    db.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
    return authResponse(req, res, db.prepare('SELECT * FROM users WHERE email = ?').get(email));
  }

  const { firstName, lastName, age, missionYears, acceptTerms, heightCm, weightKg, missionGoal } = req.body?.profile ?? {};
  const name = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  const a = Number(age), y = Number(missionYears);
  if (String(firstName || '').trim().length < 1 || String(lastName || '').trim().length < 1) return bad(res, 'Please enter your name and surname.');
  if (!Number.isInteger(a) || a < MIN_AGE || a > 100) return bad(res, `Age must be between ${MIN_AGE} and 100.`);
  if (!(y >= 0.5 && y <= 10) || (y * 2) % 1 !== 0) return bad(res, 'Mission length must be 0.5–10 years in half-year steps.');
  if (!acceptTerms) return bad(res, 'You need to accept the Terms and Privacy Policy.');
  // body measurements and mission goal are optional (older app versions don't send them)
  const h = heightCm == null ? null : Number(heightCm), w = weightKg == null ? null : Number(weightKg);
  if (h != null && !(h >= 120 && h <= 230)) return bad(res, 'Height must be between 120 and 230 cm.');
  if (w != null && !(w >= 30 && w <= 250)) return bad(res, 'Weight must be between 30 and 250 kg.');
  const GOAL_DESTS = ['iss', 'moon', 'mars', 'jupiter', 'deep'], GOAL_TASKS = ['repair', 'science', 'assembly', 'eva', 'piloting', 'medical', 'surface'];
  const goal = missionGoal && typeof missionGoal === 'object' ? {
    dest: GOAL_DESTS.includes(missionGoal.dest) ? missionGoal.dest : null,
    tasks: Array.isArray(missionGoal.tasks) ? [...new Set(missionGoal.tasks.filter(t => GOAL_TASKS.includes(t)))] : [],
  } : null;
  const goalJson = goal && (goal.dest || goal.tasks.length) ? JSON.stringify(goal) : null;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return bad(res, 'This email already has an account.', 409);
  const dob = `${new Date().getUTCFullYear() - a}-01-01`; // only age is collected; store an approximate birth date
  const user = tx(() => {
    db.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
    const { lastInsertRowid: id } = db.prepare('INSERT INTO users (email, name, password_hash, dob, role, mission, environment, mission_years, height_cm, weight_kg, mission_goal) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(email, name.slice(0, 80), '!', dob, 'astronaut', `${y}-year mission`, envForYears(y), y, h, w, goalJson);
    const c = db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?,?,?)');
    ['terms', 'privacy', 'health_data'].forEach(k => c.run(id, k, LEGAL_VERSION));
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  seedDemo(user.id);
  authResponse(req, res, user);
});

app.post('/api/auth/logout', (req, res) => {
  const s = sessionUser(req);
  if (s) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.tokenHash);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const consents = db.prepare('SELECT kind, version, accepted_at FROM consents WHERE user_id = ? ORDER BY accepted_at').all(req.user.id);
  res.json({ user: publicUser(req.user), consents });
});

app.post('/api/auth/forgot', (req, res) => {
  const email = String(req.body?.email || '');
  if (!rateLimit(`forgot:${req.ip}`, 5, 15 * 60e3)) return bad(res, 'Too many requests.', 429);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const out = { ok: true, message: 'If that email exists, a reset link has been sent.' };
  if (user) {
    const t = token();
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(t), user.id, Date.now() + 60 * 60e3);
    const link = `${APP_URL}/reset?token=${t}`;
    console.log(`[mail] password reset for ${email}: ${link}`); // TODO: plug an SMTP provider
    if (!PROD) out.devResetToken = t;
  }
  res.json(out);
});

app.post('/api/auth/reset', (req, res) => {
  const { token: t, password } = req.body ?? {};
  const pp = passwordProblem(password); if (pp) return bad(res, pp);
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(String(t || '')));
  if (!row || row.expires_at < Date.now()) return bad(res, 'This reset link is invalid or expired.');
  tx(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ account
app.put('/api/account', requireAuth, (req, res) => {
  const { name, mission, environment } = req.body ?? {};
  if (environment && !['station', 'spacecraft', 'lunar', 'mars', 'analog'].includes(environment)) return bad(res, 'Invalid environment.');
  db.prepare('UPDATE users SET name = COALESCE(?, name), mission = COALESCE(?, mission), environment = COALESCE(?, environment) WHERE id = ?')
    .run(name?.trim() || null, mission?.trim() || null, environment || null, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

app.get('/api/account/export', requireAuth, (req, res) => {
  const id = req.user.id;
  res.setHeader('Content-Disposition', 'attachment; filename="perigee-export.json"');
  res.json({
    exportedAt: new Date().toISOString(), user: publicUser(req.user),
    consents: db.prepare('SELECT kind, version, accepted_at FROM consents WHERE user_id = ?').all(id),
    measurements: db.prepare('SELECT metric, value, value2, unit, source, note, recorded_at FROM measurements WHERE user_id = ? ORDER BY recorded_at').all(id),
    checkins: db.prepare('SELECT mood, energy, symptoms, note, recorded_at FROM checkins WHERE user_id = ?').all(id),
    plan: missionPlan(id),
  });
});

app.delete('/api/account', requireAuth, (req, res) => {
  if (req.user.password_hash === '!') {
    // passwordless (email-code) accounts confirm by typing their email
    if (String(req.body?.confirm || '').trim().toLowerCase() !== req.user.email.toLowerCase()) return bad(res, 'Type your email exactly to confirm.', 401);
  } else if (!verifyPassword(String(req.body?.password || ''), req.user.password_hash)) return bad(res, 'Password is incorrect.', 401);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // cascades to all health data
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ health data
app.get('/api/dashboard', requireAuth, (req, res) => res.json(dashboard(req.user.id)));

app.get('/api/metrics/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  if (!METRICS[key]) return bad(res, 'Unknown metric.', 404);
  const days = Math.min(90, Math.max(3, Number(req.query.days) || 30));
  const recent = db.prepare('SELECT id, value, value2, source, note, recorded_at FROM measurements WHERE user_id = ? AND metric = ? ORDER BY recorded_at DESC LIMIT 20').all(req.user.id, key);
  res.json({ info: METRICS[key], snapshot: metricSnapshot(req.user.id, key), series: series(req.user.id, key, days), recent });
});

const ingestOne = (userId, m, source) => {
  const meta = METRICS[m.metric];
  if (!meta) throw new Error(`Unknown metric "${m.metric}".`);
  const v = Number(m.value), v2 = m.value2 == null || m.value2 === '' ? null : Number(m.value2);
  if (!Number.isFinite(v) || (v2 != null && !Number.isFinite(v2))) throw new Error(`${meta.label}: value must be a number.`);
  if (meta.dual && v2 == null) throw new Error(`${meta.label} needs two values.`);
  const when = m.recordedAt ? new Date(m.recordedAt) : new Date();
  if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 5 * 60e3) throw new Error('Invalid measurement time.');
  db.prepare('INSERT INTO measurements (user_id, metric, value, value2, unit, source, external_id, note, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(userId, m.metric, v, v2, meta.unit, source, m.externalId ?? null, m.note ? String(m.note).slice(0, 500) : null, toSql(when));
  return { metric: m.metric, ...evaluate(m.metric, v, v2, baselineOf(userId, m.metric)) };
};

app.post('/api/measurements', requireAuth, (req, res) => {
  try { res.json(ingestOne(req.user.id, req.body ?? {}, 'manual')); } catch (e) { bad(res, e.message); }
});

app.delete('/api/measurements/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM measurements WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/**
 * Universal ingestion endpoint — the plug for future data sources (NASA lab feeds, station dosimeters,
 * other wearables, FHIR Observation converters). Body: { source: 'nasa-lab', records: [{metric,value,value2?,recordedAt,externalId?}] }
 */
app.post('/api/ingest', requireAuth, (req, res) => {
  const { source = 'import', records } = req.body ?? {};
  if (!Array.isArray(records) || records.length > 5000) return bad(res, 'records[] (max 5000) required.');
  const errors = []; let ok = 0;
  tx(() => records.forEach((r, i) => { try { ingestOne(req.user.id, r, String(source).slice(0, 40)); ok++; } catch (e) { errors.push({ index: i, error: e.message }); } }));
  res.json({ imported: ok, errors });
});

app.post('/api/checkins', requireAuth, (req, res) => {
  const { mood, energy, symptoms = [], note } = req.body ?? {};
  const m = Number(mood);
  if (!Number.isFinite(m) || m < 0 || m > 100) return bad(res, 'Mood must be 0–100.');
  const sym = (Array.isArray(symptoms) ? symptoms : []).filter(s => SYMPTOMS[s]);
  const now = toSql();
  tx(() => {
    db.prepare('INSERT INTO checkins (user_id, mood, energy, symptoms, note, recorded_at) VALUES (?,?,?,?,?,?)').run(req.user.id, Math.round(m), energy == null ? null : Math.round(Number(energy)), JSON.stringify(sym), note ? String(note).slice(0, 1000) : '', now);
    db.prepare(`INSERT INTO measurements (user_id, metric, value, unit, source, recorded_at) VALUES (?, 'mood', ?, '/100', 'checkin', ?)`).run(req.user.id, Math.round(m), now);
    db.prepare(`INSERT OR IGNORE INTO task_completions (user_id, day, task_key, xp) VALUES (?, ?, 'checkin', 20)`).run(req.user.id, today());
  });
  const red = sym.filter(s => SYMPTOMS[s].severity === 'red');
  res.json({ ok: true, escalate: red.length > 0, message: red.length ? 'Some symptoms need the flight surgeon. A report is ready on the Today screen.' : 'Check-in saved. +20 XP' });
});

// ------------------------------------------------------------------ plan
app.get('/api/plan', requireAuth, (req, res) => res.json(adaptivePlan(req.user.id)));

app.post('/api/plan/tasks/:key/toggle', requireAuth, (req, res) => {
  const plan = adaptivePlan(req.user.id);
  const t = [...plan.items, ...plan.adaptations].find(x => x.key === req.params.key);
  if (!t) return bad(res, 'Task not found.', 404);
  if (t.done) db.prepare('DELETE FROM task_completions WHERE user_id = ? AND day = ? AND task_key = ?').run(req.user.id, plan.day, t.key);
  else db.prepare('INSERT OR IGNORE INTO task_completions (user_id, day, task_key, xp) VALUES (?,?,?,?)').run(req.user.id, plan.day, t.key, t.xp);
  res.json(adaptivePlan(req.user.id));
});

/** Import the mission's own plan (from mission control / flight surgeon). We never rewrite it. */
app.put('/api/plan', requireAuth, (req, res) => {
  const { source = 'Mission control', items } = req.body ?? {};
  if (!Array.isArray(items) || !items.length || items.some(i => !i.key || !i.title)) return bad(res, 'items[] with key and title required.');
  const clean = items.slice(0, 40).map(i => ({ key: String(i.key), title: String(i.title), detail: String(i.detail ?? ''), category: String(i.category ?? 'other'), target: Number(i.target) || 1, unit: String(i.unit ?? ''), xp: Math.min(100, Number(i.xp) || 20) }));
  db.prepare(`INSERT INTO plans (user_id, source, items) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET source = excluded.source, items = excluded.items, updated_at = datetime('now')`).run(req.user.id, String(source), JSON.stringify(clean));
  res.json(adaptivePlan(req.user.id));
});

// ------------------------------------------------------------------ flight-surgeon report
app.get('/api/report', requireAuth, (req, res) => {
  const d = dashboard(req.user.id);
  const lines = [
    `PERIGEE crew health report — ${req.user.name} · ${req.user.mission}`,
    `Generated ${new Date().toISOString()} · Readiness ${d.readiness}/100`, '',
    'SYSTEMS', ...d.systems.map(s => `  [${s.status.toUpperCase()}] ${s.label}${s.reasons.length ? ' — ' + s.reasons.map(r => r.label).join(', ') : ''}`), '',
    'LATEST INDICATORS', ...Object.values(d.metrics).filter(m => m.value != null).map(m => `  ${m.label}: ${m.value}${m.value2 != null ? '/' + m.value2 : ''} ${m.unit} (${m.status}${m.deviation != null ? `, ${m.deviation > 0 ? '+' : ''}${m.deviation}% vs baseline` : ''}) · ${m.source} · ${m.recordedAt}`), '',
    'ALERTS', ...(d.alerts.length ? d.alerts.map(a => `  [${a.level.toUpperCase()}] ${a.title}: ${a.body}`) : ['  none']), '',
    d.checkin ? `Last check-in: mood ${d.checkin.mood}, symptoms: ${d.checkin.symptoms.join(', ') || 'none'}` : 'No check-in yet.',
  ];
  res.json({ text: lines.join('\n') });
});

// ------------------------------------------------------------------ integrations
app.get('/api/integrations', requireAuth, (req, res) => {
  const rows = Object.fromEntries(db.prepare('SELECT provider, status, last_sync FROM integrations WHERE user_id = ?').all(req.user.id).map(r => [r.provider, r]));
  res.json({
    providers: [
      { key: 'whoop', name: 'WHOOP', kind: 'Wearable', status: rows.whoop?.status ?? 'disconnected', lastSync: rows.whoop?.last_sync ?? null, available: whoopConfigured(), metrics: ['recovery', 'hrv', 'rhr', 'spo2', 'sleep', 'strain', 'weight'] },
      { key: 'demo', name: 'Demo crew dataset', kind: 'Synthetic', status: rows.demo?.status ?? 'disconnected', lastSync: rows.demo?.last_sync ?? null, available: true, metrics: Object.keys(METRICS) },
      { key: 'healthkit', name: 'Apple Health', kind: 'Phone', status: 'planned', available: false, metrics: ['rhr', 'hrv', 'sleep', 'weight', 'bp', 'glucose'] },
      { key: 'nasa-lab', name: 'NASA lab results', kind: 'Clinical feed', status: 'ready', available: false, note: 'Uses POST /api/ingest when NASA data access is granted', metrics: ['ntx', 'vitd'] },
      { key: 'dosimeter', name: 'Station dosimeter', kind: 'Environment', status: 'ready', available: false, note: 'Uses POST /api/ingest', metrics: ['radiation', 'co2'] },
      { key: 'astroskin', name: 'Bio-Monitor / Astroskin', kind: 'Smart garment', status: 'planned', available: false, metrics: ['rhr', 'spo2', 'bp', 'temp'] },
    ],
  });
});

app.post('/api/integrations/whoop/start', requireAuth, (req, res) => {
  if (!whoopConfigured()) return bad(res, 'WHOOP credentials are not configured on this server yet. Add WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET, or use the demo dataset.', 503);
  res.json({ url: authorizeUrl(req.user.id, req.body?.platform === 'native' ? 'native' : 'web') });
});

app.get('/api/integrations/whoop/callback', async (req, res) => {
  const st = consumeState(req.query.state);
  const back = (platform, q) => res.redirect(`${platform === 'native' ? (process.env.NATIVE_REDIRECT || 'perigee://integrations') : `${APP_URL}/integrations`}?${new URLSearchParams(q)}`);
  if (!st) return back('web', { whoop: 'error', reason: 'state' });
  if (req.query.error || !req.query.code) return back(st.platform, { whoop: 'denied' });
  try {
    await exchangeCode(st.user_id, String(req.query.code));
    await syncWhoop(st.user_id).catch(() => null);
    back(st.platform, { whoop: 'connected' });
  } catch (e) { console.error(e); back(st.platform, { whoop: 'error' }); }
});

app.post('/api/integrations/whoop/sync', requireAuth, async (req, res) => {
  try { res.json(await syncWhoop(req.user.id)); } catch (e) { bad(res, e.message, 502); }
});
app.delete('/api/integrations/whoop', requireAuth, async (req, res) => { await disconnectWhoop(req.user.id); res.json({ ok: true }); });
app.post('/api/integrations/demo', requireAuth, (req, res) => { clearDemo(req.user.id); seedDemo(req.user.id); res.json({ ok: true }); });
app.delete('/api/integrations/demo', requireAuth, (req, res) => { clearDemo(req.user.id); res.json({ ok: true }); });

app.use('/api', (_req, res) => bad(res, 'Not found.', 404));

// ------------------------------------------------------------------ web app (Expo web export)
const pub = resolve(here, '../public');
if (existsSync(pub)) {
  app.use(express.static(pub, { index: false, maxAge: PROD ? '1h' : 0 }));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve(pub, 'index.html')));
}

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Something went wrong.' }); });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`PERIGEE API on http://localhost:${PORT}  (WHOOP ${whoopConfigured() ? 'configured' : 'not configured — demo mode'})`));
}

/**
 * The SI's brain for each astronaut.
 *  - learns what is NORMAL for that person (robust median / spread of their own last 28 days; invalid zeros ignored),
 *  - lets the doctor override it with their own normal ranges and notes (doctor input always wins),
 *  - every 30 minutes analyses the latest readings against that norm and stores a verdict (good / watch / alert),
 *  - keeps one dataset per astronaut (health file, doctor notes, norms, readings, plan changes) that the assistant must check
 *    before it suggests or changes anything,
 *  - can propose a day off, a lighter day or a schedule block; the person confirms before anything changes.
 */
import { db } from './db.js';
import { METRICS } from './health/catalog.js';
import { evaluate, today } from './health/engine.js';
import { requireAuth } from './auth.js';
import { requireAdmin } from './roles.js';
import { readBackground } from './background.js';
import { askModel, companionConfigured } from './companion.js';

db.exec(`
CREATE TABLE IF NOT EXISTS learned_norms (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, metric TEXT NOT NULL, mean REAL NOT NULL, sd REAL NOT NULL, n INTEGER NOT NULL, low REAL NOT NULL, high REAL NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, metric));
CREATE TABLE IF NOT EXISTS doctor_norms (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, metric TEXT NOT NULL, low REAL, high REAL, note TEXT, by_user INTEGER, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, metric));
CREATE TABLE IF NOT EXISTS doctor_notes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, by_user INTEGER, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS ai_analyses (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, at TEXT NOT NULL DEFAULT (datetime('now')), level TEXT NOT NULL, summary TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS plan_adjustments (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'proposed', by TEXT NOT NULL DEFAULT 'si', created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT);
`);

try { db.exec('ALTER TABLE doctor_notes ADD COLUMN valid_until TEXT'); } catch { /* already there */ }
const bad = (res, m, c = 400) => res.status(c).json({ error: m });
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const ms = s => Date.parse(String(s).replace(' ', 'T') + 'Z');
const r1 = x => Math.round(x * 10) / 10;

/** Metrics the brain follows, and which direction is worrying. */
export const WATCHED = { recovery: 'low', hrv: 'low', rhr: 'high', spo2: 'low', sleep: 'low', temp: 'both', strain: 'none', weight: 'both' };
/** A 0 (or an impossible value) from a wearable is a sensor gap, not a reading. */
export const validValue = (metric, v) => Number.isFinite(v) && ({ hrv: v > 0, rhr: v >= 25 && v <= 220, spo2: v >= 50 && v <= 100, recovery: v >= 1 && v <= 100, sleep: v >= 0.5 && v <= 20, strain: v > 0, temp: v >= 30 && v <= 43, weight: v >= 25 && v <= 300 }[metric] ?? true);

const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Learns this person's normal from their own last 28 days. */
export function learnNorms(userId) {
  const put = db.prepare(`INSERT INTO learned_norms (user_id, metric, mean, sd, n, low, high, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id, metric) DO UPDATE SET mean = excluded.mean, sd = excluded.sd, n = excluded.n, low = excluded.low, high = excluded.high, updated_at = excluded.updated_at`);
  for (const metric of Object.keys(WATCHED)) {
    const vals = db.prepare("SELECT value FROM measurements WHERE user_id = ? AND metric = ? AND recorded_at >= datetime('now','-28 days')").all(userId, metric).map(r => r.value).filter(v => validValue(metric, v));
    if (vals.length < 5) continue;
    const m = median(vals), mad = median(vals.map(v => Math.abs(v - m)));
    const sd = Math.max(1.4826 * mad, Math.abs(m) * 0.03, 0.1);
    put.run(userId, metric, r1(m), r1(sd), vals.length, r1(m - 1.5 * sd), r1(m + 1.5 * sd));
  }
}

/** Doctor-set range first, then what was learned from the person, else nothing (population rules still apply). */
export function normOf(userId, metric) {
  const d = db.prepare('SELECT low, high, note FROM doctor_norms WHERE user_id = ? AND metric = ?').get(userId, metric);
  const l = db.prepare('SELECT mean, sd, n, low, high FROM learned_norms WHERE user_id = ? AND metric = ?').get(userId, metric);
  if (d && (d.low != null || d.high != null)) return { source: 'doctor', low: d.low ?? l?.low ?? null, high: d.high ?? l?.high ?? null, mean: l?.mean ?? null, note: d.note ?? null };
  return l ? { source: 'learned', low: l.low, high: l.high, mean: l.mean, sd: l.sd, n: l.n } : null;
}

/** good / watch / alert for one reading, against the person's norm, with population safety limits on top. */
export function judge(userId, metric, value) {
  if (!validValue(metric, value)) return { status: 'invalid', why: 'looks like a sensor gap, not a real reading' };
  const pop = evaluate(metric, value, null, null).status;
  const n = normOf(userId, metric), dir = WATCHED[metric] ?? 'both';
  if (pop === 'red' && ['spo2', 'rhr'].includes(metric)) return { status: 'alert', why: 'outside the safe population range' };
  if (!n) return { status: pop === 'red' ? 'watch' : 'good', why: 'no personal norm learned yet', norm: null };
  const below = n.low != null && value < n.low, above = n.high != null && value > n.high;
  const bad = (dir === 'low' && below) || (dir === 'high' && above) || (dir === 'both' && (below || above));
  if (!bad) return { status: 'good', why: `inside this person's normal (${n.low ?? '…'}–${n.high ?? '…'}, set by ${n.source})`, norm: n };
  const sd = n.sd ?? (Math.abs((n.high ?? n.low) - (n.mean ?? 0)) / 1.5 || 1);
  const away = below ? (n.low - value) : (value - n.high);
  return { status: away > 1.5 * (n.sd ?? sd) ? 'alert' : 'watch', why: `${below ? 'below' : 'above'} this person's normal (${n.low ?? '…'}–${n.high ?? '…'}, set by ${n.source})`, norm: n };
}

function latestReadings(userId) {
  const out = {};
  const last = db.prepare('SELECT value, unit, source, recorded_at FROM measurements WHERE user_id = ? AND metric = ? ORDER BY recorded_at DESC LIMIT 6');
  for (const metric of Object.keys(WATCHED)) {
    const row = last.all(userId, metric).find(r => validValue(metric, r.value));
    if (!row) continue;
    out[metric] = { value: r1(row.value), unit: row.unit, source: /whoop/i.test(row.source) ? 'WHOOP' : row.source === 'manual' ? 'entered by hand' : row.source, hoursAgo: Math.max(0, Math.round((Date.now() - ms(row.recorded_at)) / 36e5)), ...judge(userId, metric, row.value) };
    delete out[metric].norm;
  }
  return out;
}

/** The whole per-astronaut dataset the assistant must check before it suggests or changes anything. */
export function datasetFor(userId) {
  const u = db.prepare('SELECT name, dob, mission, mission_years, height_cm, weight_kg FROM users WHERE id = ?').get(userId);
  const b = readBackground(userId) ?? {};
  const noteRow = n => ({ doctor: n.doctor, writtenAt: n.created_at, validUntil: n.valid_until ?? 'until the doctor removes it', daysLeft: n.valid_until ? Math.max(0, Math.round((Date.parse(n.valid_until + 'T23:59:59Z') - Date.now()) / 864e5)) : null, text: str(n.text, 500) });
  const noteSql = 'SELECT n.text, n.created_at, n.valid_until, d.name AS doctor FROM doctor_notes n LEFT JOIN users d ON d.id = n.by_user WHERE n.user_id = ?';
  const notes = db.prepare(noteSql + " AND (n.valid_until IS NULL OR n.valid_until >= date('now')) ORDER BY n.id DESC LIMIT 25").all(userId).map(noteRow);
  const earlierNotes = db.prepare(noteSql + " AND n.valid_until < date('now') ORDER BY n.id DESC LIMIT 3").all(userId).map(n => ({ ...noteRow(n), expired: true, text: str(n.text, 160) }));
  const norms = {}; for (const m of Object.keys(WATCHED)) { const n = normOf(userId, m); if (n) norms[m] = n; }
  const ov = db.prepare('SELECT data FROM plan_overrides WHERE user_id = ?').get(userId);
  let plan = null; try { plan = ov ? JSON.parse(ov.data) : null; } catch {}
  const last = db.prepare('SELECT at, level, summary FROM ai_analyses WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const adj = db.prepare("SELECT id, day, kind, title, status, by FROM plan_adjustments WHERE user_id = ? AND status IN ('applied','proposed') AND (day IS NULL OR day >= date('now','-1 day')) ORDER BY day LIMIT 12").all(userId);
  const checks = db.prepare('SELECT symptoms, note, recorded_at FROM checkins WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 3').all(userId).map(c => { let s = []; try { s = JSON.parse(c.symptoms); } catch {} return { at: c.recorded_at, symptoms: s, note: c.note ? str(c.note, 120) : null }; });
  // Order matters: the prompt is cut at a size limit, so what the doctor decided comes FIRST and can never be the part that is lost.
  return {
    doctorNotes: notes,
    doctorPlan: plan ? { intensity: plan.intensity ?? null, message: plan.message ?? null, resistancePerWeek: plan.resistancePerWeek ?? null, zone2Minutes: plan.zone2Minutes ?? null, week: plan.week ?? null, tasks: (plan.tasks ?? []).map(t => t.title) } : null,
    norms,
    planChanges: adj,
    person: { isAdmin: !!isAdminUser(db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId) ?? {}), name: u?.name, mission: u?.mission, missionYears: u?.mission_years, heightCm: u?.height_cm, weightKg: u?.weight_kg },
    healthFile: { allergies: b.allergies || null, medications: b.medications || null, conditions: (b.conditions ?? []).map(c => `${c.name}${c.notes ? ` (${c.notes})` : ''}`), shared: !!b.sharedConsent },
    earlierNotes,
    readings: latestReadings(userId), lastAnalysis: last ?? null, recentCheckins: checks,
  };
}

/** One analysis pass for one astronaut: deterministic verdict + a short written summary when the model is available. */
export async function analyzeUser(userId) {
  learnNorms(userId);
  const ds = datasetFor(userId);
  const flags = Object.entries(ds.readings).filter(([, r]) => r.status === 'watch' || r.status === 'alert').map(([metric, r]) => ({ metric, value: r.value, unit: r.unit, status: r.status, why: r.why, source: r.source }));
  const sym = ds.recentCheckins[0]?.symptoms ?? [];
  const level = flags.some(f => f.status === 'alert') ? 'alert' : flags.length || sym.length ? 'watch' : (Object.keys(ds.readings).length ? 'ok' : 'nodata');
  let summary = level === 'nodata' ? 'No readings yet. Connect WHOOP or enter your numbers by hand.'
    : level === 'ok' ? 'All your recent readings are inside your normal range.'
      : `${flags.map(f => `${METRICS[f.metric]?.label ?? f.metric} ${f.value} ${f.unit} (${f.why})`).join('; ')}${sym.length ? `; symptoms: ${sym.join(', ')}` : ''}.`;
  if (level !== 'nodata' && companionConfigured()) {
    try {
      const out = await askModel('You are the Celeste SI analysing one astronaut every 30 minutes. Use ONLY the dataset. Doctor notes and doctor-set norms win over learned norms. In 2 short sentences say whether the readings are good or not for THIS person and the one safest next step. No diagnosis, no invented numbers.', `DATASET\n${JSON.stringify({ level, flags, ...ds }).slice(0, 8000)}`, 220);
      if (out.text && !out.refused) summary = out.text.replace(/\s+/g, ' ').slice(0, 500);
    } catch { /* keep the deterministic summary */ }
  }
  db.prepare('INSERT INTO ai_analyses (user_id, level, summary, flags) VALUES (?,?,?,?)').run(userId, level, summary, JSON.stringify(flags));
  db.prepare('DELETE FROM ai_analyses WHERE user_id = ? AND id NOT IN (SELECT id FROM ai_analyses WHERE user_id = ? ORDER BY id DESC LIMIT 100)').run(userId, userId);
  if (level === 'alert') { // doctors must see it: one report per day
    db.prepare(`INSERT INTO handoffs (user_id, id, title, reason, lines, queued_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id, id) DO NOTHING`)
      .run(userId, `si-${today()}`, 'SI alert: readings outside normal', 'Automatic 30-minute analysis', JSON.stringify([{ h: 'Flags', t: flags.map(f => `${f.metric} ${f.value} ${f.unit}: ${f.why}`).join('\n').slice(0, 1100) }, { h: 'Summary', t: summary.slice(0, 600) }]), Date.now());
  }
  return { level, summary, flags };
}

let timer = null;
/** Every 30 minutes: analyse everybody who has recent readings. */
export function startBrain(everyMs = 30 * 60e3) {
  if (timer) return;
  const run = async () => {
    for (const r of db.prepare("SELECT DISTINCT user_id FROM measurements WHERE recorded_at >= datetime('now','-3 days')").all()) {
      try { await analyzeUser(r.user_id); } catch (e) { console.error('[brain] analysis failed', r.user_id, String(e.message).slice(0, 80)); }
    }
  };
  timer = setInterval(run, everyMs); timer.unref?.(); setTimeout(run, 90e3).unref?.();
}

// ---- proposals the SI may make (the person confirms before anything changes) -------------------------------------------------------
const KINDS = new Set(['day_off', 'lighter_day', 'schedule', 'norm']);
const DAY = /^\d{4}-\d{2}-\d{2}$/, HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function extractProposals(text) {
  const m = /<proposals>([\s\S]*?)<\/proposals>/i.exec(String(text || ''));
  let list = []; if (m) { try { const j = JSON.parse(m[1]); list = Array.isArray(j) ? j : []; } catch {} }
  return { text: String(text || '').replace(/<proposals>[\s\S]*?<\/proposals>/gi, '').trim(), list: list.slice(0, 8) };
}
/** Verifies each proposal against the dataset, stores the good ones as 'proposed'. */
export function storeProposals(userId, list, { userAsked = false } = {}) {
  const ds = datasetFor(userId), la = ds.lastAnalysis, first = today(), limit = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const out = [];
  for (const p of list.filter(x => !['log', 'profile'].includes(x?.type)).slice(0, 2)) {
    const kind = String(p?.type || '');
    if (!KINDS.has(kind)) continue;
    const day = kind === 'norm' ? null : String(p?.day || '');
    if (kind !== 'norm' && (!DAY.test(day) || day < first || day > limit)) continue;
    const reason = str(p?.reason, 240);
    let title, detail = reason, needsDoctor = false;
    if (kind === 'schedule') {
      if (!HHMM.test(String(p?.time || ''))) continue;
      const minutes = Math.min(240, Math.max(10, Math.round(Number(p?.minutes) || 30)));
      title = `${str(p?.title, 60) || 'Session'} · ${p.time} · ${minutes} min`;
      if (db.prepare("SELECT 1 FROM plan_adjustments WHERE user_id = ? AND day = ? AND kind = 'schedule' AND status = 'applied' AND title LIKE ?").get(userId, day, `%· ${p.time} ·%`)) continue; // that slot is taken
    } else if (kind === 'norm') {
      const metric = String(p?.metric || ''); if (!WATCHED[metric]) continue;
      const low = p?.low == null ? null : Number(p.low), high = p?.high == null ? null : Number(p.high);
      if ((low != null && !Number.isFinite(low)) || (high != null && !Number.isFinite(high)) || (low == null && high == null)) continue;
      title = `Normal ${METRICS[metric]?.label ?? metric}: ${low ?? '…'}–${high ?? '…'}`; detail = JSON.stringify({ metric, low, high, reason }); needsDoctor = true; // only a doctor can change a norm
    } else {
      // resting is only proposed when the data supports it or the person asked
      if (!userAsked && !(la && la.level !== 'ok' && la.level !== 'nodata')) continue;
      title = kind === 'day_off' ? 'Day off' : 'Lighter day';
      if (ds.doctorPlan?.intensity === 'push') { needsDoctor = true; detail = `${reason} (the doctor's plan says push: needs doctor approval)`; }
    }
    const id = db.prepare("INSERT INTO plan_adjustments (user_id, day, kind, title, detail, status, by) VALUES (?,?,?,?,?, 'proposed', 'si')").run(userId, day, kind, title, detail).lastInsertRowid;
    out.push({ id: Number(id), kind, day, title, detail: kind === 'norm' ? reason : detail, needsDoctor });
  }
  return out;
}

export function mountBrain(app) {
  // ---- the astronaut ----
  app.get('/api/me/brain', requireAuth, (req, res) => {
    const id = req.user.id;
    const a = db.prepare('SELECT at, level, summary, flags FROM ai_analyses WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(id);
    const adj = db.prepare("SELECT id, day, kind, title, detail, status, by FROM plan_adjustments WHERE user_id = ? AND status IN ('applied','proposed') AND kind != 'norm' AND (day IS NULL OR day >= date('now')) ORDER BY day, id LIMIT 20").all(id);
    const norms = Object.entries(datasetFor(id).norms).map(([metric, n]) => ({ metric, label: METRICS[metric]?.label ?? metric, unit: METRICS[metric]?.unit ?? '', ...n }));
    res.json({ analysis: a ? { ...a, flags: JSON.parse(a.flags) } : null, adjustments: adj, norms });
  });
  app.post('/api/me/analyze', requireAuth, async (req, res) => {
    try { res.json(await analyzeUser(req.user.id)); } catch { bad(res, 'Analysis failed.', 502); }
  });
  app.post('/api/me/adjustments/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM plan_adjustments WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!row || row.kind === 'norm') return bad(res, 'Not found.', 404);
    if (row.status !== 'proposed') return bad(res, 'Already decided.', 409);
    const apply = req.body?.action === 'apply';
    if (apply && row.kind === 'log') { try { const l = JSON.parse(row.detail); db.prepare("INSERT INTO measurements (user_id, metric, value, value2, unit, source, recorded_at) VALUES (?,?,?,?,?, 'manual', datetime('now'))").run(row.user_id, l.metric, l.value, l.value2 ?? null, METRICS[l.metric]?.unit ?? ''); } catch { return bad(res, 'Bad entry.'); } }
    if (apply && /needs doctor approval/.test(row.detail)) return bad(res, 'The doctor has to approve this one.', 403);
    db.prepare("UPDATE plan_adjustments SET status = ?, decided_at = datetime('now') WHERE id = ?").run(apply ? 'applied' : 'dismissed', row.id);
    res.json({ ok: true, status: apply ? 'applied' : 'dismissed' });
  });

  // ---- the doctor ----
  const known = id => db.prepare("SELECT id FROM users WHERE id = ? AND role IN ('astronaut','analog')").get(Number(id));
  app.get('/api/admin/crew/:id/brain', requireAdmin, (req, res) => {
    if (!known(req.params.id)) return bad(res, 'Not found.', 404);
    const id = Number(req.params.id), ds = datasetFor(id);
    const analyses = db.prepare('SELECT at, level, summary, flags FROM ai_analyses WHERE user_id = ? ORDER BY id DESC LIMIT 8').all(id).map(a => ({ ...a, flags: JSON.parse(a.flags) }));
    const norms = Object.keys(WATCHED).map(m => ({ metric: m, label: METRICS[m]?.label ?? m, unit: METRICS[m]?.unit ?? '', learned: db.prepare('SELECT mean, sd, n, low, high FROM learned_norms WHERE user_id = ? AND metric = ?').get(id, m) ?? null, doctor: db.prepare('SELECT low, high, note FROM doctor_norms WHERE user_id = ? AND metric = ?').get(id, m) ?? null }));
    const adjustments = db.prepare('SELECT id, day, kind, title, detail, status, by, created_at AS at FROM plan_adjustments WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(id);
    res.json({ dataset: ds, analyses, norms, notes: db.prepare(`SELECT n.id, n.text, n.created_at AS at, n.valid_until AS validUntil, (n.valid_until IS NULL OR n.valid_until >= date('now')) AS active, d.name AS doctor FROM doctor_notes n LEFT JOIN users d ON d.id = n.by_user WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 30`).all(id), adjustments });
  });
  app.put('/api/admin/crew/:id/norms/:metric', requireAdmin, (req, res) => {
    if (!known(req.params.id) || !WATCHED[req.params.metric]) return bad(res, 'Not found.', 404);
    const low = req.body?.low === '' || req.body?.low == null ? null : Number(req.body.low), high = req.body?.high === '' || req.body?.high == null ? null : Number(req.body.high);
    if ((low != null && !Number.isFinite(low)) || (high != null && !Number.isFinite(high)) || (low == null && high == null)) return bad(res, 'Enter a low and/or a high value.');
    if (low != null && high != null && low >= high) return bad(res, 'Low must be below high.');
    db.prepare(`INSERT INTO doctor_norms (user_id, metric, low, high, note, by_user, updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id, metric) DO UPDATE SET low = excluded.low, high = excluded.high, note = excluded.note, by_user = excluded.by_user, updated_at = excluded.updated_at`).run(Number(req.params.id), req.params.metric, low, high, str(req.body?.note, 200) || null, req.user.id);
    res.json({ ok: true });
  });
  app.delete('/api/admin/crew/:id/norms/:metric', requireAdmin, (req, res) => { db.prepare('DELETE FROM doctor_norms WHERE user_id = ? AND metric = ?').run(Number(req.params.id), req.params.metric); res.json({ ok: true }); });
  app.post('/api/admin/crew/:id/doctor-notes', requireAdmin, (req, res) => {
    if (!known(req.params.id)) return bad(res, 'Not found.', 404);
    const text = str(req.body?.text, 600); if (text.length < 2) return bad(res, 'Write a note.');
    const days = req.body?.days == null || req.body.days === '' ? null : Math.round(Number(req.body.days)); // how long the note is in force: null = until the doctor removes it
    if (days != null && !(days >= 1 && days <= 365)) return bad(res, 'Choose 1 to 365 days, or no end date.');
    db.prepare("INSERT INTO doctor_notes (user_id, by_user, text, valid_until) VALUES (?,?,?, CASE WHEN ? IS NULL THEN NULL ELSE date('now', '+' || ? || ' days') END)").run(Number(req.params.id), req.user.id, text, days, days);
    res.json({ ok: true });
  });
  app.delete('/api/admin/doctor-notes/:nid', requireAdmin, (req, res) => { db.prepare('DELETE FROM doctor_notes WHERE id = ?').run(Number(req.params.nid)); res.json({ ok: true }); });
  // a doctor can schedule a day off / lighter day directly, or approve what the SI proposed (including norm changes)
  app.post('/api/admin/crew/:id/adjustments', requireAdmin, (req, res) => {
    if (!known(req.params.id)) return bad(res, 'Not found.', 404);
    const kind = req.body?.kind, day = String(req.body?.day || '');
    if (!['day_off', 'lighter_day'].includes(kind) || !DAY.test(day)) return bad(res, 'Choose day_off or lighter_day and a date.');
    const id = db.prepare("INSERT INTO plan_adjustments (user_id, day, kind, title, detail, status, by, decided_at) VALUES (?,?,?,?,?, 'applied', 'doctor', datetime('now'))").run(Number(req.params.id), day, kind, kind === 'day_off' ? 'Day off' : 'Lighter day', str(req.body?.reason, 240)).lastInsertRowid;
    res.json({ ok: true, id: Number(id) });
  });
  app.post('/api/admin/adjustments/:aid', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM plan_adjustments WHERE id = ?').get(Number(req.params.aid));
    if (!row) return bad(res, 'Not found.', 404);
    if (row.status !== 'proposed') return bad(res, 'Already decided.', 409);
    const apply = req.body?.action === 'apply';
    if (apply && row.kind === 'norm') { try { const n = JSON.parse(row.detail); db.prepare(`INSERT INTO doctor_norms (user_id, metric, low, high, note, by_user, updated_at) VALUES (?,?,?,?,?,?,datetime('now')) ON CONFLICT(user_id, metric) DO UPDATE SET low = excluded.low, high = excluded.high, note = excluded.note, by_user = excluded.by_user, updated_at = excluded.updated_at`).run(row.user_id, n.metric, n.low, n.high, n.reason || 'approved from an SI proposal', req.user.id); } catch { return bad(res, 'Bad proposal.'); } }
    db.prepare("UPDATE plan_adjustments SET status = ?, decided_at = datetime('now') WHERE id = ?").run(apply ? 'applied' : 'dismissed', row.id);
    res.json({ ok: true });
  });
}

// ---- the person tells the SI a reading ("my radiation is 0.40, heart rate 72"): the SI records it ------------------------------
const LOGGABLE = { rhr: [25, 220], radiation: [0, 50], spo2: [50, 100], temp: [30, 43], glucose: [20, 600], weight: [25, 300], hrv: [1, 400], sleep: [0.5, 20], bp: [60, 260] };
const numbersIn = t => (String(t).match(/\d+(?:[.,]\d+)?/g) ?? []).map(x => Number(x.replace(',', '.')));
/** Records readings the SI was given, but ONLY numbers the person actually wrote in their message (the model cannot invent a reading). */
export function applyLogs(actor, list, userText, { fileText = '', binaryFile = false } = {}) {
  const said = numbersIn(userText), fromFile = numbersIn(fileText), out = [], pending = [], denied = [];
  const ins = db.prepare("INSERT INTO measurements (user_id, metric, value, value2, unit, source, recorded_at) VALUES (?,?,?,?,?, 'manual', datetime('now'))");
  for (const p of list) {
    if (p?.type !== 'log') continue;
    const metric = String(p.metric || ''), range = LOGGABLE[metric];
    const value = Number(p.value), value2 = p.value2 == null ? null : Number(p.value2);
    if (!range || !Number.isFinite(value) || value < range[0] || value > range[1]) continue;
    if (metric === 'bp' && !(Number.isFinite(value2) && value2 >= 30 && value2 <= 160)) continue;
    const t = resolveTarget(actor, p.for);
    if (t.denied) { denied.push('another astronaut'); continue; }
    if (t.missing) continue;
    const userId = t.id, has = (arr, n) => arr.some(x => Math.abs(x - n) < 1e-9);
    const ok = (arr) => has(arr, value) && (metric !== 'bp' || has(arr, value2));
    if (!ok([...said, ...fromFile])) {
      if (binaryFile && userId === actor.id) { // a number read from a PDF / photo cannot be checked here: the person confirms it first
        const label = METRICS[metric]?.label ?? metric;
        const id = db.prepare("INSERT INTO plan_adjustments (user_id, day, kind, title, detail, status, by) VALUES (?,NULL,'log',?,?, 'proposed', 'si')").run(userId, `Record ${label}: ${value}${metric === 'bp' ? '/' + value2 : ''} ${METRICS[metric]?.unit ?? ''}`.trim(), JSON.stringify({ metric, value, value2: metric === 'bp' ? value2 : null })).lastInsertRowid;
        pending.push({ id: Number(id), kind: 'log', day: null, title: `Record ${label}: ${value}${metric === 'bp' ? '/' + value2 : ''} ${METRICS[metric]?.unit ?? ''}`.trim(), detail: 'Read from your file. Check it, then apply.' });
      }
      continue;
    }
    ins.run(userId, metric, value, metric === 'bp' ? value2 : null, METRICS[metric]?.unit ?? '');
    out.push({ metric, value, value2: metric === 'bp' ? value2 : null, unit: METRICS[metric]?.unit ?? '', label: METRICS[metric]?.label ?? metric });
  }
  return Object.assign(out, { pending, denied });
}

// ---- who the SI may change data for --------------------------------------------------------------------------------------------------
/** The SI acts for the signed-in person only. Only a doctor / team leader (admin) may name another astronaut. */
export function resolveTarget(actor, forName) {
  const name = String(forName || '').trim();
  if (!name || name.toLowerCase() === String(actor.name).toLowerCase()) return { id: actor.id };
  if (!isAdminUser(actor)) return { denied: true };
  const rows = db.prepare("SELECT id, name FROM users WHERE role IN ('astronaut','analog') AND lower(name) = lower(?)").all(name);
  if (rows.length === 1) return { id: rows[0].id, name: rows[0].name };
  return { missing: true };
}
import { isAdmin as isAdminUser } from './roles.js';

const FIELD = { allergies: 500, medications: 500 };
/** Adds allergies / medications / a health condition to a health file. Returns what changed. */
export function applyProfile(actor, list, { userAsked = false } = {}) {
  const done = [], denied = [];
  for (const p of list) {
    if (p?.type !== 'profile') continue;
    const field = String(p.field || ''), text = str(p.text, 160);
    if (!text || !(field in FIELD || field === 'condition')) continue;
    const t = resolveTarget(actor, p.for);
    if (t.denied) { denied.push('another astronaut'); continue; }
    if (t.missing) continue;
    if (!userAsked && t.id === actor.id) continue; // the person has to ask for it
    const row = db.prepare('SELECT data FROM backgrounds WHERE user_id = ?').get(t.id);
    const b = row ? JSON.parse(row.data) : { cvText: '', characteristics: '', allergies: '', medications: '', conditions: [], sharedConsent: false };
    if (field === 'condition') { if (!(b.conditions ?? []).some(c => c.name.toLowerCase() === text.toLowerCase())) b.conditions = [...(b.conditions ?? []), { name: text.slice(0, 80), notes: str(p.notes, 200) }].slice(0, 20); else continue; }
    else { const cur = String(b[field] || ''); if (cur.toLowerCase().includes(text.toLowerCase())) continue; b[field] = (cur ? `${cur}; ${text}` : text).slice(0, FIELD[field]); }
    db.prepare("INSERT INTO backgrounds (user_id, data, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(t.id, JSON.stringify(b));
    done.push({ field, text, for: t.id === actor.id ? 'you' : t.name });
  }
  return { done, denied };
}

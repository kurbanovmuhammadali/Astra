import { db } from '../db.js';
import { METRICS, SYSTEMS, SYMPTOMS, DEFAULT_MISSION_PLAN } from './catalog.js';
import { analyzeMetric, baselineFrom, driftNote, evaluate as evaluateStatic, DAY } from './analysis.js';

const RANK = { green: 0, amber: 1, red: 2, none: -1 };
const worst = list => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'none');
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
export const today = () => new Date().toISOString().slice(0, 10);
export const parseTs = s => new Date(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z'));
export const toSql = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');

const loadPoints = (userId, metric, asOfMs) =>
  db.prepare('SELECT recorded_at t, value v, value2 v2 FROM measurements WHERE user_id = ? AND metric = ? AND recorded_at <= ? ORDER BY recorded_at')
    .all(userId, metric, toSql(new Date(asOfMs))).map(r => ({ t: parseTs(r.t).getTime(), v: r.v, v2: r.v2 }));

/** Fixed personal baseline: median of the first 14 days of data (see analysis.js). */
export function baselineOf(userId, metric, asOfMs = Date.now()) {
  const b = baselineFrom(loadPoints(userId, metric, asOfMs));
  return b ? { value: b.value, value2: b.value2 } : null;
}

export const evaluate = evaluateStatic;

export function series(userId, metric, days = 30, asOfMs = Date.now()) {
  return db.prepare(`SELECT date(recorded_at) day, AVG(value) value, AVG(value2) value2 FROM measurements
    WHERE user_id = ? AND metric = ? AND recorded_at > ? AND recorded_at <= ? GROUP BY day ORDER BY day`)
    .all(userId, metric, toSql(new Date(asOfMs - days * DAY)), toSql(new Date(asOfMs))).map(r => ({ day: r.day, value: round(r.value), value2: round(r.value2) }));
}

export function metricSnapshot(userId, key, asOfMs = Date.now()) {
  const m = METRICS[key];
  const pts = loadPoints(userId, key, asOfMs);
  const a = analyzeMetric(key, pts, asOfMs);
  const last = a.last, base = a.base;
  const spark = series(userId, key, 7, asOfMs).map(p => p.value);
  const ageH = last ? (asOfMs - last.t) / 36e5 : null;
  const row = last ? db.prepare('SELECT source FROM measurements WHERE user_id = ? AND metric = ? AND recorded_at = ? LIMIT 1').get(userId, key, toSql(new Date(last.t))) : null;
  return {
    key, label: m.label, unit: m.unit, system: m.system,
    value: last ? round(last.v) : null, value2: last?.v2 != null ? round(last.v2) : null,
    status: a.status, thresholdStatus: a.thresholdStatus, early: a.early,
    drift: a.drift, driftNote: a.early ? driftNote(m.label, m.unit, a.drift) : null,
    confidence: a.confidence,
    deviation: a.deviation ?? (base?.value && last ? round(((last.v - base.value) / base.value) * 100) : null),
    baseline: base ? round(base.value) : null,
    recordedAt: last ? toSql(new Date(last.t)) : null, stale: ageH != null && ageH > 72, source: row?.source ?? null, spark,
  };
}

export function latestCheckin(userId, asOfMs = Date.now()) {
  const c = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1').get(userId, toSql(new Date(asOfMs)));
  if (!c) return null;
  return { ...c, symptoms: JSON.parse(c.symptoms) };
}

export function systemsFor(userId, snaps, checkin, asOfMs = Date.now()) {
  const recentSymptoms = checkin && (asOfMs - parseTs(checkin.recorded_at).getTime()) < 48 * 36e5 ? checkin.symptoms : [];
  return Object.entries(SYSTEMS).map(([key, s]) => {
    const parts = s.metrics.map(k => snaps[k]).filter(x => x && x.status !== 'none');
    const reasons = parts.filter(p => p.status !== 'green').map(p => ({ metric: p.key, label: p.label, status: p.status, early: p.early, note: p.driftNote }));
    const sym = recentSymptoms.filter(k => SYMPTOMS[k]?.system === key);
    sym.forEach(k => reasons.push({ symptom: k, label: SYMPTOMS[k].label, status: SYMPTOMS[k].severity }));
    const status = worst([...parts.map(p => p.status), ...sym.map(k => SYMPTOMS[k].severity)]);
    return { key, label: s.label, hazard: s.hazard, blurb: s.blurb, status: status === 'none' ? 'green' : status, reasons, metrics: s.metrics };
  });
}

export function readiness(snaps, systems) {
  const pts = { green: 100, amber: 62, red: 25 };
  const rec = snaps.recovery?.value ?? 60;
  const sleep = Math.min(100, ((snaps.sleep?.value ?? 7) / 8) * 100);
  const mood = snaps.mood?.value ?? 65;
  const sys = systems.reduce((a, s) => a + pts[s.status], 0) / systems.length;
  return Math.round(rec * 0.35 + sleep * 0.2 + mood * 0.15 + sys * 0.3);
}

export function gamification(userId) {
  const xp = db.prepare('SELECT COALESCE(SUM(xp),0) xp FROM task_completions WHERE user_id = ?').get(userId).xp;
  const days = new Set(db.prepare(`SELECT DISTINCT date(recorded_at) d FROM checkins WHERE user_id = ? AND recorded_at >= datetime('now','-60 days')`).all(userId).map(r => r.d));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1); // today not done yet keeps streak alive
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  const level = Math.floor(xp / 300) + 1;
  const badges = [
    { key: 'first-light', label: 'First light', earned: days.size > 0, hint: 'Complete your first check-in' },
    { key: 'orbit-7', label: '7-day orbit', earned: streak >= 7, hint: '7-day check-in streak' },
    { key: 'bone-guard', label: 'Bone guardian', earned: db.prepare(`SELECT COUNT(*) n FROM task_completions WHERE user_id = ? AND task_key LIKE 'adapt-bone%'`).get(userId).n > 0, hint: 'Complete an adaptive bone task' },
    { key: 'commander', label: 'Commander', earned: level >= 5, hint: 'Reach level 5' },
  ];
  return { xp, level, levelProgress: (xp % 300) / 300, nextLevelXp: 300 - (xp % 300), streak, badges };
}

export function dashboard(userId, asOfMs = Date.now()) {
  const snaps = Object.fromEntries(Object.keys(METRICS).map(k => [k, metricSnapshot(userId, k, asOfMs)]));
  const checkin = latestCheckin(userId, asOfMs);
  const systems = systemsFor(userId, snaps, checkin, asOfMs);
  const alerts = [];
  for (const s of Object.values(snaps)) {
    if (s.status !== 'red' || s.stale) continue;
    if (METRICS[s.key].clinical) alerts.push({ level: 'red', metric: s.key, title: `${s.label} out of range`, body: escalationText(s), escalate: true });
    else alerts.push({ level: 'amber', metric: s.key, title: `${s.label} below target`, body: `Latest ${s.value}${s.unit ? ' ' + s.unit : ''}. Your plan has been adapted — see the Plan tab.` });
  }
  for (const k of checkin?.symptoms ?? []) if (SYMPTOMS[k]?.severity === 'red' && (asOfMs - parseTs(checkin.recorded_at).getTime()) < 48 * 36e5) alerts.push({ level: 'red', title: SYMPTOMS[k].label, body: 'Reported in your check-in. Contact the flight surgeon at the next opportunity.', escalate: true });
  for (const s of systems) if (s.status === 'amber' && !alerts.some(a => s.metrics.includes(a.metric))) {
    const allEarly = s.reasons.length > 0 && s.reasons.every(r => r.early);
    alerts.push({
      level: 'amber', system: s.key, early: allEarly,
      title: allEarly ? `${s.label}: early warning` : `${s.label}: watch`,
      body: [
        ...s.reasons.filter(r => r.early).map(r => r.note),
        ...(s.reasons.some(r => !r.early) ? [`${s.reasons.filter(r => !r.early).map(r => r.label).join(', ')} ${s.reasons.filter(r => !r.early).length > 1 ? 'are' : 'is'} outside your normal range or trending away from your baseline.`] : []),
      ].join(' '),
    });
  }
  return {
    readiness: readiness(snaps, systems),
    metrics: snaps, systems, alerts, checkin,
    checkedInToday: checkin?.recorded_at?.slice(0, 10) === new Date(asOfMs).toISOString().slice(0, 10),
    asOf: new Date(asOfMs).toISOString(),
    game: gamification(userId),
  };
}

function escalationText(s) {
  const v = s.value2 != null ? `${s.value}/${s.value2}` : s.value;
  return `Latest ${v}${s.unit ? ' ' + s.unit : ''}. Re-measure following the instructions. If it stays in the red zone, contact the flight surgeon.`;
}

// ---------------------------------------------------------------- adaptive plan
export function missionPlan(userId) {
  const row = db.prepare('SELECT * FROM plans WHERE user_id = ?').get(userId);
  return row ? { source: row.source, items: JSON.parse(row.items), updatedAt: row.updated_at } : { source: 'Default ISS crew template', items: DEFAULT_MISSION_PLAN, updatedAt: null };
}

/**
 * Builds today's plan: the mission plan is kept untouched; the engine ADDS or MODIFIES with an
 * explicit reason. Anything outside the crew protocol is marked `needsApproval` (flight surgeon).
 * Each adaptation lists the evidence (reference ids from references.js) behind it.
 */
export function adaptivePlan(userId, day = today(), asOfMs = Date.now()) {
  const { items, source } = missionPlan(userId);
  const d = dashboard(userId, asOfMs);
  const m = d.metrics;
  const sys = Object.fromEntries(d.systems.map(s => [s.key, s]));
  const adaptations = [];
  const add = a => adaptations.push({ xp: 30, category: 'adaptive', ...a });

  if (sys.bones.status !== 'green') {
    const why = [m.ntx.status !== 'green' && `bone resorption marker ${m.ntx.deviation > 0 ? '+' : ''}${m.ntx.deviation ?? '?'} % vs baseline${m.ntx.early ? ' (sustained drift)' : ''}`, m.strain.status !== 'green' && `strain ${m.strain.value} below target`, m.exercise.status !== 'green' && `exercise ${m.exercise.value} min`].filter(Boolean);
    add({ key: 'adapt-bone-run', kind: 'add', baseKey: 'treadmill', title: '+1 km loaded treadmill', detail: 'Your plan says 1 km. Run one more — impact loading is what tells bones to rebuild.', reason: why.join(' · '), target: 1, unit: 'km', xp: 50, needsApproval: m.ntx.status === 'red', evidence: ['R4', 'R3'] });
    add({ key: 'adapt-bone-heel', kind: 'add', baseKey: 'ared', title: '+10 min heel raises & squats', detail: 'Extra loaded set on ARED targeting hip & spine.', reason: why.join(' · '), target: 10, unit: 'min', xp: 40, evidence: ['R4'] });
  }
  if (m.recovery.status === 'red') {
    add({ key: 'adapt-recovery', kind: 'modify', baseKey: 'cevis', title: 'Keep CEVIS in zone 2 only', detail: 'Same 30 min, lower intensity. Volume stays, intensity drops.', reason: `Recovery ${m.recovery.value} % — body is under-recovered`, xp: 20 });
  }
  if (sys.brain.status !== 'green') {
    if (m.sleep.status !== 'green') add({ key: 'adapt-sleep', kind: 'add', baseKey: 'sleep', title: 'Light hygiene from 21:30', detail: 'Dim station lights, no screens, eye mask on. Optional 20-min nap before 15:00.', reason: `Sleep ${m.sleep.value} h (goal 7+)${m.sleep.early ? ' — sustained decline vs your baseline' : ''}`, xp: 30, evidence: ['R5'] });
    if (m.mood.status !== 'green' || m.hrv.status !== 'green') add({ key: 'adapt-mind', kind: 'add', title: '10-min breathing + call home', detail: 'Box breathing 4-4-4-4, then a family or crew-support conference.', reason: [m.mood.status !== 'green' && `mood ${m.mood.value}`, m.hrv.status !== 'green' && `HRV ${m.hrv.deviation} % vs baseline`].filter(Boolean).join(' · '), xp: 30, evidence: ['R1'] });
  }
  if (m.bp.status !== 'green') add({ key: 'adapt-bp', kind: 'add', baseKey: 'bp', title: 'Re-check blood pressure tonight', detail: m.bp.status === 'red' ? 'If still ≥ 140/90, send the report to the flight surgeon.' : 'Reduce added salt today, re-measure seated.', reason: `BP ${m.bp.value}/${m.bp.value2}`, needsApproval: m.bp.status === 'red', escalate: m.bp.status === 'red', xp: 20, evidence: ['R11'] });
  if (m.glucose.status !== 'green') add({ key: 'adapt-glucose', kind: 'add', title: '15-min walk after meals', detail: 'Light activity after eating lowers glucose spikes. Swap one sweet pouch for protein.', reason: `Glucose ${m.glucose.value} mg/dL`, xp: 20 });
  if (m.weight.status !== 'green') add({ key: 'adapt-weight', kind: 'add', title: 'Add a 400 kcal snack', detail: 'Body mass is dropping — eat the full menu plus one extra protein snack.', reason: `Mass ${m.weight.deviation} % vs baseline${m.weight.early ? ' (sustained drift, before the 3 % limit)' : ''}`, xp: 20, evidence: ['R10'] });
  if (m.vitd.status !== 'green') add({ key: 'adapt-vitd', kind: 'escalate', baseKey: 'vitd', title: 'Ask surgeon about vitamin D dose', detail: 'Lab value is low; dosage changes need flight surgeon approval.', reason: `Vitamin D ${m.vitd.value} ng/mL`, needsApproval: true, escalate: true, xp: 10, evidence: ['R12'] });
  if (m.co2.status !== 'green' || (d.checkin?.symptoms ?? []).includes('headache')) add({ key: 'adapt-co2', kind: 'add', title: 'Check ventilation at sleep station', detail: 'Make sure the fan is on and nothing blocks airflow. Note headaches in the check-in.', reason: m.co2.status !== 'green' ? `CO₂ ${m.co2.value} mmHg` : 'headache reported', xp: 15, evidence: ['R6'] });
  if (m.radiation.status === 'red') add({ key: 'adapt-rad', kind: 'escalate', title: 'Move to shielded module', detail: 'Follow the solar particle event procedure and log your dosimeter.', reason: `Dose ${m.radiation.value} mSv today`, escalate: true, xp: 10, evidence: ['R8'] });

  const done = new Set(db.prepare('SELECT task_key FROM task_completions WHERE user_id = ? AND day = ?').all(userId, day).map(r => r.task_key));
  const base = items.map(i => ({ ...i, origin: 'mission', done: done.has(i.key), adaptations: adaptations.filter(a => a.baseKey === i.key).map(a => a.key) }));
  const adapt = adaptations.map(a => ({ ...a, origin: 'perigee', done: done.has(a.key) }));
  const all = [...base, ...adapt];
  return { day, source, items: base, adaptations: adapt, progress: all.length ? all.filter(t => t.done).length / all.length : 0, xpAvailable: all.reduce((s, t) => s + (t.done ? 0 : t.xp), 0), readiness: d.readiness, asOf: d.asOf };
}

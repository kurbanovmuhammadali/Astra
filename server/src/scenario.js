import { db, tx } from './db.js';
import { toSql } from './health/engine.js';
import { DAY } from './health/analysis.js';

/** Deterministic PRNG + normal sampler so the scenario (and its validation numbers) are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const SCENARIO = {
  key: 'mars-transit',
  title: 'Mars transit · day 120',
  days: 120,
  blurb: 'A scripted 120-day crew history with four hidden problems — slow bone loss, isolation fatigue, body-mass loss and a solar particle event. Scrub the timeline to watch Astra spot each one.',
};

/**
 * Hidden ground truth. `onset` = first day (0-based) the underlying physiology starts to change.
 * The validation harness measures how many days after onset Astra raises a flag, with and without drift detection.
 */
export const TRUTH = [
  { id: 'bone', label: 'Bone resorption rising', metric: 'ntx', system: 'bones', onset: 60, kind: 'slow drift' },
  { id: 'isolation-hrv', label: 'Autonomic stress (HRV falling)', metric: 'hrv', system: 'brain', onset: 75, kind: 'slow drift' },
  { id: 'isolation-sleep', label: 'Sleep shortening', metric: 'sleep', system: 'brain', onset: 75, kind: 'slow drift' },
  { id: 'isolation-mood', label: 'Mood declining', metric: 'mood', system: 'brain', onset: 75, kind: 'slow drift' },
  { id: 'mass', label: 'Body-mass loss', metric: 'weight', system: 'metabolism', onset: 70, kind: 'slow drift' },
  { id: 'spe', label: 'Solar particle event', metric: 'radiation', system: 'immune', onset: 96, kind: 'step' },
];

/**
 * @param {{seed?:number, days?:number, events?:boolean, endMs?:number}} o
 * @returns {{measurements:{metric:string,value:number,value2?:number|null,unit:string,t:number,d:number}[], checkins:{mood:number,energy:number,symptoms:string[],t:number,d:number}[]}}
 */
export function generateScenario({ seed = 11, days = SCENARIO.days, events = true, endMs = Date.now() } = {}) {
  const r = rng(seed * 7919 + 13);
  const g = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const ramp = (d, from, len) => (events ? Math.min(1, Math.max(0, (d - from) / len)) : 0);
  const out = [], checkins = [];
  let life = 0; // shared slow "life stress" factor (autocorrelated) so sleep/HRV/mood move together a little, like real people
  for (let d = 0; d < days; d++) {
    life = 0.5 * life + Math.sqrt(1 - 0.25) * g();
    const day0 = Date.UTC(0, 0, 1); void day0;
    const base = new Date(endMs); base.setUTCHours(6, 30, 0, 0);
    const dayStart = base.getTime() - (days - 1 - d) * DAY;
    const at = (h, m = 0) => dayStart + (h - 6) * 36e5 + (m - 30) * 6e4;
    const add = (metric, value, unit, t, value2 = null) => { if (t <= endMs) out.push({ metric, value, value2, unit, t, d }); };

    const iso = ramp(d, 75, 40);              // isolation fatigue builds over 40 days
    const sleep = 7.2 + 0.4 * (0.6 * life + 0.8 * g()) - 1.2 * iso;
    const hrv = 58 + 4.5 * (0.5 * life + 0.87 * g()) - 11 * iso;
    const rhr = 57 + 1.8 * g() + 4 * iso;
    const recovery = Math.max(8, Math.min(99, (hrv - 30) * 1.9 + (sleep - 5) * 6 + 4 * g()));
    add('sleep', +sleep.toFixed(2), 'h', at(6, 30));
    add('hrv', +hrv.toFixed(1), 'ms', at(6, 31));
    add('rhr', Math.round(rhr), 'bpm', at(6, 31));
    add('recovery', Math.round(recovery), '%', at(6, 32));
    add('spo2', +(96.8 + 0.5 * g()).toFixed(1), '%', at(6, 32));
    const missed = r() < 0.15 + 0.2 * iso;
    add('strain', +(missed ? 6.8 + 0.8 * g() : 12.5 + 1.5 * g()).toFixed(1), '', at(21));
    add('exercise', Math.round(missed ? 70 + 10 * g() : 140 + 12 * g()), 'min', at(21));
    if (d % 2 === 0) add('bp', Math.round(122 + 4 * g() + 5 * iso), 'mmHg', at(7), Math.round(78 + 3 * g() + 2 * iso));
    if (d % 3 === 0) add('glucose', Math.round(91 + 5 * g()), 'mg/dL', at(7, 10));
    add('temp', +(36.8 + 0.15 * g()).toFixed(1), '°C', at(7, 5));
    const massLoss = events ? Math.max(0, d - 70) * 0.05 : 0;
    if (d % 4 === 0) add('weight', +(78.4 + 0.2 * g() - massLoss).toFixed(1), 'kg', at(6, 45));
    const spe = events ? ({ 96: 3.1, 97: 4.4, 98: 2.3 })[d] : undefined;
    add('radiation', +(spe ?? 0.62 + 0.08 * g()).toFixed(2), 'mSv', at(23));
    add('co2', +(2.4 + 0.3 * g()).toFixed(1), 'mmHg', at(22));
    if (d % 7 === 0) add('ntx', +(34 + (events ? 34 * 0.0035 * Math.max(0, d - 60) : 0) + 0.8 * g()).toFixed(1), 'nmol/mmol', at(8));
    if (d % 30 === 0) add('vitd', Math.round(34 + 1.5 * g()), 'ng/mL', at(8, 10));

    const mood = Math.round(72 + 5 * (0.5 * life + 0.87 * g()) - 24 * iso);
    const symptoms = r() < 0.02 + 0.12 * iso ? ['insomnia'] : [];
    add('mood', mood, '/100', at(6, 40));
    if (at(6, 40) <= endMs) checkins.push({ mood, energy: Math.round(65 + 8 * g()), symptoms, t: at(6, 40), d });
  }
  return { measurements: out, checkins };
}

/** Writes the scenario into the DB, anchored so the last day is today. Tagged source='scenario' so it is always labelled synthetic. */
export function seedScenario(userId, opts = {}) {
  const { measurements, checkins } = generateScenario({ seed: 11 + (userId % 5), ...opts });
  const ins = db.prepare('INSERT OR IGNORE INTO measurements (user_id, metric, value, value2, unit, source, external_id, recorded_at) VALUES (?,?,?,?,?,?,?,?)');
  const chk = db.prepare('INSERT INTO checkins (user_id, mood, energy, symptoms, note, recorded_at) VALUES (?,?,?,?,?,?)');
  tx(() => {
    for (const m of measurements) ins.run(userId, m.metric, m.value, m.value2, m.unit, 'scenario', `scn-${m.metric}-${m.d}`, toSql(new Date(m.t)));
    for (const c of checkins) chk.run(userId, c.mood, c.energy, JSON.stringify(c.symptoms), null, toSql(new Date(c.t)));
    db.prepare(`INSERT INTO integrations (user_id, provider, status, last_sync, meta) VALUES (?, 'scenario', 'connected', datetime('now'), '{}')
      ON CONFLICT(user_id, provider) DO UPDATE SET status='connected', last_sync=datetime('now')`).run(userId);
  });
}

export function clearScenario(userId) {
  tx(() => {
    db.prepare(`DELETE FROM measurements WHERE user_id = ? AND source = 'scenario'`).run(userId);
    db.prepare(`DELETE FROM integrations WHERE user_id = ? AND provider = 'scenario'`).run(userId);
  });
}

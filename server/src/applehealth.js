import { db, tx } from './db.js';
import { METRICS } from './health/catalog.js';

/**
 * Apple Health / Apple Watch import.
 *
 * How the data gets here (be honest about what is and is not built):
 *  - BUILT: the Health app's "Export All Health Data" (export.xml). The web app reads that file IN THE BROWSER, keeps only the
 *    record types below for the last N days, and posts them as compact JSON to /api/integrations/apple-health/batch.
 *    Nothing else from the export ever leaves the device. `parseExportXml` below is the same extraction for tests / CLI.
 *  - NOT BUILT: live HealthKit sync from an iPhone app. It needs a native iOS build (EAS dev client + HealthKit entitlement,
 *    and a physical iPhone + Apple Watch to test). The /batch endpoint is the contract that app would use.
 *
 * Mapping (Apple type -> Astra metric, daily aggregate). Apple's HRV is SDNN, not the RMSSD some wearables report — Astra only
 * compares a person with their OWN baseline, so the unit difference does not matter, but do not mix sources for one person.
 */
export const APPLE_SOURCE = 'apple-health';
const DAY = 864e5;

const QUANTITY = {
  HKQuantityTypeIdentifierRestingHeartRate: { metric: 'rhr', agg: 'mean' },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: 'hrv', agg: 'mean' },
  HKQuantityTypeIdentifierOxygenSaturation: { metric: 'spo2', agg: 'mean', conv: v => (v <= 1 ? v * 100 : v) },
  HKQuantityTypeIdentifierBodyMass: { metric: 'weight', agg: 'last', conv: (v, u) => (/lb/i.test(u) ? v * 0.45359237 : /g$/.test(u) && !/kg/.test(u) ? v / 1000 : v) },
  HKQuantityTypeIdentifierBodyTemperature: { metric: 'temp', agg: 'mean', conv: (v, u) => (/degF|°F/i.test(u) ? (v - 32) * 5 / 9 : v) },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: 'exercise', agg: 'sum' },
  HKQuantityTypeIdentifierBloodPressureSystolic: { bp: 'sys' },
  HKQuantityTypeIdentifierBloodPressureDiastolic: { bp: 'dia' },
};
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';
const ASLEEP = /Asleep/; // Asleep, AsleepCore, AsleepDeep, AsleepREM, AsleepUnspecified  (InBed / Awake are not sleep)
export const WANTED_TYPES = [...Object.keys(QUANTITY), SLEEP_TYPE];

/** "2026-11-09 07:12:03 +0500" -> ms. Returns NaN if unparsable. */
export function parseAppleDate(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})?$/.exec(String(s).trim());
  if (m) return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? '00'}`);
  return Date.parse(String(s));
}
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
const attr = (tag, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(tag); return m ? m[1] : undefined; };

/** Extract only the wanted <Record .../> elements from export.xml text -> [{type, unit, start, end, value, source}] */
export function parseExportXml(xml, { sinceMs = 0 } = {}) {
  const out = [];
  const re = /<Record\s[^>]*?\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const type = attr(tag, 'type');
    if (!WANTED_TYPES.includes(type)) continue;
    const end = attr(tag, 'endDate'), start = attr(tag, 'startDate');
    if (parseAppleDate(end ?? start) < sinceMs) continue;
    out.push({ type, unit: attr(tag, 'unit'), start, end, value: attr(tag, 'value'), source: attr(tag, 'sourceName') });
  }
  return out;
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
function unionMinutes(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = [null, null];
  for (const [s, e] of iv) {
    if (cs === null) { cs = s; ce = e; } else if (s <= ce) ce = Math.max(ce, e); else { total += ce - cs; cs = s; ce = e; }
  }
  if (cs !== null) total += ce - cs;
  return total / 6e4;
}

/** Validate + aggregate raw records into daily Astra measurements. Pure (no DB). */
export function normalizeRecords(records, { days = 120, nowMs = Date.now() } = {}) {
  const since = nowMs - Math.min(400, Math.max(7, days)) * DAY;
  const daily = {};           // metric -> day -> values[]
  const bp = new Map();       // start -> {sys, dia}
  const sleep = {};           // day -> intervals
  let used = 0, skipped = 0;
  for (const r of records) {
    const spec = QUANTITY[r.type];
    const end = parseAppleDate(r.end ?? r.start), start = parseAppleDate(r.start ?? r.end);
    if (!Number.isFinite(end) || end < since || end > nowMs + 36e5) { skipped++; continue; }
    if (r.type === SLEEP_TYPE) {
      if (!ASLEEP.test(String(r.value)) || !(end > start) || end - start > 16 * 36e5) { skipped++; continue; }
      (sleep[dayOf(end)] ??= []).push([start, end]); used++; continue;
    }
    if (!spec) { skipped++; continue; }
    const v = Number(r.value);
    if (!Number.isFinite(v)) { skipped++; continue; }
    if (spec.bp) { const e = bp.get(r.start) ?? {}; e[spec.bp] = v; e.t = end; bp.set(r.start, e); used++; continue; }
    const value = spec.conv ? spec.conv(v, r.unit ?? '') : v;
    ((daily[spec.metric] ??= {})[dayOf(end)] ??= []).push({ v: value, t: end }); used++;
  }
  const rows = [];
  const push = (metric, day, value, value2 = null) => {
    const m = METRICS[metric];
    if (!m || !Number.isFinite(value)) return;
    rows.push({ metric, day, value: Math.round(value * 100) / 100, value2: value2 == null ? null : Math.round(value2 * 100) / 100, unit: m.unit });
  };
  for (const [metric, byDay] of Object.entries(daily)) {
    const agg = Object.values(QUANTITY).find(s => s.metric === metric).agg;
    for (const [day, list] of Object.entries(byDay)) {
      const vals = list.sort((a, b) => a.t - b.t).map(x => x.v);
      push(metric, day, agg === 'sum' ? vals.reduce((s, x) => s + x, 0) : agg === 'last' ? vals.at(-1) : mean(vals));
    }
  }
  const bpDay = {};
  for (const e of bp.values()) if (e.sys && e.dia) (bpDay[dayOf(e.t)] ??= []).push(e);
  for (const [day, list] of Object.entries(bpDay)) push('bp', day, mean(list.map(x => x.sys)), mean(list.map(x => x.dia)));
  for (const [day, iv] of Object.entries(sleep)) { const h = unionMinutes(iv) / 60; if (h >= 1 && h <= 16) push('sleep', day, h); }
  return { rows, used, skipped };
}

/** Upsert daily rows for a user (idempotent: re-importing the same export overwrites, never duplicates). */
export function saveAppleHealth(userId, rows) {
  const up = db.prepare(`INSERT INTO measurements (user_id, metric, value, value2, unit, source, external_id, note, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, metric, source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET value=excluded.value, value2=excluded.value2, recorded_at=excluded.recorded_at`);
  const perMetric = {};
  tx(() => {
    for (const r of rows) {
      up.run(userId, r.metric, r.value, r.value2, r.unit, APPLE_SOURCE, `ah-${r.metric}-${r.day}`, 'Apple Health daily aggregate', `${r.day} 08:00:00`);
      perMetric[r.metric] = (perMetric[r.metric] ?? 0) + 1;
    }
    db.prepare(`INSERT INTO integrations (user_id, provider, status, last_sync, meta) VALUES (?, 'apple-health', 'connected', datetime('now'), '{}')
      ON CONFLICT(user_id, provider) DO UPDATE SET status='connected', last_sync=datetime('now')`).run(userId);
  });
  return perMetric;
}

export function clearAppleHealth(userId) {
  tx(() => {
    db.prepare('DELETE FROM measurements WHERE user_id = ? AND source = ?').run(userId, APPLE_SOURCE);
    db.prepare(`DELETE FROM integrations WHERE user_id = ? AND provider = 'apple-health'`).run(userId);
  });
}

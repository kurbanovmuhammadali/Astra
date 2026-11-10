import { METRICS } from './catalog.js';

/**
 * Pure analysis functions (no database, no clock) so the same code runs in the app AND in the validation harness.
 *
 * Method (all explainable, nothing black-box):
 *  1. BASELINE  = median of the astronaut's first 14 days of data for that metric (min. 3 days). It is FIXED, not rolling,
 *                 so a slow decline can never become "the new normal".
 *  2. THRESHOLD = the static clinical / mission range from the catalogue, applied to the latest reading
 *                 (baseline-type metrics use the median of the last 72 h to avoid reacting to one noisy value).
 *  3. DRIFT     = early warning. Fires when ALL hold:
 *                   - the median of the last 7 days sits >= 3 robust standard errors on the bad side of baseline,
 *                   - the shift is at least `minPct` % (clinically meaningful size),
 *                   - the Theil–Sen trend over the last 14 days points the same way.
 *                 A drift flag only ever raises green -> amber ("watch"); red stays reserved for threshold breaches.
 */
export const DAY = 864e5;
export const Z_DRIFT = 3;

export const median = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mad = (a, c = median(a)) => median(a.map(x => Math.abs(x - c)));
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

export function evaluate(key, value, value2, baseline) {
  const m = METRICS[key];
  if (!m || value == null) return { status: 'none' };
  const r = m.range;
  switch (r.kind) {
    case 'min': return { status: value >= r.g ? 'green' : value >= r.a ? 'amber' : 'red' };
    case 'max': return { status: value <= r.g ? 'green' : value <= r.a ? 'amber' : 'red' };
    case 'abs': {
      const inn = ([lo, hi]) => value >= lo && value <= hi;
      return { status: inn(r.green) ? 'green' : inn(r.amber) ? 'amber' : 'red' };
    }
    case 'bp': {
      const s = value, d = value2 ?? 0;
      if (s >= 140 || d >= 90 || s < 90) return { status: 'red' };
      if (s >= 130 || d >= 85) return { status: 'amber' };
      return { status: 'green' };
    }
    case 'baseline': {
      if (!baseline?.value) return { status: 'green', deviation: 0 };
      const dev = ((value - baseline.value) / baseline.value) * 100;
      const bad = r.dir === 'low' ? -dev : dev;
      return { status: bad >= r.red ? 'red' : bad >= r.amber ? 'amber' : 'green', deviation: round(dev) };
    }
  }
  return { status: 'none' };
}

/** Mean per UTC day. points: [{t (ms), v, v2}] ascending. */
export function dailyMeans(points) {
  const m = new Map();
  for (const p of points) {
    const d = Math.floor(p.t / DAY);
    const e = m.get(d) ?? { d, s: 0, n: 0, s2: 0, n2: 0 };
    e.s += p.v; e.n++;
    if (p.v2 != null) { e.s2 += p.v2; e.n2++; }
    m.set(d, e);
  }
  return [...m.values()].sort((a, b) => a.d - b.d).map(e => ({ d: e.d, t: e.d * DAY, v: e.s / e.n, v2: e.n2 ? e.s2 / e.n2 : null }));
}

export function theilSen(xs, ys) {
  const s = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) s.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  return median(s);
}

/** Mann–Kendall trend statistic (z, tie-corrected). Positive = rising. Rank-based, so outliers barely move it. */
export function mannKendallZ(ys) {
  const n = ys.length;
  if (n < 4) return 0;
  let S = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) S += Math.sign(ys[j] - ys[i]);
  const ties = new Map();
  ys.forEach(y => ties.set(y, (ties.get(y) ?? 0) + 1));
  let v = n * (n - 1) * (2 * n + 5);
  for (const t of ties.values()) if (t > 1) v -= t * (t - 1) * (2 * t + 5);
  const sd = Math.sqrt(v / 18);
  return sd ? (S > 0 ? S - 1 : S < 0 ? S + 1 : 0) / sd : 0;
}

export const Z_TREND = 3.5;

export function baselineFrom(points) {
  if (!points.length) return null;
  const dp = dailyMeans(points);
  const t0 = dp[0].t;
  let set = dp.filter(p => p.t < t0 + 14 * DAY);
  if (set.length < 3) set = dp.slice(0, 3);
  const vals = set.map(p => p.v);
  const v2 = set.filter(p => p.v2 != null).map(p => p.v2);
  return { value: median(vals), value2: v2.length ? median(v2) : null, n: set.length, mad: mad(vals), through: set.at(-1).t + DAY };
}

export function driftOf(key, points, base, asOfMs) {
  const none = { level: 'none', z: 0, pct: 0, slopePerDay: null, days: 0 };
  const m = METRICS[key];
  if (!m?.bad || !base || !Number.isFinite(base.value)) return none;
  const dp = dailyMeans(points).filter(p => p.t >= base.through);
  const recent7 = dp.filter(p => p.t > asOfMs - 7 * DAY);
  const rec = recent7.length >= 4 ? recent7 : dp.slice(-3);
  if (rec.length < 3 || rec[0].t < asOfMs - 28 * DAY) return none;

  const sgn = m.bad === 'low' ? -1 : 1;
  const b = base.value, ab = Math.abs(b) || 1;
  const minPct = m.drift?.minPct ?? 5;
  // spread estimate: the larger of the baseline-window MAD and the MAD of ALL history so far (a 14-day sample alone under-estimates noise)
  const all = dailyMeans(points).map(p => p.v);
  const runSigma = all.length >= 10 ? 1.4826 * mad(all) : 0;
  const sigma = Math.max(1.4826 * (base.mad ?? 0), runSigma, 0.3 * (minPct / 100) * ab);
  // 1.2533 = median efficiency factor; 1.3 = allowance for day-to-day autocorrelation
  const se = 1.3 * 1.2533 * sigma * Math.sqrt(1 / rec.length + 1 / Math.max(3, base.n));
  const shift = sgn * (median(rec.map(p => p.v)) - b);
  const z = shift / se, pct = (shift / ab) * 100;

  const tr = dp.slice(-14);
  const slope = tr.length >= 5 ? theilSen(tr.map(p => (p.t - tr[0].t) / DAY), tr.map(p => p.v)) : null;
  // second pathway: a significant monotone trend over the last ~3 weeks (catches slow drifts the 7-day median is too noisy to see)
  const win = dp.filter(p => p.t > asOfMs - 56 * DAY).slice(-21);
  const mk = win.length >= 6 ? sgn * mannKendallZ(win.map(p => p.v)) : 0;
  const shifted = z >= Z_DRIFT && pct >= minPct;
  const trending = mk >= Z_TREND && pct >= minPct && z >= 1;
  const level = (shifted || trending) && sgn * (slope ?? 0) > 0 ? (z >= 2 * Z_DRIFT && pct >= 2 * minPct ? 'strong' : 'watch') : 'none';
  return { level, z: round(z, 2), mk: round(mk, 2), via: shifted ? 'shift' : trending ? 'trend' : null, pct: round(pct), slopePerDay: round(slope, 3), days: rec.length };
}

/** Everything the engine needs to know about one metric as of `asOfMs`. points must already be <= asOfMs. */
export function analyzeMetric(key, points, asOfMs) {
  const m = METRICS[key];
  const base = baselineFrom(points);
  const last = points.at(-1) ?? null;
  if (!last) return { last: null, base, status: 'none', thresholdStatus: 'none', early: false, drift: { level: 'none' }, confidence: { level: 'low', baselineDays: 0 } };

  let v = last.v;
  if (m.range.kind === 'baseline') {
    const w = points.filter(p => p.t >= last.t - 72 * 36e5).map(p => p.v);
    if (w.length >= 2) v = median(w);
  }
  const ev = evaluate(key, v, last.v2, base);
  const drift = driftOf(key, points, base, asOfMs);
  const early = ev.status === 'green' && drift.level !== 'none';
  const n = base?.n ?? 0;
  return {
    last, base, value: v, deviation: ev.deviation ?? null, thresholdStatus: ev.status,
    status: early ? 'amber' : ev.status, early, drift,
    confidence: { level: n >= 7 ? 'high' : n >= 3 ? 'moderate' : 'low', baselineDays: n },
  };
}

export function driftNote(label, unit, drift) {
  return `${label} is ${Math.abs(drift.pct)}% worse than your own baseline (recent median) and still trending the wrong way (z ${drift.z}) — flagged early, before it crosses the amber limit.`;
}

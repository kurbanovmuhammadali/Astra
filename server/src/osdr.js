import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, tx } from './db.js';
import { METRICS } from './health/catalog.js';
import { toSql } from './health/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
export const OSDR_FIXTURE = resolve(here, '../fixtures/osdr/OSD-569_CBC_TRANSFORMED.csv');
export const OSDR_URL = 'https://osdr.nasa.gov/geode-py/ws/studies/OSD-569/download?source=datamanager&file=LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv';
export const OSDR_SOURCE = 'nasa-osdr';
export const I4 = {
  study: 'OSD-569', title: 'Inspiration4 · real NASA labs',
  page: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
  returnDay: 3, // the mission lasted 3 days: launch = day 0, splashdown = day 3
  crew: ['C001', 'C002', 'C003', 'C004'],
};
const DAY = 864e5;

/** CSV column -> Astra metric. (The file labels haemoglobin "percent" but the values are g/dL.) */
const COLUMN = {
  hgb: 'hemoglobin_value_percent',
  wbc: 'white_blood_cell_count_value_thousand_per_microliter',
  lymph: 'absolute_lymphocytes_value_cells_per_microliter',
  plt: 'platelet_count_value_thousand_per_microliter',
};

/** Sample names look like C001_whole-blood_L-92_cbc / C001_whole-blood_R+45_cbc. Day 0 = launch. */
export function parseI4(csv) {
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const col = Object.fromEntries(Object.entries(COLUMN).map(([k, name]) => [k, head.indexOf(name)]));
  if (Object.values(col).some(i => i < 0)) throw new Error('Unexpected OSD-569 CBC columns — has the file format changed?');
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const m = /^(C\d{3})_whole-blood_(L-\d+|R\+\d+)_cbc$/.exec(c[0]);
    if (!m) continue;
    const off = m[2][0] === 'L' ? -Number(m[2].slice(2)) : I4.returnDay + Number(m[2].slice(2));
    const values = {};
    for (const [k, i] of Object.entries(col)) { const v = Number(c[i]); if (Number.isFinite(v)) values[k] = v; }
    rows.push({ crew: m[1], sample: c[0], tp: m[2], off, values });
  }
  return rows;
}

export const loadI4 = (file = OSDR_FIXTURE) => parseI4(readFileSync(file, 'utf8'));

const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Loads one Inspiration4 crew member's real CBC results. Day OFFSETS are real (L-92 ... R+194); the calendar is shifted so the last
 * sample lands on today, because Astra judges "recent" data relative to now. Values are imported exactly as published; values far
 * from that person's own median are annotated in the note, never altered or dropped.
 */
export function seedOsdrI4(userId, crew = 'C001', nowMs = Date.now(), file = OSDR_FIXTURE) {
  if (!I4.crew.includes(crew)) throw new Error(`Unknown crew "${crew}".`);
  const all = loadI4(file);
  const mine = all.filter(r => r.crew === crew);
  const maxOff = Math.max(...all.map(r => r.off));
  const anchor = new Date(nowMs); anchor.setUTCHours(8, 0, 0, 0);
  if (anchor.getTime() > nowMs) anchor.setUTCDate(anchor.getUTCDate() - 1);
  const med = Object.fromEntries(Object.keys(COLUMN).map(k => [k, median(mine.map(r => r.values[k]).filter(v => v != null))]));
  const ins = db.prepare('INSERT OR IGNORE INTO measurements (user_id, metric, value, value2, unit, source, external_id, note, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)');
  tx(() => {
    for (const r of mine) {
      const t = anchor.getTime() - (maxOff - r.off) * DAY;
      for (const [k, v] of Object.entries(r.values)) {
        const odd = med[k] && (v < med[k] * 0.2 || v > med[k] * 3);
        const note = `OSD-569 ${r.sample}${odd ? ' (far from this person\'s own median; kept exactly as published)' : ''}`;
        ins.run(userId, k, v, null, METRICS[k].unit, OSDR_SOURCE, `osd569-${r.sample}-${k}`, note, toSql(new Date(t)));
      }
    }
    db.prepare(`INSERT INTO integrations (user_id, provider, status, last_sync, meta) VALUES (?, 'nasa-osdr', 'connected', datetime('now'), ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET status='connected', last_sync=datetime('now'), meta=excluded.meta`).run(userId, JSON.stringify({ study: I4.study, crew }));
  });
  return { crew, samples: mine.length };
}

export function clearOsdr(userId) {
  tx(() => {
    db.prepare('DELETE FROM measurements WHERE user_id = ? AND source = ?').run(userId, OSDR_SOURCE);
    db.prepare(`DELETE FROM integrations WHERE user_id = ? AND provider = 'nasa-osdr'`).run(userId);
  });
}

/** Replay metadata for the real-data dataset (day indices counted from the first sample, i.e. L-92). */
export function osdrReplayMeta(userId) {
  const row = db.prepare('SELECT MIN(recorded_at) a, MAX(recorded_at) b FROM measurements WHERE user_id = ? AND source = ?').get(userId, OSDR_SOURCE);
  if (!row?.a) return null;
  const a = new Date(row.a.replace(' ', 'T') + 'Z'), b = new Date(row.b.replace(' ', 'T') + 'Z');
  const d0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const days = Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - d0) / DAY) + 1;
  const launch = -Math.min(...loadI4().map(r => r.off)); // 92 days after the first sample
  return {
    active: true, key: 'inspiration4', title: I4.title, days, start: new Date(d0).toISOString(), end: b.toISOString(),
    blurb: 'Real complete-blood-count results from the four Inspiration4 crew (NASA OSDR OSD-569), 92 days before launch to 194 days after return. Calendar dates are shifted; day offsets are real. There are no in-flight samples — the mission lasted 3 days.',
    truthLabel: 'Mission milestones so far',
    idleText: 'Pre-flight baseline is being established. Press play to follow the crew through launch and recovery.',
    playFrom: 0, step: Math.max(1, Math.round(days / 120)),
    events: [
      { id: 'launch', label: 'Launch', metric: '', system: '', kind: 'milestone', day: launch, date: null },
      { id: 'return', label: 'Return to Earth', metric: '', system: '', kind: 'milestone', day: launch + I4.returnDay, date: null },
    ],
  };
}

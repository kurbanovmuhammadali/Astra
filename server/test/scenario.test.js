process.env.DB_FILE = ':memory:';
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const { runValidation } = await import('../src/health/validation.js');
const { driftOf, baselineFrom, mannKendallZ, median } = await import('../src/health/analysis.js');

const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let cookie = '';
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json() };
};
test.after(() => srv.close());

test('analysis primitives', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.ok(mannKendallZ([1, 2, 3, 4, 5, 6, 7, 8]) > 3);
  assert.ok(mannKendallZ([8, 7, 6, 5, 4, 3, 2, 1]) < -3);
  assert.equal(mannKendallZ([5, 5, 5, 5, 5]), 0);
  const DAY = 864e5, t0 = Date.UTC(2026, 0, 1);
  const flat = Array.from({ length: 30 }, (_, i) => ({ t: t0 + i * DAY, v: 60 + (i % 3) }));
  assert.equal(driftOf('hrv', flat, baselineFrom(flat), flat.at(-1).t).level, 'none');
  const falling = Array.from({ length: 40 }, (_, i) => ({ t: t0 + i * DAY, v: 60 + (i % 3) - Math.max(0, i - 15) * 0.9 }));
  assert.notEqual(driftOf('hrv', falling, baselineFrom(falling), falling.at(-1).t).level, 'none');
  // an improving metric must never raise a drift flag
  const rising = Array.from({ length: 40 }, (_, i) => ({ t: t0 + i * DAY, v: 60 + (i % 3) + Math.max(0, i - 15) * 0.9 }));
  assert.equal(driftOf('hrv', rising, baselineFrom(rising), rising.at(-1).t).level, 'none');
});

test('guest demo crew + mission replay', async () => {
  let r = await call('POST', '/api/auth/guest');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(cookie.startsWith('pg_session='));
  r = await call('GET', '/api/scenario');
  assert.equal(r.body.active, true);
  assert.equal(r.body.events.length, 6);
  const { start, end, events } = r.body;
  const at = day => new Date(new Date(start).getTime() + day * 864e5 + 23.9 * 36e5).toISOString();

  // before any problem starts: everything quiet
  r = await call('GET', `/api/dashboard?asOf=${encodeURIComponent(at(55))}`);
  assert.equal(r.status, 200);
  assert.ok(!r.body.alerts.some(a => a.level === 'red'), 'no red alerts before the hidden problems');
  assert.ok(r.body.systems.every(s => s.status !== 'red'));

  // the solar particle event (day 96) must raise a red radiation alert that day, and not the day before
  const spe = events.find(e => e.id === 'spe').day;
  r = await call('GET', `/api/dashboard?asOf=${encodeURIComponent(at(spe))}`);
  assert.equal(r.body.metrics.radiation.status, 'red');
  r = await call('GET', `/api/dashboard?asOf=${encodeURIComponent(at(spe - 1))}`);
  assert.notEqual(r.body.metrics.radiation.status, 'red');

  // by the end the bone system is flagged and the plan adapts, with evidence attached
  r = await call('GET', `/api/plan?asOf=${encodeURIComponent(end)}`);
  const bone = r.body.adaptations.find(a => a.key === 'adapt-bone-run');
  assert.ok(bone, 'bone adaptation present at end of mission');
  assert.ok(bone.evidence.includes('R4'));

  // metric detail carries references and confidence
  r = await call('GET', '/api/metrics/ntx?days=60');
  assert.equal(r.body.info.evidence.basis, 'nasa-informed');
  assert.ok(r.body.info.evidence.references.length >= 1 && r.body.info.evidence.references[0].cite);
  assert.ok(['low', 'moderate', 'high'].includes(r.body.snapshot.confidence.level));

  // report cites the evidence and carries the disclaimer
  r = await call('GET', '/api/report');
  assert.match(r.body.text, /EVIDENCE BASIS/);
  assert.match(r.body.text, /not a medical device/);
  assert.match(r.body.text, /SYNTHETIC DEMO DATA/);
});

test('validation: drift detector stays quiet on healthy crews and never lags thresholds', () => {
  const v = runValidation({ crews: 8, nullCrews: 10 });
  console.log(JSON.stringify(v.falseAlarms), v.table.map(t => `${t.metric}:${t.leadDaysMedian}`).join(' '));
  assert.ok(v.falseAlarms.driftPerCrewMonth < 0.5, `drift false alarms/crew-month = ${v.falseAlarms.driftPerCrewMonth}`);
  assert.ok(v.falseAlarms.driftPerCrewMonth < v.falseAlarms.thresholdPerCrewMonth);
  for (const t of v.table) {
    assert.ok(t.earlyDetected >= t.thresholdDetected, `${t.id}: early detection must not find fewer problems`);
    assert.ok((t.leadDaysMedian ?? 0) >= 0, `${t.id}: drift must never be later than thresholds`);
  }
  assert.ok(v.table.find(t => t.id === 'spe').earlyDetected === 1, 'solar particle event always detected');
});

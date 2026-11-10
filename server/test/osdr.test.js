process.env.DB_FILE = ':memory:';
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const { parseI4, loadI4, I4 } = await import('../src/osdr.js');

const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let cookie = '';
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json() };
};
test.after(() => srv.close());

test('OSD-569 fixture parses to 4 crew x 7 pre/post-flight time points', () => {
  const rows = loadI4();
  assert.equal(rows.length, 28);
  assert.deepEqual([...new Set(rows.map(r => r.crew))].sort(), I4.crew);
  assert.equal(Math.min(...rows.map(r => r.off)), -92);
  assert.equal(Math.max(...rows.map(r => r.off)), 197);           // R+194 = 3 + 194
  assert.ok(rows.every(r => r.values.hgb > 5 && r.values.wbc > 1)); // real values, no blanks
  assert.throws(() => parseI4('Sample Name,foo\nC001_whole-blood_L-3_cbc,1'), /Unexpected OSD-569/);
});

const dayEnd = (start, idx) => encodeURIComponent(new Date(new Date(start).getTime() + (idx + 1) * 864e5 - 60_000).toISOString());

test('real-data crew: labelled provenance, pre-flight baseline, replay milestones', async () => {
  let r = await call('POST', '/api/auth/guest', { dataset: 'osdr', crew: 'C002' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.user.name, /C002 · Inspiration4/);

  r = await call('GET', '/api/scenario');
  assert.equal(r.body.key, 'inspiration4');
  assert.deepEqual(r.body.events.map(e => e.id), ['launch', 'return']);
  assert.equal(r.body.events[0].day, 92);
  assert.equal(r.body.events[1].day, 95);
  const { start } = r.body;

  r = await call('GET', '/api/dashboard');
  const m = r.body.metrics;
  assert.equal(m.hgb.source, 'nasa-osdr');
  assert.equal(m.hgb.value, 12.7);               // C002, R+194, exactly as published
  assert.equal(m.hgb.confidence.level, 'moderate'); // 3 pre-flight samples only — never claimed as 'high'

  // C002 had haemoglobin 11.5 g/dL three days before launch (L-3): below the lab range -> amber at that moment of the replay
  r = await call('GET', `/api/dashboard?asOf=${dayEnd(start, 89)}`);
  assert.equal(r.body.metrics.hgb.value, 11.5);
  assert.equal(r.body.metrics.hgb.status, 'amber');
  // and before the first sample nothing exists yet
  r = await call('GET', `/api/dashboard?asOf=${dayEnd(start, 0)}`);
  assert.equal(r.body.metrics.hgb.value, 13.2);   // L-92

  r = await call('GET', '/api/report');
  assert.match(r.body.text, /REAL NASA OSDR DATA \(OSD-569/);
  assert.doesNotMatch(r.body.text, /SYNTHETIC DEMO DATA/);
});

test('robust baseline shrugs off a published outlier (C003 platelets 12.9 at L-92)', async () => {
  cookie = '';
  let r = await call('POST', '/api/auth/guest', { dataset: 'osdr', crew: 'C003' });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/metrics/plt?days=120');
  assert.equal(r.body.snapshot.baseline, 345);   // median of 12.9 / 345 / 367, not the mean (~241)
  const odd = r.body.recent.find(x => x.value === 12.9);
  assert.ok(odd, 'outlier imported exactly as published');
  assert.match(odd.note, /kept exactly as published/);
  assert.ok(r.body.info.evidence.references.some(x => x.id === 'R16'));
});

test('unknown crew falls back to C001, bad dataset to the scripted scenario', async () => {
  cookie = '';
  let r = await call('POST', '/api/auth/guest', { dataset: 'osdr', crew: 'C999' });
  assert.match(r.body.user.name, /C001 · Inspiration4/);
  cookie = '';
  r = await call('POST', '/api/auth/guest', { dataset: 'nonsense' });
  assert.equal(r.body.user.name, 'Alex Morgan');
});

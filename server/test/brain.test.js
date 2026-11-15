process.env.DB_FILE = ':memory:';
process.env.DEMO_ACCOUNTS = 'off';
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const { db } = await import('../src/db.js');
const brain = await import('../src/brain.js');
const { loginAs } = await import('./support/people.js');
const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
const jar = () => { let cookie = ''; const f = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => ({})) };
}; return f; };
const crew = jar(), doc = jar();
let me;
const add = (metric, value, hoursAgo, source = 'whoop', value2 = null) => db.prepare("INSERT INTO measurements (user_id, metric, value, value2, unit, source, recorded_at) VALUES (?,?,?,?,?,?, datetime('now', ?))").run(me, metric, value, value2, '', source, `-${hoursAgo} hours`);

test('setup', async () => { me = (await loginAs(crew, 'crew')).body.user.id; await loginAs(doc, 'admin'); db.prepare('DELETE FROM measurements WHERE user_id = ?').run(me); });

test('zeros from the strap are sensor gaps, never readings', () => {
  assert.equal(brain.validValue('hrv', 0), false); assert.equal(brain.validValue('rhr', 0), false); assert.equal(brain.validValue('recovery', 0), false); assert.equal(brain.validValue('hrv', 55), true);
});

test('it learns what is normal for THIS person and ignores invalid zeros', () => {
  for (let i = 1; i <= 14; i++) add('rhr', 52 + (i % 3), i * 24);
  add('rhr', 0, 30); add('hrv', 0, 5); // zeros: ignored
  for (let i = 1; i <= 14; i++) add('hrv', 70 + (i % 4), i * 24);
  brain.learnNorms(me);
  const n = brain.normOf(me, 'rhr'); assert.equal(n.source, 'learned'); assert.ok(n.low > 45 && n.high < 62, JSON.stringify(n));
  assert.equal(brain.judge(me, 'hrv', 0).status, 'invalid');
  assert.equal(brain.judge(me, 'rhr', 53).status, 'good');
  assert.notEqual(brain.judge(me, 'rhr', 75).status, 'good');
});

test('a doctor-set normal range beats the learned one', async () => {
  assert.equal((await crew('PUT', `/api/admin/crew/${me}/norms/rhr`, { low: 40, high: 60 })).status, 403);
  assert.equal((await doc('PUT', `/api/admin/crew/${me}/norms/rhr`, { low: 60, high: 40 })).status, 400);
  assert.equal((await doc('PUT', `/api/admin/crew/${me}/norms/rhr`, { low: 45, high: 70, note: 'athlete' })).status, 200);
  assert.equal(brain.normOf(me, 'rhr').source, 'doctor');
  assert.equal(brain.judge(me, 'rhr', 68).status, 'good'); // would be "watch" by the learned range
  await doc('POST', `/api/admin/crew/${me}/doctor-notes`, { text: 'No hard intervals this week: knee.' });
  assert.match(JSON.stringify(brain.datasetFor(me).doctorNotes), /knee/);
});

test('30-minute analysis: ok when normal, alert + doctor report when not', async () => {
  add('rhr', 54, 1); add('hrv', 72, 1);
  let a = await brain.analyzeUser(me); assert.equal(a.level, 'ok');
  add('rhr', 96, 0); // far outside the doctor's range and the safe population range
  a = await brain.analyzeUser(me); assert.equal(a.level, 'alert'); assert.ok(a.flags.some(f => f.metric === 'rhr'));
  assert.ok(db.prepare("SELECT 1 FROM handoffs WHERE user_id = ? AND id LIKE 'si-%'").get(me), 'doctors get a report');
  const b = await crew('GET', '/api/me/brain'); assert.equal(b.status, 200); assert.equal(b.body.analysis.level, 'alert'); assert.ok(b.body.norms.length >= 2);
});

test('SI proposals are verified against the dataset before they are stored; the person confirms', async () => {
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { text, list } = brain.extractProposals(`Rest tomorrow.\n<proposals>[{"type":"day_off","day":"${day}","reason":"high resting HR"},{"type":"explode","day":"${day}"}]</proposals>`);
  assert.equal(text, 'Rest tomorrow.'); assert.equal(list.length, 2);
  assert.equal(brain.storeProposals(me, [{ type: 'schedule', day: '1999-01-01', time: '07:00' }]).length, 0); // a date in the past is dropped
  const stored = brain.storeProposals(me, list);
  assert.equal(stored.length, 1); assert.equal(stored[0].kind, 'day_off'); // unknown type and past date dropped; analysis is alert so rest is justified
  const ok = await crew('POST', `/api/me/adjustments/${stored[0].id}`, { action: 'apply' }); assert.equal(ok.body.status, 'applied');
  assert.equal((await crew('POST', `/api/me/adjustments/${stored[0].id}`, { action: 'apply' })).status, 409);
  const s = brain.storeProposals(me, [{ type: 'schedule', day, time: '07:30', minutes: 40, title: 'Easy cycle', reason: 'recovery' }]); assert.equal(s.length, 1);
  assert.match(s[0].title, /07:30/);
});

test('no rest is proposed when everything is fine and nobody asked', async () => {
  db.prepare('DELETE FROM ai_analyses WHERE user_id = ?').run(me); db.prepare("DELETE FROM measurements WHERE user_id = ? AND recorded_at >= datetime('now','-2 hours')").run(me);
  add('rhr', 55, 0); await brain.analyzeUser(me);
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  assert.equal(brain.storeProposals(me, [{ type: 'day_off', day, reason: 'because' }]).length, 0);
  assert.equal(brain.storeProposals(me, [{ type: 'day_off', day, reason: 'asked' }], { userAsked: true }).length, 1);
});

test('the SI may propose a new norm, but only a doctor can approve it', async () => {
  const [p] = brain.storeProposals(me, [{ type: 'norm', metric: 'hrv', low: 60, high: 90, reason: 'two weeks of data' }]);
  assert.equal(p.needsDoctor, true);
  assert.equal((await crew('POST', `/api/me/adjustments/${p.id}`, { action: 'apply' })).status, 404); // not the astronaut's to apply
  assert.equal((await doc('POST', `/api/admin/adjustments/${p.id}`, { action: 'apply' })).status, 200);
  assert.equal(brain.normOf(me, 'hrv').source, 'doctor');
});

test('a doctor can schedule a day off and sees the whole dataset', async () => {
  const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  assert.equal((await doc('POST', `/api/admin/crew/${me}/adjustments`, { kind: 'day_off', day, reason: 'doctor order' })).status, 200);
  const d = await doc('GET', `/api/admin/crew/${me}/brain`); assert.equal(d.status, 200);
  assert.ok(d.body.analyses.length >= 1 && d.body.notes.length === 1 && d.body.adjustments.some(a => a.by === 'doctor'));
  assert.equal((await crew('GET', `/api/admin/crew/${me}/brain`)).status, 403);
});
test.after(() => srv.close());

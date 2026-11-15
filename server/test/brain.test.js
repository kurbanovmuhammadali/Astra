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
const actorOf = id => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
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

test('the SI records a reading only when the person actually said that number', async () => {
  const before = db.prepare("SELECT COUNT(*) n FROM measurements WHERE user_id = ? AND source = 'manual'").get(me).n;
  const logged = brain.applyLogs(actorOf(me), [
    { type: 'log', metric: 'radiation', value: 0.4 }, { type: 'log', metric: 'rhr', value: 72 },
    { type: 'log', metric: 'rhr', value: 55 },            // never said: refused
    { type: 'log', metric: 'spo2', value: 250 },          // impossible: refused
    { type: 'log', metric: 'bp', value: 128 },            // blood pressure needs both numbers
  ], 'please record my radiation 0.40 and heart rate 72 bpm, bp 128');
  assert.deepEqual(logged.map(l => l.metric).sort(), ['radiation', 'rhr']);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM measurements WHERE user_id = ? AND source = 'manual'").get(me).n, before + 2);
  assert.equal(brain.applyLogs(actorOf(me), [{ type: 'log', metric: 'bp', value: 128, value2: 84 }], 'bp 128/84')[0].value2, 84);
});

test('the SI changes only the signed-in person\'s own data; only an admin may name someone else', async () => {
  const mira = db.prepare("SELECT * FROM users WHERE email = 'mira@test.local'").get();
  const self = actorOf(me), admin = db.prepare("SELECT * FROM users WHERE email = 'surgeon@test.local'").get();
  // own profile: allergy from a file the person sent, when they asked
  let r = brain.applyProfile(self, [{ type: 'profile', field: 'allergies', text: 'Penicillin (rash)' }], { userAsked: true });
  assert.equal(r.done.length, 1); assert.equal(r.done[0].for, 'you');
  assert.equal(brain.applyProfile(self, [{ type: 'profile', field: 'allergies', text: 'penicillin (rash)' }], { userAsked: true }).done.length, 0); // no duplicates
  assert.equal(brain.applyProfile(self, [{ type: 'profile', field: 'condition', text: 'Mild asthma' }], { userAsked: false }).done.length, 0); // the person must ask
  // someone else: refused for a normal user
  r = brain.applyProfile(self, [{ type: 'profile', field: 'allergies', text: 'Shellfish', for: mira.name }], { userAsked: true });
  assert.equal(r.done.length, 0); assert.deepEqual(r.denied, ['another astronaut']);
  const l = brain.applyLogs(self, [{ type: 'log', metric: 'rhr', value: 61, for: mira.name }], 'heart rate 61');
  assert.deepEqual(l.denied, ['another astronaut']); assert.equal(l.length, 0);
  // an admin may name another astronaut
  r = brain.applyProfile(admin, [{ type: 'profile', field: 'allergies', text: 'Shellfish', for: mira.name }], { userAsked: true });
  assert.equal(r.done.length, 1); assert.equal(r.done[0].for, mira.name);
  assert.match(brain.datasetFor(mira.id).healthFile.allergies, /Shellfish/);
  assert.equal(brain.datasetFor(me).healthFile.allergies.includes('Shellfish'), false);
});

test('numbers read from a PDF or photo are confirmed by the person before they are recorded', async () => {
  const self = actorOf(me);
  const r = brain.applyLogs(self, [{ type: 'log', metric: 'glucose', value: 93 }], 'add the values from my lab report', { binaryFile: true });
  assert.equal(r.length, 0); assert.equal(r.pending.length, 1);
  const before = db.prepare("SELECT COUNT(*) n FROM measurements WHERE user_id = ? AND metric = 'glucose'").get(me).n;
  assert.equal((await crew('POST', `/api/me/adjustments/${r.pending[0].id}`, { action: 'apply' })).body.status, 'applied');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM measurements WHERE user_id = ? AND metric = 'glucose'").get(me).n, before + 1);
  // a number that is in a text file the person attached is recorded straight away
  assert.equal(brain.applyLogs(self, [{ type: 'log', metric: 'weight', value: 77.5 }], 'add my weight', { fileText: 'Weight: 77.5 kg' }).length, 1);
});

test('doctor notes stay in force for the period the doctor chose, and always come first in what the SI sees', async () => {
  assert.equal((await doc('POST', `/api/admin/crew/${me}/doctor-notes`, { text: 'bad', days: 999 })).status, 400);
  assert.equal((await doc('POST', `/api/admin/crew/${me}/doctor-notes`, { text: 'This week: no overhead lifting (shoulder).', days: 7 })).status, 200);
  assert.equal((await doc('POST', `/api/admin/crew/${me}/doctor-notes`, { text: 'Always: carry the inhaler on EVA.' })).status, 200);
  db.prepare("INSERT INTO doctor_notes (user_id, by_user, text, valid_until) VALUES (?, NULL, 'Last month: fast for the blood test.', date('now','-3 days'))").run(me);
  let ds = brain.datasetFor(me);
  assert.ok(ds.doctorNotes.some(n => /overhead/.test(n.text) && n.daysLeft >= 6 && n.daysLeft <= 7));
  assert.ok(ds.doctorNotes.some(n => /inhaler/.test(n.text) && n.validUntil === 'until the doctor removes it'));
  assert.ok(!ds.doctorNotes.some(n => /fast for the blood test/.test(n.text)));          // expired: not in force
  assert.ok(ds.earlierNotes.some(n => /fast for the blood test/.test(n.text) && n.expired)); // but kept as history
  const json = JSON.stringify(ds);
  assert.ok(json.indexOf('doctorNotes') < json.indexOf('readings') && json.indexOf('norms') < json.indexOf('readings')); // never the part that gets cut
  const { assistantPrompt } = await import('../src/companion.js');
  assert.match(assistantPrompt({}, '', { dataset: ds }), /overhead lifting/);
  const list = await doc('GET', `/api/admin/crew/${me}/brain`);
  assert.ok(list.body.notes.some(n => /overhead/.test(n.text) && n.active && n.validUntil));
});

test('SI memory: facts are kept per person, deduplicated, capped, private and deletable', async () => {
  const mem = await crew('GET', '/api/me/si-memory'); assert.equal(mem.status, 200);
  brain.applyMemory(me, { add: ['Prefers short answers, no bullet lists', 'Trains early in the morning', 'prefers short answers, no bullet lists', 'x'] });
  let facts = brain.memoryOf(me); assert.equal(facts.length, 2); // duplicate and too-short ones dropped
  assert.match(JSON.stringify(brain.datasetFor(me)), /./);
  const { assistantPrompt } = await import('../src/companion.js');
  assert.match(assistantPrompt({}, '', { memory: facts.map(f => f.fact) }), /Trains early in the morning/);
  brain.applyMemory(me, { forget: [facts[0].id] }); assert.equal(brain.memoryOf(me).length, 1);
  for (let i = 0; i < 50; i++) brain.applyMemory(me, { add: [`Fact number ${i} about the astronaut`] });
  assert.equal(brain.memoryOf(me).length, 40); // capped
  assert.equal((await crew('DELETE', `/api/me/si-memory/${brain.memoryOf(me)[0].id}`)).status, 200);
  assert.equal((await doc('GET', '/api/me/si-memory')).body.facts.length, 0); // another account never sees it
  assert.equal((await crew('DELETE', '/api/me/si-memory')).body.facts.length, 0);
});

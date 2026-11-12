process.env.DB_FILE = ':memory:';
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');

const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let hop = 0;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', 'X-Client': 'native', 'X-Forwarded-For': `10.4.0.${hop++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
test.after(() => srv.close());

const signup = async () => {
  const email = `g-${Date.now()}-${hop++}@example.com`;
  const code = (await call('POST', '/api/auth/code', { email, purpose: 'signup' })).body.devCode;
  const r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code, profile: { firstName: 'Ada', lastName: 'Test', age: 30, sex: 'female', heightCm: 168, weightKg: 60, missionYears: 1, acceptTerms: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};

test('a new account is empty: no numbers, no data source, an honest tip', async () => {
  const { token, user } = await signup();
  assert.equal(user.dataSource, null);
  const g = (await call('GET', '/api/goals', null, token)).body;
  assert.equal(g.hasData, false);
  assert.ok(g.goals.every(x => x.value === null && x.pct === null && x.met === null));
  assert.match(g.tip, /Add today/);
  assert.ok(g.week.every(w => w.tracked === 0));
  const d = (await call('GET', '/api/dashboard', null, token)).body;
  assert.ok(Object.values(d.metrics).every(m => m.value == null), 'no auto-filled metric values');
});

test('choosing "by hand" satisfies the data-source rule; apple/whoop cannot be self-declared', async () => {
  const { token } = await signup();
  assert.equal((await call('PUT', '/api/profile/data-source', { source: 'apple' }, token)).status, 400);
  const r = await call('PUT', '/api/profile/data-source', { source: 'manual' }, token);
  assert.equal(r.body.user.dataSource, 'manual');
  assert.equal((await call('GET', '/api/auth/me', null, token)).body.user.dataSource, 'manual');
});

test('manual daily entry: validated, upserted, drives goals and tips', async () => {
  const { token } = await signup();
  assert.equal((await call('POST', '/api/daily', {}, token)).status, 400);
  assert.equal((await call('POST', '/api/daily', { sleep: 30 }, token)).status, 400);
  assert.equal((await call('POST', '/api/daily', { sys: 120, dia: 130 }, token)).status, 400);
  assert.equal((await call('POST', '/api/daily', { steps: 100, day: '2020-01-01' }, token)).status, 400);
  let r = await call('POST', '/api/daily', { sleep: '5,5', steps: 3000, exercise: 10, rhr: 58, weight: 60 }, token);
  assert.equal(r.status, 200);
  let g = r.body.goals;
  assert.equal(g.hasData, true);
  const by = k => g.goals.find(x => x.key === k);
  assert.equal(by('sleep').value, 5.5); assert.equal(by('sleep').met, false);
  assert.equal(by('steps').pct, 38);
  assert.match(g.tip, /slept 5\.5 h/);                      // short sleep is the first tip
  // re-saving replaces, it does not add
  r = await call('POST', '/api/daily', { sleep: 7.5, steps: 9000, exercise: 40 }, token);
  g = r.body.goals;
  assert.equal(g.goals.find(x => x.key === 'sleep').value, 7.5);
  assert.ok(['steps', 'sleep', 'move'].every(k => g.goals.find(x => x.key === k).met === true));
  assert.match(g.tip, /Log calories eaten|on track/);
  assert.equal(g.week.at(-1).met, 3);
});

test('food and camera workouts count toward goals', async () => {
  const { token } = await signup();
  await call('POST', '/api/food', { name: 'Big lunch', kcal: 3200, meal: 'lunch' }, token);
  await call('POST', '/api/workouts', { exercise: 'squat', reps: 30, valid: 25, seconds: 1200 }, token);   // 20 min
  const g = (await call('GET', '/api/goals', null, token)).body;
  assert.equal(g.goals.find(x => x.key === 'move').value, 20);
  assert.equal(g.goals.find(x => x.key === 'food').met, false);
  assert.match(g.tip, /over your/);
});

test('guest demo is an explicit demo account and keeps its data', async () => {
  const { token, user } = await call('POST', '/api/auth/guest', {}).then(r => r.body);
  assert.equal(user.dataSource, 'demo');
  assert.equal((await call('GET', '/api/goals', null, token)).body.hasData, true);
});

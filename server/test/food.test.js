process.env.DB_FILE = ':memory:';
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const { searchFoods } = await import('../src/food.js');

const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let hop = 0;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', 'X-Client': 'native', 'X-Forwarded-For': `10.3.0.${hop++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
test.after(() => srv.close());

test('food log: add, totals, goal, delete, validation, isolation', async () => {
  const a = (await call('POST', '/api/auth/guest', {})).body.token;
  const b = (await call('POST', '/api/auth/guest', {})).body.token;
  const day = '2026-11-12';
  assert.equal((await call('GET', `/api/food?day=${day}`, null, a)).body.totals.kcal, 0);
  let r = await call('POST', '/api/food', { day, meal: 'lunch', name: 'Plov', grams: 300, kcal: 570, protein: 18, carbs: 72, fat: 21 }, a);
  assert.equal(r.status, 200);
  r = await call('POST', '/api/food', { day, meal: 'bogus', name: 'Apple', kcal: 95 }, a);
  assert.equal(r.body.totals.kcal, 665);
  assert.equal(r.body.items[1].meal, 'snack');
  assert.equal(r.body.remaining, 2500 - 665);
  assert.equal((await call('POST', '/api/food', { day, name: '', kcal: 10 }, a)).status, 400);
  assert.equal((await call('POST', '/api/food', { day, name: 'x', kcal: -5 }, a)).status, 400);
  assert.equal((await call('PUT', '/api/food/goal', { kcal: 100, protein: 90 }, a)).status, 400);
  r = await call('PUT', '/api/food/goal', { kcal: 2800, protein: 110 }, a);
  assert.equal(r.body.goal.kcal, 2800);
  // another user cannot see or delete it
  assert.equal((await call('GET', `/api/food?day=${day}`, null, b)).body.totals.kcal, 0);
  const id = r.body.items[0].id;
  await call('DELETE', `/api/food/${id}`, null, b);
  assert.equal((await call('GET', `/api/food?day=${day}`, null, a)).body.items.length, 2);
  r = await call('DELETE', `/api/food/${id}`, null, a);
  assert.equal(r.body.items.length, 1);
  assert.equal((await call('GET', '/api/food')).status, 401);
});

test('under-fuelling note after 3 low days', async () => {
  const t = (await call('POST', '/api/auth/guest', {})).body.token;
  for (const d of ['2026-11-10', '2026-11-11', '2026-11-12']) await call('POST', '/api/food', { day: d, name: 'Light day', kcal: 1500 }, t);
  const s = (await call('GET', '/api/food?day=2026-11-12', null, t)).body;
  assert.ok(s.notes.some(n => n.level === 'amber'));
  assert.equal(s.week.length, 7);
});

test('search finds built-in staples without network', async () => {
  const r = await searchFoods('chicken breast');
  assert.ok(r.length && r[0].per100.protein > 25 && r[0].source === 'built-in');
  assert.deepEqual(await searchFoods('a'), []);
});

test('photo estimate: consent, validation, parsing, clamping, failure', async () => {
  const { setAiClient } = await import('../src/assistant.js');
  const t = (await call('POST', '/api/auth/guest', {})).body.token;
  const img = Buffer.alloc(300, 7).toString('base64');
  const sent = [];
  setAiClient({ messages: { create: async p => { sent.push(p); return { content: [{ type: 'text', text: 'Sure: {"items":[{"name":"Plov","grams":350,"kcal":665,"protein":20,"carbs":90,"fat":24},{"name":"Bad","grams":1,"kcal":0}],"confidence":"medium","note":"oil unknown"}' }] }; } } });
  assert.equal((await call('POST', '/api/food/photo', { image: img, mediaType: 'image/jpeg' }, t)).status, 400);           // no consent
  assert.equal((await call('POST', '/api/food/photo', { image: img, mediaType: 'image/gif', consent: true }, t)).status, 400);
  assert.equal((await call('POST', '/api/food/photo', { image: 'x', mediaType: 'image/jpeg', consent: true }, t)).status, 400);
  const r = await call('POST', '/api/food/photo', { image: img, mediaType: 'image/jpeg', consent: true }, t);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map(i => i.name), ['Plov']);
  assert.equal(r.body.estimate, true);
  const content = sent[0].messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.ok(!JSON.stringify(sent[0]).includes('@'));                                                  // no e-mail leaks into the request
  setAiClient({ messages: { create: async () => ({ content: [{ type: 'text', text: 'not json' }] }) } });
  assert.equal((await call('POST', '/api/food/photo', { image: img, mediaType: 'image/png', consent: true }, t)).status, 502);
  assert.equal((await call('POST', '/api/food/photo', { image: img, mediaType: 'image/png', consent: true })).status, 401);
  setAiClient(null);
  assert.equal((await call('POST', '/api/food/photo', { image: img, mediaType: 'image/png', consent: true }, t)).status, 503);
});

test('body profile drives the calorie goal (Mifflin-St Jeor)', async () => {
  const { energyNeeds } = await import('../src/food.js');
  // 30 y, male 180 cm 90 kg: BMR = 900 + 1125 - 150 + 5 = 1880 ; moderate x1.55 = 2914
  const big = energyNeeds({ weight_kg: 90, height_cm: 180, sex: 'male', activity: 'moderate', aim: 'maintain' }, 30);
  const small = energyNeeds({ weight_kg: 50, height_cm: 165, sex: 'female', activity: 'moderate', aim: 'maintain' }, 30);
  assert.equal(big.bmr, 1880); assert.equal(big.tdee, 2914); assert.equal(big.protein, 144);
  assert.ok(big.kcal > small.kcal + 800);
  const t = (await call('POST', '/api/auth/guest', {})).body.token;
  assert.equal((await call('GET', '/api/food?day=2026-11-12', null, t)).body.goal.from, 'default');
  assert.equal((await call('PUT', '/api/profile/body', { height_cm: 20, weight_kg: 90, sex: 'male', activity: 'moderate' }, t)).status, 400);
  assert.equal((await call('PUT', '/api/profile/body', { height_cm: 180, weight_kg: 90, sex: 'x', activity: 'moderate' }, t)).status, 400);
  const r = await call('PUT', '/api/profile/body', { height_cm: 180, weight_kg: 90, sex: 'male', activity: 'moderate', aim: 'lose' }, t);
  assert.equal(r.status, 200);
  const s = (await call('GET', '/api/food?day=2026-11-12', null, t)).body;
  assert.equal(s.goal.from, 'profile'); assert.equal(s.goal.kcal, Math.round(r.body.profile.tdee * 0.85 / 10) * 10);
  assert.equal((await call('PUT', '/api/food/goal', { kcal: 2000, protein: 100 }, t)).body.goal.from, 'custom');
});

test('workouts: saved with server-side energy estimate, validated, per user', async () => {
  const a = (await call('POST', '/api/auth/guest', {})).body.token, b = (await call('POST', '/api/auth/guest', {})).body.token;
  await call('PUT', '/api/profile/body', { height_cm: 180, weight_kg: 90, sex: 'male', activity: 'moderate' }, a);
  assert.equal((await call('POST', '/api/workouts', { exercise: 'jump', reps: 5, seconds: 30 }, a)).status, 400);
  assert.equal((await call('POST', '/api/workouts', { exercise: 'squat', reps: 0, seconds: 30 }, a)).status, 400);
  const r = await call('POST', '/api/workouts', { exercise: 'squat', reps: 20, valid: 18, seconds: 120, avgDepth: 92, issues: ['Not deep enough'] }, a);
  assert.equal(r.status, 200);
  const w = r.body.workouts[0];
  assert.equal(w.form_score, 90); assert.equal(w.kcal, Math.round(5 * 90 * 120 / 3600)); assert.deepEqual(w.issues, ['Not deep enough']);
  assert.equal((await call('GET', '/api/workouts', null, b)).body.workouts.length, 0);
  assert.equal((await call('GET', '/api/workouts')).status, 401);
});

test('sign-up stores sex/height/weight and sets the calorie goal; bad values reject the sign-up', async () => {
  const email = `body-${Date.now()}@example.com`;
  const profile = { firstName: 'Ada', lastName: 'Lovelace', age: 30, missionYears: 1, acceptTerms: true };
  const send = async () => (await call('POST', '/api/auth/code', { email, purpose: 'signup' })).body.devCode;
  const code = await send();
  let r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code, profile: { ...profile, sex: 'robot', heightCm: 180, weightKg: 90 } });
  assert.equal(r.status, 400);                                   // rejected ...
  assert.equal((await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code, profile: { ...profile, sex: 'male', heightCm: 20, weightKg: 90 } })).status, 400);
  r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code, profile: { ...profile, sex: 'male', heightCm: 180, weightKg: 90 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));            // ... and nothing was half-created, so it still works afterwards
  const token = r.body.token;
  const p = (await call('GET', '/api/profile/body', null, token)).body.profile;
  assert.equal(p.height_cm, 180); assert.equal(p.weight_kg, 90); assert.equal(p.sex, 'male'); assert.ok(p.kcal > 2000);
});

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

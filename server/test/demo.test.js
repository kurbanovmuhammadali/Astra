process.env.DB_FILE = ':memory:';
process.env.DEMO_ACCOUNTS = 'on';
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
const jar = () => { let cookie = ''; return async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => ({})) };
}; };
const astro = jar(), doc = jar(), lead = jar();

test('one-click demo sign-in for astronaut, doctor and team leader', async () => {
  const a = await astro('POST', '/api/demo/login', { as: 'astronaut' });
  assert.equal(a.status, 200); assert.equal(a.body.user.role, 'astronaut'); assert.equal(a.body.user.demo, true);
  const d = await doc('POST', '/api/demo/login', { as: 'doctor' });
  assert.equal(d.body.user.role, 'surgeon'); assert.equal(d.body.user.admin, true);
  const l = await lead('POST', '/api/demo/login', { as: 'leader' });
  assert.equal(l.body.user.role, 'leader'); assert.equal(l.body.user.admin, true); assert.equal(l.body.user.leader, true);
});
test('the Mars demo astronaut has messages only, the ISS demo astronaut has live calls', async () => {
  const a = await astro('GET', '/api/auth/me'); assert.equal(a.body.user.liveCalls, false); assert.equal(a.body.user.linkDelayMin, 12);
  const iss = jar(); const m = await iss('POST', '/api/demo/login', { as: 'astronaut-iss' });
  assert.equal(m.body.user.liveCalls, true); assert.equal(m.body.user.linkDelayMin, 0);
});
test('the demo astronaut has data, a health file the SI can read, a crew and reports', async () => {
  const dash = await astro('GET', '/api/dashboard'); assert.equal(dash.status, 200); assert.ok(dash.body.readiness > 0);
  const bg = await astro('GET', '/api/me/background');
  assert.match(bg.body.background.allergies, /Penicillin/); assert.equal(bg.body.files.length, 1);
  const { aiSummary, aiFiles } = await import('../src/background.js');
  const { db } = await import('../src/db.js');
  const id = db.prepare("SELECT id FROM users WHERE email = 'astronaut@demo.celeste'").get().id;
  assert.match(aiSummary(id), /ALLERGIES.*Penicillin/); assert.match(aiFiles(id).text[0].text, /Vitamin D/);
  const handoffs = await doc('GET', '/api/admin/handoffs'); assert.equal(handoffs.status, 200); assert.ok(handoffs.body.handoffs.length >= 4);
  assert.ok((await doc('GET', '/api/admin/crew')).body.crew.length >= 4);
});
test('only the team leader sees the overview: doctors, astronauts, reports and replies', async () => {
  assert.equal((await astro('GET', '/api/leader/overview')).status, 403);
  assert.equal((await doc('GET', '/api/leader/overview')).status, 403);
  const o = await lead('GET', '/api/leader/overview'); assert.equal(o.status, 200);
  assert.equal(o.body.summary.doctors, 2); assert.equal(o.body.summary.astronauts, 4); assert.equal(o.body.summary.open, 2);
  const voss = o.body.doctors.find(x => x.name.includes('Voss')); assert.equal(voss.answered, 1); assert.ok(voss.avgResponseMinutes >= 20);
  assert.ok(o.body.reports.some(r => r.answered && r.answerNote));
});
test('demo accounts can be switched off', async () => {
  process.env.DEMO_ACCOUNTS = 'off';
  assert.equal((await jar()('POST', '/api/demo/login', { as: 'doctor' })).status, 404);
  process.env.DEMO_ACCOUNTS = 'on';
});
test.after(() => srv.close());

test('the demo relative: a private link with messages and a photo; family sends a video through resumable upload; no calls', async () => {
  const h = await (await fetch(`${base}/api/health`)).json(); assert.ok(h.demoFamilyToken && h.demoFamilyToken.length >= 20);
  const t = h.demoFamilyToken;
  const msgs = (await (await fetch(`${base}/api/family/${t}/messages`)).json()).messages;
  assert.ok(msgs.length >= 3); const photo = msgs.find(m => m.kind === 'photo'); assert.ok(photo && photo.hasMedia);
  const img = await fetch(`${base}/api/family/${t}/messages/${photo.id}/media`); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await img.arrayBuffer()).subarray(1, 4).toString(), 'PNG'); // a real picture
  // the relative sends a video: announce, upload in two pieces with the family link as credential, then post the message
  const video = Buffer.alloc(900_000, 3);
  const call = (path, method, body, extra = {}) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': body && Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', 'X-Family-Token': t, ...extra }, body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const init = await call('/api/upload', 'POST', { size: video.length, mime: 'video/webm', kind: 'video' }); assert.equal(init.status, 200);
  assert.equal((await call(`/api/upload/${init.body.id}?offset=0`, 'PUT', video.subarray(0, 500_000))).body.received, 500_000);
  assert.equal((await call(`/api/upload/${init.body.id}`, 'GET')).body.received, 500_000);
  assert.equal((await call(`/api/upload/${init.body.id}?offset=500000`, 'PUT', video.subarray(500_000))).body.done, true);
  const post = await call(`/api/family/${t}/messages`, 'POST', { kind: 'video', uploadId: init.body.id, seconds: 30, clientId: 'rel-1', text: 'We are waving!' }); assert.equal(post.status, 200);
  assert.equal((await call(`/api/family/${t}/messages`, 'POST', { kind: 'video', uploadId: init.body.id, clientId: 'rel-1' })).body.duplicate, true);
  const after = (await (await fetch(`${base}/api/family/${t}/messages`)).json()).messages; assert.ok(after.some(m => m.kind === 'video' && m.fromFamily === 1 && m.text === 'We are waving!'));
  assert.equal((await fetch(`${base}/api/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401); // no link, no upload
  // the astronaut sees the video in the app
  const mine = (await astro('GET', '/api/me/family')).body.family[0]; assert.ok(mine.unread >= 1);
});

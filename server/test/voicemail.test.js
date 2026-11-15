process.env.DB_FILE = ':memory:';
process.env.DEMO_ACCOUNTS = 'off';
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const { loginAs } = await import('./support/people.js');
const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
const jar = () => { let cookie = ''; const f = async (method, path, body, raw) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return raw ? r : { status: r.status, body: await r.json().catch(() => ({})) };
}; return f; };
const crew = jar(), doc = jar(), other = jar();
const audio = 'data:audio/webm;codecs=opus;base64,' + Buffer.from('fake-opus-audio').toString('base64');
let me;
test('setup', async () => { me = (await loginAs(crew, 'crew')).body.user.id; await loginAs(doc, 'admin'); });
test('delay-tolerant voice messages: astronaut to doctors, doctor back to the astronaut', async () => {
  assert.equal((await crew('POST', '/api/voicemail', { to: 'doctors', audio: 'nope', seconds: 5 })).status, 400);
  assert.equal((await crew('POST', '/api/voicemail', { to: 7, audio, seconds: 5 })).status, 403); // an astronaut only writes to the doctors
  const sent = await crew('POST', '/api/voicemail', { to: 'doctors', audio, seconds: 12 }); assert.equal(sent.status, 200);
  const inbox = await doc('GET', '/api/voicemail'); assert.equal(inbox.body.messages.length, 1); assert.equal(inbox.body.unheard, 1);
  const a = await doc('GET', `/api/voicemail/${sent.body.id}/audio`, null, true); assert.equal(a.status, 200); assert.match(a.headers.get('content-type'), /audio\/webm/);
  assert.equal((await doc('GET', '/api/voicemail')).body.unheard, 0); // heard
  assert.equal((await other('GET', `/api/voicemail/${sent.body.id}/audio`, null, true)).status, 401);
  const back = await doc('POST', '/api/voicemail', { to: me, audio, seconds: 8 }); assert.equal(back.status, 200);
  assert.equal((await crew('GET', '/api/voicemail')).body.unheard, 1);
  assert.equal((await doc('POST', '/api/voicemail', { to: 'doctors', audio, seconds: 3 })).status, 400);
  assert.equal((await crew('DELETE', `/api/voicemail/${back.body.id}`)).body.ok, true);
  assert.equal((await crew('GET', '/api/voicemail')).body.messages.length, 0);
});
test('too long recordings are refused', async () => {
  const big = 'data:audio/webm;base64,' + 'A'.repeat(700_000);
  assert.equal((await crew('POST', '/api/voicemail', { to: 'doctors', audio: big, seconds: 90 })).status, 413);
});
test.after(() => srv.close());

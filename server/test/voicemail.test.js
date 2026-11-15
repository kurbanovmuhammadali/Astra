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
  const big = 'data:audio/webm;base64,' + 'A'.repeat(4_300_000);
  assert.equal((await crew('POST', '/api/voicemail', { to: 'doctors', audio: big, seconds: 90 })).status, 413);
});
test.after(() => srv.close());

test('text and video messages; the link class decides whether live calls exist at all', async () => {
  const { liveCallOk, delayMinFor } = await import('../src/linkdelay.js');
  assert.equal(liveCallOk({ environment: 'station' }), true);                    // ISS: live calls fine
  assert.equal(liveCallOk({ environment: 'lunar' }), true);                      // Moon: 1.3 s one way, still a conversation
  assert.equal(liveCallOk({ environment: 'mars' }), false);                      // Mars: 12 minutes one way: messages only
  assert.equal(liveCallOk({ environment: 'station', mission_goal: JSON.stringify({ dest: 'jupiter' }) }), false); // the goal beats the habitat
  assert.equal(delayMinFor({ environment: 'mars' }), 12);
  const t = await crew('POST', '/api/voicemail', { to: 'doctors', kind: 'text', text: 'Headache since morning, vision slightly blurred.', urgent: true });
  assert.equal(t.status, 200);
  const v = await crew('POST', '/api/voicemail', { to: 'doctors', kind: 'video', media: 'data:video/webm;codecs=vp8,opus;base64,' + Buffer.from('fake-video').toString('base64'), seconds: 20 });
  assert.equal(v.status, 200);
  assert.equal((await crew('POST', '/api/voicemail', { to: 'doctors', kind: 'video', media: 'data:audio/webm;base64,QUJD' })).status, 400); // a "video" that is audio
  const inbox = await doc('GET', '/api/voicemail');
  assert.ok(inbox.body.messages.some(m => m.kind === 'text' && m.urgent && /Headache/.test(m.text)));
  assert.equal(inbox.body.messages[0].urgent, true); // urgent first
  const vid = await doc('GET', `/api/voicemail/${v.body.id}/media`, null, true); assert.match(vid.headers.get('content-type'), /video\/webm/);
  assert.ok((await crew('GET', '/api/voicemail')).body.outbox.length >= 2);
});
test('with LINK_DELAY_SIM on, a message is held for the signal time', async () => {
  process.env.LINK_DELAY_SIM = 'on';
  const { db } = await import('../src/db.js');
  const meId = db.prepare("SELECT id FROM users WHERE email = 'crew@test.local'").get().id;
  db.prepare("UPDATE users SET environment = 'mars', mission_goal = NULL WHERE id = ?").run(meId);
  const r = await crew('POST', '/api/voicemail', { to: 'doctors', kind: 'text', text: 'Mars message' });
  assert.equal(r.body.inTransit, true);
  assert.ok(!(await doc('GET', '/api/voicemail')).body.messages.some(m => m.text === 'Mars message')); // not delivered yet
  assert.ok((await crew('GET', '/api/voicemail')).body.outbox.some(m => m.text === 'Mars message' && m.inTransit));
  process.env.LINK_DELAY_SIM = 'off';
  db.prepare("UPDATE users SET environment = 'station' WHERE id = ?").run(meId);
});

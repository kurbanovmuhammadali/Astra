// Runs the server as it runs in production: no dev codes, no demo account, real (here: captured / fake) delivery.
process.env.DB_FILE = ':memory:';
process.env.NODE_ENV = 'production';
process.env.TOKEN_ENC_KEY = 'test-key-for-mail-tests-0123456789abcdef';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
const { app } = await import('../src/index.js');
const { setMailTransport, mailProvider } = await import('../src/mail.js');

const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let hop = 0; // each call comes from a fresh client IP so the per-IP rate limit does not interfere with what is being tested
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', 'X-Client': 'native', 'X-Forwarded-For': `10.1.${hop >> 8}.${hop++ & 255}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
test.after(() => srv.close());

const profile = { firstName: 'Nora', lastName: 'Vale', age: 41, missionYears: 1, acceptTerms: true };
const inbox = [];
const capture = async m => { inbox.push(m); };
const codeOf = m => /code: (\d{6})/.exec(m.subject)[1];

test('production without a mail provider refuses instead of leaking codes', async () => {
  assert.equal(mailProvider(), 'none');
  const r = await call('POST', '/api/auth/code', { email: 'a1@crew.test', purpose: 'signup' });
  assert.equal(r.status, 503);
  assert.equal(r.body.devCode, undefined);
  assert.equal((await call('GET', '/api/health')).body.email, 'none');
});

test('a real code is e-mailed, never returned, and verifies once', async () => {
  setMailTransport(capture);
  const email = 'nora@crew.test';
  let r = await call('POST', '/api/auth/code', { email, purpose: 'signup' });
  assert.equal(r.status, 200);
  assert.equal(r.body.devCode, undefined, 'the code must only travel by email');
  assert.equal(r.body.codeLength, 6);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].to, email);
  assert.match(inbox[0].subject, /Your Astra verification code: \d{6}/);
  assert.ok(inbox[0].text.includes(codeOf(inbox[0])) && inbox[0].html.includes(codeOf(inbox[0])));
  assert.match(inbox[0].text, /expires in 10 minutes/);

  r = await call('POST', '/api/auth/code', { email, purpose: 'signup' });          // immediate resend
  assert.equal(r.status, 429); assert.match(r.body.error, /wait \d+ seconds/);
  assert.equal(inbox.length, 1, 'no second email during the cooldown');

  const code = codeOf(inbox[0]);
  r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code: code === '123456' ? '654321' : '123456', profile });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code, profile });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token);
  r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code, profile });
  assert.equal(r.status, 400, 'single use');
});

test('login: same answer for known and unknown emails (no account enumeration)', async () => {
  inbox.length = 0;
  const known = await call('POST', '/api/auth/code', { email: 'nora@crew.test', purpose: 'login' });
  const unknown = await call('POST', '/api/auth/code', { email: 'ghost@crew.test', purpose: 'login' });
  assert.equal(known.status, 200); assert.equal(unknown.status, 200);
  assert.deepEqual(Object.keys(known.body).sort(), Object.keys(unknown.body).sort());
  await new Promise(r => setTimeout(r, 30));
  const toKnown = inbox.find(m => m.to === 'nora@crew.test'), toGhost = inbox.find(m => m.to === 'ghost@crew.test');
  assert.match(toKnown.subject, /verification code/);
  assert.match(toGhost.subject, /sign-in attempt/);
  assert.ok(!/\d{6}/.test(toGhost.text), 'an unknown address never receives a code');
  const r = await call('POST', '/api/auth/code/verify', { email: 'ghost@crew.test', purpose: 'login', code: '111111' });
  assert.equal(r.status, 400);
  // existing account asked to sign up: generic answer + notice, not a 409
  inbox.length = 0;
  const dup = await call('POST', '/api/auth/code', { email: 'nora@crew.test', purpose: 'signup' });
  assert.equal(dup.status, 200);
  await new Promise(r => setTimeout(r, 30));
  assert.match(inbox[0].subject, /already have an account/);
});

test('delivery failure -> 502, nothing stored, retry allowed at once', async () => {
  setMailTransport(async () => { throw new Error('smtp down'); });
  const email = 'fail@crew.test';
  let r = await call('POST', '/api/auth/code', { email, purpose: 'signup' });
  assert.equal(r.status, 502);
  inbox.length = 0; setMailTransport(capture);
  r = await call('POST', '/api/auth/code', { email, purpose: 'signup' });
  assert.equal(r.status, 200);
  assert.equal(inbox.length, 1);
});

test('five wrong guesses lock the code', async () => {
  inbox.length = 0;
  const email = 'lock@crew.test';
  await call('POST', '/api/auth/code', { email, purpose: 'signup' });
  const right = codeOf(inbox[0]);
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code: wrong, profile })).status, 400);
  const r = await call('POST', '/api/auth/code/verify', { email, purpose: 'signup', code: right, profile });
  assert.equal(r.status, 429, 'even the right code is refused after 5 misses');
});

test('Resend provider: correct request is sent', async () => {
  setMailTransport(null);
  process.env.RESEND_API_KEY = 're_test_placeholder'; process.env.MAIL_FROM = 'Astra <no-reply@example.test>';
  assert.equal(mailProvider(), 'resend');
  const real = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { if (String(url).startsWith('https://api.resend.com')) { seen = { url: String(url), init }; return new Response('{"id":"x"}', { status: 200 }); } return real(url, init); };
  try {
    const r = await call('POST', '/api/auth/code', { email: 'resend@crew.test', purpose: 'signup' });
    assert.equal(r.status, 200);
    assert.equal(seen.url, 'https://api.resend.com/emails');
    assert.equal(seen.init.headers.Authorization, 'Bearer re_test_placeholder');
    const b = JSON.parse(seen.init.body);
    assert.deepEqual(b.to, ['resend@crew.test']); assert.equal(b.from, 'Astra <no-reply@example.test>');
    assert.match(b.subject, /verification code: \d{6}/);
    // provider rejects -> user sees a clean 502, not the provider's message
    globalThis.fetch = async (url, init) => (String(url).startsWith('https://api.resend.com') ? new Response('{"message":"domain not verified"}', { status: 403 }) : real(url, init));
    const bad = await call('POST', '/api/auth/code', { email: 'resend2@crew.test', purpose: 'signup' });
    assert.equal(bad.status, 502); assert.ok(!/domain/.test(JSON.stringify(bad.body)));
  } finally { globalThis.fetch = real; delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; }
});

test('SMTP provider: message really goes over an SMTP conversation', async () => {
  const got = { data: '' };
  const smtp = net.createServer(sock => {
    let inData = false;
    sock.write('220 test ESMTP\r\n');
    sock.on('data', buf => {
      for (const line of buf.toString().split('\r\n').filter(Boolean)) {
        if (inData) { if (line === '.') { inData = false; sock.write('250 queued\r\n'); } else got.data += line + '\n'; continue; }
        const c = line.toUpperCase();
        if (c.startsWith('EHLO') || c.startsWith('HELO')) sock.write('250 test\r\n');
        else if (c.startsWith('DATA')) { inData = true; sock.write('354 go\r\n'); }
        else if (c.startsWith('QUIT')) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
  });
  await new Promise(r => smtp.listen(0, '127.0.0.1', r));
  process.env.SMTP_URL = `smtp://127.0.0.1:${smtp.address().port}?ignoreTLS=true`; process.env.MAIL_FROM = 'Astra <no-reply@example.test>';
  try {
    assert.equal(mailProvider(), 'smtp');
    const r = await call('POST', '/api/auth/code', { email: 'smtp@crew.test', purpose: 'signup' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(got.data, /To: smtp@crew\.test/);
    assert.match(got.data, /Subject: Your Astra verification code: \d{6}/);
  } finally { smtp.close(); delete process.env.SMTP_URL; delete process.env.MAIL_FROM; }
});

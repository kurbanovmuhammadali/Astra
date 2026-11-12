process.env.DB_FILE = ':memory:';
process.env.GEMINI_API_KEY = 'test-gemini-key-123';
delete process.env.ANTHROPIC_API_KEY;
import test from 'node:test';
import assert from 'node:assert/strict';

// Fake Google endpoint: record the call, answer from a queue. Everything else (our own server) passes through.
const realFetch = globalThis.fetch;
const calls = [];
let reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'Your sleep is fine. [R1]' }] }, finishReason: 'STOP' }] } });
globalThis.fetch = async (url, opts) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, opts);
  calls.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) });
  const r = reply();
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
};

const { app } = await import('../src/index.js');
const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let hop = 0;
const call = async (method, path, body, token) => {
  const r = await realFetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', 'X-Client': 'native', 'X-Forwarded-For': `10.5.0.${hop++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
test.after(() => srv.close());
const guest = async () => (await call('POST', '/api/auth/guest', {})).body.token;

test('health reports Gemini as the provider without exposing the key', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.body.ai, true); assert.equal(r.body.aiProvider, 'Google Gemini');
  assert.ok(!JSON.stringify(r.body).includes('test-gemini-key'));
});

test('Ask Astra: only with consent, key in header not URL, guardrails still apply', async () => {
  const t = await guest();
  calls.length = 0;
  let r = await call('POST', '/api/assistant', { question: 'How is my sleep?', aiConsent: false }, t);
  assert.equal(r.body.mode, 'offline'); assert.equal(calls.length, 0, 'no consent -> nothing leaves the server');

  r = await call('POST', '/api/assistant', { question: 'How is my sleep?', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], aiConsent: true }, t);
  assert.equal(r.status, 200); assert.equal(r.body.mode, 'gemini');
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.match(c.url, /gemini-flash-latest:generateContent$/);
  assert.ok(!c.url.includes('test-gemini-key'), 'key must not be in the URL');
  assert.equal(c.headers['x-goog-api-key'], 'test-gemini-key-123');
  assert.match(c.body.systemInstruction.parts[0].text, /DATA:/);
  assert.equal(c.body.contents.at(-1).parts[0].text, 'How is my sleep?');
  assert.ok(c.body.contents.every(x => ['user', 'model'].includes(x.role)));
  assert.ok(!JSON.stringify(c.body).includes('guest-'), 'no e-mail / identity in the prompt');
});

test('Ask Astra: Gemini error or safety block falls back to the offline answer', async () => {
  const t = await guest();
  reply = () => ({ status: 403, body: { error: { message: 'API key not valid' } } });
  let r = await call('POST', '/api/assistant', { question: 'Why am I flagged?', aiConsent: true }, t);
  assert.equal(r.status, 200); assert.equal(r.body.mode, 'offline'); assert.equal(r.body.degraded, true);
  assert.ok(!JSON.stringify(r.body).includes('test-gemini-key'));
  reply = () => ({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } });
  r = await call('POST', '/api/assistant', { question: 'Why am I flagged?', aiConsent: true }, t);
  assert.equal(r.body.mode, 'offline');
  reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
});

test('photo estimate through Gemini: image sent inline, JSON parsed and clamped, errors hidden', async () => {
  const t = await guest();
  const img = Buffer.alloc(300, 9).toString('base64');
  calls.length = 0;
  reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: '{"items":[{"name":"Plov","grams":300,"kcal":570,"protein":18,"carbs":72,"fat":21},{"name":"Air","grams":1,"kcal":0}],"confidence":"medium","note":"oil unknown"}' }] } }] } });
  let r = await call('POST', '/api/food/photo', { image: img, mediaType: 'image/jpeg', consent: true }, t);
  assert.equal(r.status, 200); assert.deepEqual(r.body.items.map(i => i.name), ['Plov']);
  const parts = calls[0].body.contents[0].parts;
  assert.equal(parts[0].inline_data.mime_type, 'image/jpeg'); assert.equal(parts[0].inline_data.data, img);
  assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
  assert.equal((await call('POST', '/api/food/photo', { image: img, mediaType: 'image/jpeg' }, t)).status, 400);   // no consent

  reply = () => ({ status: 429, body: { error: { message: 'quota exceeded for key test-gemini-key-123' } } });
  r = await call('POST', '/api/food/photo', { image: img, mediaType: 'image/jpeg', consent: true }, t);
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes('quota') && !JSON.stringify(r.body).includes('test-gemini-key'), 'provider details and key never reach the client');
});

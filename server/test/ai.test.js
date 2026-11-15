process.env.DB_FILE = ':memory:';
process.env.DEMO_LOGIN = 'on';
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
import test from 'node:test';
import assert from 'node:assert/strict';
const { app } = await import('../src/index.js');
const { geminiBody } = await import('../src/llm.js');

const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;
let cookie = '';
const call = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'perigee', cookie }, body: JSON.stringify(body) }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, body: await r.json() }; };

test('Gemini request body: roles, system prompt, image on the last user turn, JSON mode', () => {
  const b = geminiBody({ system: 'SYS', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'eat' }], json: true, images: [{ mime: 'image/png', data: 'AAA' }] });
  assert.equal(b.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(b.contents.map(c => c.role), ['user', 'model', 'user']);
  assert.equal(b.contents[2].parts[1].inlineData.mimeType, 'image/png');
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.ok(b.generationConfig.maxOutputTokens >= 1500);
});
test('assistant says "not configured" instead of failing when no key is set', async () => {
  await call('/api/demo/login', { as: 'crew' });
  assert.equal((await call('/api/assistant', { messages: [{ role: 'user', text: 'hi' }] })).status, 503);
});
test.after(() => srv.close());

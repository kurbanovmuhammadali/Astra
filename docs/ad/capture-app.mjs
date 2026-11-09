// Captures real Astra screens from the local dev app at iPhone resolution (393×852 @3x) for the ad.
//   node capture-app.mjs [route ...]   (needs the api on :4000 and the web app on :8082; logs in with the dev demo crew account)
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/plan'];
const APP = process.env.APP || 'http://localhost:8082', API = process.env.API || 'http://localhost:4000';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const p = await b.newPage();
await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto(APP + '/welcome?frame=0', { waitUntil: 'networkidle2' });
const who = await p.evaluate(async api => {
  const post = (u, body) => fetch(api + u, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const email = 'crew@astra.demo';
  const c = await post('/api/auth/code', { email, purpose: 'login' });
  const v = await post('/api/auth/code/verify', { email, purpose: 'login', code: c.devCode });
  return v.user?.name || JSON.stringify(v).slice(0, 200);
}, API);
console.log('logged in as', who);
// hide the cookie banner (records the privacy-preserving "essential only" choice the banner itself offers)
await p.evaluate(() => localStorage.setItem('pg_cookie_consent', JSON.stringify({ v: 'essential', essential: true, analytics: false, at: new Date().toISOString() })));
await mkdir('assets/app', { recursive: true });
for (const r of routes) {
  await p.goto(APP + r + (r.includes('?') ? '&' : '?') + 'frame=0', { waitUntil: 'networkidle2' });
  await new Promise(res => setTimeout(res, 2500)); // let entrance animations settle
  const name = r.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
  await p.screenshot({ path: `assets/app/${name}.png` });
  if (process.env.TALL) { // whole scroll height in one image, for a real scroll in the ad
    const h = +process.env.TALL; await p.setViewport({ width: 393, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await new Promise(res => setTimeout(res, 1500)); await p.screenshot({ path: `assets/app/${name}-tall.png` });
    await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  }
  const h = await p.evaluate(() => { const s = [...document.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY !== 'visible'); return s ? s.scrollHeight : 0; });
  console.log('captured', r, '→', `assets/app/${name}.png`, 'scrollHeight', h);
  const logo = await p.evaluate(() => { const el = document.querySelector('[aria-label="Astra"] svg'); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  if (logo) console.log('  logo star (pt):', JSON.stringify(logo));
}
await b.close();

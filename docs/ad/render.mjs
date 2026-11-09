// Export an ad page to a 1080×1920 MP4, frame by frame (no screen recording, no dropped frames).
//   cd docs/ad && npm install && node render.mjs                       → astra-ad-v3.mp4 from index.html (60 fps)
//   node render.mjs --page v2.html --fps 30 --out astra-ad-v2.mp4
//   node render.mjs --stills 1,3.5,8                                   → stills/t1.00.jpg …
//   node render.mjs --audio music.mp3                                  → muxes a soundtrack (trimmed + faded)
// Needs Google Chrome and ffmpeg (brew install ffmpeg). Pages must expose window.D, window.render(t) and window.ready.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const fps = +arg('fps', 60);
const pageFile = arg('page', 'index.html');
const out = arg('out', 'astra-ad-v3.mp4');
const stills = arg('stills');
const audio = arg('audio');
const W = +arg('w', 1080), H = +arg('h', 1920);
const here = fileURLToPath(new URL('.', import.meta.url));
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = await start(0);
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=metal'], // Apple GPU via Metal
});
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[page error]', e.message));
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${server.address().port}/${pageFile}?export`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => typeof window.render === 'function' && !!window.ready, { timeout: 180000, polling: 250 });
await page.evaluate(() => window.ready);
const D = await page.evaluate(() => window.D);
const shot = async t => {
  await page.evaluate(t => { window.render(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
  return page.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: W, height: H } });
};

if (stills) {
  await mkdir(here + 'stills', { recursive: true });
  for (const t of stills.split(',').map(Number)) await writeFile(`${here}stills/t${t.toFixed(2)}.jpg`, await shot(t));
  console.log('stills written to', here + 'stills');
} else {
  const total = Math.round(D * fps);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    ...(audio ? ['-i', audio, '-af', `afade=t=out:st=${D - 1.5}:d=1.5`, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '15', '-preset', 'slow', '-profile:v', 'high', '-r', String(fps),
    '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', here + out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
    const buf = await shot(f / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % fps === 0) process.stdout.write(`\r${(f / fps).toFixed(0)}s / ${D}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`\nwrote ${here + out} (${total} frames @ ${fps} fps)`);
}
await browser.close();
server.close();

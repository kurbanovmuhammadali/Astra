// Original soundtrack for the Astra ad v4 — synthesized from scratch, no samples, no licensed audio.
//   node music.mjs                       → music.wav (stereo, 44.1 kHz, length of the v4 cut)
// The v4 cuts sit on an 86 BPM grid (beat = 0.698 s): word swaps, zooms and Track / Understand / Act all land on beats.
// Key of D: Dmaj9 → Bm9 → Gmaj9 → A, a drop on the beat words, and a wide Dmaj9 under the end card.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SR = 44100, SPEED = 1.13, DUR = +(23 / SPEED).toFixed(2); // must match index.html (TL 23 s played at 1.13×)
const N = Math.ceil(SR * DUR);
const BEAT = 60 / 86, b = n => n * BEAT, tl = x => x / SPEED; // beat → s, timeline time → real s
const out = { L: new Float32Array(N), R: new Float32Array(N) };
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const drums = bus(), music = bus(), fx = bus(), send = bus();
const kickEnv = new Float32Array(N); // for sidechain ducking

let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const put = (B, i, v, pan = 0, s = 0) => { if (i < 0 || i >= N) return; const l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4); B.L[i] += v * l; B.R[i] += v * r; if (s) { send.L[i] += v * l * s; send.R[i] += v * r * s; } };

// ---------------------------------------------------------------- instruments
function pad(t0, dur, notes, amp = 0.05, atk = 0.5, rel = 1.4, bright = 0.55) {
  const i0 = Math.floor(t0 * SR), len = Math.floor((dur + rel) * SR);
  notes.forEach((m, ni) => [-7, 0, 7].forEach((cents, vi) => {
    const f = mtof(m) * 2 ** (cents / 1200), pan = (vi - 1) * 0.55 + (ni % 2 ? 0.1 : -0.1);
    let ph = rnd() * 6.28;
    for (let j = 0; j < len; j++) {
      const t = j / SR, env = Math.min(1, t / atk) * (t < dur ? 1 : Math.exp(-(t - dur) / rel * 3));
      ph += 2 * Math.PI * f / SR;
      let v = 0; for (let k = 1; k <= 6; k++) v += Math.sin(ph * k) * bright ** (k - 1) / k;
      put(music, i0 + j, v * env * amp, pan, 0.35);
    }
  }));
}
function pluck(t0, m, amp = 0.16, pan = 0, decay = 0.9965) { // Karplus-Strong
  const f = mtof(m), P = Math.max(2, Math.round(SR / f)), buf = new Float32Array(P);
  for (let k = 0; k < P; k++) buf[k] = rnd() * 2 - 1;
  const i0 = Math.floor(t0 * SR), len = Math.floor(0.9 * SR);
  let idx = 0, prev = 0;
  for (let j = 0; j < len; j++) {
    const v = buf[idx], nxt = buf[(idx + 1) % P];
    buf[idx] = (v + nxt) * 0.5 * decay; idx = (idx + 1) % P;
    const y = v * 0.6 + prev * 0.4; prev = y;
    put(music, i0 + j, y * amp * Math.min(1, j / 40), pan, 0.3);
  }
}
function bass(t0, dur, m, amp = 0.22) {
  const f = mtof(m), i0 = Math.floor(t0 * SR), len = Math.floor((dur + 0.08) * SR);
  let ph = 0;
  for (let j = 0; j < len; j++) {
    const t = j / SR, env = Math.min(1, t / 0.006) * Math.exp(-t * 3.2) * (t < dur ? 1 : Math.exp(-(t - dur) * 60));
    ph += 2 * Math.PI * f / SR;
    put(music, i0 + j, Math.tanh(1.6 * (Math.sin(ph) + 0.25 * Math.sin(2 * ph))) * env * amp, 0, 0);
  }
}
function kick(t0, amp = 0.9) {
  const i0 = Math.floor(t0 * SR), len = Math.floor(0.45 * SR);
  let ph = 0;
  for (let j = 0; j < len; j++) {
    const t = j / SR, f = 46 + 110 * Math.exp(-t * 32);
    ph += 2 * Math.PI * f / SR;
    const v = Math.sin(ph) * Math.exp(-t * 7.5) + (j < 140 ? (rnd() * 2 - 1) * 0.25 * (1 - j / 140) : 0);
    put(drums, i0 + j, Math.tanh(v * 1.4) * amp, 0, 0);
    if (i0 + j < N) kickEnv[i0 + j] = Math.max(kickEnv[i0 + j], amp * Math.exp(-t * 9));
  }
}
function noiseHit(t0, dur, amp, hp, lp, pan = 0, sendAmt = 0, B = drums, shape = t => Math.exp(-t * 30)) {
  const i0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  let lpS = 0, hpS = 0, prevX = 0;
  const aL = 1 - Math.exp(-2 * Math.PI * lp / SR), aH = Math.exp(-2 * Math.PI * hp / SR);
  for (let j = 0; j < len; j++) {
    const x = rnd() * 2 - 1;
    hpS = aH * (hpS + x - prevX); prevX = x;   // one-pole high-pass
    lpS += aL * (hpS - lpS);                   // one-pole low-pass
    put(B, i0 + j, lpS * amp * shape(j / SR), pan, sendAmt);
  }
}
const hat = (t0, amp = 0.12, open = false) => noiseHit(t0, open ? 0.22 : 0.05, amp, 7000, 14000, 0.25, 0.05, drums, t => Math.exp(-t * (open ? 14 : 70)));
const clap = (t0, amp = 0.45) => { [0, 0.011, 0.023].forEach((d, k) => noiseHit(t0 + d, 0.2, amp * (k === 2 ? 1 : 0.6), 900, 3200, -0.1, 0.35, drums, t => Math.exp(-t * (k === 2 ? 18 : 90)))); };
function bell(t0, m, amp = 0.12, pan = 0) { // FM bell for the star moments
  const f = mtof(m), i0 = Math.floor(t0 * SR), len = Math.floor(2.2 * SR);
  let pc = 0, pm = 0;
  for (let j = 0; j < len; j++) {
    const t = j / SR; pm += 2 * Math.PI * f * 3.5 / SR; pc += 2 * Math.PI * f / SR;
    const v = Math.sin(pc + Math.sin(pm) * 2.2 * Math.exp(-t * 4)) * Math.exp(-t * 2.2) * Math.min(1, j / 30);
    put(fx, i0 + j, v * amp, pan, 0.5);
  }
}
function impact(t0, amp = 0.6) {
  kick(t0, amp);
  const i0 = Math.floor(t0 * SR), len = Math.floor(1.8 * SR);
  let ph = 0;
  for (let j = 0; j < len; j++) { const t = j / SR; ph += 2 * Math.PI * (38 + 20 * Math.exp(-t * 4)) / SR; put(fx, i0 + j, Math.sin(ph) * Math.exp(-t * 2.4) * amp * 0.55, 0, 0.2); }
  noiseHit(t0, 1.2, amp * 0.5, 60, 1400, 0, 0.6, fx, t => Math.exp(-t * 5));
}
function whoosh(tc, dur = 0.5, amp = 0.35, dir = 1) { // centred on tc
  const t0 = tc - dur / 2, i0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  let lpS = 0;
  for (let j = 0; j < len; j++) {
    const k = j / len, lp = 300 + 5200 * Math.sin(Math.PI * k) ** 2, a = 1 - Math.exp(-2 * Math.PI * lp / SR);
    lpS += a * ((rnd() * 2 - 1) - lpS);
    put(fx, i0 + j, lpS * amp * Math.sin(Math.PI * k) ** 2 * 1.6, dir * (k * 2 - 1) * 0.8, 0.25);
  }
}
function riser(t0, t1, amp = 0.22) {
  const i0 = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let ph = 0, hpS = 0, prevX = 0;
  for (let j = 0; j < len; j++) {
    const k = j / len, f = 180 * 2 ** (k * 3.4);
    ph += 2 * Math.PI * f / SR;
    const x = rnd() * 2 - 1, aH = Math.exp(-2 * Math.PI * (400 + 6000 * k) / SR); hpS = aH * (hpS + x - prevX); prevX = x;
    put(fx, i0 + j, (Math.sin(ph) * 0.35 + hpS * 0.9) * amp * k ** 2.2, Math.sin(k * 12) * 0.3, 0.3);
  }
}
const tick = (t0, amp = 0.08) => noiseHit(t0, 0.02, amp, 2500, 9000, 0.3, 0.05, fx, t => Math.exp(-t * 300));
function pop(t0, amp = 0.25) { const i0 = Math.floor(t0 * SR), len = Math.floor(0.12 * SR); let ph = 0; for (let j = 0; j < len; j++) { const t = j / SR; ph += 2 * Math.PI * (1400 * Math.exp(-t * 30) + 300) / SR; put(fx, i0 + j, Math.sin(ph) * Math.exp(-t * 40) * amp, 0.2, 0.2); } }

// ---------------------------------------------------------------- the score
const CH = { // pad voicings · bass root · arp tones
  D: { pad: [50, 57, 61, 64, 66], root: 38, arp: [62, 66, 69, 73, 76] },
  Bm: { pad: [47, 54, 57, 61, 62], root: 35, arp: [59, 62, 66, 69, 73] },
  G: { pad: [43, 50, 54, 57, 59], root: 31, arp: [55, 59, 62, 66, 69] },
  A: { pad: [45, 52, 57, 61, 64], root: 33, arp: [57, 61, 64, 69, 71] },
};
const PROG = [[0, 'D'], [4, 'Bm'], [8, 'G'], [12, 'A'], [16, 'D'], [18, 'Bm'], [20, 'A'], [21, 'Bm'], [22, 'G'], [23, 'A'], [24, 'D']];
const chordAt = beat => { let c = 'D'; for (const [s, n] of PROG) if (beat >= s) c = n; return CH[c]; };
const END = DUR / BEAT; // ≈ 29.2 beats

// pads: one per chord span; the end card gets a long, wide Dmaj9
PROG.forEach(([s, n], i) => {
  const e = i + 1 < PROG.length ? PROG[i + 1][0] : 25;
  const stab = s >= 21 && s < 24;
  pad(b(s), b(e - s) * (stab ? 0.55 : 1), CH[n].pad, stab ? 0.07 : 0.045, stab ? 0.01 : 0.45, stab ? 0.5 : 1.2, stab ? 0.7 : 0.5);
});
pad(b(24), DUR - b(24), [38, 50, 57, 61, 64, 66, 69], 0.05, 0.3, 1.5, 0.45);

// arpeggio (16ths) from the "Ask" scene through the phone scene, quieter in the half-time build
for (let s = 4 * 4; s < 21 * 4; s++) {
  const beat = s / 4, c = chordAt(beat), pat = [0, 2, 1, 3, 2, 4, 3, 1];
  const vel = (s % 4 === 0 ? 1 : 0.62) * (beat >= 16 && beat < 19 ? 0.6 : 1) * (beat < 6 ? (beat - 4) / 2 * 0.7 + 0.3 : 1);
  pluck(b(beat), c.arp[pat[s % 8]] + (beat >= 19 ? 12 : 0), 0.13 * vel, (s % 2 ? 0.35 : -0.35));
}
// bass: 8ths in the groove, long notes in the build, hits on the drop, a low pedal under the end card
for (let e = 16; e < 32; e++) { const beat = e / 2; bass(b(beat), BEAT * 0.42, chordAt(beat).root + (e % 4 === 3 ? 12 : 0), e % 2 ? 0.16 : 0.22); }
[16, 18, 20].forEach(beat => bass(b(beat), b(beat >= 20 ? 1 : 2) * 0.95, chordAt(beat).root, 0.2));
[21, 22, 23].forEach(beat => bass(b(beat), BEAT * 0.5, chordAt(beat).root, 0.28));
bass(b(25), DUR - b(25), 26, 0.16);

// drums
for (let beat = 4; beat < 8; beat++) { kick(b(beat), 0.55); hat(b(beat + 0.5), 0.08); }
for (let beat = 8; beat < 16; beat++) {
  kick(b(beat), 0.85); if (beat % 2 === 1) clap(b(beat));
  for (let q = 0; q < 4; q++) hat(b(beat + q / 4), q % 2 ? 0.07 : 0.11, q === 2 && beat % 4 === 3);
}
[16, 18, 19.5].forEach(beat => kick(b(beat), 0.75));
for (let beat = 16; beat < 19; beat += 0.5) hat(b(beat), 0.07);
// snare roll into the drop: 8ths → 16ths → 32nds
for (let x = 19; x < 21; x += x < 20 ? 0.5 : x < 20.5 ? 0.25 : 0.125) clap(b(x), 0.12 + 0.3 * (x - 19) / 2);
// the drop: one hit per beat word, then "With ✦ Astra"
[21, 22, 23].forEach(beat => { impact(b(beat), 0.85); clap(b(beat), 0.5); hat(b(beat + 0.5), 0.1, true); });
kick(b(24), 0.6);

// sound design tied to the picture (timeline seconds → real seconds)
impact(tl(0.05), 0.35);                                           // opening reveal
whoosh(tl(2.35), 0.6, 0.3, 1);                                     // reveal zooms through
for (let n = 1; n <= 24; n++) tick(tl(2.85 + (n / 24) * 0.95), 0.05 + 0.03 * rnd()); // typing
pop(tl(4.12), 0.3);                                                // tap on send
whoosh(tl(4.45), 0.7, 0.25, -1);                                   // ripple fills the screen
riser(tl(5.6), tl(6.5), 0.18); whoosh(tl(6.55), 0.45, 0.45, -1);   // whip to the icons
whoosh(tl(8.85), 0.5, 0.35, 1);                                    // zoom-through into insights
riser(tl(11.9), tl(12.55), 0.16); whoosh(tl(12.58), 0.45, 0.45, 1); // whip up to the phone
whoosh(tl(13.9), 0.8, 0.2, -1);                                    // phone rises
riser(b(19), b(21), 0.3);                                          // build into the beat words
whoosh(tl(19.95), 0.6, 0.35, 1);                                   // zoom into the end card
impact(tl(19.8), 0.45);
// bells on every star moment
bell(tl(0.5), 81, 0.09, 0.3); bell(tl(4.85), 78, 0.1, -0.2); bell(tl(6.6), 81, 0.1, 0.2);
bell(tl(19.05), 78, 0.12, 0); bell(tl(19.06), 85, 0.07, 0.3); bell(tl(20.4), 81, 0.1, -0.2); bell(tl(20.42), 88, 0.05, 0.4);
[14.5, 14.88, 15.68].forEach(x => pop(tl(x), 0.14));                // notifications land

// ---------------------------------------------------------------- reverb (Freeverb-style) on the send bus
function reverb(inp, room = 0.86, damp = 0.25, spread = 23) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356], aps = [556, 441, 341];
  const o = new Float32Array(N);
  for (const d of combs) { const buf = new Float32Array(d + spread); let i = 0, f = 0; for (let n = 0; n < N; n++) { const y = buf[i]; f = y * (1 - damp) + f * damp; buf[i] = inp[n] * 0.12 + f * room; o[n] += y; i = (i + 1) % buf.length; } }
  for (const d of aps) { const buf = new Float32Array(d + spread); let i = 0; for (let n = 0; n < N; n++) { const bv = buf[i]; const y = -o[n] + bv; buf[i] = o[n] + bv * 0.5; o[n] = y; i = (i + 1) % buf.length; } }
  return o;
}
const rvL = reverb(send.L, 0.86, 0.25, 0), rvR = reverb(send.R, 0.86, 0.25, 23);

// ---------------------------------------------------------------- mix: sidechain music to the kick, glue, fade
let peak = 0;
for (let n = 0; n < N; n++) {
  const duck = 1 - 0.45 * Math.min(1, kickEnv[n]);
  const t = n / SR, fade = Math.min(1, t / 0.02) * (t > DUR - 1.2 ? Math.max(0, (DUR - t) / 1.2) : 1);
  out.L[n] = Math.tanh((drums.L[n] + music.L[n] * duck + fx.L[n] + rvL[n] * 0.9) * 0.9) * fade;
  out.R[n] = Math.tanh((drums.R[n] + music.R[n] * duck + fx.R[n] + rvR[n] * 0.9) * 0.9) * fade;
  peak = Math.max(peak, Math.abs(out.L[n]), Math.abs(out.R[n]));
}
const g = 0.89 / peak; // −1 dBFS peak
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) { wav.writeInt16LE(Math.round(out.L[n] * g * 32767), 44 + n * 4); wav.writeInt16LE(Math.round(out.R[n] * g * 32767), 46 + n * 4); }
const file = fileURLToPath(new URL('music.wav', import.meta.url));
writeFileSync(file, wav);
console.log(`wrote ${file} · ${DUR}s · 86 BPM · peak gain ${g.toFixed(2)}`);

// Run: npm run test:pose   (Node 22 strips the TypeScript types itself)
import test from 'node:test';
import assert from 'node:assert/strict';
import { angle, newState, step, summarize, kcalFor } from '../src/pose/reps.ts';

const blank = () => Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
const put = (lm, i, x, y) => { lm[i] = { x, y, visibility: 0.99 }; };
const both = (lm, l, r, x, y) => { put(lm, l, x, y); put(lm, r, x, y); };

// knee angle theta: ankle straight below the knee, hip rotated theta from that direction
const squatPose = th => { const lm = blank(); const r = th * Math.PI / 180; both(lm, 25, 26, 0.5, 0.6); both(lm, 27, 28, 0.5, 0.85); both(lm, 23, 24, 0.5 + 0.25 * Math.sin(r), 0.6 + 0.25 * Math.cos(r)); return lm; };
// elbow angle theta in a level plank, filmed side-on
const pushPose = (th, sag = false) => { const lm = blank(); const r = th * Math.PI / 180; put(lm, 11, 0.2, 0.5); put(lm, 12, 0.2, 0.5); both(lm, 13, 14, 0.2, 0.65); both(lm, 15, 16, 0.2 + 0.15 * Math.sin(r), 0.65 - 0.15 * Math.cos(r));
  both(lm, 23, 24, 0.5, sag ? 0.62 : 0.5); both(lm, 27, 28, 0.8, 0.5); return lm; };
const pullPose = (th, noseY) => { const lm = blank(); const r = th * Math.PI / 180; both(lm, 11, 12, 0.5, 0.4); both(lm, 13, 14, 0.5, 0.3); both(lm, 15, 16, 0.5 + 0.1 * Math.sin(r), 0.3 + 0.1 * Math.cos(r)); put(lm, 0, 0.5, noseY); return lm; };

// run a smooth cycle: start angle -> bottom -> start, `n` times, 10 fps unless fast
const run = (ex, pose, hi, lo, n, { dt = 0.1, bottom = lo, noseAtTop = 0.15 } = {}) => {
  const st = newState(); let t = 0;
  const feed = th => { st.__last = step(ex, st, ex === 'pullup' ? pose(th, th < hi - 40 ? noseAtTop : 0.45) : pose(th), t); t += dt; };
  for (let k = 0; k < 6; k++) feed(hi);
  for (let r = 0; r < n; r++) { for (let a = hi; a >= bottom; a -= 10) feed(a); for (let a = bottom; a <= hi; a += 10) feed(a); for (let k = 0; k < 3; k++) feed(hi); }
  return st;
};

test('angle() is geometric', () => {
  assert.ok(Math.abs(angle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }) - 90) < 1e-9);
  assert.ok(Math.abs(angle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }) - 180) < 1e-9);
});

test('squats: deep reps counted, shallow ones flagged, standing still counts nothing', () => {
  assert.equal(summarize(run('squat', squatPose, 175, 80, 5)).valid, 5);
  const shallow = summarize(run('squat', squatPose, 175, 110, 4));        // 110-120 deg: moved, but not deep enough
  assert.equal(shallow.valid, 0); assert.equal(shallow.partial, 4); assert.ok(shallow.issues.includes('Not deep enough'));
  assert.equal(summarize(run('squat', squatPose, 175, 175, 3)).reps, 0);
});

test('push-ups: need a level body; sagging hips are flagged; standing is ignored', () => {
  assert.equal(summarize(run('pushup', pushPose, 170, 70, 6)).valid, 6);
  const sag = summarize(run('pushup', th => pushPose(th, true), 170, 70, 3));
  assert.ok(sag.issues.some(i => i.includes('straight line')));
  // a standing person (torso vertical) must not count
  const st = newState(); const lm = squatPose(175); put(lm, 11, 0.5, 0.2); put(lm, 12, 0.5, 0.2); put(lm, 13, 0.5, 0.35); put(lm, 14, 0.5, 0.35);
  for (let t = 0; t < 3; t += 0.1) step('pushup', st, lm, t);
  assert.equal(st.tracking, false);
});

test('pull-ups: chin must clear the bar', () => {
  assert.equal(summarize(run('pullup', pullPose, 175, 60, 4, { noseAtTop: 0.15 })).valid, 4);
  const low = summarize(run('pullup', pullPose, 175, 60, 3, { noseAtTop: 0.38 }));
  assert.equal(low.valid, 0); assert.ok(low.issues.includes('Chin did not clear the bar'));
});

test('jitter and missing person do not create reps', () => {
  const fast = summarize(run('squat', squatPose, 175, 80, 5, { dt: 0.01 }));   // whole rep in 0.3 s
  assert.equal(fast.reps, 0);
  const st = newState(); step('squat', st, null, 0); assert.equal(st.tracking, false);
  const hidden = squatPose(100).map(p => ({ ...p, visibility: 0.1 })); step('squat', st, hidden, 1); assert.equal(st.tracking, false);
});

test('energy estimate', () => { assert.equal(kcalFor('squat', 90, 600), Math.round(5 * 90 * 600 / 3600)); });

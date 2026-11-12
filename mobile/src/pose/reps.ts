/**
 * Rep counting + form validation from body landmarks. Pure functions, no camera or DOM, so they are unit-tested (mobile/test/reps.test.mjs).
 *
 * Landmarks are MediaPipe Pose Landmarker's 33 points (x, y normalised 0..1, y grows DOWNWARD, plus visibility 0..1).
 * The ones used here:  0 nose · 11/12 shoulders · 13/14 elbows · 15/16 wrists · 23/24 hips · 25/26 knees · 27/28 ankles.
 * Everything is a joint ANGLE (law of cosines on three points), so it does not depend on how far you stand from the camera.
 * Erasable TypeScript only (no enums), so Node can run it directly for tests.
 */
export type LM = { x: number; y: number; visibility?: number };
export type Exercise = 'squat' | 'pushup' | 'pullup';

export const NOSE = 0, L_SHO = 11, R_SHO = 12, L_ELB = 13, R_ELB = 14, L_WRI = 15, R_WRI = 16, L_HIP = 23, R_HIP = 24, L_KNE = 25, R_KNE = 26, L_ANK = 27, R_ANK = 28;
/** Pairs drawn as the on-screen skeleton. */
export const BONES: [number, number][] = [[L_SHO, R_SHO], [L_SHO, L_ELB], [L_ELB, L_WRI], [R_SHO, R_ELB], [R_ELB, R_WRI], [L_SHO, L_HIP], [R_SHO, R_HIP], [L_HIP, R_HIP], [L_HIP, L_KNE], [L_KNE, L_ANK], [R_HIP, R_KNE], [R_KNE, R_ANK]];

export const angle = (a: LM, b: LM, c: LM): number => {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (m === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / m))) * 180) / Math.PI;
};

const MIN_VIS = 0.5;
const seen = (p?: LM) => !!p && (p.visibility ?? 1) >= MIN_VIS;
/** Angle at b using the left chain, the right chain, or their average — whichever sides are actually visible. */
function side(lm: LM[], l: [number, number, number], r: [number, number, number]): number | null {
  const ok = (t: [number, number, number]) => t.every(i => seen(lm[i]));
  const a = ok(l) ? angle(lm[l[0]], lm[l[1]], lm[l[2]]) : null;
  const b = ok(r) ? angle(lm[r[0]], lm[r[1]], lm[r[2]]) : null;
  return a != null && b != null ? (a + b) / 2 : a ?? b;
}

export type Frame = { primary: number | null; ok: boolean; hint: string; flags: string[] };

/** What this exercise measures in one frame: the main joint angle plus whether the pose makes sense (so standing around is not counted). */
export function measure(ex: Exercise, lm: LM[]): Frame {
  if (ex === 'squat') {
    const knee = side(lm, [L_HIP, L_KNE, L_ANK], [R_HIP, R_KNE, R_ANK]);
    if (knee == null) return { primary: null, ok: false, hint: 'Step back so hips, knees and ankles are in view.', flags: [] };
    return { primary: knee, ok: true, hint: '', flags: [] };
  }
  if (ex === 'pushup') {
    const elbow = side(lm, [L_SHO, L_ELB, L_WRI], [R_SHO, R_ELB, R_WRI]);
    const body = side(lm, [L_SHO, L_HIP, L_ANK], [R_SHO, R_HIP, R_ANK]);
    const sh = [L_SHO, R_SHO].filter(i => seen(lm[i]))[0], hp = [L_HIP, R_HIP].filter(i => seen(lm[i]))[0];
    if (elbow == null || sh == null || hp == null) return { primary: null, ok: false, hint: 'Film from the side so shoulder, elbow, wrist and hip are in view.', flags: [] };
    const horizontal = Math.abs(lm[sh].y - lm[hp].y) < 0.6 * Math.abs(lm[sh].x - lm[hp].x);     // torso roughly parallel to the floor
    if (!horizontal) return { primary: null, ok: false, hint: 'Get into the push-up position, body level, side-on to the camera.', flags: [] };
    return { primary: elbow, ok: true, hint: '', flags: body != null && body < 155 ? ['Keep your body in one straight line (hips sagging or piking).'] : [] };
  }
  const elbow = side(lm, [L_SHO, L_ELB, L_WRI], [R_SHO, R_ELB, R_WRI]);
  const wr = [L_WRI, R_WRI].filter(i => seen(lm[i])), sh = [L_SHO, R_SHO].filter(i => seen(lm[i]));
  if (elbow == null || !wr.length || !sh.length || !seen(lm[NOSE])) return { primary: null, ok: false, hint: 'Face the camera (or side-on) with head, arms and bar in view.', flags: [] };
  const wristY = wr.reduce((s, i) => s + lm[i].y, 0) / wr.length, shoulderY = sh.reduce((s, i) => s + lm[i].y, 0) / sh.length;
  if (wristY > shoulderY) return { primary: null, ok: false, hint: 'Hang from the bar with your hands above your shoulders.', flags: [] };
  // Chin over the bar: nose at or above wrist height (smaller y = higher). Reported separately from the elbow angle.
  return { primary: elbow, ok: true, hint: '', flags: lm[NOSE].y <= wristY ? ['__chin'] : [] };
}

type Cfg = { down: number; up: number; label: string };
/** down = angle that counts as the bottom/top of the rep ("deep enough"); up = angle that counts as fully back. Degrees. */
export const CONFIG: Record<Exercise, Cfg & { needsChin?: boolean; shallow: number; tip: string }> = {
  squat:  { down: 100, up: 160, shallow: 125, label: 'Squats',    tip: 'Stand side-on or front-on, full body in view, 2–3 m away.' },
  pushup: { down: 90,  up: 155, shallow: 115, label: 'Push-ups',  tip: 'Place the camera side-on at floor height, whole body in view.' },
  pullup: { down: 80,  up: 150, shallow: 110, label: 'Pull-ups',  tip: 'Face the camera; keep bar, hands and head in view.', needsChin: true },
};

export type Rep = { n: number; valid: boolean; extreme: number; seconds: number; issue?: string };
export type State = { phase: 'ready' | 'down'; reps: Rep[]; extreme: number; lastEdge: number; chin: boolean; smooth: number | null; hint: string; tracking: boolean; flags: Set<string> };
export const newState = (): State => ({ phase: 'ready', reps: [], extreme: 180, lastEdge: 0, chin: false, smooth: null, hint: '', tracking: false, flags: new Set() });

const MIN_REP_SECONDS = 0.7;      // faster than this is jitter, not a rep

/** Feed one frame. t = seconds. Mutates and returns the state. A rep = reach the bottom angle, then return fully to the start angle. */
export function step(ex: Exercise, st: State, lm: LM[] | null, t: number): State {
  const cfg = CONFIG[ex];
  const f = lm ? measure(ex, lm) : { primary: null, ok: false, hint: 'No person in view.', flags: [] };
  st.tracking = f.ok && f.primary != null; st.hint = f.hint;
  if (!st.tracking) return st;
  st.smooth = st.smooth == null ? f.primary! : 0.5 * st.smooth + 0.5 * f.primary!;   // light smoothing against landmark jitter
  const a = st.smooth;
  for (const fl of f.flags) if (fl !== '__chin') st.flags.add(fl);
  if (f.flags.includes('__chin')) st.chin = true;

  if (st.phase === 'ready') {
    if (a < cfg.up - 10) { st.phase = 'down'; st.extreme = a; st.lastEdge = t; st.chin = f.flags.includes('__chin'); }   // leaving the start position
    return st;
  }
  st.extreme = Math.min(st.extreme, a);
  if (a >= cfg.up) {                                       // back to the start: close the rep
    const seconds = t - st.lastEdge;
    if (seconds >= MIN_REP_SECONDS && st.extreme < cfg.shallow) {
      const deep = st.extreme <= cfg.down;
      const chinOk = !cfg.needsChin || st.chin;
      const issue = !deep ? 'Not deep enough' : !chinOk ? 'Chin did not clear the bar' : undefined;
      st.reps.push({ n: st.reps.length + 1, valid: deep && chinOk, extreme: Math.round(st.extreme), seconds: Math.round(seconds * 10) / 10, issue });
    }
    st.phase = 'ready'; st.extreme = 180; st.chin = false;
  }
  return st;
}

export type Summary = { reps: number; valid: number; partial: number; avgExtreme: number | null; avgSeconds: number | null; formScore: number; issues: string[] };
export function summarize(st: State): Summary {
  const valid = st.reps.filter(r => r.valid).length, partial = st.reps.length - valid;
  const avg = (k: 'extreme' | 'seconds') => (st.reps.length ? Math.round((st.reps.reduce((s, r) => s + r[k], 0) / st.reps.length) * 10) / 10 : null);
  const issues = [...new Set([...st.reps.map(r => r.issue).filter(Boolean) as string[], ...st.flags])];
  return { reps: st.reps.length, valid, partial, avgExtreme: avg('extreme'), avgSeconds: avg('seconds'), formScore: st.reps.length ? Math.round((valid / st.reps.length) * 100) : 0, issues };
}

/** Rough energy cost: MET x body mass (kg) x hours. MET values from the Compendium of Physical Activities (bodyweight squats/push-ups moderate ~3.8, pull-ups vigorous ~8). Estimate only. */
export const MET: Record<Exercise, number> = { squat: 5, pushup: 3.8, pullup: 8 };
export const kcalFor = (ex: Exercise, kg: number, seconds: number) => Math.round(MET[ex] * kg * (seconds / 3600));

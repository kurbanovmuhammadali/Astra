import { db, tx } from './db.js';
import { getGoal } from './food.js';

/**
 * Daily goals, tip and weekly progress — computed ONLY from what the user has actually logged or imported.
 * No data -> no number (value: null). Nothing here is ever filled in with a guess.
 * Default targets are common public-health guidance, not personal prescriptions: ~8,000 steps, >= 7 h sleep, >= 30 active minutes,
 * and calories within about 85–110% of the user's own estimated need (Food screen).
 */
export const TARGETS = { steps: 8000, sleep: 7, move: 30 };
const FOOD_BAND = [0.85, 1.1];
const DAY = 864e5;
const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

const latest = (userId, metric, day) => db.prepare('SELECT value FROM measurements WHERE user_id=? AND metric=? AND date(recorded_at)=? ORDER BY recorded_at DESC, id DESC LIMIT 1').get(userId, metric, day)?.value ?? null;

export function dayNumbers(userId, day) {
  const eaten = db.prepare('SELECT SUM(kcal) k, COUNT(*) n FROM food_log WHERE user_id=? AND day=?').get(userId, day);
  const camSeconds = db.prepare('SELECT SUM(seconds) s FROM workout_log WHERE user_id=? AND day=?').get(userId, day)?.s ?? 0;
  const ex = latest(userId, 'exercise', day);
  return {
    steps: latest(userId, 'steps', day),
    sleep: latest(userId, 'sleep', day),
    move: ex == null && !camSeconds ? null : Math.round((ex ?? 0) + camSeconds / 60),
    eaten: eaten?.n ? Math.round(eaten.k) : null,
  };
}

const goalRows = (n, foodGoal) => [
  { key: 'steps', label: 'Steps', unit: 'steps', value: n.steps == null ? null : Math.round(n.steps), goal: TARGETS.steps, kind: 'min', where: 'daily' },
  { key: 'sleep', label: 'Sleep', unit: 'h', value: n.sleep == null ? null : Math.round(n.sleep * 10) / 10, goal: TARGETS.sleep, kind: 'min', where: 'daily' },
  { key: 'move', label: 'Active minutes', unit: 'min', value: n.move, goal: TARGETS.move, kind: 'min', where: 'daily' },
  { key: 'food', label: 'Calories eaten', unit: 'kcal', value: n.eaten, goal: foodGoal, kind: 'band', where: 'food' },
].map(g => {
  const pct = g.value == null ? null : Math.round((g.value / g.goal) * 100);
  const met = g.value == null ? null : g.kind === 'band' ? g.value >= g.goal * FOOD_BAND[0] && g.value <= g.goal * FOOD_BAND[1] : g.value >= g.goal;
  return { ...g, pct, met };
});

function tipFor(goals, hasData) {
  if (!hasData) return "Add today's numbers or connect your watch, and Astra will show your progress and one tip.";
  const tracked = goals.filter(g => g.value != null);
  if (!tracked.length) return "Log steps, sleep and meals to see how you are doing against today's goals.";
  const sleep = goals.find(g => g.key === 'sleep');
  if (sleep.value != null && sleep.value < 6) return `You slept ${sleep.value} h, short of your ${TARGETS.sleep} h goal. Keep today's training light and aim to be in bed 30 minutes earlier tonight.`;
  const food = goals.find(g => g.key === 'food');
  if (food.value != null && food.value > food.goal * FOOD_BAND[1]) return `You are ${food.value - food.goal} kcal over your ${food.goal} kcal goal. Swap the next snack for fruit or vegetables and keep dinner light.`;
  const open = tracked.filter(g => !g.met && g.key !== 'food').sort((a, b) => a.pct - b.pct)[0];
  if (open) {
    const left = Math.max(0, open.goal - open.value);
    if (open.key === 'steps') return `${left.toLocaleString('en-US')} steps to go. A 20-minute brisk walk adds about 2,000.`;
    if (open.key === 'move') return `${left} more active minutes to reach ${open.goal}. A brisk walk, a squat set or a short run counts.`;
    if (open.key === 'sleep') return `Sleep is ${open.value} h of ${open.goal} h. Tonight, aim for ${open.goal}–9 h and keep the room dark and cool.`;
  }
  if (food.value != null && food.value < food.goal * FOOD_BAND[0]) return `You have eaten ${food.value} of ${food.goal} kcal. Add a protein-rich meal to fuel recovery.`;
  const untracked = goals.filter(g => g.value == null).map(g => g.label.toLowerCase());
  if (untracked.length) return `Goals so far are on track. Log ${untracked.join(' and ')} to complete today's picture.`;
  return 'Every goal is on track today. Keep the same routine tomorrow.';
}

export function goalsFor(userId, day) {
  const hasData = !!(db.prepare('SELECT 1 FROM measurements WHERE user_id=? LIMIT 1').get(userId) || db.prepare('SELECT 1 FROM food_log WHERE user_id=? LIMIT 1').get(userId) || db.prepare('SELECT 1 FROM workout_log WHERE user_id=? LIMIT 1').get(userId));
  const foodGoal = Math.round(getGoal(userId).kcal);
  const goals = goalRows(dayNumbers(userId, day), foodGoal);
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = shift(day, -i);
    const g = i === 0 ? goals : goalRows(dayNumbers(userId, d), foodGoal);
    week.push({ day: d, tracked: g.filter(x => x.value != null).length, met: g.filter(x => x.met).length });
  }
  return { day, hasData, goals, tip: tipFor(goals, hasData), week };
}

/** Manual daily entry. Plausible ranges only; one row per metric per day (re-saving replaces, never duplicates). */
const FIELDS = {
  sleep: { min: 0, max: 24, label: 'Sleep', unit: 'h' },
  steps: { min: 0, max: 100000, label: 'Steps', unit: 'steps' },
  rhr: { min: 25, max: 220, label: 'Resting heart rate', unit: 'bpm' },
  weight: { min: 30, max: 300, label: 'Weight', unit: 'kg' },
  spo2: { min: 50, max: 100, label: 'Blood oxygen', unit: '%' },
  exercise: { min: 0, max: 600, label: 'Exercise minutes', unit: 'min' },
  activekcal: { min: 0, max: 5000, label: 'Calories burned', unit: 'kcal' },
};

export function saveDaily(userId, day, body) {
  const bad = m => Object.assign(new Error(m), { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || day < shift(today, -30)) throw bad('Choose a date within the last 30 days.');
  const rows = [];
  for (const [metric, f] of Object.entries(FIELDS)) {
    const raw = body[metric];
    if (raw == null || raw === '') continue;
    const v = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(v) || v < f.min || v > f.max) throw bad(`${f.label} must be between ${f.min} and ${f.max}.`);
    rows.push({ metric, value: v, value2: null, unit: f.unit });
  }
  const { sys, dia } = body;
  if ((sys != null && sys !== '') || (dia != null && dia !== '')) {
    const s = Number(sys), d = Number(dia);
    if (!(s >= 60 && s <= 260) || !(d >= 30 && d <= 160) || d >= s) throw bad('Blood pressure needs a systolic (60–260) and a lower diastolic (30–160) value.');
    rows.push({ metric: 'bp', value: s, value2: d, unit: 'mmHg' });
  }
  if (!rows.length) throw bad('Enter at least one number.');
  const up = db.prepare(`INSERT INTO measurements (user_id, metric, value, value2, unit, source, external_id, note, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, metric, source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET value=excluded.value, value2=excluded.value2, recorded_at=excluded.recorded_at`);
  tx(() => rows.forEach(r => up.run(userId, r.metric, r.value, r.value2, r.unit, 'manual', `manual-${r.metric}-${day}`, 'Entered by hand', `${day} 12:00:00`)));
  return rows.map(r => r.metric);
}

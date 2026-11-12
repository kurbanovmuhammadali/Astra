import { db } from './db.js';
import { getProfile } from './food.js';

/**
 * Camera workouts. The video never leaves the user's device: pose detection runs in the browser and only the RESULT is saved
 * (exercise, reps, how many met the form rule, duration). Energy = MET x body mass x hours (Compendium of Physical Activities MET values).
 */
db.exec(`
CREATE TABLE IF NOT EXISTS workout_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  exercise TEXT NOT NULL,
  reps INTEGER NOT NULL, valid_reps INTEGER NOT NULL,
  seconds INTEGER NOT NULL, avg_depth REAL, form_score INTEGER NOT NULL, kcal INTEGER NOT NULL,
  issues TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS workout_user_day ON workout_log(user_id, day);
`);

export const EXERCISES = { squat: 5, pushup: 3.8, pullup: 8 };   // MET
const int = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

export function addWorkout(userId, day, b) {
  const bad = m => Object.assign(new Error(m), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw bad('Bad date.');
  if (!(b.exercise in EXERCISES)) throw bad('Unknown exercise.');
  const reps = int(b.reps, 500), valid = Math.min(reps, int(b.valid, 500)), seconds = int(b.seconds, 7200);
  if (!reps || !seconds) throw bad('A session needs at least one rep.');
  const kg = getProfile(userId)?.weight_kg ?? 70;
  const kcal = Math.round((EXERCISES[b.exercise] * kg * seconds) / 3600);
  const issues = Array.isArray(b.issues) ? b.issues.slice(0, 6).map(x => String(x).slice(0, 80)) : [];
  const r = db.prepare('INSERT INTO workout_log(user_id,day,exercise,reps,valid_reps,seconds,avg_depth,form_score,kcal,issues) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(userId, day, b.exercise, reps, valid, seconds, Number.isFinite(+b.avgDepth) ? +b.avgDepth : null, Math.round((valid / reps) * 100), kcal, JSON.stringify(issues));
  return Number(r.lastInsertRowid);
}
export const listWorkouts = userId => db.prepare('SELECT id, day, exercise, reps, valid_reps, seconds, avg_depth, form_score, kcal, issues, created_at FROM workout_log WHERE user_id=? ORDER BY id DESC LIMIT 20').all(userId).map(w => ({ ...w, issues: JSON.parse(w.issues) }));

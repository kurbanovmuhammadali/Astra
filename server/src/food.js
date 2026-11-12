import { db } from './db.js';
import { llmProvider, geminiGenerate } from './llm.js';

/**
 * Food & calorie log.
 *  - Search order: built-in staples (offline, per 100 g) -> USDA FoodData Central (only if USDA_API_KEY) -> Open Food Facts (no key).
 *  - Only the search words leave the server; never a name, e-mail or id.
 *  - The under-fuelling note is a heuristic (basis: heuristic), not a diagnosis.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  meal TEXT NOT NULL,
  name TEXT NOT NULL,
  grams REAL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS food_log_user_day ON food_log(user_id, day);
CREATE TABLE IF NOT EXISTS food_goal (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kcal REAL NOT NULL,
  protein REAL NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS body_profile (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  height_cm REAL NOT NULL, weight_kg REAL NOT NULL, sex TEXT NOT NULL, activity TEXT NOT NULL, aim TEXT NOT NULL DEFAULT 'maintain'
);
`);

/**
 * Body profile -> daily energy need.
 * BMR: Mifflin-St Jeor (1990): 10*kg + 6.25*cm - 5*age + 5 (male) / -161 (female); 'other' uses the midpoint (-78).
 * TDEE = BMR * activity factor (1.2 / 1.375 / 1.55 / 1.725). Aim: lose -15%, gain +10%. Protein goal 1.6 g per kg body weight (a common sports-nutrition target).
 * These are population estimates (+-10-15%), not medical advice.
 */
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
export const AIMS = { lose: 0.85, maintain: 1, gain: 1.1 };
export const SEXES = ['male', 'female', 'other'];
const ageOf = dob => { const d = new Date(dob); if (isNaN(d)) return 30; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return Math.min(100, Math.max(15, a)); };
export function energyNeeds(p, age) {
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * age + (p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78);
  const tdee = bmr * (ACTIVITY[p.activity] ?? 1.375);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round((tdee * (AIMS[p.aim] ?? 1)) / 10) * 10, protein: Math.round(p.weight_kg * 1.6) };
}
export function getProfile(userId) {
  const p = db.prepare('SELECT height_cm, weight_kg, sex, activity, aim FROM body_profile WHERE user_id=?').get(userId);
  if (!p) return null;
  const u = db.prepare('SELECT dob FROM users WHERE id=?').get(userId);
  const age = ageOf(u?.dob);
  return { ...p, age, ...energyNeeds(p, age) };
}
export function setProfile(userId, b) {
  const h = num(b.height_cm, 260), w = num(b.weight_kg, 400);
  const bad = m => Object.assign(new Error(m), { status: 400 });
  if (!h || h < 100 || h > 250) throw bad('Height must be 100–250 cm.');
  if (!w || w < 30 || w > 300) throw bad('Weight must be 30–300 kg.');
  if (!SEXES.includes(b.sex)) throw bad('Choose male, female or other.');
  if (!(b.activity in ACTIVITY)) throw bad('Choose an activity level.');
  const aim = b.aim in AIMS ? b.aim : 'maintain';
  db.prepare('INSERT INTO body_profile(user_id,height_cm,weight_kg,sex,activity,aim) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET height_cm=excluded.height_cm, weight_kg=excluded.weight_kg, sex=excluded.sex, activity=excluded.activity, aim=excluded.aim').run(userId, h, w, b.sex, b.activity, aim);
  return getProfile(userId);
}

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const DEFAULT_GOAL = { kcal: 2500, protein: 90 };

// per 100 g: [name, kcal, protein, carbs, fat]
const STAPLES = [
  ['Rice, cooked', 130, 2.7, 28, 0.3], ['Pasta, cooked', 158, 5.8, 31, 0.9], ['Bread, wheat', 265, 9, 49, 3.2], ['Oats, dry', 389, 17, 66, 7],
  ['Chicken breast, cooked', 165, 31, 0, 3.6], ['Beef, lean, cooked', 217, 26, 0, 12], ['Lamb, cooked', 294, 25, 0, 21], ['Salmon, cooked', 206, 22, 0, 12],
  ['Tuna, canned', 116, 26, 0, 1], ['Egg, boiled', 155, 13, 1.1, 11], ['Milk, whole', 61, 3.2, 4.8, 3.3], ['Yogurt, plain', 61, 3.5, 4.7, 3.3],
  ['Cheese, cheddar', 403, 25, 1.3, 33], ['Lentils, cooked', 116, 9, 20, 0.4], ['Chickpeas, cooked', 164, 8.9, 27, 2.6], ['Beans, cooked', 127, 8.7, 23, 0.5],
  ['Potato, boiled', 87, 1.9, 20, 0.1], ['Tomato', 18, 0.9, 3.9, 0.2], ['Cucumber', 15, 0.7, 3.6, 0.1], ['Carrot', 41, 0.9, 10, 0.2],
  ['Broccoli', 34, 2.8, 7, 0.4], ['Spinach', 23, 2.9, 3.6, 0.4], ['Apple', 52, 0.3, 14, 0.2], ['Banana', 89, 1.1, 23, 0.3],
  ['Orange', 47, 0.9, 12, 0.1], ['Grapes', 69, 0.7, 18, 0.2], ['Watermelon', 30, 0.6, 7.6, 0.2], ['Almonds', 579, 21, 22, 50],
  ['Walnuts', 654, 15, 14, 65], ['Peanut butter', 588, 25, 20, 50], ['Olive oil', 884, 0, 0, 100], ['Butter', 717, 0.9, 0.1, 81],
  ['Sugar', 387, 0, 100, 0], ['Honey', 304, 0.3, 82, 0], ['Chocolate, dark', 546, 4.9, 61, 31], ['Plov (osh)', 190, 6, 24, 7],
  ['Samsa', 290, 9, 28, 16], ['Lagman', 120, 6, 15, 4], ['Manti', 190, 9, 22, 7], ['Flatbread (non)', 275, 8.5, 54, 2], ['Green tea', 1, 0, 0.2, 0],
  ['Coffee, black', 2, 0.3, 0, 0], ['Cola', 42, 0, 10.6, 0], ['Orange juice', 45, 0.7, 10, 0.2], ['Protein bar', 380, 30, 35, 12],
];

const num = (v, max = 100000) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };

function builtIn(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return STAPLES.filter(([n]) => words.every(w => n.toLowerCase().includes(w)))
    .map(([name, kcal, protein, carbs, fat]) => ({ name, per100: { kcal, protein, carbs, fat }, source: 'built-in' }));
}

async function getJson(url, ms = 4000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'astra-health/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function usda(q) {
  const key = process.env.USDA_API_KEY;
  if (!key) return [];
  const j = await getJson(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&pageSize=6&dataType=Foundation,SR%20Legacy&query=${encodeURIComponent(q)}`);
  return (j.foods ?? []).map(f => {
    const n = id => f.foodNutrients?.find(x => x.nutrientId === id)?.value ?? 0;
    return { name: f.description, per100: { kcal: n(1008), protein: n(1003), carbs: n(1005), fat: n(1004) }, source: 'usda' };
  }).filter(f => f.per100.kcal > 0);
}

async function openFoodFacts(q) {
  const j = await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=6&fields=product_name,brands,nutriments`);
  return (j.products ?? []).map(p => {
    const n = p.nutriments ?? {};
    return { name: [p.product_name, p.brands].filter(Boolean).join(' · '), per100: { kcal: +n['energy-kcal_100g'] || 0, protein: +n.proteins_100g || 0, carbs: +n.carbohydrates_100g || 0, fat: +n.fat_100g || 0 }, source: 'openfoodfacts' };
  }).filter(f => f.name && f.per100.kcal > 0);
}

export async function searchFoods(q) {
  q = String(q || '').trim().slice(0, 80);
  if (q.length < 2) return [];
  const out = builtIn(q);
  for (const fn of [usda, openFoodFacts]) {
    if (out.length >= 1) break; // staples answer instantly; online databases only when nothing built-in matches
    try { out.push(...await fn(q)); } catch { /* offline or rate limited: the built-in list still works */ }
  }
  return out.slice(0, 12);
}

export function getGoal(userId) {
  const g = db.prepare('SELECT kcal, protein FROM food_goal WHERE user_id=?').get(userId);
  if (g) return { kcal: g.kcal, protein: g.protein, custom: true, from: 'custom' };
  const p = getProfile(userId);
  return p ? { kcal: p.kcal, protein: p.protein, custom: false, from: 'profile' } : { ...DEFAULT_GOAL, custom: false, from: 'default' };
}
export function setGoal(userId, kcal, protein) {
  const k = num(kcal, 8000), p = num(protein, 500);
  if (!k || k < 800 || p == null) throw Object.assign(new Error('Calorie goal must be 800–8000 kcal and protein a positive number.'), { status: 400 });
  db.prepare('INSERT INTO food_goal(user_id,kcal,protein) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET kcal=excluded.kcal, protein=excluded.protein').run(userId, k, p);
  return getGoal(userId);
}

export function addFood(userId, day, f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Object.assign(new Error('Bad date.'), { status: 400 });
  const name = String(f.name || '').trim().slice(0, 120);
  const meal = MEALS.includes(f.meal) ? f.meal : 'snack';
  const kcal = num(f.kcal, 10000);
  if (!name || kcal == null) throw Object.assign(new Error('A food name and calories are required.'), { status: 400 });
  const r = db.prepare('INSERT INTO food_log(user_id,day,meal,name,grams,kcal,protein,carbs,fat,source) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(userId, day, meal, name, num(f.grams, 20000), Math.round(kcal), num(f.protein, 1000) ?? 0, num(f.carbs, 2000) ?? 0, num(f.fat, 1000) ?? 0, String(f.source || 'manual').slice(0, 20));
  return Number(r.lastInsertRowid);
}
export const deleteFood = (userId, id) => db.prepare('DELETE FROM food_log WHERE user_id=? AND id=?').run(userId, id).changes > 0;

const r1 = x => Math.round(x * 10) / 10;
export function daySummary(userId, day) {
  const items = db.prepare('SELECT id, meal, name, grams, kcal, protein, carbs, fat, source FROM food_log WHERE user_id=? AND day=? ORDER BY id').all(userId, day);
  const tot = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const goal = getGoal(userId);
  // last 7 days of calories, for the small trend bar
  const rows = db.prepare("SELECT day, SUM(kcal) k FROM food_log WHERE user_id=? AND day<=? AND day>date(?, '-7 day') GROUP BY day").all(userId, day, day);
  const week = []; for (let i = 6; i >= 0; i--) { const d = new Date(Date.parse(day + 'T00:00:00Z') - i * 864e5).toISOString().slice(0, 10); week.push({ day: d, kcal: Math.round(rows.find(r => r.day === d)?.k ?? 0) }); }
  const logged = week.slice(-3).filter(w => w.kcal > 0);
  const avg3 = logged.length >= 3 ? logged.reduce((s, w) => s + w.kcal, 0) / 3 : null;
  const notes = [];
  if (avg3 != null && avg3 < goal.kcal * 0.75) notes.push({ level: 'amber', basis: 'heuristic', text: `Your last 3 logged days average ${Math.round(avg3)} kcal, under 75% of your ${goal.kcal} kcal goal. Sustained under-eating speeds up muscle and bone loss in flight; raise it with the flight surgeon or nutritionist.` });
  if (tot.protein > 0 && tot.kcal > 1200 && tot.protein < goal.protein * 0.6) notes.push({ level: 'info', basis: 'heuristic', text: `Protein is ${r1(tot.protein)} g of a ${goal.protein} g goal so far today.` });
  const burned = Math.round(db.prepare("SELECT value FROM measurements WHERE user_id=? AND metric='activekcal' AND date(recorded_at)=? ORDER BY recorded_at DESC LIMIT 1").get(userId, day)?.value ?? 0) || null;
  const steps = Math.round(db.prepare("SELECT value FROM measurements WHERE user_id=? AND metric='steps' AND date(recorded_at)=? ORDER BY recorded_at DESC LIMIT 1").get(userId, day)?.value ?? 0) || null;
  const prof = getProfile(userId);
  return { day, goal, profile: prof, activity: { burned, steps, net: burned != null ? Math.round(tot.kcal - burned) : null }, totals: { kcal: Math.round(tot.kcal), protein: r1(tot.protein), carbs: r1(tot.carbs), fat: r1(tot.fat) }, remaining: Math.round(goal.kcal - tot.kcal), items, week, notes };
}

/**
 * Photo -> calorie estimate. Needs a vision model, so it only runs when the server has ANTHROPIC_API_KEY (or a test client) AND the
 * client says the user agreed to send this one photo (consent: true). The photo is not stored; no name/e-mail/id is sent.
 * Output is an ESTIMATE the user confirms or edits before anything is logged.
 */
const PHOTO_PROMPT = `You estimate the food in a photo for a nutrition log. Reply with ONLY a JSON object, no prose:
{"items":[{"name":string,"grams":number,"kcal":number,"protein":number,"carbs":number,"fat":number}],"confidence":"low"|"medium"|"high","note":string}
Rules: one item per distinct food you can see; grams are your estimate of the visible portion; kcal/protein/carbs/fat are for that portion. If the photo is not food or nothing is identifiable, return {"items":[],"confidence":"low","note":"explain briefly"}. Never invent hidden ingredients with certainty; mention oil, sauces or hidden fats as uncertainty in note. Keep note under 40 words.`;
const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function estimateFromPhoto({ image, mediaType, consent }) {
  const { aiConfigured, getAiClient, hasInjectedClient } = await import('./assistant.js');
  const err = (status, message) => Object.assign(new Error(message), { status });
  if (consent !== true) throw err(400, 'Photo estimates send the picture to an AI service (Google Gemini or Anthropic Claude). Please agree first.');
  if (!aiConfigured() && !hasInjectedClient()) throw err(503, 'Photo estimates are not available: the server has no AI API key.');
  if (!MEDIA.has(mediaType)) throw err(400, 'Use a JPEG, PNG or WebP photo.');
  const data = String(image || '').replace(/^data:[^,]*,/, '');
  if (data.length < 100 || data.length > 5_500_000 || !/^[A-Za-z0-9+/=\s]+$/.test(data)) throw err(400, 'The photo is missing, unreadable or too large.');
  try {
    let text;
    if (!hasInjectedClient() && llmProvider() === 'gemini') {
      try { text = (await geminiGenerate({ messages: [{ role: 'user', content: PHOTO_PROMPT }], image: { mediaType, data }, json: true, maxTokens: 900 })).text; }
      catch (e) { console.error('[food photo] Gemini:', e.message); throw err(502, 'Could not read that photo. Try a clearer, closer picture or add the food by search.'); }
    } else {
      const client = await getAiClient();
      const msg = await client.messages.create({
        model: process.env.ASTRA_AI_MODEL || 'claude-opus-5-5', max_tokens: 900, output_config: { effort: 'low' },
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data } }, { type: 'text', text: PHOTO_PROMPT }] }],
      });
      text = (msg.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
    }
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const n = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
    const items = (Array.isArray(j.items) ? j.items : []).slice(0, 8).map(i => ({ name: String(i.name || 'Food').slice(0, 80), grams: n(i.grams, 3000), kcal: n(i.kcal, 5000), protein: n(i.protein, 300), carbs: n(i.carbs, 600), fat: n(i.fat, 400) })).filter(i => i.kcal > 0);
    return { items, confidence: ['low', 'medium', 'high'].includes(j.confidence) ? j.confidence : 'low', note: String(j.note || '').slice(0, 300), estimate: true };
  } catch (e) {
    if (e.status) throw e;
    console.error('[food photo]', e?.status ?? '', e?.message);
    throw err(502, 'Could not read that photo. Try a clearer, closer picture or add the food by search.');
  }
}

/**
 * DEMO-ONLY (temporary): one-click demo sign-in so nobody registers on every run.
 * Enabled only when DEMO_LOGIN=on AND NODE_ENV is not production.
 * TO REMOVE: delete this file, the "DEMO-ONLY" block in src/index.js, `demoLogin` in the /api/health reply,
 * DEMO_LOGIN in .env, then mobile/src/DemoLogin.tsx and its two "DEMO-ONLY" lines in mobile/app/welcome.tsx
 * and `demoLogin` in mobile/src/auth.tsx. (DEMO_REMOVAL.md lists every step.)
 */
import { db } from './db.js';
import { LEGAL_VERSION } from './auth.js';
import { seedDemo } from './demo.js';

export const demoLoginOn = prod => process.env.DEMO_LOGIN === 'on' && !prod;

const CREW = [
  { email: 'crew@astra.demo', name: 'Alex Morgan', dob: '1988-01-01', years: 2.5, env: 'mars', mission: '2.5-year Mars mission', seed: 7 },
  { email: 'mira@hmsc.demo', name: 'Mira Okafor', dob: '1991-06-14', years: 1, env: 'station', mission: 'ISS Expedition 74', seed: 11 },
  { email: 'daniel@hmsc.demo', name: 'Daniel Reyes', dob: '1985-11-02', years: 2, env: 'lunar', mission: 'Lunar gateway rotation', seed: 23 },
  { email: 'yuki@hmsc.demo', name: 'Yuki Tanaka', dob: '1993-03-27', years: 1, env: 'station', mission: 'ISS Expedition 74', seed: 31 },
];
export const DEMO_ADMIN = { email: 'surgeon@hmsc.demo', name: 'Dr. Elena Voss', dob: '1979-09-09', role: 'surgeon' };

function ensure(u, role, extra = {}) {
  let row = db.prepare('SELECT * FROM users WHERE email = ?').get(u.email);
  if (row) return row;
  const { lastInsertRowid: id } = db.prepare('INSERT INTO users (email, name, password_hash, dob, role, mission, environment, mission_years) VALUES (?,?,?,?,?,?,?,?)')
    .run(u.email, u.name, '!', u.dob, role, extra.mission ?? 'Flight surgeon', extra.env ?? 'station', extra.years ?? null);
  ['terms', 'privacy', 'health_data'].forEach(k => db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?,?,?)').run(id, k, LEGAL_VERSION));
  if (role === 'astronaut') seedDemo(Number(id), extra.seed);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/** Creates the demo astronauts and the demo flight surgeon (idempotent). */
export function seedDemoPeople() {
  CREW.forEach(c => ensure(c, 'astronaut', { mission: c.mission, env: c.env, years: c.years, seed: c.seed }));
  ensure(DEMO_ADMIN, 'surgeon');
}

export const demoUser = as => db.prepare('SELECT * FROM users WHERE email = ?').get(as === 'admin' ? DEMO_ADMIN.email : CREW[0].email);

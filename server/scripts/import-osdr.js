// Usage: node scripts/import-osdr.js [--download]
// Verifies (and optionally refreshes) the Inspiration4 CBC fixture from NASA OSDR OSD-569 and prints what Astra will import.
import { writeFileSync } from 'node:fs';
process.env.DB_FILE = ':memory:';
const { OSDR_FIXTURE, OSDR_URL, loadI4, I4 } = await import('../src/osdr.js');
if (process.argv.includes('--download')) {
  const res = await fetch(OSDR_URL);
  if (!res.ok) throw new Error(`OSDR download failed: HTTP ${res.status}`);
  writeFileSync(OSDR_FIXTURE, Buffer.from(await res.arrayBuffer()));
  console.log('downloaded', OSDR_URL);
}
const rows = loadI4();
console.log(`${I4.study}: ${rows.length} samples, crew ${[...new Set(rows.map(r => r.crew))].join(', ')}, time points ${[...new Set(rows.map(r => r.tp))].join(' ')}`);
for (const c of I4.crew) {
  const r = rows.filter(x => x.crew === c).sort((a, b) => a.off - b.off);
  console.log(c, r.map(x => `${x.tp}:Hb ${x.values.hgb}`).join('  '));
}

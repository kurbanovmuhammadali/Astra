// After `expo export`: put the Celeste logo in the browser tab. Writes a real favicon.ico from the logo PNGs and adds
// explicit icon links (with a version so browsers drop the old cached icon) to every exported HTML page.
const fs = require('fs'), path = require('path');
const out = path.resolve(__dirname, '../../server/public');
const pub = path.resolve(__dirname, '../public');
const V = '4';

// favicon.ico containing 32 and 64 px PNG images (modern browsers read PNG inside ICO)
const imgs = [fs.readFileSync(path.join(pub, 'favicon-32.png')), fs.readFileSync(path.join(pub, 'favicon-64.png'))];
const sizes = [32, 64];
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let offset = 6 + 16 * imgs.length;
const dir = imgs.map((img, i) => { const e = Buffer.alloc(16); e[0] = sizes[i]; e[1] = sizes[i]; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(img.length, 8); e.writeUInt32LE(offset, 12); offset += img.length; return e; });
fs.writeFileSync(path.join(out, 'favicon.ico'), Buffer.concat([head, ...dir, ...imgs]));

const links = `<link rel="icon" type="image/x-icon" href="/favicon.ico?v=${V}"/>
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=${V}"/>
    <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png?v=${V}"/>
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${V}"/>
    <meta name="theme-color" content="#1C120D"/>`;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'models' || e.name === 'vendor' || e.name === 'assets' || e.name === '_expo' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
let n = 0;
for (const f of walk(out)) {
  let h = fs.readFileSync(f, 'utf8');
  h = h.replace(/<link rel="icon"[^>]*\/?>/g, '').replace(/<link rel="apple-touch-icon"[^>]*\/?>/g, '').replace(/<meta name="theme-color"[^>]*\/?>/g, '');
  h = h.replace('</head>', `  ${links}\n</head>`);
  fs.writeFileSync(f, h); n++;
}
console.log(`brand: favicon.ico + icon links in ${n} page(s)`);

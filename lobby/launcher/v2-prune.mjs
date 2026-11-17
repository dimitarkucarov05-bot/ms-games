// Helper of package-v2.ps1; works on the PACKED COPY only (never on lobby-stage or the live lobby).
//   node v2-prune.mjs <app folder> <version>
// 1. package.json gets the product version (the console and Diagnose show it).
// 2. Sounds that need a credit stay out: every "alternatives" entry of sfx/motel/map.json whose name ends in ".ccby"
//    (Kevin MacLeod, CC BY 4.0, see _sound-src/LICENSES.md) is removed from the map and its files are deleted.
//    Nothing in "events" (the default bank: Sonniss, Kenney, our own voice) needs a credit.
import fs from 'node:fs';
import path from 'node:path';

const [app, version] = process.argv.slice(2);
if (!app || !version) { console.error('usage: node v2-prune.mjs <app folder> <version>'); process.exit(2); }

const pkgFile = path.join(app, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = version;
pkg.name = 'ms-games';
pkg.description = 'MS Games: free-roam VR arena';
pkg.scripts = { start: 'node server.js' };
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

const dir = path.join(app, 'public', 'play', 'assets', 'sfx', 'motel');
const mapFile = path.join(dir, 'map.json');
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const filesOf = e => [].concat(e.files || [], e.kids || []);
const kept = new Set();
for (const e of Object.values(map.events || {})) for (const f of filesOf(e)) kept.add(f);
let removed = 0, entries = 0;
for (const [name, e] of Object.entries(map.alternatives || {})) {
  if (!/\.ccby$/i.test(name)) { for (const f of filesOf(e)) kept.add(f); continue; }
  entries++;
  for (const f of filesOf(e)) {
    if (kept.has(f)) continue;      // also used by an entry that needs no credit: stays
    try { fs.unlinkSync(path.join(dir, f)); removed++; } catch { /* already gone */ }
  }
  delete map.alternatives[name];
}
fs.writeFileSync(mapFile, JSON.stringify(map, null, 1) + '\n');

// belt and braces: no file with "ccby" in its name may be left anywhere under sfx
const left = [];
const walk = d => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, n.name); if (n.isDirectory()) walk(f); else if (/ccby/i.test(n.name)) left.push(f); } };
walk(path.join(app, 'public', 'play', 'assets', 'sfx'));
for (const f of left) { fs.unlinkSync(f); removed++; }

// every file the map still names must exist
const missing = [];
for (const block of [map.events || {}, map.alternatives || {}]) for (const e of Object.values(block)) for (const f of filesOf(e)) if (!fs.existsSync(path.join(dir, f))) missing.push(f);
if (missing.length) { console.error('sound files named by map.json are missing:', missing.slice(0, 10).join(', ')); process.exit(1); }
console.log(`v2-prune: version ${version}; credit-only sounds removed: ${entries} entries, ${removed} files`);

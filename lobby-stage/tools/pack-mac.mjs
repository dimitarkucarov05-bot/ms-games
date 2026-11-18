// Packs MS Games into one macOS program:  node tools/pack-mac.mjs [--node <path to node>] [--out <folder>] [--version 2.0.0] [--dmg]
// Output: <out>/MS Games.app  (menu-bar program + its own Node + the server + only the assets the code names), and with --dmg <out>/MS-Games-Mac.dmg.
// The same choices as lobby/launcher/package-v2.ps1 (Windows): server files, no tests or dev pages, only the Synty packs / maps / folders the packed code names,
// credit-only sounds out (lobby/launcher/v2-prune.mjs). It READS lobby-stage and lobby (assets); it never writes there.
// The Synty licence covers the LabCoin team only (the repo is public by the owner's decision).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STAGE = path.dirname(HERE);                          // lobby-stage
const ROOT = path.dirname(STAGE);                          // the repo
const LOBBY = path.join(ROOT, 'lobby');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const NODE = path.resolve(arg('--node', process.execPath));
const OUT = path.resolve(arg('--out', path.join(ROOT, 'dist-mac')));
const VERSION = arg('--version', '2.0.0');
const APP = path.join(OUT, 'MS Games.app');
const RES = path.join(APP, 'Contents', 'Resources');
const APPDIR = path.join(RES, 'app');
const say = (...a) => console.log('[pack-mac]', ...a);
const mb = n => Math.round(n / 1048576);

const cp = (from, to, filter) => fs.cpSync(from, to, { recursive: true, dereference: true, filter: filter ? (s) => filter(path.relative(from, s), s) : undefined });
const sizeOf = d => { let n = 0; const walk = p => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else n += fs.statSync(f).size; } }; walk(d); return n; };
const textOf = (dir, skip) => {
  let out = '';
  const walk = p => { for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name), rel = path.relative(dir, f);
    if (skip(rel)) continue;
    if (e.isDirectory()) walk(f); else if (/\.(js|mjs|json|html|css)$/.test(e.name)) out += fs.readFileSync(f, 'utf8') + '\n';
  } };
  walk(dir); return out;
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!fs.existsSync(path.join(STAGE, 'server.js'))) throw new Error(`MISSING: ${STAGE}/server.js`);
if (!fs.existsSync(path.join(LOBBY, 'node_modules', 'ws'))) throw new Error('MISSING: lobby/node_modules/ws (run npm install in lobby/)');
if (!fs.existsSync(NODE)) throw new Error(`MISSING: node at ${NODE}`);
if (process.platform !== 'darwin') throw new Error('the program is built on a Mac (swiftc, iconutil, codesign)');

fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(path.join(RES, 'runtime'), { recursive: true });
fs.mkdirSync(path.join(APP, 'Contents', 'MacOS'), { recursive: true });

// ---------- the server ----------
fs.mkdirSync(APPDIR, { recursive: true });
for (const f of ['server.js', 'zone.js', 'keeper.js', 'package.json']) fs.copyFileSync(path.join(STAGE, f), path.join(APPDIR, f));
cp(path.join(STAGE, 'lib'), path.join(APPDIR, 'lib'), rel => !/\.test\.js$/.test(rel));
fs.mkdirSync(path.join(APPDIR, 'game'), { recursive: true });
for (const f of fs.readdirSync(path.join(STAGE, 'game'))) if (/^(motel|neon)/.test(f) && !/\.test\.js$/.test(f)) fs.copyFileSync(path.join(STAGE, 'game', f), path.join(APPDIR, 'game', f));
cp(path.join(LOBBY, 'node_modules', 'ws'), path.join(APPDIR, 'node_modules', 'ws'));

// pages; the assets folder is copied separately below
const PUB = path.join(STAGE, 'public');
cp(PUB, path.join(APPDIR, 'public'), rel => {
  const r = rel.split(path.sep);
  if (r[0] === 'play' && (r[1] === 'assets' || r[1] === 'tools')) return false;
  if (r[0] === 'live' || r.includes('_shots') || r.includes('tools')) return false;
  const name = r[r.length - 1];
  return !(/\.(prev\d?|md)$/.test(name) || /-preview\.html$/.test(name) || /\.test\.js$/.test(name) || ['assets-test.html', 'showroom.js', 'options.html'].includes(name));
});

// ---------- assets: sounds, and only the packs the packed code names ----------
const ASSETS = path.join(LOBBY, 'public', 'play', 'assets');
const OUTA = path.join(APPDIR, 'public', 'play', 'assets');
let code = textOf(APPDIR, rel => /(^|\/)node_modules(\/|$)|(^|\/)vendor(\/|$)|public\/play\/assets/.test(rel));
const mapsKeep = [], mapsDrop = [];
for (const d of fs.readdirSync(path.join(ASSETS, 'maps'), { withFileTypes: true }).filter(e => e.isDirectory())) {
  (d.name !== '_shots' && new RegExp(`maps/${esc(d.name)}['"/]`).test(code) ? mapsKeep : mapsDrop).push(d.name);
}
const skipPrev = rel => !/\.(prev\d?)$/.test(rel) && !rel.split(path.sep).includes('_shots');
for (const m of mapsKeep) {
  cp(path.join(ASSETS, 'maps', m), path.join(OUTA, 'maps', m), skipPrev);
  for (const f of fs.readdirSync(path.join(ASSETS, 'maps', m))) if (f.endsWith('.json')) code += fs.readFileSync(path.join(ASSETS, 'maps', m, f), 'utf8') + '\n';     // a baked map names the Synty textures it uses
}
say('maps kept:', mapsKeep.join(', '), '| left out:', mapsDrop.join(', '));
const keep = [], drop = [];
for (const d of fs.readdirSync(path.join(ASSETS, 'synty'), { withFileTypes: true }).filter(e => e.isDirectory())) {
  (new RegExp(`['"/]${esc(d.name)}['"/]`).test(code) ? keep : drop).push(d.name);
}
for (const must of ['_characters', '_zombies', '_gang', 'city-pack', 'sci-fi-space-pack', 'apocalypse-pack', 'woodland-apocalypse-map']) {
  if (!keep.includes(must)) throw new Error(`the pack scan did not find '${must}': the scan is broken, not packing`);
}
for (const p of keep) cp(path.join(ASSETS, 'synty', p), path.join(OUTA, 'synty', p), skipPrev);
say('synty packs kept:', keep.join(', '));
say('synty packs left out:', drop.join(', '));
cp(path.join(ASSETS, 'sfx'), path.join(OUTA, 'sfx'));
for (const d of fs.readdirSync(ASSETS, { withFileTypes: true })) {
  if (d.isDirectory()) { if (!['synty', 'maps', 'sfx'].includes(d.name) && code.includes(`assets/${d.name}/`)) { cp(path.join(ASSETS, d.name), path.join(OUTA, d.name)); say(`assets/${d.name} kept`); } }
  else fs.copyFileSync(path.join(ASSETS, d.name), path.join(OUTA, d.name));
}
for (const must of ['sfx/motel/map.json', 'sfx/neon/map.json', 'synty/_gang/characters.json']) if (!fs.existsSync(path.join(OUTA, must))) throw new Error(`MISSING in the package: ${must}`);

// ---------- version, credit-only sounds out, a syntax check with the bundled Node ----------
fs.copyFileSync(NODE, path.join(RES, 'runtime', 'node')); fs.chmodSync(path.join(RES, 'runtime', 'node'), 0o755);
const bundled = path.join(RES, 'runtime', 'node');
execFileSync(bundled, [path.join(LOBBY, 'launcher', 'v2-prune.mjs'), APPDIR, VERSION], { stdio: 'inherit' });
for (const f of ['server.js', 'zone.js', 'keeper.js', 'game/motel.js', 'game/neon.js']) execFileSync(bundled, ['--check', path.join(APPDIR, f)]);
const left = [];
const walkLeft = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walkLeft(f); else if (/-preview\.html$|^assets-test\.html$|\.test\.js$|ccby|\.prev\d?$/.test(e.name)) left.push(f); } };
walkLeft(APPDIR);
if (left.length) throw new Error(`dev or excluded files got into the package: ${left.slice(0, 5).join(', ')}`);

// what exactly was packed: app/BUILD.txt
let commit = '?', dirty = '';
try { commit = execFileSync('git', ['-C', STAGE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); if (execFileSync('git', ['-C', STAGE, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) dirty = ' + uncommitted changes'; } catch { /* not a git checkout */ }
const gv = f => { try { return JSON.parse(fs.readFileSync(path.join(APPDIR, 'game', f), 'utf8')).version; } catch { return '?'; } };
const stamp = `MS Games ${VERSION} for Mac, packed ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, lobby-stage ${commit}${dirty}, The Motel ${gv('motel.game.json')}, Neon Coast ${gv('neon.game.json')}, node ${execFileSync(bundled, ['--version'], { encoding: 'utf8' }).trim()}`;
fs.writeFileSync(path.join(APPDIR, 'BUILD.txt'), stamp + '\n');
say(stamp);

// ---------- the program: Swift menu-bar launcher, Info.plist, icon ----------
const exe = path.join(APP, 'Contents', 'MacOS', 'MS Games');
execFileSync('swiftc', ['-O', '-swift-version', '5', '-target', `${process.arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macos12.0`, path.join(HERE, 'mac', 'main.swift'), '-o', exe, '-framework', 'Cocoa', '-framework', 'WebKit'], { stdio: 'inherit' });
fs.copyFileSync(path.join(HERE, 'mac', 'AppIcon.icns'), path.join(RES, 'AppIcon.icns'));
fs.writeFileSync(path.join(APP, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>MS Games</string>
  <key>CFBundleDisplayName</key><string>MS Games</string>
  <key>CFBundleIdentifier</key><string>bg.arena.msgames</string>
  <key>CFBundleExecutable</key><string>MS Games</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}.${commit === '?' ? '0' : parseInt(commit, 16) % 100000}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSLocalNetworkUsageDescription</key><string>MS Games talks to the VR headsets and the staff phone on your Wi-Fi.</string>
  <key>NSCameraUsageDescription</key><string>The scan page reads the QR code on a player's phone with the camera.</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>
`);
// ad-hoc signature of the program itself (the bundled Node keeps its own signature)
execFileSync('codesign', ['--force', '--sign', '-', exe], { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--sign', '-', APP], { stdio: 'inherit' });
say(`packed: ${APP} (${mb(sizeOf(APP))} MB)`);

if (process.argv.includes('--dmg')) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'msgames-dmg-'));
  execFileSync('ditto', [APP, path.join(stage, 'MS Games.app')]);
  fs.symlinkSync('/Applications', path.join(stage, 'Applications'));
  fs.writeFileSync(path.join(stage, 'READ ME FIRST.txt'), `MS Games for Mac

1. Drag "MS Games" onto Applications.
2. First start: the app is not notarized by Apple, so macOS asks once.
   Right-click the app > Open > Open. (If macOS only offers "Move to Bin": System Settings > Privacy & Security > "Open Anyway".)
   Or in Terminal:  xattr -dr com.apple.quarantine "/Applications/MS Games.app"
3. MS Games is a normal program with its own window (the console is inside it, not in a browser); it also keeps a controller icon in the menu bar and keeps the Mac awake.
4. Staff phone, camera works: the menu shows https://<this Mac>:47843/scan/ (accept the certificate warning once).
5. LabCoin key: put it in ~/Library/Application Support/MS Games/data/labcoin.json (menu: Show the data folder).

${stamp}
`);
  const dmg = path.join(OUT, 'MS-Games-Mac.dmg');
  fs.rmSync(dmg, { force: true });
  for (let i = 1; ; i++) { try { execFileSync('hdiutil', ['create', '-volname', 'MS Games', '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg], { stdio: 'inherit' }); break; } catch (e) { if (i >= 3) throw e; say('hdiutil was busy, trying again'); execFileSync('sleep', ['5']); } }
  fs.rmSync(stage, { recursive: true, force: true });
  say(`dmg: ${dmg} (${mb(fs.statSync(dmg).size)} MB)`);
}

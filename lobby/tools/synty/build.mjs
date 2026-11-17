// Взима модели от Synty библиотеката и ги прави готови за играта.
//
//   node tools/synty/build.mjs                          обръща всичко, поискано в tools/synty/want/*.json
//   node tools/synty/build.mjs --index "POLYGON/Shops Pack"   пише списък с всички модели на пакета в tools/synty/index/
//   node tools/synty/build.mjs --force                  обръща наново и вече готовите
//
// Файл с желания (tools/synty/want/<име>.json), един обект или масив от обекти:
//   { "pack": "POLYGON/Shops Pack", "models": ["SM_Prop_Food_Burger_01", "SM_Env_Plant_01"], "textures": ["PolygonShops_Signs_01.png"] }
//
// Резултат: lobby/public/play/assets/synty/<пакет>/<модел>.glb (без вградена текстура),
//           …/<пакет>/tex/<текстура>.png (до 1024 px) и …/<пакет>/pack.json (размери, триъгълници, материали).
// Източник: \\192.168.1.40\synty (само за четене). Лицензът е само за екипа: файловете не се качват никъде.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = process.env.SYNTY_LIB || '//192.168.1.40/synty';
const OUT = path.resolve(HERE, '../../public/play/assets/synty');
const BLENDER = process.env.BLENDER || [
  'C:/Users/Martiness/Downloads/blender-3.6.23-windows-x64/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 3.6/blender.exe',
].find(p => fs.existsSync(p)) || 'blender';
const TEX_SIZE = Number(process.env.TEX_SIZE || 1024);
const args = process.argv.slice(2);
const force = args.includes('--force');

export const slug = s => s.split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function walk(dir, out = []) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Всички FBX и текстури на един пакет (пази се в tools/synty/index/<пакет>.json). */
function indexPack(pack, refresh = false) {
  const file = path.join(HERE, 'index', `${slug(pack)}.json`);
  if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const src = path.join(LIB, 'Originals', pack, 'Source');
  if (!fs.existsSync(src)) throw new Error(`Няма такъв пакет: ${src}`);
  const idx = { pack, models: {}, textures: {} };
  for (const p of walk(src)) {
    const ext = path.extname(p).toLowerCase(), base = path.basename(p, path.extname(p));
    if (ext === '.fbx') idx.models[base] ||= p;
    else if (['.png', '.tga', '.jpg'].includes(ext)) idx.textures[path.basename(p).toLowerCase()] ||= p;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(idx, null, 1));
  fs.writeFileSync(file.replace(/\.json$/, '.txt'), Object.keys(idx.models).sort().join('\n') + '\n');
  return idx;
}

function blender(jobs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synty-'));
  const jobFile = path.join(dir, 'jobs.json');
  jobs.report = path.join(dir, 'report.json');
  fs.writeFileSync(jobFile, JSON.stringify(jobs));
  try {
    execFileSync(BLENDER, ['-b', '--factory-startup', '-P', path.join(HERE, 'convert.py'), '--', jobFile], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64e6 });
  } catch (e) {
    if (!fs.existsSync(jobs.report)) throw new Error(`Blender не тръгна: ${String(e.stderr || e.message).slice(-400)}`);
  }
  const report = JSON.parse(fs.readFileSync(jobs.report, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return report;
}

/** Коя текстура е за този материал: каквото казва FBX-ът, иначе по името (…_Mat_01_A → …_Texture_01_A). */
function textureFor(mat, idx) {
  const stems = [];
  if (mat.image) stems.push(mat.image.replace(/\.[a-z0-9]+$/i, ''));
  stems.push(mat.name.replace(/_Mat_/i, '_Texture_').replace(/\.\d+$/, ''));
  for (const stem of stems) {
    for (const t of [`${stem}.png`, `${stem}_A.png`, `${stem}_01.png`, `${stem}_01_A.png`]) {
      const hit = idx.textures[t.toLowerCase()];
      if (hit) return hit;
    }
  }
  return null;
}

/** Две сесии може да строят един и същ пакет едновременно: чакаме ред, за да не си презапишат pack.json. */
function withLock(name, fn) {
  const lock = path.join(HERE, `.lock-${name}`);
  const start = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age > 20 * 60_000 || Date.now() - start > 30 * 60_000) { try { fs.rmdirSync(lock); } catch { /* друг го махна */ } continue; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch { /* вече го няма */ } }
}

function buildPack(pack, wantModels, wantTextures) {
  return withLock(slug(pack), () => buildPackLocked(pack, wantModels, wantTextures));
}

function buildPackLocked(pack, wantModels, wantTextures) {
  const idx = indexPack(pack);
  const dir = path.join(OUT, slug(pack));
  const packFile = path.join(dir, 'pack.json');
  const info = fs.existsSync(packFile) ? JSON.parse(fs.readFileSync(packFile, 'utf8')) : { pack, models: {} };
  const jobs = { models: [], textures: [] };
  const missing = [];
  for (const name of new Set(wantModels)) {
    const fbx = idx.models[name];
    if (!fbx) { missing.push(name); continue; }
    const out = path.join(dir, `${name}.glb`);
    if (!force && fs.existsSync(out) && info.models[name]) continue;
    jobs.models.push({ name, fbx, out, anim: /^SK_|^Character/i.test(name) ? 0 : 0 });
  }
  if (missing.length) console.log(`  [${pack}] няма такива модели: ${missing.join(', ')}`);
  let report = { models: [], textures: [] };
  if (jobs.models.length) {
    console.log(`  [${pack}] обръщам ${jobs.models.length} модела…`);
    report = blender(jobs);
  }
  const needTex = new Map();   // изходно име → източник
  for (const m of report.models) {
    if (m.error) { console.log(`  ! ${m.name}: ${m.error}`); continue; }
    // материалите в Synty FBX са с неясни имена (lambert1…), затова текстурата се пази за всеки модел поотделно
    const mats = m.materials.map(mat => {
      const src = textureFor(mat, idx);
      if (!src) return { name: mat.name, map: null, image: mat.image || null };
      const outName = `${path.basename(src, path.extname(src))}.png`;
      needTex.set(outName, src);
      return { name: mat.name, map: `tex/${outName}` };
    });
    info.models[m.name] = { tris: m.tris, size: m.size, min: m.min, max: m.max, skinned: m.skinned, bytes: m.bytes, materials: mats };
  }
  for (const t of wantTextures || []) {
    const src = idx.textures[t.toLowerCase()];
    if (src) needTex.set(`${path.basename(src, path.extname(src))}.png`, src); else console.log(`  [${pack}] няма текстура ${t}`);
  }
  const texJobs = { models: [], textures: [] };
  for (const [outName, src] of needTex) {
    const out = path.join(dir, 'tex', outName);
    if (force || !fs.existsSync(out)) texJobs.textures.push({ src, out, size: TEX_SIZE });
  }
  if (texJobs.textures.length) {
    console.log(`  [${pack}] текстури: ${texJobs.textures.length}`);
    for (const t of blender(texJobs).textures) if (t.error) console.log(`  ! текстура ${t.src}: ${t.error}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(packFile, JSON.stringify(info, null, 1));
  const n = Object.keys(info.models).length;
  console.log(`  [${pack}] готови ${n} модела, ${Object.values(info.models).reduce((s, m) => s + m.tris, 0)} триъгълника общо`);
  return info;
}

if (args.includes('--index')) {
  const pack = args[args.indexOf('--index') + 1];
  const idx = indexPack(pack, true);
  console.log(`${pack}: ${Object.keys(idx.models).length} модела, ${Object.keys(idx.textures).length} текстури → tools/synty/index/${slug(pack)}.txt`);
} else {
  const wantDir = path.join(HERE, 'want');
  const byPack = new Map();
  for (const f of fs.existsSync(wantDir) ? fs.readdirSync(wantDir).filter(f => f.endsWith('.json')) : []) {
    let list;
    try { list = JSON.parse(fs.readFileSync(path.join(wantDir, f), 'utf8')); } catch (e) { console.log(`! ${f}: ${e.message}`); continue; }
    for (const w of [].concat(list)) {
      if (!w?.pack) continue;
      const e = byPack.get(w.pack) || { models: [], textures: [] };
      e.models.push(...(w.models || [])); e.textures.push(...(w.textures || []));
      byPack.set(w.pack, e);
    }
  }
  if (!byPack.size) console.log('Няма желания в tools/synty/want/*.json');
  for (const [pack, w] of byPack) buildPack(pack, w.models, w.textures);
}

// Героите (клиентите) и анимациите им за „Задната стая".
//
//   node tools/synty/characters.mjs
//
// Чете списъка от tools/synty/want/kinds.json (обектът с "characters" и "clips") и пише в
// lobby/public/play/assets/synty/_characters/:
//   <герой>.glb          копие от библиотеката без вградената текстура
//   tex/<текстура>.png   текстурата, веднъж за всички герои, които я ползват (до 1024 px)
//   clips.bin            анимациите, пренесени върху скелета на героите (Int16)
//   characters.json      опис: герои, клипове, кости
//
// Скелетите: цивилните герои (City Characters, Town, City, Kids) са със скелет „ue" (Pelvis, UpperArm_L, …,
// костта сочи по X). Клиповете са за скелета „polygon" (Hips, Shoulder_L, …, костта сочи по Y). Ставите са на
// едни и същи места, различни са само осите на костите. Затова клиповете се преизчисляват кост по кост:
//   свят_цел(t) = свят_клип(t) · свят_клип(T-поза)⁻¹ · свят_цел(покой)
// T-позата идва от клипа A_TPose_Neut. Това е смяна на базис, не нагаждане на око.
//
// Източник: \\192.168.1.40\synty (само за четене; лицензът е само за екипа).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = process.env.SYNTY_LIB || '//192.168.1.40/synty';
// --want <файл> и --out <папка>: друг списък и друга изходна папка (зомбитата за „Мъртвият мотел" са в want/zombies.chars.json → _zombies).
// Без ключове всичко е както преди: want/kinds.json → _characters.
const ARGV = process.argv.slice(2);
const argOf = k => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : null; };
const OUT = argOf('--out') ? path.resolve(argOf('--out')) : path.resolve(HERE, '../../public/play/assets/synty/_characters');
const BLENDER = process.env.BLENDER || [
  'C:/Users/Martiness/Downloads/blender-3.6.23-windows-x64/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 3.6/blender.exe',
].find(p => fs.existsSync(p)) || 'blender';
const TEX_SIZE = 1024, FPS = 30;
const THREE = await import(pathToFileURL(path.resolve(HERE, '../../public/play/vendor/three.module.js')).href);

// ---------- GLB ----------

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`не е GLB: ${file}`);
  const jlen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jlen).toString('utf8'));
  const bin = b.length > 20 + jlen + 8 ? b.subarray(20 + jlen + 8, 20 + jlen + 8 + b.readUInt32LE(20 + jlen)) : Buffer.alloc(0);
  return { json, bin };
}
function writeGlb(file, json, bin) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - j.length % 4, 0x20)]);
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - bin.length % 4)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jh, j, bh, bin]));
}
const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(json, bin, i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = COMP[a.type];
  const read = { 5126: [4, (o) => bin.readFloatLE(o)], 5123: [2, (o) => bin.readUInt16LE(o) / (a.normalized ? 65535 : 1)], 5122: [2, (o) => Math.max(-1, bin.readInt16LE(o) / (a.normalized ? 32767 : 1))], 5121: [1, (o) => bin.readUInt8(o) / (a.normalized ? 255 : 1)], 5120: [1, (o) => Math.max(-1, bin.readInt8(o) / (a.normalized ? 127 : 1))], 5125: [4, (o) => bin.readUInt32LE(o)] }[a.componentType];
  if (!read) throw new Error(`непознат тип ${a.componentType}`);
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * read[0];
  const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = read[1](off + k * stride + c * read[0]);
  return out;
}

/** Маха вградените картинки от GLB: връща новия файл и първата картинка (текстурата на героя). */
function stripImages(file) {
  const { json, bin } = readGlb(file);
  const img = (json.images || [])[0];
  const imgViews = new Set((json.images || []).map(i => i.bufferView).filter(v => v !== undefined));
  let png = null;
  if (img && img.bufferView !== undefined) { const bv = json.bufferViews[img.bufferView]; png = Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)); }
  const remap = new Map(), chunks = [], views = [];
  let len = 0;
  json.bufferViews.forEach((bv, i) => {
    if (imgViews.has(i)) return;
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const pad = (4 - len % 4) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; }
    remap.set(i, views.length);
    views.push({ ...bv, buffer: 0, byteOffset: len });
    chunks.push(data); len += data.length;
  });
  json.bufferViews = views;
  for (const a of json.accessors) if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials || []) {
    delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture;
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
  }
  const out = Buffer.concat(chunks);
  json.buffers = [{ byteLength: out.length }];
  return { json, bin: out, png, imageName: img?.name || null };
}

// ---------- скелети ----------

/** Възлите на GLB като дърво, с местните им преобразувания. */
function rig(json) {
  const nodes = json.nodes.map((n, i) => ({ i, name: n.name || `node${i}`, parent: -1, children: n.children || [],
    t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }));
  for (const n of nodes) for (const c of n.children) nodes[c].parent = n.i;
  const order = [];
  const walk = i => { order.push(i); nodes[i].children.forEach(walk); };
  (json.scenes?.[json.scene || 0]?.nodes || nodes.filter(n => n.parent < 0).map(n => n.i)).forEach(walk);
  return { nodes, order };
}
/** Световните матрици при дадени местни стойности (pose: възел → { t, r, s }, по подразбиране тези от файла). */
function worlds(r, pose) {
  const out = new Array(r.nodes.length);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const i of r.order) {
    const n = r.nodes[i], o = pose?.get(i);
    p.fromArray(o?.t || n.t); q.fromArray(o?.r || n.r).normalize(); s.fromArray(o?.s || n.s);
    m.compose(p, q, s);
    out[i] = n.parent >= 0 ? out[n.parent].clone().multiply(m) : m.clone();
  }
  return out;
}
const rotOf = m => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return q; };
const posOf = m => new THREE.Vector3().setFromMatrixPosition(m);

/** Името на кост от скелета „polygon" → общото име (малки букви, като в скелета „ue"). */
function canonSource(r, node) {
  const simple = { Hips: 'pelvis', Spine_01: 'spine_01', Spine_02: 'spine_02', Spine_03: 'spine_03', Neck: 'neck_01', Head: 'head' }[node.name];
  if (simple) return simple;
  let m = /^(Clavicle|Shoulder|Elbow|Hand|UpperLeg|LowerLeg|Ankle|Ball)_([LR])$/.exec(node.name);
  if (m) return `${{ Clavicle: 'clavicle', Shoulder: 'upperarm', Elbow: 'lowerarm', Hand: 'hand', UpperLeg: 'thigh', LowerLeg: 'calf', Ankle: 'foot', Ball: 'ball' }[m[1]]}_${m[2].toLowerCase()}`;
  m = /^(Thumb|IndexFinger|Finger)_(0\d)(?:[._]\d+)?$/.exec(node.name);       // пръстите на дясната ръка са Thumb_01_1 или Thumb_01.001
  if (!m) return null;
  for (let p = node; p; p = p.parent >= 0 ? r.nodes[p.parent] : null) {
    const h = /^Hand_([LR])$/.exec(p.name);
    if (h) return `${m[1].toLowerCase()}_${m[2]}_${h[1].toLowerCase()}`;
  }
  return null;
}

/** Клипът: за всеки възел и път (translation / rotation / scale) времена и стойности. */
function readClip(json, bin) {
  const anim = json.animations?.[0];
  if (!anim) throw new Error('няма анимация');
  const tracks = new Map();
  let duration = 0;
  for (const ch of anim.channels) {
    const sm = anim.samplers[ch.sampler];
    const times = accessor(json, bin, sm.input), values = accessor(json, bin, sm.output);
    const size = ch.target.path === 'rotation' ? 4 : 3;
    const cubic = sm.interpolation === 'CUBICSPLINE';
    if (!tracks.has(ch.target.node)) tracks.set(ch.target.node, {});
    tracks.get(ch.target.node)[ch.target.path] = { times, values, size, cubic, step: sm.interpolation === 'STEP' };
    duration = Math.max(duration, times[times.length - 1] || 0);
  }
  return { tracks, duration };
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
function sample(tr, t) {
  const { times, values, size, cubic } = tr, n = times.length;
  const at = k => { const o = cubic ? k * size * 3 + size : k * size; return Array.from(values.subarray(o, o + size)); };
  if (n === 1 || t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let k = 0; while (k < n - 2 && times[k + 1] <= t) k++;
  const f = tr.step ? 0 : (t - times[k]) / (times[k + 1] - times[k]);
  const a = at(k), b = at(k + 1);
  if (size === 4) return qa.fromArray(a).slerp(qb.fromArray(b), f).toArray();
  return a.map((v, i) => v + (b[i] - v) * f);
}
function poseAt(clip, t) {
  const pose = new Map();
  for (const [node, tr] of clip.tracks) pose.set(node, { t: tr.translation && sample(tr.translation, t), r: tr.rotation && sample(tr.rotation, t), s: tr.scale && sample(tr.scale, t) });
  return pose;
}

// ---------- работа ----------

const wantFile = argOf('--want') ? path.resolve(argOf('--want')) : path.join(HERE, 'want', 'kinds.json');
const cfg = [].concat(JSON.parse(fs.readFileSync(wantFile, 'utf8'))).find(e => e.characters);
if (!cfg) throw new Error(`В ${path.basename(wantFile)} няма обект с "characters"`);
fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });
const manifest = { made: new Date().toISOString().slice(0, 16), characters: {}, clips: null, looks: cfg.looks || {}, special: cfg.special || {} };
const bigTextures = [];
let refTarget = null;       // първият възрастен герой: по неговия скелет се пренасят клиповете

function addCharacter(c, fix) {
  const src = path.join(LIB, 'GLB', 'Heroes', c.pack, `${c.name}.glb`);
  if (!fs.existsSync(src)) { console.log(`  ! няма ${src}`); return; }
  const { json, bin, png, imageName } = stripImages(src);
  if (fix) fix(json, bin, c);
  const out = path.join(OUT, `${c.name}.glb`);
  writeGlb(out, json, bin);
  let tex = null;
  if (png && imageName) {
    tex = `tex/${imageName}.png`;
    const texFile = path.join(OUT, tex);
    if (!fs.existsSync(texFile)) {
      const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
      fs.writeFileSync(texFile, png);
      if (Math.max(w, h) > TEX_SIZE) bigTextures.push(texFile);
    }
  }
  const r = rig(json), w = worlds(r);
  const by = name => r.nodes.find(n => n.name.toLowerCase() === name);
  const pelvis = by('pelvis'), foot = by('foot_l'), head = by('head');
  let tris = 0, height = 0;
  for (const m of json.meshes) for (const p of m.primitives) {
    tris += (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
    height = Math.max(height, json.accessors[p.attributes.POSITION].max?.[1] || 0);
  }
  const info = {
    file: `${c.name}.glb`, tex, pack: c.pack, sex: c.sex || 'm', family: c.family || 'adult', tris: Math.round(tris),
    joints: json.skins[0].joints.length, height: +height.toFixed(3),
    hip: +posOf(w[pelvis.i]).y.toFixed(4), ankle: +posOf(w[foot.i]).y.toFixed(4), head: +posOf(w[head.i]).y.toFixed(4),
    notForKids: !!c.notForKids, bytes: fs.statSync(out).size,
  };
  if (c.kind) info.kind = c.kind;
  manifest.characters[c.name] = info;
  if (!refTarget && info.family === 'adult' && !c.rerig) refTarget = { json, r, w, name: c.name };
  console.log(`  ${c.name}: ${info.tris} триъг., ${info.joints} кости, височина ${info.height} м, ${tex}`);
}
for (const c of cfg.characters) if (!c.rerig) addCharacter(c);

// ---------- герои с друг скелет ("rerig": true) ----------
// Шефовете на зомбитата имат същите кости по име, но други оси на костите и друга поза на покой (широки рамене, ръце надолу).
// За да вървят върху тях същите клипове без промяна в играта, скелетът им се пренаписва: ставите остават на местата си,
// всяка кост получава покой N = A⁻¹ · покой_на_образеца, а обратните матрици на връзване се смятат наново (M'·IBM' = M·IBM),
// така че в покой мрежата е същата. A е най-късото завъртане от посоката на костта в покой към посоката ѝ в T-позата на клиповете
// (само за крайниците; тялото и главата пазят стойката, с която е моделиран героят). Така клипът завърта мрежата с D(t)·A.
const ALIGN_CHILD = { clavicle: 'upperarm', upperarm: 'lowerarm', lowerarm: 'hand', hand: 'finger_01', thigh: 'calf', calf: 'foot', foot: 'ball',
  thumb_01: 'thumb_02', indexfinger_01: 'indexfinger_02', indexfinger_02: 'indexfinger_03', finger_01: 'finger_02', finger_02: 'finger_03' };
const ALIGN_SAME = { ball: 'foot', thumb_02: 'thumb_01', indexfinger_03: 'indexfinger_02', finger_03: 'finger_02' };      // крайните кости следват предната
function tposeOf() {
  let file = null;
  for (const pack of fs.readdirSync(path.join(LIB, 'Animations'))) { const f = path.join(LIB, 'Animations', pack, 'polygon', 'A_TPose_Neut.glb'); if (fs.existsSync(f)) { file = f; break; } }
  const tp = readGlb(file);
  const srcRig = rig(tp.json), srcT = worlds(srcRig, poseAt(readClip(tp.json, tp.bin), 0));
  const pos = new Map();
  for (const n of srcRig.nodes) { const c = canonSource(srcRig, n); if (c && !pos.has(c)) pos.set(c, posOf(srcT[n.i])); }
  return pos;
}
function rerigTo(ref, tposePos) {
  const refRest = new Map(), refParent = new Map();
  for (const i of ref.r.order) {
    const n = ref.r.nodes[i], c = n.name.toLowerCase();
    if (!tposePos.has(c)) continue;
    refRest.set(c, rotOf(ref.w[i]));
    refParent.set(c, n.parent >= 0 ? ref.r.nodes[n.parent].name.toLowerCase() : '');
  }
  return (json, bin, c) => {
    const r = rig(json), w = worlds(r);
    const byCanon = new Map(r.nodes.map(n => [n.name.toLowerCase(), n]));
    const at = name => posOf(w[byCanon.get(name).i]);
    const align = new Map();
    const alignOf = canon => {
      if (align.has(canon)) return align.get(canon);
      const m = /^(.*)_([lr])$/.exec(canon), stem = m ? m[1] : canon, side = m ? `_${m[2]}` : '';
      let A = new THREE.Quaternion();
      const child = ALIGN_CHILD[stem] && `${ALIGN_CHILD[stem]}${side}`;
      if (child && byCanon.has(child) && tposePos.has(child)) {
        const a = at(child).sub(at(canon)).normalize(), b = tposePos.get(child).clone().sub(tposePos.get(canon)).normalize();
        A = new THREE.Quaternion().setFromUnitVectors(a, b);
      } else if (ALIGN_SAME[stem] && byCanon.has(`${ALIGN_SAME[stem]}${side}`)) A = alignOf(`${ALIGN_SAME[stem]}${side}`).clone();
      align.set(canon, A);
      return A;
    };
    const W2 = w.map(m => m.clone());
    const changed = new Set();
    let worstRest = 0, worstAlign = 0, worstName = '';
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const i of r.order) {
      const n = r.nodes[i], canon = n.name.toLowerCase();
      if (!refRest.has(canon)) continue;
      const parent = n.parent >= 0 ? r.nodes[n.parent].name.toLowerCase() : '';
      if (parent !== refParent.get(canon)) console.log(`  ! ${c.name}: костта ${canon} виси на ${parent}, а в образеца на ${refParent.get(canon)}`);
      w[i].decompose(p, q, s);
      const A = alignOf(canon);
      const N = A.clone().invert().multiply(refRest.get(canon));
      worstRest = Math.max(worstRest, q.angleTo(refRest.get(canon)));
      const ang = 2 * Math.acos(Math.min(1, Math.abs(A.w)));
      if (ang > worstAlign) { worstAlign = ang; worstName = canon; }
      W2[i] = new THREE.Matrix4().compose(p, N, s);
      changed.add(i);
    }
    for (const i of r.order) {
      const n = r.nodes[i];
      if (!changed.has(i) && !changed.has(n.parent)) continue;
      const local = n.parent >= 0 ? W2[n.parent].clone().invert().multiply(W2[i]) : W2[i].clone();
      local.decompose(p, q, s);
      const node = json.nodes[i];
      delete node.matrix;
      node.translation = p.toArray(); node.rotation = q.normalize().toArray(); node.scale = s.toArray();
    }
    const skin = json.skins[0], acc = json.accessors[skin.inverseBindMatrices], bv = json.bufferViews[acc.bufferView];
    if (acc.componentType !== 5126 || acc.type !== 'MAT4') throw new Error(`${c.name}: неочаквани обратни матрици`);
    const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    skin.joints.forEach((j, k) => {
      const ibm = new THREE.Matrix4().fromArray(Array.from({ length: 16 }, (_, e) => bin.readFloatLE(off + (k * 16 + e) * 4)));
      const m = W2[j].clone().invert().multiply(w[j]).multiply(ibm);
      m.elements.forEach((v, e) => bin.writeFloatLE(v, off + (k * 16 + e) * 4));
    });
    console.log(`  ${c.name}: скелетът е пренаписан (${changed.size} кости; покоят се различаваше до ${(worstRest * 57.3).toFixed(0)}°, най-голямо изправяне към T-поза ${(worstAlign * 57.3).toFixed(0)}° при ${worstName})`);
  };
}
if (cfg.characters.some(c => c.rerig)) {
  if (!refTarget) throw new Error('"rerig" иска поне един обикновен възрастен герой за образец');
  const fix = rerigTo(refTarget, tposeOf());
  for (const c of cfg.characters) if (c.rerig) addCharacter(c, fix);
}

if (bigTextures.length) {
  // смаляване с Blender, със същия convert.py като останалите модели
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synty-chr-'));
  const jobs = { models: [], textures: bigTextures.map(f => ({ src: f, out: f, size: TEX_SIZE })), report: path.join(dir, 'report.json') };
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs));
  try { execFileSync(BLENDER, ['-b', '--factory-startup', '-P', path.join(HERE, 'convert.py'), '--', path.join(dir, 'jobs.json')], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { console.log(`  ! Blender: ${String(e.stderr || e.message).slice(-300)}`); }
  for (const f of bigTextures) { const b = fs.readFileSync(f); console.log(`  текстура ${path.basename(f)}: ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`); }
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- клипове ----------

if (refTarget && cfg.clips) {
  const clipFile = (name) => {
    for (const pack of fs.readdirSync(path.join(LIB, 'Animations'))) { const f = path.join(LIB, 'Animations', pack, 'polygon', `${name}.glb`); if (fs.existsSync(f)) return f; }
    return null;
  };
  // T-позата на скелета на клиповете
  const tp = readGlb(clipFile('A_TPose_Neut'));
  const srcRig = rig(tp.json);
  const srcT = worlds(srcRig, poseAt(readClip(tp.json, tp.bin), 0));
  const srcByCanon = new Map();
  for (const n of srcRig.nodes) { const c = canonSource(srcRig, n); if (c && !srcByCanon.has(c)) srcByCanon.set(c, n.i); }
  // костите на целта, които имат съответствие, родителите преди децата
  const tr = refTarget.r, tw = refTarget.w;
  const bones = tr.order.map(i => tr.nodes[i]).filter(n => srcByCanon.has(n.name.toLowerCase()));
  const names = bones.map(n => n.name.toLowerCase());
  const idx = new Map(bones.map((n, k) => [n.i, k]));
  const restT = bones.map(n => rotOf(tw[n.i]));
  const parentRest = bones.map(n => (n.parent >= 0 ? rotOf(tw[n.parent]) : new THREE.Quaternion()));
  const refT = names.map(c => rotOf(srcT[srcByCanon.get(c)]).invert());
  const hipsSrc = srcByCanon.get('pelvis'), hipsT = posOf(srcT[hipsSrc]);
  // проверка: ставите на двата скелета в T-поза трябва да съвпадат
  let worst = 0;
  bones.forEach((n, k) => { worst = Math.max(worst, posOf(tw[n.i]).distanceTo(posOf(srcT[srcByCanon.get(names[k])]))); });
  console.log(`  скелети: ${bones.length} общи кости, най-голяма разлика в T-поза ${(worst * 100).toFixed(1)} см`);

  const list = {}, chunks = [];
  let offset = 0;
  const q = new THREE.Quaternion(), prev = bones.map(() => new THREE.Quaternion());
  for (const [alias, def] of Object.entries(cfg.clips)) {
    const file = clipFile(def.file);
    if (!file) { console.log(`  ! няма клип ${def.file}`); continue; }
    const g = readGlb(file);
    const clip = readClip(g.json, g.bin);
    const r2 = rig(g.json);
    // Някои клипове (тичането) са без възлите Prop_L / Prop_R и номерата се разместват: тогава костите се търсят по име.
    let byCanon = srcByCanon;
    if (r2.nodes.length !== srcRig.nodes.length) {
      byCanon = new Map();
      for (const n of r2.nodes) { const c = canonSource(r2, n); if (c && !byCanon.has(c)) byCanon.set(c, n.i); }
      const lost = names.filter(c => !byCanon.has(c));
      if (lost.length) { console.log(`  ! ${def.file}: липсват кости ${lost.join(', ')}, клипът се пропуска`); continue; }
    }
    const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const data = new Int16Array(frames * (bones.length * 4 + 3));
    const world = new Array(bones.length);
    let drift = 0;
    for (let f = 0; f < frames; f++) {
      const w = worlds(r2, poseAt(clip, Math.min(clip.duration, f / FPS)));
      bones.forEach((n, k) => {
        world[k] = rotOf(w[byCanon.get(names[k])]).multiply(refT[k]).multiply(restT[k]);
        const pk = idx.get(n.parent);
        q.copy(pk !== undefined ? world[pk] : parentRest[k]).invert().multiply(world[k]).normalize();
        if (f > 0 && q.dot(prev[k]) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        prev[k].copy(q);
        const o = f * (bones.length * 4 + 3) + k * 4;
        data[o] = Math.round(q.x * 32767); data[o + 1] = Math.round(q.y * 32767); data[o + 2] = Math.round(q.z * 32767); data[o + 3] = Math.round(q.w * 32767);
      });
      const d = posOf(w[byCanon.get('pelvis')]).sub(hipsT);
      if (def.inPlace !== false) drift = Math.max(drift, Math.hypot(d.x, d.z));
      const o = f * (bones.length * 4 + 3) + bones.length * 4;
      data[o] = Math.round(d.x * 10000); data[o + 1] = Math.round(d.y * 10000); data[o + 2] = Math.round(d.z * 10000);
    }
    list[alias] = { file: def.file, frames, duration: +((frames - 1) / FPS).toFixed(4), offset, loop: def.loop !== false };
    chunks.push(Buffer.from(data.buffer)); offset += data.length;
    console.log(`  клип ${alias}: ${def.file}, ${frames} кадъра, ${(clip.duration).toFixed(2)} с, отместване на таза до ${(drift * 100).toFixed(0)} см`);
  }
  fs.writeFileSync(path.join(OUT, 'clips.bin'), Buffer.concat(chunks));
  manifest.clips = { file: 'clips.bin', fps: FPS, bones: names, stride: names.length * 4 + 3, hipUnit: 0.0001, refHip: +hipsT.y.toFixed(4), refAnkle: +posOf(srcT[srcByCanon.get('foot_l')]).y.toFixed(4), list };
  console.log(`  clips.bin: ${(offset * 2 / 1024).toFixed(0)} KB, ${Object.keys(list).length} клипа`);
}

// ---------- ръцете на играчите ----------
// Sidekick частите HNDL / HNDR са кожа върху целия скелет, в T-поза. Тук ръката се изпича като обикновен меш:
// началото е в китката, пръстите сочат към −Z, дланта гледа надолу, дължината е 0.19 м.

function staticGlb(file, name, pos, nor, uv, idx) {
  const parts = [], views = [], accessors = [];
  let len = 0;
  const push = (arr, target, type, comp, extra = {}) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - len % 4) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); len += pad; }
    views.push({ buffer: 0, byteOffset: len, byteLength: buf.length, target });
    accessors.push({ bufferView: views.length - 1, componentType: comp, count: arr.length / COMP[type], type, ...extra });
    parts.push(buf); len += buf.length;
  };
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
  push(pos, 34962, 'VEC3', 5126, { min: lo, max: hi }); push(nor, 34962, 'VEC3', 5126); push(uv, 34962, 'VEC2', 5126); push(idx, 34963, 'SCALAR', 5123);
  const json = {
    asset: { version: '2.0', generator: 'vr-arena characters.mjs' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'palette', doubleSided: true }], accessors, bufferViews: views, buffers: [{ byteLength: len }],
  };
  writeGlb(file, json, Buffer.concat(parts));
  return { min: lo, max: hi };
}

if (cfg.hands) {
  fs.mkdirSync(path.join(OUT, 'hands'), { recursive: true });
  manifest.hands = {};
  for (const side of ['l', 'r']) {
    const src = path.join(LIB, cfg.hands[side]);
    if (!fs.existsSync(src)) { console.log(`  ! няма ${src}`); continue; }
    const { json, bin } = readGlb(src);
    const skin = json.skins[0], ibm = accessor(json, bin, skin.inverseBindMatrices);
    const at = n => { const k = skin.joints.findIndex(j => json.nodes[j].name === n); if (k < 0) throw new Error(`няма кост ${n}`); return posOf(new THREE.Matrix4().fromArray(Array.from(ibm.subarray(k * 16, k * 16 + 16))).invert()); };
    const W = at(`hand_${side}`);
    const f = at(`middle_01_${side}`).sub(W).normalize();                      // накъде сочат пръстите
    const t = at(`thumb_01_${side}`).sub(W), s = t.addScaledVector(f, -t.dot(f)).normalize();   // към палеца, напречно на пръстите
    const X = side === 'r' ? s.clone().negate() : s.clone(), Z = f.clone().negate(), Y = new THREE.Vector3().crossVectors(Z, X).normalize();
    X.crossVectors(Y, Z).normalize();
    const R = new THREE.Matrix3().set(X.x, X.y, X.z, Y.x, Y.y, Y.z, Z.x, Z.y, Z.z);   // от пространството на героя към ръката
    const prim = json.meshes[0].primitives[0];
    const P = accessor(json, bin, prim.attributes.POSITION), N = accessor(json, bin, prim.attributes.NORMAL), U = accessor(json, bin, prim.attributes.TEXCOORD_0), I = accessor(json, bin, prim.indices);
    let reach = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < P.length; i += 3) reach = Math.max(reach, v.set(P[i], P[i + 1], P[i + 2]).sub(W).dot(f));
    const k = (cfg.hands.length || 0.19) / reach;
    const pos = new Float32Array(P.length), nor = new Float32Array(N.length);
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i], P[i + 1], P[i + 2]).sub(W).applyMatrix3(R).multiplyScalar(k); pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
      v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(R).normalize(); nor[i] = v.x; nor[i + 1] = v.y; nor[i + 2] = v.z;
    }
    const img = json.images?.[0];
    let tex = null;
    if (img?.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      tex = `tex/${img.name}.png`;
      fs.writeFileSync(path.join(OUT, tex), bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    }
    const box = staticGlb(path.join(OUT, 'hands', `hand_${side}.glb`), `hand_${side}`, pos, nor, Float32Array.from(U), Uint16Array.from(I));
    manifest.hands[side] = { file: `hands/hand_${side}.glb`, tex, tris: I.length / 3, source: path.basename(src, '.glb'), min: box.min.map(n => +n.toFixed(3)), max: box.max.map(n => +n.toFixed(3)) };
    console.log(`  ръка ${side}: ${I.length / 3} триъг., от ${box.min.map(n => n.toFixed(3))} до ${box.max.map(n => n.toFixed(3))}, мащаб ${k.toFixed(3)}`);
  }
}

fs.writeFileSync(path.join(OUT, 'characters.json'), JSON.stringify(manifest, null, 1));
console.log(`готово: ${Object.keys(manifest.characters).length} героя → ${OUT}`);

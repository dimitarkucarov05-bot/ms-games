// Зомбитата на екрана: зарежда героите и клиповете (форматът на tools/synty/characters.mjs), държи басейн от тела,
// води ги между състоянията, които праща сървърът (10 пъти в секунда), пуска клип според състоянието, дава обемите
// за лъча на куршума (глава и тяло) и се грижи за смъртта и изчезването.
//
// Всички числа са в координатите на залата (децата на ctx.root).

const GLTF_URL = '/play/vendor/addons/loaders/GLTFLoader.js';
const SKEL_URL = '/play/vendor/addons/utils/SkeletonUtils.js';
const FALLBACK_BASE = '/play/assets/synty/_characters/';

export const ST = { walk: 0, attack: 1, stagger: 2, dead: 3, scream: 4, rise: 5, leap: 6 };
const ARM = /^(clavicle|upperarm|lowerarm|hand|thumb|indexfinger|finger)_/;
const NATURAL = { walk: 1.45, run: 3.2 };      // с каква скорост върви клипът при нормален темп (м/с), ако описът не казва
const CORPSE_TIME = 2.6, SINK_TIME = 1.4, FADE_AT = 1.3, FADE_TIME = 0.9, MAX_CORPSES = /Quest 2/.test(globalThis.navigator?.userAgent || '') ? 5 : 8;

export async function createZombies(ctx, start, A, fx, audio) {
  const kids = !!start.kids;      // детски режим: без пукнати глави, телата изчезват
  const { THREE, root } = ctx;
  const quest = /Quest/.test(navigator.userAgent);
  const types = start.types || ['walker', 'runner', 'screamer', 'boss', 'brute', 'leaper'];
  const big = t => t === 'boss' || t === 'brute';
  const LEAP_T = start.leap?.time || 0.85, LEAP_H = start.leap?.high || 1.35;      // тежките: не падат от един изстрел, тежки стъпки и удари
  const spec = start.zombies || {};
  const group = new THREE.Group();
  group.name = 'zombies';
  root.add(group);

  // ── героите ──
  let base = (A && typeof A.characters === 'string' && A.characters) || '/play/assets/synty/_zombies/';
  if (!base.endsWith('/')) base += '/';
  let man = await fetch(`${base}characters.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  let real = !!man;
  if (!man) { base = FALLBACK_BASE; man = await fetch(`${base}characters.json`).then(r => (r.ok ? r.json() : null)).catch(() => null); }
  if (!man) throw new Error('no characters for the zombies');
  const [{ GLTFLoader }, skel] = await Promise.all([import(GLTF_URL), import(SKEL_URL)]);
  const loader = new GLTFLoader(), texLoader = new THREE.TextureLoader();
  const bin = man.clips ? await fetch(base + man.clips.file).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
  const data = bin ? new Int16Array(bin) : null;
  const clipList = man.clips?.list || {};

  const all = Object.keys(man.characters);
  const have = list => (Array.isArray(list) ? list.filter(n => man.characters[n]) : []);
  const isBoss = n => /boss/i.test(n);
  const names = {
    walker: have(A?.zombies?.walker), runner: have(A?.zombies?.runner), screamer: have(A?.zombies?.screamer), boss: have(A?.zombies?.boss),
    brute: have(A?.zombies?.brute), leaper: have(A?.zombies?.leaper),
  };
  if (!names.walker.length) names.walker = all.filter(n => !isBoss(n));
  if (!names.walker.length) names.walker = all.slice();
  if (!names.runner.length) names.runner = names.walker;
  if (!names.boss.length) names.boss = all.filter(isBoss).slice(0, 1);
  { const brute = names.boss.find(n => /brute/i.test(n)); names.boss = brute ? [brute] : names.boss.slice(0, 1); }
  if (!names.boss.length) names.boss = names.walker.slice(0, 1);
  // едрият: от шефовете, които шефът не ползва (дебелите); прескачащият: от бегачите
  if (!names.brute.length) names.brute = all.filter(n => /blobber|slobber/i.test(n));
  if (!names.leaper.length) names.leaper = names.runner.slice();
  if (!names.screamer.length) {      // пищящият е един и същ герой, за да се разпознава: по възможност от шефовете (слабият), иначе жена
    const thin = all.find(n => /wretch/i.test(n)) || names.walker.find(n => man.characters[n].sex === 'f') || names.walker[0];
    names.screamer = [thin];
  }
  const needed = [...new Set([...names.walker, ...names.runner, ...names.screamer, ...names.boss, ...names.brute, ...names.leaper])];

  // клиповете по вид: от assets.json, иначе по името на ключа
  const keysOf = (kind, prefixes) => {
    const fromA = Array.isArray(A?.clips?.[kind]) ? A.clips[kind].filter(k => clipList[k]) : [];
    if (fromA.length) return fromA;
    return Object.keys(clipList).filter(k => prefixes.some(p => k === p || k.startsWith(`${p}_`)));
  };
  const KEYS = {
    idle: keysOf('idle', ['idle']), walk: keysOf('walk', ['walk']), run: keysOf('run', ['run', 'sprint']), attack: keysOf('attack', ['attack']),
    hit: keysOf('hit', ['hit', 'stagger']), death: keysOf('death', ['death']), roar: keysOf('roar', ['roar']), rise: keysOf('rise', ['rise']),
  };
  if (!KEYS.attack.length) KEYS.attack = keysOf('x', ['angry']);
  if (!KEYS.roar.length) KEYS.roar = keysOf('x', ['happy', 'angry']);
  const reach = clipList.attack_b ? 'attack_b' : null;      // „душене": от него идват протегнатите ръце на вървящите
  const speedOf = (key, kind) => Number(A?.clipSpeed?.[key]) || NATURAL[kind];

  const mats = new Map();
  const protos = new Map();
  await Promise.all(needed.map(async name => {
    const info = man.characters[name];
    try {
      const gltf = await loader.loadAsync(base + info.file);
      const scene = gltf.scene;
      let mat = mats.get(info.tex);
      if (!mat) {
        const tex = info.tex ? texLoader.load(base + info.tex) : null;
        if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; }
        mat = new THREE.MeshLambertMaterial({ map: tex });
        mats.set(info.tex, mat);
      }
      scene.traverse(o => {
        if (o.isBone) o.name = o.name.toLowerCase();
        if (o.isMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; }
      });
      scene.updateMatrixWorld(true);
      const pelvis = scene.getObjectByName('pelvis');
      const toLocal = pelvis ? new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(pelvis.parent.matrixWorld).invert()) : null;
      protos.set(name, { name, scene, info, hipLocal: pelvis ? pelvis.position.clone() : null, toLocal });
    } catch (e) { console.warn('[motel] character', name, e.message); }
  }));
  for (const k of Object.keys(names)) names[k] = names[k].filter(n => protos.has(n));
  if (!names.walker.length) throw new Error('no zombie loaded');
  for (const k of ['runner', 'screamer', 'boss', 'brute', 'leaper']) {
    const from = k === 'brute' ? names.boss : k === 'leaper' ? names.runner : names.walker;
    if (!names[k].length) names[k] = (from.length ? from : names.walker).slice(0, 1);
  }

  /** Клип за даден герой (завъртанията са общи, пътят на таза зависи от ръста). part: 'all' | 'legs' | 'arms'. */
  const clips = new Map();
  function clipFor(alias, p, part = 'all') {
    const c = man.clips, def = clipList[alias];
    if (!def || !data || !p.toLocal) return null;
    const scale = (p.info.hip - p.info.ankle) / (c.refHip - c.refAnkle);
    const key = `${alias}|${scale.toFixed(3)}|${part}`;
    let clip = clips.get(key);
    if (clip) return clip;
    const nb = c.bones.length, stride = c.stride, n = def.frames, d = data, o0 = def.offset;
    let shared = clips.get(`q:${alias}`);
    if (!shared) {
      const times = new Float32Array(n);
      for (let f = 0; f < n; f++) times[f] = f / c.fps;
      const quats = c.bones.map((_, k) => {
        const v = new Float32Array(n * 4);
        for (let f = 0; f < n; f++) {
          const o = o0 + f * stride + k * 4;
          v[f * 4] = d[o] / 32767; v[f * 4 + 1] = d[o + 1] / 32767; v[f * 4 + 2] = d[o + 2] / 32767; v[f * 4 + 3] = d[o + 3] / 32767;
        }
        return v;
      });
      shared = { times, quats };
      clips.set(`q:${alias}`, shared);
    }
    const tracks = [];
    c.bones.forEach((b, k) => {
      const arm = ARM.test(b);
      if ((part === 'legs' && arm) || (part === 'arms' && !arm)) return;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, shared.times, shared.quats[k]));
    });
    if (part !== 'arms') {
      const pos = new Float32Array(n * 3), v = new THREE.Vector3();
      for (let f = 0; f < n; f++) {
        const o = o0 + f * stride + nb * 4;
        v.set(d[o], d[o + 1], d[o + 2]).multiplyScalar(c.hipUnit * scale).applyMatrix3(p.toLocal).add(p.hipLocal);
        pos[f * 3] = v.x; pos[f * 3 + 1] = v.y; pos[f * 3 + 2] = v.z;
      }
      tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', shared.times, pos));
    }
    clip = new THREE.AnimationClip(`${alias}:${part}`, def.duration, tracks);
    clips.set(key, clip);
    return clip;
  }
  /** Откъс от клип (между две части от дължината му): за протегнатите ръце. */
  function subClip(clip, a, b, name) {
    const fps = man.clips.fps, n = Math.round(clip.duration * fps);
    return THREE.AnimationUtils.subclip(clip, name, Math.round(n * a), Math.max(Math.round(n * a) + 2, Math.round(n * b)), fps);
  }

  // ── тела: басейн по герой ──
  const pool = new Map();
  let made = 0;
  function makeBody(name) {
    const p = protos.get(name);
    const body = skel.clone(p.scene);
    body.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    const g = new THREE.Group();
    g.add(body);
    made++;
    const b = { name, p, g, body, mixer: new THREE.AnimationMixer(body), actions: new Map(), cur: null, arms: null,
      head: body.getObjectByName('head'), neck: body.getObjectByName('neck_01') || body.getObjectByName('spine_03'), sex: p.info.sex === 'f' ? 'f' : 'm' };
    return b;
  }
  function acquire(name) {
    const list = pool.get(name);
    const b = list && list.length ? list.pop() : makeBody(name);
    b.g.visible = true; b.g.position.set(0, 0, 0); b.g.rotation.set(0, 0, 0); b.g.scale.setScalar(1);
    if (b.head) b.head.scale.setScalar(1);
    group.add(b.g);
    return b;
  }
  /** Детски режим: тялото изтънява и изчезва. Материалите са общи, затова гаснещото тяло получава свои копия. */
  function fadeable(b) {
    if (b.faded) return;
    b.faded = [];
    b.body.traverse(o => {
      if (!o.isMesh) return;
      const m0 = o.material, m = Array.isArray(m0) ? m0.map(x => x.clone()) : m0.clone();
      for (const x of [].concat(m)) { x.transparent = true; x.opacity = 1; }
      b.faded.push([o, m0, m]); o.material = m;
    });
  }
  function fadeTo(b, k) { for (const [, , m] of b.faded || []) for (const x of [].concat(m)) x.opacity = k; }
  function unfade(b) {
    for (const [o, m0, m] of b.faded || []) { o.material = m0; for (const x of [].concat(m)) x.dispose(); }
    b.faded = null;
  }
  function release(b) {
    unfade(b);
    b.mixer.stopAllAction(); b.cur = null; b.arms = null;
    group.remove(b.g);
    if (!pool.has(b.name)) pool.set(b.name, []);
    pool.get(b.name).push(b);
  }
  function action(b, alias, part = 'all') {
    const key = `${alias}|${part}`;
    let a = b.actions.get(key);
    if (a === undefined) {
      const clip = clipFor(alias, b.p, part);
      a = clip ? b.mixer.clipAction(clip) : null;
      b.actions.set(key, a);
    }
    return a;
  }
  /** Сменя основния клип. once: пуска се веднъж и застива на последния кадър. */
  function play(b, alias, { fade = 0.18, once = false, scale = 1, part = 'all', restart = false } = {}) {
    const next = action(b, alias, part);
    if (!next) return null;
    if (next === b.cur && !restart) { next.timeScale = scale; return next; }
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = scale;
    next.setEffectiveWeight(1).play();
    if (b.cur && b.cur !== next) { if (fade > 0) next.crossFadeFrom(b.cur, fade, false); else b.cur.stop(); }
    b.cur = next;
    return next;
  }
  /** Протегнати ръце върху ходенето: откъс от клипа за душене, само костите на ръцете. */
  function armsOn(b, on) {
    if (!reach) return;
    if (on && !b.arms) {
      let a = b.actions.get('reach');
      if (a === undefined) {
        const full = clipFor(reach, b.p, 'arms');
        a = full ? b.mixer.clipAction(subClip(full, 0.34, 0.62, `reach:${b.name}`)) : null;
        if (a) a.setLoop(THREE.LoopPingPong, Infinity);
        b.actions.set('reach', a);
      }
      if (a) { a.reset().setEffectiveWeight(1).fadeIn(0.25).play(); a.timeScale = 0.5 + Math.random() * 0.3; b.arms = a; }
    } else if (!on && b.arms) { b.arms.fadeOut(0.15); b.arms = null; }
  }

  // подгряване: по едно тяло от всеки герой, за да няма засечка при първото раждане
  for (const n of needed) if (protos.has(n)) release(acquire(n));

  // ── записите ──
  const list = new Map();      // id → запис
  const corpses = [];
  const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  let clock = 0, frame = 0;
  const gone = [];
  let floor = null;      // височината на земята под зомбито, ако светът я дава (иначе равно на нула)

  function born(row) {
    const [id, ti, look, x, z, h, state] = row;
    const type = types[ti] || 'walker';
    const name = pick(names[type] || names.walker, look);
    const b = acquire(name);
    const t = spec[type] || { r: 0.3, h: 1.8, speed: 1 };
    const k = Number(A?.zombies?.scale?.[type]) || 1;
    b.g.scale.setScalar(k);
    const rec = { id, type, t, look, b, k, x, z, h, tx: x, tz: z, th: h, px: x, pz: z, v: 0, state: -1, hp: 1, rage: 0, bornAt: clock, deadAt: 0, local: 0, sink: 0, gone: false,
      head: new THREE.Vector3(x, 1.6 * k, z), neck: new THREE.Vector3(x, 1.4 * k, z), headR: (big(type) ? 0.24 : 0.17) * k, step: Math.random() * 0.6, groan: 1 + Math.random() * 4,
      vary: look % 7, idle: pick(KEYS.idle, look), walkKey: null, flinch: 0 };
    // три походки: обикновена, приведена и със залитане; тичащите тичат
    const walks = KEYS.walk.filter(q => !/_low$/.test(q));
    const plainWalk = walks.find(q => q.endsWith(`_${b.sex}`)) || walks[0];
    const stalk = clipList.walk_a ? 'walk_a' : plainWalk;      // прегърбеното дебнене: най-зомби походката
    const runs = KEYS.run.filter(q => q !== 'sprint');
    rec.runKey = pick(runs.length ? runs : walks, look);
    rec.walkKey = type === 'runner' || type === 'leaper' ? rec.runKey : rec.vary === 3 && clipList.walk_low ? 'walk_low' : (rec.vary === 2 || rec.vary === 5) ? plainWalk : stalk;
    rec.reach = !big(type) && type !== 'runner' && type !== 'leaper' && [1, 2, 6].includes(rec.vary) && !!reach;
    // зловещото бягане на последните вълни: ниско приведен, с протегнати напред ръце, много по-бързо от нормалната крачка
    rec.creep = row[9] === 1 && !!clipList.walk_low;
    if (rec.creep) { rec.runKey = 'walk_low'; rec.reach = !!reach; }
    rec.walkV = speedOf(rec.walkKey, 'walk') * k; rec.runV = speedOf(rec.runKey, rec.creep ? 'walk' : 'run') * k; rec.mode = -1;
    b.g.position.set(x, 0, z); b.g.rotation.y = h;
    list.set(id, rec);
    setState(rec, state, true);
    return rec;
  }

  function setState(rec, state, first = false) {
    if (rec.state === state && !first) return;
    const b = rec.b, prev = rec.state;
    rec.state = state;
    rec.mode = -1;
    if (state === ST.dead) return die(rec);
    if (state === ST.rise) {
      const key = KEYS.rise[0];
      if (key) { const a = play(b, key, { once: true, fade: 0, scale: (clipList[key].duration || 4) / 1.4 }); if (a) a.time = 0; }
      else play(b, rec.idle, { fade: 0 });
      armsOn(b, false);
      rec.riseAt = clock;
      fx.burst(tmp.set(rec.x, 0.05, rec.z), 'dirt', 10, 1.6);
      return;
    }
    if (state === ST.stagger) {
      const keys = KEYS.hit.length ? KEYS.hit : null;
      if (keys) { const key = pick(keys, Math.floor(Math.random() * 100)); play(b, key, { once: true, fade: 0.06, scale: Math.max(1, (clipList[key].duration || 0.9) / 0.55), restart: true }); }
      armsOn(b, false);
      return;
    }
    if (state === ST.scream) {
      const key = KEYS.roar[0];
      if (key) play(b, key, { once: true, fade: 0.12, scale: (clipList[key].duration || 3.8) / 2.3, restart: true });
      armsOn(b, false);
      return;
    }
    if (state === ST.leap) {      // скок през барикадата: спринт във въздуха, дъгата е в update
      const key = clipList.sprint ? 'sprint' : rec.runKey;
      play(b, key, { fade: 0.08, scale: 1.3, restart: true });
      armsOn(b, false);
      rec.leapAt = clock;
      return;
    }
    if (state === ST.attack) return swing(rec);
    if (prev === ST.attack && rec.attackUntil > clock) return;      // замахът се доиграва
    locomotion(rec, true);
  }
  function swing(rec) {
    const b = rec.b;
    const key = big(rec.type) ? (clipList.attack_d ? 'attack_d' : KEYS.attack[0]) : (clipList.attack_c ? 'attack_c' : KEYS.attack[0]);
    if (!key) return;
    const dur = clipList[key].duration || 1;
    const scale = rec.type === 'boss' ? dur / 1.15 : rec.type === 'brute' ? dur / 1.05 : Math.max(0.9, dur / 0.95);
    rec.mode = -1;
    play(b, key, { once: true, fade: 0.08, scale, restart: true });
    armsOn(b, false);
    rec.attackUntil = clock + dur / scale;
  }
  /** Вървене, тичане или стоене според това колко бързо се мести зомбито. */
  function locomotion(rec, force = false) {
    const b = rec.b;
    if (rec.attackUntil > clock && !force) return;
    const run = rec.type === 'runner' || rec.type === 'leaper' || rec.v > 1.9;      // разяреният вървящ само ускорява крачката
    const mode = rec.v < 0.12 ? 0 : run ? 1 : 2;
    if (mode === rec.mode && !force && b.cur) {
      if (mode === 1) b.cur.timeScale = Math.min(rec.creep ? 2.6 : 1.5, Math.max(0.5, rec.v / rec.runV));
      else if (mode === 2) b.cur.timeScale = Math.min(1.6, Math.max(0.4, rec.v / rec.walkV));
      return;
    }
    rec.mode = mode;
    if (rec.v < 0.12) {
      play(b, rec.idle, { fade: 0.25 });
      armsOn(b, rec.reach);
    } else if (run) {
      play(b, rec.runKey, { fade: 0.2, scale: Math.min(rec.creep ? 2.6 : 1.5, Math.max(0.5, rec.v / rec.runV)), part: rec.creep && rec.reach ? 'legs' : 'all' });
      armsOn(b, rec.creep && rec.reach);
    } else {
      play(b, rec.walkKey, { fade: 0.2, scale: Math.min(1.6, Math.max(0.4, rec.v / rec.walkV)), part: rec.reach ? 'legs' : 'all' });
      armsOn(b, rec.reach);
    }
  }
  function die(rec) {
    const b = rec.b;
    if (rec.deadAt) return;
    rec.deadAt = clock;
    armsOn(b, false);
    // накъде пада: по посоката на последния изстрел спрямо лицето му
    const fxn = Math.sin(rec.h), fzn = Math.cos(rec.h), d = rec.dx * fxn + rec.dz * fzn, side = rec.dx * fzn - rec.dz * fxn;
    let key = null;
    if (KEYS.death.length) {
      const want = !rec.dx && !rec.dz ? null : d < -0.35 ? 'death_b' : d > 0.35 ? 'death_f' : side > 0 ? 'death_r' : 'death_l';
      key = want && clipList[want] ? want : pick(KEYS.death, rec.look);
    }
    if (key) play(b, key, { once: true, fade: 0.06, scale: big(rec.type) ? 0.8 : 1.15, restart: true });
    else { b.mixer.stopAllAction(); b.cur = null; rec.fall = 0.001; }      // без клип за смърт: пада назад като дъска
    if (kids) fadeable(b);
    corpses.push(rec);
    while (corpses.length > MAX_CORPSES) { const old = corpses.shift(); if (old.gone) continue; if (kids && old.b.faded) old.deadAt = Math.min(old.deadAt, clock - FADE_AT); else old.sink = Math.max(old.sink, 0.001), old.deadAt = Math.min(old.deadAt, clock - CORPSE_TIME); }
  }
  function remove(rec) {
    if (rec.gone) return;
    rec.gone = true;
    release(rec.b);
    list.delete(rec.id);
    const i = corpses.indexOf(rec);
    if (i >= 0) corpses.splice(i, 1);
  }

  // ── от сървъра ──
  const seen = new Set();
  const hitRes = { id: 0, part: 0, dist: 0, rec: null, point: new THREE.Vector3() };
  function sync(rows) {
    seen.clear();
    for (const row of rows || []) {
      const id = row[0];
      seen.add(id);
      let rec = list.get(id);
      if (!rec) { if (row[6] === ST.dead) continue; rec = born(row); }
      if (rec.local) {      // паднало е от моя изстрел, преди сървърът да каже: чака потвърждение
        if (row[6] === ST.dead) rec.local = 0;
        else if (clock - rec.local > 0.7) undoLocal(rec);
        else continue;
      }
      if (rec.deadAt) continue;
      rec.px = rec.tx; rec.pz = rec.tz;
      rec.tx = row[3]; rec.tz = row[4]; rec.th = row[5];
      rec.v = rec.v * 0.5 + Math.hypot(rec.tx - rec.px, rec.tz - rec.pz) / 0.1 * 0.5;
      rec.hp = row[7]; rec.rage = row[8] ? 1 : 0;
      if (row[6] === ST.attack && rec.state === ST.attack) continue;
      setState(rec, row[6]);
    }
    // което е изчезнало от състоянието, без да сме видели смъртта му
    for (const rec of list.values()) if (!seen.has(rec.id) && !rec.deadAt) { rec.dx ||= 0; rec.dz ||= 0; setState(rec, ST.dead); }
  }
  /** Убийство, потвърдено от сървъра. */
  function killed(e) {
    const rec = list.get(e.z);
    if (!rec) return null;
    rec.dx = e.dx || 0; rec.dz = e.dz || 0; rec.local = 0;
    const fresh = !rec.deadAt;
    if (fresh) setState(rec, ST.dead);
    if (e.head && !rec.popped) pop(rec);
    return fresh ? rec : null;
  }
  /** Моят изстрел в главата: зомбито пада веднага, без да чака сървъра (ако той не потвърди, се изправя). */
  function localKill(id, dir) {
    const rec = list.get(id);
    if (!rec || rec.deadAt || big(rec.type)) return;      // тежките не падат от един изстрел: чака се сървърът
    rec.dx = dir.x; rec.dz = dir.z; rec.local = clock;
    setState(rec, ST.dead);
    pop(rec);
  }
  function undoLocal(rec) {
    rec.local = 0; rec.deadAt = 0; rec.popped = false; rec.state = -1; rec.fall = 0;
    if (rec.b.head) rec.b.head.scale.setScalar(1);
    rec.b.g.rotation.x = 0;
    unfade(rec.b);
    const i = corpses.indexOf(rec);
    if (i >= 0) corpses.splice(i, 1);
  }
  function pop(rec) {
    rec.popped = true;
    if (kids) { fx.burst(rec.head, 'dust', 3, 1.2); return; }      // детски режим: главата остава, само малко прах
    if (rec.b.head) rec.b.head.scale.setScalar(0.001);
    fx.burst(rec.head, 'gore', 16, 3.2);
    audio.splat(rec.head);
  }
  /** Леко трепване от мое попадение в тялото (преди сървърът да е казал каквото и да е). */
  function flinch(id) { const rec = list.get(id); if (rec && !rec.deadAt) rec.flinch = 0.12; }

  // ── лъчът на куршума ──
  /** Най-близкото живо зомби по лъча: { id, part (0 тяло, 1 глава), dist, point, rec } или null. */
  function raycast(o, d, max = 80, pad = 0) {
    let best = null, bd = Infinity, bp = 0;
    for (const rec of list.values()) {
      if (rec.deadAt || rec.state === ST.dead) continue;
      // глава: кълбо
      let t = raySphere(o, d, rec.head, rec.headR + pad);
      let part = 1;
      // тяло: капсула от краката до врата
      const tb = rayCapsule(o, d, rec.x, 0.08 + (rec.fy || 0), rec.z, rec.neck.x, rec.neck.y, rec.neck.z, (rec.t.r || 0.3) * rec.k + pad);
      if (t < 0 || (tb >= 0 && tb < t - 0.25)) { t = tb; part = 0; }
      if (t < 0 || t > max) continue;
      if (t < bd) { bd = t; best = rec; bp = part; }
    }
    if (!best) return null;
    hitRes.id = best.id; hitRes.part = bp; hitRes.dist = bd; hitRes.rec = best;
    hitRes.point.copy(o).addScaledVector(d, bd);
    return hitRes;
  }
  function raySphere(o, d, c, r) {
    tmp.subVectors(c, o);
    const b = tmp.dot(d), q = tmp.lengthSq() - b * b;
    if (b < 0 || q > r * r) return -1;
    return Math.max(0, b - Math.sqrt(r * r - q));
  }
  /** Лъч срещу капсула (отсечка A–B с радиус r): разстоянието по лъча до най-близкото доближаване, ако е под r. */
  function rayCapsule(o, d, ax, ay, az, bx, by, bz, r) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
    const a = 1, b = d.x * ux + d.y * uy + d.z * uz, c = ux * ux + uy * uy + uz * uz;
    const dd = d.x * wx + d.y * wy + d.z * wz, e = ux * wx + uy * wy + uz * wz;
    const den = a * c - b * b;
    let s = den > 1e-9 ? (b * e - c * dd) / den : 0;
    if (s < 0) s = 0;
    let t = c > 1e-9 ? (b * s + e) / c : 0;
    if (t < 0) { t = 0; s = Math.max(0, -dd); } else if (t > 1) { t = 1; s = Math.max(0, b - dd); }
    const px = o.x + d.x * s - (ax + ux * t), py = o.y + d.y * s - (ay + uy * t), pz = o.z + d.z * s - (az + uz * t);
    const dist2 = px * px + py * py + pz * pz;
    if (dist2 > r * r) return -1;
    return Math.max(0, s - Math.sqrt(r * r - dist2));
  }

  // ── кадър ──
  function update(dt, now) {
    clock += dt; frame++;
    const k = 1 - Math.exp(-dt * 11), hx = ctx.head.pos.x, hz = ctx.head.pos.z;
    root.updateWorldMatrix(true, false);
    gone.length = 0;
    for (const rec of list.values()) {
      const b = rec.b;
      if (rec.deadAt) {
        const since = clock - rec.deadAt;
        if (rec.fall) { rec.fall = Math.min(1, rec.fall + dt * 2.2); b.g.rotation.x = -rec.fall * rec.fall * 1.5; }
        if (kids && b.faded) {      // детски режим: пада, после изтънява и изчезва, без да остава тяло
          const k = 1 - (since - FADE_AT) / FADE_TIME;
          if (k < 1) fadeTo(b, Math.max(0, k));
          if (k <= 0) { gone.push(rec); continue; }
        } else if (since > CORPSE_TIME) {
          rec.sink += dt / SINK_TIME;
          b.g.position.y = (rec.fy || 0) - rec.sink * rec.sink * 1.2;
          if (rec.sink >= 1) { gone.push(rec); continue; }
        }
        b.mixer.update(dt);
        continue;
      }
      rec.x += (rec.tx - rec.x) * k; rec.z += (rec.tz - rec.z) * k;
      let dh = rec.th - rec.h;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      rec.h += dh * Math.min(1, dt * 8);
      let y = floor ? (rec.fy = floor(rec.x, rec.z) || 0) : 0;
      if (rec.state === ST.rise) y -= 0.55 * Math.max(0, 1 - (clock - rec.riseAt) / 0.55);
      if (rec.state === ST.leap) { const f = Math.min(1, (clock - rec.leapAt) / LEAP_T); y += 4 * LEAP_H * f * (1 - f); }      // дъгата над барикадата
      b.g.position.set(rec.x, y, rec.z);
      b.g.rotation.y = rec.h;
      if (rec.flinch > 0) { rec.flinch -= dt; b.g.rotation.x = -0.16 * Math.max(0, rec.flinch / 0.12); } else b.g.rotation.x = 0;
      if (rec.state === ST.walk) locomotion(rec);
      // далечните се обновяват през кадър (на каската всяко тяло е 48 кости)
      const far = (rec.x - hx) ** 2 + (rec.z - hz) ** 2 > (quest ? 144 : 900);
      if (!far || (frame + rec.id) % 2 === 0) b.mixer.update(far ? dt * 2 : dt);
      // обемите за лъча: от костите (от предишния кадър), в координатите на залата
      if (b.head) { tmp2.setFromMatrixPosition(b.head.matrixWorld); root.worldToLocal(tmp2); if (Math.abs(tmp2.x - rec.x) < 2 && Math.abs(tmp2.z - rec.z) < 2) { rec.head.copy(tmp2); rec.head.y += 0.07 * rec.k; } }
      if (b.neck) { tmp3.setFromMatrixPosition(b.neck.matrixWorld); root.worldToLocal(tmp3); if (Math.abs(tmp3.x - rec.x) < 2 && Math.abs(tmp3.z - rec.z) < 2) rec.neck.copy(tmp3); }
      // звук: стъпки на близките и ръмжене
      const dist = Math.hypot(rec.x - hx, rec.z - hz);
      if (rec.v > 0.3 && dist < 9) { rec.step -= dt * Math.max(0.6, rec.v); if (rec.step <= 0) { rec.step = big(rec.type) ? 0.75 : 0.62; audio.step(rec.x, rec.z, big(rec.type)); } }
      rec.groan -= dt;
      if (rec.groan <= 0) { rec.groan = 3.5 + Math.random() * 6; if (dist < 22) audio.groan(rec.x, rec.z, rec.type); }
    }
    for (const rec of gone) remove(rec);
  }

  function dispose() {
    for (const rec of [...list.values()]) remove(rec);
    root.remove(group);
    for (const m of mats.values()) { m.map?.dispose(); m.dispose(); }
    for (const p of protos.values()) p.scene.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }

  return {
    group, list, sync, killed, localKill, flinch, raycast, update, dispose, setFloor(fn) { floor = typeof fn === 'function' ? fn : null; }, swingOf: id => { const r = list.get(id); if (r && !r.deadAt) { r.state = ST.attack; swing(r); } },
    info: () => ({ real, base, characters: protos.size, made, alive: [...list.values()].filter(r => !r.deadAt).length, corpses: corpses.length, clips: Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, v.length])) }),
  };
}

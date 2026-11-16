// „Мъртвият мотел": сцената в каската.
//
//   createScene(ctx, start) → { onSnapshot(snap), update(dt, t), dispose(), info, debug }
//
// Парчетата: zombies.js (телата и клиповете), weapons.js (оръжията и стрелбата), fx.js (ефектите),
// audio.js (звукът), hud.js (масата с оръжията и екранът). Светът идва от world.js (прави го друг файл);
// ако го няма, тук се рисува равна земя в мъгла, за да може играта да върви и без него.
//
// assets.json (до този файл) казва кои герои, клипове, оръжия и предмети да се ползват; всеки липсващ ключ
// има резервен избор, така че играта не се чупи, ако описът е непълен.

import { createZombies } from './zombies.js';
import { createWeapons } from './weapons.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createChest } from './chest.js';

export async function createScene(ctx, start) {
  const { THREE, root } = ctx;
  const A = await fetch(new URL('./assets.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null);

  // ── светът ──
  let world = null, worldError = '';
  try {
    const mod = await import('./world.js');
    world = await mod.createWorld(ctx, start);
  } catch (e) { worldError = String(e?.message || e); console.warn('[motel] the world did not load, drawing flat ground:', worldError); }
  const own = world ? null : plainWorld();

  const audio = createAudio(ctx);
  const fx = createFx(ctx);
  if (start.kids) { fx.setKids(true); audio.setSoft(true); }      // детски режим: без кръв, по-тихи писъци
  audio.ambience(true);      // нощта под цялата игра (само ако банката със записи го има)
  const zombies = await createZombies(ctx, start, A, fx, audio);
  if (typeof world?.floorY === 'function') zombies.setFloor((x, z) => { try { return world.floorY(x, z); } catch { return 0; } });
  const weapons = await createWeapons(ctx, start, A, fx, audio, zombies);
  try { world?.attach?.({ weapons, audio, fx }); } catch { /* светът работи и без оръжията: фенерът остава на главата */ }
  try { weapons.setBombs(world?.bombs || []); } catch { /* без варели */ }
  const gateAt = i => start.gates?.[i] || null;
  const hud = await createHud(ctx, start, A, weapons);
  const chest = await createChest(ctx, start, weapons, fx, audio);      // сандъкът, от който излизат оръжията
  // при стрелба двете дръжки са стиснати постоянно: менюто за подравняване с тях е изключено, докато върви тази игра
  ctx.noAlignMenu = true;
  ctx.noTags = true;      // другите играчи са герои без табелка над главата

  /** Без готов свят: тъмен асфалт до хоризонта, мъгла и здрач. */
  function plainWorld() {
    const g = new THREE.Group();
    g.name = 'plain-world';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x23272b }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002;
    g.add(ground);
    root.add(g);
    let scene = root;
    while (scene.parent) scene = scene.parent;
    const before = { fog: scene.fog, hemiI: ctx.lights.hemi.intensity, hemiC: ctx.lights.hemi.color.getHex(), sunI: ctx.lights.sun.intensity, sunC: ctx.lights.sun.color.getHex() };
    scene.fog = new THREE.Fog(0x18222c, 9, 58);
    ctx.lights.hemi.color.set(0x9db4d6); ctx.lights.hemi.intensity = 1.5;
    ctx.lights.sun.color.set(0xffa868); ctx.lights.sun.intensity = 1.3;
    return { dispose() { root.remove(g); ground.geometry.dispose(); ground.material.dispose(); scene.fog = before.fog; ctx.lights.hemi.intensity = before.hemiI; ctx.lights.hemi.color.setHex(before.hemiC); ctx.lights.sun.intensity = before.sunI; ctx.lights.sun.color.setHex(before.sunC); } };
  }

  const WAVE_NAMES = start.waveNames || ['First contact', 'They keep coming', 'The rush', 'Blackout', 'The run'];
  const CLEAR_TIPS = ['New guns on the table', 'A chainsaw waits by the crate', 'Shoot the red barrels', 'Last wave. Nail the gates'];
  let breachSaid = -99, waveSaid = 0;
  // ── състоянието от сървъра ──
  let snap = null, lastEvent = 0, time = 0, born = null, over = false, lastPhase = '', wasDown = false, paused = false;      // born: часовникът на страницата при първия кадър на играта
  const myId = () => ctx.me.id;
  // ── подготовката: три едри реда какво се прави (масата, портите, презареждането); без табла и стрелки ──
  const BRIEF = [[0.06, 'TAKE A WEAPON', 'Lower your hand over one by the chest'], [0.36, 'NAIL THE GATES', 'Hold your hand at the planks'], [0.68, 'RELOAD', 'Point the barrel at the ground']];
  let briefN = 0, brief0 = 0;      // brief0: колко от подготовката е останало, когато играчът вече вижда света (зареждането изяжда началото ѝ)
  function brief(s) {
    if (s.phase !== 'intro' || s.wave > 1) return;
    if (!brief0) brief0 = s.next || 0.001;
    if (brief0 < 12) return;
    const done = 1 - Math.max(0, Math.min(1, (s.next || 0) / brief0));
    while (briefN < BRIEF.length && done >= BRIEF[briefN][0]) { const b = BRIEF[briefN++]; hud.title(b[1], b[2], Math.min(5.5, brief0 * 0.27)); }
  }
  /** Пауза от пулта: светът притъмнява, звукът заглъхва, зомбитата замръзват насред крачка, ръцете трепват веднъж. */
  function setPaused(on) {
    if (on === paused) return;
    paused = on;
    try { audio.pause(on); } catch { /* без звук */ }
    if (!over) fx.dim(on ? 0.5 : 0);
    ctx.haptic('l', 0.5, on ? 120 : 60); ctx.haptic('r', 0.5, on ? 120 : 60);
  }
  function onSnapshot(s) {
    snap = s;
    setPaused(!!s.paused && !s.result);
    try { brief(s); } catch { /* без подсказки играта пак върви */ }
    zombies.sync(s.z);
    weapons.onSnapshot(s);
    hud.onSnapshot(s);
    try { chest.onSnapshot(s); } catch (e) { console.warn('[motel] chest', e); }
    try { world?.onSnapshot?.(s); } catch (e) { if (!worldError) { worldError = String(e?.message || e); console.warn('[motel] world.onSnapshot', e); } }
    const me = s.players?.find(p => p.id === myId());
    if (me) {
      fx.vitals(me.hp, me.down > 0);
      if (me.down > 0 && !wasDown) { audio.down(); ctx.haptic('l', 1, 400); ctx.haptic('r', 1, 400); if (!s.result) hud.title('YOU ARE DOWN', `Back in ${Math.max(1, Math.ceil(me.down))} seconds`, Math.min(4.5, Math.max(1.5, me.down))); }
      if (!(me.down > 0) && wasDown) audio.up();
      wasDown = me.down > 0;
    }
    for (const e of s.events || []) {
      if (e.i <= lastEvent) continue;
      lastEvent = e.i;
      event(e, s);
    }
    lastPhase = s.phase;
    try { audio.music(musicFor(s)); } catch { /* без музика */ }
    if (s.result && !over) {
      over = true;
      const r = s.result;
      audio.ending(!!r.won);
      // под него: докъде стигна групата и по един ред на играч (точки, убити, точност), най-добрият е най-горе
      const rows = (r.players || []).slice().sort((a, b) => b.score - a.score).map(p => [p.name || `Player ${p.n}`, p.score, `${p.kills} kills`, p.shots ? `${Math.round(100 * (p.hits || 0) / p.shots)}%` : '']);
      try {
        hud.result({ title: r.won ? 'YOU SURVIVED' : 'GAME OVER', score: r.score, rows,
          line: `${r.won ? 'Boss down' : `Wave ${Math.min(r.wave, start.waves || 5)} of ${start.waves || 5}`} · ${r.stars} of 5 stars${r.level && r.level !== 'normal' ? ` · ${r.level}` : ''}` });
        fx.dim(0.62);      // светът притъмнява зад резултата
      } catch (e) { console.warn('[motel] result', e); }
    }
  }
  /**
   * Кой пласт музика трябва сега: спокоен в подготовката и почивките, вълна, напрегнат (пробита порта, трима наблизо
   * или малко кръв), шефът; тишина в края. Напрегнатият държи поне 4 с, за да не прескача напред-назад.
   */
  let tenseUntil = 0;
  function musicFor(s) {
    if (s.result) return '';
    if (s.phase === 'boss') return 'boss';
    if (s.phase !== 'wave') return 'calm';
    const me = s.players?.find(p => p.id === myId()), hx = ctx.head.pos.x, hz = ctx.head.pos.z;
    const near = (s.z || []).filter(r => r[6] !== 3 && Math.hypot(r[3] - hx, r[4] - hz) < 4).length;
    if ((s.gates || []).some(g => g[0] === 0) || near >= 3 || (me && me.hp < 40)) tenseUntil = time + 4;
    return time < tenseUntil ? 'intense' : 'wave';
  }
  const near = (x, z, r) => Math.hypot(x - ctx.head.pos.x, z - ctx.head.pos.z) < r;
  const both = (k, ms) => { ctx.haptic('l', k, ms); ctx.haptic('r', k, ms); };
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  function event(e, s) {
    switch (e.k) {
      case 'shot': {
        if (e.p === myId() || !e.o || !e.d) return;      // моите изстрели вече са нарисувани
        v.fromArray(e.o); v2.fromArray(e.d);
        if (start.weapons?.[e.w]?.melee) {      // близък бой на друг играч: само кръвта и звукът, без пламък и следа
          const zr = e.hits?.[0] ? zombies.list.get(e.hits[0][0]) : null;
          if (zr) { fx.burst(zr.neck, 'blood', 8, 2.4, v2); audio.hit(!!e.hits[0][1]); }
          return;
        }
        fx.flash(v, v2, e.w);
        audio.shot(e.w, [e.o[0], e.o[2]]);
        const hit = e.hits?.[0] ? zombies.list.get(e.hits[0][0]) : null;
        const end = hit ? (e.hits[0][1] ? hit.head.clone() : hit.neck.clone().setY(hit.neck.y * 0.75)) : v.clone().addScaledVector(v2, 40);
        fx.tracer(v, end);
        if (hit) fx.burst(end, 'blood', 4, 2, v2);
        return;
      }
      case 'kill': {
        const rec = zombies.killed(e), type = start.types?.[e.type], heavy = type === 'boss' || type === 'brute';
        { const z0 = rec || zombies.list.get(e.z); if (z0) audio.death(z0.x, z0.z, heavy); }      // и за паднало вече от моя изстрел
        if (e.p === myId()) {
          // моето убийство: удар в ръцете, по-силен за едрия и при поредица; главата има свой хрущящ звук
          both(heavy ? 0.9 : Math.min(0.85, 0.35 + 0.1 * (e.combo || 0)), heavy ? 160 : 30 + 8 * Math.min(6, e.combo || 0));
          if (e.head) audio.headshot();
          if (e.combo >= 2) audio.combo(e.combo);
        }
        if (rec && rec.type === 'boss') { audio.roar(rec.x, rec.z); fx.burst(rec.head, 'gore', 30, 4); }
        else if (rec && rec.type === 'brute') fx.burst(rec.head, 'gore', 18, 3.2);
        return;
      }
      case 'swing': { zombies.swingOf(e.z); const r = zombies.list.get(e.z); if (r) audio.attack(r.x, r.z, r.type === 'boss' || r.type === 'brute'); return; }
      // разнообразието: едрият идва със светкавица и рев, прескачащият лети над барикадата, изравящият се чупи земята
      case 'brute': {
        try { world?.event?.(e); } catch { /* само звук */ }
        const r = zombies.list.get(e.z);
        setTimeout(() => audio.brute(r ? r.x : 0, r ? r.z : 12), 500);
        both(0.4, 220);
        return;
      }
      case 'leap': {
        audio.leap(e.x0, e.z0);
        setTimeout(() => { audio.land(e.x1, e.z1); if (near(e.x1, e.z1, 3.5)) both(0.55, 90); try { fx.burst(v.set(e.x1, 0.05, e.z1), 'dirt', 8, 1.8); } catch { /* без прах */ } }, (start.leap?.time || 0.85) * 1000);
        return;
      }
      case 'dig': { audio.dig(e.x, e.zz); if (near(e.x, e.zz, 4)) both(0.45, 260); return; }
      case 'alarm': { try { world?.event?.(e); } catch { /* само звук */ } audio.alarm(e.x, e.zz); return; }
      case 'bite':
        if (e.p === myId()) { fx.hurt(e.dmg / 9); audio.bite(); ctx.haptic('l', 1, 140); ctx.haptic('r', 1, 140); }
        return;
      case 'scream': { const r = zombies.list.get(e.z); if (r) audio.scream(r.x, r.z); return; }
      case 'wave': waveSaid = e.n; audio.siren(false); hud.title(`WAVE ${e.n}`, WAVE_NAMES[e.n - 1] || '', 3.4); return;
      case 'boss': { try { world?.event?.(e); } catch { /* само звук */ } audio.siren(true); const r = zombies.list.get(e.z); setTimeout(() => audio.roar(r ? r.x : 0, r ? r.z : 10), 1400); hud.title('THE BOSS', 'Aim for the head', 4); return; }
      case 'clear': {
        audio.clear();
        const done = waveSaid || 1;      // последната обявена вълна е тази, която свърши
        if (!s.result) hud.title('WAVE CLEARED', done < (start.waves || 5) ? 'New weapons by the chest' : 'Weapons for the boss by the chest', 3.2);
        return;
      }
      case 'down': {      // съотборник е паднал: казва се кой и какво го вдига по-бързо
        if (e.p === myId() || s.result) return;
        const p = s.players?.find(q => q.id === e.p);
        hud.title(`${p?.name || 'A teammate'} is down`, 'Stand next to them', 2.6);
        return;
      }
      case 'rage': { const r = zombies.list.get(e.z); audio.roar(r ? r.x : 0, r ? r.z : 10); try { world?.strike?.(); } catch { /* без светкавица */ } hud.title('HE IS ANGRY', 'Keep shooting', 2.6); return; }
      case 'take': { try { chest.taken(e); } catch { /* оръжието пак изчезва със следващото състояние */ } if (e.p === myId()) { audio.pickup(); audio.take(); } return; }
      case 'offer': return;      // сандъкът го вижда сам в състоянието (chest.onSnapshot)
      case 'spent': if (e.p === myId()) audio.dry(); return;
      case 'chance': if (e.free !== 0) hud.title('SECOND CHANCE', '', 2.6); return;      // без втори шанс всеки става по своето време
      // портите: удар по дъските, пробив, коване
      case 'bang': { const g = gateAt(e.g); try { world?.event?.(e); } catch { /* само звук */ } if (g) { if (e.left > 0 && !e.big) audio.bang(g.x, g.z); else audio.crack(g.x, g.z, !!e.big); } return; }
      case 'breach': {
        ctx.haptic('l', 0.8, 160); ctx.haptic('r', 0.8, 160);
        const g = gateAt(e.g);
        if (g && time - breachSaid > 8 && s.phase !== 'intro') {      // накъде е пробивът спрямо погледа на играча
          breachSaid = time;
          v.set(0, 0, -1).applyQuaternion(ctx.head.quat);
          const a = Math.atan2(g.x - ctx.head.pos.x, g.z - ctx.head.pos.z) - Math.atan2(v.x, v.z), d = Math.atan2(Math.sin(a), Math.cos(a));
          hud.title('GATE DOWN', Math.abs(d) < 0.7 ? 'Ahead' : Math.abs(d) > 2.3 ? 'Behind you' : d > 0 ? 'On your left' : 'On your right', 2.2);
        }
        return;
      }
      case 'fix': { const g = gateAt(e.g); if (g) audio.hammer(g.x, g.z, e.left >= (g.max || 6)); if (e.p === myId() && g && e.left >= (g.max || 6)) both(0.5, 70); return; }
      // варел с гориво
      case 'boom': {
        try { world?.event?.(e); } catch { /* само звук */ }
        audio.boom(e.x, e.zz);
        const far = Math.hypot(e.x - ctx.head.pos.x, e.zz - ctx.head.pos.z), k = Math.max(0.15, 1 - far / 16);
        ctx.haptic('l', k, 260); ctx.haptic('r', k, 260);
        return;
      }
      case 'dark': audio.power(!e.on); return;
      default:
    }
    void s;
  }

  function update(dt, t) {
    time = t;
    if (born === null) born = t;
    if (debug.bot) botAim();
    weapons.update(dt, t);
    if (debug.bot && !paused) botFire(dt);
    if (!paused) zombies.update(dt, t);      // в пауза телата замръзват насред движението
    fx.update(dt, t);
    hud.update(dt);
    if (!paused) try { chest.update(dt); } catch { /* без сандъка играта пак върви */ }
    audio.update(dt, ctx.head, fx.lowBeat);
    try { world?.update?.(dt, t); } catch (e) { if (!worldError) { worldError = String(e?.message || e); console.warn('[motel] world.update', e); } }
  }

  // ── проби без каска: бот, ръчни кадри, снимки ──
  let botT = 0, botTarget = null;
  const arenaPage = () => window.__arena;
  function botAim() {
    const h = ctx.hands.r;
    h.active = true;
    let best = null, bd = Infinity;
    for (const r of zombies.list.values()) { if (r.deadAt) continue; const d = Math.hypot(r.x - ctx.head.pos.x, r.z - ctx.head.pos.z); if (d < bd) { bd = d; best = r; } }
    botTarget = best && bd < 34 ? best : null;
    if (botTarget) {
      const aimAt = debug.botHead ? botTarget.head : v.copy(botTarget.neck).setY(botTarget.neck.y * 0.8);
      v2.subVectors(aimAt, ctx.head.pos).normalize();
      h.pos.copy(ctx.head.pos).addScaledVector(v2, 0.55);
    }
  }
  function botFire(dt) {
    botT -= dt;
    if (!botTarget || botT > 0) return;
    botT = debug.botEvery;
    weapons.fireNow('r');
  }
  const debug = {
    bot: false, botHead: true, botEvery: 0.16, aimX: 0, aimY: 0,
    /** Ръчни кадри (панелът на браузъра е скрит и кадрите не вървят сами). */
    step(n = 1, dt = 1 / 30) {
      const P = arenaPage();
      for (let i = 0; i < n; i++) {
        if (P) {
          root.updateWorldMatrix(true, false); ctx.head.pos.copy(P.camera.position); root.worldToLocal(ctx.head.pos); ctx.head.quat.copy(P.camera.quaternion);
          // ръката без каска: пред окото, по посоката на погледа (както я слага страницата, когато кадрите вървят)
          const h = ctx.hands.r; h.active = true;
          if (!debug.bot) h.pos.copy(ctx.head.pos).add(v.set(debug.aimX, debug.aimY, -1).normalize().multiplyScalar(0.55).applyQuaternion(ctx.head.quat));
        }
        update(dt, time + dt);
        P?.scene.updateMatrixWorld();
      }
      return info();
    },
    /** Камерата: откъде и накъде гледа. */
    look(px, py, pz, tx, ty, tz) { const P = arenaPage(); if (!P) return; P.camera.position.set(px, py, pz); P.camera.lookAt(tx, ty, tz); P.camera.updateMatrixWorld(true); P.desk.yaw = P.camera.rotation.y; P.desk.pitch = P.camera.rotation.x; },
    /** Рисува един кадър и го записва през пробния сървър в public/play/assets/maps/_shots/g/<име>.jpg. */
    async shot(name, w = 1280, h = 720) {
      const P = arenaPage(); if (!P) return null;
      P.renderer.setSize(w, h, false); P.camera.aspect = w / h; P.camera.updateProjectionMatrix();
      const hidden = [];
      for (const c of [...root.parent.children, ...P.scene.children]) if (c !== root && c !== root.parent && c !== P.camera && !c.isLight && c.visible && !c.getObjectByProperty('isLight', true) && c.name !== 'keep') { let lobby = true; c.traverse(o => { if (o === root) lobby = false; }); if (lobby && (c.parent === root.parent || /zone|hall|show/i.test(c.name || '') || c.userData.zone)) { hidden.push(c); c.visible = false; } }
      P.renderer.render(P.scene, P.camera);
      for (const c of hidden) c.visible = true;
      const blob = await new Promise(res => P.renderer.domElement.toBlob(res, 'image/jpeg', 0.86));
      if (!blob) return null;
      const r = await fetch(`/dev/save?path=_shots/g/${name}.jpg`, { method: 'PUT', body: blob });
      return r.ok ? blob.size : null;
    },
    zombies, weapons, hud, fx, audio, world, chest,
  };

  function info() {
    return { world: world ? 'world.js' : `flat ground (${worldError.slice(0, 80)})`, assets: !!A, zombies: zombies.info(), weapons: weapons.info(), hud: hud.info(), audio: audio.state,
      phase: snap?.phase, wave: snap?.wave, score: snap?.score, left: snap?.left, alive: snap?.z?.length, result: snap?.result || null,
      gates: snap?.gates?.map(g => g[0]), bombs: snap?.bombs, dark: snap?.dark, heat: snap?.heat, world_: world?.info ? { gates: world.info.gates, bombsAlive: world.info.bombsAlive, dark: world.info.dark } : null };
  }

  function dispose() {
    for (const part of [chest, hud, weapons, zombies, fx, audio]) { try { part.dispose(); } catch (e) { console.warn('[motel] dispose', e); } }
    try { world?.dispose?.(); } catch (e) { console.warn('[motel] world.dispose', e); }
    own?.dispose();
    ctx.noAlignMenu = false;
    ctx.noTags = false;
  }

  return { onSnapshot, update, dispose, get info() { return info(); }, debug };
}

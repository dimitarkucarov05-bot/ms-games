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
import { createOffer } from './offer.js';

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
  const zombies = await createZombies(ctx, start, A, fx, audio);
  if (typeof world?.floorY === 'function') zombies.setFloor((x, z) => { try { return world.floorY(x, z); } catch { return 0; } });
  const weapons = await createWeapons(ctx, start, A, fx, audio, zombies);
  try { world?.attach?.({ weapons, audio, fx }); } catch { /* светът работи и без оръжията: фенерът остава на главата */ }
  try { weapons.setBombs(world?.bombs || []); } catch { /* без варели */ }
  const gateAt = i => start.gates?.[i] || null;
  const hud = await createHud(ctx, start, A, weapons);
  const offer = createOffer(ctx, start, weapons);      // стойката с трите оръжия за избор
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

  const WAVE_NAMES = ['First contact', 'They keep coming', 'The rush', 'Blackout', 'The run'];
  const CLEAR_TIPS = ['New guns on the table', 'A chainsaw waits by the crate', 'Shoot the red barrels', 'Last wave. Nail the gates'];
  let breachSaid = -99, waveSaid = 0;
  // ── състоянието от сървъра ──
  let snap = null, lastEvent = 0, time = 0, over = false, lastPhase = '', wasDown = false;
  const myId = () => ctx.me.id;
  // ── подготовката: три едри реда какво се прави (масата, портите, презареждането); без табла и стрелки ──
  const BRIEF = [[0.06, 'CHOOSE YOUR WEAPON', 'Touch one of the three in front of you'], [0.36, 'NAIL THE GATES', 'Hold your hand at the planks'], [0.68, 'RELOAD', 'Point the barrel at the ground']];
  let briefN = 0, brief0 = 0;      // brief0: колко от подготовката е останало, когато играчът вече вижда света (зареждането изяжда началото ѝ)
  function brief(s) {
    if (s.phase !== 'intro' || s.wave > 1) return;
    if (!brief0) brief0 = s.next || 0.001;
    if (brief0 < 12) return;
    const done = 1 - Math.max(0, Math.min(1, (s.next || 0) / brief0));
    while (briefN < BRIEF.length && done >= BRIEF[briefN][0]) { const b = BRIEF[briefN++]; hud.title(b[1], b[2], Math.min(5.5, brief0 * 0.27)); }
  }
  function onSnapshot(s) {
    snap = s;
    try { brief(s); } catch { /* без подсказки играта пак върви */ }
    zombies.sync(s.z);
    weapons.onSnapshot(s);
    hud.onSnapshot(s);
    try { offer.onSnapshot(s); } catch (e) { console.warn('[motel] offer', e); }
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
    if (s.result && !over) {
      over = true;
      const r = s.result;
      audio.ending(!!r.won);
      hud.title(r.won ? 'YOU SURVIVED' : 'GAME OVER', `Score ${r.score}`, 12);
      // под него: докъде стигна групата и по един ред на играч (точки, убити, точност), най-добрият е най-горе
      const rows = (r.players || []).slice().sort((a, b) => b.score - a.score).map(p => [p.name || `Player ${p.n}`, p.score, `${p.kills} kills`, p.shots ? `${Math.round(100 * (p.hits || 0) / p.shots)}%` : '']);
      try { hud.board(`${r.won ? 'Boss down' : `Wave ${Math.min(r.wave, start.waves || 5)} of ${start.waves || 5}`} · ${r.stars} of 5 stars${r.level && r.level !== 'normal' ? ` · ${r.level}` : ''}`, rows); } catch (e) { console.warn('[motel] board', e); }
    }
  }
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
        const rec = zombies.killed(e);
        if (e.p === myId()) { ctx.haptic('l', 0.35, 30); ctx.haptic('r', 0.35, 30); }
        if (rec && rec.type === 'boss') { audio.roar(rec.x, rec.z); fx.burst(rec.head, 'gore', 30, 4); }
        return;
      }
      case 'swing': zombies.swingOf(e.z); return;
      case 'bite':
        if (e.p === myId()) { fx.hurt(e.dmg / 9); audio.bite(); ctx.haptic('l', 1, 140); ctx.haptic('r', 1, 140); }
        return;
      case 'scream': { const r = zombies.list.get(e.z); if (r) audio.scream(r.x, r.z); return; }
      case 'wave': waveSaid = e.n; audio.siren(false); hud.title(`WAVE ${e.n}`, WAVE_NAMES[e.n - 1] || '', 3.4); return;
      case 'boss': { try { world?.event?.(e); } catch { /* само звук */ } audio.siren(true); const r = zombies.list.get(e.z); setTimeout(() => audio.roar(r ? r.x : 0, r ? r.z : 10), 1400); hud.title('THE BOSS', 'Aim for the head', 4); return; }
      case 'clear': {
        audio.clear();
        const done = waveSaid || 1;      // последната обявена вълна е тази, която свърши
        if (!s.result) hud.title('WAVE CLEARED', done < (start.waves || 5) ? 'Choose a new weapon' : 'Choose your weapon for the boss', 3.2);
        return;
      }
      case 'down': {      // съотборник е паднал: казва се кой и какво го вдига по-бързо
        if (e.p === myId() || s.result) return;
        const p = s.players?.find(q => q.id === e.p);
        hud.title(`${p?.name || 'A teammate'} is down`, 'Stand next to them', 2.6);
        return;
      }
      case 'rage': { const r = zombies.list.get(e.z); audio.roar(r ? r.x : 0, r ? r.z : 10); try { world?.strike?.(); } catch { /* без светкавица */ } hud.title('HE IS ANGRY', 'Keep shooting', 2.6); return; }
      case 'take': if (e.p === myId()) audio.pickup(); return;
      case 'spent': if (e.p === myId()) audio.dry(); return;
      case 'chance': hud.title('SECOND CHANCE', '', 2.6); return;
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
      case 'fix': { const g = gateAt(e.g); if (g) audio.hammer(g.x, g.z, e.left >= (g.max || 6)); return; }
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
    if (debug.bot) botAim();
    weapons.update(dt, t);
    if (debug.bot) botFire(dt);
    zombies.update(dt, t);
    fx.update(dt, t);
    hud.update(dt);
    try { offer.update(dt); } catch { /* без стойката играта пак върви */ }
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
    zombies, weapons, hud, fx, audio, world, offer,
  };

  function info() {
    return { world: world ? 'world.js' : `flat ground (${worldError.slice(0, 80)})`, assets: !!A, zombies: zombies.info(), weapons: weapons.info(), hud: hud.info(), audio: audio.state,
      phase: snap?.phase, wave: snap?.wave, score: snap?.score, left: snap?.left, alive: snap?.z?.length, result: snap?.result || null,
      gates: snap?.gates?.map(g => g[0]), bombs: snap?.bombs, dark: snap?.dark, heat: snap?.heat, world_: world?.info ? { gates: world.info.gates, bombsAlive: world.info.bombsAlive, dark: world.info.dark } : null };
  }

  function dispose() {
    for (const part of [offer, hud, weapons, zombies, fx, audio]) { try { part.dispose(); } catch (e) { console.warn('[motel] dispose', e); } }
    try { world?.dispose?.(); } catch (e) { console.warn('[motel] world.dispose', e); }
    own?.dispose();
    ctx.noAlignMenu = false;
    ctx.noTags = false;
  }

  return { onSnapshot, update, dispose, get info() { return info(); }, debug };
}

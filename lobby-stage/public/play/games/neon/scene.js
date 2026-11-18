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

  const WAVE_NAMES = start.waveNames || ['One star', 'Two stars', 'Three stars', 'Lights out', 'Four stars', 'Five stars'];
  const CLEAR_TIPS = ['New guns on the table', 'A chainsaw waits by the crate', 'Shoot the red barrels', 'Last wave. Seal the alleys'];
  let breachSaid = -99, waveSaid = 0, gateHitSaid = 0, digSaid = false;
  /** Вижда ли играчът точката (в конус от 100°). */
  function inView(x, z) { const f = v2.set(0, 0, -1).applyQuaternion(ctx.head.quat); const dx = x - ctx.head.pos.x, dz = z - ctx.head.pos.z, l = Math.hypot(dx, dz) || 1; return (f.x * dx + f.z * dz) / (Math.hypot(f.x, f.z) || 1) / l > Math.cos(50 * Math.PI / 180); }
  // ── състоянието от сървъра ──
  let snap = null, lastEvent = 0, time = 0, born = null, over = false, lastPhase = '', wasDown = false, paused = false;      // born: часовникът на страницата при първия кадър на играта
  const myId = () => ctx.me.id;
  // ── подготовката: три едри реда какво се прави (масата, портите, презареждането); без табла и стрелки ──
  const BRIEF = [[0.06, 'TAKE A WEAPON', 'Lower your hand over one by the chest'], [0.36, 'SEAL THE ALLEYS', 'Hold your hand at the planks'], [0.68, 'RELOAD', 'Point the barrel at the ground']];
  let briefN = 0, brief0 = 0;      // brief0: колко от подготовката е останало, когато играчът вече вижда света (зареждането изяжда началото ѝ)
  function brief(s) {
    if (s.phase !== 'intro' || s.wave > 1 || audio.has('voice.prep_weapons')) return;      // с говорителя надписите не трябват
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
    try { present(s); } catch (e) { console.warn('[motel] present', e); }
    try { audio.music(musicFor(s)); } catch { /* без музика */ }
    if (s.result && !over) { over = true; try { ending(s.result); } catch (e) { console.warn('[motel] result', e); } }
  }

  // ── краят на сцена (game-feel P9, P10): момент на победа, точките се броят, награда за всеки ──
  const later = (sec, fn) => setTimeout(() => { if (!disposed) try { fn(); } catch (e) { console.warn('[motel] later', e); } }, sec * 1000);
  let disposed = false;
  function ending(r) {
    const rows = (r.players || []).slice().sort((a, b) => b.score - a.score);
    const line = `${r.won ? 'Boss down' : `Wave ${Math.min(r.wave, start.waves || 5)} of ${start.waves || 5}`} · ${r.stars} of 5 stars${r.level && r.level !== 'normal' ? ` · ${r.level}` : ''}`;
    const board = (score, shown, keep) => hud.result({ keep, title: r.won ? 'YOU SURVIVED' : 'GAME OVER', score, line,
      rows: rows.map((p, i) => [p.name || `Player ${p.n}`, p.score, i < shown ? (p.award?.name || '') : '', `${p.kills} kills`]) });
    let t = 0;
    if (r.won) {      // хеликоптерът идва, прожекторът минава по зоната, говорителят
      audio.play('world.heli.in'); try { world?.searchlight?.(true); } catch { /* без прожектор */ }
      later(1.2, () => audio.say('win_2', 3));
      t = 4;
    } else { audio.say('lose_1', 3); t = 2; }
    later(t, () => { audio.ending(!!r.won); board(0, 0, false); fx.dim(0.62); });
    const steps = 14;
    for (let i = 1; i <= steps; i++) later(t + 0.5 + i * 0.16, () => { board(Math.round(r.score * i / steps), 0, true); audio.play('score.tick', null, null, 1, 1 + 0.25 * i / steps); });
    const fin = t + 0.6 + steps * 0.16;
    later(fin, () => { audio.play('score.final'); ctx.haptic('l', 0.6, 80); ctx.haptic('r', 0.6, 80); });
    rows.forEach((p, i) => later(fin + 1 + i * 0.9, () => { board(r.score, i + 1, true); audio.play('award.reveal'); if (p.id === myId()) { ctx.haptic('l', 0.5, 60); ctx.haptic('r', 0.5, 60); } }));
  }

  // ── подредбата на звука и гласа (game-feel P2, P5, P6, P10, P11) ──
  const KIDS = !!start.kids;
  let contactWave = 0, sirenWave = 0, riserAt = -1, silenceUntil = 0, bossMusicAt = Infinity, praiseAt = -99, behindAt = -99, behindSince = 0;
  let firstSnap = true, clockSaid = new Set(), prepSaid = new Set(), jumpSaid = false, bossSeenSaid = false, bossHalfSaid = false;
  const voice = (id, prio) => { try { audio.say(id, prio); } catch { /* без глас */ } };
  const praise = id => { if (time - praiseAt > 25) { praiseAt = time; voice(id, 0); } };
  function present(s) {
    const me = s.players?.find(p => p.id === myId());
    if (firstSnap) { firstSnap = false; if (s.phase === 'intro') { audio.play('world.heli.away'); audio.prefetch(['voice.prep_weapons', 'voice.prep_gates', 'voice.prep_10', 'riser.10s', 'stinger.wave', 'voice.wave_1', 'wave.start']); } }
    // подготовката: казва се какво се прави, без надписи
    if (s.phase === 'intro' && s.wave <= 1) {
      const left = s.next || 0, prep = start.prep || 30;
      if (!prepSaid.has('w') && left < prep - 1 && left > 12) { prepSaid.add('w'); voice('prep_weapons', 1); }
      if (!prepSaid.has('g') && left < prep * 0.62 && left > 12) { prepSaid.add('g'); voice('prep_gates', 1); }
      if (!prepSaid.has('10') && left <= 10.5 && left > 7) { prepSaid.add('10'); voice('prep_10', 1); }
    }
    // последните 10 с на подготовката и на всяка почивка: нарастващ звук, който свършва с вълната
    if ((s.phase === 'intro' || s.phase === 'break') && s.next > 0 && s.next <= 10 && riserAt !== s.wave) { riserAt = s.wave; audio.play('riser.10s'); audio.prefetch(['voice.wave_' + Math.min(5, s.wave), 'stinger.wave', 'wave.start']); }
    // тишина 2-3 с преди тъмната вълна (не и в детския режим)
    if (!KIDS && (s.phase === 'intro' || s.phase === 'break') && s.next > 0 && s.next <= 2.6 && (start.darkWaves || []).includes(s.wave)) silenceUntil = Math.max(silenceUntil, time + s.next + 0.4);
    // часовникът: пет, две, една минута
    for (const [sec, id] of [[300, 'five_min'], [120, 'two_min'], [60, 'one_min']]) if (!clockSaid.has(id) && s.left <= sec && s.left > sec - 3 && (start.duration || 600) > sec + 30 && !s.result) { clockSaid.add(id); voice(id, 1); }
    // първи досег с портите: тук започва музиката на вълната; сирената, когато първият е на 12 м
    if (s.phase === 'wave' || s.phase === 'intro' || s.phase === 'break') {
      const hx = ctx.head.pos.x, hz = ctx.head.pos.z;
      let nearest = Infinity;
      for (const r of s.z || []) if (r[6] !== 3) nearest = Math.min(nearest, Math.hypot(r[3] - hx, r[4] - hz));
      if (s.phase === 'wave' && sirenWave !== s.wave && nearest < 12) { sirenWave = s.wave; audio.siren(false); }
      if (s.phase === 'wave' && nearest < 3.2) contactWave = s.wave;
    }
    // шефът: виждане, половина
    if (s.phase === 'boss' && s.boss != null) {
      const b = (s.z || []).find(r => start.types?.[r[1]] === 'boss');
      if (b && !bossSeenSaid && Math.hypot(b[3] - ctx.head.pos.x, b[4] - ctx.head.pos.z) < 15) { bossSeenSaid = true; voice('boss_seen', 3); }
      if (!bossHalfSaid && s.boss <= 0.5) { bossHalfSaid = true; voice('boss_half', 2); }
    }
    // последната вълна: дъжд
    if (s.phase === 'wave' && s.wave >= (start.waves || 5)) audio.ambience('rain');
    else if (s.phase === 'intro' || s.phase === 'wave') audio.ambience('night');
    void me;
  }
  /**
   * Кой пласт музика трябва сега: спокоен в подготовката и почивките, вълна, напрегнат (пробита порта, трима наблизо
   * или малко кръв), шефът; тишина в края. Напрегнатият държи поне 4 с, за да не прескача напред-назад.
   */
  let tenseUntil = 0;
  function musicFor(s) {
    if (s.result) return '';
    if (time < silenceUntil) return '';                       // тишината също е пласт: преди тъмното и преди шефа
    if (s.phase === 'boss') return time >= bossMusicAt ? 'boss' : '';
    if (s.phase !== 'wave') return 'calm';
    if (contactWave !== s.wave) return 'calm';                // приближаването носят стенанията и сирената, не музиката
    if (KIDS) return 'wave';                                   // детският режим никога не става напрегнат
    const me = s.players?.find(p => p.id === myId()), hx = ctx.head.pos.x, hz = ctx.head.pos.z;
    const crowd = (s.z || []).filter(r => r[6] !== 3 && Math.hypot(r[3] - hx, r[4] - hz) < 6).length;
    if ((s.gates || []).some(g => g[0] === 0) || crowd >= 6 || (me && me.hp < 35) || s.heat2 > 0.7) tenseUntil = time + 8;
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
          // моето убийство: второ трепване в стрелялата ръка (двойното „тук-тук" значи убит); главата е по-силна
          const side = weapons.lastSide?.() || 'r';
          if (!e.head || heavy) ctx.haptic(side, heavy ? 0.9 : 0.5, heavy ? 120 : 20);
          if (e.head) { audio.headshot(); if (Math.random() < 0.3) praise('headshot'); }
          if (e.combo >= 4) { audio.combo(e.combo); praise('nice_shot'); } else if (e.combo >= 2) audio.combo(e.combo);
        }
        if (rec && rec.type === 'boss') {
          // шефът пада бавно; всичко замлъква за секунда
          audio.play('zombie.death.big', rec.x, rec.z); fx.burst(rec.head, 'gore', 30, 4); silenceUntil = time + 3.2; voice('boss_dead', 3);
          for (const side of ['l', 'r']) ctx.haptic(side, 1, 300);
        }
        else if (rec && rec.type === 'brute') fx.burst(rec.head, 'gore', 18, 3.2);
        return;
      }
      case 'pack': { for (let i = 0; i < 3; i++) setTimeout(() => audio.groan(e.x + (Math.random() - 0.5) * 2, e.zz + (Math.random() - 0.5) * 2, 'runner'), i * 450); return; }
      case 'rattle': { audio.play('fence.rattle', e.x, e.zz); if (!jumpSaid) voice('jumpers', 1); return; }
      case 'roar': { try { world?.event?.({ k: 'brute' }); } catch { /* без светкавица */ } const r = zombies.list.get(e.z); audio.brute(r ? r.x : 0, r ? r.z : 12); both(0.4, 220); return; }
      case 'rise': { if (!KIDS && !jumpSaid) { jumpSaid = true; audio.play('stinger.jump'); } if (near(e.x, e.zz, 4)) both(0.45, 200); return; }
      case 'throw': {
        // шефът хвърля: мястото на удара свети и се чува, преди да падне
        audio.play('boss.windup', e.x, e.zz); try { world?.marker?.(e.x, e.zz, e.t, zombies.list.get(e.z)); } catch { /* без знак */ }
        if (near(e.x, e.zz, (start.slamR || 1.6) + 0.5)) both(0.3, 120);
        return;
      }
      case 'slam': {
        audio.play('boss.slam', e.x, e.zz); try { fx.burst(v.set(e.x, 0.1, e.zz), 'dirt', 22, 4); world?.marker?.(null); } catch { /* без прах */ }
        const d = Math.hypot(e.x - ctx.head.pos.x, e.zz - ctx.head.pos.z); if (d < 8) both(Math.max(0.2, 1 - d / 8), 220);
        return;
      }
      case 'kneel': { const r = zombies.list.get(e.z); if (r) { audio.play('boss.hurt', r.x, r.z); zombies.kneel?.(e.z, e.t); } return; }
      case 'swing': { zombies.swingOf(e.z); const r = zombies.list.get(e.z); if (r) audio.attack(r.x, r.z, r.type === 'boss' || r.type === 'brute'); return; }
      // разнообразието: едрият идва със светкавица и рев, прескачащият лети над барикадата, изравящият се чупи земята
      case 'brute': return;      // идва в тъмното; ревът (събитие 'roar') е на 14 м
      case 'leap': {
        const perch = e.p ?? start.leap?.perch ?? 0;
        later(perch, () => audio.leap(e.x0, e.z0));
        later(perch + (start.leap?.time || 0.85), () => {
          audio.land(e.x1, e.z1); if (near(e.x1, e.z1, 3.5)) both(0.55, 90);
          try { fx.burst(v.set(e.x1, 0.05, e.z1), 'dirt', 8, 1.8); } catch { /* без прах */ }
          if (!KIDS && !inView(e.x1, e.z1) && near(e.x1, e.z1, 4) && time - behindAt > 3) { audio.play('stinger.jump'); behindAt = time; }
        });
        return;
      }
      case 'dig': { audio.dig(e.x, e.zz); try { fx.burst(v.set(e.x, 0.05, e.zz), 'dirt', 6, 1.2); } catch { /* без прах */ } if (near(e.x, e.zz, 4)) both(0.3, 200); if (!digSaid) { digSaid = true; voice('crawlers', 1); } return; }
      case 'alarm': { try { world?.event?.(e); } catch { /* само звук */ } audio.alarm(e.x, e.zz); return; }
      case 'bite':
        if (e.p === myId()) { fx.hurt(e.dmg / 9); audio.bite(); ctx.haptic('l', 1, 140); ctx.haptic('r', 1, 140); }
        return;
      case 'scream': { const r = zombies.list.get(e.z); if (r) audio.scream(r.x, r.z); return; }
      case 'wave': waveSaid = e.n; audio.play('stinger.wave'); voice('wave_' + Math.min(5, e.n), 1); hud.title(`WAVE ${e.n}`, WAVE_NAMES[e.n - 1] || '', 3.4); return;
      case 'boss': {
        // влизането: всичко млъква, сирена, тежки стъпки от тъмното, светкавица показва силуета, акцент, рев; музиката е на рева
        const k = (e.t || 10) / 10, at = () => { const r = zombies.list.get(e.z); return r ? [r.x, r.z] : [0, 12]; };
        silenceUntil = time + 9 * k; bossMusicAt = time + 9 * k;
        audio.prefetch(['boss.siren', 'stinger.boss', 'voice.boss_in', 'voice.boss_seen', 'voice.boss_rage', 'voice.boss_dead', 'boss.windup', 'boss.slam', 'boss.rage', 'world.heli.in', 'voice.win_2', 'score.tick', 'score.final', 'award.reveal']);
        audio.siren(true);
        later(2 * k, () => voice('boss_in', 3));
        for (const [i, w] of [[3, 0.2], [4.6, 0.32], [6, 0.45]]) later(i * k, () => { const [x, z] = at(); audio.step(x, z, true); both(w, 60); });
        later(6.5 * k, () => { try { world?.event?.(e); } catch { /* само звук */ } });
        later(7.6 * k, () => audio.play('stinger.boss'));
        later(8.6 * k, () => { const [x, z] = at(); audio.roar(x, z); both(0.6, 260); });
        hud.title('THE BOSS', '', 4);
        return;
      }
      case 'clear': {
        audio.clear(); voice(['wave_clear_a', 'wave_clear_b', 'wave_clear_c'][e.n % 3], 1);
        const done = waveSaid || 1;      // последната обявена вълна е тази, която свърши
        if (!s.result) hud.title('WAVE CLEARED', done < (start.waves || 5) ? 'New weapons by the chest' : 'Weapons for the boss by the chest', 3.2);
        return;
      }
      case 'down': {      // съотборник е паднал: казва се кой и какво го вдига по-бързо
        if (e.p === myId() || s.result) return;
        const p = s.players?.find(q => q.id === e.p);
        voice('down', 2);
        hud.title(`${p?.name || 'A teammate'} is down`, 'Stand next to them', 2.6);
        return;
      }
      case 'up': {      // всички чуват, че някой е станал; който го вдигна, получава похвала
        if (e.p !== myId()) { const p = s.players?.find(q => q.id === e.p); if (p) audio.play('player.up'); }
        if (e.by === myId()) praise('teamwork');
        if (e.p === myId() && e.by) voice('revived', 1);
        return;
      }
      case 'rage': { const r = zombies.list.get(e.z); if (!audio.play('boss.rage', r ? r.x : 0, r ? r.z : 10)) audio.roar(r ? r.x : 0, r ? r.z : 10); try { world?.strike?.(); } catch { /* без светкавица */ } voice('boss_rage', 3); return; }
      case 'take': { try { chest.taken(e); } catch { /* оръжието пак изчезва със следващото състояние */ } if (e.p === myId()) { audio.pickup(); audio.take(); } return; }
      case 'offer': return;      // сандъкът го вижда сам в състоянието (chest.onSnapshot)
      case 'spent': if (e.p === myId()) audio.dry(); return;
      case 'chance': if (e.free !== 0) hud.title('SECOND CHANCE', '', 2.6); return;      // без втори шанс всеки става по своето време
      // портите: удар по дъските, пробив, коване
      case 'bang': { const g = gateAt(e.g); try { world?.event?.(e); } catch { /* само звук */ } if (gateHitSaid !== s.wave && e.left <= 2 && s.phase === 'wave') { gateHitSaid = s.wave; voice('gate_hit', 1); } if (g) { if (e.left > 0 && !e.big) audio.bang(g.x, g.z); else audio.crack(g.x, g.z, !!e.big); } return; }
      case 'breach': {
        ctx.haptic('l', 0.8, 160); ctx.haptic('r', 0.8, 160);
        if (s.phase !== 'intro') voice('gate_down', 3);
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
      case 'dark': {
        audio.power(!e.on);
        if (e.on) { if (!KIDS) audio.play('stinger.blackout'); voice('blackout', 3); }
        else voice('power_back', 2);
        return;
      }
      default:
    }
    void s;
  }

  // ── каквото се следи всеки кадър: „зад теб!", стенания отдалеч преди вълната, пулс при съживяване ──
  let groanT = 2, pulseT = 0;
  function watchFrame(dt) {
    const s = snap;
    if (!s || s.result || paused) return;
    const hx = ctx.head.pos.x, hz = ctx.head.pos.z, me = s.players?.find(p => p.id === myId());
    // зомби на 2.5 м извън погледа повече от секунда: само на този играч, най-много веднъж на 20 с
    let behind = false;
    for (const r of s.z || []) if (r[6] !== 3 && Math.hypot(r[3] - hx, r[4] - hz) < 2.5 && !inView(r[3], r[4])) { behind = true; break; }
    behindSince = behind ? behindSince + dt : 0;
    if (behindSince > 1 && time - behindAt > 20 && me && !(me.down > 0)) { behindAt = time; voice('behind', 2); }
    // приближаване: чуват се, преди да се видят (стенания от далечните, по-тихо)
    groanT -= dt;
    if (groanT <= 0) {
      groanT = 1.5 + Math.random();
      const far = (s.z || []).filter(r => r[6] !== 3 && Math.hypot(r[3] - hx, r[4] - hz) > 12);
      if (far.length && (s.phase !== 'wave' || contactWave !== s.wave)) { const r = far[Math.floor(Math.random() * far.length)]; audio.play('zombie.idle', r[3], r[4], 0.5); }
    }
    // съживяване: бавен двоен пулс и на двамата
    pulseT -= dt;
    if (pulseT <= 0 && me) {
      pulseT = 1;
      const downNear = (s.players || []).some(p => p.id !== me.id && p.down > 0 && players3(p) < 1.3);
      if ((downNear && !(me.down > 0)) || (me.down > 0 && (s.players || []).some(p => p.id !== me.id && !(p.down > 0) && players3(p) < 1.3))) { both(0.3, 40); later(0.18, () => both(0.22, 40)); }
    }
  }
  /** Колко далеч е друг играч (по главата му от състоянието на играчите в сцената, иначе безкрайно). */
  function players3(p) { const o = ctx.players?.get?.(p.id); const pos = o?.head?.pos || o?.pos; return pos ? Math.hypot(pos.x - ctx.head.pos.x, pos.z - ctx.head.pos.z) : Infinity; }

  function update(dt, t) {
    time = t;
    try { watchFrame(dt); } catch (e) { if (!worldError) console.warn('[motel] watch', e); }
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

  /** Всичко, което играта е качила на видеокартата: мрежи, материали, текстури, скелети, светлини (със сенките им). */
  function collect(objs) {
    const bag = { geo: new Set(), mat: new Set(), tex: new Set(), skel: new Set(), light: new Set() };
    for (const obj of objs) obj?.traverse?.(o => {
      if (o.geometry) bag.geo.add(o.geometry);
      for (const m of [].concat(o.material || [])) { bag.mat.add(m); for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) bag.tex.add(v); } if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) bag.tex.add(u.value); }
      if (o.isSkinnedMesh && o.skeleton) bag.skel.add(o.skeleton);
      if (o.isLight) bag.light.add(o);
    });
    return bag;
  }
  function free(bag) {
    for (const g of bag.geo) g.dispose?.();
    for (const m of bag.mat) m.dispose?.();
    for (const t of bag.tex) t.dispose?.();      // обща текстура от склада на моделите се качва пак сама, ако лобито я ползва
    for (const s of bag.skel) s.dispose?.();
    for (const l of bag.light) l.dispose?.();
  }
  function dispose() {
    disposed = true;
    // първо се събира всичко (докато е закачено), после частите се разкачат, накрая всичко се освобождава
    let bag = null;
    try { bag = collect([root, ...(zombies.extras?.() || []), ...(weapons.extras?.() || [])]); } catch (e) { console.warn('[motel] collect', e); }
    for (const part of [chest, hud, weapons, zombies, fx, audio]) { try { part.dispose(); } catch (e) { console.warn('[motel] dispose', e); } }
    try { world?.dispose?.(); } catch (e) { console.warn('[motel] world.dispose', e); }
    own?.dispose();
    try { if (bag) free(bag); } catch (e) { console.warn('[motel] free', e); }
    ctx.noAlignMenu = false;
    ctx.noTags = false;
  }

  return { onSnapshot, update, dispose, get info() { return info(); }, debug };
}

// Оръжията: моделите в ръцете (моите и на другите играчи), прицелът, стрелбата с лъч срещу зомбитата, откатът,
// презареждането (само при празен пълнител или с жест: цевта надолу), цифрите с патроните върху оръжието,
// лазерната точка и взимането на оръжие от сандъка.
//
// Всичко е в координатите на залата (деца на ctx.root).

const FALLBACK = {      // докато светът не е предал assets.json: оръжията от Battle Royale Pack (началото им е в дръжката, цевта е по +Z)
  pistol: { slug: 'battle-royale-pack', model: 'SM_Wep_Pistol_Heavy_01' },
  smg: { slug: 'battle-royale-pack', model: 'SM_Wep_SubMGun_Lite_01' },
  shotgun: { slug: 'battle-royale-pack', model: 'SM_Wep_Shotgun_01' },
  rifle: { slug: 'battle-royale-pack', model: 'SM_Wep_Rifle_Assault_01' },
  // близък бой от Apocalypse Pack: острието е по +X на модела; grip е къде го държи ръката, muzzle е върхът
  axe: { slug: 'apocalypse-pack', model: 'SM_Wep_FireAxe_01', forward: [1, 0, 0], grip: [-0.2, 0, 0], muzzle: [0.56, 0, 0] },
  machete: { slug: 'apocalypse-pack', model: 'SM_Wep_Melee_Machete_01', forward: [1, 0, 0], grip: [-0.04, 0, 0], muzzle: [0.86, 0, 0] },
  revolver: { slug: 'battle-royale-pack', model: 'SM_Wep_Pistol_Revolver_01' },
  carbine: { slug: 'battle-royale-pack', model: 'SM_Wep_Rifle_Assault_02' },
  hunting: { slug: 'apocalypse-pack', model: 'SM_Wep_HuntingRifle_01' },
  lmg: { slug: 'battle-royale-pack', model: 'SM_Wep_MachineGun_01' },
  chainsaw: { slug: 'apocalypse-pack', model: 'SM_Wep_ChainSaw_01', forward: [1, 0, 0], grip: [0, 0.03, 0], muzzle: [0.98, 0, 0] },
};
const FEEL = {      // откат (радиани и метри), вибрация (сила, мс), колко бързо се връща
  pistol: { kick: 0.22, back: 0.035, hap: [0.9, 55], ret: 14 },
  smg: { kick: 0.07, back: 0.018, hap: [0.6, 30], ret: 20 },
  shotgun: { kick: 0.42, back: 0.07, hap: [1, 110], ret: 8 },
  rifle: { kick: 0.11, back: 0.03, hap: [0.8, 45], ret: 16 },
  axe: { kick: 0.3, back: 0, hap: [1, 110], ret: 10 },
  machete: { kick: 0.22, back: 0, hap: [0.9, 80], ret: 12 },
  revolver: { kick: 0.4, back: 0.05, hap: [1, 90], ret: 9 },
  carbine: { kick: 0.09, back: 0.025, hap: [0.7, 40], ret: 17 },
  hunting: { kick: 0.5, back: 0.08, hap: [1, 140], ret: 7 },
  lmg: { kick: 0.06, back: 0.02, hap: [0.75, 35], ret: 18 },
  chainsaw: { kick: 0.03, back: 0.004, hap: [0.55, 45], ret: 22 },
};
const AIM_PITCH = 0;                 // допълнителен наклон на цевта спрямо лъча на контролера (радиани; + е нагоре)
const GRIP_TO_RAY = -Math.PI / 3;    // при Quest лъчът е на около 60° от оста на дръжката: за оръжията на другите играчи
const DOWN_FOR_RELOAD = -0.80, RELOAD_HOLD = 0.22;
const SWING = 2.2;                   // с каква скорост на върха (м/с) брадвата брои движението за замах

export async function createWeapons(ctx, start, A, fx, audio, zombies) {
  const { THREE, root } = ctx;
  const W = start.weapons || {};
  const group = new THREE.Group();
  group.name = 'weapons';
  root.add(group);
  const desktop = !!ctx.desktop;
  const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m1 = new THREE.Matrix4();

  // ── модели ──
  const defs = {};
  for (const k of Object.keys(FALLBACK)) {
    const a = A?.weapons?.[k];
    defs[k] = a && a.slug && a.model ? a : FALLBACK[k];
  }
  const protos = {};
  if (ctx.assets) {
    await Promise.all(Object.entries(defs).map(async ([k, d]) => {
      try {
        await ctx.assets.loadPack(d.slug);
        let obj = await ctx.assets.get(d.slug, d.model);
        protos[k] = fit(obj, d);
      } catch (e) {
        console.warn('[motel] weapon', k, e.message);
        if (d !== FALLBACK[k]) { try { await ctx.assets.loadPack(FALLBACK[k].slug); protos[k] = fit(await ctx.assets.get(FALLBACK[k].slug, FALLBACK[k].model), FALLBACK[k]); } catch { /* остава резервното */ } }
      }
    }));
  }
  for (const k of Object.keys(FALLBACK)) if (!protos[k]) protos[k] = plain(k);

  /**
   * Завърта модела така, че дръжката да е в началото, цевта да сочи към −Z и горната страна към +Y.
   * Ако описът не казва къде са дръжката и дулото, намира ги от формата: дръжката е най-ниската част,
   * дулото е по-далечният от нея край по дългата ос.
   */
  function fit(obj, d) {
    const holder = new THREE.Group();
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    let fwd = Array.isArray(d.forward) ? new THREE.Vector3().fromArray(d.forward) : null;
    let grip = Array.isArray(d.grip) ? new THREE.Vector3().fromArray(d.grip) : null;
    let muzzle = Array.isArray(d.muzzle) ? new THREE.Vector3().fromArray(d.muzzle) : null;
    if (!fwd || fwd.lengthSq() < 0.5 || !grip || !muzzle) {
      const axis = size.x >= size.z ? 'x' : 'z';
      // най-ниските върхове (дръжката): къде са по дългата ос
      let sum = 0, n = 0;
      const low = box.min.y + size.y * 0.3;
      obj.traverse(o => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 1) { v1.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v1.y < low) { sum += v1[axis]; n++; } }
      });
      const handle = n ? sum / n : (box.min[axis] + box.max[axis]) / 2;
      const sign = box.max[axis] - handle >= handle - box.min[axis] ? 1 : -1;
      if (!fwd || fwd.lengthSq() < 0.5) fwd = new THREE.Vector3(axis === 'x' ? sign : 0, 0, axis === 'z' ? sign : 0);
      if (!grip) { grip = new THREE.Vector3(0, box.min.y + size.y * 0.42, 0); grip[axis] = handle; }
      if (!muzzle) { muzzle = new THREE.Vector3(0, box.max.y - size.y * 0.24, 0); muzzle[axis] = sign > 0 ? box.max[axis] : box.min[axis]; }
    }
    fwd.normalize();
    // основа: напред → −Z, нагоре → +Y
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, fwd.clone().negate());      // колоните: къде отиват X, Y, Z на държача в модела
    const inv = basis.clone().invert();
    const inner = new THREE.Group();
    inner.add(obj);
    inner.applyMatrix4(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
    const turn = new THREE.Group();
    turn.add(inner);
    turn.applyMatrix4(inv);
    holder.add(turn);
    holder.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(holder);
    holder.userData.muzzle = muzzle.clone().sub(grip).applyMatrix4(inv);
    holder.userData.box = b2;
    holder.userData.length = b2.max.z - b2.min.z;
    obj.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
    holder.userData.flash = d.flash || null;
    if (d.flash) { const f = obj.getObjectByName(d.flash); if (f) f.visible = false; }
    return holder;
  }
  /** Резервно оръжие от прости тела, само ако моделът липсва. */
  function plain(k) {
    const len = { pistol: 0.2, smg: 0.38, shotgun: 0.7, rifle: 0.75, axe: 0.8, chainsaw: 0.95, machete: 0.8, revolver: 0.26, carbine: 0.6, hunting: 1.0, lmg: 0.85 }[k] || 0.25;
    const holder = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b2d30 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, len), mat); barrel.position.set(0, 0.07, -len / 2 + 0.06);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.045), mat); grip.position.set(0, 0, 0.02); grip.rotation.x = 0.25;
    holder.add(barrel, grip);
    holder.userData.muzzle = new THREE.Vector3(0, 0.07, -len + 0.06);
    holder.userData.box = new THREE.Box3().setFromObject(holder);
    holder.userData.length = len;
    return holder;
  }
  function cloneGun(k) {
    const src = protos[k] || protos.pistol;
    const g = src.clone(true);
    g.userData = { muzzle: src.userData.muzzle.clone(), box: src.userData.box.clone(), length: src.userData.length, kind: k, flash: src.userData.flash ? g.getObjectByName(src.userData.flash) || null : null };
    if (g.userData.flash) g.userData.flash.visible = false;
    return g;
  }

  // ── цифрите върху оръжието ──
  function makeReadout() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const c = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.026), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.renderOrder = 6;
    let sig = '';
    return {
      mesh,
      draw(text, tone) {
        const s = `${text}|${tone}`;
        if (s === sig) return;
        sig = s;
        // само удебелен текст: без табелка зад него, с тънък тъмен контур, за да се чете върху всичко
        c.clearRect(0, 0, 128, 64);
        c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        c.fillStyle = tone === 'bad' ? '#ff6a4a' : '#ffffff';
        c.font = '800 50px "Sofia Sans XC", "Sofia Sans", "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.strokeText(text, 64, 35, 120);
        c.fillText(text, 64, 35, 120);
        tex.needsUpdate = true;
      },
      dispose() { tex.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  }

  // ── моите две оръжия ──
  const laserGeo = new THREE.SphereGeometry(0.012, 8, 6), laserMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 });
  const beamGeo = new THREE.BoxGeometry(0.003, 0.003, 1), beamMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  function makeMine(side) {
    const holder = new THREE.Group();      // прицелът: началото е в дланта, −Z е цевта
    const kick = new THREE.Group();        // откатът
    holder.add(kick);
    holder.visible = false;
    group.add(holder);
    const dot = new THREE.Mesh(laserGeo, laserMat); dot.renderOrder = 7; dot.visible = false; group.add(dot);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; holder.add(beam);
    const readout = makeReadout();
    kick.add(readout.mesh);
    const g = { side, holder, kick, dot, beam, readout, gun: null, kind: null, ammo: 0, reserve: -1, reloadUntil: 0, reloadTotal: 1, nextShot: 0, shotAt: -9, recoil: 0, back: 0,
      held: false, wasDown: false, downFor: 0, dry: 0, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), muzzle: new THREE.Vector3(), active: false, note: '', noteUntil: 0 };
    setKind(g, 'pistol', W.pistol?.mag ?? 12, -1);
    return g;
  }
  function setKind(g, kind, ammo, reserve) {
    if (g.kind === kind && g.gun) { g.ammo = ammo; g.reserve = reserve; return; }
    if (g.gun) g.kick.remove(g.gun);
    g.gun = cloneGun(kind); g.kind = kind; g.ammo = ammo; g.reserve = reserve; g.reloadUntil = 0;
    g.kick.add(g.gun);
    const b = g.gun.userData.box;
    g.readout.mesh.position.set(0, b.max.y + 0.02, Math.min(b.max.z - 0.02, 0.06));
    g.readout.mesh.rotation.set(-0.5, 0, 0);
    const mz = g.gun.userData.muzzle;
    g.beam.position.set(mz.x, mz.y, mz.z - 0.6); g.beam.scale.set(1, 1, 1.2);
  }
  const mine = { l: makeMine('l'), r: makeMine('r') };
  let clock = 0, down = false, lastSnap = null, shotsFired = 0;
  const rel = { l: null, r: null };      // измереното завъртане от хвата до лъча на моите контролери
  const arenaQ = new THREE.Quaternion();

  function aim(g) {
    const h = ctx.hands[g.side];
    if (!h || !h.active) { g.active = false; return; }
    g.active = true;
    if (h.obj && h.ray) {      // каска: позицията е дланта, посоката е лъчът на контролера
      root.getWorldQuaternion(arenaQ).invert();
      h.ray.getWorldQuaternion(q1).premultiply(arenaQ);
      if (AIM_PITCH) q1.multiply(q2.setFromAxisAngle(v1.set(1, 0, 0), AIM_PITCH));
      g.holder.position.copy(h.pos);
      g.holder.quaternion.copy(q1);
      g.dir.set(0, 0, -1).applyQuaternion(q1);
      g.muzzle.copy(g.gun.userData.muzzle).applyQuaternion(q1).add(h.pos);
      // лъчът за попаденията тръгва по оста на цевта, но от над дръжката: зомби, опряло в дулото, пак се уцелва
      g.origin.copy(g.muzzle).addScaledVector(g.dir, g.gun.userData.muzzle.z);
      (rel[g.side] ||= new THREE.Quaternion()).copy(h.quat).invert().multiply(q1);
    } else {                   // без каска: лъчът тръгва от окото през мишката, оръжието стои долу вдясно
      g.dir.subVectors(h.pos, ctx.head.pos);
      if (g.dir.lengthSq() < 1e-6) g.dir.set(0, 0, -1).applyQuaternion(ctx.head.quat);
      g.dir.normalize();
      m1.lookAt(ZERO, g.dir, UP);
      q1.setFromRotationMatrix(m1);
      v1.set(0.17, -0.17, 0).applyQuaternion(q1);
      g.holder.position.copy(ctx.head.pos).addScaledVector(g.dir, 0.42).add(v1);
      g.holder.quaternion.copy(q1);
      g.origin.copy(ctx.head.pos);
      g.muzzle.copy(g.gun.userData.muzzle).applyQuaternion(q1).add(g.holder.position);
    }
  }

  function canFire(g) {
    return !down && g.active && clock >= g.reloadUntil && clock >= g.nextShot && lastSnap && !lastSnap.result;
  }
  /**
   * Близък бой: острието е къс дебел лъч от дланта по оста на оръжието. Удря първото зомби, което докосва,
   * и го казва на сървъра като изстрел (същият път: брой удари, обсег, щета).
   */
  function strike(g, w) {
    if (down || !g.active || g.stowed || !lastSnap || lastSnap.result || g.ammo <= 0 || clock < g.nextShot) return false;
    const saw = w.melee === 'saw';
    const hit = zombies.raycast(g.origin, g.dir, w.range, saw ? 0.2 : 0.26);
    if (!hit) return false;
    g.nextShot = clock + 60 / w.rpm; g.shotAt = clock; g.ammo--; shotsFired++;
    const feel = FEEL[g.kind] || FEEL.axe;
    g.recoil = Math.min(0.5, g.recoil + feel.kick);
    ctx.haptic(g.side, feel.hap[0], feel.hap[1]);
    fx.burst(hit.point, 'blood', saw ? 5 : 14, saw ? 2.2 : 3, g.dir);
    audio.hit(hit.part === 1);
    if (saw) audio.saw?.(true); else audio.chop?.();
    const boss = zombies.list.get(hit.id)?.type === 'boss';
    if (!saw && !boss) zombies.localKill(hit.id, g.dir); else zombies.flinch(hit.id);
    ctx.send({ a: 'shot', hand: g.side, o: [r3(g.origin.x), r3(g.origin.y), r3(g.origin.z)], d: [r3(g.dir.x), r3(g.dir.y), r3(g.dir.z)], hits: [[hit.id, hit.part, 1]] });
    return true;
  }
  function fire(g) {
    const w = W[g.kind];
    if (!w) return;
    if (w.melee) { strike(g, w); return; }
    if (down || !g.active || !lastSnap || lastSnap.result) return;
    if (clock < g.reloadUntil || g.ammo <= 0) {
      if (clock - g.dry > 0.25) { g.dry = clock; audio.dry(); ctx.haptic(g.side, 0.15, 15); }
      if (g.ammo <= 0 && clock >= g.reloadUntil) beginReload(g, false, true);
      return;
    }
    if (clock < g.nextShot) return;
    g.nextShot = clock + 60 / w.rpm;
    g.shotAt = clock; g.ammo--; shotsFired++;
    if (g.gun.userData.flash) { g.gun.userData.flash.visible = true; g.flashOff = clock + 0.05; }
    const feel = FEEL[g.kind] || FEEL.pistol;
    g.recoil = Math.min(0.7, g.recoil + feel.kick); g.back = Math.min(0.09, g.back + feel.back);
    ctx.haptic(g.side, feel.hap[0], feel.hap[1]);
    audio.shot(g.kind, null);
    fx.flash(g.muzzle, g.dir, g.kind);
    fx.casing(g.muzzle, g.holder.quaternion);
    // сачмите: всяка е отделен лъч; попаденията се събират по зомби и част
    const hits = new Map();
    let nearHit = Infinity;
    for (let i = 0; i < (w.pellets || 1); i++) {
      v2.copy(g.dir);
      if (w.spread) { v2.x += (Math.random() - 0.5) * 2 * w.spread; v2.y += (Math.random() - 0.5) * 2 * w.spread; v2.z += (Math.random() - 0.5) * 2 * w.spread; v2.normalize(); }
      const hit = zombies.raycast(g.origin, v2, w.range, 0.02);
      let end;
      if (hit) {
        const key = `${hit.id}|${hit.part}`;
        hits.set(key, (hits.get(key) || 0) + 1);
        end = v3.copy(hit.point);
        nearHit = Math.min(nearHit, end.distanceTo(g.origin));
        fx.burst(end, 'blood', hit.part ? 7 : 4, 2.2, v2);
        if (hit.part === 1) zombies.localKill(hit.id, v2); else zombies.flinch(hit.id);
      } else {
        // земята: прах, където куршумът я стига
        const t = v2.y < -0.01 ? -g.origin.y / v2.y : Infinity;
        end = v3.copy(g.origin).addScaledVector(v2, Math.min(t, w.range));
        if (t < w.range) fx.burst(end, 'dirt', 3, 1.4);
      }
      if (i < 3) fx.tracer(g.muzzle, end);
    }
    const list = [...hits.entries()].map(([key, n]) => { const [id, part] = key.split('|'); return [Number(id), Number(part), n]; });
    if (list.length) audio.hit(list.some(h => h[1] === 1));
    // варел с гориво по оста на цевта: брои се, ако пред него няма уцелено зомби
    let bomb = -1, bombT = nearHit;
    for (let i = 0; i < bombs.length; i++) {
      const b = bombs[i];
      if (!b.alive) continue;
      v1.set(b.x, b.y, b.z).sub(g.origin);
      const t = v1.dot(g.dir);
      if (t < 0.3 || t > w.range || t >= bombT) continue;
      if (v1.addScaledVector(g.dir, -t).length() <= b.r) { bomb = i; bombT = t; }
    }
    const msg = { a: 'shot', hand: g.side, o: [r3(g.muzzle.x), r3(g.muzzle.y), r3(g.muzzle.z)], d: [r3(g.dir.x), r3(g.dir.y), r3(g.dir.z)], hits: list };
    if (bomb >= 0) msg.bomb = bomb;
    ctx.send(msg);
    if (g.ammo <= 0) {
      if (g.reserve === 0) { /* сървърът връща пистолета */ } else beginReload(g, false, false);
    }
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  function beginReload(g, quick, tell) {
    const w = W[g.kind];
    if (!w || g.ammo >= w.mag || g.reserve === 0) return;
    if (clock < g.reloadUntil && !(quick && g.reloadUntil - clock > w.fast)) return;
    g.reloadTotal = quick ? w.fast : w.reload;
    g.reloadUntil = clock + g.reloadTotal; g.reloadStart = clock; g.reloading = true;
    audio.reload(g.reloadTotal);
    ctx.haptic(g.side, 0.3, 25);
    if (tell || quick) ctx.send({ a: 'reload', hand: g.side, fast: quick ? 1 : 0 });
  }

  // ── вход ──
  let bombs = [];      // варелите с гориво от света: [{ x, y, z, r, alive }]
  let slots = [];      // от сандъка: [{ k, pos: Vector3 }]
  let stock = {};
  /**
   * Оръжието на земята, което тази ръка иска: или ръката е до него, или сочи надолу към него (лъчът минава близо
   * и пред него няма зомби).
   */
  function nearSlot(g, max = 0.6) {
    const h = ctx.hands[g.side];
    let best = null, bd = Infinity;
    for (const s of slots) {
      let d = h.obj ? h.pos.distanceTo(s.pos) : Infinity;
      v1.subVectors(s.pos, g.origin);
      const t = v1.dot(g.dir);
      if (t > 0.15 && t < 3.6 && (desktop || g.dir.y < -0.22)) {
        const side = v1.addScaledVector(g.dir, -t).length();
        if (side < 0.26 && !zombies.raycast(g.origin, g.dir, t, 0.05)) d = Math.min(d, max * 0.9 * side / 0.26);
      }
      if (d < bd) { bd = d; best = s; }
    }
    return best && bd < max ? best : null;
  }
  const off = ctx.onInput(e => {
    audio.wake();
    const g = mine[e.hand];
    if (!g) return;
    if (e.type === 'triggerdown') {
      const s = !desktop && nearSlot(g);
      if (s) { ctx.send({ a: 'take', hand: g.side, d: s.id }); ctx.haptic(g.side, 0.7, 60); g.reachAt = clock + 1.5; return; }
      g.held = true; fire(g);
    }
    else if (e.type === 'triggerup') g.held = false;
    else if (e.type === 'gripdown') {
      const s = nearSlot(g);
      if (s) { ctx.send({ a: 'take', hand: g.side, d: s.id }); ctx.haptic(g.side, 0.7, 60); }
      else if (desktop) { g.held = true; fire(g); }      // без каска: клик стреля
    } else if (e.type === 'gripup') { if (desktop) g.held = false; }
  });

  // ── оръжията на другите играчи ──
  const others = new Map();      // id → { l, r }
  function otherGuns(snap) {
    const view = ctx.viewId, live = new Set();
    for (const p of snap?.players || []) {
      if (p.id === ctx.me.id && view === ctx.me.id) continue;
      const a = ctx.players.get(p.id);
      if (!a) continue;
      live.add(p.id);
      let o = others.get(p.id);
      if (!o) { o = { l: null, r: null }; others.set(p.id, o); }
      for (const side of ['l', 'r']) {
        const src = a[side], kind = p[side]?.[0] || 'pistol', on = src.pos.y > 0.02 && a.group.visible !== false;
        let g = o[side];
        if (g && g.userData.kind !== kind) { group.remove(g); g = o[side] = null; }
        if (!g && on) { g = o[side] = cloneGun(kind); group.add(g); }
        if (!g) continue;
        g.visible = on;
        if (!on) continue;
        g.position.copy(src.pos);
        const rq = rel[side] || rel.l || rel.r;
        g.quaternion.copy(src.quat);
        if (rq) g.quaternion.multiply(rq); else g.quaternion.multiply(q2.setFromAxisAngle(v1.set(1, 0, 0), GRIP_TO_RAY));
        const box = side === 'l' ? a.lMesh : a.rMesh;
        if (box) box.visible = false;
        for (const c of a.group.children) if (c !== a.lMesh && c !== a.rMesh && c !== a.headMesh && c !== a.body && c !== a.tag?.mesh && c !== a.body3d?.group && c.position.distanceToSquared(src.pos) < 1e-8) c.visible = false;
      }
    }
    for (const [id, o] of others) if (!live.has(id)) { for (const s of ['l', 'r']) if (o[s]) group.remove(o[s]); others.delete(id); }
  }

  // ── от сървъра ──
  function onSnapshot(s) {
    lastSnap = s;
    const me = s.players?.find(p => p.id === ctx.me.id);
    if (!me) return;
    down = me.down > 0 || !!s.paused;      // в пауза оръжията мълчат като при падане
    for (const side of ['l', 'r']) {
      const g = mine[side], st = me[side];
      if (!st) continue;
      const [kind, ammo, reserve, left] = st;
      if (kind !== g.kind) { setKind(g, kind, ammo, reserve); g.reloading = left > 0; g.reloadUntil = left > 0 ? clock + left : 0; g.reloadStart = clock; continue; }
      g.reserve = reserve;
      if (clock - g.shotAt > 0.4) {      // моите изстрели изпреварват сървъра: числото се приема, когато не стрелям
        g.ammo = ammo;
        if (left > 0 && !g.reloading) { g.reloadUntil = clock + left; g.reloadTotal = Math.max(left, 0.3); g.reloadStart = clock; g.reloading = true; }
        if (left === 0 && g.reloading && clock - g.reloadStart > 0.7) { g.reloading = false; g.reloadUntil = clock; }      // сървърът не го е приел
      }
    }
  }
  function note(text, seconds = 1.6) { for (const g of Object.values(mine)) { g.note = text; g.noteUntil = clock + seconds; } }

  function hideHands() {
    // оръжието стои вместо ръката: моделът на ръката (или кутийката) при контролера се скрива, докато върви играта
    for (const side of ['l', 'r']) { const o = ctx.hands[side].obj; if (o) for (const c of o.children) c.visible = false; }
    const dh = window.__arena?.desk?.hand;
    if (dh && desktop) for (const c of dh.children) c.visible = false;
  }
  function showHands() {
    for (const side of ['l', 'r']) { const o = ctx.hands[side].obj; if (o) for (const c of o.children) c.visible = true; }
    const dh = window.__arena?.desk?.hand;
    if (dh) for (const c of dh.children) c.visible = true;
  }

  function update(dt, now) {
    clock += dt;
    hideHands();
    const watching = ctx.viewId !== ctx.me.id || !lastSnap?.players?.some(p => p.id === ctx.me.id);
    for (const side of ['l', 'r']) {
      const g = mine[side], w = W[g.kind] || {};
      if (watching) { g.holder.visible = false; g.dot.visible = false; continue; }
      aim(g);
      g.holder.visible = g.active && !g.stowed;
      if (!g.active) { g.dot.visible = false; continue; }
      // автоматичен огън
      const h = ctx.hands[side];
      const holding = g.held && (h.trigger || (desktop && h.grip));
      if (!holding) g.held = false;
      if (holding && w.auto && canFire(g)) fire(g);
      // посягане: ръка с пистолет, спусната над оръжие на земята, го взима без бутон (друго оръжие се сменя със спусъка)
      if (h.obj && g.kind === 'pistol' && !down && !h.trigger && clock - g.shotAt > 0.8 && clock >= (g.reachAt || 0)) {
        let near = null;
        for (const sl of slots) if (Math.hypot(h.pos.x - sl.pos.x, h.pos.z - sl.pos.z) < 0.34 && h.pos.y < sl.pos.y + 0.8) { near = sl; break; }
        g.reachFor = near ? (g.reachFor || 0) + dt : 0;
        if (near && g.reachFor > 0.45) { g.reachFor = 0; g.reachAt = clock + 1.5; ctx.send({ a: 'take', hand: g.side, d: near.id }); ctx.haptic(g.side, 0.7, 60); }
      } else g.reachFor = 0;
      // близък бой: брадвата удря сама при замах (върхът ѝ се движи бързо), резачката бръмчи, докато спусъкът е натиснат
      if (w.melee) {
        const sp = g.tipAt ? g.tipAt.distanceTo(g.muzzle) / Math.max(dt, 1e-3) : 0;
        (g.tipAt ||= new THREE.Vector3()).copy(g.muzzle);
        g.tipV = Math.max(sp, (g.tipV || 0) * Math.exp(-dt * 14));
        if (w.melee === 'swing' && g.tipV > SWING && sp < 40) strike(g, w);
        if (w.melee === 'saw') {
          if (holding && clock - (g.buzzAt || 0) > 0.11) { g.buzzAt = clock; audio.saw?.(false); ctx.haptic(side, 0.22, 60); }
          g.gun.position.set(holding ? (Math.random() - 0.5) * 0.004 : 0, holding ? (Math.random() - 0.5) * 0.004 : 0, 0);
        }
      } else g.tipAt = null;
      // жест за презареждане: цевта надолу
      const pointDown = g.dir.y < DOWN_FOR_RELOAD;
      g.downFor = pointDown ? g.downFor + dt : 0;
      if (g.downFor > RELOAD_HOLD && !g.wasDown) { g.wasDown = true; if (!w.melee && g.ammo < (w.mag || 0)) beginReload(g, true, true); }
      if (!pointDown) g.wasDown = false;
      // презареждането свърши (сървърът го потвърждава след малко)
      if (g.reloading && clock >= g.reloadUntil) { g.reloading = false; g.ammo = g.reserve < 0 ? w.mag : Math.min(w.mag, g.ammo + g.reserve); g.shotAt = clock - 0.25; audio.loaded(); ctx.haptic(side, 0.5, 40); }
      if (g.flashOff && clock >= g.flashOff) { g.flashOff = 0; if (g.gun.userData.flash) g.gun.userData.flash.visible = false; }
      // откат
      g.recoil *= Math.exp(-dt * (FEEL[g.kind]?.ret || 14)); g.back *= Math.exp(-dt * 18);
      const rl = clock < g.reloadUntil ? Math.sin(Math.min(1, (g.reloadUntil - clock) / g.reloadTotal) * Math.PI) : 0;      // при презареждане оръжието се накланя
      g.kick.rotation.set(g.recoil + rl * 0.5, 0, rl * 0.35 * (side === 'l' ? 1 : -1));
      g.kick.position.set(0, 0, g.back);
      // цифрите
      if (down || clock < g.reloadUntil) g.readout.draw('', '');      // паднал или презарежда: нищо не пише
      else g.readout.draw(String(g.ammo), g.ammo === 0 ? 'bad' : g.ammo <= Math.ceil((w.mag || 10) * 0.25) ? 'warn' : '');
      // лазерната точка: къде ще попадне
      const hit = zombies.raycast(g.origin, g.dir, 60, 0);
      g.onTarget = !!hit || !!h.trigger;      // цели се или стреля: чукът при портата не му взима оръжието
      let t = hit ? hit.dist : 40;
      if (!hit && g.dir.y < -0.01) t = Math.min(t, -g.origin.y / g.dir.y);
      g.dot.position.copy(g.origin).addScaledVector(g.dir, Math.max(0.3, t - 0.02));
      g.dot.scale.setScalar(Math.max(1, t * 0.55));
      g.dot.visible = !down && clock >= g.reloadUntil && (!!hit || t < 40);      // в небето точка няма
      if (g.stowed || w.melee) g.dot.visible = false;      // в ръката е чукът или оръжие за близък бой: няма лазерна точка
      g.beam.visible = g.dot.visible && !desktop;
    }
    otherGuns(lastSnap);
  }

  function dispose() {
    off();
    showHands();
    root.remove(group);
    for (const g of Object.values(mine)) g.readout.dispose();
    laserGeo.dispose(); laserMat.dispose(); beamGeo.dispose(); beamMat.dispose();
  }

  return {
    update, onSnapshot, dispose, note, mine, cloneGun,
    setSlots(list) { slots = list || []; },
    setBombs(list) { bombs = Array.isArray(list) ? list : []; },
    /** Прибира оръжието в тази ръка (докато тя държи чука). Спусъкът пак стреля и го вади обратно. */
    stow(side, on) { const g = mine[side]; if (g) g.stowed = !!on; },
    /** Секунди от последния изстрел с тази ръка. */
    sinceShot(side) { const g = mine[side]; return g && Number.isFinite(g.shotAt) ? clock - g.shotAt : 99; },
    fireNow(side) { const g = mine[side]; if (g) { g.nextShot = Math.min(g.nextShot, clock); fire(g); } },
    info: () => ({ shots: shotsFired, defs: Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, `${d.slug}/${d.model}`])), mine: Object.fromEntries(Object.entries(mine).map(([s, g]) => [s, { kind: g.kind, ammo: g.ammo, reserve: g.reserve, reloading: clock < g.reloadUntil, active: g.active }])) }),
  };
}

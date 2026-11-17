// Сандъкът с оръжията. Стои до зоната, на мястото на масата. В подготовката и след всяка изчистена вълна капакът му
// се вдига, оръжията изскачат едно след друго, прелитат в дъга, въртят се и остават на земята пред него: за всички
// играчи, докато някой не ги вземе. Взимат се със спусната над тях ръка или като се посочат и се натисне спусъкът
// (самото взимане е в weapons.js; тук му се казва къде лежи всяко оръжие). Над оръжието, до което е ръката на играча,
// излиза името му с един ред какво е. Без табла: само оригиналните модели и едър текст.
//
// Модели: SM_Prop_Crate_Ammo_01 и капакът му SM_Prop_Crate_Ammo_Lid_01 (Military Pack; началото на капака е в пантата).
// Сървърът казва какво излиза (събитие offer с items = [[номер, вид, x, z], …]), какво лежи (snapshot.drops) и кой
// какво е взел (събитие take с d = номера).

const CHEST = { slug: 'military-pack', body: 'SM_Prop_Crate_Ammo_01', lid: 'SM_Prop_Crate_Ammo_Lid_01' };
const ROLE = {
  smg: 'Fast', revolver: 'Heavy hitter', shotgun: 'Close range', carbine: 'Steady', rifle: 'Strong', hunting: 'One shot kills', lmg: 'Never stops',
  machete: 'Melee · swing it', axe: 'Melee · swing it', chainsaw: 'Melee · hold the trigger',
};
const NAME = {
  smg: 'SMG', revolver: 'REVOLVER', shotgun: 'SHOTGUN', carbine: 'CARBINE', rifle: 'ASSAULT RIFLE', hunting: 'HUNTING RIFLE', lmg: 'MACHINE GUN',
  machete: 'MACHETE', axe: 'FIRE AXE', chainsaw: 'CHAINSAW', pistol: 'PISTOL',
};
const OPEN = 0.4, GAP = 0.17, FLY = 0.85, LID = -1.92;      // капакът се вдига за OPEN секунди; оръжията излизат през GAP; летят FLY

export async function createChest(ctx, start, weapons, fx, audio) {
  const { THREE, root } = ctx;
  const W = start.weapons || {};
  const group = new THREE.Group();
  group.name = 'chest';
  root.add(group);
  const at = start.chest || { x: (start.stand?.x || 0), z: (start.stand?.z || -1.5), ry: start.stand?.ry || 0 };
  const box = new THREE.Group();
  box.position.set(at.x, 0, at.z);
  box.rotation.y = at.ry || 0;
  group.add(box);
  let lidPivot = null, mouthY = 0.3;
  try {
    await ctx.assets.loadPack(CHEST.slug);
    const body = await ctx.assets.get(CHEST.slug, CHEST.body), lid = await ctx.assets.get(CHEST.slug, CHEST.lid);
    const bi = ctx.assets.info(CHEST.slug, CHEST.body), li = ctx.assets.info(CHEST.slug, CHEST.lid);
    box.add(body);
    // капакът лежи върху сандъка и се върти около задния си ръб
    lidPivot = new THREE.Group();
    const top = bi ? bi.max[1] : 0.33, deep = li ? li.max[2] : 0.79;
    lidPivot.position.set(0, top - (li ? li.max[1] : 0.1) + 0.012, -deep / 2 + 0.01);
    lidPivot.add(lid);
    box.add(lidPivot);
    mouthY = top;
  } catch (e) { console.warn('[motel] chest', e?.message || e); }
  box.updateMatrixWorld(true);
  const mouth = new THREE.Vector3(0, mouthY + 0.05, 0).applyMatrix4(box.matrixWorld);
  root.worldToLocal(mouth);

  // оръжията на земята светят сами (изсветлени), за да се виждат в тъмното
  const mats = new Map();
  const lit = m => { let b = mats.get(m.uuid); if (!b) { b = new THREE.MeshBasicMaterial({ map: m.map || null, toneMapped: false, fog: false }); b.color.setScalar(m.map ? 2.4 : 1.5); mats.set(m.uuid, b); } return b; };

  // ── името над оръжието, до което е ръката ──
  const FONT = '"Sofia Sans XC", "Sofia Sans", "Arial Narrow", sans-serif';
  const lCanvas = document.createElement('canvas');
  lCanvas.width = 512; lCanvas.height = 128;
  const l2 = lCanvas.getContext('2d');
  const lTex = new THREE.CanvasTexture(lCanvas);
  lTex.colorSpace = THREE.SRGBColorSpace; lTex.anisotropy = 4;
  const lMat = new THREE.MeshBasicMaterial({ map: lTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), lMat);
  label.renderOrder = 28; label.visible = false; label.frustumCulled = false;
  group.add(label);
  let labelFor = null, labelK = 0;
  function drawLabel(k) {
    const w = W[k] || {};
    l2.clearRect(0, 0, lCanvas.width, lCanvas.height);
    l2.textAlign = 'center'; l2.textBaseline = 'alphabetic'; l2.lineJoin = 'round';
    try { l2.letterSpacing = '5px'; } catch { /* без разредка */ }
    l2.font = `900 68px ${FONT}`;
    l2.lineWidth = 8; l2.strokeStyle = 'rgba(0, 0, 0, 0.78)';
    l2.strokeText(NAME[k] || k.toUpperCase(), 258, 62, 500);
    l2.fillStyle = '#f6f1e7';
    l2.fillText(NAME[k] || k.toUpperCase(), 258, 62, 500);
    const rounds = w.melee ? '' : ` · ${(w.mag || 0) + Math.max(0, w.reserve || 0)} ${k === 'shotgun' ? 'shells' : 'rounds'}`;
    try { l2.letterSpacing = '3px'; } catch { /* без разредка */ }
    l2.font = `700 36px ${FONT}`;
    l2.lineWidth = 6;
    const sub = `${ROLE[k] || ''}${rounds}`.toUpperCase();
    l2.strokeText(sub, 257, 110, 500);
    l2.fillStyle = '#ffd257';
    l2.fillText(sub, 257, 110, 500);
    lTex.needsUpdate = true;
  }

  // ── оръжията: в полет и на земята ──
  const items = new Map();      // номер → { id, k, obj, gun, rest, yaw, st, t, wait, from, to, hop, spin, tumble, slot, lift }
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  let lidOpen = 0, lidFrom = 0, lidUntil = 0, lidSaid = true, clock = 0, launches = 0;
  function make(id, k, x, z, flyIndex) {
    if (items.has(id)) return items.get(id);
    const gun = weapons.cloneGun(k);
    gun.traverse(o => { if (o.isMesh) { o.material = lit(o.material); o.frustumCulled = false; } });
    const b = gun.userData.box;
    // лежи на едната си страна, средата му е над мястото
    gun.rotation.set(0, 0, Math.PI / 2);
    gun.position.set(0, 0, -(b.min.z + b.max.z) / 2);
    const obj = new THREE.Group();
    obj.add(gun);
    const rest = Math.max(0.03, b.max.x) + 0.012, yaw = ((id * 2.399) % (Math.PI * 2));
    const rec = { id, k, obj, gun, rest, yaw, st: 'ground', t: 0, wait: 0, from: new THREE.Vector3(), to: new THREE.Vector3(x, rest, z), hop: 0, spin: 0, tumble: 0, lift: 0,
      slot: { k, id, ground: true, pos: new THREE.Vector3(x, rest, z) } };
    obj.position.copy(rec.to);
    obj.rotation.y = yaw;
    if (flyIndex != null) {      // излиза от сандъка: чака реда си, после лети в дъга
      rec.st = 'wait'; rec.wait = OPEN + GAP * flyIndex;
      rec.from.copy(mouth);
      rec.spin = (2 + (id % 2)) * Math.PI * 2 * (id % 2 ? 1 : -1);
      rec.tumble = Math.PI * 2 * (1 + (id % 3));
      obj.position.copy(mouth);
      obj.visible = false;
    }
    group.add(obj);
    items.set(id, rec);
    return rec;
  }
  function drop(rec) { group.remove(rec.obj); items.delete(rec.id); if (labelFor === rec) labelFor = null; }

  /** От сандъка излизат нови оръжия: e.items = [[номер, вид, x, z], …]. */
  function open(e, delay = 0) {
    const list = (e.items || []).filter(it => !items.has(it[0]));
    if (!list.length) return;
    list.forEach((it, i) => { make(it[0], it[1], it[2], it[3], i).wait += delay; });
    lidFrom = clock + delay; lidUntil = lidFrom + OPEN + GAP * list.length + FLY + 0.5; lidSaid = false;
    launches++;
  }
  /** Някой взе оръжие от земята: то отива към ръката му и изчезва. */
  function taken(e) {
    const rec = items.get(e.d);
    if (!rec || rec.st === 'take') return;
    const a = e.p === ctx.me.id ? null : ctx.players.get(e.p);
    const h = e.p === ctx.me.id ? ctx.hands[e.hand] : a ? a[e.hand] : null;
    rec.st = 'take'; rec.t = 0;
    rec.from.copy(rec.obj.position);
    if (h && h.pos && h.pos.y > 0.02) rec.to.copy(h.pos); else rec.to.copy(rec.obj.position).setY(1.1);
  }
  let seenOffer = 0;
  function onSnapshot(s) {
    // новото от сандъка се пуска оттук (преди сравнението с лежащите), иначе щеше да се появи направо на земята;
    // в самото начало изчаква екранът да изсветлее
    for (const e of s.events || []) if (e.k === 'offer' && e.i > seenOffer) { seenOffer = e.i; open(e, clock < 4 ? 2.4 : 0); }
    const live = new Set();
    for (const d of s.drops || []) { live.add(d[0]); if (!items.has(d[0])) make(d[0], d[1], d[2], d[3], null); }
    for (const rec of [...items.values()]) if (!live.has(rec.id) && rec.st !== 'take') { rec.st = 'take'; rec.t = 0.6; rec.from.copy(rec.obj.position); rec.to.copy(rec.obj.position); }
  }

  const easeOutBack = k => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  function update(dt) {
    clock += dt;
    // капакът
    const want = clock >= lidFrom && clock < lidUntil ? 1 : 0;
    if (want && !lidSaid) {      // капакът тръгва: скърцане и прах
      lidSaid = true;
      try { audio.chest?.(at.x, at.z); } catch { /* без звук */ }
      try { fx.burst(mouth, 'dirt', 10, 2.6); } catch { /* без прах */ }
    }
    lidOpen += (want - lidOpen) * Math.min(1, dt * (want ? 7 : 3));
    if (lidPivot) lidPivot.rotation.x = LID * (want ? easeOutBack(Math.min(1, lidOpen)) : lidOpen);
    // чии ръце са близо: за името и за леко повдигане на оръжието
    let near = null, nd = 1.25;
    const slots = [];
    for (const rec of items.values()) {
      if (rec.st === 'wait') {
        rec.wait -= dt;
        if (rec.wait <= 0) { rec.st = 'fly'; rec.t = 0; rec.obj.visible = true; try { audio.pickup?.(); } catch { /* без звук */ } }
        continue;
      }
      if (rec.st === 'fly') {
        rec.t += dt / FLY;
        const u = Math.min(1, rec.t), arc = 4 * u * (1 - u);
        rec.obj.position.lerpVectors(rec.from, rec.to, u);
        rec.obj.position.y += arc * (1.05 + (rec.id % 3) * 0.12);
        rec.obj.rotation.y = rec.yaw + rec.spin * (1 - u);
        rec.gun.rotation.x = rec.tumble * (1 - u);
        if (u >= 1) {
          rec.st = 'ground'; rec.hop = 0.3; rec.gun.rotation.x = 0;
          try { fx.burst(v.copy(rec.to).setY(0.03), 'dirt', 5, 1.5); } catch { /* без прах */ }
          try { audio.clack?.(rec.to.x, rec.to.z); } catch { /* без звук */ }
        }
        continue;
      }
      if (rec.st === 'take') {
        rec.t += dt / 0.24;
        const u = Math.min(1, rec.t);
        rec.obj.position.lerpVectors(rec.from, rec.to, u);
        rec.obj.scale.setScalar(Math.max(0.05, 1 - 0.75 * u));
        if (u >= 1) drop(rec);
        continue;
      }
      // на земята: малък подскок при падането, после лежи; ръка наблизо го повдига леко
      let d = 9;
      for (const side of ['l', 'r']) { const h = ctx.hands[side]; if (h && h.active && h.pos.y > 0.02) d = Math.min(d, Math.hypot(h.pos.x - rec.to.x, h.pos.z - rec.to.z)); }
      const hd = Math.hypot(ctx.head.pos.x - rec.to.x, ctx.head.pos.z - rec.to.z);
      if (Math.min(d, hd * 0.8) < nd) { nd = Math.min(d, hd * 0.8); near = rec; }
      rec.lift += ((d < 0.45 ? 1 : 0) - rec.lift) * Math.min(1, dt * 8);
      if (rec.hop > 0) rec.hop = Math.max(0, rec.hop - dt);
      rec.obj.position.set(rec.to.x, rec.rest + Math.sin((0.3 - rec.hop) / 0.3 * Math.PI) * 0.09 * (rec.hop > 0 ? 1 : 0) + rec.lift * 0.1, rec.to.z);
      rec.obj.rotation.y = rec.yaw + rec.lift * Math.sin(clock * 3) * 0.12;
      rec.slot.pos.set(rec.to.x, rec.rest, rec.to.z);
      slots.push(rec.slot);
    }
    weapons.setSlots(slots);
    // името стои над най-близкото оръжие и гледа към играча
    if (near !== labelFor) { labelFor = near; if (near) drawLabel(near.k); }
    labelK += ((labelFor ? 1 : 0) - labelK) * Math.min(1, dt * 9);
    label.visible = labelK > 0.03;
    if (label.visible && labelFor) {
      label.position.set(labelFor.to.x, 0.52, labelFor.to.z);
      v.copy(ctx.head.pos); v2.copy(label.position); root.localToWorld(v); root.localToWorld(v2);
      label.lookAt(v);
      lMat.opacity = labelK;
    }
  }

  function dispose() {
    weapons.setSlots([]);
    root.remove(group);
    lTex.dispose(); lMat.dispose(); label.geometry.dispose();
    for (const m of mats.values()) m.dispose();
  }

  return { open, taken, onSnapshot, update, dispose, info: () => ({ chest: !!lidPivot, at: [at.x, at.z], lid: +lidOpen.toFixed(2), launches, items: [...items.values()].map(r => [r.id, r.k, r.st, +r.obj.position.x.toFixed(2), +r.obj.position.y.toFixed(2), +r.obj.position.z.toFixed(2)]), label: labelFor ? labelFor.k : null }) };
}

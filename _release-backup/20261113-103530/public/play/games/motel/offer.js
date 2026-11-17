// Изборът на оръжие. В подготовката и след всяка изчистена вълна пред играча застава „стойка": три оръжия в естествен
// размер едно над друго (оригиналните модели, обърнати с профила си към него), под всяко името му и един ред какво е.
// Играчът посяга и го докосва (или натиска спусъка до него): оръжието отива в тази ръка, стойката изчезва.
// Без табла и рамки: само моделите и едър текст.
//
// Сървърът казва кои са трите (snapshot.offer = [номер, вид, вид, вид]) и кой вече е взел (players[].pick);
// взимането върви през weapons.js (setSlots: къде е всяко оръжие; посягането и спусъкът са там).

const ROLE = {
  smg: 'Fast', revolver: 'Heavy hitter', shotgun: 'Close range', carbine: 'Steady', rifle: 'Strong', hunting: 'One shot kills', lmg: 'Never stops',
  machete: 'Melee · swing it', axe: 'Melee · swing it', chainsaw: 'Melee · hold the trigger',
};
const NAME = {
  smg: 'SMG', revolver: 'REVOLVER', shotgun: 'SHOTGUN', carbine: 'CARBINE', rifle: 'ASSAULT RIFLE', hunting: 'HUNTING RIFLE', lmg: 'MACHINE GUN',
  machete: 'MACHETE', axe: 'FIRE AXE', chainsaw: 'CHAINSAW', pistol: 'PISTOL',
};
const AHEAD = 0.95, PITCH = 0.42;      // колко пред играча стои стойката и през колко са редовете ѝ
const STAY = 9;                        // толкова секунди след началото на вълната невзетият избор още стои

export function createOffer(ctx, start, weapons) {
  const { THREE, root } = ctx;
  const W = start.weapons || {};
  const group = new THREE.Group();
  group.name = 'offer';
  group.visible = false;
  root.add(group);
  const FONT = '"Sofia Sans XC", "Sofia Sans", "Arial Narrow", sans-serif';
  const mats = new Map();      // светещ вариант на всеки материал: стойката се чете и в тъмното
  // оръжията са тъмни по текстура: тук са изсветлени, за да се четат нощем
  const lit = m => { let b = mats.get(m.uuid); if (!b) { b = new THREE.MeshBasicMaterial({ map: m.map || null, toneMapped: false, fog: false }); b.color.setScalar(m.map ? 2.7 : 1.6); mats.set(m.uuid, b); } return b; };

  const rows = [];
  for (let i = 0; i < 3; i++) {
    const row = new THREE.Group();
    row.position.y = (1 - i) * PITCH;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), mat);
    label.position.set(0, -0.135, 0.04); label.renderOrder = 28;
    row.add(label);
    group.add(row);
    rows.push({ row, canvas, g2: canvas.getContext('2d'), tex, mat, label, gun: null, k: null, slot: { k: null, pos: new THREE.Vector3() }, half: 0.3, hot: 0 });
  }

  function drawLabel(r, k) {
    const { g2, canvas } = r, w = W[k] || {};
    g2.clearRect(0, 0, canvas.width, canvas.height);
    g2.textAlign = 'center'; g2.textBaseline = 'alphabetic'; g2.lineJoin = 'round';
    try { g2.letterSpacing = '5px'; } catch { /* без разредка */ }
    g2.font = `900 66px ${FONT}`;
    g2.lineWidth = 7; g2.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    g2.strokeText(NAME[k] || k.toUpperCase(), 258, 62, 500);
    g2.fillStyle = '#f4efe6';
    g2.fillText(NAME[k] || k.toUpperCase(), 258, 62, 500);
    const rounds = w.melee ? '' : ` · ${(w.mag || 0) + Math.max(0, w.reserve || 0)} ${k === 'shotgun' ? 'shells' : 'rounds'}`;
    try { g2.letterSpacing = '3px'; } catch { /* без разредка */ }
    g2.font = `700 31px ${FONT}`;
    g2.lineWidth = 5;
    const sub = `${ROLE[k] || ''}${rounds}`.toUpperCase();
    g2.strokeText(sub, 257, 108, 500);
    g2.fillStyle = '#e2523a';
    g2.fillText(sub, 257, 108, 500);
    r.tex.needsUpdate = true;
  }
  function setRow(r, k) {
    if (r.gun) { r.row.remove(r.gun); r.gun = null; }
    r.k = k; r.slot.k = k;
    const gun = weapons.cloneGun(k);
    gun.traverse(o => { if (o.isMesh) { o.material = lit(o.material); o.frustumCulled = false; } });
    // профилът към играча: цевта (−Z на оръжието) сочи надясно, средата на оръжието е в средата на реда
    const b = gun.userData.box, mid = (b.min.z + b.max.z) / 2, midY = (b.min.y + b.max.y) / 2;
    gun.rotation.set(0, -Math.PI / 2, 0);
    gun.position.set(mid, 0.04 - midY, 0);
    r.half = (b.max.z - b.min.z) / 2;      // половината дължина: оръжието се хваща където и да е по нея
    r.label.position.y = 0.04 - (b.max.y - b.min.y) / 2 - 0.08;
    r.row.add(gun);
    r.gun = gun;
    drawLabel(r, k);
  }

  let shownN = null, on = false, k01 = 0, waveAt = -1, lastPhase = '', clock = 0, myPick = -2, wantN = null, kinds = [];
  const C = new THREE.Vector3(), F = new THREE.Vector3(), v = new THREE.Vector3();
  const centre = start.zone ? new THREE.Vector3(start.zone.cx || 0, 0, start.zone.cz || 0) : new THREE.Vector3();
  function place() {
    const h = ctx.head;
    // към средата на зоната, ако играчът е встрани от нея (стойката остава вътре в зоната); иначе накъдето гледа
    F.set(centre.x - h.pos.x, 0, centre.z - h.pos.z);
    if (F.length() < 0.9) { F.set(0, 0, -1).applyQuaternion(h.quat); F.y = 0; }
    if (F.lengthSq() < 1e-4) F.set(0, 0, -1);
    F.normalize();
    C.copy(h.pos).addScaledVector(F, AHEAD);
    C.y = Math.min(1.2, Math.max(0.95, h.pos.y - 0.5));
    group.position.copy(C);
    group.rotation.set(0, Math.atan2(-F.x, -F.z), 0);
    group.updateMatrixWorld(true);
  }
  function open(n, list) {
    kinds = list.slice(0, 3);
    rows.forEach((r, i) => { if (kinds[i]) { if (r.k !== kinds[i] || !r.gun) setRow(r, kinds[i]); r.row.visible = true; } else r.row.visible = false; });
    shownN = n; on = true;
    place();
    group.visible = true;
  }
  function close() { on = false; weapons.setSlots([]); }

  function onSnapshot(s) {
    const me = s.players?.find(p => p.id === ctx.me.id);
    if (s.phase !== lastPhase) { if (s.phase === 'wave' || s.phase === 'boss') waveAt = clock; lastPhase = s.phase; }
    myPick = me ? me.pick : -2;
    const o = s.offer;
    const fighting = (s.phase === 'wave' || s.phase === 'boss') && clock - waveAt > STAY;
    const want = !!o && !!me && me.pick !== o[0] && !(me.down > 0) && !s.result && !fighting && ctx.viewId === ctx.me.id;
    wantN = want ? o[0] : null;
    if (want && (!on || shownN !== o[0])) open(o[0], o.slice(1));
    else if (!want && on) close();
  }

  function update(dt) {
    clock += dt;
    k01 += ((on ? 1 : 0) - k01) * Math.min(1, dt * (on ? 9 : 14));
    if (!on && k01 < 0.02) { group.visible = false; return; }
    if (on) {
      // играчът се е отдалечил: стойката идва пак пред него
      const h = ctx.head;
      if (Math.hypot(h.pos.x - C.x, h.pos.z - C.z) > 1.35) { place(); k01 = 0.4; }
    }
    group.scale.setScalar(0.55 + 0.45 * k01);
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.row.visible) continue;
      // оръжието се хваща където и да е по дължината си: точката за хващане е най-близката му до по-близката ръка
      let near = 9, gx = 0;
      for (const side of ['l', 'r']) {
        const hd = ctx.hands[side];
        if (!hd || !hd.active || !hd.obj) continue;
        v.copy(hd.pos); root.localToWorld(v); group.worldToLocal(v);
        const x = Math.max(-r.half, Math.min(r.half, v.x)), dist = Math.hypot(v.x - x, v.y - (r.row.position.y + 0.04), v.z);
        if (dist < near) { near = dist; gx = x; }
      }
      r.slot.pos.set(gx, r.row.position.y + 0.04, 0).applyMatrix4(group.matrixWorld);
      root.worldToLocal(r.slot.pos);
      r.hot += ((near < 0.36 ? 1 : 0) - r.hot) * Math.min(1, dt * 10);
      r.row.position.z = 0.07 * r.hot;
      r.row.scale.setScalar(1 + 0.1 * r.hot);
      if (r.gun) r.gun.position.y += (0.04 - (r.gun.userData.box.min.y + r.gun.userData.box.max.y) / 2 + Math.sin(clock * 1.6 + i * 2.1) * 0.012 - r.gun.position.y) * Math.min(1, dt * 8);
      r.mat.opacity = k01 * (0.82 + 0.18 * r.hot);
      if (on) list.push(r.slot);
    }
    group.updateMatrixWorld(true);
    weapons.setSlots(on && k01 > 0.6 ? list : []);
  }

  function dispose() {
    weapons.setSlots([]);
    root.remove(group);
    for (const r of rows) { r.tex.dispose(); r.mat.dispose(); r.label.geometry.dispose(); }
    for (const m of mats.values()) m.dispose();
  }

  return { onSnapshot, update, dispose, info: () => ({ on, n: shownN, want: wantN, kinds: kinds.slice(), pick: myPick, at: [+C.x.toFixed(2), +C.y.toFixed(2), +C.z.toFixed(2)], slots: rows.filter(r => r.row.visible).map(r => [r.k, +r.slot.pos.x.toFixed(2), +r.slot.pos.y.toFixed(2), +r.slot.pos.z.toFixed(2)]) }) };
}

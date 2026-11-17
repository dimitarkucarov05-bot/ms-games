// hud.js: часовникът на смяната, настроението на светлината и патрулът.
// Не внася three: всичко идва през ctx.THREE. Нищо не се лепи за лицето на играча.
//
// Табла няма. Времето се чете от кухненския монитор на Synty (Shops Pack, SM_Prop_Kitchen_Monitor_01): виси на стойката си
// над тезгяха, както в истинска кухня за бързо хранене. На двата му екрана има само цифри; при патрул една дума.
// Рисуване: моделът (общата текстура на пакета) + 1 draw call за двата екрана (платно 512×372, пречертава се при промяна).

const FONT = '"Sofia Sans", "Segoe UI", system-ui, sans-serif';
const FONT_NUM = '"Sofia Sans XC", "Sofia Sans", "Segoe UI", sans-serif';
const C = { screen: '#0e1318', text: '#eef2ea', dim: '#93a0a8', warn: '#ff9a3c', bad: '#d8432f', good: '#57c26f' };

export const PHASE_NAME = { tutorial: 'TRAINING', night: 'NIGHT', day: 'DAY', night2: 'NIGHT', day2: 'DAY', raid: 'INSPECTION', over: 'THE END' };

const MONITOR = ['shops-pack', 'SM_Prop_Kitchen_Monitor_01'];
const HANG_Y = 2.77;                    // откъде виси стойката горе: долният ръб на гредата над тезгяха на пицарията
const LAB_HANG_Y = 3.0;                 // долу: таванът на мазето (частите на Synty са високи 3 м)
const CW = 512, CH = 372;               // платното на екрана (съотношението на екрана на модела без рамката)
const BEZEL = 0.05;                     // рамката на екрана, която остава от модела

// Светлина по фази спрямо „деня" (каквото заварим в светлините при старта):
// цвят на небето, на земята, множител на общата; цвят и множител на насочената. null = цветът от деня.
const MOODS = {
  tutorial: [null, null, 1, null, 1],
  day: [null, null, 1, null, 1],
  closing: [0xffc9a0, 0x4a3d3a, 0.72, 0xff9a5c, 0.7],
  night: [0x9db8ff, 0x232a3a, 0.62, 0xa9c4ff, 0.44],
  rush: [0xe9dcff, 0x4b4660, 0.84, 0xffe2c4, 0.76],
  night2: [0x9db8ff, 0x232a3a, 0.62, 0xa9c4ff, 0.44],
  day2: [null, null, 1, null, 1],
  raid: [0xffc2b0, 0x3a2428, 0.68, 0xff7a66, 0.65],
  over: [0xffffff, 0x6a6a66, 0.9, 0xffffff, 0.75],
};

/** Стаите от gameStart (SPEC т. 13); липсват ли, една стая с размера на залата. */
export function roomsOf(start) {
  const hall = start.hall || {};
  const one = [{ id: 'a', x: 0, z: 0, w: +hall.w || 6, d: +hall.d || 6 }];
  if (!Array.isArray(start.rooms) || !start.rooms.length) return one;
  return start.rooms.map(r => ({ id: r.id, x: +r.x || 0, z: +r.z || 0, w: +r.w || one[0].w, d: +r.d || one[0].d }));
}

/** Четирите стени на стая: начало, посока по стената, дължина, нормала навътре и завъртане на нещо, което гледа навътре. */
export function wallsOf(r) {
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
  return [
    { room: r.id, ox: x0, oz: z0, dx: 1, dz: 0, len: r.w, nx: 0, nz: 1, ry: 0 },            // z = z0, гледа към +Z
    { room: r.id, ox: x0, oz: z1, dx: 1, dz: 0, len: r.w, nx: 0, nz: -1, ry: Math.PI },     // z = z1, гледа към −Z
    { room: r.id, ox: x0, oz: z0, dx: 0, dz: 1, len: r.d, nx: 1, nz: 0, ry: Math.PI / 2 },  // x = x0, гледа към +X
    { room: r.id, ox: x1, oz: z0, dx: 0, dz: 1, len: r.d, nx: -1, nz: 0, ry: -Math.PI / 2 },// x = x1, гледа към −X
  ];
}

/**
 * Къде виси мониторът, по нива: { levels: [{ monitor: { x, y, z, ry } }] }. y е горният край на стойката.
 * Горе: над външния ръб на тезгяха, между местата на клиентите, с горния екран към кухнята.
 * Долу: пред шахтата за пратките (или опаковачката), на 0.42 м от стената.
 */
export function hudLayout(start) {
  const st = start.stations || [], rooms = roomsOf(start);
  let n = Math.max(1, Math.min(4, start.levels | 0 || 1));
  for (const s of st) if (typeof s.level === 'number' && s.level > 0) n = Math.max(n, Math.min(4, (s.level | 0) + 1));
  const roomA = rooms.find(r => r.id === 'a') || rooms[0];
  const lvOf = s => (typeof s.level === 'number' ? s.level : 0);
  const inward = s => {                               // лицето на станцията: към средата на стаята ѝ
    const yaw = +s.yaw || 0;
    let nx = Math.sin(yaw), nz = Math.cos(yaw);
    if ((roomA.x - s.x) * nx + (roomA.z - s.z) * nz < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  };
  const levels = [];
  for (let lv = 0; lv < n; lv++) {
    let m = null;
    const counter = lv === 0 ? st.find(s => s.kind === 'counter') : null;
    if (counter) {
      const [nx, nz] = inward(counter), ax = nz, az = -nx, half = Math.max(0, (+counter.w || 2) / 2 - 0.45);
      let best = 0, bestD = -1;
      for (let u = -half; u <= half + 1e-6; u += 0.05) {          // покрай тезгяха: най-далеч от главите на клиентите
        let d = 0.6;
        for (const seat of start.seats || []) d = Math.min(d, Math.abs((seat.x - counter.x) * ax + (seat.z - counter.z) * az - u));
        d -= Math.abs(u) * 0.02;
        if (d > bestD + 1e-6) { bestD = d; best = u; }
      }
      const out = (+counter.d || 0.45) / 2 + 0.05;                  // малко зад външния ръб на ивицата на тезгяха: там е гредата над гишето
      m = { x: counter.x + ax * best - nx * out, y: HANG_Y, z: counter.z + az * best - nz * out, ry: Math.atan2(-nx, -nz) };
    } else {
      const here = st.filter(s => lvOf(s) === lv);
      const s = here.find(k => k.kind === 'hatch') || here.find(k => k.kind === 'packer') || here.find(k => k.kind === 'prep') || here[0];
      const top = lv > 0 ? LAB_HANG_Y : HANG_Y;
      // над самата станция и малко зад нея: долният екран е на височината на главата и не бива да виси над пътеката
      if (s) { const [nx, nz] = inward(s); m = { x: s.x - nx * 0.25, y: top, z: s.z - nz * 0.25, ry: Math.atan2(-nx, -nz) }; }
      else m = { x: roomA.x, y: top, z: roomA.z - roomA.d / 2 + 0.42, ry: Math.PI };
    }
    levels.push({ monitor: m });
  }
  return { levels, top: HANG_Y };
}

/** Лицата на екраните на модела: за всяка част *_Screen_N най-голямата равна страна (среда, надясно, нагоре, нормала, размер). */
function screenRects(THREE, model) {
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse(m => {
    if (!m.isMesh || !/_Screen_\d+$/i.test(m.name)) return;
    const p = m.geometry.attributes.position, idx = m.geometry.index, count = idx ? idx.count : p.count, groups = new Map();
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, ia).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(p, ib).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(p, ic).applyMatrix4(m.matrixWorld);
      e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const area = e1.length() / 2;
      if (area < 1e-9) continue;
      e1.normalize();
      const key = `${Math.round(e1.x * 10)},${Math.round(e1.y * 10)},${Math.round(e1.z * 10)}`;
      let G = groups.get(key);
      if (!G) groups.set(key, G = { area: 0, n: new THREE.Vector3(), pts: [] });
      G.area += area; G.n.addScaledVector(e1, area);
      G.pts.push(a.clone(), b.clone(), c.clone());
    }
    let face = null;
    for (const G of groups.values()) if (!face || G.area > face.area) face = G;
    if (!face) return;
    const n = face.n.normalize(), u = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), r = new THREE.Vector3().crossVectors(u, n);
    // лицето може да е на два слоя (картинката на екрана стои малко пред основата): взима се най-външният
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, d = -Infinity;
    for (const q of face.pts) { const pr = q.dot(r), pu = q.dot(u); r0 = Math.min(r0, pr); r1 = Math.max(r1, pr); u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); d = Math.max(d, q.dot(n)); }
    const mid = new THREE.Vector3().addScaledVector(r, (r0 + r1) / 2).addScaledVector(u, (u0 + u1) / 2).addScaledVector(n, d);
    out.push({ mid, r, u, n, w: r1 - r0 - BEZEL * 2, h: u1 - u0 - BEZEL * 2 });
  });
  return out;
}

function rectsGeo(THREE, rects) {
  const pos = [], uv = [], idx = [];
  rects.forEach((q, i) => {
    const o = q.mid.clone().addScaledVector(q.n, 0.003), hw = q.w / 2, hh = q.h / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(o.x + q.r.x * sx * hw + q.u.x * sy * hh, o.y + q.r.y * sx * hw + q.u.y * sy * hh, o.z + q.r.z * sx * hw + q.u.z * sy * hh);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * env: { group, hemi, dir }: групата на сцената и двете ѝ светлини (hud ги води: фаза и патрул).
 * Връща { onSnapshot(snap), update(dt, time), flash(), setLevel(lv), setRide(on), dispose() }.
 */
export function createHud(ctx, start, env) {
  const THREE = ctx.THREE;
  const theme = start.theme || ctx.theme || 'night';
  const lay = hudLayout(start);
  // Откъде идва патрулът: стената с ролетката (или с тезгяха). F е рамката ѝ: начало, посока навътре, половин ширина
  // и колко е дълбока стаята пред нея. Без такава станция: предната стена на стая a.
  const F = (() => {
    const A = roomsOf(start).find(r => r.id === 'a') || roomsOf(start)[0];
    const s = (start.stations || []).find(k => k.kind === 'shutter') || (start.stations || []).find(k => k.kind === 'counter');
    if (!s) return { x: A.x, z: A.z + A.d / 2, inx: 0, inz: -1, half: A.w / 2, depth: A.d };
    const yaw = +s.yaw || 0;
    let inx = Math.sin(yaw), inz = Math.cos(yaw);
    if ((A.x - s.x) * inx + (A.z - s.z) * inz < 0) { inx = -inx; inz = -inz; }          // навътре е към средата на стая a
    return { x: +s.x || 0, z: +s.z || 0, inx, inz, half: (+s.w || A.w) / 2, depth: Math.abs(inz) > 0.5 ? A.d : A.w };
  })();
  F.rot = Math.atan2(F.inx, F.inz);                 // местното +Z на ивицата сочи навътре, +X върви по стената
  F.lx = Math.cos(F.rot); F.lz = -Math.sin(F.rot);
  const group = new THREE.Group();
  group.name = 'backroom-hud';
  env.group.add(group);
  const trash = [];
  const keep = o => { trash.push(o); return o; };
  let gone = false;

  // ---------- мониторът ----------

  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g2 = cv.getContext('2d');
  const tex = keep(new THREE.CanvasTexture(cv));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const scrMat = keep(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const holders = lay.levels.map((l, i) => {
    const h = new THREE.Group();
    h.name = `backroom-hud:monitor${i}`;
    h.position.set(l.monitor.x, l.monitor.y, l.monitor.z);
    h.rotation.y = l.monitor.ry;
    h.visible = i === 0;
    group.add(h);
    return h;
  });
  (async () => {
    const A = ctx.assets;
    let proto = null, rects = [];
    try {
      if (A) { await A.loadPack(MONITOR[0]); await A.preload([MONITOR]); proto = A.getSync(MONITOR[0], MONITOR[1]); }
      if (proto) rects = screenRects(THREE, proto);
    } catch (e) { console.warn('[backroom] монитор', e?.message || e); }
    if (gone) return;
    if (!rects.length) {                              // без библиотеката (страниците за проби): прост тъмен екран на същото място
      proto = null;
      rects = [{ mid: new THREE.Vector3(0, -0.72, -0.2), r: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, -1), w: 0.7, h: 0.5 }];
    }
    const geo = keep(rectsGeo(THREE, rects));
    const boxGeo = proto ? null : keep(new THREE.BoxGeometry(0.8, 0.6, 0.05)), boxMat = proto ? null : keep(new THREE.MeshLambertMaterial({ color: 0x23272b }));
    holders.forEach((h, i) => {
      if (proto) h.add(i ? A.getSync(MONITOR[0], MONITOR[1]) : proto);
      else { const b = new THREE.Mesh(boxGeo, boxMat); b.position.set(0, -0.72, -0.17); h.add(b); }
      const m = new THREE.Mesh(geo, scrMat);
      m.renderOrder = 1;
      h.add(m);
    });
  })();

  // светлинната ивица на патрула: по челото на магазина и по пода пред тезгяха
  const beamGeo = keep(new THREE.BufferGeometry());
  {
    const xs = [-0.9, -0.25, 0.25, 0.9], cs = [0, 1, 1, 0], pos = [], col = [], idx = [];
    const strip = (y0, z0, y1, z1) => {
      const base = pos.length / 3;
      xs.forEach((x, i) => { pos.push(x, y0, z0, x, y1, z1); col.push(cs[i] * 0.25, cs[i] * 0.42, cs[i], cs[i] * 0.25, cs[i] * 0.42, cs[i]); });
      for (let i = 0; i < 3; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    };
    strip(0.86, 0.08, 2.1, 0.08);                                   // малко пред ролетката, която е до 5 см дебела
    strip(0.012, 0.52, 0.012, Math.max(0.9, Math.min(2.6, F.depth - 0.1)));   // по пода пред тезгяха
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    beamGeo.setIndex(idx);
  }
  const beamMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  beam.visible = false;
  beam.renderOrder = 4;
  const beamPivot = new THREE.Group();
  beamPivot.position.set(F.x, 0, F.z);
  beamPivot.rotation.y = F.rot;
  beamPivot.add(beam);
  group.add(beamPivot);

  // ---------- състояние ----------

  const S = {
    phase: '', left: 0, money: 0, hint: '', susp: 0,
    patrol: null, hidden: false, result: null,
    key: null, drawnAt: -10,
    p: 0, patrolT: 0, flash: 0, time: 0, level: 0, ride: 0, rideTo: 0,
  };
  // под земята няма ден и нощ: UV и лилави лампи, каквато и да е фазата горе
  const LAB_MOOD = [0xcfe4ff, 0x16202c, 0.8, 0xdfeeff, 0.55];      // мазето: студено бяло-синьо (преди беше лилавото на лабораторията)
  const mood = { sky: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(), hemi: 1, dir: 1, set: false };
  const tSky = new THREE.Color(), tGround = new THREE.Color(), tSun = new THREE.Color();
  const P_SKY = new THREE.Color(0x24368f), P_GROUND = new THREE.Color(0x05071a), P_SUN = new THREE.Color(0x86a8ff), RED = new THREE.Color(0xff3b30), COP_BLUE = new THREE.Color(0x2f6bff);
  // изходното състояние на светлините („ден"); връща се в dispose, защото може да са на основата
  const L0 = env.hemi && env.dir ? {
    sky: env.hemi.color.clone(), ground: env.hemi.groundColor.clone(), sun: env.dir.color.clone(),
    hemi: env.hemi.intensity, dir: env.dir.intensity, pos: env.dir.position.clone(), tgt: env.dir.target.position.clone(),
  } : null;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  let lightMoved = false;
  // точка от залата → в координатите на родителя на светлината (тя може да не е под ctx.root)
  const toParent = (v, o) => { env.group.localToWorld(v); return o.parent ? o.parent.worldToLocal(v) : v; };

  // ---------- екранът ----------

  const patrolWord = theme === 'kids' ? 'INSPECTOR' : 'POLICE';
  // the clock of the game: minutes of the day, shown in steps of ten minutes
  const dayText = min => { const m = Math.floor((((min % 1440) + 1440) % 1440) / 10) * 10; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  function fit(g, text, maxW, size, weight, family) {
    let s = size;
    g.font = `${weight} ${s}px ${family}`;
    while (s > 20 && g.measureText(text).width > maxW) { s -= 4; g.font = `${weight} ${s}px ${family}`; }
    return s;
  }
  function wrap(g, text, maxW, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (!cur || g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) lines.length = maxLines;
    return lines;
  }
  const clockText = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const moneyText = v => `${String(Math.round(v)).replace('-', '−')} $`;

  function draw(mode, sec, urgent) {
    const g = g2;
    g.fillStyle = mode === 'duck' ? '#a3231c' : mode === 'warn' ? '#9a6410' : mode === 'hidden' ? '#1c5f36' : C.screen;
    g.fillRect(0, 0, CW, CH);
    g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    if (S.result) {                                   // край на смяната: какво стана и колко пари
      const r = S.result, title = r.caught ? 'THEY CAUGHT YOU' : 'THE SHIFT IS OVER';
      g.fillStyle = r.caught ? C.bad : C.dim;
      fit(g, title, CW - 60, 54, 800, FONT);
      g.fillText(title, CW / 2, 92);
      g.fillStyle = C.text;
      const m = moneyText(r.money || 0);
      fit(g, m, CW - 60, 170, 800, FONT_NUM);
      g.fillText(m, CW / 2, 250);
      const stars = Math.max(0, Math.min(5, Math.round(r.stars || 0)));
      g.font = `700 44px ${FONT}`; g.fillStyle = C.dim;
      g.fillText(`${stars} of 5 stars`, CW / 2, 326);
    } else if (mode && mode !== 'safe') {             // патрул: една дума, времето остава отдолу
      const word = mode === 'warn' ? `${patrolWord} IN ${clockText(Math.max(0, Math.ceil(S.patrolLeft || 0)))}` : `${patrolWord} HERE`;
      g.fillStyle = C.text;
      fit(g, word, CW - 50, 150, 800, FONT_NUM);
      g.fillText(word, CW / 2, 215);
      g.font = `800 60px ${FONT_NUM}`;
      g.fillText(mode === 'warn' ? 'BOX TO THE CELLAR' : dayText(S.clock), CW / 2, 322);
    } else {
      g.fillStyle = urgent ? C.warn : C.text;
      g.font = `800 200px ${FONT_NUM}`;
      g.fillText(dayText(S.clock), CW / 2, 224);
      if (S.showHint) {                               // какво се прави: в обучението през цялото време, после при всяка нова подсказка
        g.font = `600 28px ${FONT}`; g.fillStyle = C.dim;
        wrap(g, S.hint, CW - 40, 3).forEach((l, i) => g.fillText(l, CW / 2, 284 + i * 34));
      } else {
        g.font = `800 76px ${FONT_NUM}`; g.fillStyle = S.money < 0 ? C.bad : C.dim;
        g.fillText(moneyText(S.money), CW / 2, 322);
      }
      if (S.susp > 0.04) { g.fillStyle = S.susp > 0.75 ? C.bad : C.warn; g.fillRect(0, CH - 12, CW * S.susp, 12); }   // подозрението: черта по долния ръб
    }
    tex.needsUpdate = true;
  }

  // шрифтът може да дойде след първото рисуване: тогава се чертае пак
  try {
    const fs = document.fonts;
    if (fs?.load) Promise.all([fs.load(`800 64px ${FONT}`, 'Ж1'), fs.load(`800 64px ${FONT_NUM}`, 'Ж1')]).then(() => { S.key = null; S.drawnAt = -10; }, () => {});
  } catch { /* без шрифт: системният */ }

  function onSnapshot(snap) {
    S.phase = snap.phase || '';
    S.left = +snap.left || 0;
    S.money = Math.round(+snap.money || 0);
    const hint = snap.hint || '';
    if (hint !== S.hint) { S.hint = hint; S.hintAt = S.time; }      // нова подсказка: показва се за малко и извън обучението
    S.susp = Math.max(0, Math.min(1, +snap.suspicion || 0));
    S.patrol = snap.patrol ? snap.patrol.phase : null;
    S.patrolLeft = snap.patrol ? +snap.patrol.left || 0 : 0;
    S.clock = typeof snap.clock === 'number' ? snap.clock : 0;
    S.hidden = false;
    if (snap.players) for (const p of snap.players) if (String(p.id) === String(ctx.me?.id)) { S.hidden = !!p.hidden; break; }
    S.result = snap.result || null;
  }

  function update(dt, time) {
    S.time = time;
    const over = !!S.result;
    // патрулът гледа само уличното ниво; долу екранът показва само времето
    const mode = over || !S.patrol ? '' : S.level > 0 ? 'safe' : S.patrol === 'on' ? (S.hidden ? 'hidden' : 'duck') : 'warn';
    const sec = Math.floor((S.clock || 0) / 10) * 100 + (S.patrol === 'warn' ? Math.ceil(S.patrolLeft || 0) : 0), urgent = false;
    S.showHint = !!S.hint && (S.phase === 'tutorial' || time - (S.hintAt || 0) < 16);
    const key = `${over ? 'r' : ''}|${mode}|${sec}|${urgent}|${S.money}|${S.showHint ? S.hint : ''}|${Math.round(S.susp * 40)}`;
    if (key !== S.key && time - S.drawnAt >= 0.2) { S.key = key; S.drawnAt = time; draw(mode, sec, urgent); }
    scrMat.color.setScalar(mode === 'duck' ? 0.8 + 0.2 * Math.sin(time * 9) : 1);

    // светлината: фазата води, патрулът я покрива
    if (!L0) return;
    const m = S.level > 0 && S.phase !== 'over' ? LAB_MOOD : MOODS[S.phase] || MOODS.day;
    if (m[0] == null) tSky.copy(L0.sky); else tSky.setHex(m[0]);
    if (m[1] == null) tGround.copy(L0.ground); else tGround.setHex(m[1]);
    if (m[3] == null) tSun.copy(L0.sun); else tSun.setHex(m[3]);
    const tHemi = L0.hemi * m[2], tDir = L0.dir * m[4];
    if (!mood.set) { mood.set = true; mood.sky.copy(tSky); mood.ground.copy(tGround); mood.sun.copy(tSun); mood.hemi = tHemi; mood.dir = tDir; }
    const k = 1 - Math.exp(-dt * 1.6);
    mood.sky.lerp(tSky, k); mood.ground.lerp(tGround, k); mood.sun.lerp(tSun, k);
    mood.hemi += (tHemi - mood.hemi) * k; mood.dir += (tDir - mood.dir) * k;

    const street = S.level === 0;
    const on = S.patrol === 'on' && !over && street;
    S.p += ((on ? 1 : 0) - S.p) * (1 - Math.exp(-dt * (on ? 7 : 3)));
    if (on) S.patrolT += dt; else if (S.p < 0.01) S.patrolT = 0;
    S.flash = Math.max(0, S.flash - dt * 1.8);

    let hemiI = mood.hemi, dirI = mood.dir;
    env.hemi.color.copy(mood.sky); env.hemi.groundColor.copy(mood.ground); env.dir.color.copy(mood.sun);
    if (S.phase === 'raid' && !over) env.hemi.color.lerp(RED, 0.12 + 0.12 * Math.sin(time * 3.2));
    S.ride += (S.rideTo - S.ride) * (1 - Math.exp(-dt * 8));
    if (S.ride > 0.01) {                  // в асансьора лампите потрепват, докато кабината пътува
      const f = 1 - 0.3 * S.ride * (0.5 + 0.5 * Math.sin(time * 33) * Math.sin(time * 11));
      hemiI *= f; dirI *= f;
    }
    if (S.patrol === 'warn' && !over && street) {   // примигване: плавно и неравномерно, без рязък строб
      const f = 0.7 + 0.3 * Math.sin(time * 21) * Math.sin(time * 6.7);
      hemiI *= f; dirI *= f;
    }
    const p = S.p, sweep = Math.sin(S.patrolT * 1.25 - 1.2) * (F.half + 0.7);
    if (p > 0.002) {
      env.hemi.color.lerp(P_SKY, p); env.hemi.groundColor.lerp(P_GROUND, p); env.dir.color.lerp(P_SUN, p);
      // the car's lights outside: the room breathes red, then blue (a soft pulse, never a hard strobe)
      const cop = Math.sin(time * 6.5);
      env.hemi.color.lerp(cop > 0 ? RED : COP_BLUE, 0.5 * p * Math.abs(cop));
      // насочената светлина е фарът: идва отпред и се усилва, докато ивицата минава през средата на залата
      const pass = Math.exp(-(sweep * sweep) / (F.half * F.half * 0.3));
      hemiI += (L0.hemi * 0.44 - hemiI) * p; dirI += (L0.dir * (0.2 + 0.9 * pass) - dirI) * p;
      env.dir.position.copy(L0.pos).lerp(toParent(_a.set(F.x - F.inx * 2.2 + F.lx * sweep, 1.7, F.z - F.inz * 2.2 + F.lz * sweep), env.dir), p);
      env.dir.target.position.copy(L0.tgt).lerp(toParent(_b.set(F.x + F.inx * F.depth * 0.5 + F.lx * sweep * 0.5, 0.9, F.z + F.inz * F.depth * 0.5 + F.lz * sweep * 0.5), env.dir.target), p);
      lightMoved = true;
    } else if (lightMoved) { lightMoved = false; env.dir.position.copy(L0.pos); env.dir.target.position.copy(L0.tgt); }
    if (S.flash > 0) { env.hemi.color.lerp(RED, S.flash * 0.7); hemiI += S.flash * L0.hemi * 0.3; }
    env.hemi.intensity = hemiI; env.dir.intensity = dirI;
    beam.visible = p > 0.03;
    if (beam.visible) { beam.position.x = sweep; beamMat.color.setScalar(p); }
  }

  return {
    group,
    onSnapshot,
    update,
    /** кратко червено светване (хванаха ме) */
    flash() { S.flash = 1; },
    /** на кое ниво е местният играч: показва монитора на това ниво и сменя светлината */
    setLevel(lv) {
      const i = Math.max(0, Math.min(lay.levels.length - 1, lv | 0));
      S.level = i;
      // a floor that has the big wall screen (store and clock) does not need the hanging monitor in front of it
      const tv = lvN => lvN > 0 && (start.stations || []).some(q => q.kind === 'screen' && (q.level | 0) === lvN);
      holders.forEach((h, k) => { h.visible = k === i && !tv(k); });
      S.key = null;
    },
    /** возя ли се в асансьора в момента */
    setRide(on) { S.rideTo = on ? 1 : 0; },
    dispose() {
      gone = true;
      if (L0) {
        env.hemi.color.copy(L0.sky); env.hemi.groundColor.copy(L0.ground); env.hemi.intensity = L0.hemi;
        env.dir.color.copy(L0.sun); env.dir.intensity = L0.dir; env.dir.position.copy(L0.pos); env.dir.target.position.copy(L0.tgt);
      }
      env.group.remove(group);
      for (const o of trash) o.dispose?.();
      trash.length = 0;
    },
  };
}

// Нещата в зоната: масата с оръжията за взимане, телевизорът, на чийто екран са вълната, точките и времето
// (никакви табели във въздуха), и тънката линия по ръба на зоната върху асфалта.
//
// start.stand = { x, z, ry }: средата на двойката маса + сандък с телевизор; +Z на стойката гледа към зоната.

const TABLE = { slug: 'apocalypse-pack', model: 'SM_Prop_Table_01' };
const CRATE = { slug: 'apocalypse-pack', model: 'SM_Prop_Crate_01' };
const SCREEN = { slug: 'military-pack', model: 'SM_Prop_Electronics_Tv_01', face: { center: [0, 0.267, -0.253], normal: [0, 0, -1], w: 0.456, h: 0.388 } };
const ORDER = ['smg', 'rifle', 'shotgun'];
const MELEE = ['axe', 'chainsaw'];
const NAMES = { smg: 'SMG', shotgun: 'SHOTGUN', rifle: 'RIFLE', pistol: 'PISTOL', axe: 'AXE', chainsaw: 'CHAINSAW' };
const FONT = '"Sofia Sans", "Segoe UI", sans-serif', FONT_NUM = '"Sofia Sans XC", "Sofia Sans", "Segoe UI", sans-serif';

export async function createHud(ctx, start, A, weapons) {
  const { THREE, root } = ctx;
  const group = new THREE.Group();
  group.name = 'hud';
  root.add(group);
  const st = start.stand || { x: 0, z: -1.5, ry: 0 };
  const stand = new THREE.Group();
  stand.position.set(st.x, 0, st.z);
  stand.rotation.y = st.ry || 0;
  group.add(stand);

  const pick = (key, fb) => { const a = A?.props?.[key]; return a && a.slug && a.model ? a : fb; };
  const get = async d => { try { await ctx.assets.loadPack(d.slug); return await ctx.assets.get(d.slug, d.model); } catch (e) { console.warn('[motel] prop', d.model, e.message); return null; } };
  const tableDef = pick('table', TABLE), crateDef = pick('crate', CRATE), screenDef = pick('screen', SCREEN);
  const [table, crate, tv] = ctx.assets ? await Promise.all([null, get(crateDef), get(screenDef)]) : [null, null, null];

  // на мястото на масата (вдясно от средата) стои сандъкът с оръжията: виж chest.js
  const TX = 0.44, CX = -0.62;
  let top = 0.73, half = 0.6;
  if (table) {
    table.position.set(TX, 0, 0);
    stand.add(table);
    const info = ctx.assets.info(tableDef.slug, tableDef.model);
    if (info) { top = info.max[1]; half = Math.min(info.size[0], info.size[2]) / 2; }
  }
  const slots = [];
  // сандъкът с телевизора: вляво
  let crateTop = 0.82;
  if (crate) {
    crate.position.set(CX, 0, -0.12);
    crate.rotation.y = 0.12;
    stand.add(crate);
    const info = ctx.assets.info(crateDef.slug, crateDef.model);
    if (info) crateTop = info.max[1];
  }
  const face = screenDef.face || SCREEN.face;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.round(512 * face.h / face.w);
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
  const tvHolder = new THREE.Group();
  tvHolder.position.set(CX, crate ? crateTop : 0.95, -0.12);
  // екранът на модела гледа по face.normal; завъртаме го към зоната (+Z на стойката) и леко към средата
  const n = face.normal || [0, 0, -1];
  tvHolder.rotation.y = Math.atan2(n[0], n[2]) * -1 + 0.22;
  if (tv) tvHolder.add(tv);
  else { const box = new THREE.Mesh(new THREE.BoxGeometry(0.67, 0.58, 0.5), new THREE.MeshLambertMaterial({ color: 0x23262a })); box.position.y = 0.29; tvHolder.add(box); }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(face.w * 0.96, face.h * 0.96), screenMat);
  plane.position.set(face.center[0] + n[0] * 0.006, face.center[1] + n[1] * 0.006, face.center[2] + n[2] * 0.006);
  plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]).normalize());
  // Върху телевизора не рисуваме нищо: никакви наши екрани и надписи в играта. Той е само предмет до масата.
  plane.visible = false;
  stand.add(tvHolder);
  // слабо сияние от екрана върху масата и играчите наблизо
  // слабо сияние от екрана: само на компютър (на каската всяка точкова светлина тежи на целия свят)
  if (false) {
    const glow = new THREE.PointLight(0x9fd8ff, 0.9, 3.2, 1.8);
    glow.position.set(CX, crateTop + 0.4, 0.5);
    stand.add(glow);
  }

  // ── линията на зоната: тънки ивици по външния ръб на стаите ──
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xc9b25a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const rects = (start.rooms || []).map(r => ({ x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 }));
  // точка във вътрешността на друга стая или в отвора на врата между две стаи: там линия няма
  const doors = Array.isArray(start.doors) ? start.doors : [];
  const inDoor = (x, z) => doors.some(d => (d.axis === 'z' ? Math.abs(x - d.x) < 0.08 && Math.abs(z - d.z) < d.w / 2 : Math.abs(z - d.z) < 0.08 && Math.abs(x - d.x) < d.w / 2));
  const inside = (x, z, skip) => inDoor(x, z) || rects.some((r, i) => i !== skip && x > r.x0 + 0.01 && x < r.x1 - 0.01 && z > r.z0 + 0.01 && z < r.z1 - 0.01);
  const strips = [];
  rects.forEach((r, ri) => {
    const sides = [[r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.round(len / 0.1));
      let from = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const free = i < steps && !inside(ax + (bx - ax) * (t + 0.5 / steps), az + (bz - az) * (t + 0.5 / steps), ri);
        if (free && from === null) from = t;
        if ((!free || i === steps) && from !== null) { strips.push([ax + (bx - ax) * from, az + (bz - az) * from, x, z]); from = null; }
      }
    }
  });
  for (const [ax, az, bx, bz] of strips) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.035), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(bz - az, bx - ax);
    m.position.set((ax + bx) / 2, 0.012, (az + bz) / 2);
    m.renderOrder = 1;
    group.add(m);
  }

  // ── екранът ──
  let sig = '';
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const spaced = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function draw(s, me) {
    const W = canvas.width, H = canvas.height;
    const phase = s.phase, r = s.result;
    const key = r ? `r|${r.score}|${r.stars}|${r.won}` : `${phase}|${s.wave}|${Math.ceil(s.left)}|${Math.floor(s.left / 6) % 2}|${s.score}|${Math.ceil(s.next || 0)}|${s.boss == null ? '' : Math.round(s.boss * 50)}|${s.combo}|${me ? `${me.hp}|${me.down > 0 ? 1 : 0}` : ''}|${JSON.stringify(s.stock)}|${(s.gates || []).map(g => g[0]).join('')}|${s.dark ? 1 : 0}`;
    if (key === sig) return;
    sig = key;
    g2.fillStyle = '#07100c'; g2.fillRect(0, 0, W, H);
    // редове на стар кинескоп
    g2.fillStyle = 'rgba(120, 255, 170, 0.035)';
    for (let y = 0; y < H; y += 6) g2.fillRect(0, y, W, 2);
    const green = '#8dffb0', amber = '#ffc23c', red = '#ff5a3c', dim = '#3f7a55';
    g2.textBaseline = 'alphabetic';
    if (r) {
      g2.fillStyle = r.won ? green : red; g2.textAlign = 'center';
      g2.font = `800 58px ${FONT}`;
      g2.fillText(r.won ? 'THE MOTEL IS CLEAR' : r.reason === 'time' ? 'TIME IS UP' : 'THE MOTEL FELL', W / 2, 78, W - 30);
      g2.fillStyle = green; g2.font = `800 120px ${FONT_NUM}`;
      g2.fillText(spaced(r.score), W / 2, 205, W - 30);
      g2.fillStyle = dim; g2.font = `700 34px ${FONT}`;
      g2.fillText('SCORE', W / 2, 245);
      g2.fillStyle = green; g2.font = `700 38px ${FONT}`;
      g2.fillText(`Wave ${r.wave}   Kills ${r.kills}`, W / 2, 310, W - 30);
      g2.fillText(`Headshots ${r.headshots}   Accuracy ${Math.round(r.accuracy * 100)}%`, W / 2, 358, W - 30);
      g2.fillStyle = amber; g2.font = `800 44px ${FONT_NUM}`;
      g2.fillText(`${r.stars} of 5`, W / 2, H - 24);
      tex.needsUpdate = true;
      return;
    }
    // горе: вълната и времето
    g2.textAlign = 'left'; g2.fillStyle = dim; g2.font = `700 30px ${FONT}`;
    g2.fillText(phase === 'boss' ? 'BOSS' : 'WAVE', 26, 44);
    g2.textAlign = 'right';
    g2.fillText('TIME', W - 26, 44);
    g2.fillStyle = phase === 'boss' ? red : green; g2.textAlign = 'left'; g2.font = `800 104px ${FONT_NUM}`;
    g2.fillText(String(Math.max(1, s.wave || 1)), 24, 138);
    g2.fillStyle = s.left < 60 ? amber : green; g2.textAlign = 'right'; g2.font = `800 84px ${FONT_NUM}`;
    g2.fillText(mmss(s.left), W - 24, 130);
    // средата: точки
    g2.textAlign = 'center'; g2.fillStyle = green; g2.font = `800 96px ${FONT_NUM}`;
    g2.fillText(spaced(s.score), W / 2, 250, W - 40);
    g2.fillStyle = dim; g2.font = `700 28px ${FONT}`;
    g2.fillText(s.combo > 1 ? `SCORE   COMBO ${s.combo}` : 'SCORE', W / 2, 286);
    // долу: какво следва
    let line = '', tone = green;
    const gates = s.gates || [], open = gates.some(g => g[0] <= 0), weak = gates.some(g => g[0] < 3);
    if (phase === 'intro') { line = Math.ceil(s.next) % 8 >= 4 ? 'Stand by a gate: the hammer nails by itself' : `Grab a weapon. They come in ${Math.ceil(s.next)}`; tone = amber; }
    else if (phase === 'break') { const fixIt = gates.some(g => g[0] < 6) && Math.ceil(s.next) % 4 >= 2; line = fixIt ? 'Nail the gates while it is quiet' : `Next wave in ${Math.ceil(s.next)}`; if (fixIt) tone = amber; }
    else if (phase === 'boss' && s.boss != null) line = '';
    else if (me && me.down > 0) { line = `You are down. Back in ${Math.ceil(me.down)}`; tone = red; }
    else if (open) { line = 'A GATE IS BROKEN: stand by it'; tone = red; }
    else if (weak && phase === 'wave') { line = 'The gates are falling: nail them'; tone = amber; }
    else if (s.dark) { line = 'Power is out. Only the flashlights work'; tone = amber; }
    else {
      const ready = ORDER.filter(k => s.stock?.[k] > 0).map(k => NAMES[k]);
      // подсказките се редуват: как се презарежда и къде се цели
      line = ready.length ? `On the table: ${ready.join(', ')}` : (s.wave <= 2 && Math.floor(s.left / 6) % 2 === 0 ? 'Barrel down to reload' : 'Aim for the head');
      tone = ready.length ? amber : dim;
    }
    if (phase === 'boss' && s.boss != null) {
      g2.fillStyle = '#2a0d0a'; g2.fillRect(30, H - 86, W - 60, 40);
      g2.fillStyle = red; g2.fillRect(30, H - 86, (W - 60) * Math.max(0, Math.min(1, s.boss)), 40);
    } else {
      g2.fillStyle = tone; g2.font = `700 34px ${FONT}`;
      g2.fillText(line, W / 2, H - 52, W - 36);
    }
    if (me) {      // кръвта на играча, който гледа: тънка лента най-долу
      g2.fillStyle = '#12301f'; g2.fillRect(30, H - 26, W - 60, 10);
      g2.fillStyle = me.hp < 40 ? red : green; g2.fillRect(30, H - 26, (W - 60) * Math.max(0, me.hp) / 100, 10);
    }
    tex.needsUpdate = true;
  }

  // ── WAVE 1, WAVE 2 …: едър надпис пред играча с висок сбит шрифт (Sofia Sans Extra Condensed), без табло зад него ──
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 1024; tCanvas.height = 320;
  const tCtx = tCanvas.getContext('2d');
  const tTex = new THREE.CanvasTexture(tCanvas);
  tTex.colorSpace = THREE.SRGBColorSpace; tTex.anisotropy = 4;
  const tMat = new THREE.MeshBasicMaterial({ map: tTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const tMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0 * 320 / 1024), tMat);
  tMesh.visible = false; tMesh.renderOrder = 60; tMesh.frustumCulled = false;      // над тъмното було на паднал играч (49, 50)
  group.add(tMesh);
  let tAt = -99, tFor = 3;
  try { document.fonts?.load('900 200px "Sofia Sans XC"'); } catch { /* ще се нарисува с каквото има */ }
  const tV = new THREE.Vector3(), tD = new THREE.Vector3();
  /** Показва надпис (и по-малък ред под него) за seconds секунди на три метра пред очите. */
  function title(text, sub = '', seconds = 3) {
    const W = tCanvas.width, H = tCanvas.height;
    bMesh.visible = false;
    tCtx.clearRect(0, 0, W, H);
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'alphabetic'; tCtx.lineJoin = 'round';
    try { tCtx.letterSpacing = '14px'; } catch { /* стар браузър: без разредка */ }
    tCtx.font = '900 220px "Sofia Sans XC", "Sofia Sans", "Arial Narrow", sans-serif';
    tCtx.lineWidth = 10; tCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    tCtx.strokeText(String(text).toUpperCase(), W / 2 + 7, sub ? 196 : 228, W - 40);
    tCtx.fillStyle = '#f4efe6';
    tCtx.fillText(String(text).toUpperCase(), W / 2 + 7, sub ? 196 : 228, W - 40);
    if (sub) {
      try { tCtx.letterSpacing = '10px'; } catch { /* без разредка */ }
      tCtx.font = '700 64px "Sofia Sans XC", "Sofia Sans", "Arial Narrow", sans-serif';
      tCtx.lineWidth = 6; tCtx.strokeText(String(sub).toUpperCase(), W / 2 + 5, 290, W - 40);
      tCtx.fillStyle = '#d8442e';
      tCtx.fillText(String(sub).toUpperCase(), W / 2 + 5, 290, W - 40);
    }
    tTex.needsUpdate = true;
    // пред очите, на височината на погледа, обърнат към играча; стои на място, докато се стопи
    tD.set(0, 0, -1).applyQuaternion(ctx.head.quat); tD.y = 0;
    if (tD.lengthSq() < 1e-4) tD.set(0, 0, -1);
    tD.normalize();
    tMesh.position.copy(ctx.head.pos).addScaledVector(tD, 3.2);
    tMesh.position.y = Math.max(1.2, ctx.head.pos.y + 0.18);
    tMesh.lookAt(tV.set(ctx.head.pos.x, tMesh.position.y, ctx.head.pos.z));
    tAt = clock; tFor = seconds; tMesh.visible = true;
  }

  // ── резултатът по играчи: редове едър текст под надписа, без табло зад тях ──
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 1024; bCanvas.height = 448;
  const bCtx = bCanvas.getContext('2d');
  const bTex = new THREE.CanvasTexture(bCanvas);
  bTex.colorSpace = THREE.SRGBColorSpace; bTex.anisotropy = 4;
  const bMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const bMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0 * 448 / 1024), bMat);
  bMesh.position.y = -(3.0 * 320 / 1024) / 2 - (3.0 * 448 / 1024) / 2 + 0.05;
  bMesh.visible = false; bMesh.renderOrder = 60; bMesh.frustumCulled = false;
  tMesh.add(bMesh);
  /** Под надписа: head е малкият червен ред, rows са до шест реда [име, точки, убити, точност]. Вика се веднага след title(). */
  function board(head, rows) {
    const W = bCanvas.width, F = '"Sofia Sans XC", "Sofia Sans", "Arial Narrow", sans-serif';
    bCtx.clearRect(0, 0, W, bCanvas.height);
    bCtx.textBaseline = 'alphabetic'; bCtx.lineJoin = 'round';
    try { bCtx.letterSpacing = '6px'; } catch { /* без разредка */ }
    const put = (txt, x, y, align, font, fill) => { bCtx.font = font; bCtx.textAlign = align; bCtx.lineWidth = 6; bCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)'; bCtx.strokeText(txt, x, y, W - 40); bCtx.fillStyle = fill; bCtx.fillText(txt, x, y, W - 40); };
    put(String(head).toUpperCase(), W / 2 + 4, 56, 'center', `700 50px ${F}`, '#d8442e');
    (rows || []).slice(0, 6).forEach((r, i) => {
      const y = 134 + i * 62;
      put(String(r[0]).toUpperCase().slice(0, 14), 150, y, 'left', `900 60px ${F}`, '#f4efe6');
      put(String(r[1]), 610, y, 'right', `900 60px ${F}`, '#f4efe6');
      put(String(r[2]).toUpperCase(), 800, y, 'right', `700 46px ${F}`, '#bdb7ab');
      put(String(r[3]).toUpperCase(), 950, y, 'right', `700 46px ${F}`, '#bdb7ab');
    });
    bTex.needsUpdate = true; bMesh.visible = true;
  }

  // ── краят: един голям надпис, който се чете и на снимка: заглавие, точки, докъде е стигнала групата, ред на играч ──
  const rCanvas = document.createElement('canvas');
  rCanvas.width = 2048; rCanvas.height = 1280;
  const rCtx = rCanvas.getContext('2d');
  const rTex = new THREE.CanvasTexture(rCanvas);
  rTex.colorSpace = THREE.SRGBColorSpace; rTex.anisotropy = 8;
  const rMat = new THREE.MeshBasicMaterial({ map: rTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const rMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.0 * 1280 / 2048), rMat);
  rMesh.visible = false; rMesh.renderOrder = 61; rMesh.frustumCulled = false;
  group.add(rMesh);
  let rAt = -99;
  /** Краят на играта. o = { title, score, line, rows: [[име, точки, убити, точност], …] }; стои, докато играта се затвори. */
  function result(o) {
    const W = rCanvas.width, F = '"Sofia Sans XC", "Sofia Sans", "Arial Narrow", sans-serif';
    rCtx.clearRect(0, 0, W, rCanvas.height);
    rCtx.textBaseline = 'alphabetic'; rCtx.lineJoin = 'round';
    const put = (txt, x, y, align, font, fill, lw, max) => { rCtx.font = font; rCtx.textAlign = align; rCtx.lineWidth = lw; rCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)'; rCtx.strokeText(txt, x, y, max); rCtx.fillStyle = fill; rCtx.fillText(txt, x, y, max); };
    try { rCtx.letterSpacing = '16px'; } catch { /* без разредка */ }
    put(String(o.title).toUpperCase(), W / 2 + 8, 300, 'center', `900 300px ${F}`, '#f6f1e7', 20, W - 120);
    try { rCtx.letterSpacing = '10px'; } catch { /* без разредка */ }
    put(`SCORE ${o.score}`, W / 2 + 5, 500, 'center', `900 180px ${F}`, '#ffd257', 16, W - 200);
    put(String(o.line || '').toUpperCase(), W / 2 + 5, 626, 'center', `700 92px ${F}`, '#f6f1e7', 12, W - 200);
    const rows = (o.rows || []).slice(0, 6), top = 810, step = Math.min(160, Math.floor((1250 - top) / Math.max(1, rows.length - 1 || 1))), big = Math.min(136, Math.floor(step * 0.86)), small = Math.round(big * 0.74);
    try { rCtx.letterSpacing = '6px'; } catch { /* без разредка */ }
    rows.forEach((r, i) => {
      const y = top + i * step;
      put(String(r[0]).toUpperCase(), 230, y, 'left', `900 ${big}px ${F}`, '#f6f1e7', 14, 600);
      put(String(r[1]), 1190, y, 'right', `900 ${big}px ${F}`, '#ffd257', 14, 340);
      put(String(r[2]).toUpperCase(), 1570, y, 'right', `700 ${small}px ${F}`, '#f6f1e7', 11, 360);
      put(String(r[3]).toUpperCase(), 1830, y, 'right', `700 ${small}px ${F}`, '#f6f1e7', 11, 240);
    });
    rTex.needsUpdate = true;
    tMesh.visible = false;
    tD.set(0, 0, -1).applyQuaternion(ctx.head.quat); tD.y = 0;
    if (tD.lengthSq() < 1e-4) tD.set(0, 0, -1);
    tD.normalize();
    rMesh.position.copy(ctx.head.pos).addScaledVector(tD, 3.0);
    rMesh.position.y = Math.max(1.3, ctx.head.pos.y + 0.02);
    rMesh.lookAt(tV.set(ctx.head.pos.x, rMesh.position.y, ctx.head.pos.z));
    rAt = clock; rMesh.visible = true;
  }

  let clock = 0;
  function onSnapshot(s) {
    for (const sl of slots) sl.on = s.stock?.[sl.k] > 0;
  }
  function update(dt) {
    clock += dt;
    if (tMesh.visible) {
      const q = clock - tAt, k = q < 0.3 ? q / 0.3 : q > tFor - 0.7 ? Math.max(0, (tFor - q) / 0.7) : 1;
      tMat.opacity = k; bMat.opacity = k;
      tMesh.scale.setScalar(1.06 - 0.06 * Math.min(1, q / 0.5));
      if (q >= tFor) tMesh.visible = false;
    }
    if (rMesh.visible) { const q = clock - rAt; rMat.opacity = Math.min(1, q / 0.45); rMesh.scale.setScalar(1.05 - 0.05 * Math.min(1, q / 0.6)); }
    stand.updateWorldMatrix(true, false);
    for (const sl of slots) {
      sl.holder.visible = sl.on;
      // наличното оръжие леко се повдига и потрепва, за да се вижда, че е за взимане
      sl.holder.position.y = sl.base.y + (sl.on ? 0.012 + Math.sin((clock + sl.t) * 2.4) * 0.012 : 0);
      sl.pos.copy(sl.holder.position); sl.pos.z += 0.04;
      sl.pos.applyMatrix4(stand.matrixWorld);
      root.worldToLocal(sl.pos);
    }
  }

  function dispose() {
    root.remove(group);
    tex.dispose(); screenMat.dispose(); lineMat.dispose(); tTex.dispose(); tMat.dispose(); tMesh.geometry.dispose(); bTex.dispose(); bMat.dispose(); bMesh.geometry.dispose(); rTex.dispose(); rMat.dispose(); rMesh.geometry.dispose();
  }
  return { onSnapshot, update, dispose, title, board, result, slots, stand, info: () => ({ table: !!table, crate: !!crate, tv: !!tv, strips: strips.length, slots: slots.map(s => [s.k, s.on, +s.pos.x.toFixed(2), +s.pos.y.toFixed(2), +s.pos.z.toFixed(2)]) }) };
}

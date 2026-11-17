// Арена: страницата, която каската отваря в браузъра си.
// Прави четири неща: влиза във VR, говори с пулта (същия протокол като старата игра),
// подравнява залата по четирите ъгъла и показва другите играчи. Самата игра се зарежда
// отделно (games/<игра>/scene.js) и получава готов ctx (вж. docs/SPEC.md, т. 10).

import * as THREE from './vendor/three.module.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- самоличност ----------

function store(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch { /* частен режим */ }
  return value;
}
const me = {
  id: qs.get('id') || store('arena.id') || 'Q' + Math.random().toString(36).slice(2, 8).toUpperCase(),
  name: qs.get('name') || store('arena.name') || 'Headset',
  n: 0,
  team: 0,
};
store('arena.id', me.id);
if (qs.get('name')) store('arena.name', me.name);

const COL = {
  bg: 0x131411, floor: 0x1b1c18, line: 0x4a4c44, lineSoft: 0x2c2e28, text: '#eef0e8', dim: '#a5a89c',
  signal: 0xc8f03c, warn: 0xf2b84a, bad: 0xf06a45, red: 0xee4f6b, blue: 0x5aa6f2, neutral: 0xb9bcb0, ink: 0x15170f,
};
const teamColor = t => (t === 1 ? COL.red : t === 2 ? COL.blue : COL.neutral);
const FONT = '"Sofia Sans", "Segoe UI", sans-serif';
const FONT_NUM = '"Sofia Sans XC", "Sofia Sans", sans-serif';

// ---------- сцена ----------

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
// Quest 2 има малко памет: всяка текстура над 512 px се смалява при зареждане (около четири пъти по-малко видеопамет).
// Атласите на Synty са цветни полета, така че разлика на око няма. За проба на компютър: ?lowmem=1
if (/Quest 2/.test(navigator.userAgent) || new URLSearchParams(location.search).get('lowmem') === '1') {
  const load = THREE.TextureLoader.prototype.load, MAX = 512;
  THREE.TextureLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    return load.call(this, url, tex => {
      const img = tex.image;
      if (img && Math.max(img.width, img.height) > MAX) {
        const k = MAX / Math.max(img.width, img.height), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        tex.image = c; tex.needsUpdate = true;
      }
      if (onLoad) onLoad(tex);
    }, onProgress, onError);
  };
}
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(COL.bg, 1);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 400);      // 400 м: небето и силуетът на града от готовата карта са далеч
camera.position.set(0, 1.65, 0);
scene.add(camera);
// светлината на лобито; играта носи своя и тогава тази се гаси
const hemi = new THREE.HemisphereLight(0xf2f4ea, 0x3a3c34, 1.15);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(2, 5, 3);
scene.add(hemi, sun);

// светлината на играта: едно „слънце" със сянка и мек общ фон. Сянката се рисува рядко
// (сцената е почти неподвижна), затова почти не тежи на каската.
const gameLights = new THREE.Group();
const gHemi = new THREE.HemisphereLight(0xcfd8ff, 0x3b342c, 0.75);
const gSun = new THREE.DirectionalLight(0xfff0d8, 1.9);
gSun.position.set(5, 10, 7);
gSun.castShadow = true;
gSun.shadow.mapSize.set(2048, 2048);
gSun.shadow.camera.left = -13; gSun.shadow.camera.right = 13; gSun.shadow.camera.top = 13; gSun.shadow.camera.bottom = -13;
gSun.shadow.camera.near = 1; gSun.shadow.camera.far = 40;
gSun.shadow.bias = -0.0008; gSun.shadow.normalBias = 0.04;
gameLights.add(gHemi, gSun, gSun.target);
gameLights.visible = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
let shadowDue = 0;
function refreshShadows() { renderer.shadowMap.needsUpdate = true; }

// Залата: всичко, което е в нейните координати, е дете на arena. Калибровката мести тази група.
const arena = new THREE.Group();
scene.add(arena);
const hallGroup = new THREE.Group();     // очертание на залата (в лобито)
const avatarGroup = new THREE.Group();   // другите играчи
const gameRoot = new THREE.Group();      // играта се строи тук
const showRoot = new THREE.Group();      // стаята за оглед в лобито
arena.add(hallGroup, avatarGroup, gameRoot, showRoot, gameLights);

// тъмен фон за играта, когато сесията е с камерите на каската (иначе реалната стая прозира)
const backdrop = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 10), new THREE.MeshBasicMaterial({ color: COL.bg, side: THREE.BackSide, depthWrite: false }));
backdrop.visible = false;
backdrop.renderOrder = -10;
scene.add(backdrop);
// Преходът между лобито и играта: кълбо около главата, което плавно потъмнява и после се разсейва. Времето му върви по
// часовник, не по кадри, за да не увисне зареждането, ако страницата не рисува.
const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
fadeMesh.visible = false; fadeMesh.renderOrder = 15; fadeMesh.frustumCulled = false;
scene.add(fadeMesh);
const fadeS = { now: 0, from: 0, to: 0, t0: 0, ms: 1 };
// Зареждането: корицата на играта изплува пред очите върху тъмното, под нея са името и чертата за напредъка.
const coverMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 * 9 / 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
coverMesh.visible = false; coverMesh.renderOrder = 17; coverMesh.frustumCulled = false;
scene.add(coverMesh);
const coverS = { to: 0, now: 0, url: '', placed: false };
let panelDrop = 0;      // колко по-ниско стои таблото с текста, докато корицата е над него
function showCover(url) {
  coverS.to = url ? 1 : 0;
  if (!url) return;
  coverS.placed = false;
  if (url === coverS.url) return;
  coverS.url = url;
  try {
    new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; const old = coverMesh.material.map; coverMesh.material.map = t; coverMesh.material.needsUpdate = true; old?.dispose(); }, undefined, () => { coverS.url = ''; });
  } catch { coverS.url = ''; }
}
const _cd = new THREE.Vector3(), _cp = new THREE.Vector3();
function coverStep(camNow, dt) {
  coverS.now += (coverS.to - coverS.now) * Math.min(1, (dt || 0.016) * 3.5);
  const on = coverS.now > 0.01 && !!coverMesh.material.map;
  if (on && !coverS.placed) {
    camNow.getWorldPosition(_cp); camNow.getWorldDirection(_cd); _cd.y = 0;
    if (_cd.lengthSq() < 1e-4) _cd.set(0, 0, -1);
    _cd.normalize();
    coverMesh.position.copy(_cp).addScaledVector(_cd, 3.1); coverMesh.position.y = _cp.y + 0.3;
    coverMesh.lookAt(_cp.x, coverMesh.position.y, _cp.z);
    coverS.placed = true;
  }
  coverMesh.visible = on;
  if (on) { coverMesh.material.opacity = coverS.now * 0.95; coverMesh.scale.setScalar(1.04 - 0.04 * coverS.now); }
}
function fade(to, ms) { fadeS.from = fadeS.now; fadeS.to = to; fadeS.t0 = performance.now(); fadeS.ms = Math.max(1, ms); return new Promise(r => setTimeout(r, ms)); }
function fadeStep(camNow) {
  const k = Math.min(1, (performance.now() - fadeS.t0) / fadeS.ms), e = k * k * (3 - 2 * k);
  fadeS.now = fadeS.from + (fadeS.to - fadeS.from) * e;
  fadeMesh.visible = fadeS.now > 0.004;
  if (fadeMesh.visible) { fadeMesh.material.opacity = fadeS.now; camNow.getWorldPosition(fadeMesh.position); }
}

// ---------- текст върху платно ----------

function makeLabel(w, h, pxPerM = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * pxPerM); canvas.height = Math.round(h * pxPerM);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  return { mesh, canvas, ctx: canvas.getContext('2d'), tex, sig: '' };
}

// ---------- залата в лобито ----------

let hall = { w: 6, d: 6 };
let calib = null;        // { version, origin: {x, z}, yawDeg, width, depth }
let hallBuilt = '';
function buildHall() {
  const sig = `${hall.w}x${hall.d}:${!!calib}`;
  if (sig === hallBuilt) return;
  hallBuilt = sig;
  for (const c of [...hallGroup.children]) { hallGroup.remove(c); c.geometry?.dispose(); c.material?.map?.dispose(); c.material?.dispose(); }
  if (!calib) return;
  const hw = hall.w / 2, hd = hall.d / 2, pts = [];
  for (let x = Math.ceil(-hw + 0.001); x < hw; x++) pts.push(x, 0.005, -hd, x, 0.005, hd);
  for (let z = Math.ceil(-hd + 0.001); z < hd; z++) pts.push(-hw, 0.005, z, hw, 0.005, z);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: COL.line }));
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0.01, -hd, hw, 0.01, -hd, hw, 0.01, hd, -hw, 0.01, hd], 3)), new THREE.LineBasicMaterial({ color: COL.signal }));
  hallGroup.add(grid, edge);
  [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([x, z], i) => {
    const l = makeLabel(0.3, 0.3, 256);
    l.ctx.fillStyle = '#c8f03c'; l.ctx.font = `800 64px ${FONT_NUM}`; l.ctx.textAlign = 'center'; l.ctx.textBaseline = 'middle';
    l.ctx.fillText(String(i + 1), 38, 40);
    l.tex.needsUpdate = true;
    l.mesh.rotation.x = -Math.PI / 2;
    l.mesh.position.set(x - Math.sign(x) * 0.22, 0.012, z - Math.sign(z) * 0.22);
    hallGroup.add(l.mesh);
  });
}

function applyCalibration(c, save = true) {
  calib = c && c.origin ? c : null;
  if (calib) {
    // зала → проследяване: начало в origin (с истинската височина на пода), завъртяна на yawDeg.
    // Тези числа важат само в проследяването, в което са мерени. Щом има котви, те наместват залата още на следващия кадър.
    arena.position.set(calib.origin.x, Number(calib.floorY) || 0, calib.origin.z);
    arena.quaternion.setFromAxisAngle(_up, -calib.yawDeg * Math.PI / 180);
    hall = { w: calib.width || hall.w, d: calib.depth || hall.d };
  } else {
    arena.position.set(0, 0, 0);
    arena.rotation.set(0, 0, 0);
  }
  arena.updateMatrixWorld(true);
  if (save) store('arena.calib', calib ? JSON.stringify({ ...calib, space: spaceType }) : '');
  buildHall();
  renderCard();
  if (showSig) initShowroom();
  if (!save) return;
  if (!calib) return dropAnchors();
  const m = Array.isArray(c.markers) && c.markers.length >= 2 ? [[+c.markers[0][0], +c.markers[0][1]], [+c.markers[1][0], +c.markers[1][1]]] : null;
  if (c.fresh && m) {      // мерено току-що, в тази сесия: котвите се слагат наново на двете точки
    anchors[0] = anchors[1] = null;
    anchorMarks = m; anchorTwist = 0;
    store('arena.anchorZone', String(c.zoneAt || ''));
    anchorWanted = true; needAlign = false;
  } else if (m && savedAnchorIds() && String(c.zoneAt || '') === store('arena.anchorZone')) setMarks(m);      // същите точки, нови координати в залата
}

// ---------- котви: залата стои вързана за истинската стая ----------
// Както при големите арени: каската следи с камерите си стаята. Щом залата се подравни по двете точки на пода,
// на всяка от тях се слага пространствена котва и се записва в каската. Оттам нататък мястото, посоката и
// височината на залата се смятат всеки кадър САМО от двете котви. Числата на калибровката от пулта не местят
// котвите: те важат само в мига на меренето (fresh). Свалянето на каската, заспиването, новата сесия,
// презареждането на страницата и рестартът на пулта не променят нищо.
// Котвите изчезват само ако в каската се изчисти историята на пространството; тогава: двете точки наново.

const _up = new THREE.Vector3(0, 1, 0);
const anchors = [null, null];      // XRAnchor за точка 1 и точка 2
const readJson = k => { try { return JSON.parse(store(k) || 'null'); } catch { return null; } };
let anchorMarks = readJson('arena.anchorMarks');      // къде са двете точки в координатите на залата: [[x, z], [x, z]]
let anchorTwist = Number(store('arena.anchorTwist')) || 0;      // колко се е завъртяла рамката на залата, откакто са сложени котвите
let anchorWanted = false, anchorBusy = false, anchorState = 'none';   // none | ok | lost
let anchorCount = 0, anchorLostAt = 0, needAlign = false;
const _ap = [new THREE.Vector3(), new THREE.Vector3()], _aq = new THREE.Quaternion();
function savedAnchorIds() { const a = readJson('arena.anchors'); return Array.isArray(a) && a.some(Boolean) ? a : null; }
function forget(session, id) { try { session?.deletePersistentAnchor?.(id)?.catch(() => {}); } catch { /* няма такава */ } }
/** Същите две точки в стаята, но с нови координати в залата (стаите са пресметнати наново). */
function setMarks(m) {
  if (anchorMarks) anchorTwist += Math.atan2(anchorMarks[1][1] - anchorMarks[0][1], anchorMarks[1][0] - anchorMarks[0][0]) - Math.atan2(m[1][1] - m[0][1], m[1][0] - m[0][0]);
  anchorMarks = m;
  store('arena.anchorMarks', JSON.stringify(m)); store('arena.anchorTwist', String(anchorTwist));
}
async function restoreAnchors(session) {
  anchors[0] = anchors[1] = null; anchorState = 'none'; anchorLostAt = 0; anchorCount = 0;
  const ids = savedAnchorIds();
  // котви, които вече не са наши (стари опити), се чистят: каската пази ограничен брой
  try { for (const id of session.persistentAnchors || []) if (!ids?.includes(id)) forget(session, id); } catch { /* няма списък */ }
  store('arena.anchor', '');
  if (!ids || !session.restorePersistentAnchor) return;
  let n = 0;
  for (let i = 0; i < 2; i++) {
    if (!ids[i]) continue;
    try {
      if (session.persistentAnchors && !session.persistentAnchors.has(ids[i])) throw new Error('not in the headset');
      anchors[i] = await session.restorePersistentAnchor(ids[i]);
      n++;
    } catch (e) { console.warn(`anchor ${i + 1} not found:`, e.message); }
  }
  anchorState = n ? 'ok' : 'lost';
}
/** Нови котви на двете точки, както залата стои в момента (вика се в кадър, защото иска XRFrame). */
function plantAnchors(xrFrame) {
  const session = renderer.xr.getSession(), space = renderer.xr.getReferenceSpace();
  if (!session || !space || !xrFrame.createAnchor || !anchorMarks) { anchorWanted = false; return; }
  anchorBusy = true; anchorWanted = false;
  arena.updateMatrixWorld(true);
  const q = arena.quaternion, old = readJson('arena.anchors') || [], marks = anchorMarks;
  const jobs = marks.map(m => {
    _v.set(m[0], 0, m[1]).applyMatrix4(arena.matrixWorld);
    return xrFrame.createAnchor(new XRRigidTransform({ x: _v.x, y: _v.y, z: _v.z, w: 1 }, { x: q.x, y: q.y, z: q.z, w: q.w }), space);
  });
  Promise.all(jobs).then(async made => {
    const ids = [];
    for (const a of made) ids.push(a.requestPersistentHandle ? await a.requestPersistentHandle() : null);
    anchors[0] = made[0]; anchors[1] = made[1];
    anchorState = 'ok'; anchorLostAt = 0; anchorTwist = 0;
    store('arena.anchors', JSON.stringify(ids));
    store('arena.anchorMarks', JSON.stringify(marks)); store('arena.anchorTwist', '0');
    for (const id of old) if (id && !ids.includes(id)) forget(session, id);
  }).catch(e => { console.warn('anchors failed:', e.message); anchorState = 'none'; })
    .finally(() => { anchorBusy = false; });
}
function dropAnchors() {
  const session = renderer.xr.getSession();
  for (const id of readJson('arena.anchors') || []) if (id) forget(session, id);
  store('arena.anchors', ''); store('arena.anchorZone', '');
  anchors[0] = anchors[1] = null; anchorState = 'none'; anchorWanted = false; anchorCount = 0;
}
/** Всеки кадър: залата застава според двете котви. */
function followAnchors(xrFrame, now) {
  if (!xrFrame) return;
  if (anchorWanted && calib) { if (!anchorBusy) plantAnchors(xrFrame); return; }
  if (anchorBusy || !anchorMarks) return;
  const space = renderer.xr.getReferenceSpace();
  let n = 0, k = -1;
  for (let i = 0; i < 2; i++) {
    const pose = anchors[i] && xrFrame.getPose(anchors[i].anchorSpace, space);
    if (!pose) continue;
    const t = pose.transform.position;
    _ap[i].set(t.x, t.y, t.z);
    if (!n) { const r = pose.transform.orientation; _aq.set(r.x, r.y, r.z, r.w); k = i; }
    n++;
  }
  anchorCount = n;
  if (!n) {      // котвите не се виждат в момента: каската още не е разпознала стаята
    if (anchors[0] || anchors[1]) {
      anchorLostAt ||= now;
      if (now - anchorLostAt > 2000) anchorState = 'lost';
      if (now - anchorLostAt > 12000 && !needAlign && !game) {      // не я намира: остава подравняване по двете точки
        needAlign = true;
        showPanel('The headset does not recognise the room', ['Look around slowly.', 'If it does not recover: touch the controller', 'to point 1 and point 2.'], 'warn', 0);
        autoZone(6000);
      }
    }
    return;
  }
  anchorLostAt = 0; anchorState = 'ok'; needAlign = false;
  const M = anchorMarks;
  if (n === 2) {      // място, посока и височина от двете точки
    const a = Math.atan2(_ap[1].z - _ap[0].z, _ap[1].x - _ap[0].x) - Math.atan2(M[1][1] - M[0][1], M[1][0] - M[0][0]);
    const c = Math.cos(a), s = Math.sin(a), mx = (M[0][0] + M[1][0]) / 2, mz = (M[0][1] + M[1][1]) / 2;
    arena.position.set((_ap[0].x + _ap[1].x) / 2 - (mx * c - mz * s), (_ap[0].y + _ap[1].y) / 2, (_ap[0].z + _ap[1].z) / 2 - (mx * s + mz * c));
    arena.quaternion.setFromAxisAngle(_up, -a);
  } else {      // вижда се само едната: мястото от нея, посоката от самата котва
    arena.quaternion.setFromAxisAngle(_up, -anchorTwist).premultiply(_aq);
    _v.set(M[k][0], 0, M[k][1]).applyQuaternion(arena.quaternion);
    arena.position.set(_ap[k].x - _v.x, _ap[k].y, _ap[k].z - _v.z);
  }
  arena.updateMatrixWorld(true);
}

// ---------- моите ръце и глава ----------

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _qa = new THREE.Quaternion();
const head = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };                          // в залата
const hands = { l: mkHand(), r: mkHand() };
function mkHand() { return { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), grip: false, trigger: false, active: false, world: new THREE.Vector3(), obj: null, ray: null, pad: null }; }

function handMesh(color) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.105), new THREE.MeshLambertMaterial({ color }));
  palm.position.z = 0.02;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.028, 0.04), new THREE.MeshLambertMaterial({ color: COL.ink }));
  tip.position.set(0, 0, -0.05);
  g.add(palm, tip);
  return g;
}

/** Истински ръце (от Synty) вместо кутийките: за моите контролери и за другите играчи. */
let handMaker = null;
function useHands(make) {
  handMaker = make;
  if (desk.on && !desk.real) {      // и в режима без каска: истинска ръка вместо кутийка
    const m = make(THREE, 'r');
    if (m) { for (const c of desk.hand.children) c.visible = false; desk.hand.add(m); desk.real = m; }
  }
  for (const g of grips) dressGrip(g);
}
/**
 * Облича един контролер: истинска ръка за страната, която държи в момента (лява или дясна). Контролерите може да си
 * разменят местата при ново свързване, затова ръката се сменя, ако страната е друга. Кутийката е само докато няма истинска.
 */
function dressGrip(g) {
  const side = g.side();
  if (g.real && g.realSide !== side) { g.holder?.removeFromParent(); g.real.userData.dispose?.(); g.real = null; g.holder = null; g.realSide = null; }
  if (side && !g.real && handMaker) {
    const m = handMaker(THREE, side);
    if (m) { g.holder = fitHand(m, side); g.grip.add(g.holder); g.real = m; g.realSide = side; }
  }
  g.mesh.visible = !!side && !g.real;
}

// Ръката в пространството на хвата (WebXR grip space): началото е в средата на свитата длан, −Z върви по дръжката към
// палеца, гърбът на дясната ръка сочи към +X (на лявата към −X), +Y е към китката. Моделът е с начало в китката,
// пръсти към −Z и длан надолу. HAND_FIT: къде е средата на дланта в модела и колко са наклонени пръстите спрямо дръжката.
const HAND_FIT = { palm: [0, -0.04, -0.072], tilt: 0.28 };
function fitHand(m, side) {
  const s = side === 'l' ? -1 : 1, holder = new THREE.Group();
  // оси на модела в пространството на хвата: X → ±Z, Y (гърбът на ръката) → ±X, Z → +Y
  const base = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, s), new THREE.Vector3(s, 0, 0), new THREE.Vector3(0, 1, 0));
  const tilt = new THREE.Matrix4().makeRotationX(HAND_FIT.tilt);      // дръжката минава косо през дланта: пръстите сочат леко нагоре по нея
  const off = new THREE.Matrix4().makeTranslation(-HAND_FIT.palm[0] * s, -HAND_FIT.palm[1], -HAND_FIT.palm[2]);
  holder.matrix.copy(tilt).multiply(base).multiply(off);
  holder.matrixAutoUpdate = false;
  holder.add(m);
  return holder;
}
function poseHands(dt) {
  for (const g of grips) {
    const side = g.side(), pose = g.real?.userData.pose;
    if (!side || !pose) continue;
    const b = hands[side].pad?.buttons;
    pose(dt, b?.[1] ? b[1].value : hands[side].grip ? 1 : 0, b?.[0] ? b[0].value : hands[side].trigger ? 1 : 0);
  }
  if (desk.on && desk.real?.userData.pose) desk.real.userData.pose(dt, hands.r.grip ? 1 : 0, hands.r.trigger ? 1 : 0);
}

const inputFns = new Set();
function fireInput(type, hand) { for (const fn of inputFns) { try { fn({ type, hand }); } catch (e) { console.warn('input', e); } } }

// контролерите на каската
const grips = [0, 1].map(i => {
  const grip = renderer.xr.getControllerGrip(i);
  const ray = renderer.xr.getController(i);
  let side = null;
  const mesh = handMesh(COL.neutral);
  mesh.visible = false;
  grip.add(mesh);
  const g = { grip, ray, mesh, side: () => side, real: null, holder: null, realSide: null };
  ray.addEventListener('connected', e => {
    side = e.data.handedness === 'left' ? 'l' : e.data.handedness === 'right' ? 'r' : null;
    if (side) { hands[side].obj = grip; hands[side].ray = ray; hands[side].pad = e.data.gamepad || null; hands[side].active = true; }
    dressGrip(g);
  });
  ray.addEventListener('disconnected', () => { if (side && hands[side].obj === grip) { hands[side].active = false; hands[side].obj = null; hands[side].ray = null; } side = null; dressGrip(g); });
  const on = (ev, type, key, val) => ray.addEventListener(ev, () => { if (!side) return; hands[side][key] = val; onButton(type, side); });
  on('selectstart', 'triggerdown', 'trigger', true); on('selectend', 'triggerup', 'trigger', false);
  on('squeezestart', 'gripdown', 'grip', true); on('squeezeend', 'gripup', 'grip', false);
  scene.add(grip, ray);
  return g;
});

function haptic(hand, strength = 0.5, ms = 40) {
  const a = hands[hand]?.pad?.hapticActuators?.[0];
  try { a?.pulse?.(clamp(strength, 0, 1), ms); } catch { /* няма вибрация */ }
}

// ---------- режим без каска (за проби на компютър) ----------

const watch = qs.get('watch') === '1';   // само гледане: без играч, свободна камера
const desk = { on: false, yaw: 0, pitch: 0, keys: new Set(), mouse: new THREE.Vector2(0.25, -0.2), reach: 0.55, look: false, hand: handMesh(COL.neutral) };
desk.hand.visible = false;
scene.add(desk.hand);
const ray = new THREE.Raycaster();

function deskUpdate(dt) {
  const k = desk.keys, sp = (k.has('ShiftLeft') ? 3 : 1.4) * dt;
  if (k.has('ArrowLeft') || k.has('KeyQ')) desk.yaw += 1.6 * dt;
  if (k.has('ArrowRight') || k.has('KeyE')) desk.yaw -= 1.6 * dt;
  if (k.has('ArrowUp')) desk.pitch = clamp(desk.pitch + 1.2 * dt, -1.3, 1.3);
  if (k.has('ArrowDown')) desk.pitch = clamp(desk.pitch - 1.2 * dt, -1.3, 1.3);
  const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  camera.position.x += (-Math.sin(desk.yaw) * f + Math.cos(desk.yaw) * s) * sp;
  camera.position.z += (-Math.cos(desk.yaw) * f - Math.sin(desk.yaw) * s) * sp;
  if (watch) camera.position.y = clamp(camera.position.y + ((k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0)) * sp, 0.4, 12);
  else if (!desk.free) camera.position.y = k.has('KeyC') ? 1.0 : 1.65;   // C: клякане; desk.free: свободна височина (за оглед отгоре при проби)
  camera.rotation.set(desk.pitch, desk.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  ray.setFromCamera(desk.mouse, camera);
  desk.hand.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, desk.reach);
  desk.hand.quaternion.copy(camera.quaternion);
  desk.hand.visible = !watch;
  hands.r.active = !watch;
  hands.r.world.copy(desk.hand.position);
}

// Гледане през очите на играч: /play/?watch=1&pov=1 (първият играч) или pov=<номер, име или id на каската>.
// Камерата застава в каската му и гледа накъдето гледа той (без наклона настрани, за да не люлее картината).
const povWant = watch ? (qs.get('pov') || '') : '';
if (povWant) { try { $('card').style.display = 'none'; } catch { /* няма карта */ } }      // през очите на играч: картата с клавишите само пречи
let povTarget = null;                             // id на играча, през чиито очи се гледа
const pov = { yaw: null, pitch: 0, v: new THREE.Vector3(), f: new THREE.Vector3(), q: new THREE.Quaternion(), qa: new THREE.Quaternion() };
function povUpdate() {
  if (!povWant) return;
  let p = null;
  for (const c of players.values()) if (povWant === '1' || String(c.n) === povWant || String(c.name) === povWant || String(c.id) === povWant) { p = c; break; }
  if (!p?.head?.pos) return;
  povTarget = p.id;
  arena.updateMatrixWorld();
  pov.v.copy(p.head.pos).applyMatrix4(arena.matrixWorld);
  arena.getWorldQuaternion(pov.qa);
  pov.q.copy(p.head.quat || pov.qa).premultiply(pov.qa);
  pov.f.set(0, 0, -1).applyQuaternion(pov.q);
  const ty = Math.atan2(-pov.f.x, -pov.f.z), tp = Math.asin(clamp(pov.f.y, -1, 1));
  if (pov.yaw === null) { pov.yaw = ty; pov.pitch = tp; camera.position.copy(pov.v); camera.near = 0.06; camera.fov = 80; camera.updateProjectionMatrix(); }
  let d = ty - pov.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  pov.yaw += d * 0.35; pov.pitch += (tp - pov.pitch) * 0.35;      // позите идват 20 пъти в секунда: изглаждане
  camera.position.lerp(pov.v, 0.5);
  desk.yaw = pov.yaw; desk.pitch = pov.pitch;
}
// През очите на играча се виждат неговите ръце (истинските модели, на местата на контролерите), а главата и тялото му не.
const povHands = { l: null, r: null };
function povDress() {
  if (!povTarget) return;
  const a = players.get(povTarget);
  if (!a) return;
  a.headMesh.visible = a.body.visible = false;
  a.tag.mesh.visible = false;
  if (a.body3d) a.body3d.group.visible = false;
  for (const side of ['l', 'r']) {
    const src = a[side], box = side === 'l' ? a.lMesh : a.rMesh, on = src.pos.y > 0.02;
    let h = povHands[side];
    if (!h && handMaker) {
      const m = handMaker(THREE, side);
      if (m) { h = povHands[side] = new THREE.Group(); h.add(fitHand(m, side)); }
    }
    if (h) {
      if (h.parent !== a.group) a.group.add(h);
      h.visible = on; h.position.copy(src.pos); h.quaternion.copy(src.quat);
      box.visible = false;
    } else box.visible = on;
  }
}

function deskBind() {
  const el = renderer.domElement;
  addEventListener('keydown', e => {
    if (e.target.matches?.('input')) return;
    desk.keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) { hands.r.trigger = true; onButton('triggerdown', 'r'); e.preventDefault(); }
    if (e.code === 'KeyZ' && !e.repeat) onButton('triggerdown', 'l');   // ляв спусък: една точка назад при чертане
  });
  addEventListener('keyup', e => { desk.keys.delete(e.code); if (e.code === 'Space') { hands.r.trigger = false; onButton('triggerup', 'r'); } });
  el.addEventListener('pointermove', e => {
    if (desk.look) { desk.yaw -= e.movementX * 0.004; desk.pitch = clamp(desk.pitch - e.movementY * 0.004, -1.3, 1.3); return; }
    desk.mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  el.addEventListener('pointerdown', e => {
    if (e.button === 2) { desk.look = true; el.setPointerCapture(e.pointerId); return; }
    if (e.button === 0) { hands.r.grip = true; onButton('gripdown', 'r'); }
  });
  el.addEventListener('pointerup', e => {
    if (e.button === 2) { desk.look = false; return; }
    if (e.button === 0) { hands.r.grip = false; onButton('gripup', 'r'); }
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { desk.reach = clamp(desk.reach - Math.sign(e.deltaY) * 0.05, 0.25, 1.2); }, { passive: true });
}

// ---------- другите играчи ----------

const players = new Map();   // id → { n, name, team, head, l, r, group, … }
function avatarFor(p) {
  let a = players.get(p.id);
  if (a) return a;
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: teamColor(p.team) });
  const headMesh = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), mat);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.095, 0.11), new THREE.MeshLambertMaterial({ color: COL.ink }));
  visor.position.set(0, 0.01, -0.075);
  headMesh.add(skull, visor);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.5, 10), mat);
  const l = handMesh(teamColor(p.team)), r = handMesh(teamColor(p.team));
  const tag = makeLabel(0.5, 0.22, 256);
  tag.mesh.renderOrder = 5;
  group.add(headMesh, body, l, r, tag.mesh);
  avatarGroup.add(group);
  a = {
    id: p.id, n: p.n, name: p.name, team: p.team, cal: true, seen: 0, fresh: true,
    head: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, l: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, r: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
    target: new Float32Array(21), group, headMesh, body, lMesh: l, rMesh: r, tag, mat,
  };
  players.set(p.id, a);
  return a;
}
function drawTag(a) {
  const sig = `${a.n}|${a.name}|${a.team}|${a.cal}`;
  if (a.tag.sig === sig) return;
  a.tag.sig = sig;
  const { ctx, canvas, tex } = a.tag;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  ctx.font = `800 44px ${FONT_NUM}`;
  const num = String(a.n || '');
  const nw = ctx.measureText(num).width;
  ctx.font = `650 22px ${FONT}`;
  const label = a.cal ? a.name : `${a.name} (not aligned)`;
  const tw = Math.min(canvas.width - nw - 34, ctx.measureText(label).width);
  const w = nw + tw + 30, x0 = (canvas.width - w) / 2;
  ctx.fillStyle = 'rgba(19, 20, 17, 0.86)';
  ctx.beginPath(); ctx.roundRect(x0, 4, w, canvas.height - 8, 8); ctx.fill();
  ctx.fillStyle = a.team === 1 ? '#ee4f6b' : a.team === 2 ? '#5aa6f2' : '#eef0e8';
  ctx.font = `800 44px ${FONT_NUM}`; ctx.textAlign = 'left';
  ctx.fillText(num, x0 + 10, canvas.height / 2 + 2);
  ctx.fillStyle = COL.text; ctx.font = `650 22px ${FONT}`;
  ctx.fillText(label, x0 + nw + 20, canvas.height / 2 + 1, tw);
  tex.needsUpdate = true;
}
function onRoom(msg) {
  const now = performance.now();
  for (const p of msg.players) {
    if (p.id === me.id) { me.n = p.n; me.team = p.team; continue; }
    const a = avatarFor(p);
    a.n = p.n; a.name = p.name; a.cal = !!p.c; a.seen = now;
    if (a.team !== p.team) { a.team = p.team; a.mat.color.setHex(teamColor(p.team)); for (const m of [a.lMesh, a.rMesh]) m.children[0].material.color.setHex(teamColor(p.team)); }
    a.target.set(p.p);
    drawTag(a);
  }
  for (const [id, a] of players) {
    if (now - a.seen > 3000) { dropBody(a); avatarGroup.remove(a.group); a.tag.tex.dispose(); players.delete(id); }
  }
  renderCard();
}
/** Истински тела (герои от Synty) за другите играчи: идват с играта и си отиват с нея. */
let bodyMaker = null;
function dropBody(a) { if (a.body3d) { a.group.remove(a.body3d.group); try { a.body3d.dispose(); } catch { /* вече го няма */ } a.body3d = null; } a.bodyAt = 0; }
function useBodies(make) { bodyMaker = make || null; if (!bodyMaker) for (const a of players.values()) dropBody(a); }

/** На кое ниво е играчът според последното състояние на играта (0, ако играта няма нива). */
function levelOf(id) { return game?.snap?.players?.find(p => p.id === id)?.level ?? 0; }

function setPose(part, t, o, k, snap) {
  _v.set(t[o], t[o + 1], t[o + 2]);
  _q.set(t[o + 3], t[o + 4], t[o + 5], t[o + 6]);
  if (snap) { part.pos.copy(_v); part.quat.copy(_q); } else { part.pos.lerp(_v, k); part.quat.slerp(_q, k); }
}
function updateAvatars(dt) {
  const k = 1 - Math.exp(-dt * 14);
  for (const a of players.values()) {
    const t = a.target, snap = a.fresh;
    a.fresh = false;
    setPose(a.head, t, 0, k, snap); setPose(a.l, t, 7, k, snap); setPose(a.r, t, 14, k, snap);
    a.headMesh.position.copy(a.head.pos); a.headMesh.quaternion.copy(a.head.quat);
    a.body.position.set(a.head.pos.x, Math.max(0.3, a.head.pos.y - 0.48), a.head.pos.z);
    a.lMesh.position.copy(a.l.pos); a.lMesh.quaternion.copy(a.l.quat);
    a.rMesh.position.copy(a.r.pos); a.rMesh.quaternion.copy(a.r.quat);
    a.lMesh.visible = a.l.pos.y > 0.02; a.rMesh.visible = a.r.pos.y > 0.02;
    a.tag.mesh.position.set(a.head.pos.x, a.head.pos.y + 0.3, a.head.pos.z);
    a.tag.mesh.quaternion.copy(camera.getWorldQuaternion(_q)).premultiply(_qa.copy(arena.quaternion).invert());
    a.group.visible = watch || desk.on || a.cal === !!calib || !calib;
    const ghost = !!game && levelOf(a.id) !== levelOf(povTarget || me.id);
    if (ghost !== a.ghost) {
      a.ghost = ghost;
      a.group.traverse(o => { if (o.isMesh && o.material && !o.material.map) { o.material.transparent = ghost; o.material.opacity = ghost ? 0.28 : 1; o.material.depthWrite = !ghost; } });
      a.tag.mesh.visible = !ghost;
    }   // неподравнена каска не се показва на подравнените: щеше да е на грешно място
    // истинско тяло, щом играта го е заредила; на другото ниво остава бледият манекен
    if (bodyMaker && !a.body3d && performance.now() - (a.bodyAt || 0) > 1500) {
      a.bodyAt = performance.now();
      a.body3d = bodyMaker(a.n) || null;
      if (a.body3d) a.group.add(a.body3d.group);
    }
    const real = !!a.body3d && !ghost;
    const noTag = !!(game && ctx && ctx.noTags);      // играта може да скрие табелките с имена (без табла вътре в игра)
    if (noTag) a.tag.mesh.visible = false; else if (a.tagOff) a.tag.mesh.visible = !a.ghost;
    a.tagOff = noTag;
    if (a.body3d) {
      a.body3d.group.visible = real;
      a.l.on = a.l.pos.y > 0.02; a.r.on = a.r.pos.y > 0.02;
      if (real) { try { a.body3d.update(a.head, a.l, a.r, dt); } catch (e) { console.warn('body', e); dropBody(a); } }
    }
    a.headMesh.visible = a.body.visible = !real;
    if (real) a.lMesh.visible = a.rMesh.visible = false;
  }
}

// ---------- табло пред очите във VR ----------

const panel = makeLabel(0.9, 0.42, 640);
panel.mesh.visible = false;
panel.mesh.renderOrder = 20;
panel.mesh.material.depthTest = false;
scene.add(panel.mesh);
let panelText = { title: '', lines: [], tone: '' }, panelUntil = 0, panelPlaced = false;
function showPanel(title, lines = [], tone = '', seconds = 0) {
  panelText = { title, lines, tone };
  panelUntil = seconds ? performance.now() + seconds * 1000 : 0;
  const { ctx, canvas, tex } = panel;
  // само удебелен текст с тънък тъмен контур: без табло зад него
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = tone === 'bad' ? '#ff8a6a' : '#ffffff';
  ctx.font = `900 78px ${FONT_NUM}`; ctx.lineWidth = 8;
  try { ctx.letterSpacing = '5px'; } catch { /* без разредка */ }
  ctx.strokeText(String(title).toUpperCase(), 36, 18, canvas.width - 72); ctx.fillText(String(title).toUpperCase(), 36, 18, canvas.width - 72);
  try { ctx.letterSpacing = '0px'; } catch { /* без разредка */ }
  ctx.fillStyle = '#ffffff'; ctx.font = `700 32px ${FONT}`; ctx.lineWidth = 6;
  lines.forEach((l, i) => { ctx.strokeText(l, 36, 108 + i * 44, canvas.width - 72); ctx.fillText(l, 36, 108 + i * 44, canvas.width - 72); });
  tex.needsUpdate = true;
  panel.mesh.visible = !!title;
  panelPlaced = false;
}
function placePanel() {
  camera.getWorldPosition(_v);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  panel.mesh.position.copy(_v).addScaledVector(dir, 1.3);
  panel.mesh.position.y = _v.y - 0.12 - panelDrop;
  panel.mesh.lookAt(_v.x, panel.mesh.position.y, _v.z);
  panelPlaced = true;
}

// ---------- калибриране по четирите ъгъла ----------

let calibRun = null;   // { corners: [], marks: [] }
function startCalibrate() {
  stopCalibrate(false);
  calibRun = { corners: [], marks: [] };
  showPanel('Corner 1 of 4', ['Touch the right controller to the floor corner', 'and pull the trigger.'], 'warn');
}
function stopCalibrate(tell) {
  if (!calibRun) return;
  for (const m of calibRun.marks) scene.remove(m);
  calibRun = null;
  if (tell) send({ type: 'calibCancelled' });
  showPanel('', []);
}
function calibPoint() {
  if (!calibRun) return;
  const w = hands.r.world;   // в проследяването на каската, не в залата
  const i = calibRun.corners.length;
  calibRun.corners.push({ x: w.x, z: w.z });
  send({ type: 'calibCorner', index: i, x: w.x, y: w.y, z: w.z });
  const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), new THREE.MeshBasicMaterial({ color: COL.signal }));
  mark.position.set(w.x, 0.012, w.z);
  scene.add(mark);
  calibRun.marks.push(mark);
  haptic('r', 0.8, 60);
  if (i + 1 < 4) return showPanel(`Corner ${i + 2} of 4`, ['Same order for every headset.'], 'warn');
  send({ type: 'calibDone', corners: calibRun.corners, hasMap: false });
  const marks = calibRun.marks;
  calibRun = null;
  setTimeout(() => marks.forEach(m => scene.remove(m)), 4000);
  showPanel('Done', ['The operator checks the size on the console.'], '', 6);
}

let bothGripTimer = 0, alignMenu = false;
function onButton(type, hand) {
  if (calibRun && type === 'triggerdown' && hand === 'r') return calibPoint();
  if (alignMenu && (game || gameLoading)) alignMenu = false;      // отворено меню не се пренася в играта
  // двата странични бутона заедно за секунда и половина: чертане на зоната направо от каската
  if (alignMenu && type === 'triggerdown') {      // избор от менюто за подравняване
    alignMenu = false;
    if (hand === 'l') return zoneStart('floor');
    return zoneStart(zoneData ? 'align' : 'draw');
  }
  if (alignMenu && type === 'gripdown' && !(hands.l.grip && hands.r.grip)) { alignMenu = false; return hand === 'r' ? zoneStart('draw') : showPanel('', []); }
  // Подравнена каска (арената е на място) не отваря менюто с двете дръжки: гост, който стиска контролерите, щеше да го
  // пусне. Подравняването ѝ се пуска от пулта. Каска без подравняване или с изгубени котви го отваря както досега.
  if (type === 'gripdown' && hands.l.grip && hands.r.grip && !zoneEditor?.active && !game && !gameLoading && !(calib && anchorState === 'ok')) {      // играта може да го изключи (ctx.noAlignMenu): при стрелба двете дръжки са стиснати постоянно
    clearTimeout(bothGripTimer);
    bothGripTimer = setTimeout(() => {
      if (!(hands.l.grip && hands.r.grip) || zoneEditor?.active) return;
      alignMenu = true;
      haptic('l', 1, 120); haptic('r', 1, 120);
      showPanel('Alignment', [zoneData ? 'Right trigger: touch the controller to points 1 and 2.' : 'Right trigger: draw the zone.', 'Right grip button: new zone.', 'Left trigger: height only. Left grip: cancel.'], 'warn');
    }, 1500);
    return;
  }
  fireInput(type, hand);
}

// ---------- играта ----------

let game = null;       // { name, scene, start }
let gameLoading = false;
const ctx = {
  THREE, root: gameRoot, hall, me, head, hands, players,
  get viewId() { return povTarget || me.id; },      // чие ниво се показва: моето, а при гледане през очите на играч неговото
  onInput(fn) { inputFns.add(fn); return () => inputFns.delete(fn); },
  send(msg) { send({ type: 'act', ...msg }); },
  haptic, desktop: false, theme: 'night',
  lights: { hemi: gHemi, sun: gSun }, refreshShadows,
};
let startSig = '', loadingName = null;      // loadingName: коя игра се зарежда в момента
// Екран за зареждане: табло пред очите с името на играта, какво се зарежда и лента. Същото число отива и към пулта.
let loadPct = null;
async function loadStep(title, pct, what) {
  loadPct = pct;
  showPanel(title, [what, ''], '', 180);
  const { ctx: g, canvas: c, tex } = panel, x = 36, w = c.width - 72, y = c.height - 62;
  // докъде е стигнало: тънка бяла черта и процент с удебелен текст
  g.fillStyle = 'rgba(255, 255, 255, 0.22)'; g.fillRect(x, y + 4, w, 5);
  g.fillStyle = '#ffffff'; g.fillRect(x, y + 4, Math.max(6, w * pct), 5);
  g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = 'rgba(0, 0, 0, 0.75)'; g.font = `800 30px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.strokeText(`${Math.round(pct * 100)}%`, c.width - 36, y - 10); g.fillText(`${Math.round(pct * 100)}%`, c.width - 36, y - 10);
  tex.needsUpdate = true;
  sendStatus();
  await new Promise(r => setTimeout(r, 60));      // да се види, преди да започне тежката работа
}
async function startGame(start) {
  // същото съобщение за старт идва пак при всяко ново свързване: играта не се зарежда втори път върху първата
  const sig = JSON.stringify(start);
  if (gameLoading || (game && sig === startSig)) return;
  startSig = sig;
  gameLoading = true; loadingName = String(start.game || '');      // преди чакането: второ съобщение за старт да не тръгне успоредно
  await endGame();
  sendStatus();                               // веднага: сървърът да не сметне каската за свободна
  const title = String(start.title || 'Game');
  try {
    const base = `./games/${encodeURIComponent(start.client || start.game)}/`;
    await fade(1, 600);                        // лобито потъва в тъмното; играта се зарежда на тъмно
    panelDrop = 0.5;
    showCover(new URL(`${base}cover.jpg`, import.meta.url).href);
    await loadStep(title, 0.04, 'Getting ready');
    const mod = await import(`${base}scene.js`);
    ctx.hall = start.hall || hall; ctx.theme = start.theme || 'night'; ctx.desktop = desk.on;
    // истинските модели (Synty), ако са приготвени; иначе играта върви с резервните
    try { ctx.assets ||= (await import('./lib/assets.js')).createAssets(); } catch (e) { console.warn('assets', e.message); }
    await loadStep(title, 0.12, 'Loading models');
    try {
      const [models, kinds] = await Promise.all([import(`${base}models.js`), import(`${base}synty-kinds.js`)]);
      if (ctx.assets) await kinds.installSyntyKinds({ THREE, assets: ctx.assets, models, theme: ctx.theme, start });
      if (kinds.makeHand) useHands(kinds.makeHand);
      if (kinds.makeAvatarBody) useBodies(kinds.makeAvatarBody);
    } catch (e) { console.warn('synty-kinds', e.message); }
    gHemi.color.set(0xcfd8ff); gHemi.intensity = 0.75; gSun.intensity = 1.9;
    gameLights.visible = true;
    await loadStep(title, 0.5, 'Building the scene');
    const sc = await mod.createScene(ctx, start);
    await loadStep(title, 0.66, 'Loading the world');
    let decor = null;
    try { if (ctx.assets) decor = await (await import(`${base}decor.js`)).createDecor(ctx, start); } catch (e) { console.warn('decor', e.message); }
    await loadStep(title, 1, 'Ready');
    game = { name: start.game, scene: sc, decor, start, snap: null };
    hemi.visible = sun.visible = false;
    refreshShadows();
    showRoot.visible = false;
    hallGroup.visible = false;
    backdrop.visible = true;
    showPanel('', []);
    send({ type: 'launched', ok: true, game: start.game });
    panelDrop = 0; showCover('');
    fade(0, 2200);                             // светът на играта изплува от тъмното
  } catch (e) {
    console.error('the game failed to load', e);
    send({ type: 'launched', ok: false, error: String(e?.message || e).slice(0, 120) });
    panelDrop = 0; showCover('');
    showPanel('The game failed to load', [String(e?.message || e).slice(0, 60)], 'bad', 8);
    fade(0, 400);
  }
  gameLoading = false; loadingName = null; loadPct = null;
  renderCard();
}
async function endGame() {
  if (!game) return;
  await fade(1, 450);                          // играта потъва в тъмното, лобито изплува
  if (!game) return;
  useBodies(null);
  try { game.decor?.dispose(); } catch (e) { console.warn(e); }
  try { game.scene.dispose(); } catch (e) { console.warn(e); }
  for (const c of [...gameRoot.children]) gameRoot.remove(c);
  game = null;
  hemi.visible = sun.visible = true;
  gameLights.visible = false;
  showRoot.visible = true;
  hallGroup.visible = true;
  backdrop.visible = !!showroom;
  renderCard();
  fade(0, 1200);
}

// ---------- зона: чертане от каската ----------

const BUILD = 30;      // расте при промяна на кода в каската: пултът вижда дали страницата е презаредена
let zoneMod = null, zoneEditor = null, zoneViewObj = null, zoneData = null;
let pendingZone = (() => { try { return JSON.parse(store('arena.zonePending') || 'null'); } catch { return null; } })();
function zoneConfirmed() { pendingZone = null; store('arena.zonePending', ''); }
async function zoneReady() {
  if (zoneMod) return true;
  try { zoneMod = await import('./zone.js'); } catch (e) { console.warn('zone.js', e.message); return false; }
  zoneEditor = zoneMod.createZoneEditor({
    THREE, space: scene, hands, haptic, panel: showPanel,
    desktop: () => desk.on,
    /** Точка от проследяването на каската в координатите на залата (както залата стои в момента). */
    toArena(p) { arena.updateMatrixWorld(true); _v.set(p.x, 0, p.z); arena.worldToLocal(_v); return { x: +_v.x.toFixed(3), z: +_v.z.toFixed(3) }; },
    floor: () => (calib ? arena.position.y : 0),
    headY: () => (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(_v).y,
    /** Откъде и накъде сочи десният контролер (в проследяването на каската). */
    pointer(o, d) {
      const h = hands.r;
      if (h.ray && h.active) { h.ray.getWorldPosition(o); h.ray.getWorldQuaternion(_q); d.set(0, 0, -1).applyQuaternion(_q); return true; }
      if (desk.on && !watch) { o.copy(camera.position); d.copy(desk.hand.position).sub(camera.position).normalize(); return true; }
      return false;
    },
    onInput(fn) { inputFns.add(fn); return () => inputFns.delete(fn); },
    send(msg) {
      // готовият чертеж се пази, докато сървърът потвърди: ако връзката е паднала, тръгва пак при свързване
      if (['zoneDone', 'zoneAligned', 'floorSet', 'zoneObstaclesDone'].includes(msg.type)) { pendingZone = msg; store('arena.zonePending', JSON.stringify(msg)); }
      send(msg);
      if (['zoneDone', 'zoneAligned', 'zoneCancelled', 'floorSet', 'zoneObstaclesDone'].includes(msg.type)) { zoneMode(false); if (msg.type === 'zoneDone') zoneViewObj?.setVisible(false); }
    },
  });
  zoneViewObj = zoneMod.createZoneView({ THREE, root: arena });
  if (zoneData) zoneViewObj.set(zoneData);
  return true;
}
/** Докато се чертае, стаята за оглед и тъмният фон се махат: трябва да се вижда истинската зала. */
function zoneMode(on) {
  showRoot.visible = !on && !game;
  backdrop.visible = !on && (!!showroom || !!game);
  hallGroup.visible = !on && !game;
  zoneViewObj?.setVisible(!on && !!zoneData);
}
async function zoneStart(kind) {
  if (!(await zoneReady())) return showPanel('Drawing is not ready yet', ['Try again in a moment.'], 'warn', 6);
  zoneMode(true);
  if (kind === 'obstacles') {      // зоната остава на пода за ориентир, чертаят се само препятствията
    if (!zoneData || !calib) return showPanel('Zone first', ['Obstacles are drawn on a saved zone.'], 'warn', 6);
    zoneEditor.startObstacles();
    zoneViewObj?.setVisible(true);
    return;
  }
  if (kind === 'align') zoneEditor.startAlign(); else if (kind === 'floor') zoneEditor.startFloor(); else zoneEditor.startDraw();
}
async function onZone(z) {
  const had = !!zoneData;
  zoneKnown = true;
  zoneData = z;
  if (showSig && !game && !gameLoading) initShowroom();      // лобито се нарежда около новата зона
  if (z && await zoneReady()) zoneViewObj.set(z);
  else zoneViewObj?.setVisible(false);
  if (zoneEditor?.active && !zoneEditor.only) zoneViewObj?.setVisible(false);
  // друга каска е записала зоната, докато тази още чертае: тук остават само двете точки
  if (z && !had && !pendingZone && zoneEditor?.active && ['zone', 'obstacles', 'marks'].includes(zoneEditor.step)) {
    zoneEditor.cancel();
    zoneStart('align');
  }
}
/** Каската се оправя сама, без кабел и без пулт: във VR без зона тръгва чертането, а със зона без подравняване тръгват двете точки. */
let zoneKnown = false, autoZoneTimer = 0, wantObstacles = false;
function autoZone(delay = 2500) {
  clearTimeout(autoZoneTimer);
  autoZoneTimer = setTimeout(() => {
    if (!renderer.xr.isPresenting || desk.on || watch) return;
    if (game || calibRun || zoneEditor?.active || pendingZone) return;
    if (!connected || !zoneKnown) return autoZone(1500);      // още не знаем дали има зона
    if (!zoneData) return zoneStart('draw');
    if (!calib || needAlign) return zoneStart('align');
    if (wantObstacles) { wantObstacles = false; return zoneStart('obstacles'); }
  }, delay);
}

// ---------- предупреждение при излизане от зоната ----------
// Зоната е мястото за краката. Предупреждението тръгва 10 см след ръба ѝ (ръцете спокойно са навън)
// и когато главата влезе в препятствие: червено пред очите, все по-плътно, и вибрация в двата контролера.
const GUARD_AFTER = 0.0;
const guard = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
guard.renderOrder = 900; guard.visible = false; guard.frustumCulled = false;
scene.add(guard);
let guardTick = 0, guardOut = 0, guardBuzz = 0;
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDist(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], dx = poly[i][0] - ax, dz = poly[i][1] - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
function updateGuard(now, cam) {
  if (!zoneData?.poly || !calib || zoneEditor?.active || !renderer.xr.isPresenting) { guard.visible = false; guardOut = 0; return; }
  if ((guardTick++ & 3) === 0) {       // на всеки четвърти кадър стига
    const x = head.pos.x, z = head.pos.z;
    let out = inPoly(zoneData.poly, x, z) ? 0 : edgeDist(zoneData.poly, x, z) - GUARD_AFTER;
    for (const o of zoneData.obstacles || []) if (o.length >= 3 && inPoly(o, x, z)) out = Math.max(out, 0.1);
    guardOut = Math.max(0, out);
  }
  if (guardOut <= 0) { guard.visible = false; return; }
  guard.visible = true;
  guard.position.copy(cam.getWorldPosition(_v));
  guard.material.opacity = clamp(0.3 + guardOut * 2.2, 0.3, 0.8);
  if (now - guardBuzz > 500) { guardBuzz = now; haptic('l', 0.8, 120); haptic('r', 0.8, 120); }
}

// ---------- стая за оглед в лобито ----------

let showroom = null, showSig = '', showGen = 0;
async function initShowroom() {
  // По подразбиране в лобито е мини лобито (нощен лагер около зоната, minilobby.js); ?show=1 пуска старата стая за оглед,
  // ?lobby=0 оставя само зоната.
  const kitchen = qs.get('show') === '1';
  if (!kitchen && qs.get('lobby') === '0') return;
  const sig = `${hall.w}x${hall.d}|${(zoneData?.rooms || []).map(r => [r.x, r.z, r.w, r.d].join(',')).join(';')}`;
  if (sig === showSig) return;
  showSig = sig;
  const gen = ++showGen;      // зоната идва, докато първото лоби още се строи: без този брояч оставаха две едно върху друго
  try {
    ctx.assets ||= (await import('./lib/assets.js')).createAssets();
    const mod = await import(kitchen ? './showroom.js' : './minilobby.js');
    const made = await (kitchen ? mod.createShowroom : mod.createMiniLobby)({ THREE, root: showRoot, assets: ctx.assets, hall, rooms: zoneData?.rooms || null });
    if (gen !== showGen) { try { made?.dispose?.(); } catch { /* вече го няма */ } return; }      // междувременно е тръгнало по-ново
    showroom?.dispose();
    showroom = made;
    backdrop.visible = true;
  } catch (e) { console.warn('showroom', e); }
}

// ---------- връзка с пулта ----------

let ws = null, connected = false, volume = 60;
// Втори раздел със същата каска избутва първия от сървъра (код 4001). Ако и двата се връщат, се избутват безкрай и
// играта не тръгва. Затова раздел, който не се вижда, не се свързва, а избутаният видим изчаква, преди да си вземе връзката.
let dormant = false, replaced = 0, calmTimer = 0;
// Приложението „Арена" отваря нов раздел в браузъра при всяко пускане. Най-новият раздел казва на по-старите да се
// оттеглят (каналът е общ за разделите на един браузър): оттегленият затваря връзката си и повече не се свързва.
let born = 0, retired = false, tabs = null;      // born: кога разделът последно е излязъл отпред (0: още не е)
function claim() {
  born = Date.now() + Math.random(); retired = false;
  if (document.title !== 'MS Games') document.title = 'MS Games';
  try { sessionStorage.setItem('arena.owner', '1'); } catch { /* без памет */ }
  try { tabs?.postMessage({ t: 'born', id: me.id, born }); } catch { /* каналът е затворен */ }
}
function retire() {
  if (retired) return;
  retired = true; dormant = false; connected = false;
  try { sessionStorage.removeItem('arena.owner'); } catch { /* без памет */ }
  try { renderer.xr.getSession()?.end(); } catch { /* не е във VR */ }
  try { ws?.close(); } catch { /* вече е затворена */ }
  document.title = 'MS Games (old tab)';
  try { $('sConn').textContent = 'it is open in a newer tab'; $('sConn').dataset.tone = 'warn'; } catch { /* няма карта */ }
}
if (!watch) try {
  tabs = new BroadcastChannel('arena-play');
  tabs.onmessage = e => {
    const m = e.data || {};
    if (m.t !== 'born' || m.id !== me.id) return;
    if (m.born > born) retire();                                              // друг раздел е излязъл отпред след този
    else if (!retired && born) tabs.postMessage({ t: 'born', id: me.id, born });      // по-стар раздел се обажда: казвам му пак
  };
  let fresh = true, owner = false;
  try { fresh = performance.getEntriesByType('navigation')[0]?.type !== 'reload'; owner = sessionStorage.getItem('arena.owner') === '1'; } catch { /* стар браузър */ }
  if (!pageHidden() && (fresh || owner || desk.on)) claim(); else retired = true;      // останалите чакат човек да ги докосне
} catch { /* стар браузър без BroadcastChannel */ }
const pageHidden = () => !watch && !desk.on && document.hidden && !renderer.xr.isPresenting;
document.addEventListener('visibilitychange', () => {
  if (pageHidden()) return;
  const back = retired || dormant;
  claim();                                        // този раздел е пред очите на човека: той държи каската
  if (back) { dormant = false; connect(); }
});
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function takeOver() { if (retired || dormant) { claim(); dormant = false; connect(); } }
if (!watch) {
  window.addEventListener('pointerdown', takeOver, true);
  window.addEventListener('keydown', takeOver, true);
  renderer.xr.addEventListener('sessionstart', () => { claim(); dormant = false; connect(); });      // който е във VR, той държи каската
}
function connect() {
  if (retired) return;
  if (ws && ws.readyState <= 1) return;           // вече има връзка или се отваря
  if (pageHidden()) { dormant = true; connected = false; renderCard(); return; }
  dormant = false;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/${watch ? 'watch' : 'headset'}`);
  ws.onopen = () => {
    connected = true;
    clearTimeout(calmTimer); calmTimer = setTimeout(() => { replaced = 0; }, 20000);      // връзката се задържа: никой не я оспорва
    if (!watch) send({ type: 'hello', id: me.id, name: me.name, model: desk.on ? 'Browser (no headset)' : 'Meta Quest (browser)', web: true, desktop: desk.on, calibrationVersion: calib?.version ?? null, app: game?.name || null, build: BUILD, inVR: renderer.xr.isPresenting });
    if (pendingZone && !watch) setTimeout(() => { if (pendingZone) send(pendingZone); }, 600);   // чертеж, който не е стигнал до сървъра
    renderCard();
  };
  ws.onclose = e => {
    connected = false; zoneKnown = false; clearTimeout(calmTimer);
    if (retired) return;
    renderCard();
    if (e.code === 4001) {                      // същата каска се е свързала от друга страница
      replaced++;
      if (pageHidden()) { dormant = true; return; }                          // тази не се вижда: остава другата
      if (replaced > 6) showPanel('The arena is open in two tabs', ['Close the other browser tab'], 'bad', 10);
      return void setTimeout(connect, Math.min(30000, 2500 * replaced));     // тази се вижда: взима връзката обратно, все по-рядко
    }
    setTimeout(connect, 1500);
  };
  ws.onerror = () => {};
  ws.onmessage = e => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    switch (m.type) {
      case 'room': return onRoom(m);
      case 'hall': if (watch) { hall = m.hall; calib = { version: 0, origin: { x: 0, z: 0 }, yawDeg: 0, width: hall.w, depth: hall.d }; hallBuilt = ''; buildHall(); } return;
      case 'game': if (game) { game.snap = m; game.scene.onSnapshot(m); } return;
      case 'gameStart': return startGame(m);
      case 'welcome': me.name = m.name || me.name; store('arena.name', me.name); return renderCard();
      case 'identify':
        haptic('l', 1, 500); haptic('r', 1, 500);
        return showPanel(`This is ${me.name}`, [me.n ? `№ ${me.n}` : ''], '', 4);
      case 'volume': volume = clamp(Number(m.value) || 0, 0, 100); return;
      case 'zoneDraw': return zoneStart('draw');
      case 'zoneAlign': return zoneStart('align');
      case 'zoneFloor': return zoneStart('floor');
      case 'zoneObstacles': if (desk.on) return zoneStart('obstacles'); wantObstacles = true; return autoZone(300);
      case 'reload': return location.reload();      // нова версия на кода, пратена от пулта (без кабел)
      case 'zoneSaved':
        zoneConfirmed();
        if (m.ok === false) return showPanel('The zone is too small', ['Draw it again: both grip buttons', 'together for a second and a half.'], 'bad', 10);
        return showPanel(m.obstacles != null ? `Obstacles: ${m.obstacles}` : 'Zone saved', [m.rooms ? `Play area ${m.rooms}` : m.hall ? `Play area ${m.hall.w.toFixed(1)} × ${m.hall.d.toFixed(1)} m` : ''], '', 6);
      case 'floor':      // истинската височина на пода, мерена току-що с контролера
        arena.position.y = Number(m.floorY) || 0; arena.updateMatrixWorld(true); zoneConfirmed();
        if (calib) { calib.floorY = Number(m.floorY) || 0; store('arena.calib', JSON.stringify({ ...calib, space: spaceType })); anchors[0] = anchors[1] = null; anchorWanted = true; }
        return showPanel('Height fixed', [], '', 4);
      case 'zoneCancel': if (zoneEditor?.active) { zoneEditor.cancel(); zoneMode(false); } return;
      case 'zone': return onZone(m.zone);
      case 'calibrate': return startCalibrate();
      case 'calibrateCancel': return stopCalibrate(true);
      case 'applyCalibration':
        if (!m.calibration) { applyCalibration(null); autoZone(1500); return showPanel('Alignment was reset', ['Touch the controller to points 1 and 2.'], 'warn', 6); }
        applyCalibration(m.calibration);
        if (m.calibration.fresh) autoZone(3000);      // ако чакат препятствия за чертане, тръгват след подравняването
        if (pendingZone && pendingZone.type !== 'zoneDone') zoneConfirmed();
        send({ type: 'calibApplied', version: m.calibration?.version });
        return showPanel('Arena aligned', [`${hall.w.toFixed(2)} × ${hall.d.toFixed(2)} m`], '', 5);
      case 'stop': endGame(); return send({ type: 'stopped' });
      case 'launch': return;   // старият протокол; уеб играта тръгва с gameStart
    }
  };
}

let battery = null;
navigator.getBattery?.().then(b => { battery = b; }).catch(() => {});
let fps = 72, frames = 0, fpsAt = performance.now();

function sendStatus() {
  if (!connected || watch) return;
  const f = _v.set(0, 0, -1).applyQuaternion(head.quat);
  send({
    type: 'status',
    battery: battery ? Math.round(battery.level * 100) : null, charging: battery ? battery.charging : false,
    fps, tracking: 'ok', volume, sleeping: document.hidden && !renderer.xr.isPresenting,
    pos: { x: +head.pos.x.toFixed(2), y: +head.pos.y.toFixed(2), z: +head.pos.z.toFixed(2) },
    yaw: +Math.atan2(f.x, f.z).toFixed(3),
    app: game?.name || null, user: null, space: spaceType, anchor: anchorState, anchorN: anchorCount, build: BUILD, inVR: renderer.xr.isPresenting,
    load: gameLoading ? loadPct : null,
  });
}
const poseBuf = new Array(21);
function sendPose() {
  if (!connected || watch) return;
  const put = (o, part, on) => {
    poseBuf[o] = on ? +part.pos.x.toFixed(3) : 0; poseBuf[o + 1] = on ? +part.pos.y.toFixed(3) : 0; poseBuf[o + 2] = on ? +part.pos.z.toFixed(3) : 0;
    poseBuf[o + 3] = +part.quat.x.toFixed(4); poseBuf[o + 4] = +part.quat.y.toFixed(4); poseBuf[o + 5] = +part.quat.z.toFixed(4); poseBuf[o + 6] = +part.quat.w.toFixed(4);
  };
  put(0, head, true); put(7, hands.l, hands.l.active); put(14, hands.r, hands.r.active);
  send({ type: 'pose', c: calib || desk.on ? 1 : 0, p: poseBuf });
}

// ---------- картата на обикновения екран ----------

let cardSig = '';
function renderCard() {
  const sig = [me.n, me.name, connected, calib?.version, hall.w, hall.d, players.size].join('|');
  if (sig === cardSig) return;
  cardSig = sig;
  $('num').textContent = me.n || '';
  $('name').textContent = me.name;
  $('model').textContent = me.id;
  $('sConn').textContent = connected ? 'connected' : 'no connection';
  $('sConn').dataset.tone = connected ? '' : 'bad';
  $('sCalib').textContent = calib ? `${hall.w.toFixed(1)} × ${hall.d.toFixed(1)} m` : 'not aligned';
  $('sCalib').dataset.tone = calib ? '' : 'warn';
  $('sPlayers').textContent = String(players.size);
}

// ---------- VR сесия ----------

let spaceType = 'local-floor';
async function enterXR() {
  const xr = navigator.xr;
  const wantVR = qs.get('vr') === '1';
  const ar = !wantVR && await xr.isSessionSupported('immersive-ar').catch(() => false);
  const session = await xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'anchors'] });
  // bounded-floor е вързано към границата на стаята и не се мести между сесиите: калибровката остава вярна
  spaceType = 'local-floor';
  try { await session.requestReferenceSpace('bounded-floor'); spaceType = 'bounded-floor'; } catch { /* няма граница за стая */ }
  const saved = JSON.parse(store('arena.calib') || 'null');
  if (saved && saved.space && saved.space !== spaceType && !savedAnchorIds()) applyCalibration(null);   // друго начало и няма котви: старите числа не важат
  renderer.xr.setReferenceSpaceType(spaceType);
  try { renderer.xr.setFoveation(1); } catch { /* няма */ }
  await renderer.xr.setSession(session);
  renderer.setClearColor(COL.bg, ar ? 0 : 1);
  $('card').hidden = true;
  await restoreAnchors(session);
  // има подравняване, но каската няма (или не намира) котвите си: числата може да са остарели, затова двете точки наново
  needAlign = !!calib && anchorState !== 'ok' && !!session.restorePersistentAnchor;
  autoZone();
  if (calib && anchorState === 'ok') showPanel(me.name, ['The arena is in place.'], '', 5);
  else if (calib && needAlign) showPanel('Two-point alignment', ['Touch the right controller to point 1,', 'then point 2. The headset remembers them', 'and will not ask again.'], 'warn', 0);
  else if (calib) showPanel('Check the alignment', ['If the arena does not match the room:', 'both grip buttons together for 2 seconds.'], 'warn', 12);
  else showPanel(me.name, ['No zone yet. Drawing starts by itself;', 'if it does not start: both grip buttons', 'together for 2 seconds.'], 'warn', 0);
  session.addEventListener('end', () => { $('card').hidden = false; renderer.setClearColor(COL.bg, 1); panel.mesh.visible = false; });
}

async function boot() {
  try { await document.fonts.ready; } catch { /* без шрифт */ }
  const saved = JSON.parse(store('arena.calib') || 'null');
  if (saved?.origin) applyCalibration(saved, false);
  renderCard();
  const btn = $('enter');
  const supported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false));
  if (supported && qs.get('desktop') !== '1') {
    btn.textContent = 'Enter';
    btn.disabled = false;
    btn.onclick = () => enterXR().catch(e => { $('note').textContent = `Could not enter VR: ${e.message}`; });
    $('note').textContent = 'Put the headset on and press the button with the controller.';
  } else {
    desk.on = true;
    deskBind();
    if (watch) { camera.position.set(0, 3.4, hall.d / 2 + 3.2); desk.pitch = -0.55; me.name = 'Spectator'; $('keys').textContent = 'W A S D move, R and F up and down, arrows or right mouse button to look.'; }
    btn.textContent = 'No-headset mode';
    $('card').classList.add('compact');
    $('keys').hidden = false;
    $('note').textContent = window.isSecureContext ? '' : 'The page is not on a secure connection.';
  }
  connect();
  initShowroom();
  setInterval(sendStatus, 500);
  setInterval(sendPose, 50);
  renderer.setAnimationLoop(frame);
}

// ---------- кадър ----------

let last = performance.now();
function frame(now, xrFrame) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  if (now - fpsAt >= 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }

  if (desk.on && !renderer.xr.isPresenting) { povUpdate(); deskUpdate(dt); }

  followAnchors(xrFrame, now);

  // къде съм в координатите на залата
  arena.updateMatrixWorld();
  _inv.copy(arena.matrixWorld).invert();
  _qa.copy(arena.quaternion).invert();
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.getWorldPosition(head.pos).applyMatrix4(_inv);
  cam.getWorldQuaternion(head.quat).premultiply(_qa);
  for (const side of ['l', 'r']) {
    const h = hands[side];
    if (h.obj) { h.obj.getWorldPosition(h.world); h.obj.getWorldQuaternion(h.quat); }
    else if (desk.on && side === 'r') h.quat.copy(camera.quaternion);
    else continue;
    h.pos.copy(h.world).applyMatrix4(_inv);
    h.quat.premultiply(_qa);
  }

  poseHands(dt);
  updateAvatars(dt);
  povDress();
  updateGuard(now, cam);
  if (zoneViewObj) zoneViewObj.setVisible(!!zoneData && !game && !gameLoading && !(zoneEditor?.active && !zoneEditor.only));      // чертежът на зоната е за лобито, не за играта
  if (zoneEditor?.active) { try { zoneEditor.update(dt); } catch (e) { console.error('zone', e); } }
  if (panel.mesh.visible) {
    if (!panelPlaced) placePanel();
    if (panelUntil && now > panelUntil) panel.mesh.visible = false;
  }
  if (backdrop.visible) backdrop.position.copy(cam.getWorldPosition(_v));
  try { fadeStep(cam); coverStep(cam, dt); } catch { /* без преход */ }
  if (!game && showroom?.update) { try { showroom.update(dt, now / 1000); } catch { /* лобито е украса */ } }
  if (game) {
    if (now > shadowDue) { shadowDue = now + (renderer.xr.isPresenting ? 1000 : 250); refreshShadows(); }   // сянката се обновява рядко
    try { game.scene.update(dt, now / 1000); } catch (e) { console.error('scene.update', e); }
    try { game.decor?.update(dt, now / 1000, game.snap); } catch (e) { console.error('decor.update', e); }
  }
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// за автоматични проби от конзолата
window.__arena = { frame, build: BUILD, scene, renderer, me, hands, head, players, desk, camera, arena, get anchor() { return anchorState; }, get space() { return spaceType; }, act: msg => send({ type: 'act', ...msg }), get presenting() { return renderer.xr.isPresenting; }, get zoneActive() { return !!zoneEditor?.active; }, get zone() { return zoneEditor?.debug || null; }, get pendingZone() { return !!pendingZone; }, get calib() { return calib; }, get game() { return game; }, get ctx() { return ctx; }, get connected() { return connected; } };

boot();

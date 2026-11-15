// models.js: тънкият слой между сцената и моделите на „Задната стая" (docs/SPEC.md т. 9 и т. 11).
//
//  - makeModel пита първо доставчика (Synty, през setAssetProvider). Ако той няма модел,
//    връща сива кутия с размера от т. 3, за да не се чупи сцената.
//  - Тук се рисуват само показанията, които никой модел не носи (makeIndicator):
//    игла, зона и лампи на burner; лента на packer; рецепта на mixer; текст на sign;
//    търпение на customer. Плюс знакът за свободно гнездо (slotMarker).
//  - THREE се подава отвън, тук няма import. Показанията са MeshBasicMaterial: четат се и на тъмно.

export const KINDS = [
  'bun_bottom', 'bun_top', 'patty', 'cheese', 'lettuce', 'plate', 'fries', 'cup',
  'ing_a', 'ing_b', 'ing_c', 'ing_d', 'beaker', 'tray', 'bag',
  'bin', 'grill', 'fryer', 'drinks', 'prep', 'counter', 'trash',
  'mixer', 'burner', 'packer', 'hatch', 'wall', 'door', 'shutter', 'sign',
  'customer',
];

// Размери от т. 3: ширина, височина, дълбочина (м).
const SIZE = {
  bun_bottom: [0.11, 0.03, 0.11], bun_top: [0.11, 0.05, 0.11], patty: [0.10, 0.02, 0.10],
  cheese: [0.10, 0.01, 0.10], lettuce: [0.11, 0.015, 0.11], plate: [0.22, 0.02, 0.22],
  fries: [0.09, 0.12, 0.06], cup: [0.07, 0.12, 0.07],
  ing_a: [0.07, 0.07, 0.07], ing_b: [0.07, 0.07, 0.07], ing_c: [0.07, 0.07, 0.07], ing_d: [0.07, 0.07, 0.07],
  beaker: [0.12, 0.16, 0.12], tray: [0.26, 0.03, 0.18], bag: [0.08, 0.10, 0.04],
  bin: [0.30, 0.85, 0.30], grill: [0.70, 0.85, 0.50], fryer: [0.45, 0.85, 0.50],
  drinks: [0.50, 1.40, 0.40], prep: [0.80, 0.85, 0.50], counter: [3.0, 0.85, 0.50],
  trash: [0.35, 0.60, 0.35], mixer: [0.60, 0.85, 0.50], burner: [0.50, 0.85, 0.50],
  packer: [0.70, 0.85, 0.50], hatch: [0.40, 0.40, 0.20], wall: [2.4, 2.2, 0.10],
  door: [1.20, 2.0, 0.08], shutter: [3.0, 1.2, 0.05], sign: [1.6, 0.5, 0.05],
  customer: [0.45, 1.70, 0.30],
};

const ING = ['ing_a', 'ing_b', 'ing_c', 'ing_d'];
const ING_COLOR = { ing_a: 0xf2c81e, ing_b: 0xe2416f, ing_c: 0x3d8bf2, ing_d: 0x58c245 };
const ING_LETTER = { ing_a: 'А', ing_b: 'Б', ing_c: 'В', ing_d: 'Г' };
const GREY = 0x8b8e91;
import { SKIN, onSkin, panel as skinPanel } from './ui-skin.js';

const FONT = '"Sofia Sans", "Segoe UI", "Noto Sans", Roboto, system-ui, sans-serif';

// Цветове на показанията. Нощна: тъмна плоча, лайм и кехлибар. Детска: виолетова плоча, мента и розово.
const PAL = {
  night: {
    plate: 0x15171a, rim: 0x464c53, face: 0x22262b, track: 0x363c43, tick: 0x9aa0a6,
    ok: 0xa6ff5c, okDim: 0x2f9a47, warn: 0xffb52e, bad: 0xff4a36, off: 0x2a312e,
    needle: 0xff5a3c, hub: 0xe9e4d2, ink: 0x111315, white: 0xf4f1e6,
    signBg: '#15110d', signFg: '#ffb648', signLine: '#7a5520', signGlow: 'rgba(255,170,60,0.55)',
  },
  kids: {
    plate: 0x2a1b60, rim: 0x8f73ff, face: 0x372579, track: 0x4c3a9c, tick: 0xc3b6f5,
    ok: 0x74ffb4, okDim: 0x2f9a78, warn: 0xffd84a, bad: 0xff5c8a, off: 0x3b2d7a,
    needle: 0xff5c8a, hub: 0xffffff, ink: 0x1c1242, white: 0xffffff,
    signBg: '#fff5e4', signFg: '#5a1fd0', signLine: '#ff6fa5', signGlow: 'rgba(0,0,0,0)',
  },
};

const TAU = Math.PI * 2;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const Z = k => k * 0.001;                         // слоеве върху плочата през 1 мм

// ---------- вътрешно състояние (общ кеш на модула) ----------
let T = null;
let provider = null;
let matInd = null, matBox = null, matLetters = null, lettersCv = null, lettersTex = null;
let ringGeo = null;
const boxCache = new Map(), planeCache = new Map(), needleCache = new Map(), colCache = new Map();
const warned = new Set();
let fontEpoch = 0;
onSkin(() => { fontEpoch++; });      // новата кожа на таблата: надписите се рисуват наново

if (typeof document !== 'undefined' && document.fonts) {
  const bump = () => { fontEpoch++; if (lettersCv) { drawLetters(); lettersTex.needsUpdate = true; } };
  document.fonts.ready.then(bump).catch(() => {});
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', bump);
}

function use(THREE) {
  if (T === THREE) return;
  T = THREE;
  matInd = matBox = matLetters = lettersCv = lettersTex = ringGeo = null;
  boxCache.clear(); planeCache.clear(); needleCache.clear(); colCache.clear();
}

function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[models] ' + key, err);
}

function lin(hex) {                               // sRGB hex → линейни r, g, b за цвят по върхове
  let c = colCache.get(hex);
  if (!c) { const k = new T.Color(hex); c = [k.r, k.g, k.b]; colCache.set(hex, c); }
  return c;
}

function mixHex(a, b, t) {
  const ch = s => Math.round((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function luma(hex) { return ((hex >> 16 & 255) * 0.299 + (hex >> 8 & 255) * 0.587 + (hex & 255) * 0.114) / 255; }

function ease(cur, target, dt, rate) {            // без dt (или първи път): направо на мястото
  if (cur == null || dt == null || !(dt >= 0)) return target;
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

function sizeOf(kind, o) {
  const s = SIZE[kind] || [0.2, 0.2, 0.2];
  const pick = (v, d) => (typeof v === 'number' && v > 0 ? v : d);
  return [pick(o.w, s[0]), pick(o.h, s[1]), pick(o.d, s[2])];
}

function indMat() {
  return matInd || (matInd = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
}

function boxMat() {
  return matBox || (matBox = new T.MeshLambertMaterial({ vertexColors: true }));
}

// ---------- доставчик на истински модели (т. 11) ----------
export function setAssetProvider(p) {
  provider = p || null;
}

// ---------- makeModel ----------
export function makeModel(THREE, kind, opts) {
  use(THREE);
  const o = opts || {};
  if (provider && typeof provider.make === 'function') {
    try {
      const got = provider.make(THREE, kind, o);
      if (got && got.isObject3D) {
        got.userData.provided = true;
        got.userData.kind = kind;
        return got;
      }
    } catch (err) { warnOnce('provider.make ' + kind, err); }
  }
  return placeholder(kind, o);
}

function boxGeo(w, h, d, hex) {
  const key = [w, h, d].map(v => Math.round(v * 1000)).join('x') + '|' + hex;
  let g = boxCache.get(key);
  if (!g) {
    g = new T.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);                     // началото е в центъра на основата
    const k = lin(hex), n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(k, i * 3);
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    boxCache.set(key, g);
  }
  return g;
}

// Заместител: гола кутия с размера от т. 3. Видовете с показание си го носят и тук.
function placeholder(kind, o) {
  const size = sizeOf(kind, o);
  const root = new T.Group();
  root.name = String(kind);
  const body = new T.Mesh(boxGeo(size[0], size[1], size[2], ING_COLOR[kind] || GREY), boxMat());
  root.add(body);
  Object.assign(root.userData, { kind, placeholder: true, size });       // тялото е children[0]
  if (IND[kind]) {
    try {
      const ind = makeIndicator(T, kind, o);
      if (ind) { root.add(ind); root.userData.indicator = ind; }
    } catch (err) { warnOnce('indicator ' + kind, err); }
  }
  return root;
}

function placeholderState(obj, s, dt) {           // само врата и ролетка: да се вижда отворено ли е
  const ud = obj.userData;
  if (!ud.placeholder || !s || s.open == null) return;
  if (ud.kind !== 'door' && ud.kind !== 'shutter') return;
  ud.open = ease(ud.open, clamp01(+s.open || 0), dt, 8);
  const b = obj.children[0];
  if (!b) return;
  if (ud.kind === 'door') b.position.x = ud.open * ud.size[0] * 1.02;
  else { const sy = Math.max(0.05, 1 - ud.open); b.scale.y = sy; b.position.y = ud.size[1] * (1 - sy); }
}

// ---------- setModelState ----------
export function setModelState(THREE, obj, kind, state, dt) {
  if (!obj || !obj.userData) return;
  use(THREE);
  const ud = obj.userData;
  if (ud.brInd) { drive(obj, state, dt); return; }             // подаден е самият уред
  if (ud.provided) {
    if (provider && typeof provider.setState === 'function') {
      try { if (provider.setState(THREE, obj, kind, state, dt)) return; }
      catch (err) { warnOnce('provider.setState ' + kind, err); }
    }
    if (ud.indicator) drive(ud.indicator, state, dt);
    return;
  }
  if (ud.indicator) drive(ud.indicator, state, dt);
  placeholderState(obj, state, dt);
}

function drive(ind, state, dt) {
  const u = ind && ind.userData && ind.userData.brInd;
  if (!u || !state) return;
  try { u.update(state, dt); } catch (err) { warnOnce('indicator.update ' + u.kind, err); }
}

// ---------- малка геометрия, която се пренаписва на място ----------
// Всичко е в равнината XY на плочата и гледа към +Z. Без нормали: материалът е Basic.
const SOLID_U = 0.1, SOLID_V = 0.5;               // бялото поле в листа с буквите

class Buf {
  constructor(maxTris, uv) {
    const n = maxTris * 3;
    this.max = n; this.n = 0; this.k = [1, 1, 1];
    this.P = new Float32Array(n * 3);
    this.C = new Float32Array(n * 3);
    this.U = uv ? new Float32Array(n * 2) : null;
    this.geo = new T.BufferGeometry();
    this.geo.setAttribute('position', new T.BufferAttribute(this.P, 3));
    this.geo.setAttribute('color', new T.BufferAttribute(this.C, 3));
    if (uv) this.geo.setAttribute('uv', new T.BufferAttribute(this.U, 2));
  }
  begin() { this.n = 0; return this; }
  col(hex, f = 1) { const k = lin(hex); this.k = f === 1 ? k : [k[0] * f, k[1] * f, k[2] * f]; return this; }
  v(x, y, z, u = SOLID_U, w = SOLID_V) {
    const i = this.n;
    if (i >= this.max) return this;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
    this.C[i * 3] = this.k[0]; this.C[i * 3 + 1] = this.k[1]; this.C[i * 3 + 2] = this.k[2];
    if (this.U) { this.U[i * 2] = u; this.U[i * 2 + 1] = w; }
    this.n = i + 1;
    return this;
  }
  quad(x0, y0, x1, y1, z = 0, uv) {               // гледа към +Z; uv: [u0, v0, u1, v1]
    const [u0, v0, u1, v1] = uv || [SOLID_U, SOLID_V, SOLID_U, SOLID_V];
    return this.v(x0, y0, z, u0, v0).v(x1, y0, z, u1, v0).v(x1, y1, z, u1, v1)
      .v(x0, y0, z, u0, v0).v(x1, y1, z, u1, v1).v(x0, y1, z, u0, v1);
  }
  back(x0, y0, x1, y1, z = 0) {                   // гледа към −Z
    return this.v(x1, y0, z).v(x0, y0, z).v(x0, y1, z).v(x1, y0, z).v(x0, y1, z).v(x1, y1, z);
  }
  quad3(a, b, c, d) {                             // четири точки обратно на часовника
    return this.v(a[0], a[1], a[2]).v(b[0], b[1], b[2]).v(c[0], c[1], c[2])
      .v(a[0], a[1], a[2]).v(c[0], c[1], c[2]).v(d[0], d[1], d[2]);
  }
  arc(cx, cy, r0, r1, a0, a1, z = 0, seg = 12) {  // дъга или диск (r0 = 0); ъглите растат обратно на часовника
    for (let i = 0; i < seg; i++) {
      const a = a0 + (a1 - a0) * i / seg, b = a0 + (a1 - a0) * (i + 1) / seg;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      this.v(cx + r0 * ca, cy + r0 * sa, z).v(cx + r1 * ca, cy + r1 * sa, z).v(cx + r1 * cb, cy + r1 * sb, z);
      if (r0 > 0) this.v(cx + r0 * ca, cy + r0 * sa, z).v(cx + r1 * cb, cy + r1 * sb, z).v(cx + r0 * cb, cy + r0 * sb, z);
    }
    return this;
  }
  cube(x0, y0, z0, x1, y1, z1, hex) {             // кубче с изпечени тонове: чете се като обем и без светлина
    this.col(mixHex(hex, 0xffffff, 0.22)).quad3([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);   // горе
    this.col(hex, 0.6).quad3([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);                     // дясно
    this.col(hex, 0.6).quad3([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);                     // ляво
    this.col(hex, 0.42).quad3([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);                    // долу
    return this.col(hex).quad(x0, y0, x1, y1, z1);                                                        // лице
  }
  end() {
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    if (this.U) this.geo.attributes.uv.needsUpdate = true;
    return this;
  }
}

// Плоча с рамка, гръб и краче до плота. Крачето е в равнината на плочата (от y = 0 до y0).
function plateOn(buf, P, x0, y0, x1, y1) {
  if (y0 > 0.001) {
    buf.col(P.rim).quad(-0.02, 0, 0.02, y0 + 0.004, Z(0));
    buf.col(P.plate).back(-0.02, 0, 0.02, y0 + 0.004, Z(-1));
  }
  buf.col(P.rim).quad(x0, y0, x1, y1, Z(0));
  buf.col(P.plate).quad(x0 + 0.006, y0 + 0.006, x1 - 0.006, y1 - 0.006, Z(1));
  buf.col(P.plate).back(x0, y0, x1, y1, Z(-1));
}

// Общата рамка на едно показание: root е с началото на станцията, panel е плочата.
// opts: x, y, z (къде е долният ръб на плочата), tilt (наклон назад, рад), yaw, scale, stem (краче, м).
function frame(kind, o, def) {
  const [, h, d] = sizeOf(kind, o);
  const root = new T.Group();
  root.name = kind + '-indicator';
  const panel = new T.Group();
  panel.rotation.order = 'YXZ';
  panel.position.set(o.x ?? 0, o.y ?? def.y(h), o.z ?? def.z(d));
  panel.rotation.set(-(o.tilt ?? def.tilt), o.yaw ?? 0, 0);
  if (typeof o.scale === 'number' && o.scale > 0) panel.scale.setScalar(o.scale);
  root.add(panel);
  return { root, panel, P: PAL[o.theme === 'kids' ? 'kids' : 'night'] };
}

const ON_TOP = { y: h => h, z: d => -d / 2 + 0.085, tilt: 0.22 };   // стои на задния ръб на плота, леко наклонена назад

function finish(root, kind, mesh, cx, cy, r, update) {
  if (mesh) mesh.geometry.boundingSphere = new T.Sphere(new T.Vector3(cx, cy, 0), r);
  root.userData.brInd = { kind, update };
  return root;
}

// ---------- burner: игла, зона, три лампи ----------
function needleGeo(P) {
  let g = needleCache.get(P);
  if (!g) {
    const b = new Buf(24);
    b.col(P.needle).quad3([-0.008, -0.018, 0], [0.008, -0.018, 0], [0.003, 0.106, 0], [-0.003, 0.106, 0]);
    b.col(P.ink).arc(0, 0, 0, 0.017, 0, TAU, Z(1), 10);
    b.col(P.hub).arc(0, 0, 0, 0.011, 0, TAU, Z(2), 10);
    b.end();
    b.geo.boundingSphere = new T.Sphere(new T.Vector3(0, 0.045, 0), 0.07);
    g = b.geo;
    needleCache.set(P, g);
  }
  return g;
}

function burnerInd(o) {
  const { root, panel, P } = frame('burner', o, ON_TOP);
  const s = o.stem ?? 0.10, cy = s + 0.062, R = 0.118;
  const buf = new Buf(190), mesh = new T.Mesh(buf.geo, indMat());
  const needle = new T.Mesh(needleGeo(P), indMat());
  needle.position.set(0, cy, Z(6));
  panel.add(mesh, needle);
  const st = { needle: 0.5, cur: null, a: 0.4, b: 0.6, hits: 0, hot: false };

  function draw() {
    buf.begin();
    plateOn(buf, P, -0.15, s, 0.15, s + 0.20);
    buf.col(P.face).arc(0, cy, 0, R, 0, Math.PI, Z(2), 20);
    buf.col(P.track).arc(0, cy, 0.078, 0.108, 0, Math.PI, Z(3), 20);
    const a0 = Math.PI * (1 - st.b), a1 = Math.PI * (1 - st.a);          // 0 е вляво, 1 е вдясно
    if (st.hot) buf.col(P.ok).arc(0, cy, 0.071, 0.115, a0, a1, Z(4), 8);
    else buf.col(P.okDim).arc(0, cy, 0.078, 0.108, a0, a1, Z(4), 8);
    buf.col(P.tick);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const a = Math.PI * (1 - v) * 0.97 + 0.015 * Math.PI;              // крайните чертички да не излизат под оста
      buf.arc(0, cy, 0.110, R, a - 0.022, a + 0.022, Z(5), 1);
    }
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * 0.05, y = s + 0.025;
      buf.col(P.rim).arc(x, y, 0, 0.019, 0, TAU, Z(2), 12);
      buf.col(k < st.hits ? P.ok : P.off).arc(x, y, 0, 0.0145, 0, TAU, Z(3), 12);
    }
    buf.end();
  }

  function update(state, dt) {
    let dirty = false;
    if (Array.isArray(state.zone) && state.zone.length >= 2) {
      const a = clamp01(Math.min(+state.zone[0], +state.zone[1]) || 0), b = clamp01(Math.max(+state.zone[0], +state.zone[1]) || 0);
      if (a !== st.a || b !== st.b) { st.a = a; st.b = b; dirty = true; }
    }
    if (state.hits != null) {
      const h = Math.max(0, Math.min(3, Math.round(+state.hits || 0)));
      if (h !== st.hits) { st.hits = h; dirty = true; }
    }
    if (state.needle != null) st.needle = clamp01(+state.needle || 0);
    st.cur = ease(st.cur, st.needle, dt, 30);
    needle.rotation.z = (0.5 - st.cur) * Math.PI;
    const hot = st.cur >= st.a && st.cur <= st.b;                        // иглата е в зоната: дъгата светва
    if (hot !== st.hot) { st.hot = hot; dirty = true; }
    if (dirty) draw();
  }

  draw();
  st.cur = st.needle;
  return finish(root, 'burner', mesh, 0, s / 2 + 0.10, 0.24, update);
}

// ---------- packer: лента от четири деления ----------
function packerInd(o) {
  const { root, panel, P } = frame('packer', o, ON_TOP);
  const s = o.stem ?? 0.10;
  const buf = new Buf(40), mesh = new T.Mesh(buf.geo, indMat());
  panel.add(mesh);
  const st = { target: 0, cur: null, drawn: -1 };

  function draw() {
    buf.begin();
    plateOn(buf, P, -0.17, s, 0.17, s + 0.10);
    for (let k = 0; k < 4; k++) {
      const x = -0.151 + k * 0.078, f = clamp01(st.cur * 4 - k);
      buf.col(P.track).quad(x, s + 0.024, x + 0.068, s + 0.076, Z(2));
      if (f > 0.01) buf.col(st.cur >= 0.995 ? P.ok : mixHex(P.warn, P.ok, st.cur)).quad(x, s + 0.024, x + 0.068 * f, s + 0.076, Z(3));
    }
    buf.end();
    st.drawn = st.cur;
  }

  function update(state, dt) {
    if (state.progress != null) st.target = clamp01(+state.progress || 0);
    st.cur = ease(st.cur, st.target, dt, 12);
    if (Math.abs(st.cur - st.target) < 0.002) st.cur = st.target;
    if (Math.abs(st.cur - st.drawn) > 0.002) draw();
  }

  st.cur = 0;
  draw();
  st.cur = null;
  return finish(root, 'packer', mesh, 0, s / 2 + 0.05, 0.21, update);
}

// ---------- mixer: рецептата като цветни кубчета с букви, отляво надясно ----------
function drawLetters() {
  const c = lettersCv.getContext('2d');
  c.clearRect(0, 0, 640, 128);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, 128, 128);                     // плътно бяло поле за всичко без буква
  c.font = '800 108px ' + FONT;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  ING.forEach((k, i) => {
    const m = c.measureText(ING_LETTER[k]);
    c.fillText(ING_LETTER[k], 128 * (i + 1) + 64, 64 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  });
}

function lettersMat() {
  if (matLetters) return matLetters;
  if (typeof document === 'undefined') return null;
  lettersCv = document.createElement('canvas');
  lettersCv.width = 640; lettersCv.height = 128;
  drawLetters();
  lettersTex = new T.CanvasTexture(lettersCv);
  lettersTex.colorSpace = T.SRGBColorSpace;
  lettersTex.anisotropy = 4;
  matLetters = new T.MeshBasicMaterial({ vertexColors: true, map: lettersTex, alphaTest: 0.45, toneMapped: false, fog: false });
  return matLetters;
}

function mixerInd(o) {
  const { root, panel, P } = frame('mixer', o, ON_TOP);
  const s = o.stem ?? 0.10;
  const colors = Object.assign({}, ING_COLOR, o.colors || {});
  const lm = o.letters === false ? null : lettersMat();
  const buf = new Buf(150, true), mesh = new T.Mesh(buf.geo, lm || indMat());
  panel.add(mesh);
  const st = { key: null, recipe: [] };

  function draw() {
    const r = st.recipe, n = Math.max(4, r.length), pitch = 0.32 / n, c = Math.min(0.06, pitch - 0.016);
    buf.begin();
    plateOn(buf, P, -0.18, s, 0.18, s + 0.15);
    for (let k = 0; k < n; k++) {
      const x = -0.16 + pitch * (k + 0.5), y = s + 0.088;
      buf.col(P.face).quad(x - c / 2 - 0.005, y - c / 2 - 0.005, x + c / 2 + 0.005, y + c / 2 + 0.005, Z(2));   // гнездо
      const live = k < r.length;
      buf.col(live ? P.tick : P.track);
      for (let j = 0; j <= k; j++) {                                      // поредният номер с точки отдолу
        const px = x + (j - k / 2) * 0.014;
        buf.quad(px - 0.005, s + 0.022, px + 0.005, s + 0.032, Z(2));
      }
      if (!live) continue;
      const hex = colors[r[k]] ?? GREY, i = ING.indexOf(r[k]);
      buf.cube(x - c / 2, y - c / 2, Z(2), x + c / 2, y + c / 2, c * 0.8, hex);
      if (lm && i >= 0) {
        const u = (i + 1) / 5, q = c * 0.38;
        buf.col(luma(hex) > 0.55 ? P.ink : 0xffffff).quad(x - q, y - q, x + q, y + q, c * 0.8 + Z(1), [u, 0, u + 0.2, 1]);
      }
    }
    buf.end();
  }

  function update(state) {
    if (!Array.isArray(state.recipe)) return;
    const key = state.recipe.join(',');
    if (key === st.key) return;
    st.key = key;
    st.recipe = state.recipe.slice(0, 6);
    draw();
  }

  draw();
  return finish(root, 'mixer', mesh, 0, s / 2 + 0.075, 0.24, update);
}

// ---------- sign: текст върху платно ----------
function wrapText(c, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word;
      if (line && c.measureText(t).width > maxW) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function drawSign(cv, P, text, kids) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, u = H / 100;
  c.shadowBlur = 0;
  skinPanel(c, 0, 0, W, H, { border: Math.min(H * 0.2, 46) });
  const maxW = W - u * 26, maxH = H - u * 24;
  let size = Math.round(H * 0.56), lines = [''];
  for (; size >= 18; size -= 4) {                  // най-едрият шрифт, при който текстът се побира
    c.font = '700 ' + size + 'px ' + FONT;
    lines = wrapText(c, text, maxW);
    if (lines.length * size * 1.14 <= maxH && lines.every(l => c.measureText(l).width <= maxW)) break;
  }
  c.fillStyle = SKIN.ink;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const lh = size * 1.14, y0 = H / 2 - (lines.length - 1) * lh / 2 + size * 0.05;
  lines.forEach((l, i) => c.fillText(l, W / 2, y0 + i * lh));
  c.shadowBlur = 0;
}

function planeGeo(w, h) {
  const key = Math.round(w * 1000) + 'x' + Math.round(h * 1000);
  let g = planeCache.get(key);
  if (!g) { g = new T.PlaneGeometry(w, h); planeCache.set(key, g); }
  return g;
}

function signInd(o) {
  const [w, h] = sizeOf('sign', o);
  const { root, panel, P } = frame('sign', o, { y: hh => hh / 2, z: d => d / 2 + 0.003, tilt: 0 });
  const kids = o.theme === 'kids', pw = Math.max(0.1, w - 0.04), ph = Math.max(0.05, h - 0.04);
  let cv = null, tex = null, mat;
  if (typeof document !== 'undefined') {
    cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = Math.max(64, Math.round(1024 * ph / pw / 4) * 4);
    tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    mat = new T.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false, alphaTest: 0.5 });
  } else mat = indMat();
  const mesh = new T.Mesh(planeGeo(pw, ph), mat);
  panel.add(mesh);
  const st = { text: null, epoch: -1 };

  function update(state) {
    const text = state.text === undefined ? st.text ?? '' : String(state.text ?? '');
    if (text === st.text && st.epoch === fontEpoch) return;      // платното се прерисува само при нов текст
    st.text = text; st.epoch = fontEpoch;
    if (!cv) return;
    if (document.fonts && document.fonts.load) document.fonts.load('700 48px "Sofia Sans"', text || 'А').catch(() => {});
    drawSign(cv, P, text, kids);
    tex.needsUpdate = true;
  }

  update({ text: o.text ?? '' });
  root.userData.brInd = { kind: 'sign', update };
  root.userData.canvas = cv;
  return root;
}

// ---------- customer: лента за търпението над главата ----------
function customerInd(o) {
  const { root, panel, P } = frame('customer', o, { y: h => h + 0.22, z: () => 0, tilt: 0 });
  const buf = new Buf(8), mesh = new T.Mesh(buf.geo, indMat());
  panel.add(mesh);
  const W = 0.17, HH = 0.026;
  const st = { state: undefined, pat: 1, cur: null, drawn: -1, t: 0, blink: false };

  function draw() {
    const p = st.cur;
    const hex = p > 0.5 ? mixHex(P.warn, P.ok, (p - 0.5) * 2) : mixHex(P.bad, P.warn, p * 2);
    buf.begin();
    buf.col(P.rim).quad(-W, -HH, W, HH, Z(0));
    buf.col(P.plate).quad(-W + 0.006, -HH + 0.006, W - 0.006, HH - 0.006, Z(1));
    buf.col(P.plate).back(-W, -HH, W, HH, Z(-1));
    if (p > 0.005) buf.col(hex, st.blink ? 0.45 : 1).quad(-W + 0.009, -HH + 0.009, -W + 0.009 + (2 * W - 0.018) * p, HH - 0.009, Z(2));
    buf.end();
    st.drawn = p;
  }

  function update(state, dt) {
    if (state.state !== undefined) st.state = state.state;
    if (state.patience != null) st.pat = clamp01(+state.patience || 0);
    panel.visible = st.state == null || st.state === 'wait';     // идва, доволен, сърдит, тръгва си: без лента
    if (!panel.visible) return;
    st.cur = ease(st.cur, st.pat, dt, 10);
    st.t += dt > 0 ? dt : 0;
    const blink = st.cur < 0.2 && Math.sin(st.t * 12) < 0;        // под 20%: мига
    if (blink !== st.blink || Math.abs(st.cur - st.drawn) > 0.003) { st.blink = blink; draw(); }
  }

  st.cur = 1;
  draw();
  st.cur = null;
  return finish(root, 'customer', mesh, 0, 0, 0.19, update);
}

const IND = { burner: burnerInd, packer: packerInd, mixer: mixerInd, sign: signInd, customer: customerInd };

// Само показанието на вид (burner, packer, mixer, sign, customer) като отделен Object3D
// със същото начало като станцията. За другите видове връща null.
// opts: theme; w, h, d (размерът на тялото, върху което стои); x, y, z; tilt; yaw; scale; stem;
//       text (sign); colors { ing_a: 0x… } и letters: false (mixer).
export function makeIndicator(THREE, kind, opts) {
  use(THREE);
  const make = IND[kind];
  return make ? make(opts || {}) : null;
}

// ---------- знак за свободно гнездо: тънък пръстен, легнал на плота ----------
export function slotMarker(THREE) {
  use(THREE);
  if (!ringGeo) {
    const b = new Buf(64);
    b.col(0xf1f4e4).arc(0, 0, 0.053, 0.060, 0, TAU, 0, 32);
    b.end();
    ringGeo = b.geo;
    ringGeo.rotateX(-Math.PI / 2);                // от равнината XY в равнината на плота, лицето нагоре
    ringGeo.translate(0, 0.003, 0);
    ringGeo.computeBoundingSphere();
  }
  const m = new T.Mesh(ringGeo, indMat());
  m.name = 'slot-marker';
  return m;
}

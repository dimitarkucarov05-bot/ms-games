// scene.js: клиентската сцена на „Задната стая" (docs/SPEC.md, т. 10).
// Не внася three: всичко идва през ctx.THREE. Моделите идват от ./models.js; ако го няма, рисува кутии.
//
// Как се пести рисуването (Quest 2: около 100 draw calls):
//   * Всичко неподвижно (под, стени, станции без състояние) се слива в една геометрия с цвят по върховете.
//   * Предмет, клиент и поръчка се рисуват от „изпечена" геометрия: моделът от models.js се слива в 1 до 2 меша
//     и се пази в кеш по (kind + закръглено състояние). Пица с всичките си добавки е един draw call.
//   * Станция със състояние е жив модел, докато състоянието ѝ се мени; щом се успокои, също се изпича.
//   * Пръстени, ленти за търпение, искри и надписи са по един общ меш.

import { createHud, hudLayout, roomsOf, wallsOf } from './hud.js';

const SURFACE_Y = 0.85;
const REACH = 0.55;        // рафт с продукт
const GRAB_R = 0.30;       // свободен предмет
const SLOT_R = 0.45;       // гнездо при пускане
const STACK_R = 0.38;      // сурова пица, върху която ляга добавка
const USE_R = { button: 0.20, grinder: 0.30, shutter: 0.26, way: 0.32 };
const TAP_R = { drinks: 0.15, stash: 0.11, bench: 0.13 };
const ROT_KINDS = new Set(['blue', 'clear', 'red', 'green', 'yellow', 'plant', 'pills', 'candy', 'syrup', 'seeds', 'cup']);      // held upright in the fist: they turn with the hand
const ROT_FLAT = new Set(['joint']);      // long things held between the fingers: they point where the hand points
const LIQ = new Set(['blue', 'clear', 'red', 'green', 'yellow']);
const LIQ_HEX = [0x2f6dff, 0xcfd6de, 0xff5a3c, 0x58d86a, 0xffd23c], LIQ_WORD = ['blue', 'solvent', 'catalyst', 'acid', 'syrup base'];
const NAME = { blue: 'Blue base', clear: 'Solvent', red: 'Catalyst', green: 'Acid', yellow: 'Syrup base', papers: 'Papers', seeds: 'Seeds', box: 'Carry box',
  ice: 'Blue ice', pills: 'Pills', powder: 'Powder', crystal: 'Crystal', candy: 'Candy', syrup: 'Syrup', buds: 'Bud', joint: 'Joint', brick: 'Brick', tray: 'Tray' };
/** where packet i lies in the carry box (the same grid as BOX_CELL of synty-kinds.js) */
const BOX_CELL = i => [(-2 + (i % 5)) * 0.1, 0.045, (-1 + Math.floor(i / 5) % 3) * 0.088];
const FX_NAME = { mellow: 'MELLOW', rush: 'RUSH', charm: 'CHARM', focus: 'FOCUS' };
const FX_HEX = { mellow: 0x8fe07a, rush: 0x4f9bff, charm: 0xff7ac8, focus: 0xffe27a };
const FX_SHORT = { mellow: 'MELLOW: customers wait longer', rush: 'RUSH: machines twice as fast', charm: 'CHARM: sales pay x1.5', focus: 'FOCUS: always pure' };
const STOP = ['SHOP', 'CELLAR', 'STREET'];
const DRINK_NAME = { cola: 'COLA', orange: 'ORANGE' }, DRINK_TAP = ['cola', 'orange'];
const FONT_XC = '"Sofia Sans XC", "Sofia Sans", "Segoe UI", sans-serif';      // a station with several things to press: the hand must be at the one it means      // копче и лост: ръката трябва да е при самото копче
const PREDICT_S = 0.4;     // колко се чака сървърът да потвърди
const IDLE_BAKE_S = 0.6;   // станция без промяна толкова време се изпича
const CACHE_MAX = 96;

const SIZES = {
  pizza: [0.58, 0.05, 0.58], sauce: [0.14, 0.03, 0.11], cheese: [0.12, 0.10, 0.28], veg: [0.18, 0.07, 0.15], meat: [0.11, 0.05, 0.11],
  cup: [0.07, 0.12, 0.07], tray: [0.76, 0.13, 0.57], meatbox: [0.76, 0.20, 0.57],
  white: [0.14, 0.03, 0.11], mustard: [0.14, 0.03, 0.11], shrimp: [0.15, 0.06, 0.20], ham: [0.12, 0.04, 0.16], bacon: [0.07, 0.03, 0.32],
  pineapple: [0.19, 0.02, 0.19], onion: [0.11, 0.07, 0.27], greens: [0.24, 0.06, 0.24],
  plant: [0.30, 1.24, 0.30], seeds: [0.07, 0.13, 0.07], papers: [0.10, 0.13, 0.04], blue: [0.17, 0.34, 0.17], clear: [0.15, 0.34, 0.15], red: [0.17, 0.41, 0.17],
  buds: [0.09, 0.07, 0.10], joint: [0.03, 0.02, 0.21], ice: [0.17, 0.07, 0.25], pills: [0.10, 0.17, 0.10], powder: [0.17, 0.07, 0.25],
  green: [0.23, 0.31, 0.11], yellow: [0.19, 0.36, 0.07], crystal: [0.17, 0.07, 0.25], candy: [0.10, 0.17, 0.10], syrup: [0.07, 0.13, 0.07], way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24],
  brick: [0.39, 0.35, 0.28],
  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40], box: [0.55, 0.29, 0.31], screen: [1.55, 0.98, 0.10],
  bin: [0.30, 0.85, 0.30], oven: [0.70, 0.85, 0.50], drinks: [0.50, 1.40, 0.40],
  prep: [0.80, 0.85, 0.50], counter: [6, 0.85, 0.50], trash: [0.35, 0.60, 0.35], grinder: [0.60, 0.85, 0.50], hopper: [0.70, 1.60, 0.50],
  wall: [2.4, 2.6, 0.10], door: [1.20, 2.0, 0.08], shutter: [6, 1.2, 0.05], sign: [1.6, 0.5, 0.05], customer: [0.45, 1.70, 0.30],
  elevator: [1.6, 2.3, 1.6], button: [0.14, 0.10, 0.06], cover: [1.0, 0.05, 1.0], crate: [0.5, 0.4, 0.4],
};
const PARTS = new Set(['sauce', 'white', 'mustard', 'cheese', 'veg', 'meat', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion', 'greens']);
const USE_KINDS = new Set(['button', 'grinder', 'elevator', 'drinks', 'stash', 'bench', 'shutter', 'way']);
const LIVE_KINDS = new Set(['grinder', 'button', 'door', 'shutter', 'sign', 'elevator', 'stash', 'grow', 'bench']);
const PIN_KINDS = new Set(['grinder', 'button']);      // светят и мигат: не се изпичат
const SINK_KINDS = new Set(['trash', 'bin']);          // гнездото им никога не е заето (кошът; рафтът с месото приема тавите)
const DEF_STATE = { pizza: { stack: [], cook: 0, ball: false }, cup: { fill: 0, drink: null }, blue: { shake: 0 }, ice: { pure: 0 }, box: { n: [] } };
const HK = ['l', 'r'];
const T_NONE = 0, T_ITEM = 1, T_BIN = 2, T_USE = 3, T_SLOT = 4, T_STACK = 5;
const M_FREE = 0, M_MINE = 1, M_OTHER = 2, M_DROP = 3;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const angDiff = (to, from) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return d; };
const sameId = (a, b) => a === b || (a != null && b != null && String(a) === String(b));
const q = (v, n) => Math.round((+v || 0) * n);

// ---------- събирач на геометрия ----------

class GeoBuilder {
  constructor(uv = false) { this.p = []; this.n = []; this.c = uv ? null : []; this.uv = uv ? [] : null; this.i = []; this.count = 0; }
  vert(x, y, z, nx, ny, nz, r, g, b, u, v) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz);
    if (this.c) this.c.push(r, g, b); else this.uv.push(u, v);
    return this.count++;
  }
  /** четири точки [x, y, z], обратно на часовника, гледано откъм лицето */
  quad(a, b, c, d, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i0 = this.count;
    this.vert(a[0], a[1], a[2], nx, ny, nz, col[0], col[1], col[2]); this.vert(b[0], b[1], b[2], nx, ny, nz, col[0], col[1], col[2]);
    this.vert(c[0], c[1], c[2], nx, ny, nz, col[0], col[1], col[2]); this.vert(d[0], d[1], d[2], nx, ny, nz, col[0], col[1], col[2]);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  /** кутия с начало в центъра на основата */
  box(cx, y0, cz, w, h, d, col, yaw = 0, bottom = false) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2, y1 = y0 + h;
    const P = (lx, y, lz) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    const A = P(-hw, y0, hd), B = P(hw, y0, hd), C = P(hw, y0, -hd), D = P(-hw, y0, -hd);
    const E = P(-hw, y1, hd), F = P(hw, y1, hd), G = P(hw, y1, -hd), H = P(-hw, y1, -hd);
    this.quad(A, B, F, E, col); this.quad(B, C, G, F, col); this.quad(C, D, H, G, col); this.quad(D, A, E, H, col); this.quad(E, F, G, H, col);
    if (bottom) this.quad(A, D, C, B, col);
  }
  /** добавя геометрия на меш, преместена с матрицата m4 (n3 е нормалната ѝ матрица) */
  addMesh(geo, m4, n3, flip, back, dbl, cr, cg, cb, vc, flat) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, col = vc ? geo.attributes.color : null;
    const uvA = this.uv ? geo.attributes.uv : null, idx = geo.index, e = m4.elements, n = n3.elements;
    const tri = ((idx ? idx.count : pos.count) / 3) | 0;
    const P = [0, 0, 0], N = [0, 0, 0];
    const tp = (i, o) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      o[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; o[1] = e[1] * x + e[5] * y + e[9] * z + e[13]; o[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    };
    const put = (i, nx, ny, nz) => {
      tp(i, P);
      if (this.c) this.vert(P[0], P[1], P[2], nx, ny, nz, col ? cr * col.getX(i) : cr, col ? cg * col.getY(i) : cg, col ? cb * col.getZ(i) : cb);
      else this.vert(P[0], P[1], P[2], nx, ny, nz, 0, 0, 0, uvA ? uvA.getX(i) : 0, uvA ? uvA.getY(i) : 0);
    };
    if (flat || !nor) {
      const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
      for (let t = 0; t < tri; t++) {
        let a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        if (flip) { const s = b; b = c; c = s; }
        tp(a, A); tp(b, B); tp(c, C);
        let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
        let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
        let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        const i0 = this.count;
        put(a, nx, ny, nz); put(b, nx, ny, nz); put(c, nx, ny, nz);
        this.i.push(i0, i0 + 1, i0 + 2);
        if (dbl) { const j = this.count; put(a, -nx, -ny, -nz); put(c, -nx, -ny, -nz); put(b, -nx, -ny, -nz); this.i.push(j, j + 1, j + 2); }
      }
      return;
    }
    const tn = i => {
      const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
      const a = n[0] * x + n[3] * y + n[6] * z, b = n[1] * x + n[4] * y + n[7] * z, c = n[2] * x + n[5] * y + n[8] * z, l = Math.hypot(a, b, c) || 1;
      N[0] = a / l; N[1] = b / l; N[2] = c / l;
    };
    for (let pass = 0; pass < (dbl ? 2 : 1); pass++) {
      const base = this.count, sg = (back ? -1 : 1) * (pass ? -1 : 1), sw = flip !== (pass === 1);
      for (let v = 0; v < pos.count; v++) { tn(v); put(v, N[0] * sg, N[1] * sg, N[2] * sg); }
      for (let t = 0; t < tri; t++) {
        const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        if (sw) this.i.push(base + a, base + c, base + b); else this.i.push(base + a, base + b, base + c);
      }
    }
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    else g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- кутии вместо модели (когато models.js липсва или не знае някой kind) ----------

const BOX = {
  pizza: 0xe8c27a, sauce: 0xd9412a, cheese: 0xf6c445, veg: 0xcbb89a, meat: 0xa8322a, cup: 0xf4f4f0, tray: 0x8f9aa3, meatbox: 0x8a2f2a,
  bin: 0x56616b, oven: 0x8a5a44, drinks: 0xb8412f, prep: 0xb98a5e, counter: 0x9c6b43, trash: 0x2f3a33,
  grinder: 0x4a5a6a, hopper: 0x5a6068, button: 0xd0281e, cover: 0x44484c, crate: 0xb98a5e,
  wall: 0xcfc6b4, door: 0x7a5a3c, shutter: 0x8c9299, sign: 0x1b1c18,
};
const LOOKS = [0xd9634a, 0x4a8fd9, 0x59b36b, 0xd9b84a, 0x9a62c9, 0x4ab8b0];
const mixHex = (a, b, t) => {
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const cookHex = (kind, cook) => {
  const c = Math.round(Math.max(0, Math.min(2, +cook || 0)) * 8) / 8;
  const raw = kind === 'fries' ? 0xf1e3a0 : 0xd98a86, done = kind === 'fries' ? 0xe2a93a : 0x7a4a2a, burnt = 0x241c18;
  return c <= 1 ? mixHex(raw, done, c) : mixHex(done, burnt, c - 1);
};

function makeBoxKit(THREE) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const plane = new THREE.PlaneGeometry(1, 1);
  const mats = new Map(), texs = [];
  const mat = (hex, basic) => {
    const k = (basic ? 'b' : 'l') + hex;
    let m = mats.get(k);
    if (!m) { m = basic ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex }); mats.set(k, m); }
    return m;
  };
  const part = (g, w, h, d, hex, x = 0, y = 0, z = 0, basic = false) => {
    const m = new THREE.Mesh(unit, mat(hex, basic));
    m.scale.set(w, h, d); m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  function make(kind, o = {}) {
    const g = new THREE.Group(), u = g.userData, sz = SIZES[kind] || [0.2, 0.2, 0.2];
    const w = o.w || sz[0], h = o.h || sz[1], d = o.d || sz[2];
    u.w = w; u.h = h; u.d = d;
    switch (kind) {
      case 'customer': {
        part(g, 0.38, 0.74, 0.22, 0x33363c);
        part(g, 0.46, 0.60, 0.28, LOOKS[(o.look | 0) % 6], 0, 0.74, 0);
        part(g, 0.25, 0.27, 0.25, 0xe8b894, 0, 1.39, 0);
        if (o.special) { part(g, 0.36, 0.04, 0.36, 0x18181c, 0, 1.66, 0); part(g, 0.24, 0.1, 0.24, 0x18181c, 0, 1.70, 0); part(g, 0.26, 0.05, 0.02, 0x0e0e12, 0, 1.50, 0.13); }
        break;
      }
      case 'bin': part(g, w, h, d, BOX.bin); part(g, w * 0.78, 0.05, d * 0.78, BOX[o.gives] ?? (o.gives === 'patty' ? 0xd98a86 : o.gives === 'fries' ? 0xe2a93a : 0x999999), 0, h - 0.02, 0); break;
      case 'patty': u.body = part(g, w, h, d, cookHex('patty', 0)); break;
      case 'fries': part(g, w, h * 0.6, d, 0xc9412f); u.body = part(g, w * 0.84, h * 0.45, d * 0.7, cookHex('fries', 0), 0, h * 0.55, 0); break;
      case 'cup': part(g, w, h, d, BOX.cup); u.liq = part(g, w * 1.06, 0.01, d * 1.06, 0x3b1d10, 0, 0.012, 0); u.liq.visible = false; break;
      case 'plate': part(g, w, h, d, BOX.plate); u.stack = []; break;
      case 'beaker':
        u.body = part(g, w * 0.86, h, d * 0.86, BOX.beaker);
        u.layers = [0, 1, 2, 3].map(i => { const m = part(g, w, 0.03, d, 0xffffff, 0, 0.012 + i * 0.033, 0); m.visible = false; return m; });
        break;
      case 'tray': part(g, w, h, d, BOX.tray); u.load = part(g, w * 0.86, 0.022, d * 0.8, 0x5fd0e6, 0, h, 0); break;
      case 'drinks':
        part(g, w, SURFACE_Y, d, BOX.drinks); part(g, w, h - SURFACE_Y, d * 0.4, BOX.drinks, 0, SURFACE_Y, -d * 0.3);
        part(g, 0.09, 0.07, 0.09, 0x3b1d10, -0.125, 1.12, -d * 0.06); part(g, 0.09, 0.07, 0.09, 0xf08a1c, 0.125, 1.12, -d * 0.06);
        break;
      case 'burner':
        part(g, w, h, d, BOX.burner); part(g, 0.36, 0.06, 0.03, 0x101113, 0, h + 0.09, -d / 2 + 0.04);
        u.zone = part(g, 0.08, 0.062, 0.034, 0x3fae5a, 0, h + 0.089, -d / 2 + 0.04, true);
        u.needle = part(g, 0.014, 0.1, 0.04, 0xffffff, 0, h + 0.07, -d / 2 + 0.04, true);
        u.lamps = [0, 1, 2].map(i => part(g, 0.04, 0.04, 0.03, 0x3a3a3a, -0.06 + i * 0.06, h + 0.18, -d / 2 + 0.04, true));
        break;
      case 'mixer':
        part(g, w, h, d, BOX.mixer);
        u.recipe = [0, 1, 2, 3].map(i => { const m = part(g, 0.07, 0.07, 0.03, 0xffffff, -0.135 + i * 0.09, h + 0.1, -d / 2 + 0.04, true); m.visible = false; return m; });
        break;
      case 'packer':
        part(g, w, h, d, BOX.packer); part(g, 0.42, 0.05, 0.03, 0x101113, 0, h + 0.1, -d / 2 + 0.04);
        u.bar = part(g, 0.4, 0.04, 0.034, 0xc8f03c, 0, h + 0.105, -d / 2 + 0.04, true); u.bar.visible = false;
        break;
      case 'trash': part(g, w, h, d, BOX.trash); part(g, w * 0.8, 0.02, d * 0.8, 0x0c100e, 0, h, 0); break;
      case 'hatch': part(g, w, h, d, BOX.hatch); part(g, w * 0.7, h * 0.5, 0.02, 0x08080a, 0, h * 0.25, d / 2); break;
      case 'door': u.body = part(g, w, h, d, BOX.door); break;
      case 'shutter': u.body = part(g, w, h, d, BOX.shutter); break;
      case 'grow': {                                   // леха: сандък с пръст, стръкове и лампа над тях
        part(g, w, h - 0.14, d, 0x6b4a32); part(g, w * 0.94, 0.05, d * 0.86, 0x2a1d15, 0, h - 0.14, 0);
        u.plants = []; u.tips = [];
        for (let i = 0; i < 6; i++) {
          const x = -w * 0.38 + (i % 3) * w * 0.38, z = i < 3 ? -d * 0.18 : d * 0.18;
          u.plants.push(part(g, 0.06, 0.05, 0.06, 0x4caf50, x, h - 0.09, z));
          const t = part(g, 0.09, 0.06, 0.09, 0xff5fa8, x, h, z, true);
          t.visible = false; u.tips.push(t);
        }
        for (const s of [-1, 1]) part(g, 0.03, 0.7, 0.03, 0x2c3238, s * (w / 2 - 0.03), h - 0.14, -d / 2 + 0.04);
        part(g, w, 0.04, 0.12, 0xb06cff, 0, h + 0.56, -d / 2 + 0.07, true);
        break;
      }
      case 'elevator': {                               // кабина: под, таван, три стени, рамка и две крила на вратата към +Z
        const t = 0.05, wall = 0x59636e, trim = 0x2c3238, dw = Math.min(1.0, w - 0.3), dh = Math.min(2.05, h - 0.15);
        part(g, w, 0.03, d, 0x3b4148); part(g, w, t, d, wall, 0, h - t, 0);
        part(g, w, h, t, wall, 0, 0, -d / 2 + t / 2);
        part(g, t, h, d, wall, -w / 2 + t / 2, 0, 0); part(g, t, h, d, wall, w / 2 - t / 2, 0, 0);
        part(g, (w - dw) / 2, h, t, trim, -(w + dw) / 4, 0, d / 2 - t / 2); part(g, (w - dw) / 2, h, t, trim, (w + dw) / 4, 0, d / 2 - t / 2);
        part(g, dw, h - dh, t, trim, 0, dh, d / 2 - t / 2);
        u.doorL = part(g, dw / 2, dh, 0.03, 0x9aa5b0, -dw / 4, 0, d / 2 - t - 0.02);
        u.doorR = part(g, dw / 2, dh, 0.03, 0x9aa5b0, dw / 4, 0, d / 2 - t - 0.02);
        u.dw = dw;
        part(g, w * 0.5, 0.02, 0.14, 0xfff2cc, 0, h - t - 0.02, 0, true);                       // лампата вътре
        u.lamp = part(g, 0.16, 0.06, 0.02, 0xc8f03c, 0, dh + 0.04, d / 2 + 0.002, true);        // отвън, над вратата: къде е кабината
        const bx = dw / 2 + (w - dw) / 4;
        part(g, 0.07, 0.12, 0.02, 0xc8f03c, bx, 1.14, d / 2 - t - 0.011, true);                 // копчето вътре, до вратата
        part(g, 0.07, 0.12, 0.02, 0xc8f03c, -bx, 1.09, d / 2 + 0.011, true);                    // копчето за повикване отвън
        u.buttons = [{ side: 'in', x: bx, y: 1.2, z: d / 2 - t - 0.02 }, { side: 'out', x: -bx, y: 1.15, z: d / 2 + 0.02 }];
        break;
      }
      case 'sign': {
        part(g, w, h, d, BOX.sign);
        const c = document.createElement('canvas');
        c.width = 512; c.height = 160;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        texs.push(tex);
        const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex }));
        m.scale.set(w * 0.96, h * 0.9, 1); m.position.set(0, h / 2, d / 2 + 0.003);
        g.add(m);
        u.canvas = c; u.tex = tex; u.text = null;
        setState(g, 'sign', { text: o.text || '' });
        break;
      }
      default: part(g, w, h, d, BOX[kind] ?? 0x8a8a8a);
    }
    return g;
  }

  function setState(obj, kind, s) {
    const u = obj.userData;
    if (!s) return;
    switch (kind) {
      case 'patty': case 'fries': u.body.material = mat(cookHex(kind, s.cook)); break;
      case 'cup': {
        const f = clamp01(+s.fill || 0);
        u.liq.visible = f > 0.02; u.liq.scale.y = Math.max(0.005, u.h * 0.9 * f); u.liq.material = mat(s.drink === 'orange' ? 0xf08a1c : 0x3b1d10);
        break;
      }
      case 'plate': {
        for (const m of u.stack) obj.remove(m);
        u.stack.length = 0;
        let y = u.h, pi = 0;
        for (const k of s.stack || []) {
          const z = SIZES[k] || [0.1, 0.02, 0.1];
          u.stack.push(part(obj, z[0], z[1], z[2], k === 'patty' ? cookHex('patty', (s.cooks || [])[pi++] ?? 1) : BOX[k] ?? 0x999999, 0, y, 0));
          y += z[1];
        }
        break;
      }
      case 'beaker': {
        const mix = s.mix || [];
        u.layers.forEach((m, i) => { m.visible = i < mix.length; if (m.visible) m.material = mat(s.ruined ? 0x2a2622 : s.mixed ? mixHex(0x35c8d8, 0xff8a3c, clamp01(+s.heat || 0)) : BOX[mix[i]] ?? 0x999999); });
        break;
      }
      case 'tray': u.load.visible = s.ready !== false; break;
      case 'door': u.body.position.x = clamp01(+s.open || 0) * u.w * 0.96; break;
      case 'grow': {
        const st = clamp01(+s.stage || 0), len = 0.05 + 0.34 * st, hex = s.dry ? 0xb9a04a : mixHex(0x7ccf6a, 0x2f9a47, st);
        u.plants.forEach((m, i) => { m.scale.y = len * (0.8 + (i % 3) * 0.1); m.material = mat(hex); });
        u.tips.forEach((m, i) => { m.visible = !!s.ready || st >= 1; m.position.y = u.h - 0.09 + len * (0.8 + (i % 3) * 0.1); });
        break;
      }
      case 'elevator': {
        const o = clamp01(+s.doors || 0), wd = Math.max(0.02, u.dw / 2 * (1 - 0.94 * o));
        u.doorL.scale.x = wd; u.doorL.position.x = -(u.dw / 2 - wd / 2);
        u.doorR.scale.x = wd; u.doorR.position.x = u.dw / 2 - wd / 2;
        u.lamp.material = mat(s.moving ? 0xf2b84a : s.level ? 0xb06cff : 0xc8f03c, true);
        break;
      }
      case 'shutter': { const o = clamp01(+s.open || 0); u.body.scale.y = u.h * (1 - 0.92 * o); u.body.position.y = u.h * 0.92 * o; break; }
      case 'burner': {
        const z = s.zone || [0.5, 0.7];
        u.needle.position.x = (clamp01(+s.needle || 0) - 0.5) * 0.34;
        u.zone.position.x = ((z[0] + z[1]) / 2 - 0.5) * 0.34; u.zone.scale.x = Math.max(0.01, (z[1] - z[0]) * 0.34);
        u.lamps.forEach((m, i) => { m.material = mat(i < (s.hits | 0) ? 0xc8f03c : 0x3a3a3a, true); });
        break;
      }
      case 'mixer': u.recipe.forEach((m, i) => { const k = (s.recipe || [])[i]; m.visible = !!k; if (k) m.material = mat(BOX[k] ?? 0x999999, true); }); break;
      case 'packer': { const p = clamp01(+s.progress || 0); u.bar.visible = p > 0.01; u.bar.scale.x = Math.max(0.001, 0.4 * p); u.bar.position.x = -0.2 + 0.2 * p; break; }
      case 'sign': {
        const text = String(s.text ?? '');
        if (text === u.text || !u.canvas) break;
        u.text = text;
        const g = u.canvas.getContext('2d');
        g.fillStyle = '#131411'; g.fillRect(0, 0, 512, 160);
        g.fillStyle = '#eef0e8'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const lines = text.split('\n').slice(0, 2);
        let px = lines.length > 1 ? 52 : 64;
        do { g.font = `700 ${px}px "Sofia Sans", "Segoe UI", sans-serif`; px -= 4; } while (px > 20 && Math.max(...lines.map(l => g.measureText(l).width)) > 480);
        lines.forEach((l, i) => g.fillText(l, 256, 84 + (i - (lines.length - 1) / 2) * (px + 12)));
        u.tex.needsUpdate = true;
        break;
      }
    }
  }

  return {
    make, setState,
    dispose() { unit.dispose(); plane.dispose(); for (const m of mats.values()) m.dispose(); for (const t of texs) t.dispose(); mats.clear(); texs.length = 0; },
  };
}

// ---------- моделите: истинските, ако ги има ----------

async function loadKit(THREE, mode) {
  const box = makeBoxKit(THREE);
  let real = null, why = '';
  if (mode === 'boxes') why = 'поискани са кутии';
  else {
    try {
      const m = await import('./models.js');
      if (typeof m.makeModel === 'function') real = m; else why = 'models.js няма makeModel';
    } catch (e) { why = `models.js не се зареди: ${e?.message || e}`; }
  }
  const kinds = !real ? null : Array.isArray(real.KINDS) ? new Set(real.KINDS) : real.KINDS instanceof Set ? real.KINDS : null;
  const isReal = new WeakSet(), boxed = new Set(), bad = new Set();
  const fromModels = o => isReal.has(o);
  // models.js връща сива кутия-заместител (userData.placeholder), когато няма истински модел за вида.
  // Тогава моята шарена кутия казва повече; оставям техния заместител само за уредите с показание.
  const KEEP_PLACEHOLDER = new Set(['burner', 'packer', 'mixer', 'sign']);
  function make(kind, opts) {
    if (real) {                                        // и за вид извън KINDS: доставчикът може вече да го има (асансьорът, лехата)
      try {
        const o = real.makeModel(THREE, kind, opts);
        if (o && o.isObject3D && (!o.userData?.placeholder || KEEP_PLACEHOLDER.has(kind))) { isReal.add(o); return o; }
      } catch (e) { if (!bad.has(`m:${kind}`)) { bad.add(`m:${kind}`); console.warn('[backroom] makeModel', kind, e); } }
    }
    boxed.add(kind);
    return box.make(kind, opts);
  }
  /** dt = undefined: стойността влиза веднага (за изпичане) */
  function setState(obj, kind, state, dt) {
    if (state == null) return;
    if (!isReal.has(obj)) return box.setState(obj, kind, state);
    if (typeof real.setModelState !== 'function' || bad.has(kind)) return;
    try { real.setModelState(THREE, obj, kind, state, dt); } catch (e) { bad.add(kind); console.warn('[backroom] setModelState', kind, e); }
  }
  function marker() {
    if (!real || typeof real.slotMarker !== 'function') return null;
    try { const o = real.slotMarker(THREE); return o && o.isObject3D ? o : null; } catch { return null; }
  }
  return { make, setState, marker, fromModels, real: !!real, why, boxed, dispose: box.dispose };
}

// ---------- сцената ----------

export async function createScene(ctx, start, opts = {}) {
  const THREE = ctx.THREE;
  const hall = { w: start.hall?.w || ctx.hall?.w || 6, d: start.hall?.d || ctx.hall?.d || 6 };
  const theme = start.theme || ctx.theme || 'night';
  const me = ctx.me || {};
  const kit = await loadKit(THREE, opts.models);

  const group = new THREE.Group();
  group.name = 'backroom-scene';
  // Две виртуални нива в една и съща зала (SPEC т. 12): строят се всички, вижда се нивото на местния играч.
  // Липсващо level значи 0, затова със сървър без нива всичко е както преди.
  const lvl = v => (typeof v === 'number' && v > 0 ? Math.min(7, v | 0) : v === '1' ? 1 : 0);
  let nLevels = Math.max(1, Math.min(8, start.levels | 0 || 1));
  const street = Array.isArray(start.street) ? start.street : [];      // the blocks of the street: { level, name, wants, bonus }
  const blockOf = lv => street.find(b => b.level === lv) || null;
  const GOALS = start.goals || {}, FXOF = (start.fx && start.fx.of) || {};
  const CAREER = start.career || null;                // the career: the upgrades, the ranks, what needs what
  const hasU = id => !CAREER || !!(UI.career && UI.career.unlocked && UI.career.unlocked.includes(id));
  const hasAnyU = list => !list || list.some(hasU);
  for (const s of start.stations || []) nLevels = Math.max(nLevels, lvl(s.level) + 1);
  let myLevel = 0;
  const staticL = [], stationL = [], roomL = [];
  const stationAll = new THREE.Group(), itemGroup = new THREE.Group(), custGroup = new THREE.Group(), fxGroup = new THREE.Group();
  for (let i = 0; i < nLevels; i++) {
    staticL.push(new THREE.Group()); stationL.push(new THREE.Group()); roomL.push(new THREE.Group());
    staticL[i].visible = stationL[i].visible = i === 0; roomL[i].visible = false;
    group.add(staticL[i], stationL[i], roomL[i]);
  }
  group.add(stationAll, itemGroup, custGroup, fxGroup);   // stationAll: асансьорът, който е и на двете нива

  // Една обща и една насочена светлина; hud ги води по фаза и при патрул.
  // Ако основата дава своите (ctx.lights = { hemi, sun }, със сянка), ползват се те. Иначе сцената прави свои, без сенки,
  // и гаси чуждите в същата сцена, докато играта върви (иначе патрулът не може да притъмни); връщат се в dispose.
  const ext = !opts.ownLights && ctx.lights && ctx.lights.hemi?.isLight && ctx.lights.sun?.isLight ? ctx.lights : null;
  const muted = [];
  let hemi, dir;
  if (ext) { hemi = ext.hemi; dir = ext.sun; }
  else {
    hemi = new THREE.HemisphereLight(0xfff3dc, 0x8c7a62, 2.5);
    dir = new THREE.DirectionalLight(0xfff0d8, 1.7);
    dir.position.set(hall.w * 0.22, 4.6, hall.d * 0.12);
    dir.castShadow = false;
    let top = ctx.root;
    while (top.parent) top = top.parent;
    top.traverse(o => { if (o.isLight && o.intensity > 0) { muted.push(o, o.intensity); o.intensity = 0; } });
    group.add(hemi, dir, dir.target);
  }
  ctx.root.add(group);

  const own = [];                                  // геометрии, материали и текстури, които са мои
  const keep = o => { own.push(o); return o; };
  const MAT_LIT = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const MAT_LIT_HL = keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x34361c }));
  const MAT_UNLIT = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const C = new THREE.Color();
  const lin = hex => { C.setHex(hex); return [C.r, C.g, C.b]; };
  const _n3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
  let now = performance.now() / 1000;

  // ---------- изпичане: модел → 1 до 2 меша ----------

  const newBake = () => ({ lit: new GeoBuilder(), unlit: new GeoBuilder(), tex: new Map(), extras: [], skinned: false, cast: false, recv: false });
  function walk(o, B) {
    if (!o.visible) return;
    if (o.isSkinnedMesh) B.skinned = true;
    if (o.isMesh || o.isLine || o.isPoints || o.isSprite) {
      const m = o.material, geo = o.geometry;
      let done = false;
      if (o.castShadow) B.cast = true;
      if (o.receiveShadow) B.recv = true;
      if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && m && !Array.isArray(m) && geo?.attributes?.position && !geo.morphAttributes?.position) {
        _n3.getNormalMatrix(o.matrixWorld);
        const mirror = o.matrixWorld.determinant() < 0, back = m.side === THREE.BackSide, dbl = m.side === THREE.DoubleSide;
        const known = m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial || m.isMeshToonMaterial;
        const solid = !m.map && !m.alphaMap && !m.transparent && m.opacity >= 1 && !m.wireframe && !(m.alphaTest > 0) && m.color;
        if (known && solid) {
          let r = m.color.r, g = m.color.g, b = m.color.b, unlit = !!m.isMeshBasicMaterial;
          if (!unlit && m.emissive) {
            const k = m.emissiveIntensity ?? 1, er = m.emissive.r * k, eg = m.emissive.g * k, eb = m.emissive.b * k;
            if (Math.max(er, eg, eb) > 0.04) { unlit = true; r = Math.min(1, r * 0.45 + er); g = Math.min(1, g * 0.45 + eg); b = Math.min(1, b * 0.45 + eb); }
          }
          (unlit ? B.unlit : B.lit).addMesh(geo, o.matrixWorld, _n3, mirror !== back, back, dbl, r, g, b, m.vertexColors === true, m.flatShading === true);
          done = true;
        } else if (known && geo.attributes.uv && geo.attributes.normal && !m.vertexColors) {
          let tb = B.tex.get(m);                    // с текстура: слива се по материал, материалът остава техният
          if (!tb) { tb = new GeoBuilder(true); B.tex.set(m, tb); }
          tb.addMesh(geo, o.matrixWorld, _n3, mirror, false, false, 1, 1, 1, false, false);
          done = true;
        }
      }
      if (!done && !o.isSkinnedMesh) {
        const c = o.clone(false);
        c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld);
        B.extras.push(c);
      }
    }
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) walk(ch[i], B);
  }
  /** obj не трябва да е закачен никъде: така матриците му са спрямо самия него */
  function collect(obj, B) { obj.updateMatrixWorld(true); walk(obj, B); }
  function finish(B) {
    const parts = [];
    if (B.lit.count) parts.push({ geo: B.lit.build(THREE), mat: MAT_LIT });
    if (B.unlit.count) parts.push({ geo: B.unlit.build(THREE), mat: MAT_UNLIT });
    for (const [m, tb] of B.tex) if (tb.count) parts.push({ geo: tb.build(THREE), mat: m });
    return { key: '', parts, extras: B.extras, refs: 0, live: null, pool: null, cast: B.cast, recv: B.recv };
  }
  function disposeEntry(e) { for (const p of e.parts) p.geo.dispose(); e.parts.length = 0; }

  const cache = new Map();
  /** изпечен образ по ключ; build() връща нов незакачен Object3D */
  function entryFor(key, build) {
    let e = cache.get(key);
    if (e) return e;
    const obj = build(), B = newBake();
    collect(obj, B);
    if (B.skinned) e = { key, parts: [], extras: [], refs: 0, live: build, pool: [obj], cast: false, recv: false };   // с кости: не се слива, ползва се живият модел
    else { e = finish(B); e.key = key; }
    cache.set(key, e);
    if (cache.size > CACHE_MAX) for (const [k, old] of cache) { if (cache.size <= CACHE_MAX * 0.75) break; if (old.refs <= 0 && old !== e) { disposeEntry(old); cache.delete(k); } }
    return e;
  }

  const viewPool = [];
  function getView(parent) {
    const v = viewPool.pop() || { g: new THREE.Group(), meshes: [], extras: [], entry: null, liveObj: null, hl: false, cast: false, recv: false };
    v.cast = v.recv = false;
    v.g.visible = true; v.g.position.set(0, 0, 0); v.g.rotation.set(0, 0, 0); v.g.scale.setScalar(1);
    parent.add(v.g);
    return v;
  }
  function setEntry(v, e) {
    if (v.entry === e) return;
    const old = v.entry;
    if (old) {
      old.refs--;
      for (let i = 0; i < v.meshes.length; i++) v.meshes[i].visible = false;
      for (let i = 0; i < v.extras.length; i++) v.g.remove(v.extras[i]);
      v.extras.length = 0;
      if (v.liveObj) { v.g.remove(v.liveObj); old.pool.push(v.liveObj); v.liveObj = null; }
    }
    v.entry = e;
    if (!e) return;
    e.refs++;
    if (e.live) { v.liveObj = e.pool.pop() || e.live(); v.g.add(v.liveObj); return; }
    for (let i = 0; i < e.parts.length; i++) {
      let m = v.meshes[i];
      if (!m) { m = new THREE.Mesh(e.parts[i].geo, e.parts[i].mat); v.meshes[i] = m; v.g.add(m); }
      m.geometry = e.parts[i].geo;
      m.material = v.hl ? hlOf(e.parts[i].mat) : e.parts[i].mat;
      m.castShadow = v.cast; m.receiveShadow = v.recv;
      m.visible = true;
    }
    for (let i = 0; i < e.extras.length; i++) {
      const c = e.extras[i].clone(false);
      c.matrixAutoUpdate = false; c.matrix.copy(e.extras[i].matrix);
      v.g.add(c); v.extras.push(c);
    }
  }
  // „светъл" вариант на материал за подсветка: общ за всички, прави се веднъж (чуждите материали не се пипат)
  const hlMats = new Map();
  function hlOf(mat) {
    if (mat === MAT_LIT) return MAT_LIT_HL;
    let h = hlMats.get(mat);
    if (h === undefined) {
      h = mat;
      if (mat.emissive && mat.clone) { h = keep(mat.clone()); h.emissive.setHex(0x34361c); h.emissiveIntensity = 1; }
      hlMats.set(mat, h);
    }
    return h;
  }
  function tint(v, on) {
    if (v.hl === on) return;
    v.hl = on;
    const e = v.entry;
    if (!e || e.live) return;
    for (let i = 0; i < e.parts.length && i < v.meshes.length; i++) v.meshes[i].material = on ? hlOf(e.parts[i].mat) : e.parts[i].mat;
  }
  function setCast(v, on) { v.cast = on; for (let i = 0; i < v.meshes.length; i++) v.meshes[i].castShadow = on; }
  function freeView(v) { tint(v, false); setEntry(v, null); v.g.removeFromParent(); viewPool.push(v); }

  // ---------- неподвижният свят ----------

  const lay = hudLayout(start);
  const seats = (start.seats || []).map(s => ({ i: s.i, x: +s.x || 0, z: +s.z || 0 }));
  const seatByI = new Map(seats.map(s => [s.i, s]));
  // Капаците в пода под клиентите: черен кръг (дупката) и оригиналният капак върху него. Щом копчето се натисне, капакът
  // пада надолу заедно с клиента (в детската тема: със сандъка на доставчика) и после се връща.
  const TRAP_Y = 0.03;
  const trapList = [];

  // Стаите от gameStart (SPEC т. 13): до три правоъгълника, свързани с отвори; без тях една стая с размера на залата.
  // Нищо тук не се слага по размера на залата: всичко идва от стаите, станциите и гнездата.
  const rooms = roomsOf(start), roomDoors = Array.isArray(start.doors) ? start.doors : [];
  /** четириъгълник, обърнат към дадена посока (редът на върховете се нагласява сам) */
  function quadTo(Bd, a, b, c, d, nx, ny, nz, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz >= 0) Bd.quad(a, b, c, d, col); else Bd.quad(a, d, c, b, col);
  }
  /**
   * Простата стая за проби без декор: под и стени на всяка стая (с отворите между стаите и над тезгяха), очертание,
   * места на клиентите и улица пред стената с тезгяха. Ниво 0: стая a е щандът, другите са склад. Другите нива: лаборатория.
   */
  function buildRoom(B, lv) {
    const L = B.lit, U = B.unlit, H = 2.9, W0 = 0.95, DOOR_H = 2.05, lab = lv > 0;
    const counter = lab ? null : stations.find(s => s.kind === 'counter' && s.level <= 0) || null;
    const edge = lin(0xc8f03c), uv = lin(0x9a6bff);
    for (const r of rooms) {
      const shop = !lab && (r.id === 'a' || rooms.length === 1);
      const ca = lin(lab ? 0x35304c : shop ? 0xd8cdb6 : 0x8d8a82), cb = lin(lab ? 0x2e2944 : shop ? 0xc8bca4 : 0x84817a), size = shop ? 0.5 : 1.0;
      const lo = lin(lab ? 0x1f1934 : shop ? 0x2f8079 : 0x5d5a54), hi = lin(lab ? 0x33285a : shop ? 0xe9e0ce : 0xa9a59c);
      const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
      for (let ix = 0, x = x0; x < x1 - 1e-6; x += size, ix++) for (let iz = 0, z = z0; z < z1 - 1e-6; z += size, iz++) {
        const xe = Math.min(x1, x + size), ze = Math.min(z1, z + size);
        L.quad([x, 0, z], [x, 0, ze], [xe, 0, ze], [xe, 0, z], (ix + iz) % 2 ? ca : cb);
      }
      for (const W of wallsOf(r)) {
        const Pt = (u, y, inn = 0) => [W.ox + W.dx * u + W.nx * inn, y, W.oz + W.dz * u + W.nz * inn];
        const seg = (u0, u1, y0, y1, col, Bd = L) => { if (u1 - u0 > 0.005 && y1 - y0 > 0.005) quadTo(Bd, Pt(u0, y0), Pt(u1, y0), Pt(u1, y1), Pt(u0, y1), W.nx, 0, W.nz, col); };
        const band = (u0, u1, y0, y1) => {               // парче стена в два тона; в лабораторията с UV ивица между тях
          seg(u0, u1, y0, Math.min(y1, W0), lo);
          if (lab && y0 < W0 && y1 > W0) { seg(u0, u1, W0, W0 + 0.05, uv, U); seg(u0, u1, W0 + 0.05, y1, hi); }
          else seg(u0, u1, Math.max(y0, W0), y1, hi);
        };
        // дупките в тази стена: [от, до, от височина, до височина]
        const holes = [];
        for (const dr of roomDoors) {
          if ((dr.a !== r.id && dr.b !== r.id) || (dr.axis === 'x') !== (W.dx === 1)) continue;
          if (Math.abs((dr.x - W.ox) * W.nx + (dr.z - W.oz) * W.nz) > 0.12) continue;
          const u = (dr.x - W.ox) * W.dx + (dr.z - W.oz) * W.dz, half = (+dr.w || 0.9) / 2;
          holes.push([u - half, u + half, 0, DOOR_H]);
        }
        let street = false;
        if (counter) {                                   // стената с тезгяха: отворена от пода до горния ръб на ролетката
          const dist = (counter.x - W.ox) * W.nx + (counter.z - W.oz) * W.nz, u = (counter.x - W.ox) * W.dx + (counter.z - W.oz) * W.dz;
          if (Math.abs(counter.cos * W.dx - counter.sin * W.dz) > 0.7 && dist > -0.1 && dist < 0.6 && u > 0 && u < W.len) { holes.push([u - counter.w / 2, u + counter.w / 2, 0, SURFACE_Y + 1.23]); street = true; }
        }
        holes.sort((a, b) => a[0] - b[0]);
        let from = 0;
        for (const h of holes) {
          const a = Math.max(from, h[0]), b = Math.min(W.len, h[1]);
          if (b <= a) continue;
          band(from, a, 0, H); band(a, b, 0, h[2]); band(a, b, h[3], H);
          from = b;
        }
        band(from, W.len, 0, H);
        // очертанието на стаята на пода: свети винаги, за да се вижда и на тъмно
        quadTo(U, Pt(0, 0.008), Pt(W.len, 0.008), Pt(W.len, 0.008, 0.035), Pt(0, 0.008, 0.035), 0, 1, 0, edge);
        if (street) {                                    // улицата пред тезгяха: тротоар, платно, фасада с прозорци
          const u0 = -3, u1 = W.len + 3, far = 4.2, g = -0.004;
          quadTo(L, Pt(u0, g), Pt(u1, g), Pt(u1, g, -1.4), Pt(u0, g, -1.4), 0, 1, 0, lin(0x565a60));
          quadTo(L, Pt(u0, g, -1.4), Pt(u1, g, -1.4), Pt(u1, g, -far), Pt(u0, g, -far), 0, 1, 0, lin(0x2b2d32));
          quadTo(L, Pt(u0, 0, -1.36), Pt(u1, 0, -1.36), Pt(u1, 0, -1.44), Pt(u0, 0, -1.44), 0, 1, 0, lin(0x80858c));
          quadTo(L, Pt(u0, 0, -far), Pt(u1, 0, -far), Pt(u1, 3.6, -far), Pt(u0, 3.6, -far), W.nx, 0, W.nz, lin(0x1d2129));
          const winOn = lin(0xf2c66d), winOff = lin(0x2b3140);
          for (let i = 0, u = u0 + 0.5; u < u1 - 1; u += 1.25, i++) for (let k = 0; k < 2; k++) {
            const y = 0.9 + k * 1.3;
            quadTo(U, Pt(u, y, 0.01 - far), Pt(u + 0.8, y, 0.01 - far), Pt(u + 0.8, y + 0.85, 0.01 - far), Pt(u, y + 0.85, 0.01 - far), W.nx, 0, W.nz, (i * 7 + k * 5) % 3 !== 0 ? winOn : winOff);
          }
        }
      }
    }
    if (lab) return;
    // преграда вътре в стая (станции wall и врата): продължава до тавана
    const fill = lin(0xe9e0ce);
    for (const s of stations) {
      if ((s.kind !== 'wall' && s.kind !== 'door') || s.level > 0) continue;
      const top = s.y + s.h;
      if (top < H - 0.01) L.box(s.x, top, s.z, s.w, H - top, s.kind === 'door' ? 0.08 : s.d || 0.08, fill, s.yaw, true);
    }
    const pad = lin(0x767b83);                           // местата на клиентите
    for (const s of seats) {
      const pts = [];
      for (let k = 0; k < 8; k++) pts.push([s.x + Math.sin(k * Math.PI / 4 + Math.PI / 8) * 0.24, 0.01, s.z + Math.cos(k * Math.PI / 4 + Math.PI / 8) * 0.24]);
      L.quad(pts[0], pts[1], pts[2], pts[3], pad); L.quad(pts[0], pts[3], pts[4], pts[7], pad); L.quad(pts[4], pts[5], pts[6], pts[7], pad);
    }
  }
  /** Табла няма: времето се чете от монитора на hud.js. */
  function buildShell() {}

  // станциите
  const stations = [], stationByKey = new Map(), slots = [], slotByKey = new Map(), dyn = [];
  const accepts = (sl, kind) => !sl.accepts || !sl.accepts.length || sl.accepts.includes(kind) || sl.accepts.includes('*') || sl.accepts.includes('any');
  for (const def of start.stations || []) {
    if (def.kind === 'sign') continue;                  // табла по стените няма
    if (def.kind === 'elevator' && stations.some(q => q.kind === 'elevator')) continue;      // one cabin: it is the same on every stop
    const kind = def.kind, sz = SIZES[kind] || [0.5, SURFACE_Y, 0.5];
    const s = {
      id: def.id, kind, x: +def.x || 0, y: +def.y || 0, z: +def.z || 0, yaw: +def.yaw || 0,
      w: +def.w || sz[0], h: +def.h || sz[1], d: +def.d || sz[2], gives: def.gives ?? null, slots: [],
      mode: LIVE_KINDS.has(kind) ? 'live' : 'static', pinLive: PIN_KINDS.has(kind), live: null, v: null, entry: null,
      btn: def.btn && typeof def.btn.x === 'number' ? { x: +def.btn.x, y: +def.btn.y || 0, z: +def.btn.z || 0 } : null, seat: def.seat ?? null,
      state: def.state ?? null, view: {}, skey: '', keyT: now, n1: 0, nV: 0, nT: 0, shook: false,
      taps: Array.isArray(def.taps) ? def.taps.map(q => ({ x: +q.x || 0, y: +q.y || 0, z: +q.z || 0 })) : null, shelf: Array.isArray(def.shelf) ? def.shelf : null, freeKey: '',
    };
    s.level = kind === 'elevator' ? -1 : Math.min(nLevels - 1, lvl(def.level));   // −1: на всички нива
    s.on = s.level <= 0;                                // на нивото на местния играч ли е
    s.parent = s.level < 0 ? stationAll : stationL[s.level];
    s.cos = Math.cos(s.yaw); s.sin = Math.sin(s.yaw);
    s.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, s.yaw, 0, 'YXZ'));   // пръстен, изправен срещу лицето на станцията
    s.live = kit.make(kind, { theme, w: s.w, h: s.h, d: s.d, y: s.y, gives: def.gives, nat: def.nat, rack: def.rack, tray: def.tray, bowl: def.bowl, def, text: def.text ?? def.state?.text ?? '' });
    s.live.position.set(s.x, s.y, s.z);
    s.live.rotation.y = s.yaw;
    if (s.state) { Object.assign(s.view, s.state); kit.setState(s.live, kind, s.state, undefined); }
    (def.slots || []).forEach((sd, i) => {
      let r = 0.06;
      for (const k of sd.accepts || []) { const z = SIZES[k]; if (z) r = Math.max(r, Math.max(z[0], z[2]) / 2); }
      const sl = { id: sd.id, key: String(sd.id), x: +sd.x || 0, y: +sd.y || 0, z: +sd.z || 0, accepts: sd.accepts || null, st: s, index: i, item: null, r: Math.min(0.16, r + 0.03), sink: SINK_KINDS.has(kind) };
      sl.level = sd.level != null ? Math.min(nLevels - 1, lvl(sd.level)) : Math.max(0, s.level);
      sl.on = sl.level === 0;
      sl.spot = kind === 'spot'; sl.spotOn = false;      // a buyer's hand in the street: a place only while he waits there
      sl.up = sl.y > 1.15;                              // гнездо на рафт над друго: легнал пръстен не се вижда оттам, където стои човек
      s.slots.push(sl); slots.push(sl); slotByKey.set(sl.key, sl);
    });
    stations.push(s); stationByKey.set(String(s.id), s);
    if (s.mode === 'live') { dyn.push(s); s.parent.add(s.live); }
  }
  const bins = stations.filter(s => s.kind === 'bin'), useStations = stations.filter(s => USE_KINDS.has(s.kind) && (s.kind !== 'shutter' || s.btn));
  // the lever of the shop: it stands on the counter where the rules put the OPEN button; the hand goes to its handle
  const shutSt = stations.find(s => s.kind === 'shutter' && s.btn) || null;
  let lever = null;
  if (shutSt) {
    try { lever = kit.make('lever', { theme }); } catch { lever = null; }
    if (lever) { lever.position.set(shutSt.btn.x, shutSt.btn.y, shutSt.btn.z); lever.rotation.y = shutSt.yaw; stationL[0].add(lever); shutSt.btn.y += 0.2; }
  }
  const ways = stations.filter(s => s.kind === 'way');
  for (const w of ways) { const d = (start.stations || []).find(q => q.id === w.id); w.to = d ? d.to | 0 : 0; }
  const stashSt = stations.find(s => s.kind === 'stash') || null, growSt = stations.find(s => s.kind === 'grow') || null, drinksSt = stations.find(s => s.kind === 'drinks' && s.taps) || null;
  const streams = [];      // one thin stream under every tap of the drinks machine
  if (drinksSt) {
    const geo = keep(new THREE.CylinderGeometry(0.011, 0.011, 1, 6).translate(0, -0.5, 0));
    drinksSt.taps.forEach((tap, i) => {
      const sl = drinksSt.slots[i];
      if (!sl) return;
      const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ color: i === 0 ? 0x3a1c10 : 0xff9a1f })));
      m.position.set(sl.x, Math.min(tap.y - 0.04, sl.y + 0.15), sl.z);
      m.visible = false;
      drinksSt.parent.add(m);
      streams.push({ m, tap, slot: sl, until: 0 });
    });
  }
  // ---------- the big screens: the store and the recipe book ----------
  // One canvas for all screens. A hand points at a screen (its own ray; on the desktop page from the eye through the hand),
  // a dot shows where, the button under it lights up, the trigger presses it.
  const UI = { g: null, tex: null, W: 1024, H: 584, tab: 'store', key: '', at: 0, hover: { l: -1, r: -1 }, on: { l: false, r: false }, buttons: [], list: [],
    money: 0, clock: 0, phase: 'tutorial', patrol: null, goal: '', shop: false, waiting: 0, fx: null, fxLeft: 0,
    career: null, mode: '', page: -1, confirm: false, ckey: '', float: null };
  const storeList = Array.isArray(start.store) ? start.store : [];
  {
    const defs = (start.stations || []).filter(d => d.kind === 'screen');
    if (defs.length && storeList.length) {
      const PW = 1.40, PH = PW * UI.H / UI.W;
      const cv = document.createElement('canvas');
      cv.width = UI.W; cv.height = UI.H;
      UI.g = cv.getContext('2d');
      UI.tex = keep(new THREE.CanvasTexture(cv));
      UI.tex.colorSpace = THREE.SRGBColorSpace; UI.tex.anisotropy = 4;
      const mat = keep(new THREE.MeshBasicMaterial({ map: UI.tex, toneMapped: false }));
      const geo = keep(new THREE.PlaneGeometry(PW, PH));
      const dotGeo = keep(new THREE.CircleGeometry(0.014, 14)), dotMat = keep(new THREE.MeshBasicMaterial({ color: 0xc8f03c, toneMapped: false, depthTest: false }));
      for (const d of defs) {
        const lv = Math.min(nLevels - 1, lvl(d.level)), yaw = +d.yaw || 0, nx = Math.sin(yaw), nz = Math.cos(yaw);
        const cx = d.x + nx * 0.225, cy = d.y + (+d.h || 0.98) / 2, cz = d.z + nz * 0.225;
        const plane = new THREE.Mesh(geo, mat);
        plane.position.set(cx, cy, cz);
        plane.rotation.y = yaw;
        stationL[lv].add(plane);
        const dots = HK.map(() => { const m = new THREE.Mesh(dotGeo, dotMat); m.rotation.y = yaw; m.visible = false; m.renderOrder = 5; stationL[lv].add(m); return m; });
        UI.list.push({ lv, cx, cy, cz, nx, nz, rx: Math.cos(yaw), rz: -Math.sin(yaw), w: PW, h: PH, dots });
      }
      if (CAREER) {      // the main menu and the pause menu also float in front of the eyes, over everything
        const fmat = keep(new THREE.MeshBasicMaterial({ map: UI.tex, toneMapped: false, depthTest: false, transparent: true }));
        const fdot = keep(new THREE.MeshBasicMaterial({ color: 0xc8f03c, toneMapped: false, depthTest: false }));
        const fw = 1.1, plane = new THREE.Mesh(keep(new THREE.PlaneGeometry(fw, fw * UI.H / UI.W)), fmat);
        plane.renderOrder = 60; plane.visible = false; plane.frustumCulled = false;
        group.add(plane);
        const dots = HK.map(() => { const m = new THREE.Mesh(dotGeo, fdot); m.visible = false; m.renderOrder = 61; m.frustumCulled = false; group.add(m); return m; });
        UI.float = { float: true, plane, lv: -1, cx: 0, cy: 0, cz: 0, nx: 0, nz: 1, rx: 1, rz: 0, w: fw, h: fw * UI.H / UI.W, dots };
        UI.list.push(UI.float);
      }
    }
  }
  const dayText = min => { const m = Math.floor((((min % 1440) + 1440) % 1440) / 10) * 10; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const stockOf = kind => { const st = stationByKey.get(`bin_${kind}`); return st ? [st.view.stock | 0, st.view.coming | 0] : [0, 0]; };
  function recipeLines() {
    const out = [], R = start.recipes || {}, sell = start.sell || {};
    for (const kind of Object.keys(R)) {
      const r = R[kind]; if (!r || !Array.isArray(r.ideal)) continue;
      const parts = r.ideal.map((v, i) => (v > 0 ? `${Math.round(v * 100)}% ${LIQ_WORD[i] || '?'}` : null)).filter(Boolean).join(' + ');
      out.push([(NAME[kind] || kind).toUpperCase(), parts, CAREER && !(CAREER.needs[kind] || []).every(hasU) ? 'LOCKED' : `$${sell[kind] ?? ''}`]);
    }
    const cel = CAREER && !hasU('cellar') ? 'LOCKED' : null;
    out.push(['BUD', `a plant in the shredder gives ${start.lab?.buds ?? 3}`, cel || `$${sell.buds ?? ''}`]);
    out.push(['JOINT', 'papers in one hand, a bud in the other: shake both', cel || `$${sell.joint ?? ''}`]);
    if (CAREER) out.push(['BRICK', 'three packets of one kind on a tray, on the press', hasU('press') ? 'x3 x1.6' : 'LOCKED']);
    return out;
  }
  const money$ = v => `$${Math.round(v).toLocaleString('en-US')}`;
  const rankName = i => (CAREER && CAREER.ranks[i] ? CAREER.ranks[i].name : '');
  function wrapText(g, text, maxW) {
    const words = String(text).split(' '), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (!cur || g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    return lines;
  }
  /** The main menu and the pause menu: big buttons, the same canvas on the wall screens and on the panel in front of the eyes. */
  function drawMenu(g, W, H, box) {
    const C = UI.career || {}, sv = C.save;
    g.fillStyle = '#c8f03c'; g.textAlign = 'center'; g.font = `800 76px ${FONT_XC}`;
    g.fillText('THE BACK ROOM', W / 2, 72);
    g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
    const big = (y, h, label, sub, act, id, fill = '#232830') => {
      box({ x: 160, y, w: W - 320, h, act, id }, fill);
      g.textAlign = 'center'; g.fillStyle = fill === '#c8f03c' ? '#14161a' : '#f2efe6'; g.font = `800 ${sub ? 50 : 54}px ${FONT_XC}`;
      g.fillText(label, W / 2, y + (sub ? h * 0.38 : h / 2));
      if (sub) { g.font = `700 28px ${FONT_XC}`; g.fillStyle = fill === '#c8f03c' ? '#2b3a10' : '#9aa0a8'; g.fillText(sub, W / 2, y + h * 0.74); }
    };
    if (UI.mode === 'menu') {
      g.fillText(C.key ? `Career of ${C.key}` : 'Pizzeria by day, the cellar by night', W / 2, 126);
      if (sv) {
        big(170, 150, 'CONTINUE', `Day ${sv.day}  ·  ${money$(sv.money)}  ·  ${rankName(sv.rank)}`, 'menu', 'continue', '#c8f03c');
        big(345, 110, UI.confirm ? 'SURE? IT DELETES THE SAVE' : 'NEW CAREER', UI.confirm ? 'pull the trigger again to start over' : '', 'newcareer', 'new', UI.confirm ? '#8a1f1a' : '#232830');
      } else big(190, 170, 'NEW CAREER', 'Day 1 with $40 and a small pizzeria', 'menu', 'new', '#c8f03c');
      g.textAlign = 'center'; g.fillStyle = '#9aa0a8'; g.font = `700 26px ${FONT_XC}`;
      g.fillText('Point at a button with your hand and pull the trigger.  Pause in the game: X or Y on the left controller.', W / 2, H - 40);
    } else {
      g.fillText(`Paused  ·  Day ${C.day || 1}  ·  ${money$(UI.money)}  ·  ${rankName(C.rank || 0)}`, W / 2, 126);
      big(170, 150, 'RESUME', 'back to the game', 'menu', 'resume', '#c8f03c');
      big(345, 110, 'SAVE AND QUIT', 'the career waits for you in the main menu', 'menu', 'quit');
      g.textAlign = 'center'; g.fillStyle = '#9aa0a8'; g.font = `700 26px ${FONT_XC}`;
      g.fillText('The game also saves by itself at 08:00 and at 00:00.', W / 2, H - 40);
    }
  }
  function drawUpgrades(g, W, H, box) {
    const list = CAREER.unlocks, C = UI.career || {}, own = new Set(C.unlocked || []), rank = C.rank || 0, per = 8;
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (UI.page < 0) { const first = list.findIndex(u => !own.has(u.id)); UI.page = Math.max(0, Math.floor(Math.max(0, first) / per)); }
    UI.page = Math.min(pages - 1, UI.page);
    list.slice(UI.page * per, UI.page * per + per).forEach((u, i) => {
      const x = 24 + (i % 4) * 246, y = 206 + ((i / 4) | 0) * 160, owned = own.has(u.id), low = rank < u.rank, poor = UI.money < u.price;
      const card = { x, y, w: 234, h: 150, act: 'unlock', id: u.id };
      if (owned || low) { g.fillStyle = owned ? '#1c2a1a' : '#1a1d22'; g.fillRect(card.x, card.y, card.w, card.h); } else box(card, '#232830');
      g.textAlign = 'left'; g.fillStyle = owned ? '#7bd66a' : low ? '#6b7178' : '#f2efe6'; g.font = `800 27px ${FONT_XC}`;
      wrapText(g, u.name, 210).slice(0, 2).forEach((l, k) => g.fillText(l, x + 12, y + 28 + k * 28));
      g.font = `800 44px ${FONT_XC}`;
      g.fillStyle = owned ? '#7bd66a' : low ? '#6b7178' : poor ? '#f06a45' : '#c8f03c';
      g.fillText(owned ? 'OWNED' : money$(u.price), x + 12, y + 108);
      g.font = `700 22px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
      g.fillText(owned ? '' : low ? `needs rank: ${rankName(u.rank)}` : poor ? 'not enough money yet' : 'pull the trigger to buy', x + 12, y + 138);
    });
    const nav = (label, x, id, on) => { if (on) box({ x, y: 532, w: 150, h: 44, act: 'page', id }, '#2a2f38'); g.textAlign = 'center'; g.fillStyle = on ? '#f2efe6' : '#4a4f58'; g.font = `800 28px ${FONT_XC}`; g.fillText(label, x + 75, 555); };
    nav('< BACK', 24, UI.page - 1, UI.page > 0);
    nav('MORE >', W - 174, UI.page + 1, UI.page < pages - 1);
    g.textAlign = 'center'; g.fillStyle = '#9aa0a8'; g.font = `700 26px ${FONT_XC}`;
    g.fillText(`page ${UI.page + 1} of ${pages}  ·  rank ${rankName(rank)}`, W / 2, 555);
  }
  function drawCareer(g, W, H, box) {
    const C = UI.career || {}, R = CAREER.ranks, r = C.rank || 0, next = R[r + 1];
    g.textAlign = 'left'; g.fillStyle = '#f2efe6'; g.font = `800 40px ${FONT_XC}`;
    g.fillText(`DAY ${C.day || 1}   ·   ${rankName(r).toUpperCase()}`, 28, 232);
    g.font = `700 26px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
    g.fillText(next ? `earned ${money$(C.earned || 0)}  ·  next rank ${next.name} at ${money$(next.at)}` : `earned ${money$(C.earned || 0)}  ·  the top rank`, 28, 270);
    const f = next ? Math.max(0, Math.min(1, ((C.earned || 0) - R[r].at) / (next.at - R[r].at))) : 1;
    g.fillStyle = '#2a2f38'; g.fillRect(28, 288, W - 56, 14); g.fillStyle = '#c8f03c'; g.fillRect(28, 288, (W - 56) * f, 14);
    g.fillStyle = '#c8f03c'; g.font = `800 30px ${FONT_XC}`; g.fillText('GOALS OF THE DAY', 28, 340);
    (C.goals || []).forEach((q, i) => {
      const y = 380 + i * 40;
      g.textAlign = 'left'; g.fillStyle = q.done ? '#7bd66a' : '#f2efe6'; g.font = `700 29px ${FONT_XC}`;
      g.fillText(`${q.done ? 'DONE  ' : ''}${q.text}`, 28, y);
      g.textAlign = 'right'; g.fillStyle = q.done ? '#7bd66a' : '#c8f03c';
      g.fillText(q.done ? `+${money$(q.bonus)}` : `${q.have} / ${q.n}   +${money$(q.bonus)}`, W - 230, y);
    });
    const ds = (C.dealers || []).filter(d => d.hired);
    g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 25px ${FONT_XC}`;
    g.fillText(ds.length ? `Dealers: ${ds.map(d => `${d.name} ${d.left} to sell`).join('  ·  ')}` : 'Dealers: none hired yet (UPGRADES)', 28, 520);
    box({ x: W - 210, y: 360, w: 182, h: 100, act: 'menu', id: 'pause' }, '#2a2f38');
    g.textAlign = 'center'; g.fillStyle = '#f2efe6'; g.font = `800 34px ${FONT_XC}`; g.fillText('PAUSE', W - 119, 410);
  }
  function drawUI() {
    const g = UI.g, W = UI.W, H = UI.H;
    if (!g) return;
    const night = UI.phase === 'night' || UI.phase === 'night2';
    const hov = i => i === UI.hover.l || i === UI.hover.r;
    g.fillStyle = '#14161a'; g.fillRect(0, 0, W, H);
    UI.buttons.length = 0;
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    const box = (b, fill) => { const i = UI.buttons.length; UI.buttons.push(b); g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h); if (hov(i)) { g.lineWidth = 6; g.strokeStyle = '#c8f03c'; g.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6); } };
    if (UI.mode) { drawMenu(g, W, H, box); UI.tex.needsUpdate = true; return; }
    g.fillStyle = '#1f232b'; g.fillRect(0, 0, W, 84);
    g.fillStyle = '#f2efe6'; g.textAlign = 'left'; g.font = `800 64px ${FONT_XC}`;
    g.fillText(dayText(UI.clock), 28, 46);
    g.textAlign = 'center'; g.font = `800 32px ${FONT_XC}`;
    const fxT = UI.fx ? `   ·   ${FX_NAME[UI.fx] || ''} ${Math.max(0, Math.ceil(UI.fxLeft))} s` : '';
    const dayN = CAREER && UI.career ? `DAY ${UI.career.day}  ·  ` : '';
    g.fillText(dayN + (UI.phase === 'tutorial' ? 'TRAINING' : UI.phase === 'over' ? 'THE END' : night ? 'NIGHT  ·  THE CELLAR WORKS' : UI.shop ? `SHOP OPEN  ·  ${UI.waiting} WAITING` : 'DAY  ·  SHOP SHUT') + fxT, W / 2 + 30, 46);
    g.textAlign = 'right'; g.font = `800 58px ${FONT_XC}`; g.fillStyle = '#c8f03c';
    g.fillText(money$(UI.money), W - 28, 46);
    // the one thing to do now
    g.fillStyle = '#c8f03c'; g.fillRect(0, 84, W, 48);
    g.fillStyle = '#14161a'; g.textAlign = 'left';
    let fs = 30;
    const line = `NOW:  ${UI.goal || ''}`;
    do { g.font = `800 ${fs}px ${FONT_XC}`; fs -= 2; } while (fs > 16 && g.measureText(line).width > W - 40);
    g.fillText(line, 20, 109);
    const tabs = CAREER ? [['STORE', 'store'], ['UPGRADES', 'upgrades'], ['CAREER', 'career'], ['RECIPES', 'recipes'], ['CITY', 'city'], ['HELP', 'help']] : [['STORE', 'store'], ['RECIPES', 'recipes'], ['CITY', 'city'], ['HELP', 'help']];
    const tw = (W - 48 - (tabs.length - 1) * 8) / tabs.length;
    tabs.forEach(([label, id], i) => {
      const x = 24 + i * (tw + 8), sel = UI.tab === id;
      box({ x, y: 142, w: tw, h: 52, act: 'tab', id }, sel ? '#c8f03c' : '#2a2f38');
      g.fillStyle = sel ? '#14161a' : '#f2efe6'; g.textAlign = 'center'; g.font = `800 ${tabs.length > 4 ? 26 : 32}px ${FONT_XC}`;
      g.fillText(label, x + tw / 2, 169);
    });
    if (UI.tab === 'store') {
      storeList.forEach((it, i) => {
        const x = 28 + (i % 4) * 244, y = 212 + ((i / 4) | 0) * 184, [have, coming] = stockOf(it.kind), poor = UI.money < it.price;
        const locked = CAREER && !hasAnyU(CAREER.storeNeeds[it.kind]);
        if (locked) { g.fillStyle = '#1a1d22'; g.fillRect(x, y, 232, 172); } else box({ x, y, w: 232, h: 172, act: 'buy', id: it.kind }, '#232830');
        g.textAlign = 'left'; g.fillStyle = locked ? '#6b7178' : '#f2efe6'; g.font = `800 34px ${FONT_XC}`;
        g.fillText(NAME[it.kind] || it.kind, x + 14, y + 34);
        g.font = `800 60px ${FONT_XC}`; g.fillStyle = locked ? '#6b7178' : poor ? '#f06a45' : '#c8f03c';
        g.fillText(locked ? 'LOCKED' : `$${it.price}`, x + 14, y + 94);
        g.font = `700 24px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
        g.fillText(locked ? 'see UPGRADES' : `on the rack: ${have}${coming ? `  +${coming} coming` : ''}`, x + 14, y + 144);
      });
    } else if (UI.tab === 'upgrades' && CAREER) drawUpgrades(g, W, H, box);
    else if (UI.tab === 'career' && CAREER) drawCareer(g, W, H, box);
    else if (UI.tab === 'recipes') {
      let y = 226;
      const lines = recipeLines();
      const step = lines.length > 8 ? 38 : 43;
      for (const [name, how, pay] of lines) {
        g.textAlign = 'left'; g.fillStyle = pay === 'LOCKED' ? '#6b7178' : '#c8f03c'; g.font = `800 30px ${FONT_XC}`; g.fillText(name, 34, y);
        g.fillStyle = pay === 'LOCKED' ? '#6b7178' : '#f2efe6'; g.font = `700 27px ${FONT_XC}`; g.fillText(how, 240, y);
        g.textAlign = 'right'; g.fillStyle = pay === 'LOCKED' ? '#6b7178' : '#c8f03c'; g.font = `800 30px ${FONT_XC}`; g.fillText(pay, W - 34, y);
        y += step;
      }
    } else if (UI.tab === 'city') {
      let y = 232;
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
      g.fillText('By day: into the lift with the box, button STREET. Walk on at the post with the exit sign.', 34, y); y += 54;
      street.forEach((b, i) => {
        const locked = CAREER && !hasU(i === 0 ? 'street' : b.id);
        g.textAlign = 'left'; g.fillStyle = locked ? '#6b7178' : '#c8f03c'; g.font = `800 40px ${FONT_XC}`; g.fillText(`${i + 1}. ${String(b.name || '').toUpperCase()}`, 34, y);
        g.fillStyle = locked ? '#6b7178' : '#f2efe6'; g.font = `700 32px ${FONT_XC}`; g.fillText(locked ? 'locked: see UPGRADES' : `buys ${(b.wants || []).map(k => NAME[k] || k).join(', ')}`, 330, y);
        g.textAlign = 'right'; g.fillStyle = locked ? '#6b7178' : '#c8f03c'; g.font = `800 36px ${FONT_XC}`; g.fillText(b.bonus > 1 ? `pays x${b.bonus}` : 'usual price', W - 34, y);
        y += 66;
      });
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
      g.fillText('A buyer shows what he wants over his head. Hold the packet out to him.', 34, y + 6);
      if (CAREER) g.fillText('A hired dealer takes what lies on his shelf of the blue cabinet at 08:00.', 34, y + 46);
    } else {
      let y = 222;
      const rows = [
        ['NIGHT 00:00 to 08:00', 'the machines of the cellar run. Make product, pack it in the box.'],
        ['DAY 08:00 to 20:00', 'pull the lever on the counter to open the shop, or go and sell in the street.'],
        ['POUR', 'tilt the bottle over the mixer. One packet for every 50 ml. Shaken and exact: PURE.'],
        ['THE BOX', 'fifteen packets. Pull the trigger over the one you want to take out.'],
        ['JOINT, SYRUP', 'held to your mouth: customers wait twice as long.'],
        ['BLUE ICE, CRYSTAL', 'at the mouth: your machines run twice as fast.'],
        ['PILLS, CANDY', 'at the mouth: what you sell pays one and a half times.'],
        ['POWDER', 'at the mouth: your batches come out pure without shaking.'],
      ];
      if (CAREER) rows.push(['PAUSE', 'X or Y on the left controller: resume, or save and quit.']);
      for (const [k, t] of rows) {
        g.textAlign = 'left'; g.fillStyle = '#c8f03c'; g.font = `800 26px ${FONT_XC}`; g.fillText(k, 30, y);
        g.fillStyle = '#f2efe6'; g.font = `700 25px ${FONT_XC}`; g.fillText(t, 280, y);
        y += rows.length > 8 ? 38 : 42;
      }
    }
    UI.tex.needsUpdate = true;
  }
  const _po = new THREE.Vector3(), _pd = new THREE.Vector3(), _pe = new THREE.Vector3(), _pq = new THREE.Quaternion();
  /** Where a hand points from and to, in the coordinates of the hall. */
  function pointerOf(k, o, d) {
    const h = ctx.hands[k];
    if (!h || h.active === false) return false;
    if (h.ray) {
      h.ray.getWorldPosition(o); h.ray.getWorldQuaternion(_pq);
      _pe.set(0, 0, -1).applyQuaternion(_pq).add(o);
      group.worldToLocal(o); group.worldToLocal(_pe);
      d.copy(_pe).sub(o).normalize();
      return true;
    }
    if (k !== 'r') return false;
    o.copy(ctx.head.pos); d.copy(h.pos).sub(ctx.head.pos);
    if (d.lengthSq() < 1e-6) return false;
    d.normalize();
    return true;
  }
  function updateScreens() {
    if (!UI.g) return;
    let changed = false;
    for (let j = 0; j < 2; j++) {
      const k = HK[j];
      let hit = -1, scr = null, hx = 0, hy = 0, hz = 0;
      if (!over && pointerOf(k, _po, _pd)) for (const sc of UI.list) {
        if (sc.float ? !sc.plane.visible : sc.lv !== myLevel) continue;
        const den = _pd.x * sc.nx + _pd.z * sc.nz;
        if (den > -0.05) continue;                                   // pointing away from the screen's face
        const t = ((sc.cx - _po.x) * sc.nx + (sc.cz - _po.z) * sc.nz) / den;
        if (t < 0.05 || t > 6) continue;
        const px = _po.x + _pd.x * t, py = _po.y + _pd.y * t, pz = _po.z + _pd.z * t;
        const u = (px - sc.cx) * sc.rx + (pz - sc.cz) * sc.rz, v = py - sc.cy;
        if (Math.abs(u) > sc.w / 2 || Math.abs(v) > sc.h / 2) continue;
        const cx = (u / sc.w + 0.5) * UI.W, cy = (0.5 - v / sc.h) * UI.H;
        hit = UI.buttons.findIndex(b => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
        scr = sc; hx = px + sc.nx * 0.006; hy = py; hz = pz + sc.nz * 0.006;
        break;
      }
      for (const sc of UI.list) { const dot = sc.dots[j]; dot.visible = sc === scr; if (sc === scr) { dot.position.set(hx, hy, hz); if (sc.float) dot.rotation.y = Math.atan2(sc.nx, sc.nz); } }
      UI.on[k] = !!scr;
      if (hit !== UI.hover[k]) { UI.hover[k] = hit; changed = true; if (hit >= 0) ctx.haptic(k, 0.15, 10); }
    }
    const pl = UI.patrol ? `${UI.patrol.phase}${Math.ceil(UI.patrol.left || 0)}` : '';
    const key = `${UI.mode}|${UI.ckey}|${UI.page}|${UI.confirm}|${UI.tab}|${UI.phase}|${Math.floor(UI.clock / 10)}|${UI.money}|${pl}|${UI.goal}|${UI.shop ? 1 : 0}${UI.waiting}|${UI.fx ? UI.fx + Math.ceil(UI.fxLeft) : ''}|${storeList.map(it => stockOf(it.kind).join('.')).join(',')}`;
    if (changed || (key !== UI.key && now - UI.at > 0.2)) { UI.key = key; UI.at = now; drawUI(); }
  }
  /** The trigger on a button of the screen. */
  function clickUI(k) {
    const b = UI.buttons[UI.hover[k]];
    if (!b) return false;
    if (b.act === 'tab') { UI.tab = b.id; UI.key = ''; drawUI(); ctx.haptic(k, 0.4, 25); return true; }
    if (b.act === 'buy') { ctx.send({ a: 'buy', hand: k, kind: b.id }); ctx.haptic(k, 0.6, 40); return true; }
    if (b.act === 'unlock') { ctx.send({ a: 'unlock', hand: k, id: b.id }); ctx.haptic(k, 0.7, 60); return true; }
    if (b.act === 'page') { UI.page = b.id; UI.key = ''; drawUI(); ctx.haptic(k, 0.4, 25); return true; }
    if (b.act === 'newcareer') { if (!UI.confirm) { UI.confirm = true; UI.key = ''; drawUI(); ctx.haptic(k, 0.6, 60); return true; } ctx.send({ a: 'menu', hand: k, choice: 'new' }); UI.confirm = false; ctx.haptic(k, 0.9, 80); return true; }
    if (b.act === 'menu') { ctx.send({ a: 'menu', hand: k, choice: b.id }); UI.confirm = false; ctx.haptic(k, 0.9, 80); return true; }
    return false;
  }

  // ---------- numbers: what a vessel holds, what is in the mixer, on the rack, in the box ----------
  const labels = [], labelGroup = new THREE.Group();
  labelGroup.name = 'backroom:labels';
  group.add(labelGroup);
  let labelN = 0;
  function label(text, sub, x, y, z, k = 1) {
    let L = labels[labelN];
    if (!L) {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const tex = keep(new THREE.CanvasTexture(cv));
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false })));
      sp.scale.set(0.21, 0.079, 1);
      sp.renderOrder = 6;
      labelGroup.add(sp);
      L = labels[labelN] = { sp, g: cv.getContext('2d'), tex, key: '' };
    }
    labelN++;
    const key = `${text}|${sub || ''}`;
    if (key !== L.key) {
      L.key = key;
      const g = L.g;
      g.clearRect(0, 0, 256, 96);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const line = (t, size, yy, fill) => { g.font = `800 ${size}px ${FONT_XC}`; g.lineWidth = 7; g.strokeStyle = 'rgba(19,20,17,0.92)'; g.strokeText(t, 128, yy); g.fillStyle = fill; g.fillText(t, 128, yy); };
      line(text, sub ? 46 : 56, sub ? 30 : 48, '#f2efe6');
      if (sub) line(sub, 26, 72, '#c8f03c');
      L.tex.needsUpdate = true;
    }
    L.sp.position.set(x, y, z);
    L.sp.scale.set(0.21 * k, 0.079 * k, 1);
    L.sp.visible = true;
  }
  const sumOf = c => { let t = 0; for (let i = 0; i < c.length; i++) t += c[i] || 0; return t; };
  const topOf = c => { let b = 0; for (let i = 1; i < c.length; i++) if ((c[i] || 0) > (c[b] || 0)) b = i; return b; };
  const partsOf = (c, pct) => { const sum = sumOf(c); return c.map((v, i) => (v >= 1 ? `${pct ? Math.round(v / sum * 100) + '%' : Math.round(v)} ${LIQ_WORD[i]}` : null)).filter(Boolean).join(' · '); };
  const pourFx = HK.map((k, j) => { const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009, 0.009, 1, 6).translate(0, -0.5, 0)), keep(new THREE.MeshBasicMaterial({ color: LIQ_HEX[0] }))); m.visible = false; group.add(m); return m; });
  function updateLab() {
    // a tilted vessel that is pouring: a thin stream from its neck
    for (let j = 0; j < 2; j++) {
      const m = pourFx[j], r = hand[HK[j]].held, on = !!r && LIQ.has(r.kind) && r.ml > 0 && !!r.hq && now - (r.pourT ?? -9) < 0.5;
      m.visible = on;
      if (!on) continue;
      _nk.set(0, 0, -1).applyQuaternion(r.hq);
      m.position.set(r.x + _nk.x * r.h * 0.95, r.y + _nk.y * r.h * 0.95, r.z + _nk.z * r.h * 0.95);
      m.scale.set(1 + 0.3 * Math.sin(now * 41), 0.3, 1 + 0.3 * Math.cos(now * 37));
      const c = r.c || [1, 0, 0];
      m.material.color.setHex(LIQ_HEX[topOf(c)] ?? LIQ_HEX[0]);
    }
    // the numbers
    labelN = 0;
    if (!over) {
      const hx = ctx.head.pos.x, hz = ctx.head.pos.z;
      const near = (x, z, d) => { const dx = x - hx, dz = z - hz; return dx * dx + dz * dz <= d * d; };
      for (let i = 0; i < itemList.length && labelN < 14; i++) {
        const r = itemList[i];
        if (r.mode === M_FREE && !r.on) continue;
        if (LIQ.has(r.kind) && r.c && (r.mode === M_MINE || near(r.x, r.z, 0.9))) {
          const mixed = r.c.filter(v => v >= 1).length > 1;
          label(`${Math.round(r.ml)} ml`, mixed ? partsOf(r.c, false) : r.shaken ? 'shaken' : '', r.x, r.y + r.h + 0.09, r.z);
        } else if (r.kind === 'box' && r.n && near(r.x, r.z, 1.6)) {
          const cnt = {}; for (const q of r.n) cnt[q] = (cnt[q] || 0) + 1;
          label(`${r.n.length} / ${start.lab?.box ?? 15}`, Object.entries(cnt).map(([q, v]) => `${v} ${(NAME[q] || q).toLowerCase()}`).join(' · '), r.x, r.y + 0.42, r.z, 1.2);
        } else if (r.kind === 'tray' && r.n && r.n.length && near(r.x, r.z, 1.4)) label(`${r.n.length} / 3`, (NAME[r.n[0]] || r.n[0]).toLowerCase(), r.x, r.y + 0.2, r.z);
        else if (r.kind === 'brick' && near(r.x, r.z, 1.2)) label('BRICK', '', r.x, r.y + 0.45, r.z);
      }
      for (let i = 0; i < stations.length && labelN < 14; i++) {
        const st = stations[i];
        if (!st.on) continue;
        if (st.kind === 'bench' && st.taps && st.taps[2] && near(st.x, st.z, 2)) {
          const mix = st.view.mix || [0, 0, 0], sum = sumOf(mix), t = st.taps[2];
          if (sum >= 1) label(`${Math.round(sum)} ml`, partsOf(mix, true), t.x, t.y + 0.16, t.z);
          else if (st.view.left > 0) label(`${st.view.left} more`, '', t.x, t.y + 0.16, t.z);
          else if (st.view.on === false) label('ASLEEP', 'runs 00:00 to 08:00', t.x, t.y + 0.16, t.z);
        } else if (st.kind === 'bin' && st.view.stock != null && st.gives !== 'meat' && near(st.x, st.z, 2.2)) {
          label(`x${st.view.stock | 0}`, NAME[st.gives] || '', st.x + st.sin * 0.22, st.y + st.h + 0.2, st.z + st.cos * 0.22);
        }
      }
    }
    if (!over && myLevel === 1 && CAREER) {
      // the dealers' shelves of the blue cabinet, the press
      const C = UI.career || {};
      if (stashSt && stashSt.on) (CAREER.dealerCells || []).forEach(dc => {
        const d = (C.dealers || []).find(q => q.id === dc.block), sl = stashSt.slots[dc.cell];
        if (!d || !d.hired || !sl) return;
        label(`${String(dc.name).toUpperCase()} DEALER`, d.left ? `${d.left} to sell today` : 'put packets here: he takes them at 08:00', sl.x + stashSt.sin * 0.25, sl.y + 0.2, sl.z + stashSt.cos * 0.25);
      });
      const gr = stations.find(q => q.kind === 'grinder');
      if (gr && gr.on && gr.btn) label(hasU('press') ? 'BRICK PRESS' : 'LOCKED', hasU('press') ? '3 of one kind on a tray, pull in the green' : 'Brick press: see UPGRADES', gr.btn.x, gr.btn.y + 0.3, gr.btn.z);
    }
    if (!over && myLevel === 0) {
      // the drinks: the customer's cup says which drink, and each tap of the machine says what it pours
      for (let i = 0; i < custList.length && labelN < 18; i++) {
        const r = custList[i], o = r.view.order;
        if (!o || o.kind !== 'cup' || r.lv !== 0 || !(r.state === 'in' || r.state === 'wait') || !r.ov.g.visible) continue;
        const p = r.ov.g.position;
        label(DRINK_NAME[o.drink] || 'DRINK', '', p.x, p.y + 0.2, p.z, 1.3);
      }
      if (drinksSt && drinksSt.on) drinksSt.taps.forEach((t, j) => { label(DRINK_NAME[DRINK_TAP[j]] || '', '', t.x, t.y + 0.16, t.z, 0.8); });
    }
    if (!over) {
      // the lift: where each button of the cabin goes
      if (elev && elev.on && street.length && inCabin(ctx.head.pos) && !(elev.state && elev.state.moving)) {
        for (const b of elevBtns) { const to = destOf(b); if (b.inside && to != null) label(STOP[to] || '', '', b.rx, b.y + 0.14, b.rz); }
      }
      // the street: the name of this block and the time over the middle of the zone, what each post leads to
      if (myLevel >= 2) {
        const blk = blockOf(myLevel);
        label(dayText(UI.clock), `${blk ? String(blk.name).toUpperCase() : ''}  ·  $${UI.money}`, 0, 2.35, 0, 2.4);
        for (const w of ways) {
          if (!w.on) continue;
          const to = blockOf(w.to);
          label(w.to > myLevel ? 'ON' : 'BACK', to ? `${String(to.name).toUpperCase()}${to.bonus > 1 && w.to > myLevel ? `  pays x${to.bonus}` : ''}` : '', w.btn.x, w.btn.y + 0.62, w.btn.z, 1.7);
        }
        if (myLevel === 2 && cab) label('LIFT', 'PIZZERIA', cab.x, 2.25, cab.z + (cab.z < 0 ? cab.hd : -cab.hd), 1.7);
      } else if (shutSt && shutSt.on && UI.phase !== 'tutorial' && !(UI.phase === 'night' || UI.phase === 'night2')) {
        label(UI.shop ? 'OPEN' : 'SHUT', UI.shop ? 'pull to shut' : 'pull to open', shutSt.btn.x, shutSt.btn.y + 0.22, shutSt.btn.z);
      }
    }
    for (let i = labelN; i < labels.length; i++) labels[i].sp.visible = false;
  }

  // which of the taps of a station can be pressed right now
  const tapOn = (st, j) => {
    if (st.kind === 'bench') return j < 2;
    if (st.kind !== 'stash' || j === 0) return true;
    const sl = st.slots[j - 1];      // an empty shelf spot of a supply, cabinet open, nothing on its way
    return !!(st.shelf && st.shelf[j - 1]) && (st.view.open || 0) > 0.5 && !!sl && sl.item == null && !(st.view.pend || []).includes(j - 1);
  };
  // асансьорът и подът на кабината му (центърът и размерът идват от gameStart; иначе от самата станция)
  const elev = stations.find(s => s.kind === 'elevator') || null;
  const cab = elev && start.elevator && typeof start.elevator.x === 'number' && typeof start.elevator.z === 'number'
    ? { x: start.elevator.x, z: start.elevator.z, hw: (+start.elevator.w || elev.w) / 2, hd: (+start.elevator.d || elev.d) / 2 } : null;
  function inCabin(p) {
    if (!elev) return false;
    if (cab) return Math.abs(p.x - cab.x) <= cab.hw && Math.abs(p.z - cab.z) <= cab.hd;
    const dx = p.x - elev.x, dz = p.z - elev.z;
    return Math.abs(dx * elev.cos - dz * elev.sin) <= elev.w / 2 && Math.abs(dx * elev.sin + dz * elev.cos) <= elev.d / 2;
  }
  // Копчетата на асансьора в координатите на залата. Моделът ги казва в userData.buttons ({ side: 'in' | 'out', x, y, z },
  // местни координати); ако ги няма, приема се едно вътре, в средата на кабината.
  const BTN_R = 0.32;
  const elevBtns = [], elevQ = new THREE.Quaternion();
  if (elev) {
    const given = elev.live.userData && Array.isArray(elev.live.userData.buttons) && elev.live.userData.buttons.length ? elev.live.userData.buttons : [{ side: 'in', x: 0, y: 1.2, z: 0 }];
    for (const b of given) {
      const inside = b.side !== 'out', k = inside ? -0.014 : 0.014;       // пръстенът стои малко пред стената, към която е копчето
      const x = elev.x + b.x * elev.cos + b.z * elev.sin, z = elev.z - b.x * elev.sin + b.z * elev.cos;
      elevBtns.push({ inside, x, y: elev.y + b.y, z, rx: x + k * elev.sin, rz: z + k * elev.cos });
    }
    elevQ.setFromEuler(new THREE.Euler(Math.PI / 2, elev.yaw, 0, 'YXZ'));   // пръстенът се изправя срещу вратата
  }
  // The two buttons inside the cabin: with a street the cabin has three stops, so each button names one of the other two.
  let insideN = 0;
  for (const b of elevBtns) if (b.inside) b.idx = insideN++;
  function destOf(b) {
    if (!b || !b.inside || !street.length || insideN < 2) return null;
    const other = [0, 1, 2].filter(v => v !== Math.min(2, myLevel));
    return other[Math.min(1, b.idx | 0)];
  }
  /** копчето, което ръка на това място би натиснала: вътрешните само отвътре, външното само за да повика кабината от другото ниво */
  function elevButton(px, py, pz) {
    if (!elev || !elev.on || (elev.state && elev.state.moving)) return null;
    const inside = inCabin(ctx.head.pos), away = !!(elev.state && lvl(elev.state.level) !== myLevel);
    let best = null, bd = BTN_R * BTN_R;
    for (let i = 0; i < elevBtns.length; i++) {
      const b = elevBtns[i];
      if (b.inside ? !inside : !away) continue;
      const dx = b.x - px, dy = b.y - py, dz = b.z - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= bd) { bd = d2; best = b; best.d2 = d2; }
    }
    return best;
  }
  /** квадратът на разстоянието от точка до кутията на станция (0, ако е вътре) */
  function boxDist2(s, px, py, pz) {
    const dx = px - s.x, dz = pz - s.z, lx = Math.abs(dx * s.cos - dz * s.sin) - s.w / 2, lz = Math.abs(dx * s.sin + dz * s.cos) - s.d / 2;
    const ly = py < s.y ? s.y - py : py > s.y + s.h ? py - s.y - s.h : 0;
    return (lx > 0 ? lx * lx : 0) + ly * ly + (lz > 0 ? lz * lz : 0);
  }

  let staticParts = [], needStatic = false;
  function rebuildStatic() {
    for (const p of staticParts) p.geo.dispose();
    staticParts = [];
    for (let lv = 0; lv < nLevels; lv++) {
      const G = staticL[lv];
      G.clear();
      const B = newBake();
      buildShell(B, lv);
      for (const s of stations) {
        if (s.mode !== 'static' || s.level !== lv) continue;
        const before = B.skinned;
        B.skinned = false;
        collect(s.live, B);
        if (B.skinned) { s.mode = 'live'; s.pinLive = true; dyn.push(s); s.parent.add(s.live); }   // рядко: модел с кости остава жив
        B.skinned = before;
      }
      const e = finish(B);
      for (const p of e.parts) { staticParts.push(p); const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; m.receiveShadow = true; G.add(m); }
      for (const x of e.extras) G.add(x);
    }
    ctx.refreshShadows?.();
  }
  rebuildStatic();

  // Простата стая (под, стени, улица, очертание) е само за проби: щом основата носи ctx.assets, декорът рисува своята
  // и моята не се строи изобщо. setRoom(true|false) го решава на ръка.
  let roomForce = typeof opts.room === 'boolean' ? opts.room : undefined, roomBuilt = false;
  function applyRoom() {
    const on = roomForce !== undefined ? roomForce : !ctx.assets;
    if (on && !roomBuilt) {
      roomBuilt = true;
      for (let lv = 0; lv < nLevels; lv++) {
        const B = newBake();
        buildRoom(B, lv);
        for (const p of finish(B).parts) { const m = new THREE.Mesh(keep(p.geo), p.mat); m.receiveShadow = true; roomL[lv].add(m); }
      }
    }
    for (let lv = 0; lv < nLevels; lv++) roomL[lv].visible = on && lv === myLevel;
  }
  applyRoom();

  // The street: the edge of the zone is drawn on the ground (there are no walls to show it), a soft dark ball around the
  // head closes the eyes for a moment when the place changes, and tints the view a little while something taken works.
  const streetLine = new THREE.Group();
  streetLine.visible = false;
  group.add(streetLine);
  if (street.length) {
    const B = newBake(), col = lin(0xc8f03c);
    for (const r of rooms) for (const W of wallsOf(r)) {
      const Pt = (u, inn = 0) => [W.ox + W.dx * u + W.nx * inn, 0.012, W.oz + W.dz * u + W.nz * inn];
      const holes = [];
      for (const dr of roomDoors) {
        if ((dr.a !== r.id && dr.b !== r.id) || (dr.axis === 'x') !== (W.dx === 1)) continue;
        if (Math.abs((dr.x - W.ox) * W.nx + (dr.z - W.oz) * W.nz) > 0.12) continue;
        const u = (dr.x - W.ox) * W.dx + (dr.z - W.oz) * W.dz, half = (+dr.w || 0.9) / 2;
        holes.push([u - half, u + half]);
      }
      holes.sort((a, b) => a[0] - b[0]);
      let from = 0;
      const seg = (u0, u1) => { if (u1 - u0 > 0.01) quadTo(B.unlit, Pt(u0), Pt(u1), Pt(u1, 0.04), Pt(u0, 0.04), 0, 1, 0, col); };
      for (const h of holes) { seg(from, Math.max(from, h[0])); from = Math.max(from, Math.min(W.len, h[1])); }
      seg(from, W.len);
    }
    for (const part of finish(B).parts) streetLine.add(new THREE.Mesh(keep(part.geo), part.mat));
  }
  let fade = 0, wasLevel = 0, arrived = -9, myFx = null;
  const banner = { sp: null, g: null, tex: null, key: null };
  if (street.length) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 96;
    banner.g = cv.getContext('2d');
    banner.tex = keep(new THREE.CanvasTexture(cv));
    banner.tex.colorSpace = THREE.SRGBColorSpace;
    banner.sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: banner.tex, depthTest: false, toneMapped: false })));
    banner.sp.scale.set(2.3, 2.3 * 96 / 1024, 1);
    banner.sp.position.set(0, 2.72, 0);
    banner.sp.renderOrder = 6;
    streetLine.add(banner.sp);
  }
  function drawBanner(text) {
    if (!banner.g || text === banner.key) return;
    banner.key = text;
    const g = banner.g;
    g.clearRect(0, 0, 1024, 96);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    let fs = 44;
    do { g.font = `800 ${fs}px ${FONT_XC}`; fs -= 2; } while (fs > 18 && g.measureText(text).width > 1000);
    g.lineWidth = 8; g.strokeStyle = 'rgba(19,20,17,0.92)'; g.strokeText(text, 512, 50);
    g.fillStyle = '#f2efe6'; g.fillText(text, 512, 50);
    banner.tex.needsUpdate = true;
  }
  const veilMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  const veil = new THREE.Mesh(keep(new THREE.SphereGeometry(0.3, 16, 10)), veilMat);
  veil.renderOrder = 50; veil.visible = false; veil.frustumCulled = false;
  group.add(veil);
  function updateVeil(dt) {
    fade = Math.max(0, fade - dt / 0.8);
    const wash = UI.mode ? 0.55 : myFx ? 0.05 + 0.025 * Math.sin(now * 1.7) : 0;
    const a = Math.max(fade > 0 ? Math.min(1, fade * 1.6) : 0, wash);
    veil.visible = a > 0.004;
    if (!veil.visible) return;
    veil.position.copy(ctx.head.pos);
    veilMat.opacity = a;
    veilMat.color.setHex(fade > 0.05 || UI.mode ? 0x000000 : FX_HEX[myFx] || 0x000000);
  }

  /** какво вижда местният играч: едно ниво, сменя се в един кадър и нищо не се строи */
  function applyLevel(lv) {
    myLevel = lv;
    for (let i = 0; i < nLevels; i++) staticL[i].visible = stationL[i].visible = i === lv;
    applyRoom();
    for (let i = 0; i < stations.length; i++) { const s = stations[i]; s.on = s.level < 0 ? lv <= 2 : s.level === lv; }      // the cabin: at its three stops only
    stationAll.visible = lv <= 2;
    streetLine.visible = lv >= 2;
    if (lv >= 2 || wasLevel >= 2) fade = 1;              // another place: the eyes open on it
    if (lv >= 2 && lv !== wasLevel) arrived = now;
    wasLevel = lv;
    for (let i = 0; i < slots.length; i++) slots[i].on = slots[i].level === lv;
    for (let i = 0; i < itemList.length; i++) itemList[i].on = itemList[i].level === lv;
    if (elev) { elev.keyT = now; if (elev.mode === 'baked') toLive(elev); }   // вратите му зависят от това на кое ниво съм
    hud.setLevel(lv);
    ctx.refreshShadows?.();
  }

  function toBaked(s) {
    if (s.state) kit.setState(s.live, s.kind, s.view, undefined);
    s.parent.remove(s.live);
    const B = newBake();
    collect(s.live, B);
    if (B.skinned) { s.pinLive = true; s.parent.add(s.live); return; }
    s.entry = finish(B);
    s.v = getView(s.parent);
    s.v.cast = s.v.recv = true;
    setEntry(s.v, s.entry);
    s.mode = 'baked';
    ctx.refreshShadows?.();
  }
  function toLive(s) {
    if (s.v) { freeView(s.v); s.v = null; }
    if (s.entry) { disposeEntry(s.entry); s.entry = null; }
    s.parent.add(s.live);
    s.mode = 'live';
    ctx.refreshShadows?.();
  }

  // ---------- пръстени: свободни гнезда и това, което ръката ще хване ----------

  const RING_MAX = 48;
  let ringGeo = null, ringUnit = 1;
  {
    const mk = kit.marker();
    if (mk) {
      const B = newBake();
      collect(mk, B);
      const e = finish(B);
      if (e.parts.length === 1 && !e.extras.length) {
        ringGeo = e.parts[0].geo;
        ringGeo.computeBoundingBox();
        const bb = ringGeo.boundingBox;
        ringUnit = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 || 1;
      } else disposeEntry(e);
    }
    if (!ringGeo) { ringGeo = new THREE.RingGeometry(0.84, 1, 36); ringGeo.rotateX(-Math.PI / 2); ringUnit = 1; }
    keep(ringGeo);
  }
  const ringMesh = new THREE.InstancedMesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide })), RING_MAX);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.frustumCulled = false;
  ringMesh.count = 0; ringMesh.visible = false;
  const RING_DIM = new THREE.Color(0xe6ead8), RING_ON = new THREE.Color(0xc8f03c);   // свободно гнездо: топло бяло; целта на ръката: сигналният лайм
  ringMesh.setColorAt(0, RING_DIM);
  ringMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  fxGroup.add(ringMesh);
  let ringN = 0;
  const _s3 = new THREE.Vector3();
  /** изправен пръстен: около копче на стена или пред гнездо на рафт */
  function ringUp(x, y, z, radius, color, q = elevQ) {
    if (ringN >= RING_MAX) return;
    const s = radius / ringUnit;
    _m4.compose(_v.set(x, y, z), q, _s3.set(s, s, s));
    ringMesh.setMatrixAt(ringN, _m4);
    ringMesh.setColorAt(ringN, color);
    ringN++;
  }
  /** пръстенът на гнездо: легнал на плота, а за гнездо на рафт изправен пред него */
  function slotRing(sl, radius, color, lift) {
    if (sl.up) ringUp(sl.x + sl.st.sin * 0.02, sl.y + radius, sl.z + sl.st.cos * 0.02, radius, color, sl.st.q);
    else ring(sl.x, sl.y + lift, sl.z, radius, color);
  }
  function ring(x, y, z, radius, color) {
    if (ringN >= RING_MAX) return;
    const s = radius / ringUnit;
    _m4.makeScale(s, s, s).setPosition(x, y, z);
    ringMesh.setMatrixAt(ringN, _m4);
    ringMesh.setColorAt(ringN, color);
    ringN++;
  }

  // ---------- общи правоъгълници: ленти, искри, надписи ----------

  function quadBatch(n, material, order, rgba) {
    const cs = rgba ? 4 : 3;
    const pos = new Float32Array(n * 12), col = new Float32Array(n * 4 * cs), uv = new Float32Array(n * 8), idx = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); }
    const geo = keep(new THREE.BufferGeometry());
    const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aCol = new THREE.BufferAttribute(col, cs).setUsage(THREE.DynamicDrawUsage), aUv = new THREE.BufferAttribute(uv, 2);
    geo.setAttribute('position', aPos); geo.setAttribute('color', aCol); geo.setAttribute('uv', aUv);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = order;
    fxGroup.add(mesh);
    let was = false;
    return {
      mesh,
      /** център, вектор надясно, вектор нагоре, половин ширина и височина, цвят */
      set(i, cx, cy, cz, rx, ry, rz, ux, uy, uz, hw2, hh2, r, g, b, a) {
        const o = i * 12, ax = rx * hw2, ay = ry * hw2, az = rz * hw2, bx = ux * hh2, by = uy * hh2, bz = uz * hh2;
        pos[o] = cx - ax - bx; pos[o + 1] = cy - ay - by; pos[o + 2] = cz - az - bz;
        pos[o + 3] = cx + ax - bx; pos[o + 4] = cy + ay - by; pos[o + 5] = cz + az - bz;
        pos[o + 6] = cx + ax + bx; pos[o + 7] = cy + ay + by; pos[o + 8] = cz + az + bz;
        pos[o + 9] = cx - ax + bx; pos[o + 10] = cy - ay + by; pos[o + 11] = cz - az + bz;
        for (let k = 0, c = i * 4 * cs; k < 4; k++, c += cs) { col[c] = r; col[c + 1] = g; col[c + 2] = b; if (rgba) col[c + 3] = a; }
      },
      hide(i) { pos.fill(0, i * 12, i * 12 + 12); },
      uvRect(i, u0, v0, u1, v1) { const o = i * 8; uv[o] = u0; uv[o + 1] = v0; uv[o + 2] = u1; uv[o + 3] = v0; uv[o + 4] = u1; uv[o + 5] = v1; uv[o + 6] = u0; uv[o + 7] = v1; aUv.needsUpdate = true; },
      commit(active) {
        mesh.visible = active > 0;
        if (active > 0 || was) { aPos.needsUpdate = true; aCol.needsUpdate = true; }
        was = active > 0;
      },
    };
  }

  // ленти за търпението на клиентите (фон + запълване)
  const BAR_N = 20;
  const barBatch = quadBatch(BAR_N, keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })), 6, false);
  const cCalm = new THREE.Color(0x7bd66a), cWarn = new THREE.Color(0xf2b84a), cBad = new THREE.Color(0xf06a45), cBarBg = new THREE.Color(0x15170f), cT = new THREE.Color();

  // искри и пушек
  const FX_N = 48;
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 64;
  {
    const g = dotCanvas.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const dotTex = keep(new THREE.CanvasTexture(dotCanvas));
  const fxBatch = quadBatch(FX_N, keep(new THREE.MeshBasicMaterial({ map: dotTex, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false })), 10, true);
  const fx = { on: new Uint8Array(FX_N), d: new Float32Array(FX_N * 14), next: 0, live: 0 };   // x y z vx vy vz age life s0 s1 r g b grav
  function spark(x, y, z, vx, vy, vz, life, s0, s1, hex, grav = 0) {
    let i = -1;
    for (let k = 0; k < FX_N; k++) { const j = (fx.next + k) % FX_N; if (!fx.on[j]) { i = j; break; } }
    if (i < 0) i = fx.next;
    fx.next = (i + 1) % FX_N;
    if (!fx.on[i]) fx.live++;
    fx.on[i] = 1;
    C.setHex(hex);
    fx.d.set([x, y, z, vx, vy, vz, 0, life, s0, s1, C.r, C.g, C.b, grav], i * 14);
  }
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function puff(x, y, z, hex, n = 6, speed = 0.5, size = 0.07, life = 0.55, lift = 0.25) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), s = speed * (0.6 + rnd() * 0.6);
      spark(x, y, z, Math.cos(a) * s, lift + rnd() * 0.3, Math.sin(a) * s, life * (0.75 + rnd() * 0.5), size * 0.5, size * 1.5, hex, 0);
    }
  }
  const flash = (x, y, z, hex, size = 0.3, life = 0.28) => spark(x, y, z, 0, 0, 0, life, size * 0.25, size, hex, 0);
  function updateFx(dt) {
    if (!fx.live) { fxBatch.commit(0); return; }
    const d = fx.d, damp = Math.exp(-dt * 3.2);
    let live = 0;
    for (let i = 0; i < FX_N; i++) {
      if (!fx.on[i]) continue;
      const o = i * 14;
      d[o + 6] += dt;
      const t = d[o + 6] / d[o + 7];
      if (t >= 1) { fx.on[i] = 0; fxBatch.hide(i); continue; }
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      d[o + 3] *= damp; d[o + 4] = d[o + 4] * damp - d[o + 13] * dt; d[o + 5] *= damp;
      const e = 1 - (1 - t) * (1 - t), s = d[o + 8] + (d[o + 9] - d[o + 8]) * e, a = (1 - t) * (1 - t);
      fxBatch.set(i, d[o], d[o + 1], d[o + 2], _right.x, _right.y, _right.z, _up.x, _up.y, _up.z, s, s, d[o + 10], d[o + 11], d[o + 12], a);
      live++;
    }
    fx.live = live;
    fxBatch.commit(live || 1);
  }

  // надписи, които изплуват („+12", защо е отказано)
  const POP_N = 8, POP_W = 256, POP_H = 64;
  const popCanvas = document.createElement('canvas');
  popCanvas.width = POP_W * 2; popCanvas.height = POP_H * 4;
  const popG = popCanvas.getContext('2d');
  const popTex = keep(new THREE.CanvasTexture(popCanvas));
  popTex.colorSpace = THREE.SRGBColorSpace; popTex.anisotropy = 4;
  const popBatch = quadBatch(POP_N, keep(new THREE.MeshBasicMaterial({ map: popTex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })), 20, false);
  const pops = [];
  for (let i = 0; i < POP_N; i++) {
    pops.push({ on: false, x: 0, y: 0, z: 0, age: 0, life: 1, hw: 0.3, hh: 0.075 });
    const cx = i % 2, cy = (i / 2) | 0;
    popBatch.uvRect(i, cx / 2, 1 - (cy + 1) / 4, (cx + 1) / 2, 1 - cy / 4);
  }
  let popNext = 0, popLive = 0;
  function pop(text, x, y, z, color, big) {
    let i = pops.findIndex(p => !p.on);
    if (i < 0) i = popNext;
    popNext = (i + 1) % POP_N;
    const p = pops[i], px = (i % 2) * POP_W, py = ((i / 2) | 0) * POP_H;
    popG.clearRect(px, py, POP_W, POP_H);
    popG.save();
    popG.beginPath(); popG.rect(px, py, POP_W, POP_H); popG.clip();
    popG.textAlign = 'center'; popG.textBaseline = 'middle'; popG.lineJoin = 'round';
    let size = big ? 58 : 34;
    const fam = big ? '"Sofia Sans XC", "Sofia Sans", "Segoe UI", sans-serif' : '"Sofia Sans", "Segoe UI", sans-serif';
    do { popG.font = `800 ${size}px ${fam}`; size -= 3; } while (size > 16 && popG.measureText(text).width > POP_W - 20);
    popG.lineWidth = 8; popG.strokeStyle = 'rgba(19,20,17,0.92)'; popG.strokeText(text, px + POP_W / 2, py + POP_H / 2 + 2);
    popG.fillStyle = color; popG.fillText(text, px + POP_W / 2, py + POP_H / 2 + 2);
    popG.restore();
    popTex.needsUpdate = true;
    p.on = true; p.x = x; p.y = y; p.z = z; p.age = 0; p.life = big ? 1.5 : 1.8;
    p.hh = big ? 0.085 : 0.06; p.hw = p.hh * POP_W / POP_H;
    popLive++;
  }
  function updatePops(dt) {
    if (!popLive) { popBatch.commit(0); return; }
    let live = 0;
    for (let i = 0; i < POP_N; i++) {
      const p = pops[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; popBatch.hide(i); continue; }
      p.y += dt * 0.26 * Math.max(0, 1 - p.age / p.life);
      const tin = Math.min(1, p.age / 0.14), tout = Math.min(1, (p.life - p.age) / 0.22);
      const s = (1 - (1 - tin) * (1 - tin)) * tout;
      popBatch.set(i, p.x, p.y, p.z, _right.x, _right.y, _right.z, _up.x, _up.y, _up.z, p.hw * s, p.hh * s, 1, 1, 1, 1);
      live++;
    }
    popLive = live;
    popBatch.commit(live || 1);
  }

  // ---------- предмети ----------

  const items = new Map(), itemList = [];
  function itemKey(kind, s) {
    if (!s) return kind;
    switch (kind) {
      case 'pizza': return `pizza|${(s.stack || []).join(',')}|${s.cook >= 2 ? 2 : s.cook >= 1 ? 1 : 0}|${s.ball ? 1 : 0}`;
      case 'cup': return `cup|${s.drink || ''}|${q(s.fill, 10)}`;
      case 'blue': return `blue|${s.shake ? 1 : 0}`;
      case 'ice': return `ice|${s.pure ? 1 : 0}`;
      case 'box': return `box|${(s.n || []).join(',')}`;
      default: return kind;
    }
  }
  const itemEntry = (kind, state, key) => entryFor(key, () => {
    const o = kit.make(kind, { theme });
    kit.setState(o, kind, state || DEF_STATE[kind], undefined);
    return o;
  });

  function handYaw(qt, prev) {
    const fx2 = -2 * (qt.x * qt.z + qt.w * qt.y), fz2 = -(1 - 2 * (qt.x * qt.x + qt.y * qt.y));
    return fx2 * fx2 + fz2 * fz2 < 0.09 ? prev : Math.atan2(fx2, fz2);
  }
  const _nk = new THREE.Vector3(), QX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  function inHand(r, h, head) {
    const p = h.pos;
    r.hq = null;
    if (p.x * p.x + p.y * p.y + p.z * p.z < 1e-6 && head) { r.x = head.pos.x; r.y = head.pos.y - 0.45; r.z = head.pos.z; }   // ръката не се следи: носи се пред гърдите
    else if (ROT_KINDS.has(r.kind) && h.quat) {      // held in the fist: the thing's own up is the hand's -Z (along the handle, towards the thumb)
      _nk.set(0, 0, -1).applyQuaternion(h.quat);
      const grip = Math.min(r.h * 0.4, 0.12);
      r.x = p.x - _nk.x * grip; r.y = p.y - _nk.y * grip; r.z = p.z - _nk.z * grip;
      r.hq = h.quat;
    }
    else if (ROT_FLAT.has(r.kind) && h.quat) { r.x = p.x; r.y = p.y; r.z = p.z; r.hq = h.quat; r.flat = true; }
    else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }
    r.yaw = handYaw(h.quat, r.yaw);
    r.fresh = false;
  }

  // ръцете ми: какво държа, какво съм предположил, към какво соча
  const mkHand = () => ({
    held: null, btn: null,
    act: 'none', actId: null, actT: 0, ghostKind: null, ghost: null, ghostYaw: 0,
    rel: { on: false, id: null, t: 0, x: 0, y: 0, z: 0, yaw: 0 },
    tgt: { type: T_NONE, rec: null, st: null, slot: null, control: 0, btn: null, ctl: null },
    press: 0, spare: null,
  });
  const hand = { l: mkHand(), r: mkHand() };
  let lastHand = 'r';

  function refreshModes() {
    hand.l.held = hand.r.held = null;
    for (let i = 0; i < itemList.length; i++) {
      const r = itemList[i];
      let mode = r.holder == null ? M_FREE : r.mine ? M_MINE : M_OTHER, hk = r.hand;
      for (let j = 0; j < 2; j++) {
        const k = HK[j], R = hand[k].rel;
        if (R.on && (R.id === r.id || (R.id === -1 && r.mine && r.hand === k))) { mode = M_DROP; hk = k; }
      }
      for (let j = 0; j < 2; j++) { const k = HK[j]; if (hand[k].act === 'grab' && hand[k].actId === r.id) { mode = M_MINE; hk = k; } }
      r.mode = mode; r.hk = hk;
      if (mode === M_MINE) hand[hk].held = r;
    }
  }

  function updateItems(dt) {
    const k = 1 - Math.exp(-dt * 18);
    for (let i = 0; i < itemList.length; i++) {
      const r = itemList[i], g = r.v.g;
      let vis = true;
      if (r.mode === M_MINE) inHand(r, ctx.hands[r.hk], ctx.head);
      else if (r.mode === M_OTHER) { const o = r.other; if (o) inHand(r, r.hand === 'l' ? o.l : o.r, o.head); else vis = false; }
      else {
        let tx = r.tx, ty = r.ty, tz = r.tz, tyaw = r.tyaw;
        if (r.mode === M_DROP) { const R = hand[r.hk].rel; tx = R.x; ty = R.y; tz = R.z; tyaw = R.yaw; }
        if (r.fresh) { r.x = tx; r.y = ty; r.z = tz; r.yaw = tyaw; r.fresh = false; }
        else { r.x += (tx - r.x) * k; r.y += (ty - r.y) * k; r.z += (tz - r.z) * k; r.yaw += angDiff(tyaw, r.yaw) * k; }
      }
      r.age += dt;
      if (r.mode === M_FREE) vis = r.on;                 // свободен предмет на другото ниво не се вижда; в ръка се вижда винаги
      const cast = r.mode === M_FREE && r.on;            // сянка хвърля само предмет, който лежи (сянката се обновява рядко)
      if (cast !== r.v.cast) setCast(r.v, cast);
      g.visible = vis;
      g.position.set(r.x, r.y, r.z);
      if (r.hq && (r.mode === M_MINE || r.mode === M_OTHER)) { g.quaternion.copy(r.hq); if (!r.flat) g.quaternion.multiply(QX); } else g.rotation.set(0, r.yaw, 0);
      g.scale.setScalar((r.age < 0.12 ? 0.55 + 0.45 * (r.age / 0.12) : 1) * (r.hl ? 1.07 : 1));
    }
    for (let j = 0; j < 2; j++) {              // предположеният предмет от bin
      const H = hand[HK[j]];
      if (!H.ghost) continue;
      const on = H.act === 'take';
      H.ghost.g.visible = on;
      if (!on) continue;
      const h = ctx.hands[HK[j]], hh = SIZES[H.ghostKind]?.[1] || 0.1;
      H.ghostYaw = handYaw(h.quat, H.ghostYaw);
      H.ghost.g.position.set(h.pos.x, h.pos.y - Math.min(hh * 0.5, 0.08), h.pos.z);
      H.ghost.g.rotation.y = H.ghostYaw;
    }
  }

  // ---------- към какво сочи ръката ----------

  function findTarget(k) {
    const H = hand[k], h = ctx.hands[k], T = H.tgt;
    T.type = T_NONE; T.rec = null; T.st = null; T.slot = null; T.control = 0; T.btn = null; T.ctl = null;
    if (!h || h.active === false) return T;
    const px = h.pos.x, py = h.pos.y, pz = h.pos.z;
    const kind = H.held ? H.held.kind : H.act === 'take' ? H.ghostKind : null;
    if (kind) {
      // добавка над сурова пица: ляга върху нея (преди гнездата, както решава и сървърът)
      if (PARTS.has(kind)) {
        let bd = STACK_R * STACK_R;
        for (let i = 0; i < itemList.length; i++) {
          const r = itemList[i];
          if (r.kind !== 'pizza' || r.mode !== M_FREE || !r.on || r.cook > 0.05) continue;
          const dx = r.tx - px, dy = r.ty - py, dz = r.tz - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 <= bd) { bd = d2; T.rec = r; }
        }
        if (T.rec) { T.type = T_STACK; return T; }
      }
      let bd = SLOT_R * SLOT_R, best = null;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.on || (s.item != null && !s.sink) || !accepts(s, kind) || (s.spot && !s.spotOn)) continue;
        const dx = s.x - px, dy = s.y - py, dz = s.z - pz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= bd) { bd = d2; best = s; }
      }
      if (best) { T.type = T_SLOT; T.slot = best; }
      return T;
    }
    // празна ръка. Първо копче или лост, ако ръката е при самото него (тесен обхват, затова не краде хващането)
    let ud = Infinity;
    for (let i = 0; i < useStations.length; i++) {
      const s = useStations[i];
      if (!s.on) continue;
      if (s === elev) {                                  // асансьорът: ръката трябва да е при някое от копчетата му
        const b = elevButton(px, py, pz);
        if (b && b.d2 < ud) { ud = b.d2; T.st = s; T.btn = b; T.ctl = null; }
        continue;
      }
      if (s.taps) {
        for (let j = 0; j < s.taps.length; j++) {
          if (!tapOn(s, j)) continue;
          const b = s.taps[j], dx = b.x - px, dy = b.y - py, dz = b.z - pz, d2 = dx * dx + dy * dy + dz * dz, rr = s.kind === 'stash' && j === 0 ? 0.2 : TAP_R[s.kind] || 0.14;
          if (d2 <= rr * rr && d2 < ud) { ud = d2; T.st = s; T.btn = null; T.ctl = b; T.control = j; }
        }
        continue;
      }
      if (!s.btn) continue;
      const dx = s.btn.x - px, dy = s.btn.y - py, dz = s.btn.z - pz, d2 = dx * dx + dy * dy + dz * dz, rr = USE_R[s.kind] || 0.25;
      if (d2 <= rr * rr && d2 < ud) { ud = d2; T.st = s; T.btn = null; T.ctl = s.btn; }
    }
    if (T.st) { T.type = T_USE; return T; }
    // после най-близкият свободен предмет
    let bd = GRAB_R * GRAB_R;
    for (let i = 0; i < itemList.length; i++) {
      const r = itemList[i];
      if (r.mode !== M_FREE || !r.on) continue;
      const dx = r.tx - px, dy = r.ty - py, dz = r.tz - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= bd) { bd = d2; T.rec = r; }
    }
    if (T.rec) { T.type = T_ITEM; return T; }
    // накрая рафт с продукт (до горния му център)
    let bb = REACH * REACH;
    for (let i = 0; i < bins.length; i++) {
      const s = bins[i];
      if (!s.on) continue;
      const dx = s.x - px, dy = s.y + s.h - py, dz = s.z - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= bb) { bb = d2; T.st = s; }
    }
    if (growSt && growSt.on && Array.isArray(growSt.view.pots)) for (let i = 0; i < growSt.slots.length; i++) {
      const sl = growSt.slots[i];
      if (!(growSt.view.pots[i] >= 1)) continue;
      const dx = sl.x - px, dy = sl.y + 0.45 - py, dz = sl.z - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= bb) { bb = d2; T.st = growSt; T.ctl = sl; }
    }
    if (T.st) T.type = T_BIN;
    return T;
  }

  /** The packet of the box nearest to a point: its index in r.n. */
  function boxPick(r, px, py, pz) {
    let best = r.n.length - 1, bd = Infinity;
    const c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    for (let i = 0; i < Math.min(15, r.n.length); i++) {
      const [x, y, z] = BOX_CELL(i), wx = r.x + x * c + z * sn, wz = r.z - x * sn + z * c, dx = wx - px, dz = wz - pz, dy = r.y + y - py;
      const d2 = dx * dx + dz * dz + dy * dy * 0.25;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }
  function boxCellWorld(r, i) {
    const [x, y, z] = BOX_CELL(i), c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    return [r.x + x * c + z * sn, r.y + y + 0.03, r.z - x * sn + z * c];
  }

  // ---------- the goal: one place in the room is marked, wherever the player stands ----------
  let goal = null, buyerList = [];
  /** Do I carry something to sell (in a hand, or a box with packets on my level)? */
  function carrying() {
    for (let i = 0; i < itemList.length; i++) {
      const r = itemList[i];
      if (r.kind === 'box' ? !(r.n && r.n.length) : !(r.kind in FXOF) && r.kind !== 'buds') continue;
      if (r.mode === M_MINE || (r.mode === M_FREE && r.on)) return true;
    }
    return false;
  }
  /** The text of the goal for where I stand. */
  function goalText() {
    if (myLevel >= 2) return carrying() ? GOALS.sell || '' : GOALS.home || '';
    return goal ? goal.text || '' : '';
  }
  const liftMark = to => {
    if (!elev) return null;
    if (inCabin(ctx.head.pos)) {
      for (const b of elevBtns) if (b.inside && (destOf(b) === to || (destOf(b) == null && b.idx === 0))) return { x: b.rx, y: b.y, z: b.rz, up: true };
      return null;
    }
    return cab ? { x: cab.x, y: 0.02, z: cab.z, r: 0.34 } : { x: elev.x, y: 0.02, z: elev.z, r: 0.34 };
  };
  function goalMark() {
    if (over) return null;
    if (myLevel >= 2) {
      let best = null, bd = Infinity;
      const has = carrying();
      if (has) for (const b of buyerList) {
        if (b.level !== myLevel || b.state !== 'wait' || !b.hand) continue;
        const d = Math.hypot(b.hand.x - ctx.head.pos.x, b.hand.z - ctx.head.pos.z);
        if (d < bd) { bd = d; best = { x: b.hand.x, y: b.hand.y - 0.02, z: b.hand.z, r: 0.14 }; }
      }
      if (best) return best;
      const w = ways.find(q => q.on && (has ? q.to > myLevel : q.to < myLevel)) || (has ? null : ways.find(q => q.on && q.to < myLevel));
      if (w && (has || myLevel > 2)) return { x: w.btn.x, y: w.btn.y, z: w.btn.z, r: 0.16 };
      return myLevel === 2 && !has ? liftMark(0) : null;
    }
    if (!goal) return null;
    const st = goal.station === 'elevator' ? elev : stationByKey.get(String(goal.station));
    if (!st) return null;
    if (st === elev) return typeof goal.to === 'number' && goal.to !== myLevel ? liftMark(goal.to) : null;
    if (st.level !== myLevel) return liftMark(st.level);
    if (st.btn) return { x: st.btn.x, y: st.btn.y, z: st.btn.z, r: 0.15 };
    return { x: st.x, y: st.y + st.h + 0.02, z: st.z, r: 0.2 };
  }
  function drawGoal() {
    const m = goalMark();
    if (!m) return;
    const w = 0.5 + 0.5 * Math.sin(now * 5);
    if (m.up) { ringUp(m.x, m.y, m.z, 0.11 + 0.03 * w, RING_ON); ringUp(m.x, m.y, m.z, 0.16 + 0.05 * w, RING_ON); return; }
    const r = m.r || 0.18;
    ring(m.x, m.y + 0.012, m.z, r * (1 + 0.25 * w), RING_ON);
    ring(m.x, m.y + 0.012, m.z, r * (1.5 + 0.35 * w), RING_ON);
    ring(m.x, m.y + 0.42 + 0.06 * w, m.z, 0.07, RING_ON);
  }

  function updateTargets() {
    for (let i = 0; i < itemList.length; i++) itemList[i].hl = false;
    ringN = 0;
    for (let j = 0; j < 2; j++) {
      const k = HK[j], H = hand[k], T = findTarget(k);
      const kind = H.held ? H.held.kind : H.act === 'take' ? H.ghostKind : null;
      const pulse = 1.12 + 0.06 * Math.sin(now * 9);
      if (kind && ctx.hands[k].active !== false) {
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          if (!s.on || (s.item != null && !s.sink) || !accepts(s, kind) || (s.spot && !s.spotOn)) continue;
          if (s === T.slot) slotRing(s, s.r * pulse, RING_ON, 0.007); else slotRing(s, s.r, RING_DIM, 0.006);
        }
      }
      if (T.type === T_ITEM || T.type === T_STACK) {
        T.rec.hl = true; ring(T.rec.x, T.rec.y + 0.005, T.rec.z, (T.rec.rad + 0.035) * pulse, RING_ON);
        if (T.rec.kind === 'box' && T.rec.n && T.rec.n.length) { const h = ctx.hands[k], c = boxCellWorld(T.rec, boxPick(T.rec, h.pos.x, h.pos.y, h.pos.z)); ring(c[0], c[1], c[2], 0.055 * pulse, RING_ON); }
      }
      else if (T.type === T_BIN) {
        const b = T.st;                                  // кашон на рафт: пръстенът е отпред, не отгоре
        if (b.kind === 'grow' && T.ctl) ring(T.ctl.x, T.ctl.y + 0.04, T.ctl.z, 0.2 * pulse, RING_ON);
        else if (b.y + b.h > 1.15) ringUp(b.x + b.sin * (b.d / 2 + 0.012), b.y + b.h - 0.14, b.z + b.cos * (b.d / 2 + 0.012), 0.13 * pulse, RING_ON, b.q);
        else ring(b.x, b.y + b.h + 0.012, b.z, 0.17 * pulse, RING_ON);
      }
      else if (T.type === T_USE) {
        const p = 1 - H.press * 0.25;
        if (T.ctl) ring(T.ctl.x, T.ctl.y + 0.03, T.ctl.z, 0.12 * pulse * p, RING_ON);
        else if (T.btn) ringUp(T.btn.rx, T.btn.y, T.btn.rz, 0.085 * pulse * p, RING_ON);
        else ring(T.st.x, T.st.y + T.st.h + 0.01, T.st.z, 0.15 * pulse * p, RING_ON);
      } else if (kind && elev) {                         // пълна ръка при копче: другият ѝ бутон го натиска
        const b = elevButton(ctx.hands[k].pos.x, ctx.hands[k].pos.y, ctx.hands[k].pos.z);
        if (b) { b.lit = true; ringUp(b.rx, b.y, b.rz, 0.085 * pulse * (1 - H.press * 0.25), RING_ON); }
      }
    }
    // копчетата, които могат да се натиснат сега, са оградени и когато ръката не е при тях
    if (elev && elev.on && !(elev.state && elev.state.moving)) {
      const inside = inCabin(ctx.head.pos), away = !!(elev.state && lvl(elev.state.level) !== myLevel);
      for (let i = 0; i < elevBtns.length; i++) {
        const b = elevBtns[i];
        if ((b.inside ? inside : away) && !b.lit && b !== hand.l.tgt.btn && b !== hand.r.tgt.btn) ringUp(b.rx, b.y, b.rz, 0.075, RING_DIM);
        b.lit = false;
      }
    }
    for (let i = 0; i < itemList.length; i++) { const r = itemList[i]; if (r.hl !== r.v.hl) tint(r.v, r.hl); }
    drawGoal();
    ringMesh.count = ringN;
    ringMesh.visible = ringN > 0;
    if (ringN) { ringMesh.instanceMatrix.needsUpdate = true; ringMesh.instanceColor.needsUpdate = true; }
  }

  // ---------- действия ----------

  function onInput(ev) {
    if (!ev || over) return;
    const k = ev.hand === 'l' ? 'l' : 'r', H = hand[k], h = ctx.hands[k];
    const btn = ev.type === 'gripdown' || ev.type === 'gripup' ? 'grip' : 'trigger';
    const down = ev.type === 'gripdown' || ev.type === 'triggerdown', up = ev.type === 'gripup' || ev.type === 'triggerup';
    if (!h || (!down && !up)) return;
    now = performance.now() / 1000;
    if (down) {
      if (UI.mode) { if (UI.g && UI.on[k] && UI.hover[k] >= 0) clickUI(k); lastHand = k; return; }      // a menu is open: only its buttons
      if (UI.g && UI.on[k] && UI.hover[k] >= 0 && !H.held && H.act !== 'take' && clickUI(k)) { lastHand = k; return; }
      if (H.held || H.act === 'take') {                      // ръката е пълна
        // в асансьора другият бутон на същата ръка натиска копчето, без да пуска предмета (возим се с пълни ръце)
        if (elev && (H.btn ? H.btn !== btn : btn === 'trigger') && elevButton(h.pos.x, h.pos.y, h.pos.z)) {
          const eb = elevButton(h.pos.x, h.pos.y, h.pos.z), to = destOf(eb);
          ctx.send(to == null ? { a: 'use', hand: k, station: elev.id } : { a: 'use', hand: k, station: elev.id, to });
          H.spare = btn; H.press = 1; lastHand = k;
          ctx.haptic(k, 0.35, 20);
        }
        return;
      }
      const T = findTarget(k);
      if (T.type === T_ITEM && T.rec.kind === 'box' && btn === 'trigger' && T.rec.n && T.rec.n.length && T.rec.mode === M_FREE) {
        const kind = T.rec.n[boxPick(T.rec, h.pos.x, h.pos.y, h.pos.z)];
        ctx.send({ a: 'unpack', hand: k, item: T.rec.id, kind });
        H.act = 'take'; H.actT = now; H.btn = btn; H.ghostKind = kind; lastHand = k;
        if (!H.ghost) H.ghost = getView(itemGroup);
        setEntry(H.ghost, itemEntry(kind, null, itemKey(kind, DEF_STATE[kind])));
        H.ghostYaw = handYaw(h.quat, 0);
        ctx.haptic(k, 0.6, 30);
      } else if (T.type === T_ITEM) {
        ctx.send({ a: 'grab', hand: k, item: T.rec.id });
        H.act = 'grab'; H.actId = T.rec.id; H.actT = now; H.btn = btn; lastHand = k;
        ctx.haptic(k, 0.6, 30);
        refreshModes();
      } else if (T.type === T_BIN) {
        ctx.send({ a: 'take', hand: k, station: T.st.id });
        const kind = T.st.gives || T.st.view.gives;
        H.act = 'take'; H.actT = now; H.btn = btn; H.ghostKind = kind || null; lastHand = k;
        if (kind) {
          if (!H.ghost) H.ghost = getView(itemGroup);
          setEntry(H.ghost, itemEntry(kind, null, itemKey(kind, DEF_STATE[kind])));
          H.ghostYaw = handYaw(h.quat, 0);
        }
        ctx.haptic(k, 0.6, 30);
      } else if (T.type === T_USE) {
        const to = T.st === elev ? destOf(T.btn) : null;
        ctx.send(to == null ? { a: 'use', hand: k, station: T.st.id, control: T.control } : { a: 'use', hand: k, station: T.st.id, to });
        if (T.st.kind === 'way') fade = Math.max(fade, 0.6);
        H.press = 1; lastHand = k;
        ctx.haptic(k, 0.35, 20);
      }
      return;
    }
    if (H.spare === btn) { H.spare = null; return; }         // това беше копчето на асансьора, не пускане
    const ghost = H.act === 'take', held = H.held;
    if (!held && !ghost) return;
    if (H.btn && H.btn !== btn) return;                      // пуска се със същия бутон, с който е хванато
    const T = findTarget(k), yaw = handYaw(h.quat, held ? held.yaw : H.ghostYaw);
    ctx.send({ a: 'release', hand: k, p: [+h.pos.x.toFixed(3), +h.pos.y.toFixed(3), +h.pos.z.toFixed(3)], yaw: +yaw.toFixed(3) });
    const R = H.rel;
    R.on = true; R.id = held ? held.id : -1; R.t = now; R.yaw = yaw;
    if (T.type === T_SLOT) { R.x = T.slot.x; R.y = T.slot.y; R.z = T.slot.z; ctx.haptic(k, 0.5, 25); }
    else if (T.type === T_STACK) { R.x = T.rec.tx; R.y = T.rec.ty + 0.03; R.z = T.rec.tz; ctx.haptic(k, 0.3, 15); }
    else if (held) { R.x = held.x; R.y = held.y; R.z = held.z; }
    else { R.x = h.pos.x; R.y = h.pos.y - 0.05; R.z = h.pos.z; }
    H.act = 'none'; H.btn = null; lastHand = k;
    refreshModes();
  }
  const offInput = ctx.onInput(onInput);
  // pause: X or Y of the left controller; P on the desktop page
  let padWas = false;
  function togglePause() {
    if (!CAREER || over || UI.phase === 'menu') return;
    ctx.send({ a: 'menu', hand: 'r', choice: UI.career && UI.career.paused ? 'resume' : 'pause' });
    ctx.haptic('l', 0.6, 60);
  }
  const onKey = e => { if (e.code === 'KeyP' && !e.repeat) togglePause(); };
  if (CAREER) window.addEventListener('keydown', onKey);

  // ---------- капаците в пода ----------
  const litMats = [];
  const litOf = base => { const m = keep(base.clone()); if (m.emissive) m.emissive.setHex(0xff2a1a); litMats.push(m); return m; };
  {
    const holeGeo = keep(new THREE.CircleGeometry(start.trap?.r || 0.5, 28).rotateX(-Math.PI / 2));
    const holeMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    for (const s of seats) {
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.set(s.x, TRAP_Y, s.z);
      const cover = kit.make('cover', { theme });
      cover.position.set(s.x, TRAP_Y + 0.004, s.z);
      const crate = theme === 'kids' ? kit.make('crate', { theme }) : null;
      if (crate) { crate.position.set(s.x, TRAP_Y + 0.062, s.z - 0.1); crate.visible = false; stationL[0].add(crate); }
      stationL[0].add(hole, cover);
      trapList.push({ i: s.i, x: s.x, z: s.z, hole, cover, crate, crateOn: false, seenOpen: false, open: 0, to: 0, lit: false, wasLit: false });
    }
  }

  // ---------- клиенти ----------

  const custs = new Map(), custList = [];
  let custLive = null;                              // true: живи модели (models.js ги движи сам); false: изпечени, движа ги аз
  const custPool = new Map();
  const orderKeyOf = o => (o && o.kind !== 'none' ? `order|${o.kind}|${(o.stack || []).join(',')}|${o.drink || ''}|${o.item || ''}` : 'order|none');
  function buildOrder(o) {
    const wrap = new THREE.Group(), g = new THREE.Group();
    wrap.add(g);
    if (!o || o.kind === 'none') return wrap;
    const m = kit.make(o.kind === 'stuff' ? o.item : o.kind, { theme });
    if (!m) return wrap;
    if (o.kind === 'stuff') {                       // what the buyer wants from the cellar, shown big
      m.position.y = -(SIZES[o.item]?.[1] || 0.1) / 2;
      g.add(m);
      g.scale.setScalar(o.item === 'joint' ? 2.6 : o.item === 'buds' ? 3.2 : o.item === 'syrup' ? 2.4 : 1.5);
    } else if (o.kind === 'pizza') {                       // изпечената пица, изправена с лице към гледащия
      kit.setState(m, 'pizza', { stack: o.stack || [], cook: 1, ball: false }, undefined);
      m.rotation.x = Math.PI / 2 * 0.86;
      m.position.set(0, 0.02, 0);
      g.add(m);
      g.scale.setScalar(0.62);
      wrap.userData.face = true;
    } else {
      kit.setState(m, 'cup', { fill: 1, drink: o.drink || 'cola' }, undefined);
      m.position.y = -(SIZES[o.kind]?.[1] || 0.1) / 2;
      g.add(m);
      g.scale.setScalar(1.55);
    }
    return wrap;
  }
  const moodOf = st => (st === 'happy' || st === 'angry' ? st : 'wait');
  function newCustModel(look, special) {
    const o = kit.make('customer', { theme, look, special });
    // Поръчката и търпението ги рисува сцената (над главата, под горния ръб на ролетката);
    // показанието, което моделът носи за същото, се скрива, за да не са две ленти.
    if (o.userData.indicator) o.userData.indicator.visible = false;
    return o;
  }
  function custBody(r) {
    if (custLive === null) {                        // решава се по първия модел: с кости или малко мешове → жив (models.js го движи сам)
      const probe = newCustModel(r.look, r.special);
      let n = 0, skinned = false;
      probe.traverse(o => { if (o.isMesh) n++; if (o.isSkinnedMesh) skinned = true; });
      custLive = kit.fromModels(probe) && (skinned || n <= 3);
      if (custLive) custPool.set(`${r.look}|${r.special}`, [probe]);
    }
    if (custLive) {
      const key = `${r.look}|${r.special}`;
      let free = custPool.get(key);
      if (!free) { free = []; custPool.set(key, free); }
      r.model = free.pop() || newCustModel(r.look, r.special);
      r.poolKey = key;
      r.tall = Math.max(1.4, Math.min(2.0, +r.model.userData.height || 1.7));
      custGroup.add(r.model);
    } else {
      r.v = getView(custGroup);
      custSkin(r);
    }
  }
  function custSkin(r) {
    const mood = moodOf(r.state);
    if (custLive || r.mood === mood) return;
    r.mood = mood;
    const look = r.look, special = r.special;
    setEntry(r.v, entryFor(`cust|${look}|${special ? 1 : 0}|${mood}`, () => {
      const o = newCustModel(look, special);
      kit.setState(o, 'customer', { state: mood, look, special, patience: 1 }, undefined);
      return o;
    }));
  }
  function dropCust(r) {
    if (r.model) { custGroup.remove(r.model); custPool.get(r.poolKey).push(r.model); r.model = null; }
    if (r.v) { freeView(r.v); r.v = null; }
    freeView(r.ov);
  }

  function updateCustomers(dt) {
    const k = 1 - Math.exp(-dt * 9), ko = 1 - Math.exp(-dt * 10);
    let bars = 0;
    for (let i = 0; i < custList.length; i++) {
      const r = custList[i];
      r.st += dt;
      if (r.fresh) { r.x = r.tx; r.z = r.tz; r.yaw = r.tyaw; r.fresh = false; }
      const ox = r.x, oz = r.z;
      r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.yaw += angDiff(r.tyaw, r.yaw) * k;
      const sd = r.slideTo - r.slide, sm = dt * 0.6;
      r.slide += sd > sm ? sm : sd < -sm ? -sm : sd;
      const sp = dt > 0 ? Math.min(1.5, Math.hypot(r.x - ox, r.z - oz) / dt + Math.abs(sd) * 3) : 0;
      r.walk += sp * dt * 8;
      let x = r.x + r.slide * 0.7, z = r.z + r.slide * 3.2, y = 0, tilt = 0;
      const fall = r.state === 'fall' ? r.st : 0, fy = -4.6 * fall * fall;      // пада с капака
      if (r.model) {
        r.model.position.set(x, fy, z); r.model.rotation.y = r.yaw + fall * 2.4;
        r.model.visible = r.lv === myLevel;
        if (r.lv === myLevel) kit.setState(r.model, 'customer', r.view, dt);
      } else {
        y = (sp / 1.5) * Math.abs(Math.sin(r.walk)) * 0.035;
        if (r.state === 'happy' && r.st < 1) y += Math.abs(Math.sin(r.st * Math.PI * 3)) * 0.13 * (1 - r.st);
        else if (r.state === 'angry' && r.st < 0.9) { const a = Math.sin(r.st * 34) * (1 - r.st / 0.9); tilt = a * 0.07; x += a * 0.02; }
        const g = r.v.g;
        g.visible = r.lv === myLevel;
        g.position.set(x, y + fy, z); g.rotation.set(0, r.yaw + fall * 2.4, tilt);
      }
      const show = (r.state === 'in' || r.state === 'wait') && r.okey !== 'order|none' && r.lv === myLevel;
      r.os += ((show ? 1 : 0) - r.os) * ko;
      // лентата е точно над главата, поръчката над нея; и двете остават под горния ръб на отвора (2.05 м)
      const by = Math.min(r.tall + 0.075, 1.84), og = r.ov.g;
      og.visible = r.os > 0.02;
      // стоят малко пред клиента, откъм гледащия (на която и стена да е тезгяхът)
      const hx = ctx.head.pos.x - x, hz = ctx.head.pos.z - z, hl = Math.hypot(hx, hz) || 1, nx = hx / hl, nz = hz / hl;
      const fx = x + nx * 0.12, fz = z + nz * 0.12;
      if (og.visible) {
        og.position.set(fx, by + 0.175 + Math.sin(now * 2 + r.seed) * 0.012, fz);
        if (r.face) og.rotation.y = Math.atan2(nx, nz); else og.rotation.y += dt * 0.9;
        og.scale.setScalar(r.os);
      }
      if (r.state === 'wait' && r.os > 0.5 && r.lv === myLevel && bars + 2 <= BAR_N) {
        const p = clamp01(r.patience), rx = nz, rz = -nx, bw = 0.15;
        cT.copy(cBad).lerp(cWarn, clamp01(p / 0.35));
        if (p > 0.35) cT.lerp(cCalm, clamp01((p - 0.35) / 0.3));
        if (p < 0.25) cT.multiplyScalar(0.75 + 0.25 * Math.sin(now * 12));
        barBatch.set(bars++, fx, by, fz, rx, 0, rz, 0, 1, 0, bw + 0.012, 0.03, cBarBg.r, cBarBg.g, cBarBg.b, 1);
        const f = Math.max(0.02, p);
        barBatch.set(bars++, fx - rx * bw * (1 - f) + nx * 0.004, by, fz - rz * bw * (1 - f) + nz * 0.004, rx, 0, rz, 0, 1, 0, bw * f, 0.019, cT.r, cT.g, cT.b, 1);
      }
    }
    for (let i = bars; i < barsWas; i++) barBatch.hide(i);
    barsWas = bars;
    barBatch.commit(bars);
  }
  let barsWas = 0;

  // ---------- събития ----------

  const seenEv = new Array(160).fill(null);
  let seenN = 0;
  const plLevel = new Map();                          // id на играч → ниво, от последната снимка
  /** на кое ниво е станало събитието: казано от сървъра, иначе по играча, иначе по най-близката станция */
  function evLevel(e, has, x, z) {
    if (e.level != null) return lvl(e.level);
    if (e.player != null) { const v = plLevel.get(String(e.player)); if (v !== undefined) return v; }
    if (has && nLevels > 1) {
      let best = null, bd = 0.64;
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        if (s.level < 0) continue;
        const dx = s.x - x, dz = s.z - z, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = s; }
      }
      if (best) return best.level;
    }
    return myLevel;
  }
  function showEvent(e) {
    const mine = sameId(e.player, me.id);
    let x = e.x, y = e.y, z = e.z, has = typeof x === 'number' && typeof z === 'number';
    if (!has && mine) { const h = ctx.hands[lastHand]; x = h.pos.x; y = h.pos.y + 0.1; z = h.pos.z; has = true; }
    if (typeof y !== 'number') y = SURFACE_Y + 0.2;
    if (!mine && e.kind !== 'ride_start' && e.kind !== 'ride_end' && evLevel(e, has, x, z) !== myLevel) return;   // на другото ниво е
    switch (e.kind) {
      case 'cash':
        if (!has) break;
        if (e.amount < 0) { pop(`−${-e.amount}`, x, y + 0.12, z, '#f06a45', true); flash(x, y, z, 0xf06a45, 0.3); }
        else { pop(`+${e.amount ?? ''}`, x, y + 0.12, z, '#c8f03c', true); puff(x, y, z, 0xc8f03c, 6, 0.55, 0.035, 0.6, 0.5); }
        break;
      case 'order_ok': if (has) puff(x, y, z, 0x7bd66a, 8, 0.6, 0.06, 0.6, 0.35); break;
      case 'order_bad':
        if (!has) break;
        flash(x, y, z, 0xf06a45, 0.35); puff(x, y, z, 0xf06a45, 6, 0.5, 0.06);
        if (e.text && mine) pop(String(e.text), x, y + 0.14, z, '#f2b84a', false);
        break;
      case 'burn': if (has) { flash(x, y, z, 0xff8a2a, 0.34, 0.35); puff(x, y + 0.05, z, 0x2a2622, 7, 0.22, 0.1, 1.1, 0.5); } break;
      case 'ruin': if (has) { flash(x, y, z, 0xb04cff, 0.36, 0.35); puff(x, y, z, 0x3a2a4a, 7, 0.3, 0.1, 0.9, 0.45); } break;
      case 'hit': if (has) { flash(x, y, z, 0xc8f03c, 0.3); puff(x, y, z, 0xc8f03c, 5, 0.5, 0.035, 0.45, 0.4); } if (mine) ctx.haptic(lastHand, 0.8, 60); break;
      case 'miss': if (has) flash(x, y, z, 0xf06a45, 0.3); if (mine) ctx.haptic(lastHand, 1, 160); break;
      case 'ground': if (has) puff(x, y + 0.05, z, 0xc8f03c, 9, 0.6, 0.045, 0.6, 0.5); break;
      case 'stock': if (has) { pop(`+${e.amount ?? ''}`, x, y + 0.12, z, '#c8f03c', true); puff(x, y, z, 0xc8f03c, 8, 0.6, 0.04, 0.6, 0.5); } break;
      case 'top': if (has) puff(x, y + 0.04, z, 0xe6ead8, 4, 0.3, 0.03, 0.35, 0.2); break;
      case 'poured': if (has) flash(x, y + 0.1, z, 0xc8f03c, 0.2, 0.3); break;
      case 'spill': { const st = streams[e.seat | 0]; if (st) st.until = now + 0.9; if (mine) ctx.haptic(lastHand, 0.3, 200); break; }
      case 'pouring': if (mine) ctx.haptic(lastHand, 0.4, 250); break;
      case 'stash_open': case 'stash_shut': if (has) puff(x, y, z, 0x9fc4ff, 5, 0.3, 0.04, 0.5, 0.2); if (mine) ctx.haptic(lastHand, 0.6, 60); break;
      case 'ordered': if (has) flash(x, y, z, 0xffd257, 0.25, 0.4); break;
      case 'delivered': if (has) { flash(x, y, z, 0x7bd66a, 0.3, 0.5); puff(x, y + 0.03, z, 0x7bd66a, 7, 0.4, 0.04, 0.6, 0.3); } if (myLevel === 1) { ctx.haptic('l', 0.3, 60); ctx.haptic('r', 0.3, 60); } break;
      case 'harvest': if (has) puff(x, y + 0.5, z, 0x4f9a3a, 9, 0.5, 0.05, 0.6, 0.2); break;
      case 'planted': if (has) puff(x, y + 0.05, z, 0x6b4a2a, 6, 0.3, 0.04, 0.5, 0.2); break;
      case 'grown': if (has) puff(x, y + 0.6, z, 0x4f9a3a, 8, 0.4, 0.05, 0.7, 0.4); break;
      case 'shred': case 'mix': if (mine) ctx.haptic(lastHand, 0.5, 400); break;
      case 'shredded': if (has) puff(x, y + 0.05, z, 0x4f9a3a, 10, 0.6, 0.04, 0.6, 0.5); break;
      case 'mixed': if (has) { flash(x, y + 0.05, z, 0x4d8dff, 0.34, 0.5); puff(x, y + 0.05, z, 0x9fc4ff, 9, 0.5, 0.04, 0.7, 0.5); } break;
      case 'pour': if (has) puff(x, y, z, 0x9fc4ff, 6, 0.3, 0.035, 0.5, -0.2); if (mine) ctx.haptic(lastHand, 0.5, 120); break;
      case 'packed': if (has) puff(x, y + 0.05, z, 0xc8f03c, 5, 0.3, 0.03, 0.4, 0.3); if (mine) ctx.haptic(lastHand, 0.5, 40); break;
      case 'rolled': if (has) puff(x, y + 0.03, z, 0xe6ead8, 6, 0.3, 0.03, 0.5, 0.3); if (mine) ctx.haptic(lastHand, 0.6, 80); break;
      case 'shaken': if (has) flash(x, y, z, 0x4d8dff, 0.3, 0.4); break;
      case 'poof': if (has) puff(x, y + 0.04, z, 0xb9bcb0, 7, 0.38, 0.075, 0.5, 0.3); break;
      case 'drop':
        if (has) { flash(x, 0.1, z, 0xff3b30, 0.5, 0.4); puff(x, 0.15, z, 0x2a2622, 9, 0.6, 0.1, 0.8, 0.2); }
        if (mine) { ctx.haptic('l', 0.8, 120); ctx.haptic('r', 0.8, 120); }
        break;
      case 'crate': {
        const t = trapList.find(q => q.i === e.seat);
        if (t && t.crate) { t.crate.visible = true; t.crateOn = true; }
        if (has) puff(x, 0.15, z, 0x8a8478, 6, 0.4, 0.08, 0.6, 0.2);
        break;
      }
      case 'trap': if (has) puff(x, 0.15, z, 0x8a8478, 6, 0.4, 0.08, 0.6, 0.2); break;
      case 'innocent': if (has) flash(x, 1.2, z, 0xff3b30, 0.8, 0.6); if (mine) hud.flash(); break;
      case 'load': if (has) puff(x, y, z, 0x8a8478, 8, 0.5, 0.09, 0.8, 0.3); if (myLevel === 1) { ctx.haptic('l', 0.5, 80); ctx.haptic('r', 0.5, 80); } break;
      case 'ride_start': if (inCabin(ctx.head.pos)) { ctx.haptic('l', 0.7, 90); ctx.haptic('r', 0.7, 90); } break;
      case 'ride_end': if (inCabin(ctx.head.pos)) { ctx.haptic('l', 0.6, 140); ctx.haptic('r', 0.6, 140); } break;
      case 'phase': {            // a new part of the day: felt in both hands, seen as two swells of light, said in front of the eyes
        if (over) break;
        hud.notify(); ctx.haptic('l', 0.9, 260); ctx.haptic('r', 0.9, 260);
        const t = UI.phase === 'day' || UI.phase === 'day2' ? (CAREER && UI.career ? `08:00  DAY ${UI.career.day}` : '08:00  DAY') : UI.phase === 'night' || UI.phase === 'night2' ? '00:00  NIGHT' : '';
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (t && _v.lengthSq() > 1e-4) { _v.normalize(); pop(t, ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y + 0.02, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); }
        break;
      }
      case 'goal': {
        hud.notify(); ctx.haptic('l', 0.8, 160); ctx.haptic('r', 0.8, 160);
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (_v.lengthSq() > 1e-4) { _v.normalize(); pop(`GOAL: ${e.text || ''}`, ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y - 0.1, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); }
        break;
      }
      case 'unlocked': if (has) { puff(x, y, z, 0xc8f03c, 10, 0.6, 0.05, 0.8, 0.4); pop(`UNLOCKED: ${e.text || ''}`, x, y + 0.2, z, '#c8f03c', true); } if (mine) { ctx.haptic('l', 0.8, 120); ctx.haptic('r', 0.8, 120); } break;
      case 'won': {
        hud.notify(); ctx.haptic('l', 1, 400); ctx.haptic('r', 1, 400);
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (_v.lengthSq() > 1e-4) { _v.normalize(); pop('YOU OWN THE BLOCK', ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y + 0.05, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); }
        break;
      }
      case 'dealer_sale':
        if (myLevel === 1 && has) pop(`+${e.amount ?? ''}`, x, y + 0.2, z, '#c8f03c', true);
        else { _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0; if (_v.lengthSq() > 1e-4) { _v.normalize(); pop(String(e.text || ''), ctx.head.pos.x + _v.x * 1.0, ctx.head.pos.y - 0.32, ctx.head.pos.z + _v.z * 1.0, '#c8f03c', false); } }
        ctx.haptic('l', 0.25, 40);
        break;
      case 'dealer_pick': if (has) { puff(x, y, z, 0xc8f03c, 6, 0.3, 0.04, 0.6, 0.3); pop(String(e.text || ''), x, y + 0.2, z, '#c8f03c', false); } break;
      case 'shop_open': case 'shop_shut':
        if (has) { puff(x, y, z, e.kind === 'shop_open' ? 0x7bd66a : 0xb9bcb0, 7, 0.4, 0.05, 0.6, 0.3); pop(e.kind === 'shop_open' ? 'OPEN' : 'SHUT', x, y + 0.2, z, '#c8f03c', true); }
        if (mine) ctx.haptic(lastHand, 0.8, 90); else if (myLevel === 0) { ctx.haptic('l', 0.3, 60); ctx.haptic('r', 0.3, 60); }
        break;
      case 'moved': if (mine) { ctx.haptic('l', 0.5, 80); ctx.haptic('r', 0.5, 80); } break;
      case 'high':
        if (has) puff(x, y - 0.05, z, 0xdfe6e0, 10, 0.35, 0.09, 1.4, 0.35);
        if (mine) { ctx.haptic('l', 0.7, 200); ctx.haptic('r', 0.7, 200); _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0; if (_v.lengthSq() > 1e-4) { _v.normalize(); pop(FX_SHORT[myFx || UI.fx] || FX_SHORT[(FXOF[e.from] || [])[0]] || 'IT WORKS', ctx.head.pos.x + _v.x * 0.8, ctx.head.pos.y - 0.05, ctx.head.pos.z + _v.z * 0.8, '#c8f03c', true); } }
        break;
      case 'patrol_warn': hud.flash(); ctx.haptic('l', 1, 300); ctx.haptic('r', 1, 300); break;
      case 'patrol_on': hud.flash(); ctx.haptic('l', 0.8, 180); ctx.haptic('r', 0.8, 180); break;
      case 'caught':
        if (has) flash(x, y, z, 0xff3b30, 0.7, 0.5);
        if (mine) { hud.flash(); ctx.haptic('l', 1, 220); ctx.haptic('r', 1, 220); }
        break;
      case 'deny':
        if (!mine) break;
        ctx.haptic(lastHand, 0.9, 90);
        if (hand[lastHand].act !== 'none') { hand[lastHand].act = 'none'; refreshModes(); }
        if (e.text && has) pop(String(e.text), x, y + 0.08, z, '#f2b84a', false);
        break;
    }
  }

  // ---------- снимка от сървъра ----------

  const hud = createHud(ctx, start, { group, hemi, dir });
  let snapN = 0, over = false, buzzT = 0, copT = 0;

  function findPlayer(id) {
    let p = ctx.players.get(id);
    if (!p) for (const [pid, v] of ctx.players) if (String(pid) === String(id)) { p = v; break; }
    return p || null;
  }

  function onSnapshot(snap) {
    if (!snap) return;
    now = performance.now() / 1000;
    snapN++;
    over = snap.phase === 'over';
    UI.money = Math.round(+snap.money || 0); UI.clock = +snap.clock || 0; UI.phase = snap.phase; UI.patrol = snap.patrol || null;
    UI.shop = !!snap.shop; UI.waiting = snap.waiting | 0; goal = snap.goal || null;
    UI.career = snap.career || null;
    {
      const mode = snap.phase === 'menu' ? 'menu' : UI.career && UI.career.paused && snap.phase !== 'over' ? 'pause' : '';
      if (mode !== UI.mode) { UI.mode = mode; UI.confirm = false; UI.key = ''; if (UI.float) { UI.float.plane.visible = !!mode; UI.float.set = false; for (const d of UI.float.dots) d.visible = false; } }
      const C = UI.career;
      UI.ckey = C ? `${C.day}|${C.rank}|${C.earned}|${(C.unlocked || []).length}|${(C.goals || []).map(q => q.have + (q.done ? 'd' : '')).join(',')}|${(C.dealers || []).map(d => d.left).join(',')}|${C.save ? C.save.day : ''}` : '';
    }
    myFx = null; UI.fx = null; UI.fxLeft = 0;
    if (Array.isArray(snap.players)) for (const q of snap.players) if (sameId(q.id, ctx.viewId ?? me.id) && q.fx) { myFx = UI.fx = q.fx.kind; UI.fxLeft = +q.fx.left || 0; }
    // нивата на играчите; моето решава какво се вижда
    let mine = myLevel;
    plLevel.clear();
    if (Array.isArray(snap.players)) for (const p of snap.players) {
      const v = Math.min(nLevels - 1, lvl(p.level));
      plLevel.set(String(p.id), v);
      if (sameId(p.id, ctx.viewId ?? me.id)) mine = v;
    }
    if (mine !== myLevel) applyLevel(mine);

    // станции
    if (Array.isArray(snap.stations)) for (const u of snap.stations) {
      const s = stationByKey.get(String(u.id));
      if (!s || u.state == null) continue;
      const key = JSON.stringify(u.state);
      if (s.mode === 'static') { s.mode = 'live'; dyn.push(s); s.parent.add(s.live); needStatic = true; s.skey = ''; }
      if (key === s.skey) continue;
      if (typeof u.state.needle === 'number') { s.nV = s.nT ? (u.state.needle - s.n1) / Math.max(0.05, now - s.nT) : 0; s.n1 = u.state.needle; s.nT = now; }
      s.skey = key; s.keyT = now; s.state = u.state;
      Object.assign(s.view, u.state);
      if (s.mode === 'baked') toLive(s);
    }
    if (needStatic) { needStatic = false; rebuildStatic(); }

    // капаците в пода и кой стои върху светещ капак
    if (Array.isArray(snap.traps)) for (let i = 0; i < trapList.length; i++) { const v = snap.traps[trapList[i].i]; trapList[i].to = typeof v === 'number' ? v : 0; trapList[i].lit = false; }
    for (const c of snap.customers || []) if (c.mark && c.state === 'wait') { const t = trapList.find(q => q.i === c.seat); if (t) t.lit = true; }

    // гнезда
    if (snap.slots) for (let i = 0; i < slots.length; i++) { const v = snap.slots[slots[i].key]; slots[i].item = v == null ? null : v; }
    if (stashSt) {
      const free = stashSt.slots.map(sl => sl.item == null), fk = free.join('');
      if (fk !== stashSt.freeKey) { stashSt.freeKey = fk; stashSt.view.free = free; stashSt.keyT = now; if (stashSt.mode === 'baked') toLive(stashSt); }
    }

    // предмети
    for (const it of snap.items || []) {
      let r = items.get(it.id);
      if (!r) {
        const sz = SIZES[it.kind];
        r = {
          id: it.id, kind: it.kind, v: getView(itemGroup), key: null, x: 0, y: 0, z: 0, yaw: 0, tx: 0, ty: 0, tz: 0, tyaw: 0,
          holder: null, hand: 'r', mine: false, other: null, mode: M_FREE, hk: 'r', fresh: true, seen: 0, hl: false, age: 0,
          h: sz ? sz[1] : 0.1, rad: sz ? Math.max(sz[0], sz[2]) / 2 : 0.06, cook: -1, level: 0, on: true,
        };
        items.set(it.id, r); itemList.push(r);
      }
      r.seen = snapN;
      r.pour = !!(it.state && it.state.pour); r.slot = it.slot ?? null; r.shaken = !!(it.state && it.state.shake);
      {      // what a vessel holds (a drop since the last snapshot means it is pouring), what lies in the box
        const c = it.state && it.state.c;
        if (Array.isArray(c)) { const ml = sumOf(c); if (r.ml != null && ml < r.ml - 0.5) r.pourT = now; r.ml = ml; r.c = c; }
        r.n = it.state && Array.isArray(it.state.n) ? it.state.n : null;
      }
      if (it.state && typeof it.state.cook === 'number') {     // сървърът няма събитие за „готово": хващам го от състоянието
        const c = it.state.cook;
        if (r.cook >= 0 && r.cook < 1 && c >= 1 && it.holder == null) { flash(r.x, r.y + 0.05, r.z, 0xc8f03c, 0.2, 0.3); puff(r.x, r.y + 0.05, r.z, 0xc8f03c, 5, 0.3, 0.03, 0.55, 0.45); }
        r.cook = c;
      }
      const key = itemKey(it.kind, it.state);
      if (key !== r.key) { r.key = key; setEntry(r.v, itemEntry(it.kind, it.state, key)); }
      r.holder = it.holder ?? null;
      r.hand = it.hand === 'l' ? 'l' : 'r';
      r.mine = r.holder != null && sameId(r.holder, me.id);
      r.other = r.holder != null && !r.mine ? findPlayer(r.holder) : null;
      if (r.holder == null) {
        const sl = it.slot != null ? slotByKey.get(String(it.slot)) : null;
        r.tx = typeof it.x === 'number' ? it.x : sl ? sl.x : r.tx;
        r.ty = typeof it.y === 'number' ? it.y : sl ? sl.y : r.ty;
        r.tz = typeof it.z === 'number' ? it.z : sl ? sl.z : r.tz;
        r.tyaw = +it.yaw || 0;
        r.level = it.level != null ? Math.min(nLevels - 1, lvl(it.level)) : sl ? sl.level : 0;
      }
      r.on = r.level === myLevel;
    }
    for (let i = itemList.length - 1; i >= 0; i--) {
      const r = itemList[i];
      if (r.seen === snapN) continue;
      freeView(r.v);
      items.delete(r.id);
      itemList[i] = itemList[itemList.length - 1]; itemList.pop();
    }

    // потвърждаване на предположенията
    for (let j = 0; j < 2; j++) {
      const k = HK[j], H = hand[k];
      if (H.act === 'grab') { const r = items.get(H.actId); if (!r || (r.mine && r.hand === k)) H.act = 'none'; }
      else if (H.act === 'take') {
        for (let i = 0; i < itemList.length; i++) { const r = itemList[i]; if (r.mine && r.hand === k && !(H.rel.on && H.rel.id === r.id)) { H.act = 'none'; break; } }
      }
      if (H.rel.on && H.rel.id !== -1) { const r = items.get(H.rel.id); if (!r || !(r.mine && r.hand === k)) H.rel.on = false; }
    }
    refreshModes();

    // клиенти
    buyerList = Array.isArray(snap.buyers) ? snap.buyers : [];
    for (let i = 0; i < slots.length; i++) if (slots[i].spot) slots[i].spotOn = false;
    for (const b of buyerList) if (b.state === 'wait') { const st = stationByKey.get(String(b.spot)); if (st && st.slots[0]) st.slots[0].spotOn = true; }
    const everybody = buyerList.length ? (snap.customers || []).concat(buyerList.map(b => ({ ...b, order: { kind: 'stuff', item: b.want }, lv: b.level, special: false, mark: false }))) : snap.customers || [];
    for (const c of everybody) {
      let r = custs.get(c.id);
      const seat = seatByI.get(c.seat);
      const cx = typeof c.x === 'number' ? c.x : seat ? seat.x : 0, cz = typeof c.z === 'number' ? c.z : seat ? seat.z : 0;
      const near = !!seat && Math.hypot(cx - seat.x, cz - seat.z) < 0.06;   // сървърът не го мести сам: плъзгам го аз
      if (!r) {
        r = {
          id: c.id, look: c.look | 0, special: !!c.special, v: null, model: null, poolKey: '', ov: getView(custGroup), okey: null, mood: null,
          x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, state: c.state, st: 0, patience: 1, fresh: true, seen: 0,
          slide: c.state === 'in' && near ? 1 : 0, slideTo: 0, walk: 0, os: 0, seed: (c.id | 0) * 1.7, tall: 1.7, lv: lvl(c.lv),
          view: { state: c.state, patience: 1, look: c.look | 0, special: !!c.special, mark: !!c.mark, order: null }, mark: !!c.mark, face: false,
        };
        custs.set(c.id, r); custList.push(r);
        custBody(r);
      }
      r.seen = snapN;
      if (r.state !== c.state) { r.state = c.state; r.st = 0; }
      r.patience = typeof c.patience === 'number' ? c.patience : 1;
      r.tx = cx; r.tz = cz; r.tyaw = typeof c.yaw === 'number' ? c.yaw : Math.PI;
      r.slideTo = c.state === 'out' && near ? 1 : 0;
      r.view.state = c.state; r.view.patience = r.patience; r.view.order = c.order || null;
      custSkin(r);
      const okey = orderKeyOf(c.order);
      if (okey !== r.okey) { r.okey = okey; const order = c.order; r.face = !!order && order.kind === 'pizza'; setEntry(r.ov, entryFor(okey, () => buildOrder(order))); }
    }
    for (let i = custList.length - 1; i >= 0; i--) {
      const r = custList[i];
      if (r.seen === snapN) continue;
      dropCust(r);
      custs.delete(r.id);
      custList[i] = custList[custList.length - 1]; custList.pop();
    }

    // събития: всяко веднъж
    for (const e of snap.events || []) {
      if (e.id == null || seenEv.includes(e.id)) continue;
      seenEv[seenN++ % seenEv.length] = e.id;
      showEvent(e);
    }

    UI.goal = goalText();
    if (myLevel >= 2) drawBanner(UI.goal);
    if (lever) lever.rotation.x = UI.shop ? 0.5 : 0;
    hud.onSnapshot(myLevel >= 2 ? { ...snap, hint: UI.goal } : snap);
  }

  // ---------- кадър ----------

  function update(dt) {
    now = performance.now() / 1000;
    if (!(dt > 0)) dt = 0;
    else if (dt > 0.1) dt = 0.1;

    // предположение без потвърждение: връща се
    let changed = false;
    for (let j = 0; j < 2; j++) {
      const H = hand[HK[j]];
      if (H.act !== 'none' && now - H.actT > PREDICT_S) { H.act = 'none'; changed = true; }
      if (H.rel.on && now - H.rel.t > PREDICT_S) { H.rel.on = false; changed = true; }
      if (H.press > 0) H.press = Math.max(0, H.press - dt * 5);
    }
    if (changed) refreshModes();

    // the streams of the drinks machine: a cup that is being filled, or a tap pressed with nothing under it
    for (let i = 0; i < streams.length; i++) {
      const q = streams[i];
      let on = now < q.until;
      for (let n = 0; n < itemList.length && !on; n++) { const r = itemList[n]; if (r.pour && r.slot === q.slot.key) on = true; }
      q.m.visible = on && drinksSt.on;
      if (q.m.visible) q.m.scale.set(1 + 0.25 * Math.sin(now * 40 + i), Math.max(0.05, q.m.position.y - q.slot.y - 0.015), 1 + 0.25 * Math.cos(now * 37 + i));
    }
    // the blue flask is shaken: four quick changes of direction
    for (let j = 0; j < 2; j++) {
      const k = HK[j], H = hand[k], h = ctx.hands[k], it = H.held;
      if (!h) continue;
      if (!H.shP) H.shP = h.pos.clone();
      const oth = hand[HK[1 - j]].held;
      const roll = !!it && !!oth && ((it.kind === 'papers' && oth.kind === 'buds') || (it.kind === 'buds' && oth.kind === 'papers'));
      if (H.shDone && now - (H.shT || 0) > 1.0) { H.shDone = false; H.shN = 0; }      // refused or done: it may be tried again
      if (!it || !(roll || (LIQ.has(it.kind) && !it.shaken && (it.ml ?? 1) > 0)) || h.active === false) { H.shN = 0; H.shId = null; H.shP.copy(h.pos); continue; }
      if (H.shId !== it.id) { H.shId = it.id; H.shN = 0; H.shS = 0; H.shDone = false; H.shP.copy(h.pos); continue; }
      const kdt = 1 / Math.max(dt, 1e-3), vx = (h.pos.x - H.shP.x) * kdt, vy = (h.pos.y - H.shP.y) * kdt, vz = (h.pos.z - H.shP.z) * kdt;
      H.shP.copy(h.pos);
      if (Math.hypot(vx, vy, vz) < 0.9) continue;
      const ax = Math.abs(vx), ay = Math.abs(vy), az = Math.abs(vz), lead = ay >= ax && ay >= az ? vy : ax >= az ? vx : vz, sg = lead > 0 ? 1 : -1;
      if (sg === H.shS) continue;
      if (now - (H.shT || 0) > 0.9) H.shN = 0;
      H.shS = sg; H.shT = now; H.shN++;
      ctx.haptic(k, 0.35, 18);
      if (H.shN >= 4 && !H.shDone) { H.shDone = true; ctx.send({ a: 'shake', hand: k }); ctx.haptic(k, 0.9, 140); }
    }

    // taking the product: held at the mouth for a moment (a joint smokes while it gets there)
    for (let j = 0; j < 2; j++) {
      const k = HK[j], H = hand[k], h = ctx.hands[k], it = H.held;
      if (!h || !it || !(it.kind in FXOF) || h.active === false || over) { H.eat = 0; H.eatSent = false; continue; }
      const mx = ctx.head.pos.x, my = ctx.head.pos.y - 0.07, mz = ctx.head.pos.z;
      const d = Math.hypot(h.pos.x - mx, h.pos.y - my, h.pos.z - mz);
      if (d > 0.25) { H.eat = 0; H.eatSent = false; continue; }
      H.eat = (H.eat || 0) + dt;
      if (now - (H.eatT || 0) > 0.16) {
        H.eatT = now;
        ctx.haptic(k, Math.min(1, 0.3 + H.eat), 40);
        if (it.kind === 'joint') puff(h.pos.x, h.pos.y + 0.03, h.pos.z, 0xdfe6e0, 2, 0.12, 0.05, 1.1, 0.3);
      }
      if (H.eat >= 0.7 && !H.eatSent) { H.eatSent = true; ctx.send({ a: 'consume', hand: k }); }
    }

    // станции със състояние
    for (let i = 0; i < dyn.length; i++) {
      const s = dyn[i];
      if (s.mode !== 'live') continue;
      if (s.nT) {                                        // иглата се движи и между две снимки
        let n = s.n1 + s.nV * Math.min(0.12, now - s.nT);
        if (n < 0) n = -n; if (n > 1) n = 2 - n;
        s.view.needle = clamp01(n);
      }
      if (s === elev && s.state) s.view.doors = lvl(s.state.level) === myLevel ? +s.state.doors || 0 : 0;   // на другото ниво вратите са затворени
      if (s.state) kit.setState(s.live, s.kind, s.view, dt);
      if (!s.pinLive && now - s.keyT > IDLE_BAKE_S && !(s.state && s.state.moving)) toBaked(s);
    }

    // возене: кабината трепери (не камерата), а който е вътре, го усеща и в двете ръце
    if (elev) {
      const moving = !!(elev.state && elev.state.moving), inside = moving && inCabin(ctx.head.pos);
      if (moving && elev.mode === 'live' && !kit.fromModels(elev.live)) {   // моделът от models.js се тресе сам в setModelState
        const a = inside ? 0.004 : 0.002;
        elev.live.position.set(elev.x + Math.sin(now * 61) * a, elev.y + Math.sin(now * 47) * a * 0.5, elev.z + Math.cos(now * 53) * a);
        elev.shook = true;
      } else if (elev.shook) { elev.live.position.set(elev.x, elev.y, elev.z); elev.shook = false; }
      if (inside && now - buzzT > 0.22) { buzzT = now; ctx.haptic('l', 0.22, 60); ctx.haptic('r', 0.22, 60); }
      hud.setRide(inside);
    }

    // the police: in the minute before they come both hands tick (faster in the last ten seconds); the light is the hud's part
    if (UI.patrol && UI.patrol.phase === 'warn') {
      const gap = (+UI.patrol.left || 0) < 10 ? 0.5 : 2;
      if (now - copT > gap) { copT = now; ctx.haptic('l', 0.35, 40); ctx.haptic('r', 0.35, 40); }
    }

    for (let i = 0; i < trapList.length; i++) {
      const t = trapList[i];
      t.open += (t.to - t.open) * (1 - Math.exp(-dt * 16));
      const y = TRAP_Y + 0.004 - t.open * t.open * 2.6;
      t.cover.position.y = y;
      if (t.crate) { if (t.crateOn && t.open < 0.02 && t.to === 0 && t.seenOpen) { t.crate.visible = false; t.crateOn = false; t.seenOpen = false; } if (t.open > 0.5) t.seenOpen = true; t.crate.position.y = y + 0.058; }
      if (t.lit !== t.wasLit) { t.wasLit = t.lit; t.cover.traverse(o => { if (o.isMesh) o.material = t.lit ? (o.userData.litMat ||= litOf(o.userData.baseMat ||= o.material)) : (o.userData.baseMat || o.material); }); }
      if (t.lit) for (const m of litMats) m.emissiveIntensity = 0.55 + 0.45 * Math.sin(now * 6);
    }

    _right.set(1, 0, 0).applyQuaternion(ctx.head.quat);
    _up.set(0, 1, 0).applyQuaternion(ctx.head.quat);
    updateItems(dt);
    updateCustomers(dt);
    if (over) { ringN = 0; ringMesh.visible = false; for (let i = 0; i < itemList.length; i++) if (itemList[i].v.hl) tint(itemList[i].v, false); }
    else updateTargets();
    updateFx(dt);
    updatePops(dt);
    if (CAREER) {
      const pad = ctx.hands.l && ctx.hands.l.pad, bt = pad && pad.buttons;
      const on = !!(bt && ((bt[4] && bt[4].pressed) || (bt[5] && bt[5].pressed)));
      if (on && !padWas) togglePause();
      padWas = on;
      if (UI.float && UI.float.plane.visible) {      // the menu panel stays in front of the eyes while it is open
        const F = UI.float;
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (_v.lengthSq() > 1e-4) {
          _v.normalize();
          const tx = ctx.head.pos.x + _v.x * 1.05, tz = ctx.head.pos.z + _v.z * 1.05, ty = ctx.head.pos.y - 0.12, kk = 1 - Math.exp(-dt * 3);
          if (!F.set) { F.cx = tx; F.cy = ty; F.cz = tz; F.set = true; } else { F.cx += (tx - F.cx) * kk; F.cy += (ty - F.cy) * kk; F.cz += (tz - F.cz) * kk; }
          const nx = ctx.head.pos.x - F.cx, nz = ctx.head.pos.z - F.cz, nl = Math.hypot(nx, nz) || 1;
          F.nx = nx / nl; F.nz = nz / nl; F.rx = F.nz; F.rz = -F.nx;
          F.plane.position.set(F.cx, F.cy, F.cz); F.plane.rotation.set(0, Math.atan2(F.nx, F.nz), 0);
        }
      }
    }
    updateScreens();
    updateLab();
    updateVeil(dt);
    // arrived in the street: what to do there is said once in front of the eyes
    if (arrived > 0 && now - arrived > 0.9) { arrived = -9; _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0; if (_v.lengthSq() > 1e-4) { _v.normalize(); const b = blockOf(myLevel); pop(b ? String(b.name).toUpperCase() : 'STREET', ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y + 0.05, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); } }
    hud.update(dt, now);
  }

  function dispose() {
    try { offInput?.(); } catch { /* вече е отписан */ }
    window.removeEventListener('keydown', onKey);
    hud.dispose();
    ctx.root.remove(group);
    for (let i = 0; i < muted.length; i += 2) muted[i].intensity = muted[i + 1];
    muted.length = 0;
    for (const e of cache.values()) disposeEntry(e);
    cache.clear();
    for (const p of staticParts) p.geo.dispose();
    staticParts = [];
    const freeObj = o => o.traverse(c => {            // живи модели: освобождава се само паметта във видеокартата, кешът на models.js остава годен
      c.geometry?.dispose?.();
      for (const m of Array.isArray(c.material) ? c.material : c.material ? [c.material] : []) { m.map?.dispose?.(); m.dispose?.(); }
    });
    for (const s of stations) { if (s.entry) disposeEntry(s.entry); freeObj(s.live); }
    for (const list of custPool.values()) for (const o of list) freeObj(o);
    for (const r of custList) if (r.model) freeObj(r.model);
    for (const o of own) o.dispose?.();
    own.length = 0;
    kit.dispose();
    items.clear(); itemList.length = 0; custs.clear(); custList.length = 0; viewPool.length = 0; dyn.length = 0;
    group.clear();
  }

  return {
    onSnapshot, update, dispose,
    /** простата стая (под, стени, улица, очертание): true/false я показва или крие; без аргумент важи правилото (само без ctx.assets) */
    setRoom(on) { roomForce = on === undefined ? undefined : !!on; applyRoom(); },
    /** за проби: кои модели се ползват, какво е паднало на кутии, на кое ниво съм */
    info: { get models() { return kit.real ? 'models.js' : 'кутии'; }, get why() { return kit.why; }, get boxed() { return [...kit.boxed]; }, get cache() { return cache.size; }, get level() { return myLevel; }, get levels() { return nLevels; }, group },
  };
}

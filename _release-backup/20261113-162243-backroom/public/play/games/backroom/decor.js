// Обстановката на „Задната стая" (SPEC т. 11): щандът, задната стая и градът около тях.
//
// Мястото: ъглов щанд на партера на сграда. Отпред (z = +d/2) и вдясно (x = +w/2) е отворен към две улици,
// които се пресичат на ъгъла. Вляво е глуха стена към съседа, отзад е стената с хладилниците, зад която е задната стая.
// Кварталът е от цели сгради и плочки за път и тротоар от POLYGON City Pack, наредени на мрежа от 5 м.
//
// Правила, които този файл спазва:
//  - на пода в залата има нещо само до 0.45 м от стена и никога върху станция (+0.15 м), във вратата или върху тезгяха;
//  - по стените: над станциите; под 1.9 м нищо не стърчи повече от 0.45 м;
//  - неподвижното се слива (assets.merge): по една мрежа на текстура. Движат се само няколко дребни неща;
//  - вътрешността се осветява от сцената (Lambert, приема и хвърля сянка); улицата е с изпечена светлина (ден/нощ).
//
// С готовата карта (Shopping Plaza Map) играчът е в кухнята на пицарията Pizza Shack: тук тя се затваря в помещение по
// мярка на игралната зона (стени зад уредите, таван на 3 м, от модулите на картата), а небето притъмнява с фазата.
// Две нива (SPEC т. 12): ниво 0 е кухнята с тезгяха и градът; ниво 1 е мазето под пицарията:
// едно помещение около игралната зона, сглобено само от модели на Synty в естествения им размер. Строят се и двете още в началото; update() показва това, на което е местният играч.
//
// createDecor(ctx, start, opts) → { update(dt, t, snap), dispose(), stats, root }
//   opts.open = true: без таван, покрив и козирки (за оглед отгоре в decor-preview.html).

const CEIL_H = 2.8;        // височина на тавана
const KEEP = 0.15;         // въздух около всяка станция
const BAND = 0.45;         // толкова от стената навътре може да има нещо на пода
const OUT_T = 0.25;        // дебелина на външните стени (навън от залата)
const LOW = 1.1;           // височина на парапета откъм страничната улица
const SHOPS = 'shops-pack', CITY = 'city-pack', GANG = 'gang-warfare-pack', KIDS = 'kids-pack';
// ниво 1 (подземната лаборатория): всичко е в естествения размер на моделите
const LAB_MARGIN = 0.9;    // стените стоят на толкова извън ръба на игралната зона (станциите излизат до 0.75 м извън него)
const LAB_H = 3.0;         // долната страна на тавана; подът е на y = 0
const LAB_MOD = 3;         // модулът на Gang Warfare Pack: стена, под и таван са по 3 м (има и половин стена)
const CAB_PAD = 0.06;      // кабината на асансьора е с толкова по-широка от станцията си от всяка страна (synty-kinds.js: 1.72 при 1.6)
const CAB_TOP = 2.63;      // външната височина на кабината
const CAB_IN = 0.04;       // стената около кабината е на толкова зад лицето ѝ

/** City Pack: сградите и уличните неща са обърнати 100 пъти по-малки (колите са в метри). */
export const unitOf = (slug, name) => (slug === CITY && !name.startsWith('SM_Veh_') ? 100 : 1);

// Материали, които идват без текстура в pack.json (конвейерът не ги разпознава): оправят се тук по име.
const TEX = {
  [SHOPS]: (m, name) => (/Signs_01|burgerSigns/i.test(m.image || '') || /^SM_Sign_(Neon|Exit|Framed|Board|Price|Sale|Food)/.test(name) ? 'tex/PolygonShops_Signs_01.png' : /Generic/i.test(`${m.image} ${m.name}`) ? 'tex/Generic_01_A.png' : null),
  [GANG]: () => 'tex/PolygonGangWarfare_Texture_01_A.png',
};
const texPlans = new Map();
/** Слага правилните текстури на копие на модел (общите материали на assets.js). */
export function fixMaterials(assets, obj, slug, name) {
  const key = `${slug}/${name}`;
  let plan = texPlans.get(key);
  if (plan === undefined) {
    plan = null;
    const info = assets.info(slug, name), fn = TEX[slug];
    if (info && fn) { const list = info.materials.map(m => m.map || fn(m, name)); if (list.some(Boolean)) plan = list; }
    texPlans.set(key, plan);
  }
  if (!plan) return obj;
  const meshes = []; obj.traverse(o => { if (o.isMesh) meshes.push(o); });
  const uniq = [...new Set(plan)];
  meshes.forEach((me, i) => {
    const tex = uniq.length === 1 ? uniq[0] : (meshes.length === plan.length ? plan[i] : plan.find(Boolean));
    if (tex) me.material = assets.material(slug, tex);
  });
  return obj;
}

// ───────── цветове по теми ─────────
const PALETTE = {
  night: {
    shopFloor: [0.86, 0.80, 0.68], shopBase: [0.16, 0.14, 0.13], shopTile: [0.93, 0.90, 0.82], shopTrim: [0.78, 0.16, 0.12],
    shopWall: [0.14, 0.40, 0.40], shopCeil: [0.84, 0.82, 0.76], shelf: [0.42, 0.27, 0.17], header: [0.78, 0.16, 0.12],
    steel: [0.72, 0.75, 0.78], steelDark: [0.34, 0.36, 0.40], sill: [0.46, 0.30, 0.18],
    labFloor: [0.46, 0.45, 0.43], labWall: [0.52, 0.33, 0.26], labWallHi: [0.42, 0.42, 0.38], labCeil: [0.20, 0.20, 0.22], labBase: [0.12, 0.12, 0.12],
    threshold: [0.20, 0.20, 0.22],
    ground: [0.20, 0.20, 0.22], roof: [0.22, 0.22, 0.25], facade: [0.55, 0.20, 0.15], awning: [0.88, 0.17, 0.12],
    masses: [[0.50, 0.26, 0.20], [0.58, 0.50, 0.38], [0.34, 0.38, 0.46], [0.44, 0.42, 0.38]],
    // две осветления на улицата: A при 'tutorial'/'day' (здрач), B от 'closing' нататък (нощ)
    A: { skyTop: [0.07, 0.10, 0.30], skyLow: [0.95, 0.50, 0.30], as: [0.36, 0.38, 0.56], ag: [0.20, 0.18, 0.22], sun: [0.62, 0.36, 0.20], sunDir: [-0.55, 0.42, 0.50], lamp: 0.75, glow: 0.85 },
    B: { skyTop: [0.012, 0.018, 0.06], skyLow: [0.16, 0.11, 0.26], as: [0.13, 0.15, 0.28], ag: [0.06, 0.06, 0.10], sun: [0.08, 0.10, 0.18], sunDir: [0.35, 0.80, 0.30], lamp: 1.0, glow: 1.0 },
    win: [1.0, 0.78, 0.40], lampCol: [1.0, 0.72, 0.36], spill: [[1.0, 0.75, 0.42], [0.45, 0.85, 1.0], [1.0, 0.42, 0.62]],
    paints: [[0.72, 0.10, 0.08], [0.10, 0.38, 0.46]],
    glowK: 1.0,
  },
  kids: {
    shopFloor: [1.0, 0.86, 0.90], shopBase: [0.95, 0.45, 0.62], shopTile: [0.76, 0.95, 0.89], shopTrim: [0.98, 0.50, 0.66],
    shopWall: [1.0, 0.93, 0.70], shopCeil: [0.97, 0.97, 0.99], shelf: [0.98, 0.80, 0.48], header: [0.98, 0.50, 0.66],
    steel: [0.80, 0.90, 0.95], steelDark: [0.46, 0.58, 0.70], sill: [0.98, 0.80, 0.48],
    labFloor: [0.64, 0.54, 0.84], labWall: [0.52, 0.42, 0.84], labWallHi: [0.38, 0.74, 0.82], labCeil: [0.24, 0.27, 0.55], labBase: [0.30, 0.22, 0.55],
    threshold: [0.55, 0.40, 0.70],
    ground: [0.42, 0.44, 0.46], roof: [0.55, 0.52, 0.56], facade: [1.0, 0.64, 0.74], awning: [1.0, 0.45, 0.62],
    masses: [[1.0, 0.74, 0.64], [0.72, 0.89, 0.96], [1.0, 0.91, 0.64], [0.76, 0.93, 0.76]],
    A: { skyTop: [0.20, 0.50, 0.96], skyLow: [0.80, 0.93, 1.0], as: [0.72, 0.78, 0.92], ag: [0.44, 0.42, 0.40], sun: [0.78, 0.74, 0.62], sunDir: [0.45, 0.78, 0.44], lamp: 0, glow: 0 },
    B: { skyTop: [0.22, 0.22, 0.60], skyLow: [1.0, 0.62, 0.42], as: [0.50, 0.45, 0.62], ag: [0.30, 0.25, 0.28], sun: [0.72, 0.42, 0.22], sunDir: [-0.70, 0.30, 0.42], lamp: 0.65, glow: 0.8 },
    win: [1.0, 0.86, 0.50], lampCol: [1.0, 0.82, 0.55], spill: [[1.0, 0.82, 0.5], [1.0, 0.6, 0.8], [0.6, 0.9, 1.0]],
    paints: [[0.95, 0.35, 0.50], [0.25, 0.70, 0.85]],
    glowK: 0.6,
  },
};

// плочки в атласа (4 × 4)
const T_FLAT = 0, T_CHECK = 1, T_TILE = 2, T_PLASTER = 3, T_BRICK = 4, T_CONCRETE = 5, T_CEIL = 6, T_ASPHALT = 7,
  T_PAVE = 8, T_WOOD = 9, T_METAL = 10, T_PANE = 11, T_STRIPE = 12, T_STARS = 13, T_GLOW = 14, T_GRIME = 15;
// светещи цветове в плочката T_GLOW (4 × 4 квадратчета)
const GLOWS = ['#ffffff', '#fff1c8', '#ff4f8f', '#39d8ff', '#74ff5a', '#ff3b30', '#ffb020', '#b56cff', '#3c7dff', '#ffe14a', '#ff7a1a', '#18ffc8', '#ffd0e0', '#c8f0ff', '#f0ffd0', '#ffe0b0'];
const G_WARM = 1, G_PINK = 2, G_CYAN = 3, G_GREEN = 4;

function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── атлас с шарки: рисува се веднъж на canvas (плюс втори лист, само със светещата плочка) ─────────
function makeAtlas(THREE) {
  const S = 192, C = 256, G = 32;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; return c; };
  const cv = mk(), g = cv.getContext('2d');
  const tile = document.createElement('canvas'); tile.width = tile.height = S;
  const t = tile.getContext('2d');
  const rnd = rng(77);
  const grey = v => { const k = Math.round(v * 255); return `rgb(${k},${k},${k})`; };
  const blot = (x, y, r, v, a) => {       // петно, което се повтаря през ръба (плочката се реди без шев)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const gx = x + i * S, gy = y + j * S, gr = t.createRadialGradient(gx, gy, 0, gx, gy, r), k = Math.round(v * 255);
      gr.addColorStop(0, `rgba(${k},${k},${k},${a})`); gr.addColorStop(1, `rgba(${k},${k},${k},0)`);
      t.fillStyle = gr; t.fillRect(gx - r, gy - r, 2 * r, 2 * r);
    }
  };
  const blots = (n, r0, r1, v0, v1, a) => { for (let i = 0; i < n; i++) blot(rnd() * S, rnd() * S, r0 + rnd() * (r1 - r0), v0 + rnd() * (v1 - v0), a); };
  const grid = (n, w, v) => { t.fillStyle = grey(v); for (let i = 0; i <= n; i++) { const p = Math.round(i * S / n - w / 2); t.fillRect(p, 0, w, S); t.fillRect(0, p, S, w); } };
  const painters = [
    () => {},                                                                     // 0 гладко
    () => { t.fillStyle = grey(0.58); t.fillRect(0, 0, S / 2, S / 2); t.fillRect(S / 2, S / 2, S / 2, S / 2); blots(10, 20, 50, 0.3, 0.6, 0.06); grid(2, 3, 0.40); },   // 1 шах
    () => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { t.fillStyle = grey(0.9 + rnd() * 0.1); t.fillRect(i * 48, j * 48, 48, 48); } grid(4, 3, 0.62); }, // 2 фаянс
    () => { t.fillStyle = grey(0.95); t.fillRect(0, 0, S, S); blots(16, 20, 60, 0.55, 0.8, 0.08); blots(6, 10, 30, 1, 1, 0.25); },                                   // 3 мазилка
    () => {                                                                       // 4 тухла
      t.fillStyle = grey(0.50); t.fillRect(0, 0, S, S);
      for (let r = 0; r < 6; r++) for (let c = -1; c < 3; c++) { t.fillStyle = grey(0.78 + rnd() * 0.22); t.fillRect(c * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28); }
      blots(6, 20, 50, 0.3, 0.5, 0.10);
    },
    () => {                                                                       // 5 бетон
      t.fillStyle = grey(0.9); t.fillRect(0, 0, S, S); blots(18, 16, 56, 0.45, 0.75, 0.13); blots(8, 8, 26, 1, 1, 0.3);
      t.strokeStyle = grey(0.5); t.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) { t.beginPath(); let x = 30 + rnd() * 130, y = 30 + rnd() * 130; t.moveTo(x, y); for (let i = 0; i < 5; i++) { x += rnd() * 30 - 15; y += rnd() * 22 - 4; t.lineTo(x, y); } t.stroke(); }
      grid(1, 3, 0.6);
    },
    () => { t.fillStyle = grey(0.95); t.fillRect(0, 0, S, S); grid(1, 6, 0.70); t.fillStyle = grey(0.84); for (let i = 0; i < 40; i++) t.fillRect(12 + rnd() * 168, 12 + rnd() * 168, 2, 2); },   // 6 таван
    () => { t.fillStyle = grey(0.88); t.fillRect(0, 0, S, S); for (let i = 0; i < 500; i++) { t.fillStyle = grey(0.62 + rnd() * 0.38); t.fillRect(rnd() * S, rnd() * S, 2, 2); } blots(8, 20, 60, 0.4, 0.6, 0.10); }, // 7 асфалт
    () => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { t.fillStyle = grey(0.86 + rnd() * 0.12); t.fillRect(i * 96, j * 96, 96, 96); } blots(8, 14, 40, 0.5, 0.7, 0.08); grid(2, 3, 0.55); },     // 8 плочи
    () => { for (let j = 0; j < 4; j++) { t.fillStyle = grey(0.80 + rnd() * 0.2); t.fillRect(0, j * 48, S, 48); t.fillStyle = grey(0.5); t.fillRect(0, j * 48, S, 2); t.fillRect((j * 77) % S, j * 48, 2, 48); } },   // 9 дъски
    () => { for (let i = 0; i < 12; i++) { const gr = t.createLinearGradient(i * 16, 0, i * 16 + 16, 0); gr.addColorStop(0, grey(0.66)); gr.addColorStop(0.5, grey(1)); gr.addColorStop(1, grey(0.66)); t.fillStyle = gr; t.fillRect(i * 16, 0, 16, S); } }, // 10 ламарина
    () => { t.fillStyle = grey(0.22); t.fillRect(0, 0, S, S); t.fillStyle = grey(1); t.fillRect(12, 12, 78, 78); t.fillRect(102, 12, 78, 78); t.fillRect(12, 102, 78, 78); t.fillRect(102, 102, 78, 78); },      // 11 прозорец
    () => { t.fillStyle = grey(0.62); for (let i = 0; i < 3; i++) t.fillRect(i * 64, 0, 32, S); },                                                                    // 12 райе
    () => {                                                                       // 13 звезди
      t.fillStyle = grey(0.86); t.fillRect(0, 0, S, S);
      for (let k = 0; k < 9; k++) {
        const x = 20 + (k % 3) * 64 + rnd() * 24, y = 20 + ((k / 3) | 0) * 64 + rnd() * 24, r = 7 + rnd() * 7;
        t.fillStyle = grey(1); t.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; t.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        t.fill();
      }
    },
    () => { for (let k = 0; k < 16; k++) { t.fillStyle = GLOWS[k]; t.fillRect((k % 4) * 48, ((k / 4) | 0) * 48, 48, 48); } },                                          // 14 светещи цветове
    () => {                                                                       // 15 мръсна мазилка
      t.fillStyle = grey(0.86); t.fillRect(0, 0, S, S); blots(22, 14, 60, 0.3, 0.6, 0.16); blots(6, 10, 30, 1, 1, 0.25);
      for (let i = 0; i < 6; i++) { const x = rnd() * S, h = 30 + rnd() * 90, gr = t.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(60,60,60,0.28)'); gr.addColorStop(1, 'rgba(60,60,60,0)'); t.fillStyle = gr; t.fillRect(x, 0, 3 + rnd() * 5, h); }
    },
  ];
  const cellOf = k => [(k % 4) * C, ((k / 4) | 0) * C];
  painters.forEach((fn, k) => {
    t.globalAlpha = 1; t.fillStyle = '#fff'; t.fillRect(0, 0, S, S);
    fn();
    const [cx, cy] = cellOf(k);
    g.save(); g.beginPath(); g.rect(cx, cy, C, C); g.clip();
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) g.drawImage(tile, cx + G + a * S, cy + G + b * S);
    g.restore();
  });
  // вторият лист: черен навсякъде, освен светещата плочка
  const ev = mk(), eg = ev.getContext('2d');
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 1024, 1024);
  { const [cx, cy] = cellOf(T_GLOW); eg.drawImage(cv, cx, cy, C, C, cx, cy, C, C); }
  const wrap = c => { const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex; };
  return { map: wrap(cv), emissive: wrap(ev) };
}
// uv на едно светещо квадратче от T_GLOW
function glowUV(k) {
  const i = T_GLOW & 3, j = T_GLOW >> 2, gx = k % 4, gy = (k / 4) | 0;
  return [(i * 256 + 32 + gx * 48 + 24) / 1024, 1 - (j * 256 + 32 + gy * 48 + 24) / 1024];
}

// ───────── строител на плоскости: всичко отива в една геометрия ─────────
function makeMesher(shade) {
  const P = [], N = [], U = [], A = [], B = [];
  const ca = [0, 0, 0], cb = [0, 0, 0];
  const M = {
    shade,
    vert(x, y, z, n, u, v, base, baseB) {
      P.push(x, y, z); N.push(n[0], n[1], n[2]); U.push(u, v);
      if (baseB) { A.push(base[0], base[1], base[2]); B.push(baseB[0], baseB[1], baseB[2]); return; }   // готов цвят (небе, светещо)
      M.shade(x, y, z, n, base, ca, cb);
      A.push(ca[0], ca[1], ca[2]); B.push(cb[0], cb[1], cb[2]);
    },
    // правоъгълник o + eu·[0, lu] + ev·[0, lv]; лицето гледа към eu × ev. Шарката се повтаря на всеки ts метра, k деления на шарка.
    rect(o, eu, ev, lu, lv, tile, ts, base, k = 1, baseB = null, uvFix = null) {
      if (lu <= 1e-4 || lv <= 1e-4) return;
      const n = [eu[1] * ev[2] - eu[2] * ev[1], eu[2] * ev[0] - eu[0] * ev[2], eu[0] * ev[1] - eu[1] * ev[0]];
      const i = tile & 3, j = tile >> 2;
      const u0 = (i * 256 + 32) / 1024, v0 = 1 - (j * 256 + 224) / 1024, us = 192 / 1024;
      const once = ts < 0, flat = !once && (tile === T_FLAT || !ts || !!uvFix);
      const step = once ? 1e9 : flat ? (ts || 1e9) : ts / k, per = flat ? 1e9 : ts;
      // къде в шарката започва клетката (закръглено: иначе 2.9999 % 1 прескача в съседната плочка на атласа)
      const fr = q => { const f = (q / per) % 1; return f > 0.9995 || f < 0.0005 ? 0 : f; };
      for (let a = 0; a < lu - 1e-5; a += step) {
        const b = Math.min(lu, a + step);
        const fa = once ? 0 : flat ? 0.5 : fr(a), fb = once ? 1 : flat ? 0.5 : Math.min(1, fa + (b - a) / per);
        for (let c = 0; c < lv - 1e-5; c += step) {
          const d = Math.min(lv, c + step);
          const fc = once ? 0 : flat ? 0.5 : fr(c), fd = once ? 1 : flat ? 0.5 : Math.min(1, fc + (d - c) / per);
          const V = (s, q, fu, fv) => M.vert(o[0] + eu[0] * s + ev[0] * q, o[1] + eu[1] * s + ev[1] * q, o[2] + eu[2] * s + ev[2] * q, n,
            uvFix ? uvFix[0] : u0 + fu * us, uvFix ? uvFix[1] : v0 + fv * us, base, baseB);
          V(a, c, fa, fc); V(b, c, fb, fc); V(b, d, fb, fd);
          V(a, c, fa, fc); V(b, d, fb, fd); V(a, d, fa, fd);
        }
      }
    },
    // кутия с лица навън; faces: кои страни да има (x X y Y z Z)
    box(x0, y0, z0, x1, y1, z1, tile, ts, base, faces = 'xXyYzZ', k = 1, uvFix = null) {
      const R = (o, eu, ev, lu, lv) => M.rect(o, eu, ev, lu, lv, tile, ts, base, k, uvFix ? base : null, uvFix);
      if (faces.includes('X')) R([x1, y0, z1], [0, 0, -1], [0, 1, 0], z1 - z0, y1 - y0);
      if (faces.includes('x')) R([x0, y0, z0], [0, 0, 1], [0, 1, 0], z1 - z0, y1 - y0);
      if (faces.includes('Z')) R([x0, y0, z1], [1, 0, 0], [0, 1, 0], x1 - x0, y1 - y0);
      if (faces.includes('z')) R([x1, y0, z0], [-1, 0, 0], [0, 1, 0], x1 - x0, y1 - y0);
      if (faces.includes('Y')) R([x0, y1, z1], [1, 0, 0], [0, 0, -1], x1 - x0, z1 - z0);
      if (faces.includes('y')) R([x0, y0, z0], [1, 0, 0], [0, 0, 1], x1 - x0, z1 - z0);
    },
    // светеща кутия (неон, лампа, диод): цветът е квадратче от T_GLOW
    glow(x0, y0, z0, x1, y1, z1, k, faces = 'xXyYzZ') { M.box(x0, y0, z0, x1, y1, z1, T_GLOW, 0, [1, 1, 1], faces, 1, glowUV(k)); },
    build(THREE, withB) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(A, 3));
      if (withB) { geo.setAttribute('colorB', new THREE.Float32BufferAttribute(B, 3)); geo.setAttribute('lit', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3), 1)); }
      return geo;
    },
  };
  return M;
}

import { makeWalker } from './synty-kinds.js';
import { hudLayout } from './hud.js';

export async function createDecor(ctx, start, opts = {}) {
  const THREE = ctx.THREE, assets = ctx.assets;
  const theme = (start.theme || ctx.theme) === 'kids' ? 'kids' : 'night';
  const kids = theme === 'kids';
  const PAL = PALETTE[theme];
  const hall = start.hall || ctx.hall || { w: 6, d: 6 };
  const W = hall.w, D = hall.d, hw = W / 2, hd = D / 2;
  // Сбит план (малка зала или зона от няколко стаи, SPEC т. 13): стая „а" е целият щанд, без преграда през средата.
  // Стая „b" (ако я има) е складът зад стената с хладилниците; в дъното ѝ е асансьорът. На ниво 1 двете са лабораторията.
  const compact = start.plan === 'compact';
  const RB = compact && start.rooms && start.rooms[1] ? start.rooms[1] : null;
  const GATE = RB ? (start.doors || []).find(q => (q.a === 'a' && q.b === RB.id) || (q.b === 'a' && q.a === RB.id)) || null : null;
  const bx0 = RB ? RB.x - RB.w / 2 : 0, bx1 = RB ? RB.x + RB.w / 2 : 0, bz0 = RB ? RB.z - RB.d / 2 : 0, bz1 = RB ? RB.z + RB.d / 2 : 0;
  const inB = (x, z, m = 0.01) => !!RB && x >= bx0 - m && x <= bx1 + m && z >= bz0 - m && z <= bz1 + m;
  const GATE_H = 2.1;      // височина на отвора между стаите
  const rnd = rng(Math.round(W * 100) * 7919 + Math.round(D * 100) * 104729 + (theme === 'kids' ? 13 : 0));
  const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];

  const root = new THREE.Group(); root.name = 'decor';
  // Градът около щанда е готовата карта на Synty „Shopping Plaza Map" (подредена от тях, с техните модели и текстури),
  // изпечена в един файл с /play/tools/bake-map.html. Ако файлът липсва, остава старият, сглобен тук квартал.
  let plaza = null;
  if (!opts.noMap) {
    try {
      // Quest 2 носи по-леката изпичка (същата карта, по-малко дреболии надалеч); другите устройства пълната. ?city=city насила пълната.
      const ask = new URLSearchParams(location.search).get('city');
      const names = ask ? [ask, 'city'] : /Quest 2/.test(navigator.userAgent) ? ['city-lite', 'city'] : ['city', 'city-lite'];
      for (const nm of names) {
        const meta = await fetch('/play/assets/maps/shopping-plaza/' + nm + '.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
        const buf = meta && meta.chunks && meta.chunks.length ? await fetch('/play/assets/maps/shopping-plaza/' + nm + '.bin').then(r => (r.ok ? r.arrayBuffer() : null)) : null;
        if (buf) { plaza = { meta, buf, name: nm }; break; }
      }
    } catch (e) { console.warn('[decor] картата на града липсва:', e.message); }
  }
  const own = { geos: [], mats: [], texs: [] };       // това, което този файл е създал и трябва да освободи
  const uMix = { value: 0 }, uGlow = { value: PAL.A.glow }, uWin = { value: new THREE.Color().setRGB(PAL.win[0], PAL.win[1], PAL.win[2]) };
  const atlas = makeAtlas(THREE); own.texs.push(atlas.map, atlas.emissive);

  // ───────── станциите: къде не се слага нищо ─────────
  const boxes0 = [], boxes1 = [];      // по нива: ниво 0 (щанд и склад) и ниво 1 (подземната лаборатория)
  let boxes = boxes0;
  let wallT = 0.08, wallH = 2.0, openTop = 2.05, doorW = 1.2;
  const byKind = {};
  for (const s of start.stations || []) {
    const side = Math.abs(Math.sin(s.yaw || 0)) > 0.5;
    const ex = (side ? s.d : s.w) / 2, ez = (side ? s.w : s.d) / 2;
    const y0 = s.y || 0, y1 = y0 + (s.h || 0.85);
    boxes = s.level === 1 ? boxes1 : boxes0;
    if (s.level !== 1) (byKind[s.kind] ||= []).push(s);
    if (s.kind === 'elevator') {           // кабината стига почти до тавана: нищо около и над нея
      boxes.push({ kind: s.kind, x0: s.x - ex - 0.06, x1: s.x + ex + 0.06, z0: s.z - ez - 0.06, z1: s.z + ez + 0.06, y0: 0, y1: 99, hard: true });
      continue;
    }
    if (s.kind === 'wall') { wallT = s.d; wallH = y1; continue; }
    if (s.kind === 'shutter') { openTop = y1; continue; }
    if (s.kind === 'door') {
      doorW = s.w;
      boxes.push({ kind: 'door', x0: -0.75, x1: 0.75, z0: -0.75, z1: 0.75, y0: 0, y1: 2.2, hard: true });
      // вратата хлътва към задната стая и се плъзга към +X (бележката на сесията с моделите)
      boxes.push({ kind: 'door', x0: 0.5, x1: s.w / 2 + 1.5, z0: -0.34, z1: 0, y0: 0, y1: 2.2, hard: true });
      continue;
    }
    const floor = y0 < 0.3 || s.kind === 'hatch';      // под люка стои играч: и подът там е зает
    boxes.push({ kind: s.kind, x0: s.x - ex - KEEP, x1: s.x + ex + KEEP, z0: s.z - ez - KEEP, z1: s.z + ez + KEEP, y0: floor ? 0 : y0, y1, floor });
  }
  // таблата на сцената висят от тавана (бележката ѝ): пред челото над тезгяха и на задната стена. Не ги закриваме.
  boxes0.push({ kind: 'hud', x0: -1.8, x1: 1.8, z0: hd - 0.62, z1: hd + 0.1, y0: 2.1, y1: CEIL_H });
  for (const list of [boxes0, boxes1]) list.push({ kind: 'hud', x0: -1.8, x1: 1.8, z0: -hd - 0.1, z1: -hd + 0.5, y0: 2.1, y1: CEIL_H });
  if (GATE) for (const list of [boxes0, boxes1]) {
    const half = GATE.w / 2 + 0.12, deep = 0.45;
    list.push(GATE.axis === 'x' ? { kind: 'door', x0: GATE.x - half, x1: GATE.x + half, z0: GATE.z - deep, z1: GATE.z + deep, y0: 0, y1: 99, hard: true }
      : { kind: 'door', x0: GATE.x - deep, x1: GATE.x + deep, z0: GATE.z - half, z1: GATE.z + half, y0: 0, y1: 99, hard: true });
  }
  boxes = boxes0;
  let placed = [];         // кутиите на вече сложената обстановка (за текущото ниво)
  const hit = (a, b) => a.x0 < b.x1 - 1e-4 && b.x0 < a.x1 - 1e-4 && a.z0 < b.z1 - 1e-4 && b.z0 < a.z1 - 1e-4;
  // свободно ли е мястото a; flat: плоско нещо на стената може да е по-ниско над станция
  function free(a, flat) {
    for (const b of boxes) {
      if (!hit(a, b)) continue;
      if (b.hard) { if (a.y0 < b.y1) return false; continue; }
      const top = b.floor ? b.y1 + (flat ? 0.3 : 0.6) : b.y1 + 0.12;
      const bot = b.floor ? 0 : b.y0 - 0.15;
      if (a.y0 < top && a.y1 > bot) return false;
    }
    for (const b of placed) if (hit(a, b) && a.y0 < b.y1 - 1e-4 && b.y0 < a.y1 - 1e-4) return false;
    return true;
  }

  // ───────── стените като оси: u по стената, навътре е n ─────────
  const T2 = wallT / 2;
  const mkWall = (id, x, z, nx, nz, L) => ({ id, P0: [x, z], n: [nx, nz], t: [nz, -nx], L, yaw: Math.atan2(nx, nz) });
  const zS = compact ? -hd : T2;      // откъде започва щандът по z: от преградата, а в сбития план от задната стена
  const wallsFull = {
    shopL: mkWall('shopL', -hw, hd, 1, 0, hd - T2),        // u расте от тезгяха към преградата
    shopR: mkWall('shopR', hw, T2, -1, 0, hd - T2),        // u расте от преградата към тезгяха (тук е отворено над парапета)
    shopB: mkWall('shopB', -hw, T2, 0, 1, W),              // преградата, откъм щанда
    shopF: mkWall('shopF', hw, hd, 0, -1, W),              // над тезгяха
    labL: mkWall('labL', -hw, -T2, 1, 0, hd - T2),
    labR: mkWall('labR', hw, -hd, -1, 0, hd - T2),
    labB: mkWall('labB', -hw, -hd, 0, 1, W),
    labF: mkWall('labF', hw, -T2, 0, -1, W),               // преградата, откъм задната стая
  };
  // сбит план: стените на щанда са целите стени на стая „а"; „задната стая" е стая „b" (ако я няма: стени с нулева дължина)
  const walls = !compact ? wallsFull : {
    shopL: mkWall('shopL', -hw, hd, 1, 0, D),
    shopR: mkWall('shopR', hw, -hd, -1, 0, D),
    shopB: mkWall('shopB', -hw, -hd, 0, 1, W),
    shopF: mkWall('shopF', hw, hd, 0, -1, W),
    labL: mkWall('labL', bx0, bz1, 1, 0, RB ? RB.d : 0),
    labR: mkWall('labR', bx1, bz0, -1, 0, RB ? RB.d : 0),
    labB: mkWall('labB', bx0, bz0, 0, 1, RB ? RB.w : 0),
    labF: mkWall('labF', bx1, bz1, 0, -1, RB ? RB.w : 0),
  };
  // отворът между стаите върху дадена стена: [u0, u1] по нея, или null
  const gateOn = wl => {
    if (!GATE || wl.L < 0.3) return null;
    const dx = GATE.x - wl.P0[0], dz = GATE.z - wl.P0[1];
    if (Math.abs(dx * wl.n[0] + dz * wl.n[1]) > 0.2) return null;
    const u = dx * wl.t[0] + dz * wl.t[1], a = Math.max(0, u - GATE.w / 2), b = Math.min(wl.L, u + GATE.w / 2);
    return b - a > 0.3 ? [a, b] : null;
  };
  const wpos = (wl, u, dep) => [wl.P0[0] + wl.t[0] * u + wl.n[0] * dep, wl.P0[1] + wl.t[1] * u + wl.n[1] * dep];
  function wbox(wl, u0, u1, d0, d1, y0, y1) {
    const a = wpos(wl, u0, d0), b = wpos(wl, u1, d1);
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), y0, y1 };
  }
  // свободните парчета от стена за дадена кутия (стъпка 5 см)
  function runs(wl, d1, y0, y1, flat, m0 = 0.06, m1 = 0.06) {
    const out = []; let s = null;
    for (let u = m0; u <= wl.L - m1 + 1e-6; u += 0.05) {
      const ok = free(wbox(wl, u, u + 0.05, 0, d1, y0, y1), flat);
      if (ok && s === null) s = u;
      if ((!ok || u + 0.05 > wl.L - m1) && s !== null) { const e = ok ? Math.min(wl.L - m1, u + 0.05) : u; if (e - s > 0.2) out.push([s, e]); s = null; }
    }
    return out;
  }

  // ───────── модели ─────────
  const bboxes = new Map();
  function bboxOf(slug, name) {
    const key = `${slug}/${name}`;
    if (bboxes.has(key)) return bboxes.get(key);
    const o = assets.getSync(slug, name);
    let b = null;
    if (o) {
      o.updateMatrixWorld(true);
      const bx = new THREE.Box3().setFromObject(o), k = unitOf(slug, name);
      b = { x0: bx.min.x * k, x1: bx.max.x * k, y0: bx.min.y * k, y1: bx.max.y * k, z0: bx.min.z * k, z1: bx.max.z * k };
    }
    bboxes.set(key, b);
    return b;
  }
  // кутията на модел след мащаб (число или [sx, sy, sz]) и завъртане rot около Y
  function lbox(slug, name, s = 1, rot = 0) {
    const b = bboxOf(slug, name); if (!b) return null;
    const [sx, sy, sz] = typeof s === 'number' ? [s, s, s] : s;
    const c = Math.cos(rot), sn = Math.sin(rot);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
      const rx = x * sx * c + z * sz * sn, rz = -x * sx * sn + z * sz * c;
      x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
    }
    return { x0, x1, z0, z1, y0: b.y0 * sy, y1: b.y1 * sy, w: x1 - x0, h: (b.y1 - b.y0) * sy, d: z1 - z0 };
  }
  const buckets = {};      // име → списък копия, които после се сливат
  const spent = {};        // име → триъгълници дотук (за да спрем навреме в големите зали)
  const LAB_TRIS = 8200, SHOP_TRIS = 5000;
  let modelCount = 0;
  let band = BAND;         // колко навътре от стената може да стои нещо на пода (на ниво 1 е ивицата до игралната зона)
  function raw(bucket, slug, name) {
    const o = assets.getSync(slug, name); if (!o) return null;
    fixMaterials(assets, o, slug, name);
    (buckets[bucket] ||= []).push(o); modelCount++;
    spent[bucket] = (spent[bucket] || 0) + (assets.info(slug, name)?.tris || 0);
    return o;
  }
  function spawn(bucket, slug, name, x, y, z, yaw = 0, s = 1) {
    const o = raw(bucket, slug, name); if (!o) return null;
    const u = unitOf(slug, name);
    o.position.set(x, y, z); o.rotation.y = yaw;
    if (typeof s === 'number') o.scale.setScalar(s * u); else o.scale.set(s[0] * u, s[1] * u, s[2] * u);
    return o;
  }
  /**
   * Слага модел така, че средата на основата му е на (o.x, o.z), а дъното на o.y.
   * o.fit = [ширина по X, ширина по Z, височина] в света (разтяга), o.s / o.sx / o.sy / o.sz = мащаб, o.yaw.
   */
  function put(bucket, m, o) {
    if (!m) return null;
    const [slug, name] = m, b = bboxOf(slug, name); if (!b) return null;
    let sx = o.sx ?? o.s ?? 1, sy = o.sy ?? o.s ?? 1, sz = o.sz ?? o.s ?? 1;
    const yaw = o.yaw || 0, odd = Math.abs(Math.round(yaw / (Math.PI / 2))) % 2 === 1;
    const bw = b.x1 - b.x0, bd = b.z1 - b.z0, bh = b.y1 - b.y0;
    if (o.fit) {
      const [wx, wz, hy] = o.fit;
      if (odd) { if (wz) sx = wz / bw; if (wx) sz = wx / bd; } else { if (wx) sx = wx / bw; if (wz) sz = wz / bd; }
      if (hy) sy = hy / bh;
    }
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const lx = (b.x0 + b.x1) / 2 * sx, lz = (b.z0 + b.z1) / 2 * sz;
    const obj = raw(bucket, slug, name); if (!obj) return null;
    const y = (o.y || 0) - b.y0 * sy;
    obj.position.set(o.x - (lx * c + lz * s), y, o.z - (-lx * s + lz * c));
    obj.rotation.y = yaw; const u = unitOf(slug, name); obj.scale.set(sx * u, sy * u, sz * u);
    return { obj, h: bh * sy, top: y + b.y1 * sy };
  }
  // модул от City Pack по началото му (долният ляв ъгъл на лицето); лицето гледа към yaw
  function module(bucket, m, x, y, z, yaw) {
    const o = raw(bucket, m[0], m[1]); if (!o) return null;
    o.position.set(x, y, z); o.rotation.y = yaw; o.scale.setScalar(unitOf(m[0], m[1]));
    return o;
  }
  /**
   * До стена: средата на модела е на u по стената, гърбът му е на gap от нея, дъното му на височина y.
   * def: { m, s, rot, fitW, fitH, fitD } смалява целия модел, за да се побере; def.box = [ш, в, д] го разтяга точно до тези размери.
   * Връща кутията му или null, ако няма място.
   */
  function mount(bucket, wl, def, u, y, o = {}) {
    const [slug, name] = def.m;
    let s = def.s || 1;
    let b = lbox(slug, name, s, def.rot || 0); if (!b) return null;
    if (def.box) {
      const r0 = lbox(slug, name, 1, 0), odd = Math.abs(Math.round((def.rot || 0) / (Math.PI / 2))) % 2 === 1;
      s = odd ? [def.box[2] / r0.w, def.box[1] / r0.h, def.box[0] / r0.d] : [def.box[0] / r0.w, def.box[1] / r0.h, def.box[2] / r0.d];
      b = lbox(slug, name, s, def.rot || 0);
    }
    let k = 1;
    if (def.fitW) k = Math.min(k, def.fitW / b.w);
    if (def.fitH) k = Math.min(k, def.fitH / b.h);
    if (def.fitD) k = Math.min(k, def.fitD / b.d);
    if (k < 1) { s = typeof s === 'number' ? s * k : s.map(v => v * k); b = lbox(slug, name, s, def.rot || 0); }
    const gap = o.gap ?? 0.012;
    if (y < 1.9 && gap + b.d > band + 1e-3) return null;
    const a = wbox(wl, u - b.w / 2, u + b.w / 2, gap, gap + b.d, y, y + b.h);
    if (u - b.w / 2 < -1e-3 || u + b.w / 2 > wl.L + 1e-3) return null;
    if (!o.force && !free(a, b.d + gap <= 0.09)) return null;
    const p = wpos(wl, u - (b.x0 + b.x1) / 2, gap - b.z0);
    const obj = spawn(bucket, slug, name, p[0], y - b.y0, p[1], wl.yaw + (def.rot || 0), s);
    if (!obj) return null;
    placed.push(a);
    a.w = b.w; a.h = b.h; a.top = y + b.h; a.u = u; a.depth = gap + b.d; a.name = name;
    return a;
  }

  // ───────── кои модели трябват ─────────
  const SH = n => [SHOPS, `SM_${n}`], CI = n => [CITY, `SM_${n}`], GW = n => [GANG, `SM_${n}`], KD = n => [KIDS, `SM_${n}`];
  const seq = (stem, from, to) => { const out = []; for (let i = from; i <= to; i++) out.push(`${stem}${String(i).padStart(2, '0')}`); return out; };
  const LIST = {
    // щандът
    products: seq('Prop_Product_', 1, 24).map(SH),
    presets: seq('Prop_Product_Preset_', 1, 12).map(SH),
    boxes: ['Prop_Warehouse_Cardboard_Box_01', 'Prop_Warehouse_Cardboard_Box_02', 'Prop_Warehouse_Cardboard_Box_03', 'Prop_Cardboard_Box_01', 'Prop_Cardboard_Box_02'].map(SH),
    posters: seq('Prop_Poster_', 2, 12).map(SH),
    menu: SH('Prop_Kitchen_Menu_Screen_01'),
    lightBar: SH('Prop_Lighting_Ceiling_Bar_02'),
    fan: SH('Prop_CeilingFan_01'),
    hood: SH('Prop_Kitchen_Extractor_01'),
    neon: SH('Sign_Neon_Open_03'), burgerText: SH('Sign_3dText_Burger_01'),
    floorBig: ['Prop_Market_Wall_Fridge_01_Preset_01', 'Prop_Market_Wall_Fridge_02_Preset_01'].map(SH),
    floorSmall: ['Prop_Rubbish_Bin_01', 'Prop_Cafe_Bin_01'].map(SH),
    // улицата
    sidewalk: CI('Env_Sidewalk_Straight_01'), corner: CI('Env_Sidewalk_Corner_01'),
    road: CI('Env_Road_01'), roadBare: CI('Env_Road_Bare_01'), crossing: CI('Env_Road_Crossing_01'),
    shopsA: ['Bld_Shop_01', 'Bld_Shop_02', 'Bld_Shop_04', 'Bld_Shop_06', 'Bld_Shop_05'].map(CI),
    shopWide: CI('Bld_Shop_03'),
    apt: [CI('Bld_Apartment_01'), CI('Bld_Apartment_03')], aptRoof: [CI('Bld_Apartment_Roof_01'), CI('Bld_Apartment_Roof_03')],
    office: CI('Bld_OfficeOld_Small_02'),
    lamp: CI('Prop_LightPole_Base_01'), lamp2: CI('Prop_LightPole_Base_02'),
    traffic: CI('Prop_TrafficLight_02'),
    cars: [CI('Veh_Car_Sedan_01'), CI('Veh_Car_Small_01')],
    trees: [CI('Env_Tree_03'), CI('Env_Tree_01')],
    hydrant: CI('Prop_Hydrant_01'), bin: CI('Prop_Trashbin_02'), mailbox: CI('Prop_Mailbox_01'), bench: CI('Prop_ParkBench_01'),
    busStop: CI('Prop_BusStop_01'), planter: CI('Prop_Planter_01'), windowBox: [CI('Prop_PlanterWindow_02')],
    // задната стая (нощната тема)
    freezer: SH('Prop_Market_Freezer_01'),
    barrels: [GW('Prop_Barrel_Plastic_01'), GW('Prop_Barrel_Metal_01'), GW('Prop_Barrel_Plastic_02')],
    propane: GW('Prop_Propane_Tall_01'), cabinets: GW('Prop_Cabinets_01'), tank: GW('Prop_Lab_Tank_02'), shelfPreset: GW('Prop_Shelf_Preset_01'),
    cbox: [GW('Prop_CardboardBox_01'), GW('Prop_CardboardBox_02'), GW('Prop_CardboardBox_03')],
    chem: ['Prop_Chemical_01', 'Prop_Chemical_03', 'Prop_Chemical_04', 'Prop_Chemical_05', 'Prop_Container_01', 'Prop_Container_02', 'Prop_Container_03'].map(GW),
    labSigns: ['Prop_Sign_Danger_01', 'Prop_Sign_KeepOut_01', 'Prop_Sign_Caution_01'].map(GW),
    vent: GW('Prop_Warehouse_Venting_01'), lampHang: GW('Prop_Warehouse_Light_01'),
    // подземната лаборатория (нощната тема)
    plants: [SH('Env_Plant_04'), SH('Env_Plant_03')], panel: GW('Prop_Lab_MachinePanel_02'), panelWall: GW('Prop_Lab_MachinePanel_01'), officeShelf: GW('Prop_Office_Shelf_01'),
    desk: GW('Prop_Office_Desk_01'), safe: GW('Prop_Safe_01'), money: [GW('Prop_Money_Stack_01'), GW('Prop_Money_Stack_03')], monitors: GW('Prop_Security_Monitors_01'),
    tube: GW('Prop_Warehouse_WallLight_01'),
    roofSigns: (kids ? ['Prop_LargeSign_Donut_01', 'Prop_LargeSign_Icecream_01'] : ['Prop_LargeSign_Pizza_01', 'Prop_LargeSign_Coffee_01']).map(CI),
    // детската тема: тайният лаб за бонбони
    ...(kids ? {
      kLocker: KD('Prop_Locker_01'), kLocker2: KD('Prop_Locker_02'), kRocket: KD('Prop_Cardboard_Rocket_01'),
      kPresent: [KD('Prop_Xmas_Present_01'), KD('Prop_Xmas_Present_02')], kTelescope: KD('Prop_Telescope_01'), kHorse: KD('Veh_Rocking_Horse_01'),
      kTree: KD('Prop_Cardboard_Tree_01'), kBoard: KD('Prop_Blackboard_01'),
      kPlush: ['Prop_Plush_Bear_01', 'Prop_Plush_Unicorn_01'].map(KD),
      kToys: ['Prop_Toy_Rocket_01', 'Prop_Toy_Duck_01', 'Prop_Ball_01', 'Prop_Ball_02', 'Prop_Ball_04', 'Prop_Xmas_Present_02', 'Prop_Xmas_Present_01', 'Prop_Firework_01'].map(KD),
      gumball: SH('Prop_Gumball_Machine_01'), sweets: ['Prop_Food_Donut_01', 'Prop_Food_Donut_02', 'Prop_Food_Cupcake_01'].map(SH),
      kLamp: SH('Prop_Lighting_Ceiling_Shaded_03'),
    } : {}),
  };
  if (theme === 'kids') for (const k of Object.keys(LIST)) { const v = LIST[k]; if ((typeof v[0] === 'string' ? [v] : v).some(m => m[0] === GANG)) LIST[k] = []; }      // детската тема не ползва този пакет
  // ниво 1: черупката е една и съща в двете теми (Gang Warfare Pack), мебелите са по тема
  const LABM = {
    wall: GW('Bld_Wall_Brick_01'), half: GW('Bld_Wall_Brick_Half_01'), floor: GW('Bld_Floor_01'), drain: GW('Bld_Floor_Drain_01'),
    ceil: GW('Bld_Ceiling_01'), lamp: GW('Bld_Ceiling_Light_01'), tube: GW('Prop_Light_01'), bulb: GW('Prop_Warehouse_Light_03'), pipe: GW('Bld_Piping_01'),
    ...(kids ? {} : {
      firehose: GW('Prop_Warehouse_Firehose_01'), powerBox: GW('Prop_Warehouse_PowerBox_01'),
      barrels: [GW('Prop_Barrel_Metal_01')],
      cbox: [GW('Prop_CardboardBox_01'), GW('Prop_CardboardBox_02'), GW('Prop_CardboardBox_03')],
      socket: GW('Prop_Warehouse_Wall_Socket_01'), wallSwitch: GW('Prop_Warehouse_Wall_Switch_01'),
      vent: GW('Prop_AirVent_01'), ladder: GW('Prop_Ladder_01'), bucket: GW('Prop_Bucket_01'), extinguisher: GW('Prop_Fire_Extinguisher_01'),
    }),
  };
  // мазето под пицарията (ниво 1): каквото има в един склад за продукти; колбасите по куките са от Military Pack
  const MIL = 'military-pack';
  const CEL = {
    wood: [SH('Gen_Prop_Barrel_Wood_01'), SH('Gen_Prop_Barrel_Wood_02'), SH('Gen_Prop_Barrel_Wood_03')],
    sackStack: SH('Gen_Prop_Sack_Stack_02'), sack: [SH('Gen_Prop_Sack_01'), SH('Gen_Prop_Sack_02')], shelf3: SH('Gen_Prop_Shelf_03'), mop: SH('Prop_Mop_Bucket_01'),
    hook: SH('Gen_Prop_Hook_01'), sausage: [[MIL, 'SM_Prop_Meat_Sausage_02'], [MIL, 'SM_Prop_Meat_Sausage_01']], sausages: [MIL, 'SM_Prop_Meat_Sausages_01'], duct: SH('Prop_AirDuct_01'), freezer: SH('Prop_Market_Freezer_03'),
  };
  // ниво 0 в готовата карта: кухнята на пицарията, от модулите, с които е построена и самата карта
  const PLZ = 'shopping-plaza-map';
  const KITM = plaza ? {
    wall: SH('Bld_Base_Wall_01'), slab: SH('Bld_Base_Floor_Combined_01'),
    shelf: SH('Gen_Prop_Shelf_01'), pot: SH('Prop_Kitchen_Pot_01'), pan: SH('Prop_Kitchen_Pan_01'),
    sign: SH('Sign_3dText_Pizza_01'), clock: SH('Gen_Prop_Clock_01'),
    sacks: [SH('Gen_Prop_Sack_Stack_01'), SH('Gen_Prop_Sack_Stack_02')], sack: [SH('Gen_Prop_Sack_01'), SH('Gen_Prop_Sack_02')],
    crate: SH('Gen_Prop_Crate_01'), barrel: SH('Gen_Prop_Barrel_Wood_01'), mop: SH('Prop_Mop_Bucket_01'), cbox: SH('Gen_Prop_Cardboard_Box_Preset_01'),
    fridge: SH('Prop_Market_Wall_Fridge_01'), box: [PLZ, 'SM_Prop_Pizza_Box_01'],
  } : {};
  const need = [];
  for (const v of Object.values(LABM)) { if (typeof v[0] === 'string') need.push(v); else need.push(...v); }
  for (const v of Object.values(KITM)) { if (typeof v[0] === 'string') need.push(v); else need.push(...v); }
  for (const v of Object.values(CEL)) { if (typeof v[0] === 'string') need.push(v); else need.push(...v); }
  if (plaza) for (const k of Object.keys(LIST)) { const v = LIST[k]; if (v.length && (typeof v[0] === 'string' ? [v] : v).every(m => m[0] === CITY)) LIST[k] = []; }
  for (const v of Object.values(LIST)) { if (!v.length) continue; if (typeof v[0] === 'string') need.push(v); else need.push(...v); }
  await Promise.all([...new Set(need.map(m => m[0]))].map(s => assets.loadPack(s).catch(() => null)));
  const PIER = GW('Bld_Wall_Beam_01');      // the brick pier that stands over every real obstacle of the room
  need.push(PIER);
  await assets.preload(need.filter(m => assets.has(m[0], m[1])));

  // ───────── черупката на залата (отвътре): една геометрия, осветява я сцената ─────────
  // Задната стая е тъмна, с петно светлина под единствената лампа: изпича се в цветовете (и на черупката, и на предметите).
  // складът в сбития план: стая „b" без кабината на асансьора
  const stor = (() => {
    if (!RB) return null;
    let x0 = bx0, x1 = bx1, z0 = bz0, z1 = bz1;
    const e = start.elevator;
    if (e && e.room === RB.id && !e.whole) {
      if (e.d < RB.d - 0.2) { if (e.z < RB.z) z0 = e.z + e.d / 2; else z1 = e.z - e.d / 2; }
      else if (e.w < RB.w - 0.2) { if (e.x < RB.x) x0 = e.x + e.w / 2; else x1 = e.x - e.w / 2; }
    }
    return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  })();
  const labLamp = stor ? [stor.cx, 2.0, stor.cz] : [-hw * 0.3, 2.0, -hd * 0.42];
  const labLight = (x, y, z) => {
    const dx = x - labLamp[0], dy = (y - labLamp[1]) * 0.75, dz = z - labLamp[2];
    return (theme === 'kids' ? 0.62 : 0.36) + (theme === 'kids' ? 0.6 : 1.1) / (1 + (dx * dx + dy * dy + dz * dz) / 2.4);
  };
  const shadeIn = (x, y, z, n, base, A, B) => {
    let f;
    if (n[1] > 0.5) { const zz = Math.abs(z), e = !compact ? Math.min(hw - Math.abs(x), hd - zz, zz) : inB(x, z, -0.02) ? Math.min(x - bx0, bx1 - x, z - bz0, bz1 - z) : Math.min(hw - Math.abs(x), hd - zz); f = y > 0.05 ? 1 : 0.72 + 0.28 * Math.min(1, Math.max(0, e) / 0.7); }
    else if (n[1] < -0.5) f = 0.94;
    else { const q = y / CEIL_H; f = 1 - 0.20 * q * q - (y < 0.02 ? 0.12 : 0); }
    if (compact ? inB(x + n[0] * 0.03, z + n[2] * 0.03, -0.02) : (z < -0.001 && Math.abs(x) <= hw + 0.01 && z >= -hd - 0.01)) f *= labLight(x, y, z); else f *= 1.22;
    A[0] = B[0] = base[0] * f; A[1] = B[1] = base[1] * f; A[2] = B[2] = base[2] * f;
  };
  const MI = makeMesher(shadeIn);
  const FY = 0.004;        // подът е на косъм над нулата (ако сцената има свой под, да не трепти)
  const up = [0, 1, 0];
  const labHiT = kids ? T_STARS : T_GRIME, labHiS = kids ? 0.9 : 1.3;
  if (plaza) {
    // играчът работи вътре в сграда от готовата карта (пицарията): стените, подът, таванът и кухнята са нейните
  } else if (compact) {
    const band = (o, eu, L, a, b, tile, ts, col, k) => { if (L > 1e-3 && b - a > 1e-3) MI.rect([o[0], a, o[2]], eu, up, L, b - a, tile, ts, col, k); };
    const shopBands = (o, eu, L, y0 = 0, y1 = CEIL_H) => {
      const cut = (a, b, tile, ts, col) => band(o, eu, L, Math.max(a, y0), Math.min(b, y1), tile, ts, col);
      cut(0, 0.1, T_FLAT, 1.2, PAL.shopBase); cut(0.1, 1.2, T_TILE, 0.6, PAL.shopTile); cut(1.2, 1.26, T_FLAT, 1.2, PAL.shopTrim); cut(1.26, CEIL_H, T_PLASTER, 1.2, PAL.shopWall);
    };
    const labBands = (o, eu, L, y0 = 0, y1 = CEIL_H) => {
      const cut = (a, b, tile, ts, col, k) => band(o, eu, L, Math.max(a, y0), Math.min(b, y1), tile, ts, col, k);
      cut(0, 0.1, T_FLAT, 0.6, PAL.labBase); cut(0.1, 1.5, kids ? T_STRIPE : T_BRICK, kids ? 0.6 : 0.5, PAL.labWall); cut(1.5, CEIL_H, labHiT, labHiS, PAL.labWallHi, 2);
    };
    // стена с отвора между стаите: парчетата отстрани и над него
    const wallWithGate = (wl, bands) => {
      if (wl.L < 0.05) return;
      const at = u => { const q = wpos(wl, u, 0); return [q[0], 0, q[1]]; }, eu = [wl.t[0], 0, wl.t[1]], g = gateOn(wl);
      if (!g) return bands(at(0), eu, wl.L);
      bands(at(0), eu, g[0]); bands(at(g[1]), eu, wl.L - g[1]); bands(at(g[0]), eu, g[1] - g[0], GATE_H);
    };
    // стая „а": целият под е на щанда
    MI.rect([-hw, FY, hd], [1, 0, 0], [0, 0, -1], W, D, T_CHECK, 0.9, PAL.shopFloor);
    wallWithGate(walls.shopL, shopBands);                 // лявата стена: глуха, към съседа
    wallWithGate(walls.shopB, shopBands);                 // задната: пред нея е релефът с хладилниците
    if (gateOn(walls.shopR)) wallWithGate(walls.shopR, shopBands);
    else {                                                // дясно: нисък парапет с перваз, над него е отворено до openTop, после греда
      shopBands([hw, 0, -hd], [0, 0, 1], D, 0, LOW);
      MI.rect([hw, openTop, -hd], [0, 0, 1], up, D, CEIL_H - openTop, T_PLASTER, 1.2, PAL.header);
      MI.box(hw - 0.05, LOW, -hd, hw + OUT_T + 0.08, LOW + 0.05, hd, T_WOOD, 1.2, PAL.sill, 'xyY');
      MI.rect([hw, openTop, -hd], [1, 0, 0], [0, 0, 1], OUT_T, D, T_FLAT, 0, PAL.shopBase);
      MI.box(hw, 0, hd - 0.02, hw + OUT_T, CEIL_H, hd + OUT_T, T_FLAT, 0, PAL.header, 'xz');
      MI.box(hw, LOW, -hd - OUT_T, hw + OUT_T, openTop, -hd + 0.12, T_FLAT, 0, PAL.header, 'xZ');
    }
    // над тезгяха, отвътре
    MI.rect([hw, openTop, hd], [-1, 0, 0], up, W, CEIL_H - openTop, T_PLASTER, 1.2, PAL.header);
    MI.rect([-hw, openTop, hd], [1, 0, 0], [0, 0, 1], W, OUT_T, T_FLAT, 0, PAL.shopBase);
    if (!opts.open) MI.rect([-hw, CEIL_H, -hd], [1, 0, 0], [0, 0, 1], W, D, T_CEIL, 0.6, PAL.shopCeil);
    // стая „b": складът. Бетонен под, тухла, метален таван; прагът в отвора е метална лента
    if (RB) {
      MI.rect([bx0, FY, bz1], [1, 0, 0], [0, 0, -1], RB.w, RB.d, kids ? T_WOOD : T_CONCRETE, kids ? 1.2 : 1.6, PAL.labFloor, 2);
      for (const wl of [walls.labL, walls.labR, walls.labB, walls.labF]) wallWithGate(wl, labBands);
      if (!opts.open) MI.rect([bx0, CEIL_H, bz0], [1, 0, 0], [0, 0, 1], RB.w, RB.d, kids ? T_STARS : T_METAL, kids ? 1.2 : 0.8, PAL.labCeil);
      if (GATE) {
        const h = GATE.w / 2;
        if (GATE.axis === 'x') MI.rect([GATE.x - h, FY + 0.002, GATE.z + 0.06], [1, 0, 0], [0, 0, -1], GATE.w, 0.12, T_FLAT, 0, PAL.threshold);
        else MI.rect([GATE.x - 0.06, FY + 0.002, GATE.z + h], [1, 0, 0], [0, 0, -1], 0.12, GATE.w, T_FLAT, 0, PAL.threshold);
      }
    }
  } else {
    // подове
    MI.rect([-hw, FY, hd], [1, 0, 0], [0, 0, -1], W, hd - T2, T_CHECK, 0.9, PAL.shopFloor);
    MI.rect([-hw, FY, T2], [1, 0, 0], [0, 0, -1], W, wallT, T_FLAT, 0, PAL.threshold);
    MI.rect([-hw, FY, -T2], [1, 0, 0], [0, 0, -1], W, hd - T2, kids ? T_WOOD : T_CONCRETE, kids ? 1.2 : 1.6, PAL.labFloor, 2);
    // стена на щанда на ленти: цокъл, фаянс, кант, боя (от y0 до y1)
    const shopWall = (o, eu, L, y0 = 0, y1 = CEIL_H) => {
      const band = (a, b, tile, ts, col) => { const lo = Math.max(a, y0), hi = Math.min(b, y1); if (hi > lo) MI.rect([o[0], lo, o[2]], eu, up, L, hi - lo, tile, ts, col); };
      band(0, 0.1, T_FLAT, 1.2, PAL.shopBase); band(0.1, 1.2, T_TILE, 0.6, PAL.shopTile); band(1.2, 1.26, T_FLAT, 1.2, PAL.shopTrim); band(1.26, CEIL_H, T_PLASTER, 1.2, PAL.shopWall);
    };
    const labWall = (o, eu, L) => {
      const band = (a, b, tile, ts, col) => MI.rect([o[0], a, o[2]], eu, up, L, b - a, tile, ts, col);
      band(0, 0.1, T_FLAT, 0.6, PAL.labBase); band(0.1, 1.5, kids ? T_STRIPE : T_BRICK, kids ? 0.6 : 0.5, PAL.labWall); MI.rect([o[0], 1.5, o[2]], eu, up, L, CEIL_H - 1.5, labHiT, labHiS, PAL.labWallHi, 2);
    };
    shopWall([-hw, 0, hd], [0, 0, -1], hd - T2);              // лява стена на щанда: глуха, към съседа
    // дясно: нисък парапет с перваз, над него е отворено до openTop, после греда
    shopWall([hw, 0, T2], [0, 0, 1], hd - T2, 0, LOW);
    MI.rect([hw, openTop, T2], [0, 0, 1], up, hd - T2, CEIL_H - openTop, T_PLASTER, 1.2, PAL.header);
    MI.box(hw - 0.05, LOW, T2, hw + OUT_T + 0.08, LOW + 0.05, hd, T_WOOD, 1.2, PAL.sill, 'xyY');                 // перваз
    MI.rect([hw, openTop, T2], [1, 0, 0], [0, 0, 1], OUT_T, hd - T2, T_FLAT, 0, PAL.shopBase);                    // долната страна на гредата
    MI.box(hw, 0, hd - 0.02, hw + OUT_T, CEIL_H, hd + OUT_T, T_FLAT, 0, PAL.header, 'xz');                        // ъгловата колона (отвътре)
    MI.box(hw, LOW, -T2, hw + OUT_T, openTop, T2 + 0.12, T_FLAT, 0, PAL.header, 'xZ');                            // колоната при преградата
    // задната стая: без прозорци
    labWall([-hw, 0, -T2], [0, 0, -1], hd - T2);
    labWall([hw, 0, -hd], [0, 0, 1], hd - T2);
    labWall([-hw, 0, -hd], [1, 0, 0], W);
    // над преградата (тя е висока само wallH), откъм задната стая; откъм щанда я покриват хладилниците
    // преградата откъм склада (двете ѝ лица ги рисува обстановката): от двете страни на вратата и над нея
    labWall([hw, 0, -T2], [-1, 0, 0], hw - doorW / 2);
    labWall([-doorW / 2, 0, -T2], [-1, 0, 0], hw - doorW / 2);
    if (wallH < CEIL_H - 0.01) {
      MI.rect([doorW / 2, wallH, -T2], [-1, 0, 0], up, doorW, CEIL_H - wallH, labHiT, labHiS, PAL.labWallHi);
      MI.rect([-0.75, wallH, -T2], [1, 0, 0], [0, 0, 1], 1.5, wallT, T_FLAT, 0, PAL.threshold);                    // долната страна над вратата
    }
    // над тезгяха, отвътре
    MI.rect([hw, openTop, hd], [-1, 0, 0], up, W, CEIL_H - openTop, T_PLASTER, 1.2, PAL.header);
    MI.rect([-hw, openTop, hd], [1, 0, 0], [0, 0, 1], W, OUT_T, T_FLAT, 0, PAL.shopBase);
    if (!opts.open) {
      MI.rect([-hw, CEIL_H, T2], [1, 0, 0], [0, 0, 1], W, hd - T2, T_CEIL, 0.6, PAL.shopCeil);
      MI.rect([-hw, CEIL_H, -hd], [1, 0, 0], [0, 0, 1], W, hd - T2, kids ? T_STARS : T_METAL, kids ? 1.2 : 0.8, PAL.labCeil);
    }
  }

  // ───────── стената с хладилниците (преградата откъм щанда): плитък релеф зад станциите ─────────
  // Вратата към задната стая е една от тях (модела ѝ го прави друга сесия): тук отворът само се рамкира.
  if (!plaza) {
    const z0 = zS, zf = zS + 0.035, top = CEIL_H;          // лицето на вратите е 3.5 см пред стената
    const steel = PAL.steel, dark = PAL.steelDark;
    const unit = (x0, x1, freezer) => {
      const w = x1 - x0, split = freezer ? 0.86 : 1.22;    // къде се делят двете врати
      MI.box(x0, 0, z0, x1, 0.12, zf, T_FLAT, 0, dark, 'Z');                                       // цокъл
      MI.box(x0 + 0.015, 0.12, z0, x1 - 0.015, 2.04, zf, T_FLAT, 0, steel, 'xXZ');                 // двете врати
      MI.rect([x0, 2.04, zf], [1, 0, 0], up, w, top - 2.04, T_METAL, 0.4, dark);                   // решетката на агрегата
      MI.box(x0, 0.12, z0, x0 + 0.015, 2.04, zf - 0.01, T_FLAT, 0, dark, 'Z');                     // фуга между корпусите
      MI.box(x0 + 0.015, split - 0.012, z0, x1 - 0.015, split + 0.012, zf + 0.004, T_FLAT, 0, dark, 'Z');
      const hx = x1 - 0.09;                                                                        // дръжки: отвесни пръти
      MI.box(hx, split + 0.14, zf, hx + 0.03, Math.min(2.0, split + 0.62), zf + 0.035, T_FLAT, 0, dark, 'xXZyY');
      MI.box(hx, Math.max(0.2, split - 0.52), zf, hx + 0.03, split - 0.12, zf + 0.035, T_FLAT, 0, dark, 'xXZyY');
      // табло с температурата: малко светещо прозорче
      MI.box(x0 + 0.08, 2.12, zf, x0 + 0.08 + Math.min(0.22, w * 0.4), 2.2, zf + 0.012, T_FLAT, 0, [0.05, 0.05, 0.06], 'Z');
      MI.glow(x0 + 0.10, 2.14, zf + 0.012, x0 + 0.10 + Math.min(0.12, w * 0.25), 2.18, zf + 0.014, freezer ? G_CYAN : G_GREEN, 'Z');
    };
    const row = (xa, xb) => {
      if (xb - xa < 0.25) return;
      const n = Math.max(1, Math.round((xb - xa) / 0.72)), w = (xb - xa) / n;
      for (let i = 0; i < n; i++) unit(xa + i * w, xa + (i + 1) * w, i % 3 === 1);
    };
    const gB = compact ? gateOn(walls.shopB) : [hw - doorW / 2, hw + doorW / 2];      // отворът по тази стена (u от левия ъгъл)
    if (gB) {
      const da = -hw + gB[0], db = -hw + gB[1], dm = (da + db) / 2;
      row(-hw, da - 0.1); row(db + 0.1, hw);
      // рамката на вратата: дебела стоманена каса и агрегат над нея
      MI.box(da - 0.1, 0, z0, da, 2.06, zf + 0.05, T_FLAT, 0, dark, 'xXZ');
      MI.box(db, 0, z0, db + 0.1, 2.06, zf + 0.05, T_FLAT, 0, dark, 'xXZ');
      MI.box(da - 0.1, wallH, z0, db + 0.1, wallH + 0.1, zf + 0.05, T_FLAT, 0, dark, 'xXZyY');
      MI.rect([da - 0.1, wallH + 0.1, zf], [1, 0, 0], up, db - da + 0.2, top - wallH - 0.1, T_METAL, 0.4, steel);
      MI.glow(dm - 0.13, wallH + 0.32, zf, dm + 0.13, wallH + 0.37, zf + 0.015, G_CYAN, 'Z');                  // синята лента над „хладилната камера"
    } else row(-hw, hw);
    placed.push({ x0: -hw, x1: hw, z0: zS, z1: zS + 0.09, y0: 0, y1: CEIL_H });
  }

  // ───────── щандът: малко, едри и на място ─────────
  let MS = MI;             // в кой строител отиват рафтовете (сменя се за ниво 1)
  // рафт на стената с подредена стока (big: кашони)
  function shelf(wl, u0, u1, y, depth = 0.26, big = false, items = null, bucket = 'shop', col = PAL.shelf) {
    const a = wbox(wl, u0, u1, 0, depth, y - 0.06, y + (big ? 0.46 : 0.36));
    if (u0 < 0 || u1 > wl.L || !free(a)) return false;
    placed.push(a);
    const b = wbox(wl, u0, u1, 0, depth, y - 0.035, y);
    MS.box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, T_WOOD, 1.2, col);
    for (const uu of [u0 + 0.14, u1 - 0.14]) {            // конзоли
      const c = wbox(wl, uu - 0.015, uu + 0.015, 0, depth * 0.8, y - 0.16, y - 0.035);
      MS.box(c.x0, c.y0, c.z0, c.x1, c.y1, c.z1, T_FLAT, 0, PAL.shopBase, 'xXzZy');
    }
    let u = u0 + 0.06;
    const cap = bucket === 'shop' ? SHOP_TRIS : LAB_TRIS;
    while (u < u1 - 0.12 && (spent[bucket] || 0) < cap) {
      const m = items ? pick(items) : big ? pick(LIST.boxes) : (rnd() < 0.3 ? pick(LIST.presets) : pick(LIST.products));
      const r0 = m && lbox(m[0], m[1]); if (!r0) { u += 0.1; continue; }
      const s = Math.min(1, (big ? 0.42 : 0.30) / r0.h, (big ? 0.6 : 0.5) / r0.w, (depth - 0.03) / r0.d) * (r0.h < 0.12 ? Math.min(1.6, 0.14 / r0.h) : 1);
      const b2 = lbox(m[0], m[1], s);
      if (u + b2.w > u1 - 0.05) break;
      const p = wpos(wl, u + b2.w / 2 - (b2.x0 + b2.x1) / 2, depth / 2 - (b2.z0 + b2.z1) / 2);
      spawn(bucket, m[0], m[1], p[0], y - b2.y0, p[1], wl.yaw + (items ? (rnd() - 0.5) * 0.5 : 0), s);
      u += b2.w + 0.03 + rnd() * 0.05;
    }
    return true;
  }
  if (!plaza) {
    const L = walls.shopL, B = walls.shopB, F = walls.shopF, R = walls.shopR;
    // пода, където има място (в големите зали): хладилна витрина, кош. Само до лявата стена.
    for (const [a, b] of runs(L, BAND, 0, 1.2, false, 0.5, 0.5)) {
      let u = a + 0.04;
      while (u < b - 0.4) {
        const room = b - u, big = room > 1.1, m = big ? pick(LIST.floorBig) : pick(LIST.floorSmall);
        const def = big ? { m, fitD: BAND - 0.03, fitH: 2.0, fitW: Math.min(room - 0.05, 1.5) } : { m, fitD: BAND - 0.03, fitW: 0.5, fitH: 0.95 };
        const bb = lbox(m[0], m[1]); if (!bb) break;
        const k = Math.min(1, def.fitD / bb.d, def.fitW / bb.w, def.fitH / bb.h);
        const got = k > 0.4 ? mount('shop', L, def, u + bb.w * k / 2, FY) : null;
        u += got ? got.w + 0.1 : 0.3;
      }
    }
    // абсорбатор над скарата и над фритюрника (само на стена; над парапета отдясно няма на какво да виси)
    for (const s of [...(byKind.grill || []), ...(byKind.fryer || [])]) {
      const wl = [L, B].find(q => Math.abs((s.x - q.P0[0]) * q.n[0] + (s.z - q.P0[1]) * q.n[1]) < 0.6);
      if (!wl) continue;
      const u = (s.x - wl.P0[0]) * wl.t[0] + (s.z - wl.P0[1]) * wl.t[1];
      mount('shop', wl, { m: LIST.hood, fitW: Math.max(0.8, s.w + 0.3), fitD: 0.55 }, u, 1.92, { gap: wl === B ? 0.09 : 0.012, force: wl === B });
    }
    // лявата стена: рафт със стока и рафт с кашони под тавана
    for (const [y, big] of [[1.5, false], [2.3, true]]) {
      const items = !kids ? null : big ? [...LIST.kPresent, ...LIST.kToys, LIST.kPlush[0]] : [...LIST.products, ...LIST.sweets, ...LIST.kToys];
      for (const [a, b] of runs(L, 0.28, y - 0.06, y + (big ? 0.46 : 0.36), false, 0.5, 0.15)) if (b - a > 0.8) shelf(L, a, b, y, 0.26, big, items);      // до тезгяха остава място за менюто
    }
    // плакати по лявата стена, където остава място
    for (const [a, b] of runs(L, 0.06, 1.32, 2.15, true, 0.2, 0.2)) {
      let u = a + 0.08;
      while (u < b - 0.4) { const got = mount('shop', L, { m: pick(LIST.posters), fitH: 0.7, fitW: 0.55 }, u + 0.28, 1.36); u += got ? got.w + 0.18 : 0.3; }
    }
    // менюто над тезгяха
    {
      const r0 = lbox(...LIST.menu);
      if (r0) {
        const fitH = CEIL_H - openTop - 0.14, k = Math.min(1, fitH / r0.h), w1 = r0.w * k, room = hw - 1.86;      // свободното от всяка страна на таблото
        const n = Math.max(0, Math.min(2, Math.floor((room + 0.1) / (w1 + 0.12))));
        if (!n && room > 0.7) { mount('glow', F, { m: LIST.menu, fitH, fitW: room - 0.04 }, room / 2 + 0.03, openTop + 0.07); mount('glow', F, { m: LIST.menu, fitH, fitW: room - 0.04 }, W - room / 2 - 0.03, openTop + 0.07); }
        for (let i = 0; i < n; i++) { const u = 0.06 + (room / n) * (i + 0.5); mount('glow', F, { m: LIST.menu, fitH }, u, openTop + 0.07); mount('glow', F, { m: LIST.menu, fitH }, W - u, openTop + 0.07); }
      }
    }
    // неон „OPEN" на гредата над страничния отвор (гледа навътре)
    mount('neon', R, { m: LIST.neon, fitW: 1.0, fitH: 0.6 }, R.L * 0.5, openTop + 0.08, { force: true });
    // лампи на тавана (светят)
    const lb = lbox(...LIST.lightBar);
    if (lb && !opts.open) {
      const nx = Math.max(2, Math.round(W / 2.6));
      for (let i = 0; i < nx; i++) spawn('glow', ...LIST.lightBar, -hw + W * (i + 0.5) / nx, CEIL_H - lb.y1 * 0.8, zS + (hd - zS) * 0.52, Math.PI / 2, 0.8);
    }
    // цветя в сандъчета на перваза отдясно (извън залата)
    const n = Math.max(1, Math.floor((hd - 0.6) / 1.5));
    for (let i = 0; i < n; i++) put('city', LIST.windowBox[0], { x: hw + OUT_T + 0.14, z: zS + 0.4 + (hd - zS - 0.8) * (i + 0.5) / n, y: LOW - 0.3, yaw: Math.PI / 2, s: 0.9 });
  }

  // общо пълнене на пода покрай стените: нещата се редят едно след друго, докато има място и бюджет
  function fillFloor(wallList, items, bucket, top = 1.5) {
    let turn = 0;
    for (const wl of wallList) for (const [a, b] of runs(wl, BAND, 0, top, false, 0.08, 0.08)) {
      let u = a + 0.03, miss = 0;
      while (u < b - 0.4 && miss < items.length && (spent[bucket] || 0) < LAB_TRIS * 0.8) {
        const got = items[turn % items.length](wl, u, b - u); turn++;
        if (got) { u += got.w + 0.05 + rnd() * 0.08; miss = 0; } else miss++;
      }
    }
  }
  // нещо, сложено върху друго (пари върху касата, саксия върху шкафа)
  const onTop = (bucket, base, m, s, du = 0) => {
    if (!base) return;
    const b2 = lbox(m[0], m[1], s); if (!b2) return;
    const wl = base.wl, p = wpos(wl, base.u + du - (b2.x0 + b2.x1) / 2, base.depth / 2 - (b2.z0 + b2.z1) / 2);
    spawn(bucket, m[0], m[1], p[0], base.top - b2.y0, p[1], wl.yaw + (rnd() - 0.5) * 0.6, s);
  };
  const stackOf = (bucket, list, box, n) => (wl, u) => {       // колона от n еднакви кутии
    let y = FY, first = null;
    for (let i = 0; i < n; i++) { const got = mount(bucket, wl, { m: pick(list), box }, u + (i ? (rnd() - 0.5) * 0.04 : 0), y, { gap: 0.03 + rnd() * 0.02 }); if (!got) break; first ||= got; y = got.top; }
    return first;
  };
  const one = fn => { let used = false; return (wl, u, room) => { if (used) return null; const got = fn(wl, u, room); if (got) used = true; return got; }; };
  let lastMount = null;
  const M = (bucket, def, half, need) => (wl, u, room) => room > need && (lastMount = mount(bucket, wl, def, u + half, FY)) && Object.assign(lastMount, { wl });

  // ───────── ниво 0, зад хладилната врата: обикновен заден склад. Стелаж, кашони, варели, фризер, една висяща лампа ─────────
  if (!plaza) {
    const LF = walls.labF, LL = walls.labL, LB = walls.labB, LR = walls.labR, all = [LF, LB, LL, LR];
    if (!kids) {
      fillFloor(all, [
        M('lab', { m: LIST.freezer, box: [1.45, 0.9, 0.42] }, 0.725, 1.55),
        M('lab', { m: LIST.barrels[0], box: [0.42, 0.9, 0.42] }, 0.21, 0.45),
        (wl, u, room) => room > 0.45 && stackOf('lab', LIST.cbox, [0.40, 0.36, 0.38], 3)(wl, u + 0.2),
        one(M('lab', { m: LIST.shelfPreset, s: 0.8 }, 0.49, 1.0)),
        M('lab', { m: LIST.barrels[1], box: [0.42, 0.9, 0.42] }, 0.21, 0.45),
        M('lab', { m: LIST.propane, s: 0.86 }, 0.2, 0.42),
        (wl, u, room) => room > 0.45 && stackOf('lab', LIST.cbox, [0.40, 0.36, 0.38], 2)(wl, u + 0.2),
        M('lab', { m: LIST.cabinets, s: 0.72 }, 0.18, 0.4),
        M('lab', { m: LIST.barrels[2], box: [0.42, 0.9, 0.42] }, 0.21, 0.45),
      ], 'lab', 1.3);
      for (const wl of [LB, LL, LR]) for (const [a, b] of runs(wl, 0.26, 1.46, 1.9, false, 0.2, 0.2)) if (b - a > 0.9) shelf(wl, a, Math.min(b, a + 1.6), 1.52, 0.24, false, LIST.chem, 'lab', [0.30, 0.31, 0.33]);
      if (!opts.open && (!compact || RB)) put('labGlow', LIST.lampHang, { x: labLamp[0], z: labLamp[2], y: CEIL_H - 0.8, fit: [0.55, 0.55, 0.8] });
    } else {
      fillFloor(all, [
        M('lab', { m: LIST.kLocker2 }, 0.63, 1.3),
        (wl, u, room) => room > 0.45 && stackOf('lab', LIST.kPresent, [0.36, 0.3, 0.36], 3)(wl, u + 0.2),
        M('lab', { m: LIST.kLocker }, 0.21, 0.45),
        M('lab', { m: LIST.kTree, s: 1.15 }, 0.38, 0.8),
        (wl, u, room) => room > 0.45 && stackOf('lab', LIST.kPresent, [0.4, 0.33, 0.38], 2)(wl, u + 0.2),
      ], 'lab');
      for (const wl of [LB, LL, LR]) for (const [a, b] of runs(wl, 0.28, 1.46, 1.9, false, 0.2, 0.2)) if (b - a > 0.9) shelf(wl, a, Math.min(b, a + 1.3), 1.52, 0.26, false, [...LIST.kToys, LIST.kPlush[0]], 'lab');
      if (!opts.open && (!compact || RB)) put('labGlow', LIST.kLamp, { x: labLamp[0], z: labLamp[2], y: CEIL_H - 0.8, fit: [0.6, 0.6, 0.8] });
    }
    // въздуховод под тавана: където стената е свободна (не през асансьора и не пред таблото)
    const dcol = kids ? PAL.shopTrim : [0.42, 0.44, 0.46];
    for (const wl of [LB, LL]) for (const [a, b] of runs(wl, 0.24, 2.46, 2.74, false, 0.0, 0.0)) if (b - a > 0.6) { const q = wbox(wl, a, b, 0.02, 0.22, 2.5, 2.7); MI.box(q.x0, q.y0, q.z0, q.x1, q.y1, q.z1, kids ? T_STRIPE : T_METAL, 0.5, dcol, 'xXzZy'); }
  }

  // ───────── ниво 1: мазето под пицарията ─────────
  // Само оригинални модели на Synty в естествения им размер (Gang Warfare Pack: модулът е 3 м, стената е 3 × 3 м, има и половинка).
  // Формата идва от игралната зона: стените стоят на LAB_MARGIN извън ръбовете ѝ (дотам излизат станциите), помещението е едно,
  // без преграда между стаите. Кабината на асансьора е вградена в стената: стената опира в двете ѝ страни, над нея има щурц.
  // Парче, което е по-дълго от стената си, продължава зад ъгъла, където отвътре не се вижда; никое не е разтягано.
  const lab = { margin: LAB_MARGIN, height: LAB_H, walls: [], cabins: [], lamps: [], placed: [], inside: () => false };
  if (assets.has(...LABM.wall) && assets.has(...LABM.floor)) {
    const M = LAB_MARGIN, FAR = 1e4, HALF_W = LAB_MOD / 2;
    const zone = (start.rooms && start.rooms.length ? start.rooms : [{ id: 'a', x: 0, z: 0, w: W, d: D }])
      .map(r => ({ x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 }));
    const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    const inZone = (x, z, m = 0) => zone.some(r => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m);
    // кабините: външната кутия и „изрезът" зад лицето им. Откъм страна, до която не се стига пеша, изрезът стига до безкрая:
    // там стената затваря помещението в равнината на вратата (на CAB_IN зад лицето, за да стърчи рамката на кабината).
    const cabs = (start.stations || []).filter(s => s.level === 1 && s.kind === 'elevator').map(s => {
      const fx = Math.round(Math.sin(s.yaw || 0)), fz = Math.round(Math.cos(s.yaw || 0));      // накъде гледа вратата
      const ex = (fx ? s.d : s.w) / 2 + CAB_PAD, ez = (fx ? s.w : s.d) / 2 + CAB_PAD;
      const c = { x0: s.x - ex, x1: s.x + ex, z0: s.z - ez, z1: s.z + ez };
      const walk = (dx, dz) => inZone(s.x + dx * (ex + 0.3), s.z + dz * (ez + 0.3));
      const cut = { ...c };
      if (fx > 0) cut.x1 -= CAB_IN; else if (!walk(1, 0)) cut.x1 = FAR;
      if (fx < 0) cut.x0 += CAB_IN; else if (!walk(-1, 0)) cut.x0 = -FAR;
      if (fz > 0) cut.z1 -= CAB_IN; else if (!walk(0, 1)) cut.z1 = FAR;
      if (fz < 0) cut.z0 += CAB_IN; else if (!walk(0, -1)) cut.z0 = -FAR;
      return { ...c, cut, id: s.id };
    });
    // всяка стая, раздута с M. Страна, която почти цялата опира в съседна стая (там е отворът помежду им), не се раздува:
    // иначе късата стъпка между двете стаи би изместила стената зад станциите на съседната.
    const freeLen = (r, side) => {
      const along = side[0] === 'x' ? ['z0', 'z1'] : ['x0', 'x1'], opp = side[0] + (side[1] === '0' ? '1' : '0');
      let len = r[along[1]] - r[along[0]];
      for (const q of zone) if (q !== r && Math.abs(q[opp] - r[side]) < 0.05) len -= Math.max(0, Math.min(r[along[1]], q[along[1]]) - Math.max(r[along[0]], q[along[0]]));
      return len;
    };
    const grow = (r, side) => (freeLen(r, side) >= 0.6 ? M : 0);
    const big = zone.map(r => ({ x0: r.x0 - grow(r, 'x0'), x1: r.x1 + grow(r, 'x1'), z0: r.z0 - grow(r, 'z0'), z1: r.z1 + grow(r, 'z1') }));
    const inside = (x, z) => big.some(r => inRect(r, x, z)) && !cabs.some(c => inRect(c.cut, x, z));
    const inCab = (x, z) => cabs.some(c => inRect(c, x, z));
    lab.inside = inside; lab.cabins = cabs;

    // очертанието: мрежа по всички ръбове, клетка е вътре или вън; стена има между клетка вътре и клетка вън
    const uniq = arr => [...new Set(arr.filter(v => Math.abs(v) < FAR).map(v => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
    const xs = uniq([...big.flatMap(r => [r.x0, r.x1]), ...cabs.flatMap(c => [c.cut.x0, c.cut.x1])]);
    const zs = uniq([...big.flatMap(r => [r.z0, r.z1]), ...cabs.flatMap(c => [c.cut.z0, c.cut.z1])]);
    const cell = (i, j) => i >= 0 && j >= 0 && i < xs.length - 1 && j < zs.length - 1 && inside((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
    const edges = [];      // ax: по коя ос върви; c: къде е; a..b: от-до; n: накъде е „вътре" по другата ос
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length; j++) {
      const hi = cell(i, j), lo = cell(i, j - 1);
      if (hi !== lo) edges.push({ ax: 'x', c: zs[j], a: xs[i], b: xs[i + 1], n: hi ? 1 : -1 });
    }
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length; i++) {
      const hi = cell(i, j), lo = cell(i - 1, j);
      if (hi !== lo) edges.push({ ax: 'z', c: xs[i], a: zs[j], b: zs[j + 1], n: hi ? 1 : -1 });
    }
    edges.sort((p, q) => (p.ax < q.ax ? -1 : p.ax > q.ax ? 1 : p.c - q.c || p.n - q.n || p.a - q.a));
    const lines = [];
    for (const e of edges) {
      const l = lines[lines.length - 1];
      if (l && l.ax === e.ax && l.n === e.n && Math.abs(l.c - e.c) < 1e-6 && Math.abs(l.b - e.a) < 1e-6) l.b = e.b; else lines.push({ ...e });
    }
    let bx0L = 1e9, bx1L = -1e9, bz0L = 1e9, bz1L = -1e9;      // кутията на цялото помещение
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) if (cell(i, j)) { bx0L = Math.min(bx0L, xs[i]); bx1L = Math.max(bx1L, xs[i + 1]); bz0L = Math.min(bz0L, zs[j]); bz1L = Math.max(bz1L, zs[j + 1]); }

    // ── стените ──
    const wInfo = assets.info(...LABM.wall), WALL_FACE = wInfo ? wInfo.max[2] : 0.197;      // цокълът излиза толкова пред тухлата
    const EXT = WALL_FACE + 0.012, HI = 0.004 - WALL_FACE;                                 // HI: „до тухлата" (над цокъла)
    const piece = (m, wl, u, y, dep) => { const p = wpos(wl, u, dep); return spawn('l1Shell', m[0], m[1], p[0], y, p[1], wl.yaw, 1); };
    // свободно ли е зад линията на стената от u0 до u1 (там отива излишъкът от парчето): нито помещение, нито кабина
    const clearOut = (wl, u0, u1) => {
      for (let u = u0 + 0.03; u < u1; u += 0.07) for (const dep of [-0.03, -0.2, -0.37]) { const p = wpos(wl, u, dep); if (inside(p[0], p[1]) || inCab(p[0], p[1])) return false; }
      return true;
    };
    // парчета от u = from нататък, докато покрият k половинки; lapTo: последното свършва точно там, на косъм зад предишното
    const layRun = (wl, from, k, y, lapTo = null) => {
      let u = from;
      for (let n = k; n > 0;) {
        const full = n >= 2, w = full ? LAB_MOD : HALF_W, last = lapTo !== null && n <= 2 && u > from + 0.02;
        piece(full ? LABM.wall : LABM.half, wl, last ? lapTo - w : u, y, -WALL_FACE - (last ? 0.012 : 0));
        u += w; n -= full ? 2 : 1;
      }
    };
    function wallRun(wl, a, b) {
      if (b - a < 0.03) return;
      // във вътрешен ъгъл стената продължава малко зад съседната, за да се срещнат тухлените лица над цокъла
      const canA = clearOut(wl, a - EXT, a), canB = clearOut(wl, b, b + EXT);
      const a1 = canA ? a - EXT : a, b1 = canB ? b + EXT : b;
      const k = Math.max(1, Math.ceil((b1 - a1) / HALF_W - 0.02)), over = Math.max(0, k * HALF_W - (b1 - a1));
      if (over < 0.02) return layRun(wl, a1, k, 0);
      if (canA && clearOut(wl, a1 - over, a1)) return layRun(wl, a1 - over, k, 0);
      if (canB && clearOut(wl, b1, b1 + over)) return layRun(wl, a1, k, 0);
      layRun(wl, a1, k, 0, b1);
    }
    // над кабината: същата стена, вдигната върху покрива ѝ. Вижда се само ивицата до тавана, останалото е над него.
    function lintel(wl, a, b) {
      const k = Math.max(1, Math.ceil((b - a) / HALF_W - 0.02)), over = Math.max(0, k * HALF_W - (b - a));
      // излишъкът отива там, където зад линията няма помещение (зад съседната стена); при свободен ъгъл на кабината свършва точно на него
      const okA = clearOut(wl, a - over, a), okB = clearOut(wl, b, b + over);
      layRun(wl, okA && !okB ? a - over : okB && !okA ? a : a - over / 2, k, CAB_TOP);
    }
    let wn = 0;
    for (const l of lines) {
      const len = l.b - l.a;
      const wl = l.ax === 'x' ? (l.n > 0 ? mkWall('l1', l.a, l.c, 0, 1, len) : mkWall('l1', l.b, l.c, 0, -1, len))
        : (l.n > 0 ? mkWall('l1', l.c, l.b, 1, 0, len) : mkWall('l1', l.c, l.a, -1, 0, len));
      // кабините, които стоят в тази стена: [от, до] по нея
      const holes = [];
      for (const c of cabs) {
        const cs = [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]].map(([x, z]) => [(x - wl.P0[0]) * wl.t[0] + (z - wl.P0[1]) * wl.t[1], (x - wl.P0[0]) * wl.n[0] + (z - wl.P0[1]) * wl.n[1]]);
        const u0 = Math.max(0, Math.min(...cs.map(q => q[0]))), u1 = Math.min(len, Math.max(...cs.map(q => q[0])));
        const d0 = Math.min(...cs.map(q => q[1])), d1 = Math.max(...cs.map(q => q[1]));
        if (u1 - u0 > 0.05 && d0 < -0.05 && d1 < 0.1) holes.push([u0, u1]);
      }
      holes.sort((p, q) => p[0] - q[0]);
      let u = 0;
      const solid = (a, b) => {
        if (b - a < 0.03) return;
        wallRun(wl, a, b);
        const q = wpos(wl, a, 0);
        lab.walls.push(mkWall(`l1w${wn++}`, q[0], q[1], wl.n[0], wl.n[1], b - a));
      };
      for (const [a, b] of holes) { solid(u, a); lintel(wl, a, b); u = b; }
      solid(u, len);
    }

    // ── под и таван: плочи 3 × 3 м върху цялото помещение. Каквото излиза зад стените, отвътре не се вижда ──
    // Мрежите са закачени за средата на първата стая: тя е среда на една плоча от пода (там е сифонът) и на едно квадратче от тавана (1 м).
    const midX = (zone[0].x0 + zone[0].x1) / 2, midZ = (zone[0].z0 + zone[0].z1) / 2;
    const tilesFrom = (gx, gz) => {
      const out = [];
      for (let kx = Math.floor((bx0L - gx) / LAB_MOD); kx <= Math.ceil((bx1L - gx) / LAB_MOD) - 1; kx++) for (let kz = Math.floor((bz0L - gz) / LAB_MOD); kz <= Math.ceil((bz1L - gz) / LAB_MOD) - 1; kz++) {
        const X = gx + kx * LAB_MOD, Z = gz + kz * LAB_MOD;
        let used = false;
        for (let x = X + 0.12; x < X + LAB_MOD && !used; x += 0.25) for (let z = Z + 0.12; z < Z + LAB_MOD; z += 0.25) if (inside(x, z)) { used = true; break; }
        if (used) out.push({ X, Z, kx, kz });
      }
      return out;
    };
    const cInfo = assets.info(...LABM.ceil), ceilY = LAB_H - (cInfo ? cInfo.min[1] : 0);       // най-ниската точка на тавана е точно на LAB_H
    const floorTiles = tilesFrom(midX - LAB_MOD / 2, midZ - LAB_MOD / 2), tiles = tilesFrom(midX - 0.5, midZ - 0.5);
    const drainOk = assets.has(...LABM.drain) && inZone(midX, midZ, 0.3);
    for (const t of floorTiles) spawn('l1Shell', ...(drainOk && t.kx === 0 && t.kz === 0 ? LABM.drain : LABM.floor), t.X, 0, t.Z + LAB_MOD, 0, 1);      // горната страна на пода е на y = 0
    if (!opts.open && cInfo) for (const t of tiles) spawn('l1Shell', ...LABM.ceil, t.X, ceilY, t.Z + LAB_MOD, 0, 1);

    // ── кое е заето: станциите, ивицата зад тях до стената, игралната зона (там не стои нищо), мониторът ──
    boxes = boxes1.filter(b => b.kind !== 'hud' && b.kind !== 'door' && b.kind !== 'sign');      // табла по стените вече няма: мястото им е свободно
    placed = [];
    for (const wl of lab.walls) for (const b of boxes1) {
      if (b.hard || b.kind === 'hud' || b.kind === 'door' || b.kind === 'sign') continue;
      const cs = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => [(x - wl.P0[0]) * wl.t[0] + (z - wl.P0[1]) * wl.t[1], (x - wl.P0[0]) * wl.n[0] + (z - wl.P0[1]) * wl.n[1]]);
      const u0 = Math.max(0, Math.min(...cs.map(q => q[0]))), u1 = Math.min(wl.L, Math.max(...cs.map(q => q[0]))), d0 = Math.min(...cs.map(q => q[1]));
      if (u1 - u0 < 0.05 || d0 < 0.02 || d0 > M - KEEP + 0.12) continue;      // само станция, която стои на самия ръб на зоната пред тази стена
      boxes.push({ ...wbox(wl, u0, u1, 0, d0, b.y0, b.y1), kind: b.kind, floor: b.floor });
      if (b.floor) (wl.busy ||= []).push([u0, u1]);
    }
    for (const r of zone) boxes.push({ kind: 'zone', x0: r.x0 + 0.02, x1: r.x1 - 0.02, z0: r.z0 + 0.02, z1: r.z1 - 0.02, y0: 0, y1: 99, hard: true });
    let mon = null;
    try { mon = hudLayout(start).levels[1]?.monitor || null; } catch { mon = null; }

    // ── лампи на тавана: светещи плочи в квадратчетата му, през едно, само над мястото за ходене ──
    if (!opts.open && cInfo && assets.has(...LABM.lamp)) {
      const spots = [];
      for (const t of tiles) for (let m = 0; m < 3; m++) for (let q = 0; q < 3; q++) {
        const x = t.X + m + 0.5, z = t.Z + q + 0.5;
        if ((((t.kx * 3 + m + t.kz * 3 + q) % 2) + 2) % 2 !== 0) continue;
        if (!inZone(x, z, 0.25) || inCab(x, z) || !inside(x, z)) continue;
        if (mon && Math.abs(mon.x - x) < 0.62 && Math.abs(mon.z - z) < 0.62) continue;
        spots.push([x, z]);
      }
      // всяка стая да има поне една лампа над мястото за ходене (и да не е залепена за съседна лампа)
      for (const r of zone) {
        if (spots.some(([x, z]) => inRect(r, x, z))) continue;
        let best = null;
        for (const t of tiles) for (let m = 0; m < 3; m++) for (let q = 0; q < 3; q++) {
          const x = t.X + m + 0.5, z = t.Z + q + 0.5;
          if (!inRect(r, x, z) || !inZone(x, z, 0.2) || inCab(x, z) || !inside(x, z) || spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.3)) continue;
          if (mon && Math.abs(mon.x - x) < 0.62 && Math.abs(mon.z - z) < 0.62) continue;
          let free = 0;      // колко от мястото наоколо е свободно за ходене: лампата отива в най-откритото
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (inZone(x + dx * 0.6, z + dz * 0.6) && !inCab(x + dx * 0.6, z + dz * 0.6)) free++;
          if (!best || free > best.free) best = { x, z, free };
        }
        if (best) spots.push([best.x, best.z]);
      }
      if (!spots.length) spots.push([midX, midZ]);
      for (const [x, z] of spots) { spawn('l1Glow', ...LABM.lamp, x, LAB_H + 0.012, z, 0, 1); lab.lamps.push({ x, y: LAB_H, z }); }
    }

    // ── обстановка покрай стените, в ивицата между стената и игралната зона ──
    band = M - 0.04;
    const L1_TRIS = 20000;
    const fits = (it, room) => { const bb = lbox(it.m[0], it.m[1], 1, it.rot || 0); return bb && bb.w <= room ? bb : null; };
    // купчина кашони: един върху друг, леко завъртени
    const stack = (list, n) => ({ m: list[0], fn: (wl, u) => {
      let y = 0, first = null;
      for (let i = 0; i < n; i++) {
        const m = pick(list), rot = (rnd() - 0.5) * 0.5, bb = lbox(m[0], m[1], 1, rot); if (!bb) break;
        const w0 = lbox(list[0][0], list[0][1], 1, 0.25).w;
        const got = mount('l1', wl, { m, rot }, u + w0 / 2, y, { gap: 0.04 + (w0 - bb.d) / 2, force: i > 0 });
        if (!got) break;
        first ||= Object.assign(got, { w: w0 }); y = got.top;
      }
      return first;
    } });
    function fillWalls(queue) {
      const segs = [];
      for (const wl of lab.walls) for (const [a, b] of runs(wl, 0.45, 0, 1.3, false, 0.0, 0.0)) segs.push({ wl, a, b });      // плитка проба: всяко нещо после проверява своята дълбочина
      segs.sort((p, q) => (q.b - q.a) - (p.b - p.a));      // най-едрите неща отиват на най-дългите свободни парчета
      let turn = 0;
      for (const sg of segs) {
        let u = sg.a + 0.01;
        while (u < sg.b - 0.3 && (spent.l1 || 0) < L1_TRIS) {
          let got = null;
          for (let k = 0; k < queue.length && !got; k++) {
            const it = queue[(turn + k) % queue.length];
            if (it.once && it.used) continue;
            const bb = fits(it, sg.b - u - 0.005); if (!bb) continue;
            got = it.fn ? it.fn(sg.wl, u) : mount('l1', sg.wl, { m: it.m, rot: it.rot || 0 }, u + bb.w / 2, 0, { gap: 0.02 + rnd() * 0.03 });
            if (got) { it.used = true; turn = (turn + k + 1) % queue.length; Object.assign(got, { wl: sg.wl }); if (it.after) it.after(got); }
          }
          u += got ? got.w + 0.07 + rnd() * 0.1 : 0.15;
        }
      }
    }
    // лампи по стените (светят): дълго луминесцентно тяло на дългите стени, малка лампа на късите
    const wallLamps = () => {
      for (const wl of [...lab.walls].sort((p, q) => q.L - p.L)) {
        if (wl.L >= 2.3 && assets.has(...LABM.tube)) for (let n = Math.max(1, Math.round(wl.L / 3.2)), i = 0; i < n; i++) mount('l1Glow', wl, { m: LABM.tube }, wl.L * (i + 0.5) / n, 2.55, { gap: HI });
        else if (wl.L >= 0.6 && assets.has(...LABM.bulb)) mount('l1Glow', wl, { m: LABM.bulb }, wl.L / 2, 2.3, { gap: HI });
      }
    };
    // тръби от пода до тавана: в ъглите, които са останали свободни след мебелите, и по дългите стени, опрени в тухлата
    const pipes = () => {
      if (!assets.has(...LABM.pipe)) return;
      for (const wl of lab.walls) {
        if (wl.L >= 1.0) { mount('l1', wl, { m: LABM.pipe }, 0.15, 0, { gap: 0.012 }); mount('l1', wl, { m: LABM.pipe }, wl.L - 0.15, 0, { gap: 0.012 }); }
        if (wl.L >= 3.0) for (const u of [wl.L * 0.2, wl.L * 0.8]) {
          const q = wbox(wl, u - 0.15, u + 0.15, HI, HI + 0.26, 0, LAB_H);
          if (!placed.some(b => hit(q, b) && b.y1 > 1.0)) mount('l1', wl, { m: LABM.pipe }, u, 0, { gap: HI, force: true });
        }
      }
    };
    // Мазето под пицарията (нощната тема): бъчви, чували с брашно, каси и стелаж покрай стените, по куки на тухлата
    // висят колбаси, а над мелачката от тавана слиза улеят от кухнята. В детската тема е обикновен склад с продукти.
    {
      const QUARTER = Math.PI / 2;
      const has = m => m && assets.has(...m);
      const byLen = [...lab.walls].sort((p, q) => q.L - p.L);
      wallLamps();
      // улеят: въздуховод от Shops Pack в естествен размер, изправен. Дълъг е 2.5 м: горната му част остава над тавана.
      const l1s = (start.stations || []).filter(s => s.level === 1);
      const grinder = kids ? null : l1s.find(s => s.kind === 'hopper') || l1s.find(s => s.kind === 'chute') || l1s.find(s => s.kind === 'grinder') || null;      // където пада тялото: бункерът, иначе мелачката
      if (grinder && has(CEL.duct)) {
        const yaw = grinder.yaw || 0, bx = -Math.sin(yaw), bz = -Math.cos(yaw), side = Math.abs(Math.sin(yaw)) > 0.5;
        const edge = (grinder.d || 0.4) / 2 + 0.30;                    // средата на улея е на 0.30 м зад ръба на зоната
        const cx = grinder.x + bx * edge, cz = grinder.z + bz * edge, mouth = Math.max(2.05, (grinder.y || 0) + (grinder.h || 0) + 0.06), len = lbox(...CEL.duct)?.d || 2.5;
        const o = spawn('l1', ...CEL.duct, cx, mouth + len, cz, 0, 1);
        if (o) {
          o.rotation.set(Math.PI / 2, yaw, 0, 'YXZ');
          const hx = side ? 0.42 : 0.55, hz = side ? 0.55 : 0.42;
          placed.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, y0: 1.6, y1: 99, name: 'chute' });
          lab.chute = { x: cx, z: cz, y: mouth };
        }
      }
      const boxPile = kids ? LIST.boxes : LABM.cbox || LIST.boxes;
      // хладилната камера: фризер с две врати, вграден в стената. Дълбок е 1.03 м, а ивицата до зоната е 0.9: напред стърчат
      // само вратите (0.4 м), останалото е зад тухлата, където отвътре не се вижда. Само на стена, зад която няма помещение.
      const coldRoom = (wl, u) => {
        const bb = lbox(...CEL.freezer), sink = bb.d - 0.4;
        for (const du of [0.05, bb.w / 2, bb.w - 0.05]) { const q = wpos(wl, u + du, -sink - 0.1); if (lab.inside(q[0], q[1])) return null; }
        return mount('l1', wl, { m: CEL.freezer }, u + bb.w / 2, 0, { gap: -sink });
      };
      fillWalls([
        { m: CEL.freezer, once: true, fn: coldRoom },
        { m: CEL.shelf3, once: true },
        { m: CEL.wood[0] },
        { m: CEL.sackStack, rot: QUARTER, once: true },
        boxPile && boxPile.length ? stack(boxPile, 2) : null,
        { m: CEL.wood[1], once: true },
        { m: CEL.sack[0] },
        kids ? null : { m: LABM.barrels && LABM.barrels[0], once: true, rot: QUARTER },
        { m: CEL.mop, once: true },
        { m: CEL.wood[2], once: true },
        boxPile && boxPile.length ? stack(boxPile, 3) : null,
        { m: CEL.sack[1] },
        kids ? null : { m: LABM.ladder, once: true },
        kids ? null : { m: LABM.bucket, once: true },
        kids ? null : { m: LABM.firehose, once: true },
      ].filter(it => it && it.m && it.m.length && assets.has(...it.m)));
      pipes();
      // колбаси по куки на стената: редица на височината на очите и над нея, където стената е свободна
      if (has(CEL.hook) && CEL.sausage.some(has)) {
        let n = 0, strings = 0;
        const MAXN = kids ? 6 : 14;
        for (const wl of byLen) {
          if (n >= MAXN) break;
          for (const [a, b] of runs(wl, 0.34, 1.6, 2.34, false, 0.25, 0.25)) {      // и над ниските неща: бъчви, чували, масата на мелачката
            for (let u = a + 0.2 + rnd() * 0.15; u < b - 0.15 && n < MAXN; u += 0.36 + rnd() * 0.2) {
              const hk = mount('l1', wl, { m: CEL.hook }, u, 2.2, { gap: HI });
              if (!hk) continue;
              const long = !kids && has(CEL.sausages) && strings < 2 && n % 5 === 2;
              const m = long ? CEL.sausages : CEL.sausage[n % CEL.sausage.length];
              if (!has(m)) continue;
              const p = wpos(wl, u, hk.depth - 0.04);      // под върха на куката
              spawn('l1', m[0], m[1], p[0], 2.21, p[1], wl.yaw + (rnd() - 0.5) * 1.2, 1);
              if (long) strings++;
              n++;
            }
          }
        }
        lab.sausages = n;
      }
      // дребното по стените, където е останало място
      const wallQueue = (kids ? [] : [
        { m: LABM.socket, y: 1.0 }, { m: LABM.powerBox, y: 1.35 }, { m: LABM.wallSwitch, y: 0.95 }, { m: LABM.extinguisher, y: 1.0 },
      ]).filter(it => has(it.m));
      let wt = 0, vents = 0;
      for (const wl of byLen) {
        if (wl.L < 0.8) continue;
        if (!kids && vents < 1 && wl.L >= 1.4 && has(LABM.vent) && mount('l1', wl, { m: LABM.vent }, wl.L / 2, 2.35, { gap: HI })) vents++;
        let u = 0.3, miss = 0;
        while (u < wl.L - 0.3 && wallQueue.length && wt < wallQueue.length && miss < wallQueue.length) {
          const it = wallQueue[wt], bb = lbox(it.m[0], it.m[1]);
          const got = bb && u + bb.w <= wl.L - 0.12 ? mount('l1', wl, { m: it.m }, u + bb.w / 2, it.y, { gap: HI }) : null;
          if (got) { u += got.w + 0.6 + rnd() * 0.4; wt++; miss = 0; } else { miss++; u += 0.3; }
        }
      }
    }
    lab.placed = placed;
    band = BAND; boxes = boxes0;
  }

  // ───────── ниво 0 в готовата карта: кухнята на пицарията, затворена по мярка на игралната зона ─────────
  // Играчът стои в кухнята на Pizza Shack от картата. Тя е 11.7 × 5.5 м с таван на 5.9 м, а зоната е няколко метра:
  // уредите стояха като островчета насред зала. Тук зоната се затваря в помещение по своя мярка: стени плътно зад
  // уредите и таван на 3 м, от модулите на Shops Pack, с които Synty са построили и самата карта (SM_Bld_Base_Wall_01
  // с плочките PolygonShops_Building_Toilet_01 отвътре и тухлата на пицарията отвън, плоча SM_Bld_Base_Floor_Combined_01
  // с тавана на картата отдолу). Всичко е в естествен размер, нищо не е разтягано: парче, по-дълго от стената си,
  // продължава зад ъгъла, където отвътре не се вижда.
  // Отпред помещението е отворено към тезгяха и салона. Вдясно стената спира на гърба на дългия тезгях на картата.
  // Нишата зад стая „а" стига до задната стена на сградата: в нея е лявата тухлена пещ на пицарията (тя е от картата).
  // Къде са стените решават истинските модели на станциите в сцената (колко стърчат зад ръба на зоната), не имената им.
  const kit0 = { walls: [], lamps: [], margins: null, rects: null, nook: null, measured: false, pieces: 0 };
  if (plaza && KITM.wall && assets.has(...KITM.wall) && assets.has(...KITM.slab)) {
    const MOD = 2.5, TH = 0.113, H0 = 3.0, MIN_M = 0.32, GAP = 0.05, FAR = 1e4;
    const zone = (start.rooms && start.rooms.length ? start.rooms : [{ id: 'a', x: 0, z: 0, w: W, d: D }])
      .map(r => ({ x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 }));
    const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    const inZone = (x, z, m = 0) => zone.some(r => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m);
    const st0 = (start.stations || []).filter(s => s.level !== 1);
    const half = s => { const side = Math.abs(Math.sin(s.yaw || 0)) > 0.5; return [(side ? s.d : s.w) / 2, (side ? s.w : s.d) / 2]; };
    const counter = st0.find(s => s.kind === 'counter') || null, shutter = st0.find(s => s.kind === 'shutter') || null;
    const front = Math.max(0, counter ? zone.findIndex(r => counter.x > r.x0 - 0.3 && counter.x < r.x1 + 0.3 && counter.z > r.z0 && counter.z < r.z1 + 1.5) : 0);
    const frontZ = shutter ? shutter.z - TH : zone[front].z1 + 0.05;      // вътрешното лице на стената на сградата над тезгяха
    const passZ = counter ? counter.z - half(counter)[1] - 0.02 : frontZ;     // гърбът на тезгяха
    const passX = counter ? counter.x + half(counter)[0] - 0.05 : FAR;         // оттам надясно тезгяхът на картата продължава

    // ── колко стърчат уредите зад всеки ръб на зоната и къде стоят: по триъгълниците на моделите им в сцената ──
    const reach = zone.map(() => ({ x0: 0, x1: 0, z0: 0, z1: 0 }));
    const reachOf = (X, Z) => {
      let bk = -1, bs = '', bd = 2.4;
      for (let k = 0; k < zone.length; k++) {
        const r = zone[k];
        if (X >= r.x0 && X <= r.x1 && Z >= r.z0 && Z <= r.z1) return;      // вътре в зоната
        if (Z > r.z0 - 0.8 && Z < r.z1 + 0.8) { if (X < r.x0 && r.x0 - X < bd) { bd = r.x0 - X; bk = k; bs = 'x0'; } else if (X > r.x1 && X - r.x1 < bd) { bd = X - r.x1; bk = k; bs = 'x1'; } }
        if (X > r.x0 - 0.8 && X < r.x1 + 0.8) { if (Z < r.z0 && r.z0 - Z < bd) { bd = r.z0 - Z; bk = k; bs = 'z0'; } else if (Z > r.z1 && Z - r.z1 < bd) { bd = Z - r.z1; bk = k; bs = 'z1'; } }
      }
      if (bk >= 0 && bd > reach[bk][bs]) reach[bk][bs] = bd;
    };
    const CELL = 0.2, occ = new Map();      // клетка от пода → най-високата точка на уред в нея
    {
      const sc = ctx.root && ctx.root.getObjectByName ? ctx.root.getObjectByName('backroom-scene') : null;
      if (sc) {
        ctx.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(ctx.root.matrixWorld).invert(), m4 = new THREE.Matrix4();
        const T = [0, 0, 0, 0, 0, 0];
        const visit = o => {
          if (!o.visible) return;
          if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
            const p = o.geometry.attributes.position, ix = o.geometry.index, e = m4.multiplyMatrices(inv, o.matrixWorld).elements;
            const n = ix ? ix.count : p.count;
            for (let i = 0; i + 2 < n; i += 3) {
              let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
              for (let k = 0; k < 3; k++) {
                const q = ix ? ix.getX(i + k) : i + k, x = p.getX(q), y = p.getY(q), z = p.getZ(q);
                const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
                T[k * 2] = X; T[k * 2 + 1] = Z;
                if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
              }
              if (y1 < 0.05 || y0 > 2.6 || x1 - x0 > 3 || z1 - z0 > 3) continue;      // знаци по пода, вдигнати щори, огромни плоскости
              kit0.measured = true;
              for (let k = 0; k < 3; k++) reachOf(T[k * 2], T[k * 2 + 1]);
              for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b++) {
                const key = (a + 2048) * 4096 + (b + 2048);
                if ((occ.get(key) || 0) < y1) occ.set(key, y1);
              }
            }
          }
          for (const c of o.children) visit(c);
        };
        // сцената държи по три групи на ниво (неподвижни, живи, стая): първите две са уредите на ниво 0.
        // Гледат се независимо дали нивото се вижда в момента (играчът може да е долу, когато страницата се зареди).
        const lv0 = sc.children.length >= 3 ? [sc.children[0], sc.children[1]] : [sc];
        try { for (const g of lv0) for (const c of (g === sc ? [g] : g.children)) visit(c); } catch (e) { console.warn('[decor] мерене на уредите:', e.message); }
      }
      if (!kit0.measured) for (const s of st0) {      // без сцена (оглед): уред с естествен размер стърчи до 0.75 м зад ръба си
        if (!s.nat || s.kind === 'counter' || s.kind === 'shutter' || s.kind === 'prep') continue;
        const bx = -Math.sin(s.yaw || 0), bz = -Math.cos(s.yaw || 0);
        reachOf(s.x + bx * 0.95, s.z + bz * 0.95);
      }
    }

    // ── очертанието: всяка стая, раздута с това, което стърчи зад ръба ѝ; страна, опряна в съседна стая, не се раздува ──
    const freeLen = (r, side) => {
      const along = side[0] === 'x' ? ['z0', 'z1'] : ['x0', 'x1'], opp = side[0] + (side[1] === '0' ? '1' : '0');
      let len = r[along[1]] - r[along[0]];
      for (const q of zone) if (q !== r && Math.abs(q[opp] - r[side]) < 0.05) len -= Math.max(0, Math.min(r[along[1]], q[along[1]]) - Math.max(r[along[0]], q[along[0]]));
      return len;
    };
    const mar = zone.map((r, k) => { const o = {}; for (const s of ['x0', 'x1', 'z0', 'z1']) o[s] = freeLen(r, s) >= 0.6 ? Math.min(2.0, Math.max(MIN_M, reach[k][s] + GAP)) : 0; return o; });
    const big = zone.map((r, k) => ({ x0: r.x0 - mar[k].x0, x1: r.x1 + mar[k].x1, z0: r.z0 - mar[k].z0, z1: k === front ? frontZ : r.z1 + mar[k].z1 }));
    // нишата с лявата пещ на пицарията (само на това място в картата: така е изпечена). Пещта е на x 0.04..2.18, z −4.81..−2.53.
    const here = plaza.meta.map === 'shopping-plaza' && Math.abs((plaza.meta.cx ?? 0) + 6.9) < 0.02 && Math.abs((plaza.meta.cz ?? 0) + 1.45) < 0.02 && !(plaza.meta.yaw || 0);
    const BACK = -4.69;      // вътрешното лице на задната стена на сградата
    const NOOK = here && zone[front].z0 > -2.4 && zone[front].x1 < 2.0 && zone[front].x1 > 0.3 ? { x0: Math.min(0.0, zone[front].x1 - 0.5), x1: 2.3, z0: BACK - 0.25, z1: zone[front].z0 + 0.01 } : null;
    if (NOOK && big[front].x1 < NOOK.x1 && NOOK.x1 - big[front].x1 < 1.25) big[front].x1 = NOOK.x1;      // дясната стена е една права, без чупка пред нишата
    // близки успоредни стени се изравняват по външната (иначе излиза стъпало от педя)
    for (const [side, pickFn] of [['x0', Math.min], ['x1', Math.max], ['z0', Math.min]]) for (let a = 0; a < big.length; a++) for (let b = a + 1; b < big.length; b++) {
      if (Math.abs(big[a][side] - big[b][side]) < 0.45) big[a][side] = big[b][side] = pickFn(big[a][side], big[b][side]);
    }
    const inNook = (x, z) => !!NOOK && inRect(NOOK, x, z);
    const cabs = st0.filter(s => s.kind === 'elevator').map(s => {
      const fx = Math.round(Math.sin(s.yaw || 0)), fz = Math.round(Math.cos(s.yaw || 0));      // накъде гледа вратата
      const ex = (fx ? s.d : s.w) / 2 + CAB_PAD, ez = (fx ? s.w : s.d) / 2 + CAB_PAD;
      const c = { x0: s.x - ex, x1: s.x + ex, z0: s.z - ez, z1: s.z + ez };
      const walk = (dx, dz) => { const px = s.x + dx * (ex + 0.3), pz = s.z + dz * (ez + 0.3); return inZone(px, pz) || inNook(px, pz); };
      const cut = { ...c };
      if (fx > 0) cut.x1 -= CAB_IN; else if (!walk(1, 0)) cut.x1 = FAR;
      if (fx < 0) cut.x0 += CAB_IN; else if (!walk(-1, 0)) cut.x0 = -FAR;
      if (fz > 0) cut.z1 -= CAB_IN; else if (!walk(0, 1)) cut.z1 = FAR;
      if (fz < 0) cut.z0 += CAB_IN; else if (!walk(0, -1)) cut.z0 = -FAR;
      return { ...c, cut, id: s.id };
    });
    const inside = (x, z) => (big.some(r => inRect(r, x, z)) || inNook(x, z)) && !cabs.some(c => inRect(c.cut, x, z));
    const inCab = (x, z) => cabs.some(c => inRect(c, x, z));
    kit0.margins = mar; kit0.rects = big; kit0.nook = NOOK; kit0.inside = inside; kit0.reach = reach; kit0.passZ = passZ;

    const uniq = arr => [...new Set(arr.filter(v => Math.abs(v) < FAR).map(v => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
    const rects = NOOK ? [...big, NOOK] : big;
    const xs = uniq([...rects.flatMap(r => [r.x0, r.x1]), ...cabs.flatMap(c => [c.cut.x0, c.cut.x1])]);
    const zs = uniq([...rects.flatMap(r => [r.z0, r.z1]), ...cabs.flatMap(c => [c.cut.z0, c.cut.z1])]);
    const cell = (i, j) => i >= 0 && j >= 0 && i < xs.length - 1 && j < zs.length - 1 && inside((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
    const edges = [];      // ax: по коя ос върви; c: къде е; a..b: от-до; n: накъде е „вътре" по другата ос
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length; j++) {
      const hi = cell(i, j), lo = cell(i, j - 1);
      if (hi !== lo) edges.push({ ax: 'x', c: zs[j], a: xs[i], b: xs[i + 1], n: hi ? 1 : -1 });
    }
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length; i++) {
      const hi = cell(i, j), lo = cell(i - 1, j);
      if (hi !== lo) edges.push({ ax: 'z', c: xs[i], a: zs[j], b: zs[j + 1], n: hi ? 1 : -1 });
    }
    edges.sort((p, q) => (p.ax < q.ax ? -1 : p.ax > q.ax ? 1 : p.c - q.c || p.n - q.n || p.a - q.a));
    const lines = [];
    for (const e of edges) {
      const l = lines[lines.length - 1];
      if (l && l.ax === e.ax && l.n === e.n && Math.abs(l.c - e.c) < 1e-6 && Math.abs(l.b - e.a) < 1e-6) l.b = e.b; else lines.push({ ...e });
    }
    let kx0 = 1e9, kx1 = -1e9, kz0 = 1e9, kz1 = -1e9;      // кутията на цялото помещение
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) if (cell(i, j)) { kx0 = Math.min(kx0, xs[i]); kx1 = Math.max(kx1, xs[i + 1]); kz0 = Math.min(kz0, zs[j]); kz1 = Math.max(kz1, zs[j + 1]); }

    // ── стените ──
    const mTile = assets.material(SHOPS, 'tex/PolygonShops_Building_Toilet_01.png'), mBrick = assets.material(SHOPS, 'tex/PolygonShops_Building_Texture_01.png');
    const mCeil = assets.material(PLZ, 'tex/PolygonShoppingPlaza_Ceiling_Tile_01.png'), mTop = assets.material(SHOPS, 'tex/PolygonShops_Building_Concrete_01.png');
    kit0.ceilMap = mCeil.map;
    // материалите на модула по ред на мрежите му: стената е [външно лице, вътрешно лице], плочата е [долна страна, горна страна]
    const paint = (o, mats) => { let i = 0; if (o) o.traverse(q => { if (q.isMesh) { q.material = mats[Math.min(i, mats.length - 1)]; i++; } }); return o; };
    // навън от стаята ли е мястото: там отива излишъкът от парчетата. Пред предната стена и над тезгяха не бива да стърчи нищо.
    // Зад задната стена на сградата също не стърчи нищо (там парчето би се видяло отвън): тогава парчетата се застъпват.
    const blocked = (x, z) => inside(x, z) || inCab(x, z) || z > frontZ - 0.02 || (x > passX && z > passZ) || (!!NOOK && z < BACK - 0.6);
    const clearOut = (wl, u0, u1) => {
      for (let u = u0 + 0.03; u < u1; u += 0.07) for (const dep of [-0.03, -0.12, -0.21]) { const p = wpos(wl, u, dep); if (blocked(p[0], p[1])) return false; }
      return true;
    };
    const piece = (wl, u, y, back = 0) => { const p = wpos(wl, u, -TH - back); kit0.pieces++; return paint(spawn('k0Shell', ...KITM.wall, p[0], y, p[1], wl.yaw, 1), [mBrick, mTile]); };
    function wallRun(wl, a, b, y = 0) {
      if (b - a < 0.03) return;
      const k = Math.max(1, Math.ceil((b - a) / MOD - 0.01)), over = Math.max(0, k * MOD - (b - a));
      let from = a, lap = false;
      if (over > 0.01) {
        if (clearOut(wl, a - over, a)) from = a - over;             // излишъкът отива зад ъгъла в началото
        else if (clearOut(wl, b, b + over)) from = a;                 // или зад ъгъла в края
        else if (k > 1) lap = true;                                   // или последното парче застъпва предишното, на косъм зад него
        else from = clearOut(wl, a - over / 2, a) && clearOut(wl, b, b + over / 2) ? a - over / 2 : a - over;
      }
      for (let i = 0; i < k; i++) { const last = lap && i === k - 1; piece(wl, last ? b - MOD : from + i * MOD, y, last ? 0.012 : 0); }
    }
    let wn = 0;
    for (const l of lines) {
      let la = l.a, lb = l.b;
      if (l.ax === 'x' && Math.abs(l.c - frontZ) < 0.02) continue;                    // отпред е отворено: тезгяхът и салонът
      if (l.ax === 'x' && NOOK && Math.abs(l.c - NOOK.z0) < 0.02) continue;           // дъното на нишата е задната стена на сградата
      if (l.ax === 'z' && l.c > passX) lb = Math.min(lb, passZ);                      // до гърба на тезгяха
      if (l.ax === 'x' && l.c > passZ) { if (la > passX) continue; lb = Math.min(lb, passX); }
      const len = lb - la;
      if (len < 0.03) continue;
      const wl = l.ax === 'x' ? (l.n > 0 ? mkWall('k0', la, l.c, 0, 1, len) : mkWall('k0', lb, l.c, 0, -1, len))
        : (l.n > 0 ? mkWall('k0', l.c, lb, 1, 0, len) : mkWall('k0', l.c, la, -1, 0, len));
      // кабината на асансьора в тази стена: под нея няма стена, над нея е щурцът
      const holes = [];
      for (const c of cabs) {
        const cs = [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]].map(([x, z]) => [(x - wl.P0[0]) * wl.t[0] + (z - wl.P0[1]) * wl.t[1], (x - wl.P0[0]) * wl.n[0] + (z - wl.P0[1]) * wl.n[1]]);
        const u0 = Math.max(0, Math.min(...cs.map(q => q[0]))), u1 = Math.min(len, Math.max(...cs.map(q => q[0])));
        const d0 = Math.min(...cs.map(q => q[1])), d1 = Math.max(...cs.map(q => q[1]));
        if (u1 - u0 > 0.05 && d0 < -0.05 && d1 < 0.1) holes.push([u0, u1]);
      }
      holes.sort((p, q) => p[0] - q[0]);
      let u = 0;
      const solid = (a, b) => {
        if (b - a < 0.03) return;
        // късото парче зад кабината, до лявата пещ на картата: стои зад купола ѝ и от помещението не се вижда; зад него е тухлата на сградата
        if (NOOK && l.ax === 'z' && Math.abs(l.c - NOOK.x0) < 0.4 && Math.max(wpos(wl, a, 0)[1], wpos(wl, b, 0)[1]) < BACK + 0.5) return;
        wallRun(wl, a, b);
        const q = wpos(wl, a, 0);
        kit0.walls.push(mkWall(`k0w${wn++}`, q[0], q[1], wl.n[0], wl.n[1], b - a));
      };
      for (const [a, b] of holes) { solid(u, a); wallRun(wl, a, b, CAB_TOP); u = b; }
      solid(u, len);
    }

    // ── таван: плочи 2.5 × 2.5 м, наредени от предната и от дясната стена; долната им страна е на 3 м ──
    // Последният ред назад не излиза зад сградата: започва от задната ѝ стена и застъпва предишния, на косъм над него.
    if (!opts.open) {
      const sInfo = assets.info(...KITM.slab), slabY = H0 - (sInfo ? sInfo.min[1] : -0.093);
      const backLimit = NOOK ? BACK - 0.03 : -FAR;
      const rows = [];
      for (let Z = frontZ - MOD; Z > kz0 - MOD + 0.02; Z -= MOD) { if (Z < backLimit) { rows.push([backLimit, 0.012]); break; } rows.push([Z, 0]); }
      // и по ширина: редиците тръгват от дясната стена; ако до лявата остане процеп, последната редица започва от нея и застъпва съседната
      const cols = [];
      for (let X = kx1 - MOD; X > kx0 - MOD + 0.02; X -= MOD) cols.push([X, 0]);
      if (cols.length && cols[cols.length - 1][0] > kx0 + 0.001) cols.push([kx0 - 0.004, 0.006]);
      for (const [X, liftX] of cols) for (const [Z, liftZ] of rows) {
        const lift = liftX + liftZ;
        let used = false;
        for (let x = X + 0.12; x < X + MOD && !used; x += 0.25) for (let z = Z + 0.12; z < Z + MOD; z += 0.25) if (inside(x, z) || inCab(x, z)) { used = true; break; }
        if (used) paint(spawn('k0Shell', ...KITM.slab, X, slabY + lift, Z, 0, 1), [mCeil, mTop]);
      }
    }

    // ── кое е заето на ниво 0: уредите (по измереното), мястото за ходене, кабината, екранът над тезгяха ──
    const keepBoxes = boxes, keepPlaced = placed, keepBand = band;
    boxes = [];
    for (const [key, h] of occ) {
      const a = Math.floor(key / 4096) - 2048, b = (key % 4096) - 2048;
      boxes.push({ kind: 'occ', x0: a * CELL - 0.05, x1: (a + 1) * CELL + 0.05, z0: b * CELL - 0.05, z1: (b + 1) * CELL + 0.05, y0: 0, y1: h, floor: true });
    }
    for (const r of zone) boxes.push({ kind: 'zone', x0: r.x0 + 0.02, x1: r.x1 - 0.02, z0: r.z0 + 0.02, z1: r.z1 - 0.02, y0: 0, y1: 99, hard: true });
    for (const c of cabs) boxes.push({ kind: 'elevator', x0: c.x0 - 0.05, x1: c.x1 + 0.05, z0: c.z0 - 0.05, z1: c.z1 + 0.3, y0: 0, y1: 99, hard: true });
    boxes.push({ kind: 'front', x0: -FAR, x1: FAR, z0: passZ - 0.25, z1: FAR, y0: 0, y1: 1.3, floor: true });      // при тезгяха на пода не се слага нищо
    boxes.push({ kind: 'front', x0: -FAR, x1: FAR, z0: passZ + 0.35, z1: FAR, y0: 0, y1: 99, hard: true });
    if (NOOK) boxes.push({ kind: 'oven', x0: -0.05, x1: NOOK.x1, z0: -FAR, z1: zone[front].z0 - 0.2, y0: 0, y1: 1.5, floor: true });   // пещта на картата и мястото пред устата ѝ остават открити
    placed = []; band = 1.3;
    const has = m => m && assets.has(...m);
    const byLen = [...kit0.walls].sort((p, q) => q.L - p.L);

    // лампи на тавана: светещи тела над мястото за ходене във всяка стая
    if (!opts.open && has(LABM.lamp)) for (const r of zone) {
      let x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1;
      for (const c of cabs) if (c.x0 < x1 && c.x1 > x0 && c.z0 < z1 && c.z1 > z0) { if (c.z1 - z0 < z1 - c.z0) z0 = Math.max(z0, c.z1); else z1 = Math.min(z1, c.z0); }
      z1 = Math.min(z1, passZ - 0.2);
      if (x1 - x0 < 0.6 || z1 - z0 < 0.6) continue;
      const long = z1 - z0 > x1 - x0, n = Math.max(1, Math.round((long ? z1 - z0 : x1 - x0) / 1.7));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, x = long ? (x0 + x1) / 2 : x0 + (x1 - x0) * f, z = long ? z0 + (z1 - z0) * f : (z0 + z1) / 2;
        spawn('glow', ...LABM.lamp, x, H0 + 0.012, z, 0, 1);
        kit0.lamps.push({ x, y: H0, z });
      }
    }
    // надписът на пицарията: на най-дългото свободно парче стена, високо
    if (has(KITM.sign)) {
      const sb = lbox(...KITM.sign);
      let best = null;
      for (const wl of byLen) for (const [a, b] of runs(wl, 0.2, 2.2, 2.2 + sb.h, true, 0.1, 0.1)) if (b - a >= sb.w + 0.2 && (!best || b - a > best.b - best.a)) best = { wl, a, b };
      if (best) mount('shop', best.wl, { m: KITM.sign }, (best.a + best.b) / 2, 2.2, { gap: 0.01 });
    }
    // рафтове с тенджери и тигани над уредите и по свободните стени
    if (has(KITM.shelf)) {
      const sb = lbox(...KITM.shelf);
      let n = 0;
      for (const wl of byLen) {
        if (n >= 3) break;
        for (const [a, b] of runs(wl, sb.d + 0.02, 2.0, 2.8, false, 0.15, 0.15)) {
          if (b - a < sb.w + 0.1 || n >= 3) continue;
          const got = mount('shop', wl, { m: KITM.shelf }, (a + b) / 2, 2.02, { gap: 0.004 });
          if (!got) continue;
          Object.assign(got, { wl }); n++;
          if (has(KITM.pot)) onTop('shop', got, KITM.pot, 1, -0.42);
          if (has(KITM.pan)) onTop('shop', got, KITM.pan, 1, 0.38);
          if (has(KITM.pot) && n % 2) onTop('shop', got, KITM.pot, 1, 0.02);
        }
      }
    }
    if (has(KITM.clock)) for (const wl of byLen) { const rr = runs(wl, 0.08, 2.1, 2.5, true, 0.3, 0.3).find(([a, b]) => b - a > 0.6); if (rr && mount('shop', wl, { m: KITM.clock }, (rr[0] + rr[1]) / 2, 2.12, { gap: 0.004 })) break; }
    // на пода покрай стените, в ивицата между стената и мястото за ходене: чували с брашно, каси, хладилник, кутии за пица
    {
      const boxStack = (wl, u) => {      // купчина кутии за пица, леко разместени
        if (!has(KITM.box)) return null;
        let y = FY, first = null;
        const n = 5 + Math.floor(rnd() * 4), b0 = lbox(...KITM.box);
        for (let i = 0; i < n; i++) {
          const got = mount('shop', wl, { m: KITM.box, rot: (rnd() - 0.5) * 0.3 }, u + b0.w / 2 + 0.03, y, { gap: 0.05 + rnd() * 0.02, force: i > 0 });
          if (!got) break;
          first ||= Object.assign(got, { w: b0.w + 0.06 }); y = got.top;
        }
        return first;
      };
      const queue = [
        { m: KITM.fridge, once: true }, { m: KITM.sacks[0], once: true }, { fn: boxStack, m: KITM.box }, { m: KITM.barrel, once: true }, { m: KITM.sacks[1], once: true },
        { m: KITM.crate, once: true, rot: Math.PI / 2 }, { m: KITM.sack[0] }, { fn: boxStack, m: KITM.box, once: true }, { m: KITM.mop, once: true }, { m: KITM.sack[1] }, { m: KITM.cbox, once: true },
      ].filter(it => has(it.m));
      const segs = [];
      for (const wl of kit0.walls) for (const [a, b] of runs(wl, 0.3, 0, 1.0, false, 0.04, 0.04)) segs.push({ wl, a, b });
      segs.sort((p, q) => (q.b - q.a) - (p.b - p.a));
      let turn = 0, tris = 0;
      for (const sg of segs) {
        let u = sg.a + 0.02;
        while (u < sg.b - 0.3 && tris < 9000 && queue.length) {
          let got = null;
          for (let k = 0; k < queue.length && !got; k++) {
            const it = queue[(turn + k) % queue.length];
            if (it.once && it.used) continue;
            const bb = lbox(it.m[0], it.m[1], 1, it.rot || 0);
            if (!bb || bb.w > sg.b - u - 0.01) continue;
            got = it.fn ? it.fn(sg.wl, u) : mount('shop', sg.wl, { m: it.m, rot: it.rot || 0 }, u + bb.w / 2, FY, { gap: 0.03 + rnd() * 0.03 });
            if (got) { it.used = true; turn = (turn + k + 1) % queue.length; tris += assets.info(it.m[0], it.m[1])?.tris || 0; }
          }
          u += got ? got.w + 0.08 + rnd() * 0.12 : 0.15;
        }
      }
    }
    kit0.placed = placed;
    boxes = keepBoxes; placed = keepPlaced; band = keepBand;
  }

  // ───────── градът ─────────
  // Линии на квартала (мрежа от 5 м, закачена за ъгъла на нашата сграда):
  const xB = hw + OUT_T, zB = hd + OUT_T;              // ъгълът на сградата ни
  const SW = 4, RW = 7;                                // тротоар и платно
  const zN = zB + SW, zR = zN + RW, zFar = zR + SW;    // главната улица: нашият бордюр, отсрещният, отсрещните фасади
  const xN = xB + SW, xR = xN + RW, xE = xR + SW;      // пресечката вдясно: бордюр, бордюр, фасадите оттатък
  const yRoad = -0.15;                                 // платното е 15 см под тротоара
  const colsL = 7, colsR = 3, rowsBack = 5, rowsNorth = 4;
  const lamps = [];        // { x, y, z, r, c, i }: изпичат се в цветовете на върховете
  const H = Math.PI / 2;
  if (!plaza) {
    const side = (cx, cz, yaw, wx, wz) => put('city', LIST.sidewalk, { x: cx, z: cz, y: yRoad, yaw, fit: [wx, wz], sy: 0.5 });     // бордюрът на Synty е 30 см: тук е 15
    const lane = (m, cx, cz, yaw, wx, wz) => put('city', m, { x: cx, z: cz, y: yRoad + 0.002, yaw, fit: [wx, wz] });
    const cornerAt = (cx, cz, yaw, wx, wz) => put('city', LIST.corner, { x: cx, z: cz, y: yRoad, yaw, fit: [wx, wz], sy: 0.5 });
    // главната улица наляво от кръстовището (първата плочка е пешеходна пътека)
    for (let k = 0; k < colsL + 1; k++) {
      const cx = xN - 5 * k - 2.5, m = k === 0 ? LIST.crossing : LIST.road;
      lane(m, cx, zN + RW / 4, k === 0 ? 0 : -H, 5, RW / 2); lane(m, cx, zR - RW / 4, k === 0 ? 0 : H, 5, RW / 2);
    }
    for (let k = 0; k < colsL; k++) { const cx = xB - 5 * k - 2.5; side(cx, (hd + zN) / 2, 0, 5, zN - hd); side(cx, (zR + zFar) / 2, Math.PI, 5, SW); }
    // кръстовището и четирите ъгъла
    lane(LIST.roadBare, (xN + xR) / 2, (zN + zR) / 2, 0, RW, RW);
    cornerAt((xB + xN) / 2, (hd + zN) / 2, H, SW, zN - hd);
    cornerAt((xB + xN) / 2, (zR + zFar) / 2, Math.PI, SW, SW);
    cornerAt((xR + xE) / 2, (zR + zFar) / 2, -H, SW, SW);
    cornerAt((xR + xE) / 2, (zB + zN) / 2, 0, SW, SW);
    // главната улица надясно от кръстовището
    for (let k = 0; k < colsR; k++) {
      const cx = xR + 5 * k + 2.5, m = k === 0 ? LIST.crossing : LIST.road;
      lane(m, cx, zN + RW / 4, k === 0 ? 0 : -H, 5, RW / 2); lane(m, cx, zR - RW / 4, k === 0 ? 0 : H, 5, RW / 2);
      side(xE + 5 * k + 2.5, (zB + zN) / 2, 0, 5, SW); side(xE + 5 * k + 2.5, (zR + zFar) / 2, Math.PI, 5, SW);
    }
    // пресечката назад (покрай задната стая) и напред (между отсрещните блокове)
    for (let j = 0; j < rowsBack + 1; j++) {
      const cz = zN - 5 * j - 2.5, m = j === 0 ? LIST.crossing : LIST.road;
      lane(m, xN + RW / 4, cz, j === 0 ? H : 0, RW / 2, 5); lane(m, xR - RW / 4, cz, j === 0 ? H : Math.PI, RW / 2, 5);
    }
    for (let j = 0; j < rowsBack; j++) { side((xB + xN) / 2, hd - 5 * j - 2.5, H, SW, 5); side((xR + xE) / 2, zB - 5 * j - 2.5, -H, SW, 5); }
    for (let j = 0; j < rowsNorth; j++) {
      const cz = zR + 5 * j + 2.5, m = j === 0 ? LIST.crossing : LIST.road;
      lane(m, xN + RW / 4, cz, j === 0 ? H : 0, RW / 2, 5); lane(m, xR - RW / 4, cz, j === 0 ? H : Math.PI, RW / 2, 5);
      side((xB + xN) / 2, zFar + 5 * j + 2.5, H, SW, 5); side((xR + xE) / 2, zFar + 5 * j + 2.5, -H, SW, 5);
    }

    // сграда: партер с магазин, отгоре етажи с апартаменти, покрив (wide: магазин от два модула)
    const stack = (x, z, yaw, shop, floors, wide = 1) => {
      module('bld', shop, x, 0, z, yaw);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (let w = 0; w < wide; w++) {
        const ox = x + c * 5 * w, oz = z - s * 5 * w, a = pick(LIST.apt);
        for (let f = 0; f < floors; f++) module('bld', a, ox, 3 + 3 * f, oz, yaw);
        module('bld', pick(LIST.aptRoof), ox, 3 + 3 * floors, oz, yaw);
      }
    };
    // отсрещният ред (гледа към нас): модулите вървят наляво от ъгъла
    {
      const plan = [[LIST.shopsA[0], 2], [LIST.shopsA[1], 3], ['wide', 2], [LIST.shopsA[2], 3], [LIST.shopsA[3], 2], [LIST.shopsA[4], 2]];
      let k = 0;
      for (const [shop, floors] of plan) {
        const x = xB - 5 * k, wide = shop === 'wide' ? 2 : 1;
        stack(x, zFar, Math.PI, wide === 2 ? LIST.shopWide : shop, floors, wide);
        for (let w = 0; w < wide; w++) if (rnd() < 0.8) lamps.push({ x: x - 2.5 - 5 * w, y: 1.8, z: zFar - 1.0, r: 3.2, c: pick(PAL.spill), i: 1.3 });      // светлина от витрината върху тротоара
        k += wide;
      }
      // големите табели по покривите (от щанда се виждат, щом се приближиш до тезгяха)
      LIST.roofSigns.forEach((m, i) => put('city', m, { x: xB - (i ? 22.5 : 7.5), z: zFar + 2.6, y: i ? 12.6 : 12.6, yaw: Math.PI, s: 0.85 }));
      // фасадата им към пресечката (гледа към +X)
      for (let j = 1; j <= 2; j++) stack(xB, zFar + 5 * (j + 1), H, LIST.shopsA[(j + 2) % 5], 1);
    }
    // оттатък пресечката: стара офис сграда отсреща и стъклена кула от нашата страна на улицата
    put('bld', LIST.office, { x: xE + 5.6, z: zFar + 5.6, y: 0, yaw: Math.PI });
    lamps.push({ x: xE + 5.6, y: 2, z: zFar - 1, r: 4, c: PAL.spill[0], i: 1.0 });
    // оттатък пресечката, от нашата страна на улицата: още магазини с апартаменти (виждат се през страничния отвор)
    for (let j = 0; j < 3; j++) {
      stack(xE, zB - 5 * (j + 1), -H, LIST.shopsA[(j * 2 + 1) % 5], 2);
      lamps.push({ x: xE - 1, y: 1.8, z: zB - 5 * j - 2.5, r: 3.2, c: PAL.spill[(j + 1) % 3], i: 1.3 });
    }

    // уличните лампи: на равно разстояние, шахматно по двата тротоара
    const lampAt = (x, z, yaw) => {
      put('city', LIST.lamp, { x, z, y: 0, yaw, s: 0.85 });
      lamps.push({ x: x + Math.sin(yaw) * 1.5, y: 5.3, z: z + Math.cos(yaw) * 1.5, r: 7, c: PAL.lampCol, i: 3.2, head: true });
    };
    lampAt(xB - 14, zN - 1.4, 0);
    for (const x of [xB - 6.5, xB - 21.5]) lampAt(x, zR + 1.4, Math.PI);
    lampAt(xR + 1.4, zB - 7.5, -H); lampAt(xN - 1.4, zB - 15, H);
    lampAt(xN - 1.4, zFar + 9, H);
    lamps.push({ x: 0, y: 2.2, z: hd + 1.2, r: Math.max(3, hw + 0.5), c: [1.0, 0.84, 0.58], i: 1.9 });      // светлината от нашия щанд върху тротоара
    lamps.push({ x: hw + 1.3, y: 2.2, z: hd * 0.5, r: 3, c: [1.0, 0.84, 0.58], i: 1.5 });

    // светофари на два от ъглите
    const signal = (x, z, yaw) => {
      put('city', LIST.lamp2, { x, z, y: 0, yaw, s: 0.8 });
      if (lbox(...LIST.traffic)) spawn('city', ...LIST.traffic, x + Math.sin(yaw) * 0.25, 3.4, z + Math.cos(yaw) * 0.25, yaw, 1);
    };
    signal(xN - 0.5, zN - 0.5, -H);

    // паркирани коли: една до отсрещния бордюр и една на пресечката
    put('car0', LIST.cars[0], { x: xB - 12.5, z: zR - 1.25, y: yRoad, yaw: H, s: 0.9 });
    put('car1', LIST.cars[1], { x: xR - 1.2, z: zB - 11, y: yRoad, yaw: 0, s: 0.9 });
    // дървета по отсрещния тротоар и до пресечката, нищо пред самия тезгях
    [[xB - 14, zR + 1.3], [xB - 29, zR + 1.3], [xR + 1.3, zB - 14]].forEach(([x, z], i) => put('city', LIST.trees[i % 2], { x, z, y: 0, yaw: rnd() * 6.28, s: 1.05 }));
    // по тротоарите: хидрант на ъгъла, кош, пощенска кутия, пейка и спирка отсреща, сандъци с цветя до щанда
    put('city', LIST.hydrant, { x: xN - 0.7, z: zN - 1.8, y: 0, yaw: 0 });
    put('city', LIST.bin, { x: -hw - 1.2, z: zN - 0.7, y: 0, yaw: 0 });
    put('city', LIST.mailbox, { x: xB - 4.2, z: zR + 0.9, y: 0, yaw: Math.PI });
    put('city', LIST.bench, { x: xB - 9.5, z: zFar - 0.75, y: 0, yaw: Math.PI });
    put('city', LIST.busStop, { x: xB - 26, z: zR + 1.5, y: 0, yaw: Math.PI });
    put('city', LIST.planter, { x: -hw - 2.6, z: zB + 0.55, y: 0, yaw: 0 });
    // надписът над щанда (отвън, над козирката)
    if (!opts.open) { const k = Math.min(1, W * 0.6 / 2.8); put('shop', LIST.burgerText, { x: 0, z: zB + 0.07, y: CEIL_H + 0.55, yaw: 0, s: k }); }
  }

  // светлината на улицата: изпича се във върховете (A = ден/здрач, B = нощ)
  const SA = PAL.A, SB = PAL.B;
  const light = (S, x, y, z, n, base, out) => {
    const h = n[1] * 0.5 + 0.5;
    let r = S.ag[0] + (S.as[0] - S.ag[0]) * h, g = S.ag[1] + (S.as[1] - S.ag[1]) * h, b = S.ag[2] + (S.as[2] - S.ag[2]) * h;
    const sd = Math.max(0, n[0] * S.sunDir[0] + n[1] * S.sunDir[1] + n[2] * S.sunDir[2]);
    r += S.sun[0] * sd; g += S.sun[1] * sd; b += S.sun[2] * sd;
    if (S.lamp > 0) for (const l of lamps) {
      const dx = l.x - x, dy = l.y - y, dz = l.z - z, d2 = dx * dx + dy * dy + dz * dz, rr = l.r * l.r;
      if (d2 > rr * 6) continue;
      const inv = 1 / Math.sqrt(d2 + 1e-4);
      const nd = Math.max(0.2, (n[0] * dx + n[1] * dy + n[2] * dz) * inv);
      const att = l.i * S.lamp * nd / (1 + d2 / rr * 4);
      r += l.c[0] * att; g += l.c[1] * att; b += l.c[2] * att;
    }
    out[0] = base[0] * r; out[1] = base[1] * g; out[2] = base[2] * b;
  };
  const shadeOut = (x, y, z, n, base, A, B) => { light(SA, x, y, z, n, base, A); light(SB, x, y, z, n, base, B); };
  const ME = makeMesher(shadeOut);
  if (!plaza) {
    // земята под всичко (плочките на Synty са отгоре) и нашата сграда отвън
    const XS = 60;
    ME.rect([-XS, yRoad - 0.03, zFar + 30], [1, 0, 0], [0, 0, -1], 2 * XS, zFar + 30 + hd + 34, T_ASPHALT, 6, PAL.ground);
    // сградата обхваща и стая „b" (складът е вътре в нея, не стърчи отзад)
    const x0 = Math.min(-hw, RB ? bx0 : -hw) - OUT_T, x1 = xB, z0 = Math.min(-hd, RB ? bz0 : -hd) - OUT_T, z1 = zB, top = CEIL_H + 0.35;
    const pane = lit => [lit && SA.glow ? PAL.win : (kids ? [0.55, 0.72, 0.90] : [0.16, 0.20, 0.30]), lit ? [PAL.win[0] * 1.2, PAL.win[1] * 1.2, PAL.win[2] * 1.2] : [0.07, 0.09, 0.15]];
    // прозорци по лице: o е долният ляв ъгъл, eu е по лицето (лицето гледа към eu × up)
    const windows = (o, eu, L, yFrom, yTo, share) => {
      const n = Math.floor(L / 3.0); if (n < 1) return; const st = L / n;
      for (let y = yFrom; y + 1.5 < yTo; y += 3.1) for (let i = 0; i < n; i++) {
        const u = st * (i + 0.5) - 0.55, [cA, cB] = pane(rnd() < share);
        ME.rect([o[0] + eu[0] * u - eu[2] * 0.03, y, o[2] + eu[2] * u + eu[0] * 0.03], eu, up, 1.1, 1.5, T_PANE, -1, cA, 1, cB);
      }
    };
    // стените ни отвън: тухла; отпред и отдясно са отворите на щанда
    ME.box(x0, 0, z0, x1, top, z1, T_BRICK, 1.2, PAL.facade, 'xz');
    ME.rect([x1, 0, zS + 0.12], [0, 0, -1], up, zS + 0.12 - z0, top, T_BRICK, 1.2, PAL.facade);            // дясната стена на задната стая (глуха)
    ME.rect([x1, 0, z1], [0, 0, -1], up, z1 - zS - 0.12, LOW, T_BRICK, 1.2, PAL.facade);                            // парапетът отвън
    ME.rect([x1, openTop, z1], [0, 0, -1], up, z1 - zS - 0.12, top - openTop, T_BRICK, 1.2, PAL.facade);            // гредата над страничния отвор
    ME.rect([x0, openTop, z1], [1, 0, 0], up, x1 - x0, top - openTop, T_BRICK, 1.2, PAL.facade);                    // над тезгяха
    ME.rect([x0, 0, z1], [1, 0, 0], up, -hw - x0, openTop, T_BRICK, 1.2, PAL.facade);                                  // лявата колона
    ME.rect([hw, 0, z1], [1, 0, 0], up, OUT_T, openTop, T_BRICK, 1.2, PAL.facade);                                  // ъгловата колона, лице към улицата
    ME.rect([x1, LOW, z1], [0, 0, -1], up, OUT_T, openTop - LOW, T_BRICK, 1.2, PAL.facade);                         // ъгловата колона, лице към пресечката
    ME.rect([-hw, 0, z1], [0, 0, -1], up, OUT_T, openTop, T_FLAT, 0, PAL.facade);                                   // страницата на отвора
    // около залата: плочи на нивото на тротоара (уличката вляво и дворът отзад)
    ME.rect([x0 - 40, -0.004, hd], [1, 0, 0], [0, 0, -1], 40, D + 12, T_PAVE, 2, [0.5, 0.5, 0.5]);
    ME.rect([x0, -0.004, z0], [1, 0, 0], [0, 0, -1], x1 - x0, 12, T_PAVE, 2, [0.5, 0.5, 0.5]);
    if (!opts.open) {
      // козирки на райета над двата отвора: високо, за да не скриват улицата
      const aw = (o, eu, out, L) => {
        const a0 = 3.0, a1 = 2.62, dep = 1.25, len = Math.hypot(dep, a0 - a1), ev = [out[0] * dep / len, (a1 - a0) / len, out[2] * dep / len];
        const s0 = o(a0), e0 = o(a1);
        ME.rect(s0, eu, ev, L, len, T_STRIPE, 0.7, PAL.awning);
        ME.rect([s0[0] + eu[0] * L, a0, s0[2] + eu[2] * L], [-eu[0], 0, -eu[2]], ev, L, len, T_STRIPE, 0.7, PAL.awning);
        ME.rect([e0[0] + out[0] * dep, a1 - 0.16, e0[2] + out[2] * dep], eu, up, L, 0.16, T_STRIPE, 0.7, PAL.awning);
      };
      aw(y => [x0, y, z1], [1, 0, 0], [0, 0, 1], x1 - x0);
      aw(y => [x1, y, z1], [0, 0, -1], [1, 0, 0], z1 - zS);
      // сградата се издига над щанда: още три етажа и покрив
      const h2 = top + 9.3;
      ME.box(x0, top, z0, x1, h2, z1, T_BRICK, 2.4, PAL.facade, 'xXzZ');
      ME.rect([x0 - 0.2, h2, z1 + 0.2], [1, 0, 0], [0, 0, -1], x1 - x0 + 0.4, z1 - z0 + 0.4, T_CONCRETE, 2.4, PAL.roof);
      ME.box(x0 - 0.2, top - 0.25, z0 - 0.2, x1 + 0.2, top, z1 + 0.2, T_FLAT, 0, [0.82, 0.78, 0.70], 'xXzZy');     // корниз
      windows([x0, 0, z1], [1, 0, 0], x1 - x0, top + 0.9, h2, 0.5); windows([x1, 0, z1], [0, 0, -1], z1 - z0, top + 0.9, h2, 0.5);
    }
    // съседните сгради от нашата страна и краищата на улиците: от щанда не се виждат отблизо; държат квартала цял отвън и отгоре
    const mass = (ax, az, bx, bz, h, col, faces) => {
      ME.box(ax, 0, az, bx, h, bz, T_PLASTER, 6, col, faces);
      ME.rect([ax, h, bz], [1, 0, 0], [0, 0, -1], bx - ax, bz - az, T_FLAT, 12, PAL.roof);
      if (faces.includes('Z')) windows([ax, 0, bz], [1, 0, 0], bx - ax, 4.2, h, 0.45);
      if (faces.includes('X')) windows([bx, 0, bz], [0, 0, -1], bz - az, 4.2, h, 0.45);
      if (faces.includes('x')) windows([ax, 0, az], [0, 0, 1], bz - az, 4.2, h, 0.45);
      if (faces.includes('z')) windows([bx, 0, az], [-1, 0, 0], bx - ax, 4.2, h, 0.45);
    };
    const cols = PAL.masses;
    mass(x0 - 12, z0 - 3, x0, z1, 12.8, cols[1], 'xZz');
    mass(x0 - 26, z0 - 5, x0 - 12, z1, 9.6, cols[2], 'xZz');
    mass(x0 - 26, z0 - 22, x1, z0 - 4, 15.9, cols[3], 'xXZz');
    mass(xB - 5 * colsL - 14, hd - 4, xB - 5 * colsL, zFar + 6, 19, cols[0], 'X');
    mass(xE + 5 * colsR, zB - 4, xE + 5 * colsR + 14, zFar + 6, 22, cols[2], 'x');
    mass(xB - 2, zFar + 5 * rowsNorth + 5, xE + 2, zFar + 5 * rowsNorth + 19, 25, cols[3], 'z');
    mass(xB, zB - 5 * rowsBack - 16, xE + 16, zB - 5 * rowsBack - 2, 22, cols[1], 'Z');
    mass(xB - 40, zFar + 5.5, xB - 30, zFar + 16, 22, cols[2], 'z');
    // небето: купол около всичко (камерата на играта вижда до 60 м)
    const R = 52, seg = 20, rings = [[-4, 0], [2, 0.0], [10, 0.4], [24, 0.82], [40, 1]];
    const mixc = (S, f) => [S.skyLow[0] + (S.skyTop[0] - S.skyLow[0]) * f, S.skyLow[1] + (S.skyTop[1] - S.skyLow[1]) * f, S.skyLow[2] + (S.skyTop[2] - S.skyLow[2]) * f];
    const n0 = [0, 0, 0], su = 0.03, sv = 0.97;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      for (let r = 0; r < rings.length - 1; r++) {
        const [y0, f0] = rings[r], [y1, f1] = rings[r + 1];
        const q = (c, s, y, f) => ME.vert(c * R, y, s * R, n0, su, sv, mixc(SA, f), mixc(SB, f));
        q(c0, s0, y0, f0); q(c1, s1, y1, f1); q(c0, s0, y1, f1);       // лицето е навътре
        q(c0, s0, y0, f0); q(c1, s1, y0, f0); q(c1, s1, y1, f1);
      }
      const yT = rings[rings.length - 1][0];
      ME.vert(c0 * R, yT, s0 * R, n0, su, sv, SA.skyTop, SB.skyTop); ME.vert(c1 * R, yT, s1 * R, n0, su, sv, SA.skyTop, SB.skyTop); ME.vert(0, yT + 6, 0, n0, su, sv, SA.skyTop, SB.skyTop);
    }
    // светещите глави на уличните лампи
    const on = [1.8, 1.5, 1.0], off = SA.lamp ? on : [0.75, 0.75, 0.72];
    for (const l of lamps) if (l.head) ME.rect([l.x - 0.2, l.y + 0.1, l.z - 0.2], [1, 0, 0], [0, 0, 1], 0.4, 0.4, T_FLAT, 0, off, 1, on);
  }

  const walkers = [];      // минувачите из града (само с готовата карта)
  const skyMats = [];      // небето и силуетът на града от картата: не се влияят от светлините, затова се боядисват по фаза
  // ───────── сглобяване ─────────
  // tris и meshes са за ниво 0 (най-тежкото: с града); lv[1] е подземната лаборатория, която се вижда сама
  const stats = { tris: 0, meshes: 0, models: 0, parts: {}, lv: [{ tris: 0, meshes: 0 }, { tris: 0, meshes: 0 }] };
  const G0 = new THREE.Group(), G1 = new THREE.Group(); G0.name = 'decor:level0'; G1.name = 'decor:level1'; G1.visible = false;
  root.add(G0, G1);
  function addMesh(name, geo, mat, shadow, group = G0) {
    const mesh = new THREE.Mesh(geo, mat); mesh.name = `decor:${name}`; mesh.matrixAutoUpdate = false;
    if (shadow) { mesh.castShadow = shadow !== 'receive'; mesh.receiveShadow = true; }
    own.geos.push(geo); group.add(mesh);
    const t = geo.attributes.position.count / 3, q = stats.lv[group === G1 ? 1 : 0];
    q.tris += t; q.meshes++; stats.parts[name] = (stats.parts[name] || 0) + t;
    return mesh;
  }
  // материали за улицата: текстура × изпечена светлина (A/B) + светещи прозорци нощем
  const bakedMats = new Map();
  function bakedMaterial(map) {
    let m = bakedMats.get(map);
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ map, vertexColors: true });
    m.onBeforeCompile = sh => {
      sh.uniforms.uMix = uMix; sh.uniforms.uGlow = uGlow; sh.uniforms.uWin = uWin;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 colorB;\nattribute float lit;\nuniform float uMix;\nvarying float vLit;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix( vColor.rgb, colorB, uMix );\nvLit = lit;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform vec3 uWin;\nvarying float vLit;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat dGlass = smoothstep( 0.04, 0.12, diffuseColor.b - max( diffuseColor.r, diffuseColor.g * 0.85 ) );\nfloat dLum = diffuseColor.b;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, uWin * ( 0.55 + dLum ), dGlass * vLit * uGlow );');
    };
    m.customProgramCacheKey = () => 'decor-ab2';
    bakedMats.set(map, m); own.mats.push(m);
    return m;
  }
  // материали за вътре: собствени копия (Lambert), със светеща карта, където пакетът има такава
  const EMIS = {
    [`${SHOPS}/tex/PolygonShops_Texture_01_A.png`]: 'tex/PolygonShops_Texture_01_Emissive.png',
    [`${SHOPS}/tex/PolygonShops_Signs_01.png`]: 'tex/Signs_01_Emissive.png',
    [`${GANG}/tex/PolygonGangWarfare_Texture_01_A.png`]: 'tex/PolygonGangWarfare_Emissive_01_A.png',
  };
  const texLoader = new THREE.TextureLoader();
  const litMats = new Map(), glowMats = new Map(), litExtra = [];
  function litMaterial(src) {
    let m = litMats.get(src);
    if (m) return m;
    m = new THREE.MeshLambertMaterial({ map: src.map });
    if (!src.map) m.color.copy(src.color);
    const key = (src.name || '').split('|')[0], e = EMIS[key];       // assets.js: името е „пакет/tex/…|…"
    if (e) {
      const tex = texLoader.load(`/play/assets/synty/${key.split('/')[0]}/${e}`); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
      m.emissiveMap = tex; m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = PAL.glowK; own.texs.push(tex);
    }
    litMats.set(src, m); own.mats.push(m);
    return m;
  }
  // Под земята няма небе: без това тухлените стени тънат в мрак. Материалът е този на модела (същата текстура и
  // светещата карта на пакета), плюс малко „околна" светлина, добавена в шейдъра.
  const uLabAmb = { value: new THREE.Color().setRGB(kids ? 0.46 : 0.22, kids ? 0.44 : 0.29, kids ? 0.40 : 0.38) };
  const labMats = new Map();
  function labMaterial(lit) {
    let m = labMats.get(lit);
    if (m) return m;
    m = lit.clone();
    m.onBeforeCompile = sh => {
      sh.uniforms.uLabAmb = uLabAmb;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uLabAmb;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLabAmb;');
    };
    m.customProgramCacheKey = () => 'decor-lab1';
    labMats.set(lit, m); own.mats.push(m); litExtra.push(m);
    return m;
  }
  function glowMaterial(src) {
    let m = glowMats.get(src);
    if (!m) { m = new THREE.MeshBasicMaterial({ map: src.map }); glowMats.set(src, m); own.mats.push(m); }
    return m;
  }
  const shellMat = new THREE.MeshLambertMaterial({ map: atlas.map, vertexColors: true, emissiveMap: atlas.emissive, emissive: 0xffffff, emissiveIntensity: 1 });
  own.mats.push(shellMat);
  addMesh('shell', MI.build(THREE, false), shellMat, 'receive');
  // хладилната врата в отвора към склада (сбит план): отвън е една от вратите на хладилната стена, така че складът и
  // асансьорът в него не се виждат. Плъзга се встрани зад стената, щом някой я доближи. Само за окото: правилата не я знаят.
  let gateDoor = null;
  if (GATE && !plaza) {
    const wl = [walls.shopB, walls.shopL, walls.shopR].find(q => gateOn(q)), g = wl && gateOn(wl);
    if (g) {
      const MD = makeMesher(shadeIn), mid = 1.22, top = GATE_H - 0.04;
      const bx = (u0, u1, d0, d1, y0, y1, col) => { const q = wbox(wl, u0, u1, d0, d1, y0, y1); MD.box(q.x0, q.y0, q.z0, q.x1, q.y1, q.z1, T_FLAT, 0, col); };
      bx(g[0], g[1], -0.05, -0.006, 0.02, top, PAL.steel);                                       // крилото, на косъм зад стената
      bx(g[0] + 0.02, g[1] - 0.02, -0.006, 0.002, mid - 0.012, mid + 0.012, PAL.steelDark);      // фугата между двете врати
      bx(g[1] - 0.13, g[1] - 0.10, -0.006, 0.03, mid + 0.14, mid + 0.62, PAL.steelDark);         // дръжки
      bx(g[1] - 0.13, g[1] - 0.10, -0.006, 0.03, mid - 0.52, mid - 0.12, PAL.steelDark);
      const mesh = addMesh('gate', MD.build(THREE, false), shellMat, true);
      mesh.matrixAutoUpdate = true;
      const slide = g[1] - g[0] + 0.08, dir = g[0] > wl.L - g[1] ? -1 : 1;                       // към по-дългата част от стената
      gateDoor = { mesh, tx: wl.t[0] * slide * dir, tz: wl.t[1] * slide * dir, k: 0, to: 0 };
    }
  }

  function mergedLit(name, kind, group = G0) {
    const list = buckets[name]; if (!list || !list.length) return [];
    const out = [];
    for (const mesh of [...assets.merge(list).children]) {
      const geo = mesh.geometry;
      if (kind === 'glow') { geo.deleteAttribute('normal'); out.push(addMesh(name, geo, glowMaterial(mesh.material), false, group)); }
      else out.push(addMesh(name, geo, litMaterial(mesh.material), true, group));
    }
    buckets[name] = null;
    return out;
  }
  // Real obstacles of the room (a column, a wall stub): on both floors a brick pier stands exactly there, built of the
  // original 3 m wall beams of the Gang Warfare Pack side by side, so nobody walks into something he cannot see.
  {
    const bb = lbox(...PIER);
    const twoFloors = (start.stations || []).some(q => q.level === 1);
    if (bb && assets.has(...PIER)) for (const poly of start.obstacles || []) {
      const xs = poly.map(q => q[0]), zs = poly.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const nx = Math.max(1, Math.ceil((x1 - x0 + 0.06) / bb.w)), nz = Math.max(1, Math.ceil((z1 - z0 + 0.04) / bb.d));
      if (nx * nz > 40) continue;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = (x0 + x1) / 2 + (i - (nx - 1) / 2) * bb.w, z = (z0 + z1) / 2 + (j - (nz - 1) / 2) * bb.d;
        put('shop', PIER, { x, z, y: 0 });
        if (twoFloors) put('l1', PIER, { x, z, y: 0 });
      }
      stats.piers = (stats.piers || 0) + nx * nz;
    }
  }
  mergedLit('shop');
  // Кухнята е закрито помещение с лампи на тавана: стените и таванът носят и своя светлина. Без нея таванът тъне
  // (отдолу го осветява само „земята" на небето), а слънцето чертае по плочките сянка, която вътре няма откъде да дойде.
  const KIT_WALL = new THREE.Color().setRGB(0.26, 0.25, 0.23), KIT_CEIL = new THREE.Color().setRGB(0.78, 0.74, 0.66);
  const kitAmb = [];
  for (const mesh of mergedLit('k0Shell')) {      // стените и таванът на кухнята (ниво 0 в готовата карта)
    mesh.castShadow = false; mesh.receiveShadow = false;
    const base = mesh.material.map === kit0.ceilMap ? KIT_CEIL : KIT_WALL, u = { value: base.clone() }, m = mesh.material.clone();
    m.onBeforeCompile = sh => {
      sh.uniforms.uKitAmb = u;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uKitAmb;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uKitAmb;');
    };
    m.customProgramCacheKey = () => 'decor-kit1';
    own.mats.push(m); mesh.material = m; kitAmb.push({ u, base });
  }
  mergedLit('glow', 'glow');
  const neonMats = [];
  for (const m of mergedLit('neon', 'glow')) { const nm = m.material.clone(); own.mats.push(nm); m.material = nm; neonMats.push(nm); }
  // задната стая: предметите носят изпеченото петно светлина във върховете си
  for (const mesh of mergedLit('lab')) {
    const geo = mesh.geometry, pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const f = Math.min(1.3, labLight(pos.getX(i), pos.getY(i), pos.getZ(i))); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = mesh.material.clone(); m.vertexColors = true; own.mats.push(m); mesh.material = m; litExtra.push(m);
  }
  mergedLit('labGlow', 'glow');
  // ниво 1: черупката (стени, под, таван) само приема сянка, предметите и хвърлят. Лампите светят сами: несенчесто копие
  // на собствения им материал (същата текстура), за да не притъмняват с останалото.
  for (const mesh of mergedLit('l1Shell', null, G1)) { mesh.castShadow = false; mesh.material = labMaterial(mesh.material); }
  for (const mesh of mergedLit('l1', null, G1)) mesh.material = labMaterial(mesh.material);
  for (const mesh of mergedLit('l1Glow', 'glow', G1)) { const m = mesh.material.clone(); own.mats.push(m); mesh.material = m; }

  // улицата: всички модели от City Pack в една геометрия, със светлина по върховете и знак кои прозорци светят
  {
    const v3 = new THREE.Vector3();
    const parts = [];
    const paintOf = { car0: PAL.paints[0], car1: PAL.paints[1] };
    let cityMap = null, texData = null;
    for (const name of ['bld', 'city', 'car0', 'car1']) {
      const list = buckets[name]; if (!list || !list.length) continue;
      if (plaza) { buckets[name] = null; continue; }      // градът идва от готовата карта
      for (const mesh of [...assets.merge(list).children]) { cityMap ||= mesh.material.map; parts.push({ name, geo: mesh.geometry }); }
      buckets[name] = null;
    }
    if (parts.length) {
      if (cityMap && parts.some(p => paintOf[p.name])) {
        // цветовете на текстурата, за да се боядиса само ламарината на колите (в пакета тя е сива)
        try {
          const t0 = performance.now();
          while (!(cityMap.image && cityMap.image.width) && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 40));
          const img = cityMap.image;
          if (img && img.width) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); texData = g.getImageData(0, 0, c.width, c.height); }
        } catch { texData = null; }
      }
      const total = parts.reduce((s, p) => s + p.geo.attributes.position.count, 0);
      const P = new Float32Array(total * 3), U = new Float32Array(total * 2), A = new Float32Array(total * 3), B = new Float32Array(total * 3), Lt = new Float32Array(total);
      const one = [1, 1, 1], ca = [0, 0, 0], cb = [0, 0, 0], nn = [0, 0, 0], base = [1, 1, 1];
      let o = 0;
      for (const p of parts) {
        const pos = p.geo.attributes.position, nor = p.geo.attributes.normal, uv = p.geo.attributes.uv, n = pos.count, paint = paintOf[p.name], o0 = o;
        const G = 0.06, snap = q => (paint ? Math.round(q / G) * G : q);
        for (let i = 0; i < n; i += 3) {
          let tint = one, lit = 0;
          if (paint) {
            const ax = snap(pos.getX(i)), ay = snap(pos.getY(i)), az = snap(pos.getZ(i)), bx = snap(pos.getX(i + 1)), by = snap(pos.getY(i + 1)), bz = snap(pos.getZ(i + 1)), cx = snap(pos.getX(i + 2)), cy = snap(pos.getY(i + 2)), cz = snap(pos.getZ(i + 2));
            const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            if (nx * nx + ny * ny + nz * nz < 1e-10) continue;
          }
          if (paint && texData) {
            const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3, v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
            const px = Math.min(texData.width - 1, Math.max(0, Math.floor(u * texData.width))), py = Math.min(texData.height - 1, Math.max(0, Math.floor(v * texData.height)));
            const q = (py * texData.width + px) * 4, r = texData.data[q] / 255, g = texData.data[q + 1] / 255, b = texData.data[q + 2] / 255;
            const lum = (r + g + b) / 3, sat = Math.max(r, g, b) - Math.min(r, g, b);
            if (sat < 0.07 && lum > 0.30 && lum < 0.80) { base[0] = paint[0] / lum; base[1] = paint[1] / lum; base[2] = paint[2] / lum; tint = base; }
          }
          if (p.name === 'bld') {
            // прозорците светят по „апартаменти": един модул от 5 м на един етаж е или светъл, или тъмен
            v3.fromBufferAttribute(nor, i);
            if (Math.abs(v3.y) < 0.7) {
              const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
              const alongX = Math.abs(v3.z) >= Math.abs(v3.x);
              const a = Math.floor((alongX ? cx - xB : cz - zB) / 5), fl = Math.floor((cy + 0.1) / 3), q = Math.round((alongX ? cz : cx) / 9);
              let h = (Math.imul(a, 73856093) ^ Math.imul(fl, 19349663) ^ Math.imul(q, 83492791) ^ (alongX ? 0x5bd1e995 : 0)) >>> 0;
              h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
              lit = (h % 100) < (fl === 0 ? 75 : 46) ? 1 : 0;
            }
          }
          for (let k = 0; k < 3; k++) {
            const j = i + k, x = snap(pos.getX(j)), y = snap(pos.getY(j)), z = snap(pos.getZ(j));
            v3.fromBufferAttribute(nor, j).normalize(); nn[0] = v3.x; nn[1] = v3.y; nn[2] = v3.z;
            shadeOut(x, y, z, nn, tint, ca, cb);
            P[o * 3] = x; P[o * 3 + 1] = y; P[o * 3 + 2] = z; U[o * 2] = uv.getX(j); U[o * 2 + 1] = uv.getY(j);
            A.set(ca, o * 3); B.set(cb, o * 3); Lt[o] = lit; o++;
          }
        }
        stats.parts[`city:${p.name}`] = (stats.parts[`city:${p.name}`] || 0) + (o - o0) / 3;
        p.geo.dispose();
      }
      const geo = new THREE.BufferGeometry(), cut = (arr, k) => new THREE.BufferAttribute(arr.slice(0, o * k), k);
      geo.setAttribute('position', cut(P, 3)); geo.setAttribute('uv', cut(U, 2));
      geo.setAttribute('color', cut(A, 3)); geo.setAttribute('colorB', cut(B, 3)); geo.setAttribute('lit', cut(Lt, 1));
      addMesh('city', geo, bakedMaterial(cityMap)).frustumCulled = false;
    }
  }
  if (!plaza) addMesh('ext', ME.build(THREE, true), bakedMaterial(atlas.map)).frustumCulled = false;
  else {
    // по една мрежа на материал от картата: позициите са 16-битови спрямо кутията на мрежата, нормалите 8-битови
    const dv = new DataView(plaza.buf), stride = plaza.meta.stride || 20;
    // Каквото от картата остава зад затворената кухня и вън от нея, от игралната зона не се вижда никога (стените и
    // таванът го закриват, а навън се гледа само напред, през тезгяха): на каската тези триъгълници не се и зареждат.
    // На компютъра картата остава цяла, защото там се гледа и отвън със свободна камера. ?cull=1 го пуска и там, ?cull=0 го спира.
    const askCull = new URLSearchParams(location.search).get('cull');
    const cull = (askCull === '1' || (askCull !== '0' && !ctx.desktop)) && kit0.walls.length && kit0.rects && !opts.open ? {
      x0: Math.min(...kit0.rects.map(r => r.x0)) - 0.6, x1: Math.max(...kit0.rects.map(r => r.x1)) + 0.6,
      z0: kit0.nook ? kit0.nook.z0 - 0.7 : Math.min(...kit0.rects.map(r => r.z0)) - 0.6, back: kit0.passZ - 1.95,
    } : null;
    let culled = 0;
    for (const ch of plaza.meta.chunks) {
      let n = ch.verts, P = new Uint16Array(n * 3), N = new Int8Array(n * 3), U = new Float32Array(n * 2);
      for (let i = 0, o = ch.offset; i < n; i++, o += stride) {
        P[i * 3] = dv.getUint16(o, true); P[i * 3 + 1] = dv.getUint16(o + 2, true); P[i * 3 + 2] = dv.getUint16(o + 4, true);
        N[i * 3] = dv.getInt8(o + 8); N[i * 3 + 1] = dv.getInt8(o + 9); N[i * 3 + 2] = dv.getInt8(o + 10);
        U[i * 2] = dv.getFloat32(o + 12, true); U[i * 2 + 1] = dv.getFloat32(o + 16, true);
      }
      if (cull && !ch.unlit) {      // небето остава цяло
        const q = ch.span / 65535;
        let nk = 0;
        for (let i = 0; i + 2 < n; i += 3) {
          let hidden = true, keep = false;
          for (let j = 0; j < 3; j++) {
            const x = ch.min[0] + P[(i + j) * 3] * q, z = ch.min[2] + P[(i + j) * 3 + 2] * q;
            // вдясно дългият тезгях оставя процеп: през него, наведен над тезгяха, се вижда назад под малък ъгъл. Там границата отстъпва.
            if (z >= cull.back - (x > cull.x1 ? (x - cull.x1) * 0.35 : 0)) hidden = false;
            if (x > cull.x0 && x < cull.x1 && z > cull.z0) keep = true;      // в кухнята или в стените ѝ
          }
          if (!keep && hidden) continue;
          if (nk !== i) { P.copyWithin(nk * 3, i * 3, i * 3 + 9); N.copyWithin(nk * 3, i * 3, i * 3 + 9); U.copyWithin(nk * 2, i * 2, i * 2 + 6); }
          nk += 3;
        }
        if (nk < n) { culled += (n - nk) / 3; if (!nk) continue; P = P.slice(0, nk * 3); N = N.slice(0, nk * 3); U = U.slice(0, nk * 2); n = nk; }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3, true));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
      geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      const cut = ch.tex ? ch.tex.indexOf('/') : -1;
      const src = cut > 0 ? assets.material(ch.tex.slice(0, cut), ch.tex.slice(cut + 1)) : null;
      const mat = ch.unlit ? new THREE.MeshBasicMaterial({ map: src ? src.map : null }) : new THREE.MeshLambertMaterial({ map: src ? src.map : null });
      const c = ch.color || [1, 1, 1];
      mat.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
      if (ch.glass) { mat.transparent = true; mat.opacity = ch.opacity || 0.3; mat.depthWrite = false; }
      if (ch.alpha) { mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; }
      if (ch.unlit) mat.fog = false;
      if (ch.unlit && /Sky/i.test(ch.name || '')) skyMats.push(mat);
      own.mats.push(mat);
      const mesh = addMesh('plaza', geo, mat, false);
      mesh.position.set(ch.min[0], ch.min[1], ch.min[2]); mesh.scale.setScalar(ch.span);
      mesh.updateMatrix(); mesh.matrixWorldNeedsUpdate = true;
      geo.computeBoundingSphere();
      mesh.frustumCulled = !!ch.part;      // големите мрежи са нарязани на сектори около играча: извън погледа не се рисуват
      if (ch.glass) mesh.renderOrder = 2;
    }
    plaza.buf = null;
    stats.culled = Math.round(culled);      // триъгълници от картата, спестени зад кухнята
    // хората на площада: вървят по тротоарите, по алеята пред пицарията и около фонтана.
    // Пътищата са в координатите на картата (Unity) и се местят заедно с нея спрямо игралната зона.
    const M = plaza.meta, ya = -(M.yaw || 0) * Math.PI / 180, cy = Math.cos(ya), sy = Math.sin(ya);
    const toArena = ([ux, uz]) => { const dx = ux - M.cx, dz = uz - M.cz; return [-(dx * cy + dz * sy), -dx * sy + dz * cy]; };
    const ROUTES = [
      { loop: true, n: 6, pts: [[18.2, 15.3], [-14.9, 15.3], [-14.9, 28], [18.2, 28]] },            // двата тротоара и двете пешеходни пътеки
      { loop: false, n: 5, pts: [[-34, 8.7], [-16, 8.9], [-2, 8.6], [14, 8.8], [34, 8.7]] },        // алеята пред пицарията
      { loop: true, n: 3, pts: [[-4.2, 30.4], [10.6, 30.4], [10.6, 38], [-4.2, 38]] },              // около фонтана
      { loop: false, n: 2, pts: [[-40, 28.2], [-15, 28.2], [18, 28.2], [44, 28.2]] },               // северният тротоар, по цялата дължина
    ];
    let wi = 0;
    for (const R of ROUTES) {
      const pts = R.pts.map(toArena), segs = [];
      let total = 0;
      const m = R.loop ? pts.length : pts.length - 1;
      for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, len, at: total }); total += len; }
      for (let k = 0; k < R.n; k++) {
        const body = makeWalker(wi++);
        if (!body) continue;
        G0.add(body.group);
        walkers.push({ body, segs, total, loop: R.loop, t: total * (k + rnd() * 0.6) / R.n, dir: (k + wi) % 2 ? 1 : -1, speed: 1.05 + rnd() * 0.4, side: (rnd() - 0.5) * 1.3 });
        stats.lv[0].tris += body.tris || 0; stats.lv[0].meshes++;
      }
    }
  }

  // движещи се: вентилаторът на тавана
  const spin = [];
  {
    const fb = lbox(...LIST.fan);
    if (fb && !opts.open && !plaza) {
      const fan = fixMaterials(assets, assets.getSync(...LIST.fan), ...LIST.fan);
      fan.scale.set(0.5, 0.26, 0.5);
      fan.position.set(-hw * 0.52, CEIL_H - fb.y1 * 0.26, zS + (hd - zS) * 0.32);
      fan.traverse(o => { if (o.isMesh) { o.material = litMaterial(o.material); o.castShadow = true; stats.lv[0].tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; stats.lv[0].meshes++; } });
      G0.add(fan); spin.push(fan); modelCount++;
    }
  }
  stats.models = modelCount;
  for (const q of stats.lv) q.tris = Math.round(q.tris);
  stats.tris = stats.lv[0].tris; stats.meshes = stats.lv[0].meshes;
  ctx.root.add(root);

  // ───────── живото: фази, патрул, вентилатор ─────────
  const NIGHT = { closing: 1, night: 1, night2: 1, rush: 1, raid: 1, over: 1 };
  let mixTo = 0, dim = 1, lastPhase = null, shown = 0, frameNo = 0;
  // цвят на небето по фаза (умножава текстурата му): денем както е, по залез топло, нощем тъмносиньо
  const tint = (r, g, b) => new THREE.Color().setRGB(r, g, b);
  const SKY = { day: tint(1, 1, 1), tutorial: tint(1, 1, 1), closing: tint(1.0, 0.56, 0.36), evening: tint(1.0, 0.56, 0.36), dusk: tint(1.0, 0.56, 0.36),
    night: tint(0.07, 0.10, 0.24), night2: tint(0.07, 0.10, 0.24), day2: tint(1, 1, 1), rush: tint(0.10, 0.13, 0.30), raid: tint(0.20, 0.08, 0.12), over: tint(0.45, 0.48, 0.62) };
  const skyNow = tint(1, 1, 1);
  let skySet = false, kitNow = 1;
  const myId = ctx.me?.id;
  const glowList = [...glowMats.values()], litList = [...litMats.values(), ...litExtra], bakedList = [...bakedMats.values()];
  function update(dt, t, snap) {
    // кое ниво: това на местния играч (при возене с асансьора светът се сменя, без да се зарежда нищо)
    let lv = 0;
    const ps = snap?.players;
    const vid = ctx.viewId ?? myId;               // при гледане през очите на играч: неговото ниво
    if (ps) for (let i = 0; i < ps.length; i++) if (ps[i].id === vid) { lv = ps[i].level === 1 ? 1 : 0; break; }
    if (lv !== shown) { shown = lv; G0.visible = lv === 0; G1.visible = lv === 1; }
    const phase = snap?.phase || '';
    if (phase !== lastPhase) { const first = lastPhase === null; lastPhase = phase; mixTo = NIGHT[phase] ? 1 : 0; if (first) uMix.value = mixTo ? 0.999 : 0.001; }
    if (skyMats.length) {
      const want = SKY[phase] || SKY.day;
      if (!skySet || !skyNow.equals(want)) {
        if (!skySet) { skySet = true; skyNow.copy(want); } else skyNow.lerp(want, Math.min(1, dt * 0.5));
        if (Math.abs(skyNow.r - want.r) + Math.abs(skyNow.g - want.g) + Math.abs(skyNow.b - want.b) < 0.012) skyNow.copy(want);
        for (const m of skyMats) m.color.copy(skyNow);
      }
    }
    if (uMix.value !== mixTo) {
      uMix.value += (mixTo - uMix.value) * Math.min(1, dt * 0.45);
      if (Math.abs(mixTo - uMix.value) < 0.004) uMix.value = mixTo;
      uGlow.value = SA.glow + (SB.glow - SA.glow) * uMix.value;
    }
    // при патрул светлините вътре притъмняват, а улицата синее на вълни
    const pat = snap?.patrol?.phase, dimTo = pat === 'on' ? 0.2 : pat === 'warn' ? 0.55 : 1;
    if (dim !== dimTo) {
      dim += (dimTo - dim) * Math.min(1, dt * 6); if (Math.abs(dim - dimTo) < 0.01) dim = dimTo;
      for (const m of glowList) m.color.setScalar(dim);
      for (const m of litList) if (m.emissiveMap) m.emissiveIntensity = PAL.glowK * dim;
      shellMat.emissiveIntensity = dim;
    }
    // лампите в кухнята: вечер светят малко по-меко, при патрул притъмняват заедно с всичко останало
    const kitK = (NIGHT[phase] ? 0.84 : 1) * (0.3 + 0.7 * dim);
    if (kitK !== kitNow) { kitNow = kitK; for (const q of kitAmb) q.u.value.copy(q.base).multiplyScalar(kitK); }
    if (neonMats.length) { const f = (Math.sin(t * 13.7) * Math.sin(t * 3.1) > 0.82 ? 0.35 : 1) * dim; for (const m of neonMats) m.color.setScalar(f); }
    if (pat === 'on') { const w = 0.5 + 0.5 * Math.sin(t * 9); for (const m of bakedList) m.color.setRGB(0.6 + 0.1 * w, 0.65 + 0.2 * w, 1.0 + 0.8 * w); }
    else if (bakedList.length && bakedList[0].color.r !== 1) for (const m of bakedList) m.color.setRGB(1, 1, 1);
    for (const o of spin) o.rotation.y += dt * 2.4 * (0.3 + 0.7 * dim);
    // минувачите: вървят по пътя си; анимацията се смята само за близките (далечните само се местят)
    if (walkers.length && lv === 0) {
      const hx = ctx.head.pos.x, hz = ctx.head.pos.z;
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i];
        w.t += w.dir * w.speed * dt;
        if (w.loop) w.t = ((w.t % w.total) + w.total) % w.total;
        else if (w.t > w.total) { w.t = w.total; w.dir = -1; } else if (w.t < 0) { w.t = 0; w.dir = 1; }
        let sg = w.segs[0];
        for (let k = w.segs.length - 1; k >= 0; k--) if (w.t >= w.segs[k].at) { sg = w.segs[k]; break; }
        const f = Math.min(1, (w.t - sg.at) / (sg.len || 1)), dx = (sg.b[0] - sg.a[0]) / (sg.len || 1), dz = (sg.b[1] - sg.a[1]) / (sg.len || 1);
        const g = w.body.group;
        g.position.set(sg.a[0] + (sg.b[0] - sg.a[0]) * f - dz * w.side, 0, sg.a[1] + (sg.b[1] - sg.a[1]) * f + dx * w.side);
        const want = Math.atan2(dx * w.dir, dz * w.dir);
        let dy = want - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * Math.min(1, dt * 5);
        const far = Math.hypot(g.position.x - hx, g.position.z - hz);
        g.visible = far < 70;
        if (far < 38 || (i + frameNo) % 4 === 0) w.body.update(far < 38 ? dt : dt * 4, true);
      }
      frameNo++;
    }
    if (gateDoor) {      // хладилната врата към склада
      // автоматична: отваря се, щом някой играч на това ниво я доближи, и се затваря след него
      let near = lv === 0 && Math.hypot(ctx.head.pos.x - GATE.x, ctx.head.pos.z - GATE.z) < 1.45;
      if (!near && ctx.players) for (const o of ctx.players.values()) { const hp = o.head && o.head.pos; if (hp && Math.hypot(hp.x - GATE.x, hp.z - GATE.z) < 1.45) { near = true; break; } }
      gateDoor.to = near ? 1 : 0;
      if (gateDoor.k !== gateDoor.to) {
        const step = dt / 0.7, gap = gateDoor.to - gateDoor.k;
        gateDoor.k += Math.abs(gap) <= step ? gap : Math.sign(gap) * step;
        const e = gateDoor.k * gateDoor.k * (3 - 2 * gateDoor.k);
        gateDoor.mesh.position.set(gateDoor.tx * e, 0, gateDoor.tz * e);
      }
    }
  }

  function dispose() {
    ctx.root.remove(root);
    for (const g of own.geos) g.dispose();
    for (const m of own.mats) m.dispose();
    for (const tx of own.texs) tx.dispose();
    for (const w of walkers) { try { w.body.dispose(); } catch { /* вече го няма */ } }
    root.clear();
  }
  return { update, dispose, stats, root, levels: [G0, G1], lab, kitchen: kit0, debug: { placed, boxes: boxes0, boxes1 } };
}

// „Задната стая" (backroom): авторитетните правила на играта.
// Пицария. Денем се продават пица и напитки. Вечер идват грубияните: копчето под тезгяха отваря пода под тях,
// те падат в мазето, там мелачката ги прави на месо, а пицата с месо носи най-много пари. Патрулът не бива да види.
// Детската тема е същата игра без падащи хора: доставчик носи сандък, копчето сваля сандъка в склада.
// Чист модул: без мрежа, без файлове, без таймери, без Date.now(). Времето идва само от opts.now и tick(now).

export const SURFACE_Y = 0.85;
export const REACH = 0.60;

// Всички числа за настройка на едно място. Времената са в секунди при нормална скорост;
// с opts.fast се делят на fastDiv (без люлеенето на иглата и живота на събитията).
export const RULES = {
  phases: { tutorial: 60, day: 200, closing: 20, night: 220, rush: 180, raid: 45 },
  fastDiv: 6,
  cookDone: 7, cookBurn: 10, pour: 2.2, poof: 4,
  snapSlot: 0.45, snapStack: 0.38, surfaceUp: 0.40, surfaceDown: 0.15,
  maxTops: 5, maxItems: 110,
  walk: 1.5, linger: 1.2,
  interval: (n) => clamp(12 - n, 6, 10),      // секунди между клиентите според броя играчи
  patience: (n) => clamp(60 - 3 * n, 40, 57), // търпение според броя играчи
  rushSlow: 1.0,
  markShare: 0.38, markPatience: 0.55,        // дял на грубияните вечер и колко по-кратко чакат
  cupShare: 0.28, vegShare: 0.4, meatShare: [0.2, 0.65],      // пица с месо вечер: без запас и със запас
  pay: { pizza: 10, top: 3, meat: 22, cup: 4, tip: 0.5 },
  // the cellar lab: buyers at the counter, prices of the product, the dead-drop shop in the secret cabinet
  buyerShare: 0.24, buyerTease: 0.07, buyerPatience: 1.7,
  sell: { buds: 25, joint: 40, powder: 35, pills: 45, ice: 60, pure: 1.5 },
  shop: { blue: 12, clear: 8, red: 8, papers: 5, seeds: 10, delay: 5 },
  lab: { shred: 2.5, mix: 3, grow: 25, combine: 0.30, door: 0.6, spout: 0.36 },
  cover: { start: 0.5, ok: 0.05, bad: 0.08, shield: 0.5 },
  patrol: { min: 40, max: 65, warn: 4, on: 7, sus: 0.5 },      // който пусне пода, докато патрулът гледа, е хванат
  trap: { open: 0.45, hold: 1.5, close: 0.8, fall: 1.3, chute: 2.5, innocent: 0.25, missing: 0.03 },
  grinder: { period: 3, zone: 0.32, tol: 0.05, hits: 3, missSus: 0.04, jamAt: 3, cooldown: 0.4, portions: 6, hopper: 4 },
  elevator: { doors: 1, travel: 3, front: 1.0, patrolSus: 0.03 },      // врати, пътуване, свободно пред вратата
  evidence: { money: 15, sus: 0.05 },
  stars: [50, 100, 160, 230],                 // пари на играч за 2, 3, 4 и 5 звезди
  eventMs: 3000,
};

const PHASES = ['tutorial', 'day', 'closing', 'night', 'rush', 'raid'];
export const SAUCES = ['sauce', 'white', 'mustard'];      // tomato, white and mustard sauce: exactly one, and it goes first
const SAUCE = new Set(SAUCES);
const TOPS = [...SAUCES, 'cheese', 'veg', 'meat', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion', 'greens'];
const TOP = new Set(TOPS);
const LIQUIDS = ['blue', 'clear', 'red'];          // the liquids for the mixer in the cellar
const LIQUID = new Set(LIQUIDS);
const SELL = ['buds', 'joint', 'ice', 'pills', 'powder'];      // the product of the cellar: sold over the counter to buyers
const STASH_ANY = [...SELL, 'papers', 'seeds', ...LIQUIDS];     // what a free shelf of the secret cabinet takes
const RECIPES = { 'blue+clear': 'ice', 'blue+red': 'pills', 'clear+red': 'powder' };
const LAB = new Set(['tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL]);      // cellar things: evidence at the raid
const ITEM_KINDS = ['pizza', ...TOPS, 'cup', 'tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL];
const SERVE = ['pizza', 'cup', ...SELL];
const SURFACES = new Set(['oven', 'prep', 'counter', 'grinder', 'bench']);
const PIZZA_H = 0.06;

// ───────── текстове (без емоджита); kids е същата игра с друга кожа ─────────

const NIGHT = {
  title: { tutorial: 'Training', day: 'Day', closing: 'Dusk', night: 'Evening', rush: 'Night shift', raid: 'Inspection', over: 'The end' },
  hint: {
    tutorial: 'Dough on the board, sauce and cheese, into the oven, then onto the counter.',
    day: 'Serve the customers: pizza as ordered and a full cup. The cellar is open: the lift is at the back.',
    closing: 'It is getting dark. The rude ones come in the evening, and the meat is running out.',
    night: 'The rude one stands under the red lamp. The button under the counter opens the floor under him.',
    rush: 'The grinder is waiting downstairs. Upstairs they want pizza with meat.',
    raid: 'Inspection! Hide the product in the blue cabinet and shut it. Throw the rest away.',
    over: 'The shift is over.',
    overCaught: 'They caught you.',
    patrolWarn: 'Patrol! Do not touch the button. Sell nothing from the cellar.',
    patrolOn: 'The patrol is watching. Nobody falls, nothing is sold.',
    hopper: 'A load is waiting downstairs. The lift is at the back.',
    meatUp: 'There is meat. Pizza with meat pays best.',
    buyer: 'A buyer wants the stuff from the blue cabinet in the cellar.',
  },
  signShop: {
    tutorial: 'TRAINING\nDough, sauce, cheese, oven',
    day: 'MENU\nPizza as ordered. A full cup.',
    closing: 'DUSK',
    night: 'MENU\nPizza with meat. The button is under the counter.',
    rush: 'MENU\nPizza with meat. The button is under the counter.',
    raid: 'INSPECTION',
    over: 'THE END',
  },
  signLab: {
    tutorial: 'CLOSED',
    day: 'CELLAR\nBlue cabinet: handle opens it. Empty shelf: touch to order.',
    closing: 'CELLAR\nTray under the grinder. Lever three times. Meat into the lift.',
    night: 'CELLAR\nTray under the grinder. Lever three times. Meat into the lift.',
    rush: 'CELLAR\nTray under the grinder. Lever three times. Meat into the lift.',
    raid: 'HIDE IT ALL',
    over: 'THE END',
  },
  deny: {
    bad: 'Not possible',
    over: 'The game is over',
    noPose: 'No pose from the headset',
    far: 'Too far',
    handFull: 'The hand is full',
    handEmpty: 'The hand is empty',
    noItem: 'No such thing',
    held: 'Somebody holds it',
    noStation: 'No such station',
    notBin: 'Nothing to take here',
    noButton: 'No button here',
    labClosed: 'The cellar is closed',
    raidBins: 'Too late. Hide everything',
    tooMany: 'Too many things',
    noCup: 'Put a cup under it',
    cupFull: 'The cup is full',
    otherDrink: 'Another drink is in the cup',
    noMeat: 'No meat left',
    notYet: 'The button is locked until the evening',
    trapBusy: 'The floor is still closing',
    noTray: 'Put a tray under the grinder',
    noBody: 'The grinder is empty',
    wait: 'Wait',
    otherLevel: 'That is on the other floor',
    enterCabin: 'Step into the cabin',
    liftBusy: 'The lift is moving',
    wrongOrder: 'That is not the order',
    topOrder: 'Sauce first, one of each',
    stashShut: 'Open the cabinet first',
    shelfFull: 'Already on its way',
    noMoney: 'Not enough money',
    noPlant: 'Nothing has grown yet',
    noPlantIn: 'Put a plant in the shredder',
    needTwo: 'Pour two liquids in',
    mixerFull: 'Two liquids are in already',
    takeFirst: 'Take the product out first',
    potBusy: 'Something grows here already',
  },
};

const KIDS = {
  title: { ...NIGHT.title, rush: 'The big delivery' },
  hint: {
    ...NIGHT.hint,
    day: 'Serve the customers: pizza as ordered and a full cup.',
    closing: 'It is getting dark. The courier with the crates comes in the evening.',
    night: 'The courier brings a crate. The button under the counter lowers it into the store.',
    rush: 'The machine downstairs makes salami. Upstairs they want pizza with salami.',
    raid: 'The inspector is coming! Put the trays of the store away.',
    overCaught: 'The inspector caught you.',
    patrolWarn: 'The inspector walks by.',
    patrolOn: 'The inspector is watching.',
    hopper: 'A crate is waiting downstairs. The lift is at the back.',
    meatUp: 'There is salami. Pizza with salami pays best.',
  },
  signShop: { ...NIGHT.signShop, night: 'MENU\nPizza with salami. The button lowers the crate.', rush: 'MENU\nPizza with salami. The button lowers the crate.' },
  signLab: {
    ...NIGHT.signLab,
    day: 'CLOSED',
    closing: 'STORE\nTray under the machine. Lever three times. Salami into the lift.',
    night: 'STORE\nTray under the machine. Lever three times. Salami into the lift.',
    rush: 'STORE\nTray under the machine. Lever three times. Salami into the lift.',
    raid: 'PUT IT ALL AWAY',
  },
  deny: {
    ...NIGHT.deny,
    labClosed: 'The store is closed',
    raidBins: 'Too late. Put everything away',
    noMeat: 'No salami left',
    noTray: 'Put a tray under the machine',
    noBody: 'The machine is empty',
    noCourier: 'No courier here',
  },
};

export const TEXT = { night: NIGHT, kids: KIDS };

// ───────── помощни ─────────

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
const r3 = (v) => Math.round(v * 1000) / 1000;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function boxDist(p, b) {
  const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1);
  const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
  const dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
  return Math.hypot(dx, dy, dz);
}

// разстояние от точка до отвесна отсечка (x, y0..y1, z)
function segDist(p, x, y0, y1, z) {
  return Math.hypot(p.x - x, p.y - clamp(p.y, y0, y1), p.z - z);
}

// собствен генератор (mulberry32): тестовете са повторяеми
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

// ───────── подреждане на залата ─────────

const SIZE = {   // ширина, височина, дълбочина на сбитите станции (в естествен размер размерите идват от NAT)
  bin: [0.30, 0.85, 0.30], oven: [0.70, 0.85, 0.50], drinks: [0.50, 1.40, 0.40],
  prep: [0.80, 0.85, 0.50], trash: [0.35, 0.60, 0.35], grinder: [0.60, 0.85, 0.50], hopper: [0.70, 1.60, 0.50],
  door: [1.20, 2.0, 0.08], sign: [1.6, 0.5, 0.05], elevator: [1.6, 2.3, 1.6], button: [0.14, 0.10, 0.06],
};
Object.assign(SIZE, { stash: [1.0, 2.0, 0.5], grow: [0.9, 1.6, 0.5], bench: [0.9, 0.85, 0.5] });
const DOOR_HALF = 0.6, WALL_T = 0.08, WALL_H = 2.0, COUNTER_D = 0.5, SIGN_Y = 1.55, BTN_Y = 0.70;
const SLOTS = {   // гнезда в местните координати на станцията: [x, y, z, приема]; +z е предната страна
  oven: [[-0.17, SURFACE_Y, 0, ['pizza']], [0.17, SURFACE_Y, 0, ['pizza']]],
  drinks: [[-0.12, SURFACE_Y, 0.08, ['cup']], [0.12, SURFACE_Y, 0.08, ['cup']]],   // 0 = cola, 1 = orange
  prep: [[-0.2, SURFACE_Y, 0, ['pizza']], [0.2, SURFACE_Y, 0, ['pizza']]],
  trash: [[0, 0.6, 0, ITEM_KINDS]],
  grinder: [[-0.13, SURFACE_Y, 0, ['tray', 'meatbox']]],
};
const LEVER = [0.20, SURFACE_Y + 0.14, 0];      // лостът на мелачката в местните ѝ координати
const STAND = 0.10;          // човекът стои на толкова пред станцията, срещу гнездото
const GAP_CAP = 0.35;        // най-голямото разстояние между две съседни станции
const COMFORT = 0.10;        // над тази междина всички подредби са „достатъчно удобни"
const CLEAR = 0.20;          // толкова около всяка станция трябва да е чисто от препятствия
const TIGHT = 0.05;          // отстоянието, когато с CLEAR станциите не се побират
const DEEP = 0.50;           // най-дълбоката станция: ивицата до стената, в която препятствие пречи
const MIN_SEAT = 0.9;        // най-малкото разстояние между две места на клиенти
const LEAF_CAP = 20000;      // таван на пробваните подредби (при много препятствия)
const EPS = 1e-6;

// полуразмери на основата по x и z в залата (yaw е 0, π или ±π/2)
function halfExtents(st) {
  return Math.abs(Math.sin(st.yaw)) > 0.5 ? [st.d / 2, st.w / 2] : [st.w / 2, st.d / 2];
}

export function stationBox(st) {
  const [ex, ez] = halfExtents(st);
  return { x0: st.x - ex, x1: st.x + ex, y0: st.y, y1: st.y + st.h, z0: st.z - ez, z1: st.z + ez };
}

const overlap2 = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;

// ── препятствия: многоъгълници [[x, z], …] в координатите на залата ──

function cleanObstacles(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const poly of list) {
    if (!Array.isArray(poly)) continue;
    const pts = [];
    for (const p of poly) if (p && fin(p[0]) && fin(p[1])) pts.push([r3(p[0]), r3(p[1])]);
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

// общата част на многоъгълник и правоъгълник (Sutherland–Hodgman); връща върховете ѝ
function clipPoly(poly, r) {
  const cut = (pts, inside, cross) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cross(a, b));
    }
    return out;
  };
  const atX = (x) => (a, b) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
  const atZ = (z) => (a, b) => [a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]), z];
  let pts = cut(poly, (p) => p[0] >= r.x0, atX(r.x0));
  if (pts.length) pts = cut(pts, (p) => p[0] <= r.x1, atX(r.x1));
  if (pts.length) pts = cut(pts, (p) => p[1] >= r.z0, atZ(r.z0));
  if (pts.length) pts = cut(pts, (p) => p[1] <= r.z1, atZ(r.z1));
  return pts;
}

// обхватът на общата част по x и z, или null, ако само се допират
function clipSpan(poly, r) {
  const pts = clipPoly(poly, r);
  if (!pts.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  return x1 - x0 > EPS && z1 - z0 > EPS ? { x0, x1, z0, z1 } : null;
}

const hitsAny = (polys, r) => polys.some((poly) => clipSpan(poly, r));

// свободните отсечки по една стена: маха местата, където препятствие влиза в ивицата до нея.
// depth: колко навътре от стената стига нещото; clear: отстоянието от препятствията
function freeSpans(rail, polys, depth, clear = CLEAR) {
  const lo = Math.min(rail.from, rail.to), hi = Math.max(rail.from, rail.to);
  // ивицата е от clear зад стената (препятствие оттатък преградата също е близо) до clear пред нещото
  const back = rail.wall - rail.nrm * clear, front = rail.wall + rail.nrm * (depth + clear);
  const o0 = Math.min(back, front), o1 = Math.max(back, front);
  const band = rail.axis === 'x' ? { x0: lo - clear, x1: hi + clear, z0: o0, z1: o1 } : { x0: o0, x1: o1, z0: lo - clear, z1: hi + clear };
  const cuts = [];
  for (const poly of polys) {
    const s = clipSpan(poly, band);
    if (s) cuts.push(rail.axis === 'x' ? [s.x0 - clear, s.x1 + clear] : [s.z0 - clear, s.z1 + clear]);
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const free = [];
  let at = lo;
  for (const [c0, c1] of cuts) {
    if (at >= hi) break;
    if (c0 > at) free.push([at, Math.min(c0, hi)]);
    at = Math.max(at, c1);
  }
  if (at < hi) free.push([at, hi]);
  return free;
}

// Реже релсите на свободни парчета. Желаният брой станции на стена се дели между парчетата ѝ по дължина.
function splitRails(rails, order, pref, polys, clear) {
  const out = { rails: [], order: [], pref: [] };
  const index = rails.map(() => []);
  rails.forEach((rail, i) => {
    const fwd = rail.from < rail.to;
    let parts = [rail];
    if (polys.length) {
      parts = freeSpans(rail, polys, DEEP, clear).filter(([a, b]) => b - a >= 0.3).map(([a, b]) => ({ ...rail, from: fwd ? a : b, to: fwd ? b : a }));
      if (!fwd) parts.reverse();
    }
    const total = parts.reduce((s, p) => s + Math.abs(p.to - p.from), 0);
    const share = parts.map((p) => {
      const v = total > 0 ? pref[i] * Math.abs(p.to - p.from) / total : 0;
      return { c: Math.floor(v + 1e-9), v };
    });
    let rest = pref[i] - share.reduce((s, q) => s + q.c, 0);
    for (const q of [...share].sort((a, b) => (b.v - b.c) - (a.v - a.c))) { if (rest-- > 0) q.c++; }
    parts.forEach((p, j) => { index[i].push(out.rails.length); out.rails.push(p); out.pref.push(share[j].c); });
  });
  for (const i of order) out.order.push(...index[i]);
  return out;
}

// Нарежда станциите по една стена („релса"): равни междини (до GAP_CAP), групата е в средата.
// Ако някоя застъпва вече сложена станция (ъгъл), краят на релсата се отдръпва зад нея и се пробва пак.
// strict: и пред всеки bin трябва да може да се застане (не само пред гнездата).
function placeRail(rail, defs, placed, strict) {
  if (!defs.length) return { g: Infinity, out: [] };
  let a = rail.from, b = rail.to;
  const dir = Math.sign(rail.to - rail.from) || 1;
  const sum = defs.reduce((s, q) => s + q.w, 0);
  for (let pass = 0; pass < 8; pass++) {
    const len = (b - a) * dir;
    const slack = len - sum;
    if (slack < -1e-9) return null;
    const even = Math.max(0, slack) / (defs.length + 1);
    const g = Math.min(GAP_CAP, even);
    let u = a + dir * (len - sum - g * (defs.length - 1)) / 2;
    const out = [];
    for (const q of defs) {
      const c = u + dir * q.w / 2;
      const o = rail.wall + rail.nrm * q.d / 2;
      const r = rail.axis === 'x'
        ? { x0: c - q.w / 2, x1: c + q.w / 2, z0: o - q.d / 2, z1: o + q.d / 2 }
        : { x0: o - q.d / 2, x1: o + q.d / 2, z0: c - q.w / 2, z1: c + q.w / 2 };
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // мястото пред всяко гнездо, където стои човекът: друга станция не бива да го заема
      const cs = Math.cos(rail.yaw), sn = Math.sin(rail.yaw);
      const fronts = SLOTS[q.kind] ? SLOTS[q.kind].map((sl) => sl[0]) : (strict && q.kind === 'bin') || q.kind === 'grow' ? [0] : [];
      const acc = fronts.map((lx) => {
        const lz = q.d / 2 + STAND, ax = cx + lx * cs + lz * sn, az = cz - lx * sn + lz * cs;
        return { x0: ax - 0.02, x1: ax + 0.02, z0: az - 0.02, z1: az + 0.02 };
      });
      out.push({ def: q, rail, r, acc, cx, cz });
      u += dir * (q.w + g);
    }
    let hit = null;
    for (const p of placed) {
      for (const o of out) {
        hit = overlap2(p.r, o.r) || o.acc.some((q) => overlap2(p.r, q)) ? p.r : p.acc.find((q) => overlap2(q, o.r)) || null;
        if (hit) break;
      }
      if (hit) break;
    }
    if (!hit) return { g: even, out };
    const lo = rail.axis === 'x' ? hit.x0 : hit.z0, hi = rail.axis === 'x' ? hit.x1 : hit.z1;
    const hc = (lo + hi) / 2;
    if (Math.abs(hc - a) <= Math.abs(hc - b)) a = dir > 0 ? Math.max(a, hi) : Math.min(a, lo);
    else b = dir > 0 ? Math.min(b, lo) : Math.max(b, hi);
  }
  return null;
}

// Станциите са в постоянен ред по обиколката на стаята; търсим къде да се „счупи" редът по стените,
// така че най-тясната междина да е най-голяма. При равенство печели подредбата най-близо до желаната.
// Обхождането почва от желаната подредба и реже клоните, които не могат да я надминат.
function packRoom(rails, order, defs, pref, base, strict) {
  const n = defs.length, k = rails.length;
  if (!k) return n ? null : { eff: COMFORT, far: 0, score: Infinity, outs: [] };
  const pre = [0];
  for (const q of defs) pre.push(pre[pre.length - 1] + q.w);
  const len = rails.map((r) => Math.abs(r.to - r.from));
  const rest = new Array(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) rest[i] = rest[i + 1] + pref[i];
  const counts = new Array(k).fill(0);
  let best = null, leaves = 0;

  const leaf = (far) => {
    leaves++;
    const placed = base.slice();
    const outs = new Array(k);
    let at = 0, score = Infinity;
    const parts = counts.map((c) => { const p = defs.slice(at, at + c); at += c; return p; });
    for (const ri of order) {
      const res = placeRail(rails[ri], parts[ri], placed, strict);
      if (!res) return;
      for (const o of res.out) placed.push(o);
      outs[ri] = res.out;
      score = Math.min(score, res.g);
    }
    const eff = Math.min(score, COMFORT);
    const better = !best || eff > best.eff + 1e-9
      || (Math.abs(eff - best.eff) <= 1e-9 && (far < best.far || (far === best.far && score > best.score + 1e-9)));
    if (better) best = { eff, far, score, outs: outs.flat() };
  };

  (function rec(i, at, far) {
    if (leaves >= LEAF_CAP) return;
    const left = n - at;
    if (best && best.eff >= COMFORT - 1e-9 && far + Math.abs(left - rest[i]) > best.far) return;
    if (i === k - 1) {
      if (pre[n] - pre[at] <= len[i] + 1e-9) { counts[i] = left; leaf(far + Math.abs(left - pref[i])); }
      return;
    }
    let max = 0;
    while (max < left && pre[at + max + 1] - pre[at] <= len[i] + 1e-9) max++;
    const tries = [];
    for (let c = 0; c <= max; c++) tries.push(c);
    tries.sort((x, y) => Math.abs(x - pref[i]) - Math.abs(y - pref[i]) || x - y);
    for (const c of tries) { counts[i] = c; rec(i + 1, at + c, far + Math.abs(c - pref[i])); }
  })(0, 0, 0);
  return best;
}

// Една стая: първо с всичко и със свободен достъп до всеки bin; после без незадължителната станция;
// чак накрая се допуска bin зад друга станция в ъгъла. Връща { res, dropped } или null.
function packBest(rails, order, full, lean, base, polys, clear) {
  const run = (v, strict) => {
    const s = splitRails(rails, order, v.pref, polys, clear);
    return packRoom(s.rails, s.order, v.defs, s.pref, base, strict);
  };
  const roomy = (res) => (res && res.score >= 0.02 ? res : null);
  let res = roomy(run(full, true));
  if (res) return { res, dropped: null };
  res = lean && roomy(run(lean, true));
  if (res) return { res, dropped: lean.dropped };
  res = roomy(run(full, false));
  if (res) return { res, dropped: null };
  res = lean && run(lean, false);
  if (res) return { res, dropped: lean.dropped };
  res = run(full, false);
  return res ? { res, dropped: null } : null;
}

// Строи двете нива от размера на залата (4 до 10 м по страна): станции, гнезда, места на клиентите, асансьор.
// Ниво 0 е уличното: магазинът (z > 0) и складът зад него (z < 0). Ниво 1 е подземната лаборатория: цялата зала.
// obstaclesIn: истински пречки в залата (колони, бюра), многоъгълници [[x, z], …]; може да липсва.
export function buildLayout(hallIn, obstaclesIn) {
  const w = r3(clamp(hallIn && fin(hallIn.w) ? hallIn.w : 6, 4, 10));
  const d = r3(clamp(hallIn && fin(hallIn.d) ? hallIn.d : 6, 4, 10));
  const hw = w / 2, hd = d / 2, T = WALL_T / 2;
  const polys = cleanObstacles(obstaclesIn);
  const warnings = [];
  const stations = [];

  const add = (id, kind, level, x, y, z, yaw, size, extra) => {
    const st = { id, kind, level, x: r3(x), y: r3(y), z: r3(z), yaw: r3(yaw), w: r3(size[0]), h: r3(size[1]), d: r3(size[2]), ...extra, slots: [] };
    stations.push(st);
    return st;
  };
  // гнездо в местните координати на станцията: +z е предната ѝ страна, +x е надясно за гледащия я отпред
  const slot = (st, lx, ly, lz, accepts) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    st.slots.push({ id: `${st.id}.${st.slots.length}`, level: st.level, x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c), accepts });
  };
  // мястото на копчето или лоста на станцията (в координатите на залата): там посяга ръката, за да я задейства
  const ctl = (st, lx, ly, lz) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    st.btn = { x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c) };
    return st;
  };

  const taps = (st, list) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    st.taps = list.map(([lx, ly, lz]) => ({ x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c) }));
    return st;
  };
  // места на клиентите: около едно на 1.1 м, най-много 5, поне 0.75 м от страничните стени
  const want = clamp(Math.floor(w / 1.1 + 1e-9), 1, 5);
  const step = want > 1 ? Math.min(1.6, (w - 1.5) / (want - 1)) : 0;
  let xs = [];
  for (let i = 0; i < want; i++) xs.push((i - (want - 1) / 2) * step);
  // препятствие при тезгяха: местата (и гнездата пред тях) се отместват встрани от него
  const lim = hw - 0.75;
  const frontFree = polys.length ? freeSpans({ axis: 'x', from: -lim, to: lim, wall: hd, nrm: -1 }, polys, COUNTER_D + 0.2) : [[-lim, lim]];
  if (frontFree.length !== 1 || frontFree[0][0] > -lim + EPS || frontFree[0][1] < lim - EPS) {
    const moved = [];
    let last = -Infinity;
    for (const ix of xs) {
      let x = null, far = Infinity;
      for (const [a, b] of frontFree) { const c = clamp(ix, a, b); if (Math.abs(c - ix) < far) { far = Math.abs(c - ix); x = c; } }
      if (x !== null && x < last + MIN_SEAT) {   // твърде близо до предишното: първото свободно място по-надясно
        x = null;
        for (const [a, b] of frontFree) { if (b >= last + MIN_SEAT - EPS) { x = Math.max(a, last + MIN_SEAT); break; } }
      }
      if (x === null) continue;
      moved.push(x);
      last = x;
    }
    if (!moved.length) warnings.push('counter: препятствие закрива целия тезгях; местата на клиентите не са преместени');
    else {
      if (moved.length < xs.length) warnings.push(`counter: места за клиенти ${moved.length} вместо ${xs.length} заради препятствие`);
      xs = moved;
    }
  }
  const seats = xs.map((x, i) => ({ i, x: r3(x), z: r3(hd + 0.45) }));

  // ── ниво 0: постоянното ──
  const counter = add('counter', 'counter', 0, 0, 0, hd - COUNTER_D / 2, Math.PI, [w, SURFACE_Y, COUNTER_D]);
  for (const s of seats) counter.slots.push({ id: `counter.${s.i}`, level: 0, x: s.x, y: SURFACE_Y, z: r3(hd - COUNTER_D / 2), accepts: SERVE.slice() });
  add('shutter', 'shutter', 0, 0, SURFACE_Y, hd - 0.025, Math.PI, [w, 1.2, 0.05]);
  add('wall_l', 'wall', 0, -(hw + DOOR_HALF) / 2, 0, 0, 0, [hw - DOOR_HALF, WALL_H, WALL_T]);
  add('wall_r', 'wall', 0, (hw + DOOR_HALF) / 2, 0, 0, 0, [hw - DOOR_HALF, WALL_H, WALL_T]);
  add('door', 'door', 0, 0, 0, 0, 0, SIZE.door);
  if (hitsAny(polys, { x0: -DOOR_HALF, x1: DOOR_HALF, z0: -0.4, z1: 0.4 })) warnings.push('door: препятствие в отвора на вратата; мястото ѝ е постоянно и не се мести');
  // копчетата за пода: по едно на вътрешното лице на тезгяха, срещу всяко място на клиент
  for (const s of seats) ctl(add(`btn_${s.i}`, 'button', 0, s.x, BTN_Y, hd - COUNTER_D - SIZE.button[2] / 2, Math.PI, SIZE.button, { seat: s.i }), 0, SIZE.button[1] / 2, 0);

  // ── асансьорът: в заден ъгъл на склада, опрян в две стени, на същото място и на двете нива.
  // Вратата му гледа по задната стена към средата; кабината и метърът пред вратата остават свободни.
  const EW = SIZE.elevator[0], ED = SIZE.elevator[2], EF = RULES.elevator.front;
  const cabinAt = (e) => (e > 0 ? { x0: hw - EW, x1: hw, z0: -hd, z1: -hd + ED } : { x0: -hw, x1: -hw + EW, z0: -hd, z1: -hd + ED });
  const frontAt = (e) => (e > 0 ? { x0: hw - EW - EF, x1: hw - EW, z0: -hd, z1: -hd + ED } : { x0: -hw + EW, x1: -hw + EW + EF, z0: -hd, z1: -hd + ED });
  const liftFree = (e) => !hitsAny(polys, cabinAt(e)) && !hitsAny(polys, frontAt(e));
  let e = 1;   // +1: десният заден ъгъл, −1: левият
  if (!liftFree(1)) {
    if (liftFree(-1)) e = -1;
    else warnings.push('elevator: препятствие и в двата задни ъгъла; асансьорът остава в десния');
  }
  const cab = cabinAt(e);
  const elevator = { x: r3((cab.x0 + cab.x1) / 2), z: r3((cab.z0 + cab.z1) / 2), w: EW, d: ED };
  const lift = [{ r: cab, acc: [frontAt(e)] }];

  const def = (id, kind, extra) => ({ id, kind, w: SIZE[kind][0], h: SIZE[kind][1], d: SIZE[kind][2], y: 0, ...extra });
  const bin = (gives) => def(`bin_${gives}`, 'bin', { gives });

  // ── ниво 0, магазинът: лява стена (от тезгяха към ъгъла), преградата вляво от вратата, вдясно от нея, дясна стена
  const shopRails = [
    { axis: 'z', from: hd - COUNTER_D, to: T, wall: -hw, nrm: 1, yaw: Math.PI / 2 },
    { axis: 'x', from: -hw, to: -DOOR_HALF, wall: T, nrm: 1, yaw: 0 },
    { axis: 'x', from: DOOR_HALF, to: hw, wall: T, nrm: 1, yaw: 0 },
    { axis: 'z', from: T, to: hd - COUNTER_D, wall: hw, nrm: -1, yaw: -Math.PI / 2 },
  ];
  const shopDefs = (trash) => [
    bin('pizza'), def('prep', 'prep'), bin('sauce'),
    bin('cheese'), def('oven', 'oven'), ...(trash ? [def('trash', 'trash')] : []),
    def('drinks', 'drinks'), bin('cup'), bin('meat'),
    bin('veg'),
  ];
  const zs = hd - COUNTER_D - STAND;
  const base = [{
    r: { x0: -hw, x1: hw, z0: hd - COUNTER_D, z1: hd },
    acc: seats.map((s) => ({ x0: s.x - 0.02, x1: s.x + 0.02, z0: zs - 0.02, z1: zs + 0.02 })),
  }];
  const packShop = (obst, clear) => packBest(shopRails, [0, 3, 1, 2],
    { defs: shopDefs(true), pref: [3, 3, 3, 1] }, { defs: shopDefs(false), pref: [3, 2, 3, 1], dropped: 'trash' }, base, obst, clear);

  // ── ниво 0, складът: кошът до хладилната врата, кашоните със съставките по задната стена към асансьора.
  // Релси: преградата вляво от вратата, лява стена, задна стена (без асансьора и вратата му), дясна стена, преградата вдясно
  const xa = e > 0 ? -hw : -hw + EW + EF, xb = e > 0 ? hw - EW - EF : hw;   // свободната част на задната стена
  const zl = e > 0 ? -hd : -hd + ED, zr = e > 0 ? -hd + ED : -hd;           // докъде стигат лявата и дясната стена отзад
  const storeRails = [
    { axis: 'x', from: -DOOR_HALF, to: -hw, wall: -T, nrm: -1, yaw: Math.PI },
    { axis: 'z', from: -T, to: zl, wall: -hw, nrm: 1, yaw: Math.PI / 2 },
    { axis: 'x', from: xa, to: xb, wall: -hd, nrm: 1, yaw: 0 },
    { axis: 'z', from: zr, to: -T, wall: hw, nrm: -1, yaw: -Math.PI / 2 },
    { axis: 'x', from: hw, to: DOOR_HALF, wall: -T, nrm: -1, yaw: Math.PI },
  ];
  const storeDefs = [def('trash_store', 'trash')];
  const packStore = (obst, clear) => packBest(storeRails, [1, 3, 2, 0, 4], { defs: storeDefs, pref: [1, 0, 0, 0, 0] }, null, lift, obst, clear);

  // ── ниво 1, лабораторията: цялата зала, по четирите стени. Обиколката почва от вратата на асансьора:
  // задната стена, срещуположната странична стена, предната стена, стената на асансьора
  const labRails = e > 0 ? [
    { axis: 'x', from: xb, to: -hw, wall: -hd, nrm: 1, yaw: 0 },
    { axis: 'z', from: -hd, to: hd, wall: -hw, nrm: 1, yaw: Math.PI / 2 },
    { axis: 'x', from: -hw, to: hw, wall: hd, nrm: -1, yaw: Math.PI },
    { axis: 'z', from: hd, to: zr, wall: hw, nrm: -1, yaw: -Math.PI / 2 },
  ] : [
    { axis: 'x', from: xa, to: hw, wall: -hd, nrm: 1, yaw: 0 },
    { axis: 'z', from: -hd, to: hd, wall: hw, nrm: -1, yaw: -Math.PI / 2 },
    { axis: 'x', from: hw, to: -hw, wall: hd, nrm: -1, yaw: Math.PI },
    { axis: 'z', from: hd, to: zl, wall: -hw, nrm: 1, yaw: Math.PI / 2 },
  ];
  const labDefs = (hop) => [
    def('grinder', 'grinder'), bin('tray'),
    ...(hop ? [def('hopper', 'hopper')] : []),
  ];
  const packLab = (obst, clear) => packBest(labRails, [1, 3, 0, 2],
    { defs: labDefs(true), pref: [1, 1, 1, 0] }, { defs: labDefs(false), pref: [1, 1, 0, 0], dropped: 'hopper' }, lift, obst, clear);

  // Една стая покрай препятствията. Ако нужните станции не се побират: първо с по-малко отстояние,
  // после без оглед на възможно най-малко препятствия (кои, пише в warnings).
  const fitRoom = (pack, rails, tag, name) => {
    const mine = [];   // само препятствията, които изобщо опират в стените на тази стая
    polys.forEach((poly, i) => {
      if (rails.some((r) => { const f = freeSpans(r, [poly], DEEP); return f.length !== 1 || Math.abs(f[0][1] - f[0][0] - Math.abs(r.to - r.from)) > EPS; })) mine.push(i);
    });
    const of = (list) => list.map((i) => polys[i]);
    let got = pack(of(mine), CLEAR);
    if (got || !mine.length) return got;
    got = pack(of(mine), TIGHT);
    if (got) { warnings.push(`${tag}: тясно е; ${name} е на по-малко от ${CLEAR} м от препятствие`); return got; }
    let left = mine.slice();
    const ignored = [];
    while (!got && left.length) {
      let drop = left[0];
      for (const i of left) {
        const res = pack(of(left.filter((j) => j !== i)), TIGHT);
        if (res) { got = res; drop = i; break; }
      }
      ignored.push(drop + 1);
      left = left.filter((j) => j !== drop);
    }
    if (got) warnings.push(`${tag}: станциите не се побират покрай препятствие ${ignored.join(', ')}; ${name} е без оглед на него`);
    return got;
  };
  const shop = fitRoom(packShop, shopRails, 'shop', 'магазинът');
  const store = fitRoom(packStore, storeRails, 'store', 'складът');
  const lab = fitRoom(packLab, labRails, 'lab', 'мазето');
  if (!shop || !store || !lab) throw new Error('backroom: залата е твърде малка за станциите');
  if (shop.dropped) warnings.push('trash: няма място за кош в магазина; остава кошът в склада (trash_store)');
  if (lab.dropped) warnings.push('hopper: няма място за казана в мазето; играта върви без него');

  const put = (res, level) => {
    for (const o of res.outs) {
      const q = o.def;
      const st = add(q.id, q.kind, level, o.cx, q.y, o.cz, o.rail.yaw, [q.w, q.h, q.d], q.gives ? { gives: q.gives } : null);
      for (const [lx, ly, lz, accepts] of SLOTS[q.kind] || []) slot(st, lx, ly, lz, accepts.slice());
      if (q.gives === 'meat') slot(st, 0, q.h, 0, ['meatbox']);      // тавата с месо се оставя върху кашона с месото
      if (q.kind === 'grinder') ctl(st, ...LEVER);
      if (q.kind === 'drinks') taps(st, SLOTS.drinks.map(([lx, ly, lz]) => [lx, ly + 0.32, lz]));
    }
  };
  put(shop.res, 0);
  put(store.res, 0);
  const yawE = e > 0 ? -Math.PI / 2 : Math.PI / 2;
  add('elevator', 'elevator', 0, elevator.x, 0, elevator.z, yawE, SIZE.elevator);
  put(lab.res, 1);
  add('elevator_1', 'elevator', 1, elevator.x, 0, elevator.z, yawE, SIZE.elevator);

  // табла: високо, над станциите. В магазина на лявата стена, в лабораторията на задната (над миксера);
  // ако там има препятствие: по същата стена до най-близкото свободно място, после на друга стена на същото място
  const sw = SIZE.sign[0], sd = SIZE.sign[2];
  const putSign = (id, level, walls) => {
    for (const wall of walls) {
      let at = null, far = Infinity;
      const spans = polys.length ? freeSpans(wall, polys, sd) : [[wall.from, wall.to]];
      for (const [a, b] of spans) {
        if (b - a < sw - EPS) continue;
        const c = clamp(wall.ideal, a + sw / 2, b - sw / 2);
        if (Math.abs(c - wall.ideal) < far) { far = Math.abs(c - wall.ideal); at = c; }
      }
      if (at === null) continue;
      const o = wall.wall + wall.nrm * sd / 2;
      add(id, 'sign', level, wall.axis === 'x' ? at : o, SIGN_Y, wall.axis === 'x' ? o : at, wall.yaw, SIZE.sign);
      return;
    }
    warnings.push(`${id}: няма свободна стена за таблото`);
  };
  putSign('sign_shop', 0, [
    { axis: 'z', from: T, to: hd - 0.05, wall: -hw, nrm: 1, yaw: Math.PI / 2, ideal: (T + hd) / 2 },
    { axis: 'z', from: T, to: hd - 0.05, wall: hw, nrm: -1, yaw: -Math.PI / 2, ideal: (T + hd) / 2 },
    { axis: 'x', from: -hw, to: -DOOR_HALF, wall: T, nrm: 1, yaw: 0, ideal: -(hw + DOOR_HALF) / 2 },
    { axis: 'x', from: DOOR_HALF, to: hw, wall: T, nrm: 1, yaw: 0, ideal: (hw + DOOR_HALF) / 2 },
  ]);
  putSign('sign_lab', 1, [
    { axis: 'x', from: e > 0 ? -hw : -hw + EW, to: e > 0 ? hw - EW : hw, wall: -hd, nrm: 1, yaw: 0, ideal: (xa + xb) / 2 },
    { axis: 'z', from: -hd, to: hd, wall: -e * hw, nrm: e, yaw: e * Math.PI / 2, ideal: 0 },
    { axis: 'x', from: -hw, to: hw, wall: hd, nrm: -1, yaw: Math.PI, ideal: 0 },
    { axis: 'z', from: -hd + ED, to: hd, wall: e * hw, nrm: -e, yaw: -e * Math.PI / 2, ideal: ED / 2 },
  ]);

  // каквото все пак е останало до препятствие (тезгяхът не се мести; или стаята е подредена по-нагъсто)
  for (const st of stations) {
    if (st.kind === 'wall' || st.kind === 'shutter' || st.kind === 'door' || st.kind === 'elevator' || st.kind === 'button') continue;
    const b = stationBox(st);
    if (!hitsAny(polys, { x0: b.x0 - CLEAR, x1: b.x1 + CLEAR, z0: b.z0 - CLEAR, z1: b.z1 + CLEAR })) continue;
    if (st.kind === 'counter') warnings.push('counter: тезгяхът е до препятствие; мястото му е постоянно');
    else warnings.push(hitsAny(polys, b) ? `${st.id}: застъпва препятствие` : `${st.id}: на по-малко от ${CLEAR} м от препятствие`);
  }

  const layout = { hall: { w, d }, stations, seats, obstacles: polys, warnings, elevator, levels: 2 };
  const bad = checkLayout(layout);
  if (bad.length) throw new Error(`backroom: невалидно подреждане: ${bad[0]}`);
  return layout;
}

// Проверка на подреждането, ниво по ниво: всичко е в залата, нищо не се застъпва (допирането е позволено,
// 2 мм толеранс), пред всяко гнездо може да се застане и пред вратата на асансьора е свободно.
export function checkLayout(layout) {
  const out = [];
  const hw = layout.hall.w / 2, hd = layout.hall.d / 2, tol = 0.002;
  const boxes = layout.stations.map(stationBox);
  const same = (i, j) => layout.stations[i].level === layout.stations[j].level;
  boxes.forEach((b, i) => {
    const id = layout.stations[i].id;
    if (b.x0 < -hw - tol || b.x1 > hw + tol || b.z0 < -hd - tol || b.z1 > hd + tol || b.y0 < -tol) out.push(`${id} е извън залата`);
    for (let j = i + 1; j < boxes.length; j++) {
      const c = boxes[j];
      if (same(i, j) && b.x0 < c.x1 - tol && c.x0 < b.x1 - tol && b.y0 < c.y1 - tol && c.y0 < b.y1 - tol && b.z0 < c.z1 - tol && c.z0 < b.z1 - tol) {
        out.push(`${id} застъпва ${layout.stations[j].id}`);
      }
    }
  });
  // пред всяко гнездо има къде да се застане
  layout.stations.forEach((st, i) => {
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    for (const q of st.slots) {
      const t = st.d / 2 + STAND - ((q.x - st.x) * fx + (q.z - st.z) * fz);
      const px = q.x + fx * t, pz = q.z + fz * t;
      if (t > REACH) out.push(`${q.id} е твърде навътре`);
      boxes.forEach((b, j) => {
        if (j !== i && same(i, j) && b.y0 < 0.5 && px > b.x0 + tol && px < b.x1 - tol && pz > b.z0 + tol && pz < b.z1 - tol) out.push(`пред ${q.id} стои ${layout.stations[j].id}`);
      });
    }
  });
  // метърът пред вратата на асансьора е свободен и на двете нива
  layout.stations.forEach((lift) => {
    if (lift.kind !== 'elevator') return;
    const fx = Math.sin(lift.yaw), fz = Math.cos(lift.yaw), reach = lift.d / 2 + RULES.elevator.front / 2;
    const cx = lift.x + fx * reach, cz = lift.z + fz * reach;
    const ex = Math.abs(fx) > 0.5 ? RULES.elevator.front / 2 : lift.w / 2, ez = Math.abs(fx) > 0.5 ? lift.w / 2 : RULES.elevator.front / 2;
    boxes.forEach((b, j) => {
      const st = layout.stations[j];
      if (st.level !== lift.level || st.kind === 'elevator' || b.y0 > 1.5) return;
      if (b.x0 < cx + ex - tol && cx - ex < b.x1 - tol && b.z0 < cz + ez - tol && cz - ez < b.z1 - tol) out.push(`${st.id} е пред вратата на асансьора`);
    });
  });
  return out;
}

// ───────── играта ─────────

// The menu: what customers order, simple ones first. Only pizzas whose every topping has a bin in this hall are ordered.
const MENU = [
  ['sauce', 'cheese'], ['sauce'], ['sauce', 'cheese', 'veg'], ['white', 'cheese', 'shrimp'], ['sauce', 'cheese', 'ham'],
  ['white', 'cheese', 'bacon'], ['sauce', 'cheese', 'greens'], ['sauce', 'cheese', 'ham', 'pineapple'], ['mustard', 'cheese', 'bacon', 'onion'], ['white', 'cheese', 'veg', 'shrimp'],
];

// ───────── сбито подреждане: малки зали и зони от няколко стаи (SPEC т. 13) ─────────
// Стая „а" е кухнята (ниво 0) и мазето (ниво 1). Тезгяхът е на стената +z. Втората стая (ниша) е
// кабината на асансьора: влизаш в нишата, натискаш бутона и слизаш. Кашоните са на три етажа един над друг.

const C_DEPTH = 0.50, C_COUNTER = 0.45, C_GAP = 0.02;
const TIERS = [[0, 0.85], [0.86, 0.36], [1.23, 0.36]];   // [y, височина] на кашоните в една колона

// Естествени размери: моделите на Synty без никакво мачкане. От всеки уред в зоната влиза само предната ивица
// (depth); останалото стои зад ръба ѝ, където човек не стъпва. top е височината на плота с гнездата.
const NAT = {
  depth: 0.40,
  // оригиналният тезгях на мапа (SM_Prop_Kitchen_Counter_02): от z 0.45 до 1.60, плот на 1.04; 0.70 м са в зоната. Тавите му с добавки са
  // си на мястото от мапа: от тях се взимат сосът, кашкавалът и гъбите (trays: [какво, x, z] в координатите на зоната)
  counter: { w: 2.50, d: 1.15, inside: 0.70, top: 1.04, serve: 0.85, button: 0.08, trays: [['sauce', -0.32, 0.92], ['cheese', 0.55, 1.13], ['greens', -0.73, 0.92], ['ham', 0.85, 0.92], ['shrimp', 0.50, 0.92], ['onion', 0.08, 0.92]] },
  oven: { w: 2.15, top: 1.00, mouth: -0.39 },                  // SM_Prop_Kitchen_Pizza_Oven_01: тухлена пещ върху масата си (2.15 x 4.18 x 2.28); подът ѝ е на 1.00, пицата влиза в устието на 0.59 м зад ръба на масата
  prep: { w: 1.73, top: 1.05 },                                // SM_Prop_Kitchen_Prep_Table_01 (1.73 x 1.05 x 1.03): тук се реди пицата
  // SM_Prop_Kitchen_Drinks_Machine_01 (1.05 x 1.15 x 0.90) stands on the floor: its drip tray is at 0.68 m, 0.10 m in front of the
  // middle of the strip, the nozzle head hangs over it from 0.825 m up. cups: where a cup stands [x along the machine]: the
  // middle nozzle (red label) is cola, the one with the orange label is orange.
  drinks: { w: 1.05, top: 0.85, tray: 0.68, out: 0.10, cups: [0, -0.13], press: 0.95 }, trash: { w: 0.41, top: 0.65 },
  rack: { w: 1.21, shelves: [0.92, 1.42, 0.42] },              // стелаж с рафтове на 0.42, 0.92 и 1.42 м; по три места на рафт
  shutter: { h: 3.02, d: 0.20 },
  // мазето (ниво 1)
  table: { w: 2.25, top: 0.92 },                               // SM_Prop_Table_Metal_01 (Gang Warfare): 2.25 x 0.92 x 0.88; върху нея са тавата и лостът на мелачката
  tank: { w: 1.37, h: 2.07 },                                  // SM_Prop_Lab_Tank_01: казанът под отворите в пода на пицарията
  wall: 1.097,                                                 // тухлата на стената е на толкова зад ръба на зоната (decor.js)
};

// The cellar lab in natural size. stash: the two-door freezer of the Shops Pack (SM_Prop_Market_Freezer_03, 1.97 x 2.43 x 1.03),
// cells = [x along the cabinet, height, what the shelf spot is for (null: free storage)]. grow: two buckets with plants
// under the lamp. bench: SM_Prop_Kitchen_Prep_Table_02 (1.09 x 1.05 x 1.03) with the shredder (left) and the mixer (right).
Object.assign(NAT, {
  stash: { w: 1.97, h: 2.43, handle: 1.15, cells: [
    [-0.70, 1.52, 'blue'], [-0.24, 1.52, 'clear'], [0.24, 1.52, 'red'], [0.70, 1.52, 'papers'],
    [-0.70, 1.17, 'seeds'], [-0.24, 1.17, null], [0.24, 1.17, null], [0.70, 1.17, null],
    [-0.70, 0.78, null], [-0.24, 0.78, null], [0.24, 0.78, null], [0.70, 0.78, null]] },
  grow: { w: 1.30, h: 1.90, pots: [-0.34, 0.34], pot: 0.50 },
  bench: { w: 1.09, top: 1.05, shred: -0.27, mix: 0.27 },
  bowls: [['white', -0.17, 0.07], ['mustard', 0.17, 0.07]],      // filled sauce bowls on the inner edge of the counter: [what, x, how far inside the edge]
});

export function buildCompactLayout(opts = {}) {
  const hallIn = opts.hall || {};
  const rooms = (Array.isArray(opts.rooms) && opts.rooms.length ? opts.rooms : [{ id: 'a', x: 0, z: 0, w: fin(hallIn.w) ? hallIn.w : 3, d: fin(hallIn.d) ? hallIn.d : 2 }])
    .map((r) => ({ id: String(r.id), x: r3(r.x || 0), z: r3(r.z || 0), w: r3(r.w), d: r3(r.d) }));
  const doors = (Array.isArray(opts.doors) ? opts.doors : []).map((q) => ({ a: q.a, b: q.b, x: r3(q.x), z: r3(q.z), w: r3(q.w), axis: q.axis }));
  const A = rooms[0], B = rooms[1] || null;
  const w = A.w, d = A.d, hw = w / 2, hd = d / 2;
  const polys = cleanObstacles(opts.obstacles);
  const warnings = [], stations = [];

  const add = (id, kind, level, x, y, z, yaw, size, extra) => {
    const st = { id, kind, level, room: 'a', x: r3(x), y: r3(y), z: r3(z), yaw: r3(yaw), w: r3(size[0]), h: r3(size[1]), d: r3(size[2]), ...extra, slots: [] };
    stations.push(st);
    return st;
  };
  const slot = (st, lx, ly, lz, accepts) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    st.slots.push({ id: `${st.id}.${st.slots.length}`, level: st.level, x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c), accepts });
  };
  // мястото на копчето или лоста на станцията (в координатите на залата): там посяга ръката, за да я задейства
  const ctl = (st, lx, ly, lz) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    st.btn = { x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c) };
    return st;
  };

  const taps = (st, list) => {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    st.taps = list.map(([lx, ly, lz]) => ({ x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c) }));
    return st;
  };
  // ── асансьорът ──
  let elevator, liftYaw, liftSize, cornerCut = 0;
  const door = B ? doors.find((q) => (q.a === A.id && q.b === B.id) || (q.a === B.id && q.b === A.id)) : null;
  if (B && door) {
    const alongZ = door.axis !== 'z';                 // общата стена върви по x: стая „b" продължава по z
    const len = alongZ ? B.d : B.w, wid = alongZ ? B.w : B.d;
    const away = alongZ ? (B.z > A.z ? 1 : -1) : (B.x > A.x ? 1 : -1);      // посоката от отвора към дъното
    if (len >= 2.4 && wid >= 1.2) {
      // дълга задна стая: кабината е само дъното ѝ (до 1,6 м), а пред нея остава склад (на ниво 1: пристройка на лабораторията)
      const depth = r3(Math.min(SIZE.elevator[2], len - 1.3));
      const off = away * (len / 2 - depth / 2);
      elevator = alongZ ? { x: B.x, z: r3(B.z + off), w: B.w, d: depth, room: B.id, whole: false, annex: true }
        : { x: r3(B.x + off), z: B.z, w: depth, d: B.d, room: B.id, whole: false, annex: true };
      liftSize = [wid, SIZE.elevator[1], depth];
    } else {                    // ниша: цялата е кабината; вратата ѝ е отворът към стая „а"
      elevator = { x: B.x, z: B.z, w: B.w, d: B.d, room: B.id, whole: true };
      liftSize = [wid, SIZE.elevator[1], len];
    }
    liftYaw = alongZ ? (away > 0 ? Math.PI : 0) : (away > 0 ? -Math.PI / 2 : Math.PI / 2);      // вратата гледа към отвора
  } else {                    // една стая: тясна кабина в задния ляв ъгъл, вратата ѝ гледа надясно по задната стена
    const side = Math.min(1.0, d - 0.9);
    elevator = { x: r3(-hw + side / 2), z: r3(-hd + side / 2), w: side, d: side, room: A.id, whole: false };
    liftYaw = Math.PI / 2; liftSize = [side, SIZE.elevator[1], side];
    cornerCut = side + 0.55;
    if (rooms.length === 1 && side < 0.9) warnings.push('elevator: стаята е много тясна; кабината е под 0,9 м');
  }

  // ── складът: стая „b" без кабината. Двете му дълги стени са релси (от отвора до вратата на асансьора) ──
  const storRails = [];
  if (B && door && elevator.annex) {
    const alongZ = door.axis !== 'z', away = alongZ ? (B.z > A.z ? 1 : -1) : (B.x > A.x ? 1 : -1);
    const gate = alongZ ? B.z - away * B.d / 2 : B.x - away * B.w / 2;                       // стената с отвора
    const cabin = alongZ ? elevator.z - away * elevator.d / 2 : elevator.x - away * elevator.w / 2;      // лицето на кабината
    const from = Math.min(gate + away * 0.5, cabin - away * 0.05), to = Math.max(gate + away * 0.5, cabin - away * 0.05);
    if (to - from > 0.3) {
      if (alongZ) storRails.push({ axis: 'z', wall: B.x - B.w / 2, nrm: 1, yaw: Math.PI / 2, from, to, room: B.id }, { axis: 'z', wall: B.x + B.w / 2, nrm: -1, yaw: -Math.PI / 2, from, to, room: B.id });
      else storRails.push({ axis: 'x', wall: B.z - B.d / 2, nrm: 1, yaw: 0, from, to, room: B.id }, { axis: 'x', wall: B.z + B.d / 2, nrm: -1, yaw: Math.PI, from, to, room: B.id });
    }
  }

  // ── релси: парчета стена, по които се редят станции. t е мястото по стената, nrm е навътре към стаята ──
  // задната стена (−z) по x; лявата (−x) и дясната (+x) по z. Отворите на вратите и ъгълът до тях се пазят свободни.
  const openOn = (axis, wall) => doors.filter((q) => q.axis === axis && Math.abs((axis === 'z' ? q.x : q.z) - wall) < 0.15)
    .map((q) => { const c = axis === 'z' ? q.z : q.x; return [c - q.w / 2 - 0.12, c + q.w / 2 + 0.12]; });
  const cutSpans = (from, to, cuts) => {
    let spans = [[from, to]];
    for (const [a, b] of cuts) spans = spans.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.min(e, a)], [Math.max(s, b), e]])).filter(([s, e]) => e - s > 0.28);
    return spans;
  };
  // препятствие, което стига до ивицата пред стената, също реже релсата
  const obstCuts = (axis, wall, nrm, depth) => polys.map((poly) => {
    const along = poly.map((p) => (axis === 'x' ? p[0] : p[1])), across = poly.map((p) => (axis === 'x' ? p[1] : p[0]));
    const lo = Math.min(wall, wall + nrm * (depth + 0.15)), hi = Math.max(wall, wall + nrm * (depth + 0.15));
    return Math.max(...across) < lo || Math.min(...across) > hi ? null : [Math.min(...along) - 0.12, Math.max(...along) + 0.12];
  }).filter(Boolean);
  const doorNear = (axis, wall, lo, hi) => openOn(axis, wall).some(([a, b]) => a < hi && b > lo);   // отвор в този край на съседната стена
  const railsFor = (level) => {
    const zTop = level === 0 ? hd - C_COUNTER - 0.02 : hd - 0.02;      // на ниво 0 предната стена е тезгяхът
    const backFrom = -hw + cornerCut + (doorNear('z', -hw, -hd, -hd + C_DEPTH + 0.1) ? 0.5 : 0);
    const backTo = hw - (doorNear('z', hw, -hd, -hd + C_DEPTH + 0.1) ? 0.5 : 0);
    const list = [];
    for (const [a, b] of cutSpans(backFrom, backTo, [...openOn('x', -hd), ...obstCuts('x', -hd, 1, C_DEPTH)])) list.push({ axis: 'x', wall: -hd, nrm: 1, yaw: 0, from: a, to: b });
    const sideFrom = -hd + C_DEPTH + 0.02;
    if (!cornerCut) for (const [a, b] of cutSpans(sideFrom, zTop, [...openOn('z', -hw), ...obstCuts('z', -hw, 1, C_DEPTH)])) list.push({ axis: 'z', wall: -hw, nrm: 1, yaw: Math.PI / 2, from: a, to: b });
    else for (const [a, b] of cutSpans(-hd + elevator.d + 0.1, zTop, [...openOn('z', -hw), ...obstCuts('z', -hw, 1, C_DEPTH)])) list.push({ axis: 'z', wall: -hw, nrm: 1, yaw: Math.PI / 2, from: a, to: b });
    for (const [a, b] of cutSpans(sideFrom, zTop, [...openOn('z', hw), ...obstCuts('z', hw, -1, C_DEPTH)])) list.push({ axis: 'z', wall: hw, nrm: -1, yaw: -Math.PI / 2, from: a, to: b });
    if (level === 1) for (const [a, b] of cutSpans(-hw + C_DEPTH + 0.05, hw - C_DEPTH - 0.05, [...openOn('x', hd), ...obstCuts('x', hd, -1, C_DEPTH)])) list.push({ axis: 'x', wall: hd, nrm: -1, yaw: Math.PI, from: a, to: b });
    for (const r of storRails) list.push(r);
    return list.map((r) => ({ ...r, at: r.from }));
  };

  // ── редене: станциите вървят по ред; която не се побере в остатъка от релсата, отива на следващата ──
  const one = (id, kind, width, extra) => ({ id, kind, w: width, h: SIZE[kind][1], d: Math.min(SIZE[kind][2], C_DEPTH), y: 0, ...extra });
  const column = (...gives) => ({ column: gives, w: 0.30, d: 0.30 });
  const place = (level, list, optional) => {
    for (const k of [1, 0.93, 0.86, 0.8, 0.74]) {
      const items = list.map((it) => (it.column ? it : { ...it, w: r3(it.w * k) }));
      const mark = stations.length;
      const left = tryPlace(level, items);
      const must = left.filter((it) => !(optional.has(it.id) || (it.column && it.column.every((g) => optional.has(g)))));
      if (!must.length || k === 0.74) {
        for (const it of left) {
          const name = it.column ? `кашони ${it.column.join(', ')}` : it.id;
          if (must.includes(it)) throw new Error(`backroom: стаята е твърде малка: няма място за ${name}`);
          warnings.push(`${name}: няма място, играта върви без това`);
        }
        if (k < 1) warnings.push(`ниво ${level}: станциите са стеснени до ${Math.round(k * 100)}%`);
        return;
      }
      stations.length = mark;      // не стана: махаме сложеното и пробваме по-тясно
    }
  };
  const tryPlace = (level, items) => {
    const rails = railsFor(level), left = [];
    for (const it of items) {
      // нещата за склада (store) търсят първо място там; останалите първо на щанда
      const fits = (r) => r.to - r.at >= it.w - 1e-6;
      const rail = rails.filter((r) => (it.store ? r.room && r.room !== 'a' : !r.room || r.room === 'a')).find(fits) || rails.find(fits);
      if (!rail) { left.push(it); continue; }
      const t = rail.at + it.w / 2;
      rail.at += it.w + C_GAP;
      const off = rail.wall + rail.nrm * it.d / 2;
      const x = rail.axis === 'x' ? t : off, z = rail.axis === 'x' ? off : t;
      if (it.column) {
        it.column.forEach((gives, i) => {
          const b = add(`bin_${gives}`, 'bin', level, x, TIERS[i][0], z, rail.yaw, [0.30, TIERS[i][1], 0.30], { gives, tier: i, room: rail.room || 'a' });
          if (gives === 'meat') slot(b, 0, TIERS[i][1], 0, ['meatbox']);
        });
        continue;
      }
      const st = add(it.id, it.kind, level, x, it.y, z, rail.yaw, [it.w, it.h, it.d], { ...(it.gives ? { gives: it.gives } : null), room: rail.room || 'a' });
      const k = it.w / SIZE[it.kind][0];      // стеснена станция: гнездата се събират заедно с нея
      for (const [lx, ly, lz, accepts] of SLOTS[it.kind] || []) slot(st, lx * Math.min(1, k), ly, Math.min(lz, it.d / 2 - 0.05), accepts.slice());
      if (it.kind === 'grinder') ctl(st, LEVER[0] * Math.min(1, k), LEVER[1], LEVER[2]);
      if (it.kind === 'drinks') taps(st, SLOTS.drinks.map(([lx, ly, lz]) => [lx * Math.min(1, k), ly + 0.32, Math.min(lz, it.d / 2 - 0.05)]));
    }
    return left;
  };

  // ── ниво 0 в естествен размер: скара и фритюрник на двете странични стени на щанда, машината за напитки и
  // стелажът с продуктите в склада, сглобяването върху тезгяха. Става при щанд с дълга задна стая зад него;
  // иначе (или ако нещо не се побира) остава сбитото подреждане по-долу. ──
  const natPlan = (() => {
    if (opts.natural === false || !B || !door || !elevator.annex || door.axis === 'z' || B.z > A.z) return null;
    const N = NAT, zc = hd - N.counter.inside;                    // вътрешният ръб на тезгяха
    if (w - 2 * N.depth < 1.2 || w > N.counter.w + 0.2) return null;
    for (const poly of polys) for (const r of rooms) {            // препятствие вътре в стая: сбитото подреждане ги заобикаля
      const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
      if (Math.max(...xs) > r.x - r.w / 2 + 0.06 && Math.min(...xs) < r.x + r.w / 2 - 0.06 && Math.max(...zs) > r.z - r.d / 2 + 0.06 && Math.min(...zs) < r.z + r.d / 2 - 0.06) return null;
    }
    const bx0 = B.x - B.w / 2, bx1 = B.x + B.w / 2, cabin = elevator.z + elevator.d / 2;
    // уредът може да стърчи зад задния ръб на щанда; ако там е другата стая, само малко
    const inB = (sd) => { const a = sd < 0 ? -hw : hw - N.depth; return a < bx1 - 0.05 && a + N.depth > bx0 + 0.05; };
    const over = (sd) => (inB(sd) ? 0.25 : 0.70);
    const len = (sd) => zc + hd + over(sd);
    let gs = 1;                                                   // от коя страна е пещта (масата за редене е отсреща)
    if (!(len(1) >= N.oven.w && len(-1) >= N.prep.w)) { if (len(-1) >= N.oven.w && len(1) >= N.prep.w) gs = -1; else return null; }
    // складът: двете дълги стени на стая „b" от кабината до отвора; където уред стърчи в нея, релсата е по-къса
    const rail = (sd) => { const to = inB(sd) ? -hd - over(sd) - 0.02 : -hd; return { sd, wall: sd < 0 ? bx0 : bx1, from: cabin, to, len: to - cabin }; };
    const rl = rail(-1), rr = rail(1);
    // стелажът отива до стена без препятствие зад нея (ръката влиза между рафтовете); машината за напитки е отсреща
    const blocked = (r) => polys.some((poly) => poly.some((q) => (r.sd < 0 ? q[0] < r.wall + 0.05 && q[0] > r.wall - 0.6 : q[0] > r.wall - 0.05 && q[0] < r.wall + 0.6) && q[1] > r.from - 0.1 && q[1] < r.to + 0.1));
    const fits = (a, b) => a.len >= N.rack.w - 1e-6 && b.len >= N.drinks.w - 1e-6;
    const pair = [[rl, rr], [rr, rl]].find(([a, b]) => fits(a, b) && !blocked(a)) || [[rl, rr], [rr, rl]].find(([a, b]) => fits(a, b));
    if (!pair) return null;
    return { zc, gs, rack: pair[0], drinks: pair[1] };
  })();
  const addNatural = (P) => {
    const N = NAT, { zc, gs } = P, half = N.depth / 2;
    const yawOf = (sd) => (sd < 0 ? Math.PI / 2 : -Math.PI / 2);          // лицето гледа навътре към стаята
    // пещта: пицата влиза в устието ѝ (едно място), зад ръба на масата
    const oven = add('oven', 'oven', 0, gs * (hw - half), 0, zc - N.oven.w / 2, yawOf(gs), [N.oven.w, N.oven.top, N.depth], { nat: 1, room: 'a' });
    slot(oven, 0, N.oven.top, N.oven.mouth, ['pizza']);
    // масата за редене отсреща: две пици една до друга
    const prep = add('prep', 'prep', 0, -gs * (hw - half), 0, zc - N.prep.w / 2, yawOf(-gs), [N.prep.w, N.prep.top, N.depth], { nat: 1, room: 'a' });
    for (const lx of [-0.42, 0.42]) slot(prep, lx, N.prep.top, -0.12, ['pizza']);
    // машината за напитки: две чаши на решетката ѝ (0 = кола, 1 = портокал)
    const dr = P.drinks, drinks = add('drinks', 'drinks', 0, dr.wall - dr.sd * half, 0, dr.to - N.drinks.w / 2, yawOf(dr.sd), [N.drinks.w, N.drinks.top, N.depth], { nat: 1, room: B.id });
    for (const lx of N.drinks.cups) slot(drinks, lx, N.drinks.tray, N.drinks.out, ['cup']);
    taps(drinks, N.drinks.cups.map((lx) => [lx, N.drinks.press, 0.2]));
    // стелажът: три колони по три рафта; средният кашон на средния рафт носи самия стелаж (rack)
    const rk = P.rack, yaw = yawOf(rk.sd), cw = N.rack.w / 3, zm = rk.to - N.rack.w / 2;
    for (const [gives, bx, bz] of N.counter.trays) add(`bin_${gives}`, 'bin', 0, bx, N.counter.top - 0.06, bz, Math.PI, [0.30, 0.10, 0.30], { gives, nat: 1, tray: 1, room: 'a' });
    for (const [gives, bx, dz] of N.bowls) add(`bin_${gives}`, 'bin', 0, bx, N.counter.top, zc + dz, Math.PI, [0.16, 0.05, 0.13], { gives, nat: 1, bowl: 1, room: 'a' });
    [['pizza', 'bacon'], ['meat', 'pineapple'], ['cup', 'veg']].forEach((col, j) => col.forEach((gives, i) => {
      const lx = (j - 1) * cw;
      const b = add(`bin_${gives}`, 'bin', 0, rk.wall - rk.sd * half, N.rack.shelves[i], zm - lx * Math.sin(yaw), yaw, [r3(cw - 0.02), 0.14, N.depth],
        { gives, tier: i, room: B.id, nat: 1, ...(i === 0 && j === 1 ? { rack: 1 } : null) });
      if (gives === 'meat') slot(b, 0, 0.16, 0, ['meatbox']);      // тавата с месо се оставя на рафта с месото
    }));
    // кошът: на задната стена на щанда, до отвора към склада
    const spans = cutSpans(-hw + N.depth + 0.02, hw - N.depth - 0.02, openOn('x', -hd)).filter(([a, b]) => b - a >= N.trash.w + 0.04);
    if (spans.length) {
      const [a, b] = spans.reduce((u, v) => (v[1] - v[0] > u[1] - u[0] ? v : u));
      const trash = add('trash', 'trash', 0, (a + b) / 2, 0, -hd + N.trash.w / 2, 0, [N.trash.w, N.trash.top, N.trash.w], { nat: 1, room: 'a' });
      slot(trash, 0, N.trash.top, 0, ITEM_KINDS.slice());
    } else warnings.push('trash: няма място, играта върви без кош');
  };

  // ── ниво 0: щандът ──
  const want = clamp(Math.floor(w / 1.1 + 1e-9), 1, 5);
  const step = want > 1 ? Math.min(1.4, (w - 1.0) / (want - 1)) : 0;
  // препятствие до тезгяха: мястото пред него не става; клиентът се мести встрани или отпада
  const busyX = polys.filter((poly) => Math.max(...poly.map((p) => p[1])) > hd - C_COUNTER - 0.6)
    .map((poly) => [Math.min(...poly.map((p) => p[0])) - 0.3, Math.max(...poly.map((p) => p[0])) + 0.3]);
  const freeX = cutSpans(-hw + 0.3, hw - 0.3, busyX);
  const seats = [];
  const seatZ = hd + 0.45 + (natPlan ? NAT.counter.d - NAT.counter.inside : 0);      // клиентът стои зад външния ръб на тезгяха
  for (let i = 0; i < want; i++) {
    const ideal = (i - (want - 1) / 2) * step;
    let x = null, far = Infinity;
    for (const [a, b] of freeX) { const c = clamp(ideal, a, b); if (Math.abs(c - ideal) < far) { far = Math.abs(c - ideal); x = c; } }
    if (x === null || seats.some((s) => Math.abs(s.x - x) < 0.7)) continue;
    seats.push({ i: seats.length, x: r3(x), z: r3(seatZ) });
  }
  if (!seats.length) seats.push({ i: 0, x: 0, z: r3(seatZ) });
  if (seats.length < want) warnings.push(`counter: места за клиенти ${seats.length} вместо ${want} заради препятствие`);
  const counter = natPlan
    ? add('counter', 'counter', 0, 0, 0, hd - NAT.counter.inside / 2, Math.PI, [w, NAT.counter.top, NAT.counter.inside], { nat: 1 })
    : add('counter', 'counter', 0, 0, 0, hd - C_COUNTER / 2, Math.PI, [w, SURFACE_Y, C_COUNTER]);
  for (const s of seats) counter.slots.push({ id: `counter.${s.i}`, level: 0, x: s.x, y: natPlan ? NAT.counter.top + 0.02 : SURFACE_Y, z: r3(natPlan ? natPlan.zc + NAT.counter.serve : hd - C_COUNTER / 2), accepts: SERVE.slice() });
  // копчетата за пода: срещу всяко място на клиент. В естествен размер са върху вътрешния ръб на тезгяха, иначе на лицето му
  for (const s of seats) {
    if (natPlan) ctl(add(`btn_${s.i}`, 'button', 0, s.x, NAT.counter.top, natPlan.zc + NAT.counter.button, Math.PI, [0.14, 0.05, 0.14], { seat: s.i, nat: 1 }), 0, 0.03, 0);
    else ctl(add(`btn_${s.i}`, 'button', 0, s.x, BTN_Y, hd - C_COUNTER - SIZE.button[2] / 2, Math.PI, SIZE.button, { seat: s.i }), 0, SIZE.button[1] / 2, 0);
  }
  // ролетката: в естествен размер е цялото крило (от пода), в равнината на гишето; вдига се нагоре
  if (natPlan) add('shutter', 'shutter', 0, 0, 0, hd + 0.05, Math.PI, [NAT.counter.w, NAT.shutter.h, NAT.shutter.d], { nat: 1 });
  else add('shutter', 'shutter', 0, 0, SURFACE_Y, hd - 0.025, Math.PI, [w, 1.2, 0.05]);
  const full = (id, kind, extra) => one(id, kind, SIZE[kind][0], extra);      // пълната ширина от SPEC т. 3
  if (natPlan) addNatural(natPlan);
  else place(0, [
    full('prep', 'prep'), full('oven', 'oven'), full('drinks', 'drinks'),
    column('pizza', 'sauce', 'cheese'), { ...column('cup', 'meat', 'veg'), store: true },
    full('trash', 'trash', { store: true }),
    column('white', 'mustard', 'shrimp'), { ...column('ham', 'bacon', 'pineapple'), store: true }, { ...column('onion', 'greens'), store: true },
  ], new Set(['trash', 'white', 'mustard', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion', 'greens']));
  add('elevator', 'elevator', 0, elevator.x, 0, elevator.z, liftYaw, liftSize, { room: elevator.room, whole: elevator.whole });

  // ── ниво 1: мазето ──
  // В естествен размер (при същия план като горе): стоманената маса на мелачката на лявата стена на стая „а" (тавата
  // вляво, лостът вдясно), казанът на предната стена (точно под отворите в пода на пицарията), кошът на задната,
  // а в стая „b" стелажът с празните тави. В зоната влиза само предната ивица (NAT.depth) на всяко нещо.
  const labPlan = (() => {
    if (!natPlan) return null;
    const N = NAT;
    if (d < N.table.w - 1e-6) return null;
    const cabin = elevator.z + elevator.d / 2;
    const rail = (sd) => ({ sd, wall: B.x + sd * B.w / 2, from: cabin, to: -hd, len: -hd - cabin });
    const rack = rail(natPlan.rack.sd);
    return rack.len >= N.rack.w - 1e-6 ? { rack } : null;
  })();
  const addNaturalLab = (P) => {
    const N = NAT, T = N.table, half = N.depth / 2;
    const yawOf = (sd) => (sd < 0 ? Math.PI / 2 : -Math.PI / 2);          // лицето гледа навътре към стаята
    const gr = add('grinder', 'grinder', 1, -(hw - half), 0, 0, yawOf(-1), [T.w, T.top, N.depth], { nat: 1, rack: 1, room: 'a' });
    slot(gr, -0.45, T.top, 0, ['tray', 'meatbox']);
    ctl(gr, 0.35, T.top + 0.22, 0);
    const labOn = opts.lab !== false;
    if (labOn && w - 2 * N.depth - 0.04 >= N.grow.w) {
      const gw = add('grow', 'grow', 1, 0, 0, hd - half, Math.PI, [N.grow.w, N.grow.h, N.depth], { nat: 1, room: 'a', gives: 'plant' });
      for (const lx of N.grow.pots) slot(gw, lx, N.grow.pot, 0, ['seeds']);
    } else if (w - 2 * N.depth - 0.04 >= N.tank.w) add('hopper', 'hopper', 1, 0, 0, hd - half, Math.PI, [N.tank.w, N.tank.h, N.depth], { nat: 1, room: 'a' });
    else warnings.push('hopper: няма място, играта върви без това');
    if (labOn && d >= N.stash.w + 0.1) {
      const sh = add('stash', 'stash', 1, hw - half, 0, 0, yawOf(1), [N.stash.w, N.stash.h, N.depth], { nat: 1, room: 'a' });
      for (const [lx, ly, kind] of N.stash.cells) slot(sh, lx, ly, 0, kind ? [kind] : STASH_ANY.slice());
      sh.shelf = N.stash.cells.map((c) => c[2]);
      taps(sh, [[0, N.stash.handle, 0.2], ...N.stash.cells.map(([lx, ly]) => [lx, ly + 0.05, 0.06])]);
    } else if (labOn) warnings.push('stash: no room for the cabinet; the game runs without the lab');
    const dr = natPlan.drinks;
    if (labOn && dr.len >= N.bench.w - 1e-6) {
      const bn = add('bench', 'bench', 1, dr.wall - dr.sd * half, 0, dr.to - N.bench.w / 2, yawOf(dr.sd), [N.bench.w, N.bench.top, N.depth], { nat: 1, room: B.id });
      slot(bn, N.bench.shred, N.bench.top + 0.46, 0, ['plant', 'buds']);      // on top of the shredder's jug
      slot(bn, 0, N.bench.top, 0.03, SELL.slice());                           // the product comes out between the two machines
      // what is pressed: the shredder's button, the mixer's button; the third point is the mouth of the mixer (liquids are poured there)
      taps(bn, [[N.bench.shred, N.bench.top + 0.10, 0.17], [N.bench.mix, N.bench.top + 0.10, 0.17], [N.bench.mix, N.bench.top + 0.52, 0]]);
    } else if (labOn) warnings.push('bench: no room for the lab bench');
    // стелажът с празните тави: в стая „b", на същата стена като стелажа горе
    const rk = P.rack, yaw = yawOf(rk.sd), cw = N.rack.w / 3, zm = (rk.from + rk.to) / 2;
    add('bin_tray', 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[0], zm, yaw, [r3(cw * 3 - 0.02), 0.14, N.depth], { gives: 'tray', tier: 0, room: B.id, nat: 1, rack: 1 });
    // кошът: на задната стена на стая „а", до отвора (на същото място като горе)
    const spans = cutSpans(-hw + N.depth + 0.02, hw - N.depth - 0.02, openOn('x', -hd)).filter(([a, b]) => b - a >= N.trash.w + 0.04);
    if (spans.length) {
      const [a, b] = spans.reduce((u, v) => (v[1] - v[0] > u[1] - u[0] ? v : u));
      const trash = add('trash_lab', 'trash', 1, (a + b) / 2, 0, -hd + N.trash.w / 2, 0, [N.trash.w, N.trash.top, N.trash.w], { nat: 1, room: 'a' });
      slot(trash, 0, N.trash.top, 0, ITEM_KINDS.slice());
    } else warnings.push('trash_lab: няма място, играта върви без това');
  };
  if (labPlan) addNaturalLab(labPlan);
  else place(1, [
    full('grinder', 'grinder'), column('tray'),
    full('hopper', 'hopper'), full('trash_lab', 'trash'),
  ], new Set(['hopper', 'trash_lab']));
  add('elevator_1', 'elevator', 1, elevator.x, 0, elevator.z, liftYaw, liftSize, { room: elevator.room, whole: elevator.whole });

  // табла: високо на лявата стена (над станциите), с ширина колкото позволява стената
  const signW = Math.min(SIZE.sign[0], d - 0.5);
  add('sign_shop', 'sign', 0, -hw + SIZE.sign[2] / 2, 1.7, cornerCut ? Math.min(hd - signW / 2 - 0.4, 0.2) : -0.15, Math.PI / 2, [signW, SIZE.sign[1], SIZE.sign[2]]);
  add('sign_lab', 'sign', 1, labPlan ? -hw - NAT.wall + SIZE.sign[2] / 2 : -hw + SIZE.sign[2] / 2, 1.7, cornerCut ? Math.min(hd - signW / 2 - 0.1, 0.2) : 0, Math.PI / 2, [signW, SIZE.sign[1], SIZE.sign[2]]);

  for (const st of stations) if (st.kind === 'elevator') st.room = elevator.room;
  return { hall: { w: r3(w), d: r3(d) }, stations, seats, obstacles: polys, warnings, elevator, levels: 2, rooms, doors, plan: 'compact', natural: !!natPlan };
}

export function createGame(opts = {}) {
  const theme = opts.theme === 'kids' ? 'kids' : 'night';
  const kids = theme === 'kids';
  const TX = TEXT[theme];
  const speed = opts.fast ? RULES.fastDiv : 1;
  const S = (sec) => sec / speed;
  const seed = fin(opts.seed) ? opts.seed : 1;
  const rand = rng(seed);
  // малка зала или зона от няколко стаи: сбитото подреждане; иначе пълното (кухня + склад + мазе)
  const compact = (Array.isArray(opts.rooms) && opts.rooms.length > 0) || (opts.hall && fin(opts.hall.w) && fin(opts.hall.d) && (opts.hall.w < 4 || opts.hall.d < 4));
  const layout = compact ? buildCompactLayout({ ...opts, lab: !kids && opts.lab !== false }) : buildLayout(opts.hall, opts.obstacles);
  const hall = layout.hall;
  const seatZ = layout.seats[0].z, farZ = seatZ + 2.6;

  const duration = {};
  for (const p of PHASES) duration[p] = r3(S(RULES.phases[p]));
  const startJson = JSON.stringify({ game: 'backroom', theme, hall, stations: layout.stations, seats: layout.seats, duration,
    obstacles: layout.obstacles, warnings: layout.warnings, elevator: layout.elevator, levels: layout.levels,
    rooms: layout.rooms || [{ id: 'a', x: 0, z: 0, w: hall.w, d: hall.d }], doors: layout.doors || [], plan: layout.plan || 'full',
    natural: !!layout.natural, trap: { r: 0.5, fall: r3(S(RULES.trap.fall)) } });

  const stationById = new Map();
  const slotById = new Map();
  const slotList = [];
  const surfaces = [];
  for (const st of layout.stations) {
    const rec = { st, level: st.level, box: stationBox(st), slots: [] };
    stationById.set(st.id, rec);
    if (SURFACES.has(st.kind)) surfaces.push(rec);
    st.slots.forEach((s, idx) => {
      const sl = { id: s.id, level: st.level, x: s.x, y: s.y, z: s.z, accepts: s.accepts, kind: st.kind, st: rec, idx, item: null };
      rec.slots.push(sl);
      slotById.set(s.id, sl);
      slotList.push(sl);
    });
  }
  const grinderRec = stationById.get('grinder');
  const meatRec = stationById.get('bin_meat') || null;
  const serveSlots = stationById.get('counter').slots;
  const liftRec = stationById.get('elevator');
  const liftIds = layout.stations.filter((st) => st.kind === 'elevator').map((st) => st.id);
  const buttonIds = layout.stations.filter((st) => st.kind === 'button').map((st) => st.id);
  const cab = liftRec.box;   // подът на кабината: едно и също място на двете нива
  // the cellar lab (not in the kids theme): the secret cabinet, the plants, the bench with the shredder and the mixer
  const stashRec = stationById.get('stash') || null, growRec = stationById.get('grow') || null, benchRec = stationById.get('bench') || null;
  const labOn = !kids && !!stashRec;
  let stashOpen = 0, stashWant = 0;
  const pending = [];                                                 // orders on their way to a shelf: { idx, kind, at }
  const pots = growRec ? growRec.slots.map(() => ({ s: 1 })) : [];   // 1: a grown plant, 0: empty bucket, between: growing
  const shred = { until: 0, by: null }, mixer = { mix: [], pure: false, until: 0, by: null };
  const stashShut = () => stashWant === 0 && stashOpen < 0.5;
  const menu = MENU.filter((st) => st.every((k) => stationById.has(`bin_${k}`)));

  const t0 = fin(opts.now) ? opts.now : 0;
  let nowMs = t0, time = 0;                 // time: секунди от началото
  let phase = 'tutorial', phaseEnd = S(RULES.phases.tutorial);
  let money = 0, cover = RULES.cover.start, suspicion = 0;
  let over = false, result = null;
  let nextItem = 1, nextCustomer = 1, nextEvent = 1;
  const items = new Map();
  const players = new Map();
  const gone = new Map();                   // излезлите: пазим им точките за резултата
  const customers = [];
  let events = [];
  const seatBusy = layout.seats.map(() => false);
  // подът под всяко място на клиент: closed → opening → open → closing
  const traps = layout.seats.map(() => ({ open: 0, state: 'closed', until: 0 }));
  let tutorialSpawned = 0, tutorialServed = 0, nextSpawnAt = Infinity, peak = 0;
  let zone = [0.35, 0.67], grindCool = 0, grindHits = 0, grindMisses = 0;
  let hopper = 0, falling = [], meatStock = 0, dropped = 0;      // hopper: товар, който чака мелачката; falling: кога пристига падащият
  let doorOpen = 0, shutterOpen = 1;
  let patrol = null, nextPatrolAt = Infinity;
  // асансьорът: idle → closing (вратите се затварят) → moving → opening (на другото ниво) → idle
  const skipTo = PHASES.includes(opts.skipTo) ? opts.skipTo : null;      // само за проби
  const lift = { level: 0, phase: 'idle', until: 0, doors: 1, to: 0, riders: [] };

  // ── събития ──
  function emit(kind, f) {
    const e = { id: nextEvent++, kind, at: nowMs };
    if (f) {
      for (const k of ['x', 'y', 'z', 'amount', 'level', 'to', 'seat']) if (fin(f[k])) e[k] = r3(f[k]);
      if (f.player !== undefined && f.player !== null) e.player = f.player;
      if (typeof f.text === 'string') e.text = f.text;
    }
    events.push(e);
    if (events.length > 80) events.splice(0, events.length - 80);
    return e;
  }
  // място и ниво на гнездо или предмет, за събитие
  const at = (o, more) => ({ x: o.x, y: o.y, z: o.z, level: o.level, ...more });
  function refuse(pl, pos, key) {
    const text = TX.deny[key] || TX.deny.bad;
    emit('deny', { player: pl.id, text, level: pl.level, ...(pos || {}) });
    return { ok: false, reason: key, text };
  }

  // ── играчи и пози ──
  const headPos = (pl) => (pl.pose ? { x: pl.pose[0], y: pl.pose[1], z: pl.pose[2] } : null);
  function handPos(pl, hand) {
    if (!pl.pose) return null;
    const o = hand === 'l' ? 7 : 14;
    return { x: pl.pose[o], y: pl.pose[o + 1], z: pl.pose[o + 2] };
  }
  const evening = () => phase === 'night' || phase === 'rush';
  const labOpen = () => phase !== 'tutorial' && phase !== 'over';      // the cellar opens with the first working day
  const addSus = (a) => { suspicion = Math.min(1, suspicion + a * (1 - RULES.cover.shield * cover)); };
  const addCover = (a) => { cover = clamp(cover + a, 0, 1); };
  const pubPlayer = (pl) => ({ id: pl.id, n: pl.n, name: pl.name, served: pl.served, cooked: pl.cooked, packed: pl.packed, drops: pl.drops, mistakes: pl.mistakes });

  function join(id, info) {
    let pl = players.get(id);
    if (!pl) {
      pl = gone.get(id) || { id, n: players.size + gone.size + 1, name: '', served: 0, cooked: 0, packed: 0, drops: 0, mistakes: 0 };
      gone.delete(id);
      pl.pose = null;
      pl.hands = { l: null, r: null };
      pl.level = 0;   // всеки започва на уличното ниво
      players.set(id, pl);
    }
    if (info && fin(info.n)) pl.n = info.n;
    if (info && typeof info.name === 'string') pl.name = info.name;
    peak = Math.max(peak, players.size);
  }

  function leave(id) {
    const pl = players.get(id);
    if (!pl) return;
    for (const h of ['l', 'r']) {
      const it = pl.hands[h] != null ? items.get(pl.hands[h]) : null;
      if (!it) continue;
      const p = handPos(pl, h) || headPos(pl) || { x: 0, y: 0, z: 0 };
      detach(it);
      toFloor(it, p, pl.level);
    }
    players.delete(id);
    pl.pose = null;
    pl.hands = { l: null, r: null };
    gone.set(id, pl);
  }

  function pose(id, p) {
    const pl = players.get(id);
    if (!pl || !p || !(p.length >= 21)) return;
    const q = new Array(21);
    for (let i = 0; i < 21; i++) { if (!fin(p[i])) return; q[i] = p[i]; }
    pl.pose = q;
  }

  // ── предмети ──
  function initState(kind) {
    switch (kind) {
      case 'pizza': return { stack: [], cook: 0, ball: true };      // ball: още е топка тесто (докато не легне някъде)
      case 'cup': return { fill: 0, drink: null };
      case 'blue': return { shake: 0 };
      case 'ice': return { pure: 0 };
      default: return {};
    }
  }
  function newItem(kind, level) {
    const it = { id: nextItem++, kind, level, x: 0, y: 0, z: 0, yaw: 0, holder: null, hand: null, slot: null, state: initState(kind),
      floor: false, poofAt: 0, by: null, pour: false };
    items.set(it.id, it);
    return it;
  }
  function detach(it) {
    if (it.slot != null) {
      const s = slotById.get(it.slot);
      if (s && s.item === it.id) s.item = null;
      it.slot = null;
    }
    if (it.holder != null) { const pl = players.get(it.holder); if (pl && pl.hands[it.hand] === it.id) pl.hands[it.hand] = null; it.holder = null; it.hand = null; }
    it.floor = false;
    it.pour = false;
  }
  function removeItem(it) { detach(it); items.delete(it.id); }
  function itemPos(it) {
    if (it.holder != null) { const pl = players.get(it.holder); const hp = pl && handPos(pl, it.hand); if (hp) return hp; }
    return { x: it.x, y: it.y, z: it.z };
  }
  // предмет в ръка е на нивото на този, който го държи: пътува с него
  function itemLevel(it) {
    if (it.holder != null) { const pl = players.get(it.holder); if (pl) return pl.level; }
    return it.level;
  }
  function hold(it, pl, hand) {
    it.holder = pl.id; it.hand = hand; it.level = pl.level;
    pl.hands[hand] = it.id;
  }
  function toFloor(it, p, level) {
    // предметът остава в стаята, в която е пуснат (или в най-близката)
    const rs = layout.rooms || [{ x: 0, z: 0, w: hall.w, d: hall.d }];
    const rm = rs.find((r) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2) || rs[0];
    it.x = clamp(p.x, rm.x - rm.w / 2 + 0.05, rm.x + rm.w / 2 - 0.05);
    it.z = clamp(p.z, rm.z - rm.d / 2 + 0.05, rm.z + rm.d / 2 - 0.05);
    it.y = 0;
    it.level = level;
    it.floor = true;
    // при проверката уликите не изчезват сами от пода
    it.poofAt = phase === 'raid' && LAB.has(it.kind) ? Infinity : time + S(RULES.poof);
  }
  function putInSlot(it, s) {
    it.slot = s.id; s.item = it.id;
    it.x = s.x; it.y = s.y; it.z = s.z; it.yaw = s.st.st.yaw; it.level = s.level;
  }

  // ── пицата: сосът е първи, после кашкавалът, върху него месо (до две порции) и гъби (само върху месо) ──
  const count = (stack, k) => stack.reduce((n, q) => n + (q === k ? 1 : 0), 0);
  function topFits(stack, k) {
    if (stack.length >= RULES.maxTops) return false;
    if (SAUCE.has(k)) return stack.length === 0;
    if (!stack.length || !SAUCE.has(stack[0])) return false;
    if (k === 'meat') return count(stack, 'meat') < 2;
    return !stack.includes(k);
  }

  // ── поръчки ──
  const cookedOk = (c) => { const v = r3(c); return v >= 1 && v < 2; };
  function orderOk(o, it) {
    if (!it) return false;
    if (o.kind === 'pizza') {
      if (it.kind !== 'pizza') return false;
      const st = it.state.stack;
      if (st.length !== o.stack.length || st.slice().sort().join() !== o.stack.slice().sort().join()) return false;
      return cookedOk(it.state.cook);
    }
    if (o.kind === 'cup') return it.kind === 'cup' && it.state.fill >= 0.9 && it.state.drink === o.drink;
    if (o.kind === 'stuff') return it.kind === o.item;
    return false;
  }
  function payFor(c, it) {
    const o = c.order, P = RULES.pay;
    const base = o.kind === 'stuff' ? Math.round(RULES.sell[o.item] * (it && it.state.pure ? RULES.sell.pure : 1)) : o.kind === 'pizza' ? P.pizza + P.top * o.stack.length + P.meat * count(o.stack, 'meat') : P.cup;
    return base + (c.tutorial ? 0 : Math.round(base * P.tip * c.patience));
  }
  // pl: играчът, който току-що е сложил предмета (тогава грешката се наказва); null: тиха проверка
  function evalServe(s, pl) {
    if (s.item == null) return;
    const c = customers.find((q) => q.seat === s.idx && q.state === 'wait');
    if (!c || c.mark) return;      // грубиянът и доставчикът не поръчват: каквото е оставено, чака следващия
    const it = items.get(s.item);
    if (orderOk(c.order, it)) {
      const who = players.get(pl ? pl.id : it.by) || gone.get(it.by) || null;
      const amount = payFor(c, it);
      money += amount;
      if (who) who.served++;
      if (c.order.kind === 'stuff' && patrol && patrol.phase === 'on') {      // sold under the eyes of the patrol
        addSus(RULES.patrol.sus);
        emit('caught', at(s, { player: who ? who.id : null }));
      }
      if (c.tutorial) tutorialServed++; else addCover(RULES.cover.ok);
      emit('order_ok', at(s, { player: who ? who.id : null }));
      emit('cash', at(s, { player: who ? who.id : null, amount }));
      c.state = 'happy'; c.t0 = time;
      removeItem(it);
    } else if (pl) {
      if (c.tutorial) {   // в обучението никой не може да сбърка: предметът остава, клиентът чака
        emit('order_bad', at(s, { player: pl.id, text: TX.deny.wrongOrder }));
        return;
      }
      pl.mistakes++;
      addCover(-RULES.cover.bad);
      emit('order_bad', at(s, { player: pl.id }));
      c.state = 'angry'; c.t0 = time;
      removeItem(it);
    }
  }

  // ── пускане: правилата по ред; само сред нещата на нивото на играча ──
  function place(it, p, yaw, pl) {
    const L = pl.level;
    it.yaw = yaw;
    // 0a. papers next to buds (or buds next to papers): a joint lies where the other one was
    if (it.kind === 'papers' || it.kind === 'buds') {
      const other = it.kind === 'papers' ? 'buds' : 'papers';
      let mate = null, md = RULES.lab.combine + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== other || q.holder != null || q.floor || q.level !== L) continue;
        if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;
        const dd = dist(p, q);
        if (dd <= md) { md = dd; mate = q; }
      }
      if (mate) {
        const sl = mate.slot != null ? slotById.get(mate.slot) : null, pos = { x: mate.x, y: mate.y, z: mate.z };
        removeItem(mate); removeItem(it);
        const j = newItem('joint', L);
        j.by = pl.id; j.yaw = yaw;
        if (sl && sl.accepts.includes('joint')) putInSlot(j, sl); else { j.x = pos.x; j.y = pos.y; j.z = pos.z; }
        pl.packed++;
        emit('rolled', at(j, { player: pl.id }));
        return 6;
      }
    }
    // 0b. a liquid over the mixer: it is poured in (two at most)
    if (LIQUID.has(it.kind) && benchRec && benchRec.level === L) {
      const m = benchRec.slots[1], spout = benchRec.st.taps[2];
      if (dist(p, spout) <= RULES.lab.spout) {
        if (time < mixer.until) emit('deny', { player: pl.id, level: L, x: m.x, y: m.y, z: m.z, text: TX.deny.wait });
        else if (m.item != null) emit('deny', { player: pl.id, level: L, x: m.x, y: m.y, z: m.z, text: TX.deny.takeFirst });
        else if (mixer.mix.length >= 2) emit('deny', { player: pl.id, level: L, x: m.x, y: m.y, z: m.z, text: TX.deny.mixerFull });
        else {
          mixer.mix.push(it.kind);
          if (it.kind === 'blue' && it.state.shake) mixer.pure = true;
          emit('pour', { ...spout, level: L, player: pl.id });
          removeItem(it);
          return 7;
        }
      }
    }
    // 1. добавка до сурова пица (в гнездо или на плот), до 0.38 м: ляга върху нея
    if (TOP.has(it.kind)) {
      let pizza = null, bd = RULES.snapStack + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== 'pizza' || q.holder != null || q.floor || q.level !== L || q.state.cook > 0.05) continue;
        const dd = segDist(p, q.x, q.y, q.y + PIZZA_H, q.z);
        if (dd <= bd) { bd = dd; pizza = q; }
      }
      if (pizza) {
        if (topFits(pizza.state.stack, it.kind)) {
          pizza.state.stack.push(it.kind);
          pizza.by = it.by;
          emit('top', at(pizza, { player: pl.id }));
          removeItem(it);
          return 2;
        }
        emit('deny', { player: pl.id, level: L, x: pizza.x, y: pizza.y, z: pizza.z, text: TX.deny.topOrder || 'Първо сос, после кашкавал' });
      }
    }
    // 2. свободно гнездо, което приема този kind, до 0.45 м
    let best = null, bd = RULES.snapSlot + 1e-9;
    for (const s of slotList) {
      if (s.level !== L || !s.accepts.includes(it.kind)) continue;
      if (s.item != null && s.kind !== 'trash' && s.kind !== 'bin') continue;
      if (s.kind === 'stash' && stashShut()) continue;                                  // a closed cabinet takes nothing
      if (s.kind === 'grow' && pots[s.idx].s > 0) continue;                             // something grows in this bucket already
      if (s.st === benchRec && s.idx === 0 && time < shred.until) continue;             // the shredder is running
      const dd = dist(p, s);
      if (dd <= bd) { bd = dd; best = s; }
    }
    if (best) {
      if (best.kind === 'trash') {
        emit('poof', at(best));
        removeItem(it);
      } else if (best.kind === 'grow') {      // seeds into the bucket: a plant grows
        pots[best.idx].s = 0.001;
        emit('planted', at(best, { player: pl.id }));
        removeItem(it);
      } else if (best.kind === 'bin') {      // тава с месо на рафта с месото: запасът расте
        meatStock += RULES.grinder.portions;
        pl.packed++;
        emit('stock', at(best, { player: pl.id, amount: RULES.grinder.portions }));
        removeItem(it);
      } else {
        putInSlot(it, best);
        if (it.kind === 'pizza') it.state.ball = false;
        if (best.kind === 'grinder') rollZone();
        if (best.kind === 'counter') evalServe(best, pl);
      }
      return 1;
    }
    // 3. над плот на станция (в правоъгълника ѝ, до 0.40 над плота): ляга на плота
    for (const rec of surfaces) {
      const b = rec.box;
      if (rec.level !== L || p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) continue;
      if (p.y < b.y1 - RULES.surfaceDown || p.y > b.y1 + RULES.surfaceUp) continue;
      it.x = p.x; it.y = b.y1; it.z = p.z; it.level = L;
      if (it.kind === 'pizza') it.state.ball = false;
      return 4;
    }
    // 4. пада на пода и след малко изчезва
    toFloor(it, p, L);
    return 5;
  }

  // ── напитките: чаша в гнездото се пълни сама (лявото гнездо е кола, дясното портокал) ──
  function startPour(cup, idx) {
    const drink = idx === 0 ? 'cola' : 'orange';
    if (cup.state.fill >= 1) return false;
    if (cup.state.fill > 0 && cup.state.drink && cup.state.drink !== drink) return false;
    cup.state.drink = drink;
    cup.pour = true;
    return true;
  }

  // ── мелачката ──
  function rollZone() {
    const a = 0.1 + rand() * (0.8 - RULES.grinder.zone);
    zone = [a, a + RULES.grinder.zone];
  }
  // иглата се люлее 0 … 1 … 0; не се забързва във fast режим, за да може човек да я уцели
  function needle() {
    const ph = (time / RULES.grinder.period) % 1;
    return ph < 0.5 ? ph * 2 : 2 - ph * 2;
  }
  const inSlot = (rec, i = 0) => { const s = rec && rec.slots[i]; return s && s.item != null ? items.get(s.item) : null; };

  // ── клиенти ──
  // what a buyer asks for: mostly something that is already made, sometimes anything
  function wantedStuff() {
    const have = [...new Set([...items.values()].filter((q) => SELL.includes(q.kind)).map((q) => q.kind))];
    const pool = have.length && rand() < 0.75 ? have : SELL;
    return pool[Math.floor(rand() * pool.length)];
  }
  const anyStuff = () => { for (const q of items.values()) if (SELL.includes(q.kind)) return true; return false; };
  function randomOrder() {
    if (evening() && rand() < RULES.markShare) return { order: { kind: 'none' }, mark: true };
    if (labOn && rand() < (anyStuff() ? RULES.buyerShare : RULES.buyerTease)) return { order: { kind: 'stuff', item: wantedStuff() }, mark: false, buyer: true };
    if (rand() < RULES.cupShare) return { order: { kind: 'cup', drink: rand() < 0.5 ? 'cola' : 'orange' }, mark: false };
    if (evening() && rand() < RULES.meatShare[meatStock > 0 ? 1 : 0]) {
      const stack = ['sauce', 'cheese', 'meat'];
      const q = rand();
      if (q < 0.25) stack.push('meat'); else if (q < 0.5 && stationById.has('bin_veg')) stack.push('veg');
      return { order: { kind: 'pizza', stack }, mark: false };
    }
    const pick = menu.length ? menu[Math.min(menu.length - 1, Math.floor(Math.pow(rand(), 1.35) * menu.length))] : ['sauce'];
    return { order: { kind: 'pizza', stack: pick.slice() }, mark: false };
  }
  function spawnCustomer(order, mark, tutorial, buyer) {
    const free = [];
    seatBusy.forEach((b, i) => { if (!b && traps[i].state === 'closed') free.push(i); });
    if (!free.length) return false;
    const seat = free[Math.floor(rand() * free.length)];
    seatBusy[seat] = true;
    const np = Math.max(1, players.size);
    customers.push({ id: nextCustomer++, look: Math.floor(rand() * 6), seat, x: layout.seats[seat].x, z: farZ, zFrom: farZ, yaw: Math.PI,
      state: 'in', patience: 1, order, mark, special: mark, tutorial, buyer: !!buyer, t0: time,
      patDur: S(RULES.patience(np) * (mark ? RULES.markPatience : buyer ? RULES.buyerPatience : 1)) });
    return true;
  }
  function sendAway(c) {
    if (c.state === 'out' || c.state === 'fall') return;
    c.state = 'out'; c.t0 = time; c.zFrom = c.z; c.yaw = 0;
    seatBusy[c.seat] = false;
  }
  function leaveAll() { for (const c of customers) if (c.state === 'in' || c.state === 'wait') sendAway(c); }

  function stepCustomers(h) {
    if (phase === 'tutorial') {
      while (tutorialSpawned < players.size) {
        if (!spawnCustomer({ kind: 'pizza', stack: ['sauce', 'cheese'] }, false, true)) break;
        tutorialSpawned++;
      }
      // всички са си направили пицата: не чакаме таймера
      if (players.size > 0 && tutorialSpawned >= players.size && tutorialServed >= tutorialSpawned && phaseEnd - time > S(3)) phaseEnd = time + S(3);
    } else if ((phase === 'day' || evening()) && time >= nextSpawnAt) {
      const o = randomOrder();
      if (spawnCustomer(o.order, o.mark, false, o.buyer)) {
        const base = RULES.interval(Math.max(1, players.size)) * (phase === 'rush' ? RULES.rushSlow : 1);
        nextSpawnAt = time + S(base * (0.85 + 0.3 * rand()));
      }
    }
    for (let i = customers.length - 1; i >= 0; i--) {
      const c = customers[i];
      if (c.state === 'in') {
        const k = (time - c.t0) / S(RULES.walk);
        if (k >= 1) { c.z = seatZ; c.state = 'wait'; c.t0 = time; evalServe(serveSlots[c.seat], null); }
        else c.z = farZ + (seatZ - farZ) * k;
      } else if (c.state === 'wait') {
        if (c.tutorial) continue;
        c.patience -= h / c.patDur;
        if (c.patience <= 0) {   // изпуснат клиент; грубиянът, който си тръгва сам, също разваля настроението
          c.patience = 0; c.state = 'angry'; c.t0 = time;
          if (!(kids && c.mark) && !c.buyer) { addCover(-RULES.cover.bad); emit('order_bad', at(serveSlots[c.seat])); }      // a buyer who gets nothing just leaves
        }
      } else if (c.state === 'happy' || c.state === 'angry') {
        if (time - c.t0 >= S(RULES.linger)) sendAway(c);
      } else if (c.state === 'fall') {
        if (time - c.t0 >= S(RULES.trap.fall)) { seatBusy[c.seat] = false; customers.splice(i, 1); }
      } else {
        const k = (time - c.t0) / S(RULES.walk);
        if (k >= 1) customers.splice(i, 1);
        else c.z = c.zFrom + (farZ - c.zFrom) * k;
      }
    }
  }

  // ── печене и наливане ──
  function stepCooking(h) {
    for (const it of items.values()) {
      if (it.slot == null) continue;
      const kind = slotById.get(it.slot).kind;
      if (kind === 'oven' && it.kind === 'pizza') {
        const c = it.state.cook;
        if (c >= 2) continue;
        if (c < 1) it.state.cook = Math.min(1, c + h / S(RULES.cookDone));
        else {
          it.state.cook = Math.min(2, c + h / S(RULES.cookBurn));
          if (it.state.cook >= 2) emit('burn', at(it));
        }
      } else if (kind === 'drinks' && it.pour) {
        it.state.fill = Math.min(1, it.state.fill + h / S(RULES.pour));
        if (it.state.fill >= 1) { it.pour = false; emit('poured', at(it)); }
      }
    }
  }

  // ── the cellar lab: the cabinet door, deliveries, growing, the two blenders ──
  function stepLab(h) {
    if (!labOn) return;
    stashOpen = toward(stashOpen, stashWant, h / S(RULES.lab.door));
    for (let i = pending.length - 1; i >= 0; i--) {
      const o = pending[i];
      if (time < o.at) continue;
      pending.splice(i, 1);
      const sl = stashRec.slots[o.idx];
      if (sl.item != null || items.size >= RULES.maxItems) continue;
      putInSlot(newItem(o.kind, 1), sl);
      emit('delivered', at(sl));
    }
    pots.forEach((q, i) => {
      if (q.s <= 0 || q.s >= 1) return;
      q.s = Math.min(1, q.s + h / S(RULES.lab.grow));
      if (q.s >= 1) emit('grown', at(growRec.slots[i]));
    });
    if (benchRec && shred.until && time >= shred.until) {
      shred.until = 0;
      const sl = benchRec.slots[0], it = inSlot(benchRec, 0);
      if (it && it.kind === 'plant') {
        removeItem(it);
        const b = newItem('buds', 1);
        b.by = shred.by;
        putInSlot(b, sl);
        const pl = players.get(shred.by);
        if (pl) pl.cooked++;
        emit('shredded', at(sl, { player: shred.by }));
      }
    }
    if (benchRec && mixer.until && time >= mixer.until) {
      mixer.until = 0;
      const sl = benchRec.slots[1], kind = RECIPES[mixer.mix.slice().sort().join('+')] || null, pl = players.get(mixer.by);
      if (kind && sl.item == null) {
        const out = newItem(kind, 1);
        out.by = mixer.by;
        if (kind === 'ice' && mixer.pure) out.state.pure = 1;
        putInSlot(out, sl);
        if (pl) pl.cooked++;
        emit('mixed', at(sl, { player: mixer.by }));
      } else {      // the same liquid twice: wasted
        if (pl) pl.mistakes++;
        emit('ruin', at(sl, { player: mixer.by }));
      }
      mixer.mix = []; mixer.pure = false;
    }
  }

  // ── подът под клиентите и улеят към мазето ──
  function stepTraps(h) {
    const T = RULES.trap;
    traps.forEach((t) => {
      if (t.state === 'opening') { t.open = Math.min(1, t.open + h / S(T.open)); if (t.open >= 1) { t.state = 'open'; t.until = time + S(T.hold); } }
      else if (t.state === 'open') { if (time >= t.until) t.state = 'closing'; }
      else if (t.state === 'closing') { t.open = Math.max(0, t.open - h / S(T.close)); if (t.open <= 0) t.state = 'closed'; }
    });
    if (falling.length && time >= falling[0]) {
      falling.shift();
      if (hopper < RULES.grinder.hopper) hopper++;
      if (grinderRec) emit('load', { x: grinderRec.st.x, y: 1.4, z: grinderRec.st.z, level: 1 });
    }
  }
  // Копчето под тезгяха. Нощна тема: който е на мястото, пада в мазето. Детска: доставчикът оставя сандъка, а той слиза в склада.
  function doTrap(pl, hp, rec) {
    const i = rec.st.seat | 0, t = traps[i];
    if (!evening()) return refuse(pl, hp, 'notYet');
    if (!t || t.state !== 'closed') return refuse(pl, hp, 'trapBusy');
    const c = customers.find((q) => q.seat === i && q.state === 'wait');
    const seat = layout.seats[i], where = { x: seat.x, y: 0, z: seat.z, level: 0, seat: i, player: pl.id };
    if (kids) {
      if (!c || !c.mark) return refuse(pl, hp, 'noCourier');
      c.state = 'happy'; c.t0 = time;
      emit('crate', where);
    } else if (c) {
      c.state = 'fall'; c.t0 = time;
      emit('drop', where);
      addSus(RULES.trap.missing);
      if (!c.mark) { addSus(RULES.trap.innocent); addCover(-RULES.cover.bad); pl.mistakes++; emit('innocent', where); }
      if (patrol && patrol.phase === 'on') { addSus(RULES.patrol.sus); emit('caught', { player: pl.id, x: seat.x, y: 1, z: seat.z, level: 0 }); }
    } else emit('trap', where);
    t.state = 'opening';
    if (c) { falling.push(time + S(RULES.trap.chute)); pl.drops++; dropped++; }
    return { ok: true, dropped: !!c };
  }

  // ── асансьорът ──
  function inCabin(pl) {
    const p = headPos(pl);
    return !!p && p.x >= cab.x0 && p.x <= cab.x1 && p.z >= cab.z0 && p.z <= cab.z1;
  }
  const aboard = () => [...players.values()].filter((pl) => pl.level === lift.level && inCabin(pl)).map((pl) => pl.id);
  const liftAt = (more) => ({ x: liftRec.st.x, y: 1, z: liftRec.st.z, ...more });
  function stepLift(h) {
    const E = RULES.elevator;
    if (lift.phase === 'idle') return;
    if (lift.phase === 'closing') {
      lift.doors = Math.max(0, lift.doors - h / S(E.doors));
      if (time >= lift.until - 1e-9) {   // вратите са затворени: който е вътре, пътува
        lift.doors = 0; lift.phase = 'moving'; lift.until = time + S(E.travel);
        lift.riders = aboard();
      }
      return;
    }
    if (lift.phase === 'moving') {
      // кабина, която пътува по време на патрул, се чува: подозрението расте
      if (patrol && patrol.phase === 'on') addSus(E.patrolSus * h * speed);
      if (time >= lift.until - 1e-9) {
        lift.level = lift.to;
        for (const id of lift.riders) { const pl = players.get(id); if (pl) pl.level = lift.to; }
        emit('ride_end', liftAt({ level: lift.to, to: lift.to }));
        lift.riders = []; lift.phase = 'opening'; lift.until = time + S(E.doors);
      }
      return;
    }
    lift.doors = Math.min(1, lift.doors + h / S(E.doors));
    if (time >= lift.until - 1e-9) { lift.doors = 1; lift.phase = 'idle'; }
  }

  // ── патрул: минава вечер покрай витрината. Докато гледа, никой не бива да пада. В детската тема няма патрул. ──
  function endPatrol() {
    if (!patrol) return;
    patrol = null;
    emit('patrol_off');
    nextPatrolAt = time + S(RULES.patrol.min + rand() * (RULES.patrol.max - RULES.patrol.min));
  }
  function stepPatrol() {
    const R = RULES.patrol;
    if (kids || !evening()) return;
    if (!patrol) {
      if (time >= nextPatrolAt && phaseEnd - time >= S(R.warn + R.on + 1)) {
        patrol = { phase: 'warn', until: time + S(R.warn) };
        emit('patrol_warn', { text: TX.hint.patrolWarn });
      }
      return;
    }
    if (patrol.phase === 'warn') {
      if (time >= patrol.until) { patrol.phase = 'on'; patrol.until = time + S(R.on); emit('patrol_on', { text: TX.hint.patrolOn }); }
      return;
    }
    if (time >= patrol.until) endPatrol();
  }

  // ── врата, ролетка, под ──
  const toward = (v, target, stepBy) => (v < target ? Math.min(target, v + stepBy) : Math.max(target, v - stepBy));
  function stepDoors(h) {
    shutterOpen = toward(shutterOpen, phase === 'raid' ? 0 : 1, h / S(2));      // заведението затваря само при проверката
    doorOpen = toward(doorOpen, labOpen() ? 1 : 0, h / S(2));
  }
  function stepFloor() {
    for (const it of [...items.values()]) {
      if (it.floor && time >= it.poofAt) { emit('poof', at(it)); removeItem(it); }
    }
  }

  // ── фази ──
  function enter(p) {
    phase = p;
    phaseEnd = time + S(RULES.phases[p]);
    if (p === 'day') { leaveAll(); nextSpawnAt = time + S(1.5); }
    if (p === 'closing') { leaveAll(); nextSpawnAt = Infinity; rollZone(); }
    if (p === 'night') { nextSpawnAt = time + S(1.5); nextPatrolAt = time + S(RULES.patrol.min * 0.6 + rand() * (RULES.patrol.max - RULES.patrol.min)); }
    if (p === 'rush') nextSpawnAt = Math.min(nextSpawnAt, time + S(2));
    if (p === 'raid') { if (patrol) { patrol = null; emit('patrol_off'); } nextPatrolAt = Infinity; leaveAll(); nextSpawnAt = Infinity; }
    emit('phase', { text: TX.title[p] });
  }
  function finish() {
    if (over) return;
    if (patrol) { patrol = null; emit('patrol_off'); }
    leaveAll();
    over = true; phase = 'over'; phaseEnd = time;
    const caught = suspicion >= 1;
    let stars = 1;
    const per = money / Math.max(1, peak);
    for (const th of RULES.stars) if (per >= th / speed) stars++;
    if (suspicion >= 0.5) stars--;
    if (caught) stars = 1;
    result = { money, stars: clamp(stars, 1, 5), caught, dropped, players: [...players.values(), ...gone.values()].map(pubPlayer) };
    emit('phase', { text: caught ? TX.hint.overCaught : TX.title.over });
  }
  function raidEnd() {
    // всичко от мазето, което още съществува (на което и да е ниво, и в ръка), е улика; товарът, който чака мелачката, също
    const fine = (p, level) => {
      money = Math.max(0, money - RULES.evidence.money);
      addSus(RULES.evidence.sus);
      emit('cash', { x: p.x, y: p.y, z: p.z, level, amount: -RULES.evidence.money });
    };
    const hidden = (it) => it.slot != null && slotById.get(it.slot).kind === 'stash' && stashShut();
    for (const it of items.values()) if (LAB.has(it.kind) && !hidden(it)) fine(itemPos(it), itemLevel(it));
    for (let i = 0; i < hopper; i++) fine({ x: grinderRec ? grinderRec.st.x : 0, y: 1, z: grinderRec ? grinderRec.st.z : 0 }, 1);
  }
  function stepSim(h) {
    time += h;
    while (!over && time >= phaseEnd) {
      const i = PHASES.indexOf(phase);
      const from = phaseEnd;
      if (i === PHASES.length - 1) { raidEnd(); finish(); break; }
      enter(PHASES[i + 1]);
      phaseEnd = from + S(RULES.phases[phase]);
    }
    if (over) return;
    stepCustomers(h);
    stepCooking(h);
    stepTraps(h);
    stepLab(h);
    stepPatrol();
    stepLift(h);
    stepDoors(h);
    stepFloor();
    if (suspicion >= 1) finish();
  }

  function tick(now) {
    if (!fin(now) || now <= nowMs) return;
    nowMs = now;
    const target = (now - t0) / 1000;
    while (!over && target - time > 1e-9) stepSim(Math.min(0.1, target - time));
    const keep = nowMs - RULES.eventMs;
    if (events.length && events[0].at < keep) events = events.filter((e) => e.at >= keep);
  }

  // ── действия: стигат само неща на нивото на играча ──
  function act(id, msg) {
    const pl = players.get(id);
    if (!pl || !msg || typeof msg !== 'object') return { ok: false, reason: 'bad' };
    const hand = msg.hand === 'l' || msg.hand === 'r' ? msg.hand : null;
    const hp = hand ? handPos(pl, hand) : null;
    if (over) return refuse(pl, hp, 'over');
    if (!hand) return refuse(pl, null, 'bad');
    if (!hp) return refuse(pl, null, 'noPose');
    switch (msg.a) {
      case 'grab': return doGrab(pl, hand, hp, msg);
      case 'take': return doTake(pl, hand, hp, msg);
      case 'release': return doRelease(pl, hand, hp, msg);
      case 'use': return doUse(pl, hand, hp, msg);
      case 'shake': return doShake(pl, hand, hp);
      default: return refuse(pl, hp, 'bad');
    }
  }

  function doGrab(pl, hand, hp, msg) {
    const it = items.get(typeof msg.item === 'string' ? Number(msg.item) : msg.item);
    if (!it) return refuse(pl, hp, 'noItem');
    if (pl.hands[hand] != null) return refuse(pl, hp, 'handFull');
    if (it.holder != null && it.holder !== pl.id) return refuse(pl, hp, 'held');
    if (itemLevel(it) !== pl.level) return refuse(pl, hp, 'otherLevel');
    if (dist(hp, itemPos(it)) > REACH) return refuse(pl, hp, 'far');
    if (it.slot != null) {
      const sl = slotById.get(it.slot);
      if (sl.kind === 'stash' && stashShut()) return refuse(pl, hp, 'stashShut');
      if (sl.st === benchRec && time < (sl.idx === 0 ? shred.until : mixer.until)) return refuse(pl, hp, 'wait');
    }
    detach(it);
    hold(it, pl, hand);
    return { ok: true, item: it.id };
  }

  // The blue flask is shaken before it goes into the mixer: the product comes out pure and pays more.
  function doShake(pl, hand, hp) {
    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
    if (!it || it.kind !== 'blue') return { ok: false, reason: 'bad' };
    if (!it.state.shake) { it.state.shake = 1; emit('shaken', { player: pl.id, level: pl.level, x: hp.x, y: hp.y, z: hp.z }); }
    return { ok: true };
  }

  // A grown plant is pulled out of its bucket.
  function doHarvest(pl, hand, hp, rec) {
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    if (pl.hands[hand] != null) return refuse(pl, hp, 'handFull');
    if (rec.level !== pl.level) return refuse(pl, hp, 'otherLevel');
    if (boxDist(hp, rec.box) > REACH) return refuse(pl, hp, 'far');
    let best = -1, bd = Infinity;
    rec.slots.forEach((sl, i) => { if (pots[i].s >= 1) { const dd = dist(hp, sl); if (dd < bd) { bd = dd; best = i; } } });
    if (best < 0) return refuse(pl, hp, 'noPlant');
    if (items.size >= RULES.maxItems) return refuse(pl, hp, 'tooMany');
    pots[best].s = 0;
    const it = newItem('plant', pl.level);
    it.by = pl.id;
    hold(it, pl, hand);
    emit('harvest', at(rec.slots[best], { player: pl.id }));
    return { ok: true, item: it.id };
  }

  // The secret cabinet: control 0 is the handle (opens and shuts), control n is the n-th shelf spot. An empty spot
  // that belongs to a supply orders it from the shop: the money goes at once, the thing arrives on that shelf.
  function doStash(pl, hp, rec, msg) {
    if (!labOn) return refuse(pl, hp, 'noButton');
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    const c = Number.isInteger(msg.control) && msg.control > 0 ? msg.control : 0;
    if (c === 0) {
      stashWant = stashWant ? 0 : 1;
      emit(stashWant ? 'stash_open' : 'stash_shut', { ...rec.st.taps[0], level: rec.level, player: pl.id });
      return { ok: true, open: stashWant };
    }
    const idx = c - 1, sl = rec.slots[idx], kind = rec.st.shelf[idx];
    if (!sl || !kind) return refuse(pl, hp, 'noButton');
    if (stashShut()) return refuse(pl, hp, 'stashShut');
    if (sl.item != null || pending.some((o) => o.idx === idx)) return refuse(pl, hp, 'shelfFull');
    if (phase === 'raid') return refuse(pl, hp, 'raidBins');
    const price = RULES.shop[kind] | 0;
    if (money < price) return refuse(pl, hp, 'noMoney');
    money -= price;
    pending.push({ idx, kind, at: time + S(RULES.shop.delay) });
    emit('cash', at(sl, { player: pl.id, amount: -price }));
    emit('ordered', at(sl, { player: pl.id }));
    return { ok: true, ordered: kind };
  }

  // The bench: control 0 is the shredder (a plant in it becomes buds), control 1 the mixer (two liquids become a product).
  function doBench(pl, hp, rec, msg) {
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    const T = rec.st.taps;
    const c = msg.control === 0 || msg.control === 1 ? msg.control : (dist(hp, T[0]) <= dist(hp, T[1]) ? 0 : 1);
    const sl = rec.slots[c];
    const evAt = (more) => ({ ...T[c], level: rec.level, ...more });
    if (c === 0) {
      if (time < shred.until) return refuse(pl, hp, 'wait');
      const it = inSlot(rec, 0);
      if (!it || it.kind !== 'plant') return refuse(pl, hp, 'noPlantIn');
      shred.until = time + S(RULES.lab.shred); shred.by = pl.id;
      emit('shred', evAt({ player: pl.id }));
      return { ok: true };
    }
    if (time < mixer.until) return refuse(pl, hp, 'wait');
    if (sl.item != null) return refuse(pl, hp, 'takeFirst');
    if (mixer.mix.length < 2) return refuse(pl, hp, 'needTwo');
    mixer.until = time + S(RULES.lab.mix); mixer.by = pl.id;
    emit('mix', evAt({ player: pl.id }));
    return { ok: true };
  }

  function doTake(pl, hand, hp, msg) {
    const rec = stationById.get(msg.station);
    if (!rec) return refuse(pl, hp, 'noStation');
    if (rec.st.kind === 'grow') return doHarvest(pl, hand, hp, rec);
    if (rec.st.kind !== 'bin') return refuse(pl, hp, 'notBin');
    if (pl.hands[hand] != null) return refuse(pl, hp, 'handFull');
    if (rec.level !== pl.level) return refuse(pl, hp, 'otherLevel');
    if (boxDist(hp, rec.box) > REACH) return refuse(pl, hp, 'far');
    if (LAB.has(rec.st.gives)) {
      if (!labOpen()) return refuse(pl, hp, 'labClosed');
      if (phase === 'raid') return refuse(pl, hp, 'raidBins');
    }
    if (rec.st.gives === 'meat') {
      if (meatStock <= 0) return refuse(pl, hp, 'noMeat');
      meatStock--;
    }
    if (items.size >= RULES.maxItems) return refuse(pl, hp, 'tooMany');
    const it = newItem(rec.st.gives, pl.level);
    it.by = pl.id;
    hold(it, pl, hand);
    return { ok: true, item: it.id };
  }

  function doRelease(pl, hand, hp, msg) {
    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
    if (!it) { pl.hands[hand] = null; return refuse(pl, hp, 'handEmpty'); }
    // точката на пускане е единственото, което се взима от клиента, и то до REACH от ръката
    let p = hp;
    const q = msg.p;
    if (q && fin(q[0]) && fin(q[1]) && fin(q[2])) {
      p = { x: q[0], y: q[1], z: q[2] };
      const dd = dist(p, hp);
      if (dd > REACH) { const k = REACH / dd; p = { x: hp.x + (p.x - hp.x) * k, y: hp.y + (p.y - hp.y) * k, z: hp.z + (p.z - hp.z) * k }; }
    }
    detach(it);
    it.by = pl.id;
    const rule = place(it, p, fin(msg.yaw) ? msg.yaw : 0, pl);
    return { ok: true, rule };
  }

  // Бутонът на асансьора. Кабината е на моето ниво: трябва да съм вътре (главата над пода ѝ), и тръгва.
  // Кабината е на другото ниво: викам я (идва с каквото и когото има вътре).
  function doLift(pl, hp) {
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    if (boxDist(hp, liftRec.box) > REACH) return refuse(pl, hp, 'far');
    if (lift.phase !== 'idle') return refuse(pl, hp, 'liftBusy');
    if (pl.level === lift.level && !inCabin(pl)) return refuse(pl, hp, 'enterCabin');
    lift.phase = 'closing';
    lift.until = time + S(RULES.elevator.doors);
    lift.to = 1 - lift.level;
    emit('ride_start', liftAt({ level: lift.level, to: lift.to, player: pl.id }));
    return { ok: true, to: lift.to };
  }

  function doUse(pl, hand, hp, msg) {
    const rec = stationById.get(msg.station);
    if (!rec) return refuse(pl, hp, 'noStation');
    const kind = rec.st.kind;
    if (kind === 'elevator') return doLift(pl, hp);   // асансьорът е един и същ и на двете нива
    if (rec.level !== pl.level) return refuse(pl, hp, 'otherLevel');
    if (boxDist(hp, rec.box) > REACH) return refuse(pl, hp, 'far');
    if (kind === 'button') return doTrap(pl, hp, rec);
    if (kind === 'stash') return doStash(pl, hp, rec, msg);
    if (kind === 'bench') return doBench(pl, hp, rec, msg);
    if (kind === 'drinks') {      // чашата се пълни сама; бутонът остава за чаша, която е спряла (друга напитка в нея)
      let c = msg.control === 0 || msg.control === 1 ? msg.control : null;
      if (c === null) {
        const want = rec.slots.filter((s) => { const cup = s.item != null ? items.get(s.item) : null; return cup && cup.state.fill < 1; });
        const pool = want.length ? want : rec.slots;
        c = pool.reduce((a, s) => (dist(hp, s) < dist(hp, a) ? s : a), pool[0]).idx;
      }
      const cup = inSlot(rec, c);
      if (!cup) { emit('spill', at(rec.slots[c], { player: pl.id, seat: c })); return { ok: true, spill: true }; }
      if (cup.state.fill >= 1) return refuse(pl, hp, 'cupFull');
      if (!startPour(cup, c)) return refuse(pl, hp, 'otherDrink');
      emit('pouring', at(rec.slots[c], { player: pl.id, seat: c }));
      return { ok: true };
    }
    if (kind !== 'grinder') return refuse(pl, hp, 'noButton');
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    const G = RULES.grinder, s = rec.slots[0];
    const tray = inSlot(rec);
    if (!tray || tray.kind !== 'tray') return refuse(pl, hp, 'noTray');
    if (hopper <= 0) return refuse(pl, hp, 'noBody');
    if (time < grindCool) return refuse(pl, hp, 'wait');
    grindCool = time + G.cooldown;
    const v = needle();
    if (v >= zone[0] - G.tol && v <= zone[1] + G.tol) {
      grindHits++;
      emit('hit', at(s, { player: pl.id }));
      rollZone();
      if (grindHits >= G.hits) {   // готово: товарът е смлян, празната тава става тава с месо
        grindHits = 0; grindMisses = 0; hopper--;
        removeItem(tray);
        const box = newItem('meatbox', rec.level);
        box.by = pl.id;
        putInSlot(box, s);
        pl.cooked++;
        emit('ground', at(s, { player: pl.id }));
      }
    } else {
      grindMisses++;
      addSus(G.missSus);
      emit('miss', at(s, { player: pl.id }));
      if (grindMisses >= G.jamAt) { grindMisses = 0; grindHits = 0; hopper--; pl.mistakes++; emit('ruin', at(s, { player: pl.id })); }
    }
    return { ok: true };
  }

  // ── снимка за каските ──
  function pubState(it) {
    const s = it.state;
    switch (it.kind) {
      case 'pizza': return { stack: s.stack.slice(), cook: r3(s.cook), ball: !!s.ball && it.holder != null };
      case 'cup': return { fill: r3(s.fill), drink: s.drink, pour: it.pour ? 1 : 0 };
      case 'blue': return { shake: s.shake ? 1 : 0 };
      case 'ice': return { pure: s.pure ? 1 : 0 };
      default: return {};
    }
  }
  function signText(table) { return table[phase] || ''; }
  function hintText() {
    if (over) return result.caught ? TX.hint.overCaught : TX.hint.over;
    if (patrol) return patrol.phase === 'warn' ? TX.hint.patrolWarn : TX.hint.patrolOn;
    if (labOn && customers.some((c) => c.buyer && c.state === 'wait')) return TX.hint.buyer;
    if (evening()) {
      if (hopper > 0 && ![...players.values()].some((pl) => pl.level === 1)) return TX.hint.hopper;
      if (meatStock > 0 && phase === 'night') return TX.hint.meatUp;
    }
    return TX.hint[phase];
  }

  function snapshot() {
    const slots = {};
    for (const s of slotList) slots[s.id] = s.item;
    const dyn = [
      { id: 'door', state: { open: r3(doorOpen) } },
      { id: 'shutter', state: { open: r3(shutterOpen) } },
    ];
    if (grinderRec) dyn.push({ id: 'grinder', state: { needle: r3(needle()), zone: [r3(zone[0]), r3(zone[1])], hits: grindHits, load: hopper, on: labOpen() } });
    if (stationById.has('hopper')) dyn.push({ id: 'hopper', state: { load: hopper } });
    if (meatRec) dyn.push({ id: 'bin_meat', state: { stock: meatStock } });
    if (stashRec) dyn.push({ id: 'stash', state: { open: r3(stashOpen), want: stashWant, pend: pending.map((o) => o.idx), on: labOn && labOpen() } });
    if (growRec) dyn.push({ id: 'grow', state: { pots: pots.map((q) => r3(q.s)) } });
    if (benchRec) dyn.push({ id: 'bench', state: {
      shred: shred.until ? r3(clamp(1 - (shred.until - time) / S(RULES.lab.shred), 0.01, 1)) : 0,
      mix: mixer.mix.slice(), mixing: mixer.until ? r3(clamp(1 - (mixer.until - time) / S(RULES.lab.mix), 0.01, 1)) : 0, pure: mixer.pure } });
    buttonIds.forEach((id) => {
      const i = stationById.get(id).st.seat | 0;
      const c = customers.find((q) => q.seat === i && q.state === 'wait');
      dyn.push({ id, state: { armed: evening() && traps[i].state === 'closed', lit: !!(c && c.mark && evening()), open: r3(traps[i].open) } });
    });
    if (stationById.has('sign_shop')) dyn.push({ id: 'sign_shop', state: { text: signText(TX.signShop) } });
    if (stationById.has('sign_lab')) dyn.push({ id: 'sign_lab', state: { text: signText(TX.signLab) } });
    // асансьорът е една кабина; състоянието ѝ е едно и също под двата id-а (по един за ниво)
    const riders = lift.phase === 'moving' ? lift.riders.slice() : aboard();
    for (const id of liftIds) dyn.push({ id, state: { doors: r3(lift.doors), moving: lift.phase === 'moving', level: lift.level, riders: riders.slice() } });
    return {
      t: Math.round(nowMs),
      phase,
      left: r3(Math.max(0, phaseEnd - time)),
      money,
      cover: r3(cover),
      suspicion: r3(suspicion),
      meat: meatStock,
      load: hopper,
      hint: hintText(),
      stations: dyn,
      slots,
      traps: traps.map((t) => r3(t.open)),
      items: [...items.values()].map((it) => {
        const p = itemPos(it);
        return { id: it.id, kind: it.kind, level: itemLevel(it), x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(it.yaw), holder: it.holder, hand: it.hand, slot: it.slot, state: pubState(it) };
      }),
      customers: customers.map((c) => ({ id: c.id, look: c.look, seat: c.seat, x: r3(c.x), z: r3(c.z), yaw: r3(c.yaw), state: c.state,
        patience: r3(c.patience), order: c.order.stack ? { kind: c.order.kind, stack: c.order.stack.slice() } : { ...c.order }, special: c.special, mark: c.mark, buyer: !!c.buyer })),
      players: [...players.values()].map((pl) => ({ ...pubPlayer(pl), level: pl.level, hidden: false })),
      patrol: patrol ? { left: r3(Math.max(0, patrol.until - time)), phase: patrol.phase } : null,
      events: events.filter((e) => nowMs - e.at <= RULES.eventMs).map(({ at: _at, ...e }) => e),
      result: over ? { ...result, players: result.players.map((p) => ({ ...p })) } : null,
    };
  }

  if (labOn) for (const k of ['blue', 'clear']) { const i = stashRec.st.shelf.indexOf(k); if (i >= 0) putInSlot(newItem(k, 1), stashRec.slots[i]); }
  emit('phase', { text: TX.title.tutorial });
  if (skipTo) while (phase !== skipTo) enter(PHASES[PHASES.indexOf(phase) + 1]);      // проби: направо в по-късна фаза

  return {
    start: () => JSON.parse(startJson),
    join, leave, pose, act, tick, snapshot,
    // само за проби: товар в мелачката и месо в запаса, без да се чака вечерта
    debug: { load: (n = 1) => { hopper = Math.min(RULES.grinder.hopper, hopper + n); }, stock: (n = 6) => { meatStock += n; }, cash: (n = 100) => { money += n; }, lab: () => ({ stashOpen, stashWant, pending: pending.slice(), pots: pots.map((q) => q.s), shred: { ...shred }, mixer: { ...mixer, mix: mixer.mix.slice() }, on: labOn }) },
    get over() { return over; },
  };
}

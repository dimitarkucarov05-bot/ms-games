// „Задната стая" (backroom): авторитетните правила на играта. Договорът е docs/SPEC.md, т. 1–6 и 8.
// Чист модул: без мрежа, без файлове, без таймери, без Date.now(). Времето идва само от opts.now и tick(now).

export const SURFACE_Y = 0.85;
export const REACH = 0.45;

// Всички числа за настройка на едно място. Времената са в секунди при нормална скорост;
// с opts.fast се делят на fastDiv (без люлеенето на иглата и живота на събитията).
export const RULES = {
  phases: { tutorial: 60, day: 210, closing: 20, night: 210, rush: 180, raid: 45 },
  fastDiv: 6,
  cookDone: 6, cookBurn: 8, pour: 3, poof: 3,
  snapSlot: 0.30, snapStack: 0.25, surfaceUp: 0.40, surfaceDown: 0.15,
  maxStack: 6, maxMix: 6, maxItems: 80,
  walk: 1.5, linger: 1.2,
  interval: (n) => clamp(12 - n, 6, 10),      // секунди между клиентите според броя играчи
  patience: (n) => clamp(54 - 3 * n, 36, 51), // търпение според броя играчи (45 с при трима)
  rushSlow: 1.2, specialShare: 0.3,
  pay: { burger: 8, part: 2, fries: 5, cup: 4, bag: 25, special: 40, tip: 0.5 },
  cover: { start: 0.5, ok: 0.05, bad: 0.08, shield: 0.5 },
  patrol: { min: 50, max: 80, warn: 3, on: 6, crouch: 1.15, still: 0.15, sus: 0.12 },
  burner: { period: 3, zone: 0.30, tol: 0.04, hits: 3, missSus: 0.05, ruinAt: 3, cooldown: 0.4 },
  packStep: 0.25, bags: 4,
  grow: { time: 90, dryMin: 20, dryMax: 30, bonus: 30, sus: 0.04 },   // лехата в лабораторията
  elevator: { doors: 1, travel: 3, front: 1.0, patrolSus: 0.03 },      // врати, пътуване, свободно пред вратата
  doorSus: 0.02, evidence: { money: 15, sus: 0.05 },
  stars: [45, 90, 140, 200],                  // пари на играч за 2, 3, 4 и 5 звезди
  eventMs: 3000,
};

const PHASES = ['tutorial', 'day', 'closing', 'night', 'rush', 'raid'];
const INGS = ['ing_a', 'ing_b', 'ing_c', 'ing_d'];
const ING = new Set(INGS);
const LAB = new Set([...INGS, 'beaker', 'tray', 'bag']);
const BURGER_PARTS = new Set(['bun_bottom', 'patty', 'cheese', 'lettuce', 'bun_top']);
const PART_H = { bun_bottom: 0.03, bun_top: 0.05, patty: 0.02, cheese: 0.01, lettuce: 0.015 };
const ITEM_KINDS = ['bun_bottom', 'bun_top', 'patty', 'cheese', 'lettuce', 'plate', 'fries', 'cup', ...INGS, 'beaker', 'tray', 'bag'];
const SERVE = ['plate', 'fries', 'cup', 'bag'];
const SURFACES = new Set(['grill', 'fryer', 'prep', 'counter', 'mixer', 'burner', 'packer']);

// ───────── текстове (без емоджита); kids е същата игра с друга кожа ─────────

const NIGHT = {
  title: { tutorial: 'Обучение', day: 'Ден', closing: 'Затваряме', night: 'Нощ', rush: 'Двете наведнъж', raid: 'Акция', over: 'Край' },
  hint: {
    tutorial: 'Направете по един бургер и го сервирайте.',
    day: 'Обслужете клиентите.',
    closing: 'Затваряме. Асансьорът в склада води долу.',
    night: 'Смесете, загрейте, опаковайте, продайте.',
    rush: 'Магазинът горе и лабораторията долу работят.',
    raid: 'Акция! Изхвърлете всичко от лабораторията.',
    over: 'Край на смяната.',
    overCaught: 'Хванаха ви.',
    patrolWarn: 'Патрул! Клекнете или замръзнете.',
    patrolOn: 'Патрулът минава. Не мърдайте.',
    growDry: 'Растенията са сухи. Полейте ги.',
    growReady: 'Реколтата е готова. Оберете я.',
  },
  signShop: {
    tutorial: 'ОБУЧЕНИЕ\nЧиния, долна питка, печено кюфте, горна питка',
    day: 'МЕНЮ\nБургер по поръчка. Картофи от фритюрника. Пълна чаша.',
    closing: 'ЗАТВОРЕНО',
    night: 'ЗАТВОРЕНО',
    rush: 'МЕНЮ\nБургер по поръчка. Картофи от фритюрника. Пълна чаша.',
    raid: 'АКЦИЯ',
    over: 'КРАЙ',
  },
  signLab: {
    tutorial: 'ЗАТВОРЕНО',
    day: 'ЗАТВОРЕНО',
    closing: 'РЕЦЕПТА: {r}\nСмеси. Загрей три пъти. Опаковай. Продай през шубера.',
    night: 'РЕЦЕПТА: {r}\nСмеси. Загрей три пъти. Опаковай. Продай през шубера.',
    rush: 'РЕЦЕПТА: {r}\nСмеси. Загрей три пъти. Опаковай. Продай през шубера.',
    raid: 'ВСИЧКО В КОША',
    over: 'КРАЙ',
  },
  deny: {
    bad: 'Невалидно действие',
    over: 'Играта свърши',
    noPose: 'Няма поза от каската',
    far: 'Твърде далеч',
    handFull: 'Ръката е заета',
    handEmpty: 'Ръката е празна',
    noItem: 'Няма такъв предмет',
    held: 'Друг го държи',
    noStation: 'Няма такава станция',
    notBin: 'Оттук не се взима',
    noButton: 'Тук няма бутон',
    labClosed: 'Задната стая е затворена',
    raidBins: 'Късно е. Скрийте всичко',
    tooMany: 'Твърде много предмети',
    noCup: 'Сложи чаша',
    cupFull: 'Чашата е пълна',
    otherDrink: 'В чашата има друга напитка',
    noBeaker: 'Сложи колба',
    beakerEmpty: 'Колбата е празна',
    alreadyMixed: 'Вече е разбъркано',
    notMixed: 'Първо разбъркай',
    ruined: 'Колбата е съсипана',
    wait: 'Изчакай',
    noTray: 'Сложи тава',
    growing: 'Още расте',
    otherLevel: 'Това е на другото ниво',
    enterCabin: 'Влез в кабината',
    liftBusy: 'Асансьорът се движи',
    wrongOrder: 'Това не е поръчката',
  },
};

const KIDS = {
  title: { ...NIGHT.title, night: 'Тайният лаб', raid: 'Проверка' },
  hint: {
    ...NIGHT.hint,
    closing: 'Затваряме. Асансьорът в склада води към тайния лаб.',
    night: 'Смесете, загрейте, опаковайте бонбоните.',
    rush: 'Магазинът горе и тайният лаб долу работят.',
    raid: 'Проверка! Приберете всичко от тайния лаб.',
    overCaught: 'Инспекторът ви хвана.',
    patrolWarn: 'Инспекторът идва! Клекнете или замръзнете.',
    patrolOn: 'Инспекторът гледа. Не мърдайте.',
    growDry: 'Бонбоненото растение е жадно. Полейте го.',
    growReady: 'Бонбоните са узрели. Оберете ги.',
  },
  signShop: { ...NIGHT.signShop, raid: 'ПРОВЕРКА' },
  signLab: {
    ...NIGHT.signLab,
    closing: 'БОНБОНИ: {r}\nСмеси. Загрей три пъти. Опаковай. Пусни през шубера.',
    night: 'БОНБОНИ: {r}\nСмеси. Загрей три пъти. Опаковай. Пусни през шубера.',
    rush: 'БОНБОНИ: {r}\nСмеси. Загрей три пъти. Опаковай. Пусни през шубера.',
    raid: 'ВСИЧКО В КОША',
  },
  deny: {
    ...NIGHT.deny,
    labClosed: 'Тайният лаб е затворен',
    raidBins: 'Късно е. Приберете всичко',
    noBeaker: 'Сложи буркан',
    beakerEmpty: 'Бурканът е празен',
    ruined: 'Сместа е развалена',
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

const SIZE = {   // ширина, височина, дълбочина (SPEC т. 3)
  bin: [0.30, 0.85, 0.30], grill: [0.70, 0.85, 0.50], fryer: [0.45, 0.85, 0.50], drinks: [0.50, 1.40, 0.40],
  prep: [0.80, 0.85, 0.50], trash: [0.35, 0.60, 0.35], mixer: [0.60, 0.85, 0.50], burner: [0.50, 0.85, 0.50],
  packer: [0.70, 0.85, 0.50], hatch: [0.40, 0.40, 0.20], door: [1.20, 2.0, 0.08], sign: [1.6, 0.5, 0.05],
  grow: [1.20, 0.90, 0.50], elevator: [1.6, 2.3, 1.6],
};
const DOOR_HALF = 0.6, WALL_T = 0.08, WALL_H = 2.0, COUNTER_D = 0.5, SIGN_Y = 1.55, HATCH_Y = 0.9;
const SLOTS = {   // гнезда в местните координати на станцията: [x, y, z, приема]; +z е предната страна
  grill: [[-0.22, SURFACE_Y, 0, ['patty']], [0, SURFACE_Y, 0, ['patty']], [0.22, SURFACE_Y, 0, ['patty']]],
  fryer: [[0, SURFACE_Y, 0, ['fries']]],
  drinks: [[-0.12, SURFACE_Y, 0.08, ['cup']], [0.12, SURFACE_Y, 0.08, ['cup']]],   // 0 = cola, 1 = orange
  prep: [[-0.2, SURFACE_Y, 0, ['plate']], [0.2, SURFACE_Y, 0, ['plate']]],
  trash: [[0, 0.6, 0, ITEM_KINDS]],
  mixer: [[0, SURFACE_Y, 0, ['beaker']]],
  burner: [[0, SURFACE_Y, 0, ['beaker']]],
  packer: [[-0.16, SURFACE_Y, 0, ['tray']]],
  hatch: [[0, 0.2, 0.05, ['bag']]],
};
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
    bin('plate'), def('prep', 'prep'), bin('bun_bottom'),
    bin('patty'), def('grill', 'grill'), ...(trash ? [def('trash', 'trash')] : []),
    def('drinks', 'drinks'), bin('cup'), bin('lettuce'),
    bin('cheese'), bin('bun_top'), bin('fries'), def('fryer', 'fryer'),
  ];
  const zs = hd - COUNTER_D - STAND;
  const base = [{
    r: { x0: -hw, x1: hw, z0: hd - COUNTER_D, z1: hd },
    acc: seats.map((s) => ({ x0: s.x - 0.02, x1: s.x + 0.02, z0: zs - 0.02, z1: zs + 0.02 })),
  }];
  const packShop = (obst, clear) => packBest(shopRails, [0, 3, 1, 2],
    { defs: shopDefs(true), pref: [3, 3, 3, 4] }, { defs: shopDefs(false), pref: [3, 2, 3, 4], dropped: 'trash' }, base, obst, clear);

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
  const storeDefs = [def('trash_store', 'trash'), bin('beaker'), bin('ing_a'), bin('ing_b'), bin('ing_c'), bin('ing_d')];
  const packStore = (obst, clear) => packBest(storeRails, [1, 3, 2, 0, 4], { defs: storeDefs, pref: [1, 0, 5, 0, 0] }, null, lift, obst, clear);

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
  const labDefs = (grow) => [
    def('mixer', 'mixer'), def('burner', 'burner'), def('packer', 'packer'), def('hatch', 'hatch', { y: HATCH_Y }),
    ...(grow ? [def('grow', 'grow')] : []),
  ];
  const packLab = (obst, clear) => packBest(labRails, [1, 3, 0, 2],
    { defs: labDefs(true), pref: [1, 1, 2, 1] }, { defs: labDefs(false), pref: [1, 1, 2, 0], dropped: 'grow' }, lift, obst, clear);

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
  const lab = fitRoom(packLab, labRails, 'lab', 'лабораторията');
  if (!shop || !store || !lab) throw new Error('backroom: залата е твърде малка за станциите');
  if (shop.dropped) warnings.push('trash: няма място за кош в магазина; остава кошът в склада (trash_store)');
  if (lab.dropped) warnings.push('grow: няма място за лехата в лабораторията; играта върви без нея');

  const put = (res, level) => {
    for (const o of res.outs) {
      const q = o.def;
      const st = add(q.id, q.kind, level, o.cx, q.y, o.cz, o.rail.yaw, [q.w, q.h, q.d], q.gives ? { gives: q.gives } : null);
      for (const [lx, ly, lz, accepts] of SLOTS[q.kind] || []) slot(st, lx, ly, lz, accepts.slice());
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
    if (st.kind === 'wall' || st.kind === 'shutter' || st.kind === 'door' || st.kind === 'elevator') continue;
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

export function createGame(opts = {}) {
  const theme = opts.theme === 'kids' ? 'kids' : 'night';
  const TX = TEXT[theme];
  const speed = opts.fast ? RULES.fastDiv : 1;
  const S = (sec) => sec / speed;
  const seed = fin(opts.seed) ? opts.seed : 1;
  const rand = rng(seed);
  const growRand = rng((seed ^ 0x51ed270b) >>> 0);   // отделен генератор: лехата не размества останалата случайност
  const layout = buildLayout(opts.hall, opts.obstacles);
  const hall = layout.hall, hw = hall.w / 2, hd = hall.d / 2;
  const seatZ = layout.seats[0].z, farZ = seatZ + 2.6;

  const duration = {};
  for (const p of PHASES) duration[p] = r3(S(RULES.phases[p]));
  const startJson = JSON.stringify({ game: 'backroom', theme, hall, stations: layout.stations, seats: layout.seats, duration,
    obstacles: layout.obstacles, warnings: layout.warnings, elevator: layout.elevator, levels: layout.levels });

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
  const burnerRec = stationById.get('burner');
  const growRec = stationById.get('grow') || null;   // с препятствия може да я няма
  const serveSlots = stationById.get('counter').slots;
  const liftRec = stationById.get('elevator');
  const liftIds = layout.stations.filter((st) => st.kind === 'elevator').map((st) => st.id);
  const cab = liftRec.box;   // подът на кабината: едно и също място на двете нива

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
  let tutorialSpawned = 0, tutorialServed = 0, nextSpawnAt = Infinity, peak = 0;
  let recipe = [], zone = [0.35, 0.65], burnerCool = 0, packProgress = 0;
  let doorOpen = 0, shutterOpen = 1;
  let patrol = null, nextPatrolAt = Infinity;
  const wetFor = () => S(RULES.grow.dryMin + growRand() * (RULES.grow.dryMax - RULES.grow.dryMin));
  const grow = growRec ? { stage: 0, dry: false, wet: wetFor() } : null;   // wet: секунди растеж до засъхване
  // асансьорът: idle → closing (вратите се затварят) → moving → opening (на другото ниво) → idle
  const lift = { level: 0, phase: 'idle', until: 0, doors: 1, to: 0, riders: [] };

  // ── събития ──
  function emit(kind, f) {
    const e = { id: nextEvent++, kind, at: nowMs };
    if (f) {
      for (const k of ['x', 'y', 'z', 'amount', 'level', 'to']) if (fin(f[k])) e[k] = r3(f[k]);
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
  const labOpen = () => phase === 'closing' || phase === 'night' || phase === 'rush' || phase === 'raid';
  const addSus = (a) => { suspicion = Math.min(1, suspicion + a * (1 - RULES.cover.shield * cover)); };
  const addCover = (a) => { cover = clamp(cover + a, 0, 1); };
  const pubPlayer = (pl) => ({ id: pl.id, n: pl.n, name: pl.name, served: pl.served, cooked: pl.cooked, packed: pl.packed, mistakes: pl.mistakes });

  function join(id, info) {
    let pl = players.get(id);
    if (!pl) {
      pl = gone.get(id) || { id, n: players.size + gone.size + 1, name: '', served: 0, cooked: 0, packed: 0, mistakes: 0 };
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
    if (patrol) { patrol.anchors.delete(id); patrol.caught.delete(id); }
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
      case 'patty': case 'fries': return { cook: 0 };
      case 'plate': return { stack: [], cooks: [] };
      case 'cup': return { fill: 0, drink: null };
      case 'beaker': return { mix: [], mixed: false, heat: 0, ruined: false };
      case 'tray': return { ready: true };
      default: return {};
    }
  }
  function newItem(kind, level) {
    const it = { id: nextItem++, kind, level, x: 0, y: 0, z: 0, yaw: 0, holder: null, hand: null, slot: null, state: initState(kind),
      floor: false, poofAt: 0, by: null, pour: false, hits: 0, misses: 0 };
    items.set(it.id, it);
    return it;
  }
  function detach(it) {
    if (it.slot != null) {
      const s = slotById.get(it.slot);
      if (s && s.item === it.id) s.item = null;
      if (s && s.kind === 'packer') packProgress = 0;   // извадена тава: опаковането почва отначало
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
    it.x = clamp(p.x, -hw + 0.05, hw - 0.05);
    it.z = clamp(p.z, -hd + 0.05, hd - 0.05);
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
  const stackHeight = (plate) => 0.02 + plate.state.stack.reduce((h, k) => h + (PART_H[k] || 0.02), 0);

  // ── поръчки ──
  const cookedOk = (c) => { const v = r3(c); return v >= 1 && v < 2; };
  function orderOk(o, it) {
    if (!it) return false;
    if (o.kind === 'burger') {
      if (it.kind !== 'plate') return false;
      const st = it.state.stack;
      if (st.length !== o.stack.length || st[0] !== 'bun_bottom' || st[st.length - 1] !== 'bun_top') return false;
      if (st.slice(1, -1).sort().join() !== o.stack.slice(1, -1).sort().join()) return false;
      return it.state.cooks.every(cookedOk);
    }
    if (o.kind === 'fries') return it.kind === 'fries' && cookedOk(it.state.cook);
    if (o.kind === 'cup') return it.kind === 'cup' && it.state.fill >= 0.9 && it.state.drink === o.drink;
    if (o.kind === 'bag') return it.kind === 'bag';
    return false;
  }
  function payFor(c) {
    const o = c.order, P = RULES.pay;
    const base = o.kind === 'burger' ? P.burger + P.part * o.stack.length : o.kind === 'fries' ? P.fries : o.kind === 'cup' ? P.cup : P.special;
    return base + (c.tutorial ? 0 : Math.round(base * P.tip * c.patience));
  }
  // pl: играчът, който току-що е сложил предмета (тогава грешката се наказва); null: тиха проверка
  function evalServe(s, pl) {
    if (s.item == null) return;
    const c = customers.find((q) => q.seat === s.idx && q.state === 'wait');
    if (!c) return;
    const it = items.get(s.item);
    if (orderOk(c.order, it)) {
      const who = players.get(pl ? pl.id : it.by) || gone.get(it.by) || null;
      const amount = payFor(c);
      money += amount;
      if (who) who.served++;
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

  // ── пускане: петте правила от SPEC т. 5, по ред; само сред нещата на нивото на играча ──
  function place(it, p, yaw, pl) {
    const L = pl.level;
    it.yaw = yaw;
    // 1. свободно гнездо, което приема този kind, до 0.30 м
    let best = null, bd = RULES.snapSlot + 1e-9;
    for (const s of slotList) {
      if (s.level !== L || s.item != null || !s.accepts.includes(it.kind)) continue;
      const dd = dist(p, s);
      if (dd <= bd) { bd = dd; best = s; }
    }
    if (best) {
      if (best.kind === 'trash') {
        emit('poof', at(best));
        removeItem(it);
      } else if (best.kind === 'hatch') {
        money += RULES.pay.bag;
        emit('sold', at(best, { player: pl.id }));
        emit('cash', at(best, { player: pl.id, amount: RULES.pay.bag }));
        removeItem(it);
      } else {
        putInSlot(it, best);
        if (best.kind === 'burner') rollZone();
        if (best.kind === 'counter') evalServe(best, pl);
      }
      return 1;
    }
    // 2. част за бургер до чиния (в гнездо или на плот), до 0.25 м: влиза в стека
    if (BURGER_PARTS.has(it.kind)) {
      let plate = null; bd = RULES.snapStack + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== 'plate' || q.holder != null || q.floor || q.level !== L || q.state.stack.length >= RULES.maxStack) continue;
        const dd = segDist(p, q.x, q.y, q.y + stackHeight(q), q.z);
        if (dd <= bd) { bd = dd; plate = q; }
      }
      if (plate) {
        plate.state.stack.push(it.kind);
        if (it.kind === 'patty') plate.state.cooks.push(r3(it.state.cook));
        plate.by = it.by;
        removeItem(it);
        const s = plate.slot != null ? slotById.get(plate.slot) : null;
        if (s && s.kind === 'counter') evalServe(s, null);
        return 2;
      }
    }
    // 3. съставка до колба, до 0.25 м: влиза в сместа
    if (ING.has(it.kind)) {
      let beaker = null; bd = RULES.snapStack + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== 'beaker' || q.holder != null || q.floor || q.level !== L) continue;
        if (q.state.mixed || q.state.ruined || q.state.mix.length >= RULES.maxMix) continue;
        const dd = segDist(p, q.x, q.y, q.y + 0.16, q.z);
        if (dd <= bd) { bd = dd; beaker = q; }
      }
      if (beaker) {
        beaker.state.mix.push(it.kind);
        removeItem(it);
        return 3;
      }
    }
    // 4. над плот на станция (в правоъгълника ѝ, до 0.40 над плота): ляга на плота
    for (const rec of surfaces) {
      const b = rec.box;
      if (rec.level !== L || p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) continue;
      if (p.y < b.y1 - RULES.surfaceDown || p.y > b.y1 + RULES.surfaceUp) continue;
      it.x = p.x; it.y = b.y1; it.z = p.z; it.level = L;
      return 4;
    }
    // 5. пада на пода и след 3 с изчезва
    toFloor(it, p, L);
    return 5;
  }

  // ── лабораторията ──
  function newRecipe() {
    const len = rand() < 0.5 ? 3 : 4;
    recipe = [];
    for (let i = 0; i < len; i++) recipe.push(INGS[Math.floor(rand() * INGS.length)]);
  }
  function rollZone() {
    const a = 0.1 + rand() * (0.8 - RULES.burner.zone);
    zone = [a, a + RULES.burner.zone];
  }
  // иглата се люлее 0 … 1 … 0; не се забързва във fast режим, за да може човек да я уцели
  function needle() {
    const ph = (time / RULES.burner.period) % 1;
    return ph < 0.5 ? ph * 2 : 2 - ph * 2;
  }
  const inSlot = (rec, i = 0) => { const s = rec && rec.slots[i]; return s && s.item != null ? items.get(s.item) : null; };

  // ── клиенти ──
  function randomOrder() {
    if (phase === 'rush' && rand() < RULES.specialShare) return { order: { kind: 'bag' }, special: true };
    const r = rand();
    if (r < 0.5) {
      const q = rand();
      const mid = q < 0.3 ? ['patty'] : q < 0.5 ? ['patty', 'cheese'] : q < 0.7 ? ['patty', 'lettuce'] : ['patty', 'cheese', 'lettuce'];
      return { order: { kind: 'burger', stack: ['bun_bottom', ...mid, 'bun_top'] }, special: false };
    }
    if (r < 0.75) return { order: { kind: 'fries' }, special: false };
    return { order: { kind: 'cup', drink: rand() < 0.5 ? 'cola' : 'orange' }, special: false };
  }
  function spawnCustomer(order, special, tutorial) {
    const free = [];
    seatBusy.forEach((b, i) => { if (!b) free.push(i); });
    if (!free.length) return false;
    const seat = free[Math.floor(rand() * free.length)];
    seatBusy[seat] = true;
    const np = Math.max(1, players.size);
    customers.push({ id: nextCustomer++, look: Math.floor(rand() * 6), seat, x: layout.seats[seat].x, z: farZ, zFrom: farZ, yaw: Math.PI,
      state: 'in', patience: 1, order, special, tutorial, t0: time, patDur: S(RULES.patience(np)) });
    return true;
  }
  function sendAway(c) {
    if (c.state === 'out') return;
    c.state = 'out'; c.t0 = time; c.zFrom = c.z; c.yaw = 0;
    seatBusy[c.seat] = false;
  }
  function leaveAll() { for (const c of customers) if (c.state === 'in' || c.state === 'wait') sendAway(c); }

  function stepCustomers(h) {
    if (phase === 'tutorial') {
      while (tutorialSpawned < players.size) {
        if (!spawnCustomer({ kind: 'burger', stack: ['bun_bottom', 'patty', 'bun_top'] }, false, true)) break;
        tutorialSpawned++;
      }
      // всички са си направили бургера: не чакаме таймера
      if (players.size > 0 && tutorialSpawned >= players.size && tutorialServed >= tutorialSpawned && phaseEnd - time > S(3)) phaseEnd = time + S(3);
    } else if ((phase === 'day' || phase === 'rush') && time >= nextSpawnAt) {
      const o = randomOrder();
      if (spawnCustomer(o.order, o.special, false)) {
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
        if (c.patience <= 0) {   // изпуснат клиент
          c.patience = 0; c.state = 'angry'; c.t0 = time;
          addCover(-RULES.cover.bad);
          emit('order_bad', at(serveSlots[c.seat]));
        }
      } else if (c.state === 'happy' || c.state === 'angry') {
        if (time - c.t0 >= S(RULES.linger)) sendAway(c);
      } else {
        const k = (time - c.t0) / S(RULES.walk);
        if (k >= 1) customers.splice(i, 1);
        else c.z = c.zFrom + (farZ - c.zFrom) * k;
      }
    }
  }

  // ── готвене и наливане ──
  function stepCooking(h) {
    for (const it of items.values()) {
      if (it.slot == null) continue;
      const kind = slotById.get(it.slot).kind;
      if ((kind === 'grill' && it.kind === 'patty') || (kind === 'fryer' && it.kind === 'fries')) {
        const c = it.state.cook;
        if (c >= 2) continue;
        if (c < 1) it.state.cook = Math.min(1, c + h / S(RULES.cookDone));
        else {
          it.state.cook = Math.min(2, c + h / S(RULES.cookBurn));
          if (it.state.cook >= 2) emit('burn', at(it));
        }
      } else if (kind === 'drinks' && it.pour) {
        it.state.fill = Math.min(1, it.state.fill + h / S(RULES.pour));
        if (it.state.fill >= 1) it.pour = false;
      }
    }
  }

  // ── лехата: расте през night и rush, засъхва и чака поливане ──
  function stepGrow(h) {
    if (!grow || (phase !== 'night' && phase !== 'rush') || grow.dry || grow.stage >= 1) return;
    grow.stage = Math.min(1, grow.stage + h / S(RULES.grow.time));
    grow.wet -= h;
    if (grow.stage < 1 && grow.wet <= 0) grow.dry = true;
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

  // ── патрул: гледа само уличното ниво ──
  function isHidden(pl) {
    const h = headPos(pl);
    if (pl.level !== 0 || !h || h.y < RULES.patrol.crouch) return true;
    const a = patrol.anchors.get(pl.id);
    return !a || dist(h, a) <= RULES.patrol.still;
  }
  function endPatrol() {
    if (!patrol) return;
    patrol = null;
    emit('patrol_off');
    nextPatrolAt = time + S(RULES.patrol.min + rand() * (RULES.patrol.max - RULES.patrol.min));
  }
  function stepPatrol() {
    const R = RULES.patrol;
    if (phase !== 'night') return;
    if (!patrol) {
      if (time >= nextPatrolAt && phaseEnd - time >= S(R.warn + R.on + 1)) {
        patrol = { phase: 'warn', until: time + S(R.warn), anchors: new Map(), caught: new Set() };
        emit('patrol_warn', { text: TX.hint.patrolWarn });
      }
      return;
    }
    if (patrol.phase === 'warn') {
      if (time >= patrol.until) {
        patrol.phase = 'on'; patrol.until = time + S(R.on);
        for (const pl of players.values()) { const h = headPos(pl); if (h && pl.level === 0) patrol.anchors.set(pl.id, h); }
        emit('patrol_on', { text: TX.hint.patrolOn });
        if (grow && grow.stage >= 1) addSus(RULES.grow.sus);   // готова, необрана леха
      }
      return;
    }
    for (const pl of players.values()) {
      const h = headPos(pl);
      if (pl.level !== 0) { patrol.anchors.delete(pl.id); continue; }   // долу е в безопасност
      if (!h || patrol.caught.has(pl.id)) continue;
      if (!patrol.anchors.has(pl.id)) { patrol.anchors.set(pl.id, h); continue; }   // влязъл или качил се по средата
      if (!isHidden(pl)) {
        patrol.caught.add(pl.id);
        addSus(R.sus);
        emit('caught', { player: pl.id, x: h.x, y: h.y, z: h.z, level: 0 });
      }
    }
    if (time >= patrol.until) endPatrol();
  }
  function hiddenFlag(pl) {
    if (!patrol) return false;
    if (pl.level !== 0) return true;
    if (patrol.phase === 'warn') { const h = headPos(pl); return !!h && h.y < RULES.patrol.crouch; }
    return !patrol.caught.has(pl.id) && isHidden(pl);
  }

  // ── врата, ролетка, под ──
  const toward = (v, target, stepBy) => (v < target ? Math.min(target, v + stepBy) : Math.max(target, v - stepBy));
  function stepDoors(h) {
    shutterOpen = toward(shutterOpen, phase === 'closing' || phase === 'night' ? 0 : 1, h / S(2));
    let target = 0, rate = h / S(2);
    if (phase === 'closing' || phase === 'night' || phase === 'raid') target = 1;
    else if (phase === 'rush') {   // автоматична: отваря се, докато някой на уличното ниво е в отвора
      rate = h / S(0.3);
      for (const pl of players.values()) {
        const p = headPos(pl);
        if (p && pl.level === 0 && Math.abs(p.x) < DOOR_HALF && Math.abs(p.z) < 0.4) { target = 1; break; }
      }
    }
    doorOpen = toward(doorOpen, target, rate);
    if (phase === 'rush' && doorOpen > 0.5 && customers.some((c) => !c.special && c.state === 'wait')) addSus(RULES.doorSus * h * speed);
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
    if (p === 'closing') { leaveAll(); nextSpawnAt = Infinity; newRecipe(); rollZone(); }
    if (p === 'night') nextPatrolAt = time + S(RULES.patrol.min + rand() * (RULES.patrol.max - RULES.patrol.min));
    if (p === 'rush') { if (patrol) { patrol = null; emit('patrol_off'); } nextPatrolAt = Infinity; nextSpawnAt = time + S(2); }
    if (p === 'raid') { leaveAll(); nextSpawnAt = Infinity; }
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
    result = { money, stars: clamp(stars, 1, 5), caught, players: [...players.values(), ...gone.values()].map(pubPlayer) };
    emit('phase', { text: caught ? TX.hint.overCaught : TX.title.over });
  }
  function raidEnd() {
    // всичко от лабораторията, което още съществува (на което и да е ниво, и в ръка), е улика
    for (const it of items.values()) {
      if (!LAB.has(it.kind)) continue;
      const p = itemPos(it);
      money = Math.max(0, money - RULES.evidence.money);
      addSus(RULES.evidence.sus);
      emit('cash', { x: p.x, y: p.y, z: p.z, level: itemLevel(it), amount: -RULES.evidence.money });
    }
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
    stepGrow(h);
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
    detach(it);
    hold(it, pl, hand);
    return { ok: true, item: it.id };
  }

  function doTake(pl, hand, hp, msg) {
    const rec = stationById.get(msg.station);
    if (!rec) return refuse(pl, hp, 'noStation');
    if (rec.st.kind !== 'bin') return refuse(pl, hp, 'notBin');
    if (pl.hands[hand] != null) return refuse(pl, hp, 'handFull');
    if (rec.level !== pl.level) return refuse(pl, hp, 'otherLevel');
    if (boxDist(hp, rec.box) > REACH) return refuse(pl, hp, 'far');
    if (LAB.has(rec.st.gives)) {
      if (!labOpen()) return refuse(pl, hp, 'labClosed');
      if (phase === 'raid') return refuse(pl, hp, 'raidBins');
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
    if (kind === 'drinks') {
      let c = msg.control === 0 || msg.control === 1 ? msg.control : null;
      if (c === null) {   // без control: по-близкото гнездо с чаша, която не е пълна
        const want = rec.slots.filter((s) => { const cup = s.item != null ? items.get(s.item) : null; return cup && cup.state.fill < 1; });
        const pool = want.length ? want : rec.slots;
        c = pool.reduce((a, s) => (dist(hp, s) < dist(hp, a) ? s : a), pool[0]).idx;
      }
      const cup = inSlot(rec, c);
      if (!cup) return refuse(pl, hp, 'noCup');
      if (cup.state.fill >= 1) return refuse(pl, hp, 'cupFull');
      const drink = c === 0 ? 'cola' : 'orange';
      if (cup.state.fill > 0 && cup.state.drink && cup.state.drink !== drink) return refuse(pl, hp, 'otherDrink');
      cup.state.drink = drink;
      cup.pour = true;
      return { ok: true };
    }
    if (kind === 'grow') {
      if (!labOpen()) return refuse(pl, hp, 'labClosed');
      const top = { x: rec.st.x, y: rec.box.y1, z: rec.st.z, level: rec.level, player: pl.id };
      if (grow.stage >= 1) {   // готово: обиране, бонус и отначало
        grow.stage = 0; grow.dry = false; grow.wet = wetFor();
        money += RULES.grow.bonus;
        emit('harvest', top);
        emit('cash', { ...top, amount: RULES.grow.bonus });
        return { ok: true };
      }
      if (grow.dry) {
        grow.dry = false; grow.wet = wetFor();
        emit('water', top);
        return { ok: true };
      }
      return refuse(pl, hp, 'growing');
    }
    if (kind !== 'mixer' && kind !== 'burner' && kind !== 'packer') return refuse(pl, hp, 'noButton');
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    const s = rec.slots[0];
    if (kind === 'mixer') {
      const b = inSlot(rec);
      if (!b) return refuse(pl, hp, 'noBeaker');
      if (b.state.ruined) return refuse(pl, hp, 'ruined');
      if (b.state.mixed) return refuse(pl, hp, 'alreadyMixed');
      if (!b.state.mix.length) return refuse(pl, hp, 'beakerEmpty');
      if (b.state.mix.join() === recipe.join()) {
        b.state.mixed = true;
        emit('mix_ok', at(s, { player: pl.id }));
        newRecipe();
      } else {
        b.state.mix = [];
        pl.mistakes++;
        emit('mix_bad', at(s, { player: pl.id }));
      }
      return { ok: true };
    }
    if (kind === 'burner') {
      const B = RULES.burner;
      const b = inSlot(rec);
      if (!b) return refuse(pl, hp, 'noBeaker');
      if (b.state.ruined) return refuse(pl, hp, 'ruined');
      if (!b.state.mixed) return refuse(pl, hp, 'notMixed');
      if (time < burnerCool) return refuse(pl, hp, 'wait');
      burnerCool = time + B.cooldown;
      const v = needle();
      if (v >= zone[0] - B.tol && v <= zone[1] + B.tol) {
        b.hits++;
        b.state.heat = Math.min(1, b.hits / B.hits);
        emit('hit', at(s, { player: pl.id }));
        rollZone();
        if (b.hits >= B.hits) {   // готово: колбата изчезва, на плота се появява тава
          removeItem(b);
          const tray = newItem('tray', rec.level);
          tray.x = rec.st.x; tray.y = rec.box.y1; tray.z = rec.st.z; tray.yaw = rec.st.yaw; tray.by = pl.id;
          pl.cooked++;
        }
      } else {
        b.misses++;
        addSus(B.missSus);
        emit('miss', at(s, { player: pl.id }));
        if (b.misses >= B.ruinAt) { b.state.ruined = true; emit('ruin', at(s, { player: pl.id })); }
      }
      return { ok: true };
    }
    // packer
    const tray = inSlot(rec);
    if (!tray) return refuse(pl, hp, 'noTray');
    packProgress += RULES.packStep;
    pl.packed++;
    emit('pack', at(s, { player: pl.id }));
    if (packProgress >= 1 - 1e-9) {
      packProgress = 0;
      removeItem(tray);
      const st = rec.st, c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
      for (let i = 0; i < RULES.bags; i++) {
        const lx = 0.1 + 0.14 * (i % 2), lz = i < 2 ? -0.08 : 0.1;
        const bag = newItem('bag', rec.level);
        bag.x = st.x + lx * c + lz * sn; bag.y = rec.box.y1; bag.z = st.z - lx * sn + lz * c; bag.yaw = st.yaw; bag.by = pl.id;
      }
    }
    return { ok: true };
  }

  // ── снимка за каските ──
  function pubState(it) {
    const s = it.state;
    switch (it.kind) {
      case 'patty': case 'fries': return { cook: r3(s.cook) };
      case 'plate': return { stack: s.stack.slice(), cooks: s.cooks.slice() };
      case 'cup': return { fill: r3(s.fill), drink: s.drink };
      case 'beaker': return { mix: s.mix.slice(), mixed: s.mixed, heat: r3(s.heat), ruined: s.ruined };
      case 'tray': return { ready: true };
      default: return {};
    }
  }
  function signText(table) {
    const s = table[phase] || '';
    return s.replace('{r}', recipe.map((k) => k.slice(4).toUpperCase()).join('  '));
  }
  function hintText() {
    if (over) return result.caught ? TX.hint.overCaught : TX.hint.over;
    if (patrol) return patrol.phase === 'warn' ? TX.hint.patrolWarn : TX.hint.patrolOn;
    if (grow && (phase === 'night' || phase === 'rush')) {
      if (grow.stage >= 1) return TX.hint.growReady;
      if (grow.dry) return TX.hint.growDry;
    }
    return TX.hint[phase];
  }

  function snapshot() {
    const burnerItem = inSlot(burnerRec);
    const slots = {};
    for (const s of slotList) slots[s.id] = s.item;
    const dyn = [
      { id: 'mixer', state: { recipe: labOpen() ? recipe.slice() : [] } },
      { id: 'burner', state: { needle: r3(needle()), zone: [r3(zone[0]), r3(zone[1])], hits: burnerItem ? burnerItem.hits : 0 } },
      { id: 'packer', state: { progress: r3(packProgress) } },
      { id: 'door', state: { open: r3(doorOpen) } },
      { id: 'shutter', state: { open: r3(shutterOpen) } },
    ];
    if (grow) dyn.push({ id: 'grow', state: { stage: r3(grow.stage), dry: grow.dry, ready: grow.stage >= 1 } });
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
      hint: hintText(),
      stations: dyn,
      slots,
      items: [...items.values()].map((it) => {
        const p = itemPos(it);
        return { id: it.id, kind: it.kind, level: itemLevel(it), x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(it.yaw), holder: it.holder, hand: it.hand, slot: it.slot, state: pubState(it) };
      }),
      customers: customers.map((c) => ({ id: c.id, look: c.look, seat: c.seat, x: r3(c.x), z: r3(c.z), yaw: r3(c.yaw), state: c.state,
        patience: r3(c.patience), order: c.order.stack ? { kind: c.order.kind, stack: c.order.stack.slice() } : { ...c.order }, special: c.special })),
      players: [...players.values()].map((pl) => ({ ...pubPlayer(pl), level: pl.level, hidden: hiddenFlag(pl) })),
      patrol: patrol ? { left: r3(Math.max(0, patrol.until - time)), phase: patrol.phase } : null,
      events: events.filter((e) => nowMs - e.at <= RULES.eventMs).map(({ at: _at, ...e }) => e),
      result: over ? { ...result, players: result.players.map((p) => ({ ...p })) } : null,
    };
  }

  emit('phase', { text: TX.title.tutorial });

  return {
    start: () => JSON.parse(startJson),
    join, leave, pose, act, tick, snapshot,
    get over() { return over; },
  };
}

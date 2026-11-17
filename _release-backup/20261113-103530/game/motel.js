// „Мъртвият мотел": правилата на играта (сървърът е съдията).
//
// Отборът стои в зоната пред изоставения мотел, зомбитата идват на вълни по пътеките от game/motel.map.json
// (ако го няма: от кръг на 25 м). Всеки контролер е оръжие. Клиентът смята попаденията с лъч и ги праща;
// тук се проверява дали са правдоподобни (живо ли е зомбито, скорострелност, патрони, разстояние) и се водят
// кръвта, точките, вълните и краят. Накрая идва шефът.
//
// Играта е жива, не стрелбище:
//   • Подготовка (RULES.intro секунди): портите в барикадите са полуразковани, на масата има оръжие. Първите зомбита
//     тръгват от тъмното още през нея (и през всяка почивка), така че сирената свири, когато вече са при дъските.
//   • Портите: всяка има дъски (RULES.gate.boards). Зомбито спира пред закована порта и блъска: всеки удар сваля дъска,
//     шефът я отнася цялата. Играч, застанал до портата с ръка към нея, я заковава обратно (ръката, която стреля, не кове).
//     През разбита порта зомбитата влизат при отбора.
//   • Варелите с гориво край пътеките гърмят при изстрел и отнасят всичко наоколо; връщат се в почивката.
//   • Токът спира на някои вълни (RULES.dark): надписът и огньовете гаснат, остават фенерите.
//   • Всяка вълна е по-бърза, а трудността се нагажда по отбора (heat): чиста вълна я вдига, паднал играч я сваля.
//
//   createGame(opts) → { start(), join(id, info), leave(id), pose(id, p), act(id, msg), tick(now), snapshot(), over }
//
// Действия от каската (act):
//   { a: 'shot', hand, o: [x,y,z], d: [x,y,z], hits: [[idЗомби, част(0 тяло, 1 глава), бройСачми], …], bomb: номерНаВарел }
//   { a: 'reload', hand, fast }            fast: с жест (цевта надолу), по-бързо
//   { a: 'take', hand, w }                 взима оръжие от сандъка в зоната

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fin = Number.isFinite;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const TYPES = ['walker', 'runner', 'screamer', 'boss'];
export const STATE = { walk: 0, attack: 1, stagger: 2, dead: 3, scream: 4, rise: 5 };

export const RULES = {
  minutes: 10,
  fastDiv: 6,                 // кратката проба: времето върви шест пъти по-бързо
  intro: 30,                  // подготовка: заковават се портите и се взима оръжие; после идва първата вълна
  breakTime: 12,              // почивка между вълните: време да се избере оръжие и да се заковат портите
  bossAt: 0.76,               // най-късно на тази част от времето идва шефът
  outro: 5,                   // след смъртта на шефа до края
  eventMs: 1200,              // колко дълго едно събитие стои в състоянието
  ring: 25,                   // без пътеки: раждане на кръг с този радиус
  player: { hp: 100, regenDelay: 5, regen: 9, downTime: 8, reviveHp: 60, downPenalty: 150, breakHeal: 30 },
  // трудност по избор на оператора при пускане: умножители върху броя, кръвта, скоростта и удара на зомбитата и върху
  // крайните точки (за да е честна класацията); chances: колко втори шанса повече или по-малко има групата
  levels: {
    easy: { size: 0.8, hp: 0.85, speed: 0.92, dmg: 0.65, score: 0.8, chances: 1 },
    normal: { size: 1, hp: 1, speed: 1, dmg: 1, score: 1, chances: 0 },
    hard: { size: 1.2, hp: 1.15, speed: 1.08, dmg: 1.3, score: 1.3, chances: 0 },
    nightmare: { size: 1.4, hp: 1.3, speed: 1.15, dmg: 1.65, score: 1.7, chances: -9 },
  },
  // dmg: щета на куршум (или сачма) в тялото; rpm: най-бърз темп; mag: пълнител; reserve: резерв (−1: безкраен)
  // Оръжията. Пистолетът е винаги в ръката и не свършва; останалите се взимат от избора след вълната (offers) и когато
  // свършат, в ръката пак е пистолетът. Във всеки избор има бързо, тежко и едно за отблизо; сборната им щета расте с избора.
  // range при близък бой: докъде стига острието от дланта; mag там е колко удара издържа. Шефът поема половината от близкия бой.
  weapons: {
    pistol: { dmg: 34, rpm: 420, mag: 12, reserve: -1, reload: 1.5, fast: 0.75, range: 60, pellets: 1, spread: 0.004, auto: false },
    smg: { dmg: 24, rpm: 760, mag: 30, reserve: 150, reload: 1.8, fast: 0.9, range: 45, pellets: 1, spread: 0.016, auto: true },
    revolver: { dmg: 95, rpm: 150, mag: 6, reserve: 42, reload: 2.0, fast: 1.0, range: 70, pellets: 1, spread: 0.003, auto: false },
    machete: { dmg: 115, rpm: 200, mag: 36, reserve: 0, reload: 0, fast: 0, range: 0.95, pellets: 1, spread: 0, auto: false, melee: 'swing' },
    shotgun: { dmg: 20, rpm: 80, mag: 6, reserve: 36, reload: 2.2, fast: 1.2, range: 22, pellets: 9, spread: 0.06, auto: false },
    axe: { dmg: 170, rpm: 150, mag: 30, reserve: 0, reload: 0, fast: 0, range: 1.05, pellets: 1, spread: 0, auto: false, melee: 'swing' },
    carbine: { dmg: 42, rpm: 480, mag: 20, reserve: 120, reload: 1.7, fast: 0.9, range: 70, pellets: 1, spread: 0.008, auto: true },
    rifle: { dmg: 58, rpm: 540, mag: 24, reserve: 120, reload: 2.0, fast: 1.0, range: 80, pellets: 1, spread: 0.006, auto: true },
    hunting: { dmg: 260, rpm: 55, mag: 5, reserve: 30, reload: 2.4, fast: 1.3, range: 120, pellets: 1, spread: 0.001, auto: false },
    chainsaw: { dmg: 46, rpm: 660, mag: 110, reserve: 0, reload: 0, fast: 0, range: 1.15, pellets: 1, spread: 0, auto: true, melee: 'saw' },
    lmg: { dmg: 38, rpm: 700, mag: 100, reserve: 100, reload: 3.2, fast: 1.8, range: 60, pellets: 1, spread: 0.02, auto: true },
  },
  // Изборът на оръжие: ред 0 е в подготовката, ред n е след изчистената вълна n (последният е срещу шефа).
  // Всеки играч взима по едно от текущия избор, с която ръка го докосне.
  offers: [
    ['smg', 'revolver', 'machete'],
    ['shotgun', 'smg', 'axe'],
    ['carbine', 'shotgun', 'axe'],
    ['rifle', 'hunting', 'chainsaw'],
    ['lmg', 'rifle', 'chainsaw'],
    ['lmg', 'hunting', 'chainsaw'],
  ],
  // hp: кръв; speed: м/с; dmg и every: удар и през колко секунди; reach: от колко метра удря; r и h: радиус и ръст за лъча
  zombies: {
    walker: { hp: 100, speed: 0.95, dmg: 12, every: 1.3, reach: 0.95, score: 10, r: 0.30, h: 1.80, stagger: 0.32 },
    runner: { hp: 55, speed: 2.5, dmg: 9, every: 0.9, reach: 0.95, score: 15, r: 0.28, h: 1.75, stagger: 0.22 },
    screamer: { hp: 80, speed: 1.2, dmg: 10, every: 1.2, reach: 0.95, score: 25, r: 0.30, h: 1.80, stagger: 0.32 },
    boss: { hp: 2600, speed: 1.05, dmg: 32, every: 2.0, reach: 1.9, score: 1000, r: 0.85, h: 3.7, stagger: 0.5 },      // огромен: почти два човешки боя
  },
  windup: 0.45,               // от замаха до удара
  screamer: { range: 9, keep: 6, every: 7, time: 2.2, buff: 14, rage: 5, speed: 1.5, charges: 3 },
  boss: { head: 2.5, flinch: 600, rageAt: 0.4, rageSpeed: 1.5, smash: 2.2, adds: 4 },
  // цялата група е паднала и вторите шансове са свършили: играта продължава (платеното време не се губи), но струва точки,
  // звезда и малко от трудността. Само на „кошмар" това е краят. revive: колко пъти по-бързо става падналият до прав съотборник.
  wipe: { score: 400, heat: 0.15, up: 1.5, revive: 3, near: 1.3 },
  combo: { window: 3, step: 0.05, max: 20 },
  bonus: { wave: 100, clean: 50, second: 5 },
  // Портите. boards: дъски на порта; start: колко са заковани в началото; fix: секунди за една дъска с една ръка;
  // hands: най-много ръце наведнъж; half: половин ширина на мястото за коване; reachIn/reachOut: колко навътре и навън от
  // линията на портата се брои ръката; calm: толкова секунди след изстрел ръката не кове; stop/inside: къде спира зомбито
  // пред дъските и докъде влиза, преди да тръгне към играчите; points: точки за дъска.
  gate: { boards: 6, start: 3, fix: 0.7, hands: 2, half: 1.2, reachIn: 1.05, reachOut: 0.3, calm: 0.6, stop: 0.62, inside: 0.7, points: 5 },
  // Варелите с гориво: r: радиус на взрива; boss: щета по шефа; max: най-много варели; ahead и aside: на колко метра преди
  // портата по пътя и колко встрани от него стоят.
  bombs: { r: 3.6, boss: 320, max: 3, ahead: 6, aside: 1.3 },
  dark: [4],                  // на тази вълна токът спира
  faster: 0.035,              // всяка следваща вълна зомбитата са с толкова по-бързи (най-много +40%)
  // Вълните не растат равномерно: редуват се спокойни, тежки и бързи, за да има дъх и после удар. size: колко зомбита спрямо
  // основната бройка; gap: през колко излизат (по-малко е по-нагъсто); run: дял тичащи; creep: дял от тичащите, които бягат
  // ниско приведени с протегнати ръце; scream: пищящи; rest: колко дълга е почивката след вълната. Вълните са точно толкова,
  // колкото са редовете: след последната идва шефът (или най-късно на bossAt от времето).
  waves: [
    { size: 1.4, gap: 1.6, run: 0, creep: 0, scream: 0, rest: 1 },          // 1 FIRST CONTACT: бавни, от всички страни, да се научат портите
    { size: 1.7, gap: 2.2, run: 0.18, creep: 0, scream: 1, rest: 1.1 },     // 2 THEY KEEP COMING: повече, първите тичащи и една пищяща
    { size: 1.5, gap: 1.0, run: 0.6, creep: 0.15, scream: 0, rest: 1.3 },   // 3 THE RUSH: внезапен щурм, повечето тичат
    { size: 1.85, gap: 2.4, run: 0.15, creep: 0.5, scream: 2, rest: 1.3 },  // 4 BLACKOUT: тежка орда в тъмното
    { size: 2.0, gap: 2.2, run: 0.85, creep: 0.95, scream: 2, rest: 1 },    // 5 THE RUN: почти всички бягат приведени към портите
  ],
  lead: 26,                   // толкова секунди преди края на подготовката първите тръгват от тъмното (но не стигат портите преди края ѝ)
  heat: { min: 0.75, max: 1.4, up: 0.1, down: 0.12 },      // нагаждане на трудността по отбора
};

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Пътеките на зомбитата от game/motel.map.json (прави ги светът); без файла връща null. */
export function readMap(file = path.join(HERE, 'motel.map.json')) {
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lanes = (Array.isArray(m.lanes) ? m.lanes : []).map((l, i) => ({
      id: String(l.id ?? i),
      points: (Array.isArray(l.points) ? l.points : []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1])).map(p => [p[0], p[1]]),
    })).filter(l => l.points.length >= 2);
    if (!lanes.length) return null;
    const ammo = (Array.isArray(m.ammo) ? m.ammo : []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1])).map(p => [p[0], p[1], fin(p[2]) ? p[2] : 0]);
    const solid = (Array.isArray(m.solid) ? m.solid : []).filter(r => Array.isArray(r) && r.length === 4 && r.every(fin)).map(r => r.slice());
    return { lanes, boss: m.boss != null ? String(m.boss) : null, ammo, solid, clear: fin(m.clear) ? m.clear : null };
  } catch { return null; }
}

/** Зоната за ходене като правоъгълници { x0, x1, z0, z1 } и нейният център. */
export function zoneOf(opts = {}) {
  const hall = opts.hall && fin(opts.hall.w) && fin(opts.hall.d) ? { w: opts.hall.w, d: opts.hall.d } : { w: 6, d: 6 };
  const rooms = Array.isArray(opts.rooms) && opts.rooms.length
    ? opts.rooms.filter(r => fin(r.x) && fin(r.z) && fin(r.w) && fin(r.d)).map(r => ({ id: String(r.id ?? ''), x: r.x, z: r.z, w: r.w, d: r.d }))
    : [{ id: 'a', x: 0, z: 0, w: hall.w, d: hall.d }];
  const rects = rooms.map(r => ({ x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 }));
  let area = 0, cx = 0, cz = 0;
  for (const r of rooms) { const a = r.w * r.d; area += a; cx += r.x * a; cz += r.z * a; }
  return { hall, rooms, rects, cx: area ? cx / area : 0, cz: area ? cz / area : 0 };
}

/**
 * Къде стои сандъкът с оръжията: до ръба на зоната отвън, с лице към нея. Избира свободна страна на стая
 * (не тази към съседна стая), по възможност далеч от посоката, от която идват зомбитата.
 */
export function placeStand(zone, map, depth = 1.2, width = 2.1, inside = 0.45) {
  const inZone = (x, z) => zone.rects.some(r => x > r.x0 + 0.02 && x < r.x1 - 0.02 && z > r.z0 + 0.02 && z < r.z1 - 0.02);
  // посоката, от която идват зомбитата (средната от краищата на пътеките)
  let fx = 0, fz = 0;
  for (const l of map?.lanes || []) { const p = l.points[l.points.length - 1]; const d = Math.hypot(p[0] - zone.cx, p[1] - zone.cz) || 1; fx += (p[0] - zone.cx) / d; fz += (p[1] - zone.cz) / d; }
  const fl = Math.hypot(fx, fz);
  if (fl > 0.2) { fx /= fl; fz /= fl; } else { fx = 0; fz = 1; }
  let best = null;
  for (const [ri, r] of zone.rects.entries()) {
    const sides = [
      { nx: 0, nz: -1, x: (r.x0 + r.x1) / 2, z: r.z0, len: r.x1 - r.x0 },
      { nx: 0, nz: 1, x: (r.x0 + r.x1) / 2, z: r.z1, len: r.x1 - r.x0 },
      { nx: -1, nz: 0, x: r.x0, z: (r.z0 + r.z1) / 2, len: r.z1 - r.z0 },
      { nx: 1, nz: 0, x: r.x1, z: (r.z0 + r.z1) / 2, len: r.z1 - r.z0 },
    ];
    for (const s of sides) {
      if (s.len < 1.4) continue;
      // сандъкът стъпва на ръба: предните 30 см са вътре в зоната, за да се стигат оръжията, без да се излиза от нея
      const ox = s.x + s.nx * (depth / 2 - inside), oz = s.z + s.nz * (depth / 2 - inside);
      const bx = s.x + s.nx * (depth - inside + 0.05), bz = s.z + s.nz * (depth - inside + 0.05);      // гърбът му, отвън
      // мястото на сандъка не бива да е в друга стая от зоната
      const tx = -s.nz, tz = s.nx;
      if ([-1, 0, 1].some(k => inZone(bx + tx * k * width / 2, bz + tz * k * width / 2))) continue;
      const score = -(s.nx * fx + s.nz * fz) * 2 + s.len * 0.3 - ri * 10;      // първата стая (залата) е с предимство
      if (!best || score > best.score) best = { score, x: r3(ox), z: r3(oz), ry: r3(Math.atan2(-s.nx, -s.nz)), nx: s.nx, nz: s.nz };
    }
  }
  if (!best) best = { x: r3((zone.rects[0].x0 + zone.rects[0].x1) / 2), z: r3(zone.rects[0].z0 - depth / 2 + inside), ry: 0, nx: 0, nz: -1 };
  return { x: best.x, z: best.z, ry: best.ry, nx: best.nx, nz: best.nz };
}

export function createGame(opts = {}) {
  const fast = !!opts.fast;
  const level = Object.hasOwn(RULES.levels, opts.difficulty) ? opts.difficulty : 'normal', L = RULES.levels[level];
  const speed = fast ? RULES.fastDiv : 1;
  const S = sec => sec / speed;
  const rand = rng(fin(opts.seed) ? opts.seed : 1);
  const zone = zoneOf(opts);
  const map = opts.map === null ? null : (opts.map || readMap());
  let lanes = map?.lanes || null;
  const T = RULES.minutes * 60 / speed;
  const stand = placeStand(zone, map);
  // Барикадите вървят по очертанието на начертаната зона (обединението на стаите ѝ), на FENCE метра навън: оградата приляга
  // на границата, каквато и да е формата ѝ. edges: правите отсечки на оградата с нормала навън. fence: кутията около нея.
  // Портите стоят срещу средата на външните страни на стаите (при стена над 7 м: две), далеч от сандъка с оръжията и една от
  // друга; до всяка се стига с ръка от зоната. Зомбито стига по пътя си пред порта, блъска дъските и влиза през нея.
  const FENCE = 0.35;
  const wide = zone.rects.map(r => ({ x0: r3(r.x0 - FENCE), x1: r3(r.x1 + FENCE), z0: r3(r.z0 - FENCE), z1: r3(r.z1 + FENCE) }));
  const fence = { x0: Math.min(...wide.map(r => r.x0)), x1: Math.max(...wide.map(r => r.x1)), z0: Math.min(...wide.map(r => r.z0)), z1: Math.max(...wide.map(r => r.z1)) };
  const fcx = (fence.x0 + fence.x1) / 2, fcz = (fence.z0 + fence.z1) / 2;
  /** Вътре ли е точката в оградената площ (с m метра запас навън). */
  const inArea = (x, z, m = 0) => wide.some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
  const edges = [];
  {
    const xs = [...new Set(wide.flatMap(r => [r.x0, r.x1]))].sort((p, q) => p - q), zs = [...new Set(wide.flatMap(r => [r.z0, r.z1]))].sort((p, q) => p - q);
    const occ = (i, j) => { if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return false; const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2; return wide.some(r => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1); };
    const raw = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      if (!occ(i, j)) continue;
      if (!occ(i, j - 1)) raw.push({ nx: 0, nz: -1, c: zs[j], a: xs[i], b: xs[i + 1] });
      if (!occ(i, j + 1)) raw.push({ nx: 0, nz: 1, c: zs[j + 1], a: xs[i], b: xs[i + 1] });
      if (!occ(i - 1, j)) raw.push({ nx: -1, nz: 0, c: xs[i], a: zs[j], b: zs[j + 1] });
      if (!occ(i + 1, j)) raw.push({ nx: 1, nz: 0, c: xs[i + 1], a: zs[j], b: zs[j + 1] });
    }
    raw.sort((p, q) => p.nx - q.nx || p.nz - q.nz || p.c - q.c || p.a - q.a);
    for (const e of raw) {      // съседните парчета на една права се сливат
      const last = edges[edges.length - 1];
      if (last && last.nx === e.nx && last.nz === e.nz && Math.abs(last.c - e.c) < 1e-6 && Math.abs(last.b - e.a) < 1e-6) last.b = e.b;
      else edges.push({ ...e });
    }
    for (const e of edges) {
      const alongX = e.nz !== 0;
      e.x0 = alongX ? e.a : e.c; e.z0 = alongX ? e.c : e.a; e.x1 = alongX ? e.b : e.c; e.z1 = alongX ? e.c : e.b; e.len = r3(e.b - e.a);
    }
  }
  const GT = RULES.gate, BOMB = RULES.bombs;
  const gates = [];
  {
    const cand = [];
    for (const r of zone.rects) {
      for (const sd of [{ id: 'n', nx: 0, nz: -1 }, { id: 's', nx: 0, nz: 1 }, { id: 'w', nx: -1, nz: 0 }, { id: 'e', nx: 1, nz: 0 }]) {
        const alongX = sd.nz !== 0, len = alongX ? r.x1 - r.x0 : r.z1 - r.z0, mid = alongX ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
        const c = sd.nz < 0 ? r.z0 - FENCE : sd.nz > 0 ? r.z1 + FENCE : sd.nx < 0 ? r.x0 - FENCE : r.x1 + FENCE;
        for (const q of (len >= 7 ? [mid - len / 4, mid + len / 4] : [mid])) {
          // върху коя отсечка от оградата лежи тази точка; портата иска поне 0.8 м ограда от двете си страни
          const e = edges.find(g => g.nx === sd.nx && g.nz === sd.nz && Math.abs(g.c - c) < 1e-3 && g.len >= 1.7 && q > g.a - 0.4 && q < g.b + 0.4);
          if (!e) continue;
          const at = clamp(q, e.a + 0.85, e.b - 0.85), x = r3(alongX ? at : c), z = r3(alongX ? c : at);
          if (inArea(x + sd.nx * 0.2, z + sd.nz * 0.2)) continue;                                    // тази страна гледа към друга стая
          if (Math.hypot(x - stand.x, z - stand.z) < 2.0) continue;                                  // до сандъка порта няма
          cand.push({ id: sd.id, nx: sd.nx, nz: sd.nz, x, z, max: GT.boards });
        }
      }
    }
    // колкото порти побира обиколката, разпръснати: първо най-далечната от сандъка, после всяка най-далеч от вече избраните
    const per = edges.reduce((n, e) => n + e.len, 0), want = clamp(Math.round(per / 4.5), 3, 6);
    const far = c => Math.min(Math.hypot(c.x - stand.x, c.z - stand.z), ...gates.map(g => Math.hypot(c.x - g.x, c.z - g.z)));
    while (gates.length < want && cand.length) {
      cand.sort((p, q) => far(q) - far(p));
      if (gates.length && far(cand[0]) < 1.8) break;
      gates.push(cand.shift());
    }
    const seen = {};
    for (const g of gates) { seen[g.id] = (seen[g.id] || 0) + 1; }
    const idx = {};
    for (const g of gates) if (seen[g.id] > 1) { idx[g.id] = (idx[g.id] || 0) + 1; g.id += idx[g.id]; }
  }
  if (!gates.length) gates.push({ id: 'x', nx: -stand.nx || 0, nz: -stand.nz || 0, x: r3(stand.nx ? (stand.nx > 0 ? fence.x0 : fence.x1) : fcx), z: r3(stand.nz ? (stand.nz > 0 ? fence.z0 : fence.z1) : fcz), max: GT.boards });
  // Пътищата. Всяка пътека от картата свършва при портата по нейната посока, а всяка порта получава поне една пътека.
  // Краят на всеки път: пред портата (3.2 м навън), до дъските (тук зомбито спира и блъска) и вътре зад портата.
  const inBox = (x, z, m) => x > fence.x0 - m && x < fence.x1 + m && z > fence.z0 - m && z < fence.z1 + m;
  const routes = [];
  if (lanes) {
    const crosses = (a, b) => { for (let i = 1; i < 24; i++) { const f = i / 24; if (inArea(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.6)) return true; } return false; };
    const far = 3.2, corners = [[fence.x0 - far, fence.z0 - far], [fence.x1 + far, fence.z0 - far], [fence.x1 + far, fence.z1 + far], [fence.x0 - far, fence.z1 + far]];
    const unit = (x, z) => { const dx = x - fcx, dz = z - fcz, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const fit = (l, g) => { const e = l.points[l.points.length - 1], a = unit(e[0], e[1]), b = unit(g.x, g.z); return a[0] * b[0] + a[1] * b[1]; };
    const add = (l, g) => {
      if (routes.some(r => r.lane === l.id && r.gate === g.id)) return;
      // точките на пътеката, които са по-близо до оградата от мястото пред портата, отпадат: иначе зомбито се връща назад
      const pts = l.points.slice();
      while (pts.length > 1 && inBox(pts[pts.length - 1][0], pts[pts.length - 1][1], far + 0.3)) pts.pop();
      const end = pts[pts.length - 1], front = [r3(g.x + g.nx * far), r3(g.z + g.nz * far)];
      if (crosses(end, front)) {      // портата е от другата страна: покрай най-удобния ъгъл на оградата
        let pick = null, len = Infinity;
        for (const c of corners) { const d = Math.hypot(c[0] - end[0], c[1] - end[1]) + Math.hypot(c[0] - front[0], c[1] - front[1]) + (crosses(end, c) || crosses(c, front) ? 100 : 0); if (d < len) { len = d; pick = c; } }
        if (pick) pts.push([r3(pick[0]), r3(pick[1])]);
      }
      pts.push(front, [r3(g.x + g.nx * GT.stop), r3(g.z + g.nz * GT.stop)], [r3(g.x - g.nx * GT.inside), r3(g.z - g.nz * GT.inside)]);
      routes.push({ id: l.id, lane: l.id, gate: g.id, points: pts });
    };
    for (const l of lanes) add(l, gates.reduce((b, g) => (fit(l, g) > fit(l, b) ? g : b), gates[0]));
    for (const g of gates) add(lanes.reduce((b, l) => (fit(l, g) > fit(b, g) ? l : b), lanes[0]), g);
    lanes = lanes.map(l => { const r = routes.find(q => q.lane === l.id); return { id: l.id, gate: r.gate, points: r.points }; });
  }
  const pathLen = pts => { let l = 0; for (let i = 1; i < pts.length - 1; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };      // до дъските
  const shortest = routes.length ? Math.min(...routes.map(r => pathLen(r.points))) : RULES.ring;
  const lead = Math.min(S(RULES.lead), S(RULES.intro) - 0.5, shortest / (RULES.zombies.walker.speed * 1.24 * (fast ? 1.8 : 1)));
  // състоянието на портите: boards (заковани дъски), fix (докъде е стигнало коването на следващата), busy (някой кове)
  const G = gates.map((g, i) => ({ ...g, i, tx: -g.nz, tz: g.nx, boards: Math.min(GT.boards, GT.start), fix: 0, busy: 0 }));
  const gateOf = new Map(G.map(g => [g.id, g]));
  // Варелите с гориво: край пътищата, на няколко метра преди портата и встрани. Първо се търси място в разчистения квадрат
  // на картата (map.clear), за да не попадне варел в кола или дърво; ако зоната го е запълнила, и извън него.
  const bombs = [];
  {
    const segD = (x, z, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1e-9, t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2, 0, 1); return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t); };
    const pathD = (x, z, pts) => { let d = Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segD(x, z, pts[i], pts[i + 1])); return d; };
    /** Точката на dist метра преди дъските по пътя и посоката назад по него. */
    const back = (pts, dist) => {
      let left = dist, i = pts.length - 2;
      while (i > 0) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (l >= left) break; left -= l; i--; }
      if (i <= 0) return null;
      const a = pts[i], b = pts[i - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
      return { x: a[0] + ux * left, z: a[1] + uz * left, ux, uz };
    };
    const okAt = (x, z, lim) => !(inBox(x, z, 2.2) || Math.abs(x) > lim || Math.abs(z) > lim
      || (map?.solid || []).some(q => x > q[0] - 0.6 && x < q[1] + 0.6 && z > q[2] - 0.6 && z < q[3] + 0.6)
      || Math.hypot(x - stand.x, z - stand.z) < 3 || bombs.some(o => Math.hypot(o.x - x, o.z - z) < 4)
      || routes.some(r => pathD(x, z, r.points) < 0.9));
    const order = routes.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const lim of (fin(map?.clear) ? [map.clear - 0.7, Infinity] : [Infinity])) {
      for (const ri of order) {
        if (bombs.length >= BOMB.max) break;
        const first = rand() < 0.5 ? 1 : -1;
        search: for (const ahead of [BOMB.ahead - 2.6, BOMB.ahead - 1.6, BOMB.ahead - 0.6, BOMB.ahead + 0.4, BOMB.ahead + 2, BOMB.ahead + 4]) {
          const p = back(routes[ri].points, ahead);
          if (!p) continue;
          for (const side of [first, -first]) {
            const x = p.x - p.uz * side * BOMB.aside, z = p.z + p.ux * side * BOMB.aside;
            if (!okAt(x, z, lim)) continue;
            bombs.push({ x: r2(x), z: r2(z), alive: true });
            break search;
          }
        }
      }
      if (bombs.length) break;
    }
  }
  const W = RULES.weapons, Z = RULES.zombies, P = RULES.player;
  const downTime = fast ? 3 : P.downTime;

  const t0 = fin(opts.now) ? opts.now : 0;
  let nowMs = t0, time = 0;
  let phase = 'intro', phaseEnd = S(RULES.intro);
  let wave = 0, toSpawn = [], spawnGap = 1, spawnAt = 0, waveClean = true;
  let boss = null, bossSeen = false, bossDead = false, bossAddAt = 0, endAt = 0;
  let score = 0, kills = 0, headshots = 0, shots = 0, hitShots = 0, downs = 0, wipes = 0;
  let paidWipes = 0;      // колко пъти групата е падала цялата, след като вторите шансове са свършили
  let combo = 0, comboAt = -99;
  let chances = 0, peak = 0;
  let offer = null;      // текущият избор на оръжие: { n, kinds }
  function makeOffer(n) {
    offer = { n, kinds: RULES.offers[clamp(n, 0, RULES.offers.length - 1)].slice() };
    emit('offer', { n, kinds: offer.kinds });
  }
  let primed = false;
  let heat = 1, dark = false, waveStart = 0, waveDowns = 0, waveHurt = 0, fixed = 0, breaches = 0, booms = 0;
  let over = false, result = null;
  let zid = 0, evSeq = 0;
  let events = [];
  const zombies = [];
  const players = new Map(), gone = new Map();
  const stock = {};      // масата вече не раздава оръжия (остава в състоянието заради по-стари страници)

  const emit = (k, data = {}) => { events.push({ i: ++evSeq, at: nowMs, k, ...data }); };
  const active = () => [...players.values()];
  const count = () => Math.max(1, players.size);
  const aliveCap = () => Math.min(14, 6 + 2 * count());
  const alive = () => zombies.reduce((n, z) => n + (z.state !== STATE.dead ? 1 : 0), 0);

  function gun(k) { const w = W[k]; return { k, ammo: w.mag, reserve: w.reserve, reloadUntil: 0, tokens: 2, tokenAt: time, shotAt: -9 }; }

  function join(id, info) {
    let pl = players.get(id);
    if (!pl) {
      pl = gone.get(id) || { id, n: players.size + gone.size + 1, name: '', pick: -1, hp: P.hp, hurtAt: -99, downUntil: 0, downs: 0, kills: 0, headshots: 0, score: 0, shots: 0, hits: 0, w: { l: gun('pistol'), r: gun('pistol') } };
      gone.delete(id);
      pl.pose = null;
      players.set(id, pl);
    }
    if (info && fin(info.n)) pl.n = info.n;
    if (info && typeof info.name === 'string') pl.name = info.name;
    if (players.size > peak) { peak = players.size; if (!wipes) chances = Math.max(0, (peak === 1 ? 2 : 1) + L.chances); }
  }
  function leave(id) {
    const pl = players.get(id);
    if (!pl) return;
    players.delete(id);
    pl.pose = null;
    gone.set(id, pl);
  }
  function pose(id, p) {
    const pl = players.get(id);
    if (!pl || !p || !(p.length >= 21)) return;
    const q = new Array(21);
    for (let i = 0; i < 21; i++) { if (!fin(p[i])) return; q[i] = p[i]; }
    pl.pose = q;
  }
  const headXZ = pl => (pl.pose ? [pl.pose[0], pl.pose[2]] : [zone.cx, zone.cz]);
  const handXYZ = (pl, hand) => {
    if (!pl.pose) return null;
    const o = hand === 'l' ? 7 : 14;
    if (pl.pose[o] === 0 && pl.pose[o + 1] === 0 && pl.pose[o + 2] === 0) return [pl.pose[0], pl.pose[1], pl.pose[2]];
    return [pl.pose[o], pl.pose[o + 1], pl.pose[o + 2]];
  };
  const isDown = pl => pl.downUntil > time;

  // ── вълни ──
  function waveList(n) {
    const k = (0.55 + 0.45 * count()) * (fast ? 0.5 : 1);
    const w = waveOf(n);
    const total = Math.max(3, Math.round((4 + 2 * n) * k * heat * w.size * L.size));
    const runners = Math.round(total * w.run), creepers = Math.round(runners * w.creep);
    const screamers = w.scream;
    const list = [];
    for (let i = 0; i < total; i++) list.push(i < creepers ? 'creeper' : i < runners ? 'runner' : 'walker');
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    for (let i = 0; i < screamers; i++) list.splice(Math.floor(list.length * (0.3 + 0.4 * i)), 0, 'screamer');
    return list;
  }
  function restock() { /* оръжията вече идват от избора след вълната (makeOffer), не от масата */ }
  /** Какъв е характерът на вълна n (след края на списъка се редуват последните два реда). */
  const waveOf = n => RULES.waves[clamp(n - 1, 0, RULES.waves.length - 1)];
  const lastWave = () => wave >= RULES.waves.length;
  /** Следващата вълна тръгва от тъмното, преди да е обявена: в края на подготовката и през почивката. */
  function prime() {
    if (primed) return;
    primed = true;
    wave++;
    toSpawn = waveList(wave);
    spawnGap = Math.max(0.25, S(18 + 2 * wave) / toSpawn.length * waveOf(wave).gap);
    spawnAt = time;
  }
  const feed = () => { while (toSpawn.length && time >= spawnAt && alive() < aliveCap()) { spawn(toSpawn.shift()); spawnAt = time + spawnGap; } };
  function startWave() {
    prime();
    primed = false;
    phase = 'wave';
    waveClean = true; waveStart = time; waveDowns = 0; waveHurt = 0;
    emit('wave', { n: wave });
    if (RULES.dark.includes(wave)) { dark = true; emit('dark', { on: 1 }); }
  }
  function startBreak() {
    score += RULES.bonus.wave * wave + (waveClean ? RULES.bonus.clean * count() : 0);
    emit('clear', { n: wave, clean: waveClean });
    makeOffer(wave);      // нов, по-силен избор на оръжие за всеки играч
    // трудността се нагажда по отбора: чиста и бърза вълна я вдига, паднал играч я сваля
    const took = time - waveStart, par = S(26 + 3 * wave), H = RULES.heat;
    let d = 0;
    if (waveDowns) d = -H.down * Math.min(2, waveDowns);
    else if (waveClean && took <= par) d = H.up;
    else if (waveHurt <= 30 * count() && took <= par * 1.25) d = H.up / 2;
    else if (waveHurt >= 70 * count()) d = -H.down / 2;
    heat = clamp(heat + d, H.min, H.max);
    if (dark) { dark = false; emit('dark', { on: 0 }); }
    for (const b of bombs) b.alive = true;      // нови варели
    for (const pl of players.values()) if (!isDown(pl)) pl.hp = Math.min(P.hp, pl.hp + P.breakHeal);
    phase = 'break'; phaseEnd = time + S(RULES.breakTime * waveOf(wave).rest);
    restock();
    if (!lastWave() && phaseEnd < T * RULES.bossAt - S(20)) prime();      // следващите вече идват (преди шефа не)
  }
  function startBoss() {
    phase = 'boss'; bossSeen = true; toSpawn = [];
    if (!primed) wave++;
    primed = false;
    if (dark) { dark = false; emit('dark', { on: 0 }); }
    restock();
    boss = spawn('boss', map?.boss);
    boss.hp = boss.max = Math.round(Z.boss.hp * (0.6 + 0.4 * count()) * (fast ? 0.35 : 1) * L.hp);
    bossAddAt = time + S(6);
    emit('boss', { z: boss.id });
  }

  function spawn(kind, laneId) {
    const creep = kind === 'creeper', type = creep ? 'runner' : kind;      // приведеният бегач е тичащ с друга стойка
    const t = Z[type];
    const z = { id: ++zid, type, look: Math.floor(rand() * 1000), hp: Math.round(t.hp * L.hp), max: Math.round(t.hp * L.hp), state: STATE.walk, until: 0, x: 0, z: 0, h: 0, lane: null, seg: 0,
      speed: t.speed * (type === 'boss' ? 1 : (0.82 + rand() * 0.42) * (1 + Math.min(0.4, RULES.faster * Math.max(0, wave - 1)))) * (fast ? 1.8 : 1) * L.speed, bash: null, target: null, hitAt: 0, swing: 0, rageUntil: 0, screamAt: 0, screams: 0, flinch: 0, staggerAt: -9, dieAt: 0, dx: 0, dz: 1, creep: creep ? 1 : 0 };
    if (lanes) {
      // път до порта: шефът по своята пътека, останалите по случаен път (всяка порта има поне един)
      const own = laneId != null ? routes.filter(r => r.lane === laneId) : [];
      const lane = own.length ? own[Math.floor(rand() * own.length)] : routes.length ? routes[Math.floor(rand() * routes.length)] : lanes[Math.floor(rand() * lanes.length)];
      z.lane = lane;
      // от третата вълна част от зомбитата изпълзяват от земята по средата на пътеката; в кратката проба всички тръгват отблизо
      const mid = type !== 'boss' && (fast || (wave >= 3 && rand() < Math.min(0.35, 0.1 + wave * 0.04)));
      if (mid && lane.points.length >= 2) {
        const f = fast ? 0.5 + rand() * 0.2 : 0.35 + rand() * 0.3;
        const [x, zz, seg] = alongLane(lane, f);
        z.x = x + (rand() - 0.5) * 1.2; z.z = zz + (rand() - 0.5) * 1.2; z.seg = seg;
        z.state = STATE.rise; z.until = time + 1.4;
      } else {
        z.x = lane.points[0][0] + (rand() - 0.5) * 1.6; z.z = lane.points[0][1] + (rand() - 0.5) * 1.6; z.seg = 1;
      }
    } else {
      const a = rand() * Math.PI * 2, d = fast ? RULES.ring * 0.5 : RULES.ring;
      z.x = zone.cx + Math.sin(a) * d; z.z = zone.cz + Math.cos(a) * d;
    }
    z.h = Math.atan2(zone.cx - z.x, zone.cz - z.z);
    zombies.push(z);
    return z;
  }
  function alongLane(lane, f) {
    const pts = lane.points;
    let total = 0;
    const len = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(l); total += l; }
    let want = total * f;
    for (let i = 0; i < len.length; i++) {
      if (want <= len[i] || i === len.length - 1) { const k = len[i] ? clamp(want / len[i], 0, 1) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, i + 1]; }
      want -= len[i];
    }
    return [pts[0][0], pts[0][1], 1];
  }

  // ── зомбитата: ход, удар, писък ──
  function nearestPlayer(z) {
    let best = null, bd = Infinity;
    for (const pl of players.values()) {
      if (isDown(pl)) continue;
      const [x, zz] = headXZ(pl), d = Math.hypot(x - z.x, zz - z.z);
      if (d < bd) { bd = d; best = pl; }
    }
    return best ? { pl: best, d: bd } : null;
  }
  function hurt(pl, dmg, z) {
    if (isDown(pl) || over) return;
    dmg = Math.max(1, Math.round(dmg * L.dmg));
    pl.hp -= dmg; pl.hurtAt = time; waveClean = false; waveHurt += dmg;
    emit('bite', { z: z.id, p: pl.id, dmg, hp: Math.max(0, Math.round(pl.hp)) });
    if (pl.hp <= 0) {
      pl.hp = 0; pl.downUntil = time + downTime; pl.downs++; downs++; waveDowns++;
      pl.score = Math.max(0, pl.score - P.downPenalty); score = Math.max(0, score - P.downPenalty);
      emit('down', { p: pl.id, t: downTime });
      if (active().every(isDown)) {
        if (chances > 0 || level !== 'nightmare') {       // втори шанс: зомбитата наоколо падат, отборът се вдига веднага
          if (chances > 0) chances--;
          else { paidWipes++; score = Math.max(0, score - RULES.wipe.score); heat = Math.max(RULES.heat.min, heat - RULES.wipe.heat); }
          wipes++;
          for (const o of zombies) if (o.state !== STATE.dead && o.type !== 'boss' && Math.hypot(o.x - zone.cx, o.z - zone.cz) < 7) kill(o, null, false, 0);
          for (const o of players.values()) if (isDown(o)) o.downUntil = Math.min(o.downUntil, time + Math.min(downTime, RULES.wipe.up));
          emit('chance', { left: chances });
        } else finish('wiped');
      }
    }
  }
  function stepZombie(z, dt) {
    const t = Z[z.type];
    if (z.state === STATE.dead) return;
    if (z.state === STATE.rise || z.state === STATE.stagger || z.state === STATE.scream) {
      if (time < z.until) return;
      z.state = STATE.walk;
    }
    const near = nearestPlayer(z);
    const pts = z.lane ? z.lane.points : null;
    let tx, tz, chase = !pts || z.seg >= pts.length, gate = null;
    if (!chase) {
      [tx, tz] = pts[z.seg];
      // последната точка е зад портата: докато има дъски, зомбито стои пред тях и ги блъска
      if (z.lane.gate && z.seg === pts.length - 1) { const g = gateOf.get(z.lane.gate); if (g && g.boards > 0) gate = g; }
    } else if (near) { [tx, tz] = headXZ(near.pl); z.target = near.pl.id; }
    else { tx = zone.cx; tz = zone.cz; z.target = null; }
    const dx = tx - z.x, dz = tz - z.z, d = Math.hypot(dx, dz) || 1e-6;
    const toPlayer = near ? Math.atan2(headXZ(near.pl)[0] - z.x, headXZ(near.pl)[1] - z.z) : z.h;
    if (z.state === STATE.attack) {
      z.h = z.bash ? Math.atan2(-z.bash.nx, -z.bash.nz) : toPlayer;
      if (time >= z.swing) {
        // ударът пада: по дъските на портата или по който е в обсега (шефът удря всички наоколо)
        if (z.bash) { hitGate(z.bash, z); z.bash = null; }
        else if (z.type === 'boss') { for (const pl of players.values()) { const [x, zz] = headXZ(pl); if (Math.hypot(x - z.x, zz - z.z) <= RULES.boss.smash) hurt(pl, t.dmg, z); } }
        else if (near && near.d <= t.reach + 0.35) hurt(near.pl, t.dmg, z);
        z.state = STATE.walk; z.hitAt = time + t.every;
      }
      return;
    }
    const rage = time < z.rageUntil ? RULES.screamer.speed : 1;
    const bossRage = z.type === 'boss' && z.hp <= z.max * RULES.boss.rageAt ? RULES.boss.rageSpeed : 1;
    if (z.type === 'screamer' && chase && near && z.screams < RULES.screamer.charges && near.d <= RULES.screamer.range) {
      if (time >= z.screamAt) {
        z.state = STATE.scream; z.until = time + RULES.screamer.time; z.screamAt = time + RULES.screamer.every; z.screams++;
        for (const o of zombies) if (o !== z && o.state !== STATE.dead && Math.hypot(o.x - z.x, o.z - z.z) <= RULES.screamer.buff) o.rageUntil = time + RULES.screamer.rage;
        emit('scream', { z: z.id });
        z.h = toPlayer;
        return;
      }
      if (near.d <= RULES.screamer.keep) { z.h = toPlayer; return; }      // държи разстояние, докато има писъци
    }
    // играч на една ръка разстояние: удря него, дори през барикадата
    if (near && near.d <= t.reach) {
      z.h = toPlayer;
      if (time >= z.hitAt) { z.state = STATE.attack; z.bash = null; z.swing = time + RULES.windup; emit('swing', { z: z.id }); }
      return;
    }
    if (gate) {
      z.h = Math.atan2(-gate.nx, -gate.nz);
      if (time >= z.hitAt) { z.state = STATE.attack; z.bash = gate; z.swing = time + RULES.windup; emit('swing', { z: z.id, g: gate.i }); }
      return;
    }
    const step = Math.min(d, z.speed * rage * bossRage * dt);
    z.x += dx / d * step; z.z += dz / d * step;
    z.h = Math.atan2(dx, dz);
    if (!chase && d < 0.5) z.seg++;
  }
  /** Удар по портата: пада една дъска, от шефа всичките. */
  function hitGate(g, z) {
    if (g.boards <= 0) return;
    const big = z.type === 'boss';
    g.boards = big ? 0 : g.boards - 1;
    g.fix = 0;
    emit('bang', { g: g.i, z: z.id, left: g.boards, big: big ? 1 : 0 });
    if (g.boards === 0) { breaches++; emit('breach', { g: g.i }); }
  }
  /** Коването: всяка ръка на прав играч, която е при портата и не е стреляла току-що, кове. */
  function stepGates(dt) {
    for (const g of G) {
      if (g.boards >= GT.boards) { g.fix = 0; g.busy = 0; continue; }
      let hands = 0, who = null;
      for (const pl of players.values()) {
        if (isDown(pl) || !pl.pose) continue;
        for (const hand of ['l', 'r']) {
          const o = hand === 'l' ? 7 : 14, hx = pl.pose[o], hy = pl.pose[o + 1], hz = pl.pose[o + 2];
          if (hx === 0 && hy === 0 && hz === 0) continue;                              // тази ръка не се следи
          const along = (hx - g.x) * g.tx + (hz - g.z) * g.tz, out = (hx - g.x) * g.nx + (hz - g.z) * g.nz;
          if (Math.abs(along) > GT.half || out > GT.reachOut || out < -GT.reachIn || hy < 0.25 || hy > 2.2) continue;
          if (time - pl.w[hand].shotAt < GT.calm) continue;                            // ръката, която стреля, не кове
          hands++; who = pl;
        }
      }
      g.busy = hands ? 1 : 0;
      if (!hands) { g.fix = Math.max(0, g.fix - dt * 0.5); continue; }
      g.fix += dt * Math.min(GT.hands, hands) / GT.fix;
      while (g.fix >= 1 && g.boards < GT.boards) {
        g.fix -= 1; g.boards++; fixed++;
        score += GT.points; who.score += GT.points;
        emit('fix', { g: g.i, p: who.id, left: g.boards });
      }
      if (g.boards >= GT.boards) { g.fix = 0; g.busy = 0; }
    }
  }
  /** Варелът гърми: всичко в радиуса пада, шефът отнася голяма щета. */
  function explode(i, pl) {
    const b = bombs[i];
    if (!b || !b.alive) return false;
    b.alive = false; booms++;
    emit('boom', { b: i, x: b.x, zz: b.z, p: pl ? pl.id : null });
    for (const z of zombies.slice()) {
      if (z.state === STATE.dead) continue;
      const dx = z.x - b.x, dz = z.z - b.z, d = Math.hypot(dx, dz);
      if (d > BOMB.r) continue;
      const dir = [dx / (d || 1), 0, dz / (d || 1)];
      if (z.type === 'boss') damage(z, pl, BOMB.boss, false, dir);
      else { z.dx = dir[0]; z.dz = dir[2]; kill(z, pl, false, Z[z.type].score); }
    }
    return true;
  }
  function separate() {
    for (let i = 0; i < zombies.length; i++) {
      const a = zombies[i];
      if (a.state === STATE.dead || a.state === STATE.rise) continue;
      for (let j = i + 1; j < zombies.length; j++) {
        const b = zombies[j];
        if (b.state === STATE.dead || b.state === STATE.rise) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = Z[a.type].r + Z[b.type].r + 0.1;
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) / 2, ux = dx / d, uz = dz / d;
        const wa = a.type === 'boss' ? 0 : b.type === 'boss' ? 2 : 1, wb = 2 - wa;
        a.x -= ux * push * wa; a.z -= uz * push * wa; b.x += ux * push * wb; b.z += uz * push * wb;
      }
    }
  }

  // ── попадения ──
  function kill(z, pl, head, pts) {
    if (z.state === STATE.dead) return;
    z.state = STATE.dead; z.hp = 0; z.dieAt = time;
    if (z === boss) { bossDead = true; }
    if (pl) {
      kills++; pl.kills++;
      if (head) { headshots++; pl.headshots++; }
      combo = time - comboAt <= RULES.combo.window ? Math.min(RULES.combo.max, combo + 1) : 0;
      comboAt = time;
      const got = Math.round(pts * (head && z.type !== 'boss' ? 2 : 1) * (1 + combo * RULES.combo.step));
      score += got; pl.score += got;
      emit('kill', { z: z.id, p: pl.id, head: head ? 1 : 0, pts: got, combo, x: r2(z.x), zz: r2(z.z), dx: r2(z.dx), dz: r2(z.dz), type: TYPES.indexOf(z.type) });
    } else emit('kill', { z: z.id, p: null, head: 0, pts: 0, combo: 0, x: r2(z.x), zz: r2(z.z), dx: r2(z.dx), dz: r2(z.dz), type: TYPES.indexOf(z.type) });
  }
  function damage(z, pl, dmg, head, dir) {
    if (z.state === STATE.dead) return;
    const t = Z[z.type];
    if (dir) { z.dx = dir[0]; z.dz = dir[2]; }
    if (z.type === 'boss') {
      const d = dmg * (head ? RULES.boss.head : 1);
      z.hp -= d; z.flinch += d;
      if (z.hp <= 0) return kill(z, pl, head, t.score);
      if (!z.raged && z.hp <= z.max * RULES.boss.rageAt) { z.raged = true; emit('rage', { z: z.id }); }
      if (z.flinch >= RULES.boss.flinch * (0.6 + 0.4 * count()) && z.state !== STATE.attack) { z.flinch = 0; z.state = STATE.stagger; z.until = time + t.stagger; }
      return;
    }
    if (head) return kill(z, pl, true, t.score);      // изстрел в главата убива веднага
    z.hp -= dmg;
    if (z.hp <= 0) return kill(z, pl, false, t.score);
    if (z.state !== STATE.rise && time - z.staggerAt > 0.8) { z.staggerAt = time; z.state = STATE.stagger; z.until = time + t.stagger; }
  }

  function startReload(pl, hand, quick) {
    const g = pl.w[hand], w = W[g.k];
    if (g.ammo >= w.mag || g.reserve === 0) return false;
    if (g.reloadUntil > time) {      // жестът съкращава вече започнатото бавно презареждане
      if (!quick || g.reloadUntil - time <= w.fast) return false;
      g.reloadUntil = time + w.fast;
      emit('reload', { p: pl.id, hand, t: r2(w.fast), fast: 1 });
      return true;
    }
    g.reloadUntil = time + (quick ? w.fast : w.reload);
    emit('reload', { p: pl.id, hand, t: r2(g.reloadUntil - time), fast: quick ? 1 : 0 });
    return true;
  }
  function finishReloads(pl) {
    for (const hand of ['l', 'r']) {
      const g = pl.w[hand], w = W[g.k];
      if (!g.reloadUntil || g.reloadUntil > time) continue;
      g.reloadUntil = 0;
      const need = w.mag - g.ammo, take = g.reserve < 0 ? need : Math.min(need, g.reserve);
      g.ammo += take;
      if (g.reserve > 0) g.reserve -= take;
      emit('loaded', { p: pl.id, hand });
    }
  }

  const vec3 = v => (Array.isArray(v) && v.length >= 3 && v.every(fin) ? [r3(v[0]), r3(v[1]), r3(v[2])] : null);

  function act(id, msg) {
    const pl = players.get(id);
    if (!pl || !msg || typeof msg !== 'object') return { ok: false, reason: 'bad' };
    if (over) return { ok: false, reason: 'over' };
    const hand = msg.hand === 'l' || msg.hand === 'r' ? msg.hand : null;
    if (!hand) return { ok: false, reason: 'hand' };
    const g = pl.w[hand], w = W[g.k];

    if (msg.a === 'reload') {
      if (isDown(pl)) return { ok: false, reason: 'down' };
      return { ok: startReload(pl, hand, !!msg.fast) };
    }

    if (msg.a === 'take') {      // едно оръжие от текущия избор, в ръката, която го е докоснала
      const k = String(msg.w || '');
      if (!offer || !offer.kinds.includes(k)) return { ok: false, reason: 'weapon' };
      if (isDown(pl)) return { ok: false, reason: 'down' };
      if (pl.pick === offer.n) return { ok: false, reason: 'picked' };
      pl.pick = offer.n;
      pl.w[hand] = gun(k);
      emit('take', { p: pl.id, hand, w: k });
      return { ok: true };
    }

    if (msg.a === 'shot') {
      if (isDown(pl)) return { ok: false, reason: 'down' };
      if (g.reloadUntil > time) return { ok: false, reason: 'reloading' };
      // скорострелност: жетони, които се трупат с темпа на оръжието (търпи накъсана мрежа, не търпи невъзможен темп)
      const rate = w.rpm / 60;
      g.tokens = Math.min(3, g.tokens + (time - g.tokenAt) * rate); g.tokenAt = time;
      if (g.tokens < 1) return { ok: false, reason: 'rate' };
      if (g.ammo <= 0) { emit('dry', { p: pl.id, hand }); startReload(pl, hand, false); return { ok: false, reason: 'dry' }; }
      g.tokens -= 1; g.ammo--; g.shotAt = time;
      shots++; pl.shots++;
      const o = vec3(msg.o), d = vec3(msg.d), from = handXYZ(pl, hand);
      let left = w.pellets, any = false;
      const out = [];
      for (const h of Array.isArray(msg.hits) ? msg.hits.slice(0, w.pellets) : []) {
        if (!Array.isArray(h) || left <= 0) continue;
        const z = zombies.find(q => q.id === h[0]);
        if (!z || z.state === STATE.dead) continue;                      // вече е мъртво или не съществува
        const n = clamp(Math.round(fin(h[2]) ? h[2] : 1), 1, left);
        if (from && Math.hypot(z.x - from[0], z.z - from[2]) > w.range + (w.melee ? 0.9 + (Z[z.type]?.r || 0.3) : 2)) continue;      // твърде далеч за това оръжие
        left -= n; any = true;
        const head = h[1] === 1;
        out.push([z.id, head ? 1 : 0]);
        damage(z, pl, w.dmg * n * (w.melee && z.type === 'boss' ? 0.5 : 1), head, d);
      }
      // варел с гориво: гърми, ако е цял и е в обсега на оръжието
      const bi = Number.isInteger(msg.bomb) ? msg.bomb : -1;
      if (bombs[bi]?.alive && (!from || Math.hypot(bombs[bi].x - from[0], bombs[bi].z - from[2]) <= w.range + 2) && explode(bi, pl)) any = true;
      if (any) { hitShots++; pl.hits++; }
      emit('shot', { p: pl.id, hand, w: g.k, o, d, hits: out });
      if (g.ammo <= 0) {
        if (g.reserve === 0) { pl.w[hand] = gun('pistol'); emit('spent', { p: pl.id, hand }); }      // оръжието от сандъка свърши: пак пистолет
        else startReload(pl, hand, false);
      }
      return { ok: true };
    }
    return { ok: false, reason: 'unknown' };
  }

  // ── времето ──
  function finish(reason) {
    if (over) return;
    over = true;
    phase = reason === 'boss' ? 'won' : 'lost';
    const won = reason === 'boss';
    if (won) score += Math.round(Math.max(0, T - time) * speed * RULES.bonus.second);
    const all = [...players.values(), ...gone.values()];
    const accuracy = shots ? r2(hitShots / shots) : 0;
    for (const z of zombies) if (z.state !== STATE.dead) kill(z, null, false, 0);      // краят: нищо не остава да стърчи замръзнало до играчите
    const stars = Math.max(0, (wave >= 3 ? 1 : 0) + (wave >= 5 ? 1 : 0) + (bossSeen ? 1 : 0) + (bossDead ? 1 : 0) + (bossDead && downs <= count() - 1 ? 1 : 0) - Math.min(2, paidWipes));
    score = Math.round(score * L.score);
    result = {
      score, money: score, stars, won, reason, wave, kills, headshots, accuracy, downs, boards: fixed, breaches, booms, level, wipes,
      players: all.sort((a, b) => a.n - b.n).map(p => ({ n: p.n, name: p.name, kills: p.kills, headshots: p.headshots, score: Math.round(p.score * L.score), downs: p.downs, shots: p.shots, hits: p.hits })),
    };
    emit('end', { won: won ? 1 : 0, reason });
  }

  function stepSim(dt) {
    time += dt;
    // играчите: презареждане, връщане, възстановяване
    for (const pl of players.values()) {
      finishReloads(pl);
      if (isDown(pl)) {      // прав съотборник до падналия го вдига по-бързо
        const [x, zz] = headXZ(pl);
        for (const o of players.values()) if (o !== pl && !isDown(o)) { const [ox, oz] = headXZ(o); if (Math.hypot(ox - x, oz - zz) < RULES.wipe.near) { pl.downUntil -= dt * (RULES.wipe.revive - 1); break; } }
      }
      if (pl.downUntil && pl.downUntil <= time) { pl.downUntil = 0; pl.hp = P.reviveHp; pl.hurtAt = time; emit('up', { p: pl.id }); }
      if (!isDown(pl) && pl.hp < P.hp && time - pl.hurtAt >= P.regenDelay) pl.hp = Math.min(P.hp, pl.hp + P.regen * dt);
    }
    // вълните
    stepGates(dt);
    if (phase === 'intro') {
      if (time >= phaseEnd - lead) { prime(); feed(); }
      if (time >= phaseEnd) { restock(); startWave(); }
    } else if (phase === 'break') {
      feed();
      if (time >= phaseEnd) { if ((lastWave() && !primed) || time >= T * RULES.bossAt - S(20)) startBoss(); else startWave(); }
    } else if (phase === 'wave') {
      if (time >= T * RULES.bossAt) startBoss();                              // времето на шефа дойде: идва върху каквото е останало
      else { feed(); if (!toSpawn.length && alive() === 0) startBreak(); }
    } else if (phase === 'boss') {
      if (bossDead) {
        if (!endAt) { endAt = time + S(RULES.outro); for (const z of zombies) if (z.state !== STATE.dead) kill(z, null, false, 0); }
        else if (time >= endAt) finish('boss');
      } else if (time >= bossAddAt && alive() < Math.min(aliveCap(), 1 + RULES.boss.adds + count())) {
        spawn(rand() < 0.35 ? 'runner' : 'walker'); bossAddAt = time + S(5);
      }
    }
    if (!over && time >= T) finish('time');
    if (over) return;
    for (const z of zombies) stepZombie(z, dt);
    separate();
    // мъртвите стоят малко в състоянието (клиентът да види смъртта), после излизат
    for (let i = zombies.length - 1; i >= 0; i--) if (zombies[i].state === STATE.dead && time - zombies[i].dieAt > 0.6) zombies.splice(i, 1);
  }

  function tick(now) {
    if (!fin(now) || now <= nowMs) return;
    nowMs = now;
    const target = (now - t0) / 1000;
    while (!over && target - time > 1e-9) stepSim(Math.min(0.1, target - time));
    const keep = nowMs - RULES.eventMs;
    if (events.length && events[0].at < keep) events = events.filter(e => e.at >= keep);
  }

  const pubGun = g => [g.k, g.ammo, g.reserve, g.reloadUntil > time ? r2(g.reloadUntil - time) : 0];
  function snapshot() {
    return {
      t: Math.round(nowMs),
      phase, wave,
      left: r2(Math.max(0, T - time)),
      next: phase === 'intro' || phase === 'break' ? r2(Math.max(0, phaseEnd - time)) : 0,
      score, kills, combo: time - comboAt <= RULES.combo.window ? combo : 0, chances,
      boss: boss && !bossDead ? r3(boss.hp / boss.max) : null,
      stock: { ...stock }, offer: offer ? [offer.n, ...offer.kinds] : null,
      gates: G.map(g => [g.boards, g.busy]), bombs: bombs.map(b => (b.alive ? 1 : 0)), dark: dark ? 1 : 0, heat: r2(heat),
      z: zombies.map(z => [z.id, TYPES.indexOf(z.type), z.look, r2(z.x), r2(z.z), r2(z.h), z.state, r2(z.hp / z.max), time < z.rageUntil ? 1 : 0, z.creep]),
      players: active().map(pl => ({ id: pl.id, n: pl.n, name: pl.name, hp: Math.round(pl.hp), down: isDown(pl) ? r2(pl.downUntil - time) : 0, score: pl.score, kills: pl.kills, pick: pl.pick, l: pubGun(pl.w.l), r: pubGun(pl.w.r) })),
      events: events.map(({ at: _at, ...e }) => e),
      result: over ? { ...result, players: result.players.map(p => ({ ...p })) } : null,
    };
  }

  const startJson = JSON.stringify({
    game: 'motel', theme: 'night', level, hall: zone.hall, rooms: zone.rooms, doors: Array.isArray(opts.doors) ? opts.doors : [], zone: { cx: r3(zone.cx), cz: r3(zone.cz) }, fast,
    duration: r2(T), stand, weapons: W, zombies: Z, types: TYPES, waves: RULES.waves.length,
    lanes: lanes ? lanes.map(l => ({ id: l.id, gate: l.gate || null, points: l.points })) : null, ring: lanes ? 0 : RULES.ring,
    fence, gates, solid: map?.solid || [],
    edges: edges.map(e => ({ x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, nx: e.nx, nz: e.nz, len: e.len })), fenceOff: FENCE,
    routes: routes.map(r => ({ lane: r.lane, gate: r.gate, points: r.points })), bombs: bombs.map(b => ({ x: b.x, z: b.z })),
    gate: GT, blast: BOMB.r, prep: r2(S(RULES.intro)), clear: map?.clear || 0,
  });

  makeOffer(0);      // първият избор стои пред играчите още в подготовката
  return {
    start: () => JSON.parse(startJson),
    join, leave, pose, act, tick, snapshot,
    get over() { return over; },
  };
}

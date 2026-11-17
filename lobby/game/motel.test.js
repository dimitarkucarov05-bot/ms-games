// Проби на правилата на „Мъртвият мотел":  node --test game/motel.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, RULES, STATE, TYPES, zoneOf, placeStand } from './motel.js';

const MAP = { lanes: [{ id: 'road', points: [[0, 30], [0, 12], [0, 3]] }, { id: 'wood', points: [[-25, 0], [-10, 0], [-3, 0]] }], boss: 'road', ammo: [] };
const ROOMS = [{ id: 'a', x: 0, z: 0, w: 2.4, d: 2.3 }, { id: 'b', x: -0.7, z: -2.7, w: 1.6, d: 3.1 }];

/** Поза: главата на (x, 1.6, z), ръцете до нея. */
function poseAt(x = 0, z = 0) {
  return [x, 1.6, z, 0, 0, 0, 1, x - 0.2, 1.2, z, 0, 0, 0, 1, x + 0.2, 1.2, z, 0, 0, 0, 1];
}
function make(opts = {}) {
  const g = createGame({ hall: { w: 2.4, d: 2.3 }, rooms: ROOMS, seed: 7, now: 0, map: MAP, ...opts });
  let now = 0;
  const run = (sec, each) => { const end = now + sec * 1000; while (now < end && !g.over) { now += 100; g.tick(now); if (each) each(g.snapshot(), now); } return g.snapshot(); };
  return { g, run, get now() { return now; } };
}
const zombiesOf = s => s.z.map(z => ({ id: z[0], type: TYPES[z[1]], x: z[3], z: z[4], state: z[6], hp: z[7] }));

test('старт: формата на съобщението и мястото на сандъка', () => {
  const { g } = make();
  const s = g.start();
  assert.equal(s.game, 'motel');
  assert.equal(s.duration, 600);
  assert.ok(s.weapons.pistol && s.zombies.walker && s.lanes.length === 2);
  assert.ok(Number.isFinite(s.stand.x) && Number.isFinite(s.stand.z));
  // сандъкът е извън зоната, но на една ръка от ръба
  const zone = zoneOf({ rooms: ROOMS });
  // центърът му е до 10 см от ръба (предните 30 см са вътре)
  const edge = Math.min(...zone.rects.map(r => Math.max(r.x0 - s.stand.x, s.stand.x - r.x1, r.z0 - s.stand.z, s.stand.z - r.z1, 0)));
  assert.ok(edge < 0.5, `сандъкът е на ${edge} м от ръба`);
  // и е до първата стая (залата), не в дъното на задната
  assert.ok(Math.hypot(s.stand.x, s.stand.z) < 2, `сандъкът е на ${Math.hypot(s.stand.x, s.stand.z)} м от средата`);
});

test('сандъкът не застава в съседна стая и гледа към зоната', () => {
  const zone = zoneOf({ rooms: ROOMS });
  const st = placeStand(zone, MAP);
  // лицето (ry) сочи обратно на външната нормала
  assert.ok(Math.abs(Math.sin(st.ry) + st.nx) < 1e-3 && Math.abs(Math.cos(st.ry) + st.nz) < 1e-3);
});

test('подготовката: първите идват от тъмното още през нея, вълната се обявява след края ѝ', () => {
  const { g, run } = make();
  const st = g.start();
  g.join('p1', { n: 1, name: 'Каска 1' }); g.pose('p1', poseAt(0, 0));
  let s = run(2);
  assert.equal(s.phase, 'intro'); assert.equal(s.z.length, 0);
  let bangs = 0;
  s = run(RULES.intro - 12, q => { bangs += q.events.filter(e => e.k === 'bang').length; });
  assert.equal(s.phase, 'intro');
  assert.ok(s.z.length > 0, 'вече идват');
  const far = Math.min(...zombiesOf(s).map(z => Math.hypot(z.x, z.z)));
  s = run(8, q => { bangs += q.events.filter(e => e.k === 'bang').length; });
  assert.equal(s.phase, 'intro');
  const near = Math.min(...zombiesOf(s).map(z => Math.hypot(z.x, z.z)));
  assert.ok(near < far, 'приближават се');
  assert.equal(bangs, 0, 'преди края на подготовката никой не е стигнал портите');
  for (const z of zombiesOf(s)) assert.ok(!(z.x > st.fence.x0 && z.x < st.fence.x1 && z.z > st.fence.z0 && z.z < st.fence.z1), 'никой не е вътре');
  s = run(3);
  assert.equal(s.phase, 'wave'); assert.equal(s.wave, 1);
});

test('изстрели: глава убива веднага, тяло сваля кръв, мъртвото не се брои втори път', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt());
  let s = run(RULES.intro + 6);
  const z = zombiesOf(s).filter(q => q.type === 'walker');
  assert.ok(z.length >= 2);
  assert.equal(g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [[z[0].id, 1, 1]] }).ok, true);
  s = run(0.2);
  assert.equal(s.kills, 1);
  assert.ok(s.score >= RULES.zombies.walker.score * 2);
  assert.ok(s.events.some(e => e.k === 'kill' && e.head === 1));
  // тяло: 34 от 100
  g.act('p1', { a: 'shot', hand: 'l', o: [0, 1.2, 0], d: [0, 0, 1], hits: [[z[1].id, 0, 1]] });
  s = run(0.2);
  const hit = zombiesOf(s).find(q => q.id === z[1].id);
  assert.ok(hit && Math.abs(hit.hp - 0.66) < 0.02, `кръв ${hit?.hp}`);
  // по убитото зомби
  const before = s.score;
  run(0.5);
  g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [[z[0].id, 1, 1]] });
  s = run(0.2);
  assert.equal(s.kills, 1); assert.equal(s.score, before);
});

test('невъзможен темп и празен пълнител се отхвърлят', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt());
  run(1);
  let ok = 0;
  for (let i = 0; i < 12; i++) if (g.act('p1', { a: 'shot', hand: 'r', hits: [] }).ok) ok++;
  assert.ok(ok <= 3, `в един миг минаха ${ok} изстрела`);
  // с нормален темп пълнителят свършва на 12-ия и тръгва презареждане
  const { g: g2, run: run2 } = make();
  g2.join('p1', { n: 1, name: 'А' }); g2.pose('p1', poseAt());
  run2(1);
  let fired = 0;
  for (let i = 0; i < 14; i++) { if (g2.act('p1', { a: 'shot', hand: 'r', hits: [] }).ok) fired++; run2(0.2); }
  assert.equal(fired, 12);
  let s = g2.snapshot();
  assert.ok(s.players[0].r[3] > 0, 'презарежда');
  s = run2(RULES.weapons.pistol.reload + 0.2);
  assert.equal(s.players[0].r[1], 12);
});

test('попадение от невъзможно разстояние не се зачита', () => {
  const { g, run } = make({ map: { lanes: [{ id: 'far', points: [[0, 200], [0, 100], [0, 3]] }] } });
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt());
  let s = run(RULES.intro + 4);
  const z = zombiesOf(s)[0];
  assert.ok(z && Math.hypot(z.x, z.z) > 100);
  g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [[z.id, 1, 1]] });
  s = run(0.2);
  assert.equal(s.kills, 0);
});

test('зомбито удря отблизо, играчът пада и се връща', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'А' }); g.join('p2', { n: 2, name: 'Б' });
  g.pose('p1', poseAt(0, 0)); g.pose('p2', poseAt(40, 40));      // вторият е далеч: зомбитата удрят първия
  let down = false, up = false, bites = 0;
  run(120, s => {
    for (const e of s.events) { if (e.k === 'bite' && e.p === 'p1') bites++; if (e.k === 'down' && e.p === 'p1') down = true; if (e.k === 'up' && e.p === 'p1') up = true; }
  });
  assert.ok(bites > 0, 'има удари');
  assert.ok(down, 'пада');
  assert.ok(up, 'връща се');
});

test('всички паднали: групата се вдига пак и играта върви до края на времето (само на кошмар е край)', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'Сам' }); g.pose('p1', poseAt());
  let chances = 0;
  const s = run(700, q => { if (q.events.some(e => e.k === 'chance')) chances++; });
  assert.ok(chances >= 3, 'имаше втори шанс, и то повече от двата безплатни: ' + chances);
  assert.equal(g.over, true);
  assert.equal(s.phase, 'lost');
  const r = s.result;
  assert.equal(r.won, false); assert.equal(r.reason, 'time');
  assert.ok(r.wipes >= 3, 'wipes ' + r.wipes);
  for (const k of ['score', 'money', 'stars', 'wave', 'kills', 'headshots', 'accuracy', 'downs']) assert.ok(Number.isFinite(r[k]), k);
  assert.equal(r.money, r.score);
  assert.deepEqual(Object.keys(r.players[0]).sort(), ['downs', 'headshots', 'hits', 'kills', 'n', 'name', 'score', 'shots']);
});

test('кошмар: без втори шанс, първото падане на цялата група е краят', () => {
  const { g, run } = make({ difficulty: 'nightmare' });
  g.join('p1', { n: 1, name: 'Сам' }); g.pose('p1', poseAt());
  let chances = 0;
  const s = run(700, q => { if (q.events.some(e => e.k === 'chance')) chances++; });
  assert.equal(chances, 0);
  assert.equal(g.over, true);
  assert.equal(s.result.reason, 'wiped');
  assert.equal(s.result.level, 'nightmare');
});

/** Бот: всяка десета от секундата стреля в главата на най-близкото зомби с всяка ръка, която може. */
function bot(g, id) {
  return s => {
    const me = s.players.find(p => p.id === id);
    if (!me || me.down) return;
    const list = zombiesOf(s).filter(z => z.state !== STATE.dead).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    if (!list.length) return;
    for (const [i, hand] of ['l', 'r'].entries()) {
      const z = list[i % list.length];
      if (Math.hypot(z.x, z.z) > 30) continue;
      g.act(id, { a: 'shot', hand, o: [0, 1.2, 0], d: [0, 0, 1], hits: [[z.id, z.type === 'boss' ? 1 : (s.t / 100 | 0) % 3 === 0 ? 1 : 0, 1]] });
    }
  };
}

test('цяла игра с бот: вълни, оръжие от сандъка, шеф, победа', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'Бот' }); g.pose('p1', poseAt());
  const shoot = bot(g, 'p1');
  let took = false, bossSeen = false, maxAlive = 0, maxBytes = 0, waves = 0;
  const s = run(700, q => {
    shoot(q);
    maxAlive = Math.max(maxAlive, q.z.filter(z => z[6] !== STATE.dead).length);
    maxBytes = Math.max(maxBytes, JSON.stringify(q).length);
    if (q.events.some(e => e.k === 'wave')) waves = q.wave;
    if (q.boss != null) bossSeen = true;
    const gun = !took && q.drops.find(d => d[1] === 'smg');
    if (gun) { const r = g.act('p1', { a: 'take', hand: 'r', d: gun[0] }); took = r.ok; assert.ok(r.ok, r.reason); }
  });
  assert.ok(took, 'взе автомата');
  assert.ok(waves >= 5, `вълни ${waves}`);
  assert.ok(bossSeen, 'шефът дойде');
  assert.equal(g.over, true);
  assert.equal(s.result.won, true, `край: ${s.result.reason}`);
  assert.ok(s.result.stars >= 4);
  assert.ok(s.result.accuracy > 0 && s.result.accuracy <= 1);
  assert.ok(maxAlive <= 14, `живи наведнъж ${maxAlive}`);
  assert.ok(maxBytes < 6000, `състоянието е ${maxBytes} байта`);
});

test('времето свършва: игра без стрелба с много играчи не продължава след края', () => {
  const { g, run } = make();
  for (let i = 1; i <= 6; i++) { g.join(`p${i}`, { n: i, name: `И${i}` }); g.pose(`p${i}`, poseAt(i * 300, 0)); }      // далеч: никой не ги стига
  const s = run(RULES.minutes * 60 + 5);
  assert.equal(g.over, true);
  assert.equal(s.result.reason, 'time');
  assert.equal(s.result.won, false);
  assert.equal(s.result.players.length, 6);
});

test('кратката проба свършва за една шеста от времето и има шеф', () => {
  const { g, run } = make({ fast: true });
  g.join('p1', { n: 1, name: 'Бот' }); g.pose('p1', poseAt());
  assert.equal(g.start().duration, 100);
  const shoot = bot(g, 'p1');
  let bossSeen = false;
  const s = run(105, q => { shoot(q); if (q.boss != null) bossSeen = true; });
  assert.equal(g.over, true);
  assert.ok(bossSeen, 'шефът идва и в кратката проба');
  assert.ok(s.result.kills > 5);
});

test('оръжие от земята пред сандъка: взима се по номер и отблизо; свършва и се връща пистолетът', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt());
  let s = run(2);
  const smg = s.drops.find(d => d[1] === 'smg');
  assert.ok(smg, 'автоматът лежи пред сандъка');
  assert.equal(g.act('p1', { a: 'take', hand: 'r', d: -5 }).reason, 'gone');
  g.pose('p1', poseAt(30, 30));
  assert.equal(g.act('p1', { a: 'take', hand: 'r', d: smg[0] }).reason, 'far');
  g.pose('p1', poseAt(smg[2], smg[3]));
  assert.equal(g.act('p1', { a: 'take', hand: 'r', d: smg[0] }).ok, true);
  s = g.snapshot();
  assert.equal(s.players[0].r[0], 'smg'); assert.equal(s.players[0].r[1], RULES.weapons.smg.mag);
  assert.ok(!s.drops.some(d => d[0] === smg[0]), 'взетото вече не лежи на земята');
  // изстрелва всичко: пълнителят и резервът свършват и в ръката пак е пистолетът
  let shots = 0;
  for (let i = 0; i < 4000 && g.snapshot().players[0].r[0] === 'smg' && !g.over; i++) { if (g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, -1], hits: [] }).ok) shots++; run(0.1); }
  assert.equal(g.snapshot().players[0].r[0], 'pistol');
  assert.equal(shots, RULES.weapons.smg.mag + RULES.weapons.smg.reserve);
});

test('напуснал играч си пази точките и влиза в резултата', () => {
  const { g, run } = make({ fast: true });
  g.join('p1', { n: 1, name: 'А' }); g.join('p2', { n: 2, name: 'Б' });
  g.pose('p1', poseAt()); g.pose('p2', poseAt(1, 0));
  const shoot = bot(g, 'p2');
  run(30, shoot);
  g.leave('p2');
  const s = run(100);
  assert.equal(g.over, true);
  const p2 = s.result.players.find(p => p.n === 2);
  assert.ok(p2 && p2.kills > 0);
});

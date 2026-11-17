// Проби на живата част на „Мъртвият мотел" (порти, коване, варели, ток, нагаждане):  node --test game/motel.live.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, RULES, STATE, TYPES, zoneOf } from './motel.js';

const MAP = { lanes: [{ id: 'road', points: [[0, 30], [0, 12], [0, 3]] }, { id: 'wood', points: [[-25, 0], [-10, 0], [-3, 0]] }], boss: 'road', ammo: [] };
const ROOMS = [{ id: 'a', x: 0, z: 0, w: 2.4, d: 2.3 }, { id: 'b', x: -0.7, z: -2.7, w: 1.6, d: 3.1 }];

/** Поза: главата на (x, 1.6, z), ръцете до нея. */
function poseAt(x = 0, z = 0) {
  return [x, 1.6, z, 0, 0, 0, 1, x - 0.2, 1.2, z, 0, 0, 0, 1, x + 0.2, 1.2, z, 0, 0, 0, 1];
}
/** Играч при портата: стои на метър навътре, едната му ръка е на половин метър от дъските, другата не се следи. */
function poseAtGate(gate, hand = 'r') {
  const p = [gate.x - gate.nx * 1.0, 1.6, gate.z - gate.nz * 1.0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
  const o = hand === 'l' ? 7 : 14;
  p[o] = gate.x - gate.nx * 0.5; p[o + 1] = 1.1; p[o + 2] = gate.z - gate.nz * 0.5;
  return p;
}
function make(opts = {}) {
  const g = createGame({ hall: { w: 2.4, d: 2.3 }, rooms: ROOMS, seed: 7, now: 0, map: MAP, ...opts });
  let now = 0;
  const run = (sec, each) => { const end = now + sec * 1000; while (now < end && !g.over) { now += 100; g.tick(now); if (each) each(g.snapshot(), now); } return g.snapshot(); };
  return { g, run, get now() { return now; } };
}
const zombiesOf = s => s.z.map(z => ({ id: z[0], type: TYPES[z[1]], x: z[3], z: z[4], state: z[6], hp: z[7] }));
const boardsOf = s => s.gates.map(g => g[0]);
/** Бот: всяка десета от секундата стреля в най-близкото зомби с всяка ръка, която може. */
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

test('портите: срещу стаите, на една ръка от зоната, никоя до сандъка, всяка с път', () => {
  const { g } = make();
  const s = g.start();
  const zone = zoneOf({ rooms: ROOMS });
  assert.ok(s.gates.length >= 2, `порти ${s.gates.length}`);
  for (const gt of s.gates) {
    // от ръба на зоната до портата: колкото е оградата навън (0.9 м), не повече
    const d = Math.min(...zone.rects.map(r => Math.hypot(Math.max(r.x0 - gt.x, 0, gt.x - r.x1), Math.max(r.z0 - gt.z, 0, gt.z - r.z1))));
    assert.ok(d < 0.95, `порта ${gt.id} е на ${d} м от зоната`);
    assert.ok(Math.hypot(gt.x - s.stand.x, gt.z - s.stand.z) > 1.5, `порта ${gt.id} е до сандъка`);
    assert.equal(gt.max, RULES.gate.boards);
    assert.ok(s.routes.some(r => r.gate === gt.id), `порта ${gt.id} няма път`);
  }
  // всеки път свършва пред портата си: до дъските и после вътре
  for (const r of s.routes) {
    const gt = s.gates.find(q => q.id === r.gate), n = r.points.length, stop = r.points[n - 2], inside = r.points[n - 1];
    assert.ok(Math.abs((stop[0] - gt.x) * gt.nx + (stop[1] - gt.z) * gt.nz - RULES.gate.stop) < 0.01);
    assert.ok((inside[0] - gt.x) * gt.nx + (inside[1] - gt.z) * gt.nz < 0, 'последната точка е вътре');
  }
});

test('голяма зала: порти от всички страни освен при сандъка, при дълга стена по две', () => {
  const big = createGame({ hall: { w: 6, d: 9 }, rooms: [{ id: 'a', x: 0, z: 0, w: 6, d: 9 }], seed: 3, now: 0, map: MAP });
  const s = big.start();
  assert.ok(s.gates.length >= 4, `порти ${s.gates.length}`);
  assert.ok(s.gates.filter(g => g.nx !== 0).length >= 2, 'дългите стени имат порти');
  for (const gt of s.gates) assert.ok(Math.abs(gt.x) <= 3.91 && Math.abs(gt.z) <= 5.41);
});

test('подготовка: портите са полуразковани, на масата има автомат, играч ги заковава с ръка', () => {
  const { g, run } = make();
  const st = g.start();
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt());
  let s = run(1);
  assert.equal(s.phase, 'intro');
  assert.deepEqual(boardsOf(s), st.gates.map(() => RULES.gate.start));
  assert.ok(s.stock.smg > 0, 'автоматът е на масата още в началото');
  // далеч от портата нищо не се кове
  s = run(3);
  assert.deepEqual(boardsOf(s), st.gates.map(() => RULES.gate.start));
  // с ръка при първата порта: дъска на всеки 0.7 с
  g.pose('p1', poseAtGate(st.gates[0]));
  let fixes = 0;
  s = run(RULES.gate.fix * (RULES.gate.boards - RULES.gate.start) + 0.5, q => { fixes += q.events.some(e => e.k === 'fix' && e.g === 0) ? 1 : 0; });
  assert.equal(s.gates[0][0], RULES.gate.boards, 'портата е закована');
  assert.ok(fixes > 0, 'имаше събития за коване');
  assert.equal(s.gates[1][0], RULES.gate.start, 'другите порти не са пипани');
  assert.ok(s.score >= RULES.gate.points * (RULES.gate.boards - RULES.gate.start));
});

test('ръката, която стреля, не кове', () => {
  const { g, run } = make();
  const st = g.start();
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAtGate(st.gates[0]));
  // докато пълнителят не свърши (после ръката презарежда и вече не стреля)
  let s = run(1.2, () => { g.act('p1', { a: 'shot', hand: 'r', hits: [] }); });
  assert.equal(s.gates[0][0], RULES.gate.start);
  // спре ли да стреля, същата ръка кове
  s = run(RULES.gate.calm + RULES.gate.fix + 0.3);
  assert.ok(s.gates[0][0] > RULES.gate.start);
});

test('зомбито спира пред закована порта, сваля дъските една по една и чак тогава влиза', () => {
  const { g, run } = make();
  const st = g.start();
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt(0, 0));
  let bangs = 0, firstBite = Infinity, firstBreach = Infinity, minLeft = 99;
  const open = new Set();
  run(RULES.intro + 70, (q, now) => {
    for (const e of q.events) {
      if (e.k === 'bang') { bangs++; minLeft = Math.min(minLeft, e.left); }
      if (e.k === 'breach') { open.add(e.g); firstBreach = Math.min(firstBreach, now); }
      if (e.k === 'bite') firstBite = Math.min(firstBite, now);
    }
    // докато никоя порта не е паднала, никое зомби не е вътре в оградата
    if (!open.size) for (const z of q.z) if (z[6] !== STATE.dead) assert.ok(!(z[3] > st.fence.x0 + 0.2 && z[3] < st.fence.x1 - 0.2 && z[4] > st.fence.z0 + 0.2 && z[4] < st.fence.z1 - 0.2), `зомби вътре преди пробив: ${z[3]}, ${z[4]}`);
  });
  assert.ok(bangs >= RULES.gate.start, `удари по дъските: ${bangs}`);
  assert.equal(minLeft, 0);
  assert.ok(open.size > 0, 'портата падна');
  assert.ok(firstBite > firstBreach, 'ухапването идва след пробива');
});

test('коването държи портата: с ръка на дъските едно зомби не я пробива', () => {
  const { g, run } = make({ map: { lanes: [{ id: 'one', points: [[-25, 0], [-12, 0]] }] } });
  const st = g.start();
  g.join('p1', { n: 1, name: 'А' });
  let breachAtMine = 0, arrived = false;
  run(RULES.intro + 50, q => {
    // играчът стои при портата, пред която е най-близкото зомби, и не стреля
    const alive = q.z.filter(v => v[6] !== STATE.dead);
    let gi = 0, best = Infinity;
    st.gates.forEach((gt, i) => { for (const z of alive) { const d = Math.hypot(gt.x - z[3], gt.z - z[4]); if (d < best) { best = d; gi = i; } } });
    if (best < 1.2) arrived = true;
    g.pose('p1', poseAtGate(st.gates[gi]));
    breachAtMine += q.events.filter(e => e.k === 'breach' && e.g === gi).length;
  });
  assert.ok(arrived, 'зомби стигна до порта');
});

test('варел с гориво: изстрелът го взривява, зомбитата наоколо падат, в почивката се връща', () => {
  const { g, run } = make();
  const st = g.start();
  assert.ok(st.bombs.length >= 1 && st.bombs.length <= RULES.bombs.max, `варели ${st.bombs.length}`);
  for (const b of st.bombs) assert.ok(!(b.x > st.fence.x0 - 2 && b.x < st.fence.x1 + 2 && b.z > st.fence.z0 - 2 && b.z < st.fence.z1 + 2), 'варелът не е до зоната');
  g.join('p1', { n: 1, name: 'А' }); g.pose('p1', poseAt());
  // чакаме зомби да мине край някой варел
  let s = g.snapshot(), hit = -1;
  for (let i = 0; i < 1500 && hit < 0; i++) {
    s = run(0.1);
    hit = st.bombs.findIndex(b => s.z.some(z => z[6] !== STATE.dead && Math.hypot(z[3] - b.x, z[4] - b.z) < RULES.bombs.r - 0.3));
  }
  assert.ok(hit >= 0, 'зомби мина край варел');
  const before = s.kills;
  assert.equal(g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [], bomb: hit }).ok, true);
  s = run(0.2);
  assert.ok(s.kills > before, 'взривът уби');
  assert.equal(s.bombs[hit], 0);
  assert.ok(s.events.some(e => e.k === 'boom' && e.b === hit));
  // втори изстрел по същия варел не прави нищо
  const k2 = s.kills;
  run(0.5);
  g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [], bomb: hit });
  s = run(0.2);
  assert.equal(s.kills, k2);
  // след почивката е пак там
  const shoot = bot(g, 'p1');
  for (let i = 0; i < 3000 && s.phase !== 'break'; i++) s = run(0.1, shoot);
  assert.equal(s.phase, 'break');
  assert.equal(s.bombs[hit], 1);
});

test('токът спира на определените вълни и идва пак в почивката', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'Бот' }); g.pose('p1', poseAt());
  const shoot = bot(g, 'p1');
  const darkWaves = new Set(), lit = new Set();
  let on = 0, off = 0;
  run(700, q => {
    shoot(q);
    if (q.phase === 'wave') (q.dark ? darkWaves : lit).add(q.wave);
    for (const e of q.events) if (e.k === 'dark') { if (e.on) on++; else off++; }
  });
  assert.ok(darkWaves.has(RULES.dark[0]), `тъмни вълни: ${[...darkWaves]}`);
  assert.ok(lit.has(1) && lit.has(2));
  assert.ok(on > 0 && off > 0);
});

test('трудността се нагажда: чистите вълни я вдигат, падането я сваля', () => {
  // бот, който не изпуска: трудността расте
  const a = make();
  a.g.join('p1', { n: 1, name: 'Бот' }); a.g.pose('p1', poseAt());
  const shoot = bot(a.g, 'p1');
  let top = 1;
  a.run(200, q => { shoot(q); top = Math.max(top, q.heat); });
  assert.ok(top > 1, `трудност ${top}`);
  // стрелец, който почти не стреля: отборът пада и трудността слиза под началната
  const b = make();
  b.g.join('p1', { n: 1, name: 'Сам' }); b.g.join('p2', { n: 2, name: 'Стрелец' });
  b.g.pose('p1', poseAt(0, 0)); b.g.pose('p2', poseAt(0.5, 0));
  const late = bot(b.g, 'p2');
  let low = 1, fell = false;
  // никой не стреля, докато някой не падне; после стрелецът изчиства вълната и тя свършва с паднал играч
  b.run(400, q => { if (q.events.some(e => e.k === 'down')) fell = true; if (fell) late(q); low = Math.min(low, q.heat); });
  assert.ok(fell, 'някой падна');
  assert.ok(low < 1, `трудност ${low}`);
});

test('шефът отнася портата с един удар', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'Бот' }); g.pose('p1', poseAt());
  // ботът чисти всичко освен шефа и никой не кове: шефът стига до закована порта
  const shoot = bot(g, 'p1');
  let smash = null, bossSeen = false;
  run(700, q => {
    const boss = q.z.find(z => TYPES[z[1]] === 'boss');
    if (boss) bossSeen = true;
    shoot({ ...q, z: q.z.filter(z => TYPES[z[1]] !== 'boss') });
    for (const e of q.events) if (e.k === 'bang' && e.big && smash === null) smash = e.left;
  });
  assert.ok(bossSeen, 'шефът дойде');
  assert.equal(smash, 0, 'портата падна от един удар');
});

test('състоянието остава малко и с портите и варелите', () => {
  const { g, run } = make();
  for (let i = 1; i <= 6; i++) { g.join(`p${i}`, { n: i, name: `Играч ${i}` }); g.pose(`p${i}`, poseAt(0.2 * i, 0)); }
  let max = 0;
  run(120, q => { max = Math.max(max, JSON.stringify(q).length); });
  assert.ok(max < 9000, `състоянието е ${max} байта`);
});

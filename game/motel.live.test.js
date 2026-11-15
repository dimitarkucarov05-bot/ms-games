// Проби на живата част на „Мъртвият мотел" (порти, коване, варели, ток, нагаждане):  node --test game/motel.live.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, RULES, STATE, TYPES, zoneOf, OPTIONS, readOptions } from './motel.js';

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
  assert.deepEqual(s.drops.map(d => d[1]), RULES.offers[0], 'първите оръжия са излезли от сандъка още в подготовката');
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
  assert.deepEqual(g.start().darkWaves, [4]);
  assert.ok(darkWaves.has(g.start().darkWaves[0]), `тъмни вълни: ${[...darkWaves]}`);
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

test('difficulty: easy is smaller, softer and slower than nightmare; unknown falls back to normal', () => {
  const mk = difficulty => createGame({ hall: { w: 6, d: 6 }, seed: 7, now: 0, difficulty });
  const first = g => { g.join('a', { n: 1, name: 'A' }); let t = 0, seen = null, most = 0; while (t < 80000 && g.snapshot().wave < 2) { t += 100; g.tick(t); const s = g.snapshot(); most = Math.max(most, s.z.length); seen = seen || s.z[0] || null; } return { most, start: JSON.parse(JSON.stringify(g.start())) }; };
  const e = first(mk('easy')), n = first(mk('normal')), x = first(mk('nightmare')), u = first(mk('banana'));
  assert.equal(e.start.level, 'easy'); assert.equal(x.start.level, 'nightmare'); assert.equal(u.start.level, 'normal');
  assert.ok(e.most <= n.most && n.most <= x.most, `wave one alive at once: ${e.most} <= ${n.most} <= ${x.most}`);
  assert.ok(RULES.levels.easy.dmg < 1 && RULES.levels.nightmare.dmg > 1 && RULES.levels.nightmare.score > RULES.levels.easy.score);
});

test('melee: a machete from the chest kills a walker within reach, does nothing from afar, wears out and the pistol comes back', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'A' });
  g.pose('p1', poseAt());
  let s = run(1);
  const blade = s.drops.find(d => d[1] === 'machete');
  assert.ok(blade, 'the first weapons from the chest include a melee weapon');
  assert.ok(!s.drops.some(d => d[1] === 'chainsaw'), 'the chainsaw comes later');
  assert.equal(g.act('p1', { a: 'take', hand: 'r', d: blade[0] }).ok, true);
  assert.equal(g.snapshot().players[0].r[0], 'machete');
  // wait for the first walker, then stand far from it and swing: nothing happens
  let tries = 0;
  while (!zombiesOf(s).some(z => z.state !== STATE.dead && z.type === 'walker') && tries++ < 400) s = run(0.2);
  let z = zombiesOf(s).find(q => q.state !== STATE.dead && q.type === 'walker');
  assert.ok(z, 'a walker is alive');
  g.pose('p1', poseAt(z.x + 6, z.z));
  g.act('p1', { a: 'shot', hand: 'r', o: [z.x + 6, 1.2, z.z], d: [-1, 0, 0], hits: [[z.id, 0, 1]] });
  s = run(0.2);
  const far = zombiesOf(s).find(q => q.id === z.id);
  assert.ok(far && far.state !== STATE.dead, 'a swing from six metres does not count');
  // next to it: one swing kills
  z = far;
  g.pose('p1', poseAt(z.x + 0.5, z.z));
  s = run(0.6);
  z = zombiesOf(s).find(q => q.id === z.id);
  g.pose('p1', poseAt(z.x + 0.5, z.z));
  const kills0 = s.kills;
  const swing = g.act('p1', { a: 'shot', hand: 'r', o: [z.x + 0.7, 1.2, z.z], d: [-1, 0, 0], hits: [[z.id, 0, 1]] });
  assert.equal(swing.ok, true, 'swing refused: ' + swing.reason);
  s = run(0.2);
  assert.ok(s.kills > kills0, 'the walker next to the player is dead after one swing');
  // the blade wears out: after its last use the hand holds the pistol again
  let used = 0;
  for (let i = 0; i < 300 && g.snapshot().players[0].r[0] === 'machete'; i++) { if (g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, -1], hits: [] }).ok) used++; run(0.5); }
  assert.equal(g.snapshot().players[0].r[0], 'pistol');
  assert.ok(used >= 20 && used <= RULES.weapons.machete.mag, 'used ' + used);
});

test('chest: weapons for everybody lie on the ground inside the zone until taken; more and stronger ones after every cleared wave', () => {
  const { g, run } = make({ fast: true });
  const st = g.start();
  g.join('p1', { n: 1, name: 'A' }); g.join('p2', { n: 2, name: 'B' });
  g.pose('p1', poseAt()); g.pose('p2', poseAt(0.6, 0));
  let s = run(0.3);
  // two players: four weapons, of the three kinds of the first row, apart from each other and inside the drawn zone
  assert.equal(s.drops.length, 4);
  assert.deepEqual([...new Set(s.drops.map(d => d[1]))].sort(), RULES.offers[0].slice().sort());
  const inZone = (x, z) => ROOMS.some(r => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2);
  for (const d of s.drops) assert.ok(inZone(d[2], d[3]), 'on the ground inside the zone: ' + d);
  for (const a of s.drops) for (const b of s.drops) if (a !== b) assert.ok(Math.hypot(a[2] - b[2], a[3] - b[3]) >= RULES.drops.apart - 1e-6);
  assert.ok(Math.hypot(s.drops[0][2] - st.chest.x, s.drops[0][3] - st.chest.z) < 1.2, 'the first one lies right in front of the chest');
  // taking: by id, once; anybody may take any; each hand holds its own
  const id = s.drops[0][0];
  assert.equal(g.act('p1', { a: 'take', hand: 'r', d: 9999 }).reason, 'gone');
  assert.equal(g.act('p1', { a: 'take', hand: 'r', d: id }).ok, true);
  assert.equal(g.act('p2', { a: 'take', hand: 'r', d: id }).reason, 'gone', 'already taken');
  assert.equal(g.act('p1', { a: 'take', hand: 'l', d: s.drops[1][0] }).ok, true, 'the other hand takes another one');
  s = g.snapshot();
  assert.equal(s.drops.length, 2);
  assert.equal(s.players.find(q => q.id === 'p1').r[0], RULES.offers[0][0]);
  // what nobody takes stays on the ground; every cleared wave adds the next row; never more than the cap
  const shoot = bot(g, 'p1'), shoot2 = bot(g, 'p2');
  const rows = new Set([0]);
  let most = 0, stayed = true;
  const left = s.drops.map(d => d[0]);
  for (let i = 0; i < 4000 && !g.over; i++) {
    s = run(0.1, q => { shoot(q); shoot2(q); });
    most = Math.max(most, s.drops.length);
    if (s.offer) rows.add(s.offer[0]);
    if (s.wave <= 2 && !left.every(x => s.drops.some(d => d[0] === x))) stayed = false;
  }
  assert.ok(stayed, 'untaken weapons stay on the ground');
  assert.deepEqual([...rows].sort(), [0, 1, 2, 3, 4, 5]);
  assert.ok(most <= RULES.drops.max, 'on the ground at once: ' + most);
  assert.equal(g.over, true);
  // the rows get stronger: what one full load can deal, best of each row
  const load = k => { const w = RULES.weapons[k]; return w.dmg * w.pellets * (w.mag + Math.max(0, w.reserve)); };
  const best = RULES.offers.map(o => Math.max(...o.map(load)));
  assert.ok(best[0] < best[2] && best[2] < best[3], 'best load per row: ' + best.join(' '));
  for (const o of RULES.offers) { assert.equal(o.length, 3); for (const k of o) assert.ok(RULES.weapons[k], k); assert.ok(o.some(k => RULES.weapons[k].melee || k === 'shotgun'), 'every row has something for close range'); }
});

// ── MS Games 2: длъжини, кратка версия, детски режим, брой играчи, настройки, пауза, трудност в движение, шефът от пулта,
//    връщане след падане вместо край, резултат за пулта ──

/** Цяла игра с бот: кои вълни се видяха, дошъл ли е шефът, колко кадъра беше тъмно, резултатът. */
function playOut(opts, sec = 1000, each) {
  const { g, run } = make(opts);
  g.join('p1', { n: 1, name: 'Бот' }); g.pose('p1', poseAt());
  const shoot = bot(g, 'p1');
  const waves = new Set();
  let bossSeen = false, dark = 0;
  const s = run(sec, q => { shoot(q); if (q.phase === 'wave') waves.add(q.wave); if (q.boss != null) bossSeen = true; if (q.dark) dark++; each?.(q, g); });
  return { g, s, waves, bossSeen, dark };
}
const sorted = set => [...set].sort((a, b) => a - b);

test('cuts: 10 minutes = 5 waves, 15 minutes = 6 longer waves, short = one wave fewer; odd minutes snap to a cut', () => {
  const ten = make().g.start(), fifteen = make({ minutes: 15 }).g.start();
  assert.equal(ten.duration, 600); assert.equal(ten.waves, 5); assert.equal(ten.minutes, 10);
  assert.deepEqual(ten.waveNames, ['First contact', 'They keep coming', 'The rush', 'Blackout', 'The run']);
  assert.equal(fifteen.duration, 900); assert.equal(fifteen.waves, 6); assert.ok(fifteen.waveNames.includes('Dead of night'));
  assert.equal(make({ minutes: 12 }).g.start().minutes, 10);
  assert.equal(make({ minutes: 14 }).g.start().minutes, 15);
  assert.equal(make({ short: true }).g.start().waves, 4);
  assert.equal(make({ mode: 'short' }).g.start().waves, 4);
  assert.equal(make({ short: true, minutes: 15 }).g.start().waves, 5);
  // the 15-minute cut: all six waves are played and the boss comes; the short one plays four
  const long = playOut({ minutes: 15 }, 1000);
  assert.deepEqual(sorted(long.waves), [1, 2, 3, 4, 5, 6]); assert.ok(long.bossSeen);
  assert.equal(long.s.result.waves, 6); assert.equal(long.s.result.minutes, 15);
  const sh = playOut({ short: true }, 700);
  assert.deepEqual(sorted(sh.waves), [1, 2, 3, 4]); assert.ok(sh.bossSeen); assert.equal(sh.s.result.won, true);
  // short waves are not bigger than the same wave in the full game, the 15-minute ones are bigger
  const sizeOf = o => { const all = new Set(); playOut({ ...o, options: { crowd: 20 } }, 150, q => { if (q.wave === 1) for (const z of q.z) all.add(z[0]); }); return all.size; };
  assert.ok(sizeOf({ short: true }) < sizeOf({}), 'short waves are smaller');
  assert.ok(sizeOf({ minutes: 15 }) > sizeOf({}), '15-minute waves are bigger');
});

test('kids: the start message says so (opt kids or theme kids), the rules stay the same', () => {
  const a = make({ kids: true }).g.start(), b = make({ theme: 'kids' }).g.start(), c = make().g.start();
  assert.equal(a.kids, true); assert.equal(a.theme, 'kids');
  assert.equal(b.kids, true);
  assert.equal(c.kids, false); assert.equal(c.theme, 'night');
  const k = playOut({ kids: true, fast: true }, 120);
  assert.equal(k.s.result.kids, true); assert.equal(k.s.result.won, true);
  assert.equal(k.g.results().kids, true);
});

test('players: the expected count fills the first chest and the first wave before anyone has joined', () => {
  const one = make().g.snapshot(), four = make({ players: 4 }).g.snapshot();
  assert.equal(one.drops.length, 3);
  assert.equal(four.drops.length, 6);
  const firstWave = o => { const { g, run } = make({ ...o, options: { crowd: 20 } }); let all = new Set(); run(RULES.intro + 25, q => { for (const z of q.z) all.add(z[0]); }); return all.size; };
  assert.ok(firstWave({ players: 1 }) < firstWave({ players: 6 }), 'more players expected, more zombies');
});

test('options: defaults, clamping, and each option changes the game', () => {
  assert.deepEqual(readOptions(), Object.fromEntries(OPTIONS.map(o => [o.id, o.default])));
  assert.deepEqual(readOptions({ boards: 99, crowd: -3, prep: '20', barrels: 'false', ammo: 1, nope: 1 }), { barrels: false, blackout: true, boards: 6, ammo: true, crowd: 6, prep: 20 });
  // barrels off: none by the paths
  assert.ok(make().g.start().bombs.length > 0);
  assert.equal(make({ options: { barrels: false } }).g.start().bombs.length, 0);
  // boards at start
  assert.ok(boardsOf(make({ options: { boards: 0 } }).g.snapshot()).every(b => b === 0));
  assert.ok(boardsOf(make({ options: { boards: 6 } }).g.snapshot()).every(b => b === 6));
  assert.equal(make({ options: { boards: 5 } }).g.start().gate.start, 5);
  // blackout off: the power never fails
  assert.deepEqual(make({ options: { blackout: false } }).g.start().darkWaves, []);
  assert.equal(playOut({ options: { blackout: false } }, 700).dark, 0);
  // prep: wave 1 starts after the chosen seconds
  {
    const { g, run } = make({ options: { prep: 15 } }); g.join('p1', { n: 1 }); g.pose('p1', poseAt());
    let at = 0; run(40, (q, now) => { if (!at && q.phase === 'wave') at = now; });
    assert.ok(Math.abs(at - 15000) <= 200, `wave 1 at ${at}`);
  }
  // crowd: never more alive at once than allowed
  {
    const { g, run } = make({ options: { crowd: 6 }, players: 6 });
    for (let i = 1; i <= 6; i++) { g.join(`p${i}`, { n: i }); g.pose(`p${i}`, poseAt(300 * i, 0)); }
    let most = 0; run(300, q => { most = Math.max(most, q.z.filter(z => z[6] !== STATE.dead).length); });
    assert.ok(most <= 6 && most >= 5, `most alive ${most}`);
  }
  // unlimited ammo: a chest gun never runs dry
  {
    const { g, run } = make({ options: { ammo: true } }); g.join('p1', { n: 1 }); g.pose('p1', poseAt());
    const s = run(1); const smg = s.drops.find(d => d[1] === 'smg');
    g.pose('p1', poseAt(smg[2], smg[3])); assert.ok(g.act('p1', { a: 'take', hand: 'r', d: smg[0] }).ok);
    assert.equal(g.snapshot().players[0].r[2], -1);
    let shots = 0; for (let i = 0; i < 2500 && !g.over; i++) { if (g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, -1], hits: [] }).ok) shots++; run(0.1); }
    assert.equal(g.snapshot().players[0]?.r[0] ?? 'smg', 'smg');
    assert.ok(shots > RULES.weapons.smg.mag + RULES.weapons.smg.reserve, `shots ${shots}`);
  }
});

test('pause: zombies, gates and every clock stand still, shots are refused; the paused time is given back', () => {
  const { g, run } = make({ options: { boards: 0 } });
  g.join('p1', { n: 1 }); g.pose('p1', poseAt());
  run(RULES.intro + 8);
  const before = g.snapshot();
  assert.equal(before.phase, 'wave'); assert.ok(before.z.length > 0);
  assert.equal(g.pause(true, 0), true);
  assert.equal(g.pause(true, 0), false, 'already paused');
  let s = run(30);
  assert.equal(s.paused, 1); assert.equal(g.paused, true);
  assert.deepEqual(s.z, before.z, 'nobody moved');
  assert.equal(s.left, before.left); assert.equal(s.wave, before.wave);
  assert.equal(s.players[0].hp, before.players[0].hp);
  assert.equal(g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [[before.z[0][0], 1, 1]] }).reason, 'paused');
  assert.equal(s.events.length, 0, 'old events age out while paused');
  assert.equal(g.pause(false, 0), true);
  s = run(2);
  assert.equal(s.paused, 0); assert.ok(s.left < before.left && s.left > before.left - 2.5, 'time runs again from where it stopped');
  assert.equal(g.act('p1', { a: 'shot', hand: 'r', o: [0, 1.2, 0], d: [0, 0, 1], hits: [] }).ok, true);
  // a whole fast game with a pause in the middle ends when the game time is used up, not the wall clock
  const { g: f, run: frun } = make({ fast: true });
  f.join('p1', { n: 1 }); f.pose('p1', poseAt(300, 300));
  frun(40); f.pause(true); frun(50); assert.equal(f.over, false); f.pause(false);
  frun(59); assert.equal(f.over, false); frun(5); assert.equal(f.over, true);
  assert.equal(f.results().extra.pauses, 1);
});

test('setDifficulty: live change, faster zombies at once, points weighted by the time on each level', () => {
  const { g, run } = make({ difficulty: 'easy' });
  g.join('p1', { n: 1 }); g.pose('p1', poseAtGate(g.start().gates[0]));      // nails boards in the prep: 5 points each
  run(10);
  assert.equal(g.snapshot().level, 'easy');
  assert.equal(g.setDifficulty('banana'), false);
  assert.equal(g.setDifficulty('easy'), false);
  const raw = g.snapshot().score;
  assert.ok(raw > 0, 'got points in the prep');
  assert.equal(g.results().score, Math.round(raw * RULES.levels.easy.score));
  assert.equal(g.setDifficulty('nightmare', 0), true);
  assert.ok(g.snapshot().events.some(e => e.k === 'level' && e.level === 'nightmare'));
  const s = run(10);
  assert.equal(s.level, 'nightmare'); assert.equal(g.level, 'nightmare');
  const m = (10 * RULES.levels.easy.score + 10 * RULES.levels.nightmare.score) / 20;
  assert.ok(Math.abs(g.results().score - Math.round(s.score * m)) <= 1, `${g.results().score} vs ${s.score} x ${m}`);
  assert.equal(g.results().difficulty, 'nightmare');
  // the zombies already walking speed up: same zombies, distance in one second before and after
  const { g: h, run: hrun } = make({ difficulty: 'easy' });
  h.join('p1', { n: 1 }); h.pose('p1', poseAt(300, 300));
  hrun(RULES.intro - 8);
  const at = () => new Map(h.snapshot().z.filter(z => z[6] === STATE.walk).map(z => [z[0], [z[3], z[4]]]));
  const moved = () => { const a = at(); hrun(1); const b = at(); const d = []; for (const [id, p] of a) { const q = b.get(id); if (q) d.push(Math.hypot(q[0] - p[0], q[1] - p[1])); } return d.reduce((x, y) => x + y, 0) / d.length; };
  const slow = moved(); h.setDifficulty('nightmare'); const quick = moved();
  assert.ok(quick > slow * 1.12, `easy ${slow.toFixed(3)} m/s, nightmare ${quick.toFixed(3)} m/s`);
});

test('stage boss: the boss comes at once from any phase, the rest fall; stage wave skips the prep', () => {
  const { g, run } = make();
  g.join('p1', { n: 1, name: 'Бот' }); g.pose('p1', poseAt());
  assert.equal(g.stage('nope'), false);
  run(3);
  assert.equal(g.stage('wave'), true);
  let s = run(0.3);
  assert.equal(s.phase, 'wave'); assert.equal(s.wave, 1);
  assert.equal(g.stage('wave'), false, 'not during a wave');
  run(6);
  assert.equal(g.stage('boss', 0), true);
  s = g.snapshot();
  assert.equal(s.phase, 'boss'); assert.equal(s.boss, 1);
  assert.ok(zombiesOf(s).filter(z => z.type !== 'boss').every(z => z.state === STATE.dead), 'the rest fell');
  assert.ok(s.events.some(e => e.k === 'stage' && e.s === 'boss'));
  assert.equal(g.stage('boss'), false, 'already here');
  const shoot = bot(g, 'p1');
  s = run(400, shoot);
  assert.equal(g.over, true); assert.equal(s.result.won, true); assert.equal(s.result.skipped, true);
  assert.equal(g.results().extra.skipped, true);
  assert.equal(g.stage('boss'), false, 'over');
});

test('respawn ramp: 5 s, plus 3 s per death already in this wave, at most 20 s; reset every wave; short guard after', () => {
  const { g, run } = make({ options: { boards: 0, crowd: 20 } });
  g.join('p1', { n: 1, name: 'А' }); g.join('p2', { n: 2, name: 'Б' });
  g.pose('p1', poseAt(0, 0)); g.pose('p2', poseAt(60, 60));      // the second stands far away: the group is never all down
  const downs = [], ups = [];
  let wave = 0, lastUp = -1e9, guardHit = 0, wipes = 0, seen = 0;
  run(420, (q, now) => {
    if (q.phase === 'wave' || q.phase === 'boss') wave = q.wave + (q.phase === 'boss' ? 100 : 0);
    for (const e of q.events) {
      if (e.i <= seen) continue;
      seen = e.i;
      if (e.k === 'chance') wipes++;
      if (e.p !== 'p1') continue;
      if (e.k === 'down') downs.push({ wave, t: e.t, at: now });
      if (e.k === 'up') { lastUp = now; ups.push(now); }
      if (e.k === 'bite' && now - lastUp < RULES.respawn.guard * 1000 - 100) guardHit++;
    }
  });
  assert.ok(downs.length >= 4, `downs ${downs.length}`);
  const byWave = new Map();
  for (const d of downs) { if (!byWave.has(d.wave)) byWave.set(d.wave, []); byWave.get(d.wave).push(d.t); }
  for (const [w, ts] of byWave) ts.forEach((t, k) => assert.equal(t, Math.min(20, 5 + 3 * k), `wave ${w}: ${ts}`));
  assert.ok([...byWave.values()].some(ts => ts.length >= 3), `a wave with several deaths: ${JSON.stringify([...byWave])}`);
  // the time actually spent down is the ramp (nobody near to help)
  if (!wipes) downs.forEach((d, i) => { if (ups[i]) assert.ok(Math.abs(ups[i] - d.at - d.t * 1000) <= 200, `down ${d.t}s, up after ${(ups[i] - d.at) / 1000}s`); });
  assert.equal(guardHit, 0, 'no bite in the guard after coming back');
  assert.ok(!g.over || g.snapshot().result.reason !== 'wiped');
});

test('results(): per-player kills, deaths and score mid-game and at the end, matching the final result', () => {
  const { g, run } = make({ fast: true, players: 2 });
  g.join('p1', { n: 1, name: 'А' }); g.join('p2', { n: 2, name: 'Б' });
  g.pose('p1', poseAt()); g.pose('p2', poseAt(0.5, 0));
  const s1 = bot(g, 'p1'), s2 = bot(g, 'p2');
  run(30, q => { s1(q); s2(q); });
  let r = g.results();
  assert.deepEqual(Object.keys(r).sort(), ['difficulty', 'durationMs', 'extra', 'kids', 'level', 'minutes', 'players', 'score', 'short', 'won']);
  assert.equal(r.won, false); assert.equal(r.extra.over, false); assert.equal(r.difficulty, 'normal');
  assert.ok(Math.abs(r.durationMs - 30000) <= 100, `durationMs ${r.durationMs}`);
  assert.equal(r.players.length, 2);
  for (const p of r.players) {
    assert.deepEqual(Object.keys(p).sort(), ['deaths', 'extra', 'id', 'kills', 'n', 'name', 'score']);
    assert.deepEqual(Object.keys(p.extra).sort(), ['accuracy', 'boards', 'headshots', 'hits', 'shots']);
  }
  assert.equal(r.players[0].id, 'p1'); assert.equal(r.players[1].name, 'Б');
  assert.equal(r.players[0].kills + r.players[1].kills, g.snapshot().kills);
  const s = run(200, q => { s1(q); s2(q); });
  assert.equal(g.over, true);
  r = g.results();
  assert.equal(r.score, s.result.score); assert.equal(r.won, s.result.won); assert.equal(r.extra.stars, s.result.stars);
  for (const p of r.players) { const q = s.result.players.find(x => x.id === p.id); assert.equal(p.score, q.score); assert.equal(p.kills, q.kills); assert.equal(p.deaths, q.downs); }
  assert.equal(r.extra.reason, s.result.reason); assert.ok(r.extra.boss);
});

test('manifest 3.0.0: cuts, modes, options, stages and scorecard match the rules', async () => {
  const fs = await import('node:fs');
  const m = JSON.parse(fs.readFileSync(new URL('./motel.game.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '3.0.0');
  assert.deepEqual(m.cuts, RULES.cuts);
  assert.ok(m.cuts.includes(m.minutes));
  assert.deepEqual(m.options, OPTIONS.map(o => ({ ...o })));
  assert.equal(m.modes.filter(x => x.recommended).length, 1);
  assert.ok(m.modes.some(x => x.id === 'short'));
  for (const [area, [lo, hi]] of Object.entries(m.players)) { assert.match(area, /^\d+x\d+$/); assert.ok(lo >= m.minPlayers && hi <= m.maxPlayers && lo <= hi); }
  assert.ok(Array.isArray(m.minArea) && m.minArea.length === 2);
  assert.deepEqual(m.levels.map(l => l.id), Object.keys(RULES.levels));
  assert.deepEqual(m.scorecard.columns, ['score', 'kills', 'deaths']);
  for (const st of m.stages) { const { g } = make(); g.join('p1', { n: 1 }); assert.equal(g.stage(st.id), true, st.id); }
  const r = make().g.results();
  for (const c of m.scorecard.columns) assert.ok(c in r.players.concat([{ score: 0, kills: 0, deaths: 0 }])[0], c);
});

test('the dev-page console commands do not exist outside the dev server', () => {
  const { g, run } = make();
  g.join('p1', { n: 1 }); g.pose('p1', poseAt());
  run(1);
  assert.equal(g.act('p1', { a: 'dev', op: 'pause', on: 1, hand: 'r' }).ok, false);
  assert.equal(g.act('p1', { a: 'dev', op: 'stage', name: 'boss', hand: 'r' }).ok, false);
  assert.equal(g.paused, false); assert.equal(g.snapshot().phase, 'intro');
});

"""The Back Room 1.1: tests. Run from lobby-stage."""
import io

p = 'game/backroom.test.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("for (const old of ['grill', 'fryer', 'mixer', 'burner', 'packer', 'grow'])", "for (const old of ['grill', 'fryer', 'burner', 'packer'])")
rep("    for (const p of [...(s.slots || []), ...(s.btn ? [s.btn] : [])]) {", "    for (const p of [...(s.slots || []), ...(s.btn ? [s.btn] : []), ...(s.taps || [])]) {")
rep("      assert.ok(p.y >= 0.6 && p.y <= 1.5,", "      assert.ok(p.y >= 0.45 && p.y <= 1.6,")
rep("      assert.ok(k.drop(k.slot('drinks', c.order.drink === 'cola' ? 0 : 1)).ok, 'чашата застава под чучура');\n      k.run(M.RULES.pour + 0.3);\n",
    "      const tap = c.order.drink === 'cola' ? 0 : 1;\n"
    "      assert.ok(k.drop(k.slot('drinks', tap)).ok, 'чашата застава под чучура');\n"
    "      k.run(1);\n"
    "      assert.equal(k.item('cup').state.fill, 0, 'нищо не се налива само');\n"
    "      k.at(k.by.drinks.taps[tap]);\n"
    "      assert.ok(k.act({ a: 'use', station: 'drinks', control: tap }).ok, 'кранчето се натиска с ръка');\n"
    "      assert.equal(k.item('cup').state.pour, 1, 'тече');\n"
    "      k.run(M.RULES.pour + 0.3);\n")
rep("  assert.ok(!/грубиян|пода под|товар/i.test(hint), `подсказката в детската тема: ${hint}`);\n  assert.ok(/достав/i.test(hint), 'вечер идва доставчик');",
    "  assert.ok(!/rude|floor under|load/i.test(hint), `подсказката в детската тема: ${hint}`);\n  assert.ok(/courier/i.test(hint), 'вечер идва доставчик');")

s += r'''

// ───────── 1.1: сосове и добавки, кранчета, тайният шкаф, растенията, блендерите, купувачите ─────────

test('пицарията: три соса, нови добавки и пици от менюто; сосът е първи и е един', () => {
  const k = play({ skipTo: 'day' });
  for (const b of ['sauce', 'white', 'mustard', 'cheese', 'veg', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion']) assert.ok(k.by[`bin_${b}`], `има откъде да се вземе ${b}`);
  assert.ok(k.take('pizza').ok);
  assert.ok(k.drop(k.slot('prep', 0)).ok);
  const put = t => { assert.ok(k.take(t).ok, `взима се ${t}`); k.drop({ ...k.slot('prep', 0), y: k.slot('prep', 0).y + 0.05 }); };
  put('shrimp');
  assert.deepEqual(k.item('pizza').state.stack, [], 'без сос нищо не ляга');
  k.drop(k.slot('trash', 0));
  put('white'); put('cheese'); put('shrimp');
  assert.deepEqual(k.item('pizza').state.stack, ['white', 'cheese', 'shrimp']);
  put('mustard');
  assert.equal(k.item('pizza').state.stack.length, 3, 'втори сос не ляга');
  // поръчките са само от менюто
  const seen = new Set();
  const g = M.createGame({ ...ZONE, theme: 'night', skipTo: 'day', seed: 11, now: 0, fast: true });
  g.join(P, { n: 1, name: 'Проба' });
  for (let t = 0; t < 400000; t += 100) { g.tick(t); for (const c of g.snapshot().customers) if (c.order.kind === 'pizza') seen.add(c.order.stack.join('+')); }
  assert.ok(seen.size >= 4, `поръчват се различни пици: ${[...seen].join(', ')}`);
  for (const key of seen) assert.ok(M.SAUCES.includes(key.split('+')[0]), `пицата започва със сос: ${key}`);
});

test('кранче без чаша: тече напразно, без грешка', () => {
  const k = play({ skipTo: 'day' });
  k.at(k.by.drinks.taps[0]);
  const r = k.act({ a: 'use', station: 'drinks', control: 0 });
  assert.ok(r.ok && r.spill);
  assert.ok(k.snap().events.some(e => e.kind === 'spill'));
});

/** Слиза в мазето с асансьора. */
function goDown(k) {
  const e = k.by.elevator;
  k.stand(e.x, e.z);
  assert.ok(k.act({ a: 'use', station: 'elevator' }).ok, 'асансьорът тръгва');
  k.run(M.RULES.elevator.doors * 2 + M.RULES.elevator.travel + 0.5);
  assert.equal(k.snap().players[0].level, 1, 'играчът е в мазето');
}
const stashOf = k => k.snap().stations.find(s => s.id === 'stash').state;
function openStash(k) {
  k.at(k.by.stash.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'stash', control: 0 }).ok, 'дръжката се натиска');
  k.run(M.RULES.lab.door + 0.2);
  assert.equal(stashOf(k).open, 1, 'шкафът е отворен');
}

test('мазето е отворено от първия ден; тайният шкаф е в обсега, отваря се и вътре има синя колба', () => {
  const k = play({ skipTo: 'day' });
  for (const id of ['stash', 'grow', 'bench']) assert.ok(k.by[id] && k.by[id].level === 1, `има ${id} в мазето`);
  goDown(k);
  const blue = k.item('blue');
  assert.ok(blue && blue.slot && blue.slot.startsWith('stash.'), 'синята колба е на рафта');
  assert.equal(k.grab(blue).reason, 'stashShut', 'затвореният шкаф не дава нищо');
  openStash(k);
  assert.ok(k.grab(k.item('blue')).ok, 'колбата се взима');
  // всяко място за действие на шкафа е до 25 см зад ръба на зоната
  for (const p of [...k.by.stash.slots, ...k.by.stash.taps]) assert.ok(Math.abs(p.x) <= 1.2 + 0.001, `мястото е в зоната: ${p.x}`);
});

test('магазинът: празно място на рафта поръчва, парите се взимат, стоката идва на рафта', () => {
  const k = play({ skipTo: 'day' });
  goDown(k);
  openStash(k);
  const i = k.by.stash.shelf.indexOf('papers');
  k.at(k.by.stash.taps[i + 1]);
  assert.equal(k.act({ a: 'use', station: 'stash', control: i + 1 }).reason, 'noMoney', 'без пари няма поръчка');
  k.g.debug.cash(50);
  assert.ok(k.act({ a: 'use', station: 'stash', control: i + 1 }).ok, 'поръчката е приета');
  assert.equal(k.snap().money, 50 - M.RULES.shop.papers);
  assert.equal(k.act({ a: 'use', station: 'stash', control: i + 1 }).reason, 'shelfFull', 'втора поръчка за същото място не минава');
  k.run(M.RULES.shop.delay + 0.3);
  const papers = k.item('papers');
  assert.ok(papers && papers.slot === `stash.${i}`, 'хартийките са на рафта си');
});

test('тревата: растение от саксията, в резачката става на пъпки, с хартийки става на джойнт, семената растат', () => {
  const k = play({ skipTo: 'day' });
  goDown(k);
  const pot = k.slot('grow', 0);
  k.at(pot);
  assert.ok(k.act({ a: 'take', station: 'grow' }).ok, 'растението се вади');
  assert.equal(k.item('plant').holder, P);
  assert.ok(k.drop(k.slot('bench', 0)).ok, 'растението влиза в резачката');
  k.at(k.by.bench.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'bench', control: 0 }).ok, 'резачката тръгва');
  assert.equal(k.grab(k.item('plant')).reason, 'wait', 'докато върти, не се бърка вътре');
  k.run(M.RULES.lab.shred + 0.3);
  assert.ok(!k.item('plant') && k.item('buds'), 'от растението са станали пъпки');
  // хартийки от магазина и джойнт
  k.g.debug.cash(50);
  openStash(k);
  const i = k.by.stash.shelf.indexOf('papers'), j = k.by.stash.shelf.indexOf('seeds');
  k.at(k.by.stash.taps[i + 1]); assert.ok(k.act({ a: 'use', station: 'stash', control: i + 1 }).ok);
  k.at(k.by.stash.taps[j + 1]); assert.ok(k.act({ a: 'use', station: 'stash', control: j + 1 }).ok);
  k.run(M.RULES.shop.delay + 0.3);
  assert.ok(k.grab(k.item('papers')).ok);
  const buds = k.item('buds');
  assert.equal(k.drop({ x: buds.x, y: buds.y + 0.05, z: buds.z }).rule, 6, 'хартийките до пъпките правят джойнт');
  assert.ok(k.item('joint') && !k.item('buds') && !k.item('papers'));
  // семената: в празната саксия, расте ново растение
  assert.ok(k.grab(k.item('seeds')).ok);
  assert.ok(k.drop(pot).ok, 'семената влизат в саксията');
  assert.ok(k.snap().stations.find(s => s.id === 'grow').state.pots[0] > 0, 'нещо расте');
  k.at(pot);
  const other = k.snap().stations.find(s => s.id === 'grow').state.pots[1];
  assert.equal(other, 1, 'втората саксия е с готово растение');
  k.run(M.RULES.lab.grow + 0.5);
  assert.equal(k.snap().stations.find(s => s.id === 'grow').state.pots[0], 1, 'порасна');
});

test('миксерът: две различни течности правят стока; разклатената синя колба дава чиста; две еднакви се похабяват', () => {
  const k = play({ skipTo: 'day' });
  goDown(k);
  openStash(k);
  const mix = k.slot('bench', 1), over = { x: mix.x, y: mix.y + 0.2, z: mix.z };
  assert.ok(k.grab(k.item('blue')).ok);
  assert.ok(k.act({ a: 'shake' }).ok, 'колбата се разклаща');
  assert.equal(k.item('blue').state.shake, 1);
  assert.equal(k.drop(over).rule, 7, 'синьото се излива в миксера');
  k.at(k.by.bench.taps[1]);
  assert.equal(k.act({ a: 'use', station: 'bench', control: 1 }).reason, 'needTwo');
  assert.ok(k.grab(k.item('clear')).ok);
  assert.equal(k.drop(over).rule, 7);
  k.at(k.by.bench.taps[1]);
  assert.ok(k.act({ a: 'use', station: 'bench', control: 1 }).ok, 'миксерът тръгва');
  k.run(M.RULES.lab.mix + 0.3);
  const ice = k.item('ice');
  assert.ok(ice && ice.state.pure === 1 && ice.slot === 'bench.1', 'излиза чист син лед');
  // две еднакви: нищо
  k.g.debug.cash(100);
  const r = k.by.stash.shelf.indexOf('red');
  assert.ok(k.grab(k.item('ice')).ok, 'готовата стока се взима от миксера');
  assert.ok(k.drop(k.slot('stash', 5)).ok, 'и се прибира на свободен рафт');
  for (let n = 0; n < 2; n++) {
    k.at(k.by.stash.taps[r + 1]); assert.ok(k.act({ a: 'use', station: 'stash', control: r + 1 }).ok);
    k.run(M.RULES.shop.delay + 0.3);
    assert.ok(k.grab(k.item('red')).ok);
    assert.equal(k.drop(over).rule, 7);
  }
  k.at(k.by.bench.taps[1]);
  assert.ok(k.act({ a: 'use', station: 'bench', control: 1 }).ok);
  k.run(M.RULES.lab.mix + 0.3);
  assert.ok(!k.item('pills') && !k.item('powder') && k.snap().stations.find(s => s.id === 'bench').state.mixing === 0, 'две еднакви течности не правят нищо');
  assert.equal(k.snap().stations.find(s => s.id === 'bench').state.mix.length, 0, 'миксерът е празен');
});

test('купувачът иска стока от мазето и плаща добре; при проверката затвореният шкаф крие всичко', () => {
  const g = M.createGame({ ...ZONE, theme: 'night', skipTo: 'day', seed: 5, now: 0 });
  assert.ok(g.debug.lab().on, 'лабораторията я има');
  // затвореният шкаф: колбите вътре не са улики
  const h = M.createGame({ ...ZONE, theme: 'night', skipTo: 'raid', seed: 5, now: 0, fast: true });
  h.join(P, { n: 1, name: 'Проба' });
  h.debug.cash(100);
  let t = 0;
  while (!h.over && t < 4e6) { t += 100; h.tick(t); }
  assert.equal(h.snapshot().result.money, 100, 'нищо не е намерено: парите са цели');
  // детската тема: няма лаборатория
  const kd = M.createGame({ ...ZONE, theme: 'kids', now: 0 });
  assert.ok(!kd.start().stations.some(s => ['stash', 'grow', 'bench'].includes(s.kind)), 'в детската тема няма таен шкаф');
  assert.ok(kd.start().stations.some(s => s.kind === 'hopper'), 'там си остава казанът');
  // продажба: клиент-купувач получава стоката си
  const k = play({ skipTo: 'day', seed: 2 });
  goDown(k);
  const pot = k.slot('grow', 0);
  k.at(pot); assert.ok(k.act({ a: 'take', station: 'grow' }).ok);
  assert.ok(k.drop(k.slot('bench', 0)).ok);
  k.at(k.by.bench.taps[0]); assert.ok(k.act({ a: 'use', station: 'bench', control: 0 }).ok);
  k.run(M.RULES.lab.shred + 0.3);
  assert.ok(k.grab(k.item('buds')).ok);
  const e = k.by.elevator_1;
  k.stand(e.x, e.z);
  assert.ok(k.act({ a: 'use', station: 'elevator_1' }).ok);
  k.run(M.RULES.elevator.doors * 2 + M.RULES.elevator.travel + 0.5);
  assert.equal(k.snap().players[0].level, 0);
  let sold = false;
  for (let i = 0; i < 600 && !sold; i++) {
    k.stand(0, 0); k.run(0.5);
    const s = k.snap();
    if (s.phase !== 'day') break;
    const c = s.customers.find(x => x.state === 'wait' && x.order.kind === 'stuff' && x.order.item === 'buds');
    if (!c) continue;
    assert.equal(c.buyer, true);
    const before = s.money;
    assert.ok(k.drop(k.slot('counter', c.seat)).ok);
    assert.ok(k.snap().money - before >= M.RULES.sell.buds, 'купувачът плаща');
    sold = true;
  }
  assert.ok(sold, 'през деня дойде купувач за пъпките');
});
'''
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tests patched')

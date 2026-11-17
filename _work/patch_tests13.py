"""The Back Room 1.3, tests. Run from lobby-stage."""
import io

p = 'game/backroom.test.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("// Checks of \"The Back Room\" 1.2: a pizzeria by day, a lab in the cellar by night.", "// Checks of \"The Back Room\" 1.3: a lab in the cellar by night, a pizzeria and the street by day.")
# both hands
rep("  let now = 0, head = [0, 1.6, 0], hr = [0, 0, 0], qr = Q;", "  let now = 0, head = [0, 1.6, 0], hr = [0, 0, 0], hl = [0, 0, 0], qr = Q;")
rep("  const send = () => g.pose(P, [...head, ...Q, 0, 0, 0, ...Q, ...hr, ...qr]);", "  const send = () => g.pose(P, [...head, ...Q, ...hl, ...Q, ...hr, ...qr]);")
rep("    at(p) { hr = [p.x, p.y, p.z]; head = [p.x, 1.6, p.z]; send(); },",
    "    at(p) { hr = [p.x, p.y, p.z]; head = [p.x, 1.6, p.z]; send(); },\n"
    "    atL(p) { hl = [p.x, p.y, p.z]; send(); },\n"
    "    actL: m => g.act(P, { hand: 'l', ...m }),\n"
    "    /** by day: the OPEN button on the counter */\n"
    "    open() { k.at(by.shutter.btn); return k.act({ a: 'use', station: 'shutter' }); },\n"
    "    level: () => g.snapshot().players[0].level,")
rep("""    ride() {
      const lv = g.snapshot().players[0].level, e = by.elevator;
      k.stand(e.x, e.z);
      assert.ok(k.act({ a: 'use', station: lv ? 'elevator_1' : 'elevator' }).ok, 'the lift starts');
      k.run(M.RULES.elevator.doors * 2 + M.RULES.elevator.travel + 0.5);
      assert.equal(g.snapshot().players[0].level, 1 - lv, 'the player is on the other floor');
    },""", """    ride(to) {
      const lv = g.snapshot().players[0].level, e = by.elevator;
      k.stand(e.x, e.z);
      assert.ok(k.act({ a: 'use', station: ['elevator', 'elevator_1', 'elevator_2'][lv], ...(to === undefined ? {} : { to }) }).ok, 'the lift starts');
      k.run(M.RULES.elevator.doors * 2 + M.RULES.elevator.travel + 0.5);
      assert.equal(g.snapshot().players[0].level, to === undefined ? (lv === 0 ? 1 : 0) : to, 'the player is at the other stop');
    },""")
# the zone
rep("  for (const id of ['stash', 'grow', 'bench', 'screen', 'screen_1', 'bin_blue', 'bin_clear', 'bin_red', 'bin_papers', 'bin_seeds', 'bin_box']) assert.ok(by[id], `there is ${id}`);",
    "  for (const id of ['stash', 'grow', 'bench', 'screen', 'screen_1', 'bin_blue', 'bin_clear', 'bin_red', 'bin_green', 'bin_yellow', 'bin_papers', 'bin_seeds', 'bin_box', 'bin_tray',\n"
    "    'elevator_2', 'way_2_3', 'way_3_2', 'way_3_4', 'way_4_3', 'spot_2_0', 'spot_3_0', 'spot_4_0']) assert.ok(by[id], `there is ${id}`);\n"
    "  assert.ok(by.shutter.btn, 'the shop has an OPEN button');\n"
    "  assert.equal(st.levels, 5, 'the shop, the cellar and three blocks of the street');\n"
    "  assert.deepEqual(st.street.map(b => b.level), [2, 3, 4]);\n"
    "  const boxes = st.stations.filter(q => q.level === 1 && q.kind === 'bin').map(q => [q.id, q.y, q.z]);\n"
    "  for (const a of boxes) for (const b of boxes) if (a !== b) assert.ok(a[1] !== b[1] || Math.abs(a[2] - b[2]) > 0.3, `${a[0]} and ${b[0]} share a place on the rack`);")
# the clock
rep("test('the clock: an evening of training, then night, day, night, day and the inspection', () => {", "test('the clock: an evening of training, a night of five minutes, a day of six; two days when asked', () => {")
rep("  assert.deepEqual(seen.map(x => x[0]), ['tutorial', 'night', 'day', 'night2', 'day2', 'raid', 'over']);",
    "  assert.deepEqual(seen.map(x => x[0]), ['tutorial', 'night', 'day', 'over']);\n"
    "  assert.equal(M.RULES.phases.night, 300);\n"
    "  assert.equal(M.RULES.phases.day, 360);\n"
    "  const two = M.createGame({ ...ZONE, now: 0, fast: true, days: 2 });\n"
    "  two.join(P, { n: 1, name: 'Test' });\n"
    "  const seen2 = [];\n"
    "  for (let u = 0; !two.over && u < 4e6; u += 100) { two.tick(u); const q = two.snapshot().phase; if (seen2[seen2.length - 1] !== q) seen2.push(q); }\n"
    "  assert.deepEqual(seen2, ['tutorial', 'night', 'day', 'night2', 'day2', 'over']);")
rep("""test('night: the shop is shut and nobody comes; by day they come again', () => {
  const k = play({ skipTo: 'night' });
  k.run(30);
  assert.equal(k.snap().customers.length, 0);
  assert.equal(k.dyn('shutter').open, 0, 'the shutter is down');
  const d = play({ skipTo: 'day' });
  d.run(8);
  assert.ok(d.snap().customers.length > 0);
});""", """test('the shop is opened by hand: nobody comes at night, and by day only after the OPEN button', () => {
  const k = play({ skipTo: 'night' });
  k.run(30);
  assert.equal(k.snap().customers.length, 0);
  assert.equal(k.dyn('shutter').open, 0, 'the shutter is down');
  assert.equal(k.open().reason, 'nightShop');
  const d = play({ skipTo: 'day' });
  d.run(20);
  assert.equal(d.snap().customers.length, 0, 'the day came, the shop is still shut');
  assert.equal(d.snap().shop, false);
  assert.equal(d.snap().goal.station, 'shutter', 'the goal points at the button');
  assert.ok(d.open().ok);
  d.run(8);
  assert.ok(d.snap().customers.length > 0, 'now they come');
  assert.ok(d.dyn('shutter').open > 0.9);
  assert.equal(d.snap().goal.station, 'counter');
  assert.ok(d.open().ok, 'pressed again: shut');
  d.run(6);
  assert.equal(d.snap().customers.filter(c => c.state === 'wait').length, 0, 'the customers left');
});""")
rep("  const k = play({ skipTo: 'day', seed: 3 });\n  let done = false;", "  const k = play({ skipTo: 'day', seed: 3 });\n  assert.ok(k.open().ok);\n  let done = false;")
rep("  g.join(P, { n: 1, name: 'Test' });\n  for (let t = 0; t < 300000; t += 100) { g.tick(t);", "  g.join(P, { n: 1, name: 'Test' });\n  g.debug.open();\n  for (let t = 0; t < 300000; t += 100) { g.tick(t);")
rep("  const k = play({ skipTo: 'day', seed });\n  for (let i = 0; i < 900; i++) {", "  const k = play({ skipTo: 'day', seed });\n  assert.ok(k.open().ok);\n  for (let i = 0; i < 1500; i++) {")
rep("  for (const skipTo of ['night', 'day', 'night2', 'day2', 'raid']) {", "  for (const skipTo of ['night', 'day']) {")
rep("  assert.ok(!st.stations.some(s => ['stash', 'grow', 'bench', 'screen'].includes(s.kind)));", "  assert.ok(!st.stations.some(s => ['stash', 'grow', 'bench', 'screen', 'way', 'spot'].includes(s.kind)));\n  assert.equal(st.levels, 2);")
# weed: rolled by shaking both hands
rep("""  assert.ok(k.take('papers').ok, 'papers from the rack');
  const b = k.item('buds');
  assert.equal(k.drop({ x: b.x, y: b.y + 0.05, z: b.z }).rule, 6, 'papers next to the bud roll a joint');
  assert.ok(k.item('joint') && !k.item('buds') && !k.item('papers'));""",
    """  // papers in the right hand, the bud in the left, both shaken close together: a joint
  const b = k.item('buds');
  k.atL(b);
  assert.ok(k.actL({ a: 'grab', item: b.id }).ok, 'the bud is in the left hand');
  assert.ok(k.take('papers').ok, 'papers from the rack are in the right hand');
  k.at({ x: 0, y: 1.2, z: 0 }); k.atL({ x: 0.9, y: 1.2, z: 0 });
  assert.equal(k.act({ a: 'shake' }).reason, 'rollClose', 'hands apart: nothing');
  k.atL({ x: 0.2, y: 1.2, z: 0 });
  assert.ok(k.act({ a: 'shake' }).rolled, 'shaken together: rolled');
  const j = k.item('joint');
  assert.ok(j && j.holder === P && !k.item('buds') && !k.item('papers'), 'the joint is in the hand, the rest is used up');
  k.drop(k.slot('trash_lab', 0));""")
rep("  assert.deepEqual(k.item('blue').state.c, [100, 0, 0]);\n  k.at({ x: m.x, y: m.y + 0.3, z: m.z }); k.run(1);\n  assert.deepEqual(k.dyn('bench').mix, [0, 0, 0], 'upright: nothing runs');",
    "  assert.deepEqual(k.item('blue').state.c, [100, 0, 0, 0, 0]);\n  k.at({ x: m.x, y: m.y + 0.3, z: m.z }); k.run(1);\n  assert.deepEqual(k.dyn('bench').mix, [0, 0, 0, 0, 0], 'upright: nothing runs');")
rep("  assert.deepEqual(k.item('blue').state.c, [100, 0, 0], 'tilted over nothing: nothing is lost');", "  assert.deepEqual(k.item('blue').state.c, [100, 0, 0, 0, 0], 'tilted over nothing: nothing is lost');")
# the mixer: more recipes, and it sleeps by day
rep("  assert.ok(!w.item('ice') && !w.item('powder') && !w.item('pills'), 'wrong shares give nothing');\n  assert.equal(w.snap().players[0].mistakes, 1);\n});",
    """  assert.ok(!w.item('ice') && !w.item('powder') && !w.item('pills'), 'wrong shares give nothing');
  assert.equal(w.snap().players[0].mistakes, 1);
});

/** Pours the named liquids for the given seconds each and starts the mixer. */
function brew(k, parts) {
  const m = k.by.bench.taps[2];
  for (const [kind, sec] of parts) {
    if (!k.dyn(`bin_${kind}`).stock) { k.g.debug.cash(50); assert.ok(k.act({ a: 'buy', kind }).ok); k.run(M.RULES.shop.delay + 0.3); }
    assert.ok(k.take(kind).ok, `${kind} is taken`);
    k.pour(m, sec);
    k.drop(k.slot('trash_lab', 0));
  }
  k.at(k.by.bench.taps[1]);
  return k.act({ a: 'use', station: 'bench', control: 1 });
}

test('more recipes: three liquids make crystal, catalyst and syrup base make candy, acid and syrup base make syrup', () => {
  assert.deepEqual(Object.keys(M.RECIPES), ['ice', 'pills', 'powder', 'crystal', 'candy', 'syrup']);
  for (const r of Object.values(M.RECIPES)) assert.ok(Math.abs(r.ideal.reduce((a, v) => a + v, 0) - 1) < 1e-9 && r.ideal.length === 5);
  const k = play({ skipTo: 'night' });
  k.ride();
  assert.ok(brew(k, [['blue', 1.33], ['clear', 1], ['green', 1]]).ok);
  k.run(M.RULES.lab.mix + 0.3);
  assert.ok(k.item('crystal'), `40 blue, 30 solvent, 30 acid: crystal (${JSON.stringify(k.snap().items.map(i => i.kind))})`);
  const c = play({ skipTo: 'night' });
  c.ride();
  assert.ok(brew(c, [['red', 1], ['yellow', 1]]).ok);
  c.run(M.RULES.lab.mix + 0.3);
  assert.ok(c.item('candy'));
  const y = play({ skipTo: 'night' });
  y.ride();
  assert.ok(brew(y, [['green', 0.8], ['yellow', 1.2]]).ok);
  y.run(M.RULES.lab.mix + 0.3);
  assert.ok(y.item('syrup'));
});

test('by day the machines of the cellar sleep', () => {
  const k = play({ skipTo: 'day' });
  k.ride();
  k.at(k.by.bench.taps[1]);
  assert.equal(k.act({ a: 'use', station: 'bench', control: 1 }).reason, 'labDay');
  k.at(k.by.bench.taps[0]);
  assert.equal(k.act({ a: 'use', station: 'bench', control: 0 }).reason, 'labDay');
  assert.equal(k.dyn('bench').on, false);
});""")
# the old police and buyer tests go; the street, the effects, the goals come
i = s.index("test('the police patrol: announced a minute ahead;")
s = s[:i] + r'''test('no police for now: a whole day with product upstairs and nothing is taken', () => {
  const k = play({ skipTo: 'day' });
  const id = k.g.debug.give('ice', 0);
  let seen = false;
  for (let i = 0; i < 700; i++) { k.run(0.5); if (k.snap().patrol) seen = true; }
  assert.equal(seen, false, 'no patrol ever');
  assert.ok(k.snap().items.some(i => i.id === id) || k.g.over, 'the packet is still there');
});

/** In the street: waits for a buyer on the player's block and returns him. */
function buyer(k, block) {
  k.g.debug.walker(block);
  k.run(M.RULES.street.walk + 0.4);
  const b = k.snap().buyers.find(x => x.level === 2 + block && x.state === 'wait');
  assert.ok(b, `a buyer waits in block ${block}`);
  return b;
}
/** A packet of the kind appears in the right hand. */
function give(k, kind) {
  const id = k.g.debug.give(kind, k.level());
  assert.ok(k.grab(k.snap().items.find(i => i.id === id)).ok);
}

test('the street: the lift has a third stop by day, buyers stand outside the zone and pay from hand to hand', () => {
  const n = play({ skipTo: 'night' });
  const e = n.by.elevator;
  n.stand(e.x, e.z);
  assert.equal(n.act({ a: 'use', station: 'elevator', to: 2 }).reason, 'streetNight');
  const k = play({ skipTo: 'day' });
  assert.equal(k.snap().customers.some(c => c.buyer), false, 'nobody asks for product at the counter any more');
  k.ride(2);
  const b = buyer(k, 0);
  assert.ok(M.RULES.sell[b.want] > 0, `he wants something that exists: ${b.want}`);
  const other = b.want === 'ice' ? 'pills' : 'ice';
  give(k, other);
  const before = k.snap().money;
  assert.notEqual(k.drop(b.hand).rule, 9, 'the wrong packet is not taken');
  assert.equal(k.snap().money, before);
  assert.ok(k.item(other), 'it is not lost');
  give(k, b.want);
  assert.equal(k.drop(b.hand).rule, 9, 'the right one goes from hand to hand');
  const got = k.snap().money - before;
  assert.ok(got >= M.RULES.sell[b.want], `it pays: ${got}`);
  assert.equal(k.snap().sold, 1);
  assert.equal(k.snap().buyers.find(x => x.id === b.id).state, 'happy');
  // out of reach of every buyer the packet just lies on the ground and stays
  give(k, 'joint');
  k.drop({ x: 0, y: 0.5, z: 0 });
  k.run(M.RULES.poof + 2);
  assert.ok(k.item('joint'));
});

test('walking the town: the signpost at the end of a block leads to the next one, farther blocks pay more', () => {
  const k = play({ skipTo: 'day' });
  k.ride(2);
  const w = k.by.way_2_3;
  k.at({ x: 0, y: 1.2, z: -2 });
  assert.equal(k.act({ a: 'use', station: w.id }).reason, 'far', 'the signpost is at the far end');
  k.at(w.btn);
  assert.ok(k.act({ a: 'use', station: w.id }).ok);
  assert.equal(k.level(), 3);
  assert.ok(k.snap().events.some(ev => ev.kind === 'moved' && ev.to === 3));
  assert.ok(Math.abs(k.by.way_3_4.btn.z - k.by.way_3_2.btn.z) > 3, 'the way on is at the other end of the zone: the block is walked');
  k.at(k.by.way_3_4.btn);
  assert.ok(k.act({ a: 'use', station: 'way_3_4' }).ok);
  assert.equal(k.level(), 4);
  const b = buyer(k, 2);
  give(k, b.want);
  const before = k.snap().money;
  assert.equal(k.drop(b.hand).rule, 9);
  assert.ok(k.snap().money - before >= M.RULES.sell[b.want] * M.RULES.street.blocks[2].bonus - 1, 'the park pays one and a half times');
  // what is held goes along; the way back: the two signposts, then the lift
  give(k, 'ice');
  k.at(k.by.way_4_3.btn); assert.ok(k.act({ a: 'use', station: 'way_4_3' }).ok);
  k.at(k.by.way_3_2.btn); assert.ok(k.act({ a: 'use', station: 'way_3_2' }).ok);
  assert.equal(k.level(), 2);
  assert.equal(k.item('ice').level, 2);
  assert.equal(k.act({ a: 'use', station: 'elevator_2' }).reason, 'enterCabin');
  k.ride();
  assert.equal(k.level(), 0, 'from the street the lift goes home to the shop');
  assert.equal(k.item('ice').level, 0);
});

test('taking the product: it has to be at the mouth; each one gives its effect for a while', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  give(k, 'buds');
  k.at({ x: 0, y: 1.53, z: 0 });
  assert.equal(k.act({ a: 'consume' }).reason, 'rollFirst');
  k.drop(k.slot('trash_lab', 0));
  give(k, 'ice');
  k.at({ x: 0, y: 1.0, z: 0 });
  assert.equal(k.act({ a: 'consume' }).reason, 'far', 'not at the mouth');
  k.at({ x: 0, y: 1.53, z: 0 });
  assert.equal(k.act({ a: 'consume' }).fx, 'rush');
  assert.ok(!k.item('ice'));
  const fx = k.snap().players[0].fx;
  assert.ok(fx && fx.kind === 'rush' && fx.left > 40);
  assert.ok(k.snap().events.some(e => e.kind === 'high'));
  // rush: the shredder runs twice as fast
  k.at(k.slot('grow', 0));
  assert.ok(k.act({ a: 'take', station: 'grow' }).ok);
  k.drop(k.slot('bench', 0));
  k.at(k.by.bench.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'bench', control: 0 }).ok);
  k.run(M.RULES.lab.shred / 2 + 0.3);
  assert.ok(k.item('buds'), 'the buds are out in half the time');
  k.run(60);
  assert.equal(k.snap().players[0].fx, null, 'it wears off');
  // focus: a batch that was not shaken still comes out pure
  const f = play({ skipTo: 'night' });
  f.ride();
  give(f, 'powder');
  f.at({ x: 0, y: 1.53, z: 0 });
  assert.equal(f.act({ a: 'consume' }).fx, 'focus');
  assert.ok(batch(f, 2, 1.33, false).ok);
  f.run(M.RULES.lab.mix + 0.3);
  assert.equal(f.item('ice').state.pure, 1);
  // charm: the same sale pays one and a half times
  const pay = charm => {
    const d = play({ skipTo: 'day', seed: 5 });
    d.ride(2);
    if (charm) { give(d, 'pills'); d.at({ x: 0, y: 1.53, z: 0 }); assert.equal(d.act({ a: 'consume' }).fx, 'charm'); }
    const b = buyer(d, 0);
    give(d, b.want);
    const before = d.snap().money;
    assert.equal(d.drop(b.hand).rule, 9);
    return [d.snap().money - before, b.want];
  };
  const [plain, w1] = pay(false), [charmed, w2] = pay(true);
  assert.equal(w1, w2, 'the same buyer both times');
  assert.ok(Math.abs(charmed / plain - M.RULES.fx.charm) < 0.08, `charm pays more: ${plain} -> ${charmed}`);
  // mellow: customers lose their patience half as fast
  const wait = mellow => {
    const d = play({ skipTo: 'day', seed: 9 });
    assert.ok(d.open().ok);
    if (mellow) { give(d, 'joint'); d.at({ x: 0, y: 1.53, z: 0 }); assert.equal(d.act({ a: 'consume' }).fx, 'mellow'); }
    for (let i = 0; i < 40 && !d.snap().customers.some(c => c.state === 'wait'); i++) d.run(0.5);
    const c0 = d.snap().customers.find(c => c.state === 'wait');
    d.run(10);
    return c0.patience - d.snap().customers.find(c => c.id === c0.id).patience;
  };
  const a = wait(false), m = wait(true);
  assert.ok(m < a * 0.6, `with a joint they wait longer: ${a} -> ${m}`);
});

test('one clear goal at any moment, with the place it points at', () => {
  const k = play();
  assert.equal(k.snap().goal.station, 'prep');
  const n = play({ skipTo: 'night' });
  let g = n.snap().goal;
  assert.ok(g.station === 'elevator' && g.to === 1 && /lift/i.test(g.text), 'night upstairs: take the lift down');
  n.ride();
  g = n.snap().goal;
  assert.ok(g.station === 'bench' && /recipes/i.test(g.text));
  give(n, 'ice');
  n.drop({ x: n.by.bench.x, y: n.by.bench.y + n.by.bench.h, z: n.by.bench.z - 0.42 });
  assert.ok(/box/i.test(n.snap().goal.text), 'a loose packet: into the box');
  assert.equal(n.snap().hint, n.snap().goal.text, 'the hint line says the same');
  const d = play({ skipTo: 'day' });
  assert.equal(d.snap().goal.station, 'shutter');
  d.g.debug.give('ice', 0);
  assert.ok(/street/i.test(d.snap().goal.text), 'product in the house: the street is named too');
  assert.ok(d.open().ok);
  g = d.snap().goal;
  assert.ok(g.station === 'elevator' && g.to === 2, 'shop open and product left: to the street');
  for (let i = 0; i < 40 && !d.snap().waiting; i++) d.run(0.5);
  assert.equal(d.snap().goal.station, 'counter', 'somebody waits at the counter: that comes first');
});
'''
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tests 1.3 patched')

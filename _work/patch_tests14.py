"""The Back Room 1.4, tests. Run from lobby-stage."""
import io

p = 'game/backroom.test.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("    for (const need of ['counter', 'oven', 'prep', 'drinks', 'button', 'grinder', 'hopper', 'elevator']) assert.ok(kinds.has(need), `${hall.w}x${hall.d}: no ${need}`);",
    "    for (const need of ['counter', 'oven', 'prep', 'drinks', 'grinder', 'hopper', 'elevator']) assert.ok(kinds.has(need), `${hall.w}x${hall.d}: no ${need}`);")
rep("  assert.equal(st.stations.filter(s => s.kind === 'button').length, st.seats.length);",
    "  assert.equal(st.stations.filter(s => s.kind === 'button').length, 0, 'no trapdoor buttons any more');\n"
    "  assert.equal(M.createGame({ ...ZONE, theme: 'kids', now: 0 }).start().stations.filter(s => s.kind === 'button').length, st.seats.length, 'the courier button stays in the kids theme');")
rep("function dropOne(seed = 11) {\n  for (let tries = 0; tries < 8; tries++, seed++) {\n  const k = play({ skipTo: 'day', seed });",
    "function dropOne(seed = 11) {\n  for (let tries = 0; tries < 8; tries++, seed++) {\n  const k = play({ skipTo: 'day', seed, theme: 'kids' });")
rep("test('evening: the button under the counter opens the floor under the marked one and a load arrives below', () => {\n  const { k, seat } = dropOne();\n  assert.ok(k.snap().events.some(e => e.kind === 'drop'));",
    "test('kids theme, evening: the button under the counter lowers the courier\\'s crate and a load arrives below', () => {\n  const { k, seat } = dropOne();\n  assert.ok(k.snap().events.some(e => e.kind === 'crate'));")
rep("  assert.equal(s.load, 1, 'one load waits in the cellar');\n  assert.ok(s.suspicion > 0, 'a missing person raises suspicion');",
    "  assert.equal(s.load, 1, 'one load waits in the cellar');")
rep("test('before the evening the button is locked', () => {\n  const k = play({ skipTo: 'day', seed: 3 });",
    "test('kids theme: before the evening the button is locked', () => {\n  const k = play({ skipTo: 'day', seed: 3, theme: 'kids' });")
rep("test('the cellar: the grinder makes a tray of meat from the load, the tray goes up and fills the stock', () => {\n  const k = play({ skipTo: 'night' });",
    "test('kids theme: the grinder makes a tray of salami from the load, the tray goes up and fills the stock', () => {\n  const k = play({ skipTo: 'night', theme: 'kids' });")

s += r'''
// ───────── the career (1.4) ─────────

/** A career game: one player joined, the save store given. */
function career(store = {}, extra = {}) {
  const k = play({ career: true, loadSave: key => store[key] || null, ...extra });
  k.store = store;
  k.flush = () => { for (const e of k.g.takeSaves()) store[e.key] = JSON.parse(JSON.stringify(e.data)); };
  k.menu = choice => k.act({ a: 'menu', choice });
  return k;
}

test('career: the main menu holds the time; a new career starts at 08:00 of day 1 with $40 and only margherita', () => {
  const k = career();
  assert.equal(k.snap().phase, 'menu');
  k.run(30);
  assert.equal(k.snap().phase, 'menu', 'the time stands still in the menu');
  assert.equal(k.snap().career.save, null, 'no save yet');
  assert.equal(k.act({ a: 'take', station: 'bin_pizza' }).reason, 'paused');
  assert.ok(k.menu('new').ok);
  const s = k.snap();
  assert.equal(s.phase, 'day');
  assert.equal(s.career.day, 1);
  assert.equal(s.money, M.RULES.career.money);
  assert.ok(Math.abs(s.clock - 480) < 2);
  assert.equal(s.career.goals.length, 3, 'three goals for the day');
  assert.equal(k.take('ham').reason, 'locked', 'ham is not bought yet');
  k.drop(k.slot('trash', 0));
  assert.ok(k.take('cheese').ok, 'cheese is there from the start');
  k.drop(k.slot('trash', 0));
  assert.ok(k.open().ok);
  const seen = new Set();
  for (let i = 0; i < 400; i++) { k.run(0.5); for (const c of k.snap().customers) seen.add(c.order.kind === 'pizza' ? c.order.stack.join('+') : `${c.order.kind}:${c.order.drink}`); }
  for (const o of seen) assert.ok(o === 'sauce+cheese' || o === 'cup:cola', `only what is bought is ordered: ${[...seen]}`);
  const e = k.by.elevator;
  k.stand(e.x, e.z);
  assert.equal(k.act({ a: 'use', station: 'elevator', to: 1 }).reason, 'locked', 'no cellar key yet');
});

test('career: upgrades need the money and the rank; the rank grows with everything earned', () => {
  const k = career();
  k.menu('new');
  assert.equal(k.act({ a: 'unlock', id: 'nonsense' }).ok, false);
  assert.ok(k.act({ a: 'unlock', id: 'veg' }).ok, 'mushrooms for $40');
  assert.equal(k.snap().money, 0);
  assert.equal(k.act({ a: 'unlock', id: 'veg' }).reason, 'owned');
  assert.equal(k.act({ a: 'unlock', id: 'orange' }).reason, 'noMoney');
  k.g.debug.earn(500);
  assert.equal(k.act({ a: 'unlock', id: 'mixer' }).reason, 'rank', 'the mixer wants the rank of Owner');
  assert.equal(k.snap().career.rank, 1, '$500 earned: Cook');
  assert.ok(k.act({ a: 'unlock', id: 'cellar' }).ok);
  assert.ok(k.take('veg').ok, 'mushrooms can be taken now');
  k.drop(k.slot('trash', 0));
  k.ride();
  assert.equal(k.level(), 1, 'the cellar key opens the lift');
});

test('career: saved at 08:00 and 00:00 and on quit; continue brings back the day, the money, the upgrades and the cellar', () => {
  const store = {};
  const k = career(store);
  k.menu('new');
  k.flush();
  assert.ok(store.Test && store.Test.day === 1, 'saved under the player\'s name at 08:00');
  k.g.debug.earn(1500);
  for (const id of ['cellar', 'mixer']) assert.ok(k.act({ a: 'unlock', id }).ok);
  k.ride();
  assert.ok(k.take('box').ok);
  const spot = { x: k.by.bench.x, y: k.by.bench.y + k.by.bench.h, z: k.by.bench.z - 0.42 };
  k.drop(spot);
  const a = k.g.debug.give('ice');
  assert.ok(k.grab(k.snap().items.find(i => i.id === a)).ok);
  k.drop({ ...k.item('box'), y: k.item('box').y + 0.1 });
  assert.deepEqual(k.item('box').state.n, ['ice']);
  k.run(M.RULES.phases.day + 1);
  assert.equal(k.snap().phase, 'night');
  k.run(M.RULES.phases.night + 1);
  assert.equal(k.snap().phase, 'day');
  assert.equal(k.snap().career.day, 2, 'the next morning is day 2');
  const money = k.snap().money;
  assert.ok(k.menu('quit').ok);
  assert.ok(k.g.over, 'save and quit ends the session');
  k.flush();
  assert.equal(store.Test.day, 2);
  const c = career(store);
  assert.deepEqual(c.snap().career.save, { day: 2, money, rank: c.snap().career.save.rank });
  assert.ok(c.menu('continue').ok);
  const s = c.snap();
  assert.equal(s.career.day, 2);
  assert.equal(s.money, money);
  assert.ok(s.career.unlocked.includes('mixer'));
  assert.deepEqual(c.item('box').state.n, ['ice'], 'the box with the packet is back in the cellar');
  assert.equal(c.item('box').level, 1);
});

test('career: pause stops the time and the actions; resume goes on', () => {
  const k = career();
  k.menu('new');
  k.run(5);
  const left = k.snap().left;
  assert.ok(k.menu('pause').ok);
  k.run(60);
  assert.ok(Math.abs(k.snap().left - left) < 0.2, 'nothing moves while paused');
  assert.equal(k.take('cheese').reason, 'paused');
  assert.ok(k.menu('resume').ok);
  k.run(5);
  assert.ok(k.snap().left < left - 4);
});

test('career: a goal of the day pays its bonus once', () => {
  const k = career();
  k.menu('new');
  const g = k.snap().career.goals.find(q => /Earn/.test(q.text)) || k.snap().career.goals[0];
  const before = k.snap().money;
  k.g.debug.earn(6000);
  k.run(0.2);
  const s = k.snap();
  const done = s.career.goals.filter(q => q.done);
  if (/Earn/.test(g.text)) assert.ok(done.some(q => q.text === g.text), 'earned enough today');
  assert.equal(s.money, before + 6000 + done.reduce((a, q) => a + q.bonus, 0));
  k.run(1);
  assert.equal(k.snap().money, s.money, 'paid only once');
});

test('the press: three packets of one kind on a tray and three good pulls make a brick worth more than three packets', () => {
  const k = career();
  k.menu('new');
  k.g.debug.earn(20000);
  for (const id of ['cellar', 'mixer', 'press']) k.g.debug.unlock(id);
  k.run(M.RULES.phases.day + 1);
  k.ride();
  assert.ok(k.take('tray').ok, 'a tray from the rack');
  assert.ok(k.drop(k.slot('grinder', 0)).ok, 'the tray on the press');
  k.at(k.by.grinder.btn);
  assert.equal(k.act({ a: 'use', station: 'grinder' }).reason, 'needThree');
  const tray = k.item('tray');
  for (const kind of ['ice', 'pills']) {
    const id = k.g.debug.give(kind);
    assert.ok(k.grab(k.snap().items.find(i => i.id === id)).ok);
    k.drop({ x: tray.x, y: tray.y + 0.08, z: tray.z });
  }
  assert.deepEqual(k.item('tray').state.n, ['ice'], 'one kind per tray');
  k.drop(k.slot('trash_lab', 0));
  for (let i = 0; i < 2; i++) { const id = k.g.debug.give('ice'); k.grab(k.snap().items.find(q => q.id === id)); k.drop({ x: tray.x, y: tray.y + 0.08, z: tray.z }); }
  assert.deepEqual(k.item('tray').state.n, ['ice', 'ice', 'ice']);
  for (let i = 0; i < 3000 && !k.item('brick'); i++) {
    k.run(0.05);
    const d = k.dyn('grinder');
    if (d.needle > d.zone[0] + 0.03 && d.needle < d.zone[1] - 0.03) { k.at(k.by.grinder.btn); k.act({ a: 'use', station: 'grinder' }); k.run(0.5); }
  }
  const b = k.item('brick');
  assert.ok(b && b.state.of === 'ice', 'a brick of ice');
  assert.ok(!k.item('tray'), 'the tray is used up');
});

test('dealers: what lies on a hired dealer\'s shelf of the cabinet at 08:00 is sold by him through the day', () => {
  const k = career();
  k.menu('new');
  k.g.debug.earn(20000);
  for (const id of ['cellar', 'mixer', 'street', 'dealer_alley']) k.g.debug.unlock(id);
  k.run(M.RULES.phases.day + 1);
  k.ride();
  assert.ok(k.take('box').ok);
  openStash(k);
  assert.equal(k.drop(k.slot('stash', 0)).rule, 1, 'the box on the alley dealer\'s shelf');
  const box = k.item('box');
  for (let i = 0; i < 4; i++) { const id = k.g.debug.give('buds'); k.grab(k.snap().items.find(q => q.id === id)); k.drop({ x: box.x, y: box.y + 0.1, z: box.z }); }
  assert.equal(k.item('box').state.n.length, 4);
  const before = k.snap().money;
  k.run(M.RULES.phases.night + 1);
  assert.equal(k.snap().phase, 'day');
  assert.equal(k.item('box').state.n.length, 0, 'the dealer took the packets at 08:00');
  assert.equal(k.snap().career.dealers[0].left, 4);
  k.run(M.RULES.dealer.every[0] * 4 + 2);
  assert.equal(k.snap().career.dealers[0].left, 0, 'all sold during the day');
  const got = k.snap().money - before, each = Math.round(M.RULES.sell.buds * (1 - M.RULES.dealer.cut));
  assert.ok(got >= each * 4, `the money came in, minus his cut: ${got}`);
});

test('the carry box holds fifteen and gives out the packet asked for', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  assert.ok(k.take('box').ok);
  const spot = { x: k.by.bench.x, y: k.by.bench.y + k.by.bench.h, z: k.by.bench.z - 0.42 };
  k.drop(spot);
  const box = k.item('box');
  const kinds = ['ice', 'buds', 'pills'];
  for (let i = 0; i < 16; i++) { const id = k.g.debug.give(kinds[i % 3]); k.grab(k.snap().items.find(q => q.id === id)); k.drop({ x: box.x, y: box.y + 0.1, z: box.z }); }
  assert.equal(k.item('box').state.n.length, 15, 'fifteen fit, the sixteenth does not');
  k.drop(k.slot('trash_lab', 0));
  k.at(k.item('box'));
  assert.ok(k.act({ a: 'unpack', item: k.item('box').id, kind: 'buds' }).ok);
  assert.equal(k.snap().items.find(i => i.holder === P).kind, 'buds', 'the one asked for');
  assert.equal(k.item('box').state.n.length, 14);
});
'''
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tests 1.4 patched')

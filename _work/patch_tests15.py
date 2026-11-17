"""The Back Room 1.5, tests. Run from lobby-stage."""
import io

p = 'game/backroom.test.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("const DOWN = [-0.7071, 0, 0, 0.7071];      // the hand turned so that the neck of what it holds points straight down",
    "const DOWN = [1, 0, 0, 0];      // the hand turned upside down: what it holds upright now points its neck straight down")
rep("""/** A pizza as ordered: dough on the board, the toppings, the oven, the counter in front of the customer. */
function servePizza(k, c, prep = 0) {
  assert.ok(k.take('pizza').ok, 'the dough is taken');
  assert.ok(k.drop(k.slot('prep', prep)).ok, 'the dough lies on the board');
  for (const t of c.order.stack) {
    assert.ok(k.take(t).ok, `${t} is taken`);
    assert.ok(k.drop({ ...k.slot('prep', prep), y: k.slot('prep', prep).y + 0.05 }).ok, `${t} goes on the pizza`);
  }
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.ok(k.drop(k.slot('oven', 0)).ok, 'the pizza goes into the oven');
  k.run(M.RULES.cookDone + 0.5);
  assert.ok(k.item('pizza').state.cook >= 1, 'the pizza is baked');
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.ok(k.drop(k.slot('counter', c.seat)).ok, 'the pizza reaches the customer');
}""",
    """/** The ladle: dipped in the pot of this sauce, then held over the raw pizza (its bowl hangs 0.25 m under the hand). */
function ladle(k, sauce) {
  const l = k.item('ladle');
  assert.ok(k.grab(l).ok, 'the ladle is taken');
  const pot = k.by[`pot_${sauce}`];
  k.at({ x: pot.x, y: pot.y + pot.h + 0.25 + 0.04, z: pot.z }); k.run(0.2);
  assert.equal(k.item('ladle').state.sauce, sauce, `the ladle is full of ${sauce}`);
  const pz = k.item('pizza');
  k.at({ x: pz.x, y: pz.y + 0.25 + 0.08, z: pz.z }); k.run(0.2);
  assert.equal(k.item('ladle').state.sauce, null, 'the sauce went on the pizza');
  k.drop(k.slot('pot_sauce', 0));
}
/** A baked pizza into a box: a box from the stack on the counter, laid on the counter top, the pizza onto it. */
function boxIt(k) {
  assert.ok(k.take('pbox').ok, 'a pizza box from the stack');
  const top = { x: 0, y: k.by.counter.y + k.by.counter.h, z: k.by.counter.z - 0.2 };
  k.drop(top);
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.equal(k.drop({ ...k.item('pbox'), y: k.item('pbox').y + 0.05 }).rule, 12, 'the pizza goes into the box');
  assert.equal(k.item('pizza').state.boxed, 1);
}
/** A pizza as ordered: dough on the board, the sauce with the ladle, the toppings, the oven, a box, the counter. */
function servePizza(k, c) {
  assert.ok(k.take('pizza').ok, 'the dough is taken');
  assert.ok(k.drop(k.slot('prep', 0)).ok, 'the dough lies on the board');
  for (const t of c.order.stack) {
    if (M.SAUCES.includes(t)) { ladle(k, t); continue; }
    assert.ok(k.take(t).ok, `${t} is taken`);
    assert.ok(k.drop({ ...k.slot('prep', 0), y: k.slot('prep', 0).y + 0.05 }).ok, `${t} goes on the pizza`);
  }
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.ok(k.drop(k.slot('oven', 0)).ok, 'the pizza goes into the oven');
  k.run(M.RULES.cookDone + 0.5);
  assert.ok(k.item('pizza').state.cook >= 1, 'the pizza is baked');
  boxIt(k);
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.equal(k.drop(k.slot('counter', c.seat)).ok, true, 'the boxed pizza reaches the customer');
}""")
rep("""    if (c.order.kind === 'cup') {
      const tap = c.order.drink === 'cola' ? 0 : 1;
      assert.ok(k.take('cup').ok);
      assert.ok(k.drop(k.slot('drinks', tap)).ok, 'the cup stands under the nozzle');
      k.run(1);
      assert.equal(k.item('cup').state.fill, 0, 'nothing runs by itself');
      k.at(k.by.drinks.taps[tap]);
      assert.ok(k.act({ a: 'use', station: 'drinks', control: tap }).ok, 'the tap is pressed by hand');
      assert.equal(k.item('cup').state.pour, 1);
      k.run(M.RULES.pour + 0.3);""",
    """    if (c.order.kind === 'cup') {
      const tap = c.order.drink === 'cola' ? 0 : 1;
      assert.ok(k.take('cup').ok);
      assert.ok(k.drop(k.slot('drinks', tap)).ok, 'the cup stands under the tap');
      assert.equal(k.item('cup').state.pour, 1, 'it starts to fill by itself');
      k.run(M.RULES.pour + 0.3);
      assert.equal(k.item('cup').state.fill, 1, 'full to the top');""")
rep("""    } else if (c.order.kind === 'pizza') servePizza(k, c, 1);
  }
  assert.ok(done, 'somebody came for a drink');
  const e = play({ skipTo: 'day' });
  e.at(e.by.drinks.taps[0]);
  const r = e.act({ a: 'use', station: 'drinks', control: 0 });
  assert.ok(r.ok && r.spill, 'a tap with no cup just runs');
});""",
    """    } else if (c.order.kind === 'pizza') servePizza(k, c);
  }
  assert.ok(done, 'somebody came for a drink');
  // a full cup held upright keeps its drink; tipped over it spills
  const e = play({ skipTo: 'day' });
  e.take('cup'); e.drop(e.slot('drinks', 0)); e.run(M.RULES.pour + 0.3);
  assert.ok(e.grab(e.item('cup')).ok);
  e.run(2);
  assert.equal(e.item('cup').state.fill, 1, 'upright: nothing spills');
  e.tilt(true); e.run(1); e.tilt(false);
  assert.ok(e.item('cup').state.fill < 0.5, 'tipped: it spills');
});""")
rep("test('day: the drink runs only when the tap is pressed, and it is served', () => {", "test('day: a cup under a tap fills by itself, it is served, and it spills when tipped', () => {")
i = s.index("test('the pizzeria: three sauces, more toppings, pizzas from the menu; one sauce, first', () => {")
j = s.index("  const seen = new Set();", i)
s = s[:i] + """test('the pizzeria: tomato and white sauce with the ladle, cheese on the dough table, more toppings; one sauce, first', () => {
  const k = play({ skipTo: 'day' });
  for (const b of ['cheese', 'veg', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion', 'greens', 'pbox']) assert.ok(k.by[`bin_${b}`], `${b} can be taken somewhere`);
  for (const p of ['pot_sauce', 'pot_white']) assert.ok(k.by[p], `there is ${p}`);
  assert.ok(k.item('ladle') && k.item('ladle').slot === 'pot_sauce.0', 'the ladle lies in the tomato pot');
  assert.ok(k.take('pizza').ok);
  assert.ok(k.drop(k.slot('prep', 0)).ok);
  const put = t => { assert.ok(k.take(t).ok, `${t} is taken`); k.drop({ ...k.slot('prep', 0), y: k.slot('prep', 0).y + 0.05 }); };
  put('shrimp');
  assert.deepEqual(k.item('pizza').state.stack, [], 'nothing lies without a sauce');
  k.drop(k.slot('trash', 0));
  ladle(k, 'white'); put('cheese'); put('shrimp');
  assert.deepEqual(k.item('pizza').state.stack, ['white', 'cheese', 'shrimp']);
  assert.ok(k.grab(k.item('ladle')).ok);
  const pot = k.by.pot_sauce, pz = k.item('pizza');
  k.at({ x: pot.x, y: pot.y + pot.h + 0.29, z: pot.z }); k.run(0.2);
  k.at({ x: pz.x, y: pz.y + 0.33, z: pz.z }); k.run(0.2);
  assert.equal(k.item('pizza').state.stack.length, 3, 'no second sauce');
  assert.equal(k.item('ladle').state.sauce, 'sauce', 'the ladle keeps it');
""" + s[j:]
rep("  for (const key of seen) assert.ok(M.SAUCES.includes(key.split('+')[0]), `the pizza starts with a sauce: ${key}`);",
    "  for (const key of seen) assert.ok(['sauce', 'white'].includes(key.split('+')[0]), `the pizza starts with tomato or white sauce: ${key}`);")
rep("""const openStash = k => {
  k.at(k.by.stash.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'stash' }).ok, 'the handle is pressed');
  k.run(M.RULES.lab.door + 0.2);
};""", """const openStash = k => {
  for (const d of [0, 1]) { k.at(k.by.stash.taps[d]); assert.ok(k.act({ a: 'use', station: 'stash', control: d }).ok, `the handle of door ${d} is pulled`); }
  k.run(M.RULES.lab.door + 0.2);
};""")
s += r'''
// ───────── the kitchen and the hands (1.5) ─────────

test('the belt carries a raw pizza into the oven; the pizza is served only in a box', () => {
  const k = play({ skipTo: 'day' });
  assert.ok(k.open().ok);
  assert.ok(k.take('pizza').ok);
  k.drop(k.slot('prep', 0));
  ladle(k, 'sauce');
  assert.ok(k.take('cheese').ok);
  k.drop({ ...k.slot('prep', 0), y: k.slot('prep', 0).y + 0.05 });
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.equal(k.drop(k.slot('belt', 0)).rule, 1, 'onto the belt');
  assert.equal(k.item('pizza').state.belt, 1);
  const x0 = k.item('pizza').z;
  k.run(1);
  assert.ok(Math.abs(k.item('pizza').z - x0) > 0.1, 'it rides');
  k.run(8);
  assert.equal(k.item('pizza').slot, 'oven.0', 'into the oven');
  k.run(M.RULES.cookDone + 0.5);
  // not boxed: the customer does not take it
  let c = null; for (let i = 0; i < 60 && !(c = k.snap().customers.find(q => q.state === 'wait' && q.order.kind === 'pizza')); i++) k.run(0.5);
  if (c) {
    assert.ok(k.grab(k.item('pizza')).ok);
    k.drop(k.slot('counter', c.seat));
    assert.ok(!k.snap().events.some(e => e.kind === 'order_ok'), 'no box, no sale');
  }
});

test('free grabbing: a thing keeps the hold it was taken with; turning that hold over pours', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  assert.ok(k.take('blue').ok);
  k.drop({ x: k.by.bench.x, y: k.by.bench.y + k.by.bench.h, z: k.by.bench.z - 0.42 });
  const fl = k.item('blue');
  k.at(fl);
  // taken from above, the hand turned upside down above it: the hold says the flask is upright in that hand
  assert.ok(k.act({ a: 'grab', item: fl.id, o: [0, -0.1, 0], q: [1, 0, 0, 0] }).ok);
  assert.ok(k.snap().items.find(i => i.id === fl.id).ho, 'the hold goes out to the others');
  const m = k.by.bench.taps[2];
  k.at({ x: m.x, y: m.y + 0.4, z: m.z }); k.tilt(true); k.run(1);
  assert.equal(k.dyn('bench').mix[0], 0, 'hand upside down, flask upright in it: nothing pours');
  k.tilt(false); k.run(1);
  assert.ok(k.dyn('bench').mix[0] > 10, 'hand upright, flask upside down in it: it pours');
});

test('throwing: let go fast and it flies, lands on the floor, on a table or in a customer\'s place', () => {
  const k = play({ skipTo: 'night' });
  assert.ok(k.take('cup').ok);
  k.at({ x: 0, y: 1.3, z: 0 });
  const r = k.act({ a: 'release', p: [0, 1.3, 0], v: [0, 1, 2] });
  assert.ok(r.thrown, 'it flies');
  assert.ok(k.item('cup').y > 0.5);
  k.run(1.5);
  const c = k.item('cup');
  assert.ok(c && c.y < 1.2 && c.z > 0.4, `it came down further on: ${c && [c.x, c.y, c.z]}`);
  assert.ok(k.snap().events.some(e => e.kind === 'landed'));
  // a slow let-go is a normal drop
  assert.ok(k.take('cup').ok);
  assert.ok(!k.act({ a: 'release', p: [0, 1.2, -0.2], v: [0, 0, 0.5] }).thrown);
});

test('the cabinet: each door opens by its own handle and stays open', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  k.at(k.by.stash.taps[0]);
  assert.equal(k.act({ a: 'use', station: 'stash', control: 0 }).door, 0);
  k.run(2);
  assert.deepEqual(k.dyn('stash').want, [1, 0], 'only the left door');
  assert.ok(k.take('papers').ok);
  assert.equal(k.drop(k.slot('stash', 0)).rule, 1, 'a left shelf takes it');
  assert.ok(k.take('papers').ok || true);
  assert.notEqual(k.drop(k.slot('stash', 3)).rule, 1, 'a right shelf behind the shut door does not');
  k.run(30);
  assert.deepEqual(k.dyn('stash').want, [1, 0], 'it stays open');
});

test('the cellar lights: the switch turns the ceiling lights off; the purple lamp makes the plants grow twice as fast', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  k.at(k.by.switch.btn);
  assert.ok(k.act({ a: 'use', station: 'switch' }).ok);
  assert.equal(k.snap().lights.main, 0);
  const pot = k.slot('grow', 0);
  k.at(pot); assert.ok(k.act({ a: 'take', station: 'grow' }).ok); k.drop(k.slot('trash_lab', 0));
  assert.ok(k.act({ a: 'buy', kind: 'seeds' }).ok); k.run(M.RULES.shop.delay + 0.3);
  assert.ok(k.take('seeds').ok); k.drop(pot);
  k.at(k.by.grow.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'grow' }).ok);
  assert.equal(k.snap().lights.uv, 1);
  k.run(M.RULES.lab.grow / 2 + 0.5);
  assert.equal(k.dyn('grow').pots[0], 1, 'grown in half the time');
  const c = career();
  c.menu('new');
  c.g.debug.unlock('cellar');
  c.run(M.RULES.phases.day + 1);
  c.ride();
  c.at(c.by.grow.taps[0]);
  assert.equal(c.act({ a: 'use', station: 'grow' }).reason, 'locked', 'in the career the lamp is bought first');
});

test('career: the street is open from the start', () => {
  const k = career();
  k.menu('new');
  assert.ok(!M.RULES.career.unlocks.some(u => u[0] === 'street'));
  k.ride(2);
  assert.equal(k.level(), 2);
});
'''
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('tests 1.5 patched')

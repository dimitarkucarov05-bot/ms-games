// Checks of "The Back Room" 1.3: a lab in the cellar by night, a pizzeria and the street by day.
// Every action goes the real way: the hand's pose at the place, then the action, as it comes from the controller.
//
//   node --test game/backroom.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './backroom.js';

const ZONE = {
  hall: { w: 2.4, d: 2.3 },
  rooms: [{ id: 'a', x: 0, z: 0, w: 2.4, d: 2.3 }, { id: 'b', x: -0.7, z: -2.7, w: 1.6, d: 3.1 }],
  doors: [{ a: 'a', b: 'b', x: -0.55, z: -1.15, w: 1.1, axis: 'x' }],
  obstacles: [[[0.16, -1.51], [0.14, -1.16], [0.68, -1.15], [0.72, -1.46], [0.14, -1.51]]],
};
const Q = [0, 0, 0, 1], P = 'p1';
const DOWN = [-0.7071, 0, 0, 0.7071];      // the hand turned so that the neck of what it holds points straight down

/** A game with one player and helpers that move his hand and the time. */
function play(extra = {}) {
  const g = M.createGame({ ...ZONE, theme: 'night', seed: 7, now: 0, ...extra });
  const st = g.start();
  const by = Object.fromEntries(st.stations.map(s => [s.id, s]));
  let now = 0, head = [0, 1.6, 0], hr = [0, 0, 0], hl = [0, 0, 0], qr = Q;
  g.join(P, { n: 1, name: 'Test' });
  const send = () => g.pose(P, [...head, ...Q, ...hl, ...Q, ...hr, ...qr]);
  const k = {
    g, st, by,
    run(sec) { const end = now + sec * 1000; while (now < end) { now += 50; g.tick(now); } },
    snap: () => g.snapshot(),
    at(p) { hr = [p.x, p.y, p.z]; head = [p.x, 1.6, p.z]; send(); },
    atL(p) { hl = [p.x, p.y, p.z]; send(); },
    actL: m => g.act(P, { hand: 'l', ...m }),
    /** by day: the OPEN button on the counter */
    open() { k.at(by.shutter.btn); return k.act({ a: 'use', station: 'shutter' }); },
    level: () => g.snapshot().players[0].level,
    stand(x, z) { head = [x, 1.6, z]; hr = [x, 1.2, z]; send(); },
    tilt(on) { qr = on ? DOWN : Q; send(); },
    act: m => g.act(P, { hand: 'r', ...m }),
    take(gives) { const b = by[`bin_${gives}`]; k.at({ x: b.x, y: b.y + b.h, z: b.z }); return k.act({ a: 'take', station: b.id }); },
    drop(p) { k.at(p); return k.act({ a: 'release', p: [p.x, p.y, p.z] }); },
    slot: (id, i = 0) => by[id].slots[i],
    item: kind => g.snapshot().items.find(i => i.kind === kind),
    items: kind => g.snapshot().items.filter(i => i.kind === kind),
    grab(it) { k.at(it); return k.act({ a: 'grab', item: it.id }); },
    dyn: id => g.snapshot().stations.find(s => s.id === id).state,
    /** rides the lift to the other floor */
    ride(to) {
      const lv = g.snapshot().players[0].level, e = by.elevator;
      k.stand(e.x, e.z);
      assert.ok(k.act({ a: 'use', station: ['elevator', 'elevator_1', 'elevator_2'][lv], ...(to === undefined ? {} : { to }) }).ok, 'the lift starts');
      k.run(M.RULES.elevator.doors * 2 + M.RULES.elevator.travel + 0.5);
      assert.equal(g.snapshot().players[0].level, to === undefined ? (lv === 0 ? 1 : 0) : to, 'the player is at the other stop');
    },
    /** pours from the held vessel for sec seconds into what is under point p */
    pour(p, sec) { k.at({ x: p.x, y: p.y + 0.3, z: p.z }); k.tilt(true); k.run(sec); k.tilt(false); },
  };
  send();
  return k;
}
/** A pizza as ordered: dough on the board, the toppings, the oven, the counter in front of the customer. */
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
}

test('layout: the pizzeria fits different halls', () => {
  for (const hall of [{ w: 6, d: 6 }, { w: 4, d: 4 }, { w: 10, d: 5 }, { w: 3, d: 2 }]) {
    const st = M.createGame({ hall, now: 0 }).start();
    const kinds = new Set(st.stations.map(s => s.kind));
    for (const need of ['counter', 'oven', 'prep', 'drinks', 'button', 'grinder', 'hopper', 'elevator']) assert.ok(kinds.has(need), `${hall.w}x${hall.d}: no ${need}`);
    const sh = st.stations.find(s => s.kind === 'shutter');
    assert.ok(sh && sh.btn && Math.abs(sh.btn.x) <= hall.w / 2 && Math.abs(sh.btn.z) <= hall.d / 2, `${hall.w}x${hall.d}: the lever of the shop is inside the hall`);
  }
});

test("the owner's zone: natural layout, everything a hand must touch is within reach", () => {
  const { st, by } = play();
  assert.equal(st.natural, true);
  assert.equal(st.stations.filter(s => s.kind === 'button').length, st.seats.length);
  const inZone = (x, z, m) => ZONE.rooms.some(r => Math.abs(x - r.x) <= r.w / 2 + m && Math.abs(z - r.z) <= r.d / 2 + m);
  for (const s of st.stations) {
    for (const p of [...(s.slots || []), ...(s.btn ? [s.btn] : []), ...(s.taps || [])]) {
      assert.ok(inZone(p.x, p.z, 0.45), `${s.id}: more than 45 cm outside the zone (${p.x}, ${p.z})`);
      assert.ok(p.y >= 0.45 && p.y <= 1.6, `${s.id}: awkward height ${p.y}`);
    }
  }
  for (const id of ['stash', 'grow', 'bench', 'screen', 'screen_1', 'bin_blue', 'bin_clear', 'bin_red', 'bin_green', 'bin_yellow', 'bin_papers', 'bin_seeds', 'bin_box', 'bin_tray',
    'elevator_2', 'way_2_3', 'way_3_2', 'way_3_4', 'way_4_3', 'spot_2_0', 'spot_3_0', 'spot_4_0']) assert.ok(by[id], `there is ${id}`);
  assert.ok(by.shutter.btn, 'the shop has an OPEN button');
  assert.equal(st.levels, 5, 'the shop, the cellar and three blocks of the street');
  assert.deepEqual(st.street.map(b => b.level), [2, 3, 4]);
  const boxes = st.stations.filter(q => q.level === 1 && q.kind === 'bin').map(q => [q.id, q.y, q.z]);
  for (const a of boxes) for (const b of boxes) if (a !== b) assert.ok(a[1] !== b[1] || Math.abs(a[2] - b[2]) > 0.29, `${a[0]} and ${b[0]} share a place on the rack`);
  assert.equal(by.screen.level, 0);
  assert.equal(by.screen_1.level, 1);
  assert.deepEqual(st.store.map(x => x.kind), M.STORE);
});

test('the clock: an evening of training, a night of ten minutes, a day of twelve; two days when asked', () => {
  const g = M.createGame({ ...ZONE, now: 0, fast: true });
  g.join(P, { n: 1, name: 'Test' });
  const seen = [];
  let t = 0;
  while (!g.over && t < 4e6) {
    t += 100; g.tick(t);
    const s = g.snapshot();
    if (seen[seen.length - 1]?.[0] !== s.phase) seen.push([s.phase, s.clock]);
  }
  assert.deepEqual(seen.map(x => x[0]), ['day', 'night', 'day2', 'over'], 'the game starts at 08:00');
  assert.ok(Math.abs(seen[0][1] - 480) < 10, `the first clock is 08:00: ${seen[0][1]}`);
  assert.equal(M.RULES.phases.night, 600);
  assert.equal(M.RULES.phases.day, 720);
  const two = M.createGame({ ...ZONE, now: 0, fast: true, tutorial: true });
  two.join(P, { n: 1, name: 'Test' });
  const seen2 = [];
  for (let u = 0; !two.over && u < 4e6; u += 100) { two.tick(u); const q = two.snapshot().phase; if (seen2[seen2.length - 1] !== q) seen2.push(q); }
  assert.deepEqual(seen2, ['tutorial', 'night', 'day', 'over'], 'with the training first');
  const night = M.createGame({ ...ZONE, now: 0, skipTo: 'night' });
  assert.ok(night.snapshot().clock < 10, 'the night starts at midnight');
  assert.equal(night.snapshot().money, M.RULES.startMoney, 'there is money for the first supplies');
  const day = M.createGame({ ...ZONE, now: 0, skipTo: 'day' });
  assert.ok(Math.abs(day.snapshot().clock - 480) < 10, 'the day starts at eight');
});

test('training: a margherita the real way brings money', () => {
  const k = play({ tutorial: true });
  k.run(2);
  const c = k.snap().customers.find(x => x.state === 'wait');
  assert.ok(c && c.order.kind === 'pizza', 'the first customer wants a pizza');
  servePizza(k, c);
  const s = k.snap();
  assert.ok(s.money > M.RULES.startMoney, 'money came in');
  assert.ok(s.events.some(e => e.kind === 'order_ok'));
});

test('the shop is opened by hand: nobody comes at night, and by day only after the OPEN button', () => {
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
});

test('day: the drink runs only when the tap is pressed, and it is served', () => {
  const k = play({ skipTo: 'day', seed: 3 });
  assert.ok(k.open().ok);
  let done = false;
  for (let i = 0; i < 300 && !done; i++) {
    k.run(0.5);
    const s = k.snap();
    if (s.phase !== 'day') break;
    const c = s.customers.find(x => x.state === 'wait');
    if (!c) continue;
    const before = s.money;
    if (c.order.kind === 'cup') {
      const tap = c.order.drink === 'cola' ? 0 : 1;
      assert.ok(k.take('cup').ok);
      assert.ok(k.drop(k.slot('drinks', tap)).ok, 'the cup stands under the nozzle');
      k.run(1);
      assert.equal(k.item('cup').state.fill, 0, 'nothing runs by itself');
      k.at(k.by.drinks.taps[tap]);
      assert.ok(k.act({ a: 'use', station: 'drinks', control: tap }).ok, 'the tap is pressed by hand');
      assert.equal(k.item('cup').state.pour, 1);
      k.run(M.RULES.pour + 0.3);
      assert.ok(k.grab(k.item('cup')).ok);
      assert.ok(k.drop(k.slot('counter', c.seat)).ok);
      assert.ok(k.snap().money > before, 'the drink brings money');
      done = true;
    } else if (c.order.kind === 'pizza') servePizza(k, c, 1);
  }
  assert.ok(done, 'somebody came for a drink');
  const e = play({ skipTo: 'day' });
  e.at(e.by.drinks.taps[0]);
  const r = e.act({ a: 'use', station: 'drinks', control: 0 });
  assert.ok(r.ok && r.spill, 'a tap with no cup just runs');
});

test('the pizzeria: three sauces, more toppings, pizzas from the menu; one sauce, first', () => {
  const k = play({ skipTo: 'day' });
  for (const b of ['sauce', 'white', 'mustard', 'cheese', 'veg', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion', 'greens']) assert.ok(k.by[`bin_${b}`], `${b} can be taken somewhere`);
  assert.ok(k.take('pizza').ok);
  assert.ok(k.drop(k.slot('prep', 0)).ok);
  const put = t => { assert.ok(k.take(t).ok, `${t} is taken`); k.drop({ ...k.slot('prep', 0), y: k.slot('prep', 0).y + 0.05 }); };
  put('shrimp');
  assert.deepEqual(k.item('pizza').state.stack, [], 'nothing lies without a sauce');
  k.drop(k.slot('trash', 0));
  put('white'); put('cheese'); put('shrimp');
  assert.deepEqual(k.item('pizza').state.stack, ['white', 'cheese', 'shrimp']);
  put('mustard');
  assert.equal(k.item('pizza').state.stack.length, 3, 'no second sauce');
  const seen = new Set();
  const g = M.createGame({ ...ZONE, theme: 'night', skipTo: 'day', seed: 11, now: 0, fast: true });
  g.join(P, { n: 1, name: 'Test' });
  g.debug.open();
  for (let t = 0; t < 300000; t += 100) { g.tick(t); for (const c of g.snapshot().customers) if (c.order.kind === 'pizza') seen.add(c.order.stack.join('+')); }
  assert.ok(seen.size >= 4, `different pizzas are ordered: ${[...seen].join(', ')}`);
  for (const key of seen) assert.ok(M.SAUCES.includes(key.split('+')[0]), `the pizza starts with a sauce: ${key}`);
});

/** By day: waits for the evening, then for a marked customer, and presses the button under him. */
function dropOne(seed = 11) {
  for (let tries = 0; tries < 8; tries++, seed++) {
  const k = play({ skipTo: 'day', seed });
  assert.ok(k.open().ok);
  for (let i = 0; i < 1500; i++) {
    k.run(0.5);
    const s = k.snap();
    if (!s.evening || s.patrol) continue;
    const c = s.customers.find(x => x.state === 'wait' && x.mark);
    if (!c) continue;
    const b = k.by[`btn_${c.seat}`];
    k.at(b.btn);
    if (k.act({ a: 'use', station: b.id }).ok) return { k, seat: c.seat };
  }
  }
  assert.fail('no marked customer came in the evening');
  return null;
}

test('evening: the button under the counter opens the floor under the marked one and a load arrives below', () => {
  const { k, seat } = dropOne();
  assert.ok(k.snap().events.some(e => e.kind === 'drop'));
  k.run(0.3);
  assert.ok(k.snap().traps[seat] > 0, 'the cover under him opens');
  k.run(4);
  const s = k.snap();
  assert.equal(s.load, 1, 'one load waits in the cellar');
  assert.ok(s.suspicion > 0, 'a missing person raises suspicion');
});

test('before the evening the button is locked', () => {
  const k = play({ skipTo: 'day', seed: 3 });
  k.run(3);
  const b = k.by.btn_0;
  k.at(b.btn);
  assert.equal(k.act({ a: 'use', station: b.id }).reason, 'notYet');
});

test('the cellar: the grinder makes a tray of meat from the load, the tray goes up and fills the stock', () => {
  const k = play({ skipTo: 'night' });
  k.g.debug.load(1);
  k.ride();
  assert.ok(k.take('tray').ok, 'a tray is taken');
  assert.ok(k.drop(k.slot('grinder', 0)).ok, 'the tray stands under the grinder');
  for (let i = 0; i < 2000 && !k.item('meatbox'); i++) {
    k.run(0.05);
    const d = k.dyn('grinder');
    if (d.needle > d.zone[0] + 0.03 && d.needle < d.zone[1] - 0.03) {
      k.at(k.by.grinder.btn);
      k.act({ a: 'use', station: 'grinder' });
      k.run(0.5);
    }
  }
  const box = k.item('meatbox');
  assert.ok(box, 'the tray of meat is ready');
  assert.ok(k.grab(box).ok);
  k.ride();
  const before = k.snap().meat;
  assert.ok(k.drop(k.slot('bin_meat', 0)).ok, 'the tray lies on the meat shelf');
  assert.ok(k.snap().meat > before, 'the stock of meat grows');
});

test('the kids theme is harmless: no lab, no police, the tank stays', () => {
  for (const skipTo of ['night', 'day']) {
    const g = M.createGame({ ...ZONE, theme: 'kids', skipTo, now: 0 });
    const hint = g.snapshot().hint || '';
    assert.ok(!/rude|floor under|police|product|buyer/i.test(hint), `${skipTo}: ${hint}`);
    assert.equal(g.snapshot().money, 0);
  }
  const st = M.createGame({ ...ZONE, theme: 'kids', now: 0 }).start();
  assert.ok(!st.stations.some(s => ['stash', 'grow', 'bench', 'screen', 'way', 'spot'].includes(s.kind)));
  assert.equal(st.levels, 2);
  assert.ok(st.stations.some(s => s.kind === 'hopper'));
  assert.equal(st.store.length, 0);
});

test('a whole short game reaches a result', () => {
  const g = M.createGame({ ...ZONE, theme: 'night', fast: true, seed: 3, now: 0 });
  g.join(P, { n: 1, name: 'Test' });
  let t = 0;
  while (!g.over && t < 4e6) { t += 100; g.tick(t); }
  assert.ok(g.over, 'the game ends by itself');
  const r = g.snapshot().result;
  assert.ok(r && typeof r.money === 'number' && r.stars >= 1 && r.stars <= 5 && Array.isArray(r.players));
});

// ───────── the cellar ─────────

const openStash = k => {
  k.at(k.by.stash.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'stash' }).ok, 'the handle is pressed');
  k.run(M.RULES.lab.door + 0.2);
};

test('the store: bought on the screen, paid at once, it lands on the storage rack and is taken from there', () => {
  const k = play({ skipTo: 'night' });
  assert.equal(k.act({ a: 'buy', kind: 'nonsense' }).ok, false);
  const before = k.snap().money, stock0 = k.dyn('bin_seeds').stock;
  assert.equal(stock0, 0);
  assert.ok(k.act({ a: 'buy', kind: 'seeds' }).ok, 'the order is taken');
  assert.equal(k.snap().money, before - M.RULES.shop.seeds);
  assert.equal(k.dyn('bin_seeds').coming, 1, 'it is on its way');
  k.run(M.RULES.shop.delay + 0.3);
  assert.equal(k.dyn('bin_seeds').stock, 1, 'it lies on the rack');
  k.ride();
  assert.ok(k.take('seeds').ok, 'it is taken from the rack');
  assert.equal(k.dyn('bin_seeds').stock, 0);
  assert.equal(k.act({ a: 'take', station: 'bin_seeds' }).reason, 'handFull');
  k.drop(k.slot('trash_lab', 0));
  assert.equal(k.take('seeds').reason, 'noStock', 'an empty place gives nothing');
  // no money, no order; no store in the training
  const poor = play({ skipTo: 'night' });
  for (let i = 0; i < 20; i++) poor.act({ a: 'buy', kind: 'box' });
  assert.equal(poor.act({ a: 'buy', kind: 'box' }).reason, 'noMoney');
  assert.equal(play({ tutorial: true }).act({ a: 'buy', kind: 'seeds' }).reason, 'shopShut');
});

test('weed: a plant from the bucket, the shredder gives three buds one after another, papers make a joint, seeds grow', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  const pot = k.slot('grow', 0);
  k.at(pot);
  assert.ok(k.act({ a: 'take', station: 'grow' }).ok, 'the plant comes out');
  assert.ok(k.drop(k.slot('bench', 0)).ok, 'the plant goes into the shredder');
  k.at(k.by.bench.taps[0]);
  assert.ok(k.act({ a: 'use', station: 'bench', control: 0 }).ok);
  assert.equal(k.grab(k.item('plant')).reason, 'wait');
  k.run(M.RULES.lab.shred + 0.3);
  assert.ok(!k.item('plant'));
  let buds = 0;
  for (let i = 0; i < M.RULES.lab.buds; i++) {
    const b = k.items('buds').find(x => x.slot === 'bench.0');
    assert.ok(b, `bud ${i + 1} is in the shredder`);
    assert.ok(k.grab(b).ok);
    if (i === 0) { openStash(k); assert.equal(k.drop(k.slot('stash', 6)).rule, 1, 'the first one goes on a shelf of the cabinet'); }
    else k.drop(k.slot('trash_lab', 0));
    buds++;
    k.run(0.2);
  }
  assert.equal(buds, 3);
  assert.equal(k.items('buds').length, 1, 'no fourth bud');
  // papers in the right hand, the bud in the left, both shaken close together: a joint
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
  k.drop(k.slot('trash_lab', 0));
  assert.ok(k.act({ a: 'buy', kind: 'seeds' }).ok);
  k.run(M.RULES.shop.delay + 0.3);
  assert.ok(k.take('seeds').ok);
  assert.ok(k.drop(pot).ok, 'seeds into the empty bucket');
  assert.ok(k.dyn('grow').pots[0] > 0 && k.dyn('grow').pots[0] < 1, 'something grows');
  k.run(M.RULES.lab.grow + 0.5);
  assert.equal(k.dyn('grow').pots[0], 1, 'it has grown');
});

test('pouring: a tilted vessel pours into what is under its neck; held upright or away from a target it keeps everything', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  const m = k.by.bench.taps[2];
  assert.ok(k.take('blue').ok);
  assert.deepEqual(k.item('blue').state.c, [100, 0, 0, 0, 0]);
  k.at({ x: m.x, y: m.y + 0.3, z: m.z }); k.run(1);
  assert.deepEqual(k.dyn('bench').mix, [0, 0, 0, 0, 0], 'upright: nothing runs');
  k.pour({ x: 0, y: 1, z: 0 }, 1);
  assert.deepEqual(k.item('blue').state.c, [100, 0, 0, 0, 0], 'tilted over nothing: nothing is lost');
  k.pour(m, 1);
  const left = k.item('blue').state.c[0], inMixer = k.dyn('bench').mix[0];
  assert.ok(Math.abs(inMixer - M.RULES.lab.rate) <= 3, `about ${M.RULES.lab.rate} ml a second: ${inMixer}`);
  assert.equal(left + inMixer, 100, 'what left the flask is in the mixer');
  // from a bottle into the flask that stands on the bench
  const spot = { x: k.by.bench.x, y: k.by.bench.y + k.by.bench.h, z: k.by.bench.z - 0.42 };
  assert.equal(k.drop(spot).rule, 4, 'the flask stands on the bench');
  const flask = k.item('blue');
  assert.ok(k.take('clear').ok);
  k.pour(flask, 1);
  const f = k.item('blue').state.c;
  assert.ok(f[1] >= M.RULES.lab.rate - 3, `the solvent is in the flask: ${f}`);
  assert.equal(k.item('clear').state.c[1] + f[1], 150);
});

/** Pours blue and clear into the mixer for the given seconds, optionally shaking each vessel first. */
function batch(k, blueSec, clearSec, shake) {
  const m = k.by.bench.taps[2];
  assert.ok(k.take('blue').ok);
  if (shake) assert.ok(k.act({ a: 'shake' }).ok);
  k.pour(m, blueSec);
  k.drop(k.slot('trash_lab', 0));
  assert.ok(k.take('clear').ok);
  if (shake) assert.ok(k.act({ a: 'shake' }).ok);
  k.pour(m, clearSec);
  k.drop(k.slot('trash_lab', 0));
  k.at(k.by.bench.taps[1]);
  return k.act({ a: 'use', station: 'bench', control: 1 });
}

test('the mixer: the right shares make the product, one packet for every 50 ml; shaken and exact it is pure; wrong shares are wasted', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  k.at(k.by.bench.taps[1]);
  assert.equal(k.act({ a: 'use', station: 'bench', control: 1 }).reason, 'needMore', 'an empty mixer does not start');
  assert.ok(batch(k, 2, 1.33, true).ok, 'the mixer starts');
  const mix = k.dyn('bench').mix;
  assert.ok(Math.abs(mix[0] - 60) <= 3 && Math.abs(mix[1] - 40) <= 3, `60 ml blue and 40 ml solvent: ${mix}`);
  k.run(M.RULES.lab.mix + 0.3);
  const ice = k.item('ice');
  assert.ok(ice && ice.slot === 'bench.1' && ice.state.pure === 1, 'pure blue ice lies between the machines');
  assert.equal(k.dyn('bench').left, 1, 'the second packet waits for its turn');
  assert.ok(k.grab(ice).ok);
  k.drop(k.slot('trash_lab', 0));
  k.run(0.2);
  assert.ok(k.item('ice'), 'the second packet came out');
  // not shaken: the product, but not pure
  const u = play({ skipTo: 'night' });
  u.ride();
  assert.ok(batch(u, 2, 1.33, false).ok);
  u.run(M.RULES.lab.mix + 0.3);
  assert.equal(u.item('ice').state.pure, 0);
  // far too much solvent: nothing
  const w = play({ skipTo: 'night' });
  w.ride();
  assert.ok(batch(w, 0.5, 4, true).ok);
  w.run(M.RULES.lab.mix + 0.3);
  assert.ok(!w.item('ice') && !w.item('powder') && !w.item('pills'), 'wrong shares give nothing');
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
});

test('the box: packets go in, it is carried upstairs, a packet comes out for the buyer', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  assert.ok(k.take('box').ok, 'the box is taken from the rack');
  const spot = { x: k.by.bench.x, y: k.by.bench.y + k.by.bench.h, z: k.by.bench.z - 0.42 };
  assert.equal(k.drop(spot).rule, 4, 'the box stands on the bench');
  const box = k.item('box');
  const a = k.g.debug.give('buds'), b = k.g.debug.give('ice');
  for (const id of [a, b]) {
    assert.ok(k.grab(k.snap().items.find(i => i.id === id)).ok);
    assert.equal(k.drop({ x: box.x, y: box.y + 0.1, z: box.z }).rule, 8, 'the packet goes into the box');
  }
  assert.deepEqual(k.item('box').state.n, ['buds', 'ice']);
  assert.ok(!k.item('buds') && !k.item('ice'));
  assert.ok(k.grab(k.item('box')).ok);
  k.ride();
  assert.equal(k.item('box').level, 0, 'the box came up with the player');
  k.drop({ x: 0, y: 1.0, z: 0 });
  assert.ok(k.item('box'), 'the box lies where it was put');
  k.run(M.RULES.poof + 1);
  assert.ok(k.item('box'), 'the box does not vanish from the floor');
  k.at(k.item('box'));
  assert.ok(k.act({ a: 'unpack', item: k.item('box').id }).ok, 'a packet comes out');
  assert.equal(k.item('ice').holder, P, 'the last one in comes out first');
  assert.deepEqual(k.item('box').state.n, ['buds']);
});

test('a box standing at the outlet takes the packets by itself; bought things do not vanish from the floor', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  assert.ok(k.take('box').ok);
  const out = k.slot('bench', 1);
  k.drop({ x: out.x, y: out.y, z: out.z });
  assert.ok(batch(k, 2, 1.33, false).ok);
  k.run(M.RULES.lab.mix + 0.6);
  assert.deepEqual(k.item('box').state.n, ['ice', 'ice'], 'both packets are in the box');
  assert.ok(!k.item('ice'), 'nothing lies loose');
  assert.ok(k.take('red').ok);
  assert.equal(k.drop({ x: 0, y: 0.3, z: 0 }).rule, 5, 'the bottle is put on the floor');
  k.run(M.RULES.poof + 2);
  assert.ok(k.item('red'), 'it is still there');
});

test('no police for now: a whole day with product upstairs and nothing is taken', () => {
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
  k.at({ x: k.by.elevator.x, y: 1.2, z: k.by.elevator.z + k.by.elevator.d / 2 + 0.35 });
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
  const k = play({ tutorial: true });
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

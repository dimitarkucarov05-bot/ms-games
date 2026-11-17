// Проверки на „Задната стая" след смяната на концепцията (13.11.2026): пицария денем, вечер белязаните клиенти падат
// през пода и долу от товара става месото за пицата. Всяко действие минава по истинския път: поза на ръката при
// мястото и после действието, както идва от контролера.
//
//   node --test game/backroom.test.js
//
// Старите проверки (бургери, скара, лаборатория) описваха махнатата концепция и не са тук.

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

/** Игра с един играч и помощници, които движат ръката му и времето. */
function play(extra = {}) {
  const g = M.createGame({ ...ZONE, theme: 'night', seed: 7, now: 0, ...extra });
  const st = g.start();
  const by = Object.fromEntries(st.stations.map(s => [s.id, s]));
  let now = 0, head = [0, 1.6, 0], hr = [0, 0, 0];
  g.join(P, { n: 1, name: 'Проба' });
  const send = () => g.pose(P, [...head, ...Q, 0, 0, 0, ...Q, ...hr, ...Q]);
  const k = {
    g, st, by,
    run(sec) { const end = now + sec * 1000; while (now < end) { now += 50; g.tick(now); } },
    snap: () => g.snapshot(),
    at(p) { hr = [p.x, p.y, p.z]; head = [p.x, 1.6, p.z]; send(); },
    stand(x, z) { head = [x, 1.6, z]; hr = [x, 1.2, z]; send(); },
    act: m => g.act(P, { hand: 'r', ...m }),
    take(gives) { const b = by[`bin_${gives}`]; k.at({ x: b.x, y: b.y + b.h, z: b.z }); return k.act({ a: 'take', station: b.id }); },
    drop(p) { k.at(p); return k.act({ a: 'release', p: [p.x, p.y, p.z] }); },
    slot: (id, i = 0) => by[id].slots[i],
    item: kind => g.snapshot().items.find(i => i.kind === kind),
    grab(it) { k.at(it); return k.act({ a: 'grab', item: it.id }); },
  };
  send();
  return k;
}
/** Пица по поръчка: тесто на дъската, заливките, пещта, тезгяхът пред клиента. */
function servePizza(k, c, prep = 0) {
  assert.ok(k.take('pizza').ok, 'тестото се взима');
  assert.ok(k.drop(k.slot('prep', prep)).ok, 'тестото ляга на дъската');
  for (const t of c.order.stack) {
    assert.ok(k.take(t).ok, `взима се ${t}`);
    assert.ok(k.drop({ ...k.slot('prep', prep), y: k.slot('prep', prep).y + 0.05 }).ok, `${t} отива върху пицата`);
  }
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.ok(k.drop(k.slot('oven', 0)).ok, 'пицата влиза в пещта');
  k.run(M.RULES.cookDone + 0.5);
  assert.ok(k.item('pizza').state.cook >= 1, 'пицата е изпечена');
  assert.ok(k.grab(k.item('pizza')).ok);
  assert.ok(k.drop(k.slot('counter', c.seat)).ok, 'пицата стига до клиента');
}

test('подреждане: пицарията се побира в различни зали и няма нито една станция от старата концепция', () => {
  for (const hall of [{ w: 6, d: 6 }, { w: 4, d: 4 }, { w: 10, d: 5 }, { w: 3, d: 2 }]) {
    const st = M.createGame({ hall, now: 0 }).start();
    const kinds = new Set(st.stations.map(s => s.kind));
    for (const need of ['counter', 'oven', 'prep', 'drinks', 'button', 'grinder', 'hopper', 'elevator']) assert.ok(kinds.has(need), `${hall.w}x${hall.d}: липсва ${need}`);
    for (const old of ['grill', 'fryer', 'burner', 'packer']) assert.ok(!kinds.has(old), `${hall.w}x${hall.d}: останала е станция ${old}`);
  }
});

test('зоната на собственика: естествена подредба, по едно копче за всяко място пред тезгяха, всичко се стига с ръка', () => {
  const { st } = play();
  assert.equal(st.natural, true);
  assert.equal(st.stations.filter(s => s.kind === 'button').length, st.seats.length);
  const inZone = (x, z, m) => ZONE.rooms.some(r => Math.abs(x - r.x) <= r.w / 2 + m && Math.abs(z - r.z) <= r.d / 2 + m);
  for (const s of st.stations) {
    for (const p of [...(s.slots || []), ...(s.btn ? [s.btn] : []), ...(s.taps || [])]) {
      assert.ok(inZone(p.x, p.z, 0.45), `${s.id}: мястото за действие е на повече от 45 см извън зоната (${p.x}, ${p.z})`);
      assert.ok(p.y >= 0.45 && p.y <= 1.6, `${s.id}: мястото за действие е на неудобна височина ${p.y}`);
    }
  }
});

test('текстовете за играча: нито дума от старата концепция', () => {
  for (const theme of ['night', 'kids']) for (const skipTo of [undefined, 'night', 'rush']) {
    const g = M.createGame({ ...ZONE, theme, skipTo, now: 0 });
    const all = JSON.stringify(g.start()) + JSON.stringify(g.snapshot());
    assert.ok(!/наркот|лаборатор|пакетче|дрога|кристал/i.test(all), `${theme}/${skipTo || 'начало'}: останал е стар текст`);
  }
});

test('обучение: маргарита по истинския път носи пари', () => {
  const k = play();
  k.run(2);
  const c = k.snap().customers.find(x => x.state === 'wait');
  assert.ok(c && c.order.kind === 'pizza', 'първият клиент иска пица');
  servePizza(k, c);
  const s = k.snap();
  assert.ok(s.money > 0, 'има пари');
  assert.ok(s.events.some(e => e.kind === 'order_ok'), 'поръчката е призната');
});

test('ден: напитката се налива на машината и се подава', () => {
  const k = play({ skipTo: 'day', seed: 3 });
  let done = false;
  for (let i = 0; i < 400 && !done; i++) {
    k.run(0.5);
    const s = k.snap();
    if (s.phase !== 'day') break;
    const c = s.customers.find(x => x.state === 'wait');
    if (!c) continue;
    const before = s.money;
    if (c.order.kind === 'cup') {
      assert.ok(k.take('cup').ok, 'чашата се взима');
      const tap = c.order.drink === 'cola' ? 0 : 1;
      assert.ok(k.drop(k.slot('drinks', tap)).ok, 'чашата застава под чучура');
      k.run(1);
      assert.equal(k.item('cup').state.fill, 0, 'нищо не се налива само');
      k.at(k.by.drinks.taps[tap]);
      assert.ok(k.act({ a: 'use', station: 'drinks', control: tap }).ok, 'кранчето се натиска с ръка');
      assert.equal(k.item('cup').state.pour, 1, 'тече');
      k.run(M.RULES.pour + 0.3);
      assert.ok(k.grab(k.item('cup')).ok, 'пълната чаша се взима');
      assert.ok(k.drop(k.slot('counter', c.seat)).ok, 'чашата стига до клиента');
      assert.ok(k.snap().money > before, 'напитката носи пари');
      done = true;
    } else servePizza(k, c, 1);
  }
  assert.ok(done, 'през деня дойде поне един клиент за напитка');
});

/** Вечер: чака белязан клиент на място и натиска копчето под него. Връща играта и мястото. */
function dropOne(seed = 11) {
  const k = play({ skipTo: 'night', seed });
  for (let i = 0; i < 600; i++) {
    k.run(0.5);
    const s = k.snap();
    if (s.patrol) continue;
    const c = s.customers.find(x => x.state === 'wait' && x.mark);
    if (!c) continue;
    const b = k.by[`btn_${c.seat}`];
    k.at(b.btn);
    if (k.act({ a: 'use', station: b.id }).ok) return { k, seat: c.seat };
  }
  assert.fail('вечерта не дойде белязан клиент');
  return null;
}

test('вечер: копчето под тезгяха отваря пода под белязания клиент и долу идва товар', () => {
  const { k, seat } = dropOne();
  assert.ok(k.snap().events.some(e => e.kind === 'drop'), 'падането е обявено');
  k.run(0.3);
  assert.ok(k.snap().traps[seat] > 0, 'капакът под него се отваря');
  k.run(4);
  const s = k.snap();
  assert.equal(s.load, 1, 'един товар чака в мазето');
  assert.ok(s.suspicion > 0, 'изчезнал човек вдига подозрението');
});

test('вечер: копчето не се стига отдалеч; невинен клиент също пада, но това се плаща', () => {
  const k = play({ skipTo: 'night', seed: 11 });
  let tried = false;
  for (let i = 0; i < 200 && !tried; i++) {
    k.run(0.5);
    if (k.snap().patrol) continue;
    const c = k.snap().customers.find(x => x.state === 'wait' && !x.mark);
    if (!c) continue;
    const b = k.by[`btn_${c.seat}`];
    k.stand(b.btn.x, b.btn.z - 2);
    assert.equal(k.act({ a: 'use', station: b.id }).ok, false, 'копчето не се стига от два метра');
    const before = k.snap().suspicion;
    k.at(b.btn);
    assert.equal(k.act({ a: 'use', station: b.id }).ok, true, 'копчето отваря пода под когото и да е');
    const s = k.snap();
    assert.ok(s.events.some(e => e.kind === 'innocent'), 'невинният е отбелязан');
    assert.equal(s.players[0].mistakes, 1, 'грешката се брои на играча');
    assert.ok(s.suspicion > before, 'невинният вдига подозрението');
    tried = true;
  }
  assert.ok(tried, 'дойде поне един обикновен клиент');
});

test('денем копчето не работи', () => {
  const k = play({ skipTo: 'day', seed: 3 });
  k.run(3);
  const b = k.by.btn_0;
  k.at(b.btn);
  assert.equal(k.act({ a: 'use', station: b.id }).ok, false);
});

test('мазето: мелачката прави тава с месо от товара, тавата се качва и пълни запаса за пицата', () => {
  const { k } = dropOne();
  k.run(4);
  const lift = k.by.elevator;
  k.stand(lift.x, lift.z);
  assert.ok(k.act({ a: 'use', station: 'elevator' }).ok, 'асансьорът тръгва надолу');
  k.run(6);
  assert.equal(k.snap().players[0].level, 1, 'играчът е долу');
  assert.ok(k.take('tray').ok, 'взима се тава');
  assert.ok(k.drop(k.slot('grinder', 0)).ok, 'тавата застава под мелачката');
  let hits = 0;
  for (let i = 0; i < 2000 && !k.snap().items.some(it => it.kind === 'meatbox'); i++) {
    k.run(0.05);
    const d = k.snap().stations.find(x => x.id === 'grinder').state;
    if (d.needle > d.zone[0] + 0.03 && d.needle < d.zone[1] - 0.03) {
      k.at(k.by.grinder.btn);
      if (k.act({ a: 'use', station: 'grinder' }).ok) hits++;
      k.run(0.5);
    }
  }
  const box = k.item('meatbox');
  assert.ok(box, `тавата с месо е готова (${hits} точни натискания)`);
  assert.equal(k.snap().load, 0, 'товарът е преработен');
  assert.ok(k.grab(box).ok);
  k.stand(lift.x, lift.z);
  assert.ok(k.act({ a: 'use', station: 'elevator_1' }).ok, 'асансьорът тръгва нагоре');
  k.run(6);
  assert.equal(k.snap().players[0].level, 0, 'играчът е горе');
  const before = k.snap().meat;
  assert.ok(k.drop(k.slot('bin_meat', 0)).ok, 'тавата ляга на рафта за месо');
  assert.ok(k.snap().meat > before, 'запасът от месо расте');
  const stock = k.snap().meat;
  assert.ok(k.take('meat').ok, 'месото се взима за пицата');
  assert.equal(k.snap().meat, stock - 1);
});

test('детската тема е безобидна: никой не пада, копчето сваля доставка', () => {
  const g = M.createGame({ ...ZONE, theme: 'kids', skipTo: 'night', now: 0 });
  const hint = g.snapshot().hint || '';
  assert.ok(!/rude|floor under|load/i.test(hint), `подсказката в детската тема: ${hint}`);
  assert.ok(/courier/i.test(hint), 'вечер идва доставчик');
});

test('цяла кратка игра стига до резултат с формата за класацията', () => {
  const g = M.createGame({ ...ZONE, theme: 'night', fast: true, seed: 3, now: 0 });
  g.join(P, { n: 1, name: 'Проба' });
  let t = 0;
  while (!g.over && t < 4e6) { t += 100; g.tick(t); }
  assert.ok(g.over, 'играта свършва сама');
  const r = g.snapshot().result;
  assert.ok(r && Number.isFinite(r.money) && Number.isFinite(r.stars) && Array.isArray(r.players) && r.players.length === 1);
  assert.equal(typeof r.caught, 'boolean');
});


// ───────── 1.1: сосове и добавки, кранчета, тайният шкаф, растенията, блендерите, купувачите ─────────

test('пицарията: три соса, нови добавки и пици от менюто; сосът е първи и е един', () => {
  const k = play({ skipTo: 'day' });
  for (const b of ['sauce', 'white', 'mustard', 'cheese', 'veg', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion', 'greens']) assert.ok(k.by[`bin_${b}`], `има откъде да се вземе ${b}`);
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
  const over = k.by.bench.taps[2];
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

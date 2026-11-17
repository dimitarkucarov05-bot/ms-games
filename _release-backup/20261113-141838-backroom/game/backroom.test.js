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
    for (const old of ['grill', 'fryer', 'mixer', 'burner', 'packer', 'grow']) assert.ok(!kinds.has(old), `${hall.w}x${hall.d}: останала е станция ${old}`);
  }
});

test('зоната на собственика: естествена подредба, по едно копче за всяко място пред тезгяха, всичко се стига с ръка', () => {
  const { st } = play();
  assert.equal(st.natural, true);
  assert.equal(st.stations.filter(s => s.kind === 'button').length, st.seats.length);
  const inZone = (x, z, m) => ZONE.rooms.some(r => Math.abs(x - r.x) <= r.w / 2 + m && Math.abs(z - r.z) <= r.d / 2 + m);
  for (const s of st.stations) {
    for (const p of [...(s.slots || []), ...(s.btn ? [s.btn] : [])]) {
      assert.ok(inZone(p.x, p.z, 0.45), `${s.id}: мястото за действие е на повече от 45 см извън зоната (${p.x}, ${p.z})`);
      assert.ok(p.y >= 0.6 && p.y <= 1.5, `${s.id}: мястото за действие е на неудобна височина ${p.y}`);
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
      assert.ok(k.drop(k.slot('drinks', c.order.drink === 'cola' ? 0 : 1)).ok, 'чашата застава под чучура');
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
  assert.ok(!/грубиян|пода под|товар/i.test(hint), `подсказката в детската тема: ${hint}`);
  assert.ok(/достав/i.test(hint), 'вечер идва доставчик');
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

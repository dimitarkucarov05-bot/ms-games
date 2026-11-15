// mock.js: фалшив сървър за „Задната стая" в браузъра.
// Дава gameStart и game по docs/SPEC.md (т. 4 и 5), колкото да се пробва сцената без истинските правила.
// Не е копие на правилата: няма проверка за досег, времената са къси, патрулът идва често.

const SURFACE_Y = 0.85;
const PARTS = ['bun_bottom', 'patty', 'cheese', 'lettuce', 'bun_top'];
const ING = ['ing_a', 'ing_b', 'ing_c', 'ing_d'];
const ITEM_KINDS = [...PARTS, 'plate', 'fries', 'cup', ...ING, 'beaker', 'tray', 'bag'];
const SERVE = ['plate', 'fries', 'cup', 'bag'];
const LAB_KINDS = new Set([...ING, 'beaker', 'tray', 'bag']);
const ORDER = ['tutorial', 'day', 'closing', 'night', 'rush', 'raid', 'over'];
const SIZE = {
  bin: [0.30, 0.85, 0.30], grill: [0.70, 0.85, 0.50], fryer: [0.45, 0.85, 0.50], drinks: [0.50, 1.40, 0.40],
  prep: [0.80, 0.85, 0.50], counter: [6, 0.85, 0.50], trash: [0.35, 0.60, 0.35], mixer: [0.60, 0.85, 0.50],
  burner: [0.50, 0.85, 0.50], packer: [0.70, 0.85, 0.50], hatch: [0.40, 0.40, 0.20], wall: [2.4, 2.6, 0.10],
  door: [1.20, 2.0, 0.08], shutter: [6, 1.2, 0.05], sign: [1.6, 0.5, 0.05],
  grow: [1.20, 0.90, 0.50], elevator: [1.6, 2.3, 1.6],
};
const LETTER = { ing_a: 'А', ing_b: 'Б', ing_c: 'В', ing_d: 'Г' };

export function createMock(opts = {}) {
  const hall = { w: opts.hall?.w || 6, d: opts.hall?.d || 6 };
  const theme = opts.theme === 'kids' ? 'kids' : 'night';
  const me = opts.me || { id: 'p1', n: 1, name: 'Ти' };
  const bot = opts.bot === false ? null : (opts.bot || { id: 'p2', n: 2, name: 'Мария' });
  const speed = opts.speed || 1;
  const duration = { tutorial: 20, day: 60, closing: 8, night: 70, rush: 50, raid: 15, ...(opts.duration || {}) };
  const hw = hall.w / 2, hd = hall.d / 2;

  // собствен генератор, за да е повторяемо
  let seed = (opts.seed || 7) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  // ---------- разположение ----------

  const stations = [];
  const byId = new Map();
  const slotDefs = new Map();   // slotId → { id, x, y, z, accepts, station, index }
  const slotItem = {};          // slotId → itemId | null
  function add(id, kind, x, y, z, yaw, extra = {}, slots = []) {
    const s = { id, kind, x, y, z, yaw, w: extra.w ?? SIZE[kind][0], h: extra.h ?? SIZE[kind][1], d: extra.d ?? SIZE[kind][2], slots: [] };
    if (extra.gives) s.gives = extra.gives;
    s.level = extra.level || 0;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    slots.forEach((sd, i) => {
      const slot = { id: `${id}.${i}`, x: +(x + sd[0] * c + sd[2] * sn).toFixed(3), y: +(y + sd[1]).toFixed(3), z: +(z - sd[0] * sn + sd[2] * c).toFixed(3), accepts: sd[3], level: s.level };
      s.slots.push(slot);
      slotDefs.set(slot.id, { ...slot, station: s, index: i });
      slotItem[slot.id] = null;
    });
    stations.push(s); byId.set(id, s);
    return s;
  }

  // както в истинските правила: floor(w / 1.1) места, най-много 5, през най-много 1.6 м, на 0.45 м пред тезгяха
  const nSeats = Math.max(2, Math.min(5, Math.floor(hall.w / 1.1)));
  const gap = Math.min(1.6, (hall.w - 1.5) / (nSeats - 1));
  const seats = [];
  for (let i = 0; i < nSeats; i++) seats.push({ i, x: +((i - (nSeats - 1) / 2) * gap).toFixed(3), z: +(hd + 0.45).toFixed(3) });

  const L = Math.PI / 2, R = -Math.PI / 2;   // гледа към +X (лява стена) / към −X (дясна стена)
  add('counter', 'counter', 0, 0, hd - 0.25, 0, { w: hall.w }, seats.map(s => [s.x, SURFACE_Y, 0, SERVE]));
  add('shutter', 'shutter', 0, SURFACE_Y, hd - 0.03, 0, { w: hall.w });
  add('wall_l', 'wall', -(hw + 0.6) / 2, 0, 0, 0, { w: hw - 0.6, h: 2.0, d: 0.08 });
  add('wall_r', 'wall', (hw + 0.6) / 2, 0, 0, 0, { w: hw - 0.6, h: 2.0, d: 0.08 });
  add('door', 'door', 0, 0, 0, 0);
  // магазин, лява стена
  add('grill', 'grill', -hw + 0.25, 0, 0.6, L, {}, [[-0.22, SURFACE_Y, 0, ['patty']], [0, SURFACE_Y, 0, ['patty']], [0.22, SURFACE_Y, 0, ['patty']]]);
  add('fryer', 'fryer', -hw + 0.25, 0, 1.3, L, {}, [[0, SURFACE_Y, 0, ['fries']]]);
  add('sign_shop', 'sign', -hw + 0.025, 1.55, (0.04 + hd) / 2, L);
  add('bin_patty', 'bin', -hw + 0.15, 0, 1.78, L, { gives: 'patty' });
  add('bin_fries', 'bin', -hw + 0.15, 0, 2.12, L, { gives: 'fries' });
  // магазин, дясна стена
  add('drinks', 'drinks', hw - 0.2, 0, 0.5, R, {}, [[-0.12, SURFACE_Y, 0.08, ['cup']], [0.12, SURFACE_Y, 0.08, ['cup']]]);
  add('bin_cup', 'bin', hw - 0.15, 0, 0.98, R, { gives: 'cup' });
  add('prep', 'prep', hw - 0.25, 0, 1.65, R, {}, [[-0.2, SURFACE_Y, 0, ['plate']], [0.2, SURFACE_Y, 0, ['plate']]]);
  add('bin_plate', 'bin', hw - 0.15, 0, 2.25, R, { gives: 'plate' });
  // магазин, по преградата
  add('bin_bun_bottom', 'bin', -2.1, 0, 0.2, 0, { gives: 'bun_bottom' });
  add('bin_bun_top', 'bin', -1.75, 0, 0.2, 0, { gives: 'bun_top' });
  add('bin_cheese', 'bin', -1.4, 0, 0.2, 0, { gives: 'cheese' });
  add('bin_lettuce', 'bin', -1.05, 0, 0.2, 0, { gives: 'lettuce' });
  add('trash_shop', 'trash', 1.1, 0, 0.23, 0, {}, [[0, 0.6, 0, ITEM_KINDS]]);
  // ниво 0, складът зад щанда (z < 0): кашоните със съставките и кош
  ING.forEach((k, i) => add(`bin_${k}`, 'bin', -hw + 0.15, 0, -0.55 - i * 0.35, L, { gives: k }));
  add('bin_beaker', 'bin', -hw + 0.15, 0, -1.95, L, { gives: 'beaker' });
  add('trash_lab', 'trash', hw - 0.18, 0, -0.6, R, {}, [[0, 0.6, 0, ITEM_KINDS]]);
  // асансьорът: в задния десен ъгъл на склада, на едно и също място на двете нива; вратите гледат към +Z
  const EL = { x: +(hw - 0.8).toFixed(3), z: +(-hd + 0.8).toFixed(3), w: 1.6, d: 1.6 };
  add('elevator', 'elevator', EL.x, 0, EL.z, 0);
  // ниво 1, подземната лаборатория (цялата зала)
  add('mixer', 'mixer', -1.9, 0, -hd + 0.25, 0, { level: 1 }, [[0, SURFACE_Y, 0, ['beaker']]]);
  add('burner', 'burner', -1.0, 0, -hd + 0.25, 0, { level: 1 }, [[0, SURFACE_Y, 0, ['beaker']]]);
  add('packer', 'packer', -0.05, 0, -hd + 0.25, 0, { level: 1 }, [[-0.16, SURFACE_Y, 0, ['tray']]]);
  add('sign_lab', 'sign', -hw + 0.025, 1.55, 0.2, L, { level: 1 });
  add('grow', 'grow', 0.2, 0, hd - 0.25, Math.PI, { level: 1 });
  add('hatch', 'hatch', hw - 0.1, 0.9, 1.2, R, { level: 1 }, [[0, 0.2, 0.05, ['bag']]]);
  add('trash_down', 'trash', -hw + 0.18, 0, 1.7, L, { level: 1 }, [[0, 0.6, 0, ITEM_KINDS]]);

  // ---------- състояние ----------

  let phase = 'tutorial', left = duration.tutorial, clock = 0, lastNow = null;
  let money = 0, cover = 0.8, suspicion = 0.05;
  let result = null;
  let patrol = null, nextPatrol = Infinity, patrolChecked = false;
  let nextCustomer = 0, custSeq = 1, lookSeq = 0, orderSeq = 0;
  let evSeq = 1;
  const events = [];
  const items = new Map();
  let itemSeq = 1;
  const customers = [];
  const players = new Map();
  const st = {
    mixer: { recipe: [] },
    burner: { needle: 0, zone: [0.55, 0.78], hits: 0 },
    packer: { progress: 0 },
    door: { open: 0 },
    shutter: { open: 1 },
    sign_shop: { text: '' },
    sign_lab: { text: '' },
    grow: { stage: 0, dry: false, ready: false },
    elevator: { doors: 1, moving: false, level: 0, riders: [] },
  };
  const ride = { step: 'idle', t: 0, to: 0 };         // idle → closing (1 с) → moving (3 с) → opening (1 с)
  let growWet = 10;

  function join(p) { players.set(p.id, { id: p.id, n: p.n, name: p.name, served: 0, cooked: 0, packed: 0, mistakes: 0, hidden: false, head: [0, 1.65, 0], anchor: null, level: 0 }); }
  join(me);
  if (bot) join(bot);

  const defState = kind => {
    switch (kind) {
      case 'patty': case 'fries': return { cook: 0 };
      case 'cup': return { fill: 0, drink: null };
      case 'plate': return { stack: [], cooks: [] };
      case 'beaker': return { mix: [], mixed: false, heat: 0, ruined: false };
      case 'tray': return { ready: true };
      default: return {};
    }
  };
  function spawn(kind, props = {}) {
    const it = { id: itemSeq++, kind, x: 0, y: 0, z: 0, yaw: 0, holder: null, hand: null, slot: null, state: defState(kind), die: 0, by: null, ...props };
    if (!it.state) it.state = {};
    if (it.level == null) it.level = it.holder != null ? players.get(it.holder)?.level || 0 : 0;
    items.set(it.id, it);
    return it;
  }
  function destroy(it, poof) {
    if (it.slot) slotItem[it.slot] = null;
    items.delete(it.id);
    if (poof) ev('poof', it);
  }
  function ev(kind, pos, extra) {
    const e = { id: evSeq++, kind, at: clock, ...(pos ? { x: +pos.x.toFixed(3), y: +(pos.y ?? 1).toFixed(3), z: +pos.z.toFixed(3) } : null), ...extra };
    events.push(e);
    return e;
  }
  let actHand = 'r';
  const deny = (pid, text) => { const h = players.get(pid)?.hands?.[actHand]; return ev('deny', h ? { x: h[0], y: h[1], z: h[2] } : null, { player: pid, text }); };
  const held = (pid, hand) => { for (const it of items.values()) if (it.holder === pid && it.hand === hand) return it; return null; };

  function newRecipe() {
    const n = 3 + (rnd() < 0.4 ? 1 : 0), r = [];
    for (let i = 0; i < n; i++) r.push(pick(ING));
    st.mixer.recipe = r;
    st.sign_lab.text = `Рецепта: ${r.map(k => LETTER[k]).join(' ')}`;
  }

  const HINT = {
    tutorial: 'Направи бургер: питка, кюфте, питка',
    day: 'Обслужете клиентите',
    closing: theme === 'kids' ? 'Затваряме. Към тайния лаб' : 'Затваряме. Към задната стая',
    night: 'Смеси, свари, опаковай, продай',
    rush: theme === 'kids' ? 'Магазинът и лабът работят заедно' : 'Магазинът и задната стая заедно',
    raid: 'Проверка! Изхвърлете всичко от задната стая',
    over: 'Край на смяната',
  };
  const SHOP_SIGN = { tutorial: 'Питка, кюфте, питка', day: 'Отворено', closing: 'Затваряме', night: 'Затворено', rush: 'Отворено', raid: 'Проверка', over: 'Затворено' };

  function setPhase(p) {
    phase = p;
    left = duration[p] ?? 0;
    st.sign_shop.text = SHOP_SIGN[p];
    ev('phase', null, { text: p });
    if (p === 'closing' || p === 'night' || p === 'raid' || p === 'over') for (const c of customers) if (c.state !== 'out') { c.state = 'out'; c.t = 0; }
    if (p === 'night') { newRecipe(); nextPatrol = clock + 10; }
    if (p === 'rush') nextPatrol = Math.min(nextPatrol, clock + 14);
    if (p === 'day' || p === 'rush' || p === 'tutorial') nextCustomer = clock + 1;
    if (p === 'raid' || p === 'over') { nextPatrol = Infinity; if (patrol) endPatrol(); }
    if (p === 'over') finish();
  }
  function finish() {
    let evidence = 0;
    for (const it of items.values()) {
      if (!LAB_KINDS.has(it.kind)) continue;
      evidence++;
      if (it.holder == null) ev('cash', { x: it.x, y: it.y + 0.2, z: it.z }, { amount: -15 });
    }
    money = Math.max(0, money - evidence * 15);
    suspicion = Math.min(1, suspicion + evidence * 0.05);
    const n = players.size || 1;
    const per = money / n;
    let stars = per >= 120 ? 5 : per >= 80 ? 4 : per >= 45 ? 3 : per >= 15 ? 2 : 1;
    if (suspicion > 0.6) stars = Math.max(1, stars - 1);
    result = {
      money, stars, caught: suspicion >= 1,
      players: [...players.values()].map(p => ({ id: p.id, n: p.n, name: p.name, served: p.served, cooked: p.cooked, packed: p.packed, mistakes: p.mistakes })),
    };
  }

  // ---------- клиенти ----------

  const DAY_ORDERS = [
    () => ({ kind: 'burger', stack: ['bun_bottom', 'patty', 'bun_top'] }),
    () => ({ kind: 'fries' }),
    () => ({ kind: 'cup', drink: 'cola' }),
    () => ({ kind: 'burger', stack: ['bun_bottom', 'patty', 'cheese', 'bun_top'] }),
    () => ({ kind: 'cup', drink: 'orange' }),
    () => ({ kind: 'burger', stack: ['bun_bottom', 'lettuce', 'patty', 'cheese', 'bun_top'] }),
  ];
  function spawnCustomer() {
    const free = seats.filter(s => !customers.some(c => c.seat === s.i));
    if (!free.length) return;
    const seat = phase === 'tutorial' ? free[0] : pick(free);
    const special = phase === 'rush' && rnd() < 0.4;
    const order = special ? { kind: 'bag' } : phase === 'tutorial' ? DAY_ORDERS[0]() : DAY_ORDERS[orderSeq++ % DAY_ORDERS.length]();
    customers.push({ id: custSeq++, look: lookSeq++ % 6, seat: seat.i, x: seat.x + 0.9, z: seat.z + 3.2, yaw: Math.PI, state: 'in', patience: 1, order, special, t: 0 });
  }
  function tickCustomers(dt) {
    const open = phase === 'tutorial' || phase === 'day' || phase === 'rush';
    const cap = phase === 'tutorial' ? 2 : 3;
    if (open && clock >= nextCustomer && customers.filter(c => c.state !== 'out').length < cap) {
      spawnCustomer();
      nextCustomer = clock + (phase === 'tutorial' ? 2.5 : 5 + rnd() * 3);
    }
    for (let i = customers.length - 1; i >= 0; i--) {
      const c = customers[i], seat = seats[c.seat];
      c.t += dt;
      if (c.state === 'in') {
        const dx = seat.x - c.x, dz = seat.z - c.z, dist = Math.hypot(dx, dz), step = 1.7 * dt;
        if (dist <= step) { c.x = seat.x; c.z = seat.z; c.state = 'wait'; c.t = 0; }
        else { c.x += dx / dist * step; c.z += dz / dist * step; }
      } else if (c.state === 'wait') {
        if (phase !== 'tutorial') c.patience = Math.max(0, c.patience - dt / 40);
        if (c.patience <= 0) { c.state = 'angry'; c.t = 0; cover = Math.max(0, cover - 0.08); ev('order_bad', { x: c.x, y: 1.9, z: c.z }); }
      } else if (c.state === 'happy' || c.state === 'angry') {
        if (c.t > 1.4) { c.state = 'out'; c.t = 0; }
      } else if (c.state === 'out') {
        c.x -= 0.5 * dt; c.z += 1.7 * dt;
        if (c.z > seat.z + 3.4) customers.splice(i, 1);
      }
    }
  }
  function orderMatches(order, it) {
    if (order.kind === 'burger') {
      if (it.kind !== 'plate') return false;
      const s = it.state.stack;
      if (s.length !== order.stack.length || s.some((k, i) => k !== order.stack[i])) return false;
      return it.state.cooks.every(c => c >= 0.8 && c < 1.6);
    }
    if (order.kind === 'fries') return it.kind === 'fries' && it.state.cook >= 0.8 && it.state.cook < 1.6;
    if (order.kind === 'cup') return it.kind === 'cup' && it.state.fill >= 0.9 && it.state.drink === order.drink;
    if (order.kind === 'bag') return it.kind === 'bag';
    return false;
  }
  function serve(pid, it, slot) {
    const c = customers.find(k => k.seat === slot.index && (k.state === 'wait' || k.state === 'in'));
    if (!c) return false;              // няма клиент: предметът остава на тезгяха
    const p = players.get(pid);
    const pos = { x: slot.x, y: slot.y + 0.25, z: slot.z };
    if (orderMatches(c.order, it)) {
      const base = c.order.kind === 'burger' ? 8 + 2 * c.order.stack.length : c.order.kind === 'fries' ? 5 : c.order.kind === 'cup' ? 4 : 25;
      const amount = base + Math.round(c.patience * 4);
      money += amount; cover = Math.min(1, cover + 0.05);
      if (p) p.served++;
      c.state = 'happy'; c.t = 0;
      ev('cash', pos, { amount, player: pid });
      ev('order_ok', pos, { player: pid });
      destroy(it, false);
    } else if (phase === 'tutorial') {
      ev('order_bad', pos, { player: pid, text: 'Не е това' });
      return false;
    } else {
      if (p) p.mistakes++;
      cover = Math.max(0, cover - 0.1);
      c.state = 'angry'; c.t = 0;
      ev('order_bad', pos, { player: pid });
      destroy(it, true);
    }
    return true;
  }

  // ---------- действия ----------

  function act(msg, pid = me.id) {
    if (!msg || result) return;
    const hand = msg.hand === 'l' ? 'l' : 'r';
    actHand = hand;
    const lv = players.get(pid)?.level || 0;
    switch (msg.a) {
      case 'grab': {
        const it = items.get(msg.item);
        if (!it || it.holder != null) return deny(pid, 'Заето е');
        if (it.level !== lv) return deny(pid, 'Далече е');
        if (held(pid, hand)) return deny(pid, 'Ръката е пълна');
        if (it.slot) { slotItem[it.slot] = null; it.slot = null; }
        it.holder = pid; it.hand = hand; it.die = 0; it.by = pid;
        return;
      }
      case 'take': {
        const s = byId.get(msg.station);
        if (!s || s.kind !== 'bin') return deny(pid, 'Оттук не се взима');
        if (s.level !== lv) return deny(pid, 'Далече е');
        if (held(pid, hand)) return deny(pid, 'Ръката е пълна');
        if (LAB_KINDS.has(s.gives) && (phase === 'tutorial' || phase === 'day')) return deny(pid, 'Задната стая е затворена');
        spawn(s.gives, { holder: pid, hand, by: pid, x: s.x, y: s.y + s.h, z: s.z, level: lv });
        return;
      }
      case 'release': {
        const it = held(pid, hand);
        if (!it) return;
        const p = Array.isArray(msg.p) ? { x: +msg.p[0] || 0, y: +msg.p[1] || 0, z: +msg.p[2] || 0 } : { x: 0, y: 1, z: 0 };
        release(pid, it, p, +msg.yaw || 0);
        return;
      }
      case 'use': return use(pid, byId.get(msg.station), msg.control);
    }
  }

  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  function release(pid, it, p, yaw) {
    const lv = players.get(pid)?.level || 0;
    it.holder = null; it.hand = null; it.yaw = yaw; it.level = lv;
    // 1. свободно гнездо до 0.30 м
    let best = null, bd = 0.30;
    for (const slot of slotDefs.values()) {
      if (slot.level !== lv || slotItem[slot.id] != null || !slot.accepts.includes(it.kind)) continue;
      const d = dist3(p, slot);
      if (d <= bd) { bd = d; best = slot; }
    }
    if (best) {
      const s = best.station;
      if (s.kind === 'trash') return destroy(it, true);
      if (s.kind === 'hatch') {
        money += 25;
        ev('cash', { x: best.x, y: best.y + 0.2, z: best.z }, { amount: 25, player: pid });
        ev('sold', best, { player: pid });
        return destroy(it, false);
      }
      it.x = best.x; it.y = best.y; it.z = best.z; it.yaw = s.yaw;
      if (s.kind === 'counter' && serve(pid, it, best)) return;
      it.slot = best.id; slotItem[best.id] = it.id;
      return;
    }
    // 2. част за бургер върху чиния до 0.25 м
    if (PARTS.includes(it.kind)) {
      const plate = nearest(p, 'plate', 0.25, it);
      if (plate) {
        plate.state.stack.push(it.kind);
        if (it.kind === 'patty') plate.state.cooks.push(+it.state.cook.toFixed(2));
        return destroy(it, false);
      }
    }
    // 3. съставка в колба до 0.25 м
    if (ING.includes(it.kind)) {
      const beaker = nearest(p, 'beaker', 0.25, it);
      if (beaker && !beaker.state.mixed) { beaker.state.mix.push(it.kind); return destroy(it, false); }
    }
    // 4. върху плот на станция
    for (const s of stations) {
      if (s.level !== lv || s.kind === 'wall' || s.kind === 'door' || s.kind === 'shutter' || s.kind === 'sign' || s.kind === 'hatch' || s.kind === 'bin' || s.kind === 'elevator') continue;
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), dx = p.x - s.x, dz = p.z - s.z;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c, top = s.y + s.h;
      if (Math.abs(lx) <= s.w / 2 && Math.abs(lz) <= s.d / 2 && p.y >= top - 0.15 && p.y <= top + 0.4) {
        it.x = p.x; it.y = top; it.z = p.z;
        return;
      }
    }
    // 5. на пода: изчезва след 3 с
    it.x = p.x; it.y = 0; it.z = p.z; it.die = clock + 3;
  }
  function nearest(p, kind, max, skip) {
    let best = null, bd = max;
    for (const o of items.values()) {
      if (o === skip || o.kind !== kind || o.holder != null || o.level !== skip.level) continue;
      const d = dist3(p, o);
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  }
  const inSlot = (s, i) => { const id = slotItem[s.slots[i]?.id]; return id != null ? items.get(id) : null; };

  const headIn = pl => Math.abs(pl.head[0] - EL.x) <= EL.w / 2 && Math.abs(pl.head[2] - EL.z) <= EL.d / 2;
  function use(pid, s, control) {
    if (!s) return deny(pid, 'Няма такава станция');
    const p = players.get(pid);
    if (s.kind === 'elevator') {
      if (ride.step !== 'idle') return;                // докато пътува, бутонът не прави нищо
      const E = st.elevator;
      if (E.level === p.level && !headIn(p)) return deny(pid, 'Влез в кабината');
      // вътре: возене до другото ниво; отвън, когато кабината е на другото ниво: викам я
      ride.to = E.level === p.level ? 1 - E.level : p.level;
      ride.step = 'closing'; ride.t = 1;
      return;
    }
    if (s.level !== p.level) return deny(pid, 'Далече е');
    if (s.kind === 'grow') {
      const G = st.grow, at = { x: s.x, y: s.y + s.h + 0.2, z: s.z };
      if (G.stage >= 1) { G.stage = 0; G.dry = false; G.ready = false; growWet = 8 + rnd() * 5; money += 30; ev('harvest', at, { player: pid }); ev('cash', at, { amount: 30, player: pid }); return; }
      if (G.dry) { G.dry = false; growWet = 8 + rnd() * 5; ev('water', at, { player: pid }); return; }
      return deny(pid, 'Още расте');
    }
    if (s.kind === 'drinks') {
      const i = control === 1 ? 1 : 0, cup = inSlot(s, i);
      if (!cup) return deny(pid, 'Сложи чаша под крана');
      cup.state.drink = i === 0 ? 'cola' : 'orange';
      cup.state.fill = Math.min(1, +(cup.state.fill + 0.34).toFixed(2));
      return;
    }
    if (s.kind === 'mixer') {
      const b = inSlot(s, 0);
      if (!b) return deny(pid, 'Сложи колба');
      const r = st.mixer.recipe, ok = b.state.mix.length === r.length && b.state.mix.every((k, i) => k === r[i]);
      if (ok) { b.state.mixed = true; ev('mix_ok', { x: b.x, y: b.y + 0.2, z: b.z }, { player: pid }); newRecipe(); }
      else { b.state.mix = []; ev('mix_bad', { x: b.x, y: b.y + 0.2, z: b.z }, { player: pid }); if (p) p.mistakes++; }
      return;
    }
    if (s.kind === 'burner') {
      const b = inSlot(s, 0);
      if (!b) return deny(pid, 'Сложи колба');
      if (!b.state.mixed) return deny(pid, 'Първо разбъркай');
      const n = st.burner.needle, pos = { x: b.x, y: b.y + 0.25, z: b.z };
      if (n >= st.burner.zone[0] && n <= st.burner.zone[1]) {
        st.burner.hits++; b.state.heat = st.burner.hits / 3;
        ev('hit', pos, { player: pid });
        if (st.burner.hits >= 3) {
          destroy(b, false);
          st.burner.hits = 0;
          spawn('tray', { x: s.slots[0].x, y: s.y + s.h, z: s.slots[0].z, yaw: s.yaw, by: pid });
          if (p) p.cooked++;
        }
      } else { suspicion = Math.min(1, suspicion + 0.05); ev('miss', pos, { player: pid }); }
      return;
    }
    if (s.kind === 'packer') {
      const tray = inSlot(s, 0);
      if (!tray) return deny(pid, 'Сложи табла');
      st.packer.progress = +(st.packer.progress + 0.25).toFixed(2);
      ev('pack', { x: tray.x, y: tray.y + 0.15, z: tray.z }, { player: pid });
      if (st.packer.progress >= 1) {
        destroy(tray, false);
        st.packer.progress = 0;
        const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        for (let i = 0; i < 4; i++) {
          const lx = i % 2 ? 0.24 : 0.10, lz = i < 2 ? -0.07 : 0.07;
          spawn('bag', { x: s.x + lx * c + lz * sn, y: s.y + s.h, z: s.z - lx * sn + lz * c, yaw: s.yaw, by: pid });
        }
        if (p) p.packed++;
      }
      return;
    }
    deny(pid, 'Тук няма бутон');
  }

  // ---------- патрул ----------

  function startPatrol() { patrol = { left: 3, phase: 'warn' }; ev('patrol_warn'); }
  function endPatrol() { patrol = null; for (const p of players.values()) { p.hidden = false; p.anchor = null; } ev('patrol_off'); }
  function tickPatrol(dt) {
    if (!patrol) {
      if ((phase === 'night' || phase === 'rush') && clock >= nextPatrol) { startPatrol(); nextPatrol = clock + 28; }
      return;
    }
    patrol.left -= dt;
    if (patrol.phase === 'warn') {
      if (patrol.left <= 0) {
        patrol = { left: 6, phase: 'on' }; patrolChecked = false;
        for (const p of players.values()) p.anchor = [...p.head];
        ev('patrol_on');
      }
      return;
    }
    for (const p of players.values()) {
      const a = p.anchor || p.head;
      const still = Math.hypot(p.head[0] - a[0], p.head[1] - a[1], p.head[2] - a[2]) <= 0.15;
      p.hidden = p.level === 0 && (bot && p.id === bot.id ? true : (p.head[1] < 1.15 || still));
    }
    if (!patrolChecked && patrol.left <= 3) {
      patrolChecked = true;
      for (const p of players.values()) {
        if (p.hidden || p.level !== 0) continue;     // долу патрулът не вижда
        suspicion = Math.min(1, suspicion + 0.12);
        ev('caught', { x: p.head[0], y: p.head[1], z: p.head[2] }, { player: p.id });
      }
    }
    if (patrol.left <= 0) endPatrol();
  }

  // ---------- време ----------

  let botSwap = 0, botItem = null;
  function tickBot() {
    if (!bot || clock < botSwap) return;
    botSwap = clock + 12;
    if (botItem && items.has(botItem.id) && botItem.holder === bot.id) destroy(botItem, false);
    const plate = !botItem || botItem.kind !== 'plate';
    botItem = plate
      ? spawn('plate', { holder: bot.id, hand: 'r', state: { stack: ['bun_bottom', 'patty', 'cheese', 'bun_top'], cooks: [1] } })
      : spawn('cup', { holder: bot.id, hand: 'l', state: { fill: 1, drink: 'orange' } });
  }

  function tick(now) {
    if (lastNow == null) lastNow = now;
    const dt = Math.max(0, Math.min(0.5, (now - lastNow) / 1000)) * speed;
    lastNow = now;
    if (result) { clock += dt; trimEvents(); return; }
    clock += dt;
    left -= dt;
    if (left <= 0) setPhase(ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(phase) + 1)]);
    if (result) return;

    // скара и фритюрник
    for (const s of stations) {
      if (s.kind !== 'grill' && s.kind !== 'fryer') continue;
      for (let i = 0; i < s.slots.length; i++) {
        const it = inSlot(s, i);
        if (!it || !it.state) continue;
        const before = it.state.cook;
        it.state.cook = Math.min(2, before + dt / (s.kind === 'grill' ? 7 : 6));
        if (before < 1 && it.state.cook >= 1) { const p = players.get(it.by); if (p) p.cooked++; }
        if (before < 1.6 && it.state.cook >= 1.6) ev('burn', { x: it.x, y: it.y + 0.1, z: it.z });
      }
    }
    // игла
    const ph = (clock * 0.55) % 2;
    st.burner.needle = +(ph < 1 ? ph : 2 - ph).toFixed(3);
    // врата и ролетка
    const shopOpen = phase === 'tutorial' || phase === 'day' || phase === 'rush';
    const labOpen = phase !== 'tutorial' && phase !== 'day';
    st.shutter.open = +approach(st.shutter.open, shopOpen ? 1 : 0, dt * 0.5).toFixed(3);
    st.door.open = +approach(st.door.open, labOpen ? 1 : 0, dt * 0.5).toFixed(3);
    // на пода
    for (const it of [...items.values()]) if (it.die && clock >= it.die && it.holder == null) destroy(it, true);

    tickElevator(dt);
    if ((phase === 'night' || phase === 'rush') && !st.grow.dry && st.grow.stage < 1) {     // лехата расте и засъхва
      st.grow.stage = +Math.min(1, st.grow.stage + dt / 40).toFixed(3);
      st.grow.ready = st.grow.stage >= 1;
      growWet -= dt;
      if (!st.grow.ready && growWet <= 0) st.grow.dry = true;
    }
    tickCustomers(dt);
    tickPatrol(dt);
    tickBot();
    if (suspicion >= 1 && !result) setPhase('over');
    trimEvents();
  }
  const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
  function tickElevator(dt) {
    const E = st.elevator;
    E.riders = [...players.values()].filter(pl => pl.level === E.level && headIn(pl)).map(pl => pl.id);
    if (ride.step === 'idle') return;
    ride.t -= dt;
    if (ride.step === 'closing') {
      E.doors = +Math.max(0, ride.t).toFixed(3);
      if (ride.t <= 0) { ride.step = 'moving'; ride.t = 3; E.doors = 0; E.moving = true; ev('ride_start', { x: EL.x, y: 1.2, z: EL.z }, { to: ride.to }); }
    } else if (ride.step === 'moving') {
      if (ride.t <= 0) {
        for (const pl of players.values()) if (pl.level === E.level && headIn(pl)) pl.level = ride.to;   // всички вътре сменят нивото
        E.level = ride.to; E.moving = false;
        ride.step = 'opening'; ride.t = 1;
        ev('ride_end', { x: EL.x, y: 1.2, z: EL.z }, { to: ride.to });
      }
    } else if (ride.step === 'opening') {
      E.doors = +Math.min(1, 1 - ride.t).toFixed(3);
      if (ride.t <= 0) { E.doors = 1; ride.step = 'idle'; }
    }
  }
  function trimEvents() { while (events.length && clock - events[0].at > 3) events.shift(); }

  st.sign_shop.text = SHOP_SIGN.tutorial;
  st.sign_lab.text = 'Затворено\nдо довечера';

  // ---------- навън ----------

  function start() {
    return {
      type: 'gameStart', game: 'backroom', theme,
      hall: { ...hall },
      levels: 2,
      elevator: { ...EL },
      stations: stations.map(s => ({ ...s, slots: s.slots.map(sl => ({ ...sl, accepts: [...sl.accepts] })) })),
      seats: seats.map(s => ({ ...s })),
      duration: { ...duration },
    };
  }
  function snapshot() {
    return {
      type: 'game', t: Math.round(clock * 1000),
      phase, left: +Math.max(0, left).toFixed(1),
      money, cover: +cover.toFixed(3), suspicion: +suspicion.toFixed(3),
      hint: HINT[phase],
      stations: Object.entries(st).map(([id, state]) => ({ id, state: JSON.parse(JSON.stringify(state)) })),
      slots: { ...slotItem },
      items: [...items.values()].map(it => ({
        id: it.id, kind: it.kind, x: +it.x.toFixed(3), y: +it.y.toFixed(3), z: +it.z.toFixed(3), yaw: +it.yaw.toFixed(3),
        holder: it.holder, hand: it.hand, slot: it.slot, state: it.state ? JSON.parse(JSON.stringify(it.state)) : null,
        level: it.holder != null ? players.get(it.holder)?.level || 0 : it.level || 0,
      })),
      customers: customers.map(c => ({
        id: c.id, look: c.look, seat: c.seat, x: +c.x.toFixed(3), z: +c.z.toFixed(3), yaw: c.yaw, state: c.state,
        patience: +c.patience.toFixed(3), order: JSON.parse(JSON.stringify(c.order)), special: c.special,
      })),
      players: [...players.values()].map(p => ({ id: p.id, n: p.n, name: p.name, served: p.served, cooked: p.cooked, packed: p.packed, mistakes: p.mistakes, hidden: p.hidden, level: p.level })),
      patrol: patrol ? { left: +Math.max(0, patrol.left).toFixed(1), phase: patrol.phase } : null,
      events: events.map(({ at, ...e }) => e),
      result: result ? JSON.parse(JSON.stringify(result)) : null,
    };
  }

  return {
    start, snapshot, act, tick,
    /** последната поза на играч: 21 числа като при истинския сървър (ползва се само главата) */
    pose(id, p) {
      const pl = players.get(id);
      if (!pl || !p) return;
      pl.head[0] = p[0]; pl.head[1] = p[1]; pl.head[2] = p[2];
      if (p.length >= 21) pl.hands = { l: [p[7], p[8], p[9]], r: [p[14], p[15], p[16]] };
    },
    get over() { return !!result; },
    // за пробната страница
    next() { if (!result) setPhase(ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(phase) + 1)]); },
    goto(p) { if (!result && ORDER.includes(p)) setPhase(p); },
    patrolNow() { if (!patrol && !result) startPatrol(); },
    spawn(kind, props) { return spawn(kind, props); },
    debug: { items, customers, players, stations, slotItem, st, me, bot, get phase() { return phase; }, get money() { return money; }, get patrol() { return patrol; } },
  };
}

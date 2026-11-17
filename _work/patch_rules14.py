"""The Back Room 1.4, rules: the career. Run from lobby-stage.
Menu and pause (time stands still), day after day with autosave, ranks by total earnings, upgrades bought on the screen,
three goals a day with a bonus, dealers that sell from the blue cabinet, the old grinder as a brick press, no trapdoor,
the carry box takes 15 packets and gives out the one asked for. Without opts.career the game is the old open one."""
import io

p = 'game/backroom.js'
s = io.open(p, encoding='utf-8').read()
n = 0


def rep(a, b, count=1):
    global s, n
    assert s.count(a) == count, (s.count(a), a[:100])
    s = s.replace(a, b)
    n += 1


# ───── numbers ─────
rep("  lab: { shred: 2.5, mix: 3, grow: 25, door: 0.6, tilt: 100, rate: 30, mouth: 0.16, reachXZ: 0.24, batch: 50, buds: 3, box: 6, pack: 0.30, tol: 0.15, stray: 0.12, roll: 0.5 },",
    "  lab: { shred: 2.5, mix: 3, grow: 25, door: 0.6, tilt: 100, rate: 30, mouth: 0.16, reachXZ: 0.24, batch: 50, buds: 3, box: 15, pack: 0.32, tol: 0.15, stray: 0.12, roll: 0.5 },\n"
    "  // the press (the old grinder table): three packets of one kind on a tray and three good pulls of the lever make a brick\n"
    "  press: { per: 3, value: 1.6 },\n"
    "  // a dealer takes what lies on his shelf of the blue cabinet at 08:00 and sells one packet every `every` seconds of the day\n"
    "  dealer: { cut: 0.3, every: [40, 32, 25] },\n"
    "  // the career: money at the start, ranks by everything ever earned, the upgrades of the screen (id, name, price, rank)\n"
    "  career: {\n"
    "    money: 40, goalBase: 40, goalDay: 15,\n"
    "    ranks: [['Kitchen help', 0], ['Cook', 300], ['Owner', 1200], ['Supplier', 3500], ['Boss', 8000], ['Kingpin', 16000]],\n"
    "    unlocks: [\n"
    "      ['veg', 'Mushrooms', 40, 0], ['orange', 'Orange juice', 30, 0], ['ham', 'Ham', 60, 0], ['greens', 'Greens', 50, 0],\n"
    "      ['onion', 'Onion', 50, 1], ['white', 'White sauce', 60, 1], ['meat', 'Salami', 80, 1], ['bacon', 'Bacon', 90, 1], ['mustard', 'Mustard sauce', 70, 1],\n"
    "      ['hotoven', 'Hot oven: bakes twice as fast', 200, 1], ['cellar', 'Cellar key: plants, shredder, papers', 300, 1],\n"
    "      ['shrimp', 'Shrimp', 120, 2], ['pineapple', 'Pineapple', 90, 2], ['lamp', 'Grow lamp: plants twice as fast', 300, 2],\n"
    "      ['mixer', 'Mixer and the blue ice recipe', 450, 2], ['street', 'Street: the back alley', 350, 2], ['pills', 'Recipe: pills', 400, 2],\n"
    "      ['powder', 'Recipe: powder', 500, 3], ['plaza', 'Street: the plaza', 700, 3], ['dealer_alley', 'Dealer in the back alley', 600, 3], ['candy', 'Recipe: candy', 700, 3],\n"
    "      ['crystal', 'Recipe: crystal', 1100, 4], ['syrup', 'Recipe: syrup', 900, 4], ['park', 'Street: the park', 1500, 4], ['dealer_plaza', 'Dealer on the plaza', 1500, 4],\n"
    "      ['press', 'Brick press', 2000, 4], ['dealer_park', 'Dealer in the park', 3000, 5], ['block', 'Buy the whole block', 25000, 5],\n"
    "    ],\n"
    "  },")
rep("  sell: { buds: 20, joint: 40, powder: 35, pills: 45, candy: 50, syrup: 55, ice: 60, crystal: 90, pure: 1.5 },",
    "  sell: { buds: 20, joint: 40, powder: 35, pills: 45, candy: 50, syrup: 55, ice: 60, crystal: 90, brick: 150, pure: 1.5 },")
rep("const SELL = ['buds', 'joint', 'ice', 'pills', 'powder', 'crystal', 'candy', 'syrup'];      // the product of the cellar: sold in the street",
    "const SELL = ['buds', 'joint', 'ice', 'pills', 'powder', 'crystal', 'candy', 'syrup', 'brick'];      // the product of the cellar: sold in the street\n"
    "const PRESSABLE = ['buds', 'joint', 'ice', 'pills', 'powder', 'crystal', 'candy', 'syrup'];\n"
    "// what each product needs in the career; what each liquid of the store needs\n"
    "const NEEDS = { buds: ['cellar'], joint: ['cellar'], ice: ['mixer'], pills: ['pills'], powder: ['powder'], crystal: ['crystal'], candy: ['candy'], syrup: ['syrup'], brick: ['press'] };\n"
    "const STORE_NEEDS = { seeds: ['cellar'], papers: ['cellar'], box: ['cellar'], blue: ['mixer'], clear: ['mixer'], red: ['pills', 'candy'], green: ['crystal', 'syrup'], yellow: ['candy', 'syrup'] };\n"
    "const TOP_LOCKED = new Set(['veg', 'ham', 'greens', 'onion', 'white', 'meat', 'bacon', 'mustard', 'shrimp', 'pineapple']);")
# ───── texts ─────
rep("    noBuyer: 'Nobody is waiting here',\n  },\n};",
    "    noBuyer: 'Nobody is waiting here',\n"
    "    locked: 'Locked: buy it in UPGRADES on the screen',\n"
    "    rank: 'Your rank is too low for that',\n"
    "    owned: 'You have that already',\n"
    "    noTrayIn: 'Put a tray on the press',\n"
    "    trayFull: 'Three on the tray already',\n"
    "    traySame: 'One kind per tray',\n"
    "    needThree: 'Put three packets on the tray',\n"
    "    paused: 'The game is paused',\n"
    "  },\n"
    "  career: {\n"
    "    menu: 'Point at the screen and pull the trigger: CONTINUE or NEW CAREER.',\n"
    "    paused: 'Paused. RESUME, or SAVE AND QUIT.',\n"
    "  },\n"
    "};")
rep("    kidsNight: 'Night: the shop is shut. The lift goes down to the store.',\n  },",
    "    kidsNight: 'Night: the shop is shut. The lift goes down to the store.',\n"
    "    upgrade: 'The shop is open. Saving up: look at UPGRADES on the screen for what to buy next.',\n"
    "    cellarFirst: 'Night: the shop is shut. Buy the CELLAR KEY in UPGRADES to work at night, or wait for the morning.',\n"
    "    press: 'Three packets of one kind on a tray on the press, then pull the lever when the needle is in the green.',\n"
    "  },")

# ───── layout: no trapdoor buttons in the standard theme ─────
rep("  for (const s of seats) {\n    if (natPlan) ctl(add(`btn_${s.i}`, 'button', 0, s.x, NAT.counter.top,",
    "  if (opts.lab === false) for (const s of seats) {      // the trapdoor buttons: only in the kids theme (the courier's crate)\n    if (natPlan) ctl(add(`btn_${s.i}`, 'button', 0, s.x, NAT.counter.top,")

# ───── the game ─────
rep("  const PHASES = opts.tutorial ? PHASES_ALL.slice(0, 3) : ['day', 'night', 'day2'];",
    "  // the career (the standard theme with opts.career): a menu, then day after day until the players save and quit\n"
    "  const career = !!opts.career && !kids;\n"
    "  const PHASES = career ? ['menu', 'day', 'night'] : opts.tutorial ? PHASES_ALL.slice(0, 3) : ['day', 'night', 'day2'];")
rep("  for (const p of PHASES) duration[p] = r3(S(RULES.phases[p]));", "  for (const p of PHASES) duration[p] = r3(S(RULES.phases[p] || 0));")
rep("    fx: { of: RULES.fx.of, text: TX.fx || {} },\n",
    "    fx: { of: RULES.fx.of, text: TX.fx || {} },\n"
    "    career: career ? { unlocks: RULES.career.unlocks.map(([id, name, price, rank]) => ({ id, name, price, rank })), ranks: RULES.career.ranks.map(([name, at]) => ({ name, at })),\n"
    "      storeNeeds: STORE_NEEDS, needs: NEEDS, dealerCells: (layout.street || []).map((b, i) => ({ block: b.id, name: b.name, cell: i })) } : null,\n"
    "    press: RULES.press,\n")
rep("  let phase = PHASES[0], phaseEnd = S(RULES.phases[PHASES[0]]);", "  let phase = PHASES[0], phaseEnd = PHASES[0] === 'menu' ? Infinity : S(RULES.phases[PHASES[0]]);")
rep("  const menu = MENU.filter((st) => st.every((k) => stationById.has(`bin_${k}`)));",
    "  const menuAll = MENU.filter((st) => st.every((k) => stationById.has(`bin_${k}`)));\n"
    "  // ── the career: what is bought, the rank, the goals of the day, the dealers, the save ──\n"
    "  const unlocked = new Set();\n"
    "  const has = (id) => !career || unlocked.has(id);\n"
    "  const hasAny = (list) => !list || list.some(has);\n"
    "  const UNL = new Map(RULES.career.unlocks.map(([id, name, price, rank]) => [id, { id, name, price, rank }]));\n"
    "  let day = 1, earned = 0, dayEarned = 0, paused = false, held = 0, won = false, saveKey = null, saveData = null, saveAsked = false;\n"
    "  let goals = [], stats = {};\n"
    "  const saves = [];\n"
    "  const dealers = blocks.map(() => ({ q: [], next: Infinity }));\n"
    "  const rankOf = (e) => { let r = 0; RULES.career.ranks.forEach(([, at], i) => { if (e >= at) r = i; }); return r; };\n"
    "  const menuNow = () => menuAll.filter((st) => st.every((k) => !TOP_LOCKED.has(k) || has(k)));\n"
    "  const canMake = (k) => !career || (NEEDS[k] ? NEEDS[k].every(has) : true);\n"
    "  /** money that comes in: counts for the rank and the goals */\n"
    "  function earnIn(amount) { money += amount; if (career) { earned += amount; dayEarned += amount; } }\n"
    "  const bump = (k, by = 1) => { stats[k] = (stats[k] || 0) + by; };")
# money in
rep("      const amount = payFor(c, it, who);\n      money += amount;", "      const amount = payFor(c, it, who);\n      earnIn(amount);\n      bump(c.order.kind === 'cup' ? 'drinks' : c.order.kind === 'pizza' ? 'pizzas' : 'served');")
rep("    money += amount; sold++;", "    earnIn(amount); sold++; bump('street');")
rep("  function priceOf_UNUSED() {}", "", 0) if False else None
rep("    const base = RULES.sell[it.kind] * (it.state.pure ? RULES.sell.pure : 1) * b.bonus;", "    const base = priceOf(it) * b.bonus;")
rep("  /** What the buyer of this block asks for: mostly the block's own goods, and rather something that is already made. */",
    "  /** What a packet is worth: a brick is three of its kind, pressed. */\n"
    "  function priceOf(it) {\n"
    "    if (it.kind === 'brick') return Math.round((RULES.sell[it.state.of] || 40) * RULES.press.per * RULES.press.value * (it.state.pure ? RULES.sell.pure : 1));\n"
    "    return RULES.sell[it.kind] * (it.state.pure ? RULES.sell.pure : 1);\n"
    "  }\n"
    "  /** What the buyer of this block asks for: mostly the block's own goods, and rather something that is already made. */")
rep("    const own = blocks[b].wants, ownMade = own.filter((k) => made.has(k)), anyMade = [...made];",
    "    const can = SELL.filter((k) => canMake(k) && (k !== 'brick' || b === blocks.length - 1));\n"
    "    let own = blocks[b].wants.filter(canMake);\n"
    "    if (b === blocks.length - 1 && canMake('brick')) own = own.concat('brick');\n"
    "    if (!own.length) own = can.length ? can : blocks[b].wants;\n"
    "    const ownMade = own.filter((k) => made.has(k)), anyMade = [...made].filter((k) => can.includes(k));")
# customers: no marks in the standard theme; the menu of today; orange only when bought
rep("    if (evening() && rand() < RULES.markShare) return { order: { kind: 'none' }, mark: true };", "    if (kids && evening() && rand() < RULES.markShare) return { order: { kind: 'none' }, mark: true };")
rep("    if (rand() < RULES.cupShare) return { order: { kind: 'cup', drink: rand() < 0.5 ? 'cola' : 'orange' }, mark: false };",
    "    if (rand() < RULES.cupShare) return { order: { kind: 'cup', drink: has('orange') && rand() < 0.5 ? 'orange' : 'cola' }, mark: false };")
rep("    if (evening() && rand() < RULES.meatShare[meatStock > 0 ? 1 : 0]) {", "    if (kids && evening() && rand() < RULES.meatShare[meatStock > 0 ? 1 : 0]) {")
rep("    const pick = menu.length ? menu[Math.min(menu.length - 1, Math.floor(Math.pow(rand(), 1.35) * menu.length))] : ['sauce'];",
    "    const menu = menuNow();\n    const pick = menu.length ? menu[Math.min(menu.length - 1, Math.floor(Math.pow(rand(), 1.35) * menu.length))] : ['sauce', 'cheese'];")
# cooking: the hot oven
rep("        if (c < 1) it.state.cook = Math.min(1, c + h / S(RULES.cookDone));", "        if (c < 1) it.state.cook = Math.min(1, c + h / S(RULES.cookDone) * (career && has('hotoven') ? 2 : 1));")
rep("      q.s = Math.min(1, q.s + h / S(RULES.lab.grow) * (anyFx('rush') ? RULES.fx.rush : 1));", "      q.s = Math.min(1, q.s + h / S(RULES.lab.grow) * (anyFx('rush') ? RULES.fx.rush : 1) * (career && has('lamp') ? 2 : 1));")
# recipes only when bought
rep("    for (const [kind, r] of Object.entries(RECIPES)) {\n      if (!sh.every(", "    for (const [kind, r] of Object.entries(RECIPES)) {\n      if (!canMake(kind)) continue;\n      if (!sh.every(")
rep("        if (benchRec && benchRec.level === pl.level && time >= mixer.until && !mixer.out.length) {", "        if (benchRec && benchRec.level === pl.level && time >= mixer.until && !mixer.out.length && has('mixer')) {")
rep("      if (got) {\n        for (let i = 0; i < n; i++) mixer.out.push(got);", "      if (got) {\n        if (got.pure) bump('pure');\n        bump('packets', n);\n        for (let i = 0; i < n; i++) mixer.out.push(got);")
rep("        shred.out = RULES.lab.buds;", "        shred.out = RULES.lab.buds;\n        bump('shred');")
# trays and the press
rep("      case 'box': return { n: [] };\n      default: return {};", "      case 'box': return { n: [] };\n      case 'tray': return { n: [] };\n      case 'brick': return { of: 'ice', pure: 0 };\n      default: return {};")
rep("    // 0b. a packet of product next to the box (also one held in the other hand): it goes in\n    if (SELL.includes(it.kind)) {",
    """    // 0b. a packet on a tray (on the press or anywhere): up to three of one kind
    if (PRESSABLE.includes(it.kind) && !kids) {
      let tray = null, td = RULES.lab.pack + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== 'tray' || itemLevel(q) !== L || q.holder != null) continue;
        const dd = dist(p, itemPos(q));
        if (dd <= td) { td = dd; tray = q; }
      }
      if (tray) {
        const t = tray.state.n;
        if (t.length >= RULES.press.per) emit('deny', { player: pl.id, level: L, x: p.x, y: p.y, z: p.z, text: TX.deny.trayFull });
        else if (t.length && t[0][0] !== it.kind) emit('deny', { player: pl.id, level: L, x: p.x, y: p.y, z: p.z, text: TX.deny.traySame });
        else {
          t.push([it.kind, it.state.pure ? 1 : 0]);
          emit('packed', { ...itemPos(tray), level: L, player: pl.id });
          removeItem(it);
          return 10;
        }
      }
    }
    // 0c. a packet of product next to the box (also one held in the other hand): it goes in
    if (SELL.includes(it.kind)) {""")
rep("          box.state.n.push([it.kind, it.state.pure ? 1 : 0]);\n          const bp = itemPos(box);",
    "          box.state.n.push(it.kind === 'brick' ? ['brick', it.state.pure ? 1 : 0, it.state.of] : [it.kind, it.state.pure ? 1 : 0]);\n          const bp = itemPos(box);")
rep("    const [kind, pure] = box.state.n.pop(), it = newItem(kind, pl.level);\n    if (pure) it.state.pure = 1;",
    "    // the packet asked for (the one under the hand), else the last one in\n"
    "    let at_ = box.state.n.length - 1;\n"
    "    if (typeof msg.kind === 'string') for (let i = box.state.n.length - 1; i >= 0; i--) if (box.state.n[i][0] === msg.kind) { at_ = i; break; }\n"
    "    const [kind, pure, of] = box.state.n.splice(at_, 1)[0], it = newItem(kind, pl.level);\n"
    "    if (pure) it.state.pure = 1;\n"
    "    if (kind === 'brick' && of) it.state.of = of;")
# the grinder in the standard theme is the press
rep("    if (kind !== 'grinder') return refuse(pl, hp, 'noButton');\n    if (!labOpen()) return refuse(pl, hp, 'labClosed');\n    const G = RULES.grinder, s = rec.slots[0];",
    """    if (kind !== 'grinder') return refuse(pl, hp, 'noButton');
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    if (!kids) return doPress(pl, hp, rec);
    const G = RULES.grinder, s = rec.slots[0];""")
rep("  // ── снимка за каските ──",
    """  // The press: a tray with three packets of one kind; three pulls with the needle in the green make a brick.
  function doPress(pl, hp, rec) {
    if (!has('press')) return refuse(pl, hp, 'locked');
    const G = RULES.grinder, s = rec.slots[0], tray = inSlot(rec);
    if (!tray || tray.kind !== 'tray') return refuse(pl, hp, 'noTrayIn');
    if (tray.state.n.length < RULES.press.per) return refuse(pl, hp, 'needThree');
    if (time < grindCool) return refuse(pl, hp, 'wait');
    grindCool = time + G.cooldown;
    const v = needle();
    if (v >= zone[0] - G.tol && v <= zone[1] + G.tol) {
      grindHits++;
      emit('hit', at(s, { player: pl.id }));
      rollZone();
      if (grindHits >= G.hits) {
        grindHits = 0;
        const n = tray.state.n, b = newItem('brick', rec.level);
        b.state.of = n[0][0]; b.state.pure = n.every((q) => q[1]) ? 1 : 0;
        b.by = pl.id;
        removeItem(tray);
        putInSlot(b, s);
        pl.cooked++;
        bump('brick');
        emit('ground', at(s, { player: pl.id }));
      }
    } else { grindHits = 0; emit('miss', at(s, { player: pl.id })); }
    return { ok: true };
  }

  // ── the career: buying, goals, dealers, saving ──
  function doUnlock(pl, hp, msg) {
    const u = UNL.get(msg.id);
    if (!career || !u) return refuse(pl, hp, 'bad');
    if (unlocked.has(u.id)) return refuse(pl, hp, 'owned');
    if (rankOf(earned) < u.rank) return refuse(pl, hp, 'rank');
    if (money < u.price) return refuse(pl, hp, 'noMoney');
    money -= u.price;
    unlocked.add(u.id);
    if (u.id.startsWith('dealer_')) { const b = blocks.findIndex((q) => `dealer_${q.id}` === u.id); if (b >= 0 && isDay()) dealers[b].next = time + S(RULES.dealer.every[b] || 30); }
    emit('cash', { x: hp.x, y: hp.y + 0.1, z: hp.z, level: pl.level, player: pl.id, amount: -u.price });
    emit('unlocked', { x: hp.x, y: hp.y, z: hp.z, level: pl.level, player: pl.id, text: u.name });
    if (u.id === 'block') { won = true; emit('won', { text: 'You own the block' }); }
    save();
    return { ok: true, id: u.id };
  }
  /** Three goals for the day, chosen from what can be done with what is bought. */
  function newGoals() {
    const d = day, T = [];
    T.push({ id: 'pizzas', n: Math.min(14, 4 + d), text: (n) => `Serve ${n} pizzas` });
    T.push({ id: 'drinks', n: Math.min(8, 2 + Math.floor(d / 2)), text: (n) => `Serve ${n} drinks` });
    T.push({ id: 'earn', n: Math.round(Math.min(5000, 120 * Math.pow(1.4, d - 1)) / 10) * 10, text: (n) => `Earn $${n} today` });
    if (has('cellar')) T.push({ id: 'shred', n: Math.min(4, 1 + Math.floor(d / 3)), text: (n) => `Shred ${n} plants` }, { id: 'rolled', n: Math.min(5, 1 + Math.floor(d / 3)), text: (n) => `Roll ${n} joints` });
    if (has('mixer')) T.push({ id: 'pure', n: 1, text: () => 'Make a pure batch' }, { id: 'packets', n: Math.min(12, 3 + d), text: (n) => `Mix ${n} packets` });
    if (has('street')) T.push({ id: 'street', n: Math.min(15, 2 + Math.floor(d / 2)), text: (n) => `Sell ${n} packets in the street` });
    if (blocks.some((b) => has(`dealer_${b.id}`))) T.push({ id: 'dealt', n: Math.min(12, 3 + Math.floor(d / 2)), text: (n) => `Your dealers sell ${n} packets` });
    if (has('press')) T.push({ id: 'brick', n: 1, text: () => 'Press a brick' });
    const pick = [];
    // the newest things first, so every day shows something to try
    for (const id of ['brick', 'dealt', 'street', 'pure', 'rolled']) { const g = T.find((q) => q.id === id); if (g && pick.length < 2 && rand() < 0.7) pick.push(g); }
    while (pick.length < 3) { const g = T[Math.floor(rand() * T.length)]; if (!pick.includes(g)) pick.push(g); }
    goals = pick.map((g) => ({ id: g.id, n: g.n, text: g.text(g.n), bonus: RULES.career.goalBase + RULES.career.goalDay * d, done: false }));
    stats = {}; dayEarned = 0;
  }
  function stepGoals() {
    if (!career || !isDay() && !isNight()) return;
    for (const g of goals) {
      if (g.done) continue;
      const have = g.id === 'earn' ? dayEarned : stats[g.id] || 0;
      if (have >= g.n) { g.done = true; earnIn(g.bonus); emit('goal', { text: `${g.text}: +$${g.bonus}`, amount: g.bonus }); }
    }
  }
  /** 08:00: every dealer takes what lies on his shelf of the cabinet (a box: everything in it). */
  function dealersPick() {
    if (!stashRec) return;
    blocks.forEach((b, i) => {
      if (!has(`dealer_${b.id}`)) return;
      const sl = stashRec.slots[i], it = sl && sl.item != null ? items.get(sl.item) : null;
      if (it) {
        if (it.kind === 'box') { for (const e of it.state.n) dealers[i].q.push(e); it.state.n = []; }
        else if (SELL.includes(it.kind)) { dealers[i].q.push(it.kind === 'brick' ? ['brick', it.state.pure ? 1 : 0, it.state.of] : [it.kind, it.state.pure ? 1 : 0]); removeItem(it); }
        if (dealers[i].q.length) emit('dealer_pick', { ...sl, level: 1, text: `${b.name}: ${dealers[i].q.length} to sell` });
      }
      dealers[i].next = time + S(RULES.dealer.every[i] || 30);
    });
  }
  function stepDealers() {
    if (!career || !isDay()) return;
    blocks.forEach((b, i) => {
      const d = dealers[i];
      if (!has(`dealer_${b.id}`) || !d.q.length || time < d.next) return;
      d.next = time + S(RULES.dealer.every[i] || 30);
      const [kind, pure, of] = d.q.shift();
      const amount = Math.round(priceOf({ kind, state: { pure, of } }) * b.bonus * (1 - RULES.dealer.cut));
      earnIn(amount); bump('dealt');
      const sp = stashRec ? stashRec.slots[i] : { x: 0, y: 1.5, z: 0 };
      emit('dealer_sale', { x: sp.x, y: sp.y, z: sp.z, level: 1, amount, text: `${b.name}: +$${amount}` });
    });
  }
  // what is kept between sessions: cellar things where they lie, the rack, the plants, the dealers' bags
  const KEEP = new Set(['plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box', 'tray']);
  function snapshotSave() {
    const list = [];
    for (const it of items.values()) {
      if (!KEEP.has(it.kind) || list.length >= 80) continue;
      const p = itemPos(it), lv = itemLevel(it);
      list.push({ kind: it.kind, state: JSON.parse(JSON.stringify(it.state)), slot: it.holder == null ? it.slot : null, level: lv > 1 ? 1 : lv, x: r3(p.x), y: it.holder != null ? 0 : r3(p.y), z: r3(p.z) });
    }
    return { v: 1, day, money, earned, unlocked: [...unlocked], stock: { ...stock }, pots: pots.map((q) => q.s), items: list, dealers: dealers.map((d) => d.q.slice()), at: nowMs };
  }
  function save() { if (career && saveKey && phase !== 'menu') saves.push({ key: saveKey, data: snapshotSave() }); }
  function loadSave(d) {
    day = Math.max(1, d.day | 0); money = fin(d.money) ? d.money : RULES.career.money; earned = fin(d.earned) ? d.earned : 0;
    unlocked.clear(); for (const id of d.unlocked || []) if (UNL.has(id)) unlocked.add(id);
    won = unlocked.has('block');
    for (const k of Object.keys(stock)) stock[k] = d.stock && fin(d.stock[k]) ? d.stock[k] : 0;
    (d.pots || []).forEach((v, i) => { if (pots[i] && fin(v)) pots[i].s = v; });
    (d.dealers || []).forEach((q, i) => { if (dealers[i] && Array.isArray(q)) dealers[i].q = q.slice(0, 60); });
    for (const e of d.items || []) {
      if (!KEEP.has(e.kind) || items.size >= RULES.maxItems) continue;
      const it = newItem(e.kind, e.level | 0);
      if (e.state && typeof e.state === 'object') Object.assign(it.state, e.state);
      const sl = e.slot != null ? slotById.get(e.slot) : null;
      if (sl && sl.item == null && sl.kind !== 'trash' && sl.kind !== 'bin' && sl.kind !== 'spot') putInSlot(it, sl);
      else if ((+e.y || 0) < 0.05) toFloor(it, { x: +e.x || 0, y: 0, z: +e.z || 0 }, e.level | 0);
      else { it.x = +e.x || 0; it.y = +e.y || 0; it.z = +e.z || 0; it.level = e.level | 0; }
    }
  }
  /** The main menu and the pause menu: what the trigger on a button of the screen asks. */
  function doMenu(pl, hp, msg) {
    if (!career) return refuse(pl, hp, 'bad');
    const c = msg.choice;
    if (phase === 'menu') {
      if (c === 'continue' && saveData) loadSave(saveData);
      else if (c === 'new') { money = RULES.career.money; day = 1; earned = 0; unlocked.clear(); for (const k of Object.keys(stock)) stock[k] = RULES.stock[k] | 0; }
      else return refuse(pl, hp, 'bad');
      enter('day');
      return { ok: true };
    }
    if (c === 'pause' && !paused) { paused = true; emit('paused', { player: pl.id }); return { ok: true }; }
    if (c === 'resume' && paused) { paused = false; emit('resumed', { player: pl.id }); return { ok: true }; }
    if (c === 'quit') { save(); paused = false; finish(); return { ok: true }; }
    return refuse(pl, hp, 'bad');
  }

  // ── снимка за каските ──""")
# tick: time stands still in the menu and while paused
rep("  function tick(now) {\n    if (!fin(now) || now <= nowMs) return;\n    nowMs = now;\n    const target = (now - t0) / 1000;",
    "  function tick(now) {\n    if (!fin(now) || now <= nowMs) return;\n    if (!over && (paused || phase === 'menu')) held += now - nowMs;\n    nowMs = now;\n    const target = (now - t0 - held) / 1000;")
rep("    stepLab(h);\n    stepStreet(h);\n    stepPatrol();", "    stepLab(h);\n    stepStreet(h);\n    stepDealers();\n    stepGoals();\n    stepPatrol();")
# phases of the career: day and night for ever
rep("    while (!over && time >= phaseEnd) {\n      const i = PHASES.indexOf(phase);\n      const from = phaseEnd;\n      if (i === PHASES.length - 1) { finish(); break; }",
    "    while (!over && time >= phaseEnd) {\n      const i = PHASES.indexOf(phase);\n      const from = phaseEnd;\n"
    "      if (career) { day += phase === 'night' ? 1 : 0; enter(phase === 'night' ? 'day' : 'night'); phaseEnd = from + S(RULES.phases[phase]); continue; }\n"
    "      if (i === PHASES.length - 1) { finish(); break; }")
rep("    emit('phase', { text: TX.title[p] });\n  }",
    "    if (career && (p === 'day' || p === 'night')) {\n"
    "      if (p === 'day') { newGoals(); dealersPick(); }\n"
    "      save();                                        // autosave at 08:00 and at 00:00\n"
    "    }\n"
    "    emit('phase', { text: career && p === 'day' ? `Day ${day}` : TX.title[p] });\n  }")
rep("    result = { money, stars: clamp(stars, 1, 5), caught, dropped, players: [...players.values(), ...gone.values()].map(pubPlayer) };",
    "    result = { money, stars: clamp(stars, 1, 5), caught, dropped, players: [...players.values(), ...gone.values()].map(pubPlayer), ...(career ? { score: earned, day, rank: RULES.career.ranks[rankOf(earned)][0] } : {}) };")
# actions
rep("      case 'consume': return doConsume(pl, hand, hp);",
    "      case 'consume': return doConsume(pl, hand, hp);\n      case 'menu': return doMenu(pl, hp, msg);\n      case 'unlock': return doUnlock(pl, hp, msg);")
rep("    if (over) return refuse(pl, hp, 'over');\n    if (!hand) return refuse(pl, null, 'bad');\n    if (!hp) return refuse(pl, null, 'noPose');",
    "    if (over) return refuse(pl, hp, 'over');\n    if (!hand) return refuse(pl, null, 'bad');\n"
    "    if (msg.a === 'menu') return doMenu(pl, hp || headPos(pl) || { x: 0, y: 1, z: 0 }, msg);\n"
    "    if (!hp) return refuse(pl, null, 'noPose');\n"
    "    if (phase === 'menu' || paused) return msg.a === 'unlock' ? doUnlock(pl, hp, msg) : refuse(pl, hp, 'paused');")
# locks on taking, buying, the lift, the posts, the bench, the drinks
rep("    if (rec.st.gives === 'meat') {\n      if (meatStock <= 0) return refuse(pl, hp, 'noMeat');\n      meatStock--;\n    }",
    "    if (career && TOP_LOCKED.has(rec.st.gives) && !has(rec.st.gives)) return refuse(pl, hp, 'locked');\n"
    "    if (career && rec.st.gives === 'tray' && !has('press')) return refuse(pl, hp, 'locked');\n"
    "    if (rec.st.gives === 'meat' && (kids || !career)) {\n      if (meatStock <= 0) return refuse(pl, hp, 'noMeat');\n      meatStock--;\n    }")
rep("    if (!labOn || !kind) return refuse(pl, hp, 'bad');\n    if (phase === 'tutorial') return refuse(pl, hp, 'shopShut');",
    "    if (!labOn || !kind) return refuse(pl, hp, 'bad');\n    if (phase === 'tutorial') return refuse(pl, hp, 'shopShut');\n    if (career && !hasAny(STORE_NEEDS[kind])) return refuse(pl, hp, 'locked');")
rep("      if (to === 2 && !isDay()) return refuse(pl, hp, 'streetNight');",
    "      if (to === 2 && !isDay()) return refuse(pl, hp, 'streetNight');\n      if ((to === 1 && !has('cellar')) || (to === 2 && !has('street'))) return refuse(pl, hp, 'locked');")
rep("    if (kind === 'way') {          // the signpost at the end of a block: on foot to the next one",
    "    if (kind === 'way') {          // the signpost at the end of a block: on foot to the next one\n"
    "      const blk = blocks.find((b) => b.level === rec.st.to);\n"
    "      if (blk && rec.st.to > pl.level && !has(blk.id)) return refuse(pl, hp, 'locked');")
rep("    const quick = fxOn(pl, 'rush') ? RULES.fx.rush : 1;", "    const quick = fxOn(pl, 'rush') ? RULES.fx.rush : 1;\n    if (msg.control === 1 && !has('mixer')) return refuse(pl, hp, 'locked');")
rep("      const cup = inSlot(rec, c);\n      if (!cup) {", "      if (c === 1 && !has('orange')) return refuse(pl, hp, 'locked');\n      const cup = inSlot(rec, c);\n      if (!cup) {")
# rolling counts for the goals
rep("      pl.packed++;\n      emit('rolled', { x: hp.x, y: hp.y, z: hp.z, level: pl.level, player: pl.id });", "      pl.packed++; bump('rolled');\n      emit('rolled', { x: hp.x, y: hp.y, z: hp.z, level: pl.level, player: pl.id });")
# the state that goes out
rep("      case 'box': return { n: s.n.map((q) => q[0]) };", "      case 'box': return { n: s.n.map((q) => q[0]) };\n      case 'tray': return { n: s.n.map((q) => q[0]) };\n      case 'brick': return { of: s.of, pure: s.pure ? 1 : 0 };")
# goals of the moment in the career
rep("  function goalNow() {\n    if (over) return null;\n    const G = TX.goal;",
    "  function goalNow() {\n    if (over) return null;\n    const G = TX.goal;\n"
    "    if (phase === 'menu') return { text: TX.career.menu, station: 'screen' };\n"
    "    if (paused) return { text: TX.career.paused, station: 'screen' };\n"
    "    if (career && isNight() && !has('cellar')) return { text: G.cellarFirst, station: 'screen' };\n"
    "    if (career && isDay() && shopOpen && !customers.some((c) => c.state === 'wait' && !c.mark) && !(has('street'))) {\n"
    "      const next = RULES.career.unlocks.find(([id, , price, rank]) => !unlocked.has(id) && rank <= rankOf(earned) && price <= money);\n"
    "      if (next) return { text: `${G.upgrade} You can buy: ${next[1]}.`, station: 'screen' };\n"
    "    }")
rep("      goal: goalNow(),\n",
    "      goal: goalNow(),\n"
    "      career: career ? {\n"
    "        day, earned, rank: rankOf(earned), unlocked: [...unlocked], paused, won, key: saveKey,\n"
    "        save: saveData ? { day: saveData.day | 0, money: saveData.money | 0, rank: rankOf(saveData.earned || 0) } : null,\n"
    "        goals: goals.map((g) => ({ text: g.text, n: g.n, have: Math.min(g.n, g.id === 'earn' ? dayEarned : stats[g.id] || 0), bonus: g.bonus, done: g.done })),\n"
    "        dealers: blocks.map((b, i) => ({ id: b.id, name: b.name, hired: has(`dealer_${b.id}`), left: dealers[i].q.length })),\n"
    "      } : null,\n")
rep("  return {\n    start: () => JSON.parse(startJson),\n    join, leave, pose, act, tick, snapshot,",
    "  return {\n    start: () => JSON.parse(startJson),\n    join, leave, pose, act, tick, snapshot,\n"
    "    /** the saves the game wants written: [{ key, data }]; the server calls this after every tick */\n"
    "    takeSaves: () => saves.splice(0, saves.length),")
# the host's save is looked up when he joins
rep("    if (info && fin(info.n)) pl.n = info.n;\n    if (info && typeof info.name === 'string') pl.name = info.name;",
    "    if (info && fin(info.n)) pl.n = info.n;\n    if (info && typeof info.name === 'string') pl.name = info.name;\n"
    "    if (career && !saveAsked) {                         // the career of the first player (or of the team)\n"
    "      saveAsked = true;\n"
    "      saveKey = String(opts.team || pl.name || id).replace(/[^\\w .-]/g, '').trim().slice(0, 40) || 'player';\n"
    "      try { const d = typeof opts.loadSave === 'function' ? opts.loadSave(saveKey) : null; saveData = d && typeof d === 'object' && d.v ? d : null; } catch { saveData = null; }\n"
    "    }")
rep("  if (labOn) money = RULES.startMoney;      // the night comes first: something to buy supplies with",
    "  if (labOn) money = career ? RULES.career.money : RULES.startMoney;")
rep("  if (phase === 'tutorial') emit('phase', { text: TX.title.tutorial }); else enter(phase);",
    "  if (phase === 'tutorial') emit('phase', { text: TX.title.tutorial }); else if (phase !== 'menu') enter(phase);")
rep("      walker: (b = 0) => { nextWalk[b] = time; }, open: () => { shopOpen = true; nextSpawnAt = time + S(1.5); }, give:",
    "      walker: (b = 0) => { nextWalk[b] = time; }, open: () => { shopOpen = true; nextSpawnAt = time + S(1.5); },\n"
    "      unlock: (...ids) => { for (const id of ids) unlocked.add(id); }, earn: (v) => earnIn(v), career: () => ({ day, earned, goals, stats, dealers, unlocked: [...unlocked] }), give:")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rules 1.4 patched,', n, 'edits')

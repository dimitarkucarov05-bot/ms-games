"""The Back Room 1.1: rules. Run from the staging lobby folder (lobby-stage)."""
import io, re

p = 'game/backroom.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)


def line(start, new):
    """Replace the single whole line that starts with `start`."""
    global s
    hits = [m for m in re.finditer(r'^' + re.escape(start) + r'.*$', s, re.M)]
    assert len(hits) == 1, (len(hits), start)
    s = s[:hits[0].start()] + new + s[hits[0].end():]


# ───── kinds ─────
rep("const TOPS = ['sauce', 'cheese', 'veg', 'meat'];\nconst TOP = new Set(TOPS);\n",
    "const SAUCES = ['sauce', 'white', 'mustard'];      // tomato, white and mustard sauce: exactly one, and it goes first\n"
    "const SAUCE = new Set(SAUCES);\n"
    "const TOPS = [...SAUCES, 'cheese', 'veg', 'meat', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion'];\n"
    "const TOP = new Set(TOPS);\n"
    "const LIQUIDS = ['blue', 'clear', 'red'];          // the liquids for the mixer in the cellar\n"
    "const LIQUID = new Set(LIQUIDS);\n"
    "const SELL = ['buds', 'joint', 'ice', 'pills', 'powder'];      // the product of the cellar: sold over the counter to buyers\n"
    "const STASH_ANY = [...SELL, 'papers', 'seeds', ...LIQUIDS];     // what a free shelf of the secret cabinet takes\n"
    "const RECIPES = { 'blue+clear': 'ice', 'blue+red': 'pills', 'clear+red': 'powder' };\n")
line("const LAB = new Set(", "const LAB = new Set(['tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL]);      // cellar things: evidence at the raid")
line("const ITEM_KINDS = ", "const ITEM_KINDS = ['pizza', ...TOPS, 'cup', 'tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL];")
line("const SERVE = ", "const SERVE = ['pizza', 'cup', ...SELL];")
line("const SURFACES = ", "const SURFACES = new Set(['oven', 'prep', 'counter', 'grinder', 'bench']);")

# ───── numbers ─────
rep("cookDone: 7, cookBurn: 10, pour: 3, poof: 4,", "cookDone: 7, cookBurn: 10, pour: 2.2, poof: 4,")
rep("maxTops: 4, maxItems: 80,", "maxTops: 5, maxItems: 110,")
rep("  pay: { pizza: 10, top: 3, meat: 22, cup: 4, tip: 0.5 },\n",
    "  pay: { pizza: 10, top: 3, meat: 22, cup: 4, tip: 0.5 },\n"
    "  // the cellar lab: buyers at the counter, prices of the product, the dead-drop shop in the secret cabinet\n"
    "  buyerShare: 0.24, buyerTease: 0.07, buyerPatience: 1.7,\n"
    "  sell: { buds: 25, joint: 40, powder: 35, pills: 45, ice: 60, pure: 1.5 },\n"
    "  shop: { blue: 12, clear: 8, red: 8, papers: 5, seeds: 10, delay: 5 },\n"
    "  lab: { shred: 2.5, mix: 3, grow: 25, combine: 0.30, door: 0.6 },\n")

# ───── texts: English ─────
a = s.index("const NIGHT = {")
b = s.index("export const TEXT = { night: NIGHT, kids: KIDS };")
s = s[:a] + r'''const NIGHT = {
  title: { tutorial: 'Training', day: 'Day', closing: 'Dusk', night: 'Evening', rush: 'Night shift', raid: 'Inspection', over: 'The end' },
  hint: {
    tutorial: 'Dough on the board, sauce and cheese, into the oven, then onto the counter.',
    day: 'Serve the customers: pizza as ordered and a full cup. The cellar is open: the lift is at the back.',
    closing: 'It is getting dark. The rude ones come in the evening, and the meat is running out.',
    night: 'The rude one stands under the red lamp. The button under the counter opens the floor under him.',
    rush: 'The grinder is waiting downstairs. Upstairs they want pizza with meat.',
    raid: 'Inspection! Hide the product in the blue cabinet and shut it. Throw the rest away.',
    over: 'The shift is over.',
    overCaught: 'They caught you.',
    patrolWarn: 'Patrol! Do not touch the button. Sell nothing from the cellar.',
    patrolOn: 'The patrol is watching. Nobody falls, nothing is sold.',
    hopper: 'A load is waiting downstairs. The lift is at the back.',
    meatUp: 'There is meat. Pizza with meat pays best.',
    buyer: 'A buyer wants the stuff from the blue cabinet in the cellar.',
  },
  signShop: {
    tutorial: 'TRAINING\nDough, sauce, cheese, oven',
    day: 'MENU\nPizza as ordered. A full cup.',
    closing: 'DUSK',
    night: 'MENU\nPizza with meat. The button is under the counter.',
    rush: 'MENU\nPizza with meat. The button is under the counter.',
    raid: 'INSPECTION',
    over: 'THE END',
  },
  signLab: {
    tutorial: 'CLOSED',
    day: 'CELLAR\nBlue cabinet: handle opens it. Empty shelf: touch to order.',
    closing: 'CELLAR\nTray under the grinder. Lever three times. Meat into the lift.',
    night: 'CELLAR\nTray under the grinder. Lever three times. Meat into the lift.',
    rush: 'CELLAR\nTray under the grinder. Lever three times. Meat into the lift.',
    raid: 'HIDE IT ALL',
    over: 'THE END',
  },
  deny: {
    bad: 'Not possible',
    over: 'The game is over',
    noPose: 'No pose from the headset',
    far: 'Too far',
    handFull: 'The hand is full',
    handEmpty: 'The hand is empty',
    noItem: 'No such thing',
    held: 'Somebody holds it',
    noStation: 'No such station',
    notBin: 'Nothing to take here',
    noButton: 'No button here',
    labClosed: 'The cellar is closed',
    raidBins: 'Too late. Hide everything',
    tooMany: 'Too many things',
    noCup: 'Put a cup under it',
    cupFull: 'The cup is full',
    otherDrink: 'Another drink is in the cup',
    noMeat: 'No meat left',
    notYet: 'The button is locked until the evening',
    trapBusy: 'The floor is still closing',
    noTray: 'Put a tray under the grinder',
    noBody: 'The grinder is empty',
    wait: 'Wait',
    otherLevel: 'That is on the other floor',
    enterCabin: 'Step into the cabin',
    liftBusy: 'The lift is moving',
    wrongOrder: 'That is not the order',
    topOrder: 'Sauce first, one of each',
    stashShut: 'Open the cabinet first',
    shelfFull: 'Already on its way',
    noMoney: 'Not enough money',
    noPlant: 'Nothing has grown yet',
    noPlantIn: 'Put a plant in the shredder',
    needTwo: 'Pour two liquids in',
    mixerFull: 'Two liquids are in already',
    takeFirst: 'Take the product out first',
    potBusy: 'Something grows here already',
  },
};

const KIDS = {
  title: { ...NIGHT.title, rush: 'The big delivery' },
  hint: {
    ...NIGHT.hint,
    day: 'Serve the customers: pizza as ordered and a full cup.',
    closing: 'It is getting dark. The courier with the crates comes in the evening.',
    night: 'The courier brings a crate. The button under the counter lowers it into the store.',
    rush: 'The machine downstairs makes salami. Upstairs they want pizza with salami.',
    raid: 'The inspector is coming! Put the trays of the store away.',
    overCaught: 'The inspector caught you.',
    patrolWarn: 'The inspector walks by.',
    patrolOn: 'The inspector is watching.',
    hopper: 'A crate is waiting downstairs. The lift is at the back.',
    meatUp: 'There is salami. Pizza with salami pays best.',
  },
  signShop: { ...NIGHT.signShop, night: 'MENU\nPizza with salami. The button lowers the crate.', rush: 'MENU\nPizza with salami. The button lowers the crate.' },
  signLab: {
    ...NIGHT.signLab,
    day: 'CLOSED',
    closing: 'STORE\nTray under the machine. Lever three times. Salami into the lift.',
    night: 'STORE\nTray under the machine. Lever three times. Salami into the lift.',
    rush: 'STORE\nTray under the machine. Lever three times. Salami into the lift.',
    raid: 'PUT IT ALL AWAY',
  },
  deny: {
    ...NIGHT.deny,
    labClosed: 'The store is closed',
    raidBins: 'Too late. Put everything away',
    noMeat: 'No salami left',
    noTray: 'Put a tray under the machine',
    noBody: 'The machine is empty',
    noCourier: 'No courier here',
  },
};

''' + s[b:]

# ───── sizes of the new cellar stations ─────
rep("const DOOR_HALF = 0.6,", "Object.assign(SIZE, { stash: [1.0, 2.0, 0.5], grow: [0.9, 1.6, 0.5], bench: [0.9, 0.85, 0.5] });\nconst DOOR_HALF = 0.6,")
rep("export function buildCompactLayout(opts = {}) {\n",
    "// The cellar lab in natural size. stash: the two-door freezer of the Shops Pack (SM_Prop_Market_Freezer_03, 1.97 x 2.43 x 1.03),\n"
    "// cells = [x along the cabinet, height, what the shelf spot is for (null: free storage)]. grow: two buckets with plants\n"
    "// under the lamp. bench: SM_Prop_Kitchen_Prep_Table_02 (1.09 x 1.05 x 1.03) with the shredder (left) and the mixer (right).\n"
    "Object.assign(NAT, {\n"
    "  stash: { w: 1.97, h: 2.43, handle: 1.15, cells: [\n"
    "    [-0.70, 1.52, 'blue'], [-0.24, 1.52, 'clear'], [0.24, 1.52, 'red'], [0.70, 1.52, 'papers'],\n"
    "    [-0.70, 1.17, 'seeds'], [-0.24, 1.17, null], [0.24, 1.17, null], [0.70, 1.17, null],\n"
    "    [-0.70, 0.78, null], [-0.24, 0.78, null], [0.24, 0.78, null], [0.70, 0.78, null]] },\n"
    "  grow: { w: 1.30, h: 1.90, pots: [-0.34, 0.34], pot: 0.50 },\n"
    "  bench: { w: 1.09, top: 1.05, shred: -0.27, mix: 0.27 },\n"
    "  bowls: [['white', -0.18, 0.17], ['mustard', 0.18, 0.17]],      // filled sauce bowls on the inner edge of the counter: [what, x, how far inside the edge]\n"
    "});\n\n"
    "export function buildCompactLayout(opts = {}) {\n")
rep("trays: [['sauce', -0.32, 0.92], ['cheese', 0.55, 1.13], ['veg', -0.73, 0.92]] },",
    "trays: [['sauce', -0.32, 0.92], ['cheese', 0.55, 1.13], ['veg', -0.73, 0.92], ['ham', 0.85, 0.92], ['shrimp', 0.50, 0.92]] },")

# a station with several things to press (taps of the drinks machine, handle and shelf spots of the cabinet, the two blenders)
TAPS = ("  const taps = (st, list) => {\n"
        "    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);\n"
        "    st.taps = list.map(([lx, ly, lz]) => ({ x: r3(st.x + lx * c + lz * s), y: r3(st.y + ly), z: r3(st.z - lx * s + lz * c) }));\n"
        "    return st;\n"
        "  };\n")
anchor = "  // ── асансьорът ──\n  let elevator, liftYaw, liftSize, cornerCut = 0;\n"
rep(anchor, TAPS + anchor)
anchor2 = "  // места на клиентите: около едно на 1.1 м, най-много 5, поне 0.75 м от страничните стени\n"
rep(anchor2, TAPS + anchor2)

# full layout: taps over the cups of the drinks machine
rep("      if (q.kind === 'grinder') ctl(st, ...LEVER);\n    }\n  };\n  put(shop.res, 0);",
    "      if (q.kind === 'grinder') ctl(st, ...LEVER);\n"
    "      if (q.kind === 'drinks') taps(st, SLOTS.drinks.map(([lx, ly, lz]) => [lx, ly + 0.32, lz]));\n"
    "    }\n  };\n  put(shop.res, 0);")
# compact squeezed layout
rep("      if (it.kind === 'grinder') ctl(st, LEVER[0] * Math.min(1, k), LEVER[1], LEVER[2]);\n",
    "      if (it.kind === 'grinder') ctl(st, LEVER[0] * Math.min(1, k), LEVER[1], LEVER[2]);\n"
    "      if (it.kind === 'drinks') taps(st, SLOTS.drinks.map(([lx, ly, lz]) => [lx * Math.min(1, k), ly + 0.32, Math.min(lz, it.d / 2 - 0.05)]));\n")
rep("    column('pizza', 'sauce', 'cheese'), { ...column('cup', 'meat', 'veg'), store: true },\n    full('trash', 'trash', { store: true }),\n  ], new Set(['trash']));",
    "    column('pizza', 'sauce', 'cheese'), { ...column('cup', 'meat', 'veg'), store: true },\n"
    "    full('trash', 'trash', { store: true }),\n"
    "    column('white', 'mustard', 'shrimp'), { ...column('ham', 'bacon', 'pineapple'), store: true },\n"
    "  ], new Set(['trash', 'white', 'mustard', 'shrimp', 'ham', 'bacon', 'pineapple']));")

# natural kitchen: taps, sauce bowls, more boxes on the rack
rep("    for (const lx of [-0.2, 0.2]) slot(drinks, lx, N.drinks.top, -0.02, ['cup']);\n",
    "    for (const lx of [-0.2, 0.2]) slot(drinks, lx, N.drinks.top, -0.02, ['cup']);\n"
    "    taps(drinks, [[-0.2, N.drinks.top + 0.34, 0.02], [0.2, N.drinks.top + 0.34, 0.02]]);\n")
rep("    [['pizza'], ['meat'], ['cup']].forEach((col, j) => col.forEach((gives, i) => {",
    "    for (const [gives, bx, dz] of N.bowls) add(`bin_${gives}`, 'bin', 0, bx, N.counter.top, zc + dz, Math.PI, [0.16, 0.05, 0.13], { gives, nat: 1, bowl: 1, room: 'a' });\n"
    "    [['pizza', 'bacon'], ['meat', 'pineapple'], ['cup', 'onion']].forEach((col, j) => col.forEach((gives, i) => {")

# natural cellar: the plants replace the tank on the front wall; the secret cabinet on the right wall; the bench in room b
rep("    if (w - 2 * N.depth - 0.04 >= N.tank.w) add('hopper', 'hopper', 1, 0, 0, hd - half, Math.PI, [N.tank.w, N.tank.h, N.depth], { nat: 1, room: 'a' });\n"
    "    else warnings.push('hopper: няма място, играта върви без това');\n",
    "    const labOn = opts.lab !== false;\n"
    "    if (labOn && w - 2 * N.depth - 0.04 >= N.grow.w) {\n"
    "      const gw = add('grow', 'grow', 1, 0, 0, hd - half, Math.PI, [N.grow.w, N.grow.h, N.depth], { nat: 1, room: 'a', gives: 'plant' });\n"
    "      for (const lx of N.grow.pots) slot(gw, lx, N.grow.pot, 0, ['seeds']);\n"
    "    } else if (w - 2 * N.depth - 0.04 >= N.tank.w) add('hopper', 'hopper', 1, 0, 0, hd - half, Math.PI, [N.tank.w, N.tank.h, N.depth], { nat: 1, room: 'a' });\n"
    "    else warnings.push('hopper: няма място, играта върви без това');\n"
    "    if (labOn && d >= N.stash.w + 0.1) {\n"
    "      const sh = add('stash', 'stash', 1, hw - half, 0, 0, yawOf(1), [N.stash.w, N.stash.h, N.depth], { nat: 1, room: 'a' });\n"
    "      for (const [lx, ly, kind] of N.stash.cells) slot(sh, lx, ly, 0, kind ? [kind] : STASH_ANY.slice());\n"
    "      sh.shelf = N.stash.cells.map((c) => c[2]);\n"
    "      taps(sh, [[0, N.stash.handle, 0.2], ...N.stash.cells.map(([lx, ly]) => [lx, ly + 0.05, 0.06])]);\n"
    "    } else if (labOn) warnings.push('stash: no room for the cabinet; the game runs without the lab');\n"
    "    const dr = natPlan.drinks;\n"
    "    if (labOn && dr.len >= N.bench.w - 1e-6) {\n"
    "      const bn = add('bench', 'bench', 1, dr.wall - dr.sd * half, 0, dr.to - N.bench.w / 2, yawOf(dr.sd), [N.bench.w, N.bench.top, N.depth], { nat: 1, room: B.id });\n"
    "      slot(bn, N.bench.shred, N.bench.top, 0, ['plant', 'buds']);\n"
    "      slot(bn, N.bench.mix, N.bench.top, 0, SELL.slice());\n"
    "      taps(bn, [[N.bench.shred, N.bench.top + 0.10, 0.17], [N.bench.mix, N.bench.top + 0.10, 0.17]]);\n"
    "    } else if (labOn) warnings.push('bench: no room for the lab bench');\n")

# ───── the game ─────
rep("  const layout = compact ? buildCompactLayout(opts) : buildLayout(opts.hall, opts.obstacles);",
    "  const layout = compact ? buildCompactLayout({ ...opts, lab: !kids && opts.lab !== false }) : buildLayout(opts.hall, opts.obstacles);")
rep("  const cab = liftRec.box;   // подът на кабината: едно и също място на двете нива\n",
    "  const cab = liftRec.box;   // подът на кабината: едно и също място на двете нива\n"
    "  // the cellar lab (not in the kids theme): the secret cabinet, the plants, the bench with the shredder and the mixer\n"
    "  const stashRec = stationById.get('stash') || null, growRec = stationById.get('grow') || null, benchRec = stationById.get('bench') || null;\n"
    "  const labOn = !kids && !!stashRec;\n"
    "  let stashOpen = 0, stashWant = 0;\n"
    "  const pending = [];                                                 // orders on their way to a shelf: { idx, kind, at }\n"
    "  const pots = growRec ? growRec.slots.map(() => ({ s: 1 })) : [];   // 1: a grown plant, 0: empty bucket, between: growing\n"
    "  const shred = { until: 0, by: null }, mixer = { mix: [], pure: false, until: 0, by: null };\n"
    "  const stashShut = () => stashWant === 0 && stashOpen < 0.5;\n"
    "  const menu = MENU.filter((st) => st.every((k) => stationById.has(`bin_${k}`)));\n")
rep("// ───────── играта ─────────\n",
    "// ───────── играта ─────────\n\n"
    "// The menu: what customers order, simple ones first. Only pizzas whose every topping has a bin in this hall are ordered.\n"
    "const MENU = [\n"
    "  ['sauce', 'cheese'], ['sauce'], ['sauce', 'cheese', 'veg'], ['white', 'cheese', 'shrimp'], ['sauce', 'cheese', 'ham'],\n"
    "  ['white', 'cheese', 'bacon'], ['sauce', 'cheese', 'ham', 'pineapple'], ['mustard', 'cheese', 'bacon', 'onion'], ['white', 'cheese', 'veg', 'shrimp'],\n"
    "];\n")
rep("  const labOpen = () => phase === 'closing' || phase === 'night' || phase === 'rush' || phase === 'raid';",
    "  const labOpen = () => phase !== 'tutorial' && phase !== 'over';      // the cellar opens with the first working day")

# item state
rep("      case 'cup': return { fill: 0, drink: null };\n      default: return {};",
    "      case 'cup': return { fill: 0, drink: null };\n      case 'blue': return { shake: 0 };\n      case 'ice': return { pure: 0 };\n      default: return {};")
rep("      case 'cup': return { fill: r3(s.fill), drink: s.drink };\n      default: return {};",
    "      case 'cup': return { fill: r3(s.fill), drink: s.drink, pour: it.pour ? 1 : 0 };\n      case 'blue': return { shake: s.shake ? 1 : 0 };\n      case 'ice': return { pure: s.pure ? 1 : 0 };\n      default: return {};")

# toppings: one sauce first, then anything once (meat twice)
a = s.index("  function topFits(stack, k) {")
b = s.index("  // ── поръчки ──")
s = s[:a] + ("  function topFits(stack, k) {\n"
             "    if (stack.length >= RULES.maxTops) return false;\n"
             "    if (SAUCE.has(k)) return stack.length === 0;\n"
             "    if (!stack.length || !SAUCE.has(stack[0])) return false;\n"
             "    if (k === 'meat') return count(stack, 'meat') < 2;\n"
             "    return !stack.includes(k);\n"
             "  }\n\n") + s[b:]

# orders: the product of the cellar
rep("    if (o.kind === 'cup') return it.kind === 'cup' && it.state.fill >= 0.9 && it.state.drink === o.drink;\n",
    "    if (o.kind === 'cup') return it.kind === 'cup' && it.state.fill >= 0.9 && it.state.drink === o.drink;\n"
    "    if (o.kind === 'stuff') return it.kind === o.item;\n")
rep("  function payFor(c) {\n    const o = c.order, P = RULES.pay;\n    const base = o.kind === 'pizza' ?",
    "  function payFor(c, it) {\n    const o = c.order, P = RULES.pay;\n"
    "    const base = o.kind === 'stuff' ? Math.round(RULES.sell[o.item] * (it && it.state.pure ? RULES.sell.pure : 1)) : o.kind === 'pizza' ?")
rep("      const amount = payFor(c);\n      money += amount;\n      if (who) who.served++;\n",
    "      const amount = payFor(c, it);\n      money += amount;\n      if (who) who.served++;\n"
    "      if (c.order.kind === 'stuff' && patrol && patrol.phase === 'on') {      // sold under the eyes of the patrol\n"
    "        addSus(RULES.patrol.sus);\n"
    "        emit('caught', at(s, { player: who ? who.id : null }));\n"
    "      }\n")

# placing: rolling a joint, pouring into the mixer, closed cabinet, seeds into a bucket
rep("    const L = pl.level;\n    it.yaw = yaw;\n",
    "    const L = pl.level;\n    it.yaw = yaw;\n"
    "    // 0a. papers next to buds (or buds next to papers): a joint lies where the other one was\n"
    "    if (it.kind === 'papers' || it.kind === 'buds') {\n"
    "      const other = it.kind === 'papers' ? 'buds' : 'papers';\n"
    "      let mate = null, md = RULES.lab.combine + 1e-9;\n"
    "      for (const q of items.values()) {\n"
    "        if (q.kind !== other || q.holder != null || q.floor || q.level !== L) continue;\n"
    "        if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;\n"
    "        const dd = dist(p, q);\n"
    "        if (dd <= md) { md = dd; mate = q; }\n"
    "      }\n"
    "      if (mate) {\n"
    "        const sl = mate.slot != null ? slotById.get(mate.slot) : null, pos = { x: mate.x, y: mate.y, z: mate.z };\n"
    "        removeItem(mate); removeItem(it);\n"
    "        const j = newItem('joint', L);\n"
    "        j.by = pl.id; j.yaw = yaw;\n"
    "        if (sl && sl.accepts.includes('joint')) putInSlot(j, sl); else { j.x = pos.x; j.y = pos.y; j.z = pos.z; }\n"
    "        pl.packed++;\n"
    "        emit('rolled', at(j, { player: pl.id }));\n"
    "        return 6;\n"
    "      }\n"
    "    }\n"
    "    // 0b. a liquid over the mixer: it is poured in (two at most)\n"
    "    if (LIQUID.has(it.kind) && benchRec && benchRec.level === L) {\n"
    "      const m = benchRec.slots[1];\n"
    "      if (dist(p, m) <= RULES.snapSlot || dist(p, { x: m.x, y: m.y + 0.25, z: m.z }) <= RULES.snapSlot) {\n"
    "        if (time < mixer.until) emit('deny', { player: pl.id, level: L, x: m.x, y: m.y, z: m.z, text: TX.deny.wait });\n"
    "        else if (m.item != null) emit('deny', { player: pl.id, level: L, x: m.x, y: m.y, z: m.z, text: TX.deny.takeFirst });\n"
    "        else if (mixer.mix.length >= 2) emit('deny', { player: pl.id, level: L, x: m.x, y: m.y, z: m.z, text: TX.deny.mixerFull });\n"
    "        else {\n"
    "          mixer.mix.push(it.kind);\n"
    "          if (it.kind === 'blue' && it.state.shake) mixer.pure = true;\n"
    "          emit('pour', at(m, { player: pl.id }));\n"
    "          removeItem(it);\n"
    "          return 7;\n"
    "        }\n"
    "      }\n"
    "    }\n")
rep("      if (s.level !== L || !s.accepts.includes(it.kind)) continue;\n      if (s.item != null && s.kind !== 'trash' && s.kind !== 'bin') continue;\n",
    "      if (s.level !== L || !s.accepts.includes(it.kind)) continue;\n      if (s.item != null && s.kind !== 'trash' && s.kind !== 'bin') continue;\n"
    "      if (s.kind === 'stash' && stashShut()) continue;                                  // a closed cabinet takes nothing\n"
    "      if (s.kind === 'grow' && pots[s.idx].s > 0) continue;                             // something grows in this bucket already\n"
    "      if (s.st === benchRec && s.idx === 0 && time < shred.until) continue;             // the shredder is running\n")
rep("      if (best.kind === 'trash') {\n        emit('poof', at(best));\n        removeItem(it);\n      } else if",
    "      if (best.kind === 'trash') {\n        emit('poof', at(best));\n        removeItem(it);\n"
    "      } else if (best.kind === 'grow') {      // seeds into the bucket: a plant grows\n"
    "        pots[best.idx].s = 0.001;\n"
    "        emit('planted', at(best, { player: pl.id }));\n"
    "        removeItem(it);\n"
    "      } else if")
# no more automatic pouring: the tap is pressed by hand
rep("        if (it.kind === 'cup' && best.kind === 'drinks') startPour(it, best.idx);\n", "")

# customers: buyers and the menu
a = s.index("  function randomOrder() {")
b = s.index("  function spawnCustomer(order, mark, tutorial) {")
s = s[:a] + ("  // what a buyer asks for: mostly something that is already made, sometimes anything\n"
             "  function wantedStuff() {\n"
             "    const have = [...new Set([...items.values()].filter((q) => SELL.includes(q.kind)).map((q) => q.kind))];\n"
             "    const pool = have.length && rand() < 0.75 ? have : SELL;\n"
             "    return pool[Math.floor(rand() * pool.length)];\n"
             "  }\n"
             "  const anyStuff = () => { for (const q of items.values()) if (SELL.includes(q.kind)) return true; return false; };\n"
             "  function randomOrder() {\n"
             "    if (evening() && rand() < RULES.markShare) return { order: { kind: 'none' }, mark: true };\n"
             "    if (labOn && rand() < (anyStuff() ? RULES.buyerShare : RULES.buyerTease)) return { order: { kind: 'stuff', item: wantedStuff() }, mark: false, buyer: true };\n"
             "    if (rand() < RULES.cupShare) return { order: { kind: 'cup', drink: rand() < 0.5 ? 'cola' : 'orange' }, mark: false };\n"
             "    if (evening() && rand() < RULES.meatShare[meatStock > 0 ? 1 : 0]) {\n"
             "      const stack = ['sauce', 'cheese', 'meat'];\n"
             "      const q = rand();\n"
             "      if (q < 0.25) stack.push('meat'); else if (q < 0.5 && stationById.has('bin_veg')) stack.push('veg');\n"
             "      return { order: { kind: 'pizza', stack }, mark: false };\n"
             "    }\n"
             "    const pick = menu.length ? menu[Math.min(menu.length - 1, Math.floor(Math.pow(rand(), 1.35) * menu.length))] : ['sauce'];\n"
             "    return { order: { kind: 'pizza', stack: pick.slice() }, mark: false };\n"
             "  }\n") + s[b:]
rep("  function spawnCustomer(order, mark, tutorial) {", "  function spawnCustomer(order, mark, tutorial, buyer) {")
rep("state: 'in', patience: 1, order, mark, special: mark, tutorial, t0: time, patDur: S(RULES.patience(np) * (mark ? RULES.markPatience : 1)) });",
    "state: 'in', patience: 1, order, mark, special: mark, tutorial, buyer: !!buyer, t0: time,\n"
    "      patDur: S(RULES.patience(np) * (mark ? RULES.markPatience : buyer ? RULES.buyerPatience : 1)) });")
rep("      if (spawnCustomer(o.order, o.mark, false)) {", "      if (spawnCustomer(o.order, o.mark, false, o.buyer)) {")
rep("          if (!(kids && c.mark)) { addCover(-RULES.cover.bad); emit('order_bad', at(serveSlots[c.seat])); }",
    "          if (!(kids && c.mark) && !c.buyer) { addCover(-RULES.cover.bad); emit('order_bad', at(serveSlots[c.seat])); }      // a buyer who gets nothing just leaves")

# the lab step
rep("  // ── подът под клиентите и улеят към мазето ──\n",
    "  // ── the cellar lab: the cabinet door, deliveries, growing, the two blenders ──\n"
    "  function stepLab(h) {\n"
    "    if (!labOn) return;\n"
    "    stashOpen = toward(stashOpen, stashWant, h / S(RULES.lab.door));\n"
    "    for (let i = pending.length - 1; i >= 0; i--) {\n"
    "      const o = pending[i];\n"
    "      if (time < o.at) continue;\n"
    "      pending.splice(i, 1);\n"
    "      const sl = stashRec.slots[o.idx];\n"
    "      if (sl.item != null || items.size >= RULES.maxItems) continue;\n"
    "      putInSlot(newItem(o.kind, 1), sl);\n"
    "      emit('delivered', at(sl));\n"
    "    }\n"
    "    pots.forEach((q, i) => {\n"
    "      if (q.s <= 0 || q.s >= 1) return;\n"
    "      q.s = Math.min(1, q.s + h / S(RULES.lab.grow));\n"
    "      if (q.s >= 1) emit('grown', at(growRec.slots[i]));\n"
    "    });\n"
    "    if (benchRec && shred.until && time >= shred.until) {\n"
    "      shred.until = 0;\n"
    "      const sl = benchRec.slots[0], it = inSlot(benchRec, 0);\n"
    "      if (it && it.kind === 'plant') {\n"
    "        removeItem(it);\n"
    "        const b = newItem('buds', 1);\n"
    "        b.by = shred.by;\n"
    "        putInSlot(b, sl);\n"
    "        const pl = players.get(shred.by);\n"
    "        if (pl) pl.cooked++;\n"
    "        emit('shredded', at(sl, { player: shred.by }));\n"
    "      }\n"
    "    }\n"
    "    if (benchRec && mixer.until && time >= mixer.until) {\n"
    "      mixer.until = 0;\n"
    "      const sl = benchRec.slots[1], kind = RECIPES[mixer.mix.slice().sort().join('+')] || null, pl = players.get(mixer.by);\n"
    "      if (kind && sl.item == null) {\n"
    "        const out = newItem(kind, 1);\n"
    "        out.by = mixer.by;\n"
    "        if (kind === 'ice' && mixer.pure) out.state.pure = 1;\n"
    "        putInSlot(out, sl);\n"
    "        if (pl) pl.cooked++;\n"
    "        emit('mixed', at(sl, { player: mixer.by }));\n"
    "      } else {      // the same liquid twice: wasted\n"
    "        if (pl) pl.mistakes++;\n"
    "        emit('ruin', at(sl, { player: mixer.by }));\n"
    "      }\n"
    "      mixer.mix = []; mixer.pure = false;\n"
    "    }\n"
    "  }\n\n"
    "  // ── подът под клиентите и улеят към мазето ──\n")
rep("    stepTraps(h);\n    stepPatrol();\n", "    stepTraps(h);\n    stepLab(h);\n    stepPatrol();\n")

# the raid: what lies in the closed cabinet is not found
rep("    for (const it of items.values()) if (LAB.has(it.kind)) fine(itemPos(it), itemLevel(it));",
    "    const hidden = (it) => it.slot != null && slotById.get(it.slot).kind === 'stash' && stashShut();\n"
    "    for (const it of items.values()) if (LAB.has(it.kind) && !hidden(it)) fine(itemPos(it), itemLevel(it));")

# actions
rep("      case 'use': return doUse(pl, hand, hp, msg);\n", "      case 'use': return doUse(pl, hand, hp, msg);\n      case 'shake': return doShake(pl, hand, hp);\n")
rep("    if (dist(hp, itemPos(it)) > REACH) return refuse(pl, hp, 'far');\n    detach(it);\n    hold(it, pl, hand);\n    return { ok: true, item: it.id };\n  }\n",
    "    if (dist(hp, itemPos(it)) > REACH) return refuse(pl, hp, 'far');\n"
    "    if (it.slot != null) {\n"
    "      const sl = slotById.get(it.slot);\n"
    "      if (sl.kind === 'stash' && stashShut()) return refuse(pl, hp, 'stashShut');\n"
    "      if (sl.st === benchRec && time < (sl.idx === 0 ? shred.until : mixer.until)) return refuse(pl, hp, 'wait');\n"
    "    }\n"
    "    detach(it);\n    hold(it, pl, hand);\n    return { ok: true, item: it.id };\n  }\n\n"
    "  // The blue flask is shaken before it goes into the mixer: the product comes out pure and pays more.\n"
    "  function doShake(pl, hand, hp) {\n"
    "    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;\n"
    "    if (!it || it.kind !== 'blue') return { ok: false, reason: 'bad' };\n"
    "    if (!it.state.shake) { it.state.shake = 1; emit('shaken', { player: pl.id, level: pl.level, x: hp.x, y: hp.y, z: hp.z }); }\n"
    "    return { ok: true };\n"
    "  }\n\n"
    "  // A grown plant is pulled out of its bucket.\n"
    "  function doHarvest(pl, hand, hp, rec) {\n"
    "    if (!labOpen()) return refuse(pl, hp, 'labClosed');\n"
    "    if (pl.hands[hand] != null) return refuse(pl, hp, 'handFull');\n"
    "    if (rec.level !== pl.level) return refuse(pl, hp, 'otherLevel');\n"
    "    if (boxDist(hp, rec.box) > REACH) return refuse(pl, hp, 'far');\n"
    "    let best = -1, bd = Infinity;\n"
    "    rec.slots.forEach((sl, i) => { if (pots[i].s >= 1) { const dd = dist(hp, sl); if (dd < bd) { bd = dd; best = i; } } });\n"
    "    if (best < 0) return refuse(pl, hp, 'noPlant');\n"
    "    if (items.size >= RULES.maxItems) return refuse(pl, hp, 'tooMany');\n"
    "    pots[best].s = 0;\n"
    "    const it = newItem('plant', pl.level);\n"
    "    it.by = pl.id;\n"
    "    hold(it, pl, hand);\n"
    "    emit('harvest', at(rec.slots[best], { player: pl.id }));\n"
    "    return { ok: true, item: it.id };\n"
    "  }\n\n"
    "  // The secret cabinet: control 0 is the handle (opens and shuts), control n is the n-th shelf spot. An empty spot\n"
    "  // that belongs to a supply orders it from the shop: the money goes at once, the thing arrives on that shelf.\n"
    "  function doStash(pl, hp, rec, msg) {\n"
    "    if (!labOn) return refuse(pl, hp, 'noButton');\n"
    "    if (!labOpen()) return refuse(pl, hp, 'labClosed');\n"
    "    const c = Number.isInteger(msg.control) && msg.control > 0 ? msg.control : 0;\n"
    "    if (c === 0) {\n"
    "      stashWant = stashWant ? 0 : 1;\n"
    "      emit(stashWant ? 'stash_open' : 'stash_shut', { ...rec.st.taps[0], level: rec.level, player: pl.id });\n"
    "      return { ok: true, open: stashWant };\n"
    "    }\n"
    "    const idx = c - 1, sl = rec.slots[idx], kind = rec.st.shelf[idx];\n"
    "    if (!sl || !kind) return refuse(pl, hp, 'noButton');\n"
    "    if (stashShut()) return refuse(pl, hp, 'stashShut');\n"
    "    if (sl.item != null || pending.some((o) => o.idx === idx)) return refuse(pl, hp, 'shelfFull');\n"
    "    if (phase === 'raid') return refuse(pl, hp, 'raidBins');\n"
    "    const price = RULES.shop[kind] | 0;\n"
    "    if (money < price) return refuse(pl, hp, 'noMoney');\n"
    "    money -= price;\n"
    "    pending.push({ idx, kind, at: time + S(RULES.shop.delay) });\n"
    "    emit('cash', at(sl, { player: pl.id, amount: -price }));\n"
    "    emit('ordered', at(sl, { player: pl.id }));\n"
    "    return { ok: true, ordered: kind };\n"
    "  }\n\n"
    "  // The bench: control 0 is the shredder (a plant in it becomes buds), control 1 the mixer (two liquids become a product).\n"
    "  function doBench(pl, hp, rec, msg) {\n"
    "    if (!labOpen()) return refuse(pl, hp, 'labClosed');\n"
    "    const T = rec.st.taps;\n"
    "    const c = msg.control === 0 || msg.control === 1 ? msg.control : (dist(hp, T[0]) <= dist(hp, T[1]) ? 0 : 1);\n"
    "    const sl = rec.slots[c];\n"
    "    if (c === 0) {\n"
    "      if (time < shred.until) return refuse(pl, hp, 'wait');\n"
    "      const it = inSlot(rec, 0);\n"
    "      if (!it || it.kind !== 'plant') return refuse(pl, hp, 'noPlantIn');\n"
    "      shred.until = time + S(RULES.lab.shred); shred.by = pl.id;\n"
    "      emit('shred', at(sl, { player: pl.id }));\n"
    "      return { ok: true };\n"
    "    }\n"
    "    if (time < mixer.until) return refuse(pl, hp, 'wait');\n"
    "    if (sl.item != null) return refuse(pl, hp, 'takeFirst');\n"
    "    if (mixer.mix.length < 2) return refuse(pl, hp, 'needTwo');\n"
    "    mixer.until = time + S(RULES.lab.mix); mixer.by = pl.id;\n"
    "    emit('mix', at(sl, { player: pl.id }));\n"
    "    return { ok: true };\n"
    "  }\n")
rep("    if (!rec) return refuse(pl, hp, 'noStation');\n    if (rec.st.kind !== 'bin') return refuse(pl, hp, 'notBin');\n",
    "    if (!rec) return refuse(pl, hp, 'noStation');\n    if (rec.st.kind === 'grow') return doHarvest(pl, hand, hp, rec);\n    if (rec.st.kind !== 'bin') return refuse(pl, hp, 'notBin');\n")
rep("    if (kind === 'button') return doTrap(pl, hp, rec);\n",
    "    if (kind === 'button') return doTrap(pl, hp, rec);\n    if (kind === 'stash') return doStash(pl, hp, rec, msg);\n    if (kind === 'bench') return doBench(pl, hp, rec, msg);\n")
# drinks: the tap is pressed by hand; without a cup it just runs
rep("      const cup = inSlot(rec, c);\n      if (!cup) return refuse(pl, hp, 'noCup');\n      if (cup.state.fill >= 1) return refuse(pl, hp, 'cupFull');\n      if (!startPour(cup, c)) return refuse(pl, hp, 'otherDrink');\n      return { ok: true };",
    "      const cup = inSlot(rec, c);\n"
    "      if (!cup) { emit('spill', at(rec.slots[c], { player: pl.id, seat: c })); return { ok: true, spill: true }; }\n"
    "      if (cup.state.fill >= 1) return refuse(pl, hp, 'cupFull');\n"
    "      if (!startPour(cup, c)) return refuse(pl, hp, 'otherDrink');\n"
    "      emit('pouring', at(rec.slots[c], { player: pl.id, seat: c }));\n"
    "      return { ok: true };")

# snapshot
rep("    if (meatRec) dyn.push({ id: 'bin_meat', state: { stock: meatStock } });\n",
    "    if (meatRec) dyn.push({ id: 'bin_meat', state: { stock: meatStock } });\n"
    "    if (stashRec) dyn.push({ id: 'stash', state: { open: r3(stashOpen), want: stashWant, pend: pending.map((o) => o.idx), on: labOn && labOpen() } });\n"
    "    if (growRec) dyn.push({ id: 'grow', state: { pots: pots.map((q) => r3(q.s)) } });\n"
    "    if (benchRec) dyn.push({ id: 'bench', state: {\n"
    "      shred: shred.until ? r3(clamp(1 - (shred.until - time) / S(RULES.lab.shred), 0.01, 1)) : 0,\n"
    "      mix: mixer.mix.slice(), mixing: mixer.until ? r3(clamp(1 - (mixer.until - time) / S(RULES.lab.mix), 0.01, 1)) : 0, pure: mixer.pure } });\n")
rep("patience: r3(c.patience), order: c.order.stack ? { kind: c.order.kind, stack: c.order.stack.slice() } : { ...c.order }, special: c.special, mark: c.mark }))",
    "patience: r3(c.patience), order: c.order.stack ? { kind: c.order.kind, stack: c.order.stack.slice() } : { ...c.order }, special: c.special, mark: c.mark, buyer: !!c.buyer }))")
# hint: a buyer is waiting
rep("    if (evening()) {\n      if (hopper > 0", "    if (labOn && customers.some((c) => c.buyer && c.state === 'wait')) return TX.hint.buyer;\n    if (evening()) {\n      if (hopper > 0")
# the starter stock of the cabinet and a debug door for tests
rep("  emit('phase', { text: TX.title.tutorial });\n",
    "  if (labOn) for (const k of ['blue', 'clear']) { const i = stashRec.st.shelf.indexOf(k); if (i >= 0) putInSlot(newItem(k, 1), stashRec.slots[i]); }\n"
    "  emit('phase', { text: TX.title.tutorial });\n")
rep("stock: (n = 6) => { meatStock += n; } },", "stock: (n = 6) => { meatStock += n; }, cash: (n = 100) => { money += n; }, lab: () => ({ stashOpen, stashWant, pending: pending.slice(), pots: pots.map((q) => q.s), shred: { ...shred }, mixer: { ...mixer, mix: mixer.mix.slice() }, on: labOn }) },")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rules patched')

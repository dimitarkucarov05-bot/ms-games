"""The Back Room 1.3, rules. Run from lobby-stage.
Slower clock (5 min night, 6 min day), no police, the shop is opened by hand, the street as a third stop of the lift with
three blocks to walk through and buyers there, five liquids and six recipes, joints rolled by shaking both hands, product
that can be consumed for an effect, and one clear goal at any moment."""
import io

p = 'game/backroom.js'
s = io.open(p, encoding='utf-8').read()
n = 0


def rep(a, b, count=1):
    global s, n
    assert s.count(a) == count, (s.count(a), a[:90])
    s = s.replace(a, b)
    n += 1


# ───── numbers ─────
rep("  // one evening of training, then two nights in the cellar and two days in the shop, then the inspection (720 s)\n"
    "  phases: { tutorial: 40, night: 150, day: 200, night2: 100, day2: 190, raid: 40 },",
    "  // one evening of training, then a night in the cellar (5 min) and a day in the shop and in the street (6 min);\n"
    "  // with opts.days = 2 a second night and day follow\n"
    "  phases: { tutorial: 40, night: 300, day: 360, night2: 300, day2: 360 },")
rep("  sell: { buds: 25, joint: 40, powder: 35, pills: 45, ice: 60, pure: 1.5 },\n"
    "  shop: { blue: 12, clear: 8, red: 8, papers: 5, seeds: 10, box: 15, delay: 5 },\n"
    "  stock: { blue: 1, clear: 1, red: 1, papers: 1, seeds: 0, box: 1 },      // what waits on the storage rack at the start",
    "  sell: { buds: 20, joint: 40, powder: 35, pills: 45, candy: 50, syrup: 55, ice: 60, crystal: 90, pure: 1.5 },\n"
    "  shop: { blue: 12, clear: 8, red: 8, green: 10, yellow: 8, papers: 5, seeds: 10, box: 15, delay: 5 },\n"
    "  stock: { blue: 1, clear: 1, red: 1, green: 0, yellow: 0, papers: 1, seeds: 0, box: 1 },      // what waits on the storage rack at the start")
rep("  fill: { blue: { blue: 100 }, clear: { clear: 150 }, red: { red: 150 } }, cap: { blue: 250, clear: 150, red: 150, mixer: 300 },\n"
    "  lab: { shred: 2.5, mix: 3, grow: 25, combine: 0.30, door: 0.6, tilt: 100, rate: 30, mouth: 0.16, reachXZ: 0.24, batch: 50, buds: 3, box: 6, pack: 0.30 },",
    "  fill: { blue: { blue: 100 }, clear: { clear: 150 }, red: { red: 150 }, green: { green: 100 }, yellow: { yellow: 150 } },\n"
    "  cap: { blue: 250, clear: 150, red: 150, green: 150, yellow: 150, mixer: 300 },\n"
    "  // tol: how far a share may be from the recipe; stray: how much of a liquid the recipe does not name may be in;\n"
    "  // roll: how close the two hands must be to roll a joint by shaking\n"
    "  lab: { shred: 2.5, mix: 3, grow: 25, door: 0.6, tilt: 100, rate: 30, mouth: 0.16, reachXZ: 0.24, batch: 50, buds: 3, box: 6, pack: 0.30, tol: 0.15, stray: 0.12, roll: 0.5 },\n"
    "  // the street: three blocks reached through the lift and on foot. Each block likes its own goods and pays its own price;\n"
    "  // a buyer waits `patience` seconds at his spot, a new one comes about every `interval` seconds while it is day\n"
    "  street: { blocks: [\n"
    "    { id: 'alley', name: 'Back alley', wants: ['buds', 'joint'], bonus: 1 },\n"
    "    { id: 'plaza', name: 'Plaza', wants: ['pills', 'candy', 'powder'], bonus: 1.25 },\n"
    "    { id: 'park', name: 'Park', wants: ['ice', 'crystal', 'syrup'], bonus: 1.5 },\n"
    "  ], interval: 11, patience: 75, walk: 1.8, tip: 0.3 },\n"
    "  // what a product does to the one who takes it: [effect, seconds]. mellow: every customer waits twice as long;\n"
    "  // rush: the machines you start run twice as fast; charm: what you sell pays one and a half times;\n"
    "  // focus: your batch comes out pure even when it was not shaken\n"
    "  fx: { of: { joint: ['mellow', 60], syrup: ['mellow', 90], ice: ['rush', 45], crystal: ['rush', 80], pills: ['charm', 60], candy: ['charm', 40], powder: ['focus', 60] },\n"
    "    mouth: 0.28, mellow: 0.5, rush: 2, charm: 1.5 },")
rep("  patrol: { first: 30, spread: 45, gap: [70, 110], warn: 60, on: 12, sus: 0.5, fine: 30 },",
    "  patrol: { off: true, first: 30, spread: 45, gap: [70, 110], warn: 60, on: 12, sus: 0.5, fine: 30 },      // off: no police for now (the owner's word)")
rep("  stars: [50, 100, 160, 230],", "  stars: [80, 160, 260, 380],")
rep("const PHASES = ['tutorial', 'night', 'day', 'night2', 'day2', 'raid'];", "const PHASES_ALL = ['tutorial', 'night', 'day', 'night2', 'day2'];")
rep("const LIQUIDS = ['blue', 'clear', 'red'];          // the liquids for the mixer in the cellar",
    "const LIQUIDS = ['blue', 'clear', 'red', 'green', 'yellow'];          // the liquids for the mixer: blue base, solvent, catalyst, acid, syrup base\n"
    "const zeros = () => LIQUIDS.map(() => 0);")
rep("const SELL = ['buds', 'joint', 'ice', 'pills', 'powder'];      // the product of the cellar: sold over the counter to buyers",
    "const SELL = ['buds', 'joint', 'ice', 'pills', 'powder', 'crystal', 'candy', 'syrup'];      // the product of the cellar: sold in the street\n"
    "const MIXED = ['ice', 'pills', 'powder', 'crystal', 'candy', 'syrup'];                     // what the mixer makes")
rep("// The recipes of the mixer: the shares of blue, clear (solvent) and red (catalyst). `ok` are the limits inside which the\n"
    "// product still comes out; within 0.06 of `ideal` and shaken it comes out pure.\n"
    "export const RECIPES = {\n"
    "  ice: { ideal: [0.6, 0.4, 0], ok: [[0.5, 1], [0.25, 0.5], [0, 0.12]] },\n"
    "  pills: { ideal: [0.5, 0, 0.5], ok: [[0.35, 0.65], [0, 0.15], [0.35, 0.65]] },\n"
    "  powder: { ideal: [0, 0.6, 0.4], ok: [[0, 0.12], [0.45, 0.75], [0.25, 0.55]] },\n"
    "};\n"
    "export const STORE = ['blue', 'clear', 'red', 'papers', 'seeds', 'box'];      // what the screen sells, in this order",
    "// The recipes of the mixer: the shares of blue, clear (solvent), red (catalyst), green (acid) and yellow (syrup base).\n"
    "// A share may be RULES.lab.tol away from the recipe and the product still comes out; within 0.06 and shaken it is pure.\n"
    "export const RECIPES = {\n"
    "  ice: { ideal: [0.6, 0.4, 0, 0, 0] },\n"
    "  pills: { ideal: [0.5, 0, 0.5, 0, 0] },\n"
    "  powder: { ideal: [0, 0.6, 0.4, 0, 0] },\n"
    "  crystal: { ideal: [0.4, 0.3, 0, 0.3, 0] },\n"
    "  candy: { ideal: [0, 0, 0.5, 0, 0.5] },\n"
    "  syrup: { ideal: [0, 0, 0, 0.4, 0.6] },\n"
    "};\n"
    "export const LIQUID_NAMES = { blue: 'blue', clear: 'solvent', red: 'catalyst', green: 'acid', yellow: 'syrup base' };\n"
    "export const STORE = ['blue', 'clear', 'red', 'green', 'yellow', 'papers', 'seeds', 'box'];      // what the screen sells, in this order")

# ───── texts ─────
rep("  title: { tutorial: 'Training', night: 'Night', day: 'Day', night2: 'Night', day2: 'Day', raid: 'Inspection', over: 'The end' },\n"
    "  hint: {\n"
    "    tutorial: 'Dough on the board, sauce and cheese, into the oven, then onto the counter.',\n"
    "    night: 'Night. The shop is shut: go down, make product, pack it in the box. Order supplies on the screen.',\n"
    "    day: 'Day. Serve pizza and drinks. Buyers get their packets from the box. Order on the screen above the board.',\n"
    "    night2: 'Night again. Down to the cellar: more product into the box.',\n"
    "    day2: 'Last day. Sell everything that is in the box.',",
    "  title: { tutorial: 'Training', night: 'Night', day: 'Day', night2: 'Night', day2: 'Day', raid: 'Inspection', over: 'The end' },\n"
    "  // one clear thing to do at any moment: shown on the screens and marked in the room\n"
    "  goal: {\n"
    "    tutorial: 'Training: dough on the board, sauce, cheese, oven, counter.',\n"
    "    down: 'Night, 00:00 to 08:00: take the lift down and make product.',\n"
    "    make: 'Make product: a plant into the shredder, liquids into the mixer. Recipes are on the screen.',\n"
    "    pack: 'Put the packets into the carry box. More product = more money by day.',\n"
    "    open: 'Day, 08:00: go up and press the OPEN button on the counter. Customers come only then.',\n"
    "    openOrStreet: 'Day: press OPEN on the counter for pizza customers, or take the box in the lift to the STREET.',\n"
    "    serve: 'The shop is open: serve the customers at the counter.',\n"
    "    waiting: 'Customers are waiting at the counter!',\n"
    "    street: 'You have product: take the box into the lift and press STREET. Buyers are out there.',\n"
    "    sell: 'Give each buyer the packet he shows. Walk on at the signpost: other blocks pay more.',\n"
    "    home: 'Nothing left to sell here: walk back to the lift.',\n"
    "    kidsNight: 'Night: the shop is shut. The lift goes down to the store.',\n"
    "  },\n"
    "  fx: { mellow: 'Mellow: customers wait twice as long', rush: 'Rush: your machines run twice as fast', charm: 'Charm: your sales pay one and a half times', focus: 'Focus: your batches come out pure' },\n"
    "  hint: {\n"
    "    tutorial: 'Dough on the board, sauce and cheese, into the oven, then onto the counter.',\n"
    "    night: 'Night. The shop is shut: go down, make product, pack it in the box. Order supplies on the screen.',\n"
    "    day: 'Day. Open the shop with the button on the counter, or take the box to the street.',\n"
    "    night2: 'Night again. Down to the cellar: more product into the box.',\n"
    "    day2: 'Last day. Sell everything that is in the box.',")
rep("    shopShut: 'The store is closed now',\n    boxEmpty: 'The box is empty',\n    boxFull: 'The box is full',\n  },\n};\n\nconst KIDS",
    "    shopShut: 'The store is closed now',\n    boxEmpty: 'The box is empty',\n    boxFull: 'The box is full',\n"
    "    nightShop: 'Nobody comes at night. Open at 08:00',\n"
    "    labDay: 'The machines run only at night, 00:00 to 08:00',\n"
    "    streetNight: 'The streets are empty at night. Sell by day',\n"
    "    rollClose: 'Hold the papers and the bud close together and shake',\n"
    "    rollFirst: 'Roll it in papers first',\n"
    "    notThat: 'He wants something else',\n"
    "    noBuyer: 'Nobody is waiting here',\n"
    "  },\n};\n\nconst KIDS")
rep("    night: 'Night. The shop is shut. The machine in the store makes salami from the crates.',\n"
    "    day: 'Day. Serve the customers: pizza as ordered and a full cup.',",
    "    night: 'Night. The shop is shut. The machine in the store makes salami from the crates.',\n"
    "    day: 'Day. Press the OPEN button on the counter, then serve: pizza as ordered and a full cup.',")

# ───── the rack: trays take one place, two more supplies ─────
rep("  supplies: { blue: [1, 0], clear: [1, 1], red: [1, 2], papers: [2, 0], seeds: [2, 1], box: [2, 2] },",
    "  supplies: { blue: [1, 0], clear: [1, 1], red: [1, 2], green: [0, 1], yellow: [0, 2], papers: [2, 0], seeds: [2, 1], box: [2, 2] },")
rep("    add('bin_tray', 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[0], zm, yaw, [r3(cw * 3 - 0.02), 0.14, N.depth], { gives: 'tray', tier: 0, room: B.id, nat: 1, rack: 1 });",
    "    add('bin_tray', 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[0], zm + (labOn ? cw * Math.sin(yaw) : 0), yaw, [r3((labOn ? cw : cw * 3) - 0.02), 0.14, N.depth], { gives: 'tray', tier: 0, room: B.id, nat: 1, rack: labOn ? 0 : 1 });")
rep("      add(`bin_${gives}`, 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[shelf], zm - lx * Math.sin(yaw), yaw, [r3(cw - 0.02), 0.14, N.depth], { gives, tier: shelf, room: B.id, nat: 1, stock: 1 });",
    "      add(`bin_${gives}`, 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[shelf], zm - lx * Math.sin(yaw), yaw, [r3(cw - 0.02), 0.14, N.depth], { gives, tier: shelf, room: B.id, nat: 1, stock: 1, rack: col === 1 && shelf === 1 ? 1 : 0 });")

# ───── the shutter gets a button on the counter; the street ─────
rep("  if (natPlan) add('shutter', 'shutter', 0, 0, 0, hd + 0.05, Math.PI, [NAT.counter.w, NAT.shutter.h, NAT.shutter.d], { nat: 1 });\n"
    "  else add('shutter', 'shutter', 0, 0, SURFACE_Y, hd - 0.025, Math.PI, [w, 1.2, 0.05]);",
    "  // the OPEN button of the shop: on the inner edge of the counter, at its left end\n"
    "  if (natPlan) ctl(add('shutter', 'shutter', 0, 0, 0, hd + 0.05, Math.PI, [NAT.counter.w, NAT.shutter.h, NAT.shutter.d], { nat: 1 }), NAT.counter.w / 2 - 0.16, NAT.counter.top, hd + 0.05 - (hd - NAT.counter.inside + 0.08));\n"
    "  else ctl(add('shutter', 'shutter', 0, 0, SURFACE_Y, hd - 0.025, Math.PI, [w, 1.2, 0.05]), w / 2 - 0.2, 0.02, 0.55);")
rep("  for (const st of stations) if (st.kind === 'elevator') st.room = elevator.room;\n"
    "  return { hall: { w: r3(w), d: r3(d) }, stations, seats, obstacles: polys, warnings, elevator, levels: 2, rooms, doors, plan: 'compact', natural: !!natPlan };",
    "  // ── the street: levels 2, 3, 4 are three blocks of the town on the same floor. Block one is where the lift opens; the\n"
    "  // next block starts at the signpost at the far end, so walking the town is walking the zone there and back ──\n"
    "  let levels = 2;\n"
    "  const street = [];\n"
    "  if (labPlan && opts.lab !== false && B && elevator.annex && stations.some((st) => st.kind === 'bench')) {\n"
    "    const blocks = RULES.street.blocks, n = blocks.length;\n"
    "    const front = { x: 0, z: hd - 0.3 }, back = { x: elevator.x, z: elevator.z + (elevator.z < A.z ? -1 : 1) * (elevator.d / 2 - 0.4) };\n"
    "    const way = (level, end, to) => {\n"
    "      const q = end === 'front' ? front : back;\n"
    "      ctl(add(`way_${level}_${to}`, 'way', level, q.x, 1.0, q.z, 0, [0.3, 0.3, 0.3], { to, end, room: end === 'front' ? 'a' : B.id }), 0, 0.15, 0);\n"
    "    };\n"
    "    // where buyers stand: just outside an edge of the zone, [x, z, outward x, outward z]\n"
    "    const bx = B.x - B.w / 2, bz = (elevator.z + (elevator.z < A.z ? 1 : -1) * elevator.d / 2 + (B.z + (elevator.z < A.z ? 1 : -1) * B.d / 2)) / 2;\n"
    "    const SPOTS = [\n"
    "      [[hw, 0.15, 1, 0], [bx, bz, -1, 0]],\n"
    "      [[-hw, 0.35, -1, 0], [hw, -0.45, 1, 0]],\n"
    "      [[hw, 0.4, 1, 0], [-hw, -0.25, -1, 0]],\n"
    "    ];\n"
    "    for (let b = 0; b < n; b++) {\n"
    "      const level = 2 + b;\n"
    "      street.push({ level, id: blocks[b].id, name: blocks[b].name, wants: blocks[b].wants.slice(), bonus: blocks[b].bonus });\n"
    "      if (b === 0) add('elevator_2', 'elevator', 2, elevator.x, 0, elevator.z, liftYaw, liftSize, { room: elevator.room, whole: elevator.whole });\n"
    "      if (b > 0) way(level, b % 2 ? 'front' : 'back', level - 1);\n"
    "      if (b < n - 1) way(level, b % 2 ? 'back' : 'front', level + 1);\n"
    "      SPOTS[b % SPOTS.length].forEach(([x, z, ox, oz], i) => {\n"
    "        const sp = add(`spot_${level}_${i}`, 'spot', level, x - ox * 0.12, 0, z - oz * 0.12, Math.atan2(-ox, -oz), [0.5, 1.3, 0.24], { out: [ox, oz], block: b, room: Math.abs(x - A.x) <= hw + 0.01 && Math.abs(z - A.z) <= hd + 0.01 ? 'a' : B.id });\n"
    "        slot(sp, 0, 1.1, 0, SELL.slice());\n"
    "      });\n"
    "    }\n"
    "    levels = 2 + n;\n"
    "  }\n"
    "  for (const st of stations) if (st.kind === 'elevator') st.room = elevator.room;\n"
    "  return { hall: { w: r3(w), d: r3(d) }, stations, seats, obstacles: polys, warnings, elevator, levels, street, rooms, doors, plan: 'compact', natural: !!natPlan };")

# ───── the game ─────
rep("  const duration = {};\n  for (const p of PHASES) duration[p] = r3(S(RULES.phases[p]));",
    "  const PHASES = opts.days >= 2 ? PHASES_ALL : PHASES_ALL.slice(0, 3);\n"
    "  const duration = {};\n  for (const p of PHASES) duration[p] = r3(S(RULES.phases[p]));")
rep("    recipes: RECIPES, sell: RULES.sell, lab: { batch: RULES.lab.batch, cap: RULES.cap, fill: RULES.fill, buds: RULES.lab.buds, box: RULES.lab.box } });",
    "    recipes: RECIPES, liquids: LIQUIDS, liquidNames: LIQUID_NAMES, sell: RULES.sell, street: layout.street || [], phases: PHASES,\n"
    "    fx: { of: RULES.fx.of, text: TX.fx || {} },\n"
    "    lab: { batch: RULES.lab.batch, cap: RULES.cap, fill: RULES.fill, buds: RULES.lab.buds, box: RULES.lab.box } });")
rep("  const mixer = { c: [0, 0, 0], shaken: 0, until: 0, by: null, out: [] };",
    "  const mixer = { c: zeros(), shaken: 0, until: 0, dur: 1, by: null, out: [] };\n"
    "  // the street: the buyers of each block and when the next one comes\n"
    "  const blocks = layout.street || [];\n"
    "  const streetOn = labOn && blocks.length > 0;\n"
    "  const spots = layout.stations.filter((st) => st.kind === 'spot');\n"
    "  const walkers = [];\n"
    "  const nextWalk = blocks.map(() => Infinity);\n"
    "  let shopOpen = false, sold = 0;")
rep("  let doorOpen = 0, shutterOpen = 1;", "  let doorOpen = 0, shutterOpen = 1;      // shutterOpen: how far the shutter is up; shopOpen (below): what the players chose")
rep("  const shred = { until: 0, by: null, out: 0 };", "  const shred = { until: 0, dur: 1, by: null, out: 0 };")
rep("  const pubPlayer = (pl) => ({ id: pl.id, n: pl.n, name: pl.name, served: pl.served, cooked: pl.cooked, packed: pl.packed, drops: pl.drops, mistakes: pl.mistakes });",
    "  const pubPlayer = (pl) => ({ id: pl.id, n: pl.n, name: pl.name, served: pl.served, cooked: pl.cooked, packed: pl.packed, drops: pl.drops, mistakes: pl.mistakes });\n"
    "  // what a player has taken and still feels\n"
    "  const fxOn = (pl, kind) => !!(pl && pl.fx && pl.fx.kind === kind && time < pl.fx.until);\n"
    "  const anyFx = (kind) => { for (const pl of players.values()) if (fxOn(pl, kind)) return true; return false; };")
rep("      case 'blue': case 'clear': case 'red': { const f = RULES.fill[kind]; return { c: [f.blue || 0, f.clear || 0, f.red || 0], shake: 0 }; }\n"
    "      case 'ice': case 'pills': case 'powder': return { pure: 0 };",
    "      case 'blue': case 'clear': case 'red': case 'green': case 'yellow': { const f = RULES.fill[kind]; return { c: LIQUIDS.map((k) => f[k] || 0), shake: 0 }; }\n"
    "      case 'ice': case 'pills': case 'powder': case 'crystal': case 'candy': case 'syrup': return { pure: 0 };")
# place(): no more rolling by putting down; a packet handed to a buyer in the street
rep("""    // 0a. papers next to buds (or buds next to papers): a joint lies where the other one was
    if (it.kind === 'papers' || it.kind === 'buds') {
      const other = it.kind === 'papers' ? 'buds' : 'papers';
      let mate = null, md = RULES.lab.combine + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== other || q.holder != null || q.floor || q.level !== L) continue;
        if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;
        const dd = dist(p, q);
        if (dd <= md) { md = dd; mate = q; }
      }
      if (mate) {
        const sl = mate.slot != null ? slotById.get(mate.slot) : null, pos = { x: mate.x, y: mate.y, z: mate.z };
        removeItem(mate); removeItem(it);
        const j = newItem('joint', L);
        j.by = pl.id; j.yaw = yaw;
        if (sl && sl.accepts.includes('joint')) putInSlot(j, sl); else { j.x = pos.x; j.y = pos.y; j.z = pos.z; }
        pl.packed++;
        emit('rolled', at(j, { player: pl.id }));
        return 6;
      }
    }
""", """    // 0a. in the street: a packet held out to a buyer who waits for exactly that
    if (L >= 2 && SELL.includes(it.kind)) {
      let w = null, wd = RULES.snapSlot + 0.15;
      for (const q of walkers) {
        if (q.level !== L || q.state !== 'wait') continue;
        const dd = dist(p, q.hand);
        if (dd <= wd) { wd = dd; w = q; }
      }
      if (w) {
        if (w.want === it.kind) { sellTo(w, it, pl); return 9; }
        emit('deny', { player: pl.id, level: L, x: p.x, y: p.y, z: p.z, text: TX.deny.notThat });
      }
    }
""")
rep("      if (s.level !== L || !s.accepts.includes(it.kind)) continue;\n      if (s.item != null && s.kind !== 'trash' && s.kind !== 'bin') continue;",
    "      if (s.level !== L || !s.accepts.includes(it.kind) || s.kind === 'spot') continue;\n      if (s.item != null && s.kind !== 'trash' && s.kind !== 'bin') continue;")
# customers: no buyers at the counter, only while the shop is open, mellow, charm
rep("    const base = o.kind === 'stuff' ? Math.round(RULES.sell[o.item] * (it && it.state.pure ? RULES.sell.pure : 1)) : o.kind === 'pizza' ? P.pizza + P.top * o.stack.length + P.meat * count(o.stack, 'meat') : P.cup;\n"
    "    return base + (c.tutorial ? 0 : Math.round(base * P.tip * c.patience));",
    "    const base = o.kind === 'stuff' ? Math.round(RULES.sell[o.item] * (it && it.state.pure ? RULES.sell.pure : 1)) : o.kind === 'pizza' ? P.pizza + P.top * o.stack.length + P.meat * count(o.stack, 'meat') : P.cup;\n"
    "    return Math.round((base + (c.tutorial ? 0 : Math.round(base * P.tip * c.patience))) * (fxOn(who, 'charm') ? RULES.fx.charm : 1));")
rep("  function payFor(c, it) {", "  function payFor(c, it, who) {")
rep("      const amount = payFor(c, it);", "      const amount = payFor(c, it, who);")
rep("    if (labOn && rand() < (anyStuff() ? RULES.buyerShare : RULES.buyerTease)) return { order: { kind: 'stuff', item: wantedStuff() }, mark: false, buyer: true };\n", "")
rep("    } else if (isDay() && time >= nextSpawnAt) {", "    } else if (isDay() && shopOpen && time >= nextSpawnAt) {")
rep("        c.patience -= h / c.patDur;\n        if (c.patience <= 0) {   // изпуснат клиент",
    "        c.patience -= h / c.patDur * (anyFx('mellow') ? RULES.fx.mellow : 1);\n        if (c.patience <= 0) {   // изпуснат клиент")
rep("        it.state.fill = Math.min(1, it.state.fill + h / S(RULES.pour));", "        it.state.fill = Math.min(1, it.state.fill + h / S(RULES.pour) * (anyFx('rush') ? RULES.fx.rush : 1));")
# liquids of any number
rep("  const total = (c) => c[0] + c[1] + c[2];", "  const total = (c) => { let t = 0; for (const v of c) t += v; return t; };")
rep("""  function batchOf(c, shakenMl) {
    const t = total(c);
    if (t <= 0) return null;
    const sh = [c[0] / t, c[1] / t, c[2] / t];
    for (const [kind, r] of Object.entries(RECIPES)) {
      if (!sh.every((v, i) => v >= r.ok[i][0] - 1e-9 && v <= r.ok[i][1] + 1e-9)) continue;
      const exact = sh.every((v, i) => Math.abs(v - r.ideal[i]) <= 0.06);
      return { kind, pure: exact && shakenMl / t >= 0.9 };
    }
    return null;
  }""", """  function batchOf(c, shakenMl, sure) {
    const t = total(c);
    if (t <= 0) return null;
    const sh = c.map((v) => v / t), L = RULES.lab;
    for (const [kind, r] of Object.entries(RECIPES)) {
      if (!sh.every((v, i) => (r.ideal[i] > 0 ? Math.abs(v - r.ideal[i]) <= L.tol + 1e-9 : v <= L.stray + 1e-9))) continue;
      const exact = sh.every((v, i) => Math.abs(v - r.ideal[i]) <= 0.06);
      return { kind, pure: !!sure || (exact && shakenMl / t >= 0.9) };
    }
    return null;
  }""")
rep("        for (let i = 0; i < 3; i++) { const v = src.state.c[i] * k; src.state.c[i] -= v; into[i] += v; }", "        for (let i = 0; i < LIQUIDS.length; i++) { const v = src.state.c[i] * k; src.state.c[i] -= v; into[i] += v; }")
rep("        if (total(src.state.c) < 0.5) { src.state.c = [0, 0, 0]; src.state.shake = 0; }", "        if (total(src.state.c) < 0.5) { src.state.c = zeros(); src.state.shake = 0; }")
rep("      q.s = Math.min(1, q.s + h / S(RULES.lab.grow));", "      q.s = Math.min(1, q.s + h / S(RULES.lab.grow) * (anyFx('rush') ? RULES.fx.rush : 1));")
rep("      const got = batchOf(mixer.c, mixer.shaken), n = clamp(Math.floor(total(mixer.c) / RULES.lab.batch + 1e-6), 1, 5), pl = players.get(mixer.by);",
    "      const pl = players.get(mixer.by), got = batchOf(mixer.c, mixer.shaken, fxOn(pl, 'focus')), n = clamp(Math.floor(total(mixer.c) / RULES.lab.batch + 1e-6), 1, 5);")
rep("      mixer.c = [0, 0, 0]; mixer.shaken = 0;", "      mixer.c = zeros(); mixer.shaken = 0;")

# the street: buyers, selling; the lift with three stops
rep("  // ── подът под клиентите и улеят към мазето ──\n  function stepTraps(h) {",
    """  // ── the street: buyers stand just outside the zone, each wants one thing; the packet goes from hand to hand ──
  function sellTo(w, it, pl) {
    const b = blocks[w.block];
    const base = RULES.sell[it.kind] * (it.state.pure ? RULES.sell.pure : 1) * b.bonus;
    const amount = Math.round(base * (1 + RULES.street.tip * w.patience) * (fxOn(pl, 'charm') ? RULES.fx.charm : 1));
    money += amount; sold++;
    pl.served++;
    emit('order_ok', { x: w.hand.x, y: w.hand.y, z: w.hand.z, level: w.level, player: pl.id });
    emit('cash', { x: w.hand.x, y: w.hand.y + 0.15, z: w.hand.z, level: w.level, player: pl.id, amount });
    w.state = 'happy'; w.t0 = time;
    removeItem(it);
  }
  /** What the buyer of this block asks for: mostly the block's own goods, and rather something that is already made. */
  function streetWant(b) {
    const made = new Set();
    for (const q of items.values()) { if (SELL.includes(q.kind)) made.add(q.kind); else if (q.kind === 'box') for (const e of q.state.n) made.add(e[0]); }
    const own = blocks[b].wants, ownMade = own.filter((k) => made.has(k)), anyMade = [...made];
    const r = rand();
    const pool = ownMade.length && r < 0.7 ? ownMade : anyMade.length && r < 0.85 ? anyMade : own;
    return pool[Math.floor(rand() * pool.length)];
  }
  function stepStreet(h) {
    if (!streetOn) return;
    const R = RULES.street, day = isDay();
    blocks.forEach((blk, b) => {
      if (!day || time < nextWalk[b]) return;
      const free = spots.filter((sp) => sp.block === b && !walkers.some((w) => w.spot === sp.id));
      nextWalk[b] = time + S(R.interval * (0.8 + 0.4 * rand()));
      if (!free.length) return;
      const sp = free[Math.floor(rand() * free.length)], o = sp.out;
      const px = sp.x + o[0] * 0.12, pz = sp.z + o[1] * 0.12;      // the edge of the zone
      walkers.push({ id: nextCustomer++, look: Math.floor(rand() * 6), level: sp.level, block: b, spot: sp.id, want: streetWant(b),
        x: px + o[0] * 3.2, z: pz + o[1] * 3.2, far: { x: px + o[0] * 3.2, z: pz + o[1] * 3.2 }, near: { x: px + o[0] * 0.5, z: pz + o[1] * 0.5 },
        hand: { x: sp.slots[0].x, y: sp.slots[0].y, z: sp.slots[0].z }, yaw: Math.atan2(-o[0], -o[1]), state: 'in', patience: 1, t0: time, patDur: S(R.patience) });
    });
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      if (w.state === 'in') {
        const k = (time - w.t0) / S(R.walk);
        if (k >= 1) { w.x = w.near.x; w.z = w.near.z; w.state = 'wait'; w.t0 = time; }
        else { w.x = w.far.x + (w.near.x - w.far.x) * k; w.z = w.far.z + (w.near.z - w.far.z) * k; }
      } else if (w.state === 'wait') {
        w.patience -= h / w.patDur * (anyFx('mellow') ? RULES.fx.mellow : 1);
        if (w.patience <= 0 || !day) { w.patience = Math.max(0, w.patience); w.state = 'out'; w.t0 = time; w.yaw += Math.PI; }
      } else if (w.state === 'happy') {
        if (time - w.t0 >= S(RULES.linger)) { w.state = 'out'; w.t0 = time; w.yaw += Math.PI; }
      } else {
        const k = (time - w.t0) / S(R.walk);
        if (k >= 1) walkers.splice(i, 1);
        else { w.x = w.near.x + (w.far.x - w.near.x) * k; w.z = w.near.z + (w.far.z - w.near.z) * k; }
      }
    }
  }

  // ── подът под клиентите и улеят към мазето ──
  function stepTraps(h) {""")
rep("  function stepPatrol() {\n    const R = RULES.patrol;\n    if (kids || !isDay()) return;", "  function stepPatrol() {\n    const R = RULES.patrol;\n    if (R.off || kids || !isDay()) return;")
rep("    shutterOpen = toward(shutterOpen, phase === 'tutorial' || isDay() ? 1 : 0, h / S(2));      // the shop is open in the training and by day",
    "    shutterOpen = toward(shutterOpen, phase === 'tutorial' || (isDay() && shopOpen) ? 1 : 0, h / S(2));      // open in the training; by day when the players open it")
rep("    if (p === 'night' || p === 'night2') { leaveAll(); nextSpawnAt = Infinity; rollZone(); }\n"
    "    if (p === 'day' || p === 'day2') { nextSpawnAt = time + S(1.5); nextPatrolAt = time + S(RULES.patrol.first + rand() * RULES.patrol.spread); }\n"
    "    if (p === 'raid') { leaveAll(); nextSpawnAt = Infinity; }",
    "    shopOpen = false;                                   // every day the players open the shop themselves\n"
    "    if (p === 'night' || p === 'night2') { leaveAll(); nextSpawnAt = Infinity; rollZone(); nextWalk.fill(Infinity); }\n"
    "    if (p === 'day' || p === 'day2') {\n"
    "      nextSpawnAt = Infinity;\n"
    "      blocks.forEach((_, b) => { nextWalk[b] = time + S(2 + 3 * b); });\n"
    "      if (!RULES.patrol.off) nextPatrolAt = time + S(RULES.patrol.first + rand() * RULES.patrol.spread);\n"
    "    }")
rep("      if (i === PHASES.length - 1) { raidEnd(); finish(); break; }", "      if (i === PHASES.length - 1) { finish(); break; }")
rep("    stepLab(h);\n    stepPatrol();", "    stepLab(h);\n    stepStreet(h);\n    stepPatrol();")
rep("      case 'unpack': return doUnpack(pl, hand, hp, msg);", "      case 'unpack': return doUnpack(pl, hand, hp, msg);\n      case 'consume': return doConsume(pl, hand, hp);")
rep("""  function doShake(pl, hand, hp) {
    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
    if (!it || !LIQUID.has(it.kind)) return { ok: false, reason: 'bad' };""",
    """  // Papers in one hand and a bud in the other, held close and shaken: a joint is rolled.
  function doShake(pl, hand, hp) {
    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
    const oh = hand === 'l' ? 'r' : 'l', other = pl.hands[oh] != null ? items.get(pl.hands[oh]) : null;
    if (it && other && ((it.kind === 'papers' && other.kind === 'buds') || (it.kind === 'buds' && other.kind === 'papers'))) {
      const op = handPos(pl, oh);
      if (!op || dist(hp, op) > RULES.lab.roll) return refuse(pl, hp, 'rollClose');
      removeItem(it); removeItem(other);
      const j = newItem('joint', pl.level);
      j.by = pl.id;
      hold(j, pl, hand);
      pl.packed++;
      emit('rolled', { x: hp.x, y: hp.y, z: hp.z, level: pl.level, player: pl.id });
      return { ok: true, item: j.id, rolled: true };
    }
    if (!it || !LIQUID.has(it.kind)) return { ok: false, reason: 'bad' };""")
rep("  // The store on the screen: the money goes at once, the thing lands on the storage rack of the cellar a little later.",
    """  // The product is put to the mouth: it is gone, and for a while the player has its effect.
  function doConsume(pl, hand, hp) {
    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
    if (!it) return refuse(pl, hp, 'handEmpty');
    const fx = RULES.fx.of[it.kind];
    if (!fx) return it.kind === 'buds' ? refuse(pl, hp, 'rollFirst') : { ok: false, reason: 'bad' };
    const head = headPos(pl);
    if (!head || dist(hp, { x: head.x, y: head.y - 0.07, z: head.z }) > RULES.fx.mouth) return refuse(pl, hp, 'far');
    removeItem(it);
    pl.fx = { kind: fx[0], until: time + S(fx[1]), from: it.kind };
    emit('high', { x: head.x, y: head.y, z: head.z, level: pl.level, player: pl.id, text: (TX.fx || {})[fx[0]] || '' });
    return { ok: true, fx: fx[0] };
  }

  // The store on the screen: the money goes at once, the thing lands on the storage rack of the cellar a little later.""")
rep("    if (phase === 'tutorial' || phase === 'raid') return refuse(pl, hp, 'shopShut');\n    const price", "    if (phase === 'tutorial') return refuse(pl, hp, 'shopShut');\n    const price")
rep("  function doBench(pl, hp, rec, msg) {\n    if (!labOpen()) return refuse(pl, hp, 'labClosed');",
    "  function doBench(pl, hp, rec, msg) {\n    if (!labOpen()) return refuse(pl, hp, 'labClosed');\n    if (isDay()) return refuse(pl, hp, 'labDay');\n    const quick = fxOn(pl, 'rush') ? RULES.fx.rush : 1;")
rep("      shred.until = time + S(RULES.lab.shred); shred.by = pl.id;", "      shred.dur = S(RULES.lab.shred) / quick; shred.until = time + shred.dur; shred.by = pl.id;")
rep("    mixer.until = time + S(RULES.lab.mix); mixer.by = pl.id;", "    mixer.dur = S(RULES.lab.mix) / quick; mixer.until = time + mixer.dur; mixer.by = pl.id;")
rep("""  function doLift(pl, hp) {
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    if (boxDist(hp, liftRec.box) > REACH) return refuse(pl, hp, 'far');
    if (lift.phase !== 'idle') return refuse(pl, hp, 'liftBusy');
    if (pl.level === lift.level && !inCabin(pl)) return refuse(pl, hp, 'enterCabin');
    lift.phase = 'closing';
    lift.until = time + S(RULES.elevator.doors);
    lift.to = 1 - lift.level;""",
    """  // The lift has three stops when there is a street: the cellar (1), the shop (0) and the street (2). msg.to names the
  // stop; without it the cabin goes between the shop and the cellar (from the street: to the shop).
  function doLift(pl, hp, msg) {
    if (!labOpen()) return refuse(pl, hp, 'labClosed');
    if (pl.level > 2) return refuse(pl, hp, 'otherLevel');
    if (boxDist(hp, liftRec.box) > REACH) return refuse(pl, hp, 'far');
    if (lift.phase !== 'idle') return refuse(pl, hp, 'liftBusy');
    let to = pl.level;                                  // the cabin is elsewhere: it is called
    if (pl.level === lift.level) {
      if (!inCabin(pl)) return refuse(pl, hp, 'enterCabin');
      const want = msg && (msg.to === 0 || msg.to === 1 || (msg.to === 2 && streetOn)) ? msg.to : null;
      to = want != null && want !== lift.level ? want : lift.level === 0 ? 1 : 0;
      if (to === 2 && !isDay()) return refuse(pl, hp, 'streetNight');
    }
    lift.phase = 'closing';
    lift.until = time + S(RULES.elevator.doors);
    lift.to = to;""")
rep("    if (kind === 'elevator') return doLift(pl, hp);   // асансьорът е един и същ и на двете нива",
    "    if (kind === 'elevator') return doLift(pl, hp, msg);   // асансьорът е един и същ на всичките си спирки")
rep("    if (kind === 'button') return doTrap(pl, hp, rec);",
    """    if (kind === 'shutter') {      // the OPEN button: by day the players open and shut the shop themselves
      if (!isDay()) return refuse(pl, hp, phase === 'tutorial' ? 'bad' : 'nightShop');
      shopOpen = !shopOpen;
      if (shopOpen) nextSpawnAt = time + S(1.5); else { leaveAll(); nextSpawnAt = Infinity; }
      emit(shopOpen ? 'shop_open' : 'shop_shut', { x: hp.x, y: hp.y, z: hp.z, level: 0, player: pl.id });
      return { ok: true, open: shopOpen };
    }
    if (kind === 'way') {          // the signpost at the end of a block: on foot to the next one
      pl.level = rec.st.to;
      emit('moved', { x: hp.x, y: hp.y, z: hp.z, level: rec.st.to, to: rec.st.to, player: pl.id });
      return { ok: true, to: rec.st.to };
    }
    if (kind === 'button') return doTrap(pl, hp, rec);""")
rep("""      case 'blue': case 'clear': case 'red': return { c: s.c.map((v) => Math.round(v)), shake: s.shake ? 1 : 0, cap: RULES.cap[it.kind] };
      case 'ice': case 'pills': case 'powder': return { pure: s.pure ? 1 : 0 };""",
    """      case 'blue': case 'clear': case 'red': case 'green': case 'yellow': return { c: s.c.map((v) => Math.round(v)), shake: s.shake ? 1 : 0, cap: RULES.cap[it.kind] };
      case 'ice': case 'pills': case 'powder': case 'crystal': case 'candy': case 'syrup': return { pure: s.pure ? 1 : 0 };""")
rep("""  function hintText() {
    if (over) return result.caught ? TX.hint.overCaught : TX.hint.over;
    if (patrol) return patrol.phase === 'warn' ? TX.hint.patrolWarn : TX.hint.patrolOn;
    if (labOn && customers.some((c) => c.buyer && c.state === 'wait')) return TX.hint.buyer;
    if (evening()) {
      if (meatStock > 0) return TX.hint.meatUp;
      return TX.hint.evening;
    }
    if (isNight() && hopper > 0 && !kids) return TX.hint.hopper;
    return TX.hint[phase];
  }
""", """  // The one thing to do now: { text, station, to }. station: where the mark stands; to: the level the lift should go to.
  // Sent whole to everybody; the headset turns it into the way from where its player stands.
  function goalNow() {
    if (over) return null;
    const G = TX.goal;
    if (phase === 'tutorial') return { text: G.tutorial, station: 'prep' };
    const waiting = customers.filter((c) => c.state === 'wait' && !c.mark).length;
    if (!labOn) {
      if (isNight()) return { text: G.kidsNight, station: 'elevator', to: 1 };
      if (!shopOpen) return { text: G.open, station: 'shutter' };
      return { text: waiting ? G.waiting : G.serve, station: 'counter' };
    }
    let loose = 0, boxed = 0;
    for (const q of items.values()) { if (SELL.includes(q.kind)) loose++; else if (q.kind === 'box') boxed += q.state.n.length; }
    if (isNight()) {
      if (![...players.values()].some((pl) => pl.level === 1)) return { text: G.down, station: 'elevator', to: 1 };
      if (loose + boxed === 0) return { text: G.make, station: 'bench' };
      if (loose > 0) return { text: G.pack, station: 'bench' };
      return { text: G.make, station: 'bench' };
    }
    const stuff = loose + boxed;
    if (shopOpen && waiting) return { text: G.waiting, station: 'counter' };
    if (stuff && streetOn) return shopOpen ? { text: G.street, station: 'elevator', to: 2 } : { text: G.openOrStreet, station: 'shutter' };
    if (!shopOpen) return { text: G.open, station: 'shutter' };
    return { text: G.serve, station: 'counter' };
  }
  function hintText() {
    if (over) return result.caught ? TX.hint.overCaught : TX.hint.over;
    if (patrol) return patrol.phase === 'warn' ? TX.hint.patrolWarn : TX.hint.patrolOn;
    if (evening() && shopOpen && customers.some((c) => c.mark && c.state === 'wait')) return TX.hint.evening;
    const g = goalNow();
    return g ? g.text : TX.hint[phase];
  }
""")
rep("      players: [...players.values()].map((pl) => ({ ...pubPlayer(pl), level: pl.level, hidden: false })),",
    "      players: [...players.values()].map((pl) => ({ ...pubPlayer(pl), level: pl.level, hidden: false,\n"
    "        fx: pl.fx && time < pl.fx.until ? { kind: pl.fx.kind, left: r3(pl.fx.until - time), from: pl.fx.from } : null })),\n"
    "      goal: goalNow(),\n"
    "      shop: shopOpen,\n"
    "      waiting: customers.filter((c) => c.state === 'wait').length,\n"
    "      sold,\n"
    "      buyers: walkers.map((w) => ({ id: w.id, look: w.look, level: w.level, spot: w.spot, x: r3(w.x), z: r3(w.z), yaw: r3(w.yaw), state: w.state, patience: r3(w.patience), want: w.want,\n"
    "        hand: w.hand })),")
rep("      shred: shred.until ? r3(clamp(1 - (shred.until - time) / S(RULES.lab.shred), 0.01, 1)) : 0, buds: shred.out,\n"
    "      mix: mixer.c.map((v) => Math.round(v)), mixing: mixer.until ? r3(clamp(1 - (mixer.until - time) / S(RULES.lab.mix), 0.01, 1)) : 0,",
    "      shred: shred.until ? r3(clamp(1 - (shred.until - time) / shred.dur, 0.01, 1)) : 0, buds: shred.out, on: isNight(),\n"
    "      mix: mixer.c.map((v) => Math.round(v)), mixing: mixer.until ? r3(clamp(1 - (mixer.until - time) / mixer.dur, 0.01, 1)) : 0,")
rep("      patrol: (sec = 0) => { nextPatrolAt = time + S(sec); }, give:",
    "      patrol: (sec = 0) => { nextPatrolAt = time + S(sec); }, fx: (id, kind, sec = 60) => { const pl = players.get(id); if (pl) pl.fx = { kind, until: time + S(sec), from: 'debug' }; },\n"
    "      walker: (b = 0) => { nextWalk[b] = time; }, open: () => { shopOpen = true; nextSpawnAt = time + S(1.5); }, give:")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rules 1.3 patched,', n, 'edits')

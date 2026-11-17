"""The Back Room 1.2: night and day clock, store, storage rack, vessels with volumes, carry box, police patrol.
Run from lobby-stage."""
import io, re

p = 'game/backroom.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)


def between(a, b, new, keep_end=True):
    """Replace from the start of marker a up to (not including) marker b."""
    global s
    i = s.index(a)
    j = s.index(b, i + len(a))
    assert s.count(a) == 1, (s.count(a), a[:60])
    s = s[:i] + new + s[j:]


def line(start, new):
    global s
    hits = [m for m in re.finditer(r'^' + re.escape(start) + r'.*$', s, re.M)]
    assert len(hits) == 1, (len(hits), start)
    s = s[:hits[0].start()] + new + s[hits[0].end():]


# ───── numbers ─────
rep("  phases: { tutorial: 60, day: 200, closing: 20, night: 220, rush: 180, raid: 45 },",
    "  // one evening of training, then two nights in the cellar and two days in the shop, then the inspection (720 s)\n"
    "  phases: { tutorial: 40, night: 150, day: 200, night2: 100, day2: 190, raid: 40 },\n"
    "  clock: { tutorial: [22 * 60, 24 * 60], night: [0, 8 * 60], day: [8 * 60, 20 * 60], night2: [0, 8 * 60], day2: [8 * 60, 20 * 60], raid: [20 * 60, 21 * 60] },\n"
    "  eveningFrom: 17 * 60,                       // from this hour of the day the rude ones come and the button is unlocked\n"
    "  startMoney: 60,")
rep("  shop: { blue: 12, clear: 8, red: 8, papers: 5, seeds: 10, delay: 5 },\n  lab: { shred: 2.5, mix: 3, grow: 25, combine: 0.30, door: 0.6, spout: 0.36 },",
    "  shop: { blue: 12, clear: 8, red: 8, papers: 5, seeds: 10, box: 15, delay: 5 },\n"
    "  stock: { blue: 1, clear: 1, red: 1, papers: 1, seeds: 0, box: 1 },      // what waits on the storage rack at the start\n"
    "  // vessels: what a full one holds (ml) and how much fits; a vessel tilted past `tilt` degrees pours `rate` ml a second into\n"
    "  // what is under its mouth; the mixer makes one packet from every `batch` ml\n"
    "  fill: { blue: { blue: 100 }, clear: { clear: 150 }, red: { red: 150 } }, cap: { blue: 250, clear: 150, red: 150, mixer: 300 },\n"
    "  lab: { shred: 2.5, mix: 3, grow: 25, combine: 0.30, door: 0.6, tilt: 100, rate: 30, mouth: 0.16, reachXZ: 0.2, batch: 50, buds: 3, box: 6, pack: 0.30 },")
rep("  patrol: { min: 40, max: 65, warn: 4, on: 7, sus: 0.5 },      // който пусне пода, докато патрулът гледа, е хванат",
    "  // the police patrol comes by day: announced `warn` seconds ahead, then looks for `on` seconds; whatever of the cellar is\n"
    "  // upstairs then is taken, with a fine\n"
    "  patrol: { first: 30, spread: 45, gap: [70, 110], warn: 60, on: 12, sus: 0.5, fine: 30 },")
line("const PHASES = ", "const PHASES = ['tutorial', 'night', 'day', 'night2', 'day2', 'raid'];")
line("const SELL = ", "const SELL = ['buds', 'joint', 'ice', 'pills', 'powder'];      // the product of the cellar: sold over the counter to buyers")
rep("const STASH_ANY = [...SELL, 'papers', 'seeds', ...LIQUIDS];", "const STASH_ANY = [...SELL, 'papers', 'seeds', ...LIQUIDS, 'box'];")
line("const RECIPES = ",
     "// The recipes of the mixer: the shares of blue, clear (solvent) and red (catalyst). `ok` are the limits inside which the\n"
     "// product still comes out; within 0.06 of `ideal` and shaken it comes out pure.\n"
     "export const RECIPES = {\n"
     "  ice: { ideal: [0.6, 0.4, 0], ok: [[0.5, 1], [0.25, 0.5], [0, 0.12]] },\n"
     "  pills: { ideal: [0.5, 0, 0.5], ok: [[0.35, 0.65], [0, 0.15], [0.35, 0.65]] },\n"
     "  powder: { ideal: [0, 0.6, 0.4], ok: [[0, 0.12], [0.45, 0.75], [0.25, 0.55]] },\n"
     "};\n"
     "export const STORE = ['blue', 'clear', 'red', 'papers', 'seeds', 'box'];      // what the screen sells, in this order")
line("const LAB = new Set(", "const LAB = new Set(['tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box']);      // cellar things: evidence at the raid")
line("const ITEM_KINDS = ", "const ITEM_KINDS = ['pizza', ...TOPS, 'cup', 'tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box'];")

# ───── texts ─────
rep("  title: { tutorial: 'Training', day: 'Day', closing: 'Dusk', night: 'Evening', rush: 'Night shift', raid: 'Inspection', over: 'The end' },",
    "  title: { tutorial: 'Training', night: 'Night', day: 'Day', night2: 'Night', day2: 'Day', raid: 'Inspection', over: 'The end' },")
between("    tutorial: 'Dough on the board, sauce and cheese, into the oven, then onto the counter.',\n    day: 'Serve the customers",
        "    over: 'The shift is over.',",
        "    tutorial: 'Dough on the board, sauce and cheese, into the oven, then onto the counter.',\n"
        "    night: 'Night. The shop is shut: go down, make product, pack it in the box. Order supplies on the screen.',\n"
        "    day: 'Day. Serve pizza and drinks. Buyers get their packets from the box. Order on the screen above the board.',\n"
        "    night2: 'Night again. Down to the cellar: more product into the box.',\n"
        "    day2: 'Last day. Sell everything that is in the box.',\n"
        "    evening: 'Evening. The rude one stands under the red lamp: the button under the counter opens the floor.',\n"
        "    raid: 'Inspection! Product into the blue cabinet, shut it. Throw the rest away.',\n")
rep("    patrolWarn: 'Patrol! Do not touch the button. Sell nothing from the cellar.',\n    patrolOn: 'The patrol is watching. Nobody falls, nothing is sold.',",
    "    patrolWarn: 'Police patrol in one minute! Take the box down to the cellar.',\n    patrolOn: 'The police are looking. Nothing from the cellar upstairs, nobody falls.',")
between("  signShop: {\n    tutorial: 'TRAINING\\nDough, sauce, cheese, oven',", "  deny: {\n    bad: 'Not possible',",
        "  signShop: { tutorial: 'TRAINING', night: 'CLOSED', day: 'OPEN', night2: 'CLOSED', day2: 'OPEN', raid: 'INSPECTION', over: 'THE END' },\n"
        "  signLab: { tutorial: 'CLOSED', night: 'CELLAR', day: 'CELLAR', night2: 'CELLAR', day2: 'CELLAR', raid: 'HIDE IT ALL', over: 'THE END' },\n")
rep("    potBusy: 'Something grows here already',\n",
    "    potBusy: 'Something grows here already',\n"
    "    noStock: 'None left: order it on the screen',\n"
    "    needMore: 'Pour at least 50 ml in',\n"
    "    shopShut: 'The store is closed now',\n"
    "    boxEmpty: 'The box is empty',\n"
    "    boxFull: 'The box is full',\n")
between("const KIDS = {\n", "  deny: {\n    ...NIGHT.deny,\n    labClosed: 'The store is closed',",
        "const KIDS = {\n"
        "  title: { ...NIGHT.title },\n"
        "  hint: {\n"
        "    ...NIGHT.hint,\n"
        "    night: 'Night. The shop is shut. The machine in the store makes salami from the crates.',\n"
        "    day: 'Day. Serve the customers: pizza as ordered and a full cup.',\n"
        "    night2: 'Night again. Salami for tomorrow.',\n"
        "    day2: 'Last day. Serve everybody.',\n"
        "    evening: 'Evening. The courier brings a crate: the button under the counter lowers it into the store.',\n"
        "    raid: 'The inspector is coming! Put the trays of the store away.',\n"
        "    overCaught: 'The inspector caught you.',\n"
        "    patrolWarn: 'The inspector walks by.',\n"
        "    patrolOn: 'The inspector is watching.',\n"
        "    hopper: 'A crate is waiting downstairs. The lift is at the back.',\n"
        "    meatUp: 'There is salami. Pizza with salami pays best.',\n"
        "  },\n"
        "  signShop: { ...NIGHT.signShop },\n"
        "  signLab: { ...NIGHT.signLab, night: 'STORE', day: 'STORE', night2: 'STORE', day2: 'STORE', raid: 'PUT IT ALL AWAY' },\n")

# ───── layout: the storage rack with the supplies, the cabinet as plain storage, the two screens ─────
rep("  stash: { w: 1.97, h: 2.43, handle: 1.15, cells: [\n"
    "    [-0.70, 1.52, 'blue'], [-0.24, 1.52, 'clear'], [0.24, 1.52, 'red'], [0.70, 1.52, 'papers'],\n"
    "    [-0.70, 1.17, 'seeds'], [-0.24, 1.17, null], [0.24, 1.17, null], [0.70, 1.17, null],\n",
    "  stash: { w: 1.97, h: 2.43, handle: 1.15, cells: [\n"
    "    [-0.70, 1.52, null], [-0.24, 1.52, null], [0.24, 1.52, null], [0.70, 1.52, null],\n"
    "    [-0.70, 1.17, null], [-0.24, 1.17, null], [0.24, 1.17, null], [0.70, 1.17, null],\n")
rep("  bowls: [['white', -0.17, 0.07], ['mustard', 0.17, 0.07]],",
    "  bowls: [['white', -0.17, 0.07], ['mustard', 0.17, 0.07]],\n"
    "  // the big screen (SM_Prop_Computer_TV_Wall_01, 1.55 x 0.98) hangs on the wall behind the long table of each floor:\n"
    "  // back = how far that wall is behind the edge of the zone, y = the lower edge of the screen\n"
    "  screen: { w: 1.55, h: 0.98, back: [0.68, 0.96], y: [1.45, 1.38] },\n"
    "  // the supplies on the storage rack of the cellar: [shelf, column]\n"
    "  supplies: { blue: [1, 0], clear: [1, 1], red: [1, 2], papers: [2, 0], seeds: [2, 1], box: [2, 2] },")
rep("      for (const [lx, ly, kind] of N.stash.cells) slot(sh, lx, ly, 0, kind ? [kind] : STASH_ANY.slice());\n"
    "      sh.shelf = N.stash.cells.map((c) => c[2]);\n"
    "      taps(sh, [[0, N.stash.handle, 0.2], ...N.stash.cells.map(([lx, ly]) => [lx, ly + 0.05, 0.06])]);\n",
    "      for (const [lx, ly] of N.stash.cells) slot(sh, lx, ly, 0, STASH_ANY.slice());\n"
    "      taps(sh, [[0, N.stash.handle, 0.2]]);\n")
between("    add('bin_tray', 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[0], zm, yaw,", "    // кошът: на задната стена на стая „а\", до отвора (на същото място като горе)",
        "    add('bin_tray', 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[0], zm, yaw, [r3(cw * 3 - 0.02), 0.14, N.depth], { gives: 'tray', tier: 0, room: B.id, nat: 1, rack: 1 });\n"
        "    // the supplies ordered on the screen pile up here: one place for each on the upper and the lower shelf\n"
        "    if (labOn) for (const [gives, [shelf, col]] of Object.entries(N.supplies)) {\n"
        "      const lx = (col - 1) * cw;\n"
        "      add(`bin_${gives}`, 'bin', 1, rk.wall - rk.sd * half, N.rack.shelves[shelf], zm - lx * Math.sin(yaw), yaw, [r3(cw - 0.02), 0.14, N.depth], { gives, tier: shelf, room: B.id, nat: 1, stock: 1 });\n"
        "    }\n"
        "    // the screens: above the table for laying pizzas upstairs, above the grinder's table in the cellar\n"
        "    if (labOn) {\n"
        "      const S0 = N.screen, side = -natPlan.gs;\n"
        "      add('screen', 'screen', 0, side * (hw + S0.back[0] - 0.12), S0.y[0], zc0, yawOf(side), [S0.w, S0.h, 0.1], { nat: 1, room: 'a' });\n"
        "      add('screen_1', 'screen', 1, -(hw + S0.back[1] - 0.12), S0.y[1], 0, yawOf(-1), [S0.w, S0.h, 0.1], { nat: 1, room: 'a' });\n"
        "    }\n")
rep("    const N = NAT, T = N.table, half = N.depth / 2;\n    const yawOf = (sd) => (sd < 0 ? Math.PI / 2 : -Math.PI / 2);          // лицето гледа навътре към стаята\n    const gr = add('grinder',",
    "    const N = NAT, T = N.table, half = N.depth / 2;\n    const yawOf = (sd) => (sd < 0 ? Math.PI / 2 : -Math.PI / 2);          // лицето гледа навътре към стаята\n"
    "    const labOn = opts.lab !== false, zc0 = natPlan.zc - N.prep.w / 2;\n    const gr = add('grinder',")
rep("    const labOn = opts.lab !== false;\n    if (labOn && w - 2 * N.depth - 0.04 >= N.grow.w) {", "    if (labOn && w - 2 * N.depth - 0.04 >= N.grow.w) {")

# ───── the game: state ─────
rep("  let money = 0, cover = RULES.cover.start, suspicion = 0;", "  let money = 0, cover = RULES.cover.start, suspicion = 0;      // the start money comes with the lab, below")
rep("  const pending = [];                                                 // orders on their way to a shelf: { idx, kind, at }\n"
    "  const pots = growRec ? growRec.slots.map(() => ({ s: 1 })) : [];   // 1: a grown plant, 0: empty bucket, between: growing\n"
    "  const shred = { until: 0, by: null }, mixer = { mix: [], pure: false, until: 0, by: null };\n",
    "  const pending = [];                                                 // orders on their way to the storage rack: { kind, at }\n"
    "  const stock = {};                                                   // what lies on the storage rack: kind → count\n"
    "  for (const k of STORE) if (stationById.has(`bin_${k}`)) stock[k] = labOn ? RULES.stock[k] | 0 : 0;\n"
    "  const pots = growRec ? growRec.slots.map(() => ({ s: 1 })) : [];   // 1: a grown plant, 0: empty bucket, between: growing\n"
    "  // out: what is ready and waits for its place in the slot (the buds of one plant, the packets of one batch)\n"
    "  const shred = { until: 0, by: null, out: 0 };\n"
    "  const mixer = { c: [0, 0, 0], shaken: 0, until: 0, by: null, out: [] };\n"
    "  const pourAt = { l: 0, r: 0 };\n")
rep("  const evening = () => phase === 'night' || phase === 'rush';\n",
    "  const isNight = () => phase === 'night' || phase === 'night2';\n"
    "  const isDay = () => phase === 'day' || phase === 'day2';\n"
    "  // the clock on the screens, in minutes of the day\n"
    "  const clock = () => {\n"
    "    const c = RULES.clock[phase];\n"
    "    if (!c) return 21 * 60;\n"
    "    const dur = S(RULES.phases[phase]) || 1;\n"
    "    return c[0] + (c[1] - c[0]) * clamp(1 - (phaseEnd - time) / dur, 0, 1);\n"
    "  };\n"
    "  const evening = () => isDay() && clock() >= RULES.eveningFrom;\n")
rep("  const labOpen = () => phase !== 'tutorial' && phase !== 'over';      // the cellar opens with the first working day",
    "  const labOpen = () => phase !== 'tutorial' && phase !== 'over';      // the cellar opens with the first night")

# item state
rep("      case 'blue': return { shake: 0 };\n      case 'ice': return { pure: 0 };\n      default: return {};",
    "      case 'blue': case 'clear': case 'red': { const f = RULES.fill[kind]; return { c: [f.blue || 0, f.clear || 0, f.red || 0], shake: 0 }; }\n"
    "      case 'ice': case 'pills': case 'powder': return { pure: 0 };\n"
    "      case 'box': return { n: [] };\n"
    "      default: return {};")
rep("      case 'blue': return { shake: s.shake ? 1 : 0 };\n      case 'ice': return { pure: s.pure ? 1 : 0 };\n      default: return {};",
    "      case 'blue': case 'clear': case 'red': return { c: s.c.map((v) => Math.round(v)), shake: s.shake ? 1 : 0, cap: RULES.cap[it.kind] };\n"
    "      case 'ice': case 'pills': case 'powder': return { pure: s.pure ? 1 : 0 };\n"
    "      case 'box': return { n: s.n.map((q) => q[0]) };\n"
    "      default: return {};")
rep("    it.poofAt = phase === 'raid' && LAB.has(it.kind) ? Infinity : time + S(RULES.poof);",
    "    it.poofAt = it.kind === 'box' || (phase === 'raid' && LAB.has(it.kind)) ? Infinity : time + S(RULES.poof);      // the box never vanishes")

# placing: a packet next to the box goes into it; whole-bottle dumping into the mixer is gone (liquids are poured by tilting)
between("    // 0b. a liquid over the mixer: it is poured in (two at most)\n", "    // 1. добавка до сурова пица",
        "    // 0b. a packet of product next to the box (also one held in the other hand): it goes in\n"
        "    if (SELL.includes(it.kind)) {\n"
        "      let box = null, bd = RULES.lab.pack + 1e-9;\n"
        "      for (const q of items.values()) {\n"
        "        if (q.kind !== 'box' || itemLevel(q) !== L) continue;\n"
        "        if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;\n"
        "        const dd = dist(p, itemPos(q));\n"
        "        if (dd <= bd) { bd = dd; box = q; }\n"
        "      }\n"
        "      if (box) {\n"
        "        if (box.state.n.length >= RULES.lab.box) emit('deny', { player: pl.id, level: L, x: p.x, y: p.y, z: p.z, text: TX.deny.boxFull });\n"
        "        else {\n"
        "          box.state.n.push([it.kind, it.state.pure ? 1 : 0]);\n"
        "          const bp = itemPos(box);\n"
        "          emit('packed', { x: bp.x, y: bp.y, z: bp.z, level: L, player: pl.id });\n"
        "          removeItem(it);\n"
        "          return 8;\n"
        "        }\n"
        "      }\n"
        "    }\n")
rep("      if (s.st === benchRec && s.idx === 0 && time < shred.until) continue;             // the shredder is running\n",
    "      if (s.st === benchRec && s.idx === 0 && (time < shred.until || shred.out > 0)) continue;      // the shredder is running or still has buds to give\n")

# customers only by day
rep("    } else if ((phase === 'day' || evening()) && time >= nextSpawnAt) {", "    } else if (isDay() && time >= nextSpawnAt) {")
rep("        const base = RULES.interval(Math.max(1, players.size)) * (phase === 'rush' ? RULES.rushSlow : 1);", "        const base = RULES.interval(Math.max(1, players.size));")

# ───── the lab step ─────
between("  // ── the cellar lab: the cabinet door, deliveries, growing, the two blenders ──\n", "  // ── подът под клиентите и улеят към мазето ──\n",
        r'''  // ── the cellar lab: the cabinet door, deliveries, growing, pouring, the two machines ──
  const total = (c) => c[0] + c[1] + c[2];
  /** Where the neck of a held vessel points: the hand's own -Z (along the handle, towards the thumb). */
  function neckOf(pl, hand) {
    const o = hand === 'l' ? 7 : 14, x = pl.pose[o + 3], y = pl.pose[o + 4], z = pl.pose[o + 5], w = pl.pose[o + 6];
    return { x: -2 * (x * z + w * y), y: -2 * (y * z - w * x), z: -(1 - 2 * (x * x + y * y)) };
  }
  /** What the batch in the mixer becomes: { kind, pure } or null. */
  function batchOf(c, shakenMl) {
    const t = total(c);
    if (t <= 0) return null;
    const sh = [c[0] / t, c[1] / t, c[2] / t];
    for (const [kind, r] of Object.entries(RECIPES)) {
      if (!sh.every((v, i) => v >= r.ok[i][0] - 1e-9 && v <= r.ok[i][1] + 1e-9)) continue;
      const exact = sh.every((v, i) => Math.abs(v - r.ideal[i]) <= 0.06);
      return { kind, pure: exact && shakenMl / t >= 0.9 };
    }
    return null;
  }
  function stepPour(h) {
    const cosTilt = Math.cos(RULES.lab.tilt * Math.PI / 180), L = RULES.lab;
    for (const pl of players.values()) {
      if (!pl.pose) continue;
      for (const hand of ['l', 'r']) {
        const src = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
        if (!src || !LIQUID.has(src.kind) || total(src.state.c) <= 0) continue;
        const up = neckOf(pl, hand);
        if (up.y > cosTilt) continue;                                   // not tilted far enough
        const hp = handPos(pl, hand), mouth = { x: hp.x + up.x * L.mouth, y: hp.y + up.y * L.mouth, z: hp.z + up.z * L.mouth };
        // what is under the mouth: the mixer, or another vessel
        let dst = null, free = 0, bd = L.reachXZ, where = null;
        if (benchRec && benchRec.level === pl.level && time >= mixer.until && !mixer.out.length) {
          const m = benchRec.st.taps[2], dd = Math.hypot(mouth.x - m.x, mouth.z - m.z);
          if (dd <= bd && mouth.y >= m.y - 0.1 && mouth.y - m.y <= 0.6) { bd = dd; dst = mixer; free = RULES.cap.mixer - total(mixer.c); where = m; }
        }
        for (const q of items.values()) {
          if (q === src || !LIQUID.has(q.kind) || itemLevel(q) !== pl.level) continue;
          if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;
          const qp = itemPos(q), dd = Math.hypot(mouth.x - qp.x, mouth.z - qp.z);
          if (dd <= Math.min(bd, 0.16) && mouth.y >= qp.y + 0.1 && mouth.y - qp.y <= 0.7) { bd = dd; dst = q; free = RULES.cap[q.kind] - total(q.state.c); where = { x: qp.x, y: qp.y + 0.3, z: qp.z }; }
        }
        if (!dst || free <= 0.01) continue;
        const have = total(src.state.c), amt = Math.min(L.rate * h * speed, have, free), k = amt / have;
        const into = dst === mixer ? mixer.c : dst.state.c;
        for (let i = 0; i < 3; i++) { const v = src.state.c[i] * k; src.state.c[i] -= v; into[i] += v; }
        if (dst === mixer) mixer.shaken += src.state.shake ? amt : 0; else dst.state.shake = 0;      // a fresh pour has to be shaken again
        if (total(src.state.c) < 0.5) { src.state.c = [0, 0, 0]; src.state.shake = 0; }
        if (time >= pourAt[hand] || pourAt.who !== pl.id) { pourAt[hand] = time + 0.35; pourAt.who = pl.id; emit('pour', { x: where.x, y: where.y, z: where.z, level: pl.level, player: pl.id }); }
      }
    }
  }
  function stepLab(h) {
    if (!labOn) return;
    stashOpen = toward(stashOpen, stashWant, h / S(RULES.lab.door));
    for (let i = pending.length - 1; i >= 0; i--) {
      const o = pending[i];
      if (time < o.at) continue;
      pending.splice(i, 1);
      stock[o.kind] = (stock[o.kind] | 0) + 1;
      const rec = stationById.get(`bin_${o.kind}`);
      emit('delivered', { x: rec.st.x, y: rec.st.y + 0.1, z: rec.st.z, level: rec.level });
    }
    pots.forEach((q, i) => {
      if (q.s <= 0 || q.s >= 1) return;
      q.s = Math.min(1, q.s + h / S(RULES.lab.grow));
      if (q.s >= 1) emit('grown', at(growRec.slots[i]));
    });
    stepPour(h);
    if (!benchRec) return;
    if (shred.until && time >= shred.until) {
      shred.until = 0;
      const it = inSlot(benchRec, 0);
      if (it && it.kind === 'plant') {
        removeItem(it);
        shred.out = RULES.lab.buds;
        const pl = players.get(shred.by);
        if (pl) pl.cooked++;
        emit('shredded', at(benchRec.slots[0], { player: shred.by }));
      }
    }
    if (shred.out > 0 && benchRec.slots[0].item == null && items.size < RULES.maxItems) {      // the buds come out one after another
      shred.out--;
      const b = newItem('buds', 1);
      b.by = shred.by;
      putInSlot(b, benchRec.slots[0]);
    }
    if (mixer.until && time >= mixer.until) {
      mixer.until = 0;
      const got = batchOf(mixer.c, mixer.shaken), n = clamp(Math.floor(total(mixer.c) / RULES.lab.batch + 1e-6), 1, 5), pl = players.get(mixer.by);
      if (got) {
        for (let i = 0; i < n; i++) mixer.out.push(got);
        if (pl) pl.cooked++;
        emit('mixed', at(benchRec.slots[1], { player: mixer.by, amount: n }));
      } else {
        if (pl) pl.mistakes++;
        emit('ruin', at(benchRec.slots[1], { player: mixer.by }));
      }
      mixer.c = [0, 0, 0]; mixer.shaken = 0;
    }
    if (mixer.out.length && benchRec.slots[1].item == null && items.size < RULES.maxItems) {
      const got = mixer.out.shift(), out = newItem(got.kind, 1);
      out.by = mixer.by;
      if (got.pure) out.state.pure = 1;
      putInSlot(out, benchRec.slots[1]);
    }
  }

''')

# ───── the police patrol by day ─────
between("  // ── патрул: минава вечер покрай витрината.", "  // ── врата, ролетка, под ──\n",
        r'''  // ── the police patrol: by day, announced a minute ahead. While it looks, whatever of the cellar is upstairs (in a hand
  // too) is taken, with a fine; nobody may fall through the floor and nothing may be sold. No patrol in the kids theme. ──
  const contraband = (it) => (it.kind === 'box' ? it.state.n.length > 0 : LAB.has(it.kind) && it.kind !== 'tray' && it.kind !== 'meatbox');
  function endPatrol() {
    if (!patrol) return;
    patrol = null;
    emit('patrol_off');
    const G = RULES.patrol.gap;
    nextPatrolAt = time + S(G[0] + rand() * (G[1] - G[0]));
  }
  function bust() {
    const found = [...items.values()].filter((it) => contraband(it) && itemLevel(it) === 0);
    if (!found.length) return;
    patrol.busted = true;
    for (const it of found) { const q = itemPos(it); emit('poof', { x: q.x, y: q.y, z: q.z, level: 0 }); removeItem(it); }
    money = Math.max(0, money - RULES.patrol.fine);
    addSus(RULES.patrol.sus);
    addCover(-RULES.cover.bad);
    const seat = layout.seats[0];
    emit('caught', { x: seat.x, y: 1.2, z: seat.z, level: 0 });
    emit('cash', { x: seat.x, y: 1.3, z: seat.z, level: 0, amount: -RULES.patrol.fine });
  }
  function stepPatrol() {
    const R = RULES.patrol;
    if (kids || !isDay()) return;
    if (!patrol) {
      if (time >= nextPatrolAt && phaseEnd - time >= S(R.warn + R.on + 1)) {
        patrol = { phase: 'warn', until: time + S(R.warn), busted: false };
        emit('patrol_warn', { text: TX.hint.patrolWarn });
      }
      return;
    }
    if (patrol.phase === 'warn') {
      if (time >= patrol.until) { patrol.phase = 'on'; patrol.until = time + S(R.on); emit('patrol_on', { text: TX.hint.patrolOn }); }
      return;
    }
    if (!patrol.busted) bust();
    if (time >= patrol.until) endPatrol();
  }

''')
rep("    shutterOpen = toward(shutterOpen, phase === 'raid' ? 0 : 1, h / S(2));      // заведението затваря само при проверката",
    "    shutterOpen = toward(shutterOpen, phase === 'tutorial' || isDay() ? 1 : 0, h / S(2));      // the shop is open in the training and by day")
between("  function enter(p) {\n", "  function finish() {\n",
        "  function enter(p) {\n"
        "    phase = p;\n"
        "    phaseEnd = time + S(RULES.phases[p]);\n"
        "    if (patrol) { patrol = null; emit('patrol_off'); }\n"
        "    nextPatrolAt = Infinity;\n"
        "    if (p === 'night' || p === 'night2') { leaveAll(); nextSpawnAt = Infinity; rollZone(); }\n"
        "    if (p === 'day' || p === 'day2') { nextSpawnAt = time + S(1.5); nextPatrolAt = time + S(RULES.patrol.first + rand() * RULES.patrol.spread); }\n"
        "    if (p === 'raid') { leaveAll(); nextSpawnAt = Infinity; }\n"
        "    emit('phase', { text: TX.title[p] });\n"
        "  }\n")

# ───── actions ─────
rep("      case 'shake': return doShake(pl, hand, hp);\n", "      case 'shake': return doShake(pl, hand, hp);\n      case 'buy': return doBuy(pl, hand, hp, msg);\n      case 'unpack': return doUnpack(pl, hand, hp, msg);\n")
between("  // The blue flask is shaken before it goes into the mixer", "  // A grown plant is pulled out of its bucket.\n",
        "  // A vessel is shaken before it goes into the mixer: only a shaken batch can come out pure.\n"
        "  function doShake(pl, hand, hp) {\n"
        "    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;\n"
        "    if (!it || !LIQUID.has(it.kind)) return { ok: false, reason: 'bad' };\n"
        "    if (!it.state.shake && total(it.state.c) > 0) { it.state.shake = 1; emit('shaken', { player: pl.id, level: pl.level, x: hp.x, y: hp.y, z: hp.z }); }\n"
        "    return { ok: true };\n"
        "  }\n\n"
        "  // The store on the screen: the money goes at once, the thing lands on the storage rack of the cellar a little later.\n"
        "  function doBuy(pl, hand, hp, msg) {\n"
        "    const kind = typeof msg.kind === 'string' && STORE.includes(msg.kind) && msg.kind in stock ? msg.kind : null;\n"
        "    if (!labOn || !kind) return refuse(pl, hp, 'bad');\n"
        "    if (phase === 'tutorial' || phase === 'raid') return refuse(pl, hp, 'shopShut');\n"
        "    const price = RULES.shop[kind] | 0;\n"
        "    if (money < price) return refuse(pl, hp, 'noMoney');\n"
        "    money -= price;\n"
        "    pending.push({ kind, at: time + S(RULES.shop.delay) });\n"
        "    emit('cash', { x: hp.x, y: hp.y + 0.1, z: hp.z, level: pl.level, player: pl.id, amount: -price });\n"
        "    emit('ordered', { x: hp.x, y: hp.y, z: hp.z, level: pl.level, player: pl.id });\n"
        "    return { ok: true, ordered: kind };\n"
        "  }\n\n"
        "  // A packet is taken out of the box (the last one that went in).\n"
        "  function doUnpack(pl, hand, hp, msg) {\n"
        "    const box = items.get(typeof msg.item === 'string' ? Number(msg.item) : msg.item);\n"
        "    if (!box || box.kind !== 'box') return refuse(pl, hp, 'noItem');\n"
        "    if (pl.hands[hand] != null) return refuse(pl, hp, 'handFull');\n"
        "    if (itemLevel(box) !== pl.level) return refuse(pl, hp, 'otherLevel');\n"
        "    if (dist(hp, itemPos(box)) > REACH) return refuse(pl, hp, 'far');\n"
        "    if (box.slot != null && slotById.get(box.slot).kind === 'stash' && stashShut()) return refuse(pl, hp, 'stashShut');\n"
        "    if (!box.state.n.length) return refuse(pl, hp, 'boxEmpty');\n"
        "    const [kind, pure] = box.state.n.pop(), it = newItem(kind, pl.level);\n"
        "    if (pure) it.state.pure = 1;\n"
        "    it.by = pl.id;\n"
        "    hold(it, pl, hand);\n"
        "    return { ok: true, item: it.id };\n"
        "  }\n\n")
between("  // The secret cabinet: control 0 is the handle", "  // The bench: control 0 is the shredder",
        "  // The secret cabinet: its handle opens and shuts it. What lies inside a shut cabinet is not found at the inspection.\n"
        "  function doStash(pl, hp, rec) {\n"
        "    if (!labOn) return refuse(pl, hp, 'noButton');\n"
        "    if (!labOpen()) return refuse(pl, hp, 'labClosed');\n"
        "    stashWant = stashWant ? 0 : 1;\n"
        "    emit(stashWant ? 'stash_open' : 'stash_shut', { ...rec.st.taps[0], level: rec.level, player: pl.id });\n"
        "    return { ok: true, open: stashWant };\n"
        "  }\n\n")
rep("      if (time < shred.until) return refuse(pl, hp, 'wait');\n      const it = inSlot(rec, 0);",
    "      if (time < shred.until || shred.out > 0) return refuse(pl, hp, 'wait');\n      const it = inSlot(rec, 0);")
rep("    if (time < mixer.until) return refuse(pl, hp, 'wait');\n    if (sl.item != null) return refuse(pl, hp, 'takeFirst');\n    if (mixer.mix.length < 2) return refuse(pl, hp, 'needTwo');\n",
    "    if (time < mixer.until) return refuse(pl, hp, 'wait');\n    if (sl.item != null || mixer.out.length) return refuse(pl, hp, 'takeFirst');\n    if (total(mixer.c) < RULES.lab.batch - 1e-6) return refuse(pl, hp, 'needMore');\n")
rep("      if (sl.st === benchRec && time < (sl.idx === 0 ? shred.until : mixer.until)) return refuse(pl, hp, 'wait');\n",
    "      if (sl.st === benchRec && time < (sl.idx === 0 ? shred.until : mixer.until)) return refuse(pl, hp, 'wait');\n")
# taking from the storage rack needs stock
rep("    if (rec.st.gives === 'meat') {\n      if (meatStock <= 0) return refuse(pl, hp, 'noMeat');\n      meatStock--;\n    }\n",
    "    if (rec.st.gives === 'meat') {\n      if (meatStock <= 0) return refuse(pl, hp, 'noMeat');\n      meatStock--;\n    }\n"
    "    if (rec.st.stock) {\n"
    "      if (!labOpen()) return refuse(pl, hp, 'labClosed');\n"
    "      if (!((stock[rec.st.gives] | 0) > 0)) return refuse(pl, hp, 'noStock');\n"
    "      stock[rec.st.gives]--;\n"
    "    }\n")

# ───── snapshot, hints, start ─────
rep("    if (stashRec) dyn.push({ id: 'stash', state: { open: r3(stashOpen), want: stashWant, pend: pending.map((o) => o.idx), on: labOn && labOpen() } });\n",
    "    if (stashRec) dyn.push({ id: 'stash', state: { open: r3(stashOpen), want: stashWant, on: labOn && labOpen() } });\n"
    "    for (const k of Object.keys(stock)) dyn.push({ id: `bin_${k}`, state: { stock: stock[k], coming: pending.filter((o) => o.kind === k).length } });\n")
between("    if (benchRec) dyn.push({ id: 'bench', state: {\n", "    buttonIds.forEach((id) => {",
        "    if (benchRec) dyn.push({ id: 'bench', state: {\n"
        "      shred: shred.until ? r3(clamp(1 - (shred.until - time) / S(RULES.lab.shred), 0.01, 1)) : 0, buds: shred.out,\n"
        "      mix: mixer.c.map((v) => Math.round(v)), mixing: mixer.until ? r3(clamp(1 - (mixer.until - time) / S(RULES.lab.mix), 0.01, 1)) : 0,\n"
        "      shaken: total(mixer.c) > 0 && mixer.shaken / total(mixer.c) >= 0.9, left: mixer.out.length } });\n")
rep("      phase,\n      left: r3(Math.max(0, phaseEnd - time)),\n", "      phase,\n      left: r3(Math.max(0, phaseEnd - time)),\n      clock: Math.round(clock()),\n      evening: evening(),\n")
between("  function hintText() {\n", "  function snapshot() {\n",
        "  function hintText() {\n"
        "    if (over) return result.caught ? TX.hint.overCaught : TX.hint.over;\n"
        "    if (patrol) return patrol.phase === 'warn' ? TX.hint.patrolWarn : TX.hint.patrolOn;\n"
        "    if (labOn && customers.some((c) => c.buyer && c.state === 'wait')) return TX.hint.buyer;\n"
        "    if (evening()) {\n"
        "      if (meatStock > 0) return TX.hint.meatUp;\n"
        "      return TX.hint.evening;\n"
        "    }\n"
        "    if (isNight() && hopper > 0 && !kids) return TX.hint.hopper;\n"
        "    return TX.hint[phase];\n"
        "  }\n\n")
rep("    buyer: 'A buyer wants the stuff from the blue cabinet in the cellar.',", "    buyer: 'A buyer is waiting: hand over the packet he wants from the box.',")
rep("natural: !!layout.natural, trap: { r: 0.5, fall: r3(S(RULES.trap.fall)) } });",
    "natural: !!layout.natural, trap: { r: 0.5, fall: r3(S(RULES.trap.fall)) },\n"
    "    // for the screens: what the store sells and for how much, the recipes, what a product pays\n"
    "    store: !kids && layout.stations.some((st) => st.kind === 'stash') ? STORE.filter((k) => layout.stations.some((st) => st.id === `bin_${k}`)).map((k) => ({ kind: k, price: RULES.shop[k] })) : [],\n"
    "    recipes: RECIPES, sell: RULES.sell, lab: { batch: RULES.lab.batch, cap: RULES.cap, fill: RULES.fill, buds: RULES.lab.buds, box: RULES.lab.box } });")
rep("  if (labOn) for (const k of ['blue', 'clear']) { const i = stashRec.st.shelf.indexOf(k); if (i >= 0) putInSlot(newItem(k, 1), stashRec.slots[i]); }\n",
    "  if (labOn) money = RULES.startMoney;      // the night comes first: something to buy supplies with\n")
rep("lab: () => ({ stashOpen, stashWant, pending: pending.slice(), pots: pots.map((q) => q.s), shred: { ...shred }, mixer: { ...mixer, mix: mixer.mix.slice() }, on: labOn }) },",
    "lab: () => ({ stashOpen, stashWant, pending: pending.slice(), stock: { ...stock }, pots: pots.map((q) => q.s), shred: { ...shred }, mixer: { ...mixer, c: mixer.c.slice(), out: mixer.out.slice() }, on: labOn }),\n"
    "      patrol: (sec = 0) => { nextPatrolAt = time + S(sec); }, give: (kind, level = 1) => { const it = newItem(kind, level); it.x = 0; it.z = 0; it.y = SURFACE_Y; return it.id; } },")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rules 1.2 patched')

s = io.open(p, encoding='utf-8').read()
a = "    for (const it of items.values()) if (LAB.has(it.kind) && !hidden(it)) fine(itemPos(it), itemLevel(it));"
assert s.count(a) == 1
s = s.replace(a, "    for (const it of items.values()) if ((contraband(it) || it.kind === 'tray' || it.kind === 'meatbox') && !hidden(it)) fine(itemPos(it), itemLevel(it));")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('raid uses contraband()')

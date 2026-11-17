"""The Back Room 1.5, rules. Run from lobby-stage.
Customers wait twice as long, the street is open from the start, tomato and white sauce with a ladle from a pot at the
dough table, cheese there too, a belt that carries the pizza into the oven, pizza boxes, a drinks table with taps that
fill a cup by themselves, cups that spill when tipped, free grabbing (the thing keeps the hold it was taken with),
throwing, each cabinet door on its own, a purple grow lamp and a light switch in the cellar, the wooden crate as the box."""
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
rep("  patience: (n) => clamp(60 - 3 * n, 40, 57), // търпение според броя играчи",
    "  patience: (n) => clamp(120 - 6 * n, 80, 114), // търпение според броя играчи (1.5: двойно по-дълго)")
rep("  press: { per: 3, value: 1.6 },",
    "  press: { per: 3, value: 1.6 },\n"
    "  // the kitchen: the ladle takes sauce within `dip` of a pot and lays it on a raw pizza under it; the belt carries a pizza\n"
    "  // into the oven at `belt` m/s; a box takes a baked pizza dropped within `box` of it; a tipped cup spills `spill` of itself a second\n"
    "  kitchen: { dip: 0.24, lay: 0.22, belt: 0.14, box: 0.36, spill: 1.2, tip: 0.45 },\n"
    "  // a thrown thing: faster than `min` m/s when let go; it flies under `g` and lands where it comes down\n"
    "  throw: { min: 1.3, max: 7, g: 9.8 },")
rep("      ['hotoven', 'Hot oven: bakes twice as fast', 200, 1], ['cellar', 'Cellar key: plants, shredder, papers', 300, 1],",
    "      ['hotoven', 'Hot oven: bakes twice as fast', 200, 1], ['cellar', 'Cellar key: plants, shredder, papers', 300, 1],")
rep("      ['shrimp', 'Shrimp', 120, 2], ['pineapple', 'Pineapple', 90, 2], ['lamp', 'Grow lamp: plants twice as fast', 300, 2],\n"
    "      ['mixer', 'Mixer and the blue ice recipe', 450, 2], ['street', 'Street: the back alley', 350, 2], ['pills', 'Recipe: pills', 400, 2],",
    "      ['shrimp', 'Shrimp', 120, 2], ['pineapple', 'Pineapple', 90, 2], ['lamp', 'Purple grow lamp: plants grow twice as fast while it is on', 300, 2],\n"
    "      ['mixer', 'Mixer and the blue ice recipe', 450, 2], ['pills', 'Recipe: pills', 400, 2],")
rep("    noBuyer: 'Nobody is waiting here',", "    noBuyer: 'Nobody is waiting here',\n    noLadle: 'Dip the ladle in a pot first',\n    boxIt: 'Put the pizza in a box first',")
rep("const TOP_LOCKED = new Set(['veg', 'ham', 'greens', 'onion', 'white', 'meat', 'bacon', 'mustard', 'shrimp', 'pineapple']);",
    "const TOP_LOCKED = new Set(['veg', 'ham', 'greens', 'onion', 'white', 'meat', 'bacon', 'mustard', 'shrimp', 'pineapple']);\n"
    "const KEEP_KIT = new Set(['ladle', 'box']);      // never vanish from the floor\n"
    "// a thing held upright in the fist turns with the hand: its own up is the hand's -Z (the old default hold)\n"
    "const FIST = new Set(['blue', 'clear', 'red', 'green', 'yellow', 'plant', 'pills', 'candy', 'syrup', 'seeds', 'cup', 'ladle']);")
rep("const ITEM_KINDS = ['pizza', ...TOPS, 'cup', 'tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box'];",
    "const ITEM_KINDS = ['pizza', ...TOPS, 'cup', 'tray', 'meatbox', 'plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box', 'pbox', 'ladle'];")

# ───── the natural kitchen: pots, cheese and one pizza place on the dough table; the belt; boxes; the drinks table ─────
rep("  bowls: [['white', -0.17, 0.07], ['mustard', 0.17, 0.07]],",
    "  bowls: [],\n"
    "  // the dough table: one pizza at the back end; the tomato pot (SM_Prop_Kitchen_Pot_01) at the front end, the white sauce and the\n"
    "  // grated cheese in two bowls between them: [x along the table, how far back]\n"
    "  dough: { pizza: [0.42, -0.12], pot: [-0.55, -0.16], white: [-0.08, -0.06], cheese: [-0.08, -0.30], potH: 0.386 },\n"
    "  // the belt in front of the oven: from `from` to `to` along the oven table (toward the mouth), at the front of the strip\n"
    "  belt: { from: 0.95, to: 0.30, front: 0.06, h: 0.09 },\n"
    "  // the drinks table (SM_Prop_Kitchen_Prep_Table_02) with two bar taps of the Nightclubs pack: the cup stands under the spout\n"
    "  drinksTable: { w: 1.094, top: 1.054, taps: [-0.2, 0.2], out: 0.10 },\n"
    "  pbox: { x: 0, back: 0.08 },")
rep("  counter: { w: 2.50, d: 1.15, inside: 0.70, top: 1.04, serve: 0.85, button: 0.08, trays: [['sauce', -0.32, 0.92], ['cheese', 0.55, 1.13], ['greens', -0.73, 0.92], ['ham', 0.85, 0.92], ['shrimp', 0.50, 0.92], ['onion', 0.08, 0.92]] },",
    "  counter: { w: 2.50, d: 1.15, inside: 0.70, top: 1.04, serve: 0.85, button: 0.08, trays: [['greens', -0.73, 0.92], ['ham', 0.85, 0.92], ['shrimp', 0.50, 0.92], ['onion', 0.08, 0.92]] },")
rep("""    const oven = add('oven', 'oven', 0, gs * (hw - half), 0, zc - N.oven.w / 2, yawOf(gs), [N.oven.w, N.oven.top, N.depth], { nat: 1, room: 'a' });
    slot(oven, 0, N.oven.top, N.oven.mouth, ['pizza']);
    // масата за редене отсреща: две пици една до друга
    const prep = add('prep', 'prep', 0, -gs * (hw - half), 0, zc - N.prep.w / 2, yawOf(-gs), [N.prep.w, N.prep.top, N.depth], { nat: 1, room: 'a' });
    for (const lx of [-0.42, 0.42]) slot(prep, lx, N.prep.top, -0.12, ['pizza']);
    // машината за напитки: две чаши на решетката ѝ (0 = кола, 1 = портокал)
    const dr = P.drinks, drinks = add('drinks', 'drinks', 0, dr.wall - dr.sd * half, 0, dr.to - N.drinks.w / 2, yawOf(dr.sd), [N.drinks.w, N.drinks.top, N.depth], { nat: 1, room: B.id });
    for (const lx of N.drinks.cups) slot(drinks, lx, N.drinks.tray, N.drinks.out, ['cup']);
    taps(drinks, N.drinks.cups.map((lx) => [lx, N.drinks.press, 0.2]));""",
    """    const oven = add('oven', 'oven', 0, gs * (hw - half), 0, zc - N.oven.w / 2, yawOf(gs), [N.oven.w, N.oven.top, N.depth], { nat: 1, room: 'a' });
    slot(oven, 0, N.oven.top, N.oven.mouth, ['pizza']);
    // the belt on the oven table: a pizza laid at its start rides into the mouth of the oven
    {
      const Bt = N.belt, c = Math.cos(oven.yaw), sn = Math.sin(oven.yaw);
      const at = (lx, lz) => ({ x: r3(oven.x + lx * c + lz * sn), z: r3(oven.z - lx * sn + lz * c) });
      const mid = at((Bt.from + Bt.to) / 2, Bt.front), a0 = at(Bt.from, Bt.front), a1 = at(Bt.to, Bt.front);
      const belt = add('belt', 'belt', 0, mid.x, N.oven.top, mid.z, oven.yaw, [Bt.from - Bt.to + 0.2, Bt.h, 0.34], { nat: 1, room: 'a',
        path: [{ x: a0.x, y: r3(N.oven.top + Bt.h), z: a0.z }, { x: a1.x, y: r3(N.oven.top + Bt.h), z: a1.z }] });
      slot(belt, (Bt.from - Bt.to) / 2 - 0.05, Bt.h, 0, ['pizza']);
    }
    // the dough table opposite: the pizza at the back end, the tomato pot with the ladle, the white sauce and the cheese
    const prep = add('prep', 'prep', 0, -gs * (hw - half), 0, zc - N.prep.w / 2, yawOf(-gs), [N.prep.w, N.prep.top, N.depth], { nat: 1, room: 'a' });
    const D = N.dough;
    slot(prep, D.pizza[0], N.prep.top, D.pizza[1], ['pizza']);
    {
      const c = Math.cos(prep.yaw), sn = Math.sin(prep.yaw);
      const at = (lx, lz) => ({ x: r3(prep.x + lx * c + lz * sn), z: r3(prep.z - lx * sn + lz * c) });
      const q = at(D.pot[0], D.pot[1]), pot = add('pot_sauce', 'pot', 0, q.x, N.prep.top, q.z, prep.yaw, [0.61, D.potH, 0.45], { gives: 'sauce', nat: 1, room: 'a' });
      slot(pot, 0.12, D.potH, 0, ['ladle']);
      const w = at(D.white[0], D.white[1]), wb = add('pot_white', 'pot', 0, w.x, N.prep.top, w.z, prep.yaw, [0.16, 0.05, 0.13], { gives: 'white', nat: 1, bowl: 1, room: 'a' });
      wb.slots.length = 0;
      const ch = at(D.cheese[0], D.cheese[1]);
      add('bin_cheese', 'bin', 0, ch.x, N.prep.top, ch.z, prep.yaw, [0.16, 0.05, 0.13], { gives: 'cheese', nat: 1, bowl: 1, room: 'a' });
    }
    // the pizza boxes: a stack on the inner edge of the counter, between the two places of the customers
    add('bin_pbox', 'bin', 0, N.pbox.x, N.counter.top, zc + N.pbox.back, Math.PI, [0.64, 0.24, 0.58], { gives: 'pbox', nat: 1, stack: 1, room: 'a' });
    // the drinks table: a cup under a tap fills by itself (0 = cola, 1 = orange)
    const dr = P.drinks, T = N.drinksTable, drinks = add('drinks', 'drinks', 0, dr.wall - dr.sd * half, 0, dr.to - T.w / 2, yawOf(dr.sd), [T.w, T.top, N.depth], { nat: 1, room: B.id, taps2: 1 });
    for (const lx of T.taps) slot(drinks, lx, T.top, T.out, ['cup']);""")
# the stash: two handles, one for each door
rep("      taps(sh, [[0, N.stash.handle, 0.2]]);", "      taps(sh, [[-0.14, N.stash.handle, 0.2], [0.14, N.stash.handle, 0.2]]);      // the handle of the left and of the right door")
# the grow station: the purple lamp has its own switch; the light switch of the cellar
rep("      for (const lx of N.grow.pots) slot(gw, lx, N.grow.pot, 0, ['seeds']);",
    "      for (const lx of N.grow.pots) slot(gw, lx, N.grow.pot, 0, ['seeds']);\n"
    "      taps(gw, [[0, 1.30, 0.15]]);      // the switch of the purple lamp, on its post between the buckets")
rep("      const trash = add('trash_lab', 'trash', 1, (a + b) / 2, 0, -hd + N.trash.w / 2, 0, [N.trash.w, N.trash.top, N.trash.w], { nat: 1, room: 'a' });\n      slot(trash, 0, N.trash.top, 0, ITEM_KINDS.slice());",
    "      const trash = add('trash_lab', 'trash', 1, (a + b) / 2, 0, -hd + N.trash.w / 2, 0, [N.trash.w, N.trash.top, N.trash.w], { nat: 1, room: 'a' });\n      slot(trash, 0, N.trash.top, 0, ITEM_KINDS.slice());\n"
    "      // the light switch of the cellar: on the same wall, beside the bin\n"
    "      const sx = (a + b) / 2 + (b - (a + b) / 2 > 0.45 ? 0.38 : -0.38);\n"
    "      ctl(add('switch', 'switch', 1, sx, 1.05, -hd + 0.03, 0, [0.12, 0.2, 0.06], { nat: 1, room: 'a' }), 0, 0.12, 0.03);")

# ───── the game ─────
rep("  const has = (id) => !career || unlocked.has(id);", "  const has = (id) => !career || id === 'street' || unlocked.has(id);      // 1.5: the street is open from the start")
rep("  let stashOpen = 0, stashWant = 0;", "  const stashOpen = [0, 0], stashWant = [0, 0];      // the left and the right door of the cabinet")
rep("  const stashShut = () => stashWant === 0 && stashOpen < 0.5;",
    "  /** the door in front of a shelf spot of the cabinet: left half, right half */\n"
    "  const doorOf = (sl) => (NAT.stash.cells[sl.idx] && NAT.stash.cells[sl.idx][0] < 0 ? 0 : 1);\n"
    "  const cellShut = (sl) => { const d = doorOf(sl); return stashWant[d] === 0 && stashOpen[d] < 0.5; };\n"
    "  const stashShut = () => cellShut({ idx: 0 }) && cellShut({ idx: 3 });\n"
    "  const lights = { main: 1, uv: 0 };            // the cellar: the ceiling lights, the purple grow lamp\n"
    "  const belts = [];                             // pizzas riding the belt into the oven\n"
    "  const flying = [];                            // thrown things in the air\n"
    "  const beltRec = stationById.get('belt') || null;\n"
    "  const needBox = stationById.has('bin_pbox');  // the natural kitchen serves pizza only in a box")
rep("        if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;\n        const dd = dist(p, q);",
    "        if (q.slot != null && slotById.get(q.slot).kind === 'stash' && cellShut(slotById.get(q.slot))) continue;\n        const dd = dist(p, q);", 0) if False else None
s = s.replace("if (q.slot != null && slotById.get(q.slot).kind === 'stash' && stashShut()) continue;", "if (q.slot != null && slotById.get(q.slot).kind === 'stash' && cellShut(slotById.get(q.slot))) continue;")
rep("      if (s.kind === 'stash' && stashShut()) continue;                                  // a closed cabinet takes nothing",
    "      if (s.kind === 'stash' && cellShut(s)) continue;                                  // a closed door takes nothing\n"
    "      if (it.kind === 'box' && !(s.kind === 'stash' && dist(p, s) <= 0.22) && s.kind !== 'trash') continue;      // the box goes where it is put")
rep("    stashOpen = toward(stashOpen, stashWant, h / S(RULES.lab.door));", "    for (let d = 0; d < 2; d++) stashOpen[d] = toward(stashOpen[d], stashWant[d], h / S(RULES.lab.door));")
rep("    const hidden = (it) => it.slot != null && slotById.get(it.slot).kind === 'stash' && stashShut();", "    const hidden = (it) => it.slot != null && slotById.get(it.slot).kind === 'stash' && cellShut(slotById.get(it.slot));")
rep("      if (sl.kind === 'stash' && stashShut()) return refuse(pl, hp, 'stashShut');", "      if (sl.kind === 'stash' && cellShut(sl)) return refuse(pl, hp, 'stashShut');")
rep("    if (box.slot != null && slotById.get(box.slot).kind === 'stash' && stashShut()) return refuse(pl, hp, 'stashShut');", "    if (box.slot != null && slotById.get(box.slot).kind === 'stash' && cellShut(slotById.get(box.slot))) return refuse(pl, hp, 'stashShut');")
rep("""    stashWant = stashWant ? 0 : 1;
    emit(stashWant ? 'stash_open' : 'stash_shut', { ...rec.st.taps[0], level: rec.level, player: pl.id });
    return { ok: true, open: stashWant };""",
    """    const T = rec.st.taps, d = msg && (msg.control === 0 || msg.control === 1) ? msg.control : dist(hp, T[0]) <= dist(hp, T[1] || T[0]) ? 0 : 1;
    stashWant[d] = stashWant[d] ? 0 : 1;
    emit(stashWant[d] ? 'stash_open' : 'stash_shut', { ...T[d], level: rec.level, player: pl.id });
    return { ok: true, door: d, open: stashWant[d] };""")
rep("  function doStash(pl, hp, rec) {", "  function doStash(pl, hp, rec, msg) {")
rep("    if (stashRec) dyn.push({ id: 'stash', state: { open: r3(stashOpen), want: stashWant, on: labOn && labOpen() } });",
    "    if (stashRec) dyn.push({ id: 'stash', state: { open: stashOpen.map(r3), want: stashWant.slice(), on: labOn && labOpen() } });\n"
    "    if (stationById.has('switch')) dyn.push({ id: 'switch', state: { on: lights.main } });")
rep("    if (growRec) dyn.push({ id: 'grow', state: { pots: pots.map((q) => r3(q.s)) } });",
    "    if (growRec) dyn.push({ id: 'grow', state: { pots: pots.map((q) => r3(q.s)), uv: lights.uv, lamp: has('lamp') } });")
rep("      q.s = Math.min(1, q.s + h / S(RULES.lab.grow) * (anyFx('rush') ? RULES.fx.rush : 1) * (career && has('lamp') ? 2 : 1));",
    "      q.s = Math.min(1, q.s + h / S(RULES.lab.grow) * (anyFx('rush') ? RULES.fx.rush : 1) * (lights.uv && has('lamp') ? 2 : 1));")
rep("  debug: { load:", "  debug: { lights: () => ({ ...lights }), load:", 0) if False else None
s = s.replace("    debug: { load: (n = 1) =>", "    debug: { lights: () => ({ ...lights }), belts: () => belts.map((it) => it.id), load: (n = 1) =>")
s = s.replace("lab: () => ({ stashOpen, stashWant,", "lab: () => ({ stashOpen: stashOpen.slice(), stashWant: stashWant.slice(),")

# items: the box, the ladle, pizza boxes; free hold
rep("      case 'box': return { n: [] };\n      case 'tray': return { n: [] };",
    "      case 'box': return { n: [] };\n      case 'tray': return { n: [] };\n      case 'ladle': return { sauce: null };\n      case 'pbox': return {};")
rep("    it.poofAt = LAB.has(it.kind) && it.kind !== 'tray' && it.kind !== 'meatbox' ? Infinity : time + S(RULES.poof);",
    "    it.poofAt = (LAB.has(it.kind) && it.kind !== 'tray' && it.kind !== 'meatbox') || KEEP_KIT.has(it.kind) ? Infinity : time + S(RULES.poof);")
rep("""  function itemPos(it) {
    if (it.holder != null) { const pl = players.get(it.holder); const hp = pl && handPos(pl, it.hand); if (hp) return hp; }
    return { x: it.x, y: it.y, z: it.z };
  }""",
    """  // ── the hand and what it holds: a thing keeps the hold it was taken with (it.ho: offset and turn in the hand's frame) ──
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qrot = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
  const QFIST = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];      // the thing's up is the hand's -Z
  const handQ = (pl, hand) => { const o = hand === 'l' ? 10 : 17; return [pl.pose[o], pl.pose[o + 1], pl.pose[o + 2], pl.pose[o + 3]]; };
  function itemPos(it) {
    if (it.holder != null) {
      const pl = players.get(it.holder), hp = pl && handPos(pl, it.hand);
      if (hp) { if (!it.ho) return hp; const d = qrot(handQ(pl, it.hand), it.ho.o); return { x: hp.x + d[0], y: hp.y + d[1], z: hp.z + d[2] }; }
    }
    return { x: it.x, y: it.y, z: it.z };
  }
  /** Where the top of a held thing points (world): its own up turned by the hold and the hand. */
  function itemUp(pl, hand, it) {
    const q = qmul(handQ(pl, hand), it.ho ? it.ho.q : FIST.has(it.kind) ? QFIST : [0, 0, 0, 1]);
    const u = qrot(q, [0, 1, 0]);
    return { x: u[0], y: u[1], z: u[2] };
  }""")
rep("""  function neckOf(pl, hand) {
    const o = hand === 'l' ? 7 : 14, x = pl.pose[o + 3], y = pl.pose[o + 4], z = pl.pose[o + 5], w = pl.pose[o + 6];
    return { x: -2 * (x * z + w * y), y: -2 * (y * z - w * x), z: -(1 - 2 * (x * x + y * y)) };
  }""",
    """  function neckOf(pl, hand) {
    const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
    if (it) return itemUp(pl, hand, it);
    return itemUp(pl, hand, { kind: 'blue' });
  }""")
rep("        const hp = handPos(pl, hand), mouth = { x: hp.x + up.x * L.mouth, y: hp.y + up.y * L.mouth, z: hp.z + up.z * L.mouth };",
    "        const hp = itemPos(src), mouth = { x: hp.x + up.x * L.mouth, y: hp.y + up.y * L.mouth, z: hp.z + up.z * L.mouth };")
# grab: the hold comes with the message
rep("    detach(it);\n    hold(it, pl, hand);\n    return { ok: true, item: it.id };\n  }\n\n  // A vessel is shaken",
    "    detach(it);\n    hold(it, pl, hand);\n    it.ho = holdOf(msg);\n    return { ok: true, item: it.id };\n  }\n"
    "  /** The hold sent with a grab: offset (m, hand frame, at most 0.35) and turn (unit quaternion); else none */\n"
    "  function holdOf(msg) {\n"
    "    const o = msg.o, q = msg.q;\n"
    "    if (!Array.isArray(o) || !Array.isArray(q) || o.length !== 3 || q.length !== 4 || ![...o, ...q].every(fin)) return null;\n"
    "    const lo = Math.hypot(o[0], o[1], o[2]), k = lo > 0.35 ? 0.35 / lo : 1, lq = Math.hypot(q[0], q[1], q[2], q[3]) || 1;\n"
    "    return { o: o.map((v) => r3(v * k)), q: q.map((v) => +(v / lq).toFixed(4)) };\n"
    "  }\n\n  // A vessel is shaken")
rep("  function hold(it, pl, hand) {\n    it.holder = pl.id; it.hand = hand; it.level = pl.level;",
    "  function hold(it, pl, hand) {\n    it.holder = pl.id; it.hand = hand; it.level = pl.level; it.ho = null; it.fly = null;\n    if (it.belt) { it.belt = null; const i = belts.indexOf(it); if (i >= 0) belts.splice(i, 1); }")
rep("    it.floor = false;\n    it.pour = false;\n  }", "    it.floor = false;\n    it.pour = false;\n    it.ho = null;\n    if (it.belt) { it.belt = null; const i = belts.indexOf(it); if (i >= 0) belts.splice(i, 1); }\n  }")
# release: thrown, or placed where the thing is
rep("""    detach(it);
    it.by = pl.id;
    const rule = place(it, p, fin(msg.yaw) ? msg.yaw : 0, pl);
    return { ok: true, rule };""",
    """    detach(it);
    it.by = pl.id;
    const v = msg.v, sp = Array.isArray(v) && v.length === 3 && v.every(fin) ? Math.hypot(v[0], v[1], v[2]) : 0;
    if (sp >= RULES.throw.min) {                  // let go while the hand moves fast: it flies
      const k = Math.min(1, RULES.throw.max / sp);
      it.x = p.x; it.y = p.y; it.z = p.z; it.level = pl.level; it.yaw = fin(msg.yaw) ? msg.yaw : 0;
      it.fly = { vx: v[0] * k, vy: v[1] * k, vz: v[2] * k, by: pl.id };
      flying.push(it);
      emit('thrown', { x: p.x, y: p.y, z: p.z, level: pl.level, player: pl.id });
      return { ok: true, rule: 11, thrown: true };
    }
    const rule = place(it, p, fin(msg.yaw) ? msg.yaw : 0, pl);
    return { ok: true, rule };""")
# place(): boxing a pizza, the ladle back in its pot, the belt
rep("    // 0b. a packet on a tray (on the press or anywhere): up to three of one kind",
    """    // 0. the kitchen: a baked pizza onto an empty pizza box (or the box onto the pizza): it is boxed
    if ((it.kind === 'pizza' && cookedOk(it.state.cook) && !it.state.boxed) || it.kind === 'pbox') {
      const want = it.kind === 'pizza' ? 'pbox' : 'pizza';
      let mate = null, md = RULES.kitchen.box + 1e-9;
      for (const q of items.values()) {
        if (q.kind !== want || q.holder != null || q.fly || itemLevel(q) !== L) continue;
        if (want === 'pizza' && (!cookedOk(q.state.cook) || q.state.boxed)) continue;
        const dd = Math.hypot(p.x - q.x, p.z - q.z);
        if (dd <= md && Math.abs(p.y - q.y) < 0.45) { md = dd; mate = q; }
      }
      if (mate) {
        const pz = it.kind === 'pizza' ? it : mate, bx = it.kind === 'pbox' ? it : mate, at_ = mate;
        const sl = at_.slot != null ? slotById.get(at_.slot) : null, pos = { x: at_.x, y: at_.y, z: at_.z }, fl = at_.floor;
        removeItem(bx);
        if (pz !== at_) { detach(pz); if (sl && sl.accepts.includes('pizza')) putInSlot(pz, sl); else { pz.x = pos.x; pz.y = pos.y; pz.z = pos.z; pz.level = L; pz.floor = fl; } }
        pz.state.boxed = 1; pz.state.ball = false;
        emit('boxed', at(pz, { player: pl.id, level: L }));
        return 12;
      }
    }
    // 0b. a packet on a tray (on the press or anywhere): up to three of one kind""")
rep("      if (best.kind === 'trash') {\n        emit('poof', at(best));\n        removeItem(it);",
    "      if (best.kind === 'belt') {      // the belt: the pizza rides into the oven\n"
    "        const P0 = best.st.st.path[0];\n"
    "        it.x = P0.x; it.y = P0.y; it.z = P0.z; it.level = L; it.yaw = yaw; it.state.ball = false;\n"
    "        it.belt = { t: 0 };\n"
    "        belts.push(it);\n"
    "        emit('belt', at(it, { player: pl.id }));\n"
    "      } else if (best.kind === 'trash') {\n        emit('poof', at(best));\n        removeItem(it);")
rep("      if (s.kind === 'grow' && pots[s.idx].s > 0) continue;                             // something grows in this bucket already",
    "      if (s.kind === 'grow' && pots[s.idx].s > 0) continue;                             // something grows in this bucket already\n"
    "      if (s.kind === 'belt' && (it.state.cook > 0.05 || it.state.boxed || belts.some((q) => q.belt.t < 0.45))) continue;      // raw pizzas, one after another")
# drinks fill by themselves when the cup is put under a tap
rep("        if (best.kind === 'counter') evalServe(best, pl);",
    "        if (best.kind === 'counter') evalServe(best, pl);\n"
    "        if (best.kind === 'drinks' && best.st.st.taps2 && it.kind === 'cup' && it.state.fill < 1 && (best.idx === 0 || has('orange'))) {\n"
    "          if (startPour(it, best.idx)) emit('pouring', at(best, { player: pl.id, seat: best.idx }));\n"
    "        }")
# serving: a pizza must be boxed in the natural kitchen
rep("      if (st.length !== o.stack.length || st.slice().sort().join() !== o.stack.slice().sort().join()) return false;\n      return cookedOk(it.state.cook);",
    "      if (st.length !== o.stack.length || st.slice().sort().join() !== o.stack.slice().sort().join()) return false;\n      return cookedOk(it.state.cook) && (!needBox || !!it.state.boxed);")
rep("      const st = it.state.stack;\n      if (st.length",
    "      const st = it.state.stack;\n      if (st.length", 1)
# the menu: a sauce can come from a pot too
rep("  const menuAll = MENU.filter((st) => st.every((k) => stationById.has(`bin_${k}`)));",
    "  const menuAll = MENU.filter((st) => st.every((k) => stationById.has(`bin_${k}`) || stationById.has(`pot_${k}`)));")
# pub state
rep("      case 'pizza': return { stack: s.stack.slice(), cook: r3(s.cook), ball: !!s.ball && it.holder != null };",
    "      case 'pizza': return { stack: s.stack.slice(), cook: r3(s.cook), ball: !!s.ball && it.holder != null, boxed: s.boxed ? 1 : 0, belt: it.belt ? 1 : 0 };\n"
    "      case 'ladle': return { sauce: s.sauce };")
rep("        return { id: it.id, kind: it.kind, level: itemLevel(it), x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(it.yaw), holder: it.holder, hand: it.hand, slot: it.slot, state: pubState(it) };",
    "        return { id: it.id, kind: it.kind, level: itemLevel(it), x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(it.yaw), holder: it.holder, hand: it.hand, slot: it.slot, state: pubState(it),\n"
    "          ...(it.ho && it.holder != null ? { ho: it.ho } : null), ...(it.fly ? { fly: 1 } : null) };")
rep("      lights: undefined,\n", "", 0) if False else None
rep("      goal: goalNow(),\n", "      goal: goalNow(),\n      lights: { ...lights },\n")
# the kitchen step: the ladle, the belt, spilling, flying
rep("  // ── the cellar lab: the cabinet door, deliveries, growing, pouring, the two machines ──",
    """  // ── the kitchen: the ladle, the belt, cups that tip, things in the air ──
  const potList = layout.stations.filter((st) => st.kind === 'pot');
  function stepKitchen(h) {
    const K = RULES.kitchen;
    for (const pl of players.values()) {
      if (!pl.pose) continue;
      for (const hand of ['l', 'r']) {
        const it = pl.hands[hand] != null ? items.get(pl.hands[hand]) : null;
        if (!it) continue;
        const p = itemPos(it);
        if (it.kind === 'ladle') {
          // the bowl of the ladle is at its lower end: the held point is the handle
          const up = itemUp(pl, hand, it), b = { x: p.x - up.x * 0.25, y: p.y - up.y * 0.25, z: p.z - up.z * 0.25 };
          for (const st of potList) {
            if (st.level !== pl.level) continue;
            if (Math.hypot(b.x - st.x, b.z - st.z) <= K.dip && b.y <= st.y + st.h + 0.12 && b.y >= st.y - 0.05 && it.state.sauce !== st.gives) {
              it.state.sauce = st.gives; emit('dip', { x: st.x, y: st.y + st.h, z: st.z, level: st.level, player: pl.id });
            }
          }
          if (it.state.sauce) for (const q of items.values()) {
            if (q.kind !== 'pizza' || q.holder != null || q.fly || q.state.cook > 0.05 || itemLevel(q) !== pl.level) continue;
            if (Math.hypot(b.x - q.x, b.z - q.z) <= K.lay && b.y >= q.y - 0.02 && b.y <= q.y + 0.35) {
              if (topFits(q.state.stack, it.state.sauce)) { q.state.stack.push(it.state.sauce); q.state.ball = false; it.state.sauce = null; emit('top', at(q, { player: pl.id })); }
              break;
            }
          }
        } else if (it.kind === 'cup' && it.state.fill > 0) {
          const up = itemUp(pl, hand, it);
          if (up.y < K.tip) {
            it.state.fill = Math.max(0, it.state.fill - K.spill * h * (1 + (K.tip - up.y)));
            if (time >= (it.spillAt || 0)) { it.spillAt = time + 0.3; emit('spill', { x: p.x, y: p.y, z: p.z, level: pl.level, player: pl.id }); }
          }
        }
      }
    }
    // the belt
    if (beltRec) {
      const [a, b] = beltRec.st.path, len = Math.hypot(b.x - a.x, b.z - a.z) || 1, ovenSlot = stationById.get('oven').slots[0];
      for (let i = belts.length - 1; i >= 0; i--) {
        const it = belts[i];
        it.belt.t = Math.min(1, it.belt.t + h * K.belt / len);
        it.x = a.x + (b.x - a.x) * it.belt.t; it.z = a.z + (b.z - a.z) * it.belt.t; it.y = a.y;
        if (it.belt.t >= 1 && ovenSlot.item == null) { belts.splice(i, 1); it.belt = null; putInSlot(it, ovenSlot); rollZone(); emit('oven_in', at(ovenSlot)); }
      }
    }
    // things in the air
    for (let i = flying.length - 1; i >= 0; i--) {
      const it = flying[i], f = it.fly;
      if (!f || !items.has(it.id)) { flying.splice(i, 1); continue; }
      const px = it.x, py = it.y, pz = it.z;
      f.vy -= RULES.throw.g * h;
      it.x += f.vx * h; it.y += f.vy * h; it.z += f.vz * h;
      // the walls of the rooms stop it
      const rs = layout.rooms || [{ x: 0, z: 0, w: hall.w, d: hall.d }];
      if (!rs.some((r) => Math.abs(it.x - r.x) <= r.w / 2 + 0.6 && Math.abs(it.z - r.z) <= r.d / 2 + 0.6)) { it.x = px; it.z = pz; f.vx = 0; f.vz = 0; }
      let land = null;
      // a place that takes it (a customer's place on the counter, a buyer's hand), or the top of a table, or the floor
      for (const sl of slotList) {
        if (sl.level !== it.level || !sl.accepts.includes(it.kind) || (sl.item != null && sl.kind !== 'trash')) continue;
        if (Math.hypot(it.x - sl.x, it.z - sl.z) <= 0.22 && py >= sl.y - 0.05 && it.y <= sl.y + 0.15) { land = { x: sl.x, y: sl.y + 0.02, z: sl.z }; break; }
      }
      if (!land) for (const w of walkers) {
        if (w.level !== it.level || w.state !== 'wait') continue;
        if (Math.hypot(it.x - w.hand.x, it.z - w.hand.z) <= 0.3 && Math.abs(it.y - w.hand.y) <= 0.35) { land = { ...w.hand }; break; }
      }
      if (!land) for (const rec of surfaces) {
        const bx = rec.box;
        if (rec.level !== it.level || it.x < bx.x0 || it.x > bx.x1 || it.z < bx.z0 || it.z > bx.z1) continue;
        if (py >= bx.y1 - 0.02 && it.y <= bx.y1) { land = { x: it.x, y: bx.y1, z: it.z }; break; }
      }
      if (!land && it.y <= 0) land = { x: it.x, y: 0, z: it.z };
      if (!land) continue;
      flying.splice(i, 1);
      it.fly = null;
      if (it.kind === 'cup' && it.state.fill > 0) { it.state.fill = 0; emit('spill', { ...land, level: it.level }); }
      const thrower = players.get(f.by) || gone.get(f.by) || { id: f.by, level: it.level, hands: {}, packed: 0, mistakes: 0, served: 0, cooked: 0 };
      const pl = { ...thrower, level: it.level };
      place(it, land, it.yaw, pl);
      emit('landed', { ...land, level: it.level });
    }
  }

  // ── the cellar lab: the cabinet door, deliveries, growing, pouring, the two machines ──""")
rep("    stepCooking(h);", "    stepCooking(h);\n    stepKitchen(h);")
# the grow lamp and the light switch
rep("    if (kind === 'stash') return doStash(pl, hp, rec, msg);",
    "    if (kind === 'stash') return doStash(pl, hp, rec, msg);\n"
    "    if (kind === 'switch') { lights.main = lights.main ? 0 : 1; emit('lights', { ...rec.st.btn, level: rec.level, player: pl.id }); return { ok: true, on: lights.main }; }\n"
    "    if (kind === 'grow') {\n"
    "      if (!has('lamp')) return refuse(pl, hp, 'locked');\n"
    "      lights.uv = lights.uv ? 0 : 1; emit('lights', { ...rec.st.taps[0], level: rec.level, player: pl.id }); return { ok: true, uv: lights.uv };\n"
    "    }")
# the ladle lies in the tomato pot at the start; a pot is not a bin
rep("  if (labOn) money = career ? RULES.career.money : RULES.startMoney;",
    "  if (labOn) money = career ? RULES.career.money : RULES.startMoney;\n"
    "  { const pot = stationById.get('pot_sauce'); if (pot && pot.slots[0]) { const l = newItem('ladle', 0); putInSlot(l, pot.slots[0]); } }")
rep("  const KEEP = new Set(['plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box', 'tray']);", "  const KEEP = new Set(['plant', 'seeds', 'papers', ...LIQUIDS, ...SELL, 'box', 'tray']);      // (the ladle is made new each session)")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rules 1.5 patched,', n, 'edits')

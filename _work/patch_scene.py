"""The Back Room 1.1: hands and effects (scene.js). Run from lobby-stage."""
import io

p = 'public/play/games/backroom/scene.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("const USE_R = { button: 0.20, grinder: 0.30 };",
    "const USE_R = { button: 0.20, grinder: 0.30 };\nconst TAP_R = { drinks: 0.15, stash: 0.11, bench: 0.13 };      // a station with several things to press: the hand must be at the one it means")
rep("  cup: [0.07, 0.12, 0.07], tray: [0.76, 0.13, 0.57], meatbox: [0.76, 0.20, 0.57],\n",
    "  cup: [0.07, 0.12, 0.07], tray: [0.76, 0.13, 0.57], meatbox: [0.76, 0.20, 0.57],\n"
    "  white: [0.14, 0.03, 0.11], mustard: [0.14, 0.03, 0.11], shrimp: [0.15, 0.06, 0.20], ham: [0.12, 0.04, 0.16], bacon: [0.07, 0.03, 0.32],\n"
    "  pineapple: [0.19, 0.02, 0.19], onion: [0.11, 0.07, 0.27],\n"
    "  plant: [0.30, 1.24, 0.30], seeds: [0.07, 0.13, 0.07], papers: [0.10, 0.13, 0.04], blue: [0.17, 0.34, 0.17], clear: [0.15, 0.34, 0.15], red: [0.17, 0.41, 0.17],\n"
    "  buds: [0.17, 0.07, 0.25], joint: [0.03, 0.02, 0.21], ice: [0.17, 0.07, 0.25], pills: [0.10, 0.17, 0.10], powder: [0.17, 0.07, 0.25],\n"
    "  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40],\n")
rep("const PARTS = new Set(['sauce', 'cheese', 'veg', 'meat']);", "const PARTS = new Set(['sauce', 'white', 'mustard', 'cheese', 'veg', 'meat', 'shrimp', 'ham', 'bacon', 'pineapple', 'onion']);")
rep("const USE_KINDS = new Set(['button', 'grinder', 'elevator']);", "const USE_KINDS = new Set(['button', 'grinder', 'elevator', 'drinks', 'stash', 'bench']);")
rep("const LIVE_KINDS = new Set(['grinder', 'button', 'door', 'shutter', 'sign', 'elevator']);", "const LIVE_KINDS = new Set(['grinder', 'button', 'door', 'shutter', 'sign', 'elevator', 'stash', 'grow', 'bench']);")
rep("const DEF_STATE = { pizza: { stack: [], cook: 0, ball: false }, cup: { fill: 0, drink: null } };",
    "const DEF_STATE = { pizza: { stack: [], cook: 0, ball: false }, cup: { fill: 0, drink: null }, blue: { shake: 0 }, ice: { pure: 0 } };")

# the station record: taps and what each shelf spot is for; the model gets the whole definition
rep("      state: def.state ?? null, view: {}, skey: '', keyT: now, n1: 0, nV: 0, nT: 0, shook: false,\n    };",
    "      state: def.state ?? null, view: {}, skey: '', keyT: now, n1: 0, nV: 0, nT: 0, shook: false,\n"
    "      taps: Array.isArray(def.taps) ? def.taps.map(q => ({ x: +q.x || 0, y: +q.y || 0, z: +q.z || 0 })) : null, shelf: Array.isArray(def.shelf) ? def.shelf : null, freeKey: '',\n"
    "    };")
rep("gives: def.gives, nat: def.nat, rack: def.rack, tray: def.tray, text:", "gives: def.gives, nat: def.nat, rack: def.rack, tray: def.tray, bowl: def.bowl, def, text:")
rep("  const bins = stations.filter(s => s.kind === 'bin'), useStations = stations.filter(s => USE_KINDS.has(s.kind));\n",
    "  const bins = stations.filter(s => s.kind === 'bin'), useStations = stations.filter(s => USE_KINDS.has(s.kind));\n"
    "  const stashSt = stations.find(s => s.kind === 'stash') || null, growSt = stations.find(s => s.kind === 'grow') || null, drinksSt = stations.find(s => s.kind === 'drinks' && s.taps) || null;\n"
    "  const streams = [];      // one thin stream under every tap of the drinks machine\n"
    "  if (drinksSt) {\n"
    "    const geo = keep(new THREE.CylinderGeometry(0.011, 0.011, 1, 6).translate(0, -0.5, 0));\n"
    "    drinksSt.taps.forEach((tap, i) => {\n"
    "      const sl = drinksSt.slots[i];\n"
    "      if (!sl) return;\n"
    "      const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ color: i === 0 ? 0x3a1c10 : 0xff9a1f })));\n"
    "      m.position.set(sl.x, tap.y - 0.04, sl.z);\n"
    "      m.visible = false;\n"
    "      drinksSt.parent.add(m);\n"
    "      streams.push({ m, tap, slot: sl, until: 0 });\n"
    "    });\n"
    "  }\n"
    "  // which of the taps of a station can be pressed right now\n"
    "  const tapOn = (st, j) => {\n"
    "    if (st.kind === 'bench') return j < 2;\n"
    "    if (st.kind !== 'stash' || j === 0) return true;\n"
    "    const sl = st.slots[j - 1];      // an empty shelf spot of a supply, cabinet open, nothing on its way\n"
    "    return !!(st.shelf && st.shelf[j - 1]) && (st.view.open || 0) > 0.5 && !!sl && sl.item == null && !(st.view.pend || []).includes(j - 1);\n"
    "  };\n")

# item keys and what the scene remembers of an item
rep("      case 'cup': return `cup|${s.drink || ''}|${q(s.fill, 10)}`;\n", "      case 'cup': return `cup|${s.drink || ''}|${q(s.fill, 10)}`;\n      case 'blue': return `blue|${s.shake ? 1 : 0}`;\n      case 'ice': return `ice|${s.pure ? 1 : 0}`;\n")
rep("      r.seen = snapN;\n      if (it.state && typeof it.state.cook === 'number') {",
    "      r.seen = snapN;\n      r.pour = !!(it.state && it.state.pour); r.slot = it.slot ?? null; r.shaken = !!(it.state && it.state.shake);\n      if (it.state && typeof it.state.cook === 'number') {")

# targets: taps first
rep("      if (!s.btn) continue;\n      const dx = s.btn.x - px,",
    "      if (s.taps) {\n"
    "        for (let j = 0; j < s.taps.length; j++) {\n"
    "          if (!tapOn(s, j)) continue;\n"
    "          const b = s.taps[j], dx = b.x - px, dy = b.y - py, dz = b.z - pz, d2 = dx * dx + dy * dy + dz * dz, rr = s.kind === 'stash' && j === 0 ? 0.2 : TAP_R[s.kind] || 0.14;\n"
    "          if (d2 <= rr * rr && d2 < ud) { ud = d2; T.st = s; T.btn = null; T.ctl = b; T.control = j; }\n"
    "        }\n"
    "        continue;\n"
    "      }\n"
    "      if (!s.btn) continue;\n      const dx = s.btn.x - px,")
# a grown plant is taken like something from a bin
rep("    if (T.st) T.type = T_BIN;\n    return T;\n  }\n",
    "    if (growSt && growSt.on && Array.isArray(growSt.view.pots)) for (let i = 0; i < growSt.slots.length; i++) {\n"
    "      const sl = growSt.slots[i];\n"
    "      if (!(growSt.view.pots[i] >= 1)) continue;\n"
    "      const dx = sl.x - px, dy = sl.y + 0.45 - py, dz = sl.z - pz, d2 = dx * dx + dy * dy + dz * dz;\n"
    "      if (d2 <= bb) { bb = d2; T.st = growSt; T.ctl = sl; }\n"
    "    }\n"
    "    if (T.st) T.type = T_BIN;\n    return T;\n  }\n")
rep("        const b = T.st;                                  // кашон на рафт: пръстенът е отпред, не отгоре\n        if (b.y + b.h > 1.15)",
    "        const b = T.st;                                  // кашон на рафт: пръстенът е отпред, не отгоре\n        if (b.kind === 'grow' && T.ctl) ring(T.ctl.x, T.ctl.y + 0.04, T.ctl.z, 0.2 * pulse, RING_ON);\n        else if (b.y + b.h > 1.15)")

# orders: the product of the cellar
rep("const orderKeyOf = o => (o && o.kind !== 'none' ? `order|${o.kind}|${(o.stack || []).join(',')}|${o.drink || ''}` : 'order|none');",
    "const orderKeyOf = o => (o && o.kind !== 'none' ? `order|${o.kind}|${(o.stack || []).join(',')}|${o.drink || ''}|${o.item || ''}` : 'order|none');")
rep("    const m = kit.make(o.kind, { theme });\n    if (!m) return wrap;\n    if (o.kind === 'pizza') {",
    "    const m = kit.make(o.kind === 'stuff' ? o.item : o.kind, { theme });\n    if (!m) return wrap;\n"
    "    if (o.kind === 'stuff') {                       // what the buyer wants from the cellar, shown big\n"
    "      m.position.y = -(SIZES[o.item]?.[1] || 0.1) / 2;\n"
    "      g.add(m);\n"
    "      g.scale.setScalar(o.item === 'joint' ? 2.6 : 1.5);\n"
    "    } else if (o.kind === 'pizza') {")

# the free spots of the cabinet come from the slots, not from its own state
rep("    if (snap.slots) for (let i = 0; i < slots.length; i++) { const v = snap.slots[slots[i].key]; slots[i].item = v == null ? null : v; }\n",
    "    if (snap.slots) for (let i = 0; i < slots.length; i++) { const v = snap.slots[slots[i].key]; slots[i].item = v == null ? null : v; }\n"
    "    if (stashSt) {\n"
    "      const free = stashSt.slots.map(sl => sl.item == null), fk = free.join('');\n"
    "      if (fk !== stashSt.freeKey) { stashSt.freeKey = fk; stashSt.view.free = free; stashSt.keyT = now; if (stashSt.mode === 'baked') toLive(stashSt); }\n"
    "    }\n")

# effects for the new events
rep("      case 'poured': if (has) flash(x, y + 0.1, z, 0xc8f03c, 0.2, 0.3); break;\n",
    "      case 'poured': if (has) flash(x, y + 0.1, z, 0xc8f03c, 0.2, 0.3); break;\n"
    "      case 'spill': { const st = streams[e.seat | 0]; if (st) st.until = now + 0.9; if (mine) ctx.haptic(lastHand, 0.3, 200); break; }\n"
    "      case 'pouring': if (mine) ctx.haptic(lastHand, 0.4, 250); break;\n"
    "      case 'stash_open': case 'stash_shut': if (has) puff(x, y, z, 0x9fc4ff, 5, 0.3, 0.04, 0.5, 0.2); if (mine) ctx.haptic(lastHand, 0.6, 60); break;\n"
    "      case 'ordered': if (has) flash(x, y, z, 0xffd257, 0.25, 0.4); break;\n"
    "      case 'delivered': if (has) { flash(x, y, z, 0x7bd66a, 0.3, 0.5); puff(x, y + 0.03, z, 0x7bd66a, 7, 0.4, 0.04, 0.6, 0.3); } if (myLevel === 1) { ctx.haptic('l', 0.3, 60); ctx.haptic('r', 0.3, 60); } break;\n"
    "      case 'harvest': if (has) puff(x, y + 0.5, z, 0x4f9a3a, 9, 0.5, 0.05, 0.6, 0.2); break;\n"
    "      case 'planted': if (has) puff(x, y + 0.05, z, 0x6b4a2a, 6, 0.3, 0.04, 0.5, 0.2); break;\n"
    "      case 'grown': if (has) puff(x, y + 0.6, z, 0x4f9a3a, 8, 0.4, 0.05, 0.7, 0.4); break;\n"
    "      case 'shred': case 'mix': if (mine) ctx.haptic(lastHand, 0.5, 400); break;\n"
    "      case 'shredded': if (has) puff(x, y + 0.05, z, 0x4f9a3a, 10, 0.6, 0.04, 0.6, 0.5); break;\n"
    "      case 'mixed': if (has) { flash(x, y + 0.05, z, 0x4d8dff, 0.34, 0.5); puff(x, y + 0.05, z, 0x9fc4ff, 9, 0.5, 0.04, 0.7, 0.5); } break;\n"
    "      case 'pour': if (has) puff(x, y, z, 0x9fc4ff, 6, 0.3, 0.035, 0.5, -0.2); if (mine) ctx.haptic(lastHand, 0.5, 120); break;\n"
    "      case 'rolled': if (has) puff(x, y + 0.03, z, 0xe6ead8, 6, 0.3, 0.03, 0.5, 0.3); if (mine) ctx.haptic(lastHand, 0.6, 80); break;\n"
    "      case 'shaken': if (has) flash(x, y, z, 0x4d8dff, 0.3, 0.4); break;\n")

# the drink streams and the shaking of the flask: every frame
rep("    // станции със състояние\n    for (let i = 0; i < dyn.length; i++) {",
    "    // the streams of the drinks machine: a cup that is being filled, or a tap pressed with nothing under it\n"
    "    for (let i = 0; i < streams.length; i++) {\n"
    "      const q = streams[i];\n"
    "      let on = now < q.until;\n"
    "      for (let n = 0; n < itemList.length && !on; n++) { const r = itemList[n]; if (r.pour && r.slot === q.slot.key) on = true; }\n"
    "      q.m.visible = on && drinksSt.on;\n"
    "      if (q.m.visible) q.m.scale.set(1 + 0.25 * Math.sin(now * 40 + i), Math.max(0.05, q.tap.y - 0.04 - q.slot.y - 0.015), 1 + 0.25 * Math.cos(now * 37 + i));\n"
    "    }\n"
    "    // the blue flask is shaken: four quick changes of direction\n"
    "    for (let j = 0; j < 2; j++) {\n"
    "      const k = HK[j], H = hand[k], h = ctx.hands[k], it = H.held;\n"
    "      if (!h) continue;\n"
    "      if (!H.shP) H.shP = h.pos.clone();\n"
    "      if (!it || it.kind !== 'blue' || it.shaken || h.active === false) { H.shN = 0; H.shId = null; H.shP.copy(h.pos); continue; }\n"
    "      if (H.shId !== it.id) { H.shId = it.id; H.shN = 0; H.shS = 0; H.shDone = false; H.shP.copy(h.pos); continue; }\n"
    "      const kdt = 1 / Math.max(dt, 1e-3), vx = (h.pos.x - H.shP.x) * kdt, vy = (h.pos.y - H.shP.y) * kdt, vz = (h.pos.z - H.shP.z) * kdt;\n"
    "      H.shP.copy(h.pos);\n"
    "      if (Math.hypot(vx, vy, vz) < 0.9) continue;\n"
    "      const ax = Math.abs(vx), ay = Math.abs(vy), az = Math.abs(vz), lead = ay >= ax && ay >= az ? vy : ax >= az ? vx : vz, sg = lead > 0 ? 1 : -1;\n"
    "      if (sg === H.shS) continue;\n"
    "      if (now - (H.shT || 0) > 0.9) H.shN = 0;\n"
    "      H.shS = sg; H.shT = now; H.shN++;\n"
    "      ctx.haptic(k, 0.35, 18);\n"
    "      if (H.shN >= 4 && !H.shDone) { H.shDone = true; ctx.send({ a: 'shake', hand: k }); ctx.haptic(k, 0.9, 140); }\n"
    "    }\n\n"
    "    // станции със състояние\n    for (let i = 0; i < dyn.length; i++) {")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('scene patched; streams still to be declared')

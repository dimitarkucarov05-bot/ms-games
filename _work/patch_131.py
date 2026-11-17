"""The Back Room 1.3.1: the game starts at 08:00 (day, night, day), the drink a customer wants is named, the supplies on the
rack show one model per item in stock instead of a full pile. Run from lobby-stage."""
import io


def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, s.count(a), a[:90])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('game/backroom.js', [
    ("  const PHASES = opts.days >= 2 ? PHASES_ALL : PHASES_ALL.slice(0, 3);",
     "  // the game starts at 08:00 with the shop (the owner's word); the night makes product for the second day. opts.tutorial: the\n"
     "  // pizza training first (tests)\n"
     "  const PHASES = opts.tutorial ? PHASES_ALL.slice(0, 3) : ['day', 'night', 'day2'];"),
    ("  let phase = 'tutorial', phaseEnd = S(RULES.phases.tutorial);", "  let phase = PHASES[0], phaseEnd = S(RULES.phases[PHASES[0]]);"),
    ("  let doorOpen = 0, shutterOpen = 1;", "  let doorOpen = 0, shutterOpen = PHASES[0] === 'tutorial' ? 1 : 0;"),
    ("  emit('phase', { text: TX.title.tutorial });\n", "  if (phase === 'tutorial') emit('phase', { text: TX.title.tutorial }); else enter(phase);\n"),
])

s = io.open('game/backroom.test.js', encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)
rep("  assert.deepEqual(seen.map(x => x[0]), ['tutorial', 'night', 'day', 'over']);",
    "  assert.deepEqual(seen.map(x => x[0]), ['day', 'night', 'day2', 'over'], 'the game starts at 08:00');\n"
    "  assert.ok(Math.abs(seen[0][1] - 480) < 10, `the first clock is 08:00: ${seen[0][1]}`);")
rep("  const two = M.createGame({ ...ZONE, now: 0, fast: true, days: 2 });", "  const two = M.createGame({ ...ZONE, now: 0, fast: true, tutorial: true });")
rep("  assert.deepEqual(seen2, ['tutorial', 'night', 'day', 'night2', 'day2', 'over']);", "  assert.deepEqual(seen2, ['tutorial', 'night', 'day', 'over'], 'with the training first');")
rep("test('training: a margherita the real way brings money', () => {\n  const k = play();", "test('training: a margherita the real way brings money', () => {\n  const k = play({ tutorial: true });")
rep("  assert.equal(play().act({ a: 'buy', kind: 'seeds' }).reason, 'shopShut');", "  assert.equal(play({ tutorial: true }).act({ a: 'buy', kind: 'seeds' }).reason, 'shopShut');")
rep("test('one clear goal at any moment, with the place it points at', () => {\n  const k = play();", "test('one clear goal at any moment, with the place it points at', () => {\n  const k = play({ tutorial: true });")
io.open('game/backroom.test.js', 'w', encoding='utf-8', newline='\n').write(s)

patch('public/play/games/backroom/synty-kinds.js', [
    ("    if (obj.userData.shelf) {                                 // продукт на рафт: купчинката му е сложена при създаването\n",
     "    if (obj.userData.stockItems) {                            // supplies on the rack: one model for every one in stock\n"
     "      const n = st.stock != null ? st.stock | 0 : 0;\n"
     "      obj.userData.stockItems.forEach((it, i) => { it.visible = i < n; });\n"
     "      return true;\n"
     "    }\n"
     "    if (obj.userData.shelf) {                                 // продукт на рафт: купчинката му е сложена при създаването\n"),
    ("    if (gives && makers[gives]) { const p = pile(gives); p.position.z = NAT_FRONT - 0.22; g.add(p); g.userData.pile = p; if (gives === 'meat') p.visible = false; }",
     "    if (gives && makers[gives] && opts.def && opts.def.stock) {\n"
     "      // a supply: side by side in one row, never stacked; as many as fit in its place, the count is written over it\n"
     "      const sw = (SPEC_SIZE[gives] || [0.1])[0], room = Math.max(0.12, (opts.w || 0.3) - 0.02);\n"
     "      const n = Math.max(1, Math.min(4, Math.floor(room / Math.max(0.05, sw * 0.8))));\n"
     "      const list = [];\n"
     "      for (let i = 0; i < n; i++) {\n"
     "        const it = make(gives, {});\n"
     "        if (!it) break;\n"
     "        it.position.set(n > 1 ? (i / (n - 1) - 0.5) * (room - Math.min(room, sw)) : 0, 0, NAT_FRONT - 0.22 + (i % 2) * 0.05);\n"
     "        it.visible = false;\n"
     "        g.add(it); list.push(it);\n"
     "      }\n"
     "      g.userData.stockItems = list;\n"
     "    } else if (gives && makers[gives]) { const p = pile(gives); p.position.z = NAT_FRONT - 0.22; g.add(p); g.userData.pile = p; if (gives === 'meat') p.visible = false; }"),
])

patch('public/play/games/backroom/scene.js', [
    ("const STOP = ['SHOP', 'CELLAR', 'STREET'];", "const STOP = ['SHOP', 'CELLAR', 'STREET'];\nconst DRINK_NAME = { cola: 'COLA', orange: 'ORANGE' }, DRINK_TAP = ['cola', 'orange'];"),
    ("    if (!over) {\n      // the lift: where each button of the cabin goes",
     "    if (!over && myLevel === 0) {\n"
     "      // the drinks: the customer's cup says which drink, and each tap of the machine says what it pours\n"
     "      for (let i = 0; i < custList.length && labelN < 18; i++) {\n"
     "        const r = custList[i], o = r.view.order;\n"
     "        if (!o || o.kind !== 'cup' || r.lv !== 0 || !(r.state === 'in' || r.state === 'wait') || !r.ov.g.visible) continue;\n"
     "        const p = r.ov.g.position;\n"
     "        label(DRINK_NAME[o.drink] || 'DRINK', '', p.x, p.y + 0.2, p.z, 1.3);\n"
     "      }\n"
     "      if (drinksSt && drinksSt.on) drinksSt.taps.forEach((t, j) => { label(DRINK_NAME[DRINK_TAP[j]] || '', '', t.x, t.y + 0.16, t.z, 0.8); });\n"
     "    }\n"
     "    if (!over) {\n      // the lift: where each button of the cabin goes"),
])
print('1.3.1 patched')

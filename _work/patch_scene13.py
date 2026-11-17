"""The Back Room 1.3, the scene (scene.js). Run from lobby-stage.
Street levels, three stops of the lift, buyers in the street, the lever that opens the shop, joints rolled by shaking both
hands, product taken at the mouth, the goal marked in the room, a bigger menu on the wall screens."""
import io

p = 'public/play/games/backroom/scene.js'
s = io.open(p, encoding='utf-8').read()
n = 0


def rep(a, b, count=1):
    global s, n
    assert s.count(a) == count, (s.count(a), a[:100])
    s = s.replace(a, b)
    n += 1


# ───── constants ─────
rep("const USE_R = { button: 0.20, grinder: 0.30 };", "const USE_R = { button: 0.20, grinder: 0.30, shutter: 0.26, way: 0.32 };")
rep("const ROT_KINDS = new Set(['blue', 'clear', 'red', 'plant', 'pills', 'seeds', 'cup']);      // held upright in the fist: they turn with the hand\n"
    "const LIQ = new Set(['blue', 'clear', 'red']);\n"
    "const LIQ_HEX = [0x2f6dff, 0xcfd6de, 0xff5a3c], LIQ_WORD = ['blue', 'solvent', 'catalyst'];\n"
    "const NAME = { blue: 'Blue base', clear: 'Solvent', red: 'Catalyst', papers: 'Papers', seeds: 'Seeds', box: 'Carry box', ice: 'Blue ice', pills: 'Pills', powder: 'Powder', buds: 'Bud', joint: 'Joint' };",
    "const ROT_KINDS = new Set(['blue', 'clear', 'red', 'green', 'yellow', 'plant', 'pills', 'candy', 'syrup', 'seeds', 'cup']);      // held upright in the fist: they turn with the hand\n"
    "const ROT_FLAT = new Set(['joint']);      // long things held between the fingers: they point where the hand points\n"
    "const LIQ = new Set(['blue', 'clear', 'red', 'green', 'yellow']);\n"
    "const LIQ_HEX = [0x2f6dff, 0xcfd6de, 0xff5a3c, 0x58d86a, 0xffd23c], LIQ_WORD = ['blue', 'solvent', 'catalyst', 'acid', 'syrup base'];\n"
    "const NAME = { blue: 'Blue base', clear: 'Solvent', red: 'Catalyst', green: 'Acid', yellow: 'Syrup base', papers: 'Papers', seeds: 'Seeds', box: 'Carry box',\n"
    "  ice: 'Blue ice', pills: 'Pills', powder: 'Powder', crystal: 'Crystal', candy: 'Candy', syrup: 'Syrup', buds: 'Bud', joint: 'Joint' };\n"
    "const FX_NAME = { mellow: 'MELLOW', rush: 'RUSH', charm: 'CHARM', focus: 'FOCUS' };\n"
    "const FX_HEX = { mellow: 0x8fe07a, rush: 0x4f9bff, charm: 0xff7ac8, focus: 0xffe27a };\n"
    "const STOP = ['SHOP', 'CELLAR', 'STREET'];")
rep("  buds: [0.17, 0.07, 0.25], joint: [0.03, 0.02, 0.21], ice: [0.17, 0.07, 0.25], pills: [0.10, 0.17, 0.10], powder: [0.17, 0.07, 0.25],",
    "  buds: [0.09, 0.07, 0.10], joint: [0.03, 0.02, 0.21], ice: [0.17, 0.07, 0.25], pills: [0.10, 0.17, 0.10], powder: [0.17, 0.07, 0.25],\n"
    "  green: [0.23, 0.31, 0.11], yellow: [0.19, 0.36, 0.07], crystal: [0.17, 0.07, 0.25], candy: [0.10, 0.17, 0.10], syrup: [0.07, 0.13, 0.07], way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24],")
rep("const USE_KINDS = new Set(['button', 'grinder', 'elevator', 'drinks', 'stash', 'bench']);", "const USE_KINDS = new Set(['button', 'grinder', 'elevator', 'drinks', 'stash', 'bench', 'shutter', 'way']);")

# ───── levels: the shop, the cellar and the blocks of the street ─────
rep("  const lvl = v => (typeof v === 'number' && v > 0 ? Math.min(3, v | 0) : v === '1' ? 1 : 0);\n  let nLevels = Math.max(1, Math.min(4, start.levels | 0 || 1));",
    "  const lvl = v => (typeof v === 'number' && v > 0 ? Math.min(7, v | 0) : v === '1' ? 1 : 0);\n  let nLevels = Math.max(1, Math.min(8, start.levels | 0 || 1));\n"
    "  const street = Array.isArray(start.street) ? start.street : [];      // the blocks of the street: { level, name, wants, bonus }\n"
    "  const blockOf = lv => street.find(b => b.level === lv) || null;\n"
    "  const GOALS = start.goals || {}, FXOF = (start.fx && start.fx.of) || {};")
rep("    if (def.kind === 'sign') continue;                  // табла по стените няма",
    "    if (def.kind === 'sign') continue;                  // табла по стените няма\n"
    "    if (def.kind === 'elevator' && stations.some(q => q.kind === 'elevator')) continue;      // one cabin: it is the same on every stop")
rep("      sl.on = sl.level === 0;", "      sl.on = sl.level === 0;\n      sl.spot = kind === 'spot'; sl.spotOn = false;      // a buyer's hand in the street: a place only while he waits there")
rep("  const bins = stations.filter(s => s.kind === 'bin'), useStations = stations.filter(s => USE_KINDS.has(s.kind));",
    "  const bins = stations.filter(s => s.kind === 'bin'), useStations = stations.filter(s => USE_KINDS.has(s.kind) && (s.kind !== 'shutter' || s.btn));\n"
    "  // the lever of the shop: it stands on the counter where the rules put the OPEN button; the hand goes to its handle\n"
    "  const shutSt = stations.find(s => s.kind === 'shutter' && s.btn) || null;\n"
    "  let lever = null;\n"
    "  if (shutSt) {\n"
    "    try { lever = kit.make('lever', { theme }); } catch { lever = null; }\n"
    "    if (lever) { lever.position.set(shutSt.btn.x, shutSt.btn.y, shutSt.btn.z); lever.rotation.y = shutSt.yaw; stationL[0].add(lever); shutSt.btn.y += 0.2; }\n"
    "  }\n"
    "  const ways = stations.filter(s => s.kind === 'way');\n"
    "  for (const w of ways) { const d = (start.stations || []).find(q => q.id === w.id); w.to = d ? d.to | 0 : 0; }")

# ───── the screens ─────
rep("  const UI = { g: null, tex: null, W: 1024, H: 584, tab: 'store', key: '', at: 0, hover: { l: -1, r: -1 }, on: { l: false, r: false }, buttons: [], list: [],\n"
    "    money: 0, clock: 0, phase: 'tutorial', patrol: null };",
    "  const UI = { g: null, tex: null, W: 1024, H: 584, tab: 'store', key: '', at: 0, hover: { l: -1, r: -1 }, on: { l: false, r: false }, buttons: [], list: [],\n"
    "    money: 0, clock: 0, phase: 'tutorial', patrol: null, goal: '', shop: false, waiting: 0, fx: null, fxLeft: 0 };")
rep("""    for (const kind of ['ice', 'pills', 'powder']) {
      const r = R[kind]; if (!r) continue;
      const parts = r.ideal.map((v, i) => (v > 0 ? `${Math.round(v * 100)}% ${LIQ_WORD[i]}` : null)).filter(Boolean).join(' + ');
      out.push([NAME[kind].toUpperCase(), parts, `$${sell[kind] ?? ''}`]);
    }
    out.push(['BUD', `a plant in the shredder gives ${start.lab?.buds ?? 3}`, `$${sell.buds ?? ''}`]);
    out.push(['JOINT', 'papers put next to a bud', `$${sell.joint ?? ''}`]);""",
    """    for (const kind of Object.keys(R)) {
      const r = R[kind]; if (!r || !Array.isArray(r.ideal)) continue;
      const parts = r.ideal.map((v, i) => (v > 0 ? `${Math.round(v * 100)}% ${LIQ_WORD[i] || '?'}` : null)).filter(Boolean).join(' + ');
      out.push([(NAME[kind] || kind).toUpperCase(), parts, `$${sell[kind] ?? ''}`]);
    }
    out.push(['BUD', `a plant in the shredder gives ${start.lab?.buds ?? 3}`, `$${sell.buds ?? ''}`]);
    out.push(['JOINT', 'papers in one hand, a bud in the other: shake both', `$${sell.joint ?? ''}`]);""")
a = s.index("  function drawUI() {")
b = s.index("  const _po = new THREE.Vector3(), _pd = new THREE.Vector3()")
s = s[:a] + r'''  function drawUI() {
    const g = UI.g, W = UI.W, H = UI.H;
    if (!g) return;
    const night = UI.phase === 'night' || UI.phase === 'night2';
    const hov = i => i === UI.hover.l || i === UI.hover.r;
    g.fillStyle = '#14161a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f232b'; g.fillRect(0, 0, W, 84);
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = '#f2efe6'; g.textAlign = 'left'; g.font = `800 64px ${FONT_XC}`;
    g.fillText(dayText(UI.clock), 28, 46);
    g.textAlign = 'center'; g.font = `800 32px ${FONT_XC}`;
    const fxT = UI.fx ? `   ·   ${FX_NAME[UI.fx] || ''} ${Math.max(0, Math.ceil(UI.fxLeft))} s` : '';
    g.fillText((UI.phase === 'tutorial' ? 'TRAINING' : UI.phase === 'over' ? 'THE END' : night ? 'NIGHT  ·  THE CELLAR WORKS' : UI.shop ? `DAY  ·  SHOP OPEN  ·  ${UI.waiting} WAITING` : 'DAY  ·  SHOP SHUT') + fxT, W / 2 + 30, 46);
    g.textAlign = 'right'; g.font = `800 58px ${FONT_XC}`; g.fillStyle = '#c8f03c';
    g.fillText(`$${UI.money}`, W - 28, 46);
    // the one thing to do now
    g.fillStyle = '#c8f03c'; g.fillRect(0, 84, W, 48);
    g.fillStyle = '#14161a'; g.textAlign = 'left';
    let fs = 30;
    const line = `NOW:  ${UI.goal || ''}`;
    do { g.font = `800 ${fs}px ${FONT_XC}`; fs -= 2; } while (fs > 16 && g.measureText(line).width > W - 40);
    g.fillText(line, 20, 109);
    UI.buttons.length = 0;
    const box = (b, fill) => { const i = UI.buttons.length; UI.buttons.push(b); g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h); if (hov(i)) { g.lineWidth = 6; g.strokeStyle = '#c8f03c'; g.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6); } };
    const tab = (label, id, x) => {
      const sel = UI.tab === id;
      box({ x, y: 142, w: 232, h: 56, act: 'tab', id }, sel ? '#c8f03c' : '#2a2f38');
      g.fillStyle = sel ? '#14161a' : '#f2efe6'; g.textAlign = 'center'; g.font = `800 32px ${FONT_XC}`;
      g.fillText(label, x + 116, 171);
    };
    tab('STORE', 'store', 28); tab('RECIPES', 'recipes', 272); tab('CITY', 'city', 516); tab('HELP', 'help', 760);
    if (UI.tab === 'store') {
      storeList.forEach((it, i) => {
        const x = 28 + (i % 4) * 244, y = 212 + ((i / 4) | 0) * 184, [have, coming] = stockOf(it.kind), poor = UI.money < it.price;
        box({ x, y, w: 232, h: 172, act: 'buy', id: it.kind }, '#232830');
        g.textAlign = 'left'; g.fillStyle = '#f2efe6'; g.font = `800 34px ${FONT_XC}`;
        g.fillText(NAME[it.kind] || it.kind, x + 14, y + 34);
        g.font = `800 60px ${FONT_XC}`; g.fillStyle = poor ? '#f06a45' : '#c8f03c';
        g.fillText(`$${it.price}`, x + 14, y + 94);
        g.font = `700 24px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
        g.fillText(`on the rack: ${have}${coming ? `  +${coming} coming` : ''}`, x + 14, y + 144);
      });
    } else if (UI.tab === 'recipes') {
      let y = 228;
      for (const [name, how, pay] of recipeLines()) {
        g.textAlign = 'left'; g.fillStyle = '#c8f03c'; g.font = `800 32px ${FONT_XC}`; g.fillText(name, 34, y);
        g.fillStyle = '#f2efe6'; g.font = `700 29px ${FONT_XC}`; g.fillText(how, 240, y);
        g.textAlign = 'right'; g.fillStyle = '#c8f03c'; g.font = `800 32px ${FONT_XC}`; g.fillText(pay, W - 34, y);
        y += 43;
      }
    } else if (UI.tab === 'city') {
      let y = 232;
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
      g.fillText('By day: into the lift with the box, button STREET. Walk on at the post with the exit sign.', 34, y); y += 54;
      street.forEach((b, i) => {
        g.textAlign = 'left'; g.fillStyle = '#c8f03c'; g.font = `800 40px ${FONT_XC}`; g.fillText(`${i + 1}. ${String(b.name || '').toUpperCase()}`, 34, y);
        g.fillStyle = '#f2efe6'; g.font = `700 32px ${FONT_XC}`; g.fillText(`buys ${(b.wants || []).map(k => NAME[k] || k).join(', ')}`, 330, y);
        g.textAlign = 'right'; g.fillStyle = '#c8f03c'; g.font = `800 36px ${FONT_XC}`; g.fillText(b.bonus > 1 ? `pays x${b.bonus}` : 'usual price', W - 34, y);
        y += 66;
      });
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
      g.fillText('A buyer shows what he wants over his head. Hold the packet out to him.', 34, y + 6);
    } else {
      let y = 228;
      const rows = [
        ['NIGHT 00:00 to 08:00', 'the machines of the cellar run. Make product, pack it in the box.'],
        ['DAY 08:00 to 20:00', 'pull the lever on the counter to open the shop, or go and sell in the street.'],
        ['POUR', 'tilt the bottle over the mixer. One packet for every 50 ml. Shaken and exact: PURE.'],
        ['JOINT', 'smoke it (hold it to your mouth): customers wait twice as long.'],
        ['BLUE ICE, CRYSTAL', 'at the mouth: your machines run twice as fast.'],
        ['PILLS, CANDY', 'at the mouth: what you sell pays one and a half times.'],
        ['POWDER', 'at the mouth: your batches come out pure without shaking.'],
        ['SYRUP', 'at the mouth: customers wait twice as long, for longer.'],
      ];
      for (const [k, t] of rows) {
        g.textAlign = 'left'; g.fillStyle = '#c8f03c'; g.font = `800 28px ${FONT_XC}`; g.fillText(k, 34, y);
        g.fillStyle = '#f2efe6'; g.font = `700 27px ${FONT_XC}`; g.fillText(t, 300, y);
        y += 43;
      }
    }
    UI.tex.needsUpdate = true;
  }
''' + s[b:]
n += 1
rep("    const key = `${UI.tab}|${UI.phase}|${Math.floor(UI.clock / 10)}|${UI.money}|${pl}|${storeList.map(it => stockOf(it.kind).join('.')).join(',')}`;",
    "    const key = `${UI.tab}|${UI.phase}|${Math.floor(UI.clock / 10)}|${UI.money}|${pl}|${UI.goal}|${UI.shop ? 1 : 0}${UI.waiting}|${UI.fx ? UI.fx + Math.ceil(UI.fxLeft) : ''}|${storeList.map(it => stockOf(it.kind).join('.')).join(',')}`;")

# ───── labels: any number of liquids, bigger ones for the street ─────
rep("  function label(text, sub, x, y, z) {", "  function label(text, sub, x, y, z, k = 1) {")
rep("    L.sp.position.set(x, y, z);\n    L.sp.visible = true;", "    L.sp.position.set(x, y, z);\n    L.sp.scale.set(0.21 * k, 0.079 * k, 1);\n    L.sp.visible = true;")
rep("  const partsOf = (c, pct) => { const sum = c[0] + c[1] + c[2]; return c.map(",
    "  const sumOf = c => { let t = 0; for (let i = 0; i < c.length; i++) t += c[i] || 0; return t; };\n"
    "  const topOf = c => { let b = 0; for (let i = 1; i < c.length; i++) if ((c[i] || 0) > (c[b] || 0)) b = i; return b; };\n"
    "  const partsOf = (c, pct) => { const sum = sumOf(c); return c.map(")
rep("      const c = r.c || [1, 0, 0];\n      m.material.color.setHex(LIQ_HEX[c[0] >= c[1] && c[0] >= c[2] ? 0 : c[1] >= c[2] ? 1 : 2]);",
    "      const c = r.c || [1, 0, 0];\n      m.material.color.setHex(LIQ_HEX[topOf(c)] ?? LIQ_HEX[0]);")
rep("          const mix = st.view.mix || [0, 0, 0], sum = mix[0] + mix[1] + mix[2], t = st.taps[2];\n"
    "          if (sum >= 1) label(`${Math.round(sum)} ml`, partsOf(mix, true), t.x, t.y + 0.16, t.z);\n"
    "          else if (st.view.left > 0) label(`${st.view.left} more`, '', t.x, t.y + 0.16, t.z);",
    "          const mix = st.view.mix || [0, 0, 0], sum = sumOf(mix), t = st.taps[2];\n"
    "          if (sum >= 1) label(`${Math.round(sum)} ml`, partsOf(mix, true), t.x, t.y + 0.16, t.z);\n"
    "          else if (st.view.left > 0) label(`${st.view.left} more`, '', t.x, t.y + 0.16, t.z);\n"
    "          else if (st.view.on === false) label('ASLEEP', 'runs 00:00 to 08:00', t.x, t.y + 0.16, t.z);")
rep("    for (let i = labelN; i < labels.length; i++) labels[i].sp.visible = false;",
    """    if (!over) {
      // the lift: where each button of the cabin goes
      if (elev && elev.on && street.length && inCabin(ctx.head.pos) && !(elev.state && elev.state.moving)) {
        for (const b of elevBtns) { const to = destOf(b); if (b.inside && to != null) label(STOP[to] || '', '', b.rx, b.y + 0.14, b.rz); }
      }
      // the street: the name of this block and the time over the middle of the zone, what each post leads to
      if (myLevel >= 2) {
        const blk = blockOf(myLevel);
        label(dayText(UI.clock), `${blk ? String(blk.name).toUpperCase() : ''}  ·  $${UI.money}`, 0, 2.35, 0, 2.4);
        for (const w of ways) {
          if (!w.on) continue;
          const to = blockOf(w.to);
          label(w.to > myLevel ? 'ON' : 'BACK', to ? `${String(to.name).toUpperCase()}${to.bonus > 1 && w.to > myLevel ? `  pays x${to.bonus}` : ''}` : '', w.btn.x, w.btn.y + 0.62, w.btn.z, 1.7);
        }
        if (myLevel === 2 && cab) label('LIFT', 'PIZZERIA', cab.x, 2.25, cab.z + (cab.z < 0 ? cab.hd : -cab.hd), 1.7);
      } else if (shutSt && shutSt.on && UI.phase !== 'tutorial' && !(UI.phase === 'night' || UI.phase === 'night2')) {
        label(UI.shop ? 'OPEN' : 'SHUT', UI.shop ? 'pull to shut' : 'pull to open', shutSt.btn.x, shutSt.btn.y + 0.22, shutSt.btn.z);
      }
    }
    for (let i = labelN; i < labels.length; i++) labels[i].sp.visible = false;""")

# ───── the lift: where a button goes ─────
rep("  /** копчето, което ръка на това място би натиснала:",
    """  // The two buttons inside the cabin: with a street the cabin has three stops, so each button names one of the other two.
  let insideN = 0;
  for (const b of elevBtns) if (b.inside) b.idx = insideN++;
  function destOf(b) {
    if (!b || !b.inside || !street.length || insideN < 2) return null;
    const other = [0, 1, 2].filter(v => v !== Math.min(2, myLevel));
    return other[Math.min(1, b.idx | 0)];
  }
  /** копчето, което ръка на това място би натиснала:""")
rep("          ctx.send({ a: 'use', hand: k, station: elev.id });\n          H.spare = btn; H.press = 1; lastHand = k;",
    "          const eb = elevButton(h.pos.x, h.pos.y, h.pos.z), to = destOf(eb);\n"
    "          ctx.send(to == null ? { a: 'use', hand: k, station: elev.id } : { a: 'use', hand: k, station: elev.id, to });\n"
    "          H.spare = btn; H.press = 1; lastHand = k;")
rep("        ctx.send({ a: 'use', hand: k, station: T.st.id, control: T.control });\n        H.press = 1; lastHand = k;",
    "        const to = T.st === elev ? destOf(T.btn) : null;\n"
    "        ctx.send(to == null ? { a: 'use', hand: k, station: T.st.id, control: T.control } : { a: 'use', hand: k, station: T.st.id, to });\n"
    "        if (T.st.kind === 'way') fade = Math.max(fade, 0.6);\n"
    "        H.press = 1; lastHand = k;")

# ───── what the local player sees ─────
rep("    for (let i = 0; i < stations.length; i++) { const s = stations[i]; s.on = s.level < 0 || s.level === lv; }",
    "    for (let i = 0; i < stations.length; i++) { const s = stations[i]; s.on = s.level < 0 ? lv <= 2 : s.level === lv; }      // the cabin: at its three stops only\n"
    "    stationAll.visible = lv <= 2;\n"
    "    streetLine.visible = lv >= 2;\n"
    "    if (lv >= 2 || wasLevel >= 2) fade = 1;              // another place: the eyes open on it\n"
    "    if (lv >= 2 && lv !== wasLevel) arrived = now;\n"
    "    wasLevel = lv;")
rep("    custGroup.visible = lv === 0;\n", "")
rep("  /** какво вижда местният играч: едно ниво, сменя се в един кадър и нищо не се строи */",
    """  // The street: the edge of the zone is drawn on the ground (there are no walls to show it), a soft dark ball around the
  // head closes the eyes for a moment when the place changes, and tints the view a little while something taken works.
  const streetLine = new THREE.Group();
  streetLine.visible = false;
  group.add(streetLine);
  if (street.length) {
    const B = newBake(), col = lin(0xc8f03c);
    for (const r of rooms) for (const W of wallsOf(r)) {
      const Pt = (u, inn = 0) => [W.ox + W.dx * u + W.nx * inn, 0.012, W.oz + W.dz * u + W.nz * inn];
      const holes = [];
      for (const dr of roomDoors) {
        if ((dr.a !== r.id && dr.b !== r.id) || (dr.axis === 'x') !== (W.dx === 1)) continue;
        if (Math.abs((dr.x - W.ox) * W.nx + (dr.z - W.oz) * W.nz) > 0.12) continue;
        const u = (dr.x - W.ox) * W.dx + (dr.z - W.oz) * W.dz, half = (+dr.w || 0.9) / 2;
        holes.push([u - half, u + half]);
      }
      holes.sort((a, b) => a[0] - b[0]);
      let from = 0;
      const seg = (u0, u1) => { if (u1 - u0 > 0.01) quadTo(B.unlit, Pt(u0), Pt(u1), Pt(u1, 0.04), Pt(u0, 0.04), 0, 1, 0, col); };
      for (const h of holes) { seg(from, Math.max(from, h[0])); from = Math.max(from, Math.min(W.len, h[1])); }
      seg(from, W.len);
    }
    for (const part of finish(B).parts) streetLine.add(new THREE.Mesh(keep(part.geo), part.mat));
  }
  let fade = 0, wasLevel = 0, arrived = -9, myFx = null;
  const veilMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  const veil = new THREE.Mesh(keep(new THREE.SphereGeometry(0.3, 16, 10)), veilMat);
  veil.renderOrder = 50; veil.visible = false; veil.frustumCulled = false;
  group.add(veil);
  function updateVeil(dt) {
    fade = Math.max(0, fade - dt / 0.8);
    const wash = myFx ? 0.07 + 0.035 * Math.sin(now * 1.7) : 0;
    const a = Math.max(fade > 0 ? Math.min(1, fade * 1.6) : 0, wash);
    veil.visible = a > 0.004;
    if (!veil.visible) return;
    veil.position.copy(ctx.head.pos);
    veilMat.opacity = a;
    veilMat.color.setHex(fade > 0.05 ? 0x000000 : FX_HEX[myFx] || 0x000000);
  }

  /** какво вижда местният играч: едно ниво, сменя се в един кадър и нищо не се строи */""")

# ───── held things: a joint points where the hand points ─────
rep("    else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }\n    r.yaw = handYaw(h.quat, r.yaw);",
    "    else if (ROT_FLAT.has(r.kind) && h.quat) { r.x = p.x; r.y = p.y; r.z = p.z; r.hq = h.quat; r.flat = true; }\n"
    "    else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }\n    r.yaw = handYaw(h.quat, r.yaw);")
rep("      if (r.hq && (r.mode === M_MINE || r.mode === M_OTHER)) g.quaternion.copy(r.hq).multiply(QX); else g.rotation.set(0, r.yaw, 0);",
    "      if (r.hq && (r.mode === M_MINE || r.mode === M_OTHER)) { g.quaternion.copy(r.hq); if (!r.flat) g.quaternion.multiply(QX); } else g.rotation.set(0, r.yaw, 0);")

# ───── targets: a buyer's hand is a place only while he waits ─────
rep("        if (!s.on || (s.item != null && !s.sink) || !accepts(s, kind)) continue;\n        const dx = s.x - px, dy = s.y - py, dz = s.z - pz, d2 = dx * dx + dy * dy + dz * dz;\n        if (d2 <= bd) { bd = d2; best = s; }",
    "        if (!s.on || (s.item != null && !s.sink) || !accepts(s, kind) || (s.spot && !s.spotOn)) continue;\n        const dx = s.x - px, dy = s.y - py, dz = s.z - pz, d2 = dx * dx + dy * dy + dz * dz;\n        if (d2 <= bd) { bd = d2; best = s; }")
rep("          if (!s.on || (s.item != null && !s.sink) || !accepts(s, kind)) continue;\n          if (s === T.slot) slotRing(",
    "          if (!s.on || (s.item != null && !s.sink) || !accepts(s, kind) || (s.spot && !s.spotOn)) continue;\n          if (s === T.slot) slotRing(")
# the goal: marked in the room
rep("    for (let i = 0; i < itemList.length; i++) { const r = itemList[i]; if (r.hl !== r.v.hl) tint(r.v, r.hl); }\n    ringMesh.count = ringN;",
    "    for (let i = 0; i < itemList.length; i++) { const r = itemList[i]; if (r.hl !== r.v.hl) tint(r.v, r.hl); }\n    drawGoal();\n    ringMesh.count = ringN;")
rep("  function updateTargets() {",
    """  // ---------- the goal: one place in the room is marked, wherever the player stands ----------
  let goal = null, buyerList = [];
  /** Do I carry something to sell (in a hand, or a box with packets on my level)? */
  function carrying() {
    for (let i = 0; i < itemList.length; i++) {
      const r = itemList[i];
      if (r.kind === 'box' ? !(r.n && r.n.length) : !(r.kind in FXOF) && r.kind !== 'buds') continue;
      if (r.mode === M_MINE || (r.mode === M_FREE && r.on)) return true;
    }
    return false;
  }
  /** The text of the goal for where I stand. */
  function goalText() {
    if (myLevel >= 2) return carrying() ? GOALS.sell || '' : GOALS.home || '';
    return goal ? goal.text || '' : '';
  }
  const liftMark = to => {
    if (!elev) return null;
    if (inCabin(ctx.head.pos)) {
      for (const b of elevBtns) if (b.inside && (destOf(b) === to || (destOf(b) == null && b.idx === 0))) return { x: b.rx, y: b.y, z: b.rz, up: true };
      return null;
    }
    return cab ? { x: cab.x, y: 0.02, z: cab.z, r: 0.34 } : { x: elev.x, y: 0.02, z: elev.z, r: 0.34 };
  };
  function goalMark() {
    if (over) return null;
    if (myLevel >= 2) {
      let best = null, bd = Infinity;
      const has = carrying();
      if (has) for (const b of buyerList) {
        if (b.level !== myLevel || b.state !== 'wait' || !b.hand) continue;
        const d = Math.hypot(b.hand.x - ctx.head.pos.x, b.hand.z - ctx.head.pos.z);
        if (d < bd) { bd = d; best = { x: b.hand.x, y: b.hand.y - 0.02, z: b.hand.z, r: 0.14 }; }
      }
      if (best) return best;
      const w = ways.find(q => q.on && (has ? q.to > myLevel : q.to < myLevel)) || (has ? null : ways.find(q => q.on && q.to < myLevel));
      if (w && (has || myLevel > 2)) return { x: w.btn.x, y: w.btn.y, z: w.btn.z, r: 0.16 };
      return myLevel === 2 && !has ? liftMark(0) : null;
    }
    if (!goal) return null;
    const st = goal.station === 'elevator' ? elev : stationByKey.get(String(goal.station));
    if (!st) return null;
    if (st === elev) return typeof goal.to === 'number' && goal.to !== myLevel ? liftMark(goal.to) : null;
    if (st.level !== myLevel) return liftMark(st.level);
    if (st.btn) return { x: st.btn.x, y: st.btn.y, z: st.btn.z, r: 0.15 };
    return { x: st.x, y: st.y + st.h + 0.02, z: st.z, r: 0.2 };
  }
  function drawGoal() {
    const m = goalMark();
    if (!m) return;
    const w = 0.5 + 0.5 * Math.sin(now * 5);
    if (m.up) { ringUp(m.x, m.y, m.z, 0.11 + 0.03 * w, RING_ON); ringUp(m.x, m.y, m.z, 0.16 + 0.05 * w, RING_ON); return; }
    const r = m.r || 0.18;
    ring(m.x, m.y + 0.012, m.z, r * (1 + 0.25 * w), RING_ON);
    ring(m.x, m.y + 0.012, m.z, r * (1.5 + 0.35 * w), RING_ON);
    ring(m.x, m.y + 0.42 + 0.06 * w, m.z, 0.07, RING_ON);
  }

  function updateTargets() {""")

# ───── customers: the buyers of the street are drawn the same way, each on his level ─────
rep("        if (myLevel === 0) kit.setState(r.model, 'customer', r.view, dt);",
    "        r.model.visible = r.lv === myLevel;\n        if (r.lv === myLevel) kit.setState(r.model, 'customer', r.view, dt);")
rep("        const g = r.v.g;\n        g.position.set(x, y + fy, z); g.rotation.set(0, r.yaw + fall * 2.4, tilt);",
    "        const g = r.v.g;\n        g.visible = r.lv === myLevel;\n        g.position.set(x, y + fy, z); g.rotation.set(0, r.yaw + fall * 2.4, tilt);")
rep("      const show = (r.state === 'in' || r.state === 'wait') && r.okey !== 'order|none';", "      const show = (r.state === 'in' || r.state === 'wait') && r.okey !== 'order|none' && r.lv === myLevel;")
rep("      if (r.state === 'wait' && r.os > 0.5 && myLevel === 0 && bars + 2 <= BAR_N) {", "      if (r.state === 'wait' && r.os > 0.5 && r.lv === myLevel && bars + 2 <= BAR_N) {")
rep("    for (const c of snap.customers || []) {\n      let r = custs.get(c.id);",
    "    buyerList = Array.isArray(snap.buyers) ? snap.buyers : [];\n"
    "    for (let i = 0; i < slots.length; i++) if (slots[i].spot) slots[i].spotOn = false;\n"
    "    for (const b of buyerList) if (b.state === 'wait') { const st = stationByKey.get(String(b.spot)); if (st && st.slots[0]) st.slots[0].spotOn = true; }\n"
    "    const everybody = buyerList.length ? (snap.customers || []).concat(buyerList.map(b => ({ ...b, order: { kind: 'stuff', item: b.want }, lv: b.level, special: false, mark: false }))) : snap.customers || [];\n"
    "    for (const c of everybody) {\n      let r = custs.get(c.id);")
rep("          slide: c.state === 'in' && near ? 1 : 0, slideTo: 0, walk: 0, os: 0, seed: (c.id | 0) * 1.7, tall: 1.7,",
    "          slide: c.state === 'in' && near ? 1 : 0, slideTo: 0, walk: 0, os: 0, seed: (c.id | 0) * 1.7, tall: 1.7, lv: lvl(c.lv),")

# ───── events ─────
rep("      case 'patrol_warn': hud.flash();",
    """      case 'phase': {            // a new part of the day: felt in both hands, seen as two swells of light, said in front of the eyes
        if (over) break;
        hud.notify(); ctx.haptic('l', 0.9, 260); ctx.haptic('r', 0.9, 260);
        const t = UI.phase === 'day' || UI.phase === 'day2' ? '08:00  DAY' : UI.phase === 'night' || UI.phase === 'night2' ? '00:00  NIGHT' : '';
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (t && _v.lengthSq() > 1e-4) { _v.normalize(); pop(t, ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y + 0.02, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); }
        break;
      }
      case 'shop_open': case 'shop_shut':
        if (has) { puff(x, y, z, e.kind === 'shop_open' ? 0x7bd66a : 0xb9bcb0, 7, 0.4, 0.05, 0.6, 0.3); pop(e.kind === 'shop_open' ? 'OPEN' : 'SHUT', x, y + 0.2, z, '#c8f03c', true); }
        if (mine) ctx.haptic(lastHand, 0.8, 90); else if (myLevel === 0) { ctx.haptic('l', 0.3, 60); ctx.haptic('r', 0.3, 60); }
        break;
      case 'moved': if (mine) { ctx.haptic('l', 0.5, 80); ctx.haptic('r', 0.5, 80); } break;
      case 'high':
        if (has) puff(x, y - 0.05, z, 0xdfe6e0, 10, 0.35, 0.09, 1.4, 0.35);
        if (mine) { ctx.haptic('l', 0.7, 200); ctx.haptic('r', 0.7, 200); _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0; if (_v.lengthSq() > 1e-4) { _v.normalize(); pop(String(e.text || ''), ctx.head.pos.x + _v.x * 0.8, ctx.head.pos.y - 0.05, ctx.head.pos.z + _v.z * 0.8, '#c8f03c', false); } }
        break;
      case 'patrol_warn': hud.flash();""")

# ───── the snapshot ─────
rep("    UI.money = Math.round(+snap.money || 0); UI.clock = +snap.clock || 0; UI.phase = snap.phase; UI.patrol = snap.patrol || null;",
    "    UI.money = Math.round(+snap.money || 0); UI.clock = +snap.clock || 0; UI.phase = snap.phase; UI.patrol = snap.patrol || null;\n"
    "    UI.shop = !!snap.shop; UI.waiting = snap.waiting | 0; goal = snap.goal || null;\n"
    "    myFx = null; UI.fx = null; UI.fxLeft = 0;\n"
    "    if (Array.isArray(snap.players)) for (const q of snap.players) if (sameId(q.id, ctx.viewId ?? me.id) && q.fx) { myFx = UI.fx = q.fx.kind; UI.fxLeft = +q.fx.left || 0; }")
rep("        if (Array.isArray(c)) { const ml = c[0] + c[1] + c[2]; if (r.ml != null && ml < r.ml - 0.5) r.pourT = now; r.ml = ml; r.c = c; }",
    "        if (Array.isArray(c)) { const ml = sumOf(c); if (r.ml != null && ml < r.ml - 0.5) r.pourT = now; r.ml = ml; r.c = c; }")
rep("    hud.onSnapshot(snap);\n  }", "    UI.goal = goalText();\n    if (lever) lever.rotation.x = UI.shop ? 0.5 : 0;\n    hud.onSnapshot(myLevel >= 2 ? { ...snap, hint: UI.goal } : snap);\n  }")

# ───── the frame: shaking (a vessel, or papers and a bud), taking at the mouth, the veil ─────
rep("""      if (!it || it.kind !== 'blue' || it.shaken || h.active === false) { H.shN = 0; H.shId = null; H.shP.copy(h.pos); continue; }""",
    """      const oth = hand[HK[1 - j]].held;
      const roll = !!it && !!oth && ((it.kind === 'papers' && oth.kind === 'buds') || (it.kind === 'buds' && oth.kind === 'papers'));
      if (H.shDone && now - (H.shT || 0) > 1.0) { H.shDone = false; H.shN = 0; }      // refused or done: it may be tried again
      if (!it || !(roll || (LIQ.has(it.kind) && !it.shaken && (it.ml ?? 1) > 0)) || h.active === false) { H.shN = 0; H.shId = null; H.shP.copy(h.pos); continue; }""")
rep("    // станции със състояние\n    for (let i = 0; i < dyn.length; i++) {",
    """    // taking the product: held at the mouth for a moment (a joint smokes while it gets there)
    for (let j = 0; j < 2; j++) {
      const k = HK[j], H = hand[k], h = ctx.hands[k], it = H.held;
      if (!h || !it || !(it.kind in FXOF) || h.active === false || over) { H.eat = 0; H.eatSent = false; continue; }
      const mx = ctx.head.pos.x, my = ctx.head.pos.y - 0.07, mz = ctx.head.pos.z;
      const d = Math.hypot(h.pos.x - mx, h.pos.y - my, h.pos.z - mz);
      if (d > 0.25) { H.eat = 0; H.eatSent = false; continue; }
      H.eat = (H.eat || 0) + dt;
      if (now - (H.eatT || 0) > 0.16) {
        H.eatT = now;
        ctx.haptic(k, Math.min(1, 0.3 + H.eat), 40);
        if (it.kind === 'joint') puff(h.pos.x, h.pos.y + 0.03, h.pos.z, 0xdfe6e0, 2, 0.12, 0.05, 1.1, 0.3);
      }
      if (H.eat >= 0.7 && !H.eatSent) { H.eatSent = true; ctx.send({ a: 'consume', hand: k }); }
    }

    // станции със състояние
    for (let i = 0; i < dyn.length; i++) {""")
rep("    updateScreens();\n    updateLab();", "    updateScreens();\n    updateLab();\n    updateVeil(dt);\n"
    "    // arrived in the street: what to do there is said once in front of the eyes\n"
    "    if (arrived > 0 && now - arrived > 0.9) { arrived = -9; _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0; if (_v.lengthSq() > 1e-4) { _v.normalize(); const b = blockOf(myLevel); pop(b ? String(b.name).toUpperCase() : 'STREET', ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y + 0.05, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); } }")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('scene 1.3 patched,', n, 'edits')

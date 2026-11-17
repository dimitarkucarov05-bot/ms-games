"""The Back Room 1.2, client part A: the hanging monitor shows a clock, moods for the new phases, new models. Run from lobby-stage."""
import io


def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, s.count(a), a[:80])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


# ───── hud.js ─────
patch('public/play/games/backroom/hud.js', [
    ("{ tutorial: 'TRAINING', day: 'DAY', closing: 'DUSK', night: 'EVENING', rush: 'NIGHT SHIFT', raid: 'INSPECTION', over: 'THE END' }",
     "{ tutorial: 'TRAINING', night: 'NIGHT', day: 'DAY', night2: 'NIGHT', day2: 'DAY', raid: 'INSPECTION', over: 'THE END' }"),
    ("  rush: [0xe9dcff, 0x4b4660, 0.84, 0xffe2c4, 0.76],\n", "  rush: [0xe9dcff, 0x4b4660, 0.84, 0xffe2c4, 0.76],\n  night2: [0x9db8ff, 0x232a3a, 0.62, 0xa9c4ff, 0.44],\n  day2: [null, null, 1, null, 1],\n"),
    ("  const patrolWord = theme === 'kids' ? 'INSPECTOR' : 'PATROL';", "  const patrolWord = theme === 'kids' ? 'INSPECTOR' : 'POLICE';\n  // the clock of the game: minutes of the day, shown in steps of ten minutes\n  const dayText = min => { const m = Math.floor((((min % 1440) + 1440) % 1440) / 10) * 10; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };"),
    ("      const word = mode === 'warn' ? `${patrolWord} COMING` : 'HANDS OFF';\n      g.fillStyle = C.text;\n      fit(g, word, CW - 50, 150, 800, FONT_NUM);\n      g.fillText(word, CW / 2, 215);\n      g.font = `800 72px ${FONT_NUM}`;\n      g.fillText(clockText(sec), CW / 2, 322);",
     "      const word = mode === 'warn' ? `${patrolWord} IN ${clockText(Math.max(0, Math.ceil(S.patrolLeft || 0)))}` : `${patrolWord} HERE`;\n      g.fillStyle = C.text;\n      fit(g, word, CW - 50, 150, 800, FONT_NUM);\n      g.fillText(word, CW / 2, 215);\n      g.font = `800 60px ${FONT_NUM}`;\n      g.fillText(mode === 'warn' ? 'BOX TO THE CELLAR' : dayText(S.clock), CW / 2, 322);"),
    ("      g.font = `800 216px ${FONT_NUM}`;\n      g.fillText(clockText(sec), CW / 2, 224);", "      g.font = `800 200px ${FONT_NUM}`;\n      g.fillText(dayText(S.clock), CW / 2, 224);"),
    ("    S.patrol = snap.patrol ? snap.patrol.phase : null;\n", "    S.patrol = snap.patrol ? snap.patrol.phase : null;\n    S.patrolLeft = snap.patrol ? +snap.patrol.left || 0 : 0;\n    S.clock = typeof snap.clock === 'number' ? snap.clock : 0;\n"),
    ("    const sec = Math.max(0, Math.ceil(S.left)), urgent = S.left <= 10 && S.phase !== 'tutorial';", "    const sec = Math.floor((S.clock || 0) / 10) * 100 + (S.patrol === 'warn' ? Math.ceil(S.patrolLeft || 0) : 0), urgent = false;"),
    ("    S.showHint = !!S.hint && (S.phase === 'tutorial' || S.phase === 'closing' || time - (S.hintAt || 0) < 14);", "    S.showHint = !!S.hint && (S.phase === 'tutorial' || time - (S.hintAt || 0) < 16);"),
])

# ───── decor.js: night and sky for the second night and day ─────
patch('public/play/games/backroom/decor.js', [
    ("  const NIGHT = { closing: 1, night: 1, rush: 1, raid: 1, over: 1 };", "  const NIGHT = { closing: 1, night: 1, night2: 1, rush: 1, raid: 1, over: 1 };"),
    ("    night: tint(0.07, 0.10, 0.24), rush: tint(0.10, 0.13, 0.30),", "    night: tint(0.07, 0.10, 0.24), night2: tint(0.07, 0.10, 0.24), day2: tint(1, 1, 1), rush: tint(0.10, 0.13, 0.30),"),
])

# ───── synty-kinds.js ─────
patch('public/play/games/backroom/synty-kinds.js', [
    ("const GW_MAP = 'tex/PolygonGangWarfare_Texture_01_A.png';", "const GW_MAP = 'tex/PolygonGangWarfare_Texture_01_A.png';\nconst FARM = 'farm-pack', FARM_MAP = 'tex/PolygonFarm_Texture_01_A.png';"),
    ("    ...(theme === 'kids' ? [] : [s('Market_Freezer_03'), s('Blender_01'),\n",
     "    ...(theme === 'kids' ? [] : [s('Market_Freezer_03'), s('Blender_01'), s('Computer_TV_Wall_01'), [FARM, 'SM_Prop_SeedPacket_01'], [FARM, 'SM_Prop_Cabbage_01_S'], [GW, 'SM_Prop_Box_01'],\n"),
    ("  const BOWL = { white:", r'''  // 1.2: seeds are the original seed packet, a bud is a small green head from the Farm Pack, the carry box is the open
  // wooden box of the Gang Warfare Pack with what is packed in it lying inside, the big screen is the wall TV.
  const farm = model => { const [w, h, d] = A.info(FARM, model).size; return place(FARM, model, { w, h, d, fit: 'uniform', map: FARM_MAP }); };
  function makeBox() {
    const g = new THREE.Group();
    g.add(inst('box', () => natGW('Box_01')));
    const inside = new THREE.Group();
    g.add(inside);
    g.userData.box = { inside, key: '' };
    return g;
  }
  function setBox(obj, st) {
    const e = obj.userData.box; if (!e) return true;
    const n = Array.isArray(st.n) ? st.n : [], key = n.join(',');
    if (key === e.key) return true;
    e.key = key;
    e.inside.clear();
    n.slice(-3).forEach((kind, i) => {
      const m = make(kind, {});
      if (!m) return;
      m.position.set(-0.09 + i * 0.09, 0.025 + i * 0.012, 0);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.8);
      e.inside.add(m);
    });
    return true;
  }
  const makeScreen = () => inst('screen', () => { const [w, h, d] = A.info(SHOPS, 'SM_Prop_Computer_TV_Wall_01').size; return place(SHOPS, 'SM_Prop_Computer_TV_Wall_01', { w, h, d, fit: 'uniform', z: d / 2 }); });
  const BOWL = { white:'''),
    ("    plant: () => inst('plant', () => plantParts()), seeds: natGWItem('seeds', 'Bottle_Small_01'), papers:", "    plant: () => inst('plant', () => plantParts()), seeds: () => inst('seeds', () => farm('SM_Prop_SeedPacket_01')), papers:"),
    ("    buds: natGWItem('buds', 'ZipBag_Green_S_01'), joint:", "    buds: () => inst('buds', () => farm('SM_Prop_Cabbage_01_S')), box: makeBox, screen: makeScreen, joint:"),
    ("    blue: setBlue, ice: setIce, stash: setStash, grow: setGrow, bench: setBench,\n", "    blue: setBlue, ice: setIce, stash: setStash, grow: setGrow, bench: setBench, box: setBox,\n"),
    # the mixer now reports millilitres of blue, solvent and catalyst
    ("    const mix = Array.isArray(st.mix) ? st.mix : [], key = mix.slice().sort().join('+') + (mx ? '!' : '');\n    if (key !== e.key) {\n      e.key = key;\n      let col = null;\n      if (mix.length) {\n        const c = [0, 0, 0];\n        for (const k of mix) { const q = MIX_COL[k] || [0.5, 0.5, 0.5]; c[0] += q[0] / mix.length; c[1] += q[1] / mix.length; c[2] += q[2] / mix.length; }\n        col = new THREE.Color(c[0], c[1], c[2]).multiplyScalar(mx ? 0.9 : 0.5).getHex();\n      }",
     "    const mix = Array.isArray(st.mix) ? st.mix : [0, 0, 0], sum = (mix[0] || 0) + (mix[1] || 0) + (mix[2] || 0);\n    const key = sum > 0 ? `${Math.round(mix[0] / sum * 10)}:${Math.round(mix[1] / sum * 10)}:${mx ? 1 : 0}` : '';\n    if (key !== e.key) {\n      e.key = key;\n      let col = null;\n      if (sum > 0) {\n        const c = [0, 0, 0];\n        ['blue', 'clear', 'red'].forEach((k, i) => { const q = MIX_COL[k], f = (mix[i] || 0) / sum; c[0] += q[0] * f; c[1] += q[1] * f; c[2] += q[2] * f; });\n        col = new THREE.Color(c[0], c[1], c[2]).multiplyScalar(mx ? 0.9 : 0.5).getHex();\n      }"),
    ("      for (const [o, base] of e.mm) o.material = col == null ? base : tinted(base, `mix:${key}`, 0xffffff, col);", "      for (const [o, base] of e.mm) o.material = col == null ? base : tinted(base, `mix:${col}`, 0xffffff, col);"),
])
print('client A patched')

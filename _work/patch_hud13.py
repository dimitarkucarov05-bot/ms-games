"""The Back Room 1.3, the hanging monitor and the light (hud.js): the goal is always on the monitor, the street is daylight,
what the player has taken tints the light, a new phase is announced by two pulses of light. Run from lobby-stage."""
import io

p = 'public/play/games/backroom/hud.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


# monitors only in the shop and in the cellar: the street has none
rep("  let n = Math.max(1, Math.min(4, start.levels | 0 || 1));\n"
    "  for (const s of st) if (typeof s.level === 'number' && s.level > 0) n = Math.max(n, Math.min(4, (s.level | 0) + 1));",
    "  let n = Math.max(1, Math.min(2, start.levels | 0 || 1));\n"
    "  for (const s of st) if (typeof s.level === 'number' && s.level > 0) n = Math.max(n, Math.min(2, (s.level | 0) + 1));")
rep("RED = new THREE.Color(0xff3b30), COP_BLUE = new THREE.Color(0x2f6bff);",
    "RED = new THREE.Color(0xff3b30), COP_BLUE = new THREE.Color(0x2f6bff);\n"
    "  // what the player has taken: the light of the room leans to its colour and breathes slowly\n"
    "  const FX_COL = { mellow: new THREE.Color(0x8fe07a), rush: new THREE.Color(0x4f9bff), charm: new THREE.Color(0xff7ac8), focus: new THREE.Color(0xffe27a) };\n"
    "  const FX_WORD = { mellow: 'MELLOW', rush: 'RUSH', charm: 'CHARM', focus: 'FOCUS' };\n"
    "  const WHITE = new THREE.Color(0xffffff);")
rep("""      g.fillStyle = urgent ? C.warn : C.text;
      g.font = `800 200px ${FONT_NUM}`;
      g.fillText(dayText(S.clock), CW / 2, 224);
      if (S.showHint) {                               // какво се прави: в обучението през цялото време, после при всяка нова подсказка
        g.font = `600 28px ${FONT}`; g.fillStyle = C.dim;
        wrap(g, S.hint, CW - 40, 3).forEach((l, i) => g.fillText(l, CW / 2, 284 + i * 34));
      } else {
        g.font = `800 76px ${FONT_NUM}`; g.fillStyle = S.money < 0 ? C.bad : C.dim;
        g.fillText(moneyText(S.money), CW / 2, 322);
      }""", """      // the clock, the money (or what the player has taken and for how long), and under them the one thing to do now
      g.fillStyle = urgent ? C.warn : C.text;
      g.font = `800 150px ${FONT_NUM}`;
      g.fillText(dayText(S.clock), CW / 2, 150);
      g.font = `800 58px ${FONT_NUM}`;
      if (S.fx) { g.fillStyle = '#c8f03c'; g.fillText(`${FX_WORD[S.fx] || ''} ${clockText(Math.max(0, Math.ceil(S.fxLeft)))}`, CW / 2, 216); }
      else { g.fillStyle = S.money < 0 ? C.bad : C.dim; g.fillText(moneyText(S.money), CW / 2, 216); }
      if (S.hint) {
        g.font = `700 30px ${FONT}`; g.fillStyle = C.text;
        wrap(g, S.hint, CW - 36, 4).forEach((l, i) => g.fillText(l, CW / 2, 262 + i * 34));
      }""")
rep("    S.result = snap.result || null;\n  }",
    "    S.result = snap.result || null;\n"
    "    S.fx = null; S.fxLeft = 0;\n"
    "    if (snap.players) for (const p of snap.players) if (String(p.id) === String(ctx.viewId ?? ctx.me?.id) && p.fx) { S.fx = p.fx.kind; S.fxLeft = +p.fx.left || 0; }\n"
    "  }")
rep("    const key = `${over ? 'r' : ''}|${mode}|${sec}|${urgent}|${S.money}|${S.showHint ? S.hint : ''}|${Math.round(S.susp * 40)}`;",
    "    const key = `${over ? 'r' : ''}|${mode}|${sec}|${urgent}|${S.money}|${S.hint}|${Math.round(S.susp * 40)}|${S.fx ? S.fx + Math.ceil(S.fxLeft) : ''}`;")
rep("    const m = S.level > 0 && S.phase !== 'over' ? LAB_MOOD : MOODS[S.phase] || MOODS.day;",
    "    const m = S.level === 1 && S.phase !== 'over' ? LAB_MOOD : MOODS[S.phase] || MOODS.day;")
rep("    if (S.flash > 0) { env.hemi.color.lerp(RED, S.flash * 0.7); hemiI += S.flash * L0.hemi * 0.3; }",
    "    if (S.flash > 0) { env.hemi.color.lerp(RED, S.flash * 0.7); hemiI += S.flash * L0.hemi * 0.3; }\n"
    "    // a new part of the day: the light swells twice (seen on every floor)\n"
    "    if (S.ping > 0) { S.ping = Math.max(0, S.ping - dt * 0.7); const w = Math.max(0, Math.sin(S.ping * Math.PI * 2 * 2)); env.hemi.color.lerp(WHITE, w * 0.5); hemiI += w * L0.hemi * 0.55; }\n"
    "    // taken something: the room leans to its colour, slowly breathing; it fades in and out\n"
    "    S.fxK = (S.fxK || 0) + ((S.fx ? 1 : 0) - (S.fxK || 0)) * (1 - Math.exp(-dt * 1.5));\n"
    "    if (S.fx) S.fxCol = FX_COL[S.fx] || WHITE;\n"
    "    if (S.fxK > 0.01 && S.fxCol) { const b = 0.36 + 0.14 * Math.sin(time * 1.7); env.hemi.color.lerp(S.fxCol, b * S.fxK); env.dir.color.lerp(S.fxCol, b * 0.6 * S.fxK); }")
rep("    flash() { S.flash = 1; },", "    flash() { S.flash = 1; },\n    /** a new part of the day begins: two swells of light */\n    notify() { S.ping = 1; },")
rep("""      const i = Math.max(0, Math.min(lay.levels.length - 1, lv | 0));
      S.level = i;""", """      const i = Math.max(0, lv | 0);                  // 0 the shop, 1 the cellar, 2 and up the street (no monitor there)
      S.level = i;""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('hud 1.3 patched')

"""The Back Room 1.2, client part D: no square sparks for the police; the room light pulses red and blue instead. Run from lobby-stage."""
import io


def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, s.count(a), a[:80])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('public/play/games/backroom/scene.js', [
    ("    // the police: in the minute before they come both hands tick (faster in the last ten seconds); while they look,\n"
     "    // red and blue light flashes over the customers' side of the counter\n"
     "    if (UI.patrol && UI.patrol.phase) {\n"
     "      const warn = UI.patrol.phase === 'warn', gap = warn ? ((+UI.patrol.left || 0) < 10 ? 0.5 : 2) : 0.35;\n"
     "      if (now - copT > gap) {\n"
     "        copT = now; copN++;\n"
     "        if (warn) { ctx.haptic('l', 0.35, 40); ctx.haptic('r', 0.35, 40); }\n"
     "        else if (myLevel === 0) for (const q of seats) flash(q.x, 1.9, q.z, copN % 2 ? 0xff3b30 : 0x3b6cff, 0.9, 0.3);\n"
     "      }\n"
     "    }\n",
     "    // the police: in the minute before they come both hands tick (faster in the last ten seconds); the light is the hud's part\n"
     "    if (UI.patrol && UI.patrol.phase === 'warn') {\n"
     "      const gap = (+UI.patrol.left || 0) < 10 ? 0.5 : 2;\n"
     "      if (now - copT > gap) { copT = now; ctx.haptic('l', 0.35, 40); ctx.haptic('r', 0.35, 40); }\n"
     "    }\n"),
    ("  let snapN = 0, over = false, buzzT = 0, copT = 0, copN = 0;", "  let snapN = 0, over = false, buzzT = 0, copT = 0;"),
])
patch('public/play/games/backroom/hud.js', [
    ("RED = new THREE.Color(0xff3b30);", "RED = new THREE.Color(0xff3b30), COP_BLUE = new THREE.Color(0x2f6bff);"),
    ("      env.hemi.color.lerp(P_SKY, p); env.hemi.groundColor.lerp(P_GROUND, p); env.dir.color.lerp(P_SUN, p);",
     "      env.hemi.color.lerp(P_SKY, p); env.hemi.groundColor.lerp(P_GROUND, p); env.dir.color.lerp(P_SUN, p);\n"
     "      // the car's lights outside: the room breathes red, then blue (a soft pulse, never a hard strobe)\n"
     "      const cop = Math.sin(time * 6.5);\n"
     "      env.hemi.color.lerp(cop > 0 ? RED : COP_BLUE, 0.5 * p * Math.abs(cop));"),
])
print('client D patched')

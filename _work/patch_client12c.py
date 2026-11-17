"""The Back Room 1.2, client part C: the police are felt and seen (hands tick during the warning, red and blue light while they look). Run from lobby-stage."""
import io

p = 'public/play/games/backroom/scene.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:80])
    s = s.replace(a, b)


rep("  let snapN = 0, over = false, buzzT = 0;", "  let snapN = 0, over = false, buzzT = 0, copT = 0, copN = 0;")
rep("      case 'caught':\n",
    "      case 'patrol_warn': hud.flash(); ctx.haptic('l', 1, 300); ctx.haptic('r', 1, 300); break;\n"
    "      case 'patrol_on': hud.flash(); ctx.haptic('l', 0.8, 180); ctx.haptic('r', 0.8, 180); break;\n"
    "      case 'caught':\n")
rep("      hud.setRide(inside);\n    }\n",
    "      hud.setRide(inside);\n    }\n\n"
    "    // the police: in the minute before they come both hands tick (faster in the last ten seconds); while they look,\n"
    "    // red and blue light flashes over the customers' side of the counter\n"
    "    if (UI.patrol && UI.patrol.phase) {\n"
    "      const warn = UI.patrol.phase === 'warn', gap = warn ? ((+UI.patrol.left || 0) < 10 ? 0.5 : 2) : 0.35;\n"
    "      if (now - copT > gap) {\n"
    "        copT = now; copN++;\n"
    "        if (warn) { ctx.haptic('l', 0.35, 40); ctx.haptic('r', 0.35, 40); }\n"
    "        else if (myLevel === 0) for (const q of seats) flash(q.x, 1.9, q.z, copN % 2 ? 0xff3b30 : 0x3b6cff, 0.9, 0.3);\n"
    "      }\n"
    "    }\n")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('client C patched')

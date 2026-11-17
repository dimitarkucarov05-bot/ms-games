"""The Back Room 1.4, the scene (scene.js): main menu and pause menu (wall screens and a panel in front of the eyes),
UPGRADES and CAREER tabs, pause on X / Y of the left controller (P on the desktop page), dealers' shelves, the press,
the big carry box that gives the packet under the hand. Run from lobby-stage."""
import io

p = 'public/play/games/backroom/scene.js'
s = io.open(p, encoding='utf-8').read()
n = 0


def rep(a, b, count=1):
    global s, n
    assert s.count(a) == count, (s.count(a), a[:100])
    s = s.replace(a, b)
    n += 1


rep("  green: [0.23, 0.31, 0.11], yellow: [0.19, 0.36, 0.07], crystal: [0.17, 0.07, 0.25], candy: [0.10, 0.17, 0.10], syrup: [0.07, 0.13, 0.07], way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24],",
    "  green: [0.23, 0.31, 0.11], yellow: [0.19, 0.36, 0.07], crystal: [0.17, 0.07, 0.25], candy: [0.10, 0.17, 0.10], syrup: [0.07, 0.13, 0.07], way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24],\n"
    "  brick: [0.39, 0.35, 0.28],")
rep("  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40], box: [0.35, 0.12, 0.22], screen: [1.55, 0.98, 0.10],",
    "  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40], box: [0.55, 0.29, 0.31], screen: [1.55, 0.98, 0.10],")
rep("  ice: 'Blue ice', pills: 'Pills', powder: 'Powder', crystal: 'Crystal', candy: 'Candy', syrup: 'Syrup', buds: 'Bud', joint: 'Joint' };",
    "  ice: 'Blue ice', pills: 'Pills', powder: 'Powder', crystal: 'Crystal', candy: 'Candy', syrup: 'Syrup', buds: 'Bud', joint: 'Joint', brick: 'Brick', tray: 'Tray' };\n"
    "/** where packet i lies in the carry box (the same grid as BOX_CELL of synty-kinds.js) */\n"
    "const BOX_CELL = i => [(-2 + (i % 5)) * 0.1, 0.045, (-1 + Math.floor(i / 5) % 3) * 0.088];")

# ───── the career on the client ─────
rep("  const GOALS = start.goals || {}, FXOF = (start.fx && start.fx.of) || {};",
    "  const GOALS = start.goals || {}, FXOF = (start.fx && start.fx.of) || {};\n"
    "  const CAREER = start.career || null;                // the career: the upgrades, the ranks, what needs what\n"
    "  const hasU = id => !CAREER || !!(UI.career && UI.career.unlocked && UI.career.unlocked.includes(id));\n"
    "  const hasAnyU = list => !list || list.some(hasU);")
rep("    money: 0, clock: 0, phase: 'tutorial', patrol: null, goal: '', shop: false, waiting: 0, fx: null, fxLeft: 0 };",
    "    money: 0, clock: 0, phase: 'tutorial', patrol: null, goal: '', shop: false, waiting: 0, fx: null, fxLeft: 0,\n"
    "    career: null, mode: '', page: -1, confirm: false, ckey: '', float: null };")
# the floating panel for the menus
rep("        UI.list.push({ lv, cx, cy, cz, nx, nz, rx: Math.cos(yaw), rz: -Math.sin(yaw), w: PW, h: PH, dots });\n      }\n",
    "        UI.list.push({ lv, cx, cy, cz, nx, nz, rx: Math.cos(yaw), rz: -Math.sin(yaw), w: PW, h: PH, dots });\n      }\n"
    "      if (CAREER) {      // the main menu and the pause menu also float in front of the eyes, over everything\n"
    "        const fmat = keep(new THREE.MeshBasicMaterial({ map: UI.tex, toneMapped: false, depthTest: false, transparent: true }));\n"
    "        const fdot = keep(new THREE.MeshBasicMaterial({ color: 0xc8f03c, toneMapped: false, depthTest: false }));\n"
    "        const fw = 1.1, plane = new THREE.Mesh(keep(new THREE.PlaneGeometry(fw, fw * UI.H / UI.W)), fmat);\n"
    "        plane.renderOrder = 60; plane.visible = false; plane.frustumCulled = false;\n"
    "        group.add(plane);\n"
    "        const dots = HK.map(() => { const m = new THREE.Mesh(dotGeo, fdot); m.visible = false; m.renderOrder = 61; m.frustumCulled = false; group.add(m); return m; });\n"
    "        UI.float = { float: true, plane, lv: -1, cx: 0, cy: 0, cz: 0, nx: 0, nz: 1, rx: 1, rz: 0, w: fw, h: fw * UI.H / UI.W, dots };\n"
    "        UI.list.push(UI.float);\n"
    "      }\n")
rep("        if (sc.lv !== myLevel) continue;", "        if (sc.float ? !sc.plane.visible : sc.lv !== myLevel) continue;")
rep("      for (const sc of UI.list) { const dot = sc.dots[j]; dot.visible = sc === scr; if (sc === scr) dot.position.set(hx, hy, hz); }",
    "      for (const sc of UI.list) { const dot = sc.dots[j]; dot.visible = sc === scr; if (sc === scr) { dot.position.set(hx, hy, hz); if (sc.float) dot.rotation.y = Math.atan2(sc.nx, sc.nz); } }")
rep("    const key = `${UI.tab}|${UI.phase}|", "    const key = `${UI.mode}|${UI.ckey}|${UI.page}|${UI.confirm}|${UI.tab}|${UI.phase}|")
# recipes: locked ones say so
rep("      out.push([(NAME[kind] || kind).toUpperCase(), parts, `$${sell[kind] ?? ''}`]);",
    "      out.push([(NAME[kind] || kind).toUpperCase(), parts, CAREER && !(CAREER.needs[kind] || []).every(hasU) ? 'LOCKED' : `$${sell[kind] ?? ''}`]);")
rep("    out.push(['BUD', `a plant in the shredder gives ${start.lab?.buds ?? 3}`, `$${sell.buds ?? ''}`]);\n"
    "    out.push(['JOINT', 'papers in one hand, a bud in the other: shake both', `$${sell.joint ?? ''}`]);",
    "    const cel = CAREER && !hasU('cellar') ? 'LOCKED' : null;\n"
    "    out.push(['BUD', `a plant in the shredder gives ${start.lab?.buds ?? 3}`, cel || `$${sell.buds ?? ''}`]);\n"
    "    out.push(['JOINT', 'papers in one hand, a bud in the other: shake both', cel || `$${sell.joint ?? ''}`]);\n"
    "    if (CAREER) out.push(['BRICK', 'three packets of one kind on a tray, on the press', hasU('press') ? 'x3 x1.6' : 'LOCKED']);")

# ───── drawUI: the menus, six tabs, the upgrades and the career ─────
a = s.index("  function drawUI() {")
b = s.index("  const _po = new THREE.Vector3(), _pd = new THREE.Vector3()")
s = s[:a] + r'''  const money$ = v => `$${Math.round(v).toLocaleString('en-US')}`;
  const rankName = i => (CAREER && CAREER.ranks[i] ? CAREER.ranks[i].name : '');
  function wrapText(g, text, maxW) {
    const words = String(text).split(' '), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (!cur || g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    return lines;
  }
  /** The main menu and the pause menu: big buttons, the same canvas on the wall screens and on the panel in front of the eyes. */
  function drawMenu(g, W, H, box) {
    const C = UI.career || {}, sv = C.save;
    g.fillStyle = '#c8f03c'; g.textAlign = 'center'; g.font = `800 76px ${FONT_XC}`;
    g.fillText('THE BACK ROOM', W / 2, 72);
    g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
    const big = (y, h, label, sub, act, id, fill = '#232830') => {
      box({ x: 160, y, w: W - 320, h, act, id }, fill);
      g.textAlign = 'center'; g.fillStyle = fill === '#c8f03c' ? '#14161a' : '#f2efe6'; g.font = `800 ${sub ? 50 : 54}px ${FONT_XC}`;
      g.fillText(label, W / 2, y + (sub ? h * 0.38 : h / 2));
      if (sub) { g.font = `700 28px ${FONT_XC}`; g.fillStyle = fill === '#c8f03c' ? '#2b3a10' : '#9aa0a8'; g.fillText(sub, W / 2, y + h * 0.74); }
    };
    if (UI.mode === 'menu') {
      g.fillText(C.key ? `Career of ${C.key}` : 'Pizzeria by day, the cellar by night', W / 2, 126);
      if (sv) {
        big(170, 150, 'CONTINUE', `Day ${sv.day}  ·  ${money$(sv.money)}  ·  ${rankName(sv.rank)}`, 'menu', 'continue', '#c8f03c');
        big(345, 110, UI.confirm ? 'SURE? IT DELETES THE SAVE' : 'NEW CAREER', UI.confirm ? 'pull the trigger again to start over' : '', 'newcareer', 'new', UI.confirm ? '#8a1f1a' : '#232830');
      } else big(190, 170, 'NEW CAREER', 'Day 1 with $40 and a small pizzeria', 'menu', 'new', '#c8f03c');
      g.textAlign = 'center'; g.fillStyle = '#9aa0a8'; g.font = `700 26px ${FONT_XC}`;
      g.fillText('Point at a button with your hand and pull the trigger.  Pause in the game: X or Y on the left controller.', W / 2, H - 40);
    } else {
      g.fillText(`Paused  ·  Day ${C.day || 1}  ·  ${money$(UI.money)}  ·  ${rankName(C.rank || 0)}`, W / 2, 126);
      big(170, 150, 'RESUME', 'back to the game', 'menu', 'resume', '#c8f03c');
      big(345, 110, 'SAVE AND QUIT', 'the career waits for you in the main menu', 'menu', 'quit');
      g.textAlign = 'center'; g.fillStyle = '#9aa0a8'; g.font = `700 26px ${FONT_XC}`;
      g.fillText('The game also saves by itself at 08:00 and at 00:00.', W / 2, H - 40);
    }
  }
  function drawUpgrades(g, W, H, box) {
    const list = CAREER.unlocks, C = UI.career || {}, own = new Set(C.unlocked || []), rank = C.rank || 0, per = 8;
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (UI.page < 0) { const first = list.findIndex(u => !own.has(u.id)); UI.page = Math.max(0, Math.floor(Math.max(0, first) / per)); }
    UI.page = Math.min(pages - 1, UI.page);
    list.slice(UI.page * per, UI.page * per + per).forEach((u, i) => {
      const x = 24 + (i % 4) * 246, y = 206 + ((i / 4) | 0) * 160, owned = own.has(u.id), low = rank < u.rank, poor = UI.money < u.price;
      const card = { x, y, w: 234, h: 150, act: 'unlock', id: u.id };
      if (owned || low) { g.fillStyle = owned ? '#1c2a1a' : '#1a1d22'; g.fillRect(card.x, card.y, card.w, card.h); } else box(card, '#232830');
      g.textAlign = 'left'; g.fillStyle = owned ? '#7bd66a' : low ? '#6b7178' : '#f2efe6'; g.font = `800 27px ${FONT_XC}`;
      wrapText(g, u.name, 210).slice(0, 2).forEach((l, k) => g.fillText(l, x + 12, y + 28 + k * 28));
      g.font = `800 44px ${FONT_XC}`;
      g.fillStyle = owned ? '#7bd66a' : low ? '#6b7178' : poor ? '#f06a45' : '#c8f03c';
      g.fillText(owned ? 'OWNED' : money$(u.price), x + 12, y + 108);
      g.font = `700 22px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
      g.fillText(owned ? '' : low ? `needs rank: ${rankName(u.rank)}` : poor ? 'not enough money yet' : 'pull the trigger to buy', x + 12, y + 138);
    });
    const nav = (label, x, id, on) => { if (on) box({ x, y: 532, w: 150, h: 44, act: 'page', id }, '#2a2f38'); g.textAlign = 'center'; g.fillStyle = on ? '#f2efe6' : '#4a4f58'; g.font = `800 28px ${FONT_XC}`; g.fillText(label, x + 75, 555); };
    nav('< BACK', 24, UI.page - 1, UI.page > 0);
    nav('MORE >', W - 174, UI.page + 1, UI.page < pages - 1);
    g.textAlign = 'center'; g.fillStyle = '#9aa0a8'; g.font = `700 26px ${FONT_XC}`;
    g.fillText(`page ${UI.page + 1} of ${pages}  ·  rank ${rankName(rank)}`, W / 2, 555);
  }
  function drawCareer(g, W, H, box) {
    const C = UI.career || {}, R = CAREER.ranks, r = C.rank || 0, next = R[r + 1];
    g.textAlign = 'left'; g.fillStyle = '#f2efe6'; g.font = `800 40px ${FONT_XC}`;
    g.fillText(`DAY ${C.day || 1}   ·   ${rankName(r).toUpperCase()}`, 28, 232);
    g.font = `700 26px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
    g.fillText(next ? `earned ${money$(C.earned || 0)}  ·  next rank ${next.name} at ${money$(next.at)}` : `earned ${money$(C.earned || 0)}  ·  the top rank`, 28, 270);
    const f = next ? Math.max(0, Math.min(1, ((C.earned || 0) - R[r].at) / (next.at - R[r].at))) : 1;
    g.fillStyle = '#2a2f38'; g.fillRect(28, 288, W - 56, 14); g.fillStyle = '#c8f03c'; g.fillRect(28, 288, (W - 56) * f, 14);
    g.fillStyle = '#c8f03c'; g.font = `800 30px ${FONT_XC}`; g.fillText('GOALS OF THE DAY', 28, 340);
    (C.goals || []).forEach((q, i) => {
      const y = 380 + i * 40;
      g.textAlign = 'left'; g.fillStyle = q.done ? '#7bd66a' : '#f2efe6'; g.font = `700 29px ${FONT_XC}`;
      g.fillText(`${q.done ? 'DONE  ' : ''}${q.text}`, 28, y);
      g.textAlign = 'right'; g.fillStyle = q.done ? '#7bd66a' : '#c8f03c';
      g.fillText(q.done ? `+${money$(q.bonus)}` : `${q.have} / ${q.n}   +${money$(q.bonus)}`, W - 230, y);
    });
    const ds = (C.dealers || []).filter(d => d.hired);
    g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 25px ${FONT_XC}`;
    g.fillText(ds.length ? `Dealers: ${ds.map(d => `${d.name} ${d.left} to sell`).join('  ·  ')}` : 'Dealers: none hired yet (UPGRADES)', 28, 520);
    box({ x: W - 210, y: 360, w: 182, h: 100, act: 'menu', id: 'pause' }, '#2a2f38');
    g.textAlign = 'center'; g.fillStyle = '#f2efe6'; g.font = `800 34px ${FONT_XC}`; g.fillText('PAUSE', W - 119, 410);
  }
  function drawUI() {
    const g = UI.g, W = UI.W, H = UI.H;
    if (!g) return;
    const night = UI.phase === 'night' || UI.phase === 'night2';
    const hov = i => i === UI.hover.l || i === UI.hover.r;
    g.fillStyle = '#14161a'; g.fillRect(0, 0, W, H);
    UI.buttons.length = 0;
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    const box = (b, fill) => { const i = UI.buttons.length; UI.buttons.push(b); g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h); if (hov(i)) { g.lineWidth = 6; g.strokeStyle = '#c8f03c'; g.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6); } };
    if (UI.mode) { drawMenu(g, W, H, box); UI.tex.needsUpdate = true; return; }
    g.fillStyle = '#1f232b'; g.fillRect(0, 0, W, 84);
    g.fillStyle = '#f2efe6'; g.textAlign = 'left'; g.font = `800 64px ${FONT_XC}`;
    g.fillText(dayText(UI.clock), 28, 46);
    g.textAlign = 'center'; g.font = `800 32px ${FONT_XC}`;
    const fxT = UI.fx ? `   ·   ${FX_NAME[UI.fx] || ''} ${Math.max(0, Math.ceil(UI.fxLeft))} s` : '';
    const dayN = CAREER && UI.career ? `DAY ${UI.career.day}  ·  ` : '';
    g.fillText(dayN + (UI.phase === 'tutorial' ? 'TRAINING' : UI.phase === 'over' ? 'THE END' : night ? 'NIGHT  ·  THE CELLAR WORKS' : UI.shop ? `SHOP OPEN  ·  ${UI.waiting} WAITING` : 'DAY  ·  SHOP SHUT') + fxT, W / 2 + 30, 46);
    g.textAlign = 'right'; g.font = `800 58px ${FONT_XC}`; g.fillStyle = '#c8f03c';
    g.fillText(money$(UI.money), W - 28, 46);
    // the one thing to do now
    g.fillStyle = '#c8f03c'; g.fillRect(0, 84, W, 48);
    g.fillStyle = '#14161a'; g.textAlign = 'left';
    let fs = 30;
    const line = `NOW:  ${UI.goal || ''}`;
    do { g.font = `800 ${fs}px ${FONT_XC}`; fs -= 2; } while (fs > 16 && g.measureText(line).width > W - 40);
    g.fillText(line, 20, 109);
    const tabs = CAREER ? [['STORE', 'store'], ['UPGRADES', 'upgrades'], ['CAREER', 'career'], ['RECIPES', 'recipes'], ['CITY', 'city'], ['HELP', 'help']] : [['STORE', 'store'], ['RECIPES', 'recipes'], ['CITY', 'city'], ['HELP', 'help']];
    const tw = (W - 48 - (tabs.length - 1) * 8) / tabs.length;
    tabs.forEach(([label, id], i) => {
      const x = 24 + i * (tw + 8), sel = UI.tab === id;
      box({ x, y: 142, w: tw, h: 52, act: 'tab', id }, sel ? '#c8f03c' : '#2a2f38');
      g.fillStyle = sel ? '#14161a' : '#f2efe6'; g.textAlign = 'center'; g.font = `800 ${tabs.length > 4 ? 26 : 32}px ${FONT_XC}`;
      g.fillText(label, x + tw / 2, 169);
    });
    if (UI.tab === 'store') {
      storeList.forEach((it, i) => {
        const x = 28 + (i % 4) * 244, y = 212 + ((i / 4) | 0) * 184, [have, coming] = stockOf(it.kind), poor = UI.money < it.price;
        const locked = CAREER && !hasAnyU(CAREER.storeNeeds[it.kind]);
        if (locked) { g.fillStyle = '#1a1d22'; g.fillRect(x, y, 232, 172); } else box({ x, y, w: 232, h: 172, act: 'buy', id: it.kind }, '#232830');
        g.textAlign = 'left'; g.fillStyle = locked ? '#6b7178' : '#f2efe6'; g.font = `800 34px ${FONT_XC}`;
        g.fillText(NAME[it.kind] || it.kind, x + 14, y + 34);
        g.font = `800 60px ${FONT_XC}`; g.fillStyle = locked ? '#6b7178' : poor ? '#f06a45' : '#c8f03c';
        g.fillText(locked ? 'LOCKED' : `$${it.price}`, x + 14, y + 94);
        g.font = `700 24px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
        g.fillText(locked ? 'see UPGRADES' : `on the rack: ${have}${coming ? `  +${coming} coming` : ''}`, x + 14, y + 144);
      });
    } else if (UI.tab === 'upgrades' && CAREER) drawUpgrades(g, W, H, box);
    else if (UI.tab === 'career' && CAREER) drawCareer(g, W, H, box);
    else if (UI.tab === 'recipes') {
      let y = 226;
      const lines = recipeLines();
      const step = lines.length > 8 ? 38 : 43;
      for (const [name, how, pay] of lines) {
        g.textAlign = 'left'; g.fillStyle = pay === 'LOCKED' ? '#6b7178' : '#c8f03c'; g.font = `800 30px ${FONT_XC}`; g.fillText(name, 34, y);
        g.fillStyle = pay === 'LOCKED' ? '#6b7178' : '#f2efe6'; g.font = `700 27px ${FONT_XC}`; g.fillText(how, 240, y);
        g.textAlign = 'right'; g.fillStyle = pay === 'LOCKED' ? '#6b7178' : '#c8f03c'; g.font = `800 30px ${FONT_XC}`; g.fillText(pay, W - 34, y);
        y += step;
      }
    } else if (UI.tab === 'city') {
      let y = 232;
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
      g.fillText('By day: into the lift with the box, button STREET. Walk on at the post with the exit sign.', 34, y); y += 54;
      street.forEach((b, i) => {
        const locked = CAREER && !hasU(i === 0 ? 'street' : b.id);
        g.textAlign = 'left'; g.fillStyle = locked ? '#6b7178' : '#c8f03c'; g.font = `800 40px ${FONT_XC}`; g.fillText(`${i + 1}. ${String(b.name || '').toUpperCase()}`, 34, y);
        g.fillStyle = locked ? '#6b7178' : '#f2efe6'; g.font = `700 32px ${FONT_XC}`; g.fillText(locked ? 'locked: see UPGRADES' : `buys ${(b.wants || []).map(k => NAME[k] || k).join(', ')}`, 330, y);
        g.textAlign = 'right'; g.fillStyle = locked ? '#6b7178' : '#c8f03c'; g.font = `800 36px ${FONT_XC}`; g.fillText(b.bonus > 1 ? `pays x${b.bonus}` : 'usual price', W - 34, y);
        y += 66;
      });
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 28px ${FONT_XC}`;
      g.fillText('A buyer shows what he wants over his head. Hold the packet out to him.', 34, y + 6);
      if (CAREER) g.fillText('A hired dealer takes what lies on his shelf of the blue cabinet at 08:00.', 34, y + 46);
    } else {
      let y = 222;
      const rows = [
        ['NIGHT 00:00 to 08:00', 'the machines of the cellar run. Make product, pack it in the box.'],
        ['DAY 08:00 to 20:00', 'pull the lever on the counter to open the shop, or go and sell in the street.'],
        ['POUR', 'tilt the bottle over the mixer. One packet for every 50 ml. Shaken and exact: PURE.'],
        ['THE BOX', 'fifteen packets. Pull the trigger over the one you want to take out.'],
        ['JOINT, SYRUP', 'held to your mouth: customers wait twice as long.'],
        ['BLUE ICE, CRYSTAL', 'at the mouth: your machines run twice as fast.'],
        ['PILLS, CANDY', 'at the mouth: what you sell pays one and a half times.'],
        ['POWDER', 'at the mouth: your batches come out pure without shaking.'],
      ];
      if (CAREER) rows.push(['PAUSE', 'X or Y on the left controller: resume, or save and quit.']);
      for (const [k, t] of rows) {
        g.textAlign = 'left'; g.fillStyle = '#c8f03c'; g.font = `800 26px ${FONT_XC}`; g.fillText(k, 30, y);
        g.fillStyle = '#f2efe6'; g.font = `700 25px ${FONT_XC}`; g.fillText(t, 280, y);
        y += rows.length > 8 ? 38 : 42;
      }
    }
    UI.tex.needsUpdate = true;
  }
''' + s[b:]
n += 1
rep("""    if (b.act === 'tab') { UI.tab = b.id; UI.key = ''; drawUI(); ctx.haptic(k, 0.4, 25); return true; }
    if (b.act === 'buy') { ctx.send({ a: 'buy', hand: k, kind: b.id }); ctx.haptic(k, 0.6, 40); return true; }
    return false;""",
    """    if (b.act === 'tab') { UI.tab = b.id; UI.key = ''; drawUI(); ctx.haptic(k, 0.4, 25); return true; }
    if (b.act === 'buy') { ctx.send({ a: 'buy', hand: k, kind: b.id }); ctx.haptic(k, 0.6, 40); return true; }
    if (b.act === 'unlock') { ctx.send({ a: 'unlock', hand: k, id: b.id }); ctx.haptic(k, 0.7, 60); return true; }
    if (b.act === 'page') { UI.page = b.id; UI.key = ''; drawUI(); ctx.haptic(k, 0.4, 25); return true; }
    if (b.act === 'newcareer') { if (!UI.confirm) { UI.confirm = true; UI.key = ''; drawUI(); ctx.haptic(k, 0.6, 60); return true; } ctx.send({ a: 'menu', hand: k, choice: 'new' }); UI.confirm = false; ctx.haptic(k, 0.9, 80); return true; }
    if (b.act === 'menu') { ctx.send({ a: 'menu', hand: k, choice: b.id }); UI.confirm = false; ctx.haptic(k, 0.9, 80); return true; }
    return false;""")

# ───── labels: the box, the tray, the press, the dealers ─────
rep("        } else if (r.kind === 'box' && r.n && near(r.x, r.z, 1.6)) label(`${r.n.length} / ${start.lab?.box ?? 6}`, '', r.x, r.y + 0.22, r.z);",
    "        } else if (r.kind === 'box' && r.n && near(r.x, r.z, 1.6)) {\n"
    "          const cnt = {}; for (const q of r.n) cnt[q] = (cnt[q] || 0) + 1;\n"
    "          label(`${r.n.length} / ${start.lab?.box ?? 15}`, Object.entries(cnt).map(([q, v]) => `${v} ${(NAME[q] || q).toLowerCase()}`).join(' · '), r.x, r.y + 0.42, r.z, 1.2);\n"
    "        } else if (r.kind === 'tray' && r.n && r.n.length && near(r.x, r.z, 1.4)) label(`${r.n.length} / 3`, (NAME[r.n[0]] || r.n[0]).toLowerCase(), r.x, r.y + 0.2, r.z);\n"
    "        else if (r.kind === 'brick' && near(r.x, r.z, 1.2)) label('BRICK', '', r.x, r.y + 0.45, r.z);")
rep("    if (!over && myLevel === 0) {\n      // the drinks:",
    "    if (!over && myLevel === 1 && CAREER) {\n"
    "      // the dealers' shelves of the blue cabinet, the press\n"
    "      const C = UI.career || {};\n"
    "      if (stashSt && stashSt.on) (CAREER.dealerCells || []).forEach(dc => {\n"
    "        const d = (C.dealers || []).find(q => q.id === dc.block), sl = stashSt.slots[dc.cell];\n"
    "        if (!d || !d.hired || !sl) return;\n"
    "        label(`${String(dc.name).toUpperCase()} DEALER`, d.left ? `${d.left} to sell today` : 'put packets here: he takes them at 08:00', sl.x + stashSt.sin * 0.25, sl.y + 0.2, sl.z + stashSt.cos * 0.25);\n"
    "      });\n"
    "      const gr = stations.find(q => q.kind === 'grinder');\n"
    "      if (gr && gr.on && gr.btn) label(hasU('press') ? 'BRICK PRESS' : 'LOCKED', hasU('press') ? '3 of one kind on a tray, pull in the green' : 'Brick press: see UPGRADES', gr.btn.x, gr.btn.y + 0.3, gr.btn.z);\n"
    "    }\n"
    "    if (!over && myLevel === 0) {\n      // the drinks:")

# ───── the box: the trigger takes the packet under the hand ─────
rep("  // ---------- the goal: one place in the room is marked, wherever the player stands ----------",
    """  /** The packet of the box nearest to a point: its index in r.n. */
  function boxPick(r, px, py, pz) {
    let best = r.n.length - 1, bd = Infinity;
    const c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    for (let i = 0; i < Math.min(15, r.n.length); i++) {
      const [x, y, z] = BOX_CELL(i), wx = r.x + x * c + z * sn, wz = r.z - x * sn + z * c, dx = wx - px, dz = wz - pz, dy = r.y + y - py;
      const d2 = dx * dx + dz * dz + dy * dy * 0.25;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }
  function boxCellWorld(r, i) {
    const [x, y, z] = BOX_CELL(i), c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    return [r.x + x * c + z * sn, r.y + y + 0.03, r.z - x * sn + z * c];
  }

  // ---------- the goal: one place in the room is marked, wherever the player stands ----------""")
rep("        const kind = T.rec.n[T.rec.n.length - 1];\n        ctx.send({ a: 'unpack', hand: k, item: T.rec.id });",
    "        const kind = T.rec.n[boxPick(T.rec, h.pos.x, h.pos.y, h.pos.z)];\n        ctx.send({ a: 'unpack', hand: k, item: T.rec.id, kind });")
rep("      if (T.type === T_ITEM || T.type === T_STACK) { T.rec.hl = true; ring(T.rec.x, T.rec.y + 0.005, T.rec.z, (T.rec.rad + 0.035) * pulse, RING_ON); }",
    "      if (T.type === T_ITEM || T.type === T_STACK) {\n"
    "        T.rec.hl = true; ring(T.rec.x, T.rec.y + 0.005, T.rec.z, (T.rec.rad + 0.035) * pulse, RING_ON);\n"
    "        if (T.rec.kind === 'box' && T.rec.n && T.rec.n.length) { const h = ctx.hands[k], c = boxCellWorld(T.rec, boxPick(T.rec, h.pos.x, h.pos.y, h.pos.z)); ring(c[0], c[1], c[2], 0.055 * pulse, RING_ON); }\n"
    "      }")

# ───── input: the menus take the trigger; pause on the left controller ─────
rep("    if (down) {\n      if (UI.g && UI.on[k] && UI.hover[k] >= 0 && !H.held && H.act !== 'take' && clickUI(k)) { lastHand = k; return; }",
    "    if (down) {\n"
    "      if (UI.mode) { if (UI.g && UI.on[k] && UI.hover[k] >= 0) clickUI(k); lastHand = k; return; }      // a menu is open: only its buttons\n"
    "      if (UI.g && UI.on[k] && UI.hover[k] >= 0 && !H.held && H.act !== 'take' && clickUI(k)) { lastHand = k; return; }")
rep("  const offInput = ctx.onInput(onInput);",
    "  const offInput = ctx.onInput(onInput);\n"
    "  // pause: X or Y of the left controller; P on the desktop page\n"
    "  let padWas = false;\n"
    "  function togglePause() {\n"
    "    if (!CAREER || over || UI.phase === 'menu') return;\n"
    "    ctx.send({ a: 'menu', hand: 'r', choice: UI.career && UI.career.paused ? 'resume' : 'pause' });\n"
    "    ctx.haptic('l', 0.6, 60);\n"
    "  }\n"
    "  const onKey = e => { if (e.code === 'KeyP' && !e.repeat) togglePause(); };\n"
    "  if (CAREER) window.addEventListener('keydown', onKey);")
rep("    try { offInput?.(); } catch { /* вече е отписан */ }", "    try { offInput?.(); } catch { /* вече е отписан */ }\n    window.removeEventListener('keydown', onKey);")
rep("    updateScreens();\n    updateLab();\n    updateVeil(dt);\n",
    "    if (CAREER) {\n"
    "      const pad = ctx.hands.l && ctx.hands.l.pad, bt = pad && pad.buttons;\n"
    "      const on = !!(bt && ((bt[4] && bt[4].pressed) || (bt[5] && bt[5].pressed)));\n"
    "      if (on && !padWas) togglePause();\n"
    "      padWas = on;\n"
    "      if (UI.float && UI.float.plane.visible) {      // the menu panel stays in front of the eyes while it is open\n"
    "        const F = UI.float;\n"
    "        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;\n"
    "        if (_v.lengthSq() > 1e-4) {\n"
    "          _v.normalize();\n"
    "          const tx = ctx.head.pos.x + _v.x * 1.05, tz = ctx.head.pos.z + _v.z * 1.05, ty = ctx.head.pos.y - 0.12, kk = 1 - Math.exp(-dt * 3);\n"
    "          if (!F.set) { F.cx = tx; F.cy = ty; F.cz = tz; F.set = true; } else { F.cx += (tx - F.cx) * kk; F.cy += (ty - F.cy) * kk; F.cz += (tz - F.cz) * kk; }\n"
    "          const nx = ctx.head.pos.x - F.cx, nz = ctx.head.pos.z - F.cz, nl = Math.hypot(nx, nz) || 1;\n"
    "          F.nx = nx / nl; F.nz = nz / nl; F.rx = F.nz; F.rz = -F.nx;\n"
    "          F.plane.position.set(F.cx, F.cy, F.cz); F.plane.rotation.set(0, Math.atan2(F.nx, F.nz), 0);\n"
    "        }\n"
    "      }\n"
    "    }\n"
    "    updateScreens();\n    updateLab();\n    updateVeil(dt);\n")
# the menu darkens the world a little
rep("    const wash = myFx ? 0.05 + 0.025 * Math.sin(now * 1.7) : 0;", "    const wash = UI.mode ? 0.55 : myFx ? 0.05 + 0.025 * Math.sin(now * 1.7) : 0;")
rep("    veilMat.color.setHex(fade > 0.05 ? 0x000000 : FX_HEX[myFx] || 0x000000);", "    veilMat.color.setHex(fade > 0.05 || UI.mode ? 0x000000 : FX_HEX[myFx] || 0x000000);")

# ───── the snapshot ─────
rep("    UI.shop = !!snap.shop; UI.waiting = snap.waiting | 0; goal = snap.goal || null;",
    "    UI.shop = !!snap.shop; UI.waiting = snap.waiting | 0; goal = snap.goal || null;\n"
    "    UI.career = snap.career || null;\n"
    "    {\n"
    "      const mode = snap.phase === 'menu' ? 'menu' : UI.career && UI.career.paused && snap.phase !== 'over' ? 'pause' : '';\n"
    "      if (mode !== UI.mode) { UI.mode = mode; UI.confirm = false; UI.key = ''; if (UI.float) { UI.float.plane.visible = !!mode; UI.float.set = false; for (const d of UI.float.dots) d.visible = false; } }\n"
    "      const C = UI.career;\n"
    "      UI.ckey = C ? `${C.day}|${C.rank}|${C.earned}|${(C.unlocked || []).length}|${(C.goals || []).map(q => q.have + (q.done ? 'd' : '')).join(',')}|${(C.dealers || []).map(d => d.left).join(',')}|${C.save ? C.save.day : ''}` : '';\n"
    "    }")

# ───── events ─────
rep("      case 'shop_open': case 'shop_shut':",
    """      case 'goal': {
        hud.notify(); ctx.haptic('l', 0.8, 160); ctx.haptic('r', 0.8, 160);
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (_v.lengthSq() > 1e-4) { _v.normalize(); pop(`GOAL: ${e.text || ''}`, ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y - 0.1, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); }
        break;
      }
      case 'unlocked': if (has) { puff(x, y, z, 0xc8f03c, 10, 0.6, 0.05, 0.8, 0.4); pop(`UNLOCKED: ${e.text || ''}`, x, y + 0.2, z, '#c8f03c', true); } if (mine) { ctx.haptic('l', 0.8, 120); ctx.haptic('r', 0.8, 120); } break;
      case 'won': {
        hud.notify(); ctx.haptic('l', 1, 400); ctx.haptic('r', 1, 400);
        _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0;
        if (_v.lengthSq() > 1e-4) { _v.normalize(); pop('YOU OWN THE BLOCK', ctx.head.pos.x + _v.x * 0.9, ctx.head.pos.y + 0.05, ctx.head.pos.z + _v.z * 0.9, '#c8f03c', true); }
        break;
      }
      case 'dealer_sale':
        if (myLevel === 1 && has) pop(`+${e.amount ?? ''}`, x, y + 0.2, z, '#c8f03c', true);
        else { _v.set(0, 0, -1).applyQuaternion(ctx.head.quat); _v.y = 0; if (_v.lengthSq() > 1e-4) { _v.normalize(); pop(String(e.text || ''), ctx.head.pos.x + _v.x * 1.0, ctx.head.pos.y - 0.32, ctx.head.pos.z + _v.z * 1.0, '#c8f03c', false); } }
        ctx.haptic('l', 0.25, 40);
        break;
      case 'dealer_pick': if (has) { puff(x, y, z, 0xc8f03c, 6, 0.3, 0.04, 0.6, 0.3); pop(String(e.text || ''), x, y + 0.2, z, '#c8f03c', false); } break;
      case 'shop_open': case 'shop_shut':""")
rep("        const t = UI.phase === 'day' || UI.phase === 'day2' ? '08:00  DAY' : UI.phase === 'night' || UI.phase === 'night2' ? '00:00  NIGHT' : '';",
    "        const t = UI.phase === 'day' || UI.phase === 'day2' ? (CAREER && UI.career ? `08:00  DAY ${UI.career.day}` : '08:00  DAY') : UI.phase === 'night' || UI.phase === 'night2' ? '00:00  NIGHT' : '';")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('scene 1.4 patched,', n, 'edits')

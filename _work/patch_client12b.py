"""The Back Room 1.2, client part B (scene.js): things turn with the hand, pouring streams, numbers, the box, the screens.
Run from lobby-stage."""
import io

p = 'public/play/games/backroom/scene.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("const TAP_R = { drinks: 0.15, stash: 0.11, bench: 0.13 };",
    "const TAP_R = { drinks: 0.15, stash: 0.11, bench: 0.13 };\n"
    "const ROT_KINDS = new Set(['blue', 'clear', 'red', 'plant', 'pills', 'seeds', 'cup']);      // held upright in the fist: they turn with the hand\n"
    "const LIQ = new Set(['blue', 'clear', 'red']);\n"
    "const LIQ_HEX = [0x2f6dff, 0xcfd6de, 0xff5a3c], LIQ_WORD = ['blue', 'solvent', 'catalyst'];\n"
    "const NAME = { blue: 'Blue base', clear: 'Solvent', red: 'Catalyst', papers: 'Papers', seeds: 'Seeds', box: 'Carry box', ice: 'Blue ice', pills: 'Pills', powder: 'Powder', buds: 'Bud', joint: 'Joint' };\n"
    "const FONT_XC = '\"Sofia Sans XC\", \"Sofia Sans\", \"Segoe UI\", sans-serif';")
rep("  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40],\n",
    "  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40], box: [0.35, 0.12, 0.22], screen: [1.55, 0.98, 0.10],\n")
rep("const DEF_STATE = { pizza: { stack: [], cook: 0, ball: false }, cup: { fill: 0, drink: null }, blue: { shake: 0 }, ice: { pure: 0 } };",
    "const DEF_STATE = { pizza: { stack: [], cook: 0, ball: false }, cup: { fill: 0, drink: null }, blue: { shake: 0 }, ice: { pure: 0 }, box: { n: [] } };")
rep("      case 'blue': return `blue|${s.shake ? 1 : 0}`;\n      case 'ice': return `ice|${s.pure ? 1 : 0}`;\n",
    "      case 'blue': return `blue|${s.shake ? 1 : 0}`;\n      case 'ice': return `ice|${s.pure ? 1 : 0}`;\n      case 'box': return `box|${(s.n || []).join(',')}`;\n")
rep("      r.pour = !!(it.state && it.state.pour); r.slot = it.slot ?? null; r.shaken = !!(it.state && it.state.shake);\n",
    "      r.pour = !!(it.state && it.state.pour); r.slot = it.slot ?? null; r.shaken = !!(it.state && it.state.shake);\n"
    "      {      // what a vessel holds (a drop since the last snapshot means it is pouring), what lies in the box\n"
    "        const c = it.state && it.state.c;\n"
    "        if (Array.isArray(c)) { const ml = c[0] + c[1] + c[2]; if (r.ml != null && ml < r.ml - 0.5) r.pourT = now; r.ml = ml; r.c = c; }\n"
    "        r.n = it.state && Array.isArray(it.state.n) ? it.state.n : null;\n"
    "      }\n")

# things held upright turn with the hand
rep("  function inHand(r, h, head) {\n    const p = h.pos;\n"
    "    if (p.x * p.x + p.y * p.y + p.z * p.z < 1e-6 && head) { r.x = head.pos.x; r.y = head.pos.y - 0.45; r.z = head.pos.z; }   // ръката не се следи: носи се пред гърдите\n"
    "    else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }\n",
    "  const _nk = new THREE.Vector3(), QX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);\n"
    "  function inHand(r, h, head) {\n    const p = h.pos;\n"
    "    r.hq = null;\n"
    "    if (p.x * p.x + p.y * p.y + p.z * p.z < 1e-6 && head) { r.x = head.pos.x; r.y = head.pos.y - 0.45; r.z = head.pos.z; }   // ръката не се следи: носи се пред гърдите\n"
    "    else if (ROT_KINDS.has(r.kind) && h.quat) {      // held in the fist: the thing's own up is the hand's -Z (along the handle, towards the thumb)\n"
    "      _nk.set(0, 0, -1).applyQuaternion(h.quat);\n"
    "      const grip = Math.min(r.h * 0.4, 0.12);\n"
    "      r.x = p.x - _nk.x * grip; r.y = p.y - _nk.y * grip; r.z = p.z - _nk.z * grip;\n"
    "      r.hq = h.quat;\n"
    "    }\n"
    "    else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }\n")
rep("      g.rotation.y = r.yaw;\n      g.scale.setScalar((r.age",
    "      if (r.hq && (r.mode === M_MINE || r.mode === M_OTHER)) g.quaternion.copy(r.hq).multiply(QX); else g.rotation.set(0, r.yaw, 0);\n      g.scale.setScalar((r.age")

# the screens, the numbers, the streams of tilted vessels
rep("  // which of the taps of a station can be pressed right now\n", r'''  // ---------- the big screens: the store and the recipe book ----------
  // One canvas for all screens. A hand points at a screen (its own ray; on the desktop page from the eye through the hand),
  // a dot shows where, the button under it lights up, the trigger presses it.
  const UI = { g: null, tex: null, W: 1024, H: 584, tab: 'store', key: '', at: 0, hover: { l: -1, r: -1 }, on: { l: false, r: false }, buttons: [], list: [],
    money: 0, clock: 0, phase: 'tutorial', patrol: null };
  const storeList = Array.isArray(start.store) ? start.store : [];
  {
    const defs = (start.stations || []).filter(d => d.kind === 'screen');
    if (defs.length && storeList.length) {
      const PW = 1.40, PH = PW * UI.H / UI.W;
      const cv = document.createElement('canvas');
      cv.width = UI.W; cv.height = UI.H;
      UI.g = cv.getContext('2d');
      UI.tex = keep(new THREE.CanvasTexture(cv));
      UI.tex.colorSpace = THREE.SRGBColorSpace; UI.tex.anisotropy = 4;
      const mat = keep(new THREE.MeshBasicMaterial({ map: UI.tex, toneMapped: false }));
      const geo = keep(new THREE.PlaneGeometry(PW, PH));
      const dotGeo = keep(new THREE.CircleGeometry(0.014, 14)), dotMat = keep(new THREE.MeshBasicMaterial({ color: 0xc8f03c, toneMapped: false, depthTest: false }));
      for (const d of defs) {
        const lv = Math.min(nLevels - 1, lvl(d.level)), yaw = +d.yaw || 0, nx = Math.sin(yaw), nz = Math.cos(yaw);
        const cx = d.x + nx * 0.225, cy = d.y + (+d.h || 0.98) / 2, cz = d.z + nz * 0.225;
        const plane = new THREE.Mesh(geo, mat);
        plane.position.set(cx, cy, cz);
        plane.rotation.y = yaw;
        stationL[lv].add(plane);
        const dots = HK.map(() => { const m = new THREE.Mesh(dotGeo, dotMat); m.rotation.y = yaw; m.visible = false; m.renderOrder = 5; stationL[lv].add(m); return m; });
        UI.list.push({ lv, cx, cy, cz, nx, nz, rx: Math.cos(yaw), rz: -Math.sin(yaw), w: PW, h: PH, dots });
      }
    }
  }
  const dayText = min => { const m = Math.floor((((min % 1440) + 1440) % 1440) / 10) * 10; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const stockOf = kind => { const st = stationByKey.get(`bin_${kind}`); return st ? [st.view.stock | 0, st.view.coming | 0] : [0, 0]; };
  function recipeLines() {
    const out = [], R = start.recipes || {}, sell = start.sell || {};
    for (const kind of ['ice', 'pills', 'powder']) {
      const r = R[kind]; if (!r) continue;
      const parts = r.ideal.map((v, i) => (v > 0 ? `${Math.round(v * 100)}% ${LIQ_WORD[i]}` : null)).filter(Boolean).join(' + ');
      out.push([NAME[kind].toUpperCase(), parts, `$${sell[kind] ?? ''}`]);
    }
    out.push(['BUD', `a plant in the shredder gives ${start.lab?.buds ?? 3}`, `$${sell.buds ?? ''}`]);
    out.push(['JOINT', 'papers put next to a bud', `$${sell.joint ?? ''}`]);
    return out;
  }
  function drawUI() {
    const g = UI.g, W = UI.W, H = UI.H;
    if (!g) return;
    const night = UI.phase === 'night' || UI.phase === 'night2', warn = UI.patrol && UI.patrol.phase === 'warn', here = UI.patrol && UI.patrol.phase === 'on';
    const hov = i => i === UI.hover.l || i === UI.hover.r;
    g.fillStyle = '#14161a'; g.fillRect(0, 0, W, H);
    g.fillStyle = warn ? '#8a5a10' : here ? '#8a1f1a' : '#1f232b'; g.fillRect(0, 0, W, 96);
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = '#f2efe6'; g.textAlign = 'left'; g.font = `800 70px ${FONT_XC}`;
    g.fillText(dayText(UI.clock), 28, 52);
    g.textAlign = 'center'; g.font = `800 34px ${FONT_XC}`;
    const left = warn ? Math.max(0, Math.ceil(UI.patrol.left || 0)) : 0;
    g.fillText(warn ? `POLICE IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}  ·  BOX TO THE CELLAR` : here ? 'THE POLICE ARE HERE' : UI.phase === 'tutorial' ? 'TRAINING' : UI.phase === 'raid' ? 'INSPECTION' : night ? 'NIGHT  ·  MAKE PRODUCT' : 'DAY  ·  THE SHOP IS OPEN', W / 2 + 30, 52);
    g.textAlign = 'right'; g.font = `800 62px ${FONT_XC}`; g.fillStyle = '#c8f03c';
    g.fillText(`$${UI.money}`, W - 28, 52);
    UI.buttons.length = 0;
    const box = (b, fill) => { const i = UI.buttons.length; UI.buttons.push(b); g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h); if (hov(i)) { g.lineWidth = 6; g.strokeStyle = '#c8f03c'; g.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6); } };
    const tab = (label, id, x) => {
      const sel = UI.tab === id;
      box({ x, y: 108, w: 300, h: 64, act: 'tab', id }, sel ? '#c8f03c' : '#2a2f38');
      g.fillStyle = sel ? '#14161a' : '#f2efe6'; g.textAlign = 'center'; g.font = `800 36px ${FONT_XC}`;
      g.fillText(label, x + 150, 141);
    };
    tab('STORE', 'store', 28); tab('RECIPES', 'recipes', 348);
    if (UI.tab === 'store') {
      storeList.forEach((it, i) => {
        const x = 28 + (i % 3) * 328, y = 190 + ((i / 3) | 0) * 196, [have, coming] = stockOf(it.kind), poor = UI.money < it.price;
        box({ x, y, w: 312, h: 180, act: 'buy', id: it.kind }, '#232830');
        g.textAlign = 'left'; g.fillStyle = '#f2efe6'; g.font = `800 40px ${FONT_XC}`;
        g.fillText(NAME[it.kind] || it.kind, x + 18, y + 38);
        g.font = `800 64px ${FONT_XC}`; g.fillStyle = poor ? '#f06a45' : '#c8f03c';
        g.fillText(`$${it.price}`, x + 18, y + 100);
        g.font = `700 26px ${FONT_XC}`; g.fillStyle = '#9aa0a8';
        g.fillText(`on the rack: ${have}${coming ? `   +${coming} coming` : ''}`, x + 18, y + 152);
      });
    } else {
      let y = 206;
      for (const [name, how, pay] of recipeLines()) {
        g.textAlign = 'left'; g.fillStyle = '#c8f03c'; g.font = `800 34px ${FONT_XC}`; g.fillText(name, 34, y);
        g.fillStyle = '#f2efe6'; g.font = `700 30px ${FONT_XC}`; g.fillText(how, 250, y);
        g.textAlign = 'right'; g.fillStyle = '#c8f03c'; g.font = `800 34px ${FONT_XC}`; g.fillText(pay, W - 34, y);
        y += 50;
      }
      g.textAlign = 'left'; g.fillStyle = '#9aa0a8'; g.font = `700 27px ${FONT_XC}`;
      const notes = [`Tilt a bottle over the mixer or over the flask to pour. One packet for every ${start.lab?.batch ?? 50} ml in the mixer.`,
        'Shake every vessel first and hit the shares exactly: PURE, pays one and a half times.',
        'Pack the packets in the box and carry it upstairs. Police coming: box back down to the cellar.'];
      for (const t of notes) { y += 8; g.fillText(t, 34, y); y += 30; }
    }
    UI.tex.needsUpdate = true;
  }
  const _po = new THREE.Vector3(), _pd = new THREE.Vector3(), _pe = new THREE.Vector3(), _pq = new THREE.Quaternion();
  /** Where a hand points from and to, in the coordinates of the hall. */
  function pointerOf(k, o, d) {
    const h = ctx.hands[k];
    if (!h || h.active === false) return false;
    if (h.ray) {
      h.ray.getWorldPosition(o); h.ray.getWorldQuaternion(_pq);
      _pe.set(0, 0, -1).applyQuaternion(_pq).add(o);
      group.worldToLocal(o); group.worldToLocal(_pe);
      d.copy(_pe).sub(o).normalize();
      return true;
    }
    if (k !== 'r') return false;
    o.copy(ctx.head.pos); d.copy(h.pos).sub(ctx.head.pos);
    if (d.lengthSq() < 1e-6) return false;
    d.normalize();
    return true;
  }
  function updateScreens() {
    if (!UI.g) return;
    let changed = false;
    for (let j = 0; j < 2; j++) {
      const k = HK[j];
      let hit = -1, scr = null, hx = 0, hy = 0, hz = 0;
      if (!over && pointerOf(k, _po, _pd)) for (const sc of UI.list) {
        if (sc.lv !== myLevel) continue;
        const den = _pd.x * sc.nx + _pd.z * sc.nz;
        if (den > -0.05) continue;                                   // pointing away from the screen's face
        const t = ((sc.cx - _po.x) * sc.nx + (sc.cz - _po.z) * sc.nz) / den;
        if (t < 0.05 || t > 6) continue;
        const px = _po.x + _pd.x * t, py = _po.y + _pd.y * t, pz = _po.z + _pd.z * t;
        const u = (px - sc.cx) * sc.rx + (pz - sc.cz) * sc.rz, v = py - sc.cy;
        if (Math.abs(u) > sc.w / 2 || Math.abs(v) > sc.h / 2) continue;
        const cx = (u / sc.w + 0.5) * UI.W, cy = (0.5 - v / sc.h) * UI.H;
        hit = UI.buttons.findIndex(b => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
        scr = sc; hx = px + sc.nx * 0.006; hy = py; hz = pz + sc.nz * 0.006;
        break;
      }
      for (const sc of UI.list) { const dot = sc.dots[j]; dot.visible = sc === scr; if (sc === scr) dot.position.set(hx, hy, hz); }
      UI.on[k] = !!scr;
      if (hit !== UI.hover[k]) { UI.hover[k] = hit; changed = true; if (hit >= 0) ctx.haptic(k, 0.15, 10); }
    }
    const pl = UI.patrol ? `${UI.patrol.phase}${Math.ceil(UI.patrol.left || 0)}` : '';
    const key = `${UI.tab}|${UI.phase}|${Math.floor(UI.clock / 10)}|${UI.money}|${pl}|${storeList.map(it => stockOf(it.kind).join('.')).join(',')}`;
    if (changed || (key !== UI.key && now - UI.at > 0.2)) { UI.key = key; UI.at = now; drawUI(); }
  }
  /** The trigger on a button of the screen. */
  function clickUI(k) {
    const b = UI.buttons[UI.hover[k]];
    if (!b) return false;
    if (b.act === 'tab') { UI.tab = b.id; UI.key = ''; drawUI(); ctx.haptic(k, 0.4, 25); return true; }
    if (b.act === 'buy') { ctx.send({ a: 'buy', hand: k, kind: b.id }); ctx.haptic(k, 0.6, 40); return true; }
    return false;
  }

  // ---------- numbers: what a vessel holds, what is in the mixer, on the rack, in the box ----------
  const labels = [], labelGroup = new THREE.Group();
  labelGroup.name = 'backroom:labels';
  group.add(labelGroup);
  let labelN = 0;
  function label(text, sub, x, y, z) {
    let L = labels[labelN];
    if (!L) {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const tex = keep(new THREE.CanvasTexture(cv));
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false })));
      sp.scale.set(0.21, 0.079, 1);
      sp.renderOrder = 6;
      labelGroup.add(sp);
      L = labels[labelN] = { sp, g: cv.getContext('2d'), tex, key: '' };
    }
    labelN++;
    const key = `${text}|${sub || ''}`;
    if (key !== L.key) {
      L.key = key;
      const g = L.g;
      g.clearRect(0, 0, 256, 96);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const line = (t, size, yy, fill) => { g.font = `800 ${size}px ${FONT_XC}`; g.lineWidth = 7; g.strokeStyle = 'rgba(19,20,17,0.92)'; g.strokeText(t, 128, yy); g.fillStyle = fill; g.fillText(t, 128, yy); };
      line(text, sub ? 46 : 56, sub ? 30 : 48, '#f2efe6');
      if (sub) line(sub, 26, 72, '#c8f03c');
      L.tex.needsUpdate = true;
    }
    L.sp.position.set(x, y, z);
    L.sp.visible = true;
  }
  const partsOf = (c, pct) => { const sum = c[0] + c[1] + c[2]; return c.map((v, i) => (v >= 1 ? `${pct ? Math.round(v / sum * 100) + '%' : Math.round(v)} ${LIQ_WORD[i]}` : null)).filter(Boolean).join(' · '); };
  const pourFx = HK.map((k, j) => { const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009, 0.009, 1, 6).translate(0, -0.5, 0)), keep(new THREE.MeshBasicMaterial({ color: LIQ_HEX[0] }))); m.visible = false; group.add(m); return m; });
  function updateLab() {
    // a tilted vessel that is pouring: a thin stream from its neck
    for (let j = 0; j < 2; j++) {
      const m = pourFx[j], r = hand[HK[j]].held, on = !!r && LIQ.has(r.kind) && r.ml > 0 && !!r.hq && now - (r.pourT ?? -9) < 0.5;
      m.visible = on;
      if (!on) continue;
      _nk.set(0, 0, -1).applyQuaternion(r.hq);
      m.position.set(r.x + _nk.x * r.h * 0.95, r.y + _nk.y * r.h * 0.95, r.z + _nk.z * r.h * 0.95);
      m.scale.set(1 + 0.3 * Math.sin(now * 41), 0.3, 1 + 0.3 * Math.cos(now * 37));
      const c = r.c || [1, 0, 0];
      m.material.color.setHex(LIQ_HEX[c[0] >= c[1] && c[0] >= c[2] ? 0 : c[1] >= c[2] ? 1 : 2]);
    }
    // the numbers
    labelN = 0;
    if (!over) {
      const hx = ctx.head.pos.x, hz = ctx.head.pos.z;
      const near = (x, z, d) => { const dx = x - hx, dz = z - hz; return dx * dx + dz * dz <= d * d; };
      for (let i = 0; i < itemList.length && labelN < 14; i++) {
        const r = itemList[i];
        if (r.mode === M_FREE && !r.on) continue;
        if (LIQ.has(r.kind) && r.c && (r.mode === M_MINE || near(r.x, r.z, 0.9))) {
          const mixed = r.c.filter(v => v >= 1).length > 1;
          label(`${Math.round(r.ml)} ml`, mixed ? partsOf(r.c, false) : r.shaken ? 'shaken' : '', r.x, r.y + r.h + 0.09, r.z);
        } else if (r.kind === 'box' && r.n && near(r.x, r.z, 1.6)) label(`${r.n.length} / ${start.lab?.box ?? 6}`, '', r.x, r.y + 0.22, r.z);
      }
      for (let i = 0; i < stations.length && labelN < 14; i++) {
        const st = stations[i];
        if (!st.on) continue;
        if (st.kind === 'bench' && st.taps && st.taps[2] && near(st.x, st.z, 2)) {
          const mix = st.view.mix || [0, 0, 0], sum = mix[0] + mix[1] + mix[2], t = st.taps[2];
          if (sum >= 1) label(`${Math.round(sum)} ml`, partsOf(mix, true), t.x, t.y + 0.16, t.z);
          else if (st.view.left > 0) label(`${st.view.left} more`, '', t.x, t.y + 0.16, t.z);
        } else if (st.kind === 'bin' && st.view.stock != null && st.gives !== 'meat' && near(st.x, st.z, 2.2)) {
          label(`x${st.view.stock | 0}`, NAME[st.gives] || '', st.x + st.sin * 0.22, st.y + st.h + 0.2, st.z + st.cos * 0.22);
        }
      }
    }
    for (let i = labelN; i < labels.length; i++) labels[i].sp.visible = false;
  }

  // which of the taps of a station can be pressed right now
''')

# the frame loop
rep("    updatePops(dt);\n    hud.update(dt, now);\n", "    updatePops(dt);\n    updateScreens();\n    updateLab();\n    hud.update(dt, now);\n")
# what the screens show comes with every snapshot
rep("    over = snap.phase === 'over';\n", "    over = snap.phase === 'over';\n    UI.money = Math.round(+snap.money || 0); UI.clock = +snap.clock || 0; UI.phase = snap.phase; UI.patrol = snap.patrol || null;\n")
# the trigger on a screen button; the trigger on a box takes a packet out (the grip takes the box itself)
rep("    if (down) {\n      if (H.held || H.act === 'take') {                      // ръката е пълна\n",
    "    if (down) {\n"
    "      if (UI.g && UI.on[k] && UI.hover[k] >= 0 && !H.held && H.act !== 'take' && clickUI(k)) { lastHand = k; return; }\n"
    "      if (H.held || H.act === 'take') {                      // ръката е пълна\n")
rep("      if (T.type === T_ITEM) {\n        ctx.send({ a: 'grab', hand: k, item: T.rec.id });",
    "      if (T.type === T_ITEM && T.rec.kind === 'box' && btn === 'trigger' && T.rec.n && T.rec.n.length && T.rec.mode === M_FREE) {\n"
    "        const kind = T.rec.n[T.rec.n.length - 1];\n"
    "        ctx.send({ a: 'unpack', hand: k, item: T.rec.id });\n"
    "        H.act = 'take'; H.actT = now; H.btn = btn; H.ghostKind = kind; lastHand = k;\n"
    "        if (!H.ghost) H.ghost = getView(itemGroup);\n"
    "        setEntry(H.ghost, itemEntry(kind, null, itemKey(kind, DEF_STATE[kind])));\n"
    "        H.ghostYaw = handYaw(h.quat, 0);\n"
    "        ctx.haptic(k, 0.6, 30);\n"
    "      } else if (T.type === T_ITEM) {\n        ctx.send({ a: 'grab', hand: k, item: T.rec.id });")
rep("      case 'rolled': if (has)", "      case 'packed': if (has) puff(x, y + 0.05, z, 0xc8f03c, 5, 0.3, 0.03, 0.4, 0.3); if (mine) ctx.haptic(lastHand, 0.5, 40); break;\n      case 'rolled': if (has)")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('client B patched')

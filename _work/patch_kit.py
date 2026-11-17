"""The Back Room 1.1: models of the new items and stations (synty-kinds.js). Run from lobby-stage."""
import io

p = 'public/play/games/backroom/synty-kinds.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)


# sizes for piles on shelves
rep("  cup: [0.07, 0.12, 0.07], tray: [0.76, 0.13, 0.57], meatbox: [0.76, 0.2, 0.57],\n",
    "  cup: [0.07, 0.12, 0.07], tray: [0.76, 0.13, 0.57], meatbox: [0.76, 0.2, 0.57],\n"
    "  white: [0.14, 0.03, 0.11], mustard: [0.14, 0.03, 0.11], shrimp: [0.15, 0.06, 0.20], ham: [0.12, 0.04, 0.16], bacon: [0.07, 0.03, 0.32],\n"
    "  pineapple: [0.19, 0.02, 0.19], onion: [0.11, 0.07, 0.27],\n")

# models to load
rep("    ...['Table_Metal_01', 'CardboardBox_Open_01', 'Shelf_01', 'Lab_Tank_01', 'Lab_Bulb_03', 'Lab_MachinePanel_01', 'Manhole_01'].map(n => [GW, `SM_Prop_${n}`]),\n  ];",
    "    ...['Table_Metal_01', 'CardboardBox_Open_01', 'Shelf_01', 'Lab_Tank_01', 'Lab_Bulb_03', 'Lab_MachinePanel_01', 'Manhole_01'].map(n => [GW, `SM_Prop_${n}`]),\n"
    "    // 1.1: filled sauce bowls, more toppings\n"
    "    s('Food_Sauce_Ketchup_01'), s('Food_Sauce_Mayo_01'), s('Food_Sauce_Mustard_01'), s('Food_Fish_Shrimp_01'), s('Food_Luncheon_Sliced_01'),\n"
    "    s('Food_Bacon_Cooked_01'), s('Food_Pineapple_Ring_01'), s('Food_Onion_Sliced_01'),\n"
    "    // 1.1: the cellar lab (not in the kids theme)\n"
    "    ...(theme === 'kids' ? [] : [s('Market_Freezer_03'), s('Blender_01'),\n"
    "      ...['Plant_01', 'Plant_Bucket_01', 'Plant_Light_01', 'Blender_01', 'Blender_Jug_01', 'Lab_Bulb_02', 'Chemical_03', 'Chemical_05', 'ZipBag_Green_S_01',\n"
    "        'ZipBag_Blue_S_01', 'ZipBag_White_S_01', 'Pills_01', 'Cigarette_Long_01', 'Cigarette_Pack_01', 'Bottle_Small_01'].map(n => [GW, `SM_Prop_${n}`])]),\n"
    "  ];")

# the pizza: original models where they exist, the other toppings laid on top
a = s.index("  function pizzaVariant(stack) {")
b = s.index("  function makePizza(opts = {}) {")
s = s[:a] + r'''// Where the stack has no model of its own, the nearest original pizza is the base and the rest is laid on it:
  // a flat layer for white or mustard sauce, and the original topping models in a ring.
  const SAUCE_COL = { sauce: 0xa8281c, white: 0xf1e7cf, mustard: 0xd8a31e };
  const SCATTER = {
    cheese: ['SM_Prop_Food_Cheese_Grated_01', 3], veg: ['SM_Prop_Food_Mushroom_Sliced_01', 4], meat: ['SM_Prop_Food_Salami_Sliced_01', 5],
    shrimp: ['SM_Prop_Food_Fish_Shrimp_01', 4], ham: ['SM_Prop_Food_Luncheon_Sliced_01', 4], bacon: ['SM_Prop_Food_Bacon_Cooked_01', 4],
    pineapple: ['SM_Prop_Food_Pineapple_Ring_01', 3], onion: ['SM_Prop_Food_Onion_Sliced_01', 4],
  };
  /** [number of the original model, what still has to be laid on it]. */
  function pizzaBase(stack) {
    if (!stack.length || stack[0] !== 'sauce') return [1, stack.slice()];          // plain dough; another sauce is a layer on it
    if (!stack.includes('cheese')) return [2, stack.filter(k => k !== 'sauce')];
    const n = stack.filter(k => k === 'meat').length, v = stack.includes('veg'), used = new Set(['sauce', 'cheese']);
    let base = 3;
    if (n) { base = n === 1 ? (v ? 6 : 4) : (v ? 8 : 5); used.add('meat'); if (v) used.add('veg'); }
    return [base, stack.filter(k => !used.has(k))];
  }
  const pizzaProto = key => proto(`pizza:${key}`, () => {
    if (key === 'ball') return natural(SHOPS, 'SM_Prop_Food_Pizza_Dough_01');
    const [base, stage, ex] = key.split(':');
    const model = `SM_Prop_Food_Pizza_${PIZZA_STAGE[+stage]}_0${base}`, top = (A.info(SHOPS, model)?.size?.[1] || 0.03);
    const parts = [natural(SHOPS, model)];
    let ring = 0;
    for (const k of ex ? ex.split(',') : []) {
      if (SAUCE_COL[k]) {
        const layer = new THREE.Mesh(geos().disc, flat(`sauce:${k}:${stage}`, +stage === 2 ? 0x241a14 : SAUCE_COL[k]));
        layer.scale.set(0.245, 1, 0.245);
        layer.position.y = top + 0.0015;
        layer.updateMatrixWorld(true);
        parts.push(layer);
        continue;
      }
      const sc = SCATTER[k];
      if (!sc || !A.info(SHOPS, sc[0])) continue;
      const [w, h, d] = A.info(SHOPS, sc[0]).size, n = sc[1], r = Math.max(w, d) > 0.25 ? 0.12 : 0.155;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU + ring * 0.85;
        parts.push(place(SHOPS, sc[0], { w, h, d, fit: 'uniform', x: Math.sin(an) * r, y: top + 0.003 + ring * 0.006, z: Math.cos(an) * r, yaw: (i + ring) * Math.PI / 2 }));
      }
      ring++;
    }
    return parts;
  });
  function setPizza(obj, st) {
    const stack = Array.isArray(st.stack) ? st.stack : [];
    const [base, extras] = pizzaBase(stack);
    const key = st.ball && !stack.length ? 'ball' : `${base}:${cookStage(Number(st.cook) || 0)}:${extras.join(',')}`;
    if (obj.userData.key === key) return true;
    obj.userData.key = key;
    obj.clear();
    const p = pizzaProto(key);
    obj.add(p.clone(true));
    obj.userData.top = p.userData.top; obj.userData.tris = p.userData.tris;
    return true;
  }
''' + s[b:]

# the cellar lab: items and stations
rep("  // ---------- таблици ----------\n",
    r'''  // ---------- 1.1: the cellar lab ----------
  const natGWItem = (key, model) => () => inst(key, () => natGW(model));
  // The plant: its first part is the leaves (their own texture with holes), the second the stem.
  function plantParts() {
    const src = natGW('Plant_01');
    const leaf = ownMat('gw:leaf', () => { const m = A.material(GW, 'tex/PolygonGangWarfare_Leaves_Diff.png').clone(); m.alphaTest = 0.5; m.side = THREE.DoubleSide; return m; });
    let i = 0;
    src.traverse(x => { if (x.isMesh && i++ === 0) x.material = leaf; });
    return src;
  }
  // The blue flask: the original round flask, tinted blue; once shaken it glows.
  function makeBlue() {
    const g = inst('blue', () => natGW('Lab_Bulb_02'));
    const list = [];
    g.traverse(o => { if (o.isMesh) list.push([o, o.material]); });
    g.userData.blue = { list, on: -1 };
    setBlue(g, { shake: 0 });
    return g;
  }
  function setBlue(obj, st) {
    const e = obj.userData.blue; if (!e) return true;
    const on = st.shake ? 1 : 0;
    if (on === e.on) return true;
    e.on = on;
    for (const [o, base] of e.list) o.material = on ? tinted(base, 'blueHot', 0x7fb4ff, 0x1746c8) : tinted(base, 'blue', 0x4d8dff, 0x06113a);
    return true;
  }
  function makeIce() {
    const g = inst('ice', () => natGW('ZipBag_Blue_S_01'));
    const list = [];
    g.traverse(o => { if (o.isMesh) list.push([o, o.material]); });
    g.userData.ice = { list, on: 0 };
    return g;
  }
  function setIce(obj, st) {
    const e = obj.userData.ice; if (!e) return true;
    const on = st.pure ? 1 : 0;
    if (on === e.on) return true;
    e.on = on;
    for (const [o, base] of e.list) o.material = on ? tinted(base, 'icePure', 0xffffff, 0x1a4fb0) : base;
    return true;
  }
  /** The place of the station's i-th slot (or tap) in the station's own frame. */
  const localOf = (def, q) => {
    const c = Math.cos(def.yaw || 0), sn = Math.sin(def.yaw || 0), dx = q.x - def.x, dz = q.z - def.z;
    return [dx * c - dz * sn, q.y - (def.y || 0), dx * sn + dz * c];
  };
  // The secret cabinet: the original two-door freezer. The doors are separate parts of the model and swing on their outer
  // edge. In every empty shelf spot that belongs to a supply stands a dark sample of it: touching it orders the supply.
  function makeStash(opts = {}) {
    const g = new THREE.Group(), name = 'SM_Prop_Market_Freezer_03';
    const [w, h, d] = A.info(SHOPS, name).size;
    const parts = placedParts(SHOPS, name, { w, h, d, fit: 'uniform', z: NAT_FRONT - d / 2 }, n => (/Door_01/.test(n) ? 'a' : /Door_02/.test(n) ? 'b' : 'body'));
    const doors = [];
    let tris = 0;
    for (const key of ['body', 'a', 'b']) {
      const list = parts[key] || [];
      for (const m of list) tris += m.geometry.attributes.position.count / 3;
      if (key === 'body') { for (const m of list) g.add(m); continue; }
      const box = new THREE.Box3();
      for (const m of list) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix)); }
      if (box.isEmpty()) continue;
      const mid = (box.min.x + box.max.x) / 2, hx = mid < 0 ? box.min.x : box.max.x, hz = box.max.z - 0.02;
      const pivot = new THREE.Group();
      pivot.position.set(hx, 0, hz);
      const back = new THREE.Matrix4().makeTranslation(-hx, 0, -hz);
      for (const m of list) { m.matrix.premultiply(back); pivot.add(m); }
      g.add(pivot);
      doors.push({ pivot, dir: mid < 0 ? -1 : 1 });
    }
    const ghosts = [], def = opts.def || null;
    if (def && Array.isArray(def.slots) && Array.isArray(def.shelf)) {
      def.slots.forEach((sl, i) => {
        const kind = def.shelf[i];
        const m = kind ? make(kind, {}) : null;
        if (!m) return;
        m.position.set(...localOf(def, sl));
        m.traverse(o => { if (o.isMesh) o.material = tinted(o.material, 'sample', 0x2c3138); });
        m.visible = false;
        g.add(m);
        ghosts.push({ m, i });
      });
    }
    g.userData.stash = { doors, ghosts, open: 0, t: 0 };
    g.userData.tris = tris;
    return g;
  }
  function setStash(obj, st, dt) {
    const e = obj.userData.stash; if (!e) return true;
    e.t += dt > 0 ? dt : 0;
    const tgt = Math.max(0, Math.min(1, Number(st.open) || 0));
    e.open += (tgt - e.open) * (dt === undefined ? 1 : Math.min(1, dt * 12));
    for (const q of e.doors) q.pivot.rotation.y = q.dir * e.open * 1.7;
    const free = Array.isArray(st.free) ? st.free : [], pend = Array.isArray(st.pend) ? st.pend : [];
    for (const gh of e.ghosts) {
      const coming = pend.includes(gh.i);
      gh.m.visible = e.open > 0.3 && (free[gh.i] !== false || coming);
      gh.m.scale.setScalar(coming ? 0.85 + 0.15 * Math.abs(Math.sin(e.t * 5)) : 1);
    }
    return true;
  }
  // The plants: two buckets under the grow lamp; a grown plant stands in each until it is pulled out.
  function makeGrow(opts = {}) {
    const g = new THREE.Group(), def = opts.def || null;
    const xs = def && Array.isArray(def.slots) && def.slots.length ? def.slots.map(sl => localOf(def, sl)[0]) : [-0.34, 0.34];
    const rig = inst(`grow:${xs.join(',')}`, () => [
      ...xs.map(x => natGW('Plant_Bucket_01', { x })),
      place(GW, 'SM_Prop_Plant_Light_01', { w: 1.27, h: 1.0, d: 0.65, fit: 'uniform', yaw: Math.PI / 2, y: 1.78, map: GW_MAP }),
    ]);
    g.add(rig);
    const plants = xs.map(x => { const q = inst('plant', () => plantParts()); q.position.set(x, 0.36, 0); g.add(q); return q; });
    g.userData.grow = { plants };
    g.userData.tris = rig.userData.tris;
    return g;
  }
  function setGrow(obj, st) {
    const e = obj.userData.grow; if (!e) return true;
    const pots = Array.isArray(st.pots) ? st.pots : [];
    e.plants.forEach((q, i) => {
      const v = Number(pots[i]);
      q.visible = !(v <= 0.02);
      q.scale.setScalar(v >= 1 || Number.isNaN(v) ? 1 : 0.2 + 0.8 * Math.max(0, v));
    });
    return true;
  }
  // The bench: the original steel prep table with the shredder (the Gang Warfare blender: base and jug) on the left and the
  // mixer (the Shops Pack blender) on the right. A running machine shakes; the mixer glows in the colour of what is in it.
  const MIX_COL = { blue: [0.10, 0.36, 1.0], clear: [0.62, 0.68, 0.74], red: [1.0, 0.22, 0.14] };
  function makeBench(opts = {}) {
    const g = new THREE.Group(), def = opts.def || null, top = opts.h || 1.05;
    const T = def && Array.isArray(def.taps) ? def.taps.map(q => localOf(def, q)) : [[-0.27, top + 0.1, 0.17], [0.27, top + 0.1, 0.17]];
    const sx = T[0][0], mx = T[1][0];
    const body = inst(`bench:${sx}`, () => [natural(SHOPS, 'SM_Prop_Kitchen_Prep_Table_02', { front: NAT_FRONT }), natGW('Blender_01', { x: sx, y: top })]);
    const jug = inst('bench:jug', () => natGW('Blender_Jug_01'));
    jug.position.set(sx, top + 0.20, 0);
    const mixer = inst('bench:mixer', () => natural(SHOPS, 'SM_Prop_Blender_01'));
    mixer.position.set(mx, top, 0);
    g.add(body, jug, mixer);
    const mm = [];
    mixer.traverse(o => { if (o.isMesh) mm.push([o, o.material]); });
    g.userData.bench = { jug, mixer, mm, sx, mx, t: 0, key: '' };
    g.userData.tris = body.userData.tris;
    return g;
  }
  function setBench(obj, st, dt) {
    const e = obj.userData.bench; if (!e) return true;
    e.t += dt > 0 ? dt : 0;
    const sh = (Number(st.shred) || 0) > 0, mx = (Number(st.mixing) || 0) > 0;
    e.jug.rotation.y = sh ? e.t * 26 : 0;
    e.jug.position.x = e.sx + (sh ? Math.sin(e.t * 71) * 0.004 : 0);
    e.mixer.position.x = e.mx + (mx ? Math.sin(e.t * 83) * 0.005 : 0);
    const mix = Array.isArray(st.mix) ? st.mix : [], key = mix.slice().sort().join('+') + (mx ? '!' : '');
    if (key !== e.key) {
      e.key = key;
      let col = null;
      if (mix.length) {
        const c = [0, 0, 0];
        for (const k of mix) { const q = MIX_COL[k] || [0.5, 0.5, 0.5]; c[0] += q[0] / mix.length; c[1] += q[1] / mix.length; c[2] += q[2] / mix.length; }
        col = new THREE.Color(c[0], c[1], c[2]).multiplyScalar(mx ? 0.9 : 0.5).getHex();
      }
      for (const [o, base] of e.mm) o.material = col == null ? base : tinted(base, `mix:${key}`, 0xffffff, col);
    }
    return true;
  }
  const BOWL = { white: 'SM_Prop_Food_Sauce_Mayo_01', mustard: 'SM_Prop_Food_Sauce_Mustard_01', sauce: 'SM_Prop_Food_Sauce_Ketchup_01' };

  // ---------- таблици ----------
''')

rep("    sauce: natItem('sauce', 'SM_Prop_Food_Sauce_Bowl_01'), cheese: natItem('cheese', 'SM_Prop_Food_Cheese_Grated_01'),\n",
    "    sauce: natItem('sauce', 'SM_Prop_Food_Sauce_Ketchup_01'), cheese: natItem('cheese', 'SM_Prop_Food_Cheese_Grated_01'),\n"
    "    white: natItem('white', 'SM_Prop_Food_Sauce_Mayo_01'), mustard: natItem('mustard', 'SM_Prop_Food_Sauce_Mustard_01'),\n"
    "    shrimp: natItem('shrimp', 'SM_Prop_Food_Fish_Shrimp_01'), ham: natItem('ham', 'SM_Prop_Food_Luncheon_Sliced_01'), bacon: natItem('bacon', 'SM_Prop_Food_Bacon_Cooked_01'),\n"
    "    pineapple: natItem('pineapple', 'SM_Prop_Food_Pineapple_Ring_01'), onion: natItem('onion', 'SM_Prop_Food_Onion_Sliced_01'),\n"
    "    plant: () => inst('plant', () => plantParts()), seeds: natGWItem('seeds', 'Bottle_Small_01'), papers: natGWItem('papers', 'Cigarette_Pack_01'),\n"
    "    blue: makeBlue, clear: natGWItem('clear', 'Chemical_03'), red: natGWItem('red', 'Chemical_05'),\n"
    "    buds: natGWItem('buds', 'ZipBag_Green_S_01'), joint: natGWItem('joint', 'Cigarette_Long_01'), ice: makeIce,\n"
    "    pills: natGWItem('pills', 'Pills_01'), powder: natGWItem('powder', 'ZipBag_White_S_01'),\n"
    "    stash: makeStash, grow: makeGrow, bench: makeBench,\n")
rep("    bin: (opts = {}) => { if (opts.tray) return new THREE.Group();",
    "    bin: (opts = {}) => { if (opts.bowl && BOWL[opts.gives]) { const b = inst(`bowl:${opts.gives}`, () => natural(SHOPS, BOWL[opts.gives])); b.userData.shelf = true; return b; } if (opts.tray) return new THREE.Group();")
rep("    elevator: setElevator, button: setButton, grinder: setGrinder,\n",
    "    elevator: setElevator, button: setButton, grinder: setGrinder,\n    blue: setBlue, ice: setIce, stash: setStash, grow: setGrow, bench: setBench,\n")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('kit patched')

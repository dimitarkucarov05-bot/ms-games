"""The Back Room 1.5, models (synty-kinds.js). Run from lobby-stage.
The tomato pot, the ladle, the belt, pizza boxes, the drinks table with two bar taps, the wooden crate as the carry box,
the wall switch, a door of the cabinet each, the purple grow lamp."""
import io

p = 'public/play/games/backroom/synty-kinds.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("const APOC = 'apocalypse-pack', APOC_MAP = 'tex/PolygonApocalypse_Texture_01_A.png';",
    "const APOC = 'apocalypse-pack', APOC_MAP = 'tex/PolygonApocalypse_Texture_01_A.png';\n"
    "const HMS = 'horror-movie-set', FV = 'fantasy-village', CLUB = 'nightclubs', PLAZA = 'shopping-plaza-map';\n"
    "const CLUB_MAP = 'tex/PolygonClub_Texture_01_A.png', FV_MAP = 'tex/PolygonFantasyVillage_01_A.png';")
rep("export const BOX_CELL = i => [(-2 + (i % 5)) * 0.1, 0.045, (-1 + Math.floor(i / 5) % 3) * 0.088];",
    "export const BOX_CELL = i => [(-1 + (i % 3)) * 0.125, 0.07, (-2 + Math.floor(i / 3) % 5) * 0.13];      // 1.5: the wooden crate, three across, five along")
rep("  way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24], box: [0.55, 0.29, 0.31], brick: [0.39, 0.35, 0.28],\n};",
    "  way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24], box: [0.45, 0.40, 0.76], brick: [0.39, 0.35, 0.28],\n"
    "  ladle: [0.14, 0.41, 0.32], pbox: [0.64, 0.08, 0.58],\n};")
rep("      s('Bollard_Light_01'), [SHOPS, 'SM_Sign_Exit_01'], [APOC, 'SM_Prop_Medical_Container_01'], [GW, 'SM_Prop_Bag_White_01']]),",
    "      s('Bollard_Light_01'), [SHOPS, 'SM_Sign_Exit_01'], [APOC, 'SM_Prop_Medical_Container_01'], [GW, 'SM_Prop_Bag_White_01'],\n"
    "      [CLUB, 'SM_Item_Crate_01'], [GW, 'SM_Prop_Warehouse_Wall_Switch_01']]),\n"
    "    // 1.5: the kitchen\n"
    "    [HMS, 'SM_Prop_Conveyer_Belt_Straight_02'], [FV, 'SM_Prop_Ladle_01'], s('Kitchen_Pot_01'), s('Kitchen_Prep_Table_02'), [PLAZA, 'SM_Prop_Pizza_Box_01'],\n"
    "    [CLUB, 'SM_Prop_Bar_Tap_01'], [CLUB, 'SM_Prop_Bar_Tap_03'], s('Food_Cheese_Grated_01'),")
# the box: the wooden crate
rep("    g.add(inst('box', () => natural(APOC, 'SM_Prop_Medical_Container_01', { map: APOC_MAP })));",
    "    g.add(inst('box', () => natural(CLUB, 'SM_Item_Crate_01', { map: CLUB_MAP })));")
rep("      m.position.set(x, y, z);\n      m.rotation.y = d > w ? Math.PI / 2 : 0;\n      m.scale.setScalar(Math.min(1, 0.088 / Math.max(w, d, 0.01)));",
    "      m.position.set(x, y, z);\n      m.rotation.y = d > w ? 0 : Math.PI / 2;\n      m.scale.setScalar(Math.min(1, 0.11 / Math.max(w, d, 0.01)));")
# the cabinet: each door by itself
rep("""    const tgt = Math.max(0, Math.min(1, Number(st.open) || 0));
    e.open += (tgt - e.open) * (dt === undefined ? 1 : Math.min(1, dt * 12));
    for (const q of e.doors) q.pivot.rotation.y = q.dir * e.open * 1.7;""",
    """    // 1.5: st.open is [left door, right door]
    const k = dt === undefined ? 1 : Math.min(1, dt * 12);
    if (!Array.isArray(e.op)) e.op = [0, 0];
    for (const q of e.doors) {
      const i = q.dir < 0 ? 0 : 1, raw = Array.isArray(st.open) ? st.open[i] : st.open;
      const tgt = Math.max(0, Math.min(1, Number(raw) || 0));
      e.op[i] += (tgt - e.op[i]) * k;
      q.pivot.rotation.y = q.dir * e.op[i] * 1.7;
    }
    e.open = Math.max(e.op[0], e.op[1]);""")
# the grow lamp glows purple when it is on
rep("    g.userData.grow = { plants };", "    const lampMeshes = []; rig.traverse(o => { if (o.isMesh) lampMeshes.push([o, o.material]); });\n    g.userData.grow = { plants, lampMeshes, uv: -1 };")
rep("""    e.plants.forEach((q, i) => {
      const v = Number(pots[i]);
      q.visible = !(v <= 0.02);
      q.scale.setScalar(v >= 1 || Number.isNaN(v) ? 1 : 0.2 + 0.8 * Math.max(0, v));
    });
    return true;""",
    """    e.plants.forEach((q, i) => {
      const v = Number(pots[i]);
      q.visible = !(v <= 0.02);
      q.scale.setScalar(v >= 1 || Number.isNaN(v) ? 1 : 0.2 + 0.8 * Math.max(0, v));
    });
    const uv = st.uv ? 1 : 0;
    if (uv !== e.uv && e.lampMeshes) {      // the lamp (the last part of the rig) glows purple while it is on
      e.uv = uv;
      const last = e.lampMeshes.slice(-Math.max(1, e.lampMeshes.length - 2));
      for (const [o, base] of last) o.material = uv ? tinted(base, 'uvlamp', 0xd9a6ff, 0x7a2cff) : base;
    }
    return true;""")
# new makers
rep("  const BOWL = { white: 'SM_Prop_Food_Sauce_Mayo_01', mustard: 'SM_Prop_Food_Sauce_Mustard_01', sauce: 'SM_Prop_Food_Sauce_Ketchup_01' };",
    """  const BOWL = { white: 'SM_Prop_Food_Sauce_Mayo_01', mustard: 'SM_Prop_Food_Sauce_Mustard_01', sauce: 'SM_Prop_Food_Sauce_Ketchup_01', cheese: 'SM_Prop_Food_Cheese_Grated_01' };
  // 1.5: the tomato pot (the big kitchen pot with the sauce in it), the white sauce in its bowl
  const SAUCE_COL = { sauce: 0xb3261b, white: 0xf1eadb, mustard: 0xd9a21c };
  function makePot(opts = {}) {
    const gives = opts.gives || opts.def?.gives || 'sauce';
    if (gives !== 'sauce') { const b = inst(`bowl:${gives}`, () => natural(SHOPS, BOWL[gives] || BOWL.white)); return b; }
    return inst('pot:sauce', () => {
      const pot = natural(SHOPS, 'SM_Prop_Kitchen_Pot_01');
      const top = new THREE.Mesh(geos().disc, flat('potSauce', SAUCE_COL.sauce));
      top.scale.set(0.2, 1, 0.2); top.position.y = 0.33;
      return [pot, top];
    });
  }
  // the ladle of the Fantasy Village pack, standing on its bowl: what it carries shows in the bowl
  function makeLadle() {
    const g = new THREE.Group();
    g.add(inst('ladle', () => natural(FV, 'SM_Prop_Ladle_01', { map: FV_MAP })));
    const blob = new THREE.Mesh(geos().disc, flat('ladleSauce', SAUCE_COL.sauce));
    blob.scale.set(0.05, 1, 0.05); blob.position.set(0, 0.05, 0.04); blob.visible = false;
    g.add(blob);
    g.userData.ladle = { blob, key: '' };
    return g;
  }
  function setLadle(obj, st) {
    const e = obj.userData.ladle; if (!e) return true;
    const k = st.sauce || '';
    if (k === e.key) return true;
    e.key = k;
    e.blob.visible = !!k;
    if (k) e.blob.material = flat(`ladle:${k}`, SAUCE_COL[k] || SAUCE_COL.sauce);
    return true;
  }
  // the belt in front of the oven: the conveyor of the Horror Movie Set, its rubber with its own texture; it runs
  function makeBelt(opts = {}) {
    const g = new THREE.Group();
    const w = opts.w || 0.85;
    const belt = inst(`belt:${w}`, () => {
      const m = place(HMS, 'SM_Prop_Conveyer_Belt_Straight_02', { w, h: 0.12, d: 0.36, fit: 'uniform', yaw: Math.PI / 2 });
      const frame = A.material(HMS, 'tex/PolygonHorrorMovieSet_01_A.png'), rubber = A.material(HMS, 'tex/Conveyer_Belt_01.png');
      m.traverse(o => { if (o.isMesh) o.material = /conveyer/i.test(o.userData.matName || o.material.name || '') ? rubber : frame; });
      return m;
    });
    g.add(belt);
    return g;
  }
  const makePbox = () => inst('pbox', () => place(PLAZA, 'SM_Prop_Pizza_Box_01', { w: 0.64, h: 0.08, d: 0.58, fit: 'uniform', mat: A.material(SHOPS, 'tex/PolygonShops_Texture_01_A.png') }));
  function makePboxStack() {
    return inst('pbox:stack', () => [0, 1, 2, 3].map(i => { const b = place(PLAZA, 'SM_Prop_Pizza_Box_01', { w: 0.64, h: 0.08, d: 0.58, fit: 'uniform', y: i * 0.075, mat: A.material(SHOPS, 'tex/PolygonShops_Texture_01_A.png') }); b.rotation.y = (i % 2) * 0.06; return b; }));
  }
  // the drinks table: the steel prep table with two bar taps of the Nightclubs pack; the cup stands under the spout
  function makeDrinksTable() {
    return inst('drinks:taps', () => {
      const table = natural(SHOPS, 'SM_Prop_Kitchen_Prep_Table_02', { front: NAT_FRONT });
      const tap = (name, x) => { const t = natural(CLUB, name, { map: CLUB_MAP, front: NAT_FRONT - 0.02 }); t.position.x = x; t.position.y = 1.054; return t; };
      return [table, tap('SM_Prop_Bar_Tap_01', -0.2), tap('SM_Prop_Bar_Tap_03', 0.2)];
    });
  }
  // the light switch of the cellar: the warehouse switch on its conduit, its box at hand height
  function makeSwitch(opts = {}) {
    const g = new THREE.Group();
    const sw = inst('switch', () => natural(GW, 'SM_Prop_Warehouse_Wall_Switch_01', { map: GW_MAP }));
    sw.position.y = 0.95 - (opts.y || 1.05);
    g.add(sw);
    return g;
  }""")
rep("    lever: makeLever, way: makeWay, spot: () => new THREE.Group(),",
    "    lever: makeLever, way: makeWay, spot: () => new THREE.Group(),\n"
    "    pot: makePot, ladle: makeLadle, belt: makeBelt, pbox: makePbox, switch: makeSwitch,")
rep("    bin: (opts = {}) => { if (opts.bowl && BOWL[opts.gives]) {",
    "    bin: (opts = {}) => { if (opts.def && opts.def.stack && opts.gives === 'pbox') { const b = makePboxStack(); b.userData.shelf = true; return b; } if (opts.bowl && BOWL[opts.gives]) {")
rep("    drinks: natOr('drinks', 'SM_Prop_Kitchen_Drinks_Machine_01', makeDrinks),",
    "    drinks: (opts = {}) => (opts.def && opts.def.taps2 ? makeDrinksTable() : natOr('drinks', 'SM_Prop_Kitchen_Drinks_Machine_01', makeDrinks)(opts)),")
rep("    blue: setBlue, ice: setIce, stash: setStash, grow: setGrow, bench: setBench, box: setBox,",
    "    blue: setBlue, ice: setIce, stash: setStash, grow: setGrow, bench: setBench, box: setBox, ladle: setLadle,")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('kit 1.5 patched')

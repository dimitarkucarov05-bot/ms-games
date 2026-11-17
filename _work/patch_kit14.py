"""The Back Room 1.4, models (synty-kinds.js): the big carry box with every packet visible in a 5 x 3 grid, the brick,
a small box as the rack's sign of a box in stock. Run from lobby-stage."""
import io

p = 'public/play/games/backroom/synty-kinds.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("const GW_MAP = 'tex/PolygonGangWarfare_Texture_01_A.png';",
    "const GW_MAP = 'tex/PolygonGangWarfare_Texture_01_A.png';\n"
    "const APOC = 'apocalypse-pack', APOC_MAP = 'tex/PolygonApocalypse_Texture_01_A.png';\n"
    "/** Where packet i lies in the carry box (local to the box, metres): five in a row, three rows. The scene uses the same grid. */\n"
    "export const BOX_CELL = i => [(-2 + (i % 5)) * 0.1, 0.045, (-1 + Math.floor(i / 5) % 3) * 0.088];")
rep("  way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24], box: [0.35, 0.21, 0.22],\n};",
    "  way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24], box: [0.55, 0.29, 0.31], brick: [0.39, 0.35, 0.28],\n};")
rep("      s('Bollard_Light_01'), [SHOPS, 'SM_Sign_Exit_01']]),",
    "      s('Bollard_Light_01'), [SHOPS, 'SM_Sign_Exit_01'], [APOC, 'SM_Prop_Medical_Container_01'], [GW, 'SM_Prop_Bag_White_01']]),")
rep("""  function makeBox() {
    const g = new THREE.Group();
    g.add(inst('box', () => natGW('Box_01')));""",
    """  // 1.4: the carry box is the open red container of the Apocalypse Pack (0.55 m): fifteen packets lie in it side by side
  function makeBox() {
    const g = new THREE.Group();
    g.add(inst('box', () => natural(APOC, 'SM_Prop_Medical_Container_01', { map: APOC_MAP })));""")
rep("""    n.slice(-3).forEach((kind, i) => {
      const m = make(kind, {});
      if (!m) return;
      m.position.set(-0.09 + i * 0.09, 0.025 + i * 0.012, 0);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.8);
      e.inside.add(m);
    });""",
    """    n.slice(0, 15).forEach((kind, i) => {
      const m = make(kind, {});
      if (!m) return;
      const [w, , d] = SPEC_SIZE[kind] || [0.1, 0.05, 0.1], [x, y, z] = BOX_CELL(i);
      m.position.set(x, y, z);
      m.rotation.y = d > w ? Math.PI / 2 : 0;
      m.scale.setScalar(Math.min(1, 0.088 / Math.max(w, d, 0.01)));
      e.inside.add(m);
    });""")
rep("    lever: makeLever, way: makeWay, spot: () => new THREE.Group(),",
    "    lever: makeLever, way: makeWay, spot: () => new THREE.Group(),\n"
    "    brick: natGWItem('brick', 'Bag_White_01'), boxIcon: natGWItem('boxIcon', 'Box_01'),")
rep("        const it = make(gives, {});\n        if (!it) break;",
    "        const it = make(gives === 'box' ? 'boxIcon' : gives, {});\n        if (!it) break;")
rep("      const sw = (SPEC_SIZE[gives] || [0.1])[0], room = Math.max(0.12, (opts.w || 0.3) - 0.02);",
    "      const sw = gives === 'box' ? 0.35 : (SPEC_SIZE[gives] || [0.1])[0], room = Math.max(0.12, (opts.w || 0.3) - 0.02);")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('kit 1.4 patched')

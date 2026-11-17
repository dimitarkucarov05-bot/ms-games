"""The Back Room 1.3, models (synty-kinds.js): two more liquids, three more products, the lever that opens the shop,
the post at the end of a street block. Run from lobby-stage."""
import io

p = 'public/play/games/backroom/synty-kinds.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("  elevator: [1.6, 2.3, 1.6], button: [0.14, 0.10, 0.06],\n};",
    "  elevator: [1.6, 2.3, 1.6], button: [0.14, 0.10, 0.06],\n"
    "  green: [0.23, 0.31, 0.11], yellow: [0.19, 0.36, 0.07], crystal: [0.17, 0.07, 0.25], candy: [0.10, 0.17, 0.10], syrup: [0.07, 0.13, 0.07],\n"
    "  way: [0.30, 0.30, 0.30], spot: [0.5, 1.3, 0.24],\n};")
# the lever is needed in every theme (it opens the shop); the rest belongs to the lab and the street
rep("    s('Food_Pizza_Dough_01'),\n", "    s('Food_Pizza_Dough_01'), gen('Lever_01'),\n")
rep("        'ZipBag_Blue_S_01', 'ZipBag_White_S_01', 'Pills_01', 'Cigarette_Long_01', 'Cigarette_Pack_01', 'Bottle_Small_01'].map(n => [GW, `SM_Prop_${n}`])]),",
    "        'ZipBag_Blue_S_01', 'ZipBag_White_S_01', 'Pills_01', 'Cigarette_Long_01', 'Cigarette_Pack_01', 'Bottle_Small_01', 'Bottle_Small_02', 'Chemical_01', 'Chemical_06'].map(n => [GW, `SM_Prop_${n}`]),\n"
    "      s('Bollard_Light_01'), [SHOPS, 'SM_Sign_Exit_01']]),")
rep("  const MIX_COL = { blue: [0.10, 0.36, 1.0], clear: [0.62, 0.68, 0.74], red: [1.0, 0.22, 0.14] };",
    "  const MIX_COL = { blue: [0.10, 0.36, 1.0], clear: [0.62, 0.68, 0.74], red: [1.0, 0.22, 0.14], green: [0.20, 0.85, 0.32], yellow: [1.0, 0.80, 0.16] };\n"
    "  const MIX_KEYS = ['blue', 'clear', 'red', 'green', 'yellow'];")
rep("    const mix = Array.isArray(st.mix) ? st.mix : [0, 0, 0], sum = (mix[0] || 0) + (mix[1] || 0) + (mix[2] || 0);\n"
    "    const key = sum > 0 ? `${Math.round(mix[0] / sum * 10)}:${Math.round(mix[1] / sum * 10)}:${mx ? 1 : 0}` : '';",
    "    const mix = Array.isArray(st.mix) ? st.mix : [0, 0, 0];\n"
    "    let sum = 0; for (const v of mix) sum += v || 0;\n"
    "    const key = sum > 0 ? `${mix.map(v => Math.round((v || 0) / sum * 10)).join(':')}:${mx ? 1 : 0}` : '';")
rep("        ['blue', 'clear', 'red'].forEach((k, i) => { const q = MIX_COL[k], f = (mix[i] || 0) / sum; c[0] += q[0] * f; c[1] += q[1] * f; c[2] += q[2] * f; });",
    "        MIX_KEYS.forEach((k, i) => { const q = MIX_COL[k], f = (mix[i] || 0) / sum; c[0] += q[0] * f; c[1] += q[1] * f; c[2] += q[2] * f; });")
rep("  const BOWL = { white:", r'''  // 1.3: an original model in another colour (the acid, the syrup base, the new products): the material is tinted, the shape is Synty's
  const tintItem = (key, model, hex, em) => () => {
    const g = inst(key, () => natGW(model));
    g.traverse(o => { if (o.isMesh) o.material = tinted(o.material, key, hex, em); });
    return g;
  };
  // The lever on the counter that opens and shuts the shop; pulled forward when the shop is open.
  function makeLever() {
    const g = new THREE.Group();
    const b = inst('lever', () => natural(SHOPS, 'SM_Gen_Prop_Lever_01'));
    g.add(b);
    g.userData.lever = { b, on: -1 };
    return g;
  }
  // The post at the end of a street block (the lit bollard of the Shops Pack with the exit sign on it): the way to the next block.
  // The station sits at hand height, so the post is lowered to the ground.
  function makeWay(opts = {}) {
    const g = new THREE.Group();
    const post = inst('way:post', () => natural(SHOPS, 'SM_Prop_Bollard_Light_01'));
    post.position.y = -(opts.y || 1.0);
    const sign = inst('way:sign', () => natural(SHOPS, 'SM_Sign_Exit_01'));
    sign.position.y = 0.42;
    g.add(post, sign);
    return g;
  }
  const BOWL = { white:''')
rep("    pills: natGWItem('pills', 'Pills_01'), powder: natGWItem('powder', 'ZipBag_White_S_01'),",
    "    pills: natGWItem('pills', 'Pills_01'), powder: natGWItem('powder', 'ZipBag_White_S_01'),\n"
    "    green: tintItem('green', 'Chemical_01', 0x58d86a, 0x06220c), yellow: tintItem('yellow', 'Chemical_06', 0xffd23c, 0x2a1c00),\n"
    "    crystal: tintItem('crystal', 'ZipBag_Blue_S_01', 0x3cf0b0, 0x04301f), candy: tintItem('candy', 'Pills_01', 0xff6ab0, 0x300418), syrup: tintItem('syrup', 'Bottle_Small_02', 0xb060ff, 0x1a0630),\n"
    "    lever: makeLever, way: makeWay, spot: () => new THREE.Group(),")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('kit 1.3 patched')

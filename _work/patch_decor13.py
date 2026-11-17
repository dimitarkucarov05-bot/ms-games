"""The Back Room 1.3, the street (decor.js): the ready city map gets its own group; on a street level the map is moved and
turned so that the play zone stands at that block's place in the town. Run from lobby-stage."""
import io

p = 'public/play/games/backroom/decor.js'
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("  const G0 = new THREE.Group(), G1 = new THREE.Group(); G0.name = 'decor:level0'; G1.name = 'decor:level1'; G1.visible = false;\n  root.add(G0, G1);",
    "  const G0 = new THREE.Group(), G1 = new THREE.Group(); G0.name = 'decor:level0'; G1.name = 'decor:level1'; G1.visible = false;\n"
    "  // GP: the ready city map and the people in it (seen from the shop and in the street); GS: what stands in the zone in the street\n"
    "  const GP = new THREE.Group(), GS = new THREE.Group(); GP.name = 'decor:plaza'; GS.name = 'decor:street'; GS.visible = false;\n"
    "  root.add(G0, G1, GP, GS);\n"
    "  // Where each block of the street is in the town: the point of the map (in the shop's own coordinates) that comes under\n"
    "  // the middle of room a, and how the zone is turned there (degrees; the long side of the zone runs along the walkway).\n"
    "  // Chosen on a top view of the map (_work/mapview.py) so that nothing of the map stands inside the zone.\n"
    "  const BLOCKS = [{ c: [-7.9, 10.0], deg: -90 }, { c: [2.9, 14.2], deg: -90 }, { c: [-2.7, 36.5], deg: 0 }];\n"
    "  const streetOn = (start.street || []).length > 0;")
rep("      const mesh = addMesh('plaza', geo, mat, false);", "      const mesh = addMesh('plaza', geo, mat, false, GP);")
rep("        G0.add(body.group);\n        walkers.push(", "        GP.add(body.group);\n        walkers.push(")
rep("        put('shop', PIER, { x, z, y: 0 });\n        if (twoFloors) put('l1', PIER, { x, z, y: 0 });",
    "        put('shop', PIER, { x, z, y: 0 });\n        if (twoFloors) put('l1', PIER, { x, z, y: 0 });\n        if (streetOn) put('street', PIER, { x, z, y: 0 });")
rep("  for (const mesh of mergedLit('l1Glow', 'glow', G1)) { const m = mesh.material.clone(); own.mats.push(m); mesh.material = m; }",
    "  for (const mesh of mergedLit('l1Glow', 'glow', G1)) { const m = mesh.material.clone(); own.mats.push(m); mesh.material = m; }\n"
    "  mergedLit('street', null, GS);")
rep("    if (ps) for (let i = 0; i < ps.length; i++) if (ps[i].id === vid) { lv = ps[i].level === 1 ? 1 : 0; break; }\n"
    "    if (lv !== shown) { shown = lv; G0.visible = lv === 0; G1.visible = lv === 1; }",
    "    if (ps) for (let i = 0; i < ps.length; i++) if (ps[i].id === vid) { lv = ps[i].level > 0 ? ps[i].level | 0 : 0; break; }\n"
    "    if (lv !== shown) {\n"
    "      shown = lv;\n"
    "      G0.visible = lv === 0; G1.visible = lv === 1; GP.visible = lv !== 1; GS.visible = lv >= 2;\n"
    "      const B = lv >= 2 ? BLOCKS[(lv - 2) % BLOCKS.length] : null;\n"
    "      if (B) {            // the town comes to the zone: p' = R(a) * (p - c)\n"
    "        const a = B.deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);\n"
    "        GP.rotation.y = a;\n"
    "        GP.position.set(-(B.c[0] * ca + B.c[1] * sa), -(B.y || 0), -(-B.c[0] * sa + B.c[1] * ca));\n"
    "        blockNow = { c: B.c, ca, sa };\n"
    "      } else { GP.rotation.y = 0; GP.position.set(0, 0, 0); blockNow = null; }\n"
    "      GP.updateMatrixWorld(true);\n"
    "    }")
rep("  let mixTo = 0, dim = 1, lastPhase = null, shown = 0, frameNo = 0;", "  let mixTo = 0, dim = 1, lastPhase = null, shown = 0, frameNo = 0, blockNow = null;")
rep("    if (walkers.length && lv === 0) {\n      const hx = ctx.head.pos.x, hz = ctx.head.pos.z;",
    "    if (walkers.length && lv !== 1) {\n"
    "      // where the player's head is in the map's own coordinates (in the street the map is moved under him)\n"
    "      let hx = ctx.head.pos.x, hz = ctx.head.pos.z;\n"
    "      if (blockNow) { const x = hx, z = hz; hx = blockNow.c[0] + x * blockNow.ca - z * blockNow.sa; hz = blockNow.c[1] + x * blockNow.sa + z * blockNow.ca; }")
rep("  return { update, dispose, stats, root, levels: [G0, G1], lab,", "  return { update, dispose, stats, root, levels: [G0, G1], plaza: GP, street: GS, blocks: BLOCKS, lab,")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('decor 1.3 patched')

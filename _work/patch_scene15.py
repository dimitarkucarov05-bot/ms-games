"""The Back Room 1.5, the scene (scene.js). Run from lobby-stage.
Free grabbing (the thing keeps the hold it was taken with), throwing (the hand's speed goes with the let-go), the drinks
taps without buttons, two cabinet handles, the switch and the purple lamp, the running belt, boxed pizzas, the ladle."""
import io

p = 'public/play/games/backroom/scene.js'
s = io.open(p, encoding='utf-8').read()
n = 0


def rep(a, b, count=1):
    global s, n
    assert s.count(a) == count, (s.count(a), a[:100])
    s = s.replace(a, b)
    n += 1


rep("const USE_R = { button: 0.20, grinder: 0.30, shutter: 0.26, way: 0.32 };", "const USE_R = { button: 0.20, grinder: 0.30, shutter: 0.26, way: 0.32, switch: 0.22 };")
rep("const TAP_R = { drinks: 0.15, stash: 0.11, bench: 0.13 };", "const TAP_R = { drinks: 0.15, stash: 0.13, bench: 0.13, grow: 0.16 };")
rep("  brick: [0.39, 0.35, 0.28],", "  brick: [0.39, 0.35, 0.28], ladle: [0.14, 0.41, 0.32], pbox: [0.64, 0.08, 0.58],")
rep("  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40], box: [0.55, 0.29, 0.31], screen: [1.55, 0.98, 0.10],",
    "  stash: [1.97, 2.43, 0.40], grow: [1.30, 1.90, 0.40], bench: [1.09, 1.05, 0.40], box: [0.45, 0.40, 0.76], screen: [1.55, 0.98, 0.10],")
rep("const BOX_CELL = i => [(-2 + (i % 5)) * 0.1, 0.045, (-1 + Math.floor(i / 5) % 3) * 0.088];",
    "const BOX_CELL = i => [(-1 + (i % 3)) * 0.125, 0.07, (-2 + Math.floor(i / 3) % 5) * 0.13];")
rep("const USE_KINDS = new Set(['button', 'grinder', 'elevator', 'drinks', 'stash', 'bench', 'shutter', 'way']);",
    "const USE_KINDS = new Set(['button', 'grinder', 'elevator', 'drinks', 'stash', 'bench', 'shutter', 'way', 'switch', 'grow']);")
rep("const LIVE_KINDS = new Set(['grinder', 'button', 'door', 'shutter', 'sign', 'elevator', 'stash', 'grow', 'bench']);",
    "const LIVE_KINDS = new Set(['grinder', 'button', 'door', 'shutter', 'sign', 'elevator', 'stash', 'grow', 'bench', 'belt']);")
rep("const PIN_KINDS = new Set(['grinder', 'button']);", "const PIN_KINDS = new Set(['grinder', 'button', 'belt']);")
# the drinks: taps or, on the new table, the spouts over the cups
rep("  const stashSt = stations.find(s => s.kind === 'stash') || null, growSt = stations.find(s => s.kind === 'grow') || null, drinksSt = stations.find(s => s.kind === 'drinks' && s.taps) || null;",
    "  const stashSt = stations.find(s => s.kind === 'stash') || null, growSt = stations.find(s => s.kind === 'grow') || null, drinksSt = stations.find(s => s.kind === 'drinks') || null;\n"
    "  const beltSt = stations.find(s => s.kind === 'belt') || null;\n"
    "  const spouts = drinksSt ? (drinksSt.taps || drinksSt.slots.map(sl => ({ x: sl.x, y: sl.y + 0.31, z: sl.z }))) : [];")
rep("    drinksSt.taps.forEach((tap, i) => {", "    spouts.forEach((tap, i) => {")
rep("      if (drinksSt && drinksSt.on) drinksSt.taps.forEach((t, j) => { label(DRINK_NAME[DRINK_TAP[j]] || '', '', t.x, t.y + 0.16, t.z, 0.8); });",
    "      if (drinksSt && drinksSt.on) spouts.forEach((t, j) => { label(DRINK_NAME[DRINK_TAP[j]] || '', j === 1 && CAREER && !hasU('orange') ? 'locked' : '', t.x, t.y + 0.2, t.z, 0.8); });")
# taps of the cabinet: the two handles; the grow lamp switch
rep("""    if (st.kind === 'bench') return j < 2;
    if (st.kind !== 'stash' || j === 0) return true;
    const sl = st.slots[j - 1];      // an empty shelf spot of a supply, cabinet open, nothing on its way
    return !!(st.shelf && st.shelf[j - 1]) && (st.view.open || 0) > 0.5 && !!sl && sl.item == null && !(st.view.pend || []).includes(j - 1);""",
    """    if (st.kind === 'bench') return j < 2;
    if (st.kind === 'stash') return j < 2;      // 1.5: the handle of each door
    return true;""")
rep("rr = s.kind === 'stash' && j === 0 ? 0.2 : TAP_R[s.kind] || 0.14;", "rr = TAP_R[s.kind] || 0.14;")
# items: keys for boxed pizzas and the ladle; a boxed pizza is drawn as its box
rep("      case 'pizza': return `pizza|${(s.stack || []).join(',')}|${s.cook >= 2 ? 2 : s.cook >= 1 ? 1 : 0}|${s.ball ? 1 : 0}`;",
    "      case 'pizza': return s.boxed ? 'pizza|boxed' : `pizza|${(s.stack || []).join(',')}|${s.cook >= 2 ? 2 : s.cook >= 1 ? 1 : 0}|${s.ball ? 1 : 0}`;\n"
    "      case 'ladle': return `ladle|${s.sauce || ''}`;")
rep("""  const itemEntry = (kind, state, key) => entryFor(key, () => {
    const o = kit.make(kind, { theme });""",
    """  const itemEntry = (kind, state, key) => entryFor(key, () => {
    if (kind === 'pizza' && state && state.boxed) return kit.make('pbox', { theme });
    const o = kit.make(kind, { theme });""")
# free holding
rep("""  function inHand(r, h, head) {
    const p = h.pos;
    r.hq = null;
    if (p.x * p.x + p.y * p.y + p.z * p.z < 1e-6 && head) { r.x = head.pos.x; r.y = head.pos.y - 0.45; r.z = head.pos.z; }   // ръката не се следи: носи се пред гърдите
    else if (ROT_KINDS.has(r.kind) && h.quat) {      // held in the fist: the thing's own up is the hand's -Z (along the handle, towards the thumb)
      _nk.set(0, 0, -1).applyQuaternion(h.quat);
      const grip = Math.min(r.h * 0.4, 0.12);
      r.x = p.x - _nk.x * grip; r.y = p.y - _nk.y * grip; r.z = p.z - _nk.z * grip;
      r.hq = h.quat;
    }
    else if (ROT_FLAT.has(r.kind) && h.quat) { r.x = p.x; r.y = p.y; r.z = p.z; r.hq = h.quat; r.flat = true; }
    else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }
    r.yaw = handYaw(h.quat, r.yaw);
    r.fresh = false;
  }""",
    """  // 1.5: a thing keeps the hold it was taken with (ho: offset and turn in the hand's frame, from the grab); taken from a
  // shelf it stands upright in the fist. Either way it turns with the hand.
  const _hq = new THREE.Quaternion();
  function inHand(r, h, head) {
    const p = h.pos, ho = r.ho || r.hoLocal;
    r.hq = null;
    if (p.x * p.x + p.y * p.y + p.z * p.z < 1e-6 && head) { r.x = head.pos.x; r.y = head.pos.y - 0.45; r.z = head.pos.z; }   // ръката не се следи: носи се пред гърдите
    else if (h.quat && ho) {
      _hq.set(ho.q[0], ho.q[1], ho.q[2], ho.q[3]);
      r.hqW = (r.hqW || new THREE.Quaternion()).copy(h.quat).multiply(_hq);
      _nk.set(ho.o[0], ho.o[1], ho.o[2]).applyQuaternion(h.quat);
      r.x = p.x + _nk.x; r.y = p.y + _nk.y; r.z = p.z + _nk.z;
      r.hq = r.hqW;
    } else if (h.quat) {
      const drop = r.kind === 'ladle' ? 0.25 : Math.min(r.h * 0.45, 0.12);
      _nk.set(0, -drop, 0).applyQuaternion(h.quat);
      r.x = p.x + _nk.x; r.y = p.y + _nk.y; r.z = p.z + _nk.z;
      r.hq = h.quat;
    } else { r.x = p.x; r.y = p.y - Math.min(r.h * 0.5, 0.08); r.z = p.z; }
    r.yaw = handYaw(h.quat, r.yaw);
    r.fresh = false;
  }""")
rep("      if (r.hq && (r.mode === M_MINE || r.mode === M_OTHER)) { g.quaternion.copy(r.hq); if (!r.flat) g.quaternion.multiply(QX); } else g.rotation.set(0, r.yaw, 0);",
    "      if (r.hq && (r.mode === M_MINE || r.mode === M_OTHER)) g.quaternion.copy(r.hq); else g.rotation.set(0, r.yaw, 0);")
# flying things follow the server closely
rep("        if (r.fresh) { r.x = tx; r.y = ty; r.z = tz; r.yaw = tyaw; r.fresh = false; }\n        else { r.x += (tx - r.x) * k;",
    "        if (r.fresh || r.fly) { r.x += (tx - r.x) * (r.fresh ? 1 : 1 - Math.exp(-dt * 30)); r.y += (ty - r.y) * (r.fresh ? 1 : 1 - Math.exp(-dt * 30)); r.z += (tz - r.z) * (r.fresh ? 1 : 1 - Math.exp(-dt * 30)); r.yaw = tyaw; r.fresh = false; }\n        else { r.x += (tx - r.x) * k;")
# the grab sends the hold
rep("        ctx.send({ a: 'grab', hand: k, item: T.rec.id });",
    "        {      // the hold: where the thing is and how it is turned, in the frame of the hand\n"
    "          const g = T.rec.v.g;\n"
    "          _hq.copy(h.quat).invert();\n"
    "          const o = _nk.copy(g.position).sub(h.pos).applyQuaternion(_hq), lo = o.length();\n"
    "          if (lo > 0.3) o.multiplyScalar(0.3 / lo);\n"
    "          const q = _hq.multiply(g.quaternion);\n"
    "          T.rec.hoLocal = { o: [+o.x.toFixed(3), +o.y.toFixed(3), +o.z.toFixed(3)], q: [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)] };\n"
    "          ctx.send({ a: 'grab', hand: k, item: T.rec.id, o: T.rec.hoLocal.o, q: T.rec.hoLocal.q });\n"
    "        }")
# the let-go: where the thing is, how it faces, how fast the hand moves
rep("    const T = findTarget(k), yaw = handYaw(h.quat, held ? held.yaw : H.ghostYaw);\n    ctx.send({ a: 'release', hand: k, p: [+h.pos.x.toFixed(3), +h.pos.y.toFixed(3), +h.pos.z.toFixed(3)], yaw: +yaw.toFixed(3) });",
    "    const T = findTarget(k);\n"
    "    let yaw = handYaw(h.quat, held ? held.yaw : H.ghostYaw);\n"
    "    if (held && held.hq) { _eu.setFromQuaternion(held.hq, 'YXZ'); yaw = _eu.y; }\n"
    "    const at_ = held && !T.slot ? held : h.pos, vv = H.vel || _nk.set(0, 0, 0);\n"
    "    ctx.send({ a: 'release', hand: k, p: [+at_.x.toFixed(3), +at_.y.toFixed(3), +at_.z.toFixed(3)], yaw: +yaw.toFixed(3), v: [+vv.x.toFixed(2), +vv.y.toFixed(2), +vv.z.toFixed(2)] });\n"
    "    if (held) { held.hoLocal = null; }")
rep("  const _hq = new THREE.Quaternion();", "  const _hq = new THREE.Quaternion(), _eu = new THREE.Euler();")
# the snapshot: the hold of a held thing, flying
rep("      r.pour = !!(it.state && it.state.pour); r.slot = it.slot ?? null; r.shaken = !!(it.state && it.state.shake);",
    "      r.pour = !!(it.state && it.state.pour); r.slot = it.slot ?? null; r.shaken = !!(it.state && it.state.shake);\n"
    "      r.ho = it.ho || null; r.fly = !!it.fly;\n"
    "      if (it.holder == null) r.hoLocal = null;")
# hand speed, the belt running, the purple lamp light
rep("    // taking the product: held at the mouth for a moment (a joint smokes while it gets there)",
    """    // how fast each hand moves (for throwing)
    for (let j = 0; j < 2; j++) {
      const k = HK[j], H = hand[k], h = ctx.hands[k];
      if (!h || dt <= 0) continue;
      if (!H.vel) { H.vel = new THREE.Vector3(); H.vp = h.pos.clone(); continue; }
      _v.copy(h.pos).sub(H.vp).divideScalar(dt);
      H.vel.lerp(_v, Math.min(1, dt * 25));
      H.vp.copy(h.pos);
    }
    // the belt runs
    if (beltSt && beltSt.live && beltSt.on) {
      const rub = beltSt.live.userData.rubber || (beltSt.live.userData.rubber = (() => { let m = null, i = 0; beltSt.live.traverse(o => { if (o.isMesh && i++ === 1) m = o.material; }); if (m && m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; } return m; })());
      if (rub && rub.map) rub.map.offset.y = (rub.map.offset.y - dt * 0.35) % 1;
    }
    // the purple grow lamp lights the cellar
    if (uvLight) uvLight.intensity += ((uvOn && myLevel === 1 ? 2.6 : 0) - uvLight.intensity) * Math.min(1, dt * 4);

    // taking the product: held at the mouth for a moment (a joint smokes while it gets there)""")
rep("  let fade = 0, wasLevel = 0, arrived = -9, myFx = null;",
    "  let fade = 0, wasLevel = 0, arrived = -9, myFx = null;\n"
    "  // the purple grow lamp: one light over the buckets, off until the lamp is switched on\n"
    "  let uvOn = false, uvLight = null;\n"
    "  if (growSt) {\n"
    "    uvLight = new THREE.PointLight(0xa45bff, 0, 3.4, 1.4);\n"
    "    uvLight.position.set(growSt.x + growSt.sin * 0.25, 1.75, growSt.z + growSt.cos * 0.25);\n"
    "    stationL[growSt.level >= 0 ? growSt.level : 1].add(uvLight);\n"
    "  }")
rep("    UI.career = snap.career || null;", "    UI.career = snap.career || null;\n    uvOn = !!(snap.lights && snap.lights.uv);")
# events
rep("      case 'goal': {",
    """      case 'boxed': if (has) { puff(x, y + 0.05, z, 0xe6ead8, 6, 0.3, 0.04, 0.5, 0.3); pop('BOXED', x, y + 0.2, z, '#c8f03c', false); } if (mine) ctx.haptic(lastHand, 0.6, 50); break;
      case 'belt': if (mine) ctx.haptic(lastHand, 0.4, 40); break;
      case 'oven_in': if (has) puff(x, y + 0.05, z, 0xff8a2a, 5, 0.3, 0.05, 0.6, 0.4); break;
      case 'dip': if (has) puff(x, y, z, 0xb3261b, 4, 0.2, 0.03, 0.4, 0.2); if (mine) ctx.haptic(lastHand, 0.5, 40); break;
      case 'spill': if (has) puff(x, y, z, 0x5a2a14, 5, 0.4, 0.03, 0.5, -0.3); if (mine) ctx.haptic(lastHand, 0.3, 60); break;
      case 'thrown': break;
      case 'landed': if (has) puff(x, y + 0.03, z, 0xb9bcb0, 4, 0.3, 0.04, 0.4, 0.2); break;
      case 'lights': if (mine) ctx.haptic(lastHand, 0.6, 50); break;
      case 'goal': {""")
rep("        } else if (r.kind === 'box' && r.n && near(r.x, r.z, 1.6)) {",
    "        } else if (r.kind === 'box' && r.n && near(r.x, r.z, 1.6) && r.mode !== M_MINE) {")
rep("          label(`${r.n.length} / ${start.lab?.box ?? 15}`, Object.entries(cnt).map(([q, v]) => `${v} ${(NAME[q] || q).toLowerCase()}`).join(' · '), r.x, r.y + 0.42, r.z, 1.2);",
    "          label(`${r.n.length} / ${start.lab?.box ?? 15}`, Object.entries(cnt).map(([q, v]) => `${v} ${(NAME[q] || q).toLowerCase()}`).join(' · '), r.x, r.y + 0.56, r.z, 1.2);")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('scene 1.5 patched,', n, 'edits')

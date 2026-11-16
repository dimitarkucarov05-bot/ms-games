// The waiting room's shooting range: something to do while the others put their headsets on.
// Six Sci-Fi Space wall plates hang on the hub's right wall as targets. Point a controller at the wall and a Synty pistol
// appears in that hand; the trigger fires (real 9 mm shot, haptic kick), a hit plate flips with a metal clang.
// A round is 30 s from the first shot; the best score of this headset stays (localStorage) and goes to the server.
// The only text is bold white on the wall above the plates: the score and the best.
//
//   const range = createRange({ THREE, root, space, assets, anchor, pointer, onInput, haptic, sfx, send, hold });
//   range.update(dt); range.dispose()
//   anchor: { x0 (the wall's inner face x), z0, z1, ry }   hold(side) -> Object3D the pistol is attached to (controller)

import { makeText } from './text.js';

const SCI = 'sci-fi-space-pack';
const ROUND = 30;      // seconds
const PLATES = ['SM_Prop_Wall_Panel_Small_01', 'SM_Prop_Wall_Panel_Small_02', 'SM_Prop_Wall_Panel_Small_03'];

export function createRange({ THREE, root, space, assets, anchor, pointer, onInput, haptic, sfx, send, hold, material }) {
  const group = new THREE.Group();
  group.name = 'range';
  root.add(group);
  const wallX = anchor.x0;
  const targets = [];
  const board = makeText(THREE, 4.4, 0.62, 400, { depthTest: true, order: 3 });
  board.mesh.position.set(wallX - 0.05, 2.9, (anchor.z0 + anchor.z1) / 2);
  board.mesh.rotation.y = -Math.PI / 2;
  group.add(board.mesh);
  let best = Number(localStorage.getItem('msgames.rangeBest') || 0) || 0;
  let score = 0, endsAt = 0, shownSig = '', disposed = false;
  const guns = { l: null, r: null };
  const tracer = (() => {
    const g = new THREE.BoxGeometry(0.006, 0.006, 1); g.translate(0, 0, -0.5);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfce343, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.frustumCulled = false; space.add(m); return m;
  })();

  (async () => {
    try { await assets.loadPack(SCI); } catch { return; }
    const zs = [0, 1, 2].map(i => anchor.z0 + (anchor.z1 - anchor.z0) * (i + 0.5) / 3);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
      const name = PLATES[(i + row) % 3];
      if (!assets.info(SCI, name) || disposed) continue;
      const o = await assets.get(SCI, name);
      if (material) o.traverse(m => { if (m.isMesh) m.material = material; });
      const pivot = new THREE.Group();      // the plate swings around its top edge when it is hit
      pivot.position.set(wallX - 0.02, (row ? 1.95 : 1.25) + 0.25, zs[i] + (row ? 0.35 : -0.35));
      pivot.rotation.y = -Math.PI / 2;      // the plate faces -X, into the hall
      o.position.set(0, -0.25, 0);
      pivot.add(o);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, -0.25, 0.1);
      pivot.add(hit);
      group.add(pivot);
      targets.push({ pivot, hit, down: 0, swing: 0 });
    }
    if (assets.info(SCI, 'SM_Wep_Pistol_01')) for (const side of ['l', 'r']) {
      const p = await assets.get(SCI, 'SM_Wep_Pistol_01');
      if (material) p.traverse(m => { if (m.isMesh) m.material = material; });
      const d = assets.info(SCI, 'SM_Wep_Pistol_01');
      const g = new THREE.Group();
      // the pistol is modelled barrel along +Z; the controller points along -Z: turn it round, grip under the hand
      p.rotation.y = Math.PI;
      p.position.set(0, -0.03 - (d ? (d.min[1] + d.max[1]) / 2 : 0) * 0.3, 0.06);
      g.add(p); g.visible = false;
      guns[side] = g;
    }
    draw();
  })();

  const ray = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(), w = new THREE.Vector3();
  /** Is this hand aiming at the range wall? Returns the hit target (or true for the wall) and the distance. */
  function aim(side) {
    if (!pointer(side, o, d)) return null;
    root.updateMatrixWorld();
    // the wall area of the range, in world space: a plane at x = wallX in the hall, between z0 and z1, 0.6 to 2.6 m high
    ray.set(o, d); ray.far = 14;
    const hits = ray.intersectObjects(targets.map(t => t.hit), false);
    if (hits[0]) return { t: targets.find(t => t.hit === hits[0].object), dist: hits[0].distance };
    const inv = root.matrixWorld.clone().invert(), lo = o.clone().applyMatrix4(inv), ld = d.clone().transformDirection(inv);
    if (ld.x <= 0.2) return null;
    const k = (wallX - lo.x) / ld.x, y = lo.y + ld.y * k, z = lo.z + ld.z * k;
    if (k > 0 && y > 0.5 && y < 2.8 && z > anchor.z0 - 0.5 && z < anchor.z1 + 0.5) return { t: null, dist: k };
    return null;
  }

  function draw() {
    const now = Date.now(), left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
    const sig = `${score}|${best}|${left}`;
    if (sig === shownSig) return;
    shownSig = sig;
    board.set(endsAt ? [{ text: `${score}      0:${String(left).padStart(2, '0')}`, px: 210, weight: 900, font: 'num' }]
      : [{ text: score ? `RANGE   ${score}   BEST ${best}` : `RANGE   BEST ${best}`, px: 170, weight: 900, font: 'num' }]);
  }

  function fire(side) {
    const a = aim(side);
    if (!a) return false;
    if (!endsAt) { endsAt = Date.now() + ROUND * 1000; score = 0; }
    sfx?.play('range.shot', { gain: 0.9, rate: 0.96 + Math.random() * 0.08 });
    haptic(side, 0.9, 55);
    tracer.position.copy(o); tracer.lookAt(o.x - d.x, o.y - d.y, o.z - d.z); tracer.scale.z = a.dist; tracer.material.opacity = 0.9;
    const t = a.t;
    if (t && !t.down) {
      t.down = 1.6; t.swing = 0;
      score++;
      setTimeout(() => sfx?.play('range.hit', { gain: 0.8, rate: 0.9 + Math.random() * 0.2 }), 40);
      haptic(side, 0.4, 30);
    }
    draw();
    return true;
  }

  const off = onInput(e => { if (e.type === 'triggerdown' && !disposed) fire(e.hand); });

  return {
    get active() { return !!endsAt; },
    update(dt) {
      // the pistol shows in the hand that aims at the range wall
      for (const side of ['l', 'r']) {
        const g = guns[side];
        if (!g) continue;
        const h = hold(side), on = !!h && !!aim(side);
        if (on && g.parent !== h) h.add(g);
        g.visible = on;
      }
      tracer.material.opacity = Math.max(0, tracer.material.opacity - dt * 9);
      tracer.visible = tracer.material.opacity > 0.01;
      for (const t of targets) {
        if (t.down > 0) { t.down -= dt; t.swing = Math.min(1, t.swing + dt * 7); } else t.swing = Math.max(0, t.swing - dt * 3);
        t.pivot.rotation.x = -t.swing * 1.45;      // the plate swings back on its top edge, then comes down again
      }
      if (endsAt && Date.now() >= endsAt) {
        endsAt = 0;
        if (score > best) { best = score; localStorage.setItem('msgames.rangeBest', String(best)); sfx?.play('range.best'); haptic('l', 0.8, 200); haptic('r', 0.8, 200); }
        send({ type: 'rangeScore', score, best });
      }
      draw();
    },
    dispose() {
      disposed = true; off?.();
      for (const g of Object.values(guns)) g?.removeFromParent();
      tracer.removeFromParent(); tracer.geometry.dispose(); tracer.material.dispose();
      board.dispose();
      for (const t of targets) t.hit.geometry.dispose();
      root.remove(group);
    },
  };
}

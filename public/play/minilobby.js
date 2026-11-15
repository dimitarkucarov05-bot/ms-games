// Мини лоби: малък нощен лагер около зоната, в който играчите чакат преди игра и между игрите.
// Само оригинални модели на Synty в естествен размер (пакетът Apocalypse); подът е тъмен асфалт, който се стапя в тъмното.
//
//   createMiniLobby({ THREE, root, assets, hall }) → { group, update(dt, t), dispose() }
//
// Ако нещо липсва, лобито просто остава по-празно: страницата и игрите не зависят от него.

import { createFire } from './lib/fire.js';

const APO = 'apocalypse-pack';

export async function createMiniLobby({ THREE, root, assets, hall, rooms }) {
  const group = new THREE.Group();
  group.name = 'mini-lobby';
  root.add(group);
  const geos = [], mats = [];
  const hw = Math.max(1.2, (hall?.w || 4) / 2), hd = Math.max(1.2, (hall?.d || 4) / 2);
  // кутията около цялата зона (всички стаи): лагерът стои извън нея, каквато и да е формата ѝ
  const list = Array.isArray(rooms) && rooms.length ? rooms.filter(r => [r.x, r.z, r.w, r.d].every(Number.isFinite)) : [];
  const bx0 = list.length ? Math.min(...list.map(r => r.x - r.w / 2)) : -hw, bx1 = list.length ? Math.max(...list.map(r => r.x + r.w / 2)) : hw;
  const bz0 = list.length ? Math.min(...list.map(r => r.z - r.d / 2)) : -hd, bz1 = list.length ? Math.max(...list.map(r => r.z + r.d / 2)) : hd;
  const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;

  // подът: кръг асфалт, по-светъл под краката и черен към края
  {
    const R = 18, seg = 48, rings = 7, pos = [0, 0, 0], col = [], idx = [];
    const c0 = new THREE.Color(0x2e302a), c1 = new THREE.Color(0x131411), c = new THREE.Color();
    col.push(c0.r, c0.g, c0.b);
    for (let r = 1; r <= rings; r++) for (let s = 0; s < seg; s++) {
      const a = s / seg * Math.PI * 2, rr = R * r / rings;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      c.copy(c0).lerp(c1, Math.min(1, Math.pow(r / rings, 0.7)));
      col.push(c.r, c.g, c.b);
    }
    for (let s = 0; s < seg; s++) idx.push(0, 1 + (s + 1) % seg, 1 + s);
    for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
      const a = 1 + (r - 1) * seg + s, b = 1 + (r - 1) * seg + (s + 1) % seg, d = 1 + r * seg + s, e = 1 + r * seg + (s + 1) % seg;
      idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(g, m);
    floor.position.set(mx, -0.006, mz);
    floor.renderOrder = -5;
    group.add(floor);
    geos.push(g); mats.push(m);
  }

  // лагерът около зоната
  const made = [];
  const fireGeos = new Map();
  /** Пламъкът е оригиналният модел на Synty, оцветен по височина: светло жълто в основата, тъмно оранжево на върха. */
  function fireGeo(mesh) {
    let g = fireGeos.get(mesh.geometry.uuid);
    if (g) return g;
    g = mesh.geometry.clone();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), ys = new Float32Array(pos.count), p = new THREE.Vector3();
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); ys[i] = p.y; y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    for (let i = 0; i < pos.count; i++) { const k = (ys[i] - y0) / ((y1 - y0) || 1); col[i * 3] = 1; col[i * 3 + 1] = 0.9 - 0.62 * k; col[i * 3 + 2] = 0.5 - 0.44 * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    fireGeos.set(mesh.geometry.uuid, g);
    return g;
  }
  let fire = null;
  let flame = null;      // огънят във варела (lib/fire.js)
  try {
    await assets.loadPack(APO);
    const info = name => assets.info(APO, name);
    const put = async (name, x, z, ry = 0, y = 0) => {
      const d = info(name);
      if (!d) return null;
      const o = await assets.get(APO, name);
      const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2, c = Math.cos(ry), s = Math.sin(ry);
      o.position.set(x - (cx * c + cz * s), y + (d.min[1] < -0.3 ? -d.min[1] : 0), z - (-cx * s + cz * c));
      o.rotation.y = ry;
      made.push(o);
      return d;
    };
    const L = bx0 - 1.3, Rt = bx1 + 1.3, B = bz0 - 1.3, F = bz1 + 1.3;      // на 1.3 м извън зоната: ляво, дясно, отзад, отпред
    await put('SM_Bld_Quarantine_Tent_01', mx, B - 3.6, 0);                 // голямата палатка зад зоната
    await put('SM_Prop_Tent_Dome_Damaged_01', L - 1.6, B - 0.4, 0.6);
    await put('SM_Prop_Sandbag_Wall_02', L, mz - 1.2, 0);
    await put('SM_Prop_Sandbag_Wall_End_01', L, mz + 1.2, 0);
    await put('SM_Prop_Sandbag_Wall_02', Rt, mz + 1.4, Math.PI);
    await put('SM_Prop_Crate_01', L - 0.2, F + 0.2, 0.3);
    await put('SM_Prop_Crate_03', L + 1.0, F + 0.5, -0.4);
    await put('SM_Prop_BarrelStack_01', Rt + 0.6, F + 0.4, 0.5);
    await put('SM_Prop_Generator_01', Rt + 0.3, B + 0.2, 0.9);
    await put('SM_Prop_Floodlights_02', Rt - 0.1, B - 0.6, -0.6);
    await put('SM_Prop_Camp_Chair_01', Rt + 0.9, mz - 1.4, -1.9);
    await put('SM_Prop_Camp_Chair_01', Rt + 1.5, mz - 0.2, -2.4);
    await put('SM_Prop_Sleeping_Bag_01', L - 1.4, mz + 2.4, 1.2);
    await put('SM_Prop_Tire_Pile_01', L - 0.6, B + 0.1, 0.4);
    // огънят във варел: топлата светлина на лагера
    const fx = Rt + 1.9, fz = mz - 1.0;
    const barrel = info('SM_Prop_Barrel_Open_01') ? await assets.get(APO, 'SM_Prop_Barrel_Open_01') : null;
    if (barrel) {
      barrel.position.set(fx, 0, fz);
      made.push(barrel);
      const light = new THREE.PointLight(0xff8a3c, 10, 15, 1.4);
      light.position.set(fx, 1.5, fz);
      group.add(light);
      fire = light;
      if (info('SM_Flame_FX')) {
        flame = createFire(THREE, await assets.get(APO, 'SM_Flame_FX'), { count: 22, sparks: 6 });
        if (flame) { flame.mesh.position.set(fx, 0.9, fz); group.add(flame.mesh); }
      }
    }
    if (made.length) {
      const merged = assets.merge(made);
      merged.name = 'lobby-props';
      merged.traverse(m => { if (m.isMesh) geos.push(m.geometry); });
      group.add(merged);
    }
  } catch (e) { console.warn('[lobby] the camp did not load:', e?.message || e); }

  let time = 0;
  function update(dt, t) {
    time = t ?? time + dt;
    if (fire) fire.intensity = 10 * (0.74 + 0.16 * Math.sin(time * 11.3) + 0.1 * Math.sin(time * 23.7));
    if (flame) flame.update(dt);
  }
  function dispose() {
    root.remove(group);
    for (const g of geos) g.dispose();
    for (const g of fireGeos.values()) g.dispose();
    for (const m of mats) m.dispose();
    fire?.dispose?.();
    flame?.dispose();
  }
  return { group, update, dispose };
}

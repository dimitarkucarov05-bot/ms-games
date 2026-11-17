// The Motel's intro scene (and the waiting room with ?lobby=camp): a night camp in a forest clearing around the play zone.
// The hub (lobby/hub.js) moves the players here when a Motel countdown starts; the gate opens on GO, into the game.
// Ahead (-Z) the exit: a wooden fence with a double gate and a broken road into the dark (the gate opens on GO);
// between the player and the gate the vote stations (lobby/vote.js); on the left the record board (lobby/room.js)
// under a work light; on the right the fire barrel with chairs; behind the big quarantine tent and supplies.
// Only original Synty models at natural size; the ground is Synty dirt and grass pieces, the horizon a ring of Alpine
// tree cards in fog; night light: moon, the fire (the only shadow, rendered once), two work lights.
//
//   createMiniLobby({ THREE, root, assets, hall, rooms, scene, lights: {hemi, sun}, refreshShadows })
//     -> { group, bounds, update(dt, t), look(on), gate(open), spots: {board, vote}, fireAt(v), dispose() }
//   bounds: the box around all zone rooms in hall coordinates (lobby/room.js and lobby/vote.js place around it).
//
// If a pack is missing the camp is just emptier: the page and the games do not depend on it.

import { createFire } from './lib/fire.js';

const APO = 'apocalypse-pack', PLAZA = 'shopping-plaza-map', ALP = 'alpine-mountain-nature-biome', MIL = 'military-pack';
const NIGHT = 0x0b1016;            // sky and fog: the colour the far forest dissolves into
const FOG = 0.032;                 // FogExp2 density: about 70 % gone at 35 m

export async function createMiniLobby({ THREE, root, assets, hall, rooms, scene, lights = {}, refreshShadows, startLook = true }) {
  const group = new THREE.Group();
  group.name = 'mini-lobby';
  root.add(group);
  const geos = [], mats = [];
  const hw = Math.max(1.2, (hall?.w || 4) / 2), hd = Math.max(1.2, (hall?.d || 4) / 2);
  // the box around the whole zone (all rooms): the camp stands outside it, whatever its shape
  const list = Array.isArray(rooms) && rooms.length ? rooms.filter(r => [r.x, r.z, r.w, r.d].every(Number.isFinite)) : [];
  const bx0 = list.length ? Math.min(...list.map(r => r.x - r.w / 2)) : -hw, bx1 = list.length ? Math.max(...list.map(r => r.x + r.w / 2)) : hw;
  const bz0 = list.length ? Math.min(...list.map(r => r.z - r.d / 2)) : -hd, bz1 = list.length ? Math.max(...list.map(r => r.z + r.d / 2)) : hd;
  const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
  const L = bx0 - 1.3, Rt = bx1 + 1.3, F = bz1 + 1.3;      // 1.3 m outside the zone: left, right, behind
  const G = bz0 - 3.4;                                       // the fence with the gate, ahead

  // far ground under everything: a dark earth disc that melts into the fog (the Synty pieces lie on it)
  {
    const R = 60, seg = 48, rings = 8, pos = [0, 0, 0], col = [], idx = [];
    const c0 = new THREE.Color(0x1d1a15), c1 = new THREE.Color(NIGHT), c = new THREE.Color();
    col.push(c0.r, c0.g, c0.b);
    for (let r = 1; r <= rings; r++) for (let s = 0; s < seg; s++) {
      const a = s / seg * Math.PI * 2, rr = R * r / rings;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      c.copy(c0).lerp(c1, Math.min(1, Math.pow(r / rings, 1.4)));
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
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    const floor = new THREE.Mesh(g, m);
    floor.position.set(mx, -0.12, mz);
    floor.renderOrder = -5;
    group.add(floor);
    geos.push(g); mats.push(m);
  }

  const made = [];            // static props, merged into one mesh per material at the end
  const madeGround = [];      // ground pieces: receive the fire's shadow, cast none
  let fire = null, flame = null, gateL = null, gateR = null, gateOpen = 0, gateWant = 0;
  const fireAt = new THREE.Vector3();
  const spots = { board: null, vote: null };
  let rnd = 7;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };      // the same camp every time

  try {
    await Promise.all([APO, PLAZA, ALP, MIL].map(p => assets.loadPack(p).catch(() => null)));
    const info = (pack, name) => assets.info(pack, name);
    /** A model with its footprint centred on (x, z), standing on y. */
    const put = async (pack, name, x, z, ry = 0, y = 0, into = made) => {
      const d = info(pack, name);
      if (!d) return null;
      const o = await assets.get(pack, name);
      const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2, c = Math.cos(ry), s = Math.sin(ry);
      o.position.set(x - (cx * c + cz * s), y + (d.min[1] < -0.3 ? -d.min[1] : 0), z - (-cx * s + cz * c));
      o.rotation.y = ry;
      into.push(o);
      return o;
    };
    /** A model by its own origin (hinges, fence ends). */
    const at = async (pack, name, x, z, ry = 0, y = 0, into = made) => {
      if (!info(pack, name)) return null;
      const o = await assets.get(pack, name);
      o.position.set(x, y, z); o.rotation.y = ry;
      into.push(o);
      return o;
    };

    // ---- ground: Synty dirt tiles under the clearing, grass and dirt mounds further out, leaves at the edges ----
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) await put(PLAZA, 'SM_Gen_Env_Ground_Dirt_02', mx + i * 7.6, mz + j * 7.3, Math.floor(rand() * 4) * Math.PI / 2, -0.07, madeGround);
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2 + rand() * 0.3, r = 12 + rand() * 7;
      await put(PLAZA, k % 3 ? 'SM_Gen_Env_Ground_Grass_04' : 'SM_Gen_Env_Ground_Dirt_04', mx + Math.cos(a) * r, mz + Math.sin(a) * r, rand() * 6.28, -0.08, madeGround);
    }
    for (const [x, z, r] of [[L - 2.2, F + 1.6, 0.4], [Rt + 2.6, G - 0.8, 2.1], [L - 2.8, G - 1.2, 4.2], [Rt + 3.2, F + 2.2, 1.0]]) await put(APO, 'SM_Env_GroundLeaves_01', x, z, r, 0, madeGround);
    // the road out through the gate into the dark
    await put(APO, 'SM_Env_RoadPiece_Damaged_04', mx, G - 5.2, 0, -0.04, madeGround);
    await put(APO, 'SM_Env_RoadPiece_Damaged_04', mx + 0.3, G - 14.3, Math.PI, -0.04, madeGround);

    // ---- the exit ahead: fence across, a double gate in the middle (opens on GO) ----
    const HALF = 1.07;      // one gate leaf
    for (let k = 0; k < 3; k++) {
      await at(APO, 'SM_Prop_Fence_Wood_Straight_02', mx - HALF - 0.07 - k * 2.5, G, Math.PI / 2);
      await at(APO, 'SM_Prop_Fence_Wood_Straight_02', mx + HALF + 0.07 + k * 2.5, G, -Math.PI / 2);
    }
    await put(APO, 'SM_Prop_Fence_Wood_Post_01', mx - HALF - 0.05, G);
    await put(APO, 'SM_Prop_Fence_Wood_Post_01', mx + HALF + 0.05, G);
    if (info(APO, 'SM_Prop_Fence_Wood_Gate_01')) {      // the two leaves stay separate meshes: they swing
      gateL = await assets.get(APO, 'SM_Prop_Fence_Wood_Gate_01'); gateL.position.set(mx - HALF, 0, G); gateL.rotation.y = Math.PI / 2;
      gateR = await assets.get(APO, 'SM_Prop_Fence_Wood_Gate_01'); gateR.position.set(mx + HALF, 0, G); gateR.rotation.y = -Math.PI / 2;
      for (const g of [gateL, gateR]) { g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); group.add(g); }
    }
    await put(APO, 'SM_Prop_Barricade_Corrugated_01', mx - HALF - 7.9, G + 0.2, 0.2);
    await put(APO, 'SM_Prop_Barricade_Corrugated_01', mx + HALF + 7.8, G - 0.1, -0.15);

    // ---- left: sandbags in front of the record board (lobby/room.js puts the board at L - 0.9) ----
    await put(APO, 'SM_Prop_Sandbag_Wall_02', L, mz - 1.3, 0);
    await put(APO, 'SM_Prop_Sandbag_Wall_End_01', L, mz + 1.6, 0);
    await put(APO, 'SM_Prop_Crate_01', L - 0.4, F + 0.2, 0.3);
    await put(APO, 'SM_Prop_Crate_03', L + 0.9, F + 0.6, -0.4);
    await put(APO, 'SM_Prop_Tent_Dome_Damaged_01', L - 2.4, F + 1.2, 0.6);
    await put(APO, 'SM_Prop_Tire_Pile_01', L - 1.4, G + 1.0, 0.4);

    // ---- right: the fire barrel with chairs, a barrel stack, the generator ----
    const fx = Rt + 1.5, fz = mz - 0.2;
    await put(APO, 'SM_Prop_Camp_Chair_01', fx - 0.9, fz - 1.0, -2.4);
    await put(APO, 'SM_Prop_Camp_Chair_01', fx + 1.1, fz - 0.7, 2.2);
    await put(APO, 'SM_Prop_Camp_Chair_01', fx + 0.2, fz + 1.3, 0.1);
    await put(APO, 'SM_Prop_Sleeping_Bag_01', fx + 1.6, fz + 2.2, 1.2);
    await put(APO, 'SM_Prop_BarrelStack_01', Rt + 0.4, G + 1.1, 0.5);
    await put(APO, 'SM_Prop_Generator_01', Rt + 0.6, F + 0.6, 0.9);

    // ---- behind: the big tent and supplies ----
    await put(APO, 'SM_Bld_Quarantine_Tent_01', mx, F + 3.9, Math.PI);
    await put(APO, 'SM_Prop_Crate_Wall_01', mx + 4.6, F + 2.0, -0.3);
    await put(APO, 'SM_Prop_Pallet_01', mx - 4.3, F + 1.6, 0.2);

    // ---- the horizon: Alpine tree cards in a ring, alpha-tested (merging plain would draw the cards as sheets) ----
    const cards = new Map();
    const cardMat = img => {
      if (!cards.has(img)) {
        const t = new THREE.TextureLoader().load(`/play/assets/synty/${ALP}/tex/${img}`);
        t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
        const m = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
        cards.set(img, m); mats.push(m);
      }
      return cards.get(img);
    };
    const trees = [];
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + rand() * 0.2, r = 27 + rand() * 6;
      const o = await put(ALP, k % 2 ? 'SM_Env_Background_Trees_01' : 'SM_Env_Background_Trees_02', mx + Math.cos(a) * r, mz + Math.sin(a) * r, -a - Math.PI / 2, 0, trees);
      // the pack lists the two textures per material slot (Card = pine04, the trunk sheet = TreePine_02)
      const slots = (info(ALP, k % 2 ? 'SM_Env_Background_Trees_01' : 'SM_Env_Background_Trees_02')?.materials || []).map(x => String(x.image || 'TreePine_02.tga').replace(/\.(tga|psd)$/i, '.png'));
      let mi = 0;
      o?.traverse(m => {
        if (!m.isMesh) return;
        if (Array.isArray(m.material)) m.material = m.material.map((_, i) => cardMat(slots[i] || 'TreePine_02.png'));
        else m.material = cardMat(slots[mi++] || 'TreePine_02.png');
      });
    }
    if (trees.length) { const t = assets.merge(trees); t.name = 'lobby-trees'; t.traverse(m => { if (m.isMesh) geos.push(m.geometry); }); group.add(t); }

    // ---- the fire: barrel, Synty flame (lib/fire.js), one warm light that casts the camp's only shadow ----
    const barrel = info(APO, 'SM_Prop_Barrel_Open_01') ? await assets.get(APO, 'SM_Prop_Barrel_Open_01') : null;
    if (barrel) {
      barrel.position.set(fx, 0, fz);
      made.push(barrel);
      fireAt.set(fx, 1.1, fz);
      const light = new THREE.PointLight(0xff8a3c, 14, 16, 1.3);
      light.position.set(fx, 1.45, fz);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004; light.shadow.camera.near = 0.3; light.shadow.camera.far = 16;
      group.add(light);
      fire = light;
      if (info(APO, 'SM_Flame_FX')) {
        flame = createFire(THREE, await assets.get(APO, 'SM_Flame_FX'), { count: 22, sparks: 6 });
        if (flame) { flame.mesh.position.set(fx, 0.9, fz); group.add(flame.mesh); }
      }
    }

    // ---- two work lights: the board and the vote row/gate are always readable ----
    const lamp = async (x, z, tx, ty, tz, color, intensity, angle) => {
      const ry = Math.atan2(tx - x, tz - z);
      await put(MIL, 'SM_Prop_Light_Portable_01', x, z, ry);
      const s = new THREE.SpotLight(color, intensity, 12, angle, 0.55, 1.1);
      s.position.set(x, 1.25, z); s.target.position.set(tx, ty, tz);
      group.add(s, s.target);
      return s;
    };
    spots.board = await lamp(bx0 - 0.5, mz + 2.3, L - 0.9, 1.2, mz + 0.2, 0xfff1d6, 26, 0.5);
    spots.vote = await lamp(bx1 + 0.4, bz0 - 0.2, mx, 0.9, bz0 - 1.3, 0xfff1d6, 30, 0.62);

    if (madeGround.length) { const g = assets.merge(madeGround); g.name = 'lobby-ground'; g.traverse(m => { if (m.isMesh) { m.receiveShadow = true; geos.push(m.geometry); } }); group.add(g); }
    if (made.length) {
      const merged = assets.merge(made);
      merged.name = 'lobby-props';
      merged.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; geos.push(m.geometry); } });
      group.add(merged);
    }
  } catch (e) { console.warn('[lobby] the camp did not load:', e?.message || e); }

  // ---- night look: fog, sky colour, moonlight (restored when a game takes over) ----
  const saved = { fog: null, bg: null, hemi: null, sun: null };
  let lookOn = false;
  function look(on) {
    if (on === lookOn || !scene) return;
    lookOn = on;
    const { hemi, sun } = lights;
    if (on) {
      saved.fog = scene.fog; saved.bg = scene.background;
      saved.hemi = hemi ? [hemi.intensity, hemi.color.getHex(), hemi.groundColor.getHex()] : null;
      saved.sun = sun ? [sun.intensity, sun.color.getHex(), sun.position.clone()] : null;
      scene.fog = new THREE.FogExp2(NIGHT, FOG);
      scene.background = new THREE.Color(NIGHT);
      if (hemi) { hemi.intensity = 0.8; hemi.color.set(0x5f7594); hemi.groundColor.set(0x16120e); }
      if (sun) { sun.intensity = 0.42; sun.color.set(0x9db4dc); sun.position.set(-4, 9, -6); }
      refreshShadows?.();
    } else {
      scene.fog = saved.fog; scene.background = saved.bg;
      if (hemi && saved.hemi) { hemi.intensity = saved.hemi[0]; hemi.color.setHex(saved.hemi[1]); hemi.groundColor.setHex(saved.hemi[2]); }
      if (sun && saved.sun) { sun.intensity = saved.sun[0]; sun.color.setHex(saved.sun[1]); sun.position.copy(saved.sun[2]); }
    }
  }
  if (startLook) look(true);      // built ahead as The Motel's intro: its look waits until the player is moved into it
  // the shadow is drawn once (nothing in the camp moves except the gate); a frame later the matrices are in place
  setTimeout(() => refreshShadows?.(), 300);

  let time = 0;
  function update(dt, t) {
    time = t ?? time + dt;
    if (fire) fire.intensity = 14 * (0.78 + 0.13 * Math.sin(time * 11.3) + 0.09 * Math.sin(time * 23.7 + 1.3));
    if (flame) flame.update(dt);
    if (gateL && Math.abs(gateWant - gateOpen) > 0.001) {      // the gate swings outward, eased
      gateOpen += Math.sign(gateWant - gateOpen) * Math.min(Math.abs(gateWant - gateOpen), dt * 1.3);
      const e = gateOpen * gateOpen * (3 - 2 * gateOpen) * 1.75;
      gateL.rotation.y = Math.PI / 2 + e; gateR.rotation.y = -Math.PI / 2 - e;
    }
  }
  function dispose() {
    look(false);
    root.remove(group);
    for (const g of geos) g.dispose();
    for (const m of mats) { m.map?.dispose(); m.dispose(); }
    fire?.dispose?.(); fire?.shadow?.dispose?.();
    flame?.dispose();
  }
  return {
    group, update, dispose, look, spots,
    bounds: { bx0, bx1, bz0, bz1, mx, mz, gateZ: G },
    /** Opens (true) or closes the exit gate: it opens with GO, the way into the game. */
    gate(open) { gateWant = open ? 1 : 0; },
    /** The fire's place in world coordinates (for the crackle loop). */
    fireAt(v) { if (!fire) return null; return v.copy(fireAt).applyMatrix4(group.matrixWorld); },
  };
}

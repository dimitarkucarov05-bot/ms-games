// MS Games lobby: the shared hub every headset waits in between games and every game launches from.
// A station hall from Synty's Sci-Fi Space Pack (natural size, 5 m modules) around the play zone, in the brand colours:
// the pack's own grey-and-green texture variant (Texture_03_F) with its green emissive (Emissive_02), the pack's teal
// nebula skybox (Skybox_03) through the windows, white key light, green fill, yellow accents at the portals.
//
//   Ahead (-Z): the portal wall. One door frame per installed game (its light strips pulse yellow), its key art lit in
//   the display of the wall module beside it (SM_Bld_Wall_04); the record board in the other display.
//   Left (-X): windows onto space.   Right (+X): the shooting range (lobby/range.js) against the wall.
//   Behind (+Z): lift, seats, plants.   Floor: the M mark (the owner's brand art) under the zone centre.
//   The vote crates stand between the zone and the portal wall; the record board hangs on the portal wall.
//
//   createHub({ THREE, root, assets, hall, rooms, scene, lights, refreshShadows, games })
//     -> { group, bounds, update(dt, t), look(on), spots: {vote}, portals: [{gameId, x, z, open(on)}], anchors, dispose() }

const SCI = 'sci-fi-space-pack', APO = 'apocalypse-pack';
const TEX = 'tex/PolygonSciFiSpace_Texture_03_F.png', EMI = 'tex/PolygonSciFiSpace_Emissive_02.png';
const SKY = 'PolygonSciFiSpace_Skybox_03_';
const M = 5;                                    // the pack's module
const DISPLAY = { y: 1.66, w: 2.92, h: 1.48 };   // the display opening of SM_Bld_Wall_04 (measured on the model)
export const BRAND = { green: 0x43d066, deep: 0x007f35, yellow: 0xfce343, white: 0xf2f7ee, base: 0x050f08 };

/** The placeholder M mark (option C "Stack" from public/brand/options.html) as a canvas, until public/brand/mark.svg exists. */
function stackMark(size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), k = size / 128, oy = (128 - 112) / 2 * k;
  const path = (d, fill) => { g.fillStyle = fill; g.fill(new Path2D(d)); };
  g.setTransform(k, 0, 0, k, 0, oy);
  path('M4 108 L4 4 L26 4 L64 52 L102 4 L124 4 L124 108 L102 108 L102 46 L64 94 L26 46 L26 108 Z', '#f2f7ee');
  path('M4 108 L4 4 L26 4 L26 108 Z', '#43d066');
  path('M102 108 L102 4 L124 4 L124 108 Z', '#fce343');
  return c;
}

export async function createHub({ THREE, root, assets, hall, rooms, scene, lights = {}, refreshShadows, games = [] }) {
  const group = new THREE.Group();
  group.name = 'hub';
  root.add(group);
  const disposables = [];
  const hw = Math.max(1.2, (hall?.w || 4) / 2), hd = Math.max(1.2, (hall?.d || 4) / 2);
  const list = Array.isArray(rooms) && rooms.length ? rooms.filter(r => [r.x, r.z, r.w, r.d].every(Number.isFinite)) : [];
  const bx0 = list.length ? Math.min(...list.map(r => r.x - r.w / 2)) : -hw, bx1 = list.length ? Math.max(...list.map(r => r.x + r.w / 2)) : hw;
  const bz0 = list.length ? Math.min(...list.map(r => r.z - r.d / 2)) : -hd, bz1 = list.length ? Math.max(...list.map(r => r.z + r.d / 2)) : hd;
  const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
  // the hall: whole 5 m modules, at least 3 x 3, with room for the vote row ahead (3.2 m) and the range on the right
  const nx = Math.max(3, Math.ceil((bx1 - bx0 + 6) / M)), nz = Math.max(3, Math.ceil((bz1 - bz0 + 6.4) / M));
  const X0 = mx - nx * M / 2, X1 = X0 + nx * M;
  const Z0 = Math.min(bz0 - 3.4, mz - nz * M / 2), Z1 = Z0 + nz * M;      // Z0: the portal wall
  const made = [], glow = [], doorParts = [];
  let rnd = 11;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };

  // one shared material for the whole station: the green variant with its green emissive (light strips glow)
  const texLoader = new THREE.TextureLoader();
  const tex = (p, srgb = true) => { const t = texLoader.load(`/play/assets/synty/${SCI}/${p}`); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; disposables.push(t); return t; };
  const mat = new THREE.MeshLambertMaterial({ map: tex(TEX), emissiveMap: tex(EMI), emissive: 0xffffff, emissiveIntensity: 1.2 });
  disposables.push(mat);
  // the portal doors: the same texture, their own emissive that pulses slowly in the brand yellow
  const doorMat = mat.clone(); doorMat.emissive = new THREE.Color(0xfce343); disposables.push(doorMat);
  const dress = o => { o.traverse(m => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(() => mat) : mat; }); return o; };

  let spotVote = null;
  const portals = [];
  const anchors = {};
  try {
    await Promise.all([assets.loadPack(SCI), assets.loadPack(APO).catch(() => null)]);
    const has = n => !!assets.info(SCI, n);
    /** A module by its own origin (the pack's pieces start at their corner). */
    const at = async (n, x, z, ry = 0, y = 0, into = made, pack = SCI) => {
      if (!assets.info(pack, n)) return null;
      const o = await assets.get(pack, n);
      if (pack === SCI) dress(o);
      o.position.set(x, y, z); o.rotation.y = ry;
      into.push(o);
      return o;
    };
    /** A prop with its footprint centred on (x, z). */
    const put = async (n, x, z, ry = 0, y = 0, into = made, pack = SCI) => {
      const d = assets.info(pack, n);
      if (!d) return null;
      const o = await assets.get(pack, n);
      if (pack === SCI) dress(o);
      const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2, c = Math.cos(ry), s = Math.sin(ry);
      o.position.set(x - (cx * c + cz * s), y - d.min[1], z - (-cx * s + cz * c));
      o.rotation.y = ry;
      into.push(o);
      return o;
    };

    // ---- floor and ceiling ----
    const floors = ['SM_Bld_Floor_01', 'SM_Bld_Floor_08', 'SM_Bld_Floor_09', 'SM_Bld_Floor_04'].filter(has);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const centre = Math.abs(X0 + (i + 0.5) * M - mx) < M / 2 && Math.abs(Z0 + (j + 0.5) * M - mz) < M / 2;
      await at(centre ? 'SM_Bld_Floor_08' : floors[(i * 3 + j * 5) % floors.length], X0 + i * M, Z0 + j * M);
      if (has('SM_Bld_Ceiling_01')) await at('SM_Bld_Ceiling_01', X0 + i * M, Z0 + j * M, 0, 0);
    }
    // ---- walls: modules along each side; the frame of each wall piece runs along +X from its origin ----
    // ry 0: along +X at z; PI: along -X; PI/2: along -Z; -PI/2: along +Z (the decorated face looks into the hall)
    const wallRow = async (names, side) => {
      const n = side === 'front' || side === 'back' ? nx : nz;
      for (let k = 0; k < n; k++) {
        const name = names(k, n);
        if (!name) continue;
        if (side === 'front') await at(name, X0 + k * M, Z0, 0);
        else if (side === 'back') await at(name, X0 + (k + 1) * M, Z1, Math.PI);
        else if (side === 'left') await at(name, X0, Z0 + (k + 1) * M, Math.PI / 2);
        else await at(name, X1, Z0 + k * M, -Math.PI / 2);
      }
    };
    // ahead: the portal wall. The middle module is the door of the first game; more games take the next modules.
    const mid = Math.floor(nx / 2), gameList = (games.length ? games : [{ id: 'motel', name: 'The Motel', cover: '/play/games/motel/cover.jpg' }]).slice(0, nx);
    const doorAt = k => { const d = k - mid; const i = d === 0 ? 0 : d > 0 ? d * 2 - 1 : -d * 2; return i < gameList.length ? gameList[i] : null; };
    const besideDoor = k => !doorAt(k) && (doorAt(k - 1) || doorAt(k + 1));
    const displays = {};      // module index -> the wall piece with a built-in display (Wall_04)
    for (let k = 0; k < nx; k++) {
      if (doorAt(k)) { const d = await at('SM_Bld_Wall_Doorframe_02', X0 + k * M, Z0, 0, 0, doorParts); if (d) d.traverse(m => { if (m.isMesh) m.material = doorMat; }); }
      else if (besideDoor(k) && has('SM_Bld_Wall_04')) displays[k] = await at('SM_Bld_Wall_04', X0 + k * M, Z0);
      else await at('SM_Bld_Wall_02', X0 + k * M, Z0);
    }
    await wallRow((k) => (k % 2 ? 'SM_Bld_Wall_Exterior_Window_02' : 'SM_Bld_Wall_Exterior_Window_01'), 'left');
    await wallRow(() => 'SM_Bld_Wall_05', 'right');
    await wallRow((k, n) => (k === Math.floor(n / 2) ? 'SM_Bld_Lift_Wall_01' : 'SM_Bld_Wall_06'), 'back');
    for (const [x, z] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) await put('SM_Bld_Wall_Corner_Pillar_01', x, z);

    // ---- portals: one per game; its key art lights up in the display of the wall module beside the door ----
    /** The display opening of a Wall_04 module: found by a ray from inside the hall onto the glass (hall coordinates). */
    const rc = new THREE.Raycaster();
    const displayOf = k => {
      const o = displays[k];
      if (!o) return null;
      o.updateMatrixWorld(true);
      const cx = X0 + k * M + M / 2;
      rc.set(new THREE.Vector3(cx, DISPLAY.y, Z0 + 3), new THREE.Vector3(0, 0, -1)); rc.far = 4;
      const hit = rc.intersectObject(o, true)[0];
      return { x: cx, y: DISPLAY.y, z: (hit ? hit.point.z : Z0 + 0.5) + 0.012, w: DISPLAY.w, h: DISPLAY.h };
    };
    const used = new Set();
    for (let k = 0; k < nx; k++) {
      const g = doorAt(k);
      if (!g) continue;
      const cx = X0 + k * M + M / 2;
      portals.push({ gameId: g.id, name: g.name, x: cx, z: Z0 + 0.3 });
      const side = k <= mid ? -1 : 1, slot = displays[k + side] && !used.has(k + side) ? k + side : displays[k - side] && !used.has(k - side) ? k - side : null;
      const dsp = slot != null ? displayOf(slot) : null;
      if (g.cover && dsp) {
        used.add(slot);
        const pm = new THREE.MeshBasicMaterial({ color: 0x0a170f, toneMapped: false });      // the display glows with the cover
        texLoader.load(g.cover, t => {
          t.colorSpace = THREE.SRGBColorSpace;
          const a = t.image ? t.image.width / t.image.height : 16 / 9, want = dsp.w / dsp.h;
          if (a > want) { t.repeat.set(want / a, 1); t.offset.set((1 - want / a) / 2, 0); } else { t.repeat.set(1, a / want); t.offset.set(0, (1 - a / want) / 2); }
          pm.map = t; pm.color.set(0xffffff); pm.needsUpdate = true; disposables.push(t);
        });
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(dsp.w, dsp.h), pm);
        pic.position.set(dsp.x, dsp.y, dsp.z);
        group.add(pic);
        disposables.push(pm, pic.geometry);
      }
    }
    // the record board: the first display left free
    const free = Object.keys(displays).map(Number).find(k => !used.has(k));
    if (free != null) { const d = displayOf(free); anchors.board = { x: d.x, y: d.y, z: d.z, ry: 0, w: d.w, h: d.h, display: true }; }
    // ---- comfort and life: seats and plants behind, crates by the range ----
    await put('SM_Prop_CornerSeat_01', X0 + 1.7, Z1 - 1.7, Math.PI / 2);
    await put('SM_Prop_CornerSeat_01', X1 - 1.7, Z1 - 1.7, Math.PI);
    await put('SM_Prop_Plant_Vase_02', mx - 3.2, Z1 - 0.9, 0);
    await put('SM_Prop_Plant_Vase_02', mx + 3.2, Z1 - 0.9, 0);
    await put('SM_Prop_Plant_Vase_01', X0 + 0.8, Z0 + 1.0, 0.4);
    await put('SM_Prop_Crate_Wide_01', X1 - 0.8, Z0 + 1.2, Math.PI / 2);
    await put('SM_Prop_Crate_01', X1 - 0.7, Z0 + 2.2, 0.3);
    // ceiling light panels in rows (they glow green through the emissive map)
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) await put('SM_Prop_Light_Panel_01', X0 + (i + 0.5) * M, Z0 + (j + 0.5) * M, 0, 3.88, glow);

    if (made.length) { const m = assets.merge(made); m.name = 'hub-shell'; group.add(m); m.traverse(o => { if (o.isMesh) disposables.push(o.geometry); }); }
    if (doorParts.length) { const m = assets.merge(doorParts); m.name = 'hub-portals'; group.add(m); m.traverse(o => { if (o.isMesh) disposables.push(o.geometry); }); }
    if (glow.length) { const m = assets.merge(glow); m.name = 'hub-lights'; m.traverse(o => { if (o.isMesh) disposables.push(o.geometry); }); group.add(m); }

    // ---- the M mark on the floor, under the middle of the zone ----
    const markTex = new THREE.CanvasTexture(stackMark());
    markTex.colorSpace = THREE.SRGBColorSpace; markTex.anisotropy = 4;
    const markSize = Math.min(1.15, Math.max(0.8, Math.min(bx1 - bx0, bz1 - bz0) * 0.22));
    const markMat = new THREE.MeshBasicMaterial({ map: markTex, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(markSize, markSize), markMat);
    mark.rotation.x = -Math.PI / 2; mark.position.set(mx, 0.006, Math.max(bz0 + markSize * 0.7, mz - Math.min(1.4, (bz1 - bz0) * 0.3))); mark.renderOrder = -3;      // ahead of the spawn, toward the portal; flat on purpose: a raised pad in VR is something real feet try to step on
    group.add(mark);
    disposables.push(markTex, markMat, mark.geometry);
    // the real mark replaces the placeholder as soon as S1 publishes it
    texLoader.load('/brand/mark.svg', t => { t.colorSpace = THREE.SRGBColorSpace; markMat.map = t; markMat.needsUpdate = true; disposables.push(t); }, undefined, () => {});

    // ---- light: white key, green fill along the windows, yellow at the portals, one spot over the vote row ----
    const key = new THREE.PointLight(BRAND.white, 18, 16, 1.4); key.position.set(mx, 3.6, mz); group.add(key);
    const fill = new THREE.PointLight(BRAND.green, 14, 14, 1.3); fill.position.set(X0 + 1.2, 2.8, mz); group.add(fill);
    spotVote = new THREE.SpotLight(BRAND.yellow, 40, 12, 0.6, 0.5, 1.1);
    spotVote.position.set(mx, 3.7, bz0 - 0.2); spotVote.target.position.set(mx, 0.9, bz0 - 1.4);
    group.add(spotVote, spotVote.target);
    anchors.range = { x0: X1 - 0.9, z0: mz - 3, z1: mz + 3 };
    const spotRange = new THREE.SpotLight(BRAND.yellow, 34, 11, 0.62, 0.45, 1.0);      // the range wall stands out
    spotRange.position.set(X1 - 3.4, 3.7, mz); spotRange.target.position.set(X1 - 0.9, 1.6, mz);
    group.add(spotRange, spotRange.target);
    anchors.logo = { x: mx, y: 2.9, z: Z1 - 0.5, ry: Math.PI };      // the venue logo, when set, on the back wall
    anchors.walls = { X0, X1, Z0, Z1 };
  } catch (e) { console.warn('[hub] the hall did not load:', e?.message || e); }

  // ---- look: the station's own sky (the pack's skybox through the windows), no fog ----
  const saved = { fog: null, bg: null, hemi: null, sun: null };
  let lookOn = false, sky = null;
  function look(on) {
    if (on === lookOn || !scene) return;
    lookOn = on;
    const { hemi, sun } = lights;
    if (on) {
      saved.fog = scene.fog; saved.bg = scene.background;
      saved.hemi = hemi ? [hemi.intensity, hemi.color.getHex(), hemi.groundColor.getHex()] : null;
      saved.sun = sun ? [sun.intensity, sun.color.getHex()] : null;
      if (!sky) {      // a sky box mesh, not scene.background: in passthrough sessions three skips the background
        const base = `/play/assets/synty/${SCI}/tex/${SKY}`;
        const faces = ['Right', 'Left', 'Up', 'Down', 'Front', 'Back'].map(f => {
          const t = texLoader.load(`${base}${f}.png`); t.colorSpace = THREE.SRGBColorSpace; disposables.push(t);
          const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }); disposables.push(m); return m;
        });
        sky = new THREE.Mesh(new THREE.BoxGeometry(360, 360, 360), faces);
        sky.renderOrder = -9; sky.frustumCulled = false; sky.position.set(mx, 0, mz);
        disposables.push(sky.geometry);
        group.add(sky);
      }
      sky.visible = true;
      scene.fog = null;
      scene.background = new THREE.Color(BRAND.base);
      if (hemi) { hemi.intensity = 0.9; hemi.color.set(0xdfeee4); hemi.groundColor.set(0x0d1a12); }
      if (sun) { sun.intensity = 0.35; sun.color.set(0xcfe8d6); }
      refreshShadows?.();
    } else {
      scene.fog = saved.fog; scene.background = saved.bg;
      if (hemi && saved.hemi) { hemi.intensity = saved.hemi[0]; hemi.color.setHex(saved.hemi[1]); hemi.groundColor.setHex(saved.hemi[2]); }
      if (sun && saved.sun) { sun.intensity = saved.sun[0]; sun.color.setHex(saved.sun[1]); }
    }
  }
  look(true);

  let time = 0;
  function update(dt, t) {
    time = t ?? time + dt;
    mat.emissiveIntensity = 1.1 + 0.15 * Math.sin(time * 1.3) + 0.05 * Math.sin(time * 4.1);      // the strips breathe a little
    doorMat.emissiveIntensity = 1.0 + 1.1 * (0.5 + 0.5 * Math.sin(time * 1.6));                   // the portal calls, slowly
  }
  function dispose() {
    look(false);
    root.remove(group);
    for (const d of disposables) d.dispose?.();
  }
  return {
    group, update, dispose, look, anchors, portals, hasSky: true, material: mat,
    spots: { vote: spotVote },
    bounds: { bx0, bx1, bz0, bz1, mx, mz, gateZ: Z0 },
    /** The hub has no gate: the portal of the game opens instead (play.js handles the move into the intro). */
    gate() {},
    fireAt() { return null; },
  };
}

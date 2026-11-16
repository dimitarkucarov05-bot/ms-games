// In-headset vote for the next game (party mode). One Synty object per game stands just outside the zone: an
// Apocalypse crate with a Shops art frame on it that holds the game's cover, the name in bold white text above.
// The player points a controller at one and pulls the trigger: a haptic tick, the real switch sound, and a warm
// light falls on his choice. He can change his mind until the vote ends.
//
//   const v = createVote({ THREE, root, space, assets, bounds, pointer, onInput, haptic, sfx, send, now });
//   v.set(options, endsAtLocalMs); v.end(gameId); v.clear(); v.update(dt, t)

import { makeText } from './text.js';

const APO = 'apocalypse-pack', SHOPS = 'shops-pack';
const CRATE = 'SM_Prop_Crate_01', FRAME = 'SM_Prop_Art_Frame_01';
const FRAME_IN = { w: 0.92, h: 0.70 };      // the picture opening of the frame turned landscape (measured on the model)

export function createVote({ THREE, root, space, assets, bounds, pointer, onInput, haptic, sfx, send }) {
  const group = new THREE.Group();
  group.name = 'vote';
  root.add(group);
  const light = new THREE.SpotLight(0xffc27a, 0, 8, 0.42, 0.5, 1.0);      // made once, so the shaders do not recompile when he votes
  light.position.set(0, 3.2, 0);
  group.add(light, light.target);
  const timer = makeText(THREE, 1.6, 0.3, 500, { depthTest: true, order: 3 });
  group.add(timer.mesh);

  let stations = [], chosen = null, endsAt = 0, ended = null, endAt = 0, gen = 0, lastSec = -1;
  const hover = { l: null, r: null };
  const lasers = {};
  for (const side of ['l', 'r']) {
    const g = new THREE.BoxGeometry(0.005, 0.005, 1); g.translate(0, 0, -0.5);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    m.visible = false; m.frustumCulled = false;
    lasers[side] = m;
  }
  const lroot = space || root;      // lasers live in tracking space (the scene), not in the hall
  lroot.add(lasers.l, lasers.r);

  async function build(options) {
    const my = ++gen;
    clearStations();
    if (!options.length) return;
    try { await Promise.all([assets.loadPack(APO), assets.loadPack(SHOPS)]); } catch (e) { console.warn('[vote] packs', e.message); }
    if (my !== gen) return;
    const n = options.length, gap = 1.45;
    const { bx0, bx1, bz0, mx } = bounds;
    const span = (n - 1) * gap, wide = bx1 - bx0 + 2.2;
    for (let i = 0; i < n; i++) {
      const o = options[i];
      // in a row behind the zone; more games than fit bend into a shallow arc
      let x = mx - span / 2 + i * gap, z = bz0 - 1.0, ry = 0;
      if (span > wide) { const a = (i / (n - 1) - 0.5) * Math.min(1.6, span / 3.2); x = mx + Math.sin(a) * 3.6; z = bz0 + 2.6 - Math.cos(a) * 3.6; ry = -a; }
      const st = new THREE.Group();
      st.position.set(x, 0, z); st.rotation.y = ry;
      const crate = await safeGet(APO, CRATE);
      if (crate) { crate.rotation.y = (i % 2 ? 0.08 : -0.06); st.add(crate); }
      const crateH = assets.info(APO, CRATE)?.size?.[1] || 0.82;
      const holder = new THREE.Group();                       // frame + cover, tilted back a little like it leans on something
      holder.position.set(0, crateH, 0.05);
      holder.rotation.x = -0.12;
      const frame = await safeGet(SHOPS, FRAME);
      const fi = assets.info(SHOPS, FRAME);
      if (frame) {
        // portrait frame turned landscape, standing on its long edge, picture facing +Z (the zone)
        const c = fi ? [(fi.min[0] + fi.max[0]) / 2, (fi.min[1] + fi.max[1]) / 2, (fi.min[2] + fi.max[2]) / 2] : [0, 0.55, 0];
        frame.position.set(-c[0], -c[1], -c[2]);
        const turn = new THREE.Group(); turn.rotation.z = Math.PI / 2; turn.add(frame);
        turn.position.y = (fi ? fi.size[0] : 0.91) / 2;
        holder.add(turn);
      }
      const fH = fi ? fi.size[0] : 0.91, fD = fi ? fi.size[2] : 0.05;
      if (o.cover) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x1a1b18, toneMapped: false });      // dark until the cover arrives (a missing cover stays dark, never white)
        new THREE.TextureLoader().load(o.cover, t => {
          t.colorSpace = THREE.SRGBColorSpace;
          const img = t.image, a = img ? img.width / img.height : 16 / 9, want = FRAME_IN.w / FRAME_IN.h;
          if (a > want) { t.repeat.set(want / a, 1); t.offset.set((1 - want / a) / 2, 0); } else { t.repeat.set(1, a / want); t.offset.set(0, (1 - a / want) / 2); }
          mat.map = t; mat.color.set(0xdedede); mat.needsUpdate = true;
        });
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_IN.w, FRAME_IN.h), mat);
        pic.position.set(0, fH / 2, fD / 2 + 0.004);
        holder.add(pic);
        st.userData.pic = pic;
      }
      st.add(holder);
      const label = makeText(THREE, 1.5, 0.26, 500, { depthTest: true, order: 3 });
      label.set([{ text: o.name || o.gameId, px: 96, weight: 850 }]);
      label.mesh.position.set(0, crateH + fH + 0.44, 0.05);
      st.add(label.mesh);
      const mine = makeText(THREE, 1.4, 0.26, 500, { depthTest: true, order: 3 });
      mine.mesh.position.set(0, crateH + fH + 0.17, 0.05);
      st.add(mine.mesh);
      // what the laser hits: an invisible box around crate and frame
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.25, crateH + fH + 0.2, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = (crateH + fH + 0.2) / 2;
      st.add(hit);
      Object.assign(st.userData, { gameId: o.gameId, hit, holder, label, mine, sink: 1, bob: 0 });
      group.add(st);
      stations.push(st);
    }
    timer.mesh.position.set(mx, 2.95, bz0 - 1.0);
    if (chosen) mark(chosen, false);
  }
  async function safeGet(slug, name) { try { return assets.info(slug, name) ? await assets.get(slug, name) : null; } catch { return null; } }

  function clearStations() {
    for (const st of stations) {
      st.userData.label.dispose(); st.userData.mine.dispose();
      st.userData.hit.geometry.dispose();
      const pic = st.userData.pic;
      if (pic) { pic.material.map?.dispose(); pic.material.dispose(); pic.geometry.dispose(); }
      group.remove(st);
    }
    stations = []; hover.l = hover.r = null;
    light.intensity = 0;
  }

  function mark(gameId, loud = true) {
    chosen = gameId;
    for (const st of stations) st.userData.mine.set(st.userData.gameId === gameId ? [{ text: 'YOUR VOTE', px: 120, weight: 900, font: 'num' }] : []);
    const st = stations.find(s => s.userData.gameId === gameId);
    if (st) { st.updateMatrixWorld(true); st.getWorldPosition(light.target.position); group.worldToLocal(light.target.position); light.target.position.y = 1.1; light.position.set(light.target.position.x, 3.4, light.target.position.z + 1.2); light.intensity = 60; }
    if (loud) st && (st.userData.bob = 1);
  }

  const raycaster = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
  function pick(side) {
    if (!pointer(side, o, d)) return null;
    raycaster.set(o, d); raycaster.far = 12;
    const hits = raycaster.intersectObjects(stations.map(s => s.userData.hit), false);
    return hits[0] ? { st: stations.find(s => s.userData.hit === hits[0].object), dist: hits[0].distance } : null;
  }

  const off = onInput(e => {
    if (e.type !== 'triggerdown' || !stations.length || ended) return;
    const st = hover[e.hand] || pick(e.hand)?.st;
    if (!st) return;
    const id = st.userData.gameId;
    sfx?.play('vote', { gain: 1 });
    haptic(e.hand, 0.9, 70);
    mark(id);
    send({ type: 'vote', gameId: id });
  });

  return {
    get active() { return stations.length > 0 && !ended; },
    get voted() { return chosen; },
    /** options: [{gameId, name, cover}], endsAtLocal: performance-free Date.now() based end (already corrected for clock skew). */
    set(options, endsAtLocal) {
      const list = (Array.isArray(options) ? options : []).filter(x => x && x.gameId);
      const sig = list.map(x => x.gameId).join('|');
      endsAt = Number(endsAtLocal) || 0; lastSec = -1;
      if (sig === this.sig && !ended) return;
      this.sig = sig; ended = null; chosen = null;
      build(list);
    },
    /** The winner stays lit, the other games sink into the ground. */
    end(gameId) {
      if (!stations.length || ended) return;
      ended = gameId || chosen || stations[0]?.userData.gameId; endAt = performance.now();
      mark(ended, false);
      for (const st of stations) st.userData.mine.set(st.userData.gameId === ended ? [{ text: 'NEXT GAME', px: 120, weight: 900, font: 'num' }] : []);
      sfx?.play('go', { gain: 0.9 }); haptic('l', 0.8, 150); haptic('r', 0.8, 150);
      timer.clear();
    },
    clear() { gen++; this.sig = ''; ended = null; chosen = null; clearStations(); timer.clear(); for (const s of ['l', 'r']) lasers[s].visible = false; },
    update(dt, t) {
      const live = stations.length > 0 && !ended;
      for (const side of ['l', 'r']) {
        const L = lasers[side];
        if (!live || !pointer(side, o, d)) { L.visible = false; hover[side] = null; continue; }
        const p = pick(side), st = p?.st || null;
        if (st && st !== hover[side]) { sfx?.play('hover', { gain: 0.7, rate: 0.95 + Math.random() * 0.1 }); haptic(side, 0.25, 14); }
        hover[side] = st;
        L.visible = true;
        L.position.copy(o); L.lookAt(o.x - d.x, o.y - d.y, o.z - d.z);      // the beam is built along -Z
        L.scale.z = p ? p.dist : 2.5;
        L.material.opacity = st ? 0.85 : 0.4;
      }
      for (const st of stations) {
        const u = st.userData, hot = (hover.l === st || hover.r === st) && live;
        u.bob = Math.max(0, u.bob - dt * 2.5);
        const s = (hot ? 1.05 : 1) + Math.sin(u.bob * Math.PI) * 0.06;
        u.holder.scale.setScalar(u.holder.scale.x + (s - u.holder.scale.x) * Math.min(1, dt * 12));
        if (ended && u.gameId !== ended) { u.sink = Math.max(0, u.sink - dt * 1.6); st.position.y = -(1 - u.sink) * 2.4; st.visible = u.sink > 0; }
      }
      if (live && endsAt) {
        const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        if (sec !== lastSec) {
          lastSec = sec;
          timer.set(sec > 0 ? [{ text: `Vote for the next game  ${sec}`, px: 80, weight: 850 }] : []);
          if (sec > 0 && sec <= 3) { sfx?.play('hover', { gain: 1 }); }
        }
      }
      if (ended && performance.now() - endAt > 6000) this.clear();
    },
    dispose() { off?.(); this.clear(); timer.dispose(); root.remove(group); lroot.remove(lasers.l, lasers.r); },
  };
}

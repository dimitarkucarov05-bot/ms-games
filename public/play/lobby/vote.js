// In-headset vote for the next game (party mode). One Synty object per game stands just outside the zone: an
// Apocalypse crate with a Shops art frame on it that holds the game's cover, the name in bold white text above.
// The player points a controller at one and pulls the trigger: a haptic tick, the real switch sound, and a warm
// light falls on his choice. He can change his mind until the vote ends.
//
//   const v = createVote({ THREE, root, space, assets, bounds, pointer, onInput, haptic, sfx, send, now });
//   v.set(options, endsAtLocalMs); v.end(key); v.clear(); v.update(dt, t)
//
// Options are generic (MS Games ships with one game, so a vote is often about difficulty or rounds):
//   { id?, gameId?, name, cover?, props? }  key = id ?? gameId. With a cover a Shops art frame holds it; without one the
//   crate carries real Synty things that say it (KITS: easy = machete, normal = pistol, hard = shotgun + fuel, nightmare =
//   chainsaw + propane); the name is only the floating label above. The vote goes out as { type: 'vote', id: key, gameId: gameId ?? null }.

import { makeText } from './text.js';

const APO = 'apocalypse-pack', SHOPS = 'shops-pack';
const CRATE = 'SM_Prop_Crate_01', FRAME = 'SM_Prop_Art_Frame_01';
const FRAME_IN = { w: 0.92, h: 0.70 };
const BR = 'battle-royale-pack';
// what each difficulty looks like on its crate (Synty weapons and props at natural size); a server option may bring its own
// `props: [{p, n, x, z, yaw, lay, ground}]`
const REST = { p: APO, n: 'SM_Prop_Ammo_Box_01', x: 0, z: -0.27, yaw: Math.PI / 2 };      // the box a weapon leans on, at the back of the crate
const KITS = {
  easy: [REST, { p: APO, n: 'SM_Wep_Melee_Machete_01', x: -0.04, z: -0.02, yaw: 0.06, lean: true }, { p: APO, n: 'SM_Wep_Hammer_01', x: 0.12, z: 0.24, yaw: -0.5, lay: true }],
  normal: [REST, { p: BR, n: 'SM_Wep_Pistol_Heavy_01', x: -0.05, z: -0.03, yaw: 0.0, lean: true }, { p: BR, n: 'SM_Wep_Pistol_Ammo_Box_01', x: 0.22, z: 0.22, yaw: 0.25 }, { p: BR, n: 'SM_Wep_Pistol_Ammo_Box_01', x: -0.2, z: 0.25, yaw: -0.4 }],
  hard: [REST, { p: BR, n: 'SM_Wep_Shotgun_01', x: 0, z: -0.02, yaw: 0.05, lean: true }, { p: BR, n: 'SM_Wep_Shotgun_Ammo_Box_01', x: -0.2, z: 0.24, yaw: 0.3 }, { p: APO, n: 'SM_Prop_GasCan_01', x: 0.66, z: 0.12, yaw: -0.5, ground: true }],
  nightmare: [{ p: APO, n: 'SM_Wep_ChainSaw_01', x: 0, z: 0.02, yaw: 0.4 }, { p: APO, n: 'SM_Wep_Bomb_Propane_01', x: -0.68, z: 0.1, yaw: 0.6, ground: true }, { p: APO, n: 'SM_Prop_GasCan_01', x: 0.66, z: 0.05, yaw: -0.3, ground: true }],
  default: [{ p: APO, n: 'SM_Prop_Ammo_Box_01', x: 0, z: 0, yaw: 0.3 }],
};      // the picture opening of the frame turned landscape (measured on the model)

export function createVote({ THREE, root, space, assets, bounds, pointer, onInput, haptic, sfx, send, spot = null }) {
  const group = new THREE.Group();
  group.name = 'vote';
  root.add(group);
  // the camp's work light over the vote row (minilobby spots.vote) swings onto the choice; without it, one light of our own,
  // made once so the shaders do not recompile when he votes
  const own = !spot;
  const light = spot || new THREE.SpotLight(0xffc27a, 0, 8, 0.42, 0.5, 1.0);
  if (own) { light.position.set(0, 3.2, 0); group.add(light, light.target); }
  const home = { target: light.target.position.clone(), angle: light.angle, intensity: light.intensity };
  const aim = { want: home.target.clone(), angle: home.angle };
  const timer = makeText(THREE, 3.0, 0.42, 500, { depthTest: true, order: 3 });      // the question over the row
  group.add(timer.mesh);

  let question = 'Vote';
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
    try { await Promise.all([assets.loadPack(APO), assets.loadPack(SHOPS), assets.loadPack(BR).catch(() => null)]); } catch (e) { console.warn('[vote] packs', e.message); }
    if (my !== gen) return;
    const n = options.length, gap = n > 3 ? 1.02 : n > 2 ? 1.3 : 1.45;
    const { bx0, bx1, bz0, mx } = bounds;
    const span = (n - 1) * gap, wide = bx1 - bx0 + 2.2;
    for (let i = 0; i < n; i++) {
      const o = options[i];
      // in a row behind the zone; more games than fit bend into a shallow arc
      let x = mx - span / 2 + i * gap, z = bz0 - 0.7, ry = 0;
      if (span > wide) { const a = (i / (n - 1) - 0.5) * Math.min(1.6, span / 3.2); x = mx + Math.sin(a) * 3.6; z = bz0 + 2.6 - Math.cos(a) * 3.6; ry = -a; }
      const st = new THREE.Group();
      st.position.set(x, 0, z); st.rotation.y = ry;
      const crate = await safeGet(APO, CRATE);
      if (crate) { crate.rotation.y = (i % 2 ? 0.08 : -0.06); st.add(crate); }
      const crateH = assets.info(APO, CRATE)?.size?.[1] || 0.82;
      const holder = new THREE.Group();                       // what stands on the crate: a framed cover, or the kit
      holder.position.set(0, crateH, 0.05);
      let topH = 0.55;                                        // how high the things on the crate reach (for the labels)
      const kit = !!o.difficulty || (!!KITS[o.key] && o.key !== o.gameId);
      const kitShown = kit || !o.cover;      // a difficulty is shown by its kit even when the option carries the game's cover
      if (o.cover && !kit) {
        holder.rotation.x = -0.12;                            // the frame leans back a little, like it rests on something
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
        topH = fH;
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
      } else {
        // a non-game option says what it is with real Synty things on the crate, no screen and no drawn words
        await placeKit(holder, o.props || KITS[o.key] || KITS[String(o.name || '').toLowerCase()] || KITS.default, i);
        topH = 0.6;      // the same label height over every crate
      }
      st.add(holder);
      // a kit: the name is written on the crate's front face, just under the lid, so it never crosses the wall displays;
      // 'YOUR VOTE' under it. A game with a cover: the name over the frame, as before.
      const front = kitShown;
      const label = front ? makeText(THREE, 0.8, 0.2, 600, { depthTest: true, order: 3 }) : makeText(THREE, Math.min(1.5, gap - 0.08), 0.3, 500, { depthTest: true, order: 3 });
      label.set([{ text: o.title || o.name || o.key, px: front ? 92 : n > 3 ? 100 : 118, weight: 900 }]);
      label.mesh.position.set(0, front ? crateH - 0.15 : crateH + topH + 0.44, front ? 0.44 : 0.05);
      st.add(label.mesh);
      const mine = front ? makeText(THREE, 0.8, 0.17, 600, { depthTest: true, order: 3 }) : makeText(THREE, 1.4, 0.26, 500, { depthTest: true, order: 3 });
      mine.mesh.position.set(0, front ? crateH - 0.37 : crateH + topH + 0.17, front ? 0.44 : 0.05);
      st.userData.minePx = front ? 74 : 120;
      st.add(mine.mesh);
      // what the laser hits: an invisible box around crate and frame
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.25, crateH + topH + 0.2, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = (crateH + topH + 0.2) / 2;
      st.add(hit);
      Object.assign(st.userData, { kit: kitShown, key: o.key, gameId: o.gameId ?? null, hit, holder, label, mine, sink: 1, bob: 0 });
      group.add(st);
      stations.push(st);
    }
    timer.mesh.position.set(mx, 2.7, bz0 - 0.9);      // under the ceiling detail, over the portal frame
    if (chosen) mark(chosen, false);
  }
  /**
   * Puts a kit on the crate top (holder origin = crate top centre). Items: { p: pack, n: name, x, z, yaw, lay, ground }.
   * lay: the thinnest side down (a weapon lying flat); ground: on the floor next to the crate instead of on it.
   * Returns how high the kit reaches above the crate top.
   */
  async function placeKit(holder, kit, seed) {
    let top = 0.3;
    for (const it of kit) {
      const o = await safeGet(it.p, it.n);
      if (!o) continue;
      const d = assets.info(it.p, it.n), turn = new THREE.Group();
      turn.add(o);
      if ((it.lay || it.lean) && d) {
        const s = d.size, k = s[0] <= s[1] && s[0] <= s[2] ? 0 : s[2] <= s[1] ? 2 : 1;
        if (k === 0) o.rotation.z = Math.PI / 2; else if (k === 2) o.rotation.x = Math.PI / 2;
      }
      o.updateMatrixWorld(true);
      if (it.lean) {      // the long side goes left-right before it is tipped up against the box
        const b0 = new THREE.Box3().setFromObject(o);
        if (b0.max.z - b0.min.z > b0.max.x - b0.min.x) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); o.quaternion.premultiply(q); o.updateMatrixWorld(true); }
      }
      const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
      o.position.set(-c.x, -box.min.y, -c.z);
      turn.rotation.y = (it.yaw || 0) + (seed % 2 ? 0.05 : -0.04);
      turn.position.set(it.x || 0, it.ground ? -holder.position.y : 0.002, it.z || 0);
      if (it.lean) {      // lying flat, then tipped up against the box behind it so its side faces the player
        const lean = new THREE.Group(); lean.rotation.x = 1.05; lean.position.set(0, 0.11, -0.06);
        lean.add(o); turn.add(lean);
        o.position.set(-c.x, -c.y, -c.z);
      }
      holder.add(turn);
      if (!it.ground) top = Math.max(top, it.lean ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.45 + 0.1 : box.max.y - box.min.y + 0.1);
    }
    return top;
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
    if (own) light.intensity = 0; else { light.intensity = home.intensity; aim.want.copy(home.target); aim.angle = home.angle; }
  }

  function mark(key, loud = true) {
    chosen = key;
    for (const st of stations) st.userData.mine.set(st.userData.key === key ? [{ text: 'YOUR VOTE', px: st.userData.minePx || 120, weight: 900, font: 'num' }] : []);
    const st = stations.find(s => s.userData.key === key);
    if (st) {
      st.updateMatrixWorld(true); st.getWorldPosition(aim.want); (light.target.parent || group).worldToLocal(aim.want); aim.want.y = 1.2;
      aim.angle = Math.min(home.angle, 0.3);
      if (own) { light.position.set(aim.want.x, 3.4, aim.want.z + 1.2); light.intensity = 60; } else light.intensity = home.intensity * 1.6;
    }
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
    const id = st.userData.key;
    sfx?.play('vote.pick', { gain: 1 });
    haptic(e.hand, 0.9, 70);
    mark(id);
    send({ type: 'vote', id, gameId: st.userData.gameId });
  });

  return {
    get active() { return stations.length > 0 && !ended; },
    get voted() { return chosen; },
    /** options: [{id?, gameId?, name, cover?, props?}], endsAtLocal: Date.now()-based end (already corrected for clock skew). */
    set(options, endsAtLocal, ask = '') {
      const list = (Array.isArray(options) ? options : []).map(x => (x ? { ...x, key: String(x.id ?? x.gameId ?? '') } : null)).filter(x => x && x.key);
      const sig = list.map(x => x.key).join('|');
      question = String(ask || (list.length && list.every(x => x.gameId && !x.id) ? 'Vote for the next game' : 'Vote'));
      endsAt = Number(endsAtLocal) || 0; lastSec = -1;
      if (sig === this.sig && !ended) return;
      this.sig = sig; ended = null; chosen = null;
      build(list);
    },
    /** The winner stays lit, the other games sink into the ground. */
    end(key) {
      if (!stations.length || ended) return;
      ended = key || chosen || stations[0]?.userData.key; endAt = performance.now();
      mark(ended, false);
      for (const st of stations) st.userData.mine.set(st.userData.key === ended ? [{ text: stations.some(x => x.userData.gameId && !x.userData.kit) ? 'NEXT GAME' : 'CHOSEN', px: st.userData.minePx || 120, weight: 900, font: 'num' }] : []);
      sfx?.play('vote.win', { gain: 0.9 }); haptic('l', 0.8, 150); haptic('r', 0.8, 150);
      timer.clear();
    },
    /** Countdown: the winner goes too, so the way to the gate is free. */
    sinkAll() { if (!stations.length) return; if (!ended) { ended = '(none)'; endAt = performance.now(); timer.clear(); } else ended = '(none)'; for (const st of stations) st.userData.mine.set([]); },
    clear() { gen++; this.sig = ''; ended = null; chosen = null; clearStations(); timer.clear(); for (const s of ['l', 'r']) lasers[s].visible = false; },
    update(dt, t) {
      const live = stations.length > 0 && !ended;
      for (const side of ['l', 'r']) {
        const L = lasers[side];
        if (!live || !pointer(side, o, d)) { L.visible = false; hover[side] = null; continue; }
        const p = pick(side), st = p?.st || null;
        if (st && st !== hover[side]) { sfx?.play('vote.hover', { gain: 0.7, rate: 0.95 + Math.random() * 0.1 }); haptic(side, 0.25, 14); }
        hover[side] = st;
        L.visible = true;
        L.position.copy(o); L.lookAt(o.x - d.x, o.y - d.y, o.z - d.z);      // the beam is built along -Z
        L.scale.z = p ? p.dist : 2.5;
        L.material.opacity = st ? 0.85 : 0.4;
      }
      light.target.position.lerp(aim.want, Math.min(1, dt * 4)); light.angle += (aim.angle - light.angle) * Math.min(1, dt * 4);      // the light swings over
      for (const st of stations) {
        const u = st.userData, hot = (hover.l === st || hover.r === st) && live;
        u.bob = Math.max(0, u.bob - dt * 2.5);
        const s = (hot ? 1.05 : 1) + Math.sin(u.bob * Math.PI) * 0.06;
        u.holder.scale.setScalar(u.holder.scale.x + (s - u.holder.scale.x) * Math.min(1, dt * 12));
        if (ended && u.key !== ended) { u.sink = Math.max(0, u.sink - dt * 1.6); st.position.y = -(1 - u.sink) * 2.4; st.visible = u.sink > 0; }
      }
      if (live && endsAt) {
        const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        if (sec !== lastSec) {
          lastSec = sec;
          timer.set(sec > 0 ? [{ text: `${question}  ${sec}`, px: 150, weight: 900 }] : []);
          if (sec > 0 && sec <= 3) { sfx?.play('vote.last', { gain: 1 }); }
        }
      }
      if (ended && performance.now() - endAt > 6000) this.clear();
    },
    dispose() { off?.(); this.clear(); if (!own) { light.target.position.copy(home.target); light.angle = home.angle; light.intensity = home.intensity; } timer.dispose(); root.remove(group); lroot.remove(lasers.l, lasers.r); },
  };
}

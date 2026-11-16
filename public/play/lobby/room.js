// The waiting room's own things around the mini lobby camp (minilobby.js): the venue logo on the floor, the record
// board (a real Synty board with the scores written on it in bold white), and seasonal dressing from Synty packs.
// Everything at natural Synty size; nothing drawn by us except the letters.
//
//   const room = createRoom({ THREE, root, assets, bounds });   room.set(lobbyMsg);   room.dispose()

import { makeText } from './text.js';

const KIDS = 'kids-pack', SHOPS = 'shops-pack', APO = 'apocalypse-pack';
// not used: the Alpine pines (cut-out leaves turn into flat sheets once merged) and the Shops balloon (it says GRAND OPENING)
// the board: the Kids pack blackboard on two Apocalypse crates, its face towards the zone
const BOARD = { pack: KIDS, name: 'SM_Prop_Blackboard_01' };

/** 'auto' follows the calendar: Christmas 1 Dec - 6 Jan, Halloween 15 Oct - 1 Nov. */
export function seasonOf(season, date = new Date()) {
  const s = String(season || 'auto').toLowerCase();
  if (s !== 'auto') return ['christmas', 'halloween', 'birthday'].includes(s) ? s : null;
  const m = date.getMonth() + 1, d = date.getDate();
  if (m === 12 || (m === 1 && d <= 6)) return 'christmas';
  if ((m === 10 && d >= 15) || (m === 11 && d === 1)) return 'halloween';
  return null;
}

export function createRoom({ THREE, root, assets, bounds }) {
  const group = new THREE.Group();
  group.name = 'waiting-room';
  root.add(group);
  const { bx0, bx1, bz0, bz1, mx, mz } = bounds;
  const L = bx0 - 1.3, Rt = bx1 + 1.3, B = bz0 - 1.3, F = bz1 + 1.3;
  let boardText = null, logo = null, season = { key: '', group: null }, boardGroup = null, boardSig = '', logoSig = '', disposed = false;

  async function get(pack, name) {
    try { await assets.loadPack(pack); return assets.info(pack, name) ? await assets.get(pack, name) : null; } catch { return null; }
  }
  /** Puts a model with its footprint centred on (x, z), standing on the floor. */
  function place(o, pack, name, x, z, ry = 0, y = 0) {
    const d = assets.info(pack, name);
    if (!o || !d) return o;
    const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2, c = Math.cos(ry), s = Math.sin(ry);
    o.position.set(x - (cx * c + cz * s), y - d.min[1], z - (-cx * s + cz * c));
    o.rotation.y = ry;
    return o;
  }

  // ---- record board ----
  async function buildBoard() {
    boardGroup = new THREE.Group();
    // on the left of the zone, facing it (+X)
    const x = L - 0.9, z = mz + 0.2, ry = Math.PI / 2;
    boardGroup.position.set(x, 0, z); boardGroup.rotation.y = ry;
    const parts = [];
    const crateA = await get(APO, 'SM_Prop_Crate_01'), crateB = await get(APO, 'SM_Prop_Crate_01');
    const ci = assets.info(APO, 'SM_Prop_Crate_01');
    const ch = ci ? ci.size[1] : 0.82;
    if (crateA) parts.push(place(crateA, APO, 'SM_Prop_Crate_01', -0.55, -0.05, 0.05));
    if (crateB) parts.push(place(crateB, APO, 'SM_Prop_Crate_01', 0.55, 0.0, -0.07));
    const board = await get(BOARD.pack, BOARD.name);
    const bi = assets.info(BOARD.pack, BOARD.name);
    let bw = 2, bh = 1.18, bd = 0.15;
    if (board && bi) {
      [bw, bh, bd] = bi.size;
      // the blackboard is modelled facing +Z; stand it on the crates, leaning back a little
      const lean = new THREE.Group();
      lean.position.set(0, ch, 0.0); lean.rotation.x = -0.08;
      board.position.set(-(bi.min[0] + bi.max[0]) / 2, -bi.min[1], -(bi.min[2] + bi.max[2]) / 2);
      lean.add(board);
      boardGroup.add(lean);
      boardText = makeText(THREE, bw * 0.88, bh * 0.8, 520, { depthTest: true, order: 2 });
      boardText.mesh.position.set(0, bh / 2, bd / 2 + 0.012);
      lean.add(boardText.mesh);
    }
    for (const p of parts) boardGroup.add(p);
    group.add(boardGroup);
  }
  function writeBoard(rows) {
    if (!boardText) return;
    const list = (Array.isArray(rows) ? rows : []).filter(r => r && (r.team || r.score != null)).slice(0, 5);
    const lines = [{ text: 'TOP SCORES', px: 104, weight: 900, font: 'num', gap: 0 }];
    if (!list.length) lines.push({ text: 'Be the first on the board', px: 52, weight: 750, gap: 0.8 });
    list.forEach((r, i) => lines.push({ px: 58, weight: 800, gap: i ? 0.25 : 0.5, cols: [[`${i + 1}`, 0.03, 'left'], [String(r.team || 'Team').slice(0, 22), 0.09, 'left', 0.4], [String(r.game || '').slice(0, 18), 0.52, 'left', 0.27], [String(r.score ?? ''), 0.97, 'right', 0.16]] }));
    boardText.set(lines);
  }

  // ---- venue logo on the floor ----
  function setLogo(url) {
    if (url === logoSig) return;
    logoSig = url;
    if (logo) { logo.material.map?.dispose(); logo.material.dispose(); logo.geometry.dispose(); group.remove(logo); logo = null; }
    if (!url) return;
    new THREE.TextureLoader().load(url, t => {
      if (disposed || url !== logoSig) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const a = t.image ? t.image.width / t.image.height : 1;
      const w = Math.min(1.8, Math.max(0.8, (bx1 - bx0) * 0.4)), h = w / Math.max(0.3, a);
      logo = new THREE.Mesh(new THREE.PlaneGeometry(w, Math.min(h, w)), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      logo.rotation.x = -Math.PI / 2;
      logo.position.set(mx, 0.004, mz);
      logo.renderOrder = -4;
      group.add(logo);
    }, undefined, () => console.warn('[room] logo did not load', url));
  }

  // ---- seasonal dressing (only what the packs have; a season the packs cannot dress is skipped) ----
  async function setSeason(key, birthday) {
    const k = `${key || ''}|${birthday ? 'b' : ''}`;
    if (k === season.key) return;
    season.key = k;
    if (season.group) { group.remove(season.group); season.group = null; }
    if (!key && !birthday) return;
    const made = [], g = new THREE.Group();
    const put = async (pack, name, x, z, ry = 0, y = 0) => { const o = await get(pack, name); if (o) made.push(place(o, pack, name, x, z, ry, y)); return o; };
    if (key === 'christmas') {
      await put(SHOPS, 'SM_Prop_Xmas_Present_03', Rt + 0.9, F + 0.9, 0.7);
      await put(KIDS, 'SM_Prop_Xmas_Present_01', Rt + 0.4, F + 1.3, -0.4);
      await put(SHOPS, 'SM_Prop_Xmas_Present_01', L - 1.7, F + 1.5, 0.4);
      await put(SHOPS, 'SM_Prop_Xmas_Present_02', L - 1.2, F + 1.9, -0.3);
      await put(SHOPS, 'SM_Prop_Xmas_Present_03', L - 2.0, F + 1.1, 1.1);
      await put(KIDS, 'SM_Prop_Xmas_Present_01', L - 1.0, F + 1.3, 0.2);
      await put(KIDS, 'SM_Prop_Xmas_Present_02', L - 1.5, F + 0.9, -0.7);
      await put(SHOPS, 'SM_Prop_Xmas_Caine_01', bx0 - 0.4, bz0 - 1.0, Math.PI / 2);
      await put(SHOPS, 'SM_Prop_Xmas_Caine_01', bx1 + 0.4, bz0 - 1.0, -Math.PI / 2);
    } else if (key === 'halloween') {
      const spots = [[L + 0.3, F + 0.1, 0.4], [L - 0.5, F + 0.8, -0.8], [Rt + 1.2, F + 0.1, 1.9], [Rt + 2.3, mz - 0.3, 2.6], [mx - 1, B - 0.3, 0.2], [mx + 1.2, B - 0.1, -0.5], [L - 0.9, mz - 1.9, 1.2]];
      for (const [x, z, r] of spots) await put(KIDS, 'SM_Prop_Halloween_Pumpkin_01', x, z, r);
      await put(KIDS, 'SM_Prop_Cauldron_01', Rt + 1.2, mz - 1.9, 0.5);
      await put(KIDS, 'SM_Prop_Halloween_Bag_01', L - 0.3, mz + 1.9, 0.9);
    }
    if (birthday) {
      // the cake stands on a crate next to the board, presents around it (the Shops balloon says GRAND OPENING: not used)
      await put(APO, 'SM_Prop_Crate_01', L - 0.6, mz + 1.9, 0.2);
      const ci = assets.info(APO, 'SM_Prop_Crate_01');
      await put(KIDS, 'SM_Prop_Cake_01', L - 0.6, mz + 1.9, 0.6, ci ? ci.size[1] : 0.82);
      await put(SHOPS, 'SM_Prop_Xmas_Present_02', L - 0.1, mz + 2.6, 0.5);
    }
    if (k !== season.key || disposed) return;
    if (made.length) { const m = assets.merge(made); g.add(m); }
    season.group = g;
    group.add(g);
  }

  const ready = buildBoard().then(() => writeBoard([])).catch(e => console.warn('[room] board', e.message));

  return {
    group,
    async set(info = {}) {
      await ready;
      if (disposed) return;
      const sig = JSON.stringify(info.board || []);
      if (sig !== boardSig) { boardSig = sig; writeBoard(info.board); }
      setLogo(info.venue?.logo || '');
      await setSeason(seasonOf(info.season), !!info.birthday);
    },
    dispose() { disposed = true; boardText?.dispose(); if (logo) { logo.material.map?.dispose(); logo.material.dispose(); logo.geometry.dispose(); } root.remove(group); },
  };
}

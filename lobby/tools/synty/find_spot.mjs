// Търси свободно място на готовата карта за щанда: правоъгълник без нищо друго освен под,
// с хубава гледка напред (много неща между 6 и 30 м, без стена точно пред тезгяха).
//
//   node tools/synty/find_spot.mjs [ширина 4.4] [напред 2.8] [назад 5.2]
//
// Координатите и ъгълът са тези на Unity (както в layout.json); подават се на bake-map.html като cx, cz, yaw.

import fs from 'node:fs';

const root = new URL('../../public/play/assets/', import.meta.url);
const d = JSON.parse(fs.readFileSync(new URL('maps/shopping-plaza/layout.json', root)));
const where = JSON.parse(fs.readFileSync(new URL('maps/shopping-plaza/where.json', root)));
const slugOf = s => s.split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const packs = {};
const sizeOf = key => {
  const slug = slugOf(where[key] || ''), name = key.split('/')[1];
  packs[slug] ||= JSON.parse(fs.readFileSync(new URL(`synty/${slug}/pack.json`, root)));
  return packs[slug].models?.[name]?.size || [1, 1, 1];
};
const W = Number(process.argv[2]) || 4.4, FRONT = Number(process.argv[3]) || 2.8, BACK = Number(process.argv[4]) || 5.2;

const objs = [], floors = [];
for (const it of d.items) {
  const key = d.models[it[0]], name = key.split('/')[1];
  const x = it[4], y = it[8], z = it[12];
  if (/Sky|Skyline|Cloud/.test(name)) continue;
  const sc = Math.max(Math.hypot(it[1], it[5], it[9]), Math.hypot(it[3], it[7], it[11]));
  const s = sizeOf(key), r = Math.max(s[0], s[2]) * sc / 2;
  if (/Floor|Sidewalk|Road|Ground/.test(name)) { if (Math.abs(y) < 0.3) floors.push({ x, z, r: Math.max(1.2, r), road: /Road/.test(name) }); continue; }
  if (y > 3.2 || y + s[1] * sc < 0.05) continue;      // високо над главата или под земята
  objs.push({ x, z, r: Math.min(r, 3.5), wall: /Wall|ShopFront|Pillar/.test(name), big: r > 0.8 });
}
const cell = 2, grid = new Map(), keyOf = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
for (const o of objs) { const k = keyOf(o.x, o.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); }
const nearObjs = (x, z, r) => { const out = []; for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++) for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++) { const l = grid.get(`${i},${j}`); if (l) out.push(...l); } return out; };

const best = [];
for (let cx = -40; cx <= 50; cx += 0.5) for (let cz = -24; cz <= 74; cz += 0.5) {
  const fl = floors.filter(f => Math.hypot(f.x - cx, f.z - cz) < 2.2);
  if (!fl.length || fl.some(f => f.road)) continue;
  for (const yaw of [0, 90, 180, 270]) {
    const a = yaw * Math.PI / 180, fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
    let ok = true, view = 0, blocked = 0;
    for (const o of nearObjs(cx, cz, 34)) {
      const dx = o.x - cx, dz = o.z - cz, f = dx * fx + dz * fz, s = dx * rx + dz * rz;
      if (f > -BACK - o.r && f < FRONT + o.r && Math.abs(s) < W / 2 + o.r) { ok = false; break; }
      if (f > FRONT && f < 7 && Math.abs(s) < 3 && o.wall) blocked++;
      if (f > 5 && f < 32 && Math.abs(s) < f * 0.9) view += o.big ? 1 : 0.25;
    }
    if (ok && !blocked) best.push({ cx, cz, yaw, view: Math.round(view) });
  }
}
best.sort((p, q) => q.view - p.view);
const seen = [], out = [];
for (const b of best) { if (seen.some(s => Math.hypot(s.cx - b.cx, s.cz - b.cz) < 6 && s.yaw === b.yaw)) continue; seen.push(b); out.push(b); if (out.length >= 12) break; }
console.log('свободни места:', best.length);
for (const b of out) console.log(`cx=${b.cx}&cz=${b.cz}&yaw=${b.yaw}   гледка ${b.view}`);

// Pico = LBE: the zone drawn on one Pico (any shape, any size) is shared with every Pico, without points A and B; Quests are left alone.
//   node tools/dev-server.mjs --port 47951 --data data-dev-lbe --fresh      (another shell)
//   node tools/lbe-e2e.mjs 47951
import { createRequire } from 'node:module';
const require = createRequire(new URL('../lobby/', import.meta.url));
const WebSocket = require('ws');
const PORT = Number(process.argv[2] || 47951);
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (p, b) => (await fetch(`http://localhost:${PORT}${p}`, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {})).json().catch(() => ({}));

async function headset(id, { lbe }) {
  const ws = new WebSocket(`ws://localhost:${PORT}/headset`);
  const got = [];
  ws.on('message', d => { try { got.push(JSON.parse(d)); } catch {} });
  await new Promise(r => ws.on('open', r));
  const send = m => ws.send(JSON.stringify(m));
  send({ type: 'hello', id, name: id, model: lbe ? 'PICO (browser)' : 'Meta Quest (browser)', web: true, lbe, build: 48, caps: ['lbeBounds'] });
  await sleep(500);
  return { id, ws, got, send, cal: () => got.filter(m => m.type === 'applyCalibration' && m.calibration).at(-1)?.calibration || null, clear: () => { got.length = 0; } };
}

const A = await headset('PICO-A', { lbe: true });
const B = await headset('PICO-B', { lbe: true });
const Q = await headset('QUEST-Q', { lbe: false });
A.clear(); B.clear(); Q.clear();

// 1) a triangle drawn on Pico A (not a rectangle, not 3 x 3)
const tri = [{ x: 0, z: 0 }, { x: 7.5, z: 0 }, { x: 3.7, z: 6.5 }];
A.send({ type: 'zoneDone', points: tri, obstacles: [], marks: [], floorY: 0 });
await sleep(900);
const ca = A.cal(), cb = B.cal();
ok(!!ca && !!cb, 'triangle drawn on Pico A: both Picos get a calibration');
ok(ca?.source === 'lbe' && cb?.source === 'lbe', 'the calibration is the shared LBE one (no points A and B)');
ok(ca && cb && Math.abs(ca.origin.x - cb.origin.x) < 1e-6 && Math.abs(ca.origin.z - cb.origin.z) < 1e-6 && ca.yawDeg === cb.yawDeg, 'both Picos have the same origin and direction');
ok(!Q.cal(), 'the Quest gets nothing');
const z = (await api('/api/state')).zone;
console.log('     zone:', JSON.stringify({ poly: z?.poly?.length, hall: z?.hall && { w: +z.hall.w.toFixed(2), d: +z.hall.d.toFixed(2) } }));
ok(z?.poly?.length >= 3, 'the triangle is the saved zone');

// 2) a new Pico connecting later takes the same alignment
const C = await headset('PICO-C', { lbe: true });
const cc = C.cal();
ok(cc?.source === 'lbe' && cb && Math.abs(cc.origin.x - cb.origin.x) < 1e-6, 'a new Pico gets the shared alignment on connect');

// 3) a rhombus from the boundary, on request: only Picos react, the Quest is ignored
A.clear(); B.clear(); Q.clear();
const rhombus = [{ x: 0, z: 4 }, { x: 6, z: 0 }, { x: 12, z: 4 }, { x: 6, z: 8 }];
Q.send({ type: 'lbeBounds', reason: 'request', ok: true, corners: rhombus, obstacles: [], web: true, pico: false });
await sleep(500);
ok(!Q.cal() && !A.cal(), 'a Quest sending a boundary changes nothing');
A.send({ type: 'lbeBounds', reason: 'request', ok: true, corners: rhombus, obstacles: [], web: true, pico: true });
await sleep(900);
ok(!!A.cal() && !!B.cal(), 'a rhombus boundary sent by a Pico on request becomes the zone for all Picos');
A.send({ type: 'lbeBounds', reason: 'request', ok: true, corners: [], obstacles: [], web: true, pico: true });
await sleep(300);

// 4) 'changed' reports are only stored, they never change the zone
A.clear();
A.send({ type: 'lbeBounds', reason: 'changed', ok: true, corners: tri, obstacles: [], web: true, pico: true });
await sleep(400);
ok(!A.cal(), "an automatic 'changed' report does not touch the zone");

for (const h of [A, B, Q, C]) h.ws.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);

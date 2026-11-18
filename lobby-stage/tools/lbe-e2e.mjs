// Pico LBE: the headset page sends its boundary (WebXR bounded-floor) -> the console fits the hall (calibrateFromBounds) -> applyCalibration.
//   node tools/dev-server.mjs --port 47951 --data data-dev-lbe --fresh      (another shell)
//   node tools/lbe-e2e.mjs 47951
import { createRequire } from 'node:module';
const require = createRequire(new URL('../lobby/', import.meta.url));
const WebSocket = require('ws');
const PORT = Number(process.argv[2] || 47951);
// the hall as a Pico with an LBE map reported it (6 points, 18.8 x 10.1 m) and an ordinary personal boundary (3 x 3 m, 40 points)
const S = {
  hall: [{ x: 13.89, z: -4.83 }, { x: -4.78, z: -5.05 }, { x: -5.07, z: 4.92 }, { x: -4.87, z: 4.92 }, { x: 13.73, z: 5.25 }, { x: 13.89, z: -4.83 }],
  personal: Array.from({ length: 40 }, (_, i) => ({ x: 1.5 * Math.cos(i / 40 * 2 * Math.PI), z: 1.5 * Math.sin(i / 40 * 2 * Math.PI) })),
};
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
const post = async (p, b) => (await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) })).json().catch(() => ({}));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ws = new WebSocket(`ws://localhost:${PORT}/headset`);
const got = [];
ws.on('message', d => { try { got.push(JSON.parse(d)); } catch {} });
await new Promise(r => ws.on('open', r));
const send = m => ws.send(JSON.stringify(m));
send({ type: 'hello', id: 'PICO-LBE-TEST', name: 'Pico test', model: 'PICO 4 Ultra', web: true, build: 47, caps: ['lbeBounds'] });
await sleep(600);
const types = () => got.map(m => m.type);

// 1) the operator button asks the headset for its boundary
const r = await post('/api/calibrate/lbe', { headsetId: 'PICO-LBE-TEST' });
await sleep(300);
ok(r.ok && got.some(m => m.type === 'calibrateFromLbe'), 'console button -> calibrateFromLbe reaches the headset');

// 2) a personal 3x3 boundary on request: too small, waits for confirmation, no calibration sent
got.length = 0;
send({ type: 'lbeBounds', reason: 'request', ok: true, corners: S.personal, obstacles: [], web: true, pico: true });
await sleep(500);
ok(!got.some(m => m.type === 'applyCalibration'), 'personal 3 x 3 m boundary: no calibration is applied');

// 3) the hall polygon (6 points) sent by the headset: calibration from LBE
got.length = 0;
send({ type: 'lbeBounds', reason: 'changed', ok: true, corners: S.hall, obstacles: [], web: true, pico: true });
await sleep(700);
const ac = got.find(m => m.type === 'applyCalibration');
ok(!!ac, 'hall polygon -> applyCalibration sent to the headset');
if (ac) {
  const c = ac.calibration;
  console.log('     ->', JSON.stringify({ w: +c.width.toFixed(2), d: +c.depth.toFixed(2), yawDeg: +c.yawDeg.toFixed(1), origin: { x: +c.origin.x.toFixed(2), z: +c.origin.z.toFixed(2) }, source: c.source, version: c.version }));
  ok(Math.abs(c.width - 18.9) < 0.5 && Math.abs(c.depth - 10.1) < 0.5, 'hall size 18.9 x 10.1 m');
  ok(c.source === 'lbe', 'calibration source is lbe (client skips the two-point alignment)');
  ok(Math.abs(c.origin.x - 4.4) < 0.6 && Math.abs(c.origin.z - 0.1) < 0.6, 'origin is the middle of the hall (about x 4.4, z 0.1)');
}
// 4) the same boundary again: nothing changes
got.length = 0;
send({ type: 'lbeBounds', reason: 'changed', ok: true, corners: S.hall, obstacles: [], web: true, pico: true });
await sleep(400);
ok(!got.some(m => m.type === 'applyCalibration'), 'the same boundary again: no new calibration');
ws.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);

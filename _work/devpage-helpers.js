// Paste into the staging dev page (http://localhost:47901/play/?desktop=1&id=DEV&name=DEV) through the browser's JS tool
// after every reload. Gives: a frame pump that works while the pane is hidden, __look, __hand, __act, __shot, __launch.
// Screenshots land in lobby/public/play/assets/maps/_shots/<__dir>/<name>.jpg. One JS call may run 45 s at most.
const wait = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 30 && !(window.__arena && window.__arena.connected); i++) await wait(400);
const P = window.__arena;
window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message).slice(0, 200)));
const ce = console.error; console.error = (...a) => { window.__errs.push('E ' + a.map(x => String(x && x.stack || x)).join(' ').slice(0, 300)); ce(...a); };
if (!window.__pump) {
  const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33)'], { type: 'text/javascript' })));
  w.onmessage = () => { try { window.__arena.frame(performance.now()); } catch (e) { window.__pumpErr = String(e && e.stack || e).slice(0, 400); } };
  window.__pump = w;
}
// camera at p looking at t (zone coordinates, any height); the desk hand is 0.55 m along the view, its rotation is the camera's
window.__look = (px, py, pz, tx, ty, tz) => { P.desk.free = true; P.desk.mouse.x = 0; P.desk.mouse.y = 0; P.camera.position.set(px, py, pz); P.camera.lookAt(tx, ty, tz); const e = new (P.camera.rotation.constructor)().setFromQuaternion(P.camera.quaternion, 'YXZ'); P.desk.yaw = e.y; P.desk.pitch = e.x; };
window.__dir = 'br9';
window.__shot = async (name) => { P.frame(performance.now()); P.renderer.render(P.scene, P.camera); const blob = await new Promise(res => P.renderer.domElement.toBlob(res, 'image/jpeg', 0.9)); const q = await fetch('/dev/save?path=_shots/' + window.__dir + '/' + name + '.jpg', { method: 'PUT', body: blob }); return q.status; };
// puts the hand exactly on point t, the camera standing off in direction `from`
window.__hand = async (t, from) => { const f = from || [0, 0.25, -0.5]; const L = Math.hypot(f[0], f[1], f[2]); const k = 0.55 / L; window.__look(t.x + f[0] * k, t.y + f[1] * k, t.z + f[2] * k, t.x, t.y, t.z); await wait(350); };
window.__act = async (m) => { P.act({ hand: 'r', ...m }); await wait(350); };
window.__launch = async (skipTo) => { const before = P.game; await fetch('/api/stop', { method: 'POST' }); await wait(1700); await fetch('/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId: 'backroom', headsetIds: ['DEV'], theme: 'night', skipTo }) }); for (let i = 0; i < 40; i++) { await wait(600); if (P.game && P.game !== before && P.game.snap && P.game.scene) return true; } return false; };
// 1.3: the street = __look into the cabin, __act({ a: 'use', station: 'elevator', to: 2 }) by day; a signpost = __hand(way.btn) then
// __act({ a: 'use', station: way.id }); the hand to the mouth = P.desk.reach = 0.12 and look level; top view = camera.near 4.2, y 8.2.
// Back Room recipes: down the lift = __look(-0.7, 1.65, -3.45, -0.7, 1.3, -3.0) then __act({ a: 'use', station: 'elevator' }) and wait for
// snap.players[0].level === 1. Pour = hold a vessel and look straight down over bench.taps[2]. Click on the wall screen = aim the
// camera at the button and dispatch pointerdown + pointerup on P.renderer.domElement.
'helpers ready'

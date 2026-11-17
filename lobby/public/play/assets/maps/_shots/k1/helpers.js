// Помощници за проби в скрит раздел (K1): кадри на ръка, снимки, ръка на точно място, натискане през истинските събития.
const A = () => window.__arena;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const errs = window.__errs = window.__errs || [];
if (!window.__hooked) {
  window.__hooked = true;
  window.addEventListener('error', e => errs.push('E ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => errs.push('R ' + (e.reason?.message || e.reason)));
  const oe = console.error, ow = console.warn;
  console.error = (...a) => { errs.push('err ' + a.map(x => x?.message || String(x)).join(' ').slice(0, 300)); oe(...a); };
  console.warn = (...a) => { errs.push('warn ' + a.map(x => x?.message || String(x)).join(' ').slice(0, 300)); ow(...a); };
}
export async function step(n = 1, ms = 16) { for (let i = 0; i < n; i++) { A().frame(performance.now()); await sleep(ms); } }
export const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json()).catch(e => ({ error: String(e) }));
export function cam(x, y, z, yaw, pitch) { const d = A().desk; d.free = true; d.yaw = yaw; d.pitch = pitch; d.mouse.set(0, 0); A().camera.position.set(x, y, z); }
export async function shot(name, w = 1280, h = 720) {
  const r = A().renderer, THREE = await import('/play/vendor/three.module.js');
  const old = r.getSize(new THREE.Vector2());
  r.setSize(w, h, false); A().camera.aspect = w / h; A().camera.updateProjectionMatrix();
  A().frame(performance.now());
  const blob = await new Promise(res => r.domElement.toBlob(res, 'image/jpeg', 0.85));
  r.setSize(old.x, old.y, false); A().camera.aspect = old.x / old.y; A().camera.updateProjectionMatrix();
  return (await fetch(`/dev/save?path=_shots/k1/${name}.jpg`, { method: 'PUT', body: blob })).status;
}
export async function launch(opts = {}) {
  await post('/api/stop'); await sleep(1500);
  const r = await post('/api/launch', { gameId: 'backroom', headsetIds: ['K1'], theme: 'night', ...opts });
  for (let i = 0; i < 300 && !A().game; i++) await step(1, 100);
  await step(30, 50);
  return { ok: r.ok ?? r, game: !!A().game, errs: errs.slice(-10) };
}
export const snap = () => A().game?.snap;
export const start = () => A().game?.start;
export const S = id => start().stations.find(s => s.id === id);
// къде може да стои човек: стаите без ивиците на уредите (тялото е с радиус 0.15)
const WALK = [{ x0: -0.65, x1: 0.65, z0: -1.0, z1: 0.30 }, { x0: -0.95, x1: -0.45, z0: -2.5, z1: -1.0 }, { x0: -1.3, x1: -0.1, z0: -4.1, z1: -2.8 }];
export function standFor(p) {
  let best = null, bd = Infinity;
  for (const r of WALK) {
    const x = Math.min(r.x1, Math.max(r.x0, p.x)), z = Math.min(r.z1, Math.max(r.z0, p.z)), d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = { x, z, d }; }
  }
  return best;
}
/** слага главата на най-близкото място за стоене и ръката точно в p; връща колко далеч е ръката от тялото */
export async function handTo(p, wait = 1100) {
  const st = standFor(p), hx = st.x, hy = 1.65, hz = st.z;
  const dx = p.x - hx, dy = p.y - hy, dz = p.z - hz, len = Math.hypot(dx, dy, dz) || 0.001;
  const d = A().desk;
  d.free = true; d.reach = len; d.pitch = Math.asin(dy / len); d.yaw = Math.atan2(-dx, -dz); d.mouse.set(0, 0);
  A().camera.position.set(hx, hy, hz);
  await step(3, 30);
  await sleep(wait);                       // в скрит раздел таймерите са бавни: позата да стигне до сървъра
  await step(2, 30);
  return { reach: +st.d.toFixed(2), eye: +len.toFixed(2), hand: A().hands.r.pos.toArray().map(v => +v.toFixed(2)) };
}
const cv = () => A().renderer.domElement;
export async function down() { cv().dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerId: 1 })); await step(2, 30); }
export async function up() { cv().dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, pointerId: 1 })); window.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, pointerId: 1 })); await step(2, 30); }
export async function waitFor(fn, ms = 6000) { const t = performance.now(); while (performance.now() - t < ms) { await step(1, 120); const v = fn(); if (v) return v; } return null; }
export const binTop = id => { const s = S(id); return { x: s.x, y: s.y + s.h, z: s.z }; };
export const item = kind => snap().items.find(i => i.kind === kind);
export const tgt = () => { const T = A().game.scene.debugTarget?.('r'); return T || null; };
export { errs };

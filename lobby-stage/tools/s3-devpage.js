// S3 page helpers for the desktop headset page. In the page console: await import('/stub/helpers.js?' + Date.now())
// (the S3 stub serves this file; against the dev server paste it instead). Gives window.__look, __shot, __send, __lobby, __space.
const wait = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40 && !(window.__arena && window.__arena.connected && window.__arena.vote); i++) await wait(300);
const P = window.__arena;
document.getElementById('card').style.display = 'none';
window.__errs = window.__errs || [];
if (!window.__errHook) { window.__errHook = 1; addEventListener('error', e => window.__errs.push(String(e.message).slice(0, 200))); const ce = console.error; console.error = (...a) => { window.__errs.push('E ' + a.map(x => String(x && x.stack || x)).join(' ').slice(0, 300)); ce(...a); }; }
window.__look = (px, py, pz, tx, ty, tz) => { P.desk.free = true; P.camera.position.set(px, py, pz); P.camera.lookAt(tx, ty, tz); const e = new (P.camera.rotation.constructor)().setFromQuaternion(P.camera.quaternion, 'YXZ'); P.desk.yaw = e.y; P.desk.pitch = e.x; };
// hides the desktop hand box, renders one frame, saves to research/shots/s3/<name>.jpg (stub) or the dev server's _shots
window.__shot = async (name, dir = '') => {
  P.desk.mouse.set(5, 5); P.frame(performance.now()); P.desk.hand.visible = false; P.renderer.render(P.scene, P.camera);      // the desktop hand box is not in the headset
  const blob = await new Promise(res => P.renderer.domElement.toBlob(res, 'image/jpeg', 0.9));
  const q = await fetch('/dev/save?path=' + (dir ? '_shots/' + dir + '/' : '') + name + '.jpg', { method: 'PUT', body: blob });
  return q.status;
};
window.__send = m => P.recv(m);
window.__lobby = (extra = {}) => P.recv({ type: 'lobby', theme: 'night', season: 'off', venue: { name: 'Arena', logo: '/play/app-icon-512.png' }, board: [{ team: 'Night Owls', score: 18450, game: 'The Motel' }, { team: 'Pizza Squad', score: 12200, game: 'The Back Room' }, { team: 'Martin', score: 9800, game: 'The Motel' }, { team: 'Birthday Crew', score: 7400, game: 'The Back Room' }], ...extra });
window.__space = async (ms = 120) => { dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); await wait(ms); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); };
export default true;

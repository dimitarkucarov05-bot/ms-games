// What the operator and the session engine show in the headset: the 3-2-1 countdown, pause, results, the end message,
// operator messages and the bench note. Only bold white text with a thin outline (text.js), real sounds (sfx.js) and
// haptics; no panels. The text stands still in the room in front of the player and follows only when he turns away.
//
//   const ov = createOverlay({ THREE, scene, sfx, haptic, dim });
//   ov.countdown(3); ov.pause(true, ['Anna']); ov.results({...}); ov.endMessage('thanks'); ov.message('Hi', 6);
//   every frame: ov.update(now, cam)

import { makeText } from './text.js';

export const END_PRESETS = {
  remove: ['Please take off', 'the headset'],
  thanks: ['Thank you', 'for playing!'],
  staff: ['Please wait', 'for the staff'],
};

export function createOverlay({ THREE, scene, sfx, haptic, dim }) {
  const big = makeText(THREE, 1.8, 1.25, 560);          // countdown, results, pause, end message
  const low = makeText(THREE, 1.8, 0.32, 560);          // operator message, under the big one
  const anchor = new THREE.Group();                     // where the text stands; it follows the head lazily
  anchor.add(big.mesh, low.mesh);
  big.mesh.position.set(0, 0.05, 0);
  low.mesh.position.set(0, -0.62, 0);
  scene.add(anchor);

  const S = { cd: null, cdTimers: [], results: null, resultsUntil: 0, pause: null, end: null, bench: false, msg: null, msgUntil: 0, pop: 0, placed: false };
  const both = (s, ms) => { haptic('l', s, ms); haptic('r', s, ms); };

  function redraw() {
    let lines = [];
    let dimTo = 0;
    if (S.cd != null) lines = S.cd === 0 ? [{ text: 'GO', px: 360, weight: 900, font: 'num' }] : [{ text: String(S.cd), px: 470, weight: 900, font: 'num' }];
    else if (S.results) { lines = resultLines(S.results); dimTo = 0.45; }
    else if (S.pause) { lines = [{ text: 'PAUSED', px: 170, weight: 900, font: 'num' }, ...(S.pause.length ? [{ text: `Waiting for ${S.pause.join(', ')}`, px: 62, weight: 750 }] : [{ text: 'The game will continue soon', px: 62, weight: 750 }])]; dimTo = 0.5; }
    else if (S.end) { lines = S.end.map((t, i) => ({ text: t, px: i ? 110 : 120, weight: 900, font: 'num' })); dimTo = 0.35; }
    else if (S.bench) lines = [{ text: 'Wait for the next game', px: 92, weight: 850 }, { text: 'You sit this one out', px: 56, weight: 700 }];
    big.set(lines);
    low.set(S.msg ? [{ text: S.msg, px: 74, weight: 850 }] : []);
    dim?.(dimTo);
    if (lines.length || S.msg) S.placed = S.placed && anchor.visible; else S.placed = false;
    anchor.visible = !!(lines.length || S.msg);
  }

  function resultLines(r) {
    const out = [];
    if (r.team) out.push({ text: r.team, px: 70, weight: 800 });
    out.push({ text: String(r.score ?? 0), px: 210, weight: 900, font: 'num', gap: 0.1 });
    if (r.rank === 1 || r.newRecord) out.push({ text: 'NEW RECORD', px: 80, weight: 900, font: 'num', gap: 0.15 });
    else if (r.rank) out.push({ text: `Rank ${r.rank}`, px: 66, weight: 800, gap: 0.15 });
    const ps = (Array.isArray(r.players) ? r.players : []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6);
    const kd = ps.some(p => p.kills != null);
    ps.forEach((p, i) => out.push({ px: 58, weight: 750, gap: i ? 0.2 : 0.5, cols: [[p.name || `Player ${i + 1}`, 0.12, 'left'], [String(p.score ?? ''), 0.66, 'right'], ...(kd ? [[`${p.kills ?? 0} / ${p.deaths ?? 0}`, 0.88, 'right']] : [])] }));
    return out;
  }

  function stopCountdown() { for (const t of S.cdTimers) clearTimeout(t); S.cdTimers = []; S.cd = null; }

  /** Clock-based 3-2-1-GO (never frame-based: the countdown must keep time even if a frame stalls). */
  function countdown(seconds = 3) {
    stopCountdown();
    S.results = null; S.end = null; S.placed = false;
    const n = Math.max(1, Math.min(10, Math.round(Number(seconds) || 3)));
    const step = k => {
      S.cd = k; S.pop = performance.now();
      if (k > 0) { sfx?.play('countdown.tick', { gain: 0.9, rate: k === 1 ? 1.12 : 1 }); both(0.55, 60); }
      else { sfx?.play('countdown.go', { gain: 1 }); both(1, 180); }
      redraw();
    };
    for (let k = n; k >= 0; k--) S.cdTimers.push(setTimeout(() => step(k), (n - k) * 1000));
    S.cdTimers.push(setTimeout(() => { S.cd = null; redraw(); }, n * 1000 + 900));
  }

  function results(r, seconds) {
    stopCountdown();
    S.results = r || {}; S.pause = null; S.placed = false;
    const sec = Math.max(3, Number(seconds ?? r?.seconds) || 20);
    S.resultsUntil = performance.now() + sec * 1000;
    sfx?.play('results.show', { gain: 1 }); both(0.8, 220);
    redraw();
  }

  function pause(on, who = []) {
    const was = !!S.pause;
    S.pause = on ? (Array.isArray(who) ? who.map(String).filter(Boolean) : []) : null;
    if (on !== was) { sfx?.play('pause.toggle', { gain: 0.9 }); both(on ? 0.7 : 0.4, on ? 160 : 60); }
    redraw();
  }

  function endMessage(preset, text) {
    const lines = preset === 'custom' || !END_PRESETS[preset] ? String(text || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3) : END_PRESETS[preset];
    S.end = lines.length ? lines : null; S.results = null; S.placed = false;
    if (S.end) { sfx?.play('endmessage.in', { gain: 1 }); both(0.6, 120); }
    redraw();
  }

  function message(text, seconds = 6) {
    S.msg = String(text || '').slice(0, 90) || null;
    S.msgUntil = performance.now() + Math.max(2, Number(seconds) || 6) * 1000;
    if (S.msg) { sfx?.play('message.in', { gain: 0.8 }); both(0.45, 80); }
    redraw();
  }

  function bench(on) { S.bench = !!on; redraw(); }
  /** A new game or the waiting room takes over: the end message, results and pause go away. */
  function clearSession() { stopCountdown(); S.results = null; S.pause = null; S.end = null; redraw(); }

  const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3();
  function update(now, cam) {
    if (S.results && now > S.resultsUntil) { S.results = null; redraw(); }
    if (S.msg && now > S.msgUntil) { S.msg = null; redraw(); }
    if (!anchor.visible) return;
    cam.getWorldPosition(_p); cam.getWorldDirection(_d); _d.y = 0;
    if (_d.lengthSq() < 1e-4) _d.set(0, 0, -1);
    _d.normalize();
    _a.copy(anchor.position).sub(_p); _a.y = 0;
    const away = _a.lengthSq() > 1e-4 ? _a.normalize().dot(_d) : -1;
    if (!S.placed || away < 0.55 || anchor.position.distanceTo(_p) > 3.5) {      // first time, or the player turned more than ~55 degrees away
      anchor.position.copy(_p).addScaledVector(_d, 2.1); anchor.position.y = _p.y - 0.05;
      anchor.lookAt(_p.x, anchor.position.y, _p.z);
      S.placed = true;
    }
    const k = Math.min(1, (now - S.pop) / 260);      // each countdown number pops in
    big.mesh.scale.setScalar(S.cd != null ? 1.25 - 0.25 * (k * (2 - k)) : 1);
  }

  return {
    countdown, results, pause, endMessage, message, bench, clearSession, update,
    get state() { return { cd: S.cd, results: !!S.results, pause: S.pause, end: S.end, bench: S.bench, msg: S.msg }; },
  };
}

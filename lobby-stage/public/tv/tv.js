// MS Games TV: the spectator screen for a second monitor or a TV at the counter (S7).
//
//   /tv/                 follows the arena by itself: attract mode when idle, live cameras while a game runs
//   /tv/?shot=wide       holds one camera (wide, follow, hero, horde, crane) for checks
//   /tv/?embed=1        the picture and the director only (for the console's running view): no overlay, no attract
//                        mode, no curtain; the cover while idle; low render scale and about 30 frames a second
//   /tv/?quality=0.75    fixed render scale of the live picture (default: by itself, see quality())
//
// Data: the server's spectator feed, WebSocket /tv (read-only): hall, zone, session, gameStart, game (10 Hz), room
// (poses, 20 Hz), stop. The live picture is the game's own watch page (/play/?watch=1) in a frame under the overlay: it
// builds the real world with the Motel client's scene code, and director.js moves its camera through window.__arena.
// The frame exists only while a game runs, so the idle screen costs nothing.

import { createDirector } from './director.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const embed = qs.get('embed') === '1';
if (embed) document.body.dataset.embed = '1';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Math.round(Number(n) || 0).toLocaleString('en-US').replace(/,/g, ' ');
const mmss = s => { s = Math.max(0, Math.ceil(Number(s) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
function text(el, v) { v = String(v ?? ''); if (el.textContent !== v) { el.textContent = v; return true; } return false; }

// ---------- brand mark: public/brand/mark.svg when S1 has published it, else option C "Stack" drawn here ----------
const MARK = '<svg viewBox="0 0 128 112" aria-hidden="true"><path d="M4 108 L4 4 L26 4 L64 52 L102 4 L124 4 L124 108 L102 108 L102 46 L64 94 L26 46 L26 108 Z" fill="oklch(0.97 0.012 315)"/><path d="M4 108 L4 4 L26 4 L26 108 Z" fill="oklch(0.76 0.19 318)"/><path d="M102 108 L102 4 L124 4 L124 108 Z" fill="oklch(0.91 0.17 100)"/></svg>';
for (const m of document.querySelectorAll('.mark')) m.innerHTML = MARK;
{
  const probe = new Image();
  probe.onload = () => { for (const m of document.querySelectorAll('.mark')) m.innerHTML = '<img src="/brand/mark.svg" alt="">'; };
  probe.src = '/brand/mark.svg';
}

// ---------- state ----------
const S = {
  session: null,        // the last `session` message
  start: null,          // the running game's start message (null = no game)
  snap: null,           // the last rules snapshot
  poses: new Map(),     // id -> { x, y, z, fx, fz, t }
  games: new Map(),     // id -> manifest facts from /api/state (tagline, players)
  mode: 'attract',      // attract | curtain | live | results
  liveAt: 0,
  seenEvent: -1,
  resultAt: 0,
};
const director = createDirector();
let frame = null, frameAt = 0;      // the watch page

fetch('/api/state').then(r => r.json()).then(st => { for (const g of st.games || []) S.games.set(g.id, g); renderAttract(); }).catch(() => {});

// ---------- the feed ----------
let ws = null;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/tv`);
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } try { handle(m); } catch (err) { console.error('[tv]', err); } };
  ws.onclose = () => setTimeout(connect, 1500);
  ws.onerror = () => {};
}
function handle(m) {
  switch (m.type) {
    case 'session': S.session = m; renderAttract(); renderSession(); return decide();
    case 'gameStart': S.start = m; S.snap = null; S.seenEvent = -1; director.reset(); return decide();
    case 'game': return onSnap(m);
    case 'room': return onRoom(m);
    case 'stop': S.start = null; S.stopAt = performance.now(); return decide();
  }
}
function onRoom(m) {
  const now = performance.now();
  for (const p of m.players || []) {
    const a = p.p;
    if (!a || a.length < 7) continue;
    const [x, y, z, qx, qy, qz, qw] = a;
    let fx = -2 * (qx * qz + qw * qy), fz = -(1 - 2 * (qx * qx + qy * qy));
    const n = Math.hypot(fx, fz);
    if (n < 0.2) { const old = S.poses.get(p.id); fx = old?.fx ?? 0; fz = old?.fz ?? -1; } else { fx /= n; fz /= n; }
    S.poses.set(p.id, { x, y, z, fx, fz, t: now });
  }
  for (const [id, p] of S.poses) if (now - p.t > 4000) S.poses.delete(id);
}
function onSnap(m) {
  const first = !S.snap;
  S.snap = m;
  const ev = m.events || [];
  if (first || S.seenEvent < 0) S.seenEvent = ev.reduce((a, e) => Math.max(a, e.i || 0), 0);      // never replay what happened before we tuned in
  else for (const e of ev) if ((e.i || 0) > S.seenEvent) { S.seenEvent = e.i; onEvent(e); }
  renderHud();
  if (m.result && !S.resultAt) { S.resultAt = performance.now(); decide(); }
  if (!m.result) S.resultAt = 0;
}

// ---------- which layer is on ----------
function setMode(mode) {
  if (S.mode === mode) return;
  S.mode = mode;
  document.body.dataset.mode = mode;
  if (mode === 'live') S.liveAt = performance.now();
}
/** Is the world in the frame built and drawn (the game exists, has a snapshot, its own transition is over)? */
function worldReady() {
  const A = frame?.contentWindow?.__arena;
  return !!(A && A.game && A.game.snap && A.game.scene);
}
function decide() {
  const run = S.session?.run, state = S.session?.state;
  const playing = !!S.start;
  const soon = playing || ['countdown', 'loading', 'playing', 'paused'].includes(run?.state);
  if (soon) openFrame(); else closeFrameLater();
  const results = (run?.state === 'results' && run.results) || (playing && S.snap?.result);
  if (results && !embed) { renderResults(); return setMode('results'); }
  if (playing) return setMode(worldReady() && curtainDone() ? 'live' : 'curtain');
  if (run?.state === 'loading') return setMode('curtain');
  void state;
  setMode('attract');
}
let curtainSince = 0;
function curtainDone() { return performance.now() - curtainSince > 1800; }      // the title card is held long enough to be read

// ---------- the live picture ----------
function openFrame() {
  clearTimeout(closeTimer);
  if (frame) return;
  frame = document.createElement('iframe');
  frame.src = '/play/?watch=1&tv=1';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.addEventListener('load', () => {
    try {
      const d = frame.contentDocument, st = d.createElement('style');
      st.textContent = '#card{display:none!important}html,body{background:#000!important;cursor:none}';
      d.head.appendChild(st);
    } catch { /* the page still draws */ }
  });
  $('stage').appendChild(frame);
  frameAt = performance.now(); curtainSince = frameAt; quality.reset();
}
let closeTimer = 0;
function closeFrameLater() {
  if (!frame || closeTimer) return;
  closeTimer = setTimeout(() => { closeTimer = 0; if (S.start) return; frame?.remove(); frame = null; }, 4000);
}

/**
 * Render scale of the live picture. Starts at 1080 lines at most, and steps down when the frame rate stays under 45
 * for three seconds (an office PC with integrated graphics), up again never: a steady picture beats a sharp one.
 */
const quality = (() => {
  const fixed = Number(qs.get('quality')) || 0;
  let scale = 1, applied = 0, slow = 0, n = 0, acc = 0;
  // embedded in the console: a second WebGL view on the operator's PC, so at most 540 lines and never above 0.75
  function target() { return fixed || (embed ? Math.min(0.75, 540 / Math.max(180, innerHeight)) : Math.min(window.devicePixelRatio || 1, 1080 / Math.max(360, innerHeight)) * scale); }
  function apply(A) {
    const t = Math.round(target() * 100) / 100;
    if (!A?.renderer || t === applied) return;
    applied = t;
    try { A.renderer.setPixelRatio(t); A.renderer.setSize(frame.clientWidth, frame.clientHeight, false); } catch { /* next frame */ }
  }
  return {
    reset() { scale = 1; applied = 0; slow = 0; n = 0; acc = 0; },
    step(dt, A) {
      apply(A);
      if (fixed || embed || S.mode !== 'live' || performance.now() - S.liveAt < 4000) return;
      acc += dt; n++;
      if (acc < 1) return;
      const fps = n / acc; acc = 0; n = 0;
      this.fps = Math.round(fps);
      slow = fps < 45 ? slow + 1 : 0;
      if (slow >= 3 && scale > 0.5) { scale = Math.max(0.5, scale - 0.17); slow = 0; apply(A); }
    },
    get scale() { return applied; },
    fps: 0,
  };
})();

// ---------- frame loop: the director, the curtain, small clocks ----------
let last = performance.now(), drawnAt = 0;
function step(now) {
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
  last = now;
  const A = frame?.contentWindow?.__arena;
  // embedded: the watch page draws only when we say so, about 30 times a second
  if (embed && A?.renderer && A.frame) {
    // its own loop is switched off every time (the page turns it on late in its boot); the frame gets the watch page's
    // own clock, not ours: the two documents count time from different starts
    try { A.renderer.setAnimationLoop(null); } catch { /* still its own pace */ }
    if (now - drawnAt >= 31) { drawnAt = now; try { A.frame(frame.contentWindow.performance.now()); } catch (e) { console.warn('[tv] frame', e); } }
  }
  if (S.mode === 'curtain') {
    // the line follows how far the watch page's own loading has come
    let pct = 0.05 + Math.min(0.2, (now - frameAt) / 20000);
    try { const st = A?.loading?.state; if (A?.game) pct = A.game.snap ? 1 : 0.9; else if (st?.pct) pct = Math.max(pct, st.pct * 0.85); } catch { /* not yet */ }
    $('cFill').style.transform = `scaleX(${clamp(pct, 0, 1).toFixed(3)})`;
    if (S.start && worldReady() && curtainDone()) decide();
  }
  if (A && S.start && (S.mode === 'live' || S.mode === 'results' || S.mode === 'curtain')) {
    try {
      const kind = director.update(dt, { start: S.start, snap: S.snap, poses: S.poses }, A);
      if (qs.get('shot') && director.shot !== qs.get('shot')) director.cut(qs.get('shot'), { who: S.snap?.players?.[0]?.id }, 1e9);
      if (qs.get('debug') === '1') text($('hShot'), kind);
    } catch (e) { console.warn('[tv] director', e); }
    quality.step(dt, A);
  }
}
function loop(now) { step(now); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// ---------- attract ----------
const DIFF = { easy: 'Easy', normal: 'Normal', hard: 'Hard', nightmare: 'Nightmare' };
let boardShow = 'all', boardSig = '';
function renderAttract() {
  const s = S.session;
  const g = s?.game, meta = g ? S.games.get(g.id) : null;
  const cover = g?.cover || meta?.cover || '/play/games/motel/cover.jpg';
  for (const id of ['artA', 'artB', 'artC']) { const v = `url("${cover}")`; if ($(id).style.backgroundImage !== v) $(id).style.backgroundImage = v; }
  const name = g?.name || meta?.name || 'The Motel';
  text($('aTitle'), name); text($('cTitle'), name); text($('hGame'), name); text($('rGame'), name);
  text($('aTag'), meta?.tagline || '');
  const facts = [];
  if (meta) {
    facts.push(meta.minPlayers === meta.maxPlayers ? `${meta.maxPlayers} players` : `${meta.minPlayers} to ${meta.maxPlayers} players`);
    if (meta.cuts?.length) facts.push(`${meta.cuts.join(' or ')} minutes`);
    facts.push('Free-roam VR');
  }
  const fsig = facts.join('|');
  if ($('aFacts').dataset.sig !== fsig) { $('aFacts').dataset.sig = fsig; $('aFacts').innerHTML = facts.map(f => `<li>${esc(f)}</li>`).join(''); }
  // venue
  const v = s?.venue;
  $('venue').hidden = !(v && (v.logo || (v.name && v.name !== 'MS Games')));      // the default name is already the brand on the left
  if (v) {
    $('venueLogo').hidden = !v.logo;
    if (v.logo && $('venueLogo').getAttribute('src') !== v.logo) $('venueLogo').src = v.logo;
    $('venueName').hidden = !!v.logo || !v.name;
    text($('venueName'), v.name || '');
  }
  renderBoard();
  renderNext();
}
function renderBoard() {
  const s = S.session;
  if (!s) return;
  const today = s.today || [], all = s.board || [];
  if (boardShow === 'today' && !today.length) boardShow = 'all';
  const list = (boardShow === 'today' ? today : all).slice(0, 8);
  const sig = boardShow + JSON.stringify(list);
  if (sig === boardSig) return;
  boardSig = sig;
  text($('bSub'), boardShow === 'today' ? 'Today' : 'All time');
  $('bEmpty').hidden = list.length > 0;
  $('bList').innerHTML = list.map((e, i) => `<li><i>${i + 1}</i><b>${esc(e.team || 'Team')}<small>${esc(DIFF[e.difficulty] || '')}</small></b><span>${num(e.score)}</span></li>`).join('');
}
setInterval(() => {      // the board turns between all time and today
  if (S.mode !== 'attract' || !(S.session?.today || []).length) return;
  $('bList').classList.add('swap');
  setTimeout(() => { boardShow = boardShow === 'all' ? 'today' : 'all'; renderBoard(); $('bList').classList.remove('swap'); }, 520);
}, 12000);

function renderNext() {
  const s = S.session, run = s?.run;
  let line = 'Next game starts soon', sub = 'Ask at the counter to play', hot = false;
  if (run?.state === 'countdown') {
    const left = run.countdownEndsAt ? Math.max(0, Math.ceil((run.countdownEndsAt - Date.now()) / 1000)) : 0;
    line = left ? `Starting in ${left}` : 'Starting now'; sub = run.team ? `Team ${run.team}` : (run.gameName || ''); hot = true;
  } else if (run && (run.state === 'waiting' || run.state === 'loading')) {
    const n = (run.players || []).length;
    line = 'Players are getting ready'; sub = n ? `${n} ${n === 1 ? 'player' : 'players'} in the waiting room` : 'The headsets are going on'; hot = true;
  } else if (s?.flow?.kind) {
    line = 'Next game starts soon'; sub = 'The arena is open';
  }
  text($('nextLine'), line); text($('nextSub'), sub);
  document.body.dataset.next = hot ? 'hot' : '';
  text($('cLine'), run?.team ? `Team ${run.team}` : 'Starting now');
}
setInterval(() => {
  const d = new Date();
  text($('clockA'), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  if (S.session?.run?.state === 'countdown') renderNext();
}, 250);

// ---------- the broadcast overlay ----------
function colorOf(id) {
  const s = S.session;
  return s?.run?.players?.find(p => p.headsetId === id)?.color || s?.headsets?.find(h => h.id === id)?.color || '';
}
function renderSession() {
  const run = S.session?.run;
  text($('hTeam'), run?.team || 'Players');
  const parts = [DIFF[run?.difficulty] || DIFF[S.snap?.level] || '', run?.kids ? 'Kids' : ''].filter(Boolean);
  text($('hMode'), parts.join(' · ') || 'Live');
}
let plSig = '';
function renderHud() {
  const m = S.snap, st = S.start;
  if (!m) return;
  if (text($('hScore'), num(m.score))) bump($('hScore'));
  const waves = st?.waves || 0;
  const intro = m.phase === 'intro', brk = m.phase === 'break';
  text($('hWaveLabel'), intro ? 'Get ready' : brk ? 'Next wave in' : 'Wave');
  const waveHtml = intro || brk ? esc(String(Math.ceil(m.next || 0))) : `${m.wave || 1}${waves ? `<small>/ ${waves}</small>` : ''}`;
  if ($('hWave').dataset.sig !== waveHtml) { $('hWave').dataset.sig = waveHtml; $('hWave').innerHTML = waveHtml; }
  text($('hTime'), mmss(m.left));
  document.body.dataset.clock = m.left <= 30 ? 'low' : '';
  document.body.dataset.paused = m.paused ? '1' : '';
  // boss
  const boss = typeof m.boss === 'number';
  $('bossBar').hidden = !boss;
  if (boss) $('bossFill').style.transform = `scaleX(${clamp(m.boss, 0, 1).toFixed(3)})`;
  // players
  const pls = m.players || [];
  const sig = pls.map(p => `${p.id}|${p.name}|${p.n}|${colorOf(p.id)}`).join(',');
  const box = $('hPlayers');
  if (sig !== plSig) {
    plSig = sig;
    box.innerHTML = pls.map(p => `<div class="pl" data-id="${esc(p.id)}" style="--c:${esc(colorOf(p.id) || 'oklch(0.97 0.012 315)')}"><div class="who"><i>${esc(p.n || '')}</i><b>${esc(p.name || 'Player')}</b></div><div class="n"><b>0</b><span>Kills</span></div><div class="hp"><i></i></div></div>`).join('');
  }
  pls.forEach((p, i) => {
    const el = box.children[i];
    if (!el) return;
    const down = p.down > 0;
    el.dataset.down = down ? '1' : '';
    el.dataset.hp = p.hp <= 35 ? 'low' : '';
    text(el.querySelector('.n b'), down ? Math.ceil(p.down) : (p.kills || 0));
    text(el.querySelector('.n span'), down ? 'Back in' : 'Kills');
    el.querySelector('.hp i').style.transform = `scaleX(${clamp((p.hp || 0) / 100, 0, 1).toFixed(2)})`;
  });
  if (m.paused) banner('Paused', 'The game continues in a moment', '', 1500);
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

let bannerTimer = 0, bannerUntil = 0, bannerPrio = 0;
function banner(title, sub = '', tone = '', ms = 3600, prio = 1) {
  const now = performance.now();
  if (now < bannerUntil && prio < bannerPrio) return;
  bannerUntil = now + ms; bannerPrio = prio;
  const el = $('banner');
  text($('bannerText'), title); text($('bannerSub'), sub);
  el.dataset.tone = tone;
  el.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.classList.remove('on'); bannerPrio = 0; }, ms);
}
function onEvent(e) {      // simple TV: banners only for a wave, a cleared wave, the boss and a player down
  director.event(e);
  const st = S.start, name = id => S.snap?.players?.find(p => p.id === id)?.name || 'A player';
  switch (e.k) {
    case 'wave': return banner(`Wave ${e.n}`, st?.waveNames?.[e.n - 1] || '', '', 4200, 2);
    case 'clear': return banner(`Wave ${e.n} cleared`, e.clean ? 'No gate lost' : '', 'good', 3600, 2);
    case 'boss': return banner('The boss is here', '', 'bad', 5000, 4);
    case 'down': return banner(`${name(e.p)} is down`, e.t ? `Back in ${Math.ceil(e.t)} seconds` : '', 'bad', 3600, 3);
  }
}

// ---------- results ----------
function renderResults() {
  const run = S.session?.run, r = run?.results || S.snap?.result;
  if (!r) return;
  text($('rTeam'), run?.team || r.team ? `Team ${run?.team || r.team}` : 'Final score');
  text($('rScore'), num(r.score));
  text($('rDiff'), DIFF[r.difficulty || r.level || run?.difficulty] || '');
  text($('rRank'), r.newRecord ? 'New record' : r.rank ? `Rank ${r.rank}` : (r.won === false ? '' : r.won ? 'Survived' : ''));
  const rows = (r.players || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  $('rRows').innerHTML = rows.map(p => `<tr><td><i style="--c:${esc(colorOf(p.id) || 'oklch(0.97 0.012 315)')}">${esc(p.n || '')}</i>${esc(p.name || 'Player')}</td><td>${num(p.kills)}</td><td>${num(p.deaths)}</td><td>${num(p.score)}</td></tr>`).join('');
}

// ---------- full screen, pointer ----------
addEventListener('click', () => {
  if (embed || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
});
let quietTimer = 0;
function awake() {
  document.body.classList.remove('quiet');
  $('hint').classList.toggle('off', !!document.fullscreenElement);
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => { document.body.classList.add('quiet'); $('hint').classList.add('off'); }, 3500);
}
addEventListener('mousemove', awake); addEventListener('fullscreenchange', awake);
awake();
try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* the screen may sleep */ }

connect();
setInterval(decide, 500);

// for checks from the console (and for driving the page while its tab is not drawn)
window.__tv = { S, director, quality, step, decide, handle, get frame() { return frame; }, get arena() { return frame?.contentWindow?.__arena; } };

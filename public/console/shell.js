// MS Games 2 · console shell: Simple/Advanced, the status bar, the headset rail and its menu,
// the side panel (system status, help) and Home. Runs after console.js and uses its helpers
// ($, text, attr, show, make, parts, syncList, call, toast, twoStep, editInPlace, go, state).

'use strict';

const App = window.App = {
  views: {},          // section → render function, filled by flow.js, run.js, setup.js, pages.js
  onGo: {},           // section → called when the operator opens it
  stateAt: 0,         // when the last state arrived (clocks count from it)
  lastRunKey: '',
};

const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const HS_COLORS = ['oklch(0.7 0.16 28)', 'oklch(0.71 0.12 250)', 'oklch(0.75 0.14 152)', 'oklch(0.7 0.13 300)', 'oklch(0.77 0.14 62)', 'oklch(0.76 0.1 195)', 'oklch(0.73 0.14 350)', 'oklch(0.86 0.13 98)', 'oklch(0.7 0.03 250)', 'oklch(0.9 0.01 110)'];
const LEVELS = [{ id: 'easy', name: 'Easy' }, { id: 'normal', name: 'Normal' }, { id: 'hard', name: 'Hard' }, { id: 'nightmare', name: 'Nightmare' }];
const levelName = id => (LEVELS.find(l => l.id === id) || { name: id || '' }).name;
const hsColor = h => (h && h.color) || HS_COLORS[((Number(h && h.number) || 1) - 1) % HS_COLORS.length];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtMs = ms => fmtClock(Math.max(0, ms) / 1000);
const RUN_LIVE = ['countdown', 'loading', 'playing', 'paused', 'voting', 'break', 'waiting'];
/** Times come as epoch ms (server) or ISO text (older mock): one number either way. */
const ts = v => (typeof v === 'number' ? v : v ? Date.parse(v) : NaN);
const venueOf = s => ({ name: (s && ((s.venue && s.venue.name) || s.venueName)) || 'MS Games', logo: (s && ((s.venue && s.venue.logo) || s.logo)) || null });
const runLive = r => !!r && RUN_LIVE.includes(r.state);
const runOpen = r => !!r && r.state !== 'idle';

/** Every console → server call of MS Games 2. Never throws: returns {ok, status, data}. */
async function api(path, body, { method, quiet } = {}) {
  const m = method || (body === undefined ? 'GET' : 'POST');
  let res, data = {};
  try {
    res = await fetch(path, m === 'GET' ? { cache: 'no-store' } : { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    data = await res.json().catch(() => ({}));
  } catch {
    if (!quiet) toast('No connection to the server', 'error');
    return { ok: false, status: 0, data: {} };
  }
  const ok = res.ok && !data.error;
  if (!ok && !quiet && res.status !== 404 && res.status !== 409) toast(data.error || `Failed (${res.status})`, 'error');
  if (!ok && !quiet && res.status === 404) toast('The server does not know this yet. Update MS Games.', 'warn');
  return { ok, status: res.status, data };
}
App.api = api;

// ---------- mode: Simple or Advanced ----------

function setMode(mode) {
  mode = mode === 'advanced' ? 'advanced' : 'simple';
  $('app').dataset.mode = mode;
  LS.set('msg.mode', mode);
  for (const b of $('modeSeg').children) { b.classList.toggle('on', b.dataset.mode === mode); attr(b, 'aria-checked', b.dataset.mode === mode ? 'true' : 'false'); }
}
function setRail(open) {
  $('app').dataset.hsrail = open ? 'open' : 'closed';
  LS.set('msg.hsrail', open ? 'open' : 'closed');
}
setMode(LS.get('msg.mode', 'simple'));
setRail(true);      // the rail opens by itself on launch

// ---------- headset: one word for its state ----------

function inRun(h) { const r = state && state.run; return !!r && (r.players || []).some(p => p.headsetId === h.id); }
const WORD_TONE = { Ready: 'idle', 'Waiting room': 'lobby', Loading: 'load', Playing: 'play', Paused: 'warn', Dropped: 'bad', 'Not calibrated': 'warn', Sleeping: 'sleep', Offline: 'off', Calibrating: 'warn', Benched: 'bench' };
function droppedFor(h) {
  const r = state.run;
  const d = r && (r.dropped || []).find(x => x.headsetId === h.id);
  if (d) return nOr0(d.sinceMs) + (Date.now() - App.stateAt);
  const t = ts(h.droppedAt);
  return Number.isFinite(t) ? Date.now() - t : null;
}
function hsWord(h) {
  const r = state.run;
  if (!h.online) {
    if ((inRun(h) && runLive(r)) || h.state === 'Dropped') {
      const ms = droppedFor(h);
      return { s: 'bad', w: ms == null ? 'Dropped' : `Dropped ${fmtMs(ms)}` };
    }
    return { s: 'off', w: 'Offline' };
  }
  const sp0 = state.setup && state.setup.points && state.setup.points[h.id];
  if (sp0 === 'p1' || sp0 === 'p2') return { s: 'warn', w: sp0 === 'p1' ? 'Touch mark A' : 'Touch mark B' };
  if (h.state && WORD_TONE[h.state]) {      // the server's word (section 9), with the loading percent added
    if (h.state === 'Loading' && typeof h.load === 'number' && h.load > 0) return { s: 'load', w: `Loading ${Math.round(clamp(h.load, 0, 1) * 100)} %` };
    return { s: WORD_TONE[h.state], w: h.state };
  }
  if (h.benched) return { s: 'bench', w: 'Benched' };
  if (h.phase === 'calibrating') return { s: 'warn', w: 'Calibrating' };
  if (h.phase === 'loading') return { s: 'load', w: typeof h.load === 'number' && h.load > 0 ? `Loading ${Math.round(clamp(h.load, 0, 1) * 100)} %` : 'Loading' };
  if (h.phase === 'playing') return r && r.state === 'paused' ? { s: 'warn', w: 'Paused' } : { s: 'play', w: 'Playing' };
  if (!h.desk && (h.needsCalibration || !h.hasCalibration)) return { s: 'warn', w: 'Not calibrated' };
  if (h.sleeping) return { s: 'sleep', w: 'Sleeping' };
  if (h.inLobby || state.flow || runOpen(r)) return { s: 'lobby', w: 'Waiting room' };
  return { s: 'idle', w: 'Ready' };
}
App.hsWord = hsWord;
/** Ready to be chosen for a game: online, not busy, calibrated. */
const hsFree = h => h.online && !h.benched && (h.phase === 'idle' || !h.phase) && !h.sleeping;
const hsAligned = h => !!h.desk || (!!h.hasCalibration && !h.needsCalibration);

function hsSquare(h, cls = '') {
  const el = document.createElement('span');
  el.className = `hsq ${cls}`.trim();
  return el;
}
/** Paints a number-on-colour square (rail, rows, menu). */
function paintSq(el, h) {
  const c = hsColor(h);
  if (el._c !== c) { el._c = c; el.style.setProperty('--hc', c); }
  text(el, h.number || '·');
  el.classList.toggle('off', !h.online);
}
App.paintSq = paintSq;

// ---------- status bar ----------

function issuesNow() {
  const out = [];
  if (!connected) out.push({ level: 'error', title: 'No connection to the server', text: 'The console cannot reach the MS Games server on this computer. Restart MS Games if this stays.' });
  if (!state) return out;
  const hs = state.headsets || [];
  for (const h of hs) {
    if (!h.online) { if (inRun(h) && runLive(state.run)) out.push({ level: 'error', hs: h, title: `${h.name} dropped`, text: 'It left the game. The game waits for it.' }); continue; }
    if (typeof h.battery === 'number' && h.battery < 20 && !h.charging) out.push({ level: 'warn', hs: h, title: `${h.name}: battery ${Math.round(h.battery)} %`, text: 'Charge it after this game.' });
    const c = h.controllers || {};
    for (const side of ['left', 'right']) if (typeof c[side] === 'number' && c[side] < 20) out.push({ level: 'warn', hs: h, title: `${h.name}: ${side} controller ${Math.round(c[side])} %`, text: 'Swap the battery or charge the controller.' });
    if (!h.desk && (h.needsCalibration || !h.hasCalibration)) out.push({ level: 'warn', hs: h, fix: 'points', title: `${h.name} is not calibrated`, text: 'It does not know where the two floor marks are. Re-calibrate its points.' });
    const p = h.health && h.health.pingMs;
    if (typeof p === 'number' && p > 80) out.push({ level: 'warn', hs: h, title: `${h.name}: weak Wi-Fi (${p} ms)`, text: 'Move the router closer to the play area or use 5 GHz.' });
  }
  for (const c of (App.diag && App.diag.checks) || []) if (c.ok === false && c.group !== 'headset') out.push({ level: c.level === 'warn' ? 'warn' : 'error', title: c.label, text: c.text, diagFix: c.fix || null });
  return out;
}
App.issuesNow = issuesNow;

function renderStatusbar() {
  const hs = state.headsets || [], online = hs.filter(h => h.online).length;
  const venue = venueOf(state.settings).name;
  text($('sbVenue'), venue);
  text($('sbOnline'), online);
  text($('sbTotal'), hs.length);
  const iss = issuesNow(), errs = iss.filter(i => i.level === 'error').length, warns = iss.length - errs;
  attr($('sbStatus'), 'data-tone', errs ? 'bad' : warns ? 'warn' : 'ok');
  text($('sbStatusText'), errs ? plural(errs, 'error', 'errors') : warns ? plural(warns, 'warning', 'warnings') : 'OK');
  const r = state.run, live = runOpen(r);
  show($('sbRun'), live && section !== 'run');
  show($('navRun'), live);
  if (live) {
    text($('sbRunName'), r.gameName || '');
    text($('sbRunState'), runStateWord(r).w);
    attr($('sbRun'), 'data-tone', r.state === 'paused' ? 'warn' : null);
  }
  if (live) show($('sessionChip'), false);      // the old chip is for sessions started the old way
  tickRunClocks();
  if ($('drawer').dataset.kind === 'status' && !$('drawer').hidden) fillStatus();
}

function runStateWord(r) {
  if (!r) return { s: 'idle', w: '' };
  switch (r.state) {
    case 'waiting': return r.vote ? { s: 'load', w: 'Voting' } : { s: 'idle', w: 'Break' };
    case 'countdown': return { s: 'load', w: 'Countdown' };
    case 'loading': return { s: 'load', w: 'Loading' };
    case 'playing': return { s: 'play', w: 'Playing' };
    case 'paused': return { s: 'warn', w: (r.pausedBy || []).length ? 'Paused, headset dropped' : 'Paused' };
    case 'voting': return { s: 'load', w: 'Voting' };
    case 'break': return { s: 'idle', w: 'Break' };
    case 'results': return { s: 'idle', w: 'Results' };
    case 'ended': return { s: 'idle', w: 'Ended' };
    default: return { s: 'idle', w: r.state || '' };
  }
}
App.runStateWord = runStateWord;

/** The run's clocks, moved on from the moment the state arrived. */
function runClock(r) {
  const dt = Date.now() - App.stateAt, ticking = r.state === 'playing';
  const gRem = r.gameRemainingMs != null ? r.gameRemainingMs : r.remainingMs;
  const gEl = r.gameElapsedMs != null ? r.gameElapsedMs : r.elapsedMs;
  const rem = Math.max(0, nOr0(gRem) - (ticking ? dt : 0));
  const el = nOr0(gEl) + (ticking ? dt : 0);
  const allEl = r.totalElapsedMs != null ? nOr0(r.totalElapsedMs) + dt : null;
  const allRem = r.totalRemainingMs == null ? null : Math.max(0, nOr0(r.totalRemainingMs) - (['paused', 'results'].includes(r.state) ? 0 : dt));
  return { rem, el, allEl, allRem, last: ticking && rem <= 60000 };
}
/** When the next thing happens in a break or a vote (ms epoch), or NaN. */
function runNextAt(r) {
  if (r.vote && r.vote.endsAt) return ts(r.vote.endsAt);
  return ts(r.nextAt || r.breakEndsAt);
}
App.runNextAt = runNextAt;
App.runClock = runClock;

function tickRunClocks() {
  const r = state && state.run;
  if (!runOpen(r)) return;
  const c = runClock(r);
  const nx = runNextAt(r);
  const sbv = ['playing', 'paused'].includes(r.state) ? fmtMs(c.rem) : Number.isFinite(nx) && nx > 0 ? fmtMs(nx - Date.now()) : fmtMs(c.rem);
  text($('sbRunClock'), sbv);
  if (App.tickRun) App.tickRun(c);
}
setInterval(() => { if (state) { tickRunClocks(); if (state.run && runLive(state.run)) renderRail(); } }, 500);

// ---------- headset rail ----------

const DOTS = '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="3.5" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="9" cy="14.5" r="1.6"/></svg>';
function meter(label) { return `<span class="hm" data-f="m${label}"><span>${label}</span><span class="mbar"><i data-f="b${label}"></i></span><b data-f="v${label}"></b></span>`; }

function renderRail() {
  const hs = [...(state.headsets || [])].sort(byNumber);
  const online = hs.filter(h => h.online).length;
  text($('hrCount'), hs.length ? `${online} of ${hs.length}` : '');
  show($('hrEmpty'), !hs.length);
  syncList($('hrList'), hs, h => h.id, () => make(`
    <div class="hs-card" data-hs>
      <span class="hs-num" data-f="num"></span>
      <div class="hs-head"><button type="button" class="hs-name" data-f="name" data-rename title="Tap to rename"></button><span class="hs-state" data-f="st"><i></i><span data-f="word"></span></span></div>
      <button type="button" class="hs-more" data-hsmenu aria-label="Headset actions">${DOTS}</button>
      <div class="hs-meters">${meter('H')}${meter('L')}${meter('R')}<span class="hm hm-ping" data-f="ping"><b data-f="pingV"></b></span></div>
    </div>`), (el, h) => {
    const p = parts(el), w = hsWord(h);
    const c = hsColor(h);
    if (p.num._c !== c) { p.num._c = c; p.num.style.setProperty('--hc', c); }
    text(p.num, h.number || '·');
    el.classList.toggle('off', !h.online);
    if (!p.name._editing) text(p.name, h.name);
    attr(p.st, 'data-s', w.s);
    text(p.word, w.w);
    const ctl = h.controllers || {};
    paintMeter(p, 'H', h.online ? h.battery : null, h.charging);
    paintMeter(p, 'L', h.online ? ctl.left : null, ctl.leftCharging);
    paintMeter(p, 'R', h.online ? ctl.right : null, ctl.rightCharging);
    const hl = h.health || {}, ping = h.online && typeof hl.pingMs === 'number' ? hl.pingMs : null;
    text(p.pingV, ping == null ? '' : `${ping} ms`);
    attr(p.ping, 'data-tone', ping == null ? null : ping > 120 ? 'bad' : ping > 60 ? 'warn' : null);
    attr(p.ping, 'title', ping == null ? null : `Wi-Fi: ping ${ping} ms now, ${hl.pingMin ?? '?'} to ${hl.pingMax ?? '?'} ms over 30 min, ${plural(nOr0(hl.drops), 'drop', 'drops')}${hl.wifi != null ? `, signal ${hl.wifi} %` : ''}`);
  });
}
function paintMeter(p, k, v, charging) {
  const has = typeof v === 'number';
  show(p[`m${k}`], has);
  if (!has) return;
  text(p[`v${k}`], Math.round(v));
  p[`b${k}`].style.width = `${clamp(v, 0, 100)}%`;
  attr(p[`m${k}`], 'data-low', v < 20 && !charging);
  attr(p[`m${k}`], 'data-charging', !!charging);
  attr(p[`m${k}`], 'title', `${k === 'H' ? 'Headset' : k === 'L' ? 'Left controller' : 'Right controller'} ${Math.round(v)} %${charging ? ', charging' : ''}`);
}

// ---------- headset menu (long press, right click, or the dots) ----------

let menuFor = null;
function openMenu(id, anchor) {
  const h = (state.headsets || []).find(x => x.id === id);
  if (!h) return;
  closeMenu();
  menuFor = id;
  const r = state.run, playingHere = inRun(h) && runLive(r);
  const m = $('hsMenu');
  m.innerHTML = `
    <div class="menu-head"><span class="hsq sm" data-f="sq"></span><b>${esc(h.name)}</b><span class="muted">${esc(hsWord(h).w)}</span></div>
    <button type="button" class="mi" data-mi="identify">Identify<small>controllers vibrate</small></button>
    <button type="button" class="mi" data-mi="restartGame" ${playingHere && h.online ? '' : 'disabled'}>Restart game on this headset</button>
    <button type="button" class="mi" data-mi="recalibrate" ${h.online ? '' : 'disabled'}>Recalibrate points</button>
    <button type="button" class="mi" data-mi="height" ${h.online ? '' : 'disabled'}>Calibrate height<small>in cm</small></button>
    <button type="button" class="mi" data-mi="swapHands" ${h.online ? '' : 'disabled'}>Swap hands</button>
    <div class="msep"></div>
    <button type="button" class="mi" data-mi="message" ${h.online ? '' : 'disabled'}>Send message</button>
    <button type="button" class="mi" data-mi="removeMsg" ${h.online ? '' : 'disabled'}>Remove-headset message</button>
    <button type="button" class="mi" data-mi="bench">${h.benched ? 'Back to the games' : 'Bench'}<small>${h.benched ? 'can be chosen again' : 'keep in the waiting room'}</small></button>
    <button type="button" class="mi" data-mi="rename">Rename</button>
    <div class="msep"></div>
    <button type="button" class="mi" data-mi="reload" ${h.online ? '' : 'disabled'}>Reload page</button>
    <button type="button" class="mi danger" data-mi="reboot" data-confirm="Press again to reboot">Reboot<small>over USB debugging</small></button>`;
  const sq = m.querySelector('[data-f="sq"]');
  paintSq(sq, h);
  m.hidden = false;
  const card = $('hrList').querySelector(`[data-key="${CSS.escape(id)}"]`);
  if (card) card.classList.add('menu-open');
  const a = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = a.left - mw - 8, y = a.top;
  if (x < 8) x = Math.min(window.innerWidth - mw - 8, a.right + 8);
  y = clamp(y, 64, window.innerHeight - mh - 12);
  m.style.left = `${x}px`; m.style.top = `${y}px`;
  m.querySelector('.mi:not(:disabled)')?.focus({ preventScroll: true });
}
function closeMenu() {
  const m = $('hsMenu');
  if (m.hidden) return;
  m.hidden = true; m.innerHTML = '';
  document.querySelectorAll('.hs-card.menu-open').forEach(c => c.classList.remove('menu-open'));
  menuFor = null;
}
App.openMenu = openMenu;
App.closeMenu = closeMenu;

function menuForm(btn, { placeholder, type = 'text', value = '', send }) {
  const f = make(`<div class="menu-form"><input class="input" type="${type}" placeholder="${esc(placeholder)}" ${type === 'number' ? 'min="100" max="220" inputmode="numeric"' : 'maxlength="80"'}><button type="button" class="btn btn-primary">Send</button></div>`);
  btn.replaceWith(f);
  const input = f.querySelector('input'), go2 = async () => { const v = input.value.trim(); if (!v) return; await send(v); closeMenu(); };
  input.value = value;
  input.focus();
  input.onkeydown = e => { if (e.key === 'Enter') go2(); else if (e.key === 'Escape') closeMenu(); };
  f.querySelector('button').onclick = go2;
}

async function hsAction(id, action, value) {
  const body = { headsetId: id, action };
  if (value !== undefined) body.value = value;
  const r = await api('/api/headset/action', body);
  return r.ok;
}
App.hsAction = hsAction;

$('hsMenu').addEventListener('click', async e => {
  const b = e.target.closest('[data-mi]');
  if (!b || b.disabled) return;
  const id = menuFor, h = (state.headsets || []).find(x => x.id === id);
  if (!h) return closeMenu();
  const act = b.dataset.mi;
  if (act === 'height') return menuForm(b, { placeholder: 'Player height, cm', type: 'number', send: v => hsAction(id, 'calibrateHeight', { cm: Number(v) }).then(ok => ok && toast(`${h.name}: height ${v} cm`)) });
  if (act === 'message') return menuForm(b, { placeholder: 'Shown in the headset for 6 s', send: v => hsAction(id, 'message', { text: v, seconds: 6 }).then(ok => ok && toast(`Sent to ${h.name}`)) });
  if (act === 'reboot') return twoStep(b, async () => { closeMenu(); if (await hsAction(id, 'reboot')) toast(`${h.name} reboots`); });
  closeMenu();
  if (act === 'identify') { const r = await api('/api/headset/action', { headsetId: id, action: 'identify' }, { quiet: true }); if (!r.ok) await call('/api/headset/identify', { headsetId: id }).catch(() => {}); toast(`${h.name}: controllers vibrate`); return; }
  if (act === 'removeMsg') { const r = await api('/api/endmessage', { headsetIds: [id], preset: 'remove' }); if (r.ok) toast(`${h.name}: remove-headset message sent`); return; }
  if (act === 'bench') { if (await hsAction(id, 'bench', !h.benched)) toast(h.benched ? `${h.name} can play again` : `${h.name} stays in the waiting room`); return; }
  if (act === 'rename') { const el = $('hrList').querySelector(`[data-key="${CSS.escape(id)}"] .hs-name`); if (el) startRailRename(el, id); return; }
  if (act === 'recalibrate') { if (await hsAction(id, 'recalibrate')) toast(`${h.name}: touch marks A and B in the headset`); return; }
  const names = { restartGame: 'restarts the game', swapHands: 'hands swapped', reload: 'reloads the page' };
  if (await hsAction(id, act)) toast(`${h.name} ${names[act] || 'done'}`);
});

function startRailRename(el, id) {
  const h = (state.headsets || []).find(x => x.id === id);
  if (!h) return;
  editInPlace(el, h.name, { label: 'Headset name', save: v => call('/api/headset/rename', { headsetId: id, name: v }).catch(() => {}) });
}

// long press and right click on a card
let pressT = null, pressAt = null;
$('hrList').addEventListener('pointerdown', e => {
  const card = e.target.closest('[data-hs]');
  if (!card || e.button !== 0 || e.target.closest('input')) return;
  pressAt = { x: e.clientX, y: e.clientY };
  clearTimeout(pressT);
  pressT = setTimeout(() => { pressT = null; card._long = true; openMenu(card.dataset.key, card.querySelector('.hs-more')); }, 520);
});
$('hrList').addEventListener('pointermove', e => { if (pressT && pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) { clearTimeout(pressT); pressT = null; } });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('hrList').addEventListener(ev, () => { clearTimeout(pressT); pressT = null; });
$('hrList').addEventListener('contextmenu', e => {
  const card = e.target.closest('[data-hs]');
  if (!card) return;
  e.preventDefault();
  openMenu(card.dataset.key, card.querySelector('.hs-more'));
});
$('hrList').addEventListener('click', e => {
  const card = e.target.closest('[data-hs]');
  if (!card) return;
  if (card._long) { card._long = false; e.preventDefault(); e.stopPropagation(); return; }
  if (e.target.closest('[data-hsmenu]')) { e.stopPropagation(); return menuFor === card.dataset.key ? closeMenu() : openMenu(card.dataset.key, e.target.closest('[data-hsmenu]')); }
  const nm = e.target.closest('[data-rename]');
  if (nm) { e.stopPropagation(); startRailRename(nm, card.dataset.key); }
}, true);
document.addEventListener('pointerdown', e => { if (!$('hsMenu').hidden && !e.target.closest('#hsMenu') && !e.target.closest('[data-hsmenu]')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeDrawer(); } });
window.addEventListener('resize', closeMenu);
$('hrList').addEventListener('scroll', closeMenu);

// ---------- side panel: system status and help ----------

function openDrawer(kind) {
  const d = $('drawer');
  if (!d.hidden && d.dataset.kind === kind) return closeDrawer();
  d.dataset.kind = kind;
  d.hidden = false;
  if (kind === 'status') { text($('drawerTitle'), 'System status'); fillStatus(); }
  else { text($('drawerTitle'), 'Help'); fillHelp(); }
}
function closeDrawer() { $('drawer').hidden = true; }
App.openDrawer = openDrawer;

function fillStatus() {
  const iss = issuesNow(), body = $('drawerBody');
  const sig = JSON.stringify(iss.map(i => [i.level, i.title]));
  if (body._sig === sig) return;
  body._sig = sig;
  body.textContent = '';
  if (!iss.length) {
    body.append(make(`<ul class="issues"><li data-level="ok"><i></i><b>Everything is working</b><p>Server connected, headsets charged and calibrated, Wi-Fi fine.</p></li></ul>`));
  } else {
    const ul = make('<ul class="issues"></ul>');
    for (const i of iss) {
      const li = make(`<li data-level="${i.level}"><i></i><b></b><p></p></li>`);
      li.querySelector('b').textContent = i.title;
      li.querySelector('p').textContent = i.text || '';
      if (i.fix === 'points') { const b = make('<button type="button" class="btn">Re-calibrate</button>'); b.onclick = () => { closeDrawer(); App.startSetup && App.startSetup('points'); }; li.append(b); }
      if (i.diagFix) { const b = make('<button type="button" class="btn">Fix</button>'); b.onclick = () => App.diagFix && App.diagFix(i.diagFix); li.append(b); }
      ul.append(li);
    }
    body.append(ul);
  }
  const more = make('<div class="btn-row"><button type="button" class="btn btn-lg">Open Diagnose</button></div>');
  more.querySelector('button').onclick = () => { closeDrawer(); go('diagnose'); };
  body.append(more);
}

function fillHelp() {
  const body = $('drawerBody');
  body._sig = null;
  body.innerHTML = `
    <h3>Run a game</h3>
    <ol class="help-steps">
      <li><span><b>Quick Play</b> on Home. Every headset goes to the waiting room at once.</span></li>
      <li><span><b>Pick the game.</b> A dimmed game says why it cannot run right now.</span></li>
      <li><span><b>Pick the players.</b> Untick a headset to leave it in the waiting room.</span></li>
      <li><span><b>Start.</b> The console checks batteries, controllers and calibration first. Fix what it lists or press Start anyway.</span></li>
      <li><span><b>While it runs</b> you can pause, change the difficulty and quit. If a headset drops, the game pauses by itself and goes on when it is back.</span></li>
    </ol>
    <h3>Headsets</h3>
    <ol class="help-steps">
      <li><span>Tap a <b>name</b> to rename it. Hold a card, right click it or tap the dots for identify, recalibrate, height, messages and reboot.</span></li>
      <li><span><b>H L R</b> are the headset and the two controllers. The ms number is the Wi-Fi delay.</span></li>
    </ol>
    <h3>When something is wrong</h3>
    <ol class="help-steps">
      <li><span>The <b>status</b> button on top lists every problem and what to do.</span></li>
      <li><span><b>Diagnose</b> checks the network and the firewall and saves a bug report on the Desktop.</span></li>
    </ol>`;
}

$('sbStatus').onclick = () => openDrawer('status');
$('sbHelp').onclick = () => openDrawer('help');
$('drawerClose').onclick = closeDrawer;
$('sbHeadsets').onclick = () => setRail($('app').dataset.hsrail !== 'open');
$('hrClose').onclick = () => setRail(false);
$('modeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  setMode(b.dataset.mode);
  const simpleOnly = ['games', 'overview', 'headsets', 'calib', 'match'];
  if (b.dataset.mode === 'simple' && simpleOnly.includes(section) && !runOpen(state && state.run)) go('home');
  scheduleRender();
});

// ---------- Home ----------

function playableGames() { return (state.games || []).filter(g => g.web !== false && g.status !== 'soon'); }
App.playableGames = playableGames;

let presetCount = null, presetAt = 0;
function loadPresetCount() {
  if (Date.now() - presetAt < 20000) return;
  presetAt = Date.now();
  api('/api/playlist/presets', undefined, { quiet: true }).then(r => { presetCount = r.ok ? (r.data.presets || []).length : null; scheduleRender(); });
}

function renderHome() {
  const s = state.settings || {}, hs = state.headsets || [];
  text($('homeVenue'), venueOf(s).name);
  const online = hs.filter(h => h.online), ready = online.filter(h => hsFree(h) && hsAligned(h));
  const notCal = online.filter(h => !hsAligned(h));
  const c = state.calibration;
  const area = s.area || (state.setup && state.setup.area && state.setup.area.w ? state.setup.area : null) || (c && c.width ? { w: c.width, d: c.depth } : null);
  const bits = [`<b>${online.length}</b> of ${hs.length} headsets online`, `<b>${ready.length}</b> ready`];
  bits.push(area ? `play area ${esc(fmtArea(area))}` : '<span data-tone="warn">play area not set</span>');
  if (notCal.length) bits.push(`<span data-tone="warn">${notCal.length} not calibrated</span>`);
  const line = bits.join(' · ');
  const el = $('homeLine');
  if (el._h !== line) { el._h = line; el.innerHTML = line; }

  // covers of the games on the Quick Play tile
  const games = playableGames();
  syncList($('quickArt'), games.slice(0, 3), g => g.id, () => make('<span><em data-f="n"></em></span>'), (sp, g) => {
    const p = parts(sp);
    sp.style.setProperty('--g', g.color || '');
    text(p.n, g.name);
    if (sp._url !== g.cover) {
      sp._url = g.cover;
      sp.querySelector('img')?.remove();
      if (g.cover) { const img = new Image(); img.alt = ''; img.onload = () => { sp.prepend(img); p.n.hidden = true; }; img.src = g.cover; }
    }
  });
  // one game: it is the hero of Home (section 0); more games: the tile is Quick Play over their covers
  const one = games.length === 1 ? games[0] : null;
  show($('quickEyebrow'), !!one);
  text($('quickTitle'), one ? one.name : 'Quick Play');
  text($('quickDesc'), one ? (one.tagline || 'Play it now') : 'One game now. Pick it, pick the players, start.');
  $('quickArt').classList.toggle('one', !!one);
  show($('quickGo'), !!one && !(App.whyNot && App.whyNot(one)));
  if (one) {
    const cuts = Array.isArray(one.cuts) && one.cuts.length ? one.cuts : [one.minutes || 10];
    const lo = Math.max(1, nOr0(one.minPlayers) || 1), hi = nOr0(one.maxPlayers) || lo;
    const why = App.whyNot ? App.whyNot(one) : '';
    text($('quickMeta'), why || `${lo === hi ? lo : `${lo}–${hi}`} players · ${cuts.join(' or ')} min`);
    attr($('quickMeta'), 'data-tone', why ? 'warn' : null);
  } else { text($('quickMeta'), games.length ? `${plural(games.length, 'game', 'games')} installed` : 'No game installed yet'); attr($('quickMeta'), 'data-tone', null); }
  loadPresetCount();
  text($('playlistMeta'), presetCount == null ? '' : presetCount ? plural(presetCount, 'saved playlist', 'saved playlists') : 'No saved playlist yet');
  // one game: the players vote how hard each round is (S2); more games: they vote the next game
  text($('partyMeta'), games.length > 1 ? `${games.length} games to vote on` : games.length ? 'Players vote how hard each round is' : '');
  text($('partyDesc'), games.length === 1 ? `Several rounds of ${games[0].name} in a row, with the vote in the headset.` : 'Players vote in the headset for the next game.');
  $('partyTile').classList.toggle('no', !games.length);
  attr($('partyTile'), 'aria-disabled', !games.length ? 'true' : null);

  // one warning line when the arena is not ready to play
  let warn = '', btn = null;
  if (!hs.length) { warn = 'No headset has connected yet.'; btn = ['Add a headset', 'add']; }
  else if (!online.length) { warn = 'Every headset is offline. Put them on and open the MS Games app.'; }
  else if (!area) { warn = 'The play area is not set, so games do not know where the walls are.'; btn = ['Set the play area', 'area']; }
  else if (notCal.length === online.length) { warn = 'No headset is calibrated to the two floor marks.'; btn = ['Calibrate points', 'points']; }
  const w = $('homeWarn');
  show(w, !!warn);
  const sig = warn + (btn ? btn[1] : '');
  if (w._sig !== sig) {
    w._sig = sig;
    w.textContent = warn;
    if (btn) { const b = make(`<button type="button" class="btn">${esc(btn[0])}</button>`); b.onclick = () => App.startSetup(btn[1]); w.append(b); }
  }
  const diagBad = ((App.diag && App.diag.checks) || []).filter(x => x.ok === false && x.group !== 'headset').length;
  text($('linkDiag'), diagBad ? plural(diagBad, 'problem found', 'problems found') : 'Network and headsets');
  attr($('linkDiag'), 'data-tone', diagBad ? 'bad' : null);
  text($('linkSetup'), notCal.length ? `${notCal.length} not calibrated` : 'Play area, calibration, headsets');
  attr($('linkSetup'), 'data-tone', notCal.length ? 'warn' : null);
}
App.views.home = renderHome;

function fmtArea(a) {
  if (!a || !a.w) return '';
  const r = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  return `${r(a.w)} × ${r(a.d)} m`;
}
App.fmtArea = fmtArea;

// ---------- glue to console.js ----------

App.render = function (sec) {
  if (!state) return;
  if (state.run !== undefined) {
    const key = state.run ? `${state.run.id}` : '';
    const fresh = key && key !== App.lastRunKey;
    App.lastRunKey = key;
    // while a session runs the running view replaces Home; a new session takes over the flow too
    if (sec === 'home' && runOpen(state.run)) return go('run');
    if (sec === 'flow' && fresh && runOpen(state.run)) return go('run');
    // nothing runs and nothing to show: back Home (a start that is still on its way waits 5 s)
    if (sec === 'run' && !state.run && !App.endPending() && !state.session && Date.now() - (App.awaitRun || 0) > 5000) return go('home');
  }
  renderStatusbar();
  renderRail();
  const fn = App.views[sec];
  if (fn) fn();
  else if (sec === 'settings' && App.views.settingsForm) App.views.settingsForm();
};
/** A finished run whose end view the operator has not closed yet. */
App.dismissed = LS.get('msg.dismissed', '');
App.endPending = () => !!(state && !state.run && state.last && state.last.runId && state.last.runId !== App.dismissed && Date.now() - ts(state.last.endedAt) < 6 * 3600e3);
App.dismissEnd = () => { if (state && state.last) { App.dismissed = state.last.runId; LS.set('msg.dismissed', App.dismissed); } };
App.went = function (sec, sub) {
  closeMenu();
  show($('homeBtn'), sec !== 'home');
  if (sec === 'home' && state && runOpen(state.run)) { setTimeout(() => go('run'), 0); return; }
  if (sec === 'home' && state && App.endPending()) App.dismissEnd();      // the operator went Home: the end view is done
  if (App.onGo[sec]) App.onGo[sec](sub);
};

document.addEventListener('click', e => {
  const f = e.target.closest('[data-flow]');
  if (f && f.classList.contains('no')) return;
  if (f && App.openFlow) App.openFlow(f.dataset.flow);
});

// ---------- demo driver for screenshots and tests: ?mock=1&demo=<name> ----------
App.demos = {};
(() => {
  const name = new URLSearchParams(location.search).get('demo');
  if (!window.MSMock || !name) return;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const run = async () => { await wait(250); const fn = App.demos[name]; if (fn) await fn(wait); };
  window.addEventListener('load', run);
})();
App.demos['flow-game'] = async () => { App.openFlow('quick'); };

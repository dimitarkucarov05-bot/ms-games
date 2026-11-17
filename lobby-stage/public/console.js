// MS Games operator console: core. Connection, state, router and the small DOM helpers every page uses.
// The pages live in public/console/*.js (shell, flow, run, setup, pages, manage) and register App.views[section].
// The state comes from the server over WebSocket (/ui), or from public/console/mock.js with ?mock=1.
// Screens update in place: rows are kept and only what changed is rewritten, so nothing blinks or loses a tap.

'use strict';

const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nOr0 = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const TITLES = {
  home: 'Home', flow: 'New session', run: 'Session', setup: 'Setup', records: 'Records', scorecards: 'Scorecards',
  arena: 'Arena', headsets: 'Headsets', settings: 'Settings', diagnose: 'Diagnose',
};
const OLD_ROUTES = { games: 'home', board: 'records', overview: 'arena', calib: 'setup', match: 'home' };      // bookmarks from the old console

let state = null;          // the last state from the server
let connected = false;
let section = 'home';

// ---------- small DOM helpers ----------

function text(el, v) { v = String(v ?? ''); if (el.textContent !== v) el.textContent = v; }
function attr(el, name, v) {
  if (v === null || v === undefined || v === false) { if (el.hasAttribute(name)) el.removeAttribute(name); return; }
  v = v === true ? '' : String(v);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}
function show(el, on) { attr(el, 'hidden', on ? null : true); }
function make(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
/** The [data-f] children of an element, found once. */
function parts(el) {
  if (!el._p) { el._p = {}; el.querySelectorAll('[data-f]').forEach(n => { el._p[n.dataset.f] = n; }); }
  return el._p;
}
/** Keeps a container's children in step with a list: new ones are made, gone ones removed, order kept. */
function syncList(container, items, keyOf, create, update) {
  const old = new Map();
  for (const el of container.children) old.set(el.dataset.key, el);
  let prev = null;
  for (const item of items) {
    const key = String(keyOf(item));
    let el = old.get(key);
    if (el) old.delete(key); else { el = create(item); el.dataset.key = key; }
    update(el, item);
    const want = prev ? prev.nextSibling : container.firstChild;
    if (el !== want) container.insertBefore(el, want);
    prev = el;
  }
  for (const el of old.values()) el.remove();
}

function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const fmtScore = v => String(Math.round(nOr0(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pad2 = v => String(v).padStart(2, '0');
/** When something happened: the time if today, otherwise the date. */
function whenText(iso) {
  const d = new Date(typeof iso === 'number' ? iso : iso || ''), now = new Date();
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === now.toDateString()) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dm = `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}.${d.getFullYear()}`;
}
function whenFull(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
const byNumber = (a, b) => (a.number || 999) - (b.number || 999) || String(a.name).localeCompare(String(b.name), 'en', { numeric: true });
const gameById = id => ((state && state.games) || []).find(g => g.id === id) || null;

/** The address a headset browser opens (only with HTTPS). */
function playUrl() {
  const p = state && state.play, ip = ((state && state.serverAddresses) || [])[0];
  if (!p || !p.https || !ip) return '';
  return `https://${ip}:${p.port}${p.path}`;
}

/** A game's cover. Without a picture (or until it loads) the game's name stands on its colour. */
function paintCover(el, typeEl, g) {
  const col = g.color && window.CSS?.supports?.('color', g.color) ? g.color : '';
  if (el._col !== col) { el._col = col; el.style.setProperty('--g', col); }
  text(typeEl, g.name || '');
  const url = g.cover || '';
  if (el._url === url) return;
  el._url = url;
  el.querySelector('img')?.remove();
  el.classList.remove('has-img');
  if (!url) return;
  const img = new Image();
  img.alt = '';
  img.onload = () => { if (el._url !== url) return; el.prepend(img); el.classList.add('has-img'); };
  img.src = url;
}

/** Edit in place: the text becomes a field. Enter or leaving the field saves, Escape cancels. */
function editInPlace(el, value, { label, save, cls = '', allowEmpty = false, max = 28 }) {
  if (el._editing) return;
  el._editing = true;
  const input = document.createElement('input');
  input.className = `rename ${cls}`.trim();
  input.value = value;
  input.maxLength = max;
  input.setAttribute('aria-label', label);
  el.textContent = '';
  el.append(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async ok => {
    if (done) return;
    done = true;
    const v = input.value.replace(/\s+/g, ' ').trim();
    const changed = ok && v !== value && (v || allowEmpty);
    el._editing = false;
    el.textContent = changed ? v : value;      // shown at once; the next state confirms it
    if (changed) await save(v);
    scheduleRender();
  };
  input.onkeydown = e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
  input.onblur = () => finish(true);
}

// ---------- server ----------

function connect() {
  if (window.MSMock) {      // ?mock=1: the state comes from public/console/mock.js (the same shape as the server)
    connected = true;
    window.MSMock.subscribe(msg => { state = msg; if (window.App) App.stateAt = Date.now(); scheduleRender(); });
    return;
  }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ui`);
  ws.onopen = () => { connected = true; scheduleRender(); };
  ws.onclose = () => { connected = false; scheduleRender(); setTimeout(connect, 1500); };
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'state') { state = msg; if (window.App) App.stateAt = Date.now(); scheduleRender(); }
    else if (msg.type === 'toast') toast(msg.text, msg.level);
  };
}

/** Old-style call: throws on failure (the newer pages use App.api, which never throws). */
async function call(path, body = {}) {
  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    toast('No connection to the server', 'error');
    throw new Error('offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'Failed', 'error'); throw new Error(data.error || 'error'); }
  return data;
}

function toast(msg, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = msg;
  $('toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, 4600);
}

/** A dangerous action: the first press arms the button, the second runs it. No pop-ups. */
function twoStep(btn, run) {
  if (btn.dataset.armed) { disarm(btn); return run(); }
  btn.dataset.armed = '1';
  btn._label = btn.textContent;
  btn.textContent = btn.dataset.confirm || 'Press again to confirm';
  btn._timer = setTimeout(() => disarm(btn), 3600);
}
function disarm(btn) {
  clearTimeout(btn._timer);
  delete btn.dataset.armed;
  if (btn._label != null) { btn.textContent = btn._label; btn._label = null; }
}

// ---------- drawing ----------

let renderQueued = false;
/** Draws on the next frame; when the window is hidden (no frames) a timer stands in, so the console never falls behind. */
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  const run = () => { if (!renderQueued) return; renderQueued = false; if (state) render(); };
  requestAnimationFrame(run);
  setTimeout(run, 250);
}

function render() {
  show($('offlineBar'), !connected);
  if (window.App) App.render(section);
}

// ---------- sections ----------

function go(dest, push = true) {
  let [sec, sub = ''] = String(dest || '').split('/');
  if (OLD_ROUTES[sec]) { sec = OLD_ROUTES[sec]; sub = ''; }
  if (!TITLES[sec]) { sec = 'home'; sub = ''; }
  section = sec;
  $('app').dataset.section = sec;
  document.querySelectorAll('.nav').forEach(n => { n.classList.toggle('on', n.dataset.go === sec); attr(n, 'aria-current', n.dataset.go === sec ? 'page' : null); });
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== sec; });
  text($('title'), TITLES[sec]);
  document.title = `${TITLES[sec]} · MS Games`;
  const hash = `#${sec}${sub ? `/${sub}` : ''}`;
  if (push && location.hash !== hash) history.replaceState(null, '', hash);
  if (window.App) App.went(sec, sub);
  if (state) render();
}

document.addEventListener('click', e => {
  const nav = e.target.closest('.nav');
  if (nav) return go(nav.dataset.go);
  const link = e.target.closest('[data-nav]');
  if (link) return go(link.dataset.nav);
});
window.addEventListener('hashchange', () => go(location.hash.slice(1), false));

// ---------- start (after every page module has loaded) ----------

window.addEventListener('DOMContentLoaded', () => {
  go(location.hash.slice(1) || 'home', false);
  connect();
});

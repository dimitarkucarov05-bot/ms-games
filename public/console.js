// MS Games. Пускач на игри и пулт на залата: библиотека с игри, каски, зона и калибровка, мач.
// Състоянието идва от сървъра по WebSocket (/ui). Екранът се обновява на място:
// редовете се пазят и се сменя само промененото, за да не мига и да не се губят кликове.

'use strict';

const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nOr0 = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const TITLES = { overview: 'Watch', headsets: 'Headsets', calib: 'Calibration', games: 'Games', board: 'Leaderboard', match: 'Match', settings: 'Settings' };
const PHASE_BG = { waiting: 'Waiting for players', countdown: 'Countdown', playing: 'Round running', over: 'Round over' };
const CAM_NAMES = { cam_1: 'Camera 1', cam_2: 'Camera 2', cam_3: 'Camera 3', cam_4: 'Camera 4', cam_top: 'Top view' };

let state = null;                    // последното състояние от сървъра
let connected = false;
let section = 'games';
let view = { mode: 'plan' };         // plan | persp | corner (idx) | top | grid | headset (id)
let live = { ok: false, cams: [] };  // кадри на живо от играта на компютъра, ако върви
let userPickedView = false;
let focusId = null;                  // каска, осветена на плана
let renamingId = null;
const selected = new Set();          // каски, избрани за игра
let pickAll = true;                  // няма изричен избор: играта тръгва на всички свободни каски
let gameId = null;                   // отворената игра в „Игри" (null = библиотеката)
const gameOpts = new Map();          // игра → { theme, fast }: изборите на оператора за пускането
let launchCtx = null;                // последното пускане от този екран: { gameId, ids, theme, fast, at, pending, sessionAt }
let launchBusy = false;
let ranKey = '';                     // сесията (по startedAt), която вече е стигнала до „играе"
let watchPov = null;                 // каската, през чиито очи се гледа в момента
let lastSession = null;              // { key, name, ran }: за съобщението, когато играта свърши сама
let stopAt = 0;                      // кога операторът е натиснал „Спри" оттук
let boardGame = null;                // играта, чиято класация се гледа
let boardPeriod = 'day';             // day | week | month | all
const scoreCache = new Map();        // „игра|период|брой" → { v, t, list, total, loaded, busy, failed }
let lastResultId;                    // последният резултат, видян в състоянието (undefined: още не е идвало състояние)
let resultSeen = null;               // резултат, записан пред този екран: показва се на страницата на играта
let resultDone = null;               // резултат, който операторът вече е затворил

// ---------- малки помощници за DOM ----------

function text(el, v) { v = String(v ?? ''); if (el.textContent !== v) el.textContent = v; }
function attr(el, name, v) {
  if (v === null || v === undefined || v === false) { if (el.hasAttribute(name)) el.removeAttribute(name); return; }
  v = v === true ? '' : String(v);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}
function show(el, on) { attr(el, 'hidden', on ? null : true); }
function make(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function parts(el) {
  if (!el._p) { el._p = {}; el.querySelectorAll('[data-f]').forEach(n => { el._p[n.dataset.f] = n; }); }
  return el._p;
}
/** Държи децата на container в синхрон със списъка: нови се създават, стари се махат, редът се пази. */
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
const fmtM = v => Number(v).toFixed(2).replace('.', ',');
const sizeText = (w, d) => `${fmtM(w)} × ${fmtM(d)} m`;

// ---------- връзка със сървъра ----------

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ui`);
  ws.onopen = () => { connected = true; renderConn(); };
  ws.onclose = () => { connected = false; renderConn(); setTimeout(connect, 1500); };
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'state') { state = msg; scheduleRender(); }
    else if (msg.type === 'toast') toast(msg.text, msg.level);
  };
}

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

/** Опасно действие: първият клик „зарежда" бутона, вторият го изпълнява. Без изскачащи прозорци. */
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

// ---------- статус на каска ----------

function statusOf(h) {
  if (!h.online) return { s: 'off', label: 'Off' };
  if (h.phase === 'calibrating') return { s: 'cal', label: `Calibrate ${h.calibStep || 0}/4` };
  if (h.phase === 'loading') return { s: 'load', label: 'Loading' };
  if (h.phase === 'playing') return { s: 'play', label: 'Playing' };
  if (h.sleeping) return { s: 'sleep', label: 'Asleep' };
  return { s: 'idle', label: 'Ready' };
}
const isLegacyMatch = m => !!m && typeof m === 'object' && 'orange' in m && !('red' in m);
function teamOf(h) {
  if (typeof h.team === 'number') return h.team === 1 || h.team === 2 ? h.team : 0;
  const m = h.match;
  if (!m || typeof m !== 'object' || isLegacyMatch(m)) return 0;
  return m.team === 1 || m.team === 2 ? m.team : 0;
}
/** Къде е каската за екрана: каквото казва играта, или (докато играта потвърди) където я е сложил операторът. */
function teamView(h) {
  const now = teamOf(h);
  const want = Number((state.teamWant || {})[h.id]) || 0;
  return { team: want && want !== now ? want : now, pending: !!want && want !== now };
}
const byNumber = (a, b) => (a.number || 999) - (b.number || 999) || a.name.localeCompare(b.name, 'en', { numeric: true });
const matchRunning = () => (typeof state.matchRunning === 'boolean' ? state.matchRunning : ['countdown', 'playing'].includes(state.match?.phase));

// ---------- рисуване на екрана ----------

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; if (state) render(); });
}

function render() {
  let pruned = false;
  for (const id of [...selected]) if (!state.headsets.some(h => h.id === id && h.online)) { selected.delete(id); pruned = true; }
  if (pruned && !selected.size) pickAll = true;
  noteSession();
  renderShell();
  if (section === 'overview') renderOverview();
  else if (section === 'headsets') renderHeadsets();
  else if (section === 'games') renderGames();
  else if (section === 'match') renderMatch();
  else if (section === 'calib') renderCalib();
  else if (section === 'board') renderBoard();
  else if (section === 'settings') renderSettings();
}

function renderConn() {
  text($('stConn'), connected ? 'Connected' : 'No connection to the server');
  attr($('netConn'), 'data-tone', connected ? null : 'bad');
  show($('offlineChip'), !connected && !!state);
}

function renderShell() {
  const hs = state.headsets, online = hs.filter(h => h.online).length;
  text($('stHeadsets'), `${online} of ${hs.length}`);
  text($('navHeadsets'), online ? String(online) : '');
  text($('stGame'), state.gameServer ? 'running' : 'stopped');
  attr($('stGame'), 'data-tone', state.gameServer ? 'live' : null);
  show($('netGameBox'), !!state.gameServer || (state.games || []).some(g => !g.web));   // само ако има игри за компютъра
  show($('navMatch'), matchRunning());

  // мрежата: адресът на сървъра и адресът, който се отваря в каските
  const ip = (state.serverAddresses || [])[0], url = playUrl();
  text($('netServer'), ip ? `${ip}:${location.port || (location.protocol === 'https:' ? 443 : 80)}` : location.host);
  attr($('netServer'), 'title', (state.serverAddresses || []).length > 1 ? `All addresses: ${state.serverAddresses.join(', ')}` : null);
  text($('netPlay'), url || 'none, the server has no HTTPS');
  attr($('netPlay'), 'data-tone', url ? null : 'quiet');

  const real = hs.filter(h => !h.desk);      // пробна „каска" в браузър на компютър не се калибрира
  const calibrated = real.filter(h => h.hasCalibration).length;
  const chip = $('calibChip');
  show(chip, real.length > 0 && calibrated < real.length);
  text(chip, calibrated ? `Calibrated ${calibrated} of ${real.length}` : 'No calibrated headset');
  attr(chip, 'data-tone', 'warn');

  const s = state.session;
  show($('navGames'), !!s);
  show($('sessionChip'), !!s && !(section === 'games' && gameId === s.gameId));   // на страницата на самата игра часовникът е едър
  if (s) text($('sessionName'), s.gameName);
  tickClocks();
}

/** Помни текущата сесия, за да каже, когато играта свърши сама (а не е спряна оттук). */
function noteSession() {
  const s = state.session, key = s ? String(s.startedAt) : '';
  const r = state.lastResult || null, rid = r ? String(r.id) : '';
  const from = (ses, startedAt) => !!r && r.gameId === ses.gameId && Date.parse(r.at) >= Date.parse(startedAt);      // резултатът е от тази сесия
  // играта е свършила: резултата го обявява сървърът; ако резултат няма (каските са паднали), казваме го тук
  if (lastSession && lastSession.key !== key && lastSession.ran && Date.now() - stopAt > 4000 && !from(lastSession, lastSession.key)) toast(`${lastSession.name} ended`, 'ok');
  if (key && (!lastSession || lastSession.key !== key)) resultSeen = null;      // ново пускане затваря стария резултат
  if (rid !== lastResultId) { if (lastResultId !== undefined && rid) resultSeen = rid; lastResultId = rid; }
  if (s && from(s, s.startedAt)) resultSeen = rid;
  if (!s) { lastSession = null; return; }
  if (!lastSession || lastSession.key !== key) lastSession = { key, name: s.gameName, gameId: s.gameId, ran: false };
  if (!lastSession.ran) lastSession.ran = (s.headsets || []).some(id => state.headsets.some(h => h.id === id && h.phase === 'playing'));
}

/** Часовникът на сесията брои надолу до края. Когато времето свърши, показва с колко е минало. */
function sessionTime(s) {
  const start = Date.parse(s.startedAt), total = nOr0(s.minutes) * 60;
  const sec = Number.isFinite(start) ? Math.max(0, (Date.now() - start) / 1000) : 0;
  if (!total) return { text: fmtClock(Math.floor(sec)), label: 'from the start', over: false, last: false };
  const left = total - sec;
  if (left >= 0) return { text: fmtClock(Math.ceil(left)), label: 'left', over: false, last: left <= 60 };
  return { text: `+${fmtClock(Math.floor(-left))}`, label: 'over time', over: true, last: false };
}

function tickClocks() {
  const s = state?.session;
  if (!s) return;
  const t = sessionTime(s);
  for (const el of [$('sessionClock'), $('rvClock'), ...document.querySelectorAll('[data-clock]')]) { text(el, t.text); el.classList.toggle('over', t.over); }
  $('rvClock').classList.toggle('last', t.last);
  text($('rvClockLabel'), t.label);
}
setInterval(tickClocks, 500);

// ---------- преглед: списък вдясно ----------

function renderOverview() {
  const hs = [...state.headsets].sort(byNumber);
  text($('rosterCount'), hs.length ? `${hs.filter(h => h.online).length} of ${hs.length}` : '');
  show($('rosterEmpty'), !hs.length);
  show($('stageEmpty'), !hs.some(h => h.online) && !liveCams().length);
  syncList($('roster'), hs, h => h.id, () => make(`
    <button type="button" class="roster-row">
      <span class="num-badge" data-f="num"></span>
      <span><span class="roster-name" data-f="name"></span><span class="roster-sub"><i></i><span data-f="sub"></span></span></span>
      <span class="roster-batt" data-f="batt"><span class="num" data-f="pct"></span><span class="batt-bar"><i data-f="fill"></i></span></span>
    </button>`), (el, h) => {
    const p = parts(el), st = statusOf(h), tv = teamView(h);
    text(p.num, h.number || '·');
    text(p.name, h.name);
    text(p.sub, h.user && st.s !== 'off' ? `${st.label} · ${h.user}` : st.label);
    attr(el, 'data-s', st.s);
    attr(el, 'data-team', tv.team || null);
    el.classList.toggle('off', !h.online);
    el.classList.toggle('focus', focusId === h.id);
    text(p.pct, h.battery == null ? '' : `${Math.round(h.battery)}%`);
    p.fill.style.width = `${clamp(h.battery ?? 0, 0, 100)}%`;
    attr(p.batt, 'data-low', h.lowBattery);
    attr(p.batt, 'data-charging', h.charging && !h.lowBattery);
  });
  renderStageBar();
}

function renderStageBar() {
  const key = view.mode === 'corner' ? `corner:${view.idx}` : view.mode;
  for (const b of $('viewSeg').children) {
    b.classList.toggle('on', b.dataset.cam === key);
    if ('live' in b.dataset) show(b, live.ok);
  }
  const sel = $('camHead');
  show(sel, live.ok);
  if (live.ok && document.activeElement !== sel) {
    const opts = '<option value="">From headset</option>' + state.headsets.filter(h => h.online).map(h =>
      `<option value="${encodeURIComponent(h.id)}"${view.mode === 'headset' && view.id === h.id ? ' selected' : ''}></option>`).join('');
    if (sel._html !== opts) {
      sel._html = opts; sel.innerHTML = opts;
      const on = state.headsets.filter(h => h.online);
      [...sel.options].slice(1).forEach((o, i) => { o.textContent = on[i].name; });
    }
  }
  text($('camLabel'), camText());
  renderLive();
}

const fit = { w: 6, d: 4 };   // размер на плана, докато залата не е измерена
function hallDims() {
  const c = state?.calibration;
  if (c?.width && c?.depth) return { w: c.width, d: c.depth, measured: true };
  let mx = 0, mz = 0;
  for (const s of smooth.values()) { mx = Math.max(mx, Math.abs(s.x)); mz = Math.max(mz, Math.abs(s.z)); }
  fit.w += (Math.max(6, Math.ceil(mx * 2 + 2)) - fit.w) * 0.08;
  fit.d += (Math.max(4, Math.ceil(mz * 2 + 2)) - fit.d) * 0.08;
  return { w: fit.w, d: fit.d, measured: false };
}
function liveModeText(mode) { return mode === 'server' ? 'shared game' : mode === 'play' ? 'game' : 'editor'; }
function camText() {
  if (view.mode === 'plan' || view.mode === 'persp') {
    const { w, d, measured } = hallDims();
    return measured ? `Arena ${sizeText(w, d)}` : 'The arena is not measured yet';
  }
  const src = live.ok ? ` · live (${liveModeText(live.mode)})` : '';
  if (view.mode === 'grid') return `All cameras${src}`;
  if (view.mode === 'top') return `Top view${src}`;
  if (view.mode === 'corner') return `Camera ${view.idx + 1}${src}`;
  if (view.mode === 'headset') {
    const h = state?.headsets.find(x => x.id === view.id);
    return h ? `Through the eyes of ${h.name}` : '';
  }
  return '';
}

// ---------- сцената: план и 3D ----------

const canvas = $('stage');
const ctx = canvas.getContext('2d');
const C = {};       // цветовете от CSS, взети веднъж
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['bg', 'surface', 'surface-2', 'line', 'line-2', 'text', 'text-2', 'text-3', 'signal', 'signal-ink', 'warn', 'bad', 'red', 'blue'])
    C[k] = cs.getPropertyValue(`--${k}`).trim();
}
const alpha = (col, a) => col.replace(/\)$/, ` / ${a})`);
const FONT = '"Sofia Sans", "Segoe UI", sans-serif';
const FONT_NUM = '"Sofia Sans XC", "Sofia Sans", sans-serif';

const smooth = new Map();   // id → плавна позиция {x, z, yaw}
function stepSmooth(dt) {
  const k = 1 - Math.exp(-dt * 7);
  for (const h of state.headsets) {
    if (!h.online || !h.pos) { smooth.delete(h.id); continue; }
    const s = smooth.get(h.id);
    if (!s) { smooth.set(h.id, { x: h.pos.x, z: h.pos.z, yaw: h.yaw || 0 }); continue; }
    s.x += (h.pos.x - s.x) * k;
    s.z += (h.pos.z - s.z) * k;
    let dy = (h.yaw || 0) - s.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));   // по късия път
    s.yaw += dy * k;
  }
}
function teamColor(h) {
  const t = teamView(h).team;
  return t === 1 ? C.red : t === 2 ? C.blue : C['text-2'];
}

function drawPlan(W, H) {
  const { w, d, measured } = hallDims();
  const pad = Math.min(72, Math.max(34, Math.min(W, H) * 0.09));
  const k = Math.min((W - pad * 2) / w, (H - pad * 2) / d);
  const X = x => W / 2 + x * k, Y = z => H / 2 + z * k;
  const x0 = X(-w / 2), y0 = Y(-d / 2), rw = w * k, rd = d * k;

  ctx.fillStyle = C.surface;
  ctx.fillRect(x0, y0, rw, rd);

  // мрежа през 1 м, от центъра навън
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w / 2; x++) for (const sx of x ? [x, -x] : [0]) { const px = Math.round(X(sx)) + 0.5; ctx.moveTo(px, y0); ctx.lineTo(px, y0 + rd); }
  for (let z = 0; z < d / 2; z++) for (const sz of z ? [z, -z] : [0]) { const py = Math.round(Y(sz)) + 0.5; ctx.moveTo(x0, py); ctx.lineTo(x0 + rw, py); }
  ctx.stroke();

  // стени
  ctx.strokeStyle = measured ? C['text-3'] : C['line-2'];
  ctx.lineWidth = 1.5;
  ctx.setLineDash(measured ? [] : [6, 6]);
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(rw), Math.round(rd));
  ctx.setLineDash([]);

  // размери и ъгли
  ctx.fillStyle = C['text-3'];
  ctx.textAlign = 'center';
  if (measured) {
    ctx.font = `600 12.5px ${FONT}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${fmtM(w)} m`, W / 2, y0 - 9);
    ctx.save();
    ctx.translate(x0 - 11, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${fmtM(d)} m`, 0, 0);
    ctx.restore();
    ctx.font = `700 15px ${FONT_NUM}`;
    ctx.textBaseline = 'middle';
    const o = 13;
    [[x0 - o, y0 - o], [x0 + rw + o, y0 - o], [x0 + rw + o, y0 + rd + o], [x0 - o, y0 + rd + o]].forEach(([cx, cy], i) => ctx.fillText(String(i + 1), cx, cy));
  }

  // начертаната зона и препятствията (в координатите на залата)
  const zn = state.zone;
  if (zn?.poly?.length > 2) {
    const path = pts => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); ctx.closePath(); };
    ctx.strokeStyle = C.signal; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
    path(zn.poly); ctx.stroke(); ctx.setLineDash([]);
    for (const o of zn.obstacles || []) { if (o.length < 3) continue; path(o); ctx.fillStyle = alpha(C.bad, 0.28); ctx.fill(); ctx.strokeStyle = C.bad; ctx.lineWidth = 1.5; ctx.stroke(); }
    for (const rm of (zn.rooms || []).slice(1)) {      // допълнителните стаи (стая „а" е самата зала)
      ctx.fillStyle = C.surface; ctx.fillRect(X(rm.x - rm.w / 2), Y(rm.z - rm.d / 2), rm.w * k, rm.d * k);
      ctx.strokeStyle = C['text-3']; ctx.lineWidth = 1.5; ctx.strokeRect(X(rm.x - rm.w / 2), Y(rm.z - rm.d / 2), rm.w * k, rm.d * k);
      ctx.fillStyle = C['text-3']; ctx.font = `600 12.5px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${fmtM(rm.w)} × ${fmtM(rm.d)}`, X(rm.x), Y(rm.z));
    }
  }

  // играчи
  const r = clamp(k * 0.26, 11, 20);
  const list = state.headsets.filter(h => h.online && smooth.has(h.id)).sort((a, b) => (a.id === focusId) - (b.id === focusId));
  for (const h of list) {
    const s = smooth.get(h.id), st = statusOf(h), col = teamColor(h);
    const px = X(clamp(s.x, -w / 2, w / 2)), py = Y(clamp(s.z, -d / 2, d / 2));
    const a = Math.atan2(Math.cos(s.yaw), Math.sin(s.yaw));   // погледът е (sin yaw, cos yaw) по (x, z)
    const asleep = st.s === 'sleep';

    if (!asleep) {   // накъде гледа
      ctx.fillStyle = alpha(col, 0.16);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, r * 3.1, a - 0.55, a + 0.55);
      ctx.closePath();
      ctx.fill();
    }
    if (h.id === focusId) {
      ctx.strokeStyle = C.signal; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    if (asleep) {
      ctx.fillStyle = C.surface; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = C.surface; ctx.lineWidth = 2; ctx.stroke();
    }
    if (st.s === 'cal') { ctx.strokeStyle = C.warn; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.stroke(); }

    ctx.fillStyle = asleep ? C['text-2'] : C.bg;
    ctx.font = `800 ${Math.round(r * 1.35)}px ${FONT_NUM}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(h.number || ''), px, py + 1);

    const tag = [h.id === focusId ? h.name : '', h.lowBattery ? `${Math.round(h.battery)}%` : ''].filter(Boolean).join(' · ');
    if (tag) {
      ctx.font = `650 13px ${FONT}`;
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(tag).width + 14;
      ctx.fillStyle = alpha(C.bg, 0.86);
      ctx.beginPath(); ctx.roundRect(px - tw / 2, py + r + 8, tw, 22, 4); ctx.fill();
      ctx.fillStyle = h.lowBattery && h.id !== focusId ? C.bad : C.text;
      ctx.fillText(tag, px, py + r + 13);
    }
  }
}

// проста перспектива (без библиотеки)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function project(p, cam, W, H) {
  const f = unit(sub(cam.target, cam.pos)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f), d = sub(p, cam.pos);
  const z = dot(d, f);
  if (z < 0.2) return null;
  const k = (H / 2) / Math.tan(0.52) / z;
  return { x: W / 2 + dot(d, r) * k, y: H / 2 - dot(d, u) * k, s: k, z };
}
function seg3(a, b, cam, W, H) {
  const p = project(a, cam, W, H), q = project(b, cam, W, H);
  if (!p || !q) return;
  ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
}
function drawPersp(W, H) {
  const { w, d } = hallDims();
  const hw = w / 2, hd = d / 2, span = Math.max(w, d * 1.5);
  const cam = { pos: [0, span * 0.62, hd + span * 0.62], target: [0, 0.4, 0] };
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -Math.floor(hw); x <= hw; x++) seg3([x, 0, -hd], [x, 0, hd], cam, W, H);
  for (let z = -Math.floor(hd); z <= hd; z++) seg3([-hw, 0, z], [hw, 0, z], cam, W, H);
  ctx.stroke();
  const floor = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
  ctx.strokeStyle = C['text-3']; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; seg3(floor[i], floor[j], cam, W, H); seg3(floor[i], [floor[i][0], 2.6, floor[i][2]], cam, W, H); seg3([floor[i][0], 2.6, floor[i][2]], [floor[j][0], 2.6, floor[j][2]], cam, W, H); }
  ctx.stroke();

  const list = state.headsets.filter(h => h.online && smooth.has(h.id))
    .map(h => ({ h, s: smooth.get(h.id) }))
    .map(o => ({ ...o, z: project([o.s.x, 1, o.s.z], cam, W, H)?.z ?? -1 }))
    .filter(o => o.z > 0).sort((a, b) => b.z - a.z);
  for (const { h, s } of list) {
    const col = teamColor(h), st = statusOf(h);
    const feet = project([s.x, 0, s.z], cam, W, H), chest = project([s.x, 1.3, s.z], cam, W, H), head = project([s.x, 1.7, s.z], cam, W, H);
    if (!feet || !chest || !head) continue;
    const look = project([s.x + Math.sin(s.yaw) * 0.9, 1.6, s.z + Math.cos(s.yaw) * 0.9], cam, W, H);
    ctx.lineCap = 'round';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.setLineDash(st.s === 'sleep' ? [5, 6] : []);
    ctx.lineWidth = Math.max(3, 0.15 * head.s);
    ctx.beginPath(); ctx.moveTo(feet.x, feet.y); ctx.lineTo(chest.x, chest.y); ctx.stroke();
    ctx.setLineDash([]);
    if (look) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(look.x, look.y); ctx.stroke(); }
    const hr = Math.max(8, 0.14 * head.s);
    ctx.beginPath(); ctx.arc(head.x, head.y, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.bg; ctx.font = `800 ${Math.round(hr * 1.4)}px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(h.number || ''), head.x, head.y + 1);
    ctx.fillStyle = h.id === focusId ? C.signal : C.text; ctx.font = `600 12.5px ${FONT}`; ctx.textBaseline = 'bottom';
    ctx.fillText(h.name, head.x, head.y - hr - 6);
    ctx.lineCap = 'butt';
  }
}

let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!state || section !== 'overview' || document.hidden) { lastFrame = now; return; }
  const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  stepSmooth(dt);
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  if (view.mode === 'persp') drawPersp(W, H); else drawPlan(W, H);
}

// ---------- кадри на живо от играта на компютъра ----------

function desiredCams() {
  if (view.mode === 'corner') return [`cam_${view.idx + 1}`];
  if (view.mode === 'top') return ['cam_top'];
  if (view.mode === 'grid') return live.cams.length ? live.cams.map(c => c.id) : ['cam_1', 'cam_2', 'cam_3', 'cam_4', 'cam_top'];
  if (view.mode === 'headset') return [`head:${view.id}`];
  return [];
}
function liveCams() { return live.ok ? desiredCams().map(c => (c.startsWith('head:') ? 'cam_head' : c)) : []; }
function sendWant() {
  if (!live.ok) return;
  fetch('/api/live/want', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cams: desiredCams() }) }).catch(() => {});
}
setInterval(sendWant, 3000);

let liveShown = '';
function renderLive() {
  const ids = liveCams();
  const layer = $('live');
  show(layer, ids.length > 0);
  const key = ids.join(',') + (view.mode === 'headset' ? `:${view.id}` : '');
  if (key === liveShown) return;
  liveShown = key;
  sendWant();
  layer.className = `live ${ids.length > 1 ? 'many' : 'one'}`;
  layer.textContent = '';
  for (const id of ids) {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.dataset.live = id; img.alt = '';
    fig.append(img);
    if (ids.length > 1) { const cap = document.createElement('figcaption'); cap.textContent = CAM_NAMES[id] || id; fig.append(cap); }
    layer.append(fig);
    loadNext(img);
  }
}
// всеки кадър се тегли след предишния и го сменя чак когато е зареден: без премигване
function loadNext(img) {
  if (!img.isConnected) return;
  const started = performance.now();
  const next = new Image();
  next.onload = () => { img.src = next.src; setTimeout(() => loadNext(img), Math.max(0, 60 - (performance.now() - started))); };
  next.onerror = () => setTimeout(() => loadNext(img), 500);
  next.src = `/live/${img.dataset.live}.jpg?t=${Date.now()}`;
}
async function pollLive() {
  try {
    const s = await fetch('/live/status.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
    live = s && Date.now() / 1000 - s.time < 5 ? { ok: true, mode: s.mode, map: s.map, cams: s.cams || [] } : { ok: false, cams: [] };
  } catch { live = { ok: false, cams: [] }; }
  if (live.ok && !userPickedView && view.mode === 'plan') view = { mode: 'corner', idx: 0 };
  if (!live.ok && !['plan', 'persp'].includes(view.mode)) view = { mode: 'plan' };
  if (state) scheduleRender();
}
setInterval(pollLive, 2000);

// ---------- каски ----------

const BOLT = '<svg class="bolt" viewBox="0 0 10 13" aria-hidden="true" data-f="bolt"><path d="M6.2 0 0.6 7.4h3.3L3 13l6.4-8H5.9z"/></svg>';

function renderHeadsets() {
  const hs = [...state.headsets].sort(byNumber);
  const online = hs.filter(h => h.online).length;
  text($('hsSummary'), hs.length ? `${online} of ${hs.length} online` : '');
  show($('hsTable').parentElement, hs.length > 0);
  show($('hsEmpty'), !hs.length);
  text($('hsAddr'), playUrl() || 'none (HTTPS is off)');
  show($('hsSelected'), selected.size > 0);
  show($('hsClear'), selected.size > 0);
  text($('hsSelected'), `Selected to play: ${selected.size}`);

  syncList($('hsBody'), hs, h => h.id, () => make(`
    <tr>
      <td class="c-check"><input type="checkbox" data-f="sel" aria-label="Select to play"></td>
      <td class="c-num"><span class="num-badge" data-f="num"></span></td>
      <td><div class="hname" data-f="name" title="Double click: new name"></div><div class="hsub" data-f="sub"></div></td>
      <td><span class="status" data-f="status"><i></i><span data-f="statusLabel"></span></span></td>
      <td><span class="batt" data-f="batt"><span class="batt-bar"><i data-f="fill"></i></span><span data-f="pct"></span>${BOLT}</span></td>
      <td data-f="ctrl"></td>
      <td class="r" data-f="fps"></td>
      <td><span class="stepper"><button type="button" data-act="vol" data-d="-10" aria-label="Quieter">−</button><span data-f="vol"></span><button type="button" data-act="vol" data-d="10" aria-label="Louder">+</button></span></td>
      <td><span class="tag" data-f="cal"></span></td>
      <td class="c-act"><button type="button" class="btn btn-quiet" data-act="identify" title="The headset controllers vibrate">Find</button></td>
    </tr>`), (el, h) => {
    const p = parts(el), st = statusOf(h);
    el.classList.toggle('off', !h.online);
    p.sel.checked = selected.has(h.id);
    p.sel.disabled = !h.online;
    text(p.num, h.number || '·');
    if (renamingId !== h.id) text(p.name, h.name);
    text(p.sub, h.user || h.model || '');
    attr(p.status, 'data-s', st.s);
    text(p.statusLabel, st.label);
    p.fill.style.width = `${clamp(h.battery ?? 0, 0, 100)}%`;
    text(p.pct, h.battery == null ? '' : `${Math.round(h.battery)}%`);
    attr(p.batt, 'data-low', h.lowBattery);
    attr(p.batt, 'data-charging', h.charging);
    show(p.bolt, !!h.charging);
    const c = h.controllers;
    text(p.ctrl, c && h.online ? `L ${Math.round(c.left)} · R ${Math.round(c.right)}` : '');
    text(p.fps, h.online && h.fps != null ? h.fps : '');
    text(p.vol, h.volume ?? '');
    for (const b of el.querySelectorAll('[data-act]')) b.disabled = !h.online;
    const cal = state.calibrations?.[h.id];
    text(p.cal, !h.hasCalibration ? 'none' : h.calibrated || !h.online ? `№${cal?.version ?? ''}` : 'waiting for the headset');
    attr(p.cal, 'data-tone', !h.hasCalibration ? 'warn' : null);
  });
}

function startRename(nameEl, id) {
  const h = state.headsets.find(x => x.id === id);
  if (!h || renamingId) return;
  renamingId = id;
  const input = document.createElement('input');
  input.className = 'rename'; input.value = h.name; input.maxLength = 40;
  input.setAttribute('aria-label', 'New headset name');
  nameEl.textContent = '';
  nameEl.append(input);
  input.focus(); input.select();
  let done = false;
  const finish = async save => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    renamingId = null;
    nameEl.textContent = h.name;
    if (save && name && name !== h.name) { nameEl.textContent = name; await call('/api/headset/rename', { headsetId: id, name }).catch(() => {}); }
    scheduleRender();
  };
  input.onkeydown = e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
  input.onblur = () => finish(true);
}

// ---------- игри ----------

function playUrl() {
  const p = state.play, ip = (state.serverAddresses || [])[0];
  if (!p?.https || !ip) return '';
  return `https://${ip}:${p.port}${p.path}`;
}

const gameById = id => (state.games || []).find(g => g.id === id) || null;
const headsetById = id => state.headsets.find(h => h.id === id) || null;
const sessionOf = g => (state.session && state.session.gameId === g.id ? state.session : null);
const ctxOf = g => (launchCtx && launchCtx.gameId === g.id ? launchCtx : null);
const countText = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const namesOf = list => list.map(h => h.name).join(', ');
const gameHash = id => `games/${encodeURIComponent(id)}`;

function playersText(g) {
  const lo = Math.max(1, nOr0(g.minPlayers)), hi = Math.max(lo, nOr0(g.maxPlayers));
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
const playersLabel = g => (playersText(g) === '1' ? '1 player' : `${playersText(g)} players`);
const fastMinutes = g => Math.ceil(nOr0(g.minutes) / 6) || 1;   // както го смята сървърът

/** Изборите за пускането на играта (тема, кратка проба). Пазят се, докато екранът е отворен. */
function optsOf(g) {
  let o = gameOpts.get(g.id);
  if (!o) { o = { theme: '', fast: false, team: '', level: 'normal' }; gameOpts.set(g.id, o); }
  const themes = g.themes || [];
  if (!themes.some(t => t.id === o.theme)) o.theme = themes[0]?.id || 'night';
  const levels = g.levels || [];
  if (levels.length && !levels.some(t => t.id === o.level)) o.level = levels.some(t => t.id === 'normal') ? 'normal' : levels[0].id;
  return o;
}

/** Празно състояние „няма каска": какво да се направи и на кой адрес. */
function fillNoHeadset(el) {
  const url = playUrl(), sig = url || '-';
  if (el._sig === sig) return;
  el._sig = sig;
  el.textContent = '';
  if (!url) { el.textContent = 'No headset address yet: the server runs without HTTPS, and without it the headset cannot enter VR through the browser.'; return; }
  const b = document.createElement('b');
  b.className = 'num'; b.textContent = url;
  el.append('The headset must be on the same Wi-Fi network as this computer. Open in its browser ', b, ' and press Enter.');
}

// ----- избор на каски и причини да не може да се пусне -----

/** Каските, които могат да играят тази игра: на линия и от същия вид (страница в браузъра или приложение). */
const poolFor = g => state.headsets.filter(h => h.online && (g.web ? h.web : !h.web)).sort(byNumber);
const chosenFor = g => poolFor(g).filter(h => h.phase === 'idle' && (pickAll || selected.has(h.id)));

/** Подравнена ли е каската със залата. ok: false спира пускането (сървърът също отказва). */
function alignOf(h) {
  if (h.desk) return { ok: true, tone: null, label: 'no headset, for testing' };
  if (!h.hasCalibration) return { ok: false, tone: 'warn', label: 'not aligned' };
  if (!h.web) return { ok: true, tone: 'ok', label: 'calibrated' };
  if (h.anchor === 'ok') return { ok: true, tone: 'ok', label: 'aligned' };
  if (h.anchor === 'lost') return { ok: true, tone: 'warn', label: 'lost alignment' };
  return { ok: true, tone: null, label: h.inVR ? 'alignment not confirmed' : '' };      // извън VR каската няма как да го потвърди
}

/** Може ли да се пусне играта сега. Ако не: защо, с думи за оператора, и къде да отиде. */
function launchState(g) {
  const pool = poolFor(g), free = pool.filter(h => h.phase === 'idle'), chosen = chosenFor(g), s = state.session;
  const lo = Math.max(1, nOr0(g.minPlayers)), hi = Math.max(lo, nOr0(g.maxPlayers) || 99);
  const r = { pool, free, chosen, why: '', tone: null, link: null, linkText: '', note: '' };
  const stop = (why, tone = null, link = null, linkText = '') => Object.assign(r, { why, tone, link, linkText });
  if (g.status === 'soon') return stop('The game is not ready to launch yet.');
  if (s && s.gameId !== g.id) return stop(`${s.gameName} is running. Stop it to launch this game.`, null, gameHash(s.gameId), 'To the running game');
  if (!g.web && !state.gameServer) return stop('The PC game is not running.');
  if (!pool.length) return stop(g.web ? 'No headset online with the game page open.' : 'No headset online.');
  if (!free.length) return stop('All headsets are busy right now.');
  if (!chosen.length) return stop('Pick at least one headset.');
  const off = chosen.filter(h => !alignOf(h).ok);
  if (off.length) return stop(off.length === 1
    ? `${off[0].name} is not aligned with the arena. Align it or remove it from the selection.`
    : `Not aligned with the arena: ${namesOf(off)}. Align them or remove them from the selection.`, 'warn', 'calib', 'Calibration');
  if (chosen.length > hi) return stop(`The game takes up to ${hi} players, but you selected ${chosen.length} headsets.`);
  if (chosen.length < lo) return stop(`The game needs at least ${lo} players, but ${chosen.length === 1 ? 'only 1 headset is selected' : `you selected ${chosen.length} headsets`}.`);
  // може да се пусне; това са само предупреждения
  const notes = [];
  const low = chosen.filter(h => h.lowBattery), out = chosen.filter(h => h.web && !h.desk && !h.inVR), lost = chosen.filter(h => h.web && !h.desk && h.anchor === 'lost');
  if (low.length) notes.push(`Low battery: ${namesOf(low)}.`);
  if (out.length) notes.push(`Not in VR: ${namesOf(out)}.`);
  if (lost.length) notes.push(`Lost alignment: ${namesOf(lost)}.`);
  r.note = notes.join(' ');
  return r;
}

/** Резултатът за страницата на играта: от сесията, която още тече, или от току-що свършилата пред този екран. */
function resultOf(g) {
  const r = state.lastResult;
  if (!r || r.gameId !== g.id || r.id === resultDone) return null;
  const s = sessionOf(g);
  if (s) return Date.parse(r.at) >= Date.parse(s.startedAt) ? r : null;
  if (state.session) return null;      // върви друга игра
  return r.id === resultSeen ? r : null;
}

/** Какво показва страницата на играта: 'page' (пускане), 'loading', 'failed' (не тръгна), 'running' или 'result'. */
function stageOf(g) {
  if (resultOf(g)) return 'result';      // играта е свършила сама: резултатът стои, докато го затворят
  const s = sessionOf(g);
  let ctx = ctxOf(g);
  if (s) {
    if (ctx && !ctx.sessionAt) ctx.sessionAt = s.startedAt;
    if (ctx && ctx.sessionAt !== s.startedAt) ctx = launchCtx = null;      // друга сесия на същата игра, пусната от другаде
    if (ranKey === s.startedAt) return 'running';
    const hs = (s.headsets || []).map(headsetById).filter(Boolean);
    if (hs.some(h => h.phase === 'loading')) return 'loading';
    if (hs.some(h => h.phase === 'playing') || !ctx || !ctx.pending) { ranKey = s.startedAt; if (ctx) ctx.pending = false; return 'running'; }
    return 'failed';      // сесията още я има, но никоя каска не зарежда и не играе
  }
  if (!ctx) return 'page';
  if (!ctx.pending) { launchCtx = null; return 'page'; }
  if (!ctx.sessionAt && Date.now() - ctx.at < 3000) return 'loading';      // сървърът прие пускането, състоянието още пътува
  return 'failed';      // сесията изчезна, без играта да тръгне
}

/** Пуска играта на каските. join: добавя каска към вече тръгнала игра, без да започва отначало зареждането. */
async function launchGame(g, ids, join = false) {
  if (launchBusy || !ids.length) return;
  const o = optsOf(g), team = join ? '' : String(o.team || '').replace(/\s+/g, ' ').trim();
  const body = { gameId: g.id, headsetIds: ids, theme: o.theme, fast: !!o.fast, difficulty: o.level || 'normal' };
  if (team) body.team = team;      // без име сървърът слага името на играча или „Отбор" с часа
  launchBusy = true;
  scheduleRender();
  const res = await call('/api/launch', body).catch(() => null);
  launchBusy = false;
  if (res && !join) {
    launchCtx = { gameId: g.id, ids: [...ids], theme: o.theme, fast: !!o.fast, level: o.level || 'normal', team, at: Date.now(), pending: true, sessionAt: null };
    o.team = '';      // следващата група си има свое име
    selected.clear();
    pickAll = true;
  }
  scheduleRender();
}

// ----- корица и плочка -----

/** Корицата на играта. Без картинка (или докато тя не се зареди) остава името, набрано върху цвета на играта. */
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
/** Етикетът върху корицата: 'live' (играе, с часовник), 'load' (зарежда), 'soon' (скоро) или празно. */
function paintPill(pill, mode) {
  if (pill._mode !== mode) {
    pill._mode = mode;
    pill.textContent = mode === 'live' ? 'Playing' : mode === 'load' ? 'Loading' : mode === 'soon' ? 'Soon' : '';
    if (mode === 'live') { const b = document.createElement('b'); b.dataset.clock = ''; pill.append(b); }
    attr(pill, 'data-tone', mode === 'live' || mode === 'load' ? 'live' : null);
  }
  show(pill, !!mode);
}
function paintBatt(p, h) {
  text(p.pct, h.battery == null ? '' : `${Math.round(h.battery)}%`);
  p.fill.style.width = `${clamp(h.battery ?? 0, 0, 100)}%`;
  attr(p.batt, 'data-low', h.lowBattery);
  attr(p.batt, 'data-charging', h.charging && !h.lowBattery);
}
const BATT = '<span class="roster-batt" data-f="batt"><span class="num" data-f="pct"></span><span class="batt-bar"><i data-f="fill"></i></span></span>';

// ----- библиотека -----

function renderLibrary() {
  const games = state.games || [], apps = games.filter(g => g.web), legacy = games.filter(g => !g.web);
  const s = state.session, anyOnline = state.headsets.some(h => h.online);
  show($('gamesEmpty'), !games.length);
  show($('libHead'), apps.length > 0);
  show($('tiles'), apps.length > 0);
  attr($('tiles'), 'data-few', apps.length <= 3);      // малко игри: по-едри плочки
  show($('legacyBox'), legacy.length > 0);
  text($('libCount'), countText(apps.length, 'game', 'games'));
  show($('libNotice'), games.length > 0 && !anyOnline);
  if (!anyOnline) fillNoHeadset($('libNoticeText'));

  syncList($('tiles'), apps, g => g.id, () => make(`
    <button type="button" class="tile" data-open>
      <span class="cover" data-f="cover"><span class="cover-type" data-f="type"></span><span class="cover-pill" data-f="pill" hidden></span></span>
      <span class="tile-name" data-f="name"></span>
      <span class="tile-tag" data-f="tag"></span>
      <span class="tile-meta" data-f="meta"></span>
    </button>`), (el, g) => {
    const p = parts(el), live = !!s && s.gameId === g.id;
    paintCover(p.cover, p.type, g);
    paintPill(p.pill, live ? (stageOf(g) === 'loading' ? 'load' : 'live') : g.status === 'soon' ? 'soon' : '');
    el.classList.toggle('soon', g.status === 'soon');
    text(p.name, g.name);
    text(p.tag, g.tagline || '');
    show(p.tag, !!g.tagline);
    text(p.meta, `${playersLabel(g)} · ${nOr0(g.minutes)} min`);
  });

  // игрите, които вървят на компютъра (Unreal): редове, същата страница за пускане
  syncList($('games'), legacy, g => g.id, () => make(`
    <div class="game">
      <div class="game-swatch" data-f="swatch"></div>
      <div><div class="game-name" data-f="name"></div><div class="game-desc" data-f="desc"></div><div class="game-meta" data-f="meta"></div></div>
      <div class="game-go"><button type="button" class="btn" data-open data-f="go"></button><span class="game-why" data-f="why"></span></div>
    </div>`), (el, g) => {
    const p = parts(el), live = !!s && s.gameId === g.id, st = launchState(g);
    p.swatch.style.background = g.color || C['text-2'];
    text(p.swatch, (g.name || '?').trim().charAt(0).toUpperCase());
    text(p.name, g.name);
    text(p.desc, g.description || '');
    text(p.meta, `${playersLabel(g)} · ${nOr0(g.minutes)} min`);
    text(p.go, live ? 'To the game' : 'Open');
    text(p.why, live ? 'Playing now' : st.why);
    attr(p.why, 'data-tone', live ? null : st.tone);
  });
}

// ----- страница на игра: описание, избори, каски, един бутон -----

function renderGamePage(g) {
  const cover = $('gpCover'), cp = parts(cover);
  paintCover(cover, cp.type, g);
  paintPill(cp.pill, g.status === 'soon' ? 'soon' : '');
  text($('gpLead'), g.tagline || '');
  show($('gpLead'), !!g.tagline);
  text($('gpDesc'), g.description || '');
  show($('gpDesc'), !!g.description);
  const facts = [['Players', playersText(g)], ['Minutes', nOr0(g.minutes) ? String(nOr0(g.minutes)) : ''], ['Version', g.version ? String(g.version) : '']].filter(f => f[1]);
  syncList($('gpFacts'), facts, f => f[0], () => make('<div><dt data-f="k"></dt><dd data-f="v"></dd></div>'), (el, f) => { const p = parts(el); text(p.k, f[0]); text(p.v, f[1]); });
  show($('gpFacts'), facts.length > 0);
  const tags = (g.tags || []).join(' · ');
  text($('gpTags'), tags);
  show($('gpTags'), !!tags);
  renderTop(g);

  // избори от описанието на играта
  const o = optsOf(g), themes = g.themes || [];
  show($('gpOpts'), themes.length > 1 || !!g.web);
  show($('themeOpt'), themes.length > 1);
  syncList($('themeSeg'), themes, t => t.id, () => make('<button type="button"></button>'), (el, t) => { text(el, t.name || t.id); el.classList.toggle('on', t.id === o.theme); });
  const levels = g.levels || [];
  show($('levelOpt'), levels.length > 1);
  syncList($('levelSeg'), levels, t => t.id, () => make('<button type="button"></button>'), (el, t) => { text(el, t.name || t.id); el.classList.toggle('on', t.id === o.level); });
  show($('fastOpt'), !!g.web);
  $('fastGame').checked = !!o.fast;
  text($('fastHint'), `the whole game in about ${fastMinutes(g)} min`);

  // каски
  const st = launchState(g);
  show($('pick'), st.pool.length > 0);
  show($('pickEmpty'), !st.pool.length);
  if (!st.pool.length) {
    const el = $('pickEmptyText');
    if (g.web) fillNoHeadset(el); else { el._sig = null; text(el, 'Headsets appear here once the game in them connects to this computer.'); }
  }
  text($('pickCount'), st.pool.length ? `selected ${st.chosen.length} of ${st.pool.length}` : '');
  syncList($('pick'), st.pool, h => h.id, () => make(`
    <label class="pick-row">
      <input type="checkbox" data-pick data-f="box">
      <span class="num-badge" data-f="num"></span>
      <span class="pick-main"><span class="roster-name" data-f="name"></span><span class="pick-sub"><span data-f="vr"></span><span data-f="al"></span></span></span>
      ${BATT}
    </label>`), (el, h) => {
    const p = parts(el), free = h.phase === 'idle', al = alignOf(h);
    el.classList.toggle('busy', !free);
    p.box.disabled = !free;
    p.box.checked = free && (pickAll || selected.has(h.id));
    text(p.num, h.number || '·');
    text(p.name, h.name);
    text(p.vr, !free ? statusOf(h).label.toLowerCase() : !h.web || h.desk ? '' : h.inVR ? 'in VR' : h.sleeping ? 'asleep, not in VR' : 'not in VR');
    attr(p.vr, 'data-tone', free && h.inVR ? 'ok' : null);
    text(p.al, free ? al.label : '');
    attr(p.al, 'data-tone', al.tone);
    paintBatt(p, h);
  });

  // един основен бутон и, ако не може, защо
  // име на отбора: по желание. Празно поле: сървърът слага името на играча или „Отбор" с часа.
  const teamEl = $('teamName');
  show($('teamField'), !!g.web);
  if (document.activeElement !== teamEl && teamEl.value !== (o.team || '')) teamEl.value = o.team || '';
  attr(teamEl, 'placeholder', st.chosen.length === 1 ? `No name: uses ${st.chosen[0].name}` : 'No name: uses Team plus the game time');

  const btn = $('launchBtn'), n = st.chosen.length;
  const why = st.pool.length ? st.why || st.note : '';      // без каски причината вече е написана в списъка отгоре
  btn.disabled = !!st.why || launchBusy;
  text(btn, st.why ? 'Launch' : `Launch on ${countText(n, 'headset', 'headsets')}`);
  text($('launchWhy'), why);
  show($('launchWhy'), !!why);
  attr($('launchWhy'), 'data-tone', st.why ? st.tone : st.note ? 'warn' : null);
  show($('launchLink'), !!st.link);
  text($('launchLink'), st.linkText);
  attr($('launchLink'), 'data-nav', st.link);
}

// ----- зареждане -----

function metaOf(g, s, ctx, n) {
  const theme = (s && s.theme) || (ctx && ctx.theme) || '', fast = s && 'fast' in s ? !!s.fast : !!(ctx && ctx.fast);
  const team = s && 'team' in s ? s.team : ctx && ctx.team;
  const bits = [];
  if (team) bits.push(`team ${team}`);
  bits.push(countText(n, 'headset', 'headsets'));
  const th = (g.themes || []).length > 1 ? (g.themes || []).find(t => t.id === theme) : null;
  if (th) bits.push(`theme ${th.name}`);
  const lv = (g.levels || []).find(t => t.id === ((s && s.difficulty) || (ctx && ctx.level)));
  if (lv && lv.id !== 'normal') bits.push(lv.name.toLowerCase());
  if (fast) bits.push('quick trial');
  if (s && nOr0(s.minutes)) bits.push(`${nOr0(s.minutes)} min`);
  return bits.join(' · ');
}

/** Докъде е една каска със зареждането. gone: сесията вече я няма; fresh: пускането е прието, състоянието още пътува. */
function loadOf(h, gone, fresh) {
  if (!h) return { s: 'fail', mode: 'fail', label: 'The headset is gone' };
  if (fresh) return { s: 'load', mode: 'indet', label: 'Loading' };
  if (h.phase === 'playing' && !gone) return { s: 'done', mode: 'pct', pct: 1, label: 'In the game' };
  if (h.phase === 'loading' && !gone) {
    if (!h.online) return { s: 'load', mode: 'indet', label: 'No connection, waiting' };
    const v = typeof h.load === 'number' && h.load > 0 ? clamp(h.load, 0, 1) : null;      // без число от каската: лента без проценти
    return v == null ? { s: 'load', mode: 'indet', label: 'Loading' } : { s: 'load', mode: 'pct', pct: v, label: `${Math.round(v * 100)}%` };
  }
  if (!h.online) return { s: 'fail', mode: 'fail', label: 'No connection to the headset' };
  if (h.launchError) return { s: 'fail', mode: 'fail', label: `Did not load: ${h.launchError}` };
  return { s: 'fail', mode: 'fail', label: h.phase === 'idle' ? 'Went back to ready without loading' : 'Busy with something else' };
}

/** Корицата като фон на екрана за зареждане. Слага се чак когато картинката е заредена. */
function paintArt(el, g) {
  const url = g.cover || '';
  if (el._url === url) return;
  el._url = url;
  el.classList.remove('on');
  if (!url) return;
  const img = new Image();
  img.onload = () => { if (el._url !== url) return; el.style.backgroundImage = `url("${encodeURI(url)}")`; el.classList.add('on'); };
  img.src = url;
}

function renderLoading(g, stage) {
  const s = sessionOf(g), ctx = ctxOf(g), failed = stage === 'failed';
  paintArt($('lvArt'), g);
  const ids = s ? s.headsets || [] : ctx ? ctx.ids : [];
  const rows = ids.map(id => { const h = headsetById(id); return { id, h, v: loadOf(h, failed, !s && !failed) }; });
  text($('lvLabel'), failed ? 'Did not start' : 'Loading');
  attr($('lvLabel'), 'data-tone', failed ? 'bad' : null);
  text($('lvName'), g.name);
  text($('lvMeta'), metaOf(g, s, ctx, ids.length));
  syncList($('lvRows'), rows, r => r.id, () => make(`
    <div class="lv-row">
      <span class="num-badge" data-f="num"></span>
      <span class="lv-row-name" data-f="name"></span>
      <span class="lv-row-state" data-f="state"></span>
      <span class="bar" data-f="bar"><i data-f="fill"></i></span>
    </div>`), (el, r) => {
    const p = parts(el);
    text(p.num, r.h?.number || '·');
    text(p.name, r.h?.name || r.id);
    attr(el, 'data-s', r.v.s);
    text(p.state, r.v.label);
    attr(p.bar, 'data-mode', r.v.mode);
    p.fill.style.width = r.v.mode === 'pct' ? `${Math.round(r.v.pct * 100)}%` : '';
  });

  const bad = rows.filter(r => r.v.s === 'fail');
  const again = rows.filter(r => r.v.s === 'fail' && r.h && r.h.online && r.h.phase === 'idle').map(r => r.id);
  const msg = failed
    ? (!again.length ? 'The game did not start and there is no free headset to retry on right now.'
      : again.length === rows.length ? `The game did not start. ${rows.length === 1 ? 'The headset is free again' : 'The headsets are free again'}.`
        : `The game did not start. You can retry on ${again.length} of ${rows.length} headsets.`)
    : bad.length ? `${bad.length === 1 ? 'One headset did not load' : `${bad.length} headsets did not load`} the game. The others continue.` : '';
  show($('lvFail'), !!msg);
  text($('lvFail'), msg);
  const retry = $('lvRetry');
  retry._ids = again;
  retry.disabled = launchBusy;
  show(retry, again.length > 0);
  show($('lvSkip'), !failed && rows.some(r => r.v.s === 'done'));
  show($('lvCancel'), !failed);
  show($('lvBack'), failed);
}

// ----- върви игра: часовник, играчи, гледане, стоп -----

function runOf(h) {
  if (!h) return { s: 'off', label: 'Gone' };
  if (!h.online) return { s: 'off', label: h.phase === 'playing' || h.phase === 'loading' ? 'Lost connection' : 'Off' };
  if (h.phase === 'playing') return { s: 'play', label: 'Playing' };
  if (h.phase === 'loading') return { s: 'load', label: typeof h.load === 'number' && h.load > 0 ? `Loading ${Math.round(clamp(h.load, 0, 1) * 100)}%` : 'Loading' };
  return { s: 'out', label: h.launchError ? `Did not load: ${h.launchError}` : 'Out of the game' };
}

function renderRunning(g) {
  const s = sessionOf(g), ids = s.headsets || [];
  const rows = ids.map(id => { const h = headsetById(id); return { id, h, v: runOf(h) }; });
  const playing = rows.filter(r => r.v.s === 'play').length;
  text($('rvName'), s.gameName || g.name);
  text($('rvMeta'), metaOf(g, Object.assign({}, s, { team: '' }), ctxOf(g), ids.length));      // отборът е на свой ред отгоре
  text($('rvCount'), `playing ${playing} of ${rows.length}`);

  // отборът: вижда се и се поправя на място, докато играта върви (с това име се записва резултатът)
  const teamEl = $('rvTeam'), team = s.team || '';
  show($('rvTeamBox'), !!s.web);
  if (!teamEl._editing) { text(teamEl, team || 'unnamed'); attr(teamEl, 'data-empty', !team); }
  text($('rvTeamEdit'), team ? 'Change' : 'Set a name');
  show($('rvTeamEdit'), !teamEl._editing);

  syncList($('rvRows'), rows, r => r.id, () => make(`
    <div class="rv-row">
      <span class="num-badge" data-f="num"></span>
      <span class="pick-main"><span class="roster-name" data-f="name"></span><span class="status" data-f="status"><i></i><span data-f="label"></span></span></span>
      <span class="rv-fps" data-f="fps"><b data-f="fpsN"></b>fps</span>
      <button type="button" class="btn" data-join data-f="join" title="Launches the game on this headset again without stopping it for the others" hidden>Restore</button>
      ${BATT}
    </div>`), (el, r) => {
    const p = parts(el), h = r.h, fps = h && r.v.s === 'play' && h.fps != null ? Math.round(nOr0(h.fps)) : null;
    text(p.num, h?.number || '·');
    text(p.name, h?.name || r.id);
    attr(p.status, 'data-s', r.v.s);
    text(p.label, r.v.label);
    show(p.fps, fps != null);
    text(p.fpsN, fps ?? '');
    attr(p.fps, 'data-low', fps != null && fps > 0 && fps < 60);
    show(p.join, r.v.s === 'out');
    p.join.disabled = launchBusy;
    show(p.batt, !!h && h.online);
    if (h) paintBatt(p, h);
  });

  // свободни каски могат да влязат в играта по средата
  const room = Math.max(1, nOr0(g.maxPlayers) || 99) - ids.length;
  const spare = room > 0 ? poolFor(g).filter(h => h.phase === 'idle' && !ids.includes(h.id) && alignOf(h).ok) : [];
  show($('rvFreeBox'), spare.length > 0);
  syncList($('rvFree'), spare, h => h.id, () => make(`
    <div class="rv-row">
      <span class="num-badge" data-f="num"></span>
      <span class="pick-main"><span class="roster-name" data-f="name"></span></span>
      <button type="button" class="btn" data-join data-f="join">Add to the game</button>
    </div>`), (el, h) => {
    const p = parts(el);
    text(p.num, h.number || '·');
    text(p.name, h.name);
    p.join.disabled = launchBusy;
  });

  // гледане: само за игрите в браузъра, само по един играч и само когато операторът го поиска
  const web = !!s.web;
  show($('watch'), web);
  show($('watchNone'), !web);
  const inGame = web ? rows.filter(r => r.h && (r.h.phase === 'playing' || r.h.phase === 'loading')).map(r => r.h) : [];      // и при кратко прекъсване: гледането не се затваря само
  if (watchPov && !inGame.some(h => h.id === watchPov)) watchPov = null;
  show($('watchSeg'), inGame.length > 0);
  syncList($('watchSeg'), inGame, h => h.id, () => make('<button type="button" data-watch></button>'), (el, h) => {
    text(el, h.number ? `${h.number} · ${h.name}` : h.name);
    el.classList.toggle('on', h.id === watchPov);
  });
}

/** Рамката за гледане е тежка (цялата игра се рисува още веднъж на този компютър): има я само докато се гледа. */
function syncWatch() {
  const box = $('watchBox'), h = watchPov && state ? headsetById(watchPov) : null;
  const src = h && section === 'games' && !$('runView').hidden ? `/play/?watch=1&pov=${encodeURIComponent(h.number || h.id)}` : '';
  let frame = box.querySelector('iframe');
  if (frame && frame.dataset.src !== src) { frame.remove(); frame = null; }
  if (src && !frame) {
    frame = document.createElement('iframe');
    frame.dataset.src = src;
    frame.title = `What ${h.name} sees`;
    frame.src = src;
    box.append(frame);
  }
  show($('watchIdle'), !src);
  show($('watchClose'), !!src);
}

// ----- резултат: играта е свършила сама -----

const fmtScore = v => String(Math.round(nOr0(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pad2 = v => String(v).padStart(2, '0');
/** Кога е играно: час, ако е днес; иначе дата. */
function whenText(iso) {
  const d = new Date(iso), now = new Date();
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === now.toDateString()) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dm = `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}.${d.getFullYear()}`;
}
function whenFull(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Редактиране на място: текстът става поле. Enter или излизане от полето записва, Escape отказва. */
function editInPlace(el, value, { label, save, cls = '', allowEmpty = false }) {
  if (el._editing) return;
  el._editing = true;
  const input = document.createElement('input');
  input.className = `rename ${cls}`.trim();
  input.value = value;
  input.maxLength = 28;
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
    el.textContent = changed ? v : value;      // новото се вижда веднага; сървърът го потвърждава със следващото състояние
    if (changed) await save(v);
    scheduleRender();
  };
  input.onkeydown = e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
  input.onblur = () => finish(true);
  scheduleRender();
}

function renderResult(g, r) {
  paintArt($('resArt'), g);
  const teamEl = $('resTeam');
  if (!teamEl._editing) text(teamEl, r.team || '');
  show($('resRename'), !teamEl._editing);
  const names = (r.players || []).map(q => q.name).filter(Boolean), bits = [];
  if (names.length > 1 || (names.length === 1 && names[0] !== r.team)) bits.push(`${names.length === 1 ? 'Player' : 'Players'}: ${names.join(', ')}`);
  if (nOr0(r.minutes)) bits.push(`${nOr0(r.minutes)} min`);
  const th = (g.themes || []).length > 1 ? (g.themes || []).find(t => t.id === r.theme) : null;
  if (th) bits.push(`theme ${th.name}`);
  if (r.difficulty && r.difficulty !== 'normal') bits.push(r.difficulty);
  text($('resMeta'), bits.join(' · '));

  const facts = [['score', 'Score', fmtScore(r.score)]];
  if (nOr0(r.stars)) facts.push(['stars', 'Stars', `${nOr0(r.stars)} of 5`]);
  if (!r.test && r.rankDay) facts.push(['day', 'Rank today', String(r.rankDay)]);
  if (!r.test && r.rankAll) facts.push(['all', 'All-time rank', String(r.rankAll)]);
  syncList($('resFacts'), facts, f => f[0], () => make('<div><dt data-f="k"></dt><dd data-f="v"></dd></div>'), (el, f) => { const p = parts(el); text(p.k, f[1]); text(p.v, f[2]); });

  const notes = [];
  if (r.caught) notes.push('You got caught.');
  if (r.test) notes.push('Quick trial: the result does not count for the leaderboard.');
  text($('resNote'), notes.join(' '));
  show($('resNote'), notes.length > 0);
  attr($('resNote'), 'data-tone', r.caught ? 'warn' : null);
  show($('resBoard'), !r.test);
  attr($('resBoard'), 'data-nav', `board/${encodeURIComponent(g.id)}`);
}

// ----- „Игри": кое от петте се вижда -----

function renderGames() {
  let g = gameId ? gameById(gameId) : null;
  if (gameId && !g) { gameId = null; history.replaceState(null, '', '#games'); }      // такава игра няма (махната е или адресът е грешен)
  const stage = g ? stageOf(g) : 'library';
  show($('libView'), stage === 'library');
  show($('gameView'), stage === 'page');
  show($('loadView'), stage === 'loading' || stage === 'failed');
  show($('runView'), stage === 'running');
  show($('resultView'), stage === 'result');
  show($('backBtn'), !!g);
  text($('title'), g ? g.name : TITLES.games);
  const title = `${g ? g.name : TITLES.games} · MS Games`;
  if (document.title !== title) document.title = title;
  if (stage !== 'running') watchPov = null;
  if (stage === 'library') renderLibrary();
  else if (stage === 'page') renderGamePage(g);
  else if (stage === 'running') renderRunning(g);
  else if (stage === 'result') renderResult(g, resultOf(g));
  else renderLoading(g, stage);
  syncWatch();
}

// ---------- класация ----------
// Резултатите са на сървъра (/api/scores). Тук се пазят последно изтеглените и се теглят пак,
// когато state.scoresVersion мръдне: някой е свършил игра, преименувал е или е махнал резултат.

function scoresFor(gameId, period, limit) {
  const key = `${gameId}|${period}|${limit}`, v = nOr0(state.scoresVersion);
  let c = scoreCache.get(key);
  if (!c) { c = { v: -1, t: 0, list: [], total: 0, loaded: false, busy: false, failed: false, failedAt: 0 }; scoreCache.set(key, c); }
  const stale = c.v !== v || Date.now() - c.t > 60_000;      // и на минута: „днес" и „седмица" се местят с часовника
  if (stale && !c.busy && Date.now() - c.failedAt > 5000) {
    c.busy = true;
    fetch(`/api/scores?game=${encodeURIComponent(gameId)}&period=${period}&limit=${limit}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(d => {
        c.list = Array.isArray(d.list) ? d.list : [];
        c.total = Math.max(nOr0(d.total), c.list.length);
        c.v = v; c.t = Date.now(); c.loaded = true; c.failed = false;
      })
      .catch(() => { c.failed = true; c.failedAt = Date.now(); setTimeout(scheduleRender, 5200); })
      .finally(() => { c.busy = false; scheduleRender(); });
  }
  return c;
}

/** Първите пет от всички времена на страницата на играта. */
function renderTop(g) {
  const on = !!g.web && g.status !== 'soon';
  show($('gpTop'), on);
  if (!on) return;
  const c = scoresFor(g.id, 'all', 5), list = c.list.slice(0, 5);
  syncList($('gpTopList'), list, e => e.id, () => make('<li><b class="rank" data-f="rank"></b><span class="gp-top-team" data-f="team"></span><b class="bscore" data-f="score"></b></li>'), (el, e) => {
    const p = parts(el);
    text(p.rank, nOr0(e.rank) || '');
    text(p.team, e.team || '');
    attr(p.team, 'title', [e.team, nOr0(e.stars) ? `${nOr0(e.stars)} of 5 stars` : '', whenFull(e.at)].filter(Boolean).join(' · '));
    text(p.score, fmtScore(e.score));
  });
  show($('gpTopList'), list.length > 0);
  show($('gpTopEmpty'), c.loaded && !list.length);
  show($('gpTopAll'), list.length > 0);
  attr($('gpTopAll'), 'data-nav', `board/${encodeURIComponent(g.id)}`);
}

const BOARD_EMPTY = {
  day: 'No games played today yet',
  week: 'No games played in the last 7 days',
  month: 'No games played in the last 30 days',
  all: 'No games played yet',
};

function renderBoard() {
  const games = (state.games || []).filter(g => g.web && g.status !== 'soon');
  if (!games.some(g => g.id === boardGame)) {
    boardGame = (games.find(g => g.id === state.session?.gameId) || games[0])?.id || null;
    if (location.hash.startsWith('#board/')) history.replaceState(null, '', '#board');      // играта от адреса я няма
  }

  // избор на игра: само когато игрите са повече от една
  const sel = $('boardGame');
  show(sel, games.length > 1);
  if (games.length > 1 && document.activeElement !== sel) {
    const sig = games.map(g => `${g.id}\n${g.name}`).join('\n\n');
    if (sel._sig !== sig) {
      sel._sig = sig;
      sel.textContent = '';
      for (const g of games) { const o = document.createElement('option'); o.value = g.id; o.textContent = g.name; sel.append(o); }
    }
    if (sel.value !== boardGame) sel.value = boardGame;
  }
  for (const b of $('boardPeriod').children) b.classList.toggle('on', b.dataset.period === boardPeriod);

  const c = boardGame ? scoresFor(boardGame, boardPeriod, 50) : null, list = c ? c.list : [];
  const lastTop = Math.min(3, list.length);
  syncList($('boardBody'), list, e => e.id, () => make(`
    <tr>
      <td class="c-rank"><span class="rank" data-f="rank"></span></td>
      <td><div class="bteam" data-f="team"></div><div class="hsub bwho" data-f="who"></div></td>
      <td class="r"><b class="bscore" data-f="score"></b></td>
      <td data-f="stars"></td>
      <td class="r" data-f="size"></td>
      <td data-f="when"></td>
      <td class="c-act"><button type="button" class="btn btn-quiet" data-score-rename title="Fixes the team name">Fix</button><button type="button" class="btn btn-quiet" data-score-remove data-confirm="Again: remove" title="Removes the result from the leaderboard. Cannot be undone.">Remove</button></td>
    </tr>`), (el, e) => {
    const p = parts(el), rank = nOr0(e.rank);
    el.classList.toggle('top', rank >= 1 && rank <= 3);
    el.classList.toggle('top-end', rank === lastTop);
    text(p.rank, rank || '');
    if (!p.team._editing) { text(p.team, e.team || ''); attr(p.team, 'title', e.team || null); }
    const names = (e.players || []).map(q => q.name).filter(Boolean);
    const who = [names.length === 1 && names[0] === e.team ? '' : names.join(', '), e.caught ? 'caught' : '', e.test ? 'trial' : ''].filter(Boolean).join(' · ');
    text(p.who, who);
    show(p.who, !!who);
    attr(p.who, 'title', names.length ? names.join(', ') : null);
    text(p.score, fmtScore(e.score));
    text(p.stars, nOr0(e.stars) ? `${nOr0(e.stars)} of 5` : '');
    text(p.size, nOr0(e.size) || names.length || '');
    text(p.when, whenText(e.at));
    attr(p.when, 'title', whenFull(e.at));
  });

  const loaded = !!c && c.loaded, failed = !!c && c.failed && !c.loaded;
  show($('boardWrap'), list.length > 0);
  show($('boardEmpty'), !boardGame || failed || (loaded && !list.length));
  text($('boardEmptyTitle'), !boardGame ? 'No game with a leaderboard' : failed ? 'The leaderboard failed to load' : BOARD_EMPTY[boardPeriod]);
  text($('boardEmptyText'), !boardGame ? 'Library games that end with a result have a leaderboard.'
    : failed ? 'The server did not respond. Retrying in a few seconds.'
      : 'A result is saved when the game ends by itself. A game stopped early and a quick trial do not count for the leaderboard.');
  text($('boardCount'), loaded && c.total ? (c.total === 1 ? '1 result' : `${c.total} results`) : '');
  show($('boardMore'), loaded && c.total > list.length);
  if (loaded) text($('boardMore'), `Showing the first ${list.length} of ${c.total}.`);
}

// ---------- мач ----------

let cfgSig = '';
function renderMatchCfg() {
  const c = state.matchCfg;
  if (!c) return;
  const sig = JSON.stringify(c);
  if (sig === cfgSig) return;
  cfgSig = sig;
  const set = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
  $('matchTeams').checked = c.teams !== false;
  if (c.targetKills) set('matchTarget', c.targetKills);
  if (c.roundSeconds) set('matchMinutes', Math.round(c.roundSeconds / 60));
  if (c.roundsToWin) set('matchRoundsToWin', c.roundsToWin);
  $('matchFriendlyFire').checked = !!c.friendlyFire;
  $('matchHeadshot').checked = c.headshotOneShot !== false;
}

function chipList(container, list) {
  syncList(container, list, h => h.id, () => make('<button type="button" class="team-chip"><b data-f="num"></b><span data-f="name"></span><small data-f="note"></small></button>'), (el, h) => {
    const p = parts(el), v = teamView(h);
    el.dataset.teamNow = v.team;
    el.classList.toggle('pending', v.pending);
    text(p.num, h.number || '');
    text(p.name, h.name);
    text(p.note, v.pending ? 'waiting for the game' : isLegacyMatch(h.match) ? 'old version' : '');
    show(p.note, p.note.textContent !== '');
    el.title = v.team === 1 ? 'Move to Blue' : v.team === 2 ? 'Move to Red' : 'Put in the smaller team';
  });
}

function renderMatch() {
  const m = state.match;
  renderMatchCfg();
  const legacy = !!m && (m.legacy || (!('red' in m) && 'orange' in m));
  text($('matchPhase'), m ? (PHASE_BG[m.phase] || m.phase || 'Match') : 'No match');
  text($('matchTimer'), m && m.remaining ? fmtClock(m.remaining) : m && m.elapsed ? fmtClock(m.elapsed) : '');
  text($('redScore'), m && !legacy ? nOr0(m.red) : legacy ? '?' : 0);
  text($('blueScore'), m && !legacy ? nOr0(m.blue) : legacy ? '?' : 0);
  const rtw = nOr0(m?.roundsToWin) || nOr0(state.matchCfg?.roundsToWin) || 3;
  text($('matchRounds'), m && !legacy ? `rounds ${nOr0(m.redRounds)} : ${nOr0(m.blueRounds)} · first to ${rtw}` : `first to ${rtw} rounds`);

  const online = state.headsets.filter(h => h.online).sort(byNumber);
  const red = online.filter(h => teamView(h).team === 1), blue = online.filter(h => teamView(h).team === 2), none = online.filter(h => teamView(h).team === 0);
  chipList($('teamRed'), red); chipList($('teamBlue'), blue); chipList($('teamNone'), none);
  text($('redCount'), red.length); text($('blueCount'), blue.length);
  show($('teamNoneBox'), none.length > 0);

  const c = m?.circle, showCircle = !!c && (m.phase === 'waiting' || m.phase === 'countdown');
  show($('circleBox'), showCircle);
  if (showCircle) {
    text($('circleRed'), `${nOr0(c.inRed)}/${nOr0(c.neededRed)}`);
    text($('circleBlue'), `${nOr0(c.inBlue)}/${nOr0(c.neededBlue)}`);
    const sec = Math.ceil(nOr0(c.countdown));
    text($('circleTimer'), sec > 0 ? `Starts in ${sec} s` : 'Waiting for everyone in the circle');
    const list = Array.isArray(c.missing) ? c.missing : [];
    const names = t => list.filter(p => p.team === t).map(p => p.name).join(', ');
    text($('circleMissing'), list.length ? 'Missing: ' + [names(1) && `red ${names(1)}`, names(2) && `blue ${names(2)}`].filter(Boolean).join('; ') : '');
  }

  const warns = [];
  if (Math.abs(red.length - blue.length) > 1) warns.push(`Teams are uneven: red ${red.length}, blue ${blue.length}.`);
  if (legacy) warns.push('The headsets run an old version of the game and scores are not shown.');
  else if (m?.legacyCount) warns.push(`${m.legacyCount} headsets run an old version of the game; their team is unknown.`);
  if (nOr0(state.matchPending) > 0) warns.push(`Commands are waiting for the game: ${state.matchPending}.`);
  show($('matchWarn'), warns.length > 0);
  text($('matchWarn'), warns.join(' '));

  const board = (m && m.board) || [];
  show($('noMatch'), !board.length);
  show($('boardTable').parentElement, board.length > 0);
  syncList($('board'), board.map((p, i) => ({ ...p, rank: i + 1 })), p => p.id || p.name, () => make(
    '<tr><td class="c-num" data-f="rank"></td><td data-f="name"></td><td><span class="tag" data-f="team"></span></td><td class="r" data-f="kills"></td><td class="r" data-f="deaths"></td><td class="r"><b data-f="points"></b></td></tr>'), (el, p) => {
    const f = parts(el), t = p.legacy || isLegacyMatch(p) ? 0 : (p.team === 1 || p.team === 2 ? p.team : 0);
    text(f.rank, p.rank); text(f.name, p.name);
    text(f.team, t === 1 ? 'red' : t === 2 ? 'blue' : '');
    attr(f.team, 'data-team', t || null);
    text(f.kills, nOr0(p.kills)); text(f.deaths, nOr0(p.deaths)); text(f.points, nOr0(p.points));
  });
}

function matchBody(command) {
  return {
    command,
    teams: $('matchTeams').checked,
    targetKills: Number($('matchTarget').value),
    roundSeconds: Number($('matchMinutes').value) * 60,
    roundsToWin: Number($('matchRoundsToWin').value) || 3,
    friendlyFire: $('matchFriendlyFire').checked,
    headshotOneShot: $('matchHeadshot').checked,
  };
}

// ---------- калибровка ----------

function renderCalib() {
  const hs = [...state.headsets].sort(byNumber);
  const running = hs.find(h => h.phase === 'calibrating');
  const pending = running ? null : state.pendingCalibration;
  const busy = !!state.session || matchRunning();
  const done = hs.filter(h => h.hasCalibration).length;
  text($('calibSummary'), hs.length ? `${done} of ${hs.length} ready` : '');
  show($('calibEmpty'), !hs.length);

  syncList($('calibRows'), hs, h => h.id, () => make(`
    <div class="calib-row">
      <span class="num-badge" data-f="num"></span>
      <span><div class="hname" data-f="name"></div><div class="hsub" data-f="sub"></div></span>
      <span class="btn-row"><button type="button" class="btn" data-zone="draw" data-f="draw">Draw zone</button><button type="button" class="btn" data-zone="align" data-f="align">Align</button><button type="button" class="btn btn-quiet" data-zone="obstacles" data-f="obst" title="Deletes only the obstacles and starts drawing them again. The zone and the two points stay.">Obstacles</button><button type="button" class="btn btn-quiet" data-zone="floor" data-f="floor">Height</button><button type="button" class="btn btn-quiet" data-space data-f="space" data-confirm="Again: clear the space" title="Only when something is broken. Clears the headset's physical space history (over cable) and with it the anchors that hold the arena in place: afterwards the headset asks for a new boundary and a two-point alignment.">Clear the space</button><button type="button" class="btn btn-quiet" data-calib data-f="go">4 corners</button></span>
    </div>`), (el, h) => {
    const p = parts(el), cal = state.calibrations?.[h.id], st = statusOf(h);
    el.classList.toggle('off', !h.online);
    text(p.num, h.number || '·');
    text(p.name, h.name);
    text(p.sub, !h.online ? 'off' : st.s === 'cal' ? st.label : cal?.width ? `№${cal.version} · ${sizeText(cal.width, cal.depth)}` : 'no calibration');
    p.go.disabled = !h.online || h.phase !== 'idle' || busy || !!running || !!pending;
    const can = !p.go.disabled && h.web;
    p.draw.disabled = !can; p.align.disabled = !can || !state.zone;
    show(p.draw, !!h.web); show(p.align, !!h.web && !!state.zone);
    if (p.obst) { show(p.obst, !!h.web && !!state.zone); p.obst.disabled = !can || !cal; } show(p.floor, !!h.web); p.floor.disabled = !can; p.space.disabled = !h.online || busy;
    p.draw.className = state.zone ? 'btn btn-quiet' : 'btn btn-primary';
    text(p.draw, state.zone ? 'New zone' : 'Draw zone');
  });

  show($('calibIdle'), !running && !pending);
  show($('calibRun'), !!running);
  show($('calibResult'), !!pending);
  if (running) {
    text($('calibRunName'), running.name);
    [...$('cornerSteps').children].forEach((li, i) => {
      li.className = i < running.calibStep ? 'done' : i === running.calibStep ? 'now' : '';
    });
  }
  if (pending) {
    text($('resultSize'), sizeText(pending.width, pending.depth));
    const warns = [];
    if (pending.skew > 0.15) warns.push(`The corners do not form a rectangle (the diagonals differ by ${Math.round(pending.skew * 100)} cm). Better start over.`);
    if (pending.width < 2 || pending.depth < 2) warns.push('The arena comes out under 2 m. A wrong corner was probably pressed.');
    else if (pending.width + 0.3 < pending.depth) warns.push('Corner 1 to corner 2 must be along the long wall. Start over.');
    show($('resultWarn'), warns.length > 0);
    text($('resultWarn'), warns.join(' '));
  }

  const c = state.calibration, zn = state.zone;
  text($('hallNow'), zn?.hall ? `${(zn.rooms?.length ? zn.rooms : [zn.hall]).map(r => sizeText(r.w, r.d)).join(' + ')}, zone with ${zn.poly.length} points and ${zn.obstacles.length} obstacles` : c?.width ? sizeText(c.width, c.depth) : 'not measured');
  for (const id of ['calibUndo', 'calibRotate', 'calibClear']) $(id).disabled = busy || (id !== 'calibUndo' && !done);
}

let prevOffer = null;
async function offerPrevious() {
  const res = await fetch('/api/calibration/previous').then(r => r.json()).catch(() => ({}));
  const p = res.previous;
  if (!p) { toast('No older calibration in the history', 'warn'); return; }
  prevOffer = p;
  const when = p.savedAt ? new Date(p.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : p.file;
  const size = Number.isFinite(p.width) && Number.isFinite(p.depth) ? sizeText(p.width, p.depth) : 'no size';
  text($('prevText'), `The previous one is from ${when}: arena ${size}, ${p.headsets?.length ?? 0} headsets. The current one stays in the history.`);
  show($('prevBox'), true);
}

// ---------- настройки ----------

function renderAuto() {
  const a = state.autoStart || { on: false, gameId: '' };
  const webGames = state.games.filter(g => g.web && g.status !== 'soon');
  const box = $('autoGame');
  syncList(box, webGames, g => g.id, () => document.createElement('option'), (el, g) => { el.value = g.id; text(el, g.name); });
  if (document.activeElement !== box) box.value = a.gameId || '';
  if (document.activeElement !== $('autoOn')) $('autoOn').checked = !!a.on;
  box.disabled = !a.on;
  const g = webGames.find(x => x.id === a.gameId);
  text($('autoHint'), a.on
    ? `A headset that comes online is aligned if it needs it, then ${g ? g.name : 'the game'} starts on it by itself. Once per connection.`
    : 'Off: headsets wait in the lobby until you start a game.');
}

function renderSettings() {
  renderAuto();
  const c = state.calibration, hs = state.headsets;
  const addr = (state.serverAddresses || []).map(a => `${a}:${location.port || 80}`).join(', ') || location.host;
  const rows = [
    ['Arena', c?.width ? sizeText(c.width, c.depth) : 'not measured', c?.width ? null : 'quiet'],
    ['Connected headsets', `${hs.filter(h => h.online).length} of ${hs.length}`, null],
    ['Server address on the network', addr, null],
    ['Headset address', playUrl() || 'none', playUrl() ? null : 'quiet'],
    ['PC game', state.gameServer ? 'running' : 'stopped', state.gameServer ? 'live' : 'quiet'],
    ['Game cameras', live.ok ? `live · ${liveModeText(live.mode)}` : 'none', live.ok ? 'live' : 'quiet'],
    ['Games added', String(state.games.length), state.games.length ? null : 'quiet'],
  ];
  syncList($('facts'), rows.flatMap(([k, v, tone], i) => [{ key: `k${i}`, tag: 'dt', v: k }, { key: `v${i}`, tag: 'dd', v, tone }]), r => r.key,
    r => document.createElement(r.tag), (el, r) => { text(el, r.v); attr(el, 'data-tone', r.tone || null); });
}

// ---------- раздели ----------

function go(dest, push = true) {
  let [sec, sub = ''] = String(dest || '').split('/');
  if (!TITLES[sec]) { sec = 'games'; sub = ''; }
  let id = null;
  if (sec === 'games' && sub) { try { id = decodeURIComponent(sub); } catch { id = null; } }
  if (sec === 'board' && sub) { try { boardGame = decodeURIComponent(sub); } catch { sub = ''; } }      // #board/<игра>: класацията на тази игра
  section = sec;
  gameId = id;
  watchPov = null;
  // неуспяло пускане се помни само докато операторът е на страницата на играта
  if (launchCtx && launchCtx.gameId !== id && !(state?.session && state.session.gameId === launchCtx.gameId)) launchCtx = null;
  $('app').dataset.section = sec;
  document.querySelectorAll('.nav').forEach(n => { n.classList.toggle('on', n.dataset.go === sec); attr(n, 'aria-current', n.dataset.go === sec ? 'page' : null); });
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== sec; });
  text($('title'), TITLES[sec]);
  show($('backBtn'), false);
  document.title = `${TITLES[sec]} · MS Games`;
  const tail = sec === 'games' ? (id ? encodeURIComponent(id) : '') : sec === 'board' ? sub : '';
  const hash = `#${sec}${tail ? `/${tail}` : ''}`;
  if (push && location.hash !== hash) history.replaceState(null, '', hash);
  if (state) render();
  syncWatch();
}

// ---------- действия ----------

document.addEventListener('click', async e => {
  const t = e.target;

  const nav = t.closest('.nav');
  if (nav) return go(nav.dataset.go);

  const link = t.closest('[data-nav]');
  if (link) { if (link.dataset.period) boardPeriod = link.dataset.period; return go(link.dataset.nav); }

  // класация: период, поправка на име, махане на резултат
  const period = t.closest('#boardPeriod button');
  if (period) { boardPeriod = period.dataset.period; return scheduleRender(); }
  const scoreRename = t.closest('[data-score-rename]');
  if (scoreRename) {
    const row = scoreRename.closest('[data-key]'), id = row.dataset.key, nameEl = parts(row).team;
    return editInPlace(nameEl, nameEl.textContent, { label: 'Team name', save: v => call('/api/scores/rename', { id, team: v }).catch(() => {}) });
  }
  const scoreRemove = t.closest('[data-score-remove]');
  if (scoreRemove) return twoStep(scoreRemove, () => call('/api/scores/remove', { id: scoreRemove.closest('[data-key]').dataset.key }).catch(() => {}));

  // резултат и отбор
  if (t.closest('#resDone')) { resultDone = state.lastResult?.id ?? null; return scheduleRender(); }
  if (t.closest('#resRename')) {
    const r = state.lastResult;
    return r ? editInPlace($('resTeam'), r.team || '', { label: 'Team name', cls: 'rename-free', save: v => call('/api/scores/rename', { id: r.id, team: v }).catch(() => {}) }) : null;
  }
  if (t.closest('#rvTeamEdit')) {
    return state.session ? editInPlace($('rvTeam'), state.session.team || '', { label: 'Team name', cls: 'rename-free', allowEmpty: true, save: v => call('/api/session/team', { team: v }).catch(() => {}) }) : null;
  }
  if (t.closest('#backBtn')) return go('games');
  if (t.closest('#sessionChip')) return state?.session ? go(gameHash(state.session.gameId)) : null;

  const open = t.closest('[data-open]');
  if (open) return go(gameHash(open.closest('[data-key]').dataset.key));

  const theme = t.closest('#themeSeg button');
  if (theme) { const g = gameById(gameId); if (g) optsOf(g).theme = theme.dataset.key; return scheduleRender(); }

  const levelBtn = t.closest('#levelSeg button');
  if (levelBtn) { const g = gameById(gameId); if (g) optsOf(g).level = levelBtn.dataset.key; return scheduleRender(); }

  const watchBtn = t.closest('[data-watch]');
  if (watchBtn) { watchPov = watchBtn.dataset.key; return scheduleRender(); }
  if (t.closest('#watchClose')) { watchPov = null; return scheduleRender(); }

  const cam = t.closest('#viewSeg button');
  if (cam) {
    userPickedView = true;
    const key = cam.dataset.cam;
    view = key.startsWith('corner:') ? { mode: 'corner', idx: Number(key.split(':')[1]) } : { mode: key };
    return scheduleRender();
  }

  const row = t.closest('.roster-row');
  if (row) { focusId = focusId === row.dataset.key ? null : row.dataset.key; return scheduleRender(); }

  const act = t.closest('[data-act]');
  if (act) {
    const id = act.closest('[data-key]')?.dataset.key;
    if (!id) return;
    if (act.dataset.act === 'vol') {
      const h = state.headsets.find(x => x.id === id);
      return call('/api/headset/volume', { headsetId: id, value: clamp((h?.volume ?? 50) + Number(act.dataset.d), 0, 100) }).catch(() => {});
    }
    if (act.dataset.act === 'identify') {
      const r = await call('/api/headset/identify', { headsetId: id }).catch(() => null);
      if (r?.ok) toast('The headset controllers vibrate');
      return;
    }
  }

  const chip = t.closest('.team-chip');
  if (chip) {
    const now = Number(chip.dataset.teamNow) || 0;
    let to = now === 1 ? 2 : 1;
    if (!now) {
      const teams = state.headsets.filter(h => h.online).map(h => teamView(h).team);
      to = teams.filter(x => x === 2).length < teams.filter(x => x === 1).length ? 2 : 1;
    }
    return call('/api/match/team', { headsetId: chip.dataset.key, team: to }).catch(() => {});
  }

  if (t.closest('#launchBtn')) {
    const g = gameById(gameId), st = g && launchState(g);
    if (st && !st.why) await launchGame(g, st.chosen.map(h => h.id));
    return;
  }
  if (t.closest('#lvRetry')) {      // пак на каските, които не заредиха; ако играта вече върви на други, влизат в нея
    const g = gameById(gameId);
    if (g) await launchGame(g, $('lvRetry')._ids || [], stageOf(g) !== 'failed');
    return;
  }
  const join = t.closest('[data-join]');
  if (join) {
    const g = gameById(gameId);
    if (g) await launchGame(g, [join.closest('[data-key]').dataset.key], true);
    return;
  }
  if (t.closest('#lvSkip')) { if (state.session) ranKey = state.session.startedAt; return scheduleRender(); }
  if (t.closest('#lvBack')) { launchCtx = null; return scheduleRender(); }

  const spaceBtn = t.closest('[data-space]');
  if (spaceBtn) return twoStep(spaceBtn, () => call('/api/headset/clear-space', { headsetId: spaceBtn.closest('[data-key]').dataset.key }).catch(() => {}));

  const zoneBtn = t.closest('[data-zone]');
  if (zoneBtn) return call(`/api/zone/${zoneBtn.dataset.zone}`, { headsetId: zoneBtn.closest('[data-key]').dataset.key }).catch(() => {});

  const calib = t.closest('[data-calib]');
  if (calib) return call('/api/calibrate', { headsetId: calib.closest('[data-key]').dataset.key }).catch(() => {});
});

document.addEventListener('dblclick', e => {
  const name = e.target.closest('#hsBody .hname');
  if (name) startRename(name, name.closest('[data-key]').dataset.key);
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('#hsBody input[type="checkbox"]')) {
    const id = t.closest('[data-key]').dataset.key;
    if (pickAll) { selected.clear(); pickAll = false; }
    if (t.checked) selected.add(id); else selected.delete(id);
    if (!selected.size) pickAll = true;      // нищо отбелязано тук значи „всички свободни"
    return scheduleRender();
  }
  if (t.matches('[data-pick]')) {      // избор на страницата на играта: първото пипане превръща „всички свободни" в изричен списък
    const id = t.closest('[data-key]').dataset.key, g = gameById(gameId);
    if (pickAll) { selected.clear(); if (g) for (const h of poolFor(g)) if (h.phase === 'idle') selected.add(h.id); pickAll = false; }
    if (t.checked) selected.add(id); else selected.delete(id);
    return scheduleRender();
  }
  if (t.id === 'autoOn' || t.id === 'autoGame') { call('/api/autostart', { on: $('autoOn').checked, gameId: $('autoGame').value }).catch(() => {}); return; }
  if (t.id === 'fastGame') { const g = gameById(gameId); if (g) optsOf(g).fast = t.checked; return scheduleRender(); }
  if (t.id === 'boardGame') { boardGame = t.value; history.replaceState(null, '', `#board/${encodeURIComponent(boardGame)}`); return scheduleRender(); }
  if (t.id === 'camHead') {
    userPickedView = true;
    view = t.value ? { mode: 'headset', id: decodeURIComponent(t.value) } : { mode: 'plan' };
    return scheduleRender();
  }
  if (t.closest('.match-cfg')) call('/api/match', matchBody('settings')).catch(() => {});
});

$('hsClear').onclick = () => { selected.clear(); pickAll = true; scheduleRender(); };
const stopGame = () => { stopAt = Date.now(); launchCtx = null; return call('/api/stop').catch(() => {}); };
$('stopBtn').onclick = e => twoStep(e.currentTarget, stopGame);
$('lvCancel').onclick = e => twoStep(e.currentTarget, stopGame);
$('matchStart').onclick = () => call('/api/match', matchBody('start')).catch(() => {});
$('matchRestart').onclick = () => call('/api/match', matchBody('restart')).catch(() => {});
$('matchStop').onclick = () => call('/api/match', matchBody('stop')).catch(() => {});
$('forceStart').onclick = () => call('/api/match', matchBody('forceStart')).catch(() => {});
$('calibCancel').onclick = $('calibRetry').onclick = () => call('/api/calibrate/cancel').catch(() => {});
$('calibConfirm').onclick = () => call('/api/calibrate/confirm').catch(() => {});
$('calibRotate').onclick = () => call('/api/calibrate/rotate', {}).catch(() => {});
$('calibClear').onclick = e => twoStep(e.currentTarget, () => call('/api/calibrate/clear').catch(() => {}));
$('calibUndo').onclick = offerPrevious;
$('prevCancel').onclick = () => { prevOffer = null; show($('prevBox'), false); };
$('prevApply').onclick = async () => {
  const p = prevOffer;
  prevOffer = null;
  show($('prevBox'), false);
  if (p) await call('/api/calibration/restore-previous', { file: p.file }).catch(() => {});
};

// името на отбора се помни, докато се пише; Enter в полето пуска играта
$('teamName').oninput = e => { const g = gameById(gameId); if (g) optsOf(g).team = e.target.value; };
$('teamName').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('launchBtn').click(); } };

// клавиши 1–7 сменят раздела, по реда им в релсата
const ORDER = ['games', 'board', 'overview', 'headsets', 'calib', 'match', 'settings'];
document.addEventListener('keydown', e => {
  if (e.target.matches('input:not([type="checkbox"]), select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape' && section === 'games' && gameId) return go('games');      // от страницата на игра обратно в библиотеката
  const i = Number(e.key) - 1;
  if (ORDER[i]) go(ORDER[i]);
});
window.addEventListener('hashchange', () => go(location.hash.slice(1), false));

// ---------- старт ----------

readColors();
go(location.hash.slice(1) || 'games', false);
connect();
pollLive();
requestAnimationFrame(frame);
document.fonts?.ready.then(() => { readColors(); scheduleRender(); });

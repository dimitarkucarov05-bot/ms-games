// MS Games 2 · the rebuilt management pages: Records, the Arena map, Headsets, the rest of Settings and the
// calibration tools (Setup). One top-down drawing of the play area (App.drawArena) serves the Arena map and the
// calibration-points step of the setup wizard.

'use strict';

// ---------- the play area seen from above ----------

const smoothPos = new Map();      // headset id → {x, z, yaw}, eased towards the reported position
let arenaFrame = 0;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COL = {};
function readCol() { for (const k of ['bg', 'surface', 'surface-2', 'line', 'line-2', 'text', 'text-2', 'text-3', 'signal', 'accent', 'warn', 'bad', 'deep']) COL[k] = css(`--${k}`); }
const withA = (c, a) => c.replace(/\)$/, ` / ${a})`);

/** Play area and marks in hall metres: {w, d, poly, obstacles, marks:[{x,z},{x,z}], measured}. */
function arenaShape() {
  const zn = state.zone, c = state.calibration, area = state.setup && state.setup.area;
  let w = 0, d = 0, poly = null, obstacles = [], marks = null;
  if (zn && zn.hall && zn.hall.w) { w = zn.hall.w; d = zn.hall.d; }
  else if (c && c.width) { w = c.width; d = c.depth; }
  else if (area && area.w) { w = area.w; d = area.d; }
  if (zn && Array.isArray(zn.poly) && zn.poly.length > 2) { poly = zn.poly; obstacles = zn.obstacles || []; }
  if (zn && Array.isArray(zn.markers) && zn.markers.length === 2) marks = zn.markers.map(m => (Array.isArray(m) ? { x: m[0], z: m[1] } : { x: m.x, z: m.z }));
  if (!marks && w) marks = [{ x: -w / 2, z: d / 2 }, { x: -w / 2, z: d / 2 - Math.min(2, d) }];      // A = front-left corner, B 2 m towards the back
  if (poly && !w) { const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]); w = Math.max(...xs) - Math.min(...xs) + 1; d = Math.max(...zs) - Math.min(...zs) + 1; }
  return { w, d, poly, obstacles, marks, measured: !!w };
}
App.arenaShape = arenaShape;

/** Draws the arena into a canvas that fills its box. opts: {marks, points (setup step), focus (headset id)}. */
App.drawArena = function (canvas, opts = {}) {
  if (!COL.bg) readCol();
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const sh = arenaShape();
  const w = sh.w || 6, d = sh.d || 6;
  const pad = Math.max(36, Math.min(W, H) * 0.08);
  const k = Math.min((W - pad * 2) / w, (H - pad * 2) / d);
  const X = x => W / 2 + x * k, Y = z => H / 2 + z * k;
  const x0 = X(-w / 2), y0 = Y(-d / 2);
  // floor and the 1 m grid
  g.fillStyle = COL.surface; g.fillRect(x0, y0, w * k, d * k);
  g.strokeStyle = COL.line; g.lineWidth = 1; g.beginPath();
  for (let x = Math.ceil(-w / 2); x <= w / 2; x++) { const px = Math.round(X(x)) + 0.5; g.moveTo(px, y0); g.lineTo(px, y0 + d * k); }
  for (let z = Math.ceil(-d / 2); z <= d / 2; z++) { const py = Math.round(Y(z)) + 0.5; g.moveTo(x0, py); g.lineTo(x0 + w * k, py); }
  g.stroke();
  g.strokeStyle = sh.measured ? COL['text-3'] : COL['line-2']; g.lineWidth = 2; g.setLineDash(sh.measured ? [] : [8, 8]);
  g.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w * k), Math.round(d * k)); g.setLineDash([]);
  if (sh.measured) {
    g.fillStyle = COL['text-3']; g.font = `600 13px ${css('--font')}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(`${String(Math.round(w * 10) / 10).replace('.', ',')} m`, W / 2, y0 - 8);
    g.save(); g.translate(x0 - 10, H / 2); g.rotate(-Math.PI / 2); g.fillText(`${String(Math.round(d * 10) / 10).replace('.', ',')} m`, 0, 0); g.restore();
  }
  // the drawn boundary and obstacles
  const path = pts => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.closePath(); };
  if (sh.poly) {
    g.strokeStyle = COL.signal; g.lineWidth = 2; g.setLineDash([9, 6]); path(sh.poly); g.stroke(); g.setLineDash([]);
    for (const o of sh.obstacles) { if (o.length < 3) continue; path(o); g.fillStyle = withA(COL.bad, 0.25); g.fill(); g.strokeStyle = COL.bad; g.lineWidth = 1.5; g.stroke(); }
  }
  // marks A and B, with the measured distance between them
  if (opts.marks !== false && sh.marks) {
    const [A, B] = sh.marks, ax = X(A.x), ay = Y(A.z), bx = X(B.x), by = Y(B.z);
    g.strokeStyle = withA(COL.accent, 0.7); g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    const ab = opts.ab;
    if (ab) { g.fillStyle = COL.accent; g.font = `700 15px ${css('--font-num')}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(`${String(ab.toFixed(2)).replace('.', ',')} m`, (ax + bx) / 2 + 14, (ay + by) / 2); }
    const mark = (x, y, label, on) => {
      const r = Math.max(14, k * 0.22);
      g.strokeStyle = on ? COL.accent : COL.text; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - r * 0.55, y); g.lineTo(x + r * 0.55, y); g.moveTo(x, y - r * 0.55); g.lineTo(x, y + r * 0.55); g.stroke();
      g.fillStyle = on ? COL.accent : COL.text; g.font = `800 ${Math.round(r * 1.25)}px ${css('--font-num')}`; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(label, x - r - 8, y);
    };
    mark(ax, ay, 'A', opts.now === 'p1'); mark(bx, by, 'B', opts.now === 'p2');
  }
  // headsets: a dot with the number on its colour and a wedge for where it looks
  const t = performance.now(), dt = Math.min(0.1, (t - (canvas._t || t)) / 1000); canvas._t = t;
  const ease = 1 - Math.exp(-dt * 7);
  const r = clamp(k * 0.24, 12, 22);
  for (const h of [...(state.headsets || [])].sort((a, b) => (a.id === opts.focus) - (b.id === opts.focus))) {
    if (!h.online || !h.pos) { smoothPos.delete(h.id); continue; }
    let s = smoothPos.get(h.id);
    if (!s) { s = { x: h.pos.x, z: h.pos.z, yaw: h.yaw || 0 }; smoothPos.set(h.id, s); }
    s.x += (h.pos.x - s.x) * ease; s.z += (h.pos.z - s.z) * ease;
    let dy = (h.yaw || 0) - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * ease;
    const px = X(clamp(s.x, -w / 2 - 0.5, w / 2 + 0.5)), py = Y(clamp(s.z, -d / 2 - 0.5, d / 2 + 0.5));
    const col = hsColor(h), a = Math.atan2(Math.cos(s.yaw), Math.sin(s.yaw));
    g.fillStyle = withA(col.startsWith('#') ? hexToOk(col) : col, 0.2);
    g.beginPath(); g.moveTo(px, py); g.arc(px, py, r * 3, a - 0.5, a + 0.5); g.closePath(); g.fill();
    const pt = opts.points && opts.points[h.id];
    if (h.id === opts.focus || pt === 'p1' || pt === 'p2') { g.strokeStyle = COL.accent; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, r + 5, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = col; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'oklch(0.17 0.04 305)'; g.font = `800 ${Math.round(r * 1.3)}px ${css('--font-num')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(h.number || ''), px, py + 1);
  }
};
/** #rrggbb as an rgb() the alpha helper can extend. */
function hexToOk(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255})`; }

// the canvases move every frame while they are on screen (headsets walk)
function arenaLoop() {
  arenaFrame = requestAnimationFrame(arenaLoop);
  if (!state || document.hidden) return;
  if (section === 'arena') App.drawArena($('arenaCanvas'), { focus: App.arenaFocus });
  const pc = document.getElementById('ptsCanvas');
  if (section === 'setup' && pc && pc.isConnected) {
    const st = state.setup || {}, ref = st.ref || (App.wiz && App.wiz.firstId);
    const ck = (st.check || {})[ref];
    App.drawArena(pc, { points: st.points || {}, now: (st.points || {})[ref], ab: ck && ck.ab ? ck.ab : st.refAB || null, focus: ref });
  }
}
requestAnimationFrame(arenaLoop);
window.addEventListener('resize', () => { for (const k in COL) delete COL[k]; });

App.views.arena = function () {
  const sh = arenaShape(), hs = (state.headsets || []).filter(h => h.online);
  text($('arenaSize'), sh.measured ? `Play area ${App.fmtArea({ w: sh.w, d: sh.d })}` : 'Play area not set');
  text($('arenaNote'), `${plural(hs.length, 'headset', 'headsets')} online${sh.poly ? `, boundary with ${sh.poly.length} points and ${plural(sh.obstacles.length, 'obstacle', 'obstacles')}` : ''}`);
  show($('arenaEmpty'), !sh.measured && !hs.length);
};
$('arenaCanvas').addEventListener('click', () => { App.arenaFocus = null; });

// ---------- Records ----------

const REC = { period: 'day', level: '', game: null, key: '', list: null, total: 0 };
function loadRecords() {
  const ver = state.recordsVersion ?? state.scoresVersion ?? 0;
  const key = `${REC.game}|${REC.period}|${REC.level}|${ver}`;
  if (key === REC.key) return;
  REC.key = key;
  api(`/api/records?gameId=${encodeURIComponent(REC.game || '')}&period=${REC.period}&difficulty=${REC.level}&limit=100`, undefined, { quiet: true }).then(r => {
    REC.list = r.ok ? r.data.list || r.data.records || [] : [];
    REC.total = r.ok ? nOr0(r.data.total) || REC.list.length : 0;
    scheduleRender();
  });
}
App.views.records = function () {
  const games = App.playableGames();
  if (!REC.game || !games.some(g => g.id === REC.game)) REC.game = games[0] ? games[0].id : '';
  const sel = $('recGame');
  show(sel, games.length > 1);
  if (games.length > 1) syncList(sel, games, g => g.id, () => document.createElement('option'), (o, g) => { o.value = g.id; text(o, g.name); });
  if (document.activeElement !== sel) sel.value = REC.game;
  for (const b of $('recPeriodAll').children) b.classList.toggle('on', b.dataset.p === REC.period);
  for (const b of $('recLevel').children) b.classList.toggle('on', b.dataset.l === REC.level);
  loadRecords();
  const list = REC.list || [];
  text($('recCount'), REC.list ? plural(REC.total, 'record', 'records') : '');
  $('recExport').href = `/api/records?gameId=${encodeURIComponent(REC.game || '')}&period=${REC.period}&difficulty=${REC.level}&format=csv`;
  attr($('recExport'), 'download', `records-${REC.game || 'all'}-${REC.period}.csv`);
  show($('recWrap'), list.length > 0);
  show($('recEmpty'), REC.list != null && !list.length);
  text($('recEmptyTitle'), { day: 'No records today yet', week: 'No records in the last 7 days', month: 'No records in the last 30 days', all: 'No records yet' }[REC.period]);
  syncList($('recRows'), list, e => e.id, () => make(`<tr><td class="c-rank"><b class="rank" data-f="r"></b></td><td><div class="bteam" data-f="t"></div></td><td class="r"><b class="bscore" data-f="s"></b></td><td data-f="l"></td><td class="r" data-f="m"></td><td class="rec-players" data-f="p"></td><td data-f="w"></td>
    <td class="c-act"><button type="button" class="btn btn-quiet" data-rec-rename>Rename</button><button type="button" class="btn btn-quiet" data-rec-remove data-confirm="Again: delete">Delete</button></td></tr>`), (el, e) => {
    const p = parts(el), rank = nOr0(e.rank);
    el.classList.toggle('top', rank >= 1 && rank <= 3);
    text(p.r, rank || '');
    if (!p.t._editing) text(p.t, e.team || '');
    text(p.s, fmtScore(e.score));
    text(p.l, e.difficulty ? levelName(e.difficulty) : '');
    text(p.m, e.minutes || '');
    const names = (e.players || []).map(x => (typeof x === 'string' ? x : x.name)).filter(Boolean);
    text(p.p, names.join(', '));
    attr(p.p, 'title', names.join(', ') || null);
    text(p.w, whenText(e.at || e.date));
    attr(p.w, 'title', whenFull(e.at || e.date) || null);
  });
};
$('recPeriodAll').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { REC.period = b.dataset.p; scheduleRender(); } });
$('recLevel').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (b) { REC.level = b.dataset.l; scheduleRender(); } });
$('recGame').addEventListener('change', e => { REC.game = e.target.value; scheduleRender(); });
$('recRows').addEventListener('click', e => {
  const row = e.target.closest('[data-key]');
  if (!row) return;
  const id = row.dataset.key;
  if (e.target.closest('[data-rec-rename]')) { const t = parts(row).t; return editInPlace(t, t.textContent, { label: 'Team name', save: v => api('/api/records/rename', { id, team: v }).then(() => { REC.key = ''; }) }); }
  const rm = e.target.closest('[data-rec-remove]');
  if (rm) return twoStep(rm, () => api('/api/records/remove', { id }).then(r => { if (r.ok) { REC.key = ''; toast('Record deleted'); scheduleRender(); } }));
});
App.onGo.records = () => { REC.key = ''; };

// ---------- Headsets ----------

const DOTS2 = '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="3.5" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="14.5" cy="9" r="1.6"/></svg>';
function battRow(k, label) { return `<div class="hcm" data-f="m${k}"><span class="hcm-k">${label}</span><span class="hcm-bar"><i data-f="b${k}"></i></span><b data-f="v${k}"></b></div>`; }
App.views.headsets = function () {
  const hs = [...(state.headsets || [])].sort(byNumber), online = hs.filter(h => h.online).length;
  text($('hsSummary'), hs.length ? `${online} of ${hs.length} online` : '');
  show($('hsEmpty'), !hs.length);
  text($('hsAddrLine'), playUrl() ? `Without the app, a headset browser can open ${playUrl()}` : '');
  syncList($('hsGrid'), hs, h => h.id, () => make(`
    <article class="hcard">
      <header class="hc-head"><span class="hc-num" data-f="num"></span><div class="hc-title"><button type="button" class="hs-name hc-name" data-f="name" data-hc-rename></button><span class="hs-state" data-f="st"><i></i><span data-f="word"></span></span></div><button type="button" class="hs-more" data-hc-more aria-label="More">${DOTS2}</button></header>
      <div class="hc-batt">${battRow('H', 'Headset')}${battRow('L', 'Left')}${battRow('R', 'Right')}</div>
      <dl class="hc-facts">
        <div><dt>Wi-Fi</dt><dd data-f="wifi"></dd></div>
        <div><dt>Calibration</dt><dd data-f="cal"></dd></div>
        <div><dt>Version</dt><dd data-f="ver"></dd></div>
        <div><dt>Volume</dt><dd><span class="stepper"><button type="button" data-hc-vol="-10" aria-label="Quieter">−</button><span data-f="vol"></span><button type="button" data-hc-vol="10" aria-label="Louder">+</button></span></dd></div>
      </dl>
      <footer class="hc-acts"><button type="button" class="btn" data-hc="identify">Identify</button><button type="button" class="btn" data-hc="recalibrate">Recalibrate</button><button type="button" class="btn" data-hc="bench"></button></footer>
    </article>`), (el, h) => {
    const p = parts(el), w = hsWord(h);
    el.classList.toggle('off', !h.online);
    const c = hsColor(h);
    if (p.num._c !== c) { p.num._c = c; p.num.style.setProperty('--hc', c); }
    text(p.num, h.number || '·');
    if (!p.name._editing) text(p.name, h.name);
    attr(p.st, 'data-s', w.s); text(p.word, w.w);
    const ctl = h.controllers || {};
    hcMeter(p, 'H', h.online ? h.battery : null, h.charging);
    hcMeter(p, 'L', h.online ? ctl.left : null, ctl.leftCharging);
    hcMeter(p, 'R', h.online ? ctl.right : null, ctl.rightCharging);
    const hl = h.health || {};
    text(p.wifi, h.online && hl.pingMs != null ? `${hl.pingMs} ms now · ${hl.pingMin ?? '?'}–${hl.pingMax ?? '?'} ms · ${plural(nOr0(hl.drops), 'drop', 'drops')} in 30 min` : h.online ? 'measuring' : hl.lastDropAt ? `offline since ${whenText(hl.lastDropAt)}` : 'offline');
    text(p.cal, h.desk ? 'desk test, none needed' : hsAligned(h) ? (h.anchor === 'lost' ? 'lost its anchors' : 'aligned to marks A and B') : 'not calibrated');
    attr(p.cal, 'data-tone', !h.desk && !hsAligned(h) ? 'warn' : null);
    text(p.ver, [h.model, h.appVersion || h.app ? `app ${h.appVersion || h.app}` : '', h.build ? `page ${h.build}` : ''].filter(Boolean).join(' · '));
    text(p.vol, h.volume ?? '');
    for (const b of el.querySelectorAll('[data-hc], [data-hc-vol]')) b.disabled = !h.online && b.dataset.hc !== 'bench';
    text(el.querySelector('[data-hc="bench"]'), h.benched ? 'Back to games' : 'Bench');
  });
};
function hcMeter(p, k, v, charging) {
  const has = typeof v === 'number';
  p[`m${k}`].classList.toggle('none', !has);
  text(p[`v${k}`], has ? `${Math.round(v)} %` : '–');
  p[`b${k}`].style.width = has ? `${clamp(v, 0, 100)}%` : '0';
  attr(p[`m${k}`], 'data-low', has && v < 20 && !charging);
  attr(p[`m${k}`], 'data-charging', has && !!charging);
}
$('hsGrid').addEventListener('click', async e => {
  const card = e.target.closest('[data-key]');
  if (!card) return;
  const id = card.dataset.key, h = (state.headsets || []).find(x => x.id === id);
  if (!h) return;
  const nm = e.target.closest('[data-hc-rename]');
  if (nm) return editInPlace(nm, h.name, { label: 'Headset name', save: v => call('/api/headset/rename', { headsetId: id, name: v }).catch(() => {}) });
  const more = e.target.closest('[data-hc-more]');
  if (more) return App.openMenu(id, more);
  const vol = e.target.closest('[data-hc-vol]');
  if (vol) return api('/api/headset/volume', { headsetId: id, value: clamp(nOr0(h.volume ?? 50) + Number(vol.dataset.hcVol), 0, 100) });
  const a = e.target.closest('[data-hc]');
  if (!a) return;
  if (a.dataset.hc === 'bench') { if (await App.hsAction(id, 'bench', !h.benched)) toast(h.benched ? `${h.name} can play again` : `${h.name} stays in the lobby`); return; }
  if (a.dataset.hc === 'identify') { const r = await api('/api/headset/action', { headsetId: id, action: 'identify' }, { quiet: true }); if (!r.ok) await call('/api/headset/identify', { headsetId: id }).catch(() => {}); toast(`${h.name}: controllers vibrate`); return; }
  if (await App.hsAction(id, a.dataset.hc)) toast(`${h.name}: touch marks A and B in the headset`);
});
$('hsAdd').onclick = () => App.startSetup('add');

// ---------- Settings: start by itself, addresses ----------

App.views.settings = function () {
  if (App.views.settingsForm) App.views.settingsForm();
  const s = state.settings || {}, a = state.autoStart || {};
  const on = 'autoStart' in s ? !!s.autoStart : !!a.on;
  const ip = (state.serverAddresses || []).map(x => `${x}:${location.port || 80}`).join(', ') || location.host;
  const html = `<div class="side-head"><span class="label">Start by itself</span></div><div class="sets">
    ${setRow('Start the game on every headset that joins', 'For days without an operator: a headset that comes online is aligned if it needs it, then the game starts on it. Once per connection.', toggleHtml('autostart', on))}
    </div>
    <div class="side-head"><span class="label">Addresses</span></div><div class="sets">
    ${setRow('This computer', 'For the console from another device on the same network', `<span class="num addr">${esc(ip)}</span>`)}
    ${setRow('Headset address', 'Only needed for a headset without the MS Games app', `<span class="num addr">${esc(playUrl() || 'none: the server runs without HTTPS')}</span>`)}
    </div>`;
  const box = $('setMore');
  if (box._h !== html) { box._h = html; box.innerHTML = html; }
};
$('setMore').addEventListener('change', e => {
  if (!e.target.matches('[data-set="autostart"]')) return;
  const on = e.target.checked;
  api('/api/settings', { autoStart: on }).then(r => { if (r.ok) toast(on ? 'Games start by themselves on joining headsets' : 'Headsets wait in the lobby'); });
  api('/api/autostart', { on, gameId: (App.playableGames()[0] || {}).id || '' }, { quiet: true });
});

// ---------- Setup: calibration tools ----------

App.toolsPane = function (pane) {
  pane.innerHTML = `<div class="pane-intro"><h2 class="pane-title">Calibration tools</h2><p class="pane-sub">For one headset at a time, or for the whole arena. The setup steps cover the usual cases; use these when something is off.</p></div>
    <div class="prow-list" data-f="rows"></div>
    <div class="side-head"><span class="label">The whole arena</span></div>
    <div class="sets">
      ${setRow('Older calibration', 'Brings back the one before the current one. The current one stays in the history.', '<button type="button" class="btn btn-lg" data-tool="previous">Restore previous</button>')}
      ${setRow('Turned the wrong way', 'Turns the arena 180° around its centre. No new calibration needed.', '<button type="button" class="btn btn-lg" data-tool="rotate">Turn 180°</button>')}
      ${setRow('Start again', 'Deletes every headset calibration. Each headset then needs the two points again.', '<button type="button" class="btn btn-lg btn-danger" data-tool="clear" data-confirm="Press again to delete">Delete calibrations</button>')}
    </div>
    <div class="notice notice-plain" data-f="prev" hidden><span data-f="prevText"></span><span class="btn-row"><button type="button" class="btn btn-primary" data-tool="prevApply">Restore it</button><button type="button" class="btn" data-tool="prevCancel">Cancel</button></span></div>`;
  pane._p = null;
};
App.toolsFill = function (pane) {
  const p = parts(pane), hs = [...(state.headsets || [])].sort(byNumber), busy = runLive(state.run);
  syncList(p.rows, hs, h => h.id, () => make(`<div class="prow-pts tool-row"><span class="hsq" data-f="sq"></span><span class="prow-main"><span class="prow-name" data-f="name"></span><span class="pts-check" data-f="sub"></span></span>
    <span class="btn-row"><button type="button" class="btn" data-zone="draw">Draw boundary</button><button type="button" class="btn" data-zone="obstacles">Obstacles</button><button type="button" class="btn" data-zone="floor">Floor height</button><button type="button" class="btn btn-quiet" data-space data-confirm="Again: clear the space">Clear the space</button></span></div>`), (el, h) => {
    const f = parts(el), can = h.online && !h.desk && !busy;
    paintSq(f.sq, h);
    text(f.name, h.name);
    text(f.sub, !h.online ? 'offline' : h.desk ? 'desk test' : hsAligned(h) ? 'aligned' : 'not calibrated');
    for (const b of el.querySelectorAll('[data-zone]')) b.disabled = !can || (b.dataset.zone === 'obstacles' && !state.zone);
    el.querySelector('[data-space]').disabled = !h.online || busy;
    attr(el.querySelector('[data-space]'), 'title', 'Only when something is broken: clears the headset\'s own space memory (over USB) and with it the anchors. Afterwards it needs the two points again.');
  });
  for (const b of pane.querySelectorAll('[data-tool="rotate"], [data-tool="clear"], [data-tool="previous"]')) b.disabled = busy;
};
let prevOffer = null;
document.addEventListener('click', async e => {
  if (!e.target.closest('#wizPane')) return;
  const z = e.target.closest('[data-zone]');
  if (z) { const id = z.closest('[data-key]').dataset.key; const r = await api(`/api/zone/${z.dataset.zone}`, { headsetId: id }); if (r.ok) toast(z.dataset.zone === 'floor' ? 'Touch the floor with the controller in the headset' : 'Draw with the laser in the headset'); return; }
  const sp = e.target.closest('[data-space]');
  if (sp) return twoStep(sp, () => api('/api/headset/clear-space', { headsetId: sp.closest('[data-key]').dataset.key }));
  const t = e.target.closest('[data-tool]');
  if (!t) return;
  const pane = $('wizPane'), p = parts(pane);
  if (t.dataset.tool === 'rotate') { const r = await api('/api/calibrate/rotate', {}); if (r.ok) toast('Arena turned 180°'); }
  if (t.dataset.tool === 'clear') twoStep(t, () => api('/api/calibrate/clear', {}).then(r => r.ok && toast('Calibrations deleted')));
  if (t.dataset.tool === 'previous') {
    const r = await api('/api/calibration/previous', undefined, { quiet: true });
    const pv = r.data && r.data.previous;
    if (!pv) return toast('No older calibration in the history', 'warn');
    prevOffer = pv;
    const when = pv.savedAt ? whenFull(pv.savedAt) : pv.file;
    text(p.prevText, `The previous one is from ${when}: ${pv.width ? App.fmtArea({ w: pv.width, d: pv.depth }) : 'no size'}, ${plural((pv.headsets || []).length, 'headset', 'headsets')}.`);
    show(p.prev, true);
  }
  if (t.dataset.tool === 'prevCancel') { prevOffer = null; show(p.prev, false); }
  if (t.dataset.tool === 'prevApply' && prevOffer) { const r = await api('/api/calibration/restore-previous', { file: prevOffer.file }); prevOffer = null; show(p.prev, false); if (r.ok) toast('Previous calibration restored', 'ok'); }
});

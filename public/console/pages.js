// MS Games 2 · smaller pages: Scorecards (gallery, view, print), Settings (the new form above
// the old auto-start), Diagnose (checks, headsets, bug report), Records export, and the demo driver.

'use strict';

// ---------- Scorecards ----------

const SC = { list: null, at: 0, v: -1, open: null, look: 'digital', loading: false };

function loadCards(force) {
  const ver = state.scorecardsVersion ?? state.scoresVersion;
  if (SC.loading || (!force && SC.v === ver && Date.now() - SC.at < 30000)) return;
  SC.loading = true;
  api('/api/scorecards', undefined, { quiet: true }).then(r => {
    SC.loading = false; SC.at = Date.now(); SC.v = state.scorecardsVersion ?? state.scoresVersion;
    SC.list = r.ok ? (r.data.scorecards || r.data.list || []) : (r.status === 404 ? [] : SC.list || []);
    SC.missing = r.status === 404;
    scheduleRender();
  });
}
App.onGo.scorecards = sub => { SC.open = sub ? decodeURIComponent(sub) : null; loadCards(true); };

function renderCards() {
  loadCards(false);
  const list = SC.list || [];
  text($('cardsCount'), SC.list == null ? 'Loading' : list.length ? plural(list.length, 'scorecard', 'scorecards') : '');
  show($('cardsEmpty'), SC.list != null && !list.length);
  if (SC.missing) text($('cardsEmpty').lastElementChild, 'This server does not save scorecards yet. They appear here once MS Games is updated.');
  if (SC.open && SC.list && !list.some(c => c.id === SC.open || c.sessionId === SC.open) && !window.MSMock) SC.open = null;
  syncList($('cardGrid'), list, c => c.id, () => make(`<button type="button" class="sccard"><span class="cover" data-f="cover"><span class="cover-type" data-f="type"></span></span><b data-f="team"></b><span><em data-f="score"></em> · <span data-f="when"></span></span></button>`), (el, c) => {
    const p = parts(el), g = gameById(c.gameId) || { name: c.gameName || c.game || c.gameId, color: '', cover: `/play/games/${c.gameId}/cover.jpg` };
    paintCover(p.cover, p.type, g);
    text(p.team, c.team || '');
    text(p.score, fmtScore(c.score));
    text(p.when, `${c.gameName || c.game || g.name || ''}, ${whenText(c.date || c.at)}`);
    el.classList.toggle('on', SC.open === c.id || SC.open === c.sessionId);
  });
  const open = !!SC.open;
  show($('cardView'), open);
  $('cardGrid').parentElement.classList.toggle('viewing', open);
  for (const b of $('cardLook').children) b.classList.toggle('on', b.dataset.look === SC.look);
  if (open) {
    const src = `/scorecard/?id=${encodeURIComponent(SC.open)}&look=${SC.look}${window.MSMock ? '&mock=1' : ''}`;
    const f = $('cardFrame');
    if (f.dataset.src !== src) { f.dataset.src = src; f.src = src; }
    $('cardOpen').href = src;
    fitCard();
    $('cardLabel').disabled = App.printerKind() !== 'thermal';
    attr($('cardLabel'), 'title', App.printerKind() !== 'thermal' ? 'Choose the label printer in Settings first' : null);
  }
}
App.views.scorecards = renderCards;
function fitCard() { const f = $('cardFrame'), w = f.parentElement.clientWidth; if (w) f.style.transform = `scale(${w / 1000})`; }
window.addEventListener('resize', fitCard);

$('cardGrid').addEventListener('click', e => { const c = e.target.closest('.sccard'); if (!c) return; SC.open = SC.open === c.dataset.key ? null : c.dataset.key; history.replaceState(null, '', SC.open ? `#scorecards/${encodeURIComponent(SC.open)}` : '#scorecards'); scheduleRender(); });
$('cardLook').addEventListener('click', e => { const b = e.target.closest('[data-look]'); if (b) { SC.look = b.dataset.look; scheduleRender(); } });
$('cardPrint').onclick = () => SC.open && App.printCard(SC.open);
$('cardLabel').onclick = () => SC.open && api('/api/scorecards/print', { id: SC.open, printer: 'thermal' }).then(r => r.ok && toast('Sent to the label printer'));
$('cardRemove').onclick = e => twoStep(e.currentTarget, async () => {
  const id = SC.open, r = await api('/api/scorecards/remove', { id });
  if (r.ok) { SC.list = (SC.list || []).filter(c => c.id !== id); SC.open = null; toast('Scorecard deleted'); scheduleRender(); }
});

// ---------- Settings: the new form ----------

const SEASONS = [{ id: 'auto', name: 'Auto' }, { id: 'off', name: 'Off' }, { id: 'christmas', name: 'Christmas' }, { id: 'halloween', name: 'Halloween' }, { id: 'birthday', name: 'Birthday' }];
const ENDMSG = [{ id: 'remove', name: 'Remove headset' }, { id: 'thanks', name: 'Thank you' }, { id: 'staff', name: 'Wait for staff' }, { id: 'custom', name: 'Own text' }];

function renderSettingsForm() {
  const s = state.settings;
  const box = $('setForm');
  if (!s) { if (box._h !== 'none') { box._h = 'none'; box.innerHTML = '<p class="hint">This server has no new settings yet. They appear here once MS Games is updated.</p>'; } return; }
  const v = venueOf(s), em = typeof s.endMessage === 'object' && s.endMessage ? s.endMessage : { preset: s.endMessage || 'remove', text: s.endText || '' };
  const printer = App.printerKind();
  const theme = s.theme || s.season || 'auto';
  const html = `<div class="side-head"><span class="label">Venue</span></div><div class="sets">
    ${setRow('Venue name', 'Status bar, scorecards, waiting-room floor', `<input class="input input-lg" data-s="venueName" type="text" maxlength="40" style="width:min(420px,50vw)" autocomplete="off">`)}
    ${setRow('Logo', 'On scorecards and on the waiting-room floor', `<span class="logo-box">${v.logo ? `<img alt="Venue logo" src="${esc(v.logo)}">` : '<span class="ph">No logo</span>'}</span><label class="btn btn-lg">Choose file<input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" data-logo hidden></label>${v.logo ? '<button type="button" class="btn btn-lg btn-quiet" data-nologo>Remove</button>' : ''}`)}
    ${setRow('Seasonal theme', 'Decorations in the waiting room', seg(SEASONS, theme, 'data-sseg="theme"'))}
    </div>
    <div class="side-head"><span class="label">Sessions</span></div><div class="sets">
    ${setRow('Clock counts', 'What the paid minutes cover', seg([{ id: 'game', name: 'Game only' }, { id: 'all', name: 'Waiting room and game' }], s.clockScope || 'game', 'data-sseg="clockScope"'))}
    ${setRow('Default difficulty', 'Chosen at the start of every session', seg(LEVELS, s.difficulty || 'normal', 'data-sseg="difficulty"'))}
    ${setRow('Scores in the headsets', 'How long players see their results', stepper('resultsSec', nOr0(s.resultsSec) || 20, 5, 120, 5, ' s'))}
    ${setRow('End message', 'Shown in the headsets after the scores', seg(ENDMSG, em.preset || 'remove', 'data-sseg="endMessage"') + (em.preset === 'custom' ? `<input class="input input-lg" data-s="endText" type="text" maxlength="60" placeholder="Your text" style="width:260px">` : ''))}
    </div>
    <div class="side-head"><span class="label">Printing</span></div><div class="sets">
    ${setRow('Printer', 'For scorecards. The label printer is the thermal one on the network.', seg([{ id: 'system', name: 'System printer' }, { id: 'thermal', name: 'Label printer' }], printer, 'data-sseg="printer"'))}
    </div>`;
  if (box._h !== html) {
    const keep = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.s : null;
    box._h = html; box.innerHTML = html;
    if (keep) box.querySelector(`[data-s="${keep}"]`)?.focus();
  }
  const vals = { venueName: v.name, endText: em.text || '' };
  for (const i of box.querySelectorAll('[data-s]')) if (document.activeElement !== i && i.value !== (vals[i.dataset.s] || '')) i.value = vals[i.dataset.s] || '';
}
App.views.settingsForm = renderSettingsForm;
App.printerKind = () => { const p = (state.settings || {}).printer; return typeof p === 'object' && p ? p.kind : p || 'system'; };

/** One settings change in the shape the server keeps (S2's lib/settings.js). */
function settingPatch(k, v) {
  if (k === 'endMessage') return { endMessage: { preset: v } };
  if (k === 'endText') return { endMessage: { text: v } };
  if (k === 'printer') return { printer: { kind: v } };
  return { [k]: v };
}
$('setForm').addEventListener('click', e => {
  const t = e.target;
  const sb = t.closest('[data-sseg] button');
  if (sb) return api('/api/settings', settingPatch(sb.parentElement.dataset.sseg, sb.dataset.v)).then(scheduleRender);
  const st = t.closest('[data-stepper] button');
  if (st) {
    const b = st.parentElement, k = b.dataset.stepper;
    const v = clamp(nOr0((state.settings || {})[k]) + Number(st.dataset.d) * Number(b.dataset.step), Number(b.dataset.min), Number(b.dataset.max));
    return api('/api/settings', { [k]: v });
  }
  if (t.closest('[data-nologo]')) return api('/api/settings', { venue: { logo: null } });
});
$('setForm').addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-s]')) return api('/api/settings', settingPatch(t.dataset.s, t.value.trim())).then(r => r.ok && toast('Saved'));
  if (t.matches('[data-logo]')) return App.uploadLogo(t.files[0]);
});

// ---------- Diagnose ----------

App.diag = null;
let diagBusy = false;
async function runDiag() {
  if (diagBusy) return;
  diagBusy = true;
  text($('diagWhen'), 'Checking');
  const r = await api('/api/diagnose', undefined, { quiet: true });
  diagBusy = false;
  App.diag = r.ok ? { ...r.data, at: Date.now() } : { at: Date.now(), missing: r.status === 404, checks: localDiag() };
  scheduleRender();
}
App.onGo.diagnose = () => runDiag();
setTimeout(() => { if (state) runDiag(); }, 4000);      // once at start, so the status button knows about the firewall

function localDiag() {
  const out = [{ id: 'server', label: 'Server', ok: connected, text: connected ? 'The console reaches the server.' : 'No connection to the server.' }];
  const url = state && playUrl();
  out.push({ id: 'https', label: 'Headset address (HTTPS)', ok: !!url, level: 'warn', text: url || 'The server runs without HTTPS: headsets cannot enter VR through the browser.' });
  return out;
}

function renderDiag() {
  const d = App.diag;
  if (!d) { text($('diagWhen'), 'Checking'); return; }
  text($('diagWhen'), `${d.missing ? 'Basic checks only: this server has no full diagnose yet. ' : ''}Checked at ${new Date(d.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  const pc = (d.checks || []).filter(c => !c.group || c.group === 'pc');
  syncList($('diagChecks'), pc, c => c.id, () => make('<li><i></i><b data-f="k"></b><p data-f="t"></p><button type="button" class="btn" data-dfix hidden>Fix</button></li>'), (el, c) => {
    const p = parts(el);
    text(p.k, c.label);
    text(p.t, [c.value, c.text].filter(Boolean).join('. '));
    attr(el, 'data-ok', c.ok === false ? 'false' : 'true');
    attr(el, 'data-level', c.level || 'error');
    show(el.querySelector('[data-dfix]'), c.ok === false && !!c.fix);
  });
  const addrs = d.pc ? (d.pc.addresses || []).map(ip => ({ ip, name: d.pc.hostname || '', chosen: ip === d.pc.chosen })) : d.adapters || (state.serverAddresses || []).map(ip => ({ name: '', ip, chosen: false }));
  syncList($('diagAdapters'), addrs, a => a.ip, () => make('<li><b data-f="ip"></b> <span data-f="n"></span></li>'), (el, a) => { const p = parts(el); text(p.ip, a.ip); text(p.n, a.chosen ? 'used for the headsets' : a.name || ''); });
  const router = d.router || ['Use 5 GHz (or 6 GHz), one network name, close to the play area.', 'Connect this computer to the router with a cable.', 'Keep only the arena network saved on the headsets.', 'Nothing else on the arena router.'];
  const rtext = x => (typeof x === 'string' ? x : x.text || x.label || '');
  syncList($('diagRouter'), router, rtext, () => document.createElement('li'), (el, x) => text(el, rtext(x)));
  // headsets: one row each, from the per-headset checks (or the mock's list)
  const byHs = new Map();
  for (const c of (d.checks || []).filter(c => c.group === 'headset')) { if (!byHs.has(c.headsetId)) byHs.set(c.headsetId, {}); byHs.get(c.headsetId)[c.id.split('.').pop()] = c; }
  const rows = d.headsets || [...(state.headsets || [])].map(h => {
    const k = byHs.get(h.id) || {};
    return { id: h.id, number: h.number, name: h.name, color: h.color, online: h.online, a: k.pcping || k.link, b: k.backping, page: k.build, drops: k.drops, lastDrop: h.health && h.health.lastDropAt };
  });
  syncList($('diagHs'), [...rows].sort(byNumber), h => h.id, () => make('<tr><td class="c-num"><span class="hsq sm" data-f="sq"></span></td><td data-f="n"></td><td class="r ping" data-f="a"></td><td class="r ping" data-f="b"></td><td data-f="pg"></td><td data-f="app"></td><td data-f="drop"></td></tr>'), (el, h) => {
    const p = parts(el), hs = (state.headsets || []).find(x => x.id === h.id) || h;
    paintSq(p.sq, { ...hs, online: h.online });
    text(p.n, h.name);
    const cell = (elx, c, raw) => {
      if (c && typeof c === 'object') { text(elx, c.value || ''); attr(elx, 'data-tone', c.level === 'error' ? 'bad' : c.level === 'warn' ? 'warn' : null); attr(elx, 'title', c.text || null); return; }
      text(elx, typeof raw === 'number' ? `${raw} ms` : h.online ? (raw === undefined ? '' : 'no answer') : 'offline');
      attr(elx, 'data-tone', typeof raw === 'number' && raw > 80 ? 'warn' : null);
    };
    cell(p.a, h.a, h.pingPc); cell(p.b, h.b, h.pingHeadset);
    if (h.page && typeof h.page === 'object') cell(p.pg, h.page); else text(p.pg, h.page || '');
    text(p.app, hs.appVersion || h.app || '');
    const ld = h.lastDrop;
    text(p.drop, !h.online ? 'offline now' : ld && Number.isFinite(ts(ld)) ? whenText(new Date(ts(ld)).toISOString()) : h.drops && h.drops.value ? String(h.drops.value) : '');
  });
}
App.views.diagnose = renderDiag;

App.diagFix = async function (id) {
  const r = id === 'firewall' ? await api('/api/firewall/fix', {}) : await api('/api/diagnose/fix', { id });
  if (r.ok && r.data.skipped) { toast(`Not run on the dev server: ${r.data.reason}`, 'warn'); return; }
  if (r.ok) { toast('Fixed. Windows may ask for permission.', 'ok'); runDiag(); }
};
$('diagChecks').addEventListener('click', e => { const b = e.target.closest('[data-dfix]'); if (b) { const c = (App.diag.checks || []).find(x => x.id === b.closest('[data-key]').dataset.key); if (c) App.diagFix(c.fix); } });
$('diagRun').onclick = runDiag;
$('bugSave').onclick = async () => {
  const b = $('bugSave');
  b.disabled = true; text(b, 'Saving');
  const r = await api('/api/bugreport', { note: $('bugNote').value.trim() });
  b.disabled = false; text(b, 'Save bug report');
  if (r.ok) { text($('bugFile'), `Saved: ${r.data.file}`); toast('Bug report saved on the Desktop', 'ok'); $('bugNote').value = ''; }
};

// ---------- Records: export ----------

$('boardExport').onclick = async () => {
  const gid = boardGame;
  if (!gid) return;
  const r = await api(`/api/scores?game=${encodeURIComponent(gid)}&period=${boardPeriod}&limit=100`, undefined, {});
  if (!r.ok) return;
  const rows = [['Rank', 'Team', 'Score', 'Players', 'When']].concat((r.data.list || []).map(e => [e.rank, e.team, e.score, (e.players || []).map(p => p.name).join(' / '), e.at]));
  const csv = rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `records-${gid}-${boardPeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ---------- demos for screenshots: ?mock=1&demo=<name> ----------

Object.assign(App.demos, {
  'flow-players': async w => { App.openFlow('quick'); await w(150); F.gameId = 'motel'; F.mode = 'standard'; goStep('players'); },
  'flow-mode': async w => { App.openFlow('quick'); await w(150); F.gameId = 'motel'; goStep('mode'); },
  'flow-settings': async w => { App.openFlow('quick'); await w(150); F.gameId = 'motel'; F.mode = 'standard'; goStep('settings'); },
  'flow-start': async w => { App.openFlow('quick'); await w(150); F.gameId = 'motel'; F.mode = 'standard'; F.team = 'NIGHT OWLS'; F.ids = new Set(['q1', 'q2', 'q3', 'q4']); ensureSettings(); goStep('start'); },
  'flow-start-ok': async w => { App.openFlow('quick'); await w(150); F.gameId = 'motel'; F.mode = 'standard'; F.ids = new Set(['q1', 'q2', 'q5']); ensureSettings(); goStep('start'); },
  'flow-playlist': async w => { App.openFlow('playlist'); await w(400); for (const lv of ['easy', 'normal', 'hard']) F.queue.push({ gameId: 'motel', mode: lv === 'easy' ? 'short' : 'standard', minutes: 10, difficulty: lv, options: {} }); scheduleRender(); },
  'flow-party': async w => { App.openFlow('party'); await w(150); goStep('settings'); },
  'flow-grid-busy': async w => { window.mock.scene('busy'); await w(300); go('flow'); F.kind = 'quick'; F.step = 'game'; scheduleRender(); },
  run: async w => { window.mock.scene('busy'); await w(6500); },
  'run-countdown': async w => { window.mock.scene('busy'); await w(900); },
  'run-paused': async w => { window.mock.scene('busy'); await w(6500); window.mock.drop('q2'); await w(4500); },
  'run-playlist': async w => { await api('/api/flow/open', { kind: 'playlist' }); await api('/api/playlist/start', { items: [{ gameId: 'motel', mode: 'short', difficulty: 'easy', minutes: 10 }, { gameId: 'motel', mode: 'standard', difficulty: 'normal', minutes: 10 }, { gameId: 'motel', mode: 'standard', difficulty: 'nightmare', minutes: 15 }], breakSec: 60, team: 'BIRTHDAY 9', headsetIds: ['q1', 'q2', 'q4', 'q5'], ignoreWarnings: true }); await w(6500); },
  'run-vote': async w => { await api('/api/flow/open', { kind: 'party' }); await api('/api/party/start', { games: ['motel', 'backroom'], maxGames: 3, voteSec: 30, breakSec: 30, team: 'PARTY 12', headsetIds: ['q1', 'q2', 'q4', 'q5'] }); await w(4000); },
  end: async w => { window.mock.scene('busy'); await w(6500); window.mock.finish(); await w(300); },
  'setup-entry': async () => { go('setup'); },
  'setup-venue': async () => { App.startSetup('first'); },
  'setup-usb': async w => { window.mock.usb(3); App.startSetup('add'); await w(200); },
  'setup-floor': async () => { App.startSetup('first'); W.step = 'floor'; W.ticks = new Set(['clear', 'light', 'marks']); },
  'setup-area': async () => { App.startSetup('first'); W.step = 'area'; },
  'setup-points': async w => { App.startSetup('points'); await w(200); await api('/api/setup/points', { headsetId: 'q1' }); W.firstId = 'q1'; await w(6000); await api('/api/setup/points', { sync: true }); await w(4200); },
  scorecards: async () => { go('scorecards/s1'); },
  settings: async () => { go('settings'); },
  diagnose: async () => { go('diagnose'); },
  menu: async w => { await w(200); const c = $('hrList').querySelector('[data-key="q2"]'); App.openMenu('q2', c.querySelector('.hs-more')); },
  status: async () => { App.openDrawer('status'); },
  help: async () => { App.openDrawer('help'); },
  advanced: async () => { setMode('advanced'); go('headsets'); },
  'advanced-calib': async () => { setMode('advanced'); go('calib'); },
});

// MS Games 2 · new session flow: a step strip Game → Mode → Players → Settings → Start (Quick Play),
// Games → Players → Settings → Start (Playlist and Party). Steps with a default can be skipped.
// Games that cannot run are dimmed and say why. Start runs the pre-start check first.

'use strict';

const STEPS = {
  quick: [['game', 'Game'], ['mode', 'Mode'], ['players', 'Players'], ['settings', 'Settings'], ['start', 'Start']],
  playlist: [['queue', 'Games'], ['players', 'Players'], ['settings', 'Settings'], ['start', 'Start']],
  party: [['vote', 'Games'], ['players', 'Players'], ['settings', 'Settings'], ['start', 'Start']],
};
const KIND_NAME = { quick: 'Quick Play', playlist: 'Playlist', party: 'Party' };
const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M4 12 12 4"/></svg>';
const UP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>';
const DOWN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';

const F = {
  kind: 'quick', step: 'game', gameId: null, mode: null, ids: null, names: {}, namesOn: false, team: '',
  difficulty: null, minutes: null, kids: false, options: {}, queue: [], breakSec: 60, allLevel: '',
  votable: null, maxGames: 3, voteSec: 20, partyBreak: 30, birthday: false,
  check: null, checking: false, busy: false, presets: [], checkedFor: '',
};
App.flow = F;

// ---------- games: what they need and why one cannot run ----------

const gameOf = id => (state.games || []).find(g => g.id === id) || null;
const modesOf = g => (g && Array.isArray(g.modes) && g.modes.length ? g.modes : []);
const cutsOf = g => (g && Array.isArray(g.cuts) && g.cuts.length ? g.cuts : [nOr0(g && g.minutes) || 10]);
const levelsOf = g => (g && Array.isArray(g.levels) && g.levels.length ? g.levels : LEVELS);

/** The play area in metres, from the settings, the setup or the last calibration. */
function areaNow() {
  const s = state.settings || {}, st = state.setup || {}, c = state.calibration;
  if (s.area && s.area.w) return s.area;
  if (st.area && st.area.w) return st.area;
  if (c && c.width) return { w: c.width, d: c.depth };
  return null;
}
const parseSize = k => { const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(k); return m ? [Number(m[1]), Number(m[2])] : null; };
const fits = (area, w, d) => !!area && ((area.w + 0.05 >= w && area.d + 0.05 >= d) || (area.w + 0.05 >= d && area.d + 0.05 >= w));

/** Players this game takes on this floor: [min, max], plus the smallest floor it needs. */
function playersOf(g) {
  const area = areaNow(), lo = Math.max(1, nOr0(g.minPlayers) || 1), hi = Math.max(lo, nOr0(g.maxPlayers) || 10);
  if (g.players && typeof g.players === 'object') {
    const rows = Object.entries(g.players).map(([k, v]) => ({ k, s: parseSize(k), v })).filter(r => r.s && Array.isArray(r.v)).sort((a, b) => a.s[0] * a.s[1] - b.s[0] * b.s[1]);
    const ok = rows.filter(r => fits(area, r.s[0], r.s[1]));
    const need = rows[0] ? rows[0].k : null;
    if (!area) return { lo, hi, need: null, unknown: true };
    if (!ok.length) return { lo, hi: 0, need };
    const best = ok[ok.length - 1];
    return { lo: best.v[0], hi: best.v[1], need };
  }
  if (Array.isArray(g.minArea) && area && !fits(area, g.minArea[0], g.minArea[1])) return { lo, hi: 0, need: `${g.minArea[0]}x${g.minArea[1]}` };
  return { lo, hi, need: null, unknown: !area };
}

function readyHeadsets() { return (state.headsets || []).filter(h => hsFree(h) && hsAligned(h)); }

/** Why this game cannot start now ('' when it can). */
function whyNot(g) {
  const gr = state.gameReasons;
  if (gr && Object.prototype.hasOwnProperty.call(gr, g.id)) return gr[g.id] || '';      // the server's line for the dimmed tile
  const r = state.run;
  if (g.status === 'soon') return 'Coming soon';
  if (runLive(r)) return r.gameId === g.id ? 'Already running' : 'A session is running';
  const pl = playersOf(g);
  if (pl.hi === 0) return `Play area too small (needs ${pl.need.replace('x', '×')})`;
  const online = (state.headsets || []).filter(h => h.online && !h.benched);
  if (!online.length) return 'No headset online';
  if (!online.some(hsAligned)) return 'Not calibrated';
  const ready = readyHeadsets().length;
  if (ready < pl.lo) return `Needs ${pl.lo}+ headsets`;
  return '';
}
App.whyNot = whyNot;

function playersText2(g) { const p = playersOf(g); if (p.hi === 0) { const hi = Math.max(p.lo, nOr0(g.maxPlayers) || p.lo); return p.lo === hi ? `${p.lo}` : `${p.lo}–${hi}`; } return p.lo === p.hi ? `${p.lo}` : `${p.lo}–${p.hi}`; }
function minutesText(g) { const c = cutsOf(g); return c.length > 1 ? `${c.slice(0, -1).join(', ')} or ${c[c.length - 1]}` : `${c[0]}`; }

// ---------- open and leave ----------

App.openFlow = async function (kind) {
  if (runOpen(state && state.run) && !['results', 'ended'].includes(state.run.state)) return go('run');
  Object.assign(F, {
    kind, step: STEPS[kind][0][0], gameId: null, mode: null, ids: null, names: {}, namesOn: false, team: '',
    difficulty: (state.settings && state.settings.difficulty) || 'normal', minutes: null, kids: false, options: {},
    queue: [], allLevel: '', votable: null, check: null, checking: false, busy: false, checkedFor: '',
  });
  if (kind === 'party') F.votable = new Set(App.playableGames().map(g => g.id));
  const only = App.playableGames();
  if (kind === 'quick' && only.length === 1) {      // one game: it is chosen already, the flow starts at its mode or players
    F.gameId = only[0].id;
    const ms = modesOf(only[0]);
    F.mode = (ms.find(m => m.recommended) || ms[0] || {}).id || null;
    F.step = ms.length > 1 ? 'mode' : 'players';
  }
  go('flow');
  api('/api/flow/open', { kind }, { quiet: true });      // every headset goes to the waiting room now
  if (kind === 'playlist') loadPresets();
};
App.onGo.flow = () => { if (!F.kind) F.kind = 'quick'; };

async function leaveFlow() {
  go('home');
  await api('/api/flow/close', {}, { quiet: true });
}

// ---------- steps ----------

function stepsNow() {
  return STEPS[F.kind].map(([id, name]) => {
    let skip = false;
    let fixed = false;
    if (id === 'mode') skip = modesOf(gameOf(F.gameId)).length <= 1;
    if (id === 'game' && App.playableGames().length === 1) { skip = true; fixed = true; }
    return { id, name, skip, fixed };
  });
}
function stepIdx(id) { return stepsNow().findIndex(s => s.id === id); }
function stepDone(id) {
  if (id === 'game') return !!F.gameId;
  if (id === 'mode') return !!F.mode || modesOf(gameOf(F.gameId)).length <= 1;
  if (id === 'queue') return F.queue.length > 0;
  if (id === 'vote') return !!F.votable && F.votable.size > 0;
  if (id === 'players') return chosen().length > 0 && !playersWhy();
  if (id === 'settings') return true;
  return false;
}
function stepNote(id) {
  const g = gameOf(F.gameId);
  if (id === 'game') return g ? g.name : '';
  if (id === 'mode') { const m = modesOf(g).find(x => x.id === F.mode); return m ? m.name : ''; }
  if (id === 'queue') return F.queue.length ? plural(F.queue.length, 'game', 'games') : '';
  if (id === 'vote') return F.votable && F.votable.size ? plural(F.votable.size, 'game', 'games') : '';
  if (id === 'players') { const n = chosen().length; return n ? plural(n, 'headset', 'headsets') : ''; }
  if (id === 'settings') return F.kind === 'quick' ? [levelName(F.difficulty), F.minutes ? `${F.minutes} min` : ''].filter(Boolean).join(', ') : levelName(F.difficulty);
  return '';
}

function goStep(id) {
  F.step = id;
  api('/api/flow/step', { step: id }, { quiet: true });      // the server keeps the step too (S2)
  if (id === 'mode' && !F.mode) { const ms = modesOf(gameOf(F.gameId)); F.mode = (ms.find(m => m.recommended) || ms[0] || {}).id || null; }
  if (id === 'settings' && F.kind === 'quick') ensureSettings();
  if (id === 'start') runCheck();
  $('flowBody').scrollTop = 0;
  scheduleRender();
}
function nextStep() {
  const list = stepsNow(), i = list.findIndex(s => s.id === F.step);
  for (let j = i + 1; j < list.length; j++) if (!list[j].skip) return goStep(list[j].id);
}
function prevStep() {
  const list = stepsNow(), i = list.findIndex(s => s.id === F.step);
  for (let j = i - 1; j >= 0; j--) if (!list[j].skip) return goStep(list[j].id);
  leaveFlow();
}

function ensureSettings() {
  const g = gameOf(F.gameId);
  if (!g) return;
  const cuts = cutsOf(g);
  if (!cuts.includes(F.minutes)) F.minutes = cuts[0];
  const lv = levelsOf(g);
  if (!lv.some(l => l.id === F.difficulty)) F.difficulty = (lv.find(l => l.id === 'normal') || lv[0]).id;
  for (const o of g.options || []) if (!(o.id in F.options)) F.options[o.id] = o.default;
}

// ---------- players ----------

function poolHs() { return [...(state.headsets || [])].sort(byNumber); }
function defaultIds() { return readyHeadsets().map(h => h.id); }
function chosen() {
  const ids = F.ids || new Set(defaultIds());
  return poolHs().filter(h => ids.has(h.id) && h.online && !h.benched);
}
function limitsNow() {
  if (F.kind === 'quick') { const g = gameOf(F.gameId); return g ? playersOf(g) : { lo: 1, hi: 10 }; }
  const ids = F.kind === 'playlist' ? F.queue.map(q => q.gameId) : [...(F.votable || [])];
  const ps = ids.map(gameOf).filter(Boolean).map(playersOf);
  if (!ps.length) return { lo: 1, hi: 10 };
  return { lo: Math.max(...ps.map(p => p.lo)), hi: Math.min(...ps.map(p => (p.hi === 0 ? 0 : p.hi))) };
}
function playersWhy() {
  const n = chosen().length, l = limitsNow();
  if (!n) return 'Pick at least one headset.';
  if (l.hi && n > l.hi) return `Up to ${l.hi} players on this play area. ${n} are chosen.`;
  if (n < l.lo) return `This needs at least ${l.lo} players.`;
  return '';
}

// ---------- pre-start check ----------

async function runCheck() {
  const ids = chosen().map(h => h.id);
  const gid = F.kind === 'quick' ? F.gameId : F.kind === 'playlist' ? (F.queue[0] || {}).gameId : [...(F.votable || [])][0];
  const key = `${gid}|${ids.join(',')}`;
  F.checking = true; F.checkedFor = key;
  scheduleRender();
  const r = await api(`/api/precheck?gameId=${encodeURIComponent(gid || '')}&headsetIds=${ids.map(encodeURIComponent).join(',')}`, undefined, { quiet: true });
  if (F.checkedFor !== key) return;
  F.checking = false;
  F.check = r.ok ? r.data : r.status === 404 ? localCheck(ids) : { items: [], failed: true };
  scheduleRender();
}
/** Until the server has /api/precheck: the same checks from the state the console already has. */
function localCheck(ids) {
  const items = [];
  for (const id of ids) {
    const h = (state.headsets || []).find(x => x.id === id);
    if (!h) continue;
    if (!h.online) { items.push({ headsetId: id, level: 'error', code: 'offline', text: 'Offline' }); continue; }
    if (typeof h.battery === 'number' && h.battery < 20 && !h.charging) items.push({ headsetId: id, level: 'warn', code: 'battery', text: `Headset battery ${Math.round(h.battery)} %` });
    const c = h.controllers || {};
    for (const s of ['left', 'right']) if (typeof c[s] === 'number' && c[s] < 20) items.push({ headsetId: id, level: 'warn', code: `ctrl_${s}`, text: `${s === 'left' ? 'Left' : 'Right'} controller ${Math.round(c[s])} %` });
    if (!hsAligned(h)) items.push({ headsetId: id, level: 'error', code: 'calibration', text: 'Not calibrated', fix: 'recalibrate' });
    if (h.web && !h.desk && h.inVR === false) items.push({ headsetId: id, level: 'warn', code: 'not_in_vr', text: 'Page loaded, not in VR yet', fix: 'reload' });
    if (h.anchor === 'lost') items.push({ headsetId: id, level: 'warn', code: 'tracking', text: 'Tracking lost', fix: 'recalibrate' });
  }
  return { ok: !items.length, items, local: true };
}

async function startNow(ignoreWarnings) {
  if (F.busy) return;
  const ids = chosen().map(h => h.id);
  const names = F.namesOn ? Object.fromEntries(ids.filter(id => (F.names[id] || '').trim()).map(id => [id, F.names[id].trim()])) : undefined;
  const team = F.team.replace(/\s+/g, ' ').trim() || undefined;
  F.busy = true; scheduleRender();
  let r;
  if (F.kind === 'quick') {
    const body = { gameId: F.gameId, mode: F.mode || undefined, difficulty: F.difficulty, minutes: F.minutes, kids: !!F.kids, options: F.options, headsetIds: ids, team, names, ignoreWarnings: !!ignoreWarnings };
    r = await api('/api/session/start', body, { quiet: true });
    if (r.status === 404) {      // old server: the old launch route still works
      r = await api('/api/launch', { gameId: F.gameId, headsetIds: ids, difficulty: F.difficulty, theme: F.kids ? 'kids' : 'night', team }, { quiet: true });
    }
  } else if (F.kind === 'playlist') {
    const items = F.queue.map(q => ({ gameId: q.gameId, mode: q.mode, difficulty: F.allLevel || q.difficulty, minutes: q.minutes, options: q.options || {} }));
    r = await api('/api/playlist/start', { items, breakSec: F.breakSec, difficulty: F.allLevel || undefined, team, names, headsetIds: ids, kids: !!F.kids, ignoreWarnings: !!ignoreWarnings }, { quiet: true });
  } else {
    r = await api('/api/party/start', { games: [...F.votable], maxGames: F.maxGames, voteSec: F.voteSec, breakSec: F.partyBreak, birthday: !!F.birthday, team, headsetIds: ids, difficulty: F.difficulty, kids: !!F.kids, ignoreWarnings: !!ignoreWarnings }, { quiet: true });
  }
  F.busy = false;
  if (r.ok) {
    LS.set('msg.lastGroup', JSON.stringify(ids));
    App.awaitRun = Date.now();
    go('run');
    return;
  }
  if (r.data && r.data.code === 'precheck') { F.check = { items: r.data.items || [] }; toast('The pre-start check found problems', 'warn'); }
  else if (r.status === 409 && r.data.precheck) { F.check = r.data.precheck; toast('The pre-start check found problems', 'warn'); }
  else toast(r.data.error || (r.status === 404 ? 'The server does not have this yet. Update MS Games.' : 'The game did not start'), 'error');
  scheduleRender();
}

async function loadPresets() {
  const r = await api('/api/playlist/presets', undefined, { quiet: true });
  F.presets = r.ok ? r.data.presets || [] : [];
  scheduleRender();
}

// ---------- drawing ----------

function renderFlow() {
  const list = stepsNow(), cur = F.step, ci = list.findIndex(s => s.id === cur);
  text($('flowKind'), KIND_NAME[F.kind]);
  syncList($('strip'), list, s => s.id, () => make('<li><button type="button"><b data-f="n"></b><span data-f="name"></span><small data-f="note"></small></button></li>'), (li, s) => {
    const p = parts(li), i = list.indexOf(s);
    text(p.n, i + 1);
    text(p.name, s.name);
    const note = s.fixed ? stepNote(s.id) : s.skip ? '' : i < ci ? stepNote(s.id) : '';
    text(p.note, note);
    show(p.note, !!note);
    const st = s.fixed ? 'done' : s.skip ? 'skip' : s.id === cur ? 'now' : i < ci ? 'done' : 'todo';
    attr(li, 'data-s', st);
    // a later step can be opened only when every step before it is done
    const reach = !s.skip && (i < ci || list.slice(0, i).every(x => x.skip || stepDone(x.id)));
    li.firstChild.disabled = !reach || s.id === cur;
  });
  for (const p of $('flowBody').querySelectorAll('.pane')) show(p, p.dataset.step === cur);
  if (cur === 'game') renderGameStep();
  else if (cur === 'queue') renderQueueStep();
  else if (cur === 'vote') renderVoteStep();
  else if (cur === 'mode') renderModeStep();
  else if (cur === 'players') renderPlayersStep();
  else if (cur === 'settings') renderSettingsStep();
  else if (cur === 'start') renderStartStep();
  renderFoot();
}
App.views.flow = renderFlow;

function renderFoot() {
  const cur = F.step, last = cur === 'start';
  let why = '', tone = null, can = true;
  if (cur === 'game') { can = !!F.gameId && !whyNot(gameOf(F.gameId)); why = F.gameId ? '' : 'Tap a game.'; }
  if (cur === 'queue') { can = F.queue.length > 0; why = can ? '' : 'Add at least one game.'; }
  if (cur === 'vote') { can = !!F.votable && F.votable.size > 0; why = can ? '' : 'Pick at least one game.'; }
  if (cur === 'players') { why = playersWhy(); can = !why; tone = why ? 'warn' : null; }
  const items = (F.check && F.check.items) || [];
  const flagged = last && items.length > 0;
  if (last) {
    if (F.checking) { why = 'Checking the headsets'; can = false; }
    else if (flagged) { const e = items.filter(i => i.level === 'error').length; why = `${plural(items.length, 'problem', 'problems')} found${e ? ', fix them or start anyway' : ''}`; tone = e ? 'bad' : 'warn'; }
    else if (F.check && F.check.failed) { why = 'The check did not answer. You can still start.'; tone = 'warn'; }
  }
  text($('flowWhy'), why);
  attr($('flowWhy'), 'data-tone', tone);
  const next = $('flowNext');
  text(next, last ? (flagged ? 'Check again' : F.busy ? 'Starting' : 'Start') : 'Next');
  next.disabled = !can || F.busy;
  show($('flowAnyway'), flagged && !F.checking);
  $('flowAnyway').disabled = F.busy;
  text($('flowBack'), (stepsNow().find(s => !s.skip) || {}).id === cur ? 'Home' : 'Back');
}

function coverInto(cov, g) {
  paintCover(cov, parts(cov).type, g);
}
const COVER = '<span class="cover" data-f="cover"><span class="cover-type" data-f="type"></span></span>';

function gameCard(cls = '') {
  return make(`<button type="button" class="gcard ${cls}">${COVER}<span class="gcard-badge" data-f="badge" hidden></span><span class="gcard-add" data-f="add" hidden>Add</span>
    <span class="gcard-name" data-f="name"></span>
    <span class="gcard-meta"><span><b data-f="pl"></b>players</span><span><b data-f="min"></b>min</span></span>
    <span class="gcard-tags" data-f="tags"></span>
    <span class="gcard-why" data-f="whyBox" hidden>${LOCK}<span data-f="why"></span></span></button>`);
}
function paintGameCard(el, g, why) {
  const p = parts(el);
  const cov = p.cover;
  if (!cov._p) cov._p = { type: p.type };
  paintCover(cov, p.type, g);
  text(p.name, g.name);
  text(p.pl, playersText2(g));
  text(p.min, minutesText(g));
  text(p.tags, (g.tags || []).slice(0, 4).join(' · '));
  show(p.whyBox, !!why);
  text(p.why, why || '');
  el.classList.toggle('no', !!why);
  attr(el, 'aria-disabled', why ? 'true' : null);
}

function renderGameStep() {
  const games = (state.games || []).filter(g => g.web !== false);
  const ready = readyHeadsets().length, area = areaNow();
  text($('gameSub'), `${plural(ready, 'headset is', 'headsets are')} ready${area ? ` · play area ${App.fmtArea(area)}` : ''}. A dimmed game says why it cannot start.`);
  syncList($('gameGrid'), games, g => g.id, () => gameCard(), (el, g) => {
    paintGameCard(el, g, whyNot(g));
    el.classList.toggle('on', g.id === F.gameId);
  });
}

function renderModeStep() {
  const g = gameOf(F.gameId);
  text($('modeTitle'), g ? `${g.name}: mode` : 'Mode');
  text($('modeSub'), 'One line each. The recommended one is chosen already.');
  syncList($('modeList'), modesOf(g), m => m.id, () => make('<button type="button" class="mcard"><em data-f="rec" hidden>Recommended</em><b data-f="name"></b><span data-f="d"></span></button>'), (el, m) => {
    const p = parts(el);
    text(p.name, m.name);
    text(p.d, m.description || '');
    show(p.rec, !!m.recommended);
    el.classList.toggle('on', m.id === F.mode);
  });
}

function renderPlayersStep() {
  const hs = poolHs(), ids = F.ids || new Set(defaultIds()), l = limitsNow();
  text($('playersSub'), `${chosen().length} chosen${l.hi ? `, up to ${l.hi} on this play area` : ''}. Untick a headset to leave it in the waiting room.`);
  const team = $('flowTeam');
  if (document.activeElement !== team && team.value !== F.team) team.value = F.team;
  $('flowNamesOn').checked = F.namesOn;
  let last = [];
  try { last = JSON.parse(LS.get('msg.lastGroup', '[]')); } catch { last = []; }
  $('sameGroup').disabled = !last.some(id => hs.some(h => h.id === id && h.online));
  syncList($('playerRows'), hs, h => h.id, () => make(`
    <label class="prow">
      <input type="checkbox" data-f="box" data-prow>
      <span class="hsq" data-f="sq"></span>
      <span class="prow-main"><span class="prow-name" data-f="name"></span><span class="hs-state" data-f="st"><i></i><span data-f="word"></span></span></span>
      <input class="input input-lg prow-pname" data-f="pname" data-pname type="text" maxlength="16" placeholder="Player name" autocomplete="off" spellcheck="false">
      <span class="prow-batt" data-f="batt"></span>
    </label>`), (el, h) => {
    const p = parts(el), w = hsWord(h);
    const can = h.online && !h.benched;
    paintSq(p.sq, h);
    text(p.name, h.name);
    attr(p.st, 'data-s', w.s);
    text(p.word, w.w);
    p.box.disabled = !can;
    p.box.checked = can && ids.has(h.id);
    el.classList.toggle('no', !can);
    el.classList.toggle('out', can && !ids.has(h.id));
    show(p.pname, F.namesOn && can);
    if (document.activeElement !== p.pname && p.pname.value !== (F.names[h.id] || '')) p.pname.value = F.names[h.id] || '';
    const c = h.controllers || {};
    const b = h.online ? `<span ${h.battery < 20 && !h.charging ? 'data-low' : ''}>H <b>${Math.round(nOr0(h.battery))}</b></span><span ${c.left < 20 ? 'data-low' : ''}>L <b>${c.left == null ? '-' : Math.round(c.left)}</b></span><span ${c.right < 20 ? 'data-low' : ''}>R <b>${c.right == null ? '-' : Math.round(c.right)}</b></span>` : '';
    if (p.batt._h !== b) { p.batt._h = b; p.batt.innerHTML = b; }
  });
}

function seg(items, on, attrName) {
  return `<div class="seg seg-lg" ${attrName}>${items.map(i => `<button type="button" data-v="${esc(i.id)}" class="${String(i.id) === String(on) ? 'on' : ''}">${esc(i.name)}</button>`).join('')}</div>`;
}
function stepper(id, v, min, max, step, unit = '') {
  return `<span class="stepper-lg" data-stepper="${id}" data-min="${min}" data-max="${max}" data-step="${step}"><button type="button" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="Less">−</button><span>${esc(v)}${unit}</span><button type="button" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="More">+</button></span>`;
}
function setRow(k, hint, control) { return `<div class="set"><div class="set-k"><b>${esc(k)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div><div class="set-v">${control}</div></div>`; }
function toggleHtml(id, on) { return `<label class="toggle toggle-lg"><input type="checkbox" data-set="${id}" ${on ? 'checked' : ''}><i></i><span>${on ? 'On' : 'Off'}</span></label>`; }

function renderSettingsStep() {
  let html = '';
  if (F.kind === 'quick') {
    const g = gameOf(F.gameId);
    ensureSettings();
    text($('setSub'), g ? `${g.name}. Change only what this group needs.` : '');
    html += setRow('Difficulty', 'You can change it while the game runs', seg(levelsOf(g), F.difficulty, 'data-seg="difficulty"'));
    const cuts = cutsOf(g);
    html += setRow('Length', cuts.length > 1 ? 'The game ends itself at this time' : 'This game has one length', seg(cuts.map(c => ({ id: c, name: `${c} min` })), F.minutes, 'data-seg="minutes"'));
    html += setRow('Kids mode', 'No blood, softer sounds', toggleHtml('kids', F.kids));
    html += setRow('Language', 'More languages later', '<select class="select input-lg" disabled><option>English</option></select>');
    for (const o of (g && g.options) || []) {
      const v = F.options[o.id];
      if (o.type === 'bool') html += setRow(o.name, o.description || '', toggleHtml(`opt:${o.id}`, !!v));
      else if (o.type === 'enum') html += setRow(o.name, o.description || '', seg((o.values || []).map(x => ({ id: x, name: x })), v, `data-seg="opt:${esc(o.id)}"`));
      else if (o.type === 'range') html += setRow(o.name, o.description || '', stepper(`opt:${o.id}`, nOr0(v), nOr0(o.min), nOr0(o.max) || 99, nOr0(o.step) || (nOr0(o.max) - nOr0(o.min) > 20 ? 5 : 1)));
    }
  } else if (F.kind === 'playlist') {
    text($('setSub'), 'For the whole playlist.');
    html += setRow('Break between games', 'Time in the waiting room', stepper('breakSec', F.breakSec, 0, 300, 15, ' s'));
    html += setRow('Difficulty', 'One for all games, or each game its own', seg([{ id: '', name: 'Per game' }, ...LEVELS], F.allLevel, 'data-seg="allLevel"'));
    html += setRow('Kids mode', 'No blood, softer sounds', toggleHtml('kids', F.kids));
    const total = F.queue.reduce((a, q) => a + nOr0(q.minutes), 0) + Math.max(0, F.queue.length - 1) * F.breakSec / 60;
    html += setRow('Total time', '', `<b class="num" style="font:700 26px/1 var(--font-num)">${Math.round(total)} min</b>`);
  } else {
    text($('setSub'), 'Players vote in the waiting room before every game.');
    html += setRow('Games in the party', 'It ends after this many games', stepper('maxGames', F.maxGames, 1, 20, 1));
    html += setRow('Time to vote', 'With no vote the next unplayed game is chosen', stepper('voteSec', F.voteSec, 10, 60, 5, ' s'));
    html += setRow('Break between games', 'Time in the waiting room after the results', stepper('partyBreak', F.partyBreak, 20, 120, 10, ' s'));
    html += setRow('Difficulty', '', seg(LEVELS, F.difficulty, 'data-seg="difficulty"'));
    html += setRow('Birthday', 'Balloons and a birthday sign in the waiting room', toggleHtml('birthday', F.birthday));
    html += setRow('Kids mode', 'No blood, softer sounds', toggleHtml('kids', F.kids));
  }
  const el = $('setList');
  if (el._h !== html) { el._h = html; el.innerHTML = html; }
}

function renderStartStep() {
  const g = gameOf(F.gameId), ids = chosen();
  const cov = $('startCover');
  const sig = `${F.kind}|${F.gameId}|${F.queue.map(q => q.gameId).join(',')}`;
  if (cov._sig !== sig) {
    cov._sig = sig;
    cov.textContent = '';
    if (F.kind === 'quick' && g) { const c = make(COVER); cov.append(c); paintCover(c, c.querySelector('.cover-type'), g); }
  }
  const facts = [];
  if (F.kind === 'quick') {
    facts.push(['Game', g ? g.name : '']);
    const m = modesOf(g).find(x => x.id === F.mode); if (m && modesOf(g).length > 1) facts.push(['Mode', m.name]);
    facts.push(['Difficulty', levelName(F.difficulty)], ['Length', `${F.minutes} min`]);
    if (F.kids) facts.push(['Kids mode', 'On']);
  } else if (F.kind === 'playlist') {
    facts.push(['Games', F.queue.map(q => (gameOf(q.gameId) || {}).name).join(', ')]);
    facts.push(['Breaks', `${F.breakSec} s`], ['Difficulty', F.allLevel ? levelName(F.allLevel) : 'Per game']);
  } else {
    facts.push(['Vote between', [...F.votable].map(id => (gameOf(id) || {}).name).join(', ')], ['Games', String(F.maxGames)], ['Vote', `${F.voteSec} s`]);
    if (F.birthday) facts.push(['Birthday', 'On']);
  }
  facts.push(['Players', ids.map(h => (F.namesOn && F.names[h.id]) || h.name).join(', ')]);
  if (F.team.trim()) facts.push(['Team', F.team.trim()]);
  syncList($('startFacts'), facts.flatMap(([k, v], i) => [{ key: `k${i}`, tag: 'dt', v: k }, { key: `v${i}`, tag: 'dd', v }]), r => r.key, r => document.createElement(r.tag), (el, r) => text(el, r.v));

  const items = (F.check && F.check.items) || [];
  text($('checkState'), F.checking ? 'checking' : F.check ? (F.check.local ? 'from the console' : '') : '');
  const by = new Map();
  for (const it of items) { const k = it.headsetId || '_arena'; if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
  const rows = [...by.entries()].map(([id, list]) => ({ id, list, h: (state.headsets || []).find(x => x.id === id) }));
  syncList($('checkList'), rows, r => r.id, () => make('<div class="crow"><span class="hsq" data-f="sq"></span><div class="crow-items" data-f="items"></div><span class="btn-row" data-f="fix"></span></div>'), (el, r) => {
    const p = parts(el);
    if (r.h) paintSq(p.sq, r.h); else { p.sq.textContent = ''; p.sq.className = 'hsq off'; }
    const html = `<b>${esc(r.h ? r.h.name : r.id === '_arena' ? 'Arena' : r.id)}</b>` + r.list.map(i => `<span data-level="${i.level}">${esc(i.text)}</span>`).join('');
    if (p.items._h !== html) { p.items._h = html; p.items.innerHTML = html; }
    const fixes = [...new Set(r.list.map(i => i.fix).filter(Boolean))];
    if (r.id === '_arena' && r.list.some(i => i.code === 'area')) fixes.push('area');
    const FIXN = { recalibrate: 'Recalibrate', reload: 'Reload page', area: 'Set the play area', points: 'Calibrate points' };
    const fh = fixes.map(f => `<button type="button" class="btn" data-fix="${esc(f)}">${FIXN[f] || 'Fix'}</button>`).join('') + (r.h ? `<button type="button" class="btn btn-quiet" data-drop>Leave out</button>` : '');
    if (p.fix._h !== fh) { p.fix._h = fh; p.fix.innerHTML = fh; }
  });
  show($('checkOk'), !F.checking && !!F.check && !items.length && !F.check.failed);
}

// ---------- playlist builder ----------

function renderQueueStep() {
  const games = App.playableGames();
  syncList($('queueGrid'), games, g => g.id, () => gameCard('gcard-q'), (el, g) => {
    const why = whyNot(g);
    paintGameCard(el, g, why === 'A session is running' || why === 'Already running' ? why : (playersOf(g).hi === 0 ? why : ''));
    const n = F.queue.filter(q => q.gameId === g.id).length, p = parts(el);
    show(p.badge, n > 0); text(p.badge, n ? `${n}` : '');
    show(p.add, true);
  });
  const total = F.queue.reduce((a, q) => a + nOr0(q.minutes), 0) + Math.max(0, F.queue.length - 1) * F.breakSec / 60;
  text($('queueTotal'), F.queue.length ? `${Math.round(total)} min with breaks` : '');
  show($('queueEmpty'), !F.queue.length);
  F.queue.forEach((q, i) => { if (!q.key) q.key = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`; });
  syncList($('queueList'), F.queue, q => q.key, () => make(`<li class="qitem"><span class="qitem-name" data-f="name"></span>
    <span class="qitem-ctl"><button type="button" data-q="up" aria-label="Earlier">${UP}</button><button type="button" data-q="down" aria-label="Later">${DOWN}</button><button type="button" data-q="rm" aria-label="Remove">${CROSS}</button></span>
    <span class="qitem-opts"><select class="select" data-qset="mode" data-f="mode"></select><select class="select" data-qset="minutes" data-f="min"></select><select class="select" data-qset="difficulty" data-f="lvl"></select></span></li>`), (el, q) => {
    const p = parts(el), g = gameOf(q.gameId);
    text(p.name, g ? g.name : q.gameId);
    fillSelect(p.mode, modesOf(g).map(m => [m.id, m.name]), q.mode);
    show(p.mode, modesOf(g).length > 1);
    fillSelect(p.min, cutsOf(g).map(c => [c, `${c} min`]), q.minutes);
    fillSelect(p.lvl, levelsOf(g).map(l => [l.id, l.name]), q.difficulty);
    p.lvl.disabled = !!F.allLevel;
  });
  syncList($('presetList'), F.presets, pr => pr.name, () => make('<span class="preset"><button type="button" data-preset data-f="name"></button><button type="button" data-preset-rm data-confirm="Delete?" aria-label="Delete">×</button></span>'), (el, pr) => text(parts(el).name, pr.name));
  $('presetSave').disabled = !F.queue.length;
}
function fillSelect(sel, opts, v) {
  const sig = JSON.stringify(opts);
  if (sel._sig !== sig) { sel._sig = sig; sel.innerHTML = opts.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(''); }
  if (document.activeElement !== sel && sel.value !== String(v)) sel.value = String(v);
}

function renderVoteStep() {
  const games = App.playableGames();
  syncList($('voteGrid'), games, g => g.id, () => gameCard(), (el, g) => {
    const why = playersOf(g).hi === 0 ? whyNot(g) : '';
    paintGameCard(el, g, why);
    el.classList.toggle('on', !!F.votable && F.votable.has(g.id));
  });
}

// ---------- input ----------

$('flowBody').addEventListener('click', e => {
  const t = e.target;
  const card = t.closest('.gcard');
  if (card && !card.classList.contains('no')) {
    const id = card.dataset.key;
    if (F.step === 'game') {
      if (F.gameId !== id) { F.gameId = id; F.mode = null; F.options = {}; F.minutes = null; F.check = null; }
      const ms = modesOf(gameOf(id));
      F.mode = (ms.find(m => m.recommended) || ms[0] || {}).id || null;
      return nextStep();      // Hero's three taps: Quick Play, cover, Start
    }
    if (F.step === 'queue') {
      const g = gameOf(id), ms = modesOf(g);
      F.queue.push({ gameId: id, mode: (ms.find(m => m.recommended) || ms[0] || {}).id || null, minutes: cutsOf(g)[0], difficulty: F.difficulty || 'normal', options: {} });
      return scheduleRender();
    }
    if (F.step === 'vote') { if (F.votable.has(id)) F.votable.delete(id); else F.votable.add(id); return scheduleRender(); }
  }
  const mc = t.closest('.mcard');
  if (mc) { F.mode = mc.dataset.key; return nextStep(); }
  const sb = t.closest('[data-seg] button');
  if (sb) {
    const k = sb.parentElement.dataset.seg, v = sb.dataset.v;
    if (k === 'minutes') F.minutes = Number(v);
    else if (k.startsWith('opt:')) F.options[k.slice(4)] = v;
    else F[k] = v;
    return scheduleRender();
  }
  const st = t.closest('[data-stepper] button');
  if (st) {
    const box = st.parentElement, k = box.dataset.stepper, step = Number(box.dataset.step), min = Number(box.dataset.min), max = Number(box.dataset.max);
    const cur = k.startsWith('opt:') ? nOr0(F.options[k.slice(4)]) : nOr0(F[k]);
    const v = clamp(cur + Number(st.dataset.d) * step, min, max);
    if (k.startsWith('opt:')) F.options[k.slice(4)] = v; else F[k] = v;
    return scheduleRender();
  }
  const q = t.closest('[data-q]');
  if (q) {
    const i = F.queue.findIndex(x => x.key === q.closest('[data-key]').dataset.key);
    if (i < 0) return;
    if (q.dataset.q === 'rm') F.queue.splice(i, 1);
    else { const j = q.dataset.q === 'up' ? i - 1 : i + 1; if (j >= 0 && j < F.queue.length) [F.queue[i], F.queue[j]] = [F.queue[j], F.queue[i]]; }
    return scheduleRender();
  }
  const pr = t.closest('[data-preset]');
  if (pr) {
    const p = F.presets.find(x => x.name === pr.closest('[data-key]').dataset.key);
    if (p) { F.queue = (p.items || []).map(i => ({ ...i, key: null })); if (p.breakSec != null) F.breakSec = p.breakSec; if (p.names != null) F.namesOn = !!p.names; F.allLevel = p.difficulty || ''; $('presetName').value = p.name; toast(`Loaded ${p.name}`); }
    return scheduleRender();
  }
  const prm = t.closest('[data-preset-rm]');
  if (prm) return twoStep(prm, async () => { const name = prm.closest('[data-key]').dataset.key; const r = await api('/api/playlist/presets', { remove: name }); if (r.ok) F.presets = r.data.presets || F.presets.filter(x => x.name !== name); scheduleRender(); });
  const fix = t.closest('[data-fix]');
  if (fix) {
    const id = fix.closest('[data-key]').dataset.key, f = fix.dataset.fix;
    if (f === 'area' || f === 'points') return App.startSetup(f);
    App.hsAction(id, f === 'reload' ? 'reload' : 'recalibrate').then(ok => { if (ok) { toast(f === 'reload' ? 'Reloading the page in the headset' : 'Touch marks A and B in the headset'); setTimeout(runCheck, 2500); } });
    return;
  }
  const drop = t.closest('[data-drop]');
  if (drop) {
    const id = drop.closest('[data-key]').dataset.key;
    if (!F.ids) F.ids = new Set(defaultIds());
    F.ids.delete(id);
    runCheck();
  }
});

$('flowBody').addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-prow]')) {
    const id = t.closest('[data-key]').dataset.key;
    if (!F.ids) F.ids = new Set(defaultIds());
    if (t.checked) F.ids.add(id); else F.ids.delete(id);
    return scheduleRender();
  }
  if (t.id === 'flowNamesOn') { F.namesOn = t.checked; return scheduleRender(); }
  if (t.matches('[data-set]')) {
    const k = t.dataset.set;
    if (k.startsWith('opt:')) F.options[k.slice(4)] = t.checked; else F[k] = t.checked;
    return scheduleRender();
  }
  if (t.matches('[data-qset]')) {
    const q = F.queue.find(x => x.key === t.closest('[data-key]').dataset.key);
    if (q) q[t.dataset.qset] = t.dataset.qset === 'minutes' ? Number(t.value) : t.value;
    return scheduleRender();
  }
});
$('flowBody').addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'flowTeam') F.team = t.value;
  if (t.matches('[data-pname]')) F.names[t.closest('[data-key]').dataset.key] = t.value;
});
$('flowBody').addEventListener('click', e => { if (e.target.matches('[data-pname]')) e.preventDefault(); }, true);      // typing a name must not untick the row

$('strip').addEventListener('click', e => { const li = e.target.closest('li'); if (li && !li.firstChild.disabled) goStep(li.dataset.key); });
$('flowNext').onclick = () => { if (F.step === 'start') return (F.check && (F.check.items || []).length) ? runCheck() : startNow(false); nextStep(); };
$('flowAnyway').onclick = () => startNow(true);
$('flowBack').onclick = prevStep;
$('flowExit').onclick = leaveFlow;
$('sameGroup').onclick = () => { try { F.ids = new Set(JSON.parse(LS.get('msg.lastGroup', '[]'))); } catch { /* none */ } scheduleRender(); };
$('allReady').onclick = () => { F.ids = null; scheduleRender(); };
$('presetSave').onclick = async () => {
  const name = $('presetName').value.trim() || `Playlist ${F.presets.length + 1}`;
  const r = await api('/api/playlist/presets', { name, items: F.queue.map(({ key, ...q }) => q), breakSec: F.breakSec, difficulty: F.allLevel || undefined, names: F.namesOn });
  if (r.ok) { F.presets = r.data.presets || [...F.presets.filter(p => p.name !== name), { name, items: F.queue }]; toast(`Saved ${name}`, 'ok'); scheduleRender(); }
};

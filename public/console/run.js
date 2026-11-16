// MS Games 2 · the running view (replaces Home while a session runs) and the end view.
// Clock with scope, live controls, the queue of a playlist or party, auto-pause banner,
// per-player state and score; then results, new record, scorecard, print and end messages.
// Run states (S2, lib/session.js): waiting (break or vote) · countdown · loading · playing ⇄ paused · results.
// When a run is over the server keeps it as `last`; the end view shows it until the operator closes it.

'use strict';

const COL_NAMES = { score: 'Score', kills: 'Kills', deaths: 'Deaths', orders: 'Orders', tips: 'Tips', mistakes: 'Mistakes', time: 'Time', boards: 'Boards' };
const colName = c => COL_NAMES[c] || (c ? c[0].toUpperCase() + c.slice(1) : '');
const colVal = (p, c) => (c in p ? p[c] : p.extra && c in p.extra ? p.extra[c] : '');
const fmtNum = v => (typeof v === 'number' ? fmtScore(v) : String(v ?? ''));
const KIND_LABEL = { quick: 'Quick Play', playlist: 'Playlist', party: 'Party' };
let endSent = '';

function columnsOf(gameId, res) {
  const g = gameById(gameId);
  const cols = (res && res.columns) || (g && g.scorecard && g.scorecard.columns) || ['score', 'kills', 'deaths'];
  return cols.slice(0, 4);
}

/** What the end view shows: a run in its results, or the last finished run. */
function endSource() {
  const r = state.run;
  if (r && r.state === 'results') return { live: true, kind: r.kind, results: r.results, team: r.team, gameId: r.gameId, gameName: r.gameName, final: isFinal(r), run: r };
  if (!r && App.endPending()) {
    const l = state.last, res = l.results || null, hist = l.history || [];
    const lastH = hist[hist.length - 1] || {};
    return { live: false, kind: l.kind, results: res, team: l.team, gameId: (res && res.gameId) || lastH.gameId, gameName: (res && res.gameName) || (gameById(lastH.gameId) || {}).name, final: true, reason: lastH.reason || (res ? 'finished' : 'stopped_by_operator'), history: hist };
  }
  return null;
}
function isFinal(r) {
  if (r.kind === 'quick') return true;
  if (r.kind === 'playlist') return nOr0(r.index) >= (r.queue || []).length - 1;
  return nOr0(r.played) + 1 >= nOr0(r.maxGames);
}

function renderRunView() {
  const r = state.run, end = endSource();
  if (!r && !end) {
    if (state.session) return go(gameHash(state.session.gameId));      // started the old way: its page in the library
    text($('runName'), 'Starting');
    return;
  }
  show($('runLive'), !end);
  show($('runEnd'), !!end);
  if (end) return renderEnd(end);
  endSent = '';
  document.title = `${r.gameName || 'Session'} · MS Games`;
  const voting = r.state === 'waiting' && !!r.vote, pause = r.state === 'waiting' && !r.vote;

  // header
  const sw = runStateWord(r);
  attr($('runState'), 'data-s', sw.s);
  text($('runState').lastChild, `${KIND_LABEL[r.kind] || ''} · ${sw.w}`);
  const nextName = pause && r.kind === 'playlist' ? ((r.queue || [])[r.index] || {}).name : '';
  text($('runName'), voting ? (r.vote.on === 'difficulty' ? `Voting: how hard is round ${nOr0(r.played) + 1}` : 'Voting for the next game') : pause ? (nextName ? `Next: ${nextName}` : 'Waiting room') : r.gameName || '');
  const meta = [];
  if (r.team) meta.push(`Team ${r.team}`);
  meta.push(plural((r.players || []).length, 'player', 'players'));
  if (!voting && r.difficulty) meta.push(levelName(r.difficulty));
  if (!voting && r.minutes) meta.push(`${r.minutes} min`);
  if (r.kids) meta.push('kids mode');
  if (r.birthday) meta.push('birthday');
  text($('runMeta'), meta.join(' · '));

  // auto-pause banner: who dropped and since when
  const gone = (r.pausedBy || []).map(id => (state.headsets || []).find(h => h.id === id) || { id, name: id });
  show($('pauseBanner'), r.state === 'paused' && gone.length > 0);
  if (gone.length) {
    text($('pauseWho'), `Paused: ${gone.map(h => h.name).join(', ')} dropped`);
    text($('pauseText'), `It goes on by itself 2 s after ${gone.length === 1 ? 'the headset is' : 'they are'} back. Or continue without ${gone.length === 1 ? 'it' : 'them'}.`);
  }
  if (r.error) toastOnce(`run-error-${r.id}-${r.error}`, r.error, 'error');

  // controls
  const live = ['playing', 'paused'].includes(r.state);
  const pb = $('rcPause');
  pb.disabled = !live;
  pb.classList.toggle('on', r.state === 'paused');
  text(pb, r.state === 'paused' ? 'Resume' : 'Pause');
  const g = gameById(r.gameId);
  const levels = (g && g.levels && g.levels.length ? g.levels : LEVELS);
  syncList($('rcLevel'), levels, l => l.id, () => make('<button type="button" data-level></button>'), (el, l) => { text(el, l.name); el.classList.toggle('on', l.id === r.difficulty); el.disabled = voting || !r.gameId; });
  const stages = (g && g.stages) || [];
  show($('rcStagesBox'), stages.length > 0 && !voting);
  syncList($('rcStages'), stages, s => s.id, () => make('<button type="button" class="btn btn-lg" data-stage data-confirm="Press again"></button>'), (el, s) => { if (!el.dataset.armed) text(el, s.name); el.disabled = !live; });
  $('rcRestart').disabled = !live && r.state !== 'loading';
  show($('rcNext'), r.kind === 'playlist');
  $('rcNext').disabled = nOr0(r.index) >= (r.queue || []).length - 1 && !pause;
  text($('rcNext'), pause ? 'Start it now' : 'Next game');
  show($('rcSkipVote'), r.kind === 'party');
  $('rcSkipVote').disabled = !voting;

  // queue timeline (playlist, party)
  show($('runQueue'), r.kind !== 'quick');
  if (r.kind !== 'quick') {
    const items = (r.queue || []).map((x, i) => ({ key: `q${i}`, ...x }));
    items.push({ key: 'end', end: true });
    syncList($('runQueue'), items, x => x.key, () => make('<li><b data-f="n"></b><small data-f="s"></small></li>'), (el, x) => {
      const p = parts(el), vote = !x.gameId && !x.end;
      el.classList.toggle('qend', !!x.end);
      text(p.n, x.end ? 'End' : x.name || x.gameName || (gameById(x.gameId) || {}).name || 'Vote');
      text(p.s, x.end ? '' : vote ? (voting && x.state === 'next' && items.findIndex(y => !y.gameId && !y.end) === items.indexOf(x) ? 'players vote now' : 'players vote') : [x.minutes ? `${x.minutes} min` : '', x.difficulty ? levelName(x.difficulty) : '', x.state === 'done' ? 'played' : x.state === 'now' ? 'now' : ''].filter(Boolean).join(' · '));
      attr(el, 'data-s', x.end ? 'next' : x.state);
    });
  }

  // what the session is doing
  show($('stCountdown'), r.state === 'countdown');
  show($('stVote'), voting);
  show($('stBreak'), pause);
  if (voting) renderVotes(r);
  if (pause) {
    const html = r.kind === 'party' ? 'Waiting room. The vote opens in <b class="num" data-break></b>' : `Waiting room. ${nextName ? esc(nextName) : 'The next game'} starts in <b class="num" data-break></b>`;
    if ($('stBreak')._h !== html) { $('stBreak')._h = html; $('stBreak').innerHTML = html; }
  }
  show($('runTableWrap'), !voting);
  renderPlayers(r);
  App.tickRun(App.runClock(r));
}
App.views.run = renderRunView;

const toasted = new Set();
function toastOnce(key, msg, level) { if (toasted.has(key)) return; toasted.add(key); toast(msg, level); }

function renderVotes(r) {
  const oid = o => o.id || o.gameId;      // S2: option id (game id, or difficulty in a one-game party)
  const opts = r.vote.options || Object.keys(r.vote.counts || {}).map(id => ({ id, gameId: id, name: (gameById(id) || {}).name || id }));
  const counts = r.vote.counts || {}, top = Math.max(1, ...opts.map(o => nOr0(counts[oid(o)])));
  const box = $('stVote');
  if (!box._head) { box._head = make('<div class="vote-head"><b class="num" data-vleft></b><span class="muted" data-vwho></span></div>'); box.append(box._head); box._rows = make('<div class="votes"></div>'); box.append(box._rows); }
  const voted = typeof r.vote.voted === 'number' ? r.vote.voted : Array.isArray(r.vote.voted) ? r.vote.voted.length : opts.reduce((a, o) => a + nOr0(counts[oid(o)]), 0);
  const voters = (r.players || []).length || (state.headsets || []).filter(h => h.online && h.web !== false && !h.benched).length;
  text(box._head.querySelector('[data-vwho]'), `left to vote · ${voted} of ${Math.max(voters, voted)} voted`);
  syncList(box._rows, opts, oid, () => make('<div class="vrow"><b data-f="n"></b><span class="bar"><i data-f="bar"></i></span><em data-f="c"></em></div>'), (el, o) => {
    const p = parts(el), c = nOr0(counts[oid(o)]);
    text(p.n, o.name);
    text(p.c, c);
    p.bar.style.width = `${(c / top) * 100}%`;
  });
}

function playerRow(cols) {
  return make(`<tr><td class="c-num"><span class="hsq sm" data-f="sq"></span></td><td><span class="pname" data-f="name"></span></td><td><span class="hs-state" data-f="st"><i></i><span data-f="w"></span></span></td>${cols.map((c, i) => `<td class="num-cell" data-f="c${i}"></td>`).join('')}</tr>`);
}

function renderPlayers(r) {
  const cols = columnsOf(r.gameId);
  const head = `<th class="c-num">№</th><th>Player</th><th>State</th>${cols.map(c => `<th class="r">${esc(colName(c))}</th>`).join('')}`;
  if ($('runHead')._h !== head) { $('runHead')._h = head; $('runHead').innerHTML = head; $('runRows').textContent = ''; }
  const live = r.live || {};      // optional live scores per headset from the game
  const players = [...(r.players || [])].map(p => ({ ...p, ...(live[p.headsetId] || {}) }));
  const scored = ['playing', 'paused'].includes(r.state) && players.some(p => typeof p.score === 'number');
  if (scored) players.sort((a, b) => nOr0(b.score) - nOr0(a.score));
  syncList($('runRows'), players, p => p.headsetId, () => playerRow(cols), (el, p) => {
    const f = parts(el), h = (state.headsets || []).find(x => x.id === p.headsetId) || { id: p.headsetId, number: p.n, color: p.color, name: p.name, online: false };
    paintSq(f.sq, { ...h, color: p.color || h.color, number: p.n || h.number });
    text(f.name, p.name || h.name);
    const w = hsWord(h);
    attr(f.st, 'data-s', w.s);
    text(f.w, w.w);
    cols.forEach((c, i) => text(f[`c${i}`], scored ? fmtNum(colVal(p, c)) : ''));
  });
}

App.tickRun = function (c) {
  const r = state && state.run;
  if (!r || section !== 'run' || r.state === 'results') return;
  const g = $('rcGame'), gp = parts(g), a = $('rcAll'), ap = parts(a);
  const nx = App.runNextAt(r), left = Number.isFinite(nx) && nx > 0 ? nx - Date.now() : null;
  if (['playing', 'paused'].includes(r.state)) {
    text(gp.v, fmtMs(c.rem));
    text(gp.k, `${r.state === 'paused' ? 'paused · ' : ''}left · ${fmtMs(c.el)} played`);
  } else if (r.state === 'countdown') {
    text(gp.v, fmtMs(nOr0(r.minutes) * 60000)); text(gp.k, 'game length');
  } else if (r.state === 'waiting' && left != null) {
    text(gp.v, fmtMs(left)); text(gp.k, r.vote ? 'left to vote' : 'break');
  } else { text(gp.v, fmtMs(nOr0(r.minutes) * 60000)); text(gp.k, r.state === 'loading' ? 'starts after loading' : 'game length'); }
  gp.v.classList.toggle('last', !!c.last);
  // the whole session: what is left (playlist, party), or the time since the waiting room opened (clock scope "all")
  const multi = r.kind !== 'quick', scopeAll = r.clockScope === 'all' && c.allEl != null;
  show(a, multi || scopeAll);
  if (multi && c.allRem != null) { text(ap.v, fmtMs(c.allRem)); text(ap.k, `${r.kind === 'party' ? 'party' : 'playlist'} left${r.kind === 'party' ? `, ${r.vote && r.vote.on === 'difficulty' || App.playableGames().length === 1 ? 'round' : 'game'} ${Math.min(nOr0(r.played) + 1, nOr0(r.maxGames) || 1)} of ${nOr0(r.maxGames)}` : ''}`); }
  else if (scopeAll) { text(ap.v, fmtMs(c.allEl)); text(ap.k, 'since the waiting room'); }
  if (r.state === 'countdown') { const e = ts(r.countdownEndsAt); text($('cdNum'), Number.isFinite(e) ? Math.max(1, Math.ceil((e - Date.now()) / 1000)) : 3); }
  const vl = $('stVote').querySelector('[data-vleft]');
  if (vl && r.vote) text(vl, fmtMs(ts(r.vote.endsAt) - Date.now()));
  const bk = $('stBreak').querySelector('[data-break]');
  if (bk && left != null) text(bk, fmtMs(left));
};

// ---------- end ----------

const REASON = { finished: 'results', stopped_by_operator: 'stopped', stopped_by_game: 'ended by the game', unexpected: 'ended unexpectedly' };

function renderEnd(e) {
  const res = e.results || {}, reason = e.reason || (e.results ? 'finished' : 'stopped_by_operator');
  document.title = `${e.team || 'Results'} · MS Games`;
  text($('endLabel'), [e.gameName, e.kind && e.kind !== 'quick' ? KIND_LABEL[e.kind] : '', e.live ? 'results' : REASON[reason] || 'over'].filter(Boolean).join(' · '));
  text($('endTeam'), res.team || e.team || (e.results ? 'Team' : 'Session ended'));
  const meta = [];
  if (res.minutes) meta.push(`${res.minutes} min`);
  if (res.difficulty) meta.push(levelName(res.difficulty));
  if (res.kids) meta.push('kids mode');
  if (res.won === true) meta.push('survived');
  if (res.won === false) meta.push('did not survive');
  if (reason !== 'finished') meta.push('not counted for the records');
  if (!e.live && e.history && e.history.length > 1) meta.push(`${e.history.length} games played`);
  text($('endMeta'), meta.join(' · '));
  const hasScore = typeof res.score === 'number';
  show($('endScore').parentElement, hasScore);
  text($('endScore'), hasScore ? fmtScore(res.score) : '');
  const rank = nOr0(res.rank);
  show($('endRankBox'), rank > 0);
  text($('endRank'), rank ? `${rank}` : '');
  text($('endRankLabel'), `Rank${res.difficulty ? `, ${levelName(res.difficulty).toLowerCase()}` : ''}`);
  $('endRankBox').classList.toggle('first', rank === 1);
  show($('recordBanner'), !!res.newRecord);
  text($('recordText'), res.newRecord ? `${res.team || 'This team'} is first in ${e.gameName || 'this game'}${res.difficulty ? ` on ${levelName(res.difficulty)}` : ''}.` : '');

  const cols = columnsOf(e.gameId, res);
  const head = `<th class="c-num">№</th><th>Player</th>${cols.map(c => `<th class="r">${esc(colName(c))}</th>`).join('')}`;
  if ($('endHead')._h !== head) { $('endHead')._h = head; $('endHead').innerHTML = head; $('endRows').textContent = ''; }
  const players = [...(res.players || [])].sort((a, b) => nOr0(b.score) - nOr0(a.score));
  show($('endRows').closest('.table-wrap'), players.length > 0);
  syncList($('endRows'), players, p => p.headsetId || p.id || p.name, () => make(`<tr><td class="c-num"><span class="hsq sm" data-f="sq"></span></td><td><span class="pname" data-f="name"></span></td>${cols.map((c, i) => `<td class="num-cell" data-f="c${i}"></td>`).join('')}</tr>`), (el, p) => {
    const f = parts(el), h = (state.headsets || []).find(x => x.id === (p.headsetId || p.id)) || {};
    paintSq(f.sq, { online: true, number: p.n || h.number, color: p.color || h.color });
    text(f.name, p.name || h.name || '');
    cols.forEach((c, i) => text(f[`c${i}`], fmtNum(colVal(p, c))));
  });
  const card = res.sessionId || res.scorecard || res.scorecardId;
  show($('endCard'), !!card && reason === 'finished');
  show($('endPrint'), !!card && reason === 'finished');
  text($('endNext'), e.final ? 'The waiting room is open in the headsets.' : e.kind === 'party' ? 'The vote for the next game opens by itself.' : 'The next game starts by itself after the scores.');
  text($('endHome'), e.final ? 'Back to Home' : e.kind === 'playlist' ? 'Next game now' : 'End the party');
  $('endHome').className = `btn btn-lg ${e.final || e.kind === 'playlist' ? 'btn-primary' : 'btn-danger'}`;
  for (const b of $('endMsgs').querySelectorAll('[data-endmsg]')) b.classList.toggle('sent', endSent === b.dataset.endmsg);
}

// ---------- input ----------

$('rcPause').onclick = () => { const r = state.run; if (r) api('/api/session/pause', { on: r.state !== 'paused' }); };
$('rcLevel').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (b && !b.classList.contains('on')) api('/api/session/difficulty', { level: b.dataset.key }).then(x => x.ok && toast(`Difficulty: ${levelName(b.dataset.key)}`)); });
$('rcStages').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (b) twoStep(b, () => api('/api/session/stage', { stage: b.dataset.key }).then(x => x.ok && toast(b.textContent))); });
$('rcRestart').onclick = e => twoStep(e.currentTarget, () => api('/api/session/restart', {}));
$('rcNext').onclick = () => api('/api/playlist/next', {});
$('rcSkipVote').onclick = () => api('/api/party/skipvote', {});
$('rcQuit').onclick = e => twoStep(e.currentTarget, () => api('/api/session/stop', { reason: 'stopped_by_operator' }));
$('pauseContinue').onclick = e => twoStep(e.currentTarget, () => api('/api/session/continue', {}));

function endPlayers() {
  const e = endSource(), res = (e && e.results) || {};
  const ids = (res.players || []).map(p => p.headsetId || p.id).filter(Boolean);
  if (ids.length) return ids;
  return ((state.run && state.run.players) || (state.last && state.last.players) || []).map(p => p.headsetId);
}
$('endMsgs').addEventListener('click', async e => {
  const b = e.target.closest('[data-endmsg]');
  if (!b) return;
  const preset = b.dataset.endmsg, body = { preset, headsetIds: endPlayers() };
  if (preset === 'custom') { body.text = $('endCustom').value.trim(); if (!body.text) return $('endCustom').focus(); }
  const r = await api('/api/endmessage', body);
  if (r.ok) { endSent = preset; toast('Shown in the headsets'); scheduleRender(); }
});
$('endCustom').onkeydown = e => { if (e.key === 'Enter') $('endMsgs').querySelector('[data-endmsg="custom"]').click(); };
const endCardId = () => { const e = endSource(), res = e && e.results; return res ? res.sessionId || res.scorecard || res.scorecardId : null; };
$('endCard').onclick = () => { const id = endCardId(); if (id) go(`scorecards/${encodeURIComponent(id)}`); };
$('endPrint').onclick = () => { const id = endCardId(); if (id) App.printCard(id); };
$('endHome').onclick = async () => {
  const e = endSource();
  if (e && !e.final && e.kind === 'playlist') return api('/api/playlist/next', {});
  if (state.run) await api('/api/session/stop', { reason: 'stopped_by_operator' });
  App.dismissEnd();
  await api('/api/flow/close', {}, { quiet: true });
  App.lastRunKey = '';
  go('home');
};

App.printCard = function (id) {
  if (App.printerKind && App.printerKind() === 'thermal') { api('/api/scorecards/print', { id }).then(r => r.ok && toast('Sent to the label printer')); return; }
  const w = window.open(`/scorecard/?id=${encodeURIComponent(id)}&look=print&print=1${window.MSMock ? '&mock=1' : ''}`, '_blank');
  if (!w) toast('The print window was blocked', 'warn');
};

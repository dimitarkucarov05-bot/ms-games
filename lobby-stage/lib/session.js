// The session engine: how games are run (design section 4, the Hero Zone way, in our own code).
//
// States:  idle → waiting (waiting room) → countdown → loading → playing ⇄ paused → results → waiting | idle
// End reasons (one per game, appended to data/sessions.jsonl): finished, stopped_by_operator, stopped_by_game, unexpected
//
// The engine holds the DESIRED state ("these headsets should be in game X, the rest in the waiting room") and a
// loop pushes every connected headset toward it once a second. A headset that reconnects is not a special case: it
// gets its full context again and the loop pulls it back where it belongs.
//
// It knows nothing about sockets, files or game code. The server hands it:
//   deps.now()                       clock (ms)
//   deps.headsets()                  [{ id, online, web, desk, name, n, color, phase, app }]
//   deps.games()                     catalog [{ id, name, cover, minutes, cuts?, web, status }]
//   deps.settings()                  { clockScope, resultsSec, countdownSec, difficulty, endMessage:{preset,text} }
//   deps.send(id, msg)               message to one headset
//   deps.lobbyMsg(run)               the `lobby` message (theme, board, venue, birthday, season)
//   deps.game                        the running-game adapter:
//       start(item, ids, run)        create the game and send gameStart to ids (throws on failure)
//       join(id) / leave(id) / has(id)
//       state() → { exists, begun, over, error? }
//       pause(on) · setDifficulty(level) → bool · stage(name) → bool · results() → object|null · stop()
//       clock?() → { remainingMs }   optional, when the game knows its own time left
//   deps.onResults(run, item, results) → { rank, newRecord, recordId, scorecard } (records + scorecard)
//   deps.log(entry)                  one line in sessions.jsonl
//   deps.changed()                   state changed (push to the console)
//   deps.toast(text, level)

export const STATES = ['idle', 'waiting', 'countdown', 'loading', 'playing', 'paused', 'results'];
export const END_REASONS = ['finished', 'stopped_by_operator', 'stopped_by_game', 'unexpected'];
export const KINDS = ['quick', 'playlist', 'party'];
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];

export const TIMING = {
  dropMs: 3000,          // a player offline this long pauses the game
  resumeMs: 2000,        // the game resumes this long after the last dropped player is back
  safetyMs: 120_000,     // the server ends a game only this long after its length (the game ends itself)
  abandonMs: 10 * 60_000, // every player gone this long (auto-paused all the time): the run ends as unexpected
  loopMs: 1000,          // desired-state loop
  resendMs: 10_000,      // a headset that should be in the game but shows nothing gets the start again after this
  noHeadsetRetryMs: 5000,
};

const err = (message, code) => Object.assign(new Error(message), { code });
const clampInt = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
const cleanText = (v, max = 28) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function createEngine(deps) {
  const D = { now: () => Date.now(), log() {}, changed() {}, toast() {}, onResults: () => ({}), lobbyMsg: () => ({ type: 'lobby' }), ...deps };
  let flow = null;            // { kind, step }
  let run = null;
  let last = null;            // summary of the last finished run (End view)
  let runSeq = 0;
  let loopAt = 0;
  const benched = new Set();
  const shown = new Map();    // headsetId → { what: 'lobby'|'game'|'none', key, at }

  const now = () => D.now();
  const settings = () => D.settings() || {};
  const catalog = () => D.games() || [];
  const gameDef = id => catalog().find(g => g.id === id);
  const hsList = () => D.headsets() || [];
  const hs = id => hsList().find(h => h.id === id);
  const online = id => !!hs(id)?.online;
  const changed = () => D.changed();
  const inGameState = s => s === 'loading' || s === 'playing' || s === 'paused';

  // ---------- items and players ----------

  function normItem(raw, defaults = {}) {
    const g = gameDef(String(raw?.gameId || ''));
    if (!g) throw err(`No such game: ${raw?.gameId || '(none)'}`, 'no_game');
    if (g.status === 'soon') throw err(`${g.name} is not ready yet`, 'not_ready');
    const difficulty = DIFFICULTIES.includes(defaults.difficulty) ? defaults.difficulty
      : DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : (settings().difficulty || 'normal');
    const cuts = Array.isArray(g.cuts) && g.cuts.length ? g.cuts.map(Number).filter(n => n > 0) : null;
    let minutes = Number(raw.minutes) > 0 ? Number(raw.minutes) : (g.minutes || 10);
    if (cuts && !cuts.includes(minutes)) minutes = cuts.reduce((a, b) => (Math.abs(b - minutes) < Math.abs(a - minutes) ? b : a), cuts[0]);
    if (raw.fast) minutes = Math.max(1, Math.ceil((g.minutes || minutes) / 6));
    return {
      gameId: g.id, gameName: g.name, mode: raw.mode ? String(raw.mode) : null, difficulty, minutes,
      kids: !!(raw.kids ?? defaults.kids), short: !!raw.short, options: raw.options && typeof raw.options === 'object' ? raw.options : {},
      theme: raw.theme ? String(raw.theme) : (raw.kids ? 'kids' : undefined), fast: !!raw.fast, skipTo: raw.skipTo,
    };
  }

  /** Who plays the next game: the chosen headsets that are online and not benched, else every connected game page. */
  function pickPlayers() {
    const base = run.headsetIds?.length ? run.headsetIds : hsList().filter(h => h.online && h.web).map(h => h.id);
    return base.filter(id => online(id) && !benched.has(id) && !run.removed.has(id));
  }

  function playerRow(id) {
    const h = hs(id) || {};
    return { headsetId: id, name: run?.names?.[id] || h.name || id, color: h.color || null, n: h.n ?? null };
  }

  function sendAll(ids, msg) { for (const id of ids) D.send(id, msg); }

  // ---------- run lifecycle ----------

  function newRun(kind, fields) {
    if (run) throw err(`${run.item?.gameName || 'A session'} is running: stop it first`, 'busy');
    const t = now();
    run = {
      id: `${new Date(t).toISOString().slice(0, 10).replace(/-/g, '')}-${(++runSeq).toString().padStart(3, '0')}-${Math.random().toString(36).slice(2, 6)}`,
      kind, state: 'waiting', startedAt: t, queue: [], index: 0, item: null, players: [], headsetIds: null, names: {}, removed: new Set(),
      team: '', gameStartedAt: 0, loadingAt: 0, pausedTotal: 0, pausedAt: 0, operatorPaused: false, autoPaused: false,
      dropped: new Map(), backAt: 0, countdownEndsAt: 0, nextAt: 0, resultsEndsAt: 0, results: null, vote: null, played: 0,
      history: [], error: null, ...fields,
    };
    return run;
  }

  function start(kind, opts = {}) {
    const ids = Array.isArray(opts.headsetIds) ? [...new Set(opts.headsetIds.map(String))].filter(Boolean) : null;
    const fields = { headsetIds: ids && ids.length ? ids : null, team: cleanText(opts.team), names: cleanNames(opts.names) };
    if (kind === 'quick') {
      const item = normItem(opts);
      newRun('quick', { ...fields, queue: [item] });
      return startCountdown();
    }
    if (kind === 'playlist') {
      const items = (Array.isArray(opts.items) ? opts.items : []).slice(0, 30);
      if (!items.length) throw err('The playlist is empty', 'empty');
      const queue = items.map(it => normItem(it, { difficulty: opts.difficulty }));
      newRun('playlist', { ...fields, queue, breakSec: clampInt(opts.breakSec, 0, 300, 0) });
      return startCountdown();
    }
    if (kind === 'party') {
      const all = catalog().filter(g => g.web && g.status !== 'soon').map(g => g.id);
      const games = (Array.isArray(opts.games) && opts.games.length ? opts.games.map(String) : all).filter(id => all.includes(id));
      if (!games.length) throw err('No votable games', 'no_game');
      newRun('party', {
        ...fields, games, maxGames: clampInt(opts.maxGames, 1, 20, 4), voteSec: clampInt(opts.voteSec, 10, 60, 30),
        breakSec: clampInt(opts.breakSec, 20, 120, 60), birthday: !!opts.birthday,
        // one game in the party (The Motel only): the players vote on the difficulty of the next round instead
        voteOn: opts.voteOn === 'difficulty' || opts.voteOn === 'game' ? opts.voteOn : games.length === 1 ? 'difficulty' : 'game',
        difficulty: DIFFICULTIES.includes(opts.difficulty) ? opts.difficulty : null, kids: !!opts.kids, fast: !!opts.fast,      // fast: trial cut (tests)
      });
      if (!flow) flow = { kind: 'party', step: 'running' };
      openVote();
      return view();
    }
    throw err('kind is quick, playlist or party', 'bad_kind');
  }

  function cleanNames(names) {
    const out = {};
    if (names && typeof names === 'object') for (const [k, v] of Object.entries(names)) { const t = cleanText(v, 20); if (t) out[String(k)] = t; }
    return out;
  }

  function startCountdown() {
    const item = run.queue[run.index];
    run.item = item;
    const ids = pickPlayers();
    if (!ids.length) {
      if (run.kind === 'quick' && run.history.length === 0 && !run.waitedForHeadsets) {
        const r = run; run = null;
        throw err('No connected headset to play on', 'no_headsets', r);
      }
      // a playlist or party between games: wait in the waiting room and try again
      run.state = 'waiting'; run.nextAt = now() + TIMING.noHeadsetRetryMs; run.waitedForHeadsets = true;
      changed();
      return view();
    }
    run.players = ids.map(playerRow);
    run.results = null;
    run.state = 'countdown';
    const sec = clampInt(settings().countdownSec, 0, 10, 3);
    run.countdownEndsAt = now() + sec * 1000;
    loopNow();                                     // everyone into the waiting room first
    if (sec > 0) sendAll(ids, { type: 'countdown', seconds: sec, gameId: item.gameId, name: item.gameName });
    else launchNow();
    changed();
    return view();
  }

  function launchNow() {
    const ids = run.players.map(p => p.headsetId);
    try {
      D.game.start(run.item, ids, run);
    } catch (e) {
      run.error = e.message;
      D.toast(`${run.item.gameName} did not start: ${e.message}`, 'error');
      logGame('unexpected', null, e.message);
      return afterGame(true);
    }
    run.state = 'loading';
    run.loadingAt = now();
    run.gameStartedAt = 0; run.pausedTotal = 0; run.pausedAt = 0; run.operatorPaused = false; run.autoPaused = false;
    run.dropped.clear();
    const key = gameKey();
    for (const id of ids) shown.set(id, { what: 'game', key, at: now() });
    changed();
  }

  const gameKey = () => `${run.id}:${run.index}:${run.history.length}`;

  function gameElapsed(t = now()) {
    if (!run || !run.gameStartedAt) return 0;
    const pausedNow = run.state === 'paused' && run.pausedAt ? t - run.pausedAt : 0;
    return Math.max(0, t - run.gameStartedAt - run.pausedTotal - pausedNow);
  }

  function enterPause() {
    if (run.state !== 'playing') return;
    run.state = 'paused'; run.pausedAt = now();
    try { D.game.pause(true); } catch (e) { D.toast(`Pause failed: ${e.message}`, 'error'); }
    const who = (run.autoPaused ? pausedByIds() : []).map(id => playerRow(id).name);
    sendAll(run.players.map(p => p.headsetId).filter(online), { type: 'pause', on: true, who });
    changed();
  }
  function leavePause() {
    if (run.state !== 'paused') return;
    run.pausedTotal += now() - run.pausedAt; run.pausedAt = 0;
    run.state = 'playing';
    try { D.game.pause(false); } catch (e) { D.toast(`Resume failed: ${e.message}`, 'error'); }
    sendAll(run.players.map(p => p.headsetId).filter(online), { type: 'pause', on: false, who: [] });
    changed();
  }
  function applyPause() {
    const want = run.operatorPaused || run.autoPaused;
    if (want && run.state === 'playing') enterPause();
    else if (!want && run.state === 'paused') leavePause();
  }

  /** Players dropped longer than dropMs. */
  function pausedByIds(t = now()) {
    return [...run.dropped.entries()].filter(([, at]) => t - at >= TIMING.dropMs).map(([id]) => id);
  }

  function results() {
    let r = null;
    try { r = D.game.results(); } catch (e) { D.toast(`Results failed: ${e.message}`, 'error'); }
    return r;
  }

  function logGame(reason, res, error) {
    const t = now();
    const entry = {
      id: `${run.id}-${run.history.length + 1}`, runId: run.id, kind: run.kind, index: run.index,
      start: new Date(run.gameStartedAt || run.loadingAt || t).toISOString(), end: new Date(t).toISOString(),
      gameId: run.item?.gameId, game: run.item?.gameName, mode: run.item?.mode || null, difficulty: run.item?.difficulty,
      minutes: run.item?.minutes, kids: !!run.item?.kids, team: run.team || null,
      headsets: run.players.map(p => p.headsetId), players: run.players.map(p => p.name),
      reason, playedMs: gameElapsed(t), pausedMs: run.pausedTotal + (run.pausedAt ? t - run.pausedAt : 0),
      result: res ? { score: res.score, won: res.won ?? null, rank: res.rank ?? null, newRecord: !!res.newRecord, players: res.players || [] } : null,
      ...(error ? { error } : {}),
    };
    run.history.push({ gameId: entry.gameId, reason, score: res?.score ?? null });
    D.log(entry);
    return entry;
  }

  /** The game ended (or was ended). With results: show them, then move on; without: move on now. */
  function finishGame(reason, { keepRun = true } = {}) {
    if (!run || !inGameState(run.state)) return;
    if (run.state === 'paused') { run.pausedTotal += now() - run.pausedAt; run.pausedAt = 0; }
    const raw = reason === 'finished' || reason === 'unexpected' ? results() : null;
    let res = null;
    if (raw) {
      res = { ...raw, team: run.team || raw.team || '', difficulty: raw.difficulty || run.item.difficulty, sessionId: `${run.id}-${run.history.length + 1}` };
      if (reason === 'finished') {
        try { Object.assign(res, D.onResults(run, run.item, res) || {}); } catch (e) { D.toast(`Saving the result failed: ${e.message}`, 'error'); }
      }
    }
    const entry = logGame(reason, res);
    run.results = res ? { ...res, sessionId: entry.id, gameId: run.item.gameId, gameName: run.item.gameName, minutes: run.item.minutes } : null;
    if (res && reason === 'finished') {
      run.state = 'results';
      const sec = clampInt(settings().resultsSec, 5, 120, 20);
      run.resultsEndsAt = now() + sec * 1000;
      sendAll(run.players.map(p => p.headsetId).filter(online), {
        type: 'results', team: res.team, score: res.score, rank: res.rank ?? null, newRecord: !!res.newRecord, won: res.won ?? null,
        players: res.players || [], seconds: sec, gameId: run.item.gameId,
      });
      changed();
      return;
    }
    stopGame();
    if (!keepRun) return endRun();
    afterGame(false);
  }

  function stopGame() {
    try { D.game.stop(); } catch (e) { D.toast(`Stopping the game failed: ${e.message}`, 'error'); }
    if (run) for (const p of run.players) { const s = shown.get(p.headsetId); if (s?.what === 'game') shown.set(p.headsetId, { what: 'none', at: now() }); }
  }

  /** Next item, next vote, or the end of the run. */
  function afterGame(failed) {
    if (!run) return;
    if (run.kind === 'playlist') {
      run.index++;
      if (run.index >= run.queue.length) return endRun();
      run.state = 'waiting'; run.nextAt = now() + (failed ? 3000 : run.breakSec * 1000);
      changed();
      return;
    }
    if (run.kind === 'party') {
      run.played++;
      if (run.played >= run.maxGames) return endRun();
      run.state = 'waiting'; run.nextAt = now() + Math.max(0, run.breakSec - run.voteSec) * 1000;
      changed();
      return;
    }
    endRun();
  }

  function endRun() {
    if (!run) return;
    const r = run;
    const em = settings().endMessage || {};
    if (em.preset && em.preset !== 'none' && r.history.some(h => h.reason === 'finished')) {
      sendAll(r.players.map(p => p.headsetId).filter(online), { type: 'endMessage', preset: em.preset, text: em.preset === 'custom' ? (em.text || '') : '' });
    }
    if (inGameState(r.state) || r.state === 'results') stopGame();
    if (r.vote) sendAll(hsList().filter(h => h.online).map(h => h.id), { type: 'voteEnd', gameId: null });
    last = {
      runId: r.id, kind: r.kind, endedAt: new Date(now()).toISOString(), team: r.team, history: r.history,
      results: r.results, players: r.players,
    };
    run = null;
    if (flow) flow.step = 'end';
    loopNow();
    changed();
  }

  // ---------- party voting ----------

  const capital = s => s[0].toUpperCase() + s.slice(1);
  function voteOptions() {
    if (run.voteOn === 'difficulty') {
      const g = gameDef(run.games[0]);
      return DIFFICULTIES.map(d => ({ id: d, gameId: g.id, difficulty: d, name: capital(d), cover: g.cover || null, hint: g.name }));
    }
    return run.games.map(id => gameDef(id)).filter(Boolean).map(g => ({ id: g.id, gameId: g.id, name: g.name, cover: g.cover || null }));
  }
  const voteQuestion = () => (run.voteOn === 'difficulty' ? `How hard is round ${run.played + 1}?` : 'Vote for the next game');
  function openVote() {
    const opts = voteOptions();
    run.state = 'waiting'; run.nextAt = 0;
    loopNow();                                     // into the waiting room first, then the vote
    run.vote = { endsAt: now() + run.voteSec * 1000, votes: {}, options: opts };
    sendAll(voters(), { type: 'vote', on: run.voteOn, question: voteQuestion(), options: opts, endsAt: run.vote.endsAt, seconds: run.voteSec });
    changed();
  }
  function voters() { return hsList().filter(h => h.online && h.web && !benched.has(h.id)).map(h => h.id); }

  function voteCounts() {
    const counts = {};
    for (const o of run.vote.options) counts[o.id] = 0;
    for (const g of Object.values(run.vote.votes)) if (g in counts) counts[g]++;
    return counts;
  }

  /** Highest vote wins, ties at random; nobody voted → the next game not played yet in this party. */
  function pickWinner(rand = Math.random) {
    const counts = voteCounts();
    const max = Math.max(0, ...Object.values(counts));
    if (max > 0) {
      const top = Object.keys(counts).filter(k => counts[k] === max);
      return top[Math.floor(rand() * top.length) % top.length];
    }
    if (run.voteOn === 'difficulty') return run.difficulty || settings().difficulty || 'normal';
    const played = new Set(run.queue.map(q => q.gameId));
    return run.games.find(id => !played.has(id)) || run.games[run.played % run.games.length];
  }

  function closeVote() {
    const id = pickWinner(D.random || Math.random);
    const opt = run.vote.options.find(o => o.id === id) || { id, gameId: id };
    const difficulty = opt.difficulty || run.difficulty || undefined;
    sendAll(hsList().filter(h => h.online).map(h => h.id), { type: 'voteEnd', id: opt.id, gameId: opt.gameId, difficulty: difficulty || null, counts: voteCounts() });
    run.lastVote = { id: opt.id, gameId: opt.gameId, difficulty: difficulty || null, counts: voteCounts() };
    run.vote = null;
    run.queue.push(normItem({ gameId: opt.gameId, kids: run.kids, fast: run.fast }, { difficulty }));
    run.index = run.queue.length - 1;
    startCountdown();
  }

  // ---------- desired state ----------

  function desiredFor(h) {
    if (!h.online || !h.web) return null;
    if (run) {
      const inRun = run.players.some(p => p.headsetId === h.id) && !benched.has(h.id) && !run.removed.has(h.id);
      if (inGameState(run.state) && inRun) return 'game';
      if (run.state === 'results' && inRun) return null;     // the scores stay up in the game
      return 'lobby';
    }
    return flow ? 'lobby' : null;
  }

  // the waiting-room message is resent when what it shows changes (record board, birthday, season, venue)
  let lobbyCache = null;
  function lobbyNow(t) {
    if (!lobbyCache || lobbyCache.t !== t) { const msg = D.lobbyMsg(run); lobbyCache = { t, msg, sig: JSON.stringify(msg) }; }
    return lobbyCache;
  }

  function syncHeadset(h, t = now()) {
    const want = desiredFor(h);
    const cur = shown.get(h.id);
    if (want === 'game') {
      const key = gameKey();
      const stale = cur && cur.key === key && t - cur.at > TIMING.resendMs && h.phase === 'idle' && !h.app;
      if (!cur || cur.key !== key || !D.game.has(h.id) || stale) {
        try { D.game.join(h.id); shown.set(h.id, { what: 'game', key, at: t }); }
        catch (e) { D.toast(`${h.name || h.id} could not join: ${e.message}`, 'warn'); shown.set(h.id, { what: 'none', at: t }); }
        if (run.state === 'paused') D.send(h.id, { type: 'pause', on: true, who: pausedByIds().map(id => playerRow(id).name) });
      }
      return;
    }
    if (want === 'lobby') {
      const lob = lobbyNow(t);
      if (cur?.what === 'lobby' && cur.sig !== lob.sig) { D.send(h.id, lob.msg); cur.sig = lob.sig; return; }
      if (!cur || cur.what !== 'lobby') {
        if (cur?.what === 'game' || D.game.has(h.id)) {
          try { if (D.game.has(h.id)) D.game.leave(h.id); } catch { /* the game is gone already */ }
          D.send(h.id, { type: 'stop' });
        }
        D.send(h.id, lob.msg);
        shown.set(h.id, { what: 'lobby', at: t, sig: lob.sig });
        if (run?.vote && !benched.has(h.id)) D.send(h.id, { type: 'vote', on: run.voteOn, question: voteQuestion(), options: run.vote.options, endsAt: run.vote.endsAt, seconds: Math.max(0, Math.round((run.vote.endsAt - t) / 1000)) });
      }
    }
  }

  function loopNow() {
    const t = now();
    loopAt = t;
    for (const h of hsList()) syncHeadset(h, t);
  }

  // ---------- the tick (call every 250 ms) ----------

  function tick() {
    const t = now();
    if (run) {
      const s = run.state;
      if (s === 'countdown' && t >= run.countdownEndsAt) launchNow();
      else if (s === 'waiting') {
        if (run.vote) { if (t >= run.vote.endsAt) closeVote(); }
        else if (run.kind === 'party' && run.nextAt && t >= run.nextAt) openVote();
        else if (run.kind !== 'party' && run.nextAt && t >= run.nextAt) startCountdown();
      } else if (inGameState(s)) {
        const st = D.game.state() || {};
        if (!st.exists) finishGame(st.error ? 'stopped_by_game' : 'unexpected');
        else if (st.over) finishGame('finished');
        else {
          if (s === 'loading' && st.begun) { run.state = 'playing'; run.gameStartedAt = t; applyPause(); changed(); }
          if (run.state === 'playing' || run.state === 'paused') watchDrops(t);
          if (run && gameElapsed(t) > (run.item.minutes * 60_000 + TIMING.safetyMs)) {
            D.toast(`${run.item.gameName} ran past its length: ending it`, 'warn');
            finishGame('unexpected');
          }
        }
      } else if (s === 'results' && t >= run.resultsEndsAt) {
        stopGame();
        afterGame(false);
      }
    }
    if (t - loopAt >= TIMING.loopMs) loopNow();
  }

  function watchDrops(t) {
    let moved = false;
    for (const p of run.players) {
      const id = p.headsetId;
      if (run.removed.has(id) || benched.has(id)) continue;
      if (!online(id)) { if (!run.dropped.has(id)) { run.dropped.set(id, t); moved = true; } }
      else if (run.dropped.has(id)) { run.dropped.delete(id); run.backAt = t; moved = true; }
    }
    const out = pausedByIds(t);
    const left = run.players.filter(p => !run.removed.has(p.headsetId) && !benched.has(p.headsetId));
    if (left.length && left.every(p => run.dropped.has(p.headsetId)) && Math.min(...left.map(p => t - run.dropped.get(p.headsetId))) >= TIMING.abandonMs) {
      D.toast(`Every player has been gone for ${Math.round(TIMING.abandonMs / 60_000)} minutes: ending ${run.item.gameName}`, 'warn');
      finishGame('unexpected', { keepRun: false });
      return;
    }
    if (out.length && !run.autoPaused) {
      run.autoPaused = true;
      D.toast(`Paused: ${out.map(id => playerRow(id).name).join(', ')} dropped`, 'warn');
      applyPause();
    } else if (!out.length && run.autoPaused && run.dropped.size === 0 && t - run.backAt >= TIMING.resumeMs) {
      run.autoPaused = false;
      D.toast('Everyone is back: resuming', 'ok');
      applyPause();
    } else if (moved) changed();
  }

  // ---------- operator controls ----------

  function need(states, what) {
    if (!run) throw err('No session is running', 'no_session');
    if (states && !states.includes(run.state)) throw err(`Cannot ${what} now (${run.state})`, 'bad_state');
  }

  const api = {
    open({ kind, step } = {}) {
      if (!KINDS.includes(kind)) throw err('kind is quick, playlist or party', 'bad_kind');
      if (run && run.kind !== kind) throw err('A session is running: stop it first', 'busy');
      flow = { kind, step: step ? String(step) : 'game' };
      loopNow();
      changed();
      return api.view();
    },
    step(step) { if (flow) { flow.step = String(step || 'game'); changed(); } return api.view(); },
    close() {
      if (run) throw err('A session is running: stop it first', 'busy');
      flow = null;
      changed();
      return api.view();
    },
    start, view,
    /** Old POST /api/launch: same game running → the late headsets join it. */
    addPlayers(ids) {
      if (!run) return false;
      let added = 0;
      for (const id of ids) {
        if (run.players.some(p => p.headsetId === id)) continue;
        run.removed.delete(id);
        if (run.headsetIds) run.headsetIds.push(id);
        run.players.push(playerRow(id)); added++;
        if (run.state === 'countdown') D.send(id, { type: 'countdown', seconds: Math.max(1, Math.ceil((run.countdownEndsAt - now()) / 1000)), gameId: run.item.gameId, name: run.item.gameName });
      }
      loopNow(); changed();
      return added;
    },
    pause(on) {
      need(['playing', 'paused', 'loading'], 'pause');
      run.operatorPaused = !!on;
      applyPause();
      return view();
    },
    difficulty(level) {
      need(null);
      if (!DIFFICULTIES.includes(level)) throw err(`level is one of ${DIFFICULTIES.join(', ')}`, 'bad_level');
      if (!run.item) throw err('No game yet', 'bad_state');
      run.item.difficulty = level;
      let live = false;
      if (inGameState(run.state)) {
        live = !!D.game.setDifficulty(level);
        sendAll(run.players.map(p => p.headsetId).filter(online), { type: 'settings', difficulty: level });
        if (!live) D.toast(`${run.item.gameName} takes the new difficulty from the next game`, 'warn');
      }
      changed();
      return { ...view(), live };
    },
    stage(name) {
      need(['playing', 'paused'], 'change the stage');
      const ok = D.game.stage(String(name || ''));
      if (!ok) throw err(`${run.item.gameName} has no stage "${name}"`, 'no_stage');
      return view();
    },
    restart() {
      need(['countdown', 'loading', 'playing', 'paused', 'results'], 'restart');
      if (inGameState(run.state)) logGame('stopped_by_operator', null, 'restart');
      if (run.state !== 'countdown') stopGame();
      run.vote = null;
      return startCountdown();
    },
    /** Operator stop: the whole run ends (playlist and party too). */
    stop(reason = 'stopped_by_operator') {
      if (!run) return view();
      const why = END_REASONS.includes(reason) ? reason : 'stopped_by_operator';
      if (inGameState(run.state)) finishGame(why, { keepRun: false });
      else endRun();
      return view();
    },
    continueWithout() {
      need(['playing', 'paused'], 'continue');
      const gone = run.players.map(p => p.headsetId).filter(id => run.dropped.has(id) || !online(id));
      for (const id of gone) {
        run.removed.add(id);
        run.dropped.delete(id);
        try { if (D.game.has(id)) D.game.leave(id); } catch { /* already out */ }
      }
      run.players = run.players.filter(p => !run.removed.has(p.headsetId));
      run.autoPaused = false;
      applyPause();
      changed();
      return { ...view(), removed: gone };
    },
    next() {
      need(null);
      if (run.kind !== 'playlist') throw err('Next is for playlists', 'bad_kind');
      if (inGameState(run.state)) { logGame('stopped_by_operator', null, 'next'); stopGame(); }
      else if (run.state === 'results') stopGame();
      else if (run.state === 'countdown') { /* skip this one */ }
      else if (run.state === 'waiting') return startCountdown();
      run.index++;
      if (run.index >= run.queue.length) { endRun(); return view(); }
      return startCountdown();
    },
    skipVote() {
      need(['waiting'], 'skip the vote');
      if (run.kind !== 'party') throw err('Skip vote is for parties', 'bad_kind');
      if (run.vote) closeVote();
      else openVote();
      return view();
    },
    /** A vote from a headset: the option id (game id, or difficulty in a one-game party). */
    vote(headsetId, id) {
      if (!run?.vote) return false;
      if (!run.vote.options.some(o => o.id === id)) return false;
      run.vote.votes[headsetId] = String(id);
      changed();
      return true;
    },
    bench(id, on) {
      if (on) benched.add(id); else benched.delete(id);
      D.send(id, { type: 'bench', on: !!on });
      if (on && run && D.game.has(id) && inGameState(run.state)) { try { D.game.leave(id); } catch { /* gone */ } D.send(id, { type: 'stop' }); shown.set(id, { what: 'none', at: now() }); }
      const h = hs(id); if (h) syncHeadset(h);
      changed();
      return on;
    },
    isBenched: id => benched.has(id),
    /** Should this headset's game page be in front now (a mode open or a run on, and not removed from it)? */
    keeps: id => !!(flow || run) && !(run && run.removed.has(id)),
    /** Per-headset "Restart game": leave and rejoin the running game. */
    restartHeadset(id) {
      if (!run || !inGameState(run.state) || !run.players.some(p => p.headsetId === id)) throw err('This headset is not in the running game', 'bad_state');
      try { if (D.game.has(id)) D.game.leave(id); } catch { /* gone */ }
      D.send(id, { type: 'restartGame' });       // the page drops the game and waits for gameStart
      shown.set(id, { what: 'none', at: now() });
      setTimeout(() => { const h = hs(id); if (h) syncHeadset(h); }, 800);
      return true;
    },
    /** A headset (re)connected: full context, then straight to where it belongs. */
    onConnect(id) {
      shown.delete(id);
      const h = hs(id);
      if (!h) return;
      if (run?.state === 'countdown' && run.players.some(p => p.headsetId === id)) {
        syncHeadset(h);
        D.send(id, { type: 'countdown', seconds: Math.max(1, Math.ceil((run.countdownEndsAt - now()) / 1000)), gameId: run.item.gameId, name: run.item.gameName });
        return;
      }
      syncHeadset(h);
    },
    onDisconnect(id) { shown.delete(id); },
    tick, loopNow,
    active: () => !!run,
    inGame: () => !!run && (inGameState(run.state) || run.state === 'results'),
    isPaused: () => run?.state === 'paused',
    gameId: () => run?.item?.gameId || null,
    state: () => (run ? run.state : flow ? 'waiting' : 'idle'),
    flow: () => flow,
    last: () => last,
    runRaw: () => run,
    playersOf: () => (run ? run.players.map(p => p.headsetId) : []),
  };

  // ---------- the run as the console sees it ----------

  function view() {
    if (!run) return null;
    const t = now();
    const s = settings();
    const scope = s.clockScope === 'all' ? 'all' : 'game';
    const item = run.item || run.queue[run.index] || null;
    const gEl = gameElapsed(t);
    let gRem = item ? Math.max(0, item.minutes * 60_000 - gEl) : 0;
    try { const c = inGameState(run.state) && D.game.clock ? D.game.clock() : null; if (c && Number.isFinite(c.remainingMs)) gRem = Math.max(0, c.remainingMs); } catch { /* own estimate */ }
    if (!run.gameStartedAt && item) gRem = item.minutes * 60_000;
    const totalEl = t - run.startedAt;
    let totalRem = gRem;
    if (run.kind === 'playlist') totalRem += run.queue.slice(run.index + 1).reduce((a, q) => a + q.minutes * 60_000 + run.breakSec * 1000, 0);
    if (run.kind === 'party') {
      const left = Math.max(0, run.maxGames - run.played - (run.item && run.state !== 'waiting' ? 1 : 0));
      const avg = run.games.map(id => gameDef(id)?.minutes || 10).reduce((a, b) => a + b, 0) / Math.max(1, run.games.length);
      totalRem += left * (avg * 60_000 + run.breakSec * 1000);
    }
    const queue = run.kind === 'party'
      ? [...run.queue.map((q, i) => ({ gameId: q.gameId, name: q.gameName, state: i === run.index && run.state !== 'waiting' ? 'now' : 'done' })),
        ...Array.from({ length: Math.max(0, run.maxGames - run.queue.length) }, () => ({ gameId: null, name: 'Vote', state: 'next' }))]
      : run.queue.map((q, i) => ({ gameId: q.gameId, name: q.gameName, difficulty: q.difficulty, minutes: q.minutes, state: i < run.index ? 'done' : i === run.index && run.state !== 'waiting' ? 'now' : 'next' }));
    return {
      id: run.id, kind: run.kind, state: run.state,
      gameId: item?.gameId || null, gameName: item?.gameName || null, mode: item?.mode || null,
      difficulty: item?.difficulty || null, kids: !!item?.kids, minutes: item?.minutes || null, options: item?.options || {},
      clockScope: scope, startedAt: run.startedAt, gameStartedAt: run.gameStartedAt || null,
      elapsedMs: scope === 'all' ? totalEl : gEl, remainingMs: scope === 'all' ? totalRem : gRem,
      gameElapsedMs: gEl, gameRemainingMs: gRem, totalElapsedMs: totalEl, totalRemainingMs: totalRem,
      pausedBy: pausedByIds(t), dropped: [...run.dropped.entries()].map(([id, at]) => ({ headsetId: id, sinceMs: t - at })),
      operatorPaused: run.operatorPaused, autoPaused: run.autoPaused,
      queue, index: run.index, maxGames: run.maxGames ?? null, played: run.played,
      breakSec: run.breakSec ?? null, voteSec: run.voteSec ?? null, birthday: !!run.birthday,
      vote: run.vote ? { on: run.voteOn, endsAt: run.vote.endsAt, counts: voteCounts(), options: run.vote.options, voted: Object.keys(run.vote.votes).length } : null,
      voteOn: run.voteOn || null,
      lastVote: run.lastVote || null,
      countdownEndsAt: run.state === 'countdown' ? run.countdownEndsAt : null,
      nextAt: run.state === 'waiting' ? (run.vote ? run.vote.endsAt : run.nextAt || null) : null,
      resultsEndsAt: run.state === 'results' ? run.resultsEndsAt : null,
      team: run.team, players: run.players, history: run.history,
      results: run.results, error: run.error,
    };
  }

  api.pickWinner = pickWinner;
  return api;
}

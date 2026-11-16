// MS Games 2 · mock server for the operator console (?mock=1).
// Mirrors research/ms-games-2-design.md section 9 plus S2's "Contract changes" entry: the same REST routes,
// the same state shape (epoch-ms times, run states waiting/countdown/loading/playing/paused/results, `last`),
// so the console code is identical against the mock and against the real server.
// fetch() to /api/* is answered here and the state is "pushed" every 500 ms.
// Options: &two=1 adds a second (archived) game to test multi-game screens.
// Debug from DevTools: mock.drop('q3'), mock.back('q3'), mock.battery('q2', 12), mock.finish(), mock.usb(3), mock.scene('busy').

'use strict';

(() => {
  const qs = new URLSearchParams(location.search);
  if (!qs.has('mock')) return;

  const now = () => Date.now();
  const iso = t => new Date(t).toISOString();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clone = v => JSON.parse(JSON.stringify(v));

  // ---------- games: The Motel as in game/motel.game.json (S4) ----------
  const LEVELS = [{ id: 'easy', name: 'Easy' }, { id: 'normal', name: 'Normal' }, { id: 'hard', name: 'Hard' }, { id: 'nightmare', name: 'Nightmare' }];
  const games = [{
    id: 'motel', name: 'The Motel', tagline: 'Nobody checks out', version: '3.0.0', status: 'ready', web: true,
    description: 'Night at an abandoned roadside motel. Board up the gates, grab a weapon and hold out through the waves. Then something huge arrives.',
    cover: '/play/games/motel/cover.jpg', color: '#e2543a', minPlayers: 1, maxPlayers: 6, minutes: 10,
    players: { '3x3': [1, 2], '4x4': [1, 4], '5x5': [1, 5], '6x6': [1, 6], '8x8': [1, 6], '10x10': [1, 6] }, minArea: [3, 3],
    cuts: [10, 15], family: false, kids: true,
    tags: ['shooter', 'co-op', 'waves', 'barricades', 'melee', 'horror'],
    themes: [{ id: 'night', name: 'Night' }, { id: 'kids', name: 'Kids (no blood)' }], levels: LEVELS,
    modes: [
      { id: 'standard', name: 'Standard', description: 'Thirty seconds to arm up, then the waves and the boss. Five waves in 10 minutes, six in 15.', recommended: true },
      { id: 'short', name: 'Short', description: 'One wave fewer and shorter waves, for a quick round or younger players.', recommended: false },
    ],
    options: [
      { id: 'barrels', name: 'Fuel barrels', type: 'bool', default: true, description: 'Red barrels by the paths explode when shot' },
      { id: 'blackout', name: 'Blackout wave', type: 'bool', default: true, description: 'The power fails on one wave: only flashlights and fires' },
      { id: 'boards', name: 'Boards at start', type: 'range', default: 3, min: 0, max: 6, description: 'How many of the six planks are nailed on each gate at the start' },
      { id: 'ammo', name: 'Unlimited ammo', type: 'bool', default: false, description: 'Guns from the chest never run dry' },
      { id: 'crowd', name: 'Most zombies at once', type: 'range', default: 14, min: 6, max: 20, description: 'Upper limit of zombies alive together' },
      { id: 'prep', name: 'Preparation', type: 'range', default: 30, min: 15, max: 60, description: 'Seconds to grab weapons and nail gates before wave 1' },
    ],
    stages: [{ id: 'boss', name: 'Skip to boss' }, { id: 'wave', name: 'Start next wave now' }],
    scorecard: { columns: ['score', 'kills', 'deaths'] },
  }];
  if (qs.has('two')) games.push({
    id: 'backroom', name: 'The Back Room', tagline: 'Build a pizzeria into an empire', version: '1.5.0', status: 'ready', web: true,
    cover: '/play/games/backroom/cover.jpg', color: '#c8f03c', minPlayers: 1, maxPlayers: 6, minutes: 15, minArea: [5, 5], cuts: [10, 15, 20],
    tags: ['cooking', 'co-op', 'management'], levels: LEVELS, modes: [{ id: 'shift', name: 'Shift', description: 'One shift in the shop, then the cellar.', recommended: true }],
    options: [], stages: [], scorecard: { columns: ['score', 'orders', 'tips', 'mistakes'] },
  });
  const gameDef = id => games.find(g => g.id === id);

  // ---------- headsets ----------
  const COLORS = ['#e0604f', '#4f8fe0', '#4fc07a', '#a072e0', '#e8973c', '#3fb8b0'];
  const headsets = [1, 2, 3, 4, 5, 6].map(n => {
    const i = n - 1;
    return {
      id: `q${n}`, number: n, name: `Quest ${n}`, color: COLORS[i], model: i < 4 ? 'Quest 3' : 'Quest 2', web: true, desk: false,
      online: i < 5, battery: [86, 64, 41, 18, 92, 70][i], charging: i === 4,
      controllers: { left: [80, 55, 36, 22, 90, 60][i], right: [74, 60, 12, 30, 88, 65][i], leftCharging: false, rightCharging: false },
      phase: 'idle', sleeping: false, inVR: i < 5, hasCalibration: i !== 2, anchor: i === 2 ? null : 'ok',
      needsCalibration: i === 2 ? 'no-calibration' : null, benched: false, droppedAt: null,
      health: { pingMs: [9, 14, 31, 11, 8, null][i], pingMin: [4, 6, 9, 5, 4, null][i], pingMax: [38, 55, 140, 41, 22, null][i], drops: [0, 1, 4, 0, 0, 2][i], dropsTotal: [0, 1, 6, 0, 0, 3][i], lastDropAt: i === 2 || i === 5 ? iso(now() - 40 * 60e3) : null, wifi: [92, 80, 54, 88, 96, null][i] },
      volume: 60, load: null, launchError: null, pos: { x: rnd(-2, 2), z: rnd(-2, 2) }, yaw: rnd(0, 6), user: null, appVersion: '2.0.0', build: 36,
      lastSeen: now() - (i === 5 ? 40 * 60e3 : 0),
    };
  });
  const hsById = id => headsets.find(h => h.id === id);

  // ---------- settings (S2 lib/settings.js shape) ----------
  const settings = {
    venue: { name: 'MS Games Arena', logo: null }, units: 'm', clockScope: 'game', difficulty: 'normal', autoStart: false,
    theme: 'auto', endMessage: { preset: 'remove', text: '' }, printer: { kind: 'system', thermalHost: '192.168.1.40:631', queue: 'thermal' },
    resultsSec: 20, countdownSec: 3, language: 'en', simple: true,
  };
  function mergeSettings(p) {
    if (p.venue && typeof p.venue === 'object') { if ('name' in p.venue) settings.venue.name = String(p.venue.name || 'MS Games').slice(0, 40); if ('logo' in p.venue) settings.venue.logo = p.venue.logo || null; }
    if ('venueName' in p) settings.venue.name = String(p.venueName || 'MS Games').slice(0, 40);
    if ('endMessage' in p) { const e = typeof p.endMessage === 'string' ? { preset: p.endMessage } : p.endMessage || {}; if (e.preset) settings.endMessage.preset = e.preset; if (e.text !== undefined) settings.endMessage.text = e.text; }
    if (p.printer && typeof p.printer === 'object') Object.assign(settings.printer, p.printer);
    for (const k of ['units', 'clockScope', 'difficulty', 'autoStart', 'theme', 'resultsSec', 'countdownSec', 'simple']) if (k in p) settings[k] = p[k];
  }

  // ---------- records, scorecards, presets ----------
  const ago = (d, h = 0) => iso(now() - d * 86400e3 - h * 3600e3);
  let records = [
    { id: 'r1', gameId: 'motel', team: 'NIGHT SHIFT', score: 48210, players: ['Ana', 'Ivo', 'Dani', 'Kris'], difficulty: 'normal', minutes: 15, date: ago(0, 2), kids: false },
    { id: 'r2', gameId: 'motel', team: 'GATE KEEPERS', score: 41980, players: ['Mira', 'Teo'], difficulty: 'normal', minutes: 10, date: ago(0, 5), kids: false },
    { id: 'r3', gameId: 'motel', team: 'BIRTHDAY 9', score: 30550, players: ['Niki', 'Sami', 'Bobi', 'Lora', 'Vik'], difficulty: 'easy', minutes: 10, date: ago(2), kids: true },
    { id: 'r4', gameId: 'motel', team: 'LAST ORDERS', score: 27400, players: ['Petar', 'Asen', 'Gery'], difficulty: 'hard', minutes: 15, date: ago(5), kids: false },
    { id: 'r5', gameId: 'motel', team: 'THE PLANKS', score: 21130, players: ['Rado', 'Stef'], difficulty: 'normal', minutes: 10, date: ago(6), kids: false },
  ];
  const cards = new Map();      // id → full scorecard sidecar
  records.slice(0, 4).forEach((r, i) => {
    const id = `seed-${i + 1}`;
    cards.set(id, { id, base: `${r.date.slice(0, 10).replace(/-/g, '')}_motel_${r.team.replace(/\W+/g, '-')}`, gameId: r.gameId, game: 'The Motel', team: r.team, score: r.score, rank: i + 1, newRecord: i === 0, difficulty: r.difficulty, minutes: r.minutes, date: r.date, kids: r.kids, won: true,
      players: r.players.map((n, j) => ({ id: `q${j + 1}`, n: j + 1, name: n, color: COLORS[j % 6], score: Math.round(r.score / r.players.length * rnd(0.6, 1.3)), kills: Math.round(rnd(20, 90)), deaths: Math.round(rnd(0, 6)) })), columns: ['score', 'kills', 'deaths'] });
  });
  let presets = [
    { name: 'Birthday hour', items: [{ gameId: 'motel', mode: 'short', difficulty: 'easy', minutes: 10, options: {} }, { gameId: 'motel', mode: 'standard', difficulty: 'normal', minutes: 10, options: {} }], breakSec: 90, names: true },
    { name: 'Hard night', items: [{ gameId: 'motel', mode: 'standard', difficulty: 'normal', minutes: 15, options: {} }, { gameId: 'motel', mode: 'standard', difficulty: 'nightmare', minutes: 15, options: {} }], breakSec: 60, names: false },
  ];

  let flow = null;          // {kind, step}
  let run = null;           // internal; runView() is what the console sees
  let last = null;
  let precheck = null;
  const setup = { step: null, entry: null, area: { kind: 'preset', w: Number(qs.get('area')) || 6, d: Number(qs.get('area')) || 6, rotation: 0, entrance: 'middle' }, ref: null, refAB: null, points: {}, check: {}, errors: {} };
  let usb = [];
  let calibration = { width: Number(qs.get('area')) || 6, depth: Number(qs.get('area')) || 6, version: 7 };      // &area=4 makes a 4 × 4 m arena
  let zone = null;
  let scoresVersion = 1, scorecardsVersion = 1;
  const listeners = new Set();

  // ---------- state ----------
  function stateWord(h) {
    const r = run, inRun = r && r.players.some(p => p.headsetId === h.id);
    if (!h.online) return inRun && ['loading', 'playing', 'paused'].includes(r.state) ? 'Dropped' : 'Offline';
    if (inRun && r.state === 'loading') return 'Loading';
    if (inRun && r.state === 'paused') return 'Paused';
    if (inRun && (r.state === 'playing' || r.state === 'results')) return 'Playing';
    if (h.sleeping) return 'Sleeping';
    if (!h.desk && (h.needsCalibration || !h.hasCalibration)) return 'Not calibrated';
    if (h.benched) return 'Benched';
    if (run || flow) return 'Waiting room';
    return 'Ready';
  }
  function headsetView(h) {
    return {
      id: h.id, number: h.number, name: h.name, color: h.color, model: h.model, web: true, desk: false, ip: `192.168.1.${30 + h.number}`,
      online: h.online, battery: h.battery, charging: h.charging, controllers: h.controllers, phase: h.phase, sleeping: h.sleeping,
      inVR: h.inVR, hasCalibration: h.hasCalibration, calibrated: h.hasCalibration, anchor: h.anchor, needsCalibration: h.needsCalibration,
      benched: h.benched, state: stateWord(h), health: { ...h.health, pingMs: h.online ? h.health.pingMs : null },
      fps: h.online && h.phase === 'playing' ? Math.round(rnd(70, 72)) : null, volume: h.volume,
      load: h.phase === 'loading' ? h.load : null, launchError: h.launchError, pos: h.pos, yaw: h.yaw, user: h.user,
      lowBattery: h.battery < 20 && !h.charging, build: h.build, appVersion: h.appVersion, app: h.appVersion, calibStep: 0, team: 0,
      setupPoint: setup.points[h.id] || null, worn: h.online,
    };
  }
  function gameElapsed(t) { if (!run || !run.gameStartedAt) return 0; return (run.pausedAt || t) - run.gameStartedAt - run.pausedTotal; }

  function runView() {
    if (!run) return null;
    const t = now(), item = run.item;
    const gEl = gameElapsed(t);
    const gRem = item ? (run.gameStartedAt ? Math.max(0, item.minutes * 60e3 - gEl) : item.minutes * 60e3) : 0;
    const totalEl = t - run.startedAt;
    let totalRem = gRem;
    if (run.kind === 'playlist') totalRem += run.queue.slice(run.index + 1).reduce((a, q) => a + q.minutes * 60e3 + run.breakSec * 1000, 0);
    if (run.kind === 'party') totalRem += Math.max(0, run.maxGames - run.played - (item && run.state !== 'waiting' ? 1 : 0)) * (10 * 60e3 + run.breakSec * 1000);
    const scope = settings.clockScope;
    const queue = run.kind === 'party'
      ? [...run.queue.map((q, i) => ({ gameId: q.gameId, name: q.gameName, state: i === run.index && run.state !== 'waiting' ? 'now' : 'done' })),
        ...Array.from({ length: Math.max(0, run.maxGames - run.queue.length) }, () => ({ gameId: null, name: 'Vote', state: 'next' }))]
      : run.queue.map((q, i) => ({ gameId: q.gameId, name: q.gameName, difficulty: q.difficulty, minutes: q.minutes, state: i < run.index ? 'done' : i === run.index && run.state !== 'waiting' ? 'now' : 'next' }));
    const pausedBy = run.state === 'paused' ? run.players.map(p => p.headsetId).filter(id => run.dropped.has(id)) : [];
    return {
      id: run.id, kind: run.kind, state: run.state,
      gameId: item ? item.gameId : null, gameName: item ? item.gameName : null, mode: item ? item.mode : null,
      difficulty: item ? item.difficulty : null, kids: !!(item && item.kids), minutes: item ? item.minutes : null, options: (item && item.options) || {},
      clockScope: scope, startedAt: run.startedAt, gameStartedAt: run.gameStartedAt || null,
      elapsedMs: scope === 'all' ? totalEl : gEl, remainingMs: scope === 'all' ? totalRem : gRem,
      gameElapsedMs: gEl, gameRemainingMs: gRem, totalElapsedMs: totalEl, totalRemainingMs: totalRem,
      pausedBy, dropped: [...run.dropped.entries()].map(([id, at]) => ({ headsetId: id, sinceMs: t - at })),
      operatorPaused: run.operatorPaused, autoPaused: run.autoPaused,
      queue, index: run.index, maxGames: run.maxGames ?? null, played: run.played,
      breakSec: run.breakSec ?? null, voteSec: run.voteSec ?? null, birthday: !!run.birthday,
      vote: run.vote ? { on: run.voteOn, endsAt: run.vote.endsAt, counts: voteCounts(), options: run.vote.options, voted: Object.keys(run.vote.votes).length } : null,
      countdownEndsAt: run.state === 'countdown' ? run.countdownEndsAt : null,
      nextAt: run.state === 'waiting' ? (run.vote ? run.vote.endsAt : run.nextAt || null) : null,
      resultsEndsAt: run.state === 'results' ? run.resultsEndsAt : null,
      team: run.team, players: run.players.map(p => ({ headsetId: p.headsetId, n: p.n, name: p.name, color: p.color })), history: run.history,
      live: Object.fromEntries(run.players.map(p => [p.headsetId, { score: p.score, kills: p.kills, deaths: p.deaths }])),
      results: run.results, error: null,
    };
  }

  function gameReasons() {
    const out = {};
    for (const g of games) {
      let why = null;
      const online = headsets.filter(h => h.online && !h.benched);
      if (run && ['countdown', 'loading', 'playing', 'paused', 'results'].includes(run.state)) why = run.item && run.item.gameId === g.id ? 'Already running' : 'A session is running';
      else if (g.minArea && (calibration.width < g.minArea[0] || calibration.depth < g.minArea[1])) why = `Play area too small (needs ${g.minArea[0]}×${g.minArea[1]})`;
      else if (!online.length) why = 'No headset online';
      else if (!online.some(h => h.hasCalibration)) why = 'Not calibrated';
      else if (online.filter(h => h.hasCalibration && h.phase === 'idle').length < (g.minPlayers || 1)) why = `Needs ${g.minPlayers}+ headsets`;
      out[g.id] = why;
    }
    return out;
  }

  function snapshot() {
    return {
      type: 'state',
      headsets: headsets.map(headsetView),
      games: clone(games),
      calibration, calibrations: Object.fromEntries(headsets.filter(h => h.hasCalibration).map(h => [h.id, { version: calibration.version, width: calibration.width, depth: calibration.depth }])),
      zone, session: null, lastResult: null, scoresVersion, match: null, matchCfg: null, teamWant: {}, matchRunning: false,
      gameServer: false, serverAddresses: ['192.168.1.20'], play: { https: true, port: 47843, path: '/play/' },
      autoStart: { on: settings.autoStart, gameId: 'motel' }, pendingCalibration: null,
      // section 9 + S2 additions
      flow: flow ? { ...flow } : null, run: runView(), last, sessionState: run ? run.state : flow ? 'waiting' : 'idle',
      settings: clone(settings), precheck,
      setup: clone({ step: setup.step, entry: setup.entry, area: setup.area, ref: setup.ref, refAB: setup.refAB, points: setup.points, check: setup.check, errors: setup.errors }),
      usb: clone(usb), gameReasons: gameReasons(), recordsVersion: scoresVersion, scorecardsVersion, playlists: presets.map(p => p.name),
      mock: true,
    };
  }
  function push() { const s = snapshot(); for (const fn of listeners) fn(s); }
  setInterval(() => { tick(); push(); }, 500);

  // ---------- simulation ----------
  const inGame = s => ['countdown', 'loading', 'playing', 'paused'].includes(s);
  function tick() {
    const t = now();
    for (const h of headsets) {
      if (!h.online) continue;
      h.pos.x = Math.max(-2.8, Math.min(2.8, h.pos.x + rnd(-0.08, 0.08)));
      h.pos.z = Math.max(-2.8, Math.min(2.8, h.pos.z + rnd(-0.08, 0.08)));
      h.yaw += rnd(-0.2, 0.2);
      if (h.health.pingMs != null) h.health.pingMs = Math.max(3, Math.round(h.health.pingMs + rnd(-3, 3)));
      h.lastSeen = t;
      if (!h.charging && Math.random() < 0.01) h.battery = Math.max(1, h.battery - 1);
    }
    for (const u of usb) if (u.state === 'installing') { u.progress = Math.min(1, (u.progress || 0) + 0.08); if (u.progress >= 1) { u.state = 'done'; u.text = 'Done. It joins the Wi-Fi by itself.'; } }
    if (!run) return;
    const players = run.players.map(p => hsById(p.headsetId)).filter(Boolean);
    for (const h of players) { if (!h.online && !run.dropped.has(h.id) && !run.removed.has(h.id)) run.dropped.set(h.id, t); if (h.online) run.dropped.delete(h.id); }
    if (run.state === 'countdown' && t >= run.countdownEndsAt) {
      run.state = 'loading';
      for (const h of players) if (h.online) { h.phase = 'loading'; h.load = 0; }
    }
    if (run.state === 'loading') {
      for (const h of players) if (h.phase === 'loading') { h.load = Math.min(1, (h.load || 0) + rnd(0.06, 0.16)); if (h.load >= 1) h.phase = 'playing'; }
      if (players.every(h => h.phase === 'playing' || !h.online)) { run.state = 'playing'; run.gameStartedAt = t; run.pausedTotal = 0; }
    }
    if (run.state === 'playing' || run.state === 'paused') {
      const longGone = [...run.dropped.entries()].filter(([, at]) => t - at > 3000);
      if (longGone.length && run.state === 'playing') { run.state = 'paused'; run.pausedAt = t; run.autoPaused = true; }
      if (run.state === 'paused' && run.autoPaused && !run.operatorPaused && !run.dropped.size) {
        if (!run.backAt) run.backAt = t;
        if (t - run.backAt > 2000) resume();
      } else run.backAt = null;
      if (run.state === 'playing') {
        for (const p of run.players) { const h = hsById(p.headsetId); if (h && h.online) { p.score += Math.round(rnd(0, 60)); if (Math.random() < 0.2) p.kills++; if (Math.random() < 0.01) p.deaths++; } }
        if (run.item.minutes * 60e3 - gameElapsed(t) <= 0) finishGame('finished');
      }
    }
    if (run && run.state === 'results' && t > run.resultsEndsAt) { stopGame(); afterGame(); }
    if (run && run.state === 'waiting') {
      if (run.vote) {
        for (const p of run.players) if (Math.random() < 0.08 && !run.vote.votes[p.headsetId]) run.vote.votes[p.headsetId] = pick(run.vote.options).id;
        if (t >= run.vote.endsAt) closeVote();
      } else if (run.nextAt && t >= run.nextAt) {
        if (run.kind === 'party') openVote(); else startItem(run.queue[run.index]);
      }
    }
  }
  function voteCounts() { const c = {}; for (const o of run.vote.options) c[o.id] = 0; for (const g of Object.values(run.vote.votes)) if (g in c) c[g]++; return c; }
  function resume() { if (!run || run.state !== 'paused') return; run.pausedTotal += now() - run.pausedAt; run.pausedAt = 0; run.state = 'playing'; run.autoPaused = false; run.operatorPaused = false; run.backAt = null; }
  function stopGame() { for (const p of run.players) { const h = hsById(p.headsetId); if (h) { h.phase = 'idle'; h.load = null; } } }

  function finishGame(reason) {
    const t = now();
    if (run.state === 'paused') { run.pausedTotal += t - run.pausedAt; run.pausedAt = 0; }
    const g = gameDef(run.item.gameId);
    const sessionId = `${run.id}-${run.history.length + 1}`;
    let res = null;
    if (reason === 'finished') {
      const players = run.players.map(p => ({ id: p.headsetId, n: p.n, name: p.name, color: p.color, score: p.score, kills: p.kills, deaths: p.deaths, extra: {} }));
      const score = players.reduce((a, p) => a + p.score, 0);
      const rank = records.filter(r => r.gameId === run.item.gameId && r.difficulty === run.item.difficulty && r.score > score).length + 1;
      res = { score, won: true, team: run.team, difficulty: run.item.difficulty, players, extra: {}, sessionId, rank, newRecord: rank === 1, recordId: `r${t}`, scorecard: sessionId, gameId: g.id, gameName: g.name, minutes: run.item.minutes, kids: !!run.item.kids };
      records.push({ id: res.recordId, gameId: g.id, team: run.team, score, players: players.map(p => p.name), difficulty: run.item.difficulty, minutes: run.item.minutes, date: iso(t), kids: !!run.item.kids });
      cards.set(sessionId, { id: sessionId, base: `${iso(t).slice(0, 10).replace(/-/g, '')}_motel_${run.team.replace(/\W+/g, '-')}`, gameId: g.id, game: g.name, team: run.team, score, rank, newRecord: res.newRecord, difficulty: run.item.difficulty, minutes: run.item.minutes, date: iso(t), kids: !!run.item.kids, won: true, players, columns: g.scorecard.columns, venue: { ...settings.venue } });
      scoresVersion++; scorecardsVersion++;
    }
    run.history.push({ gameId: run.item.gameId, reason, score: res ? res.score : null });
    run.results = res;
    if (res) { run.state = 'results'; run.resultsEndsAt = t + settings.resultsSec * 1000; return; }
    stopGame();
    if (reason === 'stopped_by_operator' && run.kind === 'quick') return endRun();
    afterGame();
  }
  function afterGame() {
    if (run.kind === 'playlist') { run.index++; if (run.index >= run.queue.length) return endRun(); run.state = 'waiting'; run.nextAt = now() + run.breakSec * 1000; return; }
    if (run.kind === 'party') { run.played++; if (run.played >= run.maxGames) return endRun(); run.index++; run.state = 'waiting'; run.nextAt = now() + Math.max(0, run.breakSec - run.voteSec) * 1000; return; }
    endRun();
  }
  function endRun() {
    const r = run;
    last = { runId: r.id, kind: r.kind, endedAt: iso(now()), team: r.team, history: r.history, results: r.results, players: r.players.map(p => ({ headsetId: p.headsetId, n: p.n, name: p.name, color: p.color })) };
    run = null;
    if (flow) flow.step = 'end';
  }
  function openVote() {
    const one = run.games.length === 1, g0 = gameDef(run.games[0]);
    const opts = one ? LEVELS.map(l => ({ id: l.id, gameId: g0.id, difficulty: l.id, name: l.name, cover: g0.cover, hint: g0.name }))
      : run.games.map(gameDef).filter(Boolean).map(g => ({ id: g.id, gameId: g.id, name: g.name, cover: g.cover }));
    run.voteOn = one ? 'difficulty' : 'game';
    run.state = 'waiting'; run.nextAt = 0;
    run.vote = { endsAt: now() + run.voteSec * 1000, votes: {}, options: opts };
  }
  function closeVote() {
    const c = voteCounts(), best = Math.max(0, ...Object.values(c));
    const top = Object.keys(c).filter(k => c[k] === best);
    const unplayed = run.games.filter(id => !run.queue.some(q => q.gameId === id));
    const one = run.voteOn === 'difficulty';
    const choice = one ? run.games[0] : best > 0 ? pick(top) : (unplayed[0] || run.games[0]);
    const level = one && best > 0 ? pick(top) : run.difficulty;
    run.vote = null;
    const g = gameDef(choice);
    const it = { gameId: choice, gameName: g.name, mode: (g.modes.find(m => m.recommended) || g.modes[0]).id, minutes: g.cuts[0], difficulty: level, kids: run.kids, options: {} };
    run.queue.push(it);
    run.index = run.queue.length - 1;
    startItem(it);
  }
  function startItem(it) {
    run.item = it;
    run.state = 'countdown'; run.countdownEndsAt = now() + settings.countdownSec * 1000; run.gameStartedAt = 0; run.pausedTotal = 0; run.pausedAt = 0; run.nextAt = 0; run.results = null;
    for (const p of run.players) { p.score = 0; p.kills = 0; p.deaths = 0; }
  }
  function newRun(kind, body) {
    const ids = (body.headsetIds && body.headsetIds.length ? body.headsetIds : headsets.filter(h => h.online && !h.benched).map(h => h.id)).filter(id => hsById(id));
    const t = now();
    run = {
      id: `run-${t.toString(36)}`, kind, state: 'waiting', startedAt: t, gameStartedAt: 0, pausedTotal: 0, pausedAt: 0, item: null,
      queue: [], index: 0, played: 0, history: [], dropped: new Map(), removed: new Set(), operatorPaused: false, autoPaused: false,
      difficulty: body.difficulty || settings.difficulty, kids: !!body.kids, breakSec: body.breakSec ?? 60,
      team: (body.team || '').trim() || `Team ${new Date(t).toTimeString().slice(0, 5)}`,
      players: ids.map(id => { const h = hsById(id); return { headsetId: id, n: h.number, name: (body.names && body.names[id]) || h.name, color: h.color, score: 0, kills: 0, deaths: 0 }; }),
    };
    flow = flow || { kind, step: 'start' };
    return run;
  }
  const itemOf = (b, def = {}) => { const g = gameDef(b.gameId); return { gameId: g.id, gameName: g.name, mode: b.mode || (g.modes.find(m => m.recommended) || g.modes[0]).id, minutes: b.minutes || g.cuts[0], difficulty: b.difficulty || def.difficulty || settings.difficulty, kids: !!(b.kids ?? def.kids), options: b.options || {} }; };

  // ---------- routes ----------
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const fail = (error, code = 'bad_request', status = 400, extra = {}) => ({ __status: status, error, code, ...extra });

  function precheckFor(gameIds, ids) {
    const items = [];
    for (const id of ids) {
      const h = hsById(id);
      if (!h) continue;
      if (!h.online) { items.push({ headsetId: id, level: 'error', code: 'offline', text: 'Offline' }); continue; }
      if (h.battery < 20 && !h.charging) items.push({ headsetId: id, level: 'warn', code: 'battery', text: `Headset battery ${h.battery} %` });
      for (const side of ['left', 'right']) if (h.controllers[side] < 20) items.push({ headsetId: id, level: 'warn', code: `controller_${side}`, text: `${side === 'left' ? 'Left' : 'Right'} controller ${h.controllers[side]} %` });
      if (!h.hasCalibration) items.push({ headsetId: id, level: 'error', code: 'not_calibrated', text: 'Not calibrated', fix: 'recalibrate' });
      if (!h.inVR) items.push({ headsetId: id, level: 'warn', code: 'page', text: 'Page loaded, not in VR yet', fix: 'reload' });
    }
    precheck = { ok: !items.length, gameIds, headsetIds: ids, items, at: now() };
    return precheck;
  }
  function gate(gameIds, ids, ignore) {
    if (run) return fail('A session is running: stop it first', 'busy');
    const pc = precheckFor(gameIds, ids);
    if (!ignore && pc.items.length) return fail('The pre-start check found problems', 'precheck', 400, { items: pc.items });
    return null;
  }

  const routes = {
    'GET /api/state': () => snapshot(),
    'POST /api/flow/open': b => { flow = { kind: b.kind, step: b.step || 'game' }; return ok({ flow, run: runView() }); },
    'POST /api/flow/close': () => { if (run) return fail('A session is running: stop it first', 'busy'); flow = null; return ok({ flow: null }); },
    'POST /api/flow/step': b => { if (flow) flow.step = b.step; return ok({ flow }); },
    'GET /api/precheck': (b, q) => { const r = precheckFor([q.get('gameId')], (q.get('headsetIds') || '').split(',').filter(Boolean)); return { ok: r.ok, items: r.items }; },
    'POST /api/session/start': b => {
      if (!gameDef(b.gameId)) return fail('No such game', 'no_game');
      const e = gate([b.gameId], b.headsetIds || [], b.ignoreWarnings); if (e) return e;
      newRun('quick', b); run.queue = [itemOf(b)]; startItem(run.queue[0]);
      return ok({ run: runView() });
    },
    'POST /api/session/pause': b => { if (!run) return fail('Nothing runs', 'idle'); if (b.on !== false && run.state === 'playing') { run.state = 'paused'; run.pausedAt = now(); run.operatorPaused = true; } else if (b.on === false) resume(); return ok({ run: runView() }); },
    'POST /api/session/difficulty': b => { if (run && run.item) run.item.difficulty = b.level; return ok({ live: true, run: runView() }); },
    'POST /api/session/stage': () => { if (run) for (const p of run.players) p.score += 500; return ok({ run: runView() }); },
    'POST /api/session/restart': () => { if (!run || !run.item) return fail('Nothing runs', 'idle'); stopGame(); startItem(run.item); return ok({ run: runView() }); },
    'POST /api/session/stop': b => { if (!run) return ok({ run: null, last }); if (inGame(run.state)) { const k = run.kind; run.kind = 'quick'; finishGame(b.reason || 'stopped_by_operator'); if (run) { run.kind = k; endRun(); } } else endRun(); return ok({ run: null, last }); },
    'POST /api/session/continue': () => { if (!run) return ok(); for (const [id] of run.dropped) run.removed.add(id); run.players = run.players.filter(p => !run.dropped.has(p.headsetId)); run.dropped.clear(); resume(); return ok({ run: runView() }); },
    'POST /api/playlist/start': b => {
      if (!b.items || !b.items.length) return fail('The playlist is empty');
      const e = gate(b.items.map(i => i.gameId), b.headsetIds || [], b.ignoreWarnings); if (e) return e;
      newRun('playlist', b); run.queue = b.items.map(i => itemOf(i, b)); startItem(run.queue[0]);
      return ok({ run: runView() });
    },
    'POST /api/playlist/next': () => { if (!run) return fail('Nothing runs', 'idle'); if (inGame(run.state)) { stopGame(); run.history.push({ gameId: run.item.gameId, reason: 'stopped_by_operator', score: null }); afterGame(); } else if (run.state === 'results') { stopGame(); afterGame(); } if (run && run.state === 'waiting') run.nextAt = now() + 1500; return ok({ run: runView() }); },
    'GET /api/playlist/presets': () => ok({ presets: clone(presets) }),
    'POST /api/playlist/presets': b => { if (b.remove) presets = presets.filter(p => p.name !== b.remove); else { presets = presets.filter(p => p.name !== b.name); presets.push(clone(b)); } return ok({ presets: clone(presets) }); },
    'POST /api/party/start': b => {
      const list = b.games && b.games.length ? b.games : games.map(g => g.id);
      if (run) return fail('A session is running: stop it first', 'busy');
      newRun('party', b); Object.assign(run, { games: list, maxGames: b.maxGames || 3, voteSec: b.voteSec || 20, breakSec: b.breakSec || 30, birthday: !!b.birthday });
      openVote();
      return ok({ run: runView() });
    },
    'POST /api/party/skipvote': () => { if (run && run.vote) run.vote.endsAt = now(); return ok({ run: runView() }); },
    'POST /api/headset/action': b => {
      const h = hsById(b.headsetId);
      if (!h) return fail('No such headset', 'not_found');
      if (b.action === 'bench') h.benched = !!b.value;
      if (b.action === 'recalibrate') { h.hasCalibration = false; h.needsCalibration = 'operator'; walk(h.id, false); }
      if (b.action === 'reboot') { h.online = false; setTimeout(() => { h.online = true; }, 6000); }
      if (b.action === 'reload') { h.inVR = false; setTimeout(() => { h.inVR = true; }, 2500); }
      return ok();
    },
    'POST /api/headset/rename': b => { const h = hsById(b.headsetId); if (h) h.name = b.name; return ok(); },
    'POST /api/headset/identify': () => ok(),
    'POST /api/headset/volume': b => { const h = hsById(b.headsetId); if (h) h.volume = b.value; return ok(); },
    'POST /api/endmessage': b => ok({ sent: (b.headsetIds || headsets.filter(h => h.online).map(h => h.id)).length }),
    'GET /api/records': (b, q) => {
      const gid = q.get('gameId') || q.get('game'), period = q.get('period') || 'all';
      const lim = { day: 1, today: 1, week: 7, month: 30 }[period];
      let list = records.filter(r => (!gid || r.gameId === gid) && (!lim || now() - Date.parse(r.date) < lim * 86400e3));
      list = list.sort((a, c) => c.score - a.score).slice(0, 100).map((r, i) => ({ ...r, rank: i + 1 }));
      return ok({ records: list, total: list.length });
    },
    'POST /api/records/rename': b => { const r = records.find(x => x.id === b.id); if (r) r.team = b.team; scoresVersion++; return ok(); },
    'POST /api/records/remove': b => { records = records.filter(x => x.id !== b.id); scoresVersion++; return ok(); },
    'GET /api/scorecards': () => ok({ version: scorecardsVersion, scorecards: [...cards.values()].sort((a, c) => Date.parse(c.date) - Date.parse(a.date)).map(c => ({ id: c.id, base: c.base, game: c.game, gameId: c.gameId, team: c.team, score: c.score, rank: c.rank, date: c.date, png: null, json: null })) }),
    'GET /api/scorecard': (b, q) => { const c = cards.get(q.get('id')) || [...cards.values()].find(x => x.base === q.get('id')); return c ? ok({ scorecard: { ...c, venue: { ...settings.venue } } }) : fail('No such scorecard', 'not_found', 404); },
    'POST /api/scorecards/remove': b => { cards.delete(b.id); scorecardsVersion++; return ok(); },
    'POST /api/scorecards/png': () => ok({ png: null }),
    'POST /api/scorecards/print': () => (settings.printer.kind === 'thermal' ? ok({ queued: true }) : fail('The printer in Settings is the system printer: print from the browser', 'system_printer')),
    'GET /api/settings': () => ok({ settings: clone(settings) }),
    'POST /api/settings': b => { mergeSettings(b); return ok({ settings: clone(settings) }); },
    'GET /api/diagnose': () => ok({
      at: iso(now()), pc: { addresses: ['192.168.1.20', '172.24.0.1'], chosen: '192.168.1.20', hostname: 'ARENA-PC', version: '2.0.0' },
      checks: [
        { id: 'pc.addresses', group: 'pc', label: 'PC addresses', ok: true, level: 'ok', value: '192.168.1.20, 172.24.0.1' },
        { id: 'pc.adapter', group: 'pc', label: 'Adapter the headsets use', ok: true, level: 'ok', value: '192.168.1.20' },
        { id: 'pc.version', group: 'pc', label: 'MS Games version', ok: true, level: 'ok', value: '2.0.0 · page build 36' },
        { id: 'pc.firewall', group: 'pc', label: 'Firewall rule', ok: false, level: 'error', value: 'UDP missing', text: 'Headsets cannot reach this PC through the Windows firewall: press Fix and allow the prompt.', fix: 'firewall' },
        ...headsets.flatMap(h => (h.online ? [
          { id: `hs.${h.id}.pcping`, group: 'headset', headsetId: h.id, label: `${h.name}: ping from PC`, ok: true, level: h.health.pingMs > 60 ? 'warn' : 'ok', value: `${h.health.pingMs} ms` },
          { id: `hs.${h.id}.backping`, group: 'headset', headsetId: h.id, label: `${h.name}: ping to PC`, ok: true, level: 'ok', value: `${h.health.pingMs + 2} ms` },
          { id: `hs.${h.id}.build`, group: 'headset', headsetId: h.id, label: `${h.name}: page version`, ok: true, level: 'ok', value: '36 · app 2.0.0' },
        ] : [{ id: `hs.${h.id}.online`, group: 'headset', headsetId: h.id, label: `${h.name}: connected`, ok: false, level: 'error', value: 'offline', text: 'Put the headset on, check it is on the same Wi-Fi, and open MS Games in it.' }])),
      ],
      router: ['A router only for the arena, nothing else on it.', 'One network name on 5 GHz (or 6 GHz); no band merging.', 'This PC on a cable to the router.', 'The router close to the play area, on a free channel.', 'Only the arena network saved on each headset.'],
    }),
    'POST /api/firewall/fix': () => ok({ skipped: true, reason: 'mock: nothing to change' }),
    'POST /api/bugreport': b => ok({ file: `C:\\Users\\Operator\\Desktop\\MS-Games-bug-${iso(now()).slice(0, 16).replace(/[:T]/g, '-')}.zip`, note: b.note }),
    'GET /api/usb': () => ok({ usb: clone(usb), apk: 'MSGames-Headset.apk' }),
    'POST /api/usb/install': b => { const u = usb.find(x => x.serial === b.serial); if (!u) return fail('That headset is not on the cable', 'not_found'); if (u.state === 'allow') return fail('Allow USB debugging in the headset first', 'unauthorized'); u.state = 'installing'; u.text = 'Installing the app'; u.progress = 0; return ok({ queued: true }); },
    'POST /api/setup': b => { if ('step' in b) setup.step = b.step; if ('entry' in b) setup.entry = b.entry; if (b.reset === 'points' || b.reset === 'all') { setup.points = {}; setup.check = {}; } return ok({ setup: snapshot().setup }); },
    'POST /api/setup/area': b => {
      if (run && inGame(run.state)) return fail('Stop the game before changing the play area', 'busy');
      if (b.kind === 'draw') { setup.area = { kind: 'draw', headsetId: b.headsetId }; setup.ref = b.headsetId; drawZone(); return ok({ setup: snapshot().setup }); }
      setup.area = { kind: 'preset', w: b.w, d: b.d, rotation: b.rotation || 0, entrance: b.entrance || 'middle' };
      calibration = { ...calibration, width: b.w, depth: b.d, version: calibration.version + 1 };
      return ok({ setup: snapshot().setup });
    },
    'POST /api/setup/points': b => {
      if (b.headsetId) { setup.ref = b.headsetId; setup.points = {}; setup.check = {}; walk(b.headsetId, true); }
      if (b.sync) for (const h of headsets) if (h.id !== setup.ref) walk(h.id, false);
      if (b.redo) { delete setup.check[b.redo]; walk(b.redo, b.redo === setup.ref); }
      return ok({ setup: snapshot().setup });
    },
    'POST /api/launch': b => routes['POST /api/session/start'](b),
    'POST /api/stop': () => routes['POST /api/session/stop']({}),
    'POST /api/autostart': b => { settings.autoStart = !!b.on; return ok(); },
    'GET /api/scores': (b, q) => {
      const r = routes['GET /api/records'](b, new URLSearchParams({ gameId: q.get('game') || '', period: q.get('period') || 'all' }));
      return { list: r.records.map(x => ({ id: x.id, rank: x.rank, team: x.team, score: x.score, players: x.players.map(n => ({ name: n })), at: x.date, size: x.players.length })), total: r.total };
    },
    'GET /api/calibration/previous': () => ({ previous: { file: 'cal-6.json', savedAt: ago(1), width: 6, depth: 6, headsets: ['q1', 'q2'] } }),
  };

  // the drawing grows point by point, like the laser in the headset
  function drawZone() {
    const pts = [[-2.6, -2.1], [2.7, -2.3], [2.8, 2.2], [0.4, 2.5], [-2.5, 2.3]];
    zone = { poly: [], obstacles: [] };
    pts.forEach((p, i) => setTimeout(() => { zone.poly = pts.slice(0, i + 1); }, 900 * (i + 1)));
    setTimeout(() => { zone.obstacles = [[[0.8, 0.4], [1.4, 0.4], [1.4, 1.0], [0.8, 1.0]]]; calibration = { ...calibration, width: 5.4, depth: 4.8 }; }, 900 * 6);
  }
  // one headset walks to mark A, then B
  function walk(id, first) {
    const h = hsById(id);
    if (!h.online) { setup.points[id] = 'waiting'; return; }
    setup.points[id] = 'p1';
    const d = first ? 0 : rnd(600, 3500);
    setTimeout(() => { setup.points[id] = 'p2'; }, d + 2200);
    setTimeout(() => {
      setup.points[id] = 'done'; h.hasCalibration = true; h.needsCalibration = null; h.anchor = 'ok';
      if (first) setup.refAB = 2.04;
      else { const delta = id === 'q3' ? 0.071 : Math.round(rnd(0.002, 0.03) * 1000) / 1000; setup.check[id] = { abDelta: delta, ab: 2.04 + delta, ok: delta <= 0.05 }; }
    }, d + 4400);
  }

  // ---------- fetch shim ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = (init.method || 'GET').toUpperCase();
    if (url.pathname === '/live/status.json') return new Response('{}', { status: 404 });
    const fn = routes[`${method} ${url.pathname}`];
    if (!fn) {
      if (url.pathname.startsWith('/api/')) return method === 'POST' ? (setTimeout(push, 0), json({ ok: true, mock: 'no-op' })) : json({ error: 'Not in the mock', code: 'not_found' }, 404);
      return realFetch(input, init);
    }
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
    await new Promise(r => setTimeout(r, 60));
    const out = fn(body, url.searchParams) || {};
    setTimeout(push, 0);
    const status = out.__status || 200;
    delete out.__status;
    return json(out, status);
  };
  function json(v, status = 200) { return new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } }); }

  // ---------- socket shim: the console subscribes here instead of opening /ui ----------
  window.MSMock = { subscribe(fn) { listeners.add(fn); setTimeout(() => fn(snapshot()), 30); return () => listeners.delete(fn); } };

  // ---------- debug helpers ----------
  window.mock = {
    drop(id) { const h = hsById(id); h.online = false; h.droppedAt = now(); push(); },
    back(id) { const h = hsById(id); h.online = true; h.droppedAt = null; push(); },
    battery(id, v) { hsById(id).battery = v; push(); },
    finish() { if (run && inGame(run.state)) { run.item.minutes = 0; tick(); } push(); },
    usb(n = 3) { usb = [{ serial: '2G0YC5ZF8R0Q1', model: 'Quest 3', product: 'eureka', state: 'ready', text: 'Ready to install' }, { serial: '1WMHH8152P0211', model: 'Quest 2', product: 'hollywood', state: 'allow', text: 'Put the headset on and allow USB debugging' }, { serial: '340YC10G9W02', model: 'Quest 3', product: 'eureka', state: 'failed', error: 'The cable only charges. Use a USB data cable.' }].slice(0, n); push(); },
    get state() { return snapshot(); },
    scene(name) {
      if (name === 'busy') { flow = { kind: 'quick', step: 'start' }; routes['POST /api/session/start']({ gameId: 'motel', headsetIds: ['q1', 'q2', 'q4', 'q5'], difficulty: 'normal', minutes: 10, team: 'NIGHT OWLS', ignoreWarnings: true }); }
      push();
    },
  };
  if (qs.get('scene')) setTimeout(() => window.mock.scene(qs.get('scene')), 50);
  if (qs.has('usb')) window.mock.usb(3);
})();

// End-to-end test of the session engine against a running dev server with simulated headsets (S2).
//
//   node tools/dev-server.mjs --port 47932 --data data-dev-s2      (in another terminal)
//   node tools/s2-e2e.mjs [port] [parts]       parts: setup,quick,labcoin,playlist,party,ops (or all, the default) and draw
//
// The Motel runs with `fast` (its trial cut: time runs 6x faster, about 100 s a game). A full run takes about 10 minutes:
// detach it, e.g. `(node tools/s2-e2e.mjs 47932 > e2e.log 2>&1; echo EXIT $? >> e2e.log) &` (a tool's 2-minute command limit
// kills a plain foreground or background run). If this process is killed midway its simulated headsets drop together and the engine,
// as designed, auto-pauses the running game and waits for them (it ends such a run by itself after 10 minutes).

import { createSim } from './sim-headsets.js';

const PORT = Number(process.argv[2] || 47932);
const PARTS = (process.argv[3] || 'all').split(',');
const want = p => PARTS.includes('all') || PARTS.includes(p);
const BASE = `http://localhost:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const say = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
let failures = 0;
const check = (ok, what, extra = '') => { if (ok) say('  ok  ', what); else { failures++; say('  FAIL', what, extra); } };

async function api(method, route, body) {
  const r = await fetch(BASE + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !body?.__allowError) throw Object.assign(new Error(`${method} ${route}: ${j.error || r.status}`), { body: j });
  return j;
}
const post = (r, b = {}) => api('POST', r, b);
const get = r => api('GET', r);
const state = () => get('/api/state');
async function until(what, fn, timeoutMs = 30_000, every = 250) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await wait(every); }
  throw new Error(`timed out waiting for: ${what}`);
}
const runState = async () => (await state()).run?.state || (await state()).sessionState;

const sims = createSim(3, `ws://localhost:${PORT}/headset`, i => ({ id: `SIM00${i}`, name: `Sim ${i + 1}`, abError: i === 2 ? 0.08 : 0, autoVote: (n, options) => (options?.some(o => o.id === 'hard') ? (n < 2 ? 'hard' : 'easy') : options?.[0]?.id) }));
const ids = sims.map(s => s.id);

async function setupPart() {
  say('== setup: preset 6x6 placed from the first headset, then sync with the A–B check');
  await until('sims connected', async () => (await state()).headsets.filter(h => ids.includes(h.id) && h.online).length === 3);
  try { await post('/api/session/stop'); } catch { /* none */ }
  try { await post('/api/flow/close'); } catch { /* none */ }
  await post('/api/settings', { resultsSec: 8, countdownSec: 3, autoStart: false, endMessage: { preset: 'thanks' }, clockScope: 'game' });
  await post('/api/setup', { entry: 'first', step: 'area', reset: 'all' });
  const area = await post('/api/setup/area', { kind: 'preset', w: 6, d: 6, rotation: 0, entrance: 'middle' });
  check(area.preview?.hall?.w === 6, 'area preview 6 x 6');
  await post('/api/setup/points', { headsetId: ids[0] });
  const s1 = await until('first headset done', async () => { const s = await state(); return s.setup.points[ids[0]] === 'done' && s; });
  check(Math.abs(s1.setup.refAB - 2.5) < 0.01, `reference A–B ${s1.setup.refAB} m`);
  check(s1.zone?.preset?.w === 6 && s1.zone.hall.w === 6, 'zone is the preset rectangle');
  check(!!s1.calibrations[ids[0]], 'first headset calibrated');
  await post('/api/setup/points', { sync: true });
  const s2 = await until('sync done', async () => { const s = await state(); return ids.every(id => s.setup.points[id] === 'done') && s; });
  check(s2.setup.check[ids[1]].ok === true, `headset 2 A–B delta ${s2.setup.check[ids[1]].abDelta}`);
  check(s2.setup.check[ids[2]].ok === false && Math.abs(s2.setup.check[ids[2]].abDelta - 0.08) < 0.01, `headset 3 off by ${s2.setup.check[ids[2]].abDelta} m → amber`);
  sims[2].st.abError = 0;
  await post('/api/setup/points', { redo: ids[2] });
  const s3 = await until('redo done', async () => { const s = await state(); return s.setup.check[ids[2]]?.ok === true && s; });
  check(!!s3, 'redo brings headset 3 within 5 cm');
  await until('calibrations confirmed by the headsets', async () => (await state()).headsets.filter(h => ids.includes(h.id)).every(h => h.calibrated), 5000);
  check(true, 'all three calibrated and confirmed (calibApplied)');
  // headset reports lost anchors → card amber, precheck flags it, recalibrate clears it
  sims[1].send({ type: 'needsCalibration', reason: 'anchors-lost' });
  await wait(300);
  const pc = await get(`/api/precheck?gameId=motel&headsetIds=${ids.join(',')}`);
  check(pc.items.some(i => i.headsetId === ids[1] && i.code === 'needs_calibration'), 'precheck flags needsCalibration with Fix', JSON.stringify(pc.items));
  await post('/api/headset/action', { headsetId: ids[1], action: 'recalibrate' });
  sims[1].send({ type: 'needsCalibration', reason: null });
  await until('recalibrated', async () => (await state()).setup.points[ids[1]] === 'done');
  check(true, 'per-headset recalibrate (points only) done');
  await until('recalibration confirmed', async () => (await state()).headsets.filter(h => ids.includes(h.id)).every(h => h.calibrated), 5000);
}

async function quickPart() {
  say('== quick play: countdown → playing → drop → auto-pause → back → resume → results → records + sessions.jsonl');
  const before = (await get('/api/sessions?limit=500')).sessions.length;
  await post('/api/flow/open', { kind: 'quick' });
  await wait(1200);
  check(sims.every(s => s.seen('lobby').length > 0), 'every headset got the waiting room on flow/open');
  const pc = await get(`/api/precheck?gameId=motel&headsetIds=${ids.join(',')}`);
  check(pc.ok, `precheck clean (${pc.items.length} items)`, JSON.stringify(pc.items));
  const r = await post('/api/session/start', { gameId: 'motel', difficulty: 'hard', minutes: 10, headsetIds: ids, team: 'S2 Wolves', fast: true });
  check(r.run.state === 'countdown', 'countdown first');
  await wait(400);
  check(sims.every(s => s.seen('countdown').some(m => m.seconds === 3)), 'countdown {seconds:3} in all headsets');
  await until('playing', async () => (await runState()) === 'playing', 30_000);
  check(sims.every(s => s.seen('gameStart').length > 0), 'gameStart in all headsets');
  const st1 = await state();
  check(st1.headsets.filter(h => ids.includes(h.id)).every(h => h.state === 'Playing'), 'cards say Playing');
  await wait(2000);
  say('  drop Sim 2');
  sims[1].drop();
  await wait(2000);
  check((await runState()) === 'playing', 'a 2 s drop does not pause yet');
  await until('auto-pause', async () => (await runState()) === 'paused', 6000);
  const p = await state();
  check(p.run.pausedBy.includes(ids[1]) && p.run.autoPaused, `paused by ${p.run.pausedBy}`);
  check(p.headsets.find(h => h.id === ids[1]).state === 'Dropped', 'card says Dropped');
  check(sims[0].seen('pause').some(m => m.on && m.who.includes('Sim 2')), 'pause {on, who:[Sim 2]} in the other headsets');
  const el1 = p.run.gameElapsedMs;
  await wait(4000);
  const el2 = (await state()).run.gameElapsedMs;
  check(el2 === el1, `clock frozen while paused (${el1} → ${el2})`);
  say('  Sim 2 back');
  const startsBefore = sims[1].seen('gameStart').length;
  sims[1].back();
  await until('rejoined', async () => sims[1].seen('gameStart').length > startsBefore, 8000);
  check(true, 'returning headset pulled straight back into the running game');
  await until('resume', async () => (await runState()) === 'playing', 8000);
  check(sims[0].seen('pause').some(m => m.on === false), 'resumed by itself after the headset came back');
  const d = await post('/api/session/difficulty', { level: 'nightmare' });
  check(d.live === true, 'difficulty changed live');
  await post('/api/session/pause', { on: true });
  check((await runState()) === 'paused', 'operator pause');
  await post('/api/session/pause', { on: false });
  check((await runState()) === 'playing', 'operator resume');
  await post('/api/headset/action', { headsetId: ids[0], action: 'message', value: 'Drink water' });
  await post('/api/headset/action', { headsetId: ids[0], action: 'identify' });
  await post('/api/headset/action', { headsetId: ids[0], action: 'swapHands' });
  await post('/api/headset/action', { headsetId: ids[0], action: 'calibrateHeight', value: 180 });
  await wait(300);
  check(sims[0].seen('message').some(m => m.text === 'Drink water' && m.seconds === 6), 'message {text, seconds:6}');
  check(sims[0].seen('swapHands').length === 1 && sims[0].seen('calibrateHeight').some(m => m.cm === 180), 'swapHands and calibrateHeight');
  const rs = sims[2].seen('gameStart').length;
  await post('/api/headset/action', { headsetId: ids[2], action: 'restartGame' });
  await until('restart rejoin', async () => sims[2].seen('gameStart').length > rs, 6000);
  check(sims[2].seen('restartGame').length === 1, 'per-headset restartGame: left and rejoined');
  const v = (await state()).run;
  check(v.remainingMs > 0 && v.remainingMs < 120_000 && v.clockScope === 'game', `remaining ${Math.round(v.remainingMs / 1000)} s (from the game's own clock)`);
  say('  waiting for the game to end by itself (trial cut, ~100 s)');
  await until('results', async () => (await runState()) === 'results', 200_000, 1000);
  const res = (await state()).run.results;
  check(res && res.score >= 0 && res.rank === 1 && res.newRecord, `results: score ${res?.score}, rank ${res?.rank}, new record`);
  check(Array.isArray(res.players) && res.players.length === 3 && res.players.every(p => p.name), `per-player rows: ${res.players.map(p => `${p.name} ${p.score}/${p.kills}/${p.deaths}`).join(', ')}`);
  await wait(500);
  check(sims.every(s => s.seen('results').some(m => m.team === 'S2 Wolves' && m.seconds === 8)), 'results shown in the headsets for resultsSec');
  await until('back to waiting room', async () => (await state()).sessionState === 'waiting' && !(await state()).run, 15_000);
  const s = await state();
  check(s.last?.results?.score === res.score, 'End view: last.results kept');
  check(sims.every(x => x.seen('endMessage').some(m => m.preset === 'thanks')), 'end message preset sent');
  await wait(1500);
  check(sims.every(x => x.st.shows === 'lobby'), 'waiting room reopened in every headset');
  const rec = await get('/api/records?gameId=motel');
  check(rec.list.some(e => e.team === 'S2 Wolves' && e.score === res.score && e.difficulty === 'nightmare'), 'record saved (game + difficulty)');
  const sess = (await get('/api/sessions?limit=500')).sessions;
  const last = sess[0];
  check(sess.length === before + 1 && last.reason === 'finished' && last.result.score === res.score && last.headsets.length === 3, `sessions.jsonl: ${last.reason}, ${last.game}, ${last.players.join(', ')}, paused ${Math.round(last.pausedMs / 1000)} s`);
  const cards = await get('/api/scorecards');
  check(cards.scorecards.some(c => c.id === res.sessionId), 'scorecard sidecar saved');
  const card = await get(`/api/scorecard?id=${encodeURIComponent(res.sessionId)}`);
  check(card.scorecard.team === 'S2 Wolves' && card.scorecard.rank === 1, 'GET /api/scorecard returns it');
}

async function playlistPart() {
  say('== playlist: two games with a break');
  try { await post('/api/flow/close'); } catch { /* fine */ }
  await post('/api/flow/open', { kind: 'playlist' });
  await post('/api/playlist/presets', { name: 'S2 test', items: [{ gameId: 'motel', minutes: 10 }, { gameId: 'motel', mode: 'short', minutes: 10 }], breakSec: 6 });
  const pre = await get('/api/playlist/presets');
  check(pre.presets.some(p => p.name === 'S2 test'), 'preset saved');
  const before = (await get('/api/sessions?limit=500')).sessions.length;
  const r = await post('/api/playlist/start', { items: [{ gameId: 'motel', fast: true }, { gameId: 'motel', mode: 'short', fast: true }], breakSec: 6, difficulty: 'easy', team: 'S2 List', headsetIds: ids });
  check(r.run.queue.map(q => q.state).join() === 'now,next', 'queue now,next');
  await until('game 1 results', async () => (await runState()) === 'results', 200_000, 1000);
  check(true, 'game 1 finished');
  await until('break', async () => { const s = await state(); return s.run?.state === 'waiting' && s.run; }, 20_000);
  const b = (await state()).run;
  check(b.queue.map(q => q.state).join() === 'done,next' && b.nextAt > Date.now() - 1000, 'break in the waiting room, queue done,next');
  await until('game 2 countdown', async () => (await runState()) === 'countdown', 15_000);
  check((await state()).run.mode === 'short', 'second item (short mode) starts by itself after the break');
  await until('game 2 results', async () => (await runState()) === 'results', 200_000, 1000);
  await until('playlist over', async () => !(await state()).run, 20_000);
  const sess = (await get('/api/sessions?limit=500')).sessions;
  check(sess.length === before + 2 && sess.slice(0, 2).every(e => e.reason === 'finished' && e.kind === 'playlist' && e.difficulty === 'easy'), 'two finished playlist games in sessions.jsonl');
}

async function partyPart() {
  say('== party with The Motel only: each round the players vote on the difficulty');
  try { await post('/api/flow/close'); } catch { /* fine */ }
  await post('/api/flow/open', { kind: 'party' });
  const before = (await get('/api/sessions?limit=500')).sessions.length;
  const r = await post('/api/party/start', { games: ['motel'], maxGames: 2, voteSec: 10, breakSec: 20, birthday: true, team: 'S2 Party', fast: true });
  check(r.run.state === 'waiting' && r.run.vote?.on === 'difficulty', 'vote open, on the difficulty (one game)');
  await wait(2500);
  check(sims.every(s => s.seen('vote').some(m => m.on === 'difficulty' && m.options.length === 4)), 'vote {on, options:[easy..nightmare], endsAt} in every headset');
  const v = (await state()).run.vote;
  check(v.counts.hard === 2 && v.counts.easy === 1 && v.voted === 3, `votes counted: ${JSON.stringify(v.counts)}`);
  await until('vote ends → countdown', async () => (await runState()) === 'countdown', 15_000);
  check(sims.every(s => s.seen('voteEnd').some(m => m.id === 'hard' && m.gameId === 'motel')), 'voteEnd {id:hard, gameId:motel} in every headset');
  check((await state()).run.difficulty === 'hard', 'the round runs at the voted difficulty');
  check(sims[0].seen('lobby').some(m => m.birthday === true), 'birthday waiting room');
  await until('party game 1 results', async () => (await runState()) === 'results', 200_000, 1000);
  await until('second vote', async () => !!(await state()).run?.vote, 40_000);
  check(true, 'second vote opened after the break');
  await post('/api/party/skipvote');
  check(['countdown', 'loading'].includes(await runState()), 'skip vote → straight to the countdown');
  await until('party game 2 results', async () => (await runState()) === 'results', 200_000, 1000);
  await until('party over', async () => !(await state()).run, 20_000);
  const sess = (await get('/api/sessions?limit=500')).sessions;
  check(sess.length === before + 2 && sess.slice(0, 2).every(e => e.kind === 'party' && e.reason === 'finished'), 'party ended at maxGames with 2 games logged');
}

async function opsPart() {
  say('== operations and the old routes');
  try { await post('/api/flow/close'); } catch { /* fine */ }
  // operator stop and continue-without
  await post('/api/flow/open', { kind: 'quick' });
  const bad = await api('POST', '/api/session/start', { gameId: 'motel', headsetIds: [...ids, 'NOPE'], __allowError: true });
  check(bad.code === 'precheck' && bad.items.some(i => i.code === 'offline'), 'pre-start gate lists problems', JSON.stringify(bad));
  await post('/api/session/start', { gameId: 'motel', headsetIds: [...ids, 'NOPE'], ignoreWarnings: true, fast: true });
  await until('playing', async () => (await runState()) === 'playing', 30_000);
  sims[2].drop();
  await until('paused', async () => (await runState()) === 'paused', 8000);
  const c = await post('/api/session/continue');
  check(c.removed.includes(ids[2]) && (await runState()) === 'playing', 'Continue without the dropped headset');
  const st = await post('/api/session/stage', { stage: 'wave' });
  check(!!st.ok, 'stage control (Motel: next wave now)');
  await post('/api/session/stop');
  const sess = (await get('/api/sessions?limit=5')).sessions[0];
  check(sess.reason === 'stopped_by_operator', 'operator stop logged as stopped_by_operator');
  sims[2].back();
  await wait(1500);
  // old POST /api/launch maps onto a quick session
  await post('/api/flow/close');
  const l = await post('/api/launch', { gameId: 'motel', headsetIds: [ids[0]], fast: true });
  check(l.run?.kind === 'quick' && l.run.state === 'countdown', 'old /api/launch → quick session with countdown');
  await until('playing', async () => (await runState()) === 'playing', 30_000);
  const l2 = await post('/api/launch', { gameId: 'motel', headsetIds: [ids[1]] });
  check(l2.run.players.length === 2, 'old /api/launch with the same game: late headset joins');
  await post('/api/stop');
  check(!(await state()).run, 'old /api/stop ends the session');
  const dg = await get('/api/diagnose');
  check(Array.isArray(dg.checks) && dg.checks.some(x => x.id === 'pc.firewall'), `diagnose: ${dg.checks.length} checks, ${dg.summary.errors} errors`);
  const fw = await post('/api/firewall/fix');
  check(fw.skipped === true, 'firewall fix does not ask for elevation on a dev server');
  const br = await post('/api/bugreport', { note: 'S2 end-to-end test' });
  check(br.file && br.files.includes('sessions-tail.jsonl') && br.bytes > 1000, `bug report ${br.file} (${br.bytes} bytes)`);
  const usb = await get('/api/usb');
  check(Array.isArray(usb.usb), `usb list (${usb.usb.length} on the cable)`);
  await post('/api/flow/open', { kind: 'quick' });
  const k1 = await get(`/api/keep?id=${ids[0]}`);
  await post('/api/flow/close');
  const k2 = await get(`/api/keep?id=${ids[0]}`);
  check(k1.keep === true && k2.keep === false, 'GET /api/keep: true while a mode is open, false when idle');
  const csv = await fetch(`${BASE}/api/records?gameId=motel&format=csv`).then(r => r.text());
  check(/^﻿?rank,game,team/.test(csv), 'records CSV export');
}

async function drawPart() {
  say('== setup: draw in the headset, the drawer is the first headset, then sync');
  try { await post('/api/session/stop'); } catch { /* none */ }
  await post('/api/setup', { entry: 'resetArea', reset: 'all' });
  await post('/api/setup/area', { kind: 'draw', headsetId: ids[1] });
  const s = await until('drawn', async () => { const x = await state(); return x.setup.points[ids[1]] === 'done' && x.zone && !x.zone.preset && x; }, 15_000);
  check(s.setup.ref === ids[1] && s.zone.hall.w >= 4, `drawn zone ${s.zone.hall.w} x ${s.zone.hall.d}, drawer is the first headset`);
  await post('/api/setup/points', { sync: true });
  const s2 = await until('sync after draw', async () => { const x = await state(); return ids.every(id => x.setup.points[id] === 'done') && x; }, 15_000);
  check(s2.setup.check[ids[0]]?.ok === true && s2.setup.check[ids[2]]?.ok === false, `others aligned to the drawn marks; the 8 cm-off headset is flagged: ${JSON.stringify(s2.setup.check)}`);
  await until('confirmed', async () => (await state()).headsets.filter(h => ids.includes(h.id)).every(h => h.calibrated), 5000);
  check(true, 'all calibrated after the draw');
}

async function labcoinPart() {
  say('== labcoin: three players scanned onto the headsets, their names and skins in the game, the results paid back');
  await until('sims connected', async () => (await state()).headsets.filter(h => ids.includes(h.id) && h.online).length === 3);
  try { await post('/api/session/stop'); } catch { /* none */ }
  try { await post('/api/flow/close'); } catch { /* none */ }
  await post('/api/settings', { resultsSec: 8, countdownSec: 3, autoStart: false, endMessage: { preset: 'thanks' }, clockScope: 'game' });
  await post('/api/labcoin/release-all');
  const st0 = await get('/api/labcoin/status');
  check(st0.mode === 'mock', `the dev server links to the pretend LabCoin (${st0.mode})`);
  const bad = await post('/api/labcoin/scan', { code: 'NOPE00', headsetId: ids[0] });
  check(bad.ok === false && bad.error === 'code_unknown' && !!bad.text, `unknown code refused: ${bad.text}`);
  check((await post('/api/labcoin/scan', { code: 'abc' })).error === 'code_bad', 'a code that is not 6 characters is refused');
  check((await post('/api/labcoin/scan', { code: 'EXPIRE', headsetId: ids[0] })).error === 'code_expired', 'expired code refused');
  check((await get('/api/labcoin/status')).headsets.every(h => !h.player), 'a refused code binds nothing');

  const a = await post('/api/labcoin/scan', { code: 'hotdog', headsetId: ids[0] });
  check(a.ok && a.player.username === 'HotDogKing' && a.player.skin.name === 'Хот-дог' && a.headset.id === ids[0], `HOTDOG on headset 1: ${a.player?.username} / ${a.player?.skin?.name}`);
  check(!JSON.stringify(a).includes('"key"') && !('id' in a.player), 'the page answer carries no key and no LabCoin id');
  const b = await post('/api/labcoin/scan', { code: 'WOMAN1', headsetId: ids[1] });
  check(b.ok && b.player.skin.modelKey === 'woman', 'WOMAN1 on headset 2');
  const c = await post('/api/labcoin/scan', { code: 'KID001' });      // no headset given: the first free one
  check(c.ok && c.headset.id === ids[2], `KID001 without a headset goes to the first free one (${c.headset?.id})`);

  await wait(300);
  const s = await state();
  const row = id => s.headsets.find(h => h.id === id);
  check(row(ids[0]).name === 'HotDogKing' && row(ids[0]).lab?.skin === 'Хот-дог', 'the console card carries the username and the skin');
  check(sims[0].seen('identity').some(m => m.name === 'HotDogKing' && m.lab?.skin?.modelKey === 'hotdog'), 'the headset got its new identity with the skin');
  const skinsMsg = sims[2].seen('skins').at(-1);
  check(skinsMsg && Object.keys(skinsMsg.players).length === 3 && skinsMsg.players[ids[1]].username === 'Marinka_77', 'every headset got the skins of everyone');
  const img = await fetch(`${BASE}/labcoin-skin/481`);
  check(img.status === 200 && /svg/.test(img.headers.get('content-type')), 'the skin picture is served by the arena (no internet needed)');
  check((await fetch(`${BASE}/labcoin-skin/..%2f..%2fserver.js`)).status === 404, 'the picture route takes only plain ids');

  const moved = await post('/api/labcoin/scan', { code: 'HOTDOG', headsetId: ids[1] });
  check(moved.ok && moved.replaced === 'Marinka_77', `the same player on another headset replaces the one there (${moved.replaced})`);
  const s1 = await state();
  check(!s1.headsets.find(h => h.id === ids[0]).lab && s1.headsets.find(h => h.id === ids[0]).name === 'Sim 1', 'the first headset is free again, with its own name back');
  await post('/api/labcoin/scan', { code: 'WOMAN1', headsetId: ids[0] });
  const s2 = await state();
  check(['HotDogKing', 'LittleDino'].every(n => s2.headsets.some(h => h.name === n)) && s2.headsets.find(h => h.id === ids[0]).name === 'Marinka_77', 'final: Marinka_77, HotDogKing, LittleDino');

  await post('/api/flow/open', { kind: 'quick' });
  await wait(800);
  await post('/api/session/start', { gameId: 'motel', difficulty: 'normal', minutes: 10, headsetIds: ids, team: 'LabCoin Link', fast: true });
  await until('playing', async () => (await runState()) === 'playing', 30_000);
  say('  waiting for the game to end by itself (trial cut, ~100 s)');
  await until('results', async () => (await runState()) === 'results', 200_000, 1000);
  const res = (await state()).run.results;
  check(['HotDogKing', 'Marinka_77', 'LittleDino'].every(n => res.players.some(p => p.name === n)), `the results carry the usernames: ${res.players.map(p => p.name).join(', ')}`);
  const paid = await until('three results paid', async () => { const x = await get('/api/labcoin/status'); return x.recent.length >= 3 && x; }, 15_000);
  check(paid.pending === 0 && paid.failed === 0, `nothing waits in the outbox (pending ${paid.pending}, failed ${paid.failed})`);
  check(paid.recent.every(r => r.hex >= 50) && ['HotDogKing', 'Marinka_77', 'LittleDino'].every(n => paid.recent.some(r => r.username === n)), `HEX per player: ${paid.recent.map(r => `${r.username} +${r.hex}`).join(', ')}`);
  check(sims.every(sm => sm.seen('message').some(m => /HEX/.test(m.text))), 'each headset was told what it earned');

  const rel = await post('/api/labcoin/release', { headsetId: ids[2] });
  check(rel.ok && (await state()).headsets.find(h => h.id === ids[2]).name === 'Sim 3', 'release brings the headset name back');
  await post('/api/labcoin/release-all');
  const end = await get('/api/labcoin/status');
  check(end.headsets.every(h => !h.player), 'everyone released');
  await post('/api/session/stop').catch(() => {});
}

try {
  if (PARTS.includes('draw')) await drawPart();
  if (want('setup')) await setupPart();
  if (want('quick')) await quickPart();
  if (want('labcoin')) await labcoinPart();
  if (want('playlist')) await playlistPart();
  if (want('party')) await partyPart();
  if (want('ops')) await opsPart();
} catch (e) {
  failures++;
  say('ERROR', e.message, e.body ? JSON.stringify(e.body) : '');
}
say(failures ? `${failures} FAILED` : 'ALL PASSED');
for (const s of sims) s.close();
setTimeout(() => process.exit(failures ? 1 : 0), 300);

import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, TIMING } from './session.js';

/** A fake arena: clock, headsets, a game adapter and everything the engine sent. */
function world({ n = 3, settings = {} } = {}) {
  const w = { t: 1_000_000, sent: [], logs: [], toasts: [], recorded: [] };
  w.headsets = Array.from({ length: n }, (_, i) => ({ id: `H${i + 1}`, online: true, web: true, name: `Headset ${i + 1}`, n: i + 1, color: '#f00', phase: 'idle', app: null }));
  w.games = [
    { id: 'motel', name: 'The Motel', minutes: 10, cuts: [10, 15], web: true, status: 'ready', cover: '/m.jpg' },
    { id: 'arena2', name: 'Arena Two', minutes: 60, web: true, status: 'ready' },
    { id: 'soon', name: 'Soon', minutes: 5, web: true, status: 'soon' },
  ];
  w.settings = { clockScope: 'game', resultsSec: 20, countdownSec: 3, difficulty: 'normal', endMessage: { preset: 'thanks', text: '' }, ...settings };
  w.game = null;     // { item, ids:Set, begun, over, paused, difficulty, exists }
  w.calls = [];
  w.adapter = {
    start(item, ids) { w.calls.push(['start', item.gameId, [...ids]]); w.game = { item, ids: new Set(ids), begun: false, over: false, paused: false, exists: true, difficulty: item.difficulty }; },
    join(id) { w.calls.push(['join', id]); w.game.ids.add(id); },
    leave(id) { w.calls.push(['leave', id]); w.game?.ids.delete(id); },
    has: id => !!w.game?.ids.has(id),
    state: () => (w.game ? { exists: w.game.exists, begun: w.game.begun, over: w.game.over, error: w.game.error } : { exists: false }),
    pause(on) { w.calls.push(['pause', on]); w.game.paused = on; },
    setDifficulty(l) { w.game.difficulty = l; return true; },
    stage: name => name === 'boss',
    results: () => (w.game?.over ? { score: 1234, won: true, players: [{ id: 'H1', name: 'Ann', score: 600, kills: 10, deaths: 1 }] } : null),
    stop() { w.calls.push(['stop']); w.game = null; },
  };
  w.engine = createEngine({
    now: () => w.t,
    headsets: () => w.headsets,
    games: () => w.games,
    settings: () => w.settings,
    send: (id, msg) => w.sent.push({ id, ...msg }),
    lobbyMsg: () => ({ type: 'lobby', theme: 'night' }),
    game: w.adapter,
    onResults: (run, item, res) => { w.recorded.push({ item, res }); return { rank: 1, newRecord: true }; },
    log: e => w.logs.push(e),
    toast: (text, level) => w.toasts.push({ text, level }),
    random: () => 0,
  });
  w.step = (ms, every = 250) => { for (let left = ms; left > 0; left -= every) { w.t += Math.min(every, left); w.engine.tick(); } };
  w.of = type => w.sent.filter(m => m.type === type);
  w.h = id => w.headsets.find(h => h.id === id);
  return w;
}

test('quick play: waiting room, countdown, loading, playing, results, back to waiting room', () => {
  const w = world();
  w.engine.open({ kind: 'quick' });
  assert.equal(w.engine.state(), 'waiting');
  assert.equal(w.of('lobby').length, 3, 'every headset gets the waiting room when a mode opens');

  w.engine.start('quick', { gameId: 'motel', difficulty: 'hard', minutes: 15, headsetIds: ['H1', 'H2'], team: 'Wolves' });
  assert.equal(w.engine.state(), 'countdown');
  assert.deepEqual(w.of('countdown').map(m => m.id), ['H1', 'H2']);
  assert.equal(w.of('countdown')[0].seconds, 3);

  w.step(2900);
  assert.equal(w.game, null, 'nothing starts before the countdown ends');
  w.step(200);
  assert.equal(w.engine.state(), 'loading');
  assert.deepEqual(w.calls.find(c => c[0] === 'start'), ['start', 'motel', ['H1', 'H2']]);
  assert.equal(w.game.item.difficulty, 'hard');
  assert.equal(w.game.item.minutes, 15);

  w.game.begun = true; w.step(250);
  assert.equal(w.engine.state(), 'playing');
  w.step(60_000);
  const v = w.engine.view();
  assert.ok(Math.abs(v.gameElapsedMs - 60_000) <= 250);
  assert.ok(Math.abs(v.remainingMs - (15 * 60_000 - 60_000)) <= 250);

  w.game.over = true; w.step(250);
  assert.equal(w.engine.state(), 'results');
  const r = w.of('results');
  assert.equal(r.length, 2);
  assert.equal(r[0].score, 1234);
  assert.equal(r[0].rank, 1);
  assert.equal(r[0].team, 'Wolves');
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].reason, 'finished');
  assert.equal(w.logs[0].result.score, 1234);
  assert.equal(w.recorded.length, 1);

  w.step(20_000);
  assert.equal(w.engine.state(), 'waiting', 'the waiting room reopens');
  assert.equal(w.engine.view(), null);
  assert.equal(w.of('endMessage').length, 2);
  assert.equal(w.engine.last().results.score, 1234);
  assert.ok(w.calls.some(c => c[0] === 'stop'));
});

test('auto-pause after 3 s off, auto-resume 2 s after the headset is back', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel', headsetIds: ['H1', 'H2'] });
  w.step(3000); w.game.begun = true; w.step(250);
  assert.equal(w.engine.state(), 'playing');

  w.h('H2').online = false;
  w.step(2500);
  assert.equal(w.engine.state(), 'playing', 'a short drop does not pause');
  w.step(750);
  assert.equal(w.engine.state(), 'paused');
  assert.deepEqual(w.engine.view().pausedBy, ['H2']);
  assert.deepEqual(w.calls.filter(c => c[0] === 'pause').at(-1), ['pause', true]);
  const p = w.of('pause').at(-1);
  assert.equal(p.on, true);
  assert.deepEqual(p.who, ['Headset 2']);
  const el = w.engine.view().gameElapsedMs;
  w.step(30_000);
  assert.equal(w.engine.view().gameElapsedMs, el, 'the clock stops while paused');

  // back: the loop pulls it into the running game, then the game resumes 2 s later
  w.h('H2').online = true;
  w.engine.onConnect('H2');
  assert.ok(w.calls.some(c => c[0] === 'join' && c[1] === 'H2'));
  w.step(1500);
  assert.equal(w.engine.state(), 'paused');
  w.step(750);
  assert.equal(w.engine.state(), 'playing');
  assert.deepEqual(w.calls.filter(c => c[0] === 'pause').at(-1), ['pause', false]);
  assert.ok(w.engine.view().gameElapsedMs - el < 3000);
});

test('continue without the dropped headset removes it and resumes', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel', headsetIds: ['H1', 'H2'] });
  w.step(3000); w.game.begun = true; w.step(250);
  w.h('H2').online = false; w.step(4000);
  assert.equal(w.engine.state(), 'paused');
  const v = w.engine.continueWithout();
  assert.deepEqual(v.removed, ['H2']);
  assert.equal(w.engine.state(), 'playing');
  assert.deepEqual(w.engine.view().players.map(p => p.headsetId), ['H1']);
  const before = w.of('lobby').filter(m => m.id === 'H2').length;
  w.h('H2').online = true; w.engine.onConnect('H2'); w.step(2000);
  assert.equal(w.engine.state(), 'playing', 'the removed headset coming back does not pause again');
  assert.equal(w.of('lobby').filter(m => m.id === 'H2').length, before + 1, 'it waits in the waiting room');
  assert.ok(!w.game.ids.has('H2'));
});

test('operator pause holds the game even when nobody dropped', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel' });
  w.step(3000); w.game.begun = true; w.step(250);
  w.engine.pause(true);
  assert.equal(w.engine.state(), 'paused');
  w.step(5000);
  assert.equal(w.engine.state(), 'paused');
  w.engine.pause(false);
  assert.equal(w.engine.state(), 'playing');
});

test('operator stop logs stopped_by_operator, records nothing', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel' });
  w.step(3000); w.game.begun = true; w.step(250);
  w.engine.stop();
  assert.equal(w.engine.view(), null);
  assert.equal(w.logs[0].reason, 'stopped_by_operator');
  assert.equal(w.recorded.length, 0);
  assert.equal(w.of('endMessage').length, 0, 'no end message when nothing finished');
});

test('a game that disappears ends as stopped_by_game or unexpected', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel' });
  w.step(3000); w.game.begun = true; w.step(250);
  w.game.exists = false; w.game.error = 'crash';
  w.step(250);
  assert.equal(w.logs[0].reason, 'stopped_by_game');
});

test('safety net ends a game that runs far past its length', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel', minutes: 10 });
  w.step(3000); w.game.begun = true; w.step(250);
  w.step(10 * 60_000 + TIMING.safetyMs - 1000, 5000);
  assert.equal(w.engine.state(), 'playing');
  w.step(2000);
  assert.equal(w.logs[0].reason, 'unexpected');
});

test('minutes snap to the game cuts; unknown and coming-soon games are refused', () => {
  const w = world();
  assert.throws(() => w.engine.start('quick', { gameId: 'nope' }), /No such game/);
  assert.throws(() => w.engine.start('quick', { gameId: 'soon' }), /not ready/);
  w.engine.start('quick', { gameId: 'motel', minutes: 12 });
  assert.equal(w.engine.view().minutes, 10);
  assert.throws(() => w.engine.start('quick', { gameId: 'motel' }), e => e.code === 'busy');
});

test('no headset online refuses a quick start and leaves no run behind', () => {
  const w = world();
  for (const h of w.headsets) h.online = false;
  assert.throws(() => w.engine.start('quick', { gameId: 'motel' }), e => e.code === 'no_headsets');
  assert.equal(w.engine.view(), null);
});

test('playlist: two games with a break, Next skips the break', () => {
  const w = world({ settings: { resultsSec: 5 } });
  w.engine.open({ kind: 'playlist' });
  w.engine.start('playlist', { items: [{ gameId: 'motel', minutes: 10 }, { gameId: 'arena2', minutes: 20 }], breakSec: 30, difficulty: 'easy' });
  const v0 = w.engine.view();
  assert.deepEqual(v0.queue.map(q => q.state), ['now', 'next']);
  assert.equal(v0.queue[1].difficulty, 'easy', 'one difficulty for all');
  w.step(3000); w.game.begun = true; w.step(250);
  w.game.over = true; w.step(250);
  assert.equal(w.engine.state(), 'results');
  w.step(5000);
  assert.equal(w.engine.state(), 'waiting');
  assert.deepEqual(w.engine.view().queue.map(q => q.state), ['done', 'next']);
  assert.equal(w.of('endMessage').length, 0, 'no end message between games');
  w.step(10_000);
  assert.equal(w.engine.state(), 'waiting', 'still in the break');
  w.engine.next();
  assert.equal(w.engine.state(), 'countdown');
  assert.equal(w.engine.view().gameId, 'arena2');
  w.step(3000); w.game.begun = true; w.step(250);
  w.game.over = true; w.step(250); w.step(5000);
  assert.equal(w.engine.view(), null, 'the playlist ends after the last game');
  assert.equal(w.logs.length, 2);
  assert.equal(w.of('endMessage').length, 3);
});

test('playlist break runs out by itself', () => {
  const w = world({ settings: { resultsSec: 5 } });
  w.engine.start('playlist', { items: [{ gameId: 'motel' }, { gameId: 'motel' }], breakSec: 10 });
  w.step(3000); w.game.begun = true; w.step(250); w.game.over = true; w.step(250); w.step(5000);
  assert.equal(w.engine.state(), 'waiting');
  w.step(10_000);
  assert.equal(w.engine.state(), 'countdown');
});

test('party: vote in the waiting room, highest vote wins, no vote picks the next unplayed game', () => {
  const w = world({ settings: { resultsSec: 5 } });
  w.engine.start('party', { games: ['motel', 'arena2'], maxGames: 2, voteSec: 10, breakSec: 20 });
  assert.equal(w.engine.state(), 'waiting');
  const votes = w.of('vote');
  assert.equal(votes.length, 3);
  assert.deepEqual(votes[0].options.map(o => o.gameId), ['motel', 'arena2']);
  assert.ok(w.engine.vote('H1', 'arena2'));
  assert.ok(w.engine.vote('H2', 'arena2'));
  assert.ok(w.engine.vote('H3', 'motel'));
  assert.equal(w.engine.vote('H3', 'nope'), false);
  assert.deepEqual(w.engine.view().vote.counts, { motel: 1, arena2: 2 });
  w.step(10_000);
  assert.equal(w.of('voteEnd')[0].gameId, 'arena2');
  assert.equal(w.engine.state(), 'countdown');
  assert.equal(w.engine.view().gameId, 'arena2');
  w.step(3000); w.game.begun = true; w.step(250); w.game.over = true; w.step(250); w.step(5000);
  assert.equal(w.engine.state(), 'waiting');
  w.step(10_000);
  assert.ok(w.engine.view().vote, 'the next vote opens after breakSec - voteSec');
  w.engine.skipVote();       // nobody voted → the game not played yet
  assert.equal(w.engine.view().gameId, 'motel');
  w.step(3000); w.game.begun = true; w.step(250); w.game.over = true; w.step(250); w.step(5000);
  assert.equal(w.engine.view(), null, 'ends at maxGames');
  assert.equal(w.logs.length, 2);
});

test('party tie is broken at random', () => {
  const w = world();
  w.engine.start('party', { games: ['motel', 'arena2'], maxGames: 3, voteSec: 10, breakSec: 20 });
  w.engine.vote('H1', 'motel'); w.engine.vote('H2', 'arena2');
  assert.equal(w.engine.pickWinner(() => 0), 'motel');
  assert.equal(w.engine.pickWinner(() => 0.99), 'arena2');
});

test('desired state: a headset in the wrong place is pulled to the game; benched stays in the waiting room', () => {
  const w = world();
  w.engine.open({ kind: 'quick' });
  w.engine.start('quick', { gameId: 'motel' });
  w.engine.bench('H3', true);
  w.step(3000); w.game.begun = true; w.step(250);
  assert.ok(!w.game.ids.has('H3'), 'benched headset not started');
  // H1 reloads its page: it is not in the game any more and must get the start again
  w.game.ids.delete('H1');
  w.step(1000);
  assert.ok(w.game.ids.has('H1'));
  // bench a player mid-game: out of the game, into the waiting room
  w.engine.bench('H2', true);
  assert.ok(!w.game.ids.has('H2'));
  assert.ok(w.sent.some(m => m.id === 'H2' && m.type === 'lobby'));
  w.engine.bench('H2', false); w.step(1000);
  assert.ok(w.game.ids.has('H2'), 'unbenched player rejoins the running game');
});

test('restart: same players, a fresh countdown; the stopped game is logged', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel', headsetIds: ['H1'] });
  w.step(3000); w.game.begun = true; w.step(250);
  w.engine.restart();
  assert.equal(w.engine.state(), 'countdown');
  assert.equal(w.logs[0].reason, 'stopped_by_operator');
  w.step(3000);
  assert.equal(w.calls.filter(c => c[0] === 'start').length, 2);
});

test('live difficulty and stage controls', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel' });
  w.step(3000); w.game.begun = true; w.step(250);
  assert.equal(w.engine.difficulty('nightmare').live, true);
  assert.equal(w.game.difficulty, 'nightmare');
  assert.ok(w.of('settings').some(m => m.difficulty === 'nightmare'));
  assert.throws(() => w.engine.difficulty('insane'));
  w.engine.stage('boss');
  assert.throws(() => w.engine.stage('nope'), e => e.code === 'no_stage');
});

test('clock scope all counts the waiting room and the rest of the playlist', () => {
  const w = world({ settings: { clockScope: 'all' } });
  w.engine.start('playlist', { items: [{ gameId: 'motel', minutes: 10 }, { gameId: 'motel', minutes: 15 }], breakSec: 60 });
  w.step(3000); w.game.begun = true; w.step(250);
  const v = w.engine.view();
  assert.equal(v.clockScope, 'all');
  assert.ok(v.elapsedMs >= 3250);
  assert.equal(Math.round(v.remainingMs / 1000), 10 * 60 + 15 * 60 + 60);
});

test('late headsets join a running game (old /api/launch)', () => {
  const w = world();
  w.engine.start('quick', { gameId: 'motel', headsetIds: ['H1'] });
  w.step(3000); w.game.begun = true; w.step(250);
  w.engine.addPlayers(['H2']);
  assert.ok(w.game.ids.has('H2'));
  assert.equal(w.engine.view().players.length, 2);
});

test('flow close is refused while a session runs', () => {
  const w = world();
  w.engine.open({ kind: 'quick' });
  w.engine.start('quick', { gameId: 'motel' });
  assert.throws(() => w.engine.close(), e => e.code === 'busy');
  w.engine.stop();
  w.engine.close();
  assert.equal(w.engine.state(), 'idle');
});

test('party with one game: the players vote on the difficulty of each round', () => {
  const w = world({ settings: { resultsSec: 5 } });
  w.engine.start('party', { games: ['motel'], maxGames: 2, voteSec: 10, breakSec: 20 });
  const v = w.of('vote')[0];
  assert.equal(v.on, 'difficulty');
  assert.deepEqual(v.options.map(o => o.id), ['easy', 'normal', 'hard', 'nightmare']);
  assert.ok(v.options.every(o => o.gameId === 'motel'));
  w.engine.vote('H1', 'hard'); w.engine.vote('H2', 'hard'); w.engine.vote('H3', 'easy');
  assert.equal(w.engine.vote('H3', 'motel'), false, 'a game id is not an option here');
  w.step(10_000);
  const end = w.of('voteEnd')[0];
  assert.deepEqual([end.id, end.gameId, end.difficulty], ['hard', 'motel', 'hard']);
  assert.equal(w.engine.view().difficulty, 'hard');
  w.step(3000); assert.equal(w.game.item.difficulty, 'hard');
  w.game.begun = true; w.step(250); w.game.over = true; w.step(250); w.step(5000);
  w.step(10_000);
  w.engine.skipVote();      // nobody voted: the default difficulty
  assert.equal(w.engine.view().difficulty, 'normal');
});

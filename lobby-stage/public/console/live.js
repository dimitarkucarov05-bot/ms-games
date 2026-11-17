// MS Games 2 · live game data for the running view. The console listens to the server's read-only spectator
// feed (WebSocket /tv, the same one the TV page uses): `gameStart` (waves, wave names), `game` (the rules snapshot,
// 10 Hz: wave, phase, time to the next wave, enemies, team score, per-player score, kills, down) and `stop`.
// Deaths are counted from the `down` events (the snapshot has no per-player deaths yet; see Contract changes).
// The socket is open only while a session is open, so an idle console costs nothing.

'use strict';

const LIVE = { ws: null, start: null, snap: null, at: 0, seen: -1, downs: new Map(), gameKey: '' };
App.live = LIVE;

function liveWanted() { return !!(state && state.run && runOpen(state.run)); }

function liveOpen() {
  if (LIVE.ws) return;
  if (window.MSMock) { LIVE.ws = { mock: true, close: window.MSMock.subscribeTv(onLive) }; return; }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/tv`);
  LIVE.ws = ws;
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onLive(m); };
  ws.onclose = () => { if (LIVE.ws === ws) LIVE.ws = null; };
  ws.onerror = () => {};
}
function liveClose() {
  const ws = LIVE.ws;
  LIVE.ws = null;
  if (!ws) return;
  if (ws.mock) ws.close(); else try { ws.close(); } catch { /* gone */ }
  LIVE.start = null; LIVE.snap = null;
}
setInterval(() => { if (liveWanted()) liveOpen(); else liveClose(); }, 1000);

function onLive(m) {
  if (m.type === 'gameStart') { LIVE.start = m; LIVE.snap = null; LIVE.seen = -1; LIVE.downs = new Map(); return; }
  if (m.type === 'stop') { LIVE.snap = null; return; }
  if (m.type !== 'game') return;
  const first = !LIVE.snap;
  LIVE.snap = m; LIVE.at = Date.now();
  const ev = m.events || [];
  if (first && LIVE.seen < 0) LIVE.seen = ev.reduce((a, e) => Math.max(a, e.i || 0), 0);      // only count what happens from now on
  for (const e of ev) {
    if ((e.i || 0) <= LIVE.seen) continue;
    LIVE.seen = e.i;
    if (e.k === 'down' && e.p) LIVE.downs.set(e.p, (LIVE.downs.get(e.p) || 0) + 1);
  }
  if (section === 'run') scheduleRender();
}

/** Live per-player numbers by headset id: {score, kills, deaths, hp, down}. */
App.livePlayers = function () {
  const out = {};
  const sn = LIVE.snap;
  if (!sn) return out;
  for (const p of sn.players || []) out[p.id] = { score: nOr0(p.score), kills: nOr0(p.kills), deaths: nOr0(p.deaths ?? p.downs ?? LIVE.downs.get(p.id)), hp: p.hp, down: p.down };
  return out;
};

/** The line above the players: wave, enemies, team score and what comes next. */
App.liveFacts = function () {
  const sn = LIVE.snap, st = LIVE.start || {};
  if (!sn || Date.now() - LIVE.at > 5000) return null;
  const waves = nOr0(st.waves) || null, names = st.waveNames || [];
  const wave = nOr0(sn.wave);
  const facts = [];
  facts.push({ k: 'Wave', v: wave ? `${wave}${waves ? ` of ${waves}` : ''}` : 'Prep', s: wave && names[wave - 1] ? names[wave - 1] : '' });
  facts.push({ k: 'Enemies', v: String(Array.isArray(sn.z) ? sn.z.length : nOr0(sn.zombies)), s: sn.dark ? 'blackout' : '' });
  facts.push({ k: 'Team score', v: fmtScore(sn.score), s: `${fmtScore(sn.kills)} kills` });
  let cue = '', tone = null;
  if (sn.boss != null) { cue = `Boss ${Math.round(sn.boss * 100)} %`; tone = 'bad'; }
  else if ((sn.phase === 'intro' || sn.phase === 'break') && nOr0(sn.next) > 0) cue = `${wave + 1 <= (waves || 99) ? `Wave ${wave + 1}` : 'Boss'} in ${fmtClock(sn.next)}`;
  else if (sn.phase === 'boss') { cue = 'Boss fight'; tone = 'bad'; }
  else if (sn.phase === 'wave' || sn.phase === 'fight') cue = 'Wave on';
  const down = (sn.players || []).filter(p => nOr0(p.down) > 0);
  if (down.length) { cue = `${down.map(p => p.name).join(', ')} down`; tone = 'warn'; }
  facts.push({ k: 'Next', v: cue || (sn.phase ? sn.phase[0].toUpperCase() + sn.phase.slice(1) : ''), s: '', tone });
  return facts;
};

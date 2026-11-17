// Тестово лоби (НЕ истинското). Имитира лобито на VR арената за проба без каски:
// - GET  /api/state                       (headsets[] с number, match.board[] с натрупани kills/deaths)
// - POST /api/headset/rename {headsetId,name}, /api/match/team {headsetId,team}, /api/match {command}
// - праща POST към приложението при край на рунд и мач (формата, договорен с Джак 12.11)
// - GET  /api/match/events?since=<eventId>  (наваксване, последните 50)
// Пускане: MOCK_PORT=47811 LABCOIN_EVENT_URL=http://127.0.0.1:4780/api/arena/event node tools/mock-lobby.js
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 47811);
const EVENT_URL = process.env.LABCOIN_EVENT_URL || 'http://127.0.0.1:4780/api/arena/event';
const KILLS_PER_ROUND = Number(process.env.MOCK_KILLS_PER_ROUND || 4);
const ids = ['PA94Y0MGK5120816G', 'PA94Y0MGK5130331G', 'PA94Y0MGK5130434G', 'PA94Y0MGK3250545G', 'PA94Y0MGK3250496G'];
const hs = ids.map((id, i) => ({ id, number: i + 1, name: 'PICO ' + (i + 1), custom: null, kills: 0, deaths: 0, team: 0, online: true }));
let phase = 0;                 // 0 waiting, 1 countdown, 2 playing, 3 over
let roundsToWin = 2, redRounds = 0, blueRounds = 0, round = 0, matchSeq = 0;
let roundKills = { 1: 0, 2: 0 };
const events = [];
const log = (...a) => console.log('[mock-lobby]', ...a);

function board() {
  return hs.filter(h => h.online).map(h => ({ id: h.id, name: h.custom || h.name, team: h.team, kills: h.kills, deaths: h.deaths, points: h.kills }));
}
async function emit(type, winnerTeam) {
  const ev = {
    v: 1, type, eventId: `mock-${matchSeq}-${type}-${round}-${Date.now()}`, at: new Date().toISOString(),
    matchSeq, gameId: 'mock', round, winnerTeam, redRounds, blueRounds, roundsToWin,
    red: roundKills[1], blue: roundKills[2],
    // и каските извън мрежата, с последната видяна стойност (молба към Мост)
    board: hs.map(h => ({ headsetId: h.id, number: h.number, name: h.custom || h.name, team: h.team, kills: h.kills, deaths: h.deaths, points: h.kills })),
  };
  events.push(ev); if (events.length > 50) events.shift();
  for (let i = 0; i < 3; i++) {   // до 3 опита, като истинското лоби
    try {
      const r = await fetch(EVENT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) });
      log(type, 'round', round, 'winner', winnerTeam, '→', r.status, await r.text());
      return;
    } catch (e) { log('event retry', i + 1, e.message); await new Promise(r => setTimeout(r, 500)); }
  }
}

setInterval(() => {
  if (phase !== 2) return;
  const playing = hs.filter(h => h.online && (h.team === 1 || h.team === 2));
  const killer = playing[Math.floor(Math.random() * playing.length)];
  if (!killer) return;
  const victims = playing.filter(h => h.team !== killer.team);
  if (!victims.length) return;
  killer.kills += 1;
  victims[Math.floor(Math.random() * victims.length)].deaths += 1;
  roundKills[killer.team] += 1;
  if (roundKills[killer.team] >= KILLS_PER_ROUND) {
    if (killer.team === 1) redRounds++; else blueRounds++;
    emit('round_end', killer.team);
    if (redRounds >= roundsToWin || blueRounds >= roundsToWin) { phase = 3; emit('match_end', killer.team); }
    else { round++; roundKills = { 1: 0, 2: 0 }; }
  }
}, Number(process.env.MOCK_KILL_MS || 400));

const readBody = async req => { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, {
        type: 'state',
        headsets: hs.map(h => ({ id: h.id, number: h.number, name: h.custom || h.name, online: h.online, battery: 80 })),
        match: { phase: ['waiting', 'countdown', 'playing', 'over'][phase], redRounds, blueRounds, roundsToWin, red: roundKills[1], blue: roundKills[2], board: board() },
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/match/events') {
      const since = url.searchParams.get('since');
      const i = since ? events.findIndex(e => e.eventId === since) : -1;
      return json(res, 200, { events: events.slice(i + 1) });
    }
    if (req.method === 'POST' && url.pathname === '/api/headset/rename') {
      const { headsetId, name } = await readBody(req);
      const h = hs.find(x => x.id === headsetId);
      if (!h) return json(res, 400, { error: 'Няма такава каска' });
      h.custom = String(name || '').trim().slice(0, 30) || null;
      log('rename', h.number, '→', h.custom ?? '(изтрито)');
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/match/team') {
      const { headsetId, team } = await readBody(req);
      const h = hs.find(x => x.id === headsetId);
      if (!h || ![1, 2].includes(team)) return json(res, 400, { error: 'грешна каска или отбор' });
      h.team = team; log('team', h.number, '→', team);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/match') {
      const b = await readBody(req);
      if (b.roundsToWin) roundsToWin = b.roundsToWin;
      if (b.command === 'start' || b.command === 'restart' || b.command === 'forceStart') {
        phase = 2; redRounds = 0; blueRounds = 0; round = 1; matchSeq++; roundKills = { 1: 0, 2: 0 };   // kills НЕ се нулират (натрупани за играта)
      }
      if (b.command === 'stop') phase = 3;
      log('match', b.command);
      return json(res, 200, { ok: true });
    }
    // помощни за проба
    if (url.pathname === '/offline') { const h = hs.find(x => x.number === Number(url.searchParams.get('n'))); if (h) h.online = false; }
    if (url.pathname === '/online') hs.forEach(h => { h.online = true; });
    res.end('ok');
  } catch (e) { json(res, 400, { error: e.message }); }
}).listen(PORT, () => log('на :' + PORT + ', събития → ' + EVENT_URL));

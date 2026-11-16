// Records per game (data/records.json). One entry per finished game:
//   { id, gameId, game, team, score, players:[{name, score, kills, deaths}], difficulty, minutes, kids, date, sessionId }
// Rank = number of higher scores for the same game and difficulty + 1, so rank 1 is a new record.

import { readJson, writeJson } from './store.js';

export const PERIODS = { today: 'today', day: 'today', week: 'week', month: 'month', all: 'all' };
const KEEP = 20000;

export function periodStart(period, now = new Date()) {
  const p = PERIODS[period] || 'all';
  if (p === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (p === 'week') return now.getTime() - 7 * 86_400_000;
  if (p === 'month') return now.getTime() - 30 * 86_400_000;
  return 0;
}

export const cleanTeam = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 28);

/** Sort order: higher score first, the earlier one first on equal scores. */
const order = (a, b) => b.score - a.score || Date.parse(a.date) - Date.parse(b.date);

export function createRecords(file, { importFrom } = {}) {
  let list = readJson(file, null);
  if (!Array.isArray(list)) {
    // first run: take over the finished, non-trial results of the old leaderboard (data/scores.json)
    list = (Array.isArray(importFrom) ? importFrom : []).filter(e => e && !e.test && e.gameId).map(e => ({
      id: String(e.id), gameId: e.gameId, game: e.game || e.gameId, team: cleanTeam(e.team) || 'Team',
      score: Math.round(+e.score || 0), players: (e.players || []).map(p => ({ name: String(p.name || '') })),
      difficulty: e.difficulty || 'normal', minutes: e.minutes || null, kids: e.theme === 'kids', date: e.at || new Date().toISOString(), sessionId: null,
    }));
    writeJson(file, list);
  }
  let version = 0;
  const save = () => { if (list.length > KEEP) list.splice(0, list.length - KEEP); writeJson(file, list); version++; };

  function rankOf(e) {
    return list.filter(x => x.gameId === e.gameId && (x.difficulty || 'normal') === (e.difficulty || 'normal') && x.id !== e.id && x.score > e.score).length + 1;
  }

  return {
    get version() { return version; },
    all: () => list,
    /** Adds a finished game. Returns { entry, rank, newRecord }. */
    add({ gameId, game, team, score, players, difficulty = 'normal', minutes = null, kids = false, sessionId = null, date = new Date().toISOString() }) {
      const ps = (Array.isArray(players) ? players : []).map(p => ({
        name: String(p.name || ''), score: Math.round(+p.score || 0),
        ...(p.kills != null ? { kills: p.kills | 0 } : {}), ...(p.deaths != null ? { deaths: p.deaths | 0 } : {}),
      }));
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        gameId: String(gameId), game: String(game || gameId),
        team: cleanTeam(team) || (ps.length === 1 && ps[0].name ? ps[0].name : `Team ${new Date(date).toTimeString().slice(0, 5)}`),
        score: Math.round(+score || 0), players: ps, difficulty, minutes, kids: !!kids, date, sessionId,
      };
      const rank = rankOf(entry);
      list.push(entry);
      save();
      return { entry, rank, newRecord: rank === 1 };
    },
    rankOf,
    /** Top entries. gameId and difficulty filter; period today/week/month/all. Each row carries its rank in this list. */
    list({ gameId = '', difficulty = '', period = 'all', limit = 100 } = {}) {
      const from = periodStart(period);
      const rows = list.filter(e => (!gameId || e.gameId === gameId) && (!difficulty || (e.difficulty || 'normal') === difficulty) && Date.parse(e.date) >= from).sort(order);
      const n = Math.max(1, Math.min(1000, limit | 0 || 100));
      return { total: rows.length, list: rows.slice(0, n).map((e, i) => ({ rank: i + 1, ...e })) };
    },
    /** The best rows for the waiting-room record board. */
    board(gameId, n = 5) {
      return list.filter(e => !gameId || e.gameId === gameId).sort(order).slice(0, n).map(e => ({ team: e.team, score: e.score, game: e.game }));
    },
    rename(id, team) {
      const e = list.find(x => x.id === id);
      if (!e) throw new Error('No such record');
      const t = cleanTeam(team);
      if (!t) throw new Error('The name is empty');
      e.team = t; save();
      return e;
    },
    remove(id) {
      const i = list.findIndex(x => x.id === id);
      if (i < 0) throw new Error('No such record');
      const [e] = list.splice(i, 1); save();
      return e;
    },
    /** CSV for export (Excel opens it). */
    csv({ gameId = '', period = 'all', difficulty = '' } = {}) {
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = this.list({ gameId, period, difficulty, limit: 1000 }).list;
      return ['rank,game,team,score,difficulty,minutes,kids,date,players',
        ...rows.map(e => [e.rank, q(e.game), q(e.team), e.score, e.difficulty, e.minutes ?? '', e.kids ? 1 : 0, e.date, q(e.players.map(p => p.name).join('; '))].join(','))].join('\r\n');
    },
  };
}

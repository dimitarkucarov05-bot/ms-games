// Saved playlists (data/playlists.json): [{ name, items:[{gameId, mode, difficulty, minutes, kids, options}], breakSec,
// difficulty, team, names }]. Saving with an existing name replaces it.

import { readJson, writeJson } from './store.js';

const DIFF = ['easy', 'normal', 'hard', 'nightmare'];

export function cleanPreset(p, knownGame = () => true) {
  const name = String(p?.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('The playlist needs a name');
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 30).map(it => {
    const gameId = String(it?.gameId || '');
    if (!knownGame(gameId)) throw new Error(`No such game: ${gameId || '(none)'}`);
    return {
      gameId, mode: it.mode ? String(it.mode) : null,
      difficulty: DIFF.includes(it.difficulty) ? it.difficulty : null,
      minutes: Number(it.minutes) > 0 ? Math.round(Number(it.minutes)) : null,
      kids: !!it.kids, options: it.options && typeof it.options === 'object' ? it.options : {},
    };
  });
  if (!items.length) throw new Error('The playlist is empty');
  return {
    name, items,
    breakSec: Math.max(0, Math.min(300, Math.round(Number(p.breakSec) || 0))),
    difficulty: DIFF.includes(p.difficulty) ? p.difficulty : null,
    team: String(p.team || '').trim().slice(0, 28),
    names: p.names === true || p.names === false ? p.names : false,
    savedAt: new Date().toISOString(),
  };
}

export function createPresets(file) {
  let list = readJson(file, []);
  if (!Array.isArray(list)) list = [];
  return {
    list: () => list,
    save(p, knownGame) {
      const c = cleanPreset(p, knownGame);
      const i = list.findIndex(x => x.name.toLowerCase() === c.name.toLowerCase());
      if (i >= 0) list[i] = c; else list.push(c);
      writeJson(file, list);
      return c;
    },
    remove(name) {
      const i = list.findIndex(x => x.name.toLowerCase() === String(name || '').toLowerCase());
      if (i < 0) throw new Error('No such playlist');
      list.splice(i, 1);
      writeJson(file, list);
    },
  };
}

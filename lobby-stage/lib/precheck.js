// Pre-start check (GET /api/precheck) and the one-line reason a game tile is dimmed.
// Pure functions: the server hands in the game, the chosen headsets and the play area.
//
// Item: { headsetId|null, level: 'warn'|'error', code, text, fix?: { action, headsetId } }
//   error = the game will not work right for this player (not connected, not calibrated, too many players)
//   warn  = it will work, but staff should look (battery, controller, tracking)
// The console offers Fix where `fix` is given and "Start anyway" for the rest.

export const LOW_BATTERY = 20;

/** "4x4" → [4, 4] */
const parseSize = k => { const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(String(k)); return m ? [+m[1], +m[2]] : null; };
const fits = (area, w, d) => !!area && ((area.w + 0.05 >= w && area.d + 0.05 >= d) || (area.w + 0.05 >= d && area.d + 0.05 >= w));

/** Player range for this game in this area: from manifest `players: {"4x4": [1,4], ...}` or minPlayers/maxPlayers. */
export function playerRange(game, area) {
  const def = [Math.max(1, game.minPlayers | 0 || 1), Math.max(1, game.maxPlayers | 0 || 6)];
  if (!game.players || typeof game.players !== 'object' || Array.isArray(game.players)) return { range: def, size: null };
  let best = null;
  for (const [k, r] of Object.entries(game.players)) {
    const s = parseSize(k);
    if (!s || !Array.isArray(r) || !fits(area, s[0], s[1])) continue;
    if (!best || s[0] * s[1] > best.s[0] * best.s[1]) best = { s, r };
  }
  if (!best) return { range: null, size: null };
  return { range: [Math.max(1, best.r[0] | 0), Math.max(1, best.r[1] | 0)], size: `${best.s[0]}x${best.s[1]}` };
}

/** Smallest area the game needs, as "WxD", or null. */
export function minAreaOf(game) {
  if (Array.isArray(game.minArea) && game.minArea.length === 2) return `${+game.minArea[0]}x${+game.minArea[1]}`;
  if (game.players && typeof game.players === 'object' && !Array.isArray(game.players)) {
    const sizes = Object.keys(game.players).map(parseSize).filter(Boolean).sort((a, b) => a[0] * a[1] - b[0] * b[1]);
    if (sizes.length) return `${sizes[0][0]}x${sizes[0][1]}`;
  }
  return null;
}

/**
 * Why a game tile cannot run now, or null. ctx: { area:{w,d}|null, ready: n headsets connected with the page,
 * calibrated: n of them calibrated (or desk), running: {gameId}|null }
 */
export function tileReason(game, ctx = {}) {
  if (!game || game.status === 'soon') return 'Coming soon';
  if (!game.web) return null;      // old Unreal titles are checked by their own launch path
  if (ctx.running && ctx.running.gameId === game.id) return 'Already running';
  if (ctx.running) return `${ctx.running.gameName || 'Another game'} is running`;
  const need = minAreaOf(game);
  if (need) {
    const [w, d] = parseSize(need);
    if (!fits(ctx.area, w, d)) return `Play area too small (needs ${need})`;
  }
  const { range } = playerRange(game, ctx.area);
  if (!range) return 'Play area too small';
  if ((ctx.ready | 0) < range[0]) return `Needs ${range[0]}+ headsets`;
  if ((ctx.ready | 0) > 0 && (ctx.calibrated | 0) === 0) return 'Not calibrated';
  return null;
}

/**
 * The pre-start check. headsets: chosen headset views
 *   { id, name, online, web, desk, battery, charging, controllers:{left,right}, tracking, calibrated, hasCalibration,
 *     needsCalibration, build, phase, worn, benched }
 * opts: { area, pageBuild, running }
 */
export function precheck(game, headsets, opts = {}) {
  const items = [];
  const add = (h, level, code, text, fix) => items.push({ headsetId: h ? h.id : null, level, code, text, ...(fix ? { fix } : {}) });
  if (!game) { add(null, 'error', 'no_game', 'Choose a game'); return { ok: false, items }; }
  if (game.status === 'soon') add(null, 'error', 'not_ready', `${game.name} is not ready yet`);
  if (opts.running && opts.running.gameId !== game.id) add(null, 'error', 'busy', `${opts.running.gameName || 'Another game'} is running: stop it first`);
  if (!headsets.length) add(null, 'error', 'no_headsets', 'No headset chosen');
  const need = minAreaOf(game);
  if (need) {
    const [w, d] = parseSize(need);
    if (!fits(opts.area, w, d)) add(null, 'error', 'area', `Play area too small for ${game.name} (needs ${need})`);
  }
  const { range } = playerRange(game, opts.area);
  const count = headsets.filter(h => h.online).length;
  if (range && count > range[1]) add(null, 'error', 'too_many', `${game.name} is for up to ${range[1]} players in this area (${count} chosen)`);
  if (range && count && count < range[0]) add(null, 'warn', 'too_few', `${game.name} needs at least ${range[0]} players (${count} chosen)`);

  for (const h of headsets) {
    const name = h.name || h.id;
    if (!h.online) { add(h, 'error', 'offline', `${name} is not connected`); continue; }
    if (game.web && !h.web) { add(h, 'error', 'page', `${name} does not have the game page open`, { action: 'reload', headsetId: h.id }); continue; }
    if (h.benched) add(h, 'warn', 'benched', `${name} is benched and will stay in the waiting room`, { action: 'bench', value: false, headsetId: h.id });
    if (!h.desk) {
      if (h.needsCalibration) add(h, 'error', 'needs_calibration', `${name} lost its calibration (${h.needsCalibration})`, { action: 'recalibrate', headsetId: h.id });
      else if (!h.hasCalibration) add(h, 'error', 'not_calibrated', `${name} is not calibrated`, { action: 'recalibrate', headsetId: h.id });
      else if (h.calibrated === false) add(h, 'warn', 'calibration_pending', `${name} has not confirmed its calibration yet`, { action: 'recalibrate', headsetId: h.id });
      if (h.tracking && h.tracking !== 'ok') add(h, 'warn', 'tracking', `${name}: tracking lost`);
      if (h.worn === false) add(h, 'warn', 'not_worn', `${name} is not on a head`);
    }
    if (typeof h.battery === 'number' && h.battery < LOW_BATTERY && !h.charging) add(h, 'warn', 'battery', `${name}: battery ${h.battery} %`);
    const c = h.controllers;
    if (c && typeof c === 'object') {
      for (const side of ['left', 'right']) {
        const v = c[side];
        const label = side === 'left' ? 'left' : 'right';
        if (v === null || v === false || v === 0 || (v && typeof v === 'object' && v.connected === false)) add(h, 'warn', 'controller', `${name}: ${label} controller is off`);
        else {
          const pct = typeof v === 'number' ? v : (v && typeof v.battery === 'number' ? v.battery : null);
          if (pct != null && pct < LOW_BATTERY) add(h, 'warn', 'controller_battery', `${name}: ${label} controller battery ${pct} %`);
        }
      }
    }
    if (h.web && opts.pageBuild && h.build && h.build < opts.pageBuild) add(h, 'warn', 'old_page', `${name} has an old page (build ${h.build} of ${opts.pageBuild})`, { action: 'reload', headsetId: h.id });
    if (h.phase === 'calibrating') add(h, 'error', 'calibrating', `${name} is calibrating`);
  }
  return { ok: items.length === 0, items };
}

// Venue settings (data/settings.json). The console sends partial objects; every field is checked and
// clamped here, unknown fields are ignored, and the whole object is saved after each change.

import { readJson, writeJson } from './store.js';

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];
export const END_PRESETS = ['remove', 'thanks', 'staff', 'custom', 'none'];
export const THEMES = ['auto', 'off', 'christmas', 'halloween', 'birthday'];

export const DEFAULTS = Object.freeze({
  venue: { name: 'MS Games', logo: null },   // logo: a data: URL or a path under /venue/
  units: 'm',
  clockScope: 'game',                         // 'game' | 'all' (waiting room + game)
  difficulty: 'normal',
  autoStart: false,                           // start the default game on every headset that arrives (old behaviour)
  theme: 'auto',
  endMessage: { preset: 'remove', text: '' },
  printer: { kind: 'system', thermalHost: '192.168.1.40:631', queue: 'thermal' },
  resultsSec: 20,
  countdownSec: 3,
  language: 'en',
  simple: true,                               // Simple / Advanced view on the console
});

const clampInt = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Applies a partial update to a full settings object; returns a new object. Throws on clearly wrong values. */
export function merge(cur, patch = {}) {
  const s = structuredClone(cur);
  if (!patch || typeof patch !== 'object') return s;
  if (patch.venue && typeof patch.venue === 'object') {
    if ('name' in patch.venue) s.venue.name = text(patch.venue.name, 40) || DEFAULTS.venue.name;
    if ('logo' in patch.venue) {
      const l = patch.venue.logo;
      if (l == null || l === '') s.venue.logo = null;
      else if (typeof l === 'string' && (/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(l) && l.length < 3_000_000 || /^\/[\w./-]+$/.test(l))) s.venue.logo = l;
      else throw new Error('The logo must be a PNG, JPEG, WebP or SVG image under 2 MB');
    }
  }
  if ('venueName' in patch) s.venue.name = text(patch.venueName, 40) || DEFAULTS.venue.name;
  if ('units' in patch) s.units = patch.units === 'ft' ? 'ft' : 'm';
  if ('clockScope' in patch) {
    if (!['game', 'all'].includes(patch.clockScope)) throw new Error('clockScope is game or all');
    s.clockScope = patch.clockScope;
  }
  if ('difficulty' in patch) {
    if (!DIFFICULTIES.includes(patch.difficulty)) throw new Error(`difficulty is one of ${DIFFICULTIES.join(', ')}`);
    s.difficulty = patch.difficulty;
  }
  if ('autoStart' in patch) s.autoStart = !!patch.autoStart;
  if ('theme' in patch) {
    if (!THEMES.includes(patch.theme)) throw new Error(`theme is one of ${THEMES.join(', ')}`);
    s.theme = patch.theme;
  }
  if ('endMessage' in patch) {
    const e = typeof patch.endMessage === 'string' ? { preset: patch.endMessage } : (patch.endMessage || {});
    if (e.preset !== undefined) {
      if (!END_PRESETS.includes(e.preset)) throw new Error(`endMessage.preset is one of ${END_PRESETS.join(', ')}`);
      s.endMessage.preset = e.preset;
    }
    if (e.text !== undefined) s.endMessage.text = text(e.text, 120);
  }
  if ('printer' in patch && patch.printer && typeof patch.printer === 'object') {
    const p = patch.printer;
    if (p.kind !== undefined) s.printer.kind = p.kind === 'thermal' ? 'thermal' : 'system';
    if (p.thermalHost !== undefined) {
      if (!/^[\w.-]+(:\d{1,5})?$/.test(String(p.thermalHost))) throw new Error('thermalHost is host or host:port');
      s.printer.thermalHost = String(p.thermalHost);
    }
    if (p.queue !== undefined) s.printer.queue = text(p.queue, 40).replace(/[^\w-]/g, '') || 'thermal';
  }
  if ('resultsSec' in patch) s.resultsSec = clampInt(patch.resultsSec, 5, 120, s.resultsSec);
  if ('countdownSec' in patch) s.countdownSec = clampInt(patch.countdownSec, 0, 10, s.countdownSec);
  if ('language' in patch) s.language = 'en';     // English only for now
  if ('simple' in patch) s.simple = !!patch.simple;
  return s;
}

/** Fills in fields that an older settings.json does not have yet. */
export function normalize(saved) {
  const base = structuredClone(DEFAULTS);
  if (!saved || typeof saved !== 'object') return base;
  try { return merge(base, saved); } catch { return base; }
}

export function createSettings(file, { initial } = {}) {
  const fresh = readJson(file, null) == null;
  let cur = normalize(readJson(file, null) ?? initial ?? null);
  if (fresh) writeJson(file, cur);
  return {
    get: () => cur,
    update(patch) {
      cur = merge(cur, patch);
      writeJson(file, cur);
      return cur;
    },
  };
}

/** The seasonal dressing for the waiting room right now: 'christmas' 1–31 Dec, 'halloween' 15 Oct–2 Nov. */
export function seasonFor(theme, date = new Date()) {
  if (theme === 'off') return null;
  if (theme && theme !== 'auto') return theme;
  const m = date.getMonth() + 1, d = date.getDate();
  if (m === 12) return 'christmas';
  if ((m === 10 && d >= 15) || (m === 11 && d <= 2)) return 'halloween';
  return null;
}

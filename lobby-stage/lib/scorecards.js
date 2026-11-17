// Scorecards (design section 6). Per finished game the server writes a JSON sidecar
//   data/scorecards/<YYYY-MM-DD_HHMM>_<game>_<team>.json
// and tries to save the PNG next to it by opening the console's page /scorecard/?id=<sessionId> in a headless Edge
// (1000×1250). Where that is not possible the console uploads the PNG it drew (POST /api/scorecards/png).
// The thermal label printer gets a compact text label in TSPL over IPP (raw queue on CUPS).

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { readJson, writeJson, slug } from './store.js';

const pad = n => String(n).padStart(2, '0');
export function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

export function createScorecards(dir, { edge = EDGE_PATHS.find(p => fs.existsSync(p)) || null, profileDir = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const files = () => { try { return fs.readdirSync(dir); } catch { return []; } };
  const sidecars = () => files().filter(f => f.endsWith('.json')).sort().reverse();

  function find(id) {
    const key = String(id || '');
    if (!key) return null;
    if (/^[\w.-]+$/.test(key) && fs.existsSync(path.join(dir, `${key}.json`))) return readJson(path.join(dir, `${key}.json`), null);
    for (const f of sidecars()) {
      const d = readJson(path.join(dir, f), null);
      if (d && (d.id === key || d.base === key)) return d;
    }
    return null;
  }

  return {
    dir,
    /** Saves the sidecar; returns its base name. data: { id(sessionId), gameId, game, team, score, rank, newRecord, players, difficulty, minutes, date, venue } */
    save(data) {
      const d = new Date(data.date || Date.now());
      let base = `${stamp(d)}_${slug(data.game || data.gameId, 20)}_${slug(data.team || 'team', 20)}`;
      for (let i = 2; fs.existsSync(path.join(dir, `${base}.json`)) && readJson(path.join(dir, `${base}.json`), {}).id !== data.id; i++) base = `${base.replace(/-\d+$/, '')}-${i}`;
      const out = { ...data, base, png: null, savedAt: new Date().toISOString() };
      writeJson(path.join(dir, `${base}.json`), out);
      return base;
    },
    get: find,
    list(limit = 200) {
      return sidecars().slice(0, limit).map(f => {
        const d = readJson(path.join(dir, f), {});
        const base = f.replace(/\.json$/, '');
        const has = fs.existsSync(path.join(dir, `${base}.png`));
        return { id: d.id || base, base, game: d.game, gameId: d.gameId, team: d.team, score: d.score, rank: d.rank ?? null, date: d.date || d.savedAt, png: has ? `/scorecards/${base}.png` : null, json: `/scorecards/${base}.json` };
      });
    },
    savePng(id, buf) {
      const d = find(id);
      if (!d) throw new Error('No such scorecard');
      if (!Buffer.isBuffer(buf) || buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG image');
      fs.writeFileSync(path.join(dir, `${d.base}.png`), buf);
      writeJson(path.join(dir, `${d.base}.json`), { ...d, png: `${d.base}.png` });
      return `/scorecards/${d.base}.png`;
    },
    remove(id) {
      const d = find(id);
      if (!d) throw new Error('No such scorecard');
      for (const ext of ['.json', '.png']) fs.rmSync(path.join(dir, d.base + ext), { force: true });
      return d.base;
    },
    /** The file to serve for GET /scorecards/<file>, or null. */
    file(name) {
      if (!/^[\w.-]+\.(png|json)$/.test(name)) return null;
      const f = path.join(dir, name);
      return fs.existsSync(f) ? f : null;
    },
    /** Headless Edge screenshot of the console's scorecard page. Resolves to the PNG path or null (never throws). */
    capture(id, url, { timeoutMs = 25_000, look = 'digital' } = {}) {
      return new Promise(resolve => {
        const d = find(id);
        if (!d || !edge) return resolve(null);
        const out = path.join(dir, `${d.base}.png`);
        const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
          '--force-device-scale-factor=1', '--window-size=1000,1250', '--virtual-time-budget=6000', `--screenshot=${out}`];
        if (profileDir) args.push(`--user-data-dir=${profileDir}`);
        args.push(`${url}${url.includes('?') ? '&' : '?'}look=${look}&capture=1`);
        execFile(edge, args, { timeout: timeoutMs, windowsHide: true }, () => {
          try {
            const buf = fs.readFileSync(out);
            if (buf.length > 1000 && buf.readUInt32BE(0) === 0x89504e47) {
              writeJson(path.join(dir, `${d.base}.json`), { ...find(id), png: `${d.base}.png` });
              return resolve(out);
            }
          } catch { /* no screenshot */ }
          resolve(null);
        });
      });
    },
  };
}

// ---------- thermal label (Poskey DB403: 100 × 90 mm, 203 dpi, raw TSPL) ----------

const ascii = s => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'").trim();

/** TSPL for a compact score label. Text only (built-in fonts are ASCII, so other letters are dropped). */
export function labelTspl(card, { venue = '' } = {}) {
  const L = [];
  const text = (x, y, size, s) => L.push(`TEXT ${x},${y},"3",0,${size},${size},"${ascii(s).slice(0, 40)}"`);
  L.push('SIZE 100 mm,90 mm', 'GAP 3 mm,0 mm', 'DIRECTION 1', 'REFERENCE 0,0', 'DENSITY 8', 'CLS');
  let y = 30;
  if (venue) { text(30, y, 1, venue); y += 40; }
  text(30, y, 2, card.game || card.gameId || 'Game'); y += 60;
  text(30, y, 2, card.team || 'Team'); y += 70;
  text(30, y, 4, `${card.score ?? 0}`); y += 110;
  if (card.rank) { text(30, y, 2, card.rank === 1 ? 'NEW RECORD' : `Rank ${card.rank}`); y += 60; }
  for (const p of (card.players || []).slice(0, 6)) { text(30, y, 1, `${p.name || ''}  ${p.score ?? ''}`); y += 34; }
  text(30, 680, 1, `${(card.date || '').slice(0, 16).replace('T', ' ')}  ${card.difficulty || ''}`);
  L.push('PRINT 1,1');
  return L.join('\r\n') + '\r\n';
}

function ippAttr(tag, name, value) {
  const n = Buffer.from(name), v = Buffer.from(String(value));
  const b = Buffer.alloc(1 + 2 + n.length + 2 + v.length);
  b[0] = tag; b.writeUInt16BE(n.length, 1); n.copy(b, 3); b.writeUInt16BE(v.length, 3 + n.length); v.copy(b, 5 + n.length);
  return b;
}

/** IPP Print-Job body (raw document). */
export function ippPrintJob(host, queue, data, jobName = 'scorecard') {
  const head = Buffer.alloc(8);
  head.writeUInt8(2, 0); head.writeUInt8(0, 1); head.writeUInt16BE(0x0002, 2); head.writeUInt32BE(1, 4);
  return Buffer.concat([head, Buffer.from([0x01]),
    ippAttr(0x47, 'attributes-charset', 'utf-8'), ippAttr(0x48, 'attributes-natural-language', 'en'),
    ippAttr(0x45, 'printer-uri', `ipp://${host}/printers/${queue}`), ippAttr(0x42, 'requesting-user-name', 'msgames'),
    ippAttr(0x42, 'job-name', jobName), ippAttr(0x49, 'document-format', 'application/vnd.cups-raw'),
    Buffer.from([0x03]), Buffer.from(data)]);
}

/** Sends a label to the CUPS raw queue. Resolves { ok, status } (status < 0x100 is success). */
export function printThermal(host, queue, tspl, { timeoutMs = 15_000 } = {}) {
  return new Promise(resolve => {
    const [hostname, port = '631'] = String(host).split(':');
    const body = ippPrintJob(host, queue, Buffer.from(tspl, 'latin1'));
    const req = http.request({ hostname, port: Number(port), path: `/printers/${queue}`, method: 'POST', headers: { 'content-type': 'application/ipp', 'content-length': body.length }, timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { const b = Buffer.concat(chunks); const status = b.length >= 4 ? b.readUInt16BE(2) : 0xffff; resolve({ ok: res.statusCode === 200 && status < 0x100, status }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: null, error: 'The printer did not answer' }); });
    req.on('error', e => resolve({ ok: false, status: null, error: e.message }));
    req.end(body);
  });
}

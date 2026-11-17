// Small file helpers shared by the lib modules: atomic JSON writes (safe on Windows, where a file that is
// being read cannot be renamed over for a moment) and an append-only JSON-lines log.

import fs from 'node:fs';
import path from 'node:path';

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function renameOver(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      if (i >= 4) { fs.copyFileSync(from, to); fs.rmSync(from, { force: true }); return; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1));
    }
  }
}

export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', data);
  renameOver(file + '.tmp', file);
}

export function writeJson(file, value) {
  writeAtomic(file, JSON.stringify(value, null, 2));
}

/** One JSON object per line. A failing write never throws (a log must not stop a paid session). */
export function appendJsonl(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(value) + '\n');
    return true;
  } catch { return false; }
}

/** The last `n` parsed lines of a JSON-lines file (bad lines are skipped). Reads at most the last 4 MB. */
export function tailJsonl(file, n = 50) {
  let text = '';
  try {
    const size = fs.statSync(file).size, max = 4 * 1024 * 1024;
    const fd = fs.openSync(file, 'r');
    try {
      const len = Math.min(size, max), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      text = buf.toString('utf8');
      if (size > max) text = text.slice(text.indexOf('\n') + 1);
    } finally { fs.closeSync(fd); }
  } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* half-written or damaged line */ }
  }
  return out.slice(-n);
}

/** Safe piece of a file name: letters, digits, dash; spaces become dashes. */
export function slug(v, max = 24) {
  return String(v || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, max) || 'x';
}

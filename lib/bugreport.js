// One-click bug report (design section 8): a zip with the server log, the tail of sessions.jsonl, a state snapshot,
// headset logcat (when adb reaches it) and the operator's note. No dependencies: a small zip writer on node:zlib.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const crc32 = buf => zlib.crc32(buf) >>> 0;

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** files: [{ name, data: Buffer|string }] → zip Buffer (deflate). */
export function makeZip(files, when = new Date()) {
  const locals = [], centrals = [];
  let offset = 0;
  const { time, date } = dosTime(when);
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data ?? ''), 'utf8');
    const comp = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Reads a zip made by makeZip (for tests and for checking a report). → [{ name, data }] */
export function readZip(buf) {
  const out = [];
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), xlen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nlen).toString('utf8');
    const body = buf.slice(i + 30 + nlen + xlen, i + 30 + nlen + xlen + size);
    out.push({ name, data: method === 8 ? zlib.inflateRawSync(body) : body });
    i += 30 + nlen + xlen + size;
  }
  return out;
}

/** Where reports go: the Desktop (OneDrive Desktop when that is the real one), or `dir` when given. */
export function reportDir(dir) {
  if (dir) return dir;
  const home = os.homedir();
  for (const d of [path.join(home, 'OneDrive', 'Desktop'), path.join(home, 'Desktop')]) if (fs.existsSync(d)) return d;
  return home;
}

export function reportName(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `MSGames-bugreport-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`;
}

/** The last `max` bytes of a text file ('' when missing). */
export function tailFile(file, max = 2 * 1024 * 1024) {
  try {
    const size = fs.statSync(file).size, len = Math.min(size, max), buf = Buffer.alloc(len);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
    return buf;
  } catch { return Buffer.alloc(0); }
}

/** Mirrors console output into a rolling file (server.log, kept under ~4 MB with one .1 copy). */
export function teeConsole(file, maxBytes = 4 * 1024 * 1024) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch { /* new */ }
  const write = (level, args) => {
    try {
      const line = `${new Date().toISOString()} ${level} ${args.map(a => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
      if (size > maxBytes) { try { fs.renameSync(file, file + '.1'); } catch { /* busy */ } size = 0; }
      fs.appendFileSync(file, line); size += Buffer.byteLength(line);
    } catch { /* logging never stops the server */ }
  };
  for (const [k, lvl] of [['log', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { orig(...a); write(lvl, a); };
  }
}

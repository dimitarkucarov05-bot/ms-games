// Пробен сървър за работа по играта, докато истинският върви с каските.
// Същият код и същите модели, но на друг порт и със СВОЯ папка с данни (копие на зоната),
// така че нищо от пробите не пипа записаната зона, калибровките и играта в залата.
//
//   node tools/dev-server.mjs            → http://localhost:47901  (данни в data-dev/)
//   node tools/dev-server.mjs --fresh    копира наново зоната от истинските данни
//   node tools/dev-server.mjs --port 47911 --data data-dev-lab    още един, със своя папка (за паралелна работа)
//
// После: http://localhost:47901/play/?desktop=1&id=DEV&name=DEV  (игра без каска)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// втори и трети пробен сървър (за работа в няколко сесии едновременно): --port 47911 --data data-dev-lab
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const PORT = Number(arg('--port') || 47901);
const DEV = path.join(HERE, arg('--data') || 'data-dev');
fs.mkdirSync(DEV, { recursive: true });
const src = path.join(HERE, 'data', 'arena.json'), dst = path.join(DEV, 'arena.json');
if (process.argv.includes('--fresh') || !fs.existsSync(dst)) {
  const a = JSON.parse(fs.readFileSync(src, 'utf8'));
  a.calibrations = {}; a.numbers = {}; a.names = {};
  fs.writeFileSync(dst, JSON.stringify(a, null, 2));
  console.log('зоната е копирана в data-dev/');
}
const env = { ...process.env, PORT: String(PORT), TLS_PORT: String(PORT + 42), NO_TLS: '1', NO_PLAY_BEACON: '1', GAME_PORT: String(PORT + 1), ARENA_DATA: DEV, ARENA_DEV: '1' };
spawn(process.execPath, [path.join(HERE, 'server.js')], { env, stdio: 'inherit' });

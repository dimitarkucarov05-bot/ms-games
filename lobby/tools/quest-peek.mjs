// Какво прави каската в момента, без да пипа нищо по нея (само чете през кабела).
//
//   node tools/quest-peek.mjs            състояние на страницата на играта
//   node tools/quest-peek.mjs "израз"    стойността на израз в страницата
//
// За разлика от quest.mjs не прехвърля порт 47801 по кабела, така че не пречи на връзката по Wi-Fi.

import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const adb = (...a) => { try { return execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim(); } catch { return ''; } };

const serial = adb('devices').split('\n').map(l => l.trim().split(/\s+/)).find(l => l[1] === 'device')?.[0];
if (!serial) { console.log('каската не е на кабел'); process.exit(1); }
adb('-s', serial, 'forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
const pages = await fetch('http://127.0.0.1:9222/json', { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null);
if (!pages) { console.log('браузърът на каската не отговаря'); process.exit(1); }
const play = pages.filter(p => p.type === 'page' && p.url.includes('/play/'));
console.log('раздели с играта:', play.length, play.map(p => p.url.replace(/^https?:\/\/[^/]+/, '')).join(' | '));
if (!play.length) process.exit(0);

const expr = process.argv[2] || "JSON.stringify({ id: window.__arena?.me?.id, connected: window.__arena?.connected, inVR: window.__arena?.presenting, space: window.__arena?.space, anchor: window.__arena?.anchor, calibrated: !!window.__arena?.calib, zone: window.__arena?.zone, handR: window.__arena?.hands?.r?.active, handL: window.__arena?.hands?.l?.active, game: window.__arena?.game?.name || null })";
const ws = new WebSocket(play[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
ws.on('message', d => { const m = JSON.parse(d); if (m.id === 1) { console.log(m.result?.result?.value ?? JSON.stringify(m.result)); ws.close(); } });
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
setTimeout(() => process.exit(0), 6000);

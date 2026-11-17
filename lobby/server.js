// Лоби на VR арената — върви на компютъра в залата.
//
//  • каските се свързват по Wi-Fi на  ws://<компютър>:47801/headset
//  • екранът на лобито е на           http://localhost:47801
//  • каските намират компютъра сами по UDP съобщение на порт 47800
//
// Протоколът (какво си пращат каска и компютър) е описан в PROTOCOL.md.

import { execFile, execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import tlsMod from 'node:tls';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { WebSocketServer } from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 47801);
const BEACON_PORT = 47800;
const TLS_PORT = Number(process.env.TLS_PORT || 47843);   // HTTPS за каските: WebXR иска защитена връзка
const DATA = process.env.ARENA_DATA || path.join(HERE, 'data');   // ARENA_DATA: друга папка с данни (пробният сървър, tools/dev-server.mjs)
const ARENA_FILE = path.join(DATA, 'arena.json');
const GAMES_FILE = path.join(DATA, 'games.json');
const MAP_FILE = path.join(DATA, 'arena-map.bin');
const CALIB_HISTORY = path.join(DATA, 'calibration_history');   // старите калибровки преди всяка смяна
const CALIB_LOG = path.join(DATA, 'calibration.log');           // JSON ред за всяко събитие
const CALIB_KEEP = 50;   // gta-vr-1 (07.11.2026): последните 50 копия
// Дневник на лобито — един четим ред за всяко събитие с калибровката (време | каска | събитие | размер | ъгъл | резултат).
// Само на този Mac: data/*.log и calibration_history/ са в .gitignore (картата на залата е лична).
const JOURNAL = path.join(DATA, 'lobby_journal.log');
// картите в APK-то — пази в синхрон с build_apk.sh (-map=...); друга карта = черен екран в очилата
// ЕДНАТА настройка за лобито: data/lobby_map.txt (един ред). Връщане към старото: /Game/Maps/Lobby. Чете го и VR_Varna_Start.sh/.ps1.
const LOBBY_MAP = (() => {
  try {
    const m = fs.readFileSync(path.join(DATA, 'lobby_map.txt'), 'utf8').trim();
    if (/^\/Game\/Maps\/Lobby\w*$/.test(m)) return m;
  } catch {}
  return '/Game/Maps/Lobby';
})();
const ALLOWED_MAPS = [...new Set([LOBBY_MAP, '/Game/Maps/Lobby', '/Game/Maps/Lobby_Synty'])].concat(['/Game/Maps/Arena6x6', '/Game/Maps/Arena6x6_Synty', '/Game/Maps/Station10x5']);
const OFFLINE_AFTER_MS = 10_000;
const LOW_BATTERY = 20;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- записани данни ----------

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
/**
 * Преименуване върху съществуващ файл. На Mac/Linux е атомично. На Windows rename върху файл,
 * който някой чете в момента (сваляне, антивирус, Explorer), дава EPERM/EBUSY/EACCES —
 * пробваме още няколко пъти и накрая копираме върху него.
 */
function renameOver(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      if (i >= 4) { fs.copyFileSync(from, to); fs.rmSync(from, { force: true }); return; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1));   // кратко чакане
    }
  }
}
/** Запис през временен файл — четящият никога не вижда половин файл. */
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', data);
  renameOver(file + '.tmp', file);
}
function writeJson(file, value) {
  writeAtomic(file, JSON.stringify(value, null, 2));
}

// ---------- история на калибровките ----------

/** Ред в data/calibration.log; грешка в лога не спира калибровката. */
function logCalib(event, headsetId, c, extra = {}) {
  const line = {
    time: new Date().toISOString(), event, headsetId: headsetId || null,
    version: c?.version ?? null, width: c?.width ?? null, depth: c?.depth ?? null, yaw: c?.yawDeg ?? null,
    source: c?.source || (c?.shared ? 'shared' : c ? 'corners' : null), ...extra,
  };
  try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(CALIB_LOG, JSON.stringify(line) + '\n'); }
  catch (e) { console.warn('calibration.log:', e.message); }
  // същото и в четимия дневник
  const bits = [];
  if (extra.pending) bits.push('чака „Потвърди"');
  if (extra.reason) bits.push(`повод ${extra.reason}`);
  if ('ok' in extra) bits.push(extra.ok ? 'успех' : 'НЕУСПЕХ');
  if (extra.code != null) bits.push(`код ${extra.code}`);
  if (extra.error) bits.push(String(extra.error));
  if (extra.file) bits.push(`от ${extra.file}`);
  if (extra.prevFile) bits.push(`старата → ${extra.prevFile}`);
  if (extra.source && !c) bits.push(extra.source);
  journal(event, headsetId, c, bits.join(', ') || 'ок');
}

/** Местно време „2026-11-07 18:55:01". */
function localStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Ред в data/lobby_journal.log: време | каска | събитие | Ш×Д | ъгъл | резултат. Грешка тук не спира нищо. */
function journal(event, headsetId, c, result) {
  try {
    let name = '—';
    if (headsetId) {
      let h = null;
      try { h = headsets.get(headsetId); } catch { /* при пускане headsets още ги няма */ }
      const nm = arena?.names?.[headsetId] || h?.name;
      name = nm && nm !== headsetId ? `${nm} (${headsetId})` : headsetId;
    }
    const size = c && Number.isFinite(+c.width) && Number.isFinite(+c.depth) ? `${(+c.width).toFixed(2)}×${(+c.depth).toFixed(2)} м` : '—';
    const yaw = c && Number.isFinite(+c.yawDeg) ? `${(+c.yawDeg).toFixed(1)}°` : '—';
    const ver = c?.version != null ? ` №${c.version}` : '';
    const line = [localStamp(), name, event + ver, size, yaw, String(result ?? '').replace(/[\r\n|]+/g, ' ')].join(' | ');
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(JOURNAL, line + '\n');
  } catch (e) { console.warn('lobby_journal.log:', e.message); }
}

/** Отпечатък на геометрията (без версии/време) — за „същата ли е калибровката". */
function calibSig(shared, calibs) {
  const g = c => c && c.origin ? [c.origin.x, c.origin.z, c.yawDeg, c.width, c.depth].map(v => (+v || 0).toFixed(2)).join(',') : null;
  return [...new Set([shared, ...Object.values(calibs || {})].map(g).filter(Boolean))].sort().join(';');
}

/** Предишната калибровка за „Върни предишната": най-новото копие, различно от сегашната, със същото LBE.
 *  След връщане търсим по-старо от върнатото — второ натискане връща още една стъпка назад. */
function previousBackup() {
  const cur = latestCalibration();
  const from = cur?.restoredFrom || null;
  const curSig = calibSig(arena.sharedCalibration, arena.calibrations);
  const ok = c => c && c.origin && Number.isFinite(+c.yawDeg);
  for (const file of historyFiles()) {
    if (from && file >= from) continue;
    const d = readJson(path.join(CALIB_HISTORY, file), null);
    const all = d?.calibrations && typeof d.calibrations === 'object' ? d.calibrations : null;
    if (!all || !!d.lbeEnabled !== !!arena.lbe?.enabled) continue;
    if (!(d.lbeEnabled && ok(d.sharedCalibration)) && !Object.values(all).some(ok)) continue;
    if (calibSig(d.lbeEnabled ? d.sharedCalibration : null, all) === curSig) continue;
    const c = (d.lbeEnabled && d.sharedCalibration) || (d.headsetId && all[d.headsetId]) || Object.values(all).find(ok);
    return { file, savedAt: d.savedAt ?? null, event: d.event ?? null, headsetId: d.headsetId ?? null, version: d.version ?? null,
      width: c?.width ?? null, depth: c?.depth ?? null, yawDeg: c?.yawDeg ?? null, headsets: Object.keys(all),
      lbeUuids: d.lbeUuids || null, lbeMismatch: lbeUuidMismatch(d.lbeUuids) };
  }
  return null;
}

/** Записва сегашните калибровки преди смяна → data/calibration_history/<време>_v<версия>.json (последните CALIB_KEEP).
 *  Вика се и СЛЕД смяната (събитие „после:…") — новата калибровка също има копие, ако arena.json се повреди. */
function archiveCalibration(event, headsetId, keep = null) {
  const prev = (headsetId && arena.calibrations?.[headsetId])
    || [...Object.values(arena.calibrations || {}), arena.sharedCalibration].filter(Boolean).sort((a, b) => (b.version || 0) - (a.version || 0))[0];
  if (!prev) return null;   // няма какво да пазим
  try {
    fs.mkdirSync(CALIB_HISTORY, { recursive: true });
    const stamp = new Date().toISOString().replace(/:/g, '-');   // без „:" — Windows не ги приема в имена
    let file = `${stamp}_v${prev.version ?? 0}.json`;
    for (let n = 2; fs.existsSync(path.join(CALIB_HISTORY, file)); n++) file = `${stamp}_v${prev.version ?? 0}_${n}.json`;
    writeJson(path.join(CALIB_HISTORY, file), {
      savedAt: new Date().toISOString(), event, headsetId: headsetId || null,
      lbeEnabled: !!arena.lbe?.enabled, version: prev.version ?? 0,
      lbeUuids: lbeUuidsNow(),   // кръг 3: коя LBE карта е имала всяка каска — връщането отказва при друга карта
      sharedCalibration: arena.sharedCalibration || null, calibrations: arena.calibrations || {},
    });
    const all = historyFiles();
    for (const old of all.slice(CALIB_KEEP)) if (old !== keep) fs.rmSync(path.join(CALIB_HISTORY, old), { force: true });
    return file;
  } catch (e) {
    console.warn('calibration_history:', e.message);
    return null;
  }
}

/** uuid на LBE картата по каска (от статуса lbeMap; '' = каската каза, че няма карта). Каски без lbeMap липсват. */
function lbeUuidsNow() {
  const out = {};
  try {
    for (const h of headsets.values()) if (h.lbeMap) out[h.id] = String(h.lbeMap.uuid || '');
  } catch { /* при пускане headsets още ги няма */ }
  return out;
}

/** Каските, чиято LBE карта сега е различна от тази в копието: [{id, saved, now}]. Сравнява само познатите и от двете страни. */
function lbeUuidMismatch(saved) {
  if (!saved || typeof saved !== 'object') return [];   // старо копие без uuid — нямаме с какво да сравним
  const now = lbeUuidsNow();
  return Object.entries(saved).filter(([id, u]) => id in now && now[id] !== String(u || '')).map(([id, u]) => ({ id, saved: String(u || ''), now: now[id] }));
}

/** Файловете в историята, най-новият първи (имената започват с времето). */
function historyFiles() {
  try { return fs.readdirSync(CALIB_HISTORY).filter(f => f.endsWith('.json')).sort().reverse(); } catch { return []; }
}

// Всяка каска има своя калибровка: ъглите са в нейното проследяване, а то е различно за всяка каска.
const arena = readJson(ARENA_FILE, { calibrations: {}, names: {} });
arena.calibrations ||= {};
// Номер на каската в лобито (08.11.2026): постоянен, пази се в arena.json; не се сменя при преименуване.
arena.numbers ||= {};
function headsetNumber(id) {
  if (arena.numbers[id]) return arena.numbers[id];
  const used = new Set(Object.values(arena.numbers));
  let n = 1;
  while (used.has(n)) n++;
  arena.numbers[id] = n;
  writeJson(ARENA_FILE, arena);
  return n;
}
for (const id of Object.keys(arena.calibrations).sort()) headsetNumber(id);   // познатите каски получават номер при старт
if (arena.calibration?.sourceHeadset && !arena.calibrations[arena.calibration.sourceHeadset]) {
  arena.calibrations[arena.calibration.sourceHeadset] = arena.calibration;   // от времето с една обща калибровка
}
delete arena.calibration;
// LBE (PICO Large Space, бърз режим): каските сканират един и същ маркер → една обща нула.
// Тогава калибровката с 4 ъгъла се прави веднъж и важи за всички (sharedCalibration).
// 06.11.2026: стари калибровки с късата страна като ширина → по дългата (картите са строени така)
{
  const seen = new Map();
  for (const [id, c] of Object.entries(arena.calibrations || {})) {
    if (!c || !Array.isArray(c.corners) || c.corners.length !== 4 || !(c.depth > c.width + 0.05)) continue;
    if (!seen.has(c)) {
      if (!seen.size) archiveCalibration('migrate');   // преди първата промяна
      const { skew, ...sol } = solveCorners(c.corners);
      seen.set(c, { ...c, ...sol, version: (c.version || 0) + 1, at: new Date().toISOString() });
    }
    arena.calibrations[id] = seen.get(c);
  }
  if (seen.size) {
    writeJson(ARENA_FILE, arena);
    for (const c of seen.values()) logCalib('migrate', c.sourceHeadset, c);
    console.log(`Калибровки по дългата страна: ${seen.size}`);
  }
}
arena.lbe ||= { enabled: false, length: 20, width: 10, originType: 1, distance: 0.5, openVst: true };
const games = readJson(GAMES_FILE, []);
// игра с карта, която я няма в APK-то, не се пуска (виж /api/launch)
for (const g of games) if (!ALLOWED_MAPS.includes(g.map)) console.warn(`games.json: „${g.name}" е с карта ${g.map} — няма я в APK-то, няма да се пуска`);

const LBE_CODES = {
  0: 'готово', 1: 'неуспех', '-3': 'размерът е извън 3–10 м', 104: 'проследяването е изключено',
  201: 'вече е включено', 202: 'не е включено', 203: 'този начин за нула не се поддържа', 204: 'маркерът не е намерен навреме',
};

function sendLbe(id) {
  const { enabled, length, width, originType, distance, openVst } = arena.lbe;
  return sendTo(id, { type: 'lbe', enable: enabled, length, width, originType, distance, openVst });
}

// Общата игра върви на същия компютър (Unreal, Lobby?listen); каските влизат на този порт.
const GAME_PORT = Number(process.env.GAME_PORT || 7777);
const LIVE_STATUS = path.join(HERE, 'public', 'live', 'status.json');

// Истинският порт на общата игра (10.11.2026): при бърза смяна на картата Unreal понякога не успява да вземе
// 7777 и слуша на 7778 — каските чукаха на 7777 и не влизаха. Гледаме кой UDP порт държи процесът на играта
// и казваме него на каските (serverInfo.port и launch.server.port).
const GAME_PID_FILE = path.join(HERE, '..', 'VRArena', 'Saved', 'VRVarna_game.pid');
let gamePort = GAME_PORT;
function refreshGamePort() {
  let pid = 0;
  try { pid = parseInt(fs.readFileSync(GAME_PID_FILE, 'utf8'), 10) || 0; } catch { return; }
  if (!pid) return;
  execFile('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iUDP'], { timeout: 1500 }, (err, out) => {
    const ports = [...String(out || '').matchAll(/UDP \*:(\d+)/g)].map(m => Number(m[1])).filter(p => p >= GAME_PORT && p < GAME_PORT + 20);
    if (!ports.length) return;
    const p = Math.min(...ports);
    if (p !== gamePort) { console.log(`The game listens on port ${p} (беше ${gamePort})`); gamePort = p; }
  });
}
setInterval(refreshGamePort, 1000);
refreshGamePort();

/** Играта на компютъра (сървърът) върви, ако камерите ѝ са писали преди малко. */
function gameServerUp() {
  const s = readJson(LIVE_STATUS, null);
  return !!s && s.mode === 'server' && Date.now() / 1000 - s.time < 5;
}

/** Размерът на залата в играта: по последната калибровка (LBE или 4 ъгъла), 3–20 м; без калибровка 20 × 10. */
function hallSize() {
  const c = latestCalibration();
  const clampM = v => Math.min(20, Math.max(3, Number(v) || 0));
  return c ? { width: clampM(c.width), depth: clampM(c.depth) } : { width: 20, depth: 10 };
}

/** Последната калибровка — за размера на залата на екрана на лобито. */
function latestCalibration() {
  return Object.values(arena.calibrations).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
}

// ---------- състояние в паметта ----------

/** Версията на кода на страницата за каските, както е на диска сега (const BUILD в public/play/play.js). 0: не се чете. */
let pageBuildSeen = { at: 0, n: 0 };
function pageBuild() {
  if (Date.now() - pageBuildSeen.at > 5000) {
    let n = 0;
    try { n = Number(/const BUILD = (\d+)/.exec(fs.readFileSync(path.join(HERE, 'public', 'play', 'play.js'), 'utf8'))?.[1]) || 0; } catch { /* без файла нищо не се презарежда */ }
    pageBuildSeen = { at: Date.now(), n };
  }
  return pageBuildSeen.n;
}

const headsets = new Map();     // id → данни за каската
const sockets = new Map();      // id → връзка
let pendingCalibration = null;  // калибровка, чакаща „Потвърди" от оператора
const autoBounds = new Set();   // каски, питани за LBE границата при свързване
let session = null;             // текущата игра
let launchVote = null;          // arena13h: гласуването, което пусна текущата игра (null — пусна я операторът)
// картата на общата игра на компютъра; VRLobbyCameras я чете от /api/state и прави ServerTravel
let serverMap = LOBBY_MAP;
// Колоните от LBE (Arena6x6): последният непразен списък за текущата карта, световни координати в см.
// Каската ги праща в статуса; сървърът ги чете от /api/state и слага същите купчини с колизия.
const LBE_COLUMNS_MAX = 64;
const LBE_COLUMNS_GRACE_MS = 10_000;   // след смяна на картата каските още са на старата — не взимаме техния списък
let lbeColumns = [];
let lbeColumnsMapAt = 0;
/** Смяна на картата на общата игра: колоните от старата вече не важат. */
function setServerMap(map) {
  if (map === serverMap) return;
  serverMap = map;
  lbeColumns = [];
  lbeColumnsMapAt = Date.now();
}
/** Списък от статуса на каска. Празен или негоден не трие последния добър. */
function takeLbeColumns(list) {
  if (!Array.isArray(list) || Date.now() - lbeColumnsMapAt < LBE_COLUMNS_GRACE_MS) return;
  const good = list.filter(c => c && typeof c === 'object'
    && [c.x, c.y, c.r].every(v => typeof v === 'number' && Number.isFinite(v)) && c.r > 0)
    .slice(0, LBE_COLUMNS_MAX).map(c => ({ x: c.x, y: c.y, r: c.r }));
  if (good.length) lbeColumns = good;
}

/** Коя карта показват камерите на общата игра сега (status.json → map, напр. "Lobby"). */
function liveMapName() {
  const s = readJson(LIVE_STATUS, null);
  return s && s.map;
}

/** Чака общата игра да е на картата (до ~60 с) и тогава вика then(). */
function whenServerOn(map, then, tries = 0, onFail = null) {
  const want = String(map).split('/').pop();
  if (gameServerUp() && liveMapName() === want) return then();
  // arena13h (С2): при отказ викаме onFail — иначе каските остават „loading“, а сесията и гласуването засядат
  if (tries > SERVER_MAP_TRIES) { toast(`Общата игра не мина на ${want} — виж прозореца на играта на компютъра`, 'error'); if (onFail) onFail(want); return; }
  setTimeout(() => whenServerOn(map, then, tries + 1, onFail), 500);
}
const SERVER_MAP_TRIES = Number(process.env.SERVER_MAP_TRIES) || 120;        // × 0.5 с = ~60 с чакане на картата
const LOADING_TIMEOUT_MS = Number(process.env.LOADING_TIMEOUT_MS) || 120_000; // каска, която „зарежда“ по-дълго, се връща в „idle“
const SESSION_DROP_MS = Number(process.env.SESSION_DROP_MS) || 30_000;        // паднала каска се води в играта още толкова (кратко прекъсване на Wi-Fi не спира играта)
/** Пускането не стана: общата игра се връща в лобито, а гласуването, което го пусна, е „failed“ (VRMapVote нулира READY). */
function launchFailed(vote, why) {
  setServerMap(LOBBY_MAP);
  if (vote && mapVote === vote && vote.state === 'launched') { vote.state = 'failed'; vote.error = why; vote.endedAt = Date.now(); }
}
/** Грешка от API с код и „пробвай пак след N с“ — отиват в отговора: {error, code, retryAfter}. */
function apiError(message, code, retryAfter) {
  const e = new Error(message);
  e.code = code;
  if (retryAfter) e.retryAfter = retryAfter;
  return e;
}
/** Сесията е свършила: никоя нейна каска не играе и не зарежда. */
function sessionOver() {
  return !!session && session.headsets.every(id => headsets.get(id)?.phase !== 'playing' && headsets.get(id)?.phase !== 'loading');
}
let liveWant = null;            // кои камери от Unreal гледа екранът на лобито (виж lobby_bridge.py)
// команда за мача към PC сървъра (чете се от VRLobbyCameras по seq): старт/рестарт/спри/setTeam + режим
// Режимът (matchCfg) върви с ВСЯКА команда — и със setTeam, за да не се губи при стара игра,
// която прилага всяка команда като OperatorCommand (непозната команда = „settings").
const matchCfg = { teams: true, targetKills: 20, roundSeconds: 300, roundsToWin: 3, friendlyFire: false, headshotOneShot: true };
let matchSeq = 0;
let matchCmd = { seq: 0, command: 'settings', ...matchCfg };   // това, което играта чете сега (една команда)
// Играта чете само `matchCmd` (последната), 3–4 пъти/с. Две команди една след друга (setTeam + start)
// биха се „прескочили" → пазим опашка: следващата се показва чак когато играта е видяла текущата
// (GET /api/state от Unreal) или след MATCH_HOLD_MS, ако играта не пита (не върви).
const MATCH_HOLD_MS = 3000;
const matchPending = [];        // командите, които чакат ред (най-старата отпред)
const matchHistory = [];        // последните 20 команди (всички, с seq) → `matchCmds` в /api/state
let matchCmdAt = 0;             // от кога се показва matchCmd
let matchCmdSeen = true;        // играта видяла ли е matchCmd
const teamWant = {};            // headsetId → 1|2: в кой отбор операторът е сложил каската (последно)

function matchCmdNow() {
  if (matchPending.length && (matchCmdSeen || Date.now() - matchCmdAt >= MATCH_HOLD_MS)) {
    matchCmd = matchPending.shift();
    matchCmdAt = Date.now();
    matchCmdSeen = false;
  }
  return matchCmd;
}

function queueMatchCmd(extra) {
  const c = { ...matchCfg, ...extra, seq: ++matchSeq };
  matchHistory.push(c);
  if (matchHistory.length > 20) matchHistory.shift();
  matchPending.push(c);
  if (matchPending.length > 30) matchPending.shift();   // играта не върви от дълго — пазим последните
  matchCmdNow();
  return c;
}

// Unreal (VRLobbyCameras) пита GET /api/state; браузър, python (lobby_bridge.py) и curl не се броят.
function matchSeenBy(req, shown) {
  const ua = String(req?.headers?.['user-agent'] || '');
  if (shown === matchCmd && !/mozilla|python|curl|node|wget/i.test(ua)) matchCmdSeen = true;
}

// Тече ли мач (отброяване или игра) — тогава LBE бутоните, които пипат нулата, са спрени.
function matchRunning() {
  return [...headsets.values()].some(h => h.online && h.match && (h.match.phase === 1 || h.match.phase === 2));
}

// ---------- гласуване за карта (arena13, т. 5) ----------
// Всички в общото лоби са дали READY (часовникът) → сървърът на играта (AVRMapVote в Lobby*) вика
// POST /api/mapvote/start. Каските гласуват с докосване → POST /api/mapvote/vote. Край: мнозинство
// (> половината от гласоподавателите), всички гласували (най-много гласове, при равенство — първата в
// списъка) или 30 с (0 гласа → първата карта, иначе най-много гласове). Пускането е през същия
// POST /api/launch като бутоните на екрана. Виж PROTOCOL.md → „Гласуване за карта“.
const MAP_VOTE_SECONDS = 30;
const MAP_VOTE_OPTIONS = 2;          // „сега са 2 карти“: първите 2 игри от games.json с карта в APK-то
const MAP_VOTE_KEEP_MS = 15_000;     // резултатът се вижда още толкова, после гласуването е „idle“
let mapVote = null;                  // {id, state, options, voters, votes, startedAt, deadline, result, error, endedAt}
let mapVoteSeq = 0;

/** Картите за гласуване: първите MAP_VOTE_OPTIONS игри с позволена карта (редът е от games.json). */
function mapVoteOptions() {
  return games.filter(g => ALLOWED_MAPS.includes(g.map) && !/^\/Game\/Maps\/Lobby/.test(g.map))
    .slice(0, MAP_VOTE_OPTIONS)
    // label — на латиница за надписа в очилата (TextRender в Unreal няма кирилица): games.json `label` или id-то
    .map(g => ({ gameId: g.id, name: g.name, label: String(g.label || g.id).toUpperCase().replace(/[-_]+/g, ' '), map: g.map, color: g.color || '#888888' }));
}

/** Какво виждат екранът и сървърът на играта (GET /api/mapvote и `mapVote` в /api/state). */
function mapVoteView() {
  const v = mapVote;
  if (!v || (v.endedAt && Date.now() - v.endedAt > MAP_VOTE_KEEP_MS && v.state !== 'voting')) {
    return { id: v ? v.id : 0, state: 'idle', options: mapVoteOptions().map(o => ({ ...o, votes: 0 })), voters: 0, voted: 0, remaining: 0, seconds: MAP_VOTE_SECONDS, result: null, error: null };
  }
  const counts = mapVoteCounts(v);
  return {
    id: v.id,
    state: v.state,   // voting | launching | launched | failed | cancelled
    options: v.options.map(o => ({ ...o, votes: counts[o.gameId] || 0 })),
    voters: v.voters.length,
    voted: Object.keys(v.votes).length,
    votes: v.votes,   // headsetId → gameId
    remaining: v.state === 'voting' ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0,
    seconds: v.seconds || MAP_VOTE_SECONDS,
    result: v.result,  // {gameId, name, reason: majority|all|timeout|empty}
    error: v.error,
  };
}

function mapVoteCounts(v) {
  const counts = {};
  for (const g of Object.values(v.votes)) counts[g] = (counts[g] || 0) + 1;
  return counts;
}

/** Победителят по гласовете; при равенство — по-рано в списъка. null — няма гласове. */
function mapVoteLeader(v) {
  const counts = mapVoteCounts(v);
  let best = null;
  for (const o of v.options) if ((counts[o.gameId] || 0) > 0 && (!best || counts[o.gameId] > counts[best.gameId])) best = o;
  return best ? { option: best, votes: counts[best.gameId] } : null;
}

/** След всеки глас: мнозинство или всички гласували → край. */
function mapVoteCheck() {
  const v = mapVote;
  if (!v || v.state !== 'voting') return;
  const lead = mapVoteLeader(v);
  if (lead && lead.votes * 2 > v.voters.length) return mapVoteFinish(lead.option, 'majority');
  if (v.voters.length && Object.keys(v.votes).length >= v.voters.length) return mapVoteFinish(lead ? lead.option : v.options[0], 'all');
  if (Date.now() >= v.deadline) return lead ? mapVoteFinish(lead.option, 'timeout') : mapVoteFinish(v.options[0], 'empty');
}

/** Пуска избраната карта по съществуващия път (POST /api/launch) — на гласоподавателите. */
function mapVoteFinish(option, reason) {
  const v = mapVote;
  // arena13i (У6): никой не е в гласуването (всички излязоха) → не пускаме карта на „всички свободни“
  if (!v.voters.length) {
    v.state = 'failed'; v.error = 'няма гласоподаватели'; v.result = null; v.endedAt = Date.now();
    console.log(`Гласуване №${v.id}: няма гласоподаватели — нищо не се пуска`);
    toast('Гласуване: няма никой — нищо не се пуска', 'warn');
    return pushState();
  }
  v.state = 'launching';
  v.result = { gameId: option.gameId, name: option.name, reason };
  v.endedAt = Date.now();
  const why = { majority: 'мнозинство', all: 'всички гласуваха', timeout: 'времето изтече', empty: 'няма глас — първата карта' }[reason];
  console.log(`Гласуване №${v.id}: ${option.name} (${why}) ${JSON.stringify(mapVoteCounts(v))}`);
  try {
    // voters: каските от общото лоби; празно → /api/launch взима всички свързани свободни
    api['POST /api/launch']({ gameId: option.gameId, headsetIds: v.voters, fromVote: true });
    v.state = 'launched';
    toast(`Гласуване: ${option.name} (${why})`, 'ok');
  } catch (e) {
    v.state = 'failed';
    v.error = String(e.message || e);
    toast(`Гласуване: ${option.name} не тръгна — ${v.error}`, 'error');
  }
  pushState();
}

// таймерът: 30 с без мнозинство → край (виж mapVoteCheck)
let mapVoteShown = -1;
setInterval(() => {
  if (!mapVote || mapVote.state !== 'voting') return;
  mapVoteCheck();
  const left = mapVoteView().remaining;
  if (left !== mapVoteShown || mapVote.state !== 'voting') { mapVoteShown = left; pushState(); }   // екранът — веднъж в секунда
}, 250);

function headsetView(h) {
  return {
    id: h.id,
    number: headsetNumber(h.id),
    name: arena.names[h.id] || h.name || h.id,
    nameIsCustom: !!arena.names[h.id],   // arena14: името е сложено с rename (arena.names), не е името на устройството
    model: h.model,
    web: !!h.web,   // каска през браузър: може да пуска уеб игри
    desk: !!h.desk,
    ip: h.ip,
    online: h.online,
    battery: h.battery,
    charging: h.charging,
    controllers: h.controllers,
    wifi: h.wifi,
    app: h.app,
    phase: h.phase,
    tracking: h.tracking,
    pos: h.pos,
    calibrationVersion: h.calibrationVersion,
    calibrated: !!arena.calibrations[h.id] && h.calibrationVersion === arena.calibrations[h.id].version,
    hasCalibration: !!arena.calibrations[h.id],
    load: h.phase === 'loading' && typeof h.load === 'number' ? h.load : null, launchError: h.launchError || null,
    build: h.build || 0, inVR: !!h.inVR, anchor: h.anchor || null, anchorN: h.anchorN || 0,   // версия на кода в каската, във VR ли е, държи ли котвата
    lbe: h.lbe || null,   // какво казва каската: {on, length, width, origin, action, code}
    lbeMap: h.lbeMap || null,   // LBE картата в каската: {has, uuid, markers, fileTime, bytes, inEffect, width, depth}
    calibStep: h.calibStep,
    fps: h.fps,
    volume: h.volume ?? 50,
    sleeping: !!h.sleeping,
    user: h.user || null,
    yaw: h.yaw ?? 0,
    match: h.match || null,
    team: matchTeamOf(h),   // 0 няма / не се знае, 1 червен, 2 син (по статуса от каската)
    lowBattery: typeof h.battery === 'number' && h.battery < LOW_BATTERY && !h.charging,
  };
}

// Състоянието на мача за таблицата: фаза, таймер, отборни точки и ред по играч.
// Фазата и отборните точки са еднакви за всички каски (общият GameState) — взимаме от която и да е.
// Отбори (07.11.2026): 1 = ЧЕРВЕН, 2 = СИН. Стар APK праща `blue` (тогава отбор 1) + `orange` —
// там значенията са други, затова такава каска се показва като „не се знае" (0), без срив.
const isLegacyMatch = m => !!m && typeof m === 'object' && 'orange' in m && !('red' in m);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
function matchTeamOf(h) {
  if (!h.match || typeof h.match !== 'object' || isLegacyMatch(h.match)) return 0;
  const t = num(h.match.team);
  return t === 1 || t === 2 ? t : 0;
}

// Нов дизайн (Arena6x6): кой е в кръга преди рунда. Полетата идват от статуса на каската и ги няма
// при стар APK и в другите карти — тогава няма `circle` и екранът не показва нищо ново.
function circleSummary(hs) {
  const val = (m, k) => m[k] ?? m[k[0].toUpperCase() + k.slice(1)];   // inCircleRed или InCircleRed
  const has = (m, k) => val(m, k) !== undefined && val(m, k) !== null && val(m, k) !== '' && Number.isFinite(Number(val(m, k)));
  const src = hs.map(h => h.match).find(m => !isLegacyMatch(m) && (num(val(m, 'neededRed')) > 0 || num(val(m, 'neededBlue')) > 0));
  if (!src || !has(src, 'neededRed') || !has(src, 'neededBlue')) return null;
  const known = hs.filter(h => typeof h.match.inCircle === 'boolean');   // по желание: всяка каска казва за себе си
  return {
    inRed: num(val(src, 'inCircleRed')), inBlue: num(val(src, 'inCircleBlue')),
    neededRed: num(val(src, 'neededRed')), neededBlue: num(val(src, 'neededBlue')),
    countdown: Math.max(0, num(val(src, 'startCountdown'))),
    missingKnown: known.length > 0,
    missing: known.filter(h => !h.match.inCircle && matchTeamOf(h)).map(h => ({ id: h.id, name: arena.names[h.id] || h.name || h.id, team: matchTeamOf(h) })),
  };
}

let roundTimed = false;   // рундът има лимит (каската е пращала remaining > 0) → не броим
let roundSince = 0;   // arena13h: кога лобито видя фаза „playing“ — за изминалото време, ако каската не праща elapsed
function matchSummary() {
  const hs = [...headsets.values()].filter(h => h.online && h.match && typeof h.match === 'object');
  if (!hs.length) { roundSince = 0; return null; }
  const fresh = hs.filter(h => !isLegacyMatch(h.match));
  const any = (fresh[0] || hs[0]).match;   // общото (точки, рундове) — от каска с новия формат
  const legacy = !fresh.length;
  const PHASES = ['waiting', 'countdown', 'playing', 'over'];
  const board = hs.map(h => ({
    id: h.id,
    name: arena.names[h.id] || h.name || h.id,
    team: matchTeamOf(h),
    legacy: isLegacyMatch(h.match),
    kills: num(h.match.kills),
    deaths: num(h.match.deaths),
    points: num(h.match.points),
  })).sort((a, b) => b.points - a.points || b.kills - a.kills);
  const reds = board.filter(p => p.team === 1).length, blues = board.filter(p => p.team === 2).length;
  const phase = PHASES[any.phase] || 'waiting';
  const remaining = Math.max(0, ...hs.map(h => num(h.match.remaining)));
  let elapsed = Math.max(0, ...hs.map(h => num(h.match.elapsed)));   // arena13d: от каската, ако го праща
  // arena13h: каската не праща elapsed и няма лимит (RoundTimeLimit=0) → лобито брои само от началото на „playing“
  // Само докато играта върви в поне една каска (стар match след Стоп не брои) и рундът не е имал лимит.
  if (phase === 'playing' && hs.some(h => h.phase === 'playing')) {
    if (!roundSince) { roundSince = Date.now(); roundTimed = false; }
    if (remaining) roundTimed = true;
    if (!elapsed && !remaining && !roundTimed) elapsed = Math.floor((Date.now() - roundSince) / 1000);
  } else roundSince = 0;
  return {
    phase,
    remaining,
    elapsed,   // изминалото време на рунда, когато е без лимит
    red: legacy ? 0 : num(any.red),
    blue: legacy ? 0 : num(any.blue),
    redRounds: legacy ? 0 : num(any.redRounds),
    blueRounds: legacy ? 0 : num(any.blueRounds),
    roundsToWin: num(any.roundsToWin) || matchCfg.roundsToWin,
    friendlyFire: typeof any.friendlyFire === 'boolean' ? any.friendlyFire : null,
    headshotOneShot: typeof any.headshotOneShot === 'boolean' ? any.headshotOneShot : null,
    legacy,                                   // всички каски са със стар APK (orange) — точките не се знаят
    legacyCount: hs.length - fresh.length,
    reds, blues,
    unbalanced: Math.abs(reds - blues) > 1,   // само предупреждение, никой не се мести сам
    leader: any.leader || '',
    targetKills: num(any.targetKills),
    circle: circleSummary(hs),                // null: картата или каските не пращат кръговете
    board,
  };
}


// ---------- събития от мача към други приложения (arena14, LabCoin) ----------
// data/webhooks.json {"urls":["http://127.0.0.1:4780/api/arena/event"]} — няма файл или е празен → нищо не се праща.
// Файлът се чете при всяко събитие (включва се и се изключва без рестарт). Виж PROTOCOL.md → „Събития от мача“.
const WEBHOOKS_FILE = path.join(DATA, 'webhooks.json');
const EVENTS_KEEP = 50;
const EVENT_BOOT = Date.now();          // началото на eventId — сменя се при всеки старт на лобито
const WEBHOOK_TIMEOUT_MS = 2000;
// Таблицата се взима малко след събитието: каските пращат статус една по една и последното убийство идва със закъснение.
const EVENT_SETTLE_MS = Number(process.env.EVENT_SETTLE_MS) || 2000;
const WEBHOOK_RETRY_MS = [0, 1000, 3000];   // 3 опита: сега, след 1 с, след 3 с
const matchEvents = [];                 // последните EVENTS_KEEP събития (GET /api/match/events)
let eventSeq = 0;
let eventMatchNo = 1;                   // № на мача от старта на лобито
let evPrev = null;                      // {red, blue, phase} от предишната проверка
let evMatchEnded = false;               // match_end вече е пратен за този мач

// Адресите: първо data/webhooks.json (ако има поне един годен), иначе env LABCOIN_EVENT_URL (един или няколко със запетая).
// Няма нито едното → изключено. Няма адрес по подразбиране — без настройка лобито не праща нищо.
function webhookUrls() {
  const good = list => list.filter(u => typeof u === 'string' && /^https?:\/\/[^\s]+$/.test(u)).slice(0, 5);
  const cfg = readJson(WEBHOOKS_FILE, null);
  const fromFile = good(cfg && Array.isArray(cfg.urls) ? cfg.urls : []);
  if (fromFile.length) return fromFile;
  return good(String(process.env.LABCOIN_EVENT_URL || '').split(',').map(u => u.trim()));
}
// Последният видян ред на всяка каска от началото на мача — паднала каска остава в таблицата с online:false.
const evRows = new Map();   // headsetId → {headsetId, number, name, team, kills, deaths, points}
function noteEventBoard(m) {
  for (const p of m.board) evRows.set(p.id, { headsetId: p.id, number: headsetNumber(p.id), name: p.name, team: p.team === 1 || p.team === 2 ? p.team : 0, kills: p.kills, deaths: p.deaths, points: p.points });
}
function eventBoard(m) {
  const on = new Set(m ? m.board.map(p => p.id) : []);
  return [...evRows.values()].map(r => ({ ...r, online: on.has(r.headsetId) })).sort((a, b) => b.points - a.points || b.kills - a.kills);
}

// Опашка за всеки адрес: събитията тръгват ПО РЕД, по едно наведнъж. Докато едно е в повторни опити, следващите чакат
// (match_end не изпреварва round_end). След 3 неуспешни опита събитието се отказва и тръгва следващото.
const webhookQueues = new Map();   // url → {items: [ev…], busy}
function postWebhook(url, ev) {
  let q = webhookQueues.get(url);
  if (!q) webhookQueues.set(url, q = { items: [], busy: false });
  q.items.push(ev);
  if (q.items.length > EVENTS_KEEP) q.items.shift();
  if (!q.busy) drainWebhook(url, q);
}
async function drainWebhook(url, q) {
  q.busy = true;
  try {
    while (q.items.length) {
      const ev = q.items.shift();
      for (let attempt = 0; attempt < WEBHOOK_RETRY_MS.length; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, WEBHOOK_RETRY_MS[attempt] - WEBHOOK_RETRY_MS[attempt - 1]));
        let why;
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev), signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
          if (res.ok) { console.log(`Събитие ${ev.eventId} ${ev.type} → ${url}: прието (опит ${attempt + 1})`); break; }
          why = `HTTP ${res.status}`;
        } catch (e) { why = e.name === 'TimeoutError' ? 'няма отговор за 2 с' : String(e.cause?.code || e.message || e); }
        if (attempt + 1 < WEBHOOK_RETRY_MS.length) console.log(`Събитие ${ev.eventId} → ${url}: ${why}, опит ${attempt + 1} — пробвам пак`);
        else console.log(`Събитие ${ev.eventId} ${ev.type} → ${url}: НЕ Е ПРАТЕНО (${why}, ${attempt + 1} опита) — чете се от GET /api/match/events`);
      }
    }
  } catch (e) { console.warn('събития от мача:', e.message); }
  q.busy = false;
}

function emitMatchEvent(type, m, winnerTeam) {
  const urls = webhookUrls();
  if (!urls.length) return;   // изключено: нито пращаме, нито пазим
  const ev = {
    v: 1, type,
    eventId: `${EVENT_BOOT}-${++eventSeq}`,
    at: new Date().toISOString(),
    matchSeq: eventMatchNo,
    gameId: session ? session.gameId : null,
    round: m.redRounds + m.blueRounds,
    winnerTeam,
    redRounds: m.redRounds, blueRounds: m.blueRounds, roundsToWin: m.roundsToWin,
    red: m.red, blue: m.blue,
    board: [],
  };
  noteEventBoard(m);
  ev.board = eventBoard(m);
  console.log(`Събитие ${ev.eventId}: ${type}, мач №${ev.matchSeq}, рунд ${ev.round}, победител ${winnerTeam}, ${m.redRounds}:${m.blueRounds}`);
  setTimeout(() => {
    try {   // по-прясна таблица и точки, ако мачът още е същият (рундовете не са мръднали)
      const now = matchSummary();
      if (now && !now.legacy && now.redRounds === ev.redRounds && now.blueRounds === ev.blueRounds && ev.matchSeq === eventMatchNo) { noteEventBoard(now); ev.board = eventBoard(now); ev.red = now.red; ev.blue = now.blue; }
    } catch (e) { console.warn('събития от мача:', e.message); }
    matchEvents.push(ev);
    if (matchEvents.length > EVENTS_KEEP) matchEvents.shift();
    for (const url of urls) postWebhook(url, ev);
  }, EVENT_SETTLE_MS);
}

/** Нов мач: вика се при „start“ от оператора, при пускане на игра и когато рундовете се нулират. */
function newMatchForEvents() {
  if (evPrev && (evMatchEnded || evPrev.red + evPrev.blue > 0)) eventMatchNo++;
  evPrev = null; evMatchEnded = false; evRows.clear();
}

/** Сравнява мача с предишната проверка и праща round_end / match_end. Вика се при всеки статус от каска. */
function watchMatchEvents() {
  const m = matchSummary();
  if (!m || m.legacy) return;   // няма каски в мача (или стар APK) — чакаме, без да нулираме
  const cur = { red: m.redRounds, blue: m.blueRounds, phase: m.phase };
  const prev = evPrev;
  evPrev = cur;
  if (!prev) return;            // първо виждане (и след рестарт на лобито по средата на мач) — само запомняме
  // рундовете паднаха, или след края на мач без рундове тръгна нова фаза → нов мач
  if (cur.red + cur.blue < prev.red + prev.blue || (evMatchEnded && prev.phase === 'over' && cur.phase !== 'over' && cur.red + cur.blue === 0)) {
    eventMatchNo++; evMatchEnded = false; evRows.clear(); noteEventBoard(m);
    return;
  }
  noteEventBoard(m);
  if (evMatchEnded) return;
  if (cur.red > prev.red) emitMatchEvent('round_end', m, 1);
  if (cur.blue > prev.blue) emitMatchEvent('round_end', m, 2);
  // Край на мача. Фаза „over“ идва след ВСЕКИ рунд (EArenaPhase::RoundOver), затова сама не стига:
  //  • отбор стигна roundsToWin;
  //  • каската казва matchOver (ако APK-то го праща) или надписът е за край на мач („…МАЧА“ / „МАЧЪТ Е НАРАВНО“ — таван рундове);
  //  • режим без рундове (roundsToWin = 0): „over“ е краят.
  const any = [...headsets.values()].find(h => h.online && h.match && typeof h.match === 'object' && !isLegacyMatch(h.match))?.match || {};
  const rtw = num(any.roundsToWin);
  const reached = rtw > 0 && (cur.red >= rtw || cur.blue >= rtw);
  const overNow = cur.phase === 'over' && prev.phase !== 'over';
  const said = any.matchOver === true || (cur.phase === 'over' && /МАЧ/i.test(String(any.leader || '')));
  if (reached || said || (overNow && rtw === 0)) {
    evMatchEnded = true;
    const w = cur.red > cur.blue ? 1 : cur.blue > cur.red ? 2 : (cur.red + cur.blue === 0 ? (m.red > m.blue ? 1 : m.blue > m.red ? 2 : 0) : 0);
    emitMatchEvent('match_end', m, w);
  }
}

function snapshot() {
  return {
    type: 'state',
    headsets: [...headsets.values()].map(headsetView).sort((a, b) => a.name.localeCompare(b.name, 'bg', { numeric: true })),
    calibration: latestCalibration(),
    calibrations: arena.calibrations,
    hall: hallSize(),   // залата в играта (и на компютъра) — колкото последната калибровка
    match: matchSummary(),   // живата таблица на мача (точки, отбори, таймер)
    lbe: arena.lbe,
    lbeShare: lbeShareView(),   // споделяне на LBE карта: фаза и резултат по каска
    lbeRefUuid: lbeRefUuid(),   // „правилната" LBE карта (за „друга карта" в „Каски")
    pendingBounds: pendingBounds ? { id: pendingBounds.id, width: pendingBounds.width, depth: pendingBounds.depth, curWidth: pendingBounds.curWidth, curDepth: pendingBounds.curDepth } : null,
    pendingCalibration,
    gameServer: gameServerUp(),
    serverMap: ALLOWED_MAPS.includes(serverMap) ? serverMap : LOBBY_MAP,   // VRLobbyCameras сменя картата на общата игра, ако е различна
    games,
    session,
    scoresVersion, lastResult,      // класацията е мръднала (пултът я тегли наново) и последният резултат
    // мостът в Unreal снима само тези камери; null = никой не е казал (снимай всички)
    liveWant: liveWant && Date.now() - liveWant.at < 10_000 ? liveWant.cams : null,
    matchCmd: matchCmdNow(),   // ЕДНА команда + режим за мача (PC сървърът я прилага по seq) — виж PROTOCOL.md
    matchCmds: matchHistory,   // последните до 20 команди с растящ seq (за игра, която чете всички > последния)
    matchPending: matchPending.length,   // колко команди чакат ред след matchCmd
    lbeColumns,                // колоните от LBE за текущата карта: [{x, y, r}] в см, [] = няма — виж PROTOCOL.md
    matchCfg,                  // текущият режим (за полетата в екрана)
    teamWant,                  // headsetId → 1|2: къде операторът е сложил каската
    matchRunning: matchRunning(),
    mapVote: mapVoteView(),   // гласуването за карта (arena13) — виж PROTOCOL.md
    serverAddresses: lanAddresses(),
    play: { https: !!secureServer, port: TLS_PORT, path: '/play/' },
    zone: zoneView(),
    autoStart: arena.autoStart || null,      // сам пуска игра на всяка каска, която дойде          // начертаната зона: { poly, obstacles, hall, markers } в координатите на залата
    zoneReady: !!zoneLib,   // откъде каските отварят играта
  };
}

// ---------- екран на лобито (браузър) ----------

const uiClients = new Set();
let pushTimer = null;
function pushState() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const msg = JSON.stringify(snapshot());
    for (const ws of uiClients) if (ws.readyState === 1) ws.send(msg);
  }, 100);
}
function toast(text, level = 'info') {
  const msg = JSON.stringify({ type: 'toast', text, level });
  for (const ws of uiClients) if (ws.readyState === 1) ws.send(msg);
}

// ---------- команди към каските ----------

function sendTo(id, message) {
  const ws = sockets.get(id);
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(message));
  return true;
}

/** Казва на каската дали играта на компютъра върви и на коя карта е. */
function sendServerInfo(id) {
  return sendTo(id, serverInfoFor(id));
}
/** Каската е заета с калибриране или внос/износ на LBE карта → не трябва да влиза сама в общото лоби. */
function headsetBusy(id) {
  const h = headsets.get(id);
  if (h && h.phase === 'calibrating') return true;
  if (pendingCalibration && pendingCalibration.sourceHeadset === id) return true;   // чака „Потвърди"
  const s = lbeShare;
  return !!(s && !s.doneAt && (s.from === id || (s.to || []).includes(id)));
}
/** serverInfo за една каска: `up` е false, докато тя е заета (каската влиза сама само при up && map == Lobby). */
function serverInfoFor(id) {
  return { type: 'serverInfo', up: gameServerUp() && !headsetBusy(id), map: serverMap, port: gamePort };
}

function applyCalibrationTo(id, fresh = false) {
  const c = arena.calibrations[id];
  if (!c) return false;
  const { version, origin, yawDeg, width, depth, corners, hasMap, floorY } = c;
  const sent = sendTo(id, {
    type: 'applyCalibration',
    // markers + zoneAt: двете точки на пода, за които каската връзва котвите си (и коя зона е това)
    calibration: { version, origin, yawDeg, width, depth, corners, floorY: floorY || 0, fresh, markers: arena.zone?.markers || null, zoneAt: arena.zone?.at || null },   // fresh: току-що мерено в сегашното проследяване на каската
    mapUrl: hasMap ? `/api/map?v=${version}` : null,
  });
  journal('applyCalibration', id, c, sent ? 'изпратена на каската' : 'НЕ е изпратена (каската не е свързана)');
  return sent;
}

// ---------- LBE карта: споделяне от една каска към другите (07.11.2026) ----------
// Каската праща lbeMap (има ли карта, uuid, размер). „Сподели LBE": лобито иска износ от източника
// (lbeExport) → той качва zip-а на POST /api/lbe/upload → другите го свалят от
// GET /api/lbe/map/<mapId>.zip (lbeImport) → lbeImportResult. Всичко се пише в calibration.log (lbeShare*).
const LBE_MAPS = path.join(DATA, 'lbe_maps');
const LBE_MAX_BYTES = 300 * 1024 * 1024;
const LBE_KEEP = 5;                     // пазим последните 5 zip-а
const LBE_EXPORT_MS = 5 * 60_000;       // износ + качване
const LBE_IMPORT_MS = 5 * 60_000;       // сваляне + внос на всички цели
const LBE_IMPORT_CODES = { 0: 'картата е активна', 101: 'няма файл', 104: 'локализацията е изключена' };
let lbeShare = null;                    // текущото (или последното) споделяне
let lbeShareSeq = 0;
let lbeRefFrom = null;                  // източникът на последното споделяне — неговият uuid е „правилният"

const lbeName = id => (headsets.get(id) ? headsetView(headsets.get(id)).name : id);
const lbeMb = b => `${(b / 1048576).toFixed(1)} MB`;
const lbeLog = (event, id, extra = {}) => logCalib(event, id, null, { source: 'lbeShare', shareId: lbeShare?.id ?? null, ...extra });

/** uuid за сравнение: от източника на последното споделяне, иначе най-честият сред каските. */
function lbeRefUuid() {
  const ref = lbeRefFrom && headsets.get(lbeRefFrom)?.lbeMap;
  if (ref?.has && ref.uuid) return ref.uuid;
  const count = new Map();
  for (const h of headsets.values()) if (h.lbeMap?.has && h.lbeMap.uuid) count.set(h.lbeMap.uuid, (count.get(h.lbeMap.uuid) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** Споделянето за екрана (без таймери). */
function lbeShareView() {
  const s = lbeShare;
  if (!s) return null;
  const results = {};
  for (const [id, r] of Object.entries(s.results)) results[id] = { name: lbeName(id), state: r.state, code: r.code ?? null, error: r.error || '' };
  return {
    id: s.id, from: s.from, fromName: lbeName(s.from), to: s.to, phase: s.phase, error: s.error || '',
    bytes: s.bytes || 0, uuid: s.uuid || '', mapId: s.mapId || null, startedAt: s.startedAt, doneAt: s.doneAt || null, results,
  };
}

function lbeShareStart(from, to) {
  if (lbeShare && !lbeShare.doneAt) throw new Error('Вече се споделя LBE карта — изчакай да свърши');
  const src = headsets.get(from);
  if (!src?.online || !sockets.has(from)) throw new Error('Каската с картата не е свързана');
  if (!src.lbeMap?.has) throw new Error(`${lbeName(from)} няма LBE карта`);
  const targets = [...new Set((Array.isArray(to) ? to : []).map(String))].filter(id => id !== from);
  if (!targets.length) throw new Error('Pick at least one headset');
  const off = targets.filter(id => !sockets.has(id));
  if (off.length) throw new Error(`Not connected: ${off.map(lbeName).join(', ')}`);
  const id = `${Date.now()}_${++lbeShareSeq}`;
  lbeShare = {
    id, from, to: targets, requestId: `exp_${id}`, phase: 'exporting', startedAt: new Date().toISOString(),
    uuid: src.lbeMap.uuid || '', results: Object.fromEntries(targets.map(t => [t, { state: 'waiting' }])), imports: new Map(),
  };
  lbeLog('lbeShareStart', from, { to: targets, uuid: lbeShare.uuid, requestId: lbeShare.requestId });
  sendTo(from, { type: 'lbeExport', requestId: lbeShare.requestId });
  lbeShare.timer = setTimeout(() => lbeShareFail('каската не върна картата за 5 мин (стар APK?)'), LBE_EXPORT_MS);
  toast(`LBE: ${lbeName(from)} изнася картата…`);
  return lbeShareView();
}

function lbeShareFail(reason) {
  const s = lbeShare;
  if (!s || s.doneAt) return;
  clearTimeout(s.timer);
  lbeLog('lbeShareFail', s.from, { error: reason, phase: s.phase });
  s.phase = 'failed'; s.error = reason; s.doneAt = new Date().toISOString();
  toast(`LBE споделянето спря: ${reason}`, 'error');
  pushState();
}

function lbeShareFinish() {
  const s = lbeShare;
  if (!s || s.doneAt) return;
  clearTimeout(s.timer);
  s.phase = 'done'; s.doneAt = new Date().toISOString();
  const ok = s.to.filter(t => s.results[t].state === 'ok');
  const bad = s.to.filter(t => s.results[t].state !== 'ok');
  if (ok.length) lbeRefFrom = s.from;
  lbeLog('lbeShareDone', s.from, { ok, failed: bad.map(t => ({ id: t, error: s.results[t].error || '' })), mapId: s.mapId });
  toast(`LBE от ${lbeName(s.from)}: готово ${ok.length} от ${s.to.length}` +
    (bad.length ? ` · не стана: ${bad.map(t => `${lbeName(t)} (${s.results[t].error || 'грешка'})`).join(', ')}` : ''), bad.length ? 'warn' : 'ok');
  lbePrune();
  pushState();
}

/** Картата е при лобито → пращаме lbeImport на всяка цел (веднъж). */
function lbeShareImports() {
  const s = lbeShare;
  if (!s || s.doneAt || s.phase === 'importing' || !s.mapId) return;
  clearTimeout(s.timer);
  s.phase = 'importing';
  const url = `/api/lbe/map/${s.mapId}.zip`;
  let n = 0, sent = 0;
  for (const t of s.to) {
    const requestId = `imp_${s.id}_${++n}`;
    const r = s.results[t];
    s.imports.set(requestId, t);
    if (sendTo(t, { type: 'lbeImport', requestId, url, uuid: s.uuid })) {
      r.state = 'sent'; r.requestId = requestId; sent++;
      lbeLog('lbeShareImportSent', t, { requestId, mapId: s.mapId });
    } else {
      r.state = 'error'; r.error = 'не е свързана';
      lbeLog('lbeShareImport', t, { requestId, ok: false, error: r.error });
    }
  }
  toast(`LBE: картата (${lbeMb(s.bytes)}) е при лобито — пращам на ${sent} каски…`);
  s.timer = setTimeout(() => {
    for (const t of s.to) if (s.results[t].state === 'sent') {
      Object.assign(s.results[t], { state: 'error', error: 'не отговори за 5 мин' });
      lbeLog('lbeShareImport', t, { ok: false, error: 'timeout' });
    }
    lbeShareFinish();
  }, LBE_IMPORT_MS);
  lbeShareCheckDone();
}

function lbeShareCheckDone() {
  const s = lbeShare;
  if (s && !s.doneAt && s.phase === 'importing' && s.to.every(t => !['waiting', 'sent'].includes(s.results[t].state))) lbeShareFinish();
}

function onLbeExportResult(id, msg) {
  const s = lbeShare;
  if (!s || s.doneAt || s.from !== id || s.requestId !== msg.requestId) return;
  lbeLog('lbeShareExport', id, { ok: !!msg.ok, error: msg.error || '', bytes: msg.bytes ?? null, uuid: msg.uuid || '' });
  if (!msg.ok) return lbeShareFail(`${lbeName(id)}: износът не стана (${msg.error || 'грешка'})`);
  if (msg.uuid) s.uuid = String(msg.uuid);
  if (s.mapId) return lbeShareImports();
  if (s.phase === 'exporting') lbeShareFail(`${lbeName(id)} каза „готово", но zip-ът не дойде`);
  // phase 'uploading' → чакаме края на качването
}

function onLbeImportResult(id, msg) {
  const s = lbeShare;
  if (!s || s.imports.get(msg.requestId) !== id) return;
  const r = s.results[id];
  if (r.state !== 'sent') return;
  // code = отговорът на PE_ImportMapByPath; inEffect = PE_IsMapInEffect (0 активна, -1 не се знае)
  const code = Number.isFinite(+msg.code) ? +msg.code : null;
  const inEffect = msg.inEffect != null && Number.isFinite(+msg.inEffect) ? +msg.inEffect : -1;
  const ok = !!msg.ok && (inEffect === 0 || inEffect === -1);
  r.state = ok ? 'ok' : 'error';
  r.code = msg.ok && inEffect > 0 ? inEffect : code;
  r.inEffect = inEffect;
  r.error = ok ? (msg.error ? String(msg.error) : '') : String(msg.error || LBE_IMPORT_CODES[r.code] || `код ${r.code}`);
  lbeLog('lbeShareImport', id, { requestId: msg.requestId, ok, code, inEffect, error: r.error });
  // копие на калибровките в момента на новата LBE карта — нулата на каската може да е друга след вноса
  if (ok) archiveCalibration('lbeImport', id);
  toast(`LBE → ${lbeName(id)}: ${ok ? 'картата е вкарана' + (inEffect === -1 ? ' (PICO не каза дали е активна)' : '') : `не стана (${r.error})`}`, ok ? 'ok' : 'error');
  lbeShareCheckDone();
}

/** POST /api/lbe/upload?headset=&requestId= — суровият zip от източника. */
async function lbeUpload(req, res, url) {
  const from = String(url.searchParams.get('headset') || '');
  const requestId = String(url.searchParams.get('requestId') || '');
  const s = lbeShare;
  if (!s || s.doneAt || s.from !== from || s.requestId !== requestId || s.phase !== 'exporting') {
    req.resume();
    return json(res, 409, { ok: false, error: 'Няма такова споделяне' });
  }
  if (Number(req.headers['content-length'] || 0) > LBE_MAX_BYTES) {
    req.resume();
    lbeShareFail('картата е над 300 MB');
    return json(res, 413, { ok: false, error: 'над 300 MB' });
  }
  s.phase = 'uploading';
  pushState();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mapId = `${stamp}_${from.replace(/[^\w-]/g, '')}`;
  const file = path.join(LBE_MAPS, `${mapId}.zip`);
  let size = 0;
  try {
    fs.mkdirSync(LBE_MAPS, { recursive: true });
    await pipeline(req, async function* (src) {
      for await (const chunk of src) {
        size += chunk.length;
        if (size > LBE_MAX_BYTES) throw new Error('над 300 MB');
        yield chunk;
      }
    }, fs.createWriteStream(file + '.part'));
    const head = Buffer.alloc(2);
    const fd = fs.openSync(file + '.part', 'r');
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    if (size < 22 || head.toString('latin1') !== 'PK') throw new Error('не е zip');
    renameOver(file + '.part', file);
  } catch (e) {
    fs.rmSync(file + '.part', { force: true });
    lbeLog('lbeShareUpload', from, { ok: false, error: e.message, bytes: size });
    if (lbeShare === s) lbeShareFail(`качването спря: ${e.message}`);
    if (!res.headersSent) json(res, 400, { ok: false, error: e.message });
    return;
  }
  if (lbeShare !== s || s.doneAt) { fs.rmSync(file, { force: true }); return json(res, 409, { ok: false, error: 'споделянето е спряно' }); }
  s.mapId = mapId; s.bytes = size;
  lbeLog('lbeShareUpload', from, { ok: true, mapId, bytes: size });
  json(res, 200, { ok: true, mapId, bytes: size });
  lbeShareImports();
  pushState();
}

/** Пазим последните LBE_KEEP zip-а (и не трием този, който се сваля сега). */
function lbePrune() {
  try {
    const keep = lbeShare?.mapId;
    const all = fs.readdirSync(LBE_MAPS).filter(f => f.endsWith('.zip')).sort().reverse();
    for (const f of all.slice(LBE_KEEP)) if (f !== `${keep}.zip`) fs.rmSync(path.join(LBE_MAPS, f), { force: true });
  } catch { /* няма папка */ }
}

// Правоъгълникът на LBE от каската → 4 ъгъла по периметъра, с дългата страна първа.
// Редът е еднакъв за всички каски с една LBE карта (обща нула) — затова и залата е еднаква.
function orderRect(points) {
  if (!Array.isArray(points) || points.length < 4) return null;
  // PICO дава правоъгълника като много точки по периметъра (40 на 26.10.2026) → най-малкият правоъгълник около тях
  const c = points.length === 4 ? points.map(p => ({ x: +p.x, z: +p.z })) : minAreaRect(points.map(p => ({ x: +p.x, z: +p.z })));
  if (!c) return null;
  const cx = c.reduce((s, p) => s + p.x, 0) / 4, cz = c.reduce((s, p) => s + p.z, 0) / 4;
  c.sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
  const side = i => Math.hypot(c[(i + 1) % 4].x - c[i].x, c[(i + 1) % 4].z - c[i].z);
  const start = side(0) >= side(1) ? 0 : 1;
  return [0, 1, 2, 3].map(k => c[(start + k) % 4]);
}

// Най-малкият (завъртян) правоъгълник около точките: обвивка + проверка по посоката на всяка нейна страна.
function minAreaRect(pts) {
  const s = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const half = list => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const hull = [...half(s), ...half([...s].reverse())];
  if (hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;   // по страната
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.z * uz, v = -p.x * uz + p.z * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, ux, uz, minU, maxU, minV, maxV };
  }
  if (!best) return null;
  const { ux, uz, minU, maxU, minV, maxV } = best;
  const at = (u, v) => ({ x: u * ux - v * uz, z: u * uz + v * ux });
  return [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)];
}

// Нагласява залата по границата на LBE: при нова LBE карта сама, или с бутона („request").
let pendingBounds = null;   // малка граница от бутона, чака потвърждение
function calibrateFromBounds(id, msg) {
  const h = headsets.get(id);
  const name = h ? headsetView(h).name : id;
  let corners = msg.ok ? orderRect(msg.corners) : null;
  // „завърти 180°" в лобито се помни за следващите LBE калибровки (иначе всяка нова пак е обърната)
  if (corners && arena.lbeFlip) corners = [2, 3, 0, 1].map(i => corners[i]);
  if (!corners) {
    if (msg.reason === 'request') toast(`${name}: няма граница на LBE — включи LBE / направи карта в LSpace`, 'error');
    return;
  }
  const sol = solveCorners(corners);
  const sig = sol.corners.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';');
  const cur = arena.calibrations[id];
  if (msg.reason !== 'request' && cur?.boundsSig === sig) return;   // същата LBE — нищо не се сменя
  // сама — винаги, щом каската има граница с размер на зала (26.10.2026: LBE се включва в каската,
  // не от лобито); твърде малката граница за един играч отпада по размера отдолу
  // залата в играта се нагласява по размера на LBE (VRHallLayout) — от 3 до 20 м (05.11.2026: зала 20 × 10)
  if (sol.width < 2.5 || sol.depth < 2.5 || sol.width > 40.5 || sol.depth > 40.5) {   // залата в играта е до 20 м (hallSize)
    if (msg.reason === 'connect' && sol.width < 2.5) return;   // обикновена малка граница при свързване — без шум
    toast(`${name}: границата е ${sol.width.toFixed(1)} × ${sol.depth.toFixed(1)} м — извън 3–40 м, не нагласям`, 'warn');
    return;
  }
  // 07.11.2026 (собственикът): ръчната калибровка (4 ъгъла + „Потвърди") има предимство — сама граница от PICO
  // само се записва в лога и не сменя залата; с бутона („request") пак може
  const manual = [cur, arena.sharedCalibration].some(c => c && c.source !== 'lbe' && c.width);
  if (msg.reason !== 'request' && manual) {
    logCalib('fromBoundsIgnored', id, { ...sol, version: cur?.version || 0, source: 'lbe' }, { reason: msg.reason || null });
    return;
  }
  // 07.11.2026: бутонът с много по-малка граница (под 10 м² или −30 %) чака потвърждение — личната граница
  // на една каска (3 × 3 м) веднъж смали залата 18.5 × 9.7 по погрешка
  const now = latestCalibration();
  const curArea = now && now.width ? now.width * now.depth : 0;
  if (!msg.force && (sol.width * sol.depth < 10 || (curArea && sol.width * sol.depth < 0.7 * curArea))) {
    pendingBounds = { id, msg, width: sol.width, depth: sol.depth, curWidth: now?.width || 0, curDepth: now?.depth || 0 };
    logCalib('fromBoundsPending', id, { ...sol, version: cur?.version || 0, source: 'lbe' }, { reason: msg.reason || null });
    toast(`${name}: границата е ${sol.width.toFixed(1)} × ${sol.depth.toFixed(1)} м — по-малка от залата, потвърди в лобито`, 'warn');
    pushState();
    return;
  }
  pendingBounds = null;
  const { skew, ...rest } = sol;
  const prevFile = archiveCalibration('fromBounds', id);
  arena.calibrations[id] = { ...rest, version: (cur?.version || 0) + 1, source: 'lbe', boundsSig: sig, sourceHeadset: id, at: new Date().toISOString() };
  writeJson(ARENA_FILE, arena);
  logCalib('fromBounds', id, arena.calibrations[id], { reason: msg.reason || null, prevFile });
  archiveCalibration('после:fromBounds', id);
  applyCalibrationTo(id);
  toast(`${name}: залата е нагласена по LBE (${sol.width.toFixed(1)} × ${sol.depth.toFixed(1)} м)`, 'ok');
}

// От 4-те ъгъла (в координатите на каската, метри) изчисляваме залата:
// център, завъртане и размери. Ъглите се дават в ред по периметъра.
function solveCorners(corners) {
  let c = corners.map(p => ({ x: +p.x, z: +p.z }));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // дългата страна на залата = ширината (X в играта) — и при ръчните 4 ъгъла, иначе картата излиза напряко
  if (c.length === 4 && dist(c[1], c[2]) + dist(c[3], c[0]) > dist(c[0], c[1]) + dist(c[2], c[3]) + 0.05) c = [c[1], c[2], c[3], c[0]];
  const origin = { x: c.reduce((s, p) => s + p.x, 0) / 4, z: c.reduce((s, p) => s + p.z, 0) / 4 };
  const width = (dist(c[0], c[1]) + dist(c[2], c[3])) / 2;
  const depth = (dist(c[1], c[2]) + dist(c[3], c[0])) / 2;
  const yawDeg = Math.atan2(c[1].z - c[0].z, c[1].x - c[0].x) * 180 / Math.PI;
  const diagA = dist(c[0], c[2]);
  const diagB = dist(c[1], c[3]);
  const skew = Math.abs(diagA - diagB);   // при правоъгълник диагоналите са равни
  const r = v => Math.round(v * 1000) / 1000;
  return {
    origin: { x: r(origin.x), z: r(origin.z) },
    yawDeg: Math.round(yawDeg * 10) / 10,
    width: r(width), depth: r(depth),
    skew: r(skew),
    corners: c.map(p => ({ x: r(p.x), z: r(p.z) })),
  };
}

// ---------- съобщения от каската ----------

function onHeadsetMessage(ws, msg, ip) {
  if (msg.type === 'hello') {
    const id = String(msg.id || '').trim();
    if (!id) return ws.close(4000, 'id required');
    const old = sockets.get(id);
    if (old && old !== ws) old.close(4001, 'replaced');
    ws.headsetId = id;
    sockets.set(id, ws);
    const h = headsets.get(id) || { id, phase: 'idle' };
    Object.assign(h, {
      name: msg.name || h.name, model: msg.model || h.model, ip,
      online: true, lastSeen: Date.now(),
      calibrationVersion: msg.calibrationVersion ?? null,
      phase: msg.app ? 'playing' : (web?.ids.has(id) ? 'loading' : 'idle'),
      app: msg.app || null,
      user: msg.user || null,
      web: !!msg.web,   // каска през браузър (WebXR): получава позите на другите
      desk: !!msg.desktop,   // проба от компютър без каска: няма стая за подравняване
    });
    headsets.set(id, h);
    ws.send(JSON.stringify({ type: 'welcome', name: arena.names[id] || h.name || id }));
    sendServerInfo(id);
    // С LBE всички каски имат една нула → новата каска взима общата калибровка.
    if (arena.lbe.enabled && arena.sharedCalibration && !arena.calibrations[id]) {
      arena.calibrations[id] = arena.sharedCalibration;
      writeJson(ARENA_FILE, arena);
    }
    // Каската няма последната си калибровка (напр. след рестарт) → пращаме я веднага, без нови 4 точки.
    if (arena.calibrations[id] && h.calibrationVersion !== arena.calibrations[id].version) applyCalibrationTo(id);
    // каската помни подравняване, което сървърът вече няма (нулирани данни, нова зона): старото не важи
    else if (!arena.calibrations[id] && h.calibrationVersion != null && h.web) sendTo(id, { type: 'applyCalibration', calibration: null });
    // LBE: само питаме за състоянието. Бързият режим НЕ се праща сам — ако тръгне, презаписва нулата
    // на картата от LSpace (24.10.2026); включва се само с бутона в прозореца LBE.
    if (!h.web) {
      sendTo(id, { type: 'lbeStatus' });
      // каската праща границата сама само при промяна → при всяко свързване я питаме тихо
      autoBounds.add(id);
      sendTo(id, { type: 'calibrateFromLbe' });
    }
    if (h.web) { sendZone(id); if (!arena.calibrations[id] && arena.floors?.[id] != null) sendTo(id, { type: 'floor', floorY: arena.floors[id] }); }
    if (h.web) { h.build = Number(msg.build) || 0; h.inVR = !!msg.inVR; }
    // страницата в каската е от по-стара версия на кода (стояла е отворена, докато кодът се е сменил): презарежда се сама,
    // докато каската не е в игра. Най-много три опита на каска, за да не се върти, ако браузърът ѝ държи старо копие.
    if (h.web && !h.desk && h.build > 0 && !web?.ids.has(id)) {
      if (h.build >= pageBuild()) h.reloadTries = 0;
      else if ((h.reloadTries || 0) < 3 && Date.now() - (h.reloadAt || 0) > 20_000) {
        h.reloadTries = (h.reloadTries || 0) + 1; h.reloadAt = Date.now();
        sendTo(id, { type: 'reload' });
        toast(`${arena.names[id] || h.name || id}: old page (build ${h.build} of ${pageBuild()}), reloading it`, 'warn');
      }
    }
    if (h.web && wantObstacles.has(id)) setTimeout(() => sendTo(id, { type: 'zoneObstacles' }), 400);      // поискано е чертане на препятствията: тръгва, щом каската влезе във VR
    if (web && session?.web && !web.game.over && h.web && !web.ids.has(id) && session.headsets.includes(id)) {
      // каската е от текущата игра, но е била извадена (дълго прекъсване, презаредена страница): връща се сама
      try { web.game.join(id, { n: headsetNumber(id), name: headsetView(h).name }); web.ids.add(id); } catch (e) { console.error('rejoin', e); }
    }
    if (web?.ids.has(id)) { h.phase = 'loading'; h.loadingAt = Date.now(); h.load = 0; h.launchError = null; sendTo(id, web.startMsg); }
    else if (h.web && msg.app) { sendTo(id, { type: 'stop' }); h.phase = 'idle'; h.app = null; }   // каската още показва игра, която вече не върви тук
    toast(`${arena.names[id] || h.name || id} connected`);
    return pushState();
  }

  const id = ws.headsetId;
  const h = id && headsets.get(id);
  if (!h) return;
  h.lastSeen = Date.now();
  h.online = true;

  if (msg.type === 'pose') return takePose(h, msg);
  if (msg.type === 'act') return webAct(id, msg);
  if (msg.type === 'zoneDone') { onZoneDone(id, h, msg); return pushState(); }
  if (msg.type === 'zoneAligned') { onZoneAligned(id, h, msg); return pushState(); }
  if (msg.type === 'zoneCancelled') { h.phase = 'idle'; wantObstacles.delete(id); return pushState(); }
  if (msg.type === 'floorSet') { onFloorSet(id, h, msg); return pushState(); }
  if (msg.type === 'zoneObstaclesDone') { onZoneObstacles(id, h, msg); return pushState(); }

  switch (msg.type) {
    case 'status':
      for (const k of ['battery', 'charging', 'controllers', 'wifi', 'tracking', 'pos', 'app', 'fps', 'sleeping', 'user', 'yaw', 'volume', 'match', 'build', 'inVR', 'anchor', 'anchorN', 'load']) {
        if (k in msg) h[k] = msg[k];
      }
      if ('lbeColumns' in msg) takeLbeColumns(msg.lbeColumns);   // стар APK не праща полето
      // Докато играта зарежда, каската още няма app — оставаме на „зарежда".
      if (h.phase !== 'calibrating') h.phase = h.app ? 'playing' : (h.phase === 'loading' ? 'loading' : 'idle');
      if ('match' in msg) { try { watchMatchEvents(); } catch (e) { console.warn('събития от мача:', e.message); } }   // arena14
      break;

    case 'calibCorner':
      h.calibStep = Math.min(4, (msg.index ?? 0) + 1);
      break;

    case 'calibDone': {
      if (!Array.isArray(msg.corners) || msg.corners.length !== 4) {
        toast(`${headsetView(h).name}: калибрирането не върна 4 ъгъла`, 'error');
        h.phase = 'idle'; h.calibStep = 0;
        break;
      }
      pendingCalibration = { ...solveCorners(msg.corners), sourceHeadset: id, hasMap: !!msg.hasMap, at: new Date().toISOString() };
      logCalib('calibDone', id, { ...pendingCalibration, source: 'corners' }, { skew: pendingCalibration.skew, pending: true });
      h.phase = 'idle'; h.calibStep = 4;
      toast('Calibration done — check the size and confirm', 'ok');
      break;
    }

    case 'calibCancelled':
      h.phase = 'idle'; h.calibStep = 0;
      toast(`${headsetView(h).name}: калибрирането е прекъснато`, 'warn');
      break;

    case 'calibApplied':
      h.calibrationVersion = msg.version;
      journal('calibApplied', id, arena.calibrations[id] || null, `каската прие №${msg.version ?? '?'}`);
      break;

    case 'lbeBounds':
      writeJson(path.join(DATA, `lbe_bounds_${id}.json`), { at: new Date().toISOString(), ...msg });   // за проверка на границата
      // отговор на тихото питане при свързване — като сама промяна, не като бутона
      if (autoBounds.delete(id) && msg.reason === 'request') msg = { ...msg, reason: 'connect' };
      calibrateFromBounds(id, msg);
      break;

    case 'lbeResult': {
      h.lbe = {
        ...(h.lbe || {}),
        ...('on' in msg ? { on: !!msg.on, length: msg.length, width: msg.width, origin: msg.origin } : {}),
        ...('largeSpace' in msg ? { largeSpace: !!msg.largeSpace } : {}),
        action: msg.action, code: msg.code, at: Date.now(),
      };
      if (msg.action !== 'status') {
        // Без автоматично превключване на 6DoF при 104: превключването спира VR сесията на играта (24.10.2026)
        const what = { open: 'включване', boundary: 'размер', origin: 'нова нула', close: 'изключване', border: 'настройка на границата', tracking: 'проследяване (6DoF)', lspace: 'настройка LSpace',
          largeSpaceOn: '(голямо пространство) включване', largeSpaceOff: '(голямо пространство) изключване' }[msg.action] || msg.action;
        const ok = msg.code === 0 || msg.code === 201;
        const why = (msg.action === 'border' || msg.action === 'lspace') ? (ok ? 'отворена в очилата' : `код ${msg.code}`)
          : String(msg.action).startsWith('largeSpace') ? (ok ? 'готово — рестартирай играта на каската' : 'PICO отказа')
          : (LBE_CODES[msg.code] ?? `код ${msg.code}`);
        toast(`${headsetView(h).name}: LBE ${what} — ${why}${msg.code === 104 ? ' (включи проследяването в каската)' : ''}`, ok ? 'ok' : 'error');
      }
      break;
    }

    case 'lbeMap': {
      const prev = h.lbeMap;
      h.lbeMap = {
        has: !!msg.has, uuid: String(msg.uuid || ''), markers: Number(msg.markers) || 0,
        file: String(msg.file || ''), fileTime: String(msg.fileTime || ''), bytes: Number(msg.bytes) || 0,
        inEffect: Number.isFinite(+msg.inEffect) ? +msg.inEffect : -1,
        width: Number(msg.width) > 0 ? +msg.width : 0, depth: Number(msg.depth) > 0 ? +msg.depth : 0, at: Date.now(),
      };
      // в лога само при смяна (идва на всеки 30 с)
      if (!prev || prev.has !== h.lbeMap.has || prev.uuid !== h.lbeMap.uuid || prev.fileTime !== h.lbeMap.fileTime) {
        const { has, uuid, markers, fileTime, bytes, inEffect } = h.lbeMap;
        lbeLog('lbeShareMap', id, { has, uuid, markers, fileTime, bytes, inEffect });
      }
      break;
    }

    case 'lbeExportResult':
      onLbeExportResult(id, msg);
      break;

    case 'lbeImportResult':
      onLbeImportResult(id, msg);
      break;

    case 'launched':
      h.phase = msg.ok ? 'playing' : 'idle';
      h.launchError = msg.ok ? null : String(msg.error || 'unknown error');
      if (!msg.ok) toast(`${headsetView(h).name}: the game did not start (${msg.error || 'unknown error'})`, 'error');
      break;

    case 'stopped':
      h.phase = 'idle'; h.app = null;
      break;
  }
  pushState();
}

// ---------- обща стая: позите на играчите (уеб каски) ----------
// Каската праща { type: 'pose', c, p } 20 пъти в секунда: p са 21 числа в координатите на залата
// (глава, лява ръка, дясна ръка; за всяко позиция x,y,z и кватернион x,y,z,w). c = 1, ако каската е калибрирана.
// Сървърът събира последните пози и ги праща на всички уеб каски като { type: 'room', players }.

function takePose(h, msg) {
  const p = msg.p;
  if (!Array.isArray(p) || p.length !== 21 || !p.every(Number.isFinite)) return;
  h.pose = p; h.poseAt = Date.now(); h.poseCal = !!msg.c;
  if (web?.ids.has(h.id)) webSafe(() => web.game.pose(h.id, p));
}

setInterval(() => {
  const now = Date.now();
  const players = [];
  let anyWeb = false;
  for (const id of sockets.keys()) {
    const h = headsets.get(id);
    if (!h) continue;
    if (h.web) anyWeb = true;
    if (!h.pose || now - h.poseAt > 1500) continue;
    players.push({
      id, n: headsetNumber(id), name: arena.names[id] || h.name || id,
      team: Number(teamWant[id]) || matchTeamOf(h) || 0, c: h.poseCal ? 1 : 0, p: h.pose,
    });
  }
  if (!anyWeb && !watchers.size) return;
  const out = JSON.stringify({ type: 'room', t: now, players });
  for (const [id, ws] of sockets) if (headsets.get(id)?.web && ws.readyState === 1) ws.send(out);
  toWatchers(out);
}, 50);

// ---------- зона: начертана от каска (многоъгълник + препятствия) ----------
// Една каска чертае зоната и препятствията; сметките (lobby/zone.js) избират най-големия свободен
// правоъгълник за играта и той става „залата". Другите каски се подравняват по първите две точки.

let zoneLib = null;
async function loadZoneLib() {
  try { zoneLib = await import(pathToFileURL(path.join(HERE, 'zone.js')).href); }
  catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('zone.js не се зареди:', e.message); }
}
function zoneView() { return arena.zone || null; }
function sendZone(id) { sendTo(id, { type: 'zone', zone: zoneView() }); }
function broadcastZone() {
  for (const id of sockets.keys()) if (headsets.get(id)?.web) sendZone(id);
  toWatchers(JSON.stringify({ type: 'zone', zone: zoneView() }));
}
function setCalibrationFromFrame(id, frame, hall, source, floorY = 0) {
  const version = Math.max(0, ...Object.values(arena.calibrations).map(c => c.version || 0)) + 1;
  const fy = Number.isFinite(+floorY) && Math.abs(+floorY) < 1.5 ? +floorY : 0;
  arena.calibrations[id] = { origin: frame.origin, yawDeg: frame.yawDeg, floorY: fy, width: hall.w, depth: hall.d, corners: [], version, source, at: new Date().toISOString() };
  writeJson(ARENA_FILE, arena);
  applyCalibrationTo(id, true);
  return version;
}
/** Смята наново стаите от вече записаната зона (без ново чертане) и премества подравняванията на каските. */
async function reSolveZone() {
  if (!zoneLib) await loadZoneLib();
  if (!zoneLib || !arena.zone?.poly) return false;
  let z;
  try { z = zoneLib.solveZone({ points: arena.zone.poly, obstacles: arena.zone.obstacles || [] }, { straighten: false }); }
  catch (e) { console.warn('зоната не се пресметна:', e.message); return false; }
  if (!z?.frame || !z.rooms?.length) return false;
  // старата рамка на залата → новата: всяко подравняване се мести със същото
  for (const c of Object.values(arena.calibrations)) {
    const [ox, oz] = zoneLib.toTracking(c, [z.frame.origin.x, z.frame.origin.z]);
    c.origin = { x: Math.round(ox * 1000) / 1000, z: Math.round(oz * 1000) / 1000 };
    c.yawDeg = Math.round((c.yawDeg + z.frame.yawDeg) * 10) / 10;
    c.width = z.hall.w; c.depth = z.hall.d;
    c.version = (c.version || 0) + 1;
  }
  const keep = arena.zone.ownMarkers && Array.isArray(arena.zone.markers) && arena.zone.markers.length === 2;      // докоснатите точки остават на местата си в стаята
  const markers = keep ? arena.zone.markers.map(m => zoneLib.toArena(z.frame, m).map(v => Math.round(v * 1000) / 1000)) : z.markers;
  arena.zone = { ...arena.zone, poly: z.poly, obstacles: z.obstacles, blocked: z.blocked || [], hall: z.hall, rooms: z.rooms, doors: z.doors, markers, area: z.area };
  writeJson(ARENA_FILE, arena);
  for (const id of sockets.keys()) if (arena.calibrations[id]) applyCalibrationTo(id);
  broadcastZone();
  return true;
}

async function onZoneDone(id, h, msg) {
  h.phase = 'idle';
  if (!zoneLib) await loadZoneLib();
  if (!zoneLib) return toast('Zone computation is not ready yet (zone.js)', 'error');
  let z;
  try { z = zoneLib.solveZone({ points: msg.points || [], obstacles: msg.obstacles || [] }); }
  catch (e) { return toast(`The zone could not be computed: ${e.message}`, 'error'); }
  if (!z?.frame || !z?.hall) { sendTo(id, { type: 'zoneSaved', ok: false }); return toast('The zone could not be computed: draw it again', 'error'); }
  if (z.hall.w < 1.5 || z.hall.d < 1.5) {      // случайно затворена или твърде малка форма не става зона
    sendTo(id, { type: 'zoneSaved', ok: false, hall: z.hall });
    return toast(`The drawing is too small (${z.hall.w.toFixed(1)} × ${z.hall.d.toFixed(1)} m): draw the zone again`, 'error');
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  const touched = (Array.isArray(msg.marks) ? msg.marks : []).map(p => [Number(p?.x), Number(p?.z)]).filter(p => p.every(Number.isFinite));
  const own = touched.length === 2 && Math.hypot(touched[0][0] - touched[1][0], touched[0][1] - touched[1][1]) >= 0.5;
  const markers = own ? touched.map(p => zoneLib.toArena(z.frame, p).map(r3)) : z.markers;
  arena.zone = { poly: z.poly, obstacles: z.obstacles, blocked: z.blocked || [], hall: z.hall, rooms: z.rooms || [], doors: z.doors || [], markers, ownMarkers: own, area: z.area, by: id, at: new Date().toISOString() };
  arena.calibrations = {};   // старите подравнявания са за друга зона
  setCalibrationFromFrame(id, z.frame, z.hall, 'zone', msg.floorY);
  broadcastZone();
  const warn = (z.warnings || []).join(' ');
  const roomsText = (z.rooms || []).map(r => `${r.w.toFixed(1)} × ${r.d.toFixed(1)}`).join(' + ');
  toast(`Zone saved: ${(z.rooms || []).length > 1 ? 'rooms' : 'play area'} ${roomsText} m${warn ? '. ' + warn : ''}`, z.ok === false ? 'warn' : 'ok');
  sendTo(id, { type: 'zoneSaved', ok: true, hall: z.hall, points: z.poly.length });
  pushState();
}
/** Само препятствията: идват в координатите на залата, зоната и двете точки остават; стаите се смятат наново. */
const wantObstacles = new Set();      // каски, които трябва да начертаят препятствията наново
const launchAfter = new Set();        // и за които играта тръгва сама, щом препятствията се запишат
async function onZoneObstacles(id, h, msg) {
  h.phase = 'idle';
  wantObstacles.delete(id);
  if (!arena.zone?.poly) { sendTo(id, { type: 'zoneSaved', ok: false }); return toast('No saved zone', 'error'); }
  const obs = (Array.isArray(msg.obstacles) ? msg.obstacles : [])
    .map(o => (Array.isArray(o) ? o : []).map(p => [Number(p?.x), Number(p?.z)]).filter(p => p.every(Number.isFinite)))
    .filter(o => o.length >= 2).slice(0, 40);
  const before = { obstacles: arena.zone.obstacles, blocked: arena.zone.blocked };
  arena.zone.obstacles = obs; arena.zone.blocked = [];
  const ok = await reSolveZone();
  if (!ok) {      // с новите препятствия не остава място за игра: връщаме старите
    arena.zone.obstacles = before.obstacles; arena.zone.blocked = before.blocked;
    await reSolveZone();
    sendTo(id, { type: 'zoneSaved', ok: false });
    return toast('These obstacles leave no room to play: the old ones were kept', 'error');
  }
  const roomsText = (arena.zone.rooms || []).map(r => `${r.w.toFixed(1)} × ${r.d.toFixed(1)}`).join(' + ');
  sendTo(id, { type: 'zoneSaved', ok: true, hall: arena.zone.hall, rooms: `${roomsText} м`, obstacles: (arena.zone.obstacles || []).length });
  toast(`Obstacles saved (${(arena.zone.obstacles || []).length}): ${(arena.zone.rooms || []).length > 1 ? 'rooms' : 'play area'} ${roomsText} m`, 'ok');
  if (launchAfter.delete(id)) setTimeout(() => {
    try { api['POST /api/launch']({ gameId: 'backroom', headsetIds: [id], theme: 'night', fast: false }); pushState(); }
    catch (e) { toast(`The game did not start: ${e.message}`, 'error'); }
  }, 3000);
  pushState();
}
/** Само височината на пода, без да се пипа зоната. */
function onFloorSet(id, h, msg) {
  h.phase = 'idle';
  const fy = Number(msg.floorY);
  if (!Number.isFinite(fy) || Math.abs(fy) > 1.5) return toast('The height does not look right: touch the controller to the floor', 'error');
  const c = arena.calibrations[id];
  if (c) { c.floorY = fy; writeJson(ARENA_FILE, arena); sendTo(id, { type: 'floor', floorY: fy }); }      // височината е мерена сега: каската я слага направо
  else { (arena.floors ||= {})[id] = fy; writeJson(ARENA_FILE, arena); sendTo(id, { type: 'floor', floorY: fy }); }
  toast(`${headsetView(h).name}: the floor is at ${(fy * 100).toFixed(0)} cm`, 'ok');
}
async function onZoneAligned(id, h, msg) {
  h.phase = 'idle';
  if (!zoneLib) await loadZoneLib();
  if (!zoneLib || !arena.zone) return toast('No saved zone', 'error');
  let r;
  try { r = zoneLib.solveAlign(arena.zone.markers, msg.points || []); }
  catch (e) { return toast(`Alignment failed: ${e.message}`, 'error'); }
  if (!r?.origin) return toast('Alignment failed: try again', 'error');
  setCalibrationFromFrame(id, r, arena.zone.hall, 'align', msg.floorY);
  sendZone(id);
  toast(`${headsetView(h).name} is aligned${r.error > 0.15 ? ` (off by ${Math.round(r.error * 100)} cm, better do it again)` : ''}`, r.error > 0.15 ? 'warn' : 'ok');
  pushState();
}

// ---------- каски по кабел: изчистване на историята на пространството ----------
// Quest пази стари „пространства" и понякога бърка височината на пода. Това прави от компютъра същото,
// което е в Настройки → Физическо пространство → „Изчисти историята": трие данните на Guardian.
// След него каската иска нова граница, а подравняването с нашата зона трябва да се повтори (две точки).

const ADB = process.env.ADB || ['C:/Android/sdk/platform-tools/adb.exe'].find(p => fs.existsSync(p)) || 'adb';
function adbRun(args, timeout = 15000) {
  return new Promise(resolve => execFile(ADB, args, { timeout }, (err, out, errOut) => resolve({ ok: !err, out: String(out || '').trim(), err: String(errOut || err?.message || '').trim() })));
}
async function adbSerialFor(headsetId) {
  const r = await adbRun(['devices']);
  const ready = r.out.split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(l => l[1] === 'device').map(l => l[0]);
  if (ready.includes(headsetId)) return headsetId;
  return ready.length === 1 ? ready[0] : null;
}
async function clearSpaceHistory(headsetId) {
  const serial = await adbSerialFor(headsetId);
  const name = headsets.get(headsetId) ? headsetView(headsets.get(headsetId)).name : headsetId;
  if (!serial) { toast(`${name}: is not connected by cable, cannot clear the space`, 'error'); return false; }
  const results = [];
  for (const pkg of ['com.oculus.guardian', 'com.facebook.spatial_persistence_service']) {
    const r = await adbRun(['-s', serial, 'shell', 'pm', 'clear', pkg]);
    results.push(`${pkg.split('.').pop()}: ${r.ok && /Success/i.test(r.out) ? 'изчистено' : (r.out || r.err || 'неуспех').slice(0, 60)}`);
  }
  // старото подравняване вече не важи: каската има ново начало
  if (arena.calibrations[headsetId]) { delete arena.calibrations[headsetId]; writeJson(ARENA_FILE, arena); sendTo(headsetId, { type: 'applyCalibration', calibration: null }); }
  toast(`${name}: история на пространството: ${results.join(', ')}. Align it again with the two points.`, 'ok');
  pushState();
  return true;
}

// зрители: страницата /play/?watch=1 гледа играта отстрани (екран в залата, проба от компютър)
const watchers = new Set();
function toWatchers(text) { for (const ws of watchers) if (ws.readyState === 1) ws.send(text); }

// ---------- уеб игри ----------
// Вървят в браузъра на каските. Правилата са тук, на сървъра (lobby/game/<игра>.js, вж. docs/SPEC.md):
// каските пращат пози и действия, сървърът върти играта и праща състоянието 10 пъти в секунда.

const WEB_GAMES = [];   // { id, name, …, create }
let web = null;         // текущата уеб игра: { def, game, ids, startMsg, overAt }

// Каталогът на игрите. Всяка игра е като отделно приложение: описание в game/<id>.game.json
// (име, корица, играчи, времетраене, теми), правила на сървъра в game/<rules> и страница за каските в
// public/play/games/<client>/. Нова игра се добавя с тези три неща, без да се пипа сървърът.
async function loadWebGames() {
  const dir = path.join(HERE, 'game');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.game.json')).sort(); } catch { /* няма папка с игри */ }
  for (const f of files) {
    let m = null;
    try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { console.warn(`Играта от ${f} не се чете: ${e.message}`); continue; }
    const id = String(m.id || f.replace(/\.game\.json$/, ''));
    const g = {
      id, name: String(m.name || id), tagline: m.tagline || '', description: m.description || '', version: m.version || '',
      status: m.status === 'soon' ? 'soon' : 'ready', client: String(m.client || id), cover: m.cover || null, color: m.color || '#c8f03c',
      minPlayers: Math.max(1, m.minPlayers | 0 || 1), maxPlayers: Math.max(1, m.maxPlayers | 0 || 6), minutes: Math.max(1, +m.minutes || 10),
      themes: Array.isArray(m.themes) ? m.themes.filter(t => t && t.id).map(t => ({ id: String(t.id), name: String(t.name || t.id) })) : [],
      levels: Array.isArray(m.levels) ? m.levels.filter(t => t && t.id).map(t => ({ id: String(t.id), name: String(t.name || t.id) })) : [],
      tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
    };
    if (g.status === 'soon' || !m.rules) { games.push({ ...g, status: 'soon', web: true }); continue; }      // обявена, но още без правила
    try {
      const mod = await import(pathToFileURL(path.join(dir, String(m.rules))).href);
      if (typeof mod.createGame !== 'function') throw new Error('no createGame');
      WEB_GAMES.push({ ...g, web: true, create: mod.createGame });
      games.push({ ...g, web: true });
    } catch (e) {
      console.warn(`Играта „${g.name}" не се зареди: ${e.message}`);
    }
  }
}

// ---------- класация ----------
// Всяка завършена уеб игра оставя ред в data/scores.json: кой отбор, коя игра, колко пари (точките), звезди.
// Имената са имена на отбори (прякори), не лични данни. „Кратка проба" се записва, но не влиза в класацията.
const SCORES_FILE = path.join(DATA, 'scores.json');
const scores = readJson(SCORES_FILE, []);
let scoresVersion = 0, lastResult = null;

const PERIODS = { day: 1, week: 7, month: 30, all: 0 };
function periodStart(period) {
  const now = new Date();
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();      // от полунощ
  const days = PERIODS[period];
  return days ? now.getTime() - days * 86_400_000 : 0;
}
/** Наредени резултати: по точки, при равни по-ранният е напред. */
function scoreBoard({ gameId, period = 'all', limit = 50, tests = false } = {}) {
  const from = periodStart(PERIODS[period] === undefined ? 'all' : period);
  const list = scores.filter(e => (!gameId || e.gameId === gameId) && (tests || !e.test) && Date.parse(e.at) >= from)
    .sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at));
  return { total: list.length, list: list.slice(0, Math.max(1, Math.min(500, limit | 0 || 50))).map((e, i) => ({ rank: i + 1, ...e })) };
}
function rankOf(entry, period) {
  const i = scoreBoard({ gameId: entry.gameId, period, limit: 500 }).list.findIndex(e => e.id === entry.id);
  return i < 0 ? null : i + 1;
}
function teamName(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 28); }
/** Вика се веднъж, щом играта свърши: записва резултата и го обявява. */
function recordScore() {
  if (!web || web.scored || !session?.web) return;
  const r = web.game.snapshot()?.result;
  if (!r) return;
  web.scored = true;
  const players = (r.players || []).map(q => ({ n: q.n, name: String(q.name || '') }));
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    gameId: web.def.id, game: web.def.name, at: new Date().toISOString(),
    team: teamName(session.team) || (players.length === 1 ? players[0].name : `Team ${new Date().toTimeString().slice(0, 5)}`),
    players, size: players.length,
    score: Math.round(+(r.score ?? r.money) || 0), stars: r.stars | 0, caught: !!r.caught,
    minutes: session.minutes, theme: session.theme || 'night', test: !!session.fast, difficulty: session.difficulty || 'normal',
  };
  scores.push(entry);
  if (scores.length > 5000) scores.splice(0, scores.length - 5000);
  writeJson(SCORES_FILE, scores);
  scoresVersion++;
  lastResult = { ...entry, rankDay: entry.test ? null : rankOf(entry, 'day'), rankAll: entry.test ? null : rankOf(entry, 'all') };
  toast(entry.test ? `${entry.team}: ${entry.score} (trial, not on the leaderboard)` : `${entry.team}: ${entry.score} points, place ${lastResult.rankDay} today`, 'ok');
  pushState();
}

let webErrors = 0, webErrorAt = 0;
function webSafe(fn) {
  try { const r = fn(); if (webErrors && Date.now() - webErrorAt > 5000) webErrors = 0; return r; }
  catch (e) {
    // една грешка в кода на играта не спира платената сесия: стъпката се пропуска; спира се чак при поредица от грешки
    webErrors++; webErrorAt = Date.now();
    console.error('Game error:', e);
    try { fs.appendFileSync(path.join(DATA, 'game-errors.log'), `${new Date().toISOString()} ${web?.def?.id || ''} ${e?.stack || e}\n`); } catch { /* без дневник */ }
    if (webErrors === 1) toast(`Game error: ${e.message}`, 'error');
    if (webErrors >= 30) { webErrors = 0; try { recordScore(); } catch { /* без резултат */ } stopWebGame(true); }
  }
}

// Saves of web games that keep a career: one JSON file per game and per player (or team) name.
const SAVES_DIR = path.join(DATA, 'saves');
const saveFile = (gameId, key) => path.join(SAVES_DIR, String(gameId).replace(/[^\w-]/g, ''), `${String(key).replace(/[^\w .-]/g, '').trim().slice(0, 40) || 'player'}.json`);
function loadGameSave(gameId, key) { return readJson(saveFile(gameId, key), null); }
function writeGameSaves() {
  if (!web || typeof web.game.takeSaves !== 'function') return;
  for (const e of web.game.takeSaves()) {
    try { const f = saveFile(web.def.id, e.key); fs.mkdirSync(path.dirname(f), { recursive: true }); writeJson(f, { ...e.data, savedAt: new Date().toISOString() }); }
    catch (err) { console.error('save', err); }
  }
}

function webHall() {
  if (arena.zone?.hall) return { w: arena.zone.hall.w, d: arena.zone.hall.d };
  const c = latestCalibration();
  const lim = v => Math.min(10, Math.max(4, Number(v) || 6));
  return c ? { w: lim(c.width), d: lim(c.depth) } : { w: 6, d: 6 };
}

function stopWebGame(tell = false) {
  if (!web) return;
  const ids = [...web.ids];
  web = null;
  toWatchers(JSON.stringify({ type: 'stop' }));
  if (tell) {
    for (const id of ids) { sendTo(id, { type: 'stop' }); const h = headsets.get(id); if (h) { h.phase = 'idle'; h.app = null; } }
    if (session?.web) session = null;
    pushState();
  }
}

function webAct(id, msg) {
  if (web?.ids.has(id)) webSafe(() => web.game.act(id, msg));
}

function launchWeb(game, { headsetIds, theme, fast, skipTo, team, difficulty }) {
  const level = ['easy', 'normal', 'hard', 'nightmare'].includes(difficulty) ? difficulty : 'normal';
  const def = WEB_GAMES.find(g => g.id === game.id);
  if (session && sessionOver()) { session = null; stopWebGame(); }
  if (session && session.gameId !== game.id) throw apiError(`Already running ${session.gameName}: stop it first`, 'busy', 0);
  const ids = headsetIds?.length ? headsetIds : [...headsets.values()].filter(h => h.online && h.web).map(h => h.id);
  const ready = ids.filter(id => { const h = headsets.get(id); return h?.online && h.web && h.phase === 'idle'; });
  if (!ready.length) throw new Error('No free headset with the game page open');
  if (ready.length + (session ? session.headsets.length : 0) > game.maxPlayers) throw new Error(`${game.name} is for up to ${game.maxPlayers} players`);
  const missing = ready.filter(id => !arena.calibrations[id] && !headsets.get(id).desk);
  if (missing.length) throw new Error(`Calibrate first: ${missing.map(id => headsetView(headsets.get(id)).name).join(', ')}`);
  if (!session || !web) {
    const g = def.create({ hall: webHall(), rooms: arena.zone?.rooms?.length ? arena.zone.rooms : undefined, doors: arena.zone?.doors || [], obstacles: arena.zone?.blocked || [], theme: theme === 'kids' ? 'kids' : 'night', fast: !!fast, skipTo, difficulty: level, seed: Date.now() % 1e9, now: Date.now(),
      career: !skipTo && !fast, team: teamName(team) || undefined, loadSave: key => loadGameSave(game.id, key) });
    web = { def, game: g, ids: new Set(), startMsg: null, overAt: 0, madeAt: Date.now(), held: 0, begun: false, readyAt: 0 };
    web.startMsg = { type: 'gameStart', ...g.start(), client: def.client, title: def.name };      // client: папката на играта в public/play/games/
    toWatchers(JSON.stringify(web.startMsg));
    session = { gameId: game.id, gameName: game.name, headsets: [], startedAt: new Date().toISOString(), minutes: fast ? Math.ceil(game.minutes / 6) : game.minutes, web: true,
      theme: theme === 'kids' ? 'kids' : 'night', fast: !!fast, team: teamName(team), difficulty: level };
    newMatchForEvents();
  }
  for (const id of ready) {
    const h = headsets.get(id);
    web.game.join(id, { n: headsetNumber(id), name: headsetView(h).name });
    web.ids.add(id);
    if (!session.headsets.includes(id)) session.headsets.push(id);
    h.phase = 'loading'; h.loadingAt = Date.now(); h.load = 0; h.launchError = null;
    sendTo(id, web.startMsg);
  }
  toast(`${game.name} starts on ${ready.length} ${ready.length === 1 ? 'headset' : 'headsets'}`, 'ok');
  return { ok: true, session };
}

setInterval(() => {
  if (!web) return;
  if (!session?.web) return stopWebGame();
  webSafe(() => {
    const now = Date.now();
    for (const id of [...web.ids]) {   // каска, която е паднала за дълго, излиза от играта
      const h = headsets.get(id);
      if (!h || (!h.online && now - h.lastSeen > SESSION_DROP_MS)) { web.game.leave(id); web.ids.delete(id); }
    }
    // часовникът на играта не тръгва, докато каските още я зареждат (най-много 45 с) и още 2.5 с за изсветляването:
    // иначе половината подготовка минава под екрана за зареждане и първите зомбита са вече на оградата
    if (!web.begun) {
      const loading = [...web.ids].some(id => headsets.get(id)?.phase === 'loading');
      if (loading) web.readyAt = 0; else web.readyAt ||= now;
      if (now - web.madeAt > 45_000 || (web.readyAt && now - web.readyAt >= 2500)) web.begun = true;
      else web.held = now - web.madeAt;
    }
    web.game.tick(now - web.held);
    writeGameSaves();
    const out = JSON.stringify({ type: 'game', ...web.game.snapshot() });
    for (const id of web.ids) { const ws = sockets.get(id); if (ws?.readyState === 1) ws.send(out); }
    toWatchers(out);
    if (web.game.over) {
      web.overAt ||= now;
      recordScore();
      if (now - web.overAt > 25_000) stopWebGame(true);   // резултатът стои 25 с, после всички са свободни
    }
  });
}, 100);

// ---------- HTTP заявки от екрана на лобито ----------

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

const api = {
  'GET /api/state': (_, req) => {
    const s = snapshot();
    matchSeenBy(req, s.matchCmd);
    return s;
  },

  // управление на мача от лобито: старт/рестарт/спри + режим (отбори, цел, дължина, рундове, огън по свои, глава)
  'POST /api/match': (body) => {
    const { command, teams, targetKills, roundSeconds, roundsToWin, friendlyFire, headshotOneShot } = body;
    if (command === 'setTeam') return api['POST /api/match/team'](body);
    if (typeof teams === 'boolean') matchCfg.teams = teams;
    if (targetKills > 0) matchCfg.targetKills = Math.min(100, Math.round(targetKills));
    if (roundSeconds > 0) matchCfg.roundSeconds = Math.round(roundSeconds);
    if (roundsToWin > 0) matchCfg.roundsToWin = Math.min(9, Math.round(roundsToWin));
    if (typeof friendlyFire === 'boolean') matchCfg.friendlyFire = friendlyFire;
    if (typeof headshotOneShot === 'boolean') matchCfg.headshotOneShot = headshotOneShot;
    const cmd = queueMatchCmd({ command: ['start', 'restart', 'stop', 'settings', 'forceStart'].includes(command) ? command : 'settings' });
    if (cmd.command === 'start') newMatchForEvents();   // arena14: нов мач за събитията
    const T = { start: 'мачът започва', restart: 'нов рунд', stop: 'мачът спрян', settings: 'режимът е сменен', forceStart: 'старт въпреки липсващите' };
    toast(T[cmd.command], cmd.command === 'stop' ? 'warn' : 'ok');
    return { ok: true, matchCmd: cmd, pending: matchPending.length };
  },

  // местене на каска в отбор: 1 = червен, 2 = син → команда setTeam (по ред след другите)
  // arena14: последните 50 събития от мача; ?since=<eventId> → само по-новите (непознат eventId → всички)
  'GET /api/match/events': (_body, req) => {
    const since = new URL(req.url, 'http://x').searchParams.get('since');
    const i = since ? matchEvents.findIndex(e => e.eventId === since) : -1;
    return { ok: true, enabled: webhookUrls().length > 0, boot: EVENT_BOOT, events: matchEvents.slice(i + 1) };
  },

  'POST /api/match/team': ({ headsetId, team }) => {
    const id = String(headsetId || '');
    const t = Number(team);
    if (!headsets.has(id)) throw new Error('No such headset');
    if (t !== 1 && t !== 2) throw new Error('Team is 1 (red) or 2 (blue)');
    teamWant[id] = t;
    const cmd = queueMatchCmd({ command: 'setTeam', headsetId: id, team: t });
    toast(`${headsetView(headsets.get(id)).name} → ${t === 1 ? 'ЧЕРВЕНИ' : 'СИНИ'}`, 'ok');
    return { ok: true, matchCmd: cmd, pending: matchPending.length };
  },

  'POST /api/calibrate': ({ headsetId }) => {
    const h = headsets.get(headsetId);
    if (!h?.online) throw new Error('The headset is not connected');
    if (session) throw new Error('Stop the game before calibrating');
    for (const other of headsets.values()) if (other.phase === 'calibrating') throw new Error('Another headset is calibrating');
    pendingCalibration = null;
    sendTo(headsetId, { type: 'calibrate', corners: 4 });
    h.phase = 'calibrating'; h.calibStep = 0;
    return { ok: true };
  },

  // зона: каската чертае многоъгълник и препятствия; другите се подравняват по две точки
  'POST /api/zone/draw': ({ headsetId }) => {
    const h = headsets.get(headsetId);
    if (!h?.online || !h.web) throw new Error('The headset is not connected through the game');
    if (session) throw new Error('Stop the game before drawing a zone');
    h.phase = 'calibrating'; h.calibStep = 0;
    sendTo(headsetId, { type: 'zoneDraw' });
    return { ok: true };
  },
  'POST /api/autostart': ({ on, gameId, theme }) => {
    const cur = arena.autoStart || { ...AUTO_DEFAULT };
    const id = gameId === undefined ? cur.gameId : String(gameId);
    const game = games.find(g => g.id === id);
    if (!game || !game.web) throw new Error('No such game');
    const themes = game.themes || [];
    const th = theme !== undefined ? String(theme) : (id === cur.gameId ? cur.theme : (themes[0]?.id || null));
    arena.autoStart = { on: on === undefined ? !!cur.on : !!on, gameId: id, theme: themes.some(t => t.id === th) ? th : (themes[0]?.id || null) };
    writeJson(ARENA_FILE, arena);
    if (arena.autoStart.on) autoSeen.clear();      // включено наново: каските, които вече са тук, също минават
    return { ok: true, autoStart: arena.autoStart };
  },
  'POST /api/zone/align': ({ headsetId }) => {
    const h = headsets.get(headsetId);
    if (!h?.online || !h.web) throw new Error('The headset is not connected through the game');
    if (!arena.zone) throw new Error('Draw a zone with one headset first');
    if (session) throw new Error('Stop the game before aligning');
    h.phase = 'calibrating'; h.calibStep = 0;
    sendTo(headsetId, { type: 'zoneAlign', markers: arena.zone.markers });
    return { ok: true };
  },
  'POST /api/zone/floor': ({ headsetId }) => {
    const h = headsets.get(headsetId);
    if (!h?.online || !h.web) throw new Error('The headset is not connected through the game');
    h.phase = 'calibrating'; h.calibStep = 0;
    sendTo(headsetId, { type: 'zoneFloor' });
    return { ok: true };
  },
  'POST /api/headset/clear-space': ({ headsetId }) => {
    if (!headsets.has(headsetId)) throw new Error('No such headset');
    if (session) throw new Error('Stop the game before clearing the space');
    clearSpaceHistory(headsetId);      // върви на заден план; резултатът излиза като съобщение
    return { ok: true };
  },
  'POST /api/zone/resolve': () => { reSolveZone().then(ok => { toast(ok ? 'Rooms recomputed from the saved zone' : 'No saved zone to compute', ok ? 'ok' : 'warn'); pushState(); }); return { ok: true }; },
  // трие само препятствията (зоната и двете точки остават) и пуска чертането им на каската
  'POST /api/zone/obstacles': ({ headsetId, launch }) => {
    const h = headsets.get(headsetId);
    if (!arena.zone) throw new Error('Draw a zone first');
    if (session) throw new Error('Stop the game before drawing obstacles');
    if (!h?.online || !h.web) throw new Error('The headset is not connected through the game');
    if (!arena.calibrations[headsetId]) throw new Error('The headset is not aligned: do the two points first');
    arena.zone.obstacles = []; arena.zone.blocked = [];
    wantObstacles.add(headsetId);
    if (launch) launchAfter.add(headsetId); else launchAfter.delete(headsetId);
    reSolveZone().then(() => { sendTo(headsetId, { type: 'zoneObstacles' }); pushState(); });
    return { ok: true };
  },
  'POST /api/zone/clear': () => {
    delete arena.zone;
    writeJson(ARENA_FILE, arena);
    broadcastZone();
    return { ok: true };
  },

  'POST /api/calibrate/cancel': () => {
    for (const h of headsets.values()) if (h.phase === 'calibrating') { sendTo(h.id, { type: 'calibrateCancel' }); sendTo(h.id, { type: 'zoneCancel' }); h.phase = 'idle'; h.calibStep = 0; }
    pendingCalibration = null;
    return { ok: true };
  },

  'POST /api/calibrate/confirm': () => {
    if (!pendingCalibration) throw new Error('No calibration to confirm');
    const id = pendingCalibration.sourceHeadset;
    const { skew, ...rest } = pendingCalibration;
    // 4 натискания на едно място дават „зала" от няколко см и завъртат арената накриво — не се записва
    if (rest.width < 2 || rest.depth < 2) throw new Error(`Залата излиза ${rest.width.toFixed(2)} × ${rest.depth.toFixed(2)} м — мини ъглите отначало`);
    const name = headsets.get(id) ? headsetView(headsets.get(id)).name : id;
    if (arena.lbe.enabled) {
      // LBE: всички каски са с една нула от маркера → една калибровка за всички
      const version = Math.max(0, ...Object.values(arena.calibrations).map(c => c.version || 0)) + 1;
      const prevFile = archiveCalibration('confirm');   // старата обща — преди да я презапишем
      arena.sharedCalibration = { ...rest, version, shared: true };
      for (const hid of new Set([...headsets.keys(), ...Object.keys(arena.calibrations)])) arena.calibrations[hid] = arena.sharedCalibration;
      pendingCalibration = null;
      writeJson(ARENA_FILE, arena);
      logCalib('confirm', id, arena.sharedCalibration, { prevFile });
      archiveCalibration('после:confirm');
      let sent = 0;
      for (const hid of sockets.keys()) if (applyCalibrationTo(hid)) sent++;
      toast(`Обща калибровка №${version} (LBE, от ${name}) — изпратена на ${sent} каски`, 'ok');
      return { ok: true, version };
    }
    // без LBE калибровката е само на каската, която е минала ъглите — другите имат свое проследяване
    const version = (arena.calibrations[id]?.version || 0) + 1;
    const prevFile = archiveCalibration('confirm', id);
    arena.calibrations[id] = { ...rest, version };
    pendingCalibration = null;
    writeJson(ARENA_FILE, arena);
    logCalib('confirm', id, arena.calibrations[id], { prevFile });
    archiveCalibration('после:confirm', id);
    applyCalibrationTo(id, true);
    toast(`${name}: калибровка №${version} е записана`, 'ok');
    return { ok: true, version };
  },

  'POST /api/launch': ({ gameId, headsetIds, fromVote, theme, fast, skipTo, team, difficulty }) => {
    const game = games.find(g => g.id === gameId);
    if (!game) throw new Error('No such game');
    if (game.web && game.status === 'soon') throw new Error(`${game.name} още не е готова`);
    if (game.web) return launchWeb(game, { headsetIds, theme, fast, skipTo, team, difficulty });      // skipTo: само за проби, започва от по-късна фаза
    // само карти от APK-то; иначе сървърът и каските остават в Lobby
    if (!ALLOWED_MAPS.includes(game.map)) {
      throw new Error(`${game.name}: картата ${game.map || '(няма)'} не е в APK-то — не пускам, остават в Lobby`);
    }
    if (!gameServerUp()) throw new Error('Играта на компютъра не върви — пусни „VR Varna" от работния плот');
    // arena13i (У5): върви друга игра → второто пускане не я презаписва; същата игра приема закъснели каски
    if (session && sessionOver()) session = null;
    if (session && session.gameId !== gameId) throw apiError(`Already running ${session.gameName} — първо Стоп`, 'busy', 0);
    const prev = session;
    const ids = (headsetIds?.length ? headsetIds : [...headsets.values()].filter(h => h.online).map(h => h.id));
    const ready = ids.filter(id => headsets.get(id)?.online && headsets.get(id).phase === 'idle');
    if (!ready.length) throw new Error('No free connected headsets');
    if (ready.length > game.maxPlayers) throw new Error(`${game.name} is for up to ${game.maxPlayers} players`);
    // без калибровка играчите не са там, където са в залата — ще се блъснат
    const missing = ready.filter(id => !arena.calibrations[id]);
    if (missing.length) throw new Error(`Calibrate first: ${missing.map(id => headsetView(headsets.get(id)).name).join(', ')}`);
    // операторът пусна игра с бутона по време на гласуване → гласуването се спира (картата е избрана)
    if (!fromVote && mapVote && mapVote.state === 'voting') { mapVote.state = 'cancelled'; mapVote.error = 'the operator launched a game'; mapVote.endedAt = Date.now(); }
    // същата игра вече върви → закъснелите каски влизат в нея (сесията остава същата)
    const mine = session = prev
      ? Object.assign(prev, { headsets: [...new Set([...prev.headsets, ...ready])] })
      : { gameId, gameName: game.name, headsets: ready, startedAt: new Date().toISOString(), minutes: game.minutes };
    const vote = prev ? launchVote : (fromVote ? mapVote : null);
    launchVote = vote;
    if (!prev) newMatchForEvents();   // arena14: нова игра → нов мач за събитията
    for (const id of ready) { headsets.get(id).phase = 'loading'; headsets.get(id).loadingAt = Date.now(); }
    const sendAll = () => {
      if (session !== mine) return;   // междувременно: Стоп или отказ
      for (const id of ready) {
        if (headsets.get(id)) headsets.get(id).loadingAt = Date.now();
        sendTo(id, {
          type: 'launch',
          game: { id: game.id, package: game.package, map: game.map },
          server: { port: gamePort },   // адресът е този на лобито — каската го знае
          session: session?.startedAt,
          players: ready.length,
        });
      }
      toast(`${game.name} тръгва на ${ready.length} каски`, 'ok');
    };
    // общата игра на компютъра минава на картата на играта (05.11.2026: иначе всички влизаха в Lobby)
    if (game.map && game.map !== serverMap) {
      setServerMap(game.map);
      pushState();
      toast(`Общата игра минава на ${game.name}…`, 'info');
    }
    // arena13h (С2): картата не тръгна за ~60 с → всичко се връща, за да може да се гласува/пусне пак
    const onFail = want => {
      if (session !== mine) return;
      if (prev) {   // само закъснелите не влязоха — играта на останалите продължава
        for (const id of ready) { const h = headsets.get(id); if (h && h.phase === 'loading') h.phase = 'idle'; }
        return pushState();
      }
      session = null;
      for (const id of ready) { const h = headsets.get(id); if (h && h.phase === 'loading') h.phase = 'idle'; }
      launchFailed(vote, `картата ${want} не тръгна`);
      console.log(`Пускане на ${game.name}: общата игра не мина на ${want} — каските са върнати в „idle“`);
      pushState();
    };
    whenServerOn(serverMap, () => setTimeout(sendAll, 1500), 0, onFail);   // 1.5 с: да видим истинския порт на играта
    return { ok: true, session };
  },

  // ---- гласуване за карта (arena13, т. 5) — вика го AVRMapVote от сървъра на играта ----
  'GET /api/mapvote': () => mapVoteView(),

  // всички са READY → гласуване. headsetIds: каските в общото лоби (празно → свързаните свободни).
  // Повторно start по време на гласуване връща текущото (без нов таймер).
  'POST /api/mapvote/start': ({ headsetIds, seconds }) => {
    if (mapVote && mapVote.state === 'voting') return { ok: true, already: true, vote: mapVoteView() };
    // arena13h (С3): отказът носи code + retryAfter (секунди) — сървърът на играта пробва пак сам, без някой да маха READY
    if (session && sessionOver()) session = null;   // свършила сесия не чака 2-секундния таймер
    if (session) throw apiError('Вече върви игра — гласуване няма', 'busy', 5);
    const options = mapVoteOptions();
    if (!options.length) throw apiError('Няма карти за гласуване (games.json)', 'no_maps', 0);
    const known = Array.isArray(headsetIds) ? headsetIds.map(String).filter(id => headsets.has(id)) : [];
    const voters = known.length ? [...new Set(known)] : [...headsets.values()].filter(h => h.online && h.phase === 'idle').map(h => h.id);
    const secs = Number(seconds) > 0 ? clamp(Math.round(Number(seconds)), 5, 120) : MAP_VOTE_SECONDS;
    mapVote = { id: ++mapVoteSeq, state: 'voting', options, voters, votes: {}, seconds: secs, startedAt: Date.now(), deadline: Date.now() + secs * 1000, result: null, error: null, endedAt: 0 };
    mapVoteShown = -1;
    console.log(`Гласуване №${mapVote.id}: ${voters.length} каски, ${options.map(o => o.name).join(' / ')}, ${secs} с`);
    toast(`Всички са готови — гласуване за карта (${secs} с)`, 'info');
    return { ok: true, vote: mapVoteView() };
  },

  // глас: {headsetId, gameId, voteId?}. Може да се смени, докато тече. Каска извън списъка се добавя (влязла късно).
  'POST /api/mapvote/vote': ({ headsetId, gameId, voteId }) => {
    const v = mapVote;
    if (!v || v.state !== 'voting') throw new Error('Няма гласуване');
    if (voteId && Number(voteId) !== v.id) throw new Error('Старо гласуване');
    const id = String(headsetId || '');
    if (!id) throw new Error('No headset');
    if (!v.options.some(o => o.gameId === gameId)) throw new Error('Няма такава карта в гласуването');
    // arena13i (У3): непознато id не влиза в списъка — иначе вдига прага и „всички гласуваха“ чака човек, който го няма
    if (!headsets.has(id) && !/^desktop-/.test(id)) throw apiError('Непозната каска — гласът не се брои', 'unknown_headset', 0);
    if (!v.voters.includes(id)) v.voters.push(id);
    v.votes[id] = gameId;
    mapVoteCheck();
    return { ok: true, vote: mapVoteView() };
  },

  // спира гласуването (операторът или сървърът на играта — напр. всички махнаха READY / излязоха)
  'POST /api/mapvote/cancel': ({ reason }) => {
    if (mapVote && mapVote.state === 'voting') {
      mapVote.state = 'cancelled'; mapVote.error = String(reason || 'спряно'); mapVote.endedAt = Date.now();
      toast('Гласуването за карта е спряно', 'warn');
    }
    return { ok: true, vote: mapVoteView() };
  },

  // класация: /api/scores?game=backroom&period=day|week|month|all&limit=20
  'GET /api/scores': (_, req) => {
    const q = new URL(req.url, 'http://x').searchParams;
    const period = PERIODS[q.get('period')] === undefined ? 'all' : q.get('period');
    return { ok: true, period, gameId: q.get('game') || null, version: scoresVersion, ...scoreBoard({ gameId: q.get('game') || '', period, limit: +q.get('limit') || 50, tests: q.get('tests') === '1' }) };
  },
  'POST /api/scores/rename': ({ id, team }) => {
    const e = scores.find(x => x.id === id);
    if (!e) throw new Error('No such result');
    const clean = teamName(team);
    if (!clean) throw new Error('The name is empty');
    e.team = clean;
    if (lastResult?.id === id) lastResult.team = clean;
    writeJson(SCORES_FILE, scores); scoresVersion++; pushState();
    return { ok: true };
  },
  'POST /api/scores/remove': ({ id }) => {
    const i = scores.findIndex(x => x.id === id);
    if (i < 0) throw new Error('No such result');
    scores.splice(i, 1);
    if (lastResult?.id === id) lastResult = null;
    writeJson(SCORES_FILE, scores); scoresVersion++; pushState();
    return { ok: true };
  },
  // отборът се казва по-късно (играта вече върви) или се поправя преди записа
  'POST /api/session/team': ({ team }) => {
    if (!session) throw new Error('No game');
    session.team = teamName(team);
    pushState();
    return { ok: true, team: session.team };
  },

  'POST /api/stop': () => {
    if (mapVote && mapVote.state === 'voting') { mapVote.state = 'cancelled'; mapVote.error = 'стоп'; mapVote.endedAt = Date.now(); }
    for (const h of headsets.values()) if (h.phase === 'playing' || h.phase === 'loading') sendTo(h.id, { type: 'stop' });
    stopWebGame();
    session = null;
    setServerMap(LOBBY_MAP);   // общата игра се връща в лобито
    pushState();
    return { ok: true };
  },

  'POST /api/headset/rename': ({ headsetId, name }) => {
    if (!headsets.has(headsetId)) throw new Error('No such headset');
    const clean = String(name || '').trim().slice(0, 30);
    if (clean) arena.names[headsetId] = clean; else delete arena.names[headsetId];
    writeJson(ARENA_FILE, arena);
    return { ok: true };
  },

  // нагласи залата по границата на LBE (без ходене по ъглите) — на една или на всички каски
  'POST /api/calibrate/lbe/pending': ({ apply }) => {
    const p = pendingBounds;
    if (!p) throw new Error('Няма чакаща граница');
    pendingBounds = null;
    if (apply) calibrateFromBounds(p.id, { ...p.msg, force: true });
    else { logCalib('fromBoundsRejected', p.id, { width: p.width, depth: p.depth, source: 'lbe' }); pushState(); }
    return { ok: true, applied: !!apply };
  },

  'POST /api/calibrate/lbe': ({ headsetId }) => {
    const ids = headsetId ? [headsetId] : [...sockets.keys()];
    let sent = 0;
    for (const id of ids) if (sendTo(id, { type: 'calibrateFromLbe' })) sent++;
    if (!sent) throw new Error('No connected headset');
    return { ok: true, sent };
  },

  // залата излезе обърната наобратно → завърта всички калибровки на 180° около центъра.
  // Ъглите се преномерират (2,3,0,1), boundsSig остава — същата LBE не я връща обратно.
  'POST /api/calibrate/rotate': () => {
    const prevFile = archiveCalibration('rotate');
    const turned = new Map();   // общата калибровка е един обект за всички каски
    for (const [id, c] of Object.entries(arena.calibrations)) {
      if (!turned.has(c)) {
        const yaw = c.yawDeg + 180 > 180 ? c.yawDeg - 180 : c.yawDeg + 180;
        const corners = Array.isArray(c.corners) && c.corners.length === 4 ? [2, 3, 0, 1].map(i => c.corners[i]) : c.corners;
        const { restoredFrom, ...base } = c;   // завъртането е нова смяна — „Върни предишната" трябва да върне незавъртяната
        turned.set(c, { ...base, yawDeg: Math.round(yaw * 10) / 10, corners, version: (c.version || 0) + 1, at: new Date().toISOString() });
      }
      arena.calibrations[id] = turned.get(c);
    }
    if (!turned.size) throw new Error('No calibration to rotate');
    arena.lbeFlip = !arena.lbeFlip;   // и следващите LBE калибровки излизат завъртени
    if (arena.sharedCalibration && turned.has(arena.sharedCalibration)) arena.sharedCalibration = turned.get(arena.sharedCalibration);
    writeJson(ARENA_FILE, arena);
    for (const c of turned.values()) logCalib('rotate', c.sourceHeadset, c, { prevFile });
    archiveCalibration('после:rotate');
    let sent = 0;
    for (const id of sockets.keys()) if (applyCalibrationTo(id)) sent++;
    toast(`Arena rotated by 180° (${sent} каски)`, 'ok');
    return { ok: true, sent };
  },

  // изтрива всички калибровки (напр. грешна или след нова LBE карта); каските ги губят при рестарт на играта
  'POST /api/calibrate/clear': () => {
    const prevFile = archiveCalibration('reset');
    if (prevFile) logCalib('reset', null, null, { source: 'clear', prevFile });
    arena.calibrations = {};
    delete arena.sharedCalibration;
    pendingCalibration = null;
    writeJson(ARENA_FILE, arena);
    toast('Calibrations deleted — restart the game on the headsets and calibrate again', 'warn');
    return { ok: true };
  },

  // историята на калибровките (data/calibration_history), най-новата първа
  'GET /api/calibration/history': () => ({
    ok: true,
    history: historyFiles().map(file => {
      const d = readJson(path.join(CALIB_HISTORY, file), null);
      const all = d?.calibrations && typeof d.calibrations === 'object' ? d.calibrations : {};
      const c = d?.sharedCalibration || (d?.headsetId && all[d.headsetId]) || Object.values(all)[0] || null;
      return {
        file, savedAt: d?.savedAt ?? null, event: d?.event ?? null, headsetId: d?.headsetId ?? null,
        lbeEnabled: !!d?.lbeEnabled, version: d?.version ?? null,
        width: c?.width ?? null, depth: c?.depth ?? null, yawDeg: c?.yawDeg ?? null,
        source: c ? (c.source || (c.shared ? 'shared' : 'corners')) : null,
        headsets: Object.keys(all),
      };
    }),
  }),

  // връща калибровка от историята и я праща на каските (като „Потвърди"); сегашната отива в историята
  'POST /api/calibration/restore': ({ file }) => {
    const name = String(file || '');
    if (!/^[\w.-]+\.json$/.test(name) || !historyFiles().includes(name)) throw new Error('No such entry in the history');
    if (session) throw new Error('Stop the game before restoring a calibration');
    if (matchRunning()) throw new Error('A match is running — calibration is locked. Stop the match first.');
    const d = readJson(path.join(CALIB_HISTORY, name), null);
    const saved = d?.calibrations && typeof d.calibrations === 'object' ? d.calibrations : null;
    if (!saved) throw new Error('The entry is damaged');
    // друга нула на каските (LBE вкл./изкл.) → старата калибровка не пасва
    if (!!d.lbeEnabled !== !!arena.lbe.enabled) throw new Error(`Записът е с LBE ${d.lbeEnabled ? 'включено' : 'изключено'} — превключи LBE първо`);
    // кръг 3: друга LBE карта в каската = друга нула → старата калибровка не пасва
    const diff = lbeUuidMismatch(d.lbeUuids);
    if (diff.length) {
      const short = u => (u ? `…${u.slice(-6)}` : 'няма карта');
      const who = diff.map(x => `${arena.names[x.id] || headsets.get(x.id)?.name || x.id} (в копието ${short(x.saved)}, сега ${short(x.now)})`).join('; ');
      journal('restoreRefused', diff[0].id, null, `друга LBE карта: ${who}`);
      throw new Error(`Не връщам: LBE картата на каската е друга — ${who}. Калибровката от копието не пасва на сегашната карта.`);
    }
    const ok = c => c && c.origin && Number.isFinite(+c.yawDeg);
    if (!(d.lbeEnabled && ok(d.sharedCalibration)) && !Object.values(saved).some(ok)) throw new Error('The entry has no calibration');
    // нова версия (по-голяма от всички) — каските и „калибрирана" в лобито я хващат като нова
    const versions = [...Object.values(arena.calibrations), arena.sharedCalibration, ...Object.values(saved), d.sharedCalibration].map(c => c?.version || 0);
    const version = Math.max(0, ...versions) + 1;
    const at = new Date().toISOString();
    const curSig = Object.values(arena.calibrations).find(c => c?.boundsSig)?.boundsSig;
    // boundsSig от сегашната — същата LBE граница при свързване да не я презапише пак (като при завъртане)
    const fresh = (c, sig) => ({ ...c, version, at, restoredFrom: name, ...(sig ? { boundsSig: sig } : {}) });
    const prevFile = archiveCalibration('restore', null, name);   // връщания файл не се трие
    if (d.lbeEnabled && ok(d.sharedCalibration)) {
      // обща (LBE) — само при LBE; без LBE остатъчна обща не се раздава на всички каски: един обект за всички каски — и за тези, калибрирани след записа
      const shared = fresh(d.sharedCalibration, arena.sharedCalibration?.boundsSig || curSig);
      arena.sharedCalibration = shared;
      for (const hid of new Set([...headsets.keys(), ...Object.keys(arena.calibrations), ...Object.keys(saved)])) {
        arena.calibrations[hid] = saved[hid] && !saved[hid].shared && ok(saved[hid]) ? fresh(saved[hid], arena.calibrations[hid]?.boundsSig) : shared;
      }
    } else {
      // по каска: връщаме записаните, другите каски си остават със своите
      delete arena.sharedCalibration;
      for (const [hid, c] of Object.entries(saved)) if (ok(c)) arena.calibrations[hid] = fresh(c, arena.calibrations[hid]?.boundsSig);
    }
    pendingCalibration = null;
    writeJson(ARENA_FILE, arena);
    for (const c of new Set(Object.values(arena.calibrations).filter(c => c.restoredFrom === name && c.at === at))) {
      logCalib('restore', c.sourceHeadset, c, { file: name, prevFile });
    }
    archiveCalibration('после:restore', null, name);
    let sent = 0;
    for (const hid of sockets.keys()) if (applyCalibrationTo(hid)) sent++;
    toast(`Калибровката от ${d.savedAt ? localStamp(new Date(d.savedAt)).slice(0, 16) : name} е върната като №${version} — изпратена на ${sent} каски`, 'ok');
    return { ok: true, version, sent, prevFile };
  },

  // gta-vr-1: „Върни предишната калибровка" — кое ще се върне (за потвърждението в лобито)
  'GET /api/calibration/previous': () => ({ ok: true, previous: previousBackup(), matchRunning: matchRunning() }),

  // връща предишното копие и праща applyCalibration; {file} = това, което операторът е видял в потвърждението
  'POST /api/calibration/restore-previous': ({ file } = {}) => {
    if (matchRunning()) throw new Error('A match is running — calibration is locked. Stop the match first.');
    if (session) throw new Error('Stop the game before restoring a calibration');
    const prev = previousBackup();
    if (!prev) throw new Error('Няма по-стара калибровка в историята');
    if (file && file !== prev.file) throw new Error('The history changed meanwhile — open it again and confirm');
    try {
      const r = api['POST /api/calibration/restore']({ file: prev.file });
      journal('restorePrevious', prev.headsetId, { ...prev, version: r.version }, `върната от ${prev.file}, изпратена на ${r.sent} каски`);
      return { ...r, file: prev.file };
    } catch (e) {
      journal('restorePrevious', prev.headsetId, prev, `НЕУСПЕХ: ${e.message}`);
      throw e;
    }
  },

  // LBE за всички каски: размер на залата и как се взима нулата (1 — сканиране на маркер)
  'POST /api/lbe': ({ enabled, length, width, originType, distance, openVst }) => {
    if (enabled && matchRunning()) throw new Error('Тече мач — LBE не се пипа: може да презапише нулата на каските. Спри мача първо.');
    const L = Math.round(Number(length)), W = Math.round(Number(width));
    if (enabled && !(L >= 3 && L <= 10 && W >= 3 && W <= 10)) throw new Error('PICO приема размер от 3 до 10 м');
    const changed = !!enabled !== arena.lbe.enabled;
    // в историята — преди arena.lbe да се смени, иначе записът е с грешното LBE и restore го отказва
    const prevFile = changed ? archiveCalibration('reset') : null;
    arena.lbe = {
      enabled: !!enabled, length: L || 10, width: W || 5,
      originType: Number(originType) === 0 ? 0 : 1,
      distance: Math.max(0.5, Number(distance) || 0.5),
      openVst: openVst !== false,
    };
    if (changed) {
      // нулата на каските се сменя → старите калибровки вече не важат
      if (prevFile) logCalib('reset', null, null, { source: 'lbe', prevFile });
      arena.calibrations = {};
      delete arena.sharedCalibration;
      pendingCalibration = null;
    }
    writeJson(ARENA_FILE, arena);
    let sent = 0;
    for (const id of sockets.keys()) if (sendLbe(id)) sent++;
    toast(`LBE ${arena.lbe.enabled ? `${arena.lbe.length} × ${arena.lbe.width} м — включвам` : 'изключвам'} на ${sent} каски${changed ? ' · калибрирай отново' : ''}`, 'ok');
    return { ok: true, sent };
  },

  // LBE на ниво система (картата от LSpace) — включва/изключва на всички каски. Включено → една
  // калибровка за всички; смяна → старите калибровки се трият (нулата на каските се сменя)
  'POST /api/largespace': ({ on }) => {
    if (matchRunning()) throw new Error('Тече мач — LBE не се пипа: може да презапише нулата на каските. Спри мача първо.');
    const enabled = on !== false;
    if (enabled !== arena.lbe.enabled) {
      const prevFile = archiveCalibration('reset');
      if (prevFile) logCalib('reset', null, null, { source: 'largespace', prevFile });
      arena.calibrations = {};
      delete arena.sharedCalibration;
      pendingCalibration = null;
    }
    arena.lbe.enabled = enabled;
    writeJson(ARENA_FILE, arena);
    let sent = 0;
    for (const id of sockets.keys()) if (sendTo(id, { type: 'largeSpace', on: enabled })) sent++;
    toast(`LBE ${enabled ? 'включвам' : 'изключвам'} на ${sent} каски`, 'ok');
    return { ok: true, sent };
  },

  // LSpace — системната настройка на PICO за голямо пространство (LBE) в очилата
  'POST /api/headset/lspace': ({ headsetId }) => {
    const ids = headsetId ? [headsetId] : [...sockets.keys()];
    let sent = 0;
    for (const id of ids) if (sendTo(id, { type: 'openLSpace' })) sent++;
    return { ok: true, sent };
  },

  // проследяването на каската (6DoF) — без него LBE и играта не вървят
  'POST /api/headset/tracking': ({ headsetId, on }) => {
    const ids = headsetId ? [headsetId] : [...sockets.keys()];
    let sent = 0;
    for (const id of ids) if (sendTo(id, { type: 'tracking', on: on !== false })) sent++;
    return { ok: true, sent };
  },

  // настройката на границата на PICO в очилата (през камерите: под, височина, място за игра)
  'POST /api/headset/border': ({ headsetId }) => {
    const ids = headsetId ? [headsetId] : [...sockets.keys()];
    let sent = 0;
    for (const id of ids) if (sendTo(id, { type: 'setBorder' })) sent++;
    return { ok: true, sent };
  },

  // нова нула: каската(ите) сканира маркера отново
  'POST /api/lbe/origin': ({ headsetId }) => {
    if (matchRunning()) throw new Error('Тече мач — LBE не се пипа: може да презапише нулата на каските. Спри мача първо.');
    const { originType, distance, openVst } = arena.lbe;
    const ids = headsetId ? [headsetId] : [...sockets.keys()];
    let sent = 0;
    for (const id of ids) if (sendTo(id, { type: 'lbeOrigin', originType, distance, openVst })) sent++;
    return { ok: true, sent };
  },

  // LBE карта от една каска към избраните (виж lbeShareStart)
  'POST /api/lbe/share': ({ from, to }) => ({ ok: true, share: lbeShareStart(String(from || ''), to) }),
  'POST /api/lbe/share/cancel': () => {
    if (!lbeShare || lbeShare.doneAt) throw new Error('Няма споделяне');
    lbeShareFail('stopped by the operator');
    return { ok: true };
  },

  'POST /api/headset/identify': ({ headsetId }) => ({ ok: sendTo(headsetId, { type: 'identify' }) }),
  // каската зарежда страницата наново (нов код без кабел); излиза от VR и иска пак „Влез"
  'POST /api/headset/reload': ({ headsetId }) => {
    const h = headsets.get(headsetId);
    const ok = sendTo(headsetId, { type: 'reload' });
    // страница отпреди да има „reload": зарежда „игра", чийто единствен код е да презареди страницата
    if ((h?.build || 0) < 4) sendTo(headsetId, { type: 'gameStart', game: '_reload' });
    return { ok };
  },
  'POST /api/headset/recalibrate': ({ headsetId }) => ({ ok: applyCalibrationTo(headsetId) }),
  'POST /api/headset/reboot': ({ headsetId }) => ({ ok: sendTo(headsetId, { type: 'reboot' }) }),
  'POST /api/live/want': ({ cams }) => {
    liveWant = { cams: (Array.isArray(cams) ? cams : []).map(String).slice(0, 8), at: Date.now() };
    return { ok: true };
  },

  'POST /api/headset/volume': ({ headsetId, value }) => {
    const h = headsets.get(headsetId);
    if (!h) throw new Error('No such headset');
    h.volume = clamp(Math.round(Number(value)), 0, 100);
    return { ok: sendTo(headsetId, { type: 'volume', value: h.volume }) };
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    // LBE карта: качване от каската-източник (суров zip) и сваляне от целите
    if (req.method === 'POST' && url.pathname === '/api/lbe/upload') return await lbeUpload(req, res, url);
    const lbeZip = req.method === 'GET' && url.pathname.match(/^\/api\/lbe\/map\/([\w-]+)\.zip$/);
    if (lbeZip) {
      const file = path.join(LBE_MAPS, `${lbeZip[1]}.zip`);
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Няма такава карта' });
      const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
      lbeLog('lbeShareDownload', null, { mapId: lbeZip[1], ip });
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': fs.statSync(file).size, 'cache-control': 'no-store' });
      // грешка при четене (напр. файлът е изтрит) не бива да спре лобито
      return fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    }

    // Картата на залата (PICO LBE) — каската, която калибрира, я качва; другите я свалят.
    if (url.pathname === '/api/map') {
      if (req.method === 'PUT') {
        writeAtomic(MAP_FILE, await readBody(req, 200e6));   // и на Windows: GET-ът не вижда половин карта
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET') {
        if (!fs.existsSync(MAP_FILE)) return json(res, 404, { error: 'Няма карта' });
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        return fs.createReadStream(MAP_FILE).pipe(res);
      }
    }

    // кадър на живо от Unreal: мостът пише на кръг в cam_X_0..7.jpg; даваме предпоследния
    // (последният може още да се записва във фонова нишка)
    const live = req.method === 'GET' && url.pathname.match(/^\/live\/(cam_[a-z0-9]+)\.jpg$/);
    if (live) {
      const status = readJson(path.join(HERE, 'public', 'live', 'status.json'), null);
      const n = status?.seq?.[live[1]];
      const ring = status?.ring || 8;
      // Unreal презаписва файловете постоянно — четем целия файл наведнъж; ако точно този
      // липсва или е празен, пробваме предишния кадър
      for (const back of [1, 2, 3]) {
        if (!(n > back)) break;
        let data;
        try { data = fs.readFileSync(path.join(HERE, 'public', 'live', `${live[1]}_${(n - back) % ring}.jpg`)); } catch { continue; }
        if (!data.length) continue;
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
        return res.end(data);
      }
      return json(res, 404, { error: 'Няма кадър' });
    }

    // само пробният сървър (tools/dev-server.mjs): записва изпечена карта от /play/tools/bake-map.html
    if (process.env.ARENA_DEV === '1' && req.method === 'PUT' && url.pathname === '/dev/save') {      // само на пробния сървър (tools/dev-server.mjs), никога в инсталирана зала
      const rel = String(url.searchParams.get('path') || '');
      if (!/^[\w./-]+$/.test(rel) || rel.includes('..')) return json(res, 400, { error: 'лош път' });
      const file = path.join(HERE, 'public/play/assets/maps', rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await readBody(req, 4e8));
      return json(res, 200, { ok: true, bytes: fs.statSync(file).size });
    }

    // Приложението MS Games VR (bg.arena.vr, подписано с ключа на Arena.apk) може да показва сайта на цял екран.
    // Отпечатъкът е на tools/apk/debug.keystore; друг ключ: data/assetlinks.json го заменя.
    if (url.pathname === '/.well-known/assetlinks.json') {
      let body = null;
      try { body = fs.readFileSync(path.join(DATA, 'assetlinks.json')); } catch { /* по подразбиране */ }
      if (!body) body = JSON.stringify(['bg.arena.vr', 'bg.arena.play'].map(pkg => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [APP_CERT_SHA256] },
      })));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      return res.end(body);
    }

    const handler = api[`${req.method} ${url.pathname}`];
    if (handler) {
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)).toString() || '{}') : {};
      const result = handler(body, req);
      pushState();
      return json(res, 200, result);
    }

    if (req.method === 'GET') {
      // path.resolve + path.sep: еднакво на Mac и Windows (там разделителят е \\ и „/..\\" също е изход)
      const PUBLIC = path.join(HERE, 'public');
      if (url.pathname === '/play' || url.pathname === '/board') { res.writeHead(302, { location: url.pathname + '/' }); return res.end(); }      // /board: класацията за екрана в залата
      const rel = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      const file = path.resolve(PUBLIC, '.' + path.sep + path.normalize(rel));
      if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const headers = { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' };
        // кадрите от Unreal (public/live) се сменят постоянно — без кеширане
        if (url.pathname.startsWith('/live/')) headers['cache-control'] = 'no-store';
        else if (url.pathname.startsWith('/fonts/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
        else headers['cache-control'] = 'no-cache';
        // непроменен файл се потвърждава с 304: моделите и картата (около 25 MB) не се теглят наново при всяко пускане
        const st = fs.statSync(file), tag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
        if (!url.pathname.startsWith('/live/')) {
          headers.etag = tag; headers['last-modified'] = st.mtime.toUTCString();
          if (req.headers['if-none-match'] === tag) { res.writeHead(304, headers); return res.end(); }
        }
        const stream = fs.createReadStream(file);
        stream.on('error', () => { if (!res.headersSent) json(res, 404, { error: 'Not found' }); else res.destroy(); });
        res.writeHead(200, headers);
        return stream.pipe(res);
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    const out = { error: err.message };
    if (err.code && typeof err.code === 'string' && !/^E[A-Z]/.test(err.code)) out.code = err.code;   // arena13h: busy / no_maps
    if (err.retryAfter) out.retryAfter = err.retryAfter;
    json(res, 400, out);
  }
});


// ---------- Сам пуска игра на всяка каска, която дойде (като залите на VEX) ----------
// Каска, влязла през страницата на играта: ако котвата ѝ е загубена, получава двете точки; после избраната игра.
// Веднъж на връзка: каска, която излезе от мрежата и се върне, минава наново. Включва се и се сменя в „Settings".
const AUTO_DEFAULT = { on: true, gameId: 'backroom', theme: 'night' };
if (!arena.autoStart) arena.autoStart = { ...AUTO_DEFAULT };
const autoSeen = new Map();      // каска → { step: 'new' | 'aligning' | 'started' | 'retry', at }
function autoStartTick() {
  const cfg = arena.autoStart;
  for (const h of headsets.values()) {
    if (!h.online) { autoSeen.delete(h.id); continue; }
    if (!cfg?.on || h.desk || !h.web) continue;
    const seen = autoSeen.get(h.id), now = Date.now();
    if (!seen) { autoSeen.set(h.id, { step: 'new', at: now }); continue; }
    if (seen.step === 'new' && (now - seen.at < 3000 || h.anchor == null)) continue;      // its first status report first
    if (seen?.step === 'started') continue;
    if (seen?.step === 'retry' && now - seen.at < 30_000) continue;
    if (session && (session.headsets || []).includes(h.id)) { autoSeen.set(h.id, { step: 'started', at: now }); continue; }
    if (h.phase !== 'idle') continue;
    const name = arena.names[h.id] || h.name || h.id;
    if (h.anchor !== 'ok') {
      if (seen?.step !== 'aligning' && arena.zone && !session) {
        try { api['POST /api/zone/align']({ headsetId: h.id }); autoSeen.set(h.id, { step: 'aligning', at: now }); toast(`${name}: two-point alignment first, then the game starts by itself`, 'ok'); }
        catch { /* следващия път */ }
      }
      continue;
    }
    if (session && session.gameId !== cfg.gameId) continue;      // върви друга игра: каската чака в лобито
    try {
      api['POST /api/launch']({ gameId: cfg.gameId, headsetIds: [h.id], theme: cfg.theme || undefined, fast: false });
      autoSeen.set(h.id, { step: 'started', at: now });
      toast(`${name}: started by itself`, 'ok');
    } catch (e) {
      if (seen?.step !== 'retry') toast(`${name}: the game did not start by itself (${e.message})`, 'warn');
      autoSeen.set(h.id, { step: 'retry', at: now });
    }
    pushState();
  }
}
setInterval(autoStartTick, 2000);

// ---------- HTTPS за каските ----------
// Браузърът на каската пуска VR само през защитена връзка. Сертификатът е наш (самоподписан):
// прави се веднъж с openssl и стои в data/tls. На всяка каска се приема еднократно („Advanced" → „Proceed").

const TLS_DIR = path.join(DATA, 'tls');
const APP_CERT_SHA256 = '03:4F:2F:92:25:03:0F:46:51:AE:B9:DE:9A:2E:42:71:CC:5C:0D:B8:2A:3F:60:44:6F:D6:D2:C5:A9:89:3A:B3';   // tools/apk/debug.keystore
function ensureTls() {
  const keyFile = path.join(TLS_DIR, 'key.pem'), certFile = path.join(TLS_DIR, 'cert.pem');
  if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
    fs.mkdirSync(TLS_DIR, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanAddresses().map(a => `IP:${a}`)].join(',');
    const args = ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', keyFile, '-out', certFile, '-days', '825', '-subj', '/CN=Arena', '-addext', `subjectAltName=${san}`];
    const tools = ['openssl', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'C:/Program Files/Git/usr/bin/openssl.exe'];
    let made = false;
    for (const tool of tools) {
      try { execFileSync(tool, args, { stdio: 'ignore' }); made = true; break; } catch { /* следващият */ }
    }
    if (!made) return null;
  }
  try { return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile), SNICallback: domainSni }; } catch { return null; }
}
// Истинският сертификат за името на залата (arena.osmantush.com, от tools/acme.mjs): дава се, когато каската пита
// по име; по IP адрес остава самоподписаният. Подновеният файл се взима без рестарт (гледа се датата на файла).
const DOMAIN_DIR = path.join(TLS_DIR, 'domain');
let domainCtx = null, domainStamp = '';
function domainTls() {
  try {
    const name = fs.readFileSync(path.join(DOMAIN_DIR, 'domain.txt'), 'utf8').trim();
    const chain = path.join(DOMAIN_DIR, 'fullchain.pem'), key = path.join(DOMAIN_DIR, 'key.pem');
    const stamp = name + fs.statSync(chain).mtimeMs + fs.statSync(key).mtimeMs;
    if (stamp !== domainStamp) {
      domainStamp = stamp;
      domainCtx = { name, ctx: tlsMod.createSecureContext({ key: fs.readFileSync(key), cert: fs.readFileSync(chain) }) };
    }
    return domainCtx;
  } catch { return null; }
}
function domainSni(servername, cb) {
  const d = domainTls();
  cb(null, d && servername && servername.toLowerCase() === d.name ? d.ctx : undefined);
}
const tls = process.env.NO_TLS === '1' ? null : ensureTls();
const secureServer = tls ? https.createServer(tls, (req, res) => server.emit('request', req, res)) : null;
// Приложението на каската (MS Games VR) отваря https://<името>/play/ без порт: същото и на 443, ако е свободен.
const appServer = tls && domainTls() && process.env.ARENA_DEV !== '1' && process.env.NO_APP_PORT !== '1'
  ? https.createServer(tls, (req, res) => server.emit('request', req, res)) : null;
if (appServer) {
  appServer.on('upgrade', (req, socket, head) => server.emit('upgrade', req, socket, head));
  appServer.on('error', err => console.warn('HTTPS на 443 не тръгна:', err.message));
}
if (secureServer) {
  secureServer.on('upgrade', (req, socket, head) => server.emit('upgrade', req, socket, head));
  secureServer.on('error', err => console.warn('HTTPS не тръгна:', err.message));
}

// ---------- WebSocket: /headset за каските, /ui за екрана ----------

const wssHeadset = new WebSocketServer({ noServer: true });
const wssUi = new WebSocketServer({ noServer: true });
const wssWatch = new WebSocketServer({ noServer: true });
wssWatch.on('connection', ws => {
  watchers.add(ws);
  ws.send(JSON.stringify({ type: 'hall', hall: webHall(), calibrated: !!latestCalibration() }));
  if (web) ws.send(JSON.stringify(web.startMsg));
  ws.on('close', () => watchers.delete(ws));
  ws.on('error', () => {});
});

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  const target = pathname === '/headset' ? wssHeadset : pathname === '/ui' ? wssUi : pathname === '/watch' ? wssWatch : null;
  if (!target) return socket.destroy();
  target.handleUpgrade(req, socket, head, ws => target.emit('connection', ws, req));
});

wssHeadset.on('connection', (ws, req) => {
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    onHeadsetMessage(ws, msg, ip);
  });
  ws.on('close', () => {
    const id = ws.headsetId;
    if (!id || sockets.get(id) !== ws) return;
    sockets.delete(id);
    const h = headsets.get(id);
    if (h) { h.online = false; if (h.phase === 'calibrating') { h.phase = 'idle'; h.calibStep = 0; } }
    pushState();
  });
});

wssUi.on('connection', ws => {
  uiClients.add(ws);
  ws.send(JSON.stringify(snapshot()));
  ws.on('close', () => uiClients.delete(ws));
});

// Каска, която мълчи повече от 10 с, се води „изключена".
setInterval(() => {
  let changed = false, loadTimedOut = false;
  for (const h of headsets.values()) {
    if (h.online && Date.now() - h.lastSeen > OFFLINE_AFTER_MS) { h.online = false; changed = true; }
    // arena13h (С1): паднала каска (30 с без връзка) не остава „playing/loading“ завинаги — иначе сесията не свършва
    if (!h.online && (h.phase === 'playing' || h.phase === 'loading') && Date.now() - h.lastSeen > SESSION_DROP_MS) {
      h.phase = 'idle'; h.app = null; changed = true;
    }
    // arena13h (С2): каска, която „зарежда“ твърде дълго без отговор, се връща в „idle“
    if (h.phase === 'loading' && Date.now() - (h.loadingAt || 0) > LOADING_TIMEOUT_MS) {
      h.phase = 'idle'; changed = true; loadTimedOut = true;
      sendTo(h.id, { type: 'stop' });   // ако все пак зарежда — да не влезе сама в игра без сесия
      toast(`${arena.names[h.id] || h.name || h.id}: the game did not load — returned to free`, 'warn');
    }
  }
  // никоя каска не зареди → общата игра се връща в лобито и може да се гласува пак
  if (loadTimedOut && sessionOver()) launchFailed(launchVote, 'каските не заредиха картата');
  // Играта свършва сама, когато всички играчи излязат.
  if (sessionOver()) {
    session = null; changed = true;
  }
  if (changed || roundSince) pushState();   // roundSince: таймерът на рунда без лимит върви на екрана
}, 2000);

// При промяна на състоянието на играта или картата казваме на всички свързани каски.
// По каска: заета (калибриране/LBE внос) каска получава up:false, после пак up:true.
const lastServerInfo = new Map();   // id → 'up|map'
setInterval(() => {
  for (const id of sockets.keys()) {
    const info = serverInfoFor(id);
    const key = `${info.up}|${info.map}|${info.port}`;
    if (lastServerInfo.get(id) === key) continue;
    if (sendTo(id, info)) lastServerInfo.set(id, key);
  }
  for (const id of lastServerInfo.keys()) if (!sockets.has(id)) lastServerInfo.delete(id);
}, 2000);

// ---------- откриване: компютърът „вика" в мрежата къде е ----------

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}

function startBeacon() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', err => console.warn('Откриването по UDP не работи:', err.message));
  sock.bind(() => {
    sock.setBroadcast(true);
    const msg = Buffer.from(JSON.stringify({ app: 'vrvarna-lobby', port: PORT }));
    setInterval(() => sock.send(msg, BEACON_PORT, '255.255.255.255', () => {}), 2000);
  });
}

// Приложението „Арена" на каските намира този компютър по това съобщение (UDP 47810, на всеки 2 с).
// Отделно е от стария сигнал на порт 47800 и не закача каски със старата игра.
function startPlayBeacon() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', err => console.warn('Сигналът за приложението не работи:', err.message));
  sock.bind(() => {
    sock.setBroadcast(true);
    const msg = Buffer.from(JSON.stringify({ app: 'arena-play', http: PORT, https: TLS_PORT }));
    const targets = () => ['255.255.255.255', ...lanAddresses().map(a => a.replace(/\d+$/, '255'))];
    setInterval(() => { for (const t of targets()) sock.send(msg, 47810, t, () => {}); }, 2000);
  });
}
if (process.env.NO_PLAY_BEACON !== '1') startPlayBeacon();

await loadWebGames();
await loadZoneLib();
if (arena.zone && !arena.zone.rooms) await reSolveZone();      // зона от по-стара версия: стаите се смятат при пускане

server.listen(PORT, () => {
  console.log(`Lobby running:  http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`Headsets connect at: ws://${ip}:${PORT}/headset`);
  if (process.env.BEACON === '1') startBeacon();
});
if (appServer) appServer.listen(443, () => console.log(`MS Games VR app: https://${domainTls().name}/play/`));
if (secureServer) {
  secureServer.listen(TLS_PORT, () => {
    for (const ip of lanAddresses()) console.log(`Headsets open the game at: https://${ip}:${TLS_PORT}/play/`);
  });
} else {
  console.log('HTTPS не е пуснат (няма openssl или NO_TLS=1): каските няма да могат да влязат във VR през браузър.');
}

// Лоби на VR арената — върви на компютъра в залата.
//
//  • каските се свързват по Wi-Fi на  ws://<компютър>:47801/headset
//  • екранът на лобито е на           http://localhost:47801
//  • каските намират компютъра сами по UDP съобщение на порт 47800
//
// Протоколът (какво си пращат каска и компютър) е описан в PROTOCOL.md.

import { execFile } from 'node:child_process';
import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { WebSocketServer } from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 47801);
const BEACON_PORT = 47800;
const DATA = path.join(HERE, 'data');
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
    if (p !== gamePort) { console.log(`Играта слуша на порт ${p} (беше ${gamePort})`); gamePort = p; }
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
    model: h.model,
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

function applyCalibrationTo(id) {
  const c = arena.calibrations[id];
  if (!c) return false;
  const { version, origin, yawDeg, width, depth, corners, hasMap } = c;
  const sent = sendTo(id, {
    type: 'applyCalibration',
    calibration: { version, origin, yawDeg, width, depth, corners },
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
  if (!targets.length) throw new Error('Избери поне една каска');
  const off = targets.filter(id => !sockets.has(id));
  if (off.length) throw new Error(`Не са свързани: ${off.map(lbeName).join(', ')}`);
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
      phase: msg.app ? 'playing' : 'idle',
      app: msg.app || null,
      user: msg.user || null,
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
    // LBE: само питаме за състоянието. Бързият режим НЕ се праща сам — ако тръгне, презаписва нулата
    // на картата от LSpace (24.10.2026); включва се само с бутона в прозореца LBE.
    sendTo(id, { type: 'lbeStatus' });
    // каската праща границата сама само при промяна → при всяко свързване я питаме тихо
    autoBounds.add(id);
    sendTo(id, { type: 'calibrateFromLbe' });
    toast(`${arena.names[id] || h.name || id} се свърза`);
    return pushState();
  }

  const id = ws.headsetId;
  const h = id && headsets.get(id);
  if (!h) return;
  h.lastSeen = Date.now();
  h.online = true;

  switch (msg.type) {
    case 'status':
      for (const k of ['battery', 'charging', 'controllers', 'wifi', 'tracking', 'pos', 'app', 'fps', 'sleeping', 'user', 'yaw', 'volume', 'match']) {
        if (k in msg) h[k] = msg[k];
      }
      if ('lbeColumns' in msg) takeLbeColumns(msg.lbeColumns);   // стар APK не праща полето
      // Докато играта зарежда, каската още няма app — оставаме на „зарежда".
      if (h.phase !== 'calibrating') h.phase = h.app ? 'playing' : (h.phase === 'loading' ? 'loading' : 'idle');
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
      toast('Калибрирането е готово — провери размерите и потвърди', 'ok');
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
      if (!msg.ok) toast(`${headsetView(h).name}: играта не тръгна (${msg.error || 'неизвестна грешка'})`, 'error');
      break;

    case 'stopped':
      h.phase = 'idle'; h.app = null;
      break;
  }
  pushState();
}

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
    const T = { start: 'мачът започва', restart: 'нов рунд', stop: 'мачът спрян', settings: 'режимът е сменен', forceStart: 'старт въпреки липсващите' };
    toast(T[cmd.command], cmd.command === 'stop' ? 'warn' : 'ok');
    return { ok: true, matchCmd: cmd, pending: matchPending.length };
  },

  // местене на каска в отбор: 1 = червен, 2 = син → команда setTeam (по ред след другите)
  'POST /api/match/team': ({ headsetId, team }) => {
    const id = String(headsetId || '');
    const t = Number(team);
    if (!headsets.has(id)) throw new Error('Няма такава каска');
    if (t !== 1 && t !== 2) throw new Error('Отборът е 1 (червен) или 2 (син)');
    teamWant[id] = t;
    const cmd = queueMatchCmd({ command: 'setTeam', headsetId: id, team: t });
    toast(`${headsetView(headsets.get(id)).name} → ${t === 1 ? 'ЧЕРВЕНИ' : 'СИНИ'}`, 'ok');
    return { ok: true, matchCmd: cmd, pending: matchPending.length };
  },

  'POST /api/calibrate': ({ headsetId }) => {
    const h = headsets.get(headsetId);
    if (!h?.online) throw new Error('Каската не е свързана');
    if (session) throw new Error('Спри играта преди калибриране');
    for (const other of headsets.values()) if (other.phase === 'calibrating') throw new Error('Вече се калибрира друга каска');
    pendingCalibration = null;
    sendTo(headsetId, { type: 'calibrate', corners: 4 });
    h.phase = 'calibrating'; h.calibStep = 0;
    return { ok: true };
  },

  'POST /api/calibrate/cancel': () => {
    for (const h of headsets.values()) if (h.phase === 'calibrating') { sendTo(h.id, { type: 'calibrateCancel' }); h.phase = 'idle'; h.calibStep = 0; }
    pendingCalibration = null;
    return { ok: true };
  },

  'POST /api/calibrate/confirm': () => {
    if (!pendingCalibration) throw new Error('Няма калибровка за потвърждаване');
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
    applyCalibrationTo(id);
    toast(`${name}: калибровка №${version} е записана`, 'ok');
    return { ok: true, version };
  },

  'POST /api/launch': ({ gameId, headsetIds, fromVote }) => {
    const game = games.find(g => g.id === gameId);
    if (!game) throw new Error('Няма такава игра');
    // само карти от APK-то; иначе сървърът и каските остават в Lobby
    if (!ALLOWED_MAPS.includes(game.map)) {
      throw new Error(`${game.name}: картата ${game.map || '(няма)'} не е в APK-то — не пускам, остават в Lobby`);
    }
    if (!gameServerUp()) throw new Error('Играта на компютъра не върви — пусни „VR Varna" от работния плот');
    // arena13i (У5): върви друга игра → второто пускане не я презаписва; същата игра приема закъснели каски
    if (session && sessionOver()) session = null;
    if (session && session.gameId !== gameId) throw apiError(`Вече върви ${session.gameName} — първо Стоп`, 'busy', 0);
    const prev = session;
    const ids = (headsetIds?.length ? headsetIds : [...headsets.values()].filter(h => h.online).map(h => h.id));
    const ready = ids.filter(id => headsets.get(id)?.online && headsets.get(id).phase === 'idle');
    if (!ready.length) throw new Error('Няма свободни свързани каски');
    if (ready.length > game.maxPlayers) throw new Error(`${game.name} е за до ${game.maxPlayers} играчи`);
    // без калибровка играчите не са там, където са в залата — ще се блъснат
    const missing = ready.filter(id => !arena.calibrations[id]);
    if (missing.length) throw new Error(`Калибрирай първо: ${missing.map(id => headsetView(headsets.get(id)).name).join(', ')}`);
    // операторът пусна игра с бутона по време на гласуване → гласуването се спира (картата е избрана)
    if (!fromVote && mapVote && mapVote.state === 'voting') { mapVote.state = 'cancelled'; mapVote.error = 'операторът пусна игра'; mapVote.endedAt = Date.now(); }
    // същата игра вече върви → закъснелите каски влизат в нея (сесията остава същата)
    const mine = session = prev
      ? Object.assign(prev, { headsets: [...new Set([...prev.headsets, ...ready])] })
      : { gameId, gameName: game.name, headsets: ready, startedAt: new Date().toISOString(), minutes: game.minutes };
    const vote = prev ? launchVote : (fromVote ? mapVote : null);
    launchVote = vote;
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
    if (!id) throw new Error('Няма каска');
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

  'POST /api/stop': () => {
    if (mapVote && mapVote.state === 'voting') { mapVote.state = 'cancelled'; mapVote.error = 'стоп'; mapVote.endedAt = Date.now(); }
    for (const h of headsets.values()) if (h.phase === 'playing' || h.phase === 'loading') sendTo(h.id, { type: 'stop' });
    session = null;
    setServerMap(LOBBY_MAP);   // общата игра се връща в лобито
    pushState();
    return { ok: true };
  },

  'POST /api/headset/rename': ({ headsetId, name }) => {
    if (!headsets.has(headsetId)) throw new Error('Няма такава каска');
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
    if (!sent) throw new Error('Няма свързана каска');
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
    if (!turned.size) throw new Error('Няма калибровка за завъртане');
    arena.lbeFlip = !arena.lbeFlip;   // и следващите LBE калибровки излизат завъртени
    if (arena.sharedCalibration && turned.has(arena.sharedCalibration)) arena.sharedCalibration = turned.get(arena.sharedCalibration);
    writeJson(ARENA_FILE, arena);
    for (const c of turned.values()) logCalib('rotate', c.sourceHeadset, c, { prevFile });
    archiveCalibration('после:rotate');
    let sent = 0;
    for (const id of sockets.keys()) if (applyCalibrationTo(id)) sent++;
    toast(`Залата е завъртяна на 180° (${sent} каски)`, 'ok');
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
    toast('Калибровките са изтрити — рестартирай играта на каските и калибрирай отново', 'warn');
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
    if (!/^[\w.-]+\.json$/.test(name) || !historyFiles().includes(name)) throw new Error('Няма такъв запис в историята');
    if (session) throw new Error('Спри играта преди връщане на калибровка');
    if (matchRunning()) throw new Error('Тече мач — калибровката не се пипа. Спри мача първо.');
    const d = readJson(path.join(CALIB_HISTORY, name), null);
    const saved = d?.calibrations && typeof d.calibrations === 'object' ? d.calibrations : null;
    if (!saved) throw new Error('Записът е повреден');
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
    if (!(d.lbeEnabled && ok(d.sharedCalibration)) && !Object.values(saved).some(ok)) throw new Error('В записа няма калибровка');
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
    if (matchRunning()) throw new Error('Тече мач — калибровката не се пипа. Спри мача първо.');
    if (session) throw new Error('Спри играта преди връщане на калибровка');
    const prev = previousBackup();
    if (!prev) throw new Error('Няма по-стара калибровка в историята');
    if (file && file !== prev.file) throw new Error('Историята се смени междувременно — отвори пак и потвърди');
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
    lbeShareFail('спряно от оператора');
    return { ok: true };
  },

  'POST /api/headset/identify': ({ headsetId }) => ({ ok: sendTo(headsetId, { type: 'identify' }) }),
  'POST /api/headset/recalibrate': ({ headsetId }) => ({ ok: applyCalibrationTo(headsetId) }),
  'POST /api/headset/reboot': ({ headsetId }) => ({ ok: sendTo(headsetId, { type: 'reboot' }) }),
  'POST /api/live/want': ({ cams }) => {
    liveWant = { cams: (Array.isArray(cams) ? cams : []).map(String).slice(0, 8), at: Date.now() };
    return { ok: true };
  },

  'POST /api/headset/volume': ({ headsetId, value }) => {
    const h = headsets.get(headsetId);
    if (!h) throw new Error('Няма такава каска');
    h.volume = clamp(Math.round(Number(value)), 0, 100);
    return { ok: sendTo(headsetId, { type: 'volume', value: h.volume }) };
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8',
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
      const file = path.resolve(PUBLIC, '.' + path.sep + (url.pathname === '/' ? 'index.html' : path.normalize(url.pathname)));
      if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const headers = { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' };
        // кадрите от Unreal (public/live) се сменят постоянно — без кеширане
        if (url.pathname.startsWith('/live/')) headers['cache-control'] = 'no-store';
        const stream = fs.createReadStream(file);
        stream.on('error', () => { if (!res.headersSent) json(res, 404, { error: 'Не е намерено' }); else res.destroy(); });
        res.writeHead(200, headers);
        return stream.pipe(res);
      }
    }
    json(res, 404, { error: 'Не е намерено' });
  } catch (err) {
    const out = { error: err.message };
    if (err.code && typeof err.code === 'string' && !/^E[A-Z]/.test(err.code)) out.code = err.code;   // arena13h: busy / no_maps
    if (err.retryAfter) out.retryAfter = err.retryAfter;
    json(res, 400, out);
  }
});

// ---------- WebSocket: /headset за каските, /ui за екрана ----------

const wssHeadset = new WebSocketServer({ noServer: true });
const wssUi = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  const target = pathname === '/headset' ? wssHeadset : pathname === '/ui' ? wssUi : null;
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
      toast(`${arena.names[h.id] || h.name || h.id}: играта не зареди — върната е свободна`, 'warn');
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

server.listen(PORT, () => {
  console.log(`Лобито работи:  http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`Каските се свързват на: ws://${ip}:${PORT}/headset`);
  if (process.env.NO_BEACON !== '1') startBeacon();
});

// Simulated headsets for testing the lobby without a Quest (MS Games 2, S2).
// Based on vr-arena/lobby/sim-headsets.js; these behave like the game page in a headset (web: true):
// hello with build/caps, status every second, gameStart → loading → playing, stop/lobby back to the waiting room,
// countdown/pause/results/endMessage/vote noted, setupPoints answered with two touches, ping answered with health.
//
//   node tools/sim-headsets.js 3 ws://localhost:47932/headset      → 3 headsets (Ctrl+C to stop)
//   import { createSim } from './sim-headsets.js'                   → drive them from a test script
//
// Every headset's tracking space is turned and shifted differently from the real room (that is what calibration fixes).
// The two floor marks are at A = (0, 0) and B = (0, 2.5) in the real room.

import WebSocket from 'ws';

export const MARKS = [{ x: 0, z: 0 }, { x: 0, z: 2.5 }];

export function makeHeadset(n, url, opts = {}) {
  const id = opts.id || `SIM${String(n).padStart(3, '0')}`;
  const log = [];
  const st = {
    battery: opts.battery ?? [92, 78, 64, 15, 100, 47][n % 6], charging: false, wifi: -45 - n * 3,
    app: null, load: null, calibrationVersion: null, calibration: null, inGame: null, worn: true,
    track: opts.track || { x: (n * 0.7) % 2 - 1, z: (n * 1.3) % 2 - 1, yaw: (n * 0.9) % (Math.PI * 2) },
    abError: opts.abError || 0, lastVote: null, paused: false, shows: 'none', benched: false,
  };
  let ws = null, alive = true, timers = [], statusTimer = null, connected = false;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const send = msg => ws?.readyState === 1 && ws.send(JSON.stringify(msg));
  const toTracking = p => {
    const { x, z, yaw } = st.track;
    return { x: x + p.x * Math.cos(yaw) - p.z * Math.sin(yaw), z: z + p.x * Math.sin(yaw) + p.z * Math.cos(yaw) };
  };
  const sendStatus = () => send({
    type: 'status', battery: Math.round(st.battery), charging: st.charging, wifi: st.wifi, tracking: 'ok', fps: 72,
    controllers: { left: 80, right: 75 }, app: st.app, load: st.load, build: opts.build ?? 999, inVR: true, worn: st.worn, anchor: 'ok',
    pos: { x: 0, y: 1.6, z: 0 }, yaw: 0, volume: 60, sleeping: false,
  });

  function onCommand(m) {
    log.push({ t: Date.now(), ...m });
    if (m.type !== 'game' && m.type !== 'room' && m.type !== 'ping') opts.onMessage?.(id, m);
    switch (m.type) {
      case 'gameStart':
        st.inGame = m.title || m.game || 'game'; st.app = null; st.load = 0; st.shows = 'game';
        sendStatus();
        later(600, () => { st.load = 60; sendStatus(); });
        later(1400, () => { st.app = st.inGame; st.load = null; sendStatus(); });
        break;
      case 'stop':
        st.app = null; st.inGame = null; st.load = null; st.shows = 'none';
        send({ type: 'stopped' }); sendStatus();
        break;
      case 'restartGame':
        st.app = null; st.inGame = null; sendStatus();
        break;
      case 'lobby':
        if (st.app) { st.app = null; st.inGame = null; sendStatus(); }
        st.shows = 'lobby';
        break;
      case 'pause': st.paused = !!m.on; break;
      case 'bench': st.benched = !!m.on; break;
      case 'applyCalibration':
        st.calibration = m.calibration; st.calibrationVersion = m.calibration?.version ?? null;
        if (m.calibration) later(300, () => send({ type: 'calibApplied', version: m.calibration.version }));
        break;
      case 'setupPoints':
        if (m.step === 'p1' && opts.autoPoints !== false) touchMarks();
        break;
      case 'zoneAlign':
        if (opts.autoPoints !== false) later(800, () => send({ type: 'zoneAligned', points: MARKS.map(p => toTracking(p)), floorY: 0 }));
        break;
      case 'ping': send({ type: 'health', t: m.t, pingMs: m.lastMs ?? null }); break;
      case 'zoneDraw':      // the laser drawing: a 5 × 5 m room around the marks, the two marks touched as points 1 and 2
        if (opts.autoPoints !== false) later(1200, () => send({ type: 'zoneDone', floorY: 0, obstacles: [],
          points: [{ x: -1, z: -1 }, { x: 4, z: -1 }, { x: 4, z: 4 }, { x: -1, z: 4 }].map(p => toTracking(p)), marks: MARKS.map(p => toTracking(p)) }));
        break;
      case 'vote': if (opts.autoVote) later(500 + n * 200, () => vote(opts.autoVote(n, m.options))); break;
      case 'identify': break;
    }
  }

  function touchMarks(abError = st.abError) {
    const [A, B] = MARKS.map(p => toTracking(p));
    // the second touch can be off along the A–B line (to test the 5 cm check)
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), k = (L + abError) / L;
    const B2 = { x: A.x + dx * k, z: A.z + dz * k };
    later(500, () => send({ type: 'setupPoint', index: 0, x: A.x, y: 0, z: A.z }));
    later(1100, () => send({ type: 'setupPoint', index: 1, x: B2.x, y: 0, z: B2.z, floorY: 0 }));
  }
  /** Votes for an option: its id (game id, or difficulty in a one-game party), as the headset page does. */
  function vote(id, gameId = null) { st.lastVote = id; send({ type: 'vote', id, gameId: gameId ?? id }); }

  function connect() {
    if (!alive) return;
    ws = new WebSocket(url);
    ws.on('open', () => {
      connected = true;
      send({ type: 'hello', id, name: opts.name || `Sim ${n + 1}`, model: 'Simulated Quest', web: true, build: opts.build ?? 999,
        caps: opts.caps ?? ['setupPoints', 'lobby', 'vote'], calibrationVersion: st.calibrationVersion, app: st.app, inVR: true, appVersion: 'sim-1' });
      sendStatus();
      statusTimer = setInterval(() => { st.battery = Math.max(1, st.battery - 0.02); sendStatus(); }, 1000);
    });
    ws.on('message', d => { try { onCommand(JSON.parse(d)); } catch { /* not json */ } });
    ws.on('close', () => { connected = false; clearInterval(statusTimer); timers.forEach(clearTimeout); timers = []; if (alive) setTimeout(connect, 1000); });
    ws.on('error', () => {});
  }

  connect();
  return {
    id, st, log,
    get connected() { return connected; },
    /** Wi-Fi drop: the socket goes away and stays away until back(). */
    drop() { alive = false; try { ws.terminate(); } catch { /* gone */ } },
    back() { if (alive) return; alive = true; connect(); },
    close() { alive = false; try { ws.close(); } catch { /* gone */ } },
    vote, touchMarks, sendStatus,
    send,
    seen: type => log.filter(m => m.type === type),
  };
}

export function createSim(count, url, opts = {}) {
  return Array.from({ length: count }, (_, i) => makeHeadset(i, url, typeof opts === 'function' ? opts(i) : opts));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '#')) {
  const count = Number(process.argv[2] || 3);
  const url = process.argv[3] || 'ws://localhost:47932/headset';
  createSim(count, url, { autoVote: (n, options) => options?.[n % options.length]?.id, onMessage: (id, m) => console.log(id, m.type, m.step || m.seconds || m.gameId || '') });
  console.log(`${count} simulated headsets → ${url}`);
}

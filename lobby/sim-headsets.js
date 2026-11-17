// Измислени каски — за да тестваме лобито без истински PICO.
// Държат се като истинската каска по PROTOCOL.md: пращат батерия и позиция,
// калибрират 4 ъгъла, пускат и спират игри.
//
//   node sim-headsets.js            → 6 каски към localhost
//   node sim-headsets.js 4 ws://192.168.1.10:47801/headset

import WebSocket from 'ws';

const USERS = ['Иван', 'Мария', 'Петър', 'Елена', 'Георги', 'Ивелина'];
const COUNT = Number(process.argv[2] || 6);
const URL = process.argv[3] || 'ws://localhost:47801/headset';

// Тракинг пространството на всяка каска е завъртяно и изместено различно
// спрямо истинската зала — точно това калибрирането трябва да оправи.
function makeHeadset(n) {
  const id = `PA9410MGJ${String(n).padStart(4, '0')}`;
  const state = {
    battery: [92, 78, 64, 15, 100, 47, 83, 55][n % 8],
    charging: n === 4,
    controllers: { left: 70 + (n * 7) % 30, right: 60 + (n * 11) % 40 },
    wifi: -45 - n * 3,
    app: null,
    fps: 72,
    volume: 60,
    sleeping: n === 2 || n === 5,
    user: n === 2 || n === 5 ? null : USERS[n % USERS.length],
    yaw: 0,
    tracking: 'ok',
    pos: { x: 0, z: 0 },
    calibrationVersion: null,
    calibration: null,
    trackOffset: { x: Math.random() * 4 - 2, z: Math.random() * 4 - 2, yaw: Math.random() * Math.PI * 2 },
    walk: { a: Math.random() * Math.PI * 2, r: 0.5 + Math.random() * 2 },
  };
  let ws;
  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const send = msg => ws?.readyState === 1 && ws.send(JSON.stringify(msg));

  // точка от залата (м, център = 0,0) → в координатите на тази каска
  function toTracking(p) {
    const { x, z, yaw } = state.trackOffset;
    return { x: x + p.x * Math.cos(yaw) - p.z * Math.sin(yaw), z: z + p.x * Math.sin(yaw) + p.z * Math.cos(yaw) };
  }

  function connect() {
    ws = new WebSocket(URL);
    ws.on('open', () => send({ type: 'hello', id, name: `Каска ${n + 1}`, model: 'PICO 4 Ultra Enterprise', calibrationVersion: state.calibrationVersion, app: state.app }));
    ws.on('message', data => onCommand(JSON.parse(data)));
    ws.on('close', () => { timers.forEach(clearTimeout); timers = []; setTimeout(connect, 2000); });
    ws.on('error', () => {});
  }

  function onCommand(cmd) {
    switch (cmd.type) {
      case 'calibrate': {
        // операторът минава с контролера по 4-те ъгъла на 6×6 м зала
        const room = [{ x: -3, z: -3 }, { x: 3, z: -3 }, { x: 3, z: 3 }, { x: -3, z: 3 }];
        const noise = () => (Math.random() - 0.5) * 0.06;
        const corners = room.map(p => toTracking({ x: p.x + noise(), z: p.z + noise() }));
        corners.forEach((c, i) => later(1500 * (i + 1), () => send({ type: 'calibCorner', index: i, x: c.x, y: 0, z: c.z })));
        later(1500 * 5, () => send({ type: 'calibDone', corners, hasMap: false }));
        break;
      }
      case 'calibrateCancel':
        timers.forEach(clearTimeout); timers = [];
        send({ type: 'calibCancelled' });
        break;
      case 'applyCalibration':
        state.calibration = cmd.calibration;
        state.calibrationVersion = cmd.calibration.version;
        later(400, () => send({ type: 'calibApplied', version: cmd.calibration.version }));
        break;
      case 'launch':
        later(1500 + Math.random() * 2000, () => {
          state.app = cmd.game.package;
          state.sleeping = false;
          state.user = USERS[n % USERS.length];
          send({ type: 'launched', ok: true, game: cmd.game.id });
          sendStatus();
        });
        break;
      case 'stop':
        state.app = null;
        send({ type: 'stopped' });
        sendStatus();
        break;
      case 'volume':
        state.volume = cmd.value;
        sendStatus();
        break;
      case 'identify':
        console.log(`${id}: вибрирам`);
        break;
      case 'reboot':
        ws.close();
        break;
    }
  }

  function sendStatus() {
    send({ type: 'status', battery: Math.round(state.battery), charging: state.charging, controllers: state.controllers,
      wifi: state.wifi, app: state.app, tracking: state.tracking, pos: state.pos,
      fps: state.fps, sleeping: state.sleeping, user: state.user, yaw: state.yaw, volume: state.volume });
  }

  setInterval(() => {
    // батерията пада по-бързо по време на игра
    if (state.charging) state.battery = Math.min(100, state.battery + 0.5);
    else state.battery = Math.max(1, state.battery - (state.app ? 0.15 : 0.03));
    // разходка из залата (позицията вече е в координатите на залата)
    state.walk.a += state.app ? 0.12 : 0.02;
    state.fps = Math.round(state.app ? 58 + Math.random() * 4 : 72 + Math.random() * 6);
    state.yaw = state.walk.a;
    state.pos = { x: Math.round(Math.cos(state.walk.a) * state.walk.r * 100) / 100, z: Math.round(Math.sin(state.walk.a * 1.3) * state.walk.r * 100) / 100 };
    sendStatus();
  }, 1000);

  connect();
}

for (let i = 0; i < COUNT; i++) makeHeadset(i);
console.log(`${COUNT} измислени каски → ${URL}`);

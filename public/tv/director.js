// The broadcast director of the spectator TV (S7). It owns the camera of the watch page that renders the game world
// (the real Motel client scene) and cuts between shots the way a live broadcast does:
//   wide    a slow orbit over the whole yard (the establishing shot)
//   follow  behind one player, over the shoulder, looking where the player looks
//   hero    in front of one player, low, the player and the weapon in frame
//   horde   from behind the zombies towards the players
//   crane   from high above down into the yard (a wave begins)
//   gate    inside the yard, on the gate that has just been broken
//   boss    over the players towards the boss, slowly pushing in
//   down    a slow turn around a player who has just gone down
// Rules: a shot lives 6 to 9 seconds, big events cut in at once (never sooner than 1.5 s after the last cut),
// inside a shot the camera only glides (exponential smoothing by the clock, so the motion is the same at any frame rate).
//
// All positions are hall coordinates (the same as the poses and the snapshot); the watch page's arena matrix takes
// them to its world.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const TYPE_BOSS = 3;

export function createDirector() {
  const cam = { p: [0, 4, 8], l: [0, 1, 0], fov: 50, ready: false };
  let shot = null, shotAt = 0, lastKind = '', lastWho = null, queue = [], orbit = Math.random() * TAU, clock = 0;
  const yaw = new Map();      // smoothed facing of every player: { x, z }
  const log = [];

  /** World facts for one frame: players { id, x, y, z, fx, fz, down }, zombies [x, z, type], centre, radius, gates. */
  function read(world) {
    const { start, snap, poses } = world;
    const hall = start?.hall || { w: 6, d: 6 }, f = start?.fence;
    // the yard is the fence when the game has one (a zone of several rooms is larger than its first hall)
    const cx = f ? (f.x0 + f.x1) / 2 : start?.zone?.cx ?? 0, cz = f ? (f.z0 + f.z1) / 2 : start?.zone?.cz ?? 0;
    const R = f ? Math.max(f.x1 - f.x0, f.z1 - f.z0) / 2 : Math.max(hall.w, hall.d) / 2;
    const players = [];
    for (const pl of snap?.players || []) {
      const pose = poses.get(pl.id);
      if (!pose) continue;
      let face = yaw.get(pl.id);
      if (!face) { face = { x: pose.fx, z: pose.fz }; yaw.set(pl.id, face); }
      players.push({ id: pl.id, name: pl.name, x: pose.x, y: clamp(pose.y, 0.9, 2.1), z: pose.z, fx: face.x, fz: face.z, down: pl.down > 0 });
    }
    const zombies = (snap?.z || []).filter(z => z[6] !== 3).map(z => ({ id: z[0], type: z[1], x: z[3], z: z[4] }));
    let px = cx, pz = cz;
    if (players.length) { px = players.reduce((a, p) => a + p.x, 0) / players.length; pz = players.reduce((a, p) => a + p.z, 0) / players.length; }
    return { hall, cx, cz, R, players, zombies, px, pz, gates: start?.gates || [], snap };
  }

  // ---------- shots: each returns { p, l, fov } for time t since the cut ----------
  const SHOTS = {
    wide(w, t, s) {
      const a = s.a0 + t * 0.07 * s.dir, r = w.R + 5.2;
      return { p: [w.cx + Math.sin(a) * r, 4.6, w.cz + Math.cos(a) * r], l: [(w.px + w.cx) / 2, 0.9, (w.pz + w.cz) / 2], fov: 48 };
    },
    crane(w, t, s) {
      const k = clamp(t / 5.5, 0, 1), e = k * k * (3 - 2 * k), a = s.a0 + e * 0.5 * s.dir, r = w.R + 2 + 3 * e;
      return { p: [w.cx + Math.sin(a) * r, 11 - 6.8 * e, w.cz + Math.cos(a) * r], l: [w.px, 0.8, w.pz], fov: 52 };
    },
    follow(w, t, s) {
      const p = who(w, s);
      if (!p) return null;
      const rx = -p.fz, rz = p.fx;      // the player's right
      return { p: [p.x - p.fx * 2.3 + rx * 0.55 * s.dir, p.y + 0.55, p.z - p.fz * 2.3 + rz * 0.55 * s.dir], l: [p.x + p.fx * 3.5, 1.15, p.z + p.fz * 3.5], fov: 62 };
    },
    hero(w, t, s) {
      const p = who(w, s);
      if (!p) return null;
      const side = (0.9 - t * 0.12) * s.dir, rx = -p.fz, rz = p.fx;
      return { p: [p.x + p.fx * 2.5 + rx * side, 1.15, p.z + p.fz * 2.5 + rz * side], l: [p.x, p.y - 0.25, p.z], fov: 44 };
    },
    horde(w, t, s) {
      if (!w.zombies.length) return null;
      // the pack nearest to the players
      const near = [...w.zombies].sort((a, b) => Math.hypot(a.x - w.px, a.z - w.pz) - Math.hypot(b.x - w.px, b.z - w.pz)).slice(0, 4);
      const zx = near.reduce((a, z) => a + z.x, 0) / near.length, zz = near.reduce((a, z) => a + z.z, 0) / near.length;
      let dx = zx - w.px, dz = zz - w.pz;
      const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      return { p: [zx + dx * 3.2 - dz * 1.2 * s.dir, 2.5, zz + dz * 3.2 + dx * 1.2 * s.dir], l: [w.px, 1.1, w.pz], fov: 50 };
    },
    gate(w, t, s) {
      const g = w.gates[s.gate];
      if (!g) return null;
      let dx = w.cx - g.x, dz = w.cz - g.z;      // from the gate into the yard
      const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const back = 3.6 - Math.min(1, t / 4.5) * 0.8;
      return { p: [g.x + dx * back - dz * 1.1 * s.dir, 1.75, g.z + dz * back + dx * 1.1 * s.dir], l: [g.x, 1.05, g.z], fov: 50 };
    },
    boss(w, t, s) {
      const b = w.zombies.find(z => z.type === TYPE_BOSS);
      if (!b) return null;
      let dx = w.px - b.x, dz = w.pz - b.z;
      const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const back = 2.6 + Math.max(0, 1 - t / 6) * 1.6;
      return { p: [w.px + dx * back - dz * 0.9 * s.dir, 2.3, w.pz + dz * back + dx * 0.9 * s.dir], l: [b.x, 1.7, b.z], fov: 42 };
    },
    down(w, t, s) {
      const p = who(w, s);
      if (!p) return null;
      const a = s.a0 + t * 0.32 * s.dir;
      return { p: [p.x + Math.sin(a) * 2.7, 2.5, p.z + Math.cos(a) * 2.7], l: [p.x, 0.7, p.z], fov: 50 };
    },
  };
  function who(w, s) { return w.players.find(p => p.id === s.who) || null; }

  function cut(kind, extra = {}, hold = rnd(6, 9), now = clock) {
    shot = { kind, a0: orbit, dir: Math.random() < 0.5 ? -1 : 1, hold, ...extra };
    shotAt = now;
    lastKind = kind;
    if (extra.who) lastWho = extra.who;
    cam.ready = false;      // a cut: the camera jumps, it does not fly across the yard
    log.push(kind); if (log.length > 40) log.shift();
  }

  /** The next regular shot: not the same kind twice, players in turn, the wide shot often enough to keep the picture readable. */
  function next(w) {
    const alive = w.players, intro = w.snap?.phase === 'intro';
    if (!alive.length) return cut('wide');
    const bag = [];
    const add = (k, n) => { if (k !== lastKind) for (let i = 0; i < n; i++) bag.push(k); };
    add('follow', 5); add('hero', intro ? 3 : 2); add('wide', 3);
    if (w.zombies.length >= 2) add('horde', 3);
    if (w.zombies.some(z => z.type === TYPE_BOSS)) add('boss', 3);
    if (intro) add('crane', 1);
    const kind = bag[Math.floor(Math.random() * bag.length)] || 'wide';
    if (kind === 'follow' || kind === 'hero') {
      const up = alive.filter(p => !p.down);
      const pool = (up.length ? up : alive);
      const i = pool.findIndex(p => p.id === lastWho);
      return cut(kind, { who: pool[(i + 1) % pool.length].id });
    }
    cut(kind);
  }

  /** A big event from the game: it becomes the next shot. */
  const lastEvent = {};
  function event(e) {
    // the same kind of event does not take the picture twice within ten seconds (a player who keeps going down)
    if (e.k !== 'boss' && clock - (lastEvent[e.k] ?? -99) < 10) return;
    lastEvent[e.k] = clock;
    const add = (prio, kind, extra, hold) => { queue.push({ prio, kind, extra, hold, at: clock }); queue.sort((a, b) => b.prio - a.prio); if (queue.length > 3) queue.length = 3; };
    switch (e.k) {
      case 'boss': return add(4, 'boss', {}, 7.5);
      case 'rage': return add(3, 'boss', {}, 5);
      case 'down': return add(4, 'down', { who: e.p }, 5);
      case 'breach': return add(3, 'gate', { gate: e.g }, 4.5);
      case 'wave': return add(2, 'crane', {}, 5.5);
      case 'boom': return add(1, 'wide', {}, 4);
      case 'clear': return add(1, 'wide', {}, 5);
    }
  }

  /**
   * One frame. arenaPage: the watch page's __arena (camera, desk, arena). Returns the name of the current shot.
   * dt in seconds, measured by the caller's clock.
   */
  function update(dt, world, arenaPage) {
    clock += dt;
    orbit += dt * 0.02;
    // the players' facing, smoothed hard: a head that looks around must not swing the camera
    for (const [id, pose] of world.poses) {
      const f = yaw.get(id);
      if (!f) { yaw.set(id, { x: pose.fx, z: pose.fz }); continue; }
      const k = 1 - Math.exp(-dt * 1.6);
      f.x += (pose.fx - f.x) * k; f.z += (pose.fz - f.z) * k;
      const n = Math.hypot(f.x, f.z) || 1; f.x /= n; f.z /= n;
    }
    const w = read(world);
    const age = clock - shotAt;
    if (queue.length && (!shot || age > 1.5)) {
      const q = queue.shift();
      if (clock - q.at < 6) cut(q.kind, q.extra, q.hold);
    }
    if (!shot || clock - shotAt > shot.hold) next(w);
    let want = SHOTS[shot.kind](w, clock - shotAt, shot);
    if (!want) { next(w); want = SHOTS[shot.kind](w, 0, shot) || SHOTS.wide(w, 0, shot); }

    if (!cam.ready) { cam.p = [...want.p]; cam.l = [...want.l]; cam.fov = want.fov; cam.ready = true; }
    else {
      const kp = 1 - Math.exp(-dt * 2.6), kl = 1 - Math.exp(-dt * 3.4);
      for (let i = 0; i < 3; i++) { cam.p[i] += (want.p[i] - cam.p[i]) * kp; cam.l[i] += (want.l[i] - cam.l[i]) * kl; }
      cam.fov += (want.fov - cam.fov) * kp;
    }
    cam.p[1] = Math.max(0.6, cam.p[1]);
    apply(arenaPage);
    return shot.kind;
  }

  /** Puts the camera of the watch page where the director wants it (hall coordinates through the arena's matrix). */
  function apply(A) {
    if (!A?.camera || !A.desk) return;
    const m = A.arena?.matrixWorld?.elements;
    const tf = v => (m ? [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]] : v);
    const p = tf(cam.p), l = tf(cam.l);
    const dx = l[0] - p[0], dy = l[1] - p[1], dz = l[2] - p[2], len = Math.hypot(dx, dy, dz) || 1;
    A.camera.position.set(p[0], p[1], p[2]);
    A.desk.yaw = Math.atan2(-dx, -dz);
    A.desk.pitch = Math.asin(clamp(dy / len, -1, 1));
    A.desk.keys?.clear?.();
    if (Math.abs(A.camera.fov - cam.fov) > 0.05) { A.camera.fov = cam.fov; A.camera.near = 0.1; A.camera.updateProjectionMatrix(); }
  }

  function reset() { shot = null; queue = []; cam.ready = false; yaw.clear(); lastKind = ''; lastWho = null; }

  return { update, event, reset, cut, get shot() { return shot?.kind || ''; }, get log() { return log; }, cam };
}

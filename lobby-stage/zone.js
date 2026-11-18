// Сметките за зоната, начертана от каска.
// Вход: многоъгълник на зоната и препятствия, в проследяването на каската, която е чертала.
// Изход: рамка на залата (къде е началото и накъде е оста X), най-големият свободен правоъгълник за игра,
// и същите фигури в координатите на залата.
//
// Уговорка (същата като при калибровката с 4 ъгъла):
//   точка в залата → в проследяването:  T = origin + R(yaw) · A,   R(a)·(x, z) = (x cos a − z sin a, x sin a + z cos a)

const rot = (a, x, z) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
const r2 = v => Math.round(v * 100) / 100;

export function toTracking(frame, p) {
  const a = frame.yawDeg * Math.PI / 180, [x, z] = rot(a, p[0] ?? p.x, p[1] ?? p.z);
  return [frame.origin.x + x, frame.origin.z + z];
}
export function toArena(frame, p) {
  const a = frame.yawDeg * Math.PI / 180;
  return rot(-a, (p[0] ?? p.x) - frame.origin.x, (p[1] ?? p.z) - frame.origin.z);
}

export function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToEdges(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
/** Точката свободна ли е: вътре в зоната (на margin от ръба) и извън всяко препятствие (на margin от него). */
export function insideZone(zone, x, z, margin = 0) {
  if (!pointInPolygon(zone.poly, x, z) || distToEdges(zone.poly, x, z) < margin) return false;
  for (const o of zone.obstacles || []) if (pointInPolygon(o, x, z) || distToEdges(o, x, z) < margin) return false;
  return true;
}

const asPair = p => [Number(p.x ?? p[0]), Number(p.z ?? p[1])];
/** Препятствие с две точки е кръг: център и точка от ръба. */
function obstaclePoly(pts) {
  const p = pts.map(asPair);
  if (p.length !== 2) return p;
  const r = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), out = [];
  for (let i = 0; i < 12; i++) out.push([p[0][0] + Math.cos(i * Math.PI / 6) * r, p[0][1] + Math.sin(i * Math.PI / 6) * r]);
  return out;
}

/** Най-големият правоъгълник от свободни клетки (метод на хистограмата). Връща { c0, r0, cols, rows }. */
function largestRect(free, rows, cols, minCells) {
  const h = new Int32Array(cols);
  let best = null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) h[c] = free[r * cols + c] ? h[c] + 1 : 0;
    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const cur = c < cols ? h[c] : 0;
      while (stack.length && h[stack[stack.length - 1]] >= cur) {
        const top = stack.pop(), height = h[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0, width = c - left;
        const fits = width >= minCells && height >= minCells;
        const score = fits ? width * height : 0.001 * Math.min(width, height) * Math.sqrt(width * height);   // ако не стига: по-широкото е по-добро от по-дългото
        if (!best || score > best.score) best = { score, fits, c0: left, r0: r - height + 1, cols: width, rows: height };
      }
      stack.push(c);
    }
  }
  return best;
}

// ---------- изправяне на начертаното на ръка ----------

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len;
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  let far = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = perpDist(pts[i], pts[0], pts[pts.length - 1]); if (d > far) { far = d; idx = i; } }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), tol).slice(0, -1), ...rdp(pts.slice(idx), tol)];
}
/** Опростява затворена крива: реже я на две в двете най-далечни точки и опростява половините. */
function simplifyClosed(pts, tol) {
  if (pts.length < 4) return pts.slice();
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best) { best = d; b = i; } }
  best = -1;
  for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[b][0], pts[i][1] - pts[b][1]); if (d > best) { best = d; a = i; } }
  if (a > b) [a, b] = [b, a];
  const one = rdp(pts.slice(a, b + 1), tol), two = rdp([...pts.slice(b), ...pts.slice(0, a + 1)], tol);
  return [...one.slice(0, -1), ...two.slice(0, -1)];
}
function lineCross(p, d, q, e) {       // пресечна точка на две прави: p + t·d и q + s·e
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}
/**
 * Прави от крива, начертана на ръка, чист многоъгълник: маха трептенето, намира главната посока на стаята
 * и изправя към нея (и към 90° от нея) всяка страна, която е почти успоредна. Наистина косите страни остават коси.
 */
export function regularize(points, opts = {}) {
  const tol = opts.tol ?? 0.12, snap = (opts.snapDeg ?? 14) * Math.PI / 180, minEdge = opts.minEdge ?? 0.3;
  let p = points.map(asPair).filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1]));
  p = p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 0.02);
  if (p.length < 3) return p;
  let s = simplifyClosed(p, tol);
  if (s.length < 3) return p;
  // къси страни се сливат със съседните
  for (let guard = 0; guard < 50 && s.length > 3; guard++) {
    let k = -1, shortest = minEdge;
    for (let i = 0; i < s.length; i++) { const j = (i + 1) % s.length, len = Math.hypot(s[j][0] - s[i][0], s[j][1] - s[i][1]); if (len < shortest) { shortest = len; k = i; } }
    if (k < 0) break;
    const j = (k + 1) % s.length;
    s[k] = [(s[k][0] + s[j][0]) / 2, (s[k][1] + s[j][1]) / 2];
    s.splice(j, 1);
  }
  const n = s.length;
  const edges = s.map((a, i) => { const b = s[(i + 1) % n]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; });
  // главната посока: средно на ъглите по модул 90°, претеглено с дължините
  let sx = 0, sy = 0;
  for (const e of edges) { sx += e.len * Math.cos(4 * e.ang); sy += e.len * Math.sin(4 * e.ang); }
  const theta = Math.atan2(sy, sx) / 4;
  const lines = edges.map(e => {
    const k = Math.round((e.ang - theta) / (Math.PI / 2)), target = theta + k * Math.PI / 2;
    let diff = e.ang - target; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const ang = Math.abs(diff) <= snap ? target : e.ang;
    return { p: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], d: [Math.cos(ang), Math.sin(ang)], len: e.len, snapped: ang === target };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i + n - 1) % n], L2 = lines[i];
    const x = lineCross(L1.p, L1.d, L2.p, L2.d);
    // успоредни съседни страни (малко стъпало) или пресечна точка далеч от начертаното: остава оригиналният връх
    out.push(x && Math.hypot(x[0] - s[i][0], x[1] - s[i][1]) < 0.8 ? x : s[i]);
  }
  return out;
}

export function solveZone({ points = [], obstacles = [] } = {}, opts = {}) {
  // Начертаната зона е мястото, до което стигат краката. Ръцете стигат и извън нея, затова стаята за игра
  // излиза с grow извън ръба (margin < 0). Положителен margin, както преди, я свива навътре.
  const margin = opts.margin ?? -0.1, min = opts.min ?? 1.6, max = opts.max ?? 40, cell = opts.cell ?? 0.1;
  const grow = Math.max(0, -margin), edge = Math.max(0, margin), obsMargin = opts.obstacleMargin ?? 0.05;
  const cellFree = (zone, x, z) => {
    const d = distToEdges(zone.poly, x, z);
    if (pointInPolygon(zone.poly, x, z) ? d < edge : d > grow) return false;
    for (const o of zone.obstacles) if (pointInPolygon(o, x, z) || distToEdges(o, x, z) < obsMargin) return false;
    return true;
  };
  const minRoom = opts.minRoom ?? 1.0, maxRooms = opts.maxRooms ?? 3;      // и ниша от един метър върши работа за рафтове
  const drawn = points.map(asPair).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const poly = opts.straighten === false ? drawn : regularize(drawn);          // изправената зона
  const obs = obstacles.map(o => (o.length > 8 ? simplifyClosed(o.map(asPair), 0.08) : obstaclePoly(o))).filter(o => o.length >= 3);
  const warnings = [];
  if (poly.length < 3) return { ok: false, warnings: ['The zone needs at least three points.'] };

  // посоки за оста X: по всеки ръб на зоната (и завъртяна на 90°)
  const angles = new Set();
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    if (Math.hypot(bx - ax, bz - az) < 0.3) continue;
    let a = Math.atan2(bz - az, bx - ax) % Math.PI;
    if (a < 0) a += Math.PI;
    angles.add(Math.round(a * 1800 / Math.PI) / 10);
    angles.add(Math.round(((a + Math.PI / 2) % Math.PI) * 1800 / Math.PI) / 10);
  }

  /** Решетка от свободни клетки за дадена посока; withObstacles = препятствията режат ли. */
  function grid(deg, withObstacles) {
    const a = deg * Math.PI / 180;
    const P = poly.map(([x, z]) => rot(-a, x, z)), O = withObstacles ? obs.map(o => o.map(([x, z]) => rot(-a, x, z))) : [];
    const us = P.map(p => p[0]), vs = P.map(p => p[1]);
    const u0 = Math.min(...us) - grow, v0 = Math.min(...vs) - grow;
    const cols = Math.ceil((Math.max(...us) + grow - u0) / cell), rows = Math.ceil((Math.max(...vs) + grow - v0) / cell);
    if (cols < 2 || rows < 2 || cols * rows > 250_000) return null;
    const free = new Uint8Array(cols * rows), zone = { poly: P, obstacles: O };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) free[r * cols + c] = cellFree(zone, u0 + (c + 0.5) * cell, v0 + (r + 0.5) * cell) ? 1 : 0;
    return { a, u0, v0, cols, rows, free };
  }
  const touch = (A, B) => {      // допират ли се два правоъгълника по стена и колко е общата част (в клетки)
    if (A.c0 + A.cols === B.c0 || B.c0 + B.cols === A.c0) return Math.min(A.r0 + A.rows, B.r0 + B.rows) - Math.max(A.r0, B.r0);
    if (A.r0 + A.rows === B.r0 || B.r0 + B.rows === A.r0) return Math.min(A.c0 + A.cols, B.c0 + B.cols) - Math.max(A.c0, B.c0);
    return 0;
  };
  /** Стаите за една посока: най-големият правоъгълник, после още до два, допрени до вече взетите. */
  function plan(deg, withObstacles) {
    const g = grid(deg, withObstacles);
    if (!g) return null;
    const first = largestRect(g.free, g.rows, g.cols, Math.round(min / cell));
    if (!first) return null;
    const rects = [first];
    const left = Uint8Array.from(g.free);
    const cut = R => { for (let r = R.r0; r < R.r0 + R.rows; r++) left.fill(0, r * g.cols + R.c0, r * g.cols + R.c0 + R.cols); };
    cut(first);
    const need = Math.round(minRoom / cell), doorCells = Math.round(0.9 / cell);
    for (let tries = 0; rects.length < maxRooms && tries < 6; tries++) {
      const R = largestRect(left, g.rows, g.cols, need);
      if (!R || !R.fits) break;
      cut(R);
      if (rects.some(Q => touch(Q, R) >= doorCells)) rects.push(R);       // стая без връзка с другите не върши работа
    }
    const area = rects.reduce((s, R) => s + R.cols * R.rows, 0);
    return { g, rects, area, score: (first.fits ? 1 : 0.001) * (area + first.cols * first.rows) };   // голяма първа стая и много общо място
  }
  function search(withObstacles) {
    let top = null;
    for (const deg of angles) { const p = plan(deg, withObstacles); if (p && (!top || p.score > top.score)) top = p; }
    return top;
  }
  // (А) стаите заобикалят препятствията; (Б) препятствията остават вътре. Б печели, ако А губи над една четвърт от мястото.
  const around = search(true), whole = obs.length ? search(false) : null;
  let best = around;
  if (whole && (!around || !around.rects[0].fits || around.area < 0.75 * whole.area)) best = whole;
  if (!best) return { ok: false, warnings: ['No free space found in the zone.'] };

  const { g, rects } = best, first = rects[0];
  const swap = first.rows > first.cols;                       // X на залата е дългата страна на стая „а"
  const a = g.a + (swap ? Math.PI / 2 : 0);
  const centre = R => [g.u0 + (R.c0 + R.cols / 2) * cell, g.v0 + (R.r0 + R.rows / 2) * cell];
  const [ou, ov] = centre(first), [ox, oz] = rot(g.a, ou, ov);
  const frame = { origin: { x: Math.round(ox * 1000) / 1000, z: Math.round(oz * 1000) / 1000 }, yawDeg: Math.round(a * 1800 / Math.PI) / 10 };
  const conv = p => toArena(frame, p).map(r2);
  const uv = (u, v) => conv(rot(g.a, u, v));                   // от решетката към залата
  const size = R => { const w = Math.min(max, R.cols * cell), d = Math.min(max, R.rows * cell); return swap ? { w: r2(d), d: r2(w) } : { w: r2(w), d: r2(d) }; };
  const rooms = rects.map((R, i) => { const [x, z] = uv(...centre(R)); return { id: 'abc'[i], x: i ? x : 0, z: i ? z : 0, ...size(R) }; });
  const doors = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i], B = rects[j];
    if (touch(A, B) < Math.round(0.9 / cell)) continue;
    const side = A.c0 + A.cols === B.c0 || B.c0 + B.cols === A.c0;          // стената е между колони: върви по v
    const lo = side ? Math.max(A.r0, B.r0) : Math.max(A.c0, B.c0), hi = side ? Math.min(A.r0 + A.rows, B.r0 + B.rows) : Math.min(A.c0 + A.cols, B.c0 + B.cols);
    const edge = side ? (A.c0 + A.cols === B.c0 ? B.c0 : A.c0) : (A.r0 + A.rows === B.r0 ? B.r0 : A.r0);
    const mid = (lo + hi) / 2;
    const [x, z] = side ? uv(g.u0 + edge * cell, g.v0 + mid * cell) : uv(g.u0 + mid * cell, g.v0 + edge * cell);
    // по коя ос върви стената в координатите на залата (при завъртяна рамка осите се разменят)
    doors.push({ a: 'abc'[i], b: 'abc'[j], x, z, w: r2(Math.min(1.2, (hi - lo) * cell - 0.2)), axis: (side !== swap) ? 'z' : 'x' });
  }
  const hall = { w: rooms[0].w, d: rooms[0].d };
  const ok = !!first.fits;
  if (!ok) warnings.push(`The largest room is under ${min} m: the game will be cramped.`);
  const obsArena = obs.map(o => o.map(conv));
  const inRoom = ([x, z]) => rooms.some(R => Math.abs(x - R.x) < R.w / 2 + 0.2 && Math.abs(z - R.z) < R.d / 2 + 0.2);
  const blocked = obsArena.filter(o => o.some(inRoom));          // препятствия вътре в стаите: играта ги пази свободни
  if (blocked.length) warnings.push(`${blocked.length} ${blocked.length === 1 ? 'obstacle stays' : 'obstacles stay'} inside the rooms.`);
  const area = r2(rooms.reduce((s, R) => s + R.w * R.d, 0));
  return {
    ok, frame, hall, rooms, doors,
    poly: poly.map(conv), drawn: drawn.length > 40 ? [] : drawn.map(conv), obstacles: obsArena, blocked, markers: [conv(poly[0]), conv(poly[1])],
    area, warnings,
  };
}

/** Друга каска е опряла контролера в точки 1 и 2 на зоната: намира нейната рамка. */
export function solveAlign(markers, touched) {
  const A = markers.map(asPair), T = touched.map(asPair);
  if (A.length < 2 || T.length < 2) throw new Error('two points are needed');
  const a = Math.atan2(T[1][1] - T[0][1], T[1][0] - T[0][0]) - Math.atan2(A[1][1] - A[0][1], A[1][0] - A[0][0]);
  const [rx, rz] = rot(a, A[0][0], A[0][1]);
  return {
    origin: { x: Math.round((T[0][0] - rx) * 1000) / 1000, z: Math.round((T[0][1] - rz) * 1000) / 1000 },
    yawDeg: Math.round(a * 1800 / Math.PI) / 10,
    error: Math.abs(Math.hypot(T[1][0] - T[0][0], T[1][1] - T[0][1]) - Math.hypot(A[1][0] - A[0][0], A[1][1] - A[0][1])),
  };
}

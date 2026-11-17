// Чертане на зоната от каската и показването ѝ.
//
// Ред на работа, всичко с десния контролер:
//   1. Зона:         лазер от контролера към пода. Стоиш на едно място и само сочиш.
//                    Къс натиск на спусъка = точка (като писалката във Photoshop), задържан спусък = рисуваш.
//                    Натиск върху първата точка или десният страничен бутон затваря формата.
//   2. Препятствия:  същият лазер, по едно наведнъж (колона, бюро). Страничен бутон без нищо начертано = напред.
//   3. Две точки:    отиваш и опираш контролера в пода на две места, спусък на всяко. По тях се хваща
//                    истинската височина на пода и по тях после се подравняват всички каски.
// Левият спусък връща последната точка или щрих. Сървърът после изправя формата.
//
// Всяка начертана точка помни откъде е сочена. Щом се разбере истинската височина на пода (от двата допира),
// точките се пресмятат наново върху верния под, така че грешен под в каската не разваля чертежа.

const C = { zone: 0xc8f03c, obstacle: 0xf06a45, ghost: 0x8a8c80, play: 0xeef0e8, floor: 0x5aa6f2, mark: 0x5aa6f2, idle: 0x6a6c64 };
const TIP = 0.03;          // контролерът, опрян в пода, е на около 3 см над него
const MAX_REACH = 12;      // лазерът не слага точки по-далеч от това
const STEP = 0.07;         // рисуване на свободна ръка: нова точка на всеки 7 см
const HOLD_MS = 220;       // след толкова задържане късият натиск става рисуване
const MARK_GAP = 1.0;      // двете точки за подравняване: поне метър една от друга
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Лента по пода през поредица от точки: един Mesh, колкото и да е дълга. Не заделя памет при обновяване. */
function makeRibbon(THREE, color, width = 0.03, max = 1500) {
  const pos = new Float32Array(max * 18);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  let count = 0, full = true;
  attr.onUpload(() => { full = false; });
  const X = p => p.x ?? p[0], Z = p => p.z ?? p[1];
  function seg(i, a, b, y) {
    const ax = X(a), az = Z(a), bx = X(b), bz = Z(b);
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1e-6;
    const nx = -dz / len * width / 2, nz = dx / len * width / 2;
    let o = i * 18;
    pos[o++] = ax + nx; pos[o++] = y; pos[o++] = az + nz;
    pos[o++] = ax - nx; pos[o++] = y; pos[o++] = az - nz;
    pos[o++] = bx + nx; pos[o++] = y; pos[o++] = bz + nz;
    pos[o++] = bx + nx; pos[o++] = y; pos[o++] = bz + nz;
    pos[o++] = ax - nx; pos[o++] = y; pos[o++] = az - nz;
    pos[o++] = bx - nx; pos[o++] = y; pos[o++] = bz - nz;
  }
  mesh.set = (pts, closed = false, y = 0.02) => {
    const n = pts.length, segs = Math.max(0, Math.min(max, closed ? n : n - 1));
    for (let i = 0; i < segs; i++) seg(i, pts[i], pts[(i + 1) % n], y);
    count = segs; full = true;
    attr.clearUpdateRanges();
    attr.needsUpdate = true;
    geo.setDrawRange(0, segs * 6);
  };
  /** Само една нова отсечка в края (рисуване на свободна ръка): към видеокартата тръгват 18 числа, не цялата лента. */
  mesh.push = (a, b, y = 0.02) => {
    if (count >= max) return;
    seg(count, a, b, y);
    if (!full) attr.addUpdateRange(count * 18, 18);
    attr.needsUpdate = true;
    count++;
    geo.setDrawRange(0, count * 6);
  };
  return mesh;
}
function label(THREE, text, color = '#c8f03c', w = 0.16) {
  const c = document.createElement('canvas');
  const long = String(text).length > 2;
  c.width = long ? 384 : 128; c.height = 128;
  const g = c.getContext('2d');
  // only bold white letters with a thin dark outline, no box behind them (owner's rule for every text in the headset)
  g.font = `900 ${long ? 72 : 100}px "Sofia Sans XC", "Sofia Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = 'rgba(0, 0, 0, 0.8)'; g.fillStyle = '#ffffff';
  g.strokeText(String(text), c.width / 2, 68); g.fillText(String(text), c.width / 2, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(long ? w * 3 : w, w, 1);
  s.renderOrder = 30;
  return s;
}
function dispose(o) { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }

export function createZoneEditor(env) {
  const { THREE, space, hands } = env;
  const group = new THREE.Group();     // всичко тук лежи на пода (group.position.y = floorY)
  space.add(group);
  const onDesk = () => !!env.desktop?.();

  let mode = null;                     // 'zone' | 'obstacles' | 'marks' | 'align' | 'floor' | 'points'
  let pointBase = 0;                   // 'points' (setup wizard): 0 = starts at mark A, 1 = only mark B is left
  const ghosts = new THREE.Group();    // 'points': rings where the console expects marks A and B
  let floorY = 0;
  let path = [], strokes = [];         // текущата форма: точки { x, z, ox, oy, oz } и колко точки има всеки щрих
  let drawing = false, downAt = 0;
  let zone = null;
  const obstacles = [];
  const marks = [];                    // допирите до пода: { x, y, z }
  let nearStart = false, hint = '';
  let only = false;                    // само препятствията: зоната и двете точки остават както са записани

  const cur = makeRibbon(THREE, C.zone, 0.035);
  const closing = makeRibbon(THREE, C.ghost, 0.012, 2);
  const liveLine = makeRibbon(THREE, C.zone, 0.02, 2);
  const done = new THREE.Group();      // затворените форми
  const dots = new THREE.Group();      // точките, сложени с къс натиск
  const markDots = new THREE.Group();  // двете точки за подравняване
  const dotGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14);
  const dotMat = { zone: new THREE.MeshBasicMaterial({ color: C.zone }), obstacle: new THREE.MeshBasicMaterial({ color: C.obstacle }) };
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.07, 24), new THREE.MeshBasicMaterial({ color: C.zone, side: THREE.DoubleSide }));
  cursor.rotation.x = -Math.PI / 2;
  // лазерът: тънка греда от контролера до пода (в пространството на каската, не в групата на пода)
  const laserGeo = new THREE.BoxGeometry(0.004, 0.004, 1);
  laserGeo.translate(0, 0, 0.5);
  const laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: C.zone, transparent: true, opacity: 0.85 }));
  laser.frustumCulled = false;
  space.add(laser);
  // подът: кръгове около мястото на допира, за да се види дали височината е вярна
  const floorMark = new THREE.Group();
  for (const r of [0.5, 1, 1.5, 2]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.012, r + 0.012, 48), new THREE.MeshBasicMaterial({ color: C.floor, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    floorMark.add(ring);
  }
  floorMark.visible = cursor.visible = laser.visible = false;
  group.add(cur, closing, liveLine, done, dots, markDots, cursor, floorMark, ghosts);
  let off = null, floorMarkTimer = 0;

  const col = () => (mode === 'obstacles' ? C.obstacle : mode === 'zone' ? C.zone : C.mark);
  const xz = p => ({ x: +p.x.toFixed(3), z: +p.z.toFixed(3) });
  const buzz = () => env.haptic('r', 1, 120);

  // ---- накъде сочи контролерът ----
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  const hit = { ok: false, x: 0, z: 0, ox: 0, oy: 0, oz: 0, dist: 0 };
  let pointing = false, smooth = false;
  function aim() {
    hit.ok = false;
    pointing = !!env.pointer(o, d);
    if (!pointing) { smooth = false; return; }
    const drop = o.y - floorY;
    if (d.y > -0.04 || drop < 0.05) { smooth = false; return; }      // сочи над хоризонта
    const t = drop / -d.y;
    const hx = d.x * t, hz = d.z * t, far = Math.hypot(hx, hz), k = far > MAX_REACH ? MAX_REACH / far : 1;
    let x = o.x + hx * k, z = o.z + hz * k;
    if (smooth) {      // далеч от контролера треперенето на ръката се увеличава: бавното движение се изглажда, бързото следва веднага
      const jump = Math.hypot(x - hit.x, z - hit.z);
      const a = jump > 0.6 ? 1 : clamp(0.18 + jump * 2.5, 0.18, 0.85);
      x = hit.x + (x - hit.x) * a; z = hit.z + (z - hit.z) * a;
    }
    hit.x = x; hit.z = z; hit.ox = o.x; hit.oy = o.y; hit.oz = o.z; hit.dist = Math.hypot(x - o.x, z - o.z);
    hit.ok = smooth = true;
  }
  const point = () => ({ x: +hit.x.toFixed(3), z: +hit.z.toFixed(3), ox: hit.ox, oy: hit.oy, oz: hit.oz });

  function say() {
    const h = hint; hint = '';
    if (mode === 'zone') env.panel('Draw the zone', [h || 'Point the laser at the floor without walking.', 'Trigger: point. Held: draw.', path.length >= 3 ? 'Grip button: close the shape.' : 'Left trigger: back.'], 'warn');
    else if (mode === 'obstacles') env.panel(`Obstacles: ${obstacles.length}`, path.length ? [h || 'Grip button: close this.', 'Left trigger: back.'] : [h || 'Outline a pillar or a desk with the laser.', 'Two points make a circle: centre and edge.', only ? 'Ready? Grip button: save.' : 'No more? Grip button: continue.'], 'warn');
    else if (mode === 'marks') env.panel(`Point ${marks.length + 1} of 2`, [h || 'Walk to the spot, touch the right controller', 'to the floor and pull the trigger.', marks.length ? 'At least a metre from point 1.' : 'Pick a spot you can find again.'], 'warn');
    else if (mode === 'align') env.panel(`Point ${marks.length + 1} of 2`, [h || `Touch the right controller to point ${marks.length + 1} on the floor`, 'and pull the trigger.'], 'warn');
    else if (mode === 'points') {
      const k = pointBase + marks.length, letter = 'AB'[k] || 'B';
      env.panel(`Touch mark ${letter}`, [h || `Walk to mark ${letter} on the floor,`, 'touch it with the right controller', 'and pull the trigger.'], 'warn');
    }
    else if (mode === 'floor') env.panel('Floor height', [h || 'Touch the right controller to the floor', 'and pull the trigger.'], 'warn');
  }
  function redraw() {
    cur.material.color.setHex(col());
    cur.set(path, false);
  }
  function addDot(p) {
    const m = new THREE.Mesh(dotGeo, mode === 'obstacles' ? dotMat.obstacle : dotMat.zone);
    m.position.set(p.x, 0.02, p.z);
    dots.add(m);
  }
  function clearDots() { for (const c of [...dots.children]) dots.remove(c); }
  function rebuildDots() {
    clearDots();
    let i = 0;
    for (const n of strokes) { if (path[i]) addDot(path[i]); i += n; }
  }
  function freeze(shape, color) {
    let ring = shape;
    if (shape.length === 2) {      // две точки = кръг: среда и ръб
      const [c, e] = shape, r = Math.hypot(e.x - c.x, e.z - c.z);
      ring = [];
      for (let i = 0; i < 16; i++) ring.push({ x: c.x + Math.cos(i * Math.PI / 8) * r, z: c.z + Math.sin(i * Math.PI / 8) * r });
    }
    const r = makeRibbon(THREE, color, 0.035, ring.length + 2);
    r.set(ring, true);
    done.add(r);
  }
  function rebuildDone() {
    for (const c of [...done.children]) { done.remove(c); dispose(c); }
    if (zone) freeze(zone, C.zone);
    for (const ob of obstacles) freeze(ob, C.obstacle);
  }
  function markDot(t, n) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 20), new THREE.MeshBasicMaterial({ color: C.mark }));
    disc.position.set(t.x, 0.012, t.z);
    const tag = label(THREE, n, '#5aa6f2');
    tag.position.set(t.x, 0.25, t.z);
    markDots.add(disc, tag);
  }
  function clearMarks() { marks.length = 0; for (const c of [...markDots.children]) { markDots.remove(c); dispose(c); } }
  /** Rings on the floor where the marks should be (setup wizard); world = tracking-space x, z or null. */
  function setGhosts(list) {
    for (const c of [...ghosts.children]) { ghosts.remove(c); c.traverse(dispose); }
    (list || []).forEach((p, i) => {
      if (!p) return;
      const g = new THREE.Group();
      for (const r of [0.16, 0.3]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.014, r + 0.014, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012;
        g.add(ring);
      }
      const tag = label(THREE, 'AB'[i], '#ffffff', 0.22);
      tag.position.y = 0.45;
      g.add(tag);
      g.position.set(p.x, 0, p.z);
      g.userData.letter = i;
      ghosts.add(g);
    });
  }
  /** Setup wizard: a mark touched like the alignment points, but sent raw to the server, one at a time. */
  function pressPoint() {
    const t = touch();
    if (!t) { hint = 'The controller must touch the floor.'; buzz(); return say(); }
    const k = pointBase + marks.length;
    if (k === 1 && marks.length && Math.hypot(t.x - marks[0].x, t.z - marks[0].z) < MARK_GAP) { hint = 'Too close to mark A: the marks are 2 m apart.'; buzz(); return say(); }
    marks.push(t);
    markDot(t, 'AB'[k]);
    for (const g of ghosts.children) if (g.userData.letter === k) g.visible = false;
    env.send({ type: 'setupPoint', index: k, x: t.x, y: t.y, z: t.z, floorY: +(t.y - TIP).toFixed(3) });      // y: the controller tip, floorY: the floor under it
    env.sound?.('setup.point');
    env.haptic('r', 1, k ? 250 : 90);
    if (k === 0) return say();
    env.panel('Marks sent', ['Wait for the console.'], '');
    stop();
  }

  /** Истинската височина на пода: всичко начертано се пресмята наново върху нея. */
  function setFloor(y) {
    const fix = p => {
      if (p.oy === undefined) return;
      const k = (p.oy - y) / (p.oy - floorY);
      if (!(k > 0.2 && k < 5)) return;
      p.x = +(p.ox + (p.x - p.ox) * k).toFixed(3); p.z = +(p.oz + (p.z - p.oz) * k).toFixed(3);
    };
    path.forEach(fix); zone?.forEach(fix);
    for (const ob of obstacles) ob.forEach(fix);
    floorY = y; group.position.y = y; smooth = false;
    rebuildDone(); redraw(); rebuildDots();
  }
  function showFloor(x, z, ms = 0) {
    floorMark.position.set(x, 0.01, z);
    floorMark.visible = true;
    clearTimeout(floorMarkTimer);
    if (ms) floorMarkTimer = setTimeout(() => { floorMark.visible = false; }, ms);
  }
  /** Къде контролерът опира пода. Връща null, ако не е долу при пода. */
  function touch(side = 'r') {
    if (onDesk()) return hit.ok ? { x: +hit.x.toFixed(3), y: +(floorY + TIP).toFixed(3), z: +hit.z.toFixed(3) } : null;
    const h = hands[side];
    if (!h?.active) return null;
    const w = h.world;
    if (env.headY() - w.y < 0.35) return null;      // контролерът е на височината на гърдите: това не е подът
    return { x: +w.x.toFixed(3), y: +w.y.toFixed(3), z: +w.z.toFixed(3) };
  }

  function pressMark() {
    const t = touch();
    if (!t) { hint = 'The controller must touch the floor.'; buzz(); return say(); }
    if (marks.length === 1) {
      if (Math.hypot(t.x - marks[0].x, t.z - marks[0].z) < MARK_GAP) { hint = 'Too close to point 1: at least a metre.'; buzz(); return say(); }
      if (Math.abs(t.y - marks[0].y) > 0.08) {      // едната не е била на пода: започваме пак
        clearMarks(); hint = 'The two are not at the same height. Point 1 again.'; buzz(); return say();
      }
    }
    marks.push(t);
    const y = marks.reduce((s, m) => s + m.y, 0) / marks.length - TIP;
    setFloor(+y.toFixed(3));
    markDot(t, marks.length);
    env.haptic('r', 0.8, 60);
    if (marks.length < 2) return say();
    const pts = marks.map(xz);
    if (mode === 'align') {
      env.send({ type: 'zoneAligned', points: pts, floorY });
      env.panel('Done', ['The headset is aligning.'], '');
    } else {
      env.send({ type: 'zoneDone', points: zone.map(xz), obstacles: obstacles.map(ob => ob.map(xz)), marks: pts, floorY });
      env.panel('Zone sent', ['Straightening it and computing the play area.'], '');
    }
    env.haptic('r', 1, 250);
    stop();
  }
  function press() {       // десният спусък е натиснат
    if (mode === 'points') return pressPoint();
    if (mode === 'marks' || mode === 'align') return pressMark();
    if (mode === 'floor') {
      const t = touch();
      if (!t) { hint = 'The controller must touch the floor.'; buzz(); return say(); }
      setFloor(+(t.y - TIP).toFixed(3));
      showFloor(t.x, t.z);
      env.haptic('r', 0.7, 60);
      return env.panel(`Floor: ${(floorY * 100).toFixed(0)} cm`, ['The blue circles must lie on the floor.', 'Trigger: try again.', 'Grip button: save.'], 'warn');
    }
    if (mode !== 'zone' && mode !== 'obstacles') return;
    if (!hit.ok) { hint = 'Point the laser down at the floor.'; buzz(); return say(); }
    if (nearStart) return close();      // натиск върху първата точка затваря формата
    if (path.length >= 1400) return buzz();
    drawing = true; downAt = performance.now();
    strokes.push(1);
    path.push(point());
    addDot(path[path.length - 1]);
    if (path.length > 1) cur.push(path[path.length - 2], path[path.length - 1]);
    env.haptic('r', 0.5, 30);
    say();
  }
  function release() {
    if (!drawing) return;
    drawing = false;
    // щрих на свободна ръка, който се е върнал при началото: формата се затваря сама
    if (mode === 'zone' && strokes[strokes.length - 1] > 8 && path.length >= 12 && Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].z - path[0].z) < 0.25) close();
  }
  function undo() {
    if (mode === 'points') {      // back to the first mark of this run
      if (!marks.length) return;
      clearMarks(); for (const g of ghosts.children) g.visible = true; env.haptic('l', 0.3, 30);
      return say();
    }
    if (mode === 'marks' || mode === 'align') {
      if (!marks.length) return;
      clearMarks(); env.haptic('l', 0.3, 30);
      return say();
    }
    if (!strokes.length && mode === 'obstacles' && obstacles.length) {
      obstacles.pop(); rebuildDone(); env.haptic('l', 0.3, 30);
      return say();
    }
    if (!strokes.length) return;
    const n = strokes.pop();
    path.length = Math.max(0, path.length - n);
    drawing = false;
    env.haptic('l', 0.3, 30);
    redraw(); rebuildDots(); say();
  }
  function close() {       // десният страничен бутон
    drawing = false;
    if (mode === 'floor') {
      if (!floorMark.visible) return buzz();
      floorMark.visible = false;
      env.send({ type: 'floorSet', floorY });
      env.panel('Height saved', [`${(floorY * 100).toFixed(0)} cm from the headset floor.`], '');
      return stop();
    }
    if (mode === 'zone') {
      if (path.length < 3) { hint = 'At least three points are needed.'; buzz(); return say(); }
      zone = path; path = []; strokes = [];
      mode = 'obstacles'; nearStart = false;
      clearDots(); rebuildDone(); redraw();
      env.haptic('r', 1, 150);
      return say();
    }
    if (mode === 'obstacles') {
      if (!path.length && only) {      // само препятствията: записват се в координатите на залата, зоната не се пипа
        env.send({ type: 'zoneObstaclesDone', obstacles: obstacles.map(ob => ob.map(p => env.toArena(p))) });
        env.panel('Obstacles sent', [`${obstacles.length} in total. Recomputing the rooms.`], '');
        env.haptic('r', 1, 250);
        return stop();
      }
      if (!path.length) {      // няма повече препятствия: остават двете точки
        mode = 'marks';
        env.haptic('r', 1, 150);
        return say();
      }
      if (path.length === 1) { hint = 'One more point: the edge of the obstacle.'; buzz(); return say(); }
      obstacles.push(path); path = []; strokes = [];
      clearDots(); rebuildDone(); redraw();
      env.haptic('r', 1, 150);
      return say();
    }
    buzz();
  }
  /** Левият страничен бутон, докато се чертае: левият контролер е опрян в пода и казва къде е той. */
  function floorHere() {
    if (mode !== 'zone' && mode !== 'obstacles') return;
    const t = touch('l');
    if (!t) { hint = 'Touch the left controller to the floor.'; env.haptic('l', 1, 120); return say(); }
    setFloor(+(t.y - TIP).toFixed(3));
    showFloor(t.x, t.z, 4000);
    env.haptic('l', 0.7, 60);
    hint = `Floor fixed: ${(floorY * 100).toFixed(0)} cm.`;
    say();
  }

  function begin(first) {
    hardReset();
    mode = first;
    floorY = Number(env.floor?.()) || 0;
    group.position.y = floorY;
    off = env.onInput(e => {
      if (!mode) return;
      if (e.hand === 'r' && e.type === 'triggerdown') press();
      else if (e.hand === 'r' && e.type === 'triggerup') release();
      else if (e.hand === 'l' && e.type === 'triggerdown') undo();
      else if (e.hand === 'r' && e.type === 'gripdown') close();
      else if (e.hand === 'l' && e.type === 'gripdown') floorHere();
    });
    say();
  }
  function hide() { cursor.visible = floorMark.visible = laser.visible = false; liveLine.set([], false); closing.set([], false); }
  function stop() {
    mode = null; drawing = false;
    off?.(); off = null;
    hide();
    setTimeout(() => { if (!mode) hardReset(); }, 3000);     // чертежът остава още миг, после идва изправената зона
  }
  function hardReset() {
    path = []; strokes = []; zone = null; obstacles.length = 0; only = false;
    floorY = 0; group.position.y = 0; smooth = false; nearStart = false; drawing = false;
    clearDots(); clearMarks(); rebuildDone(); setGhosts(null); pointBase = 0;
    cur.set([], false); closing.set([], false); liveLine.set([], false);
  }

  return {
    get active() { return !!mode; },
    get step() { return mode; },
    get only() { return only; },
    get debug() { return { mode, floorY, path: path.length, zone: zone?.length || 0, obstacles: obstacles.length, marks: marks.length, hit: hit.ok ? [+hit.x.toFixed(2), +hit.z.toFixed(2)] : null, nearStart }; },
    /** Зона → препятствия → две точки. */
    startDraw() { begin('zone'); },
    /** Само препятствията върху вече записаната зона. */
    startObstacles() { begin('obstacles'); only = true; say(); },
    /** Само височината на пода. */
    startFloor() { begin('floor'); },
    /** Каска без подравняване: двете точки на вече начертаната зона. */
    startAlign() { begin('align'); },
    /**
     * Setup wizard marks (design section 3). step 'p1' starts at mark A, 'p2' at mark B. ghosts: [{x, z}|null, {x, z}|null]
     * in tracking space, drawn as rings while the headset is aligned. Each touch goes out as setupPoint {index, x, y, z}.
     */
    startPoints({ step = 'p1', ghosts: g = null } = {}) {
      begin('points');
      pointBase = step === 'p2' ? 1 : 0;
      setGhosts(g);
      for (const r of ghosts.children) r.visible = r.userData.letter >= pointBase;
      say();
    },
    get pointsLeft() { return mode === 'points' ? 2 - pointBase - marks.length : 0; },
    cancel() { if (!mode) return; mode = null; off?.(); off = null; hide(); hardReset(); env.send({ type: 'zoneCancelled' }); },
    update() {
      if (!mode) return;
      if (ghosts.children.length) { const k = 1 + 0.12 * Math.sin(performance.now() / 260); for (const g of ghosts.children) g.children[1] && g.children[1].scale.setScalar(k); }
      const lasering = mode === 'zone' || mode === 'obstacles' || onDesk();
      if (!lasering) {      // допир: кръгчето е точно под контролера
        laser.visible = false;
        cursor.visible = !!hands.r.active;
        cursor.scale.setScalar(1);
        cursor.position.set(hands.r.world.x, 0.015, hands.r.world.z);
        cursor.material.color.setHex(C.mark);
        return;
      }
      aim();
      laser.visible = pointing;
      cursor.visible = hit.ok;
      if (!pointing) return;
      laser.position.copy(o);
      if (hit.ok) { laser.lookAt(hit.x, floorY, hit.z); laser.scale.z = Math.max(0.05, Math.hypot(hit.x - o.x, floorY - o.y, hit.z - o.z)); }
      else { laser.lookAt(o.x + d.x, o.y + d.y, o.z + d.z); laser.scale.z = 1.2; }
      laser.material.color.setHex(hit.ok ? col() : C.idle);
      if (mode !== 'zone' && mode !== 'obstacles') {
        if (hit.ok) { cursor.scale.setScalar(1); cursor.position.set(hit.x, 0.015, hit.z); cursor.material.color.setHex(C.mark); }
        return;
      }
      const last = path[path.length - 1], first = path[0];
      if (!hit.ok) { nearStart = false; liveLine.set([], false); return; }
      // близо до първата точка: кръгчето се лепва за нея и натискът затваря формата
      nearStart = mode === 'zone' && !drawing && path.length >= 3 && Math.hypot(hit.x - first.x, hit.z - first.z) < Math.max(0.18, hit.dist * 0.05);
      const cx = nearStart ? first.x : hit.x, cz = nearStart ? first.z : hit.z;
      cursor.position.set(cx, 0.015, cz);
      cursor.scale.setScalar(clamp(hit.dist / 2, 1, 3) * (nearStart ? 1.6 : 1));
      cursor.material.color.setHex(nearStart ? C.play : col());
      if (drawing) {       // задържан спусък: рисуване на свободна ръка
        if (performance.now() - downAt > HOLD_MS && last && Math.hypot(hit.x - last.x, hit.z - last.z) >= STEP && path.length < 1400) {
          const p = point();
          path.push(p);
          strokes[strokes.length - 1]++;
          cur.push(last, p);
        }
        liveLine.set([], false);
      } else if (last) {
        liveLine.material.color.setHex(col());
        liveLine.set([last, { x: cx, z: cz }], false);
      } else liveLine.set([], false);
      if (path.length >= 3) closing.set([path[path.length - 1], first], false, 0.012); else closing.set([], false);
    },
    dispose() { mode = null; off?.(); hardReset(); space.remove(group); space.remove(laser); },
  };
}

/** Записаната зона в координатите на залата: очертание, препятствия, мястото за игра, точките за подравняване. */
export function createZoneView({ THREE, root }) {
  const group = new THREE.Group();
  root.add(group);
  function clear() { for (const c of [...group.children]) { group.remove(c); dispose(c); } }
  return {
    set(zone) {
      clear();
      if (!zone?.poly) return;
      group.visible = true;
      const outline = makeRibbon(THREE, C.zone, 0.04, zone.poly.length + 2);
      outline.set(zone.poly, true);
      group.add(outline);
      // стаите: чистите правоъгълници, в които се подрежда играта (една или няколко, свързани с отвор)
      const rooms = zone.rooms?.length ? zone.rooms : zone.hall ? [{ id: 'a', x: 0, z: 0, w: zone.hall.w, d: zone.hall.d }] : [];
      for (const r of rooms) {
        const hw = r.w / 2, hd = r.d / 2;
        const play = makeRibbon(THREE, C.play, 0.025, 6);
        play.set([[r.x - hw, r.z - hd], [r.x + hw, r.z - hd], [r.x + hw, r.z + hd], [r.x - hw, r.z + hd]], true, 0.022);
        const size = label(THREE, `${r.w.toFixed(1)} × ${r.d.toFixed(1)} m`, '#eef0e8', 0.14);
        size.position.set(r.x, 0.12, r.z);
        group.add(play, size);
      }
      for (const dr of zone.doors || []) {      // отворите между стаите
        const half = dr.w / 2, bar = makeRibbon(THREE, C.zone, 0.06, 4);
        bar.set(dr.axis === 'x' ? [[dr.x - half, dr.z], [dr.x + half, dr.z]] : [[dr.x, dr.z - half], [dr.x, dr.z + half]], false, 0.024);
        group.add(bar);
      }
      for (const o of zone.obstacles || []) {
        if (o.length < 3) continue;
        const shape = new THREE.Shape(o.map(([x, z]) => new THREE.Vector2(x, -z)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.obstacle, transparent: true, opacity: 0.35, depthWrite: false })));
        const base = makeRibbon(THREE, C.obstacle, 0.035, o.length + 2), top = makeRibbon(THREE, C.obstacle, 0.025, o.length + 2);
        base.set(o, true); top.set(o, true, 1.1);
        group.add(base, top);
      }
      (zone.markers || []).forEach((m, i) => {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 20), new THREE.MeshBasicMaterial({ color: C.zone }));
        disc.position.set(m[0], 0.01, m[1]);
        const n = label(THREE, i + 1);
        n.position.set(m[0], 0.25, m[1]);
        group.add(disc, n);
      });
    },
    setVisible(on) { group.visible = !!on; },
    dispose() { clear(); root.remove(group); },
  };
}

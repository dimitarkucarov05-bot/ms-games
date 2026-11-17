// Огън от оригиналния модел на пламъка на Synty (SM_Flame_FX), както го ползват и техните сцени: много малки пламъчета,
// които се раждат в устата на варела, издигат се и се смаляват до нищо. Младите са светло жълти, по-старите оранжеви,
// най-горните червени; плътни са (като всичко друго в тези пакове), светят сами и не зависят от мъглата. В основата
// стоят три по-едри езика, които само пулсират, за да не се къса огънят на отделни листа; над него летят искри.
// Целият огън е една мрежа с копия (едно рисуване).
//
//   const fire = createFire(THREE, flameObject, { count, sparks });
//   parent.add(fire.mesh); fire.mesh.position.set(x, yМалкоПодУстата, z);   …   fire.update(dt)   …   fire.dispose()

export function createFire(THREE, flameObject, { count = 22, sparks = 6, core = 3, radius = 0.17, rise = 0.66, size = 2.3 } = {}) {
  // геометрията на пламъка в метри, с основа в y = 0 (моделът носи мащаба си във възела, не във върховете)
  let src = null;
  flameObject.updateMatrixWorld(true);
  flameObject.traverse(o => { if (o.isMesh && !src) src = o; });
  if (!src) return null;
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  geo.deleteAttribute('uv');
  {      // всяко пламъче е по-топло в основата и по-тъмно към върха
    const p = geo.attributes.position, h = (geo.boundingBox.max.y - geo.boundingBox.min.y) || 1, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = Math.min(1, Math.max(0, p.getY(i) / h)); c[i * 3] = 1; c[i * 3 + 1] = 1 - 0.3 * k; c[i * 3 + 2] = 1 - 0.55 * k; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false, fog: false });
  const n = core + count + sparks;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = 'fire';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const parts = [];
  function born(p, first) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius * (p.spark ? 0.7 : 1);
    p.x = Math.cos(a) * r; p.z = Math.sin(a) * r;
    p.life = p.spark ? rnd(0.9, 1.5) : rnd(0.45, 0.85);
    p.t = first ? Math.random() : 0;
    p.up = p.spark ? rnd(0.95, 1.5) : rise * rnd(0.7, 1.25) * (1 - 0.4 * r / radius);      // по средата огънят е по-висок
    p.dx = rnd(-0.1, 0.1) * (p.spark ? 2.4 : 1); p.dz = rnd(-0.1, 0.1) * (p.spark ? 2.4 : 1);
    p.s = p.spark ? rnd(0.14, 0.24) : size * rnd(0.7, 1.1) * (1 - 0.35 * r / radius);
    p.rot = Math.random() * Math.PI * 2; p.spin = rnd(-2.6, 2.6);
    p.lean = rnd(-0.2, 0.2);
    p.heat = Math.random();      // някои пламъчета са по-жълти, други по-червени: огънят не е едноцветен
  }
  for (let i = 0; i < n; i++) { const p = { core: i < core, spark: i >= core + count, a: i * 2.1 }; born(p, true); parts.push(p); }

  const HOT = new THREE.Color(1.0, 0.88, 0.42), MID = new THREE.Color(1.0, 0.5, 0.1), COLD = new THREE.Color(0.86, 0.17, 0.04), WHITE = new THREE.Color(1.0, 0.95, 0.7);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
  let wind = 0;
  function update(dt) {
    wind += dt;
    const sway = Math.sin(wind * 1.7) * 0.06 + Math.sin(wind * 4.3) * 0.03;      // целият огън леко се люшка
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      if (p.core) {      // тялото на огъня: стои в устата на варела и само пулсира
        const pulse = 0.8 + 0.2 * Math.sin(wind * (9 + i * 3.1) + p.a) + 0.1 * Math.sin(wind * (23 + i * 5) + p.a * 2);
        pos.set(Math.cos(p.a) * radius * 0.5, 0, Math.sin(p.a) * radius * 0.5);
        scl.set(size * 0.95, size * 0.62 * pulse, size * 0.95);
        q.setFromEuler(e.set(0, wind * (1.2 + i * 0.7) + p.a, 0));
        mesh.setMatrixAt(i, m4.compose(pos, q, scl));
        mesh.setColorAt(i, col.copy(WHITE).lerp(HOT, 0.5 + 0.5 * Math.sin(wind * 7 + p.a)));
        continue;
      }
      p.t += dt / p.life;
      if (p.t >= 1) born(p, false);
      const k = p.t, up = k * p.up;
      pos.set(p.x * (1 - 0.3 * k) + (p.dx + sway) * up, up, p.z * (1 - 0.3 * k) + p.dz * up);
      // расте бързо в първата осма, после се смалява до нищо на върха
      const grow = Math.min(1, k / 0.12), s = p.spark ? p.s * (1 - k) : p.s * grow * Math.pow(1 - k, 0.85);
      scl.set(s * (p.spark ? 1 : 1.15), s * (p.spark ? 1 : 1 + 0.6 * k), s * (p.spark ? 1 : 1.15));
      q.setFromEuler(e.set(p.lean * k, p.rot + p.spin * k, p.lean * 0.6 * k));
      mesh.setMatrixAt(i, m4.compose(pos, q, scl));
      if (p.spark) col.copy(MID).lerp(COLD, k);
      else {
        const a = Math.min(1, k * 1.55 + (p.heat - 0.5) * 0.5);      // възрастта плюс собствения нюанс
        if (a < 0.4) col.copy(HOT).lerp(MID, Math.max(0, a) / 0.4); else col.copy(MID).lerp(COLD, (a - 0.4) / 0.6);
      }
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  update(0);
  return { mesh, update, dispose() { geo.dispose(); mat.dispose(); } };
}

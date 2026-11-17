// Ефектите: блясък на дулото, следи на куршумите, гилзи, пръски от ниско-полигонални парчета, червеният край на
// погледа при удар. Всичко е геометрия с плоски цветове (никакви текстури) и идва от предварително направени
// басейни: в кадър не се създава нищо ново.

const KINDS = {
  blood: { color: 0x7a0c10, size: 0.035, g: 9, life: 0.55 },
  gore: { color: 0x9a1418, size: 0.055, g: 9, life: 0.9 },
  dirt: { color: 0x4a4238, size: 0.04, g: 9, life: 0.6 },
  spark: { color: 0xffc860, size: 0.02, g: 4, life: 0.25 },
};

export function createFx(ctx) {
  const { THREE, root } = ctx;
  const quest = /Quest/.test(navigator.userAgent);
  const group = new THREE.Group();
  group.name = 'fx';
  root.add(group);
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);

  // ── блясък на дулото: звезда от три кръстосани плочки + светлина ──
  const flashGeo = (() => {
    const g = new THREE.BufferGeometry(), p = [];
    const quad = (ax, ay, len, wide) => {      // ромб по дължината на цевта (−Z), завъртян около нея
      const cx = Math.cos(ax) * wide, cy = Math.sin(ax) * wide;
      p.push(0, 0, 0, cx, cy, -len * 0.35, 0, 0, -len, 0, 0, 0, 0, 0, -len, -cx, -cy, -len * 0.35);
      void ay;
    };
    quad(0, 0, 0.32, 0.07); quad(Math.PI / 3, 0, 0.26, 0.06); quad(-Math.PI / 3, 0, 0.26, 0.06);
    // къси езици встрани, под ъгъл спрямо цевта
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.4, r = 0.13, w = 0.022, cx = Math.cos(a), cy = Math.sin(a);
      p.push(-cy * w, cx * w, -0.02, cy * w, -cx * w, -0.02, cx * r, cy * r, -0.11);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  })();
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const flashes = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(flashGeo, flashMat); m.visible = false; m.frustumCulled = false; group.add(m); flashes.push({ m, t: 0 }); }
  let flashI = 0;
  const light = new THREE.PointLight(0xffc070, 0, 9, 1.6);      // една обща светлина за всички изстрели: стои в сцената с нулева сила
  // на Quest 2 светлината от изстрела не влиза в сцената (всяка светлина се смята на всеки пиксел): фенерът и без това проблясва
  if (!/Quest 2/.test(navigator.userAgent) && new URLSearchParams(location.search).get('lite') !== '1') group.add(light);
  let lightT = 0;
  const FLASH_SIZE = { pistol: 0.8, smg: 0.7, shotgun: 1.5, rifle: 1.1, revolver: 1.2, carbine: 0.95, hunting: 1.6, lmg: 1.0 };
  function flash(pos, dir, kind = 'pistol') {
    const f = flashes[flashI++ % flashes.length];
    f.m.position.copy(pos);
    f.m.quaternion.setFromUnitVectors(v.set(0, 0, -1), dir);
    f.m.rotateZ(Math.random() * Math.PI);
    f.m.scale.setScalar((FLASH_SIZE[kind] || 1) * (0.8 + Math.random() * 0.5));
    f.m.visible = true; f.t = 0.05;
    light.position.copy(pos).addScaledVector(dir, 0.25);
    light.intensity = quest ? 3 : 6; lightT = 0.07;
  }

  // ── следа: къса светла черта, която лети по пътя на куршума ──
  const tracerGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const tracers = [];
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(tracerGeo, tracerMat); m.visible = false; m.frustumCulled = false; group.add(m); tracers.push({ m, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, at: 0, on: false }); }
  let tracerI = 0;
  const TRACER_SPEED = 220, TRACER_LEN = 3.2;
  function tracer(from, to) {
    const t = tracers[tracerI++ % tracers.length];
    t.from.copy(from); t.dir.subVectors(to, from);
    t.len = t.dir.length();
    if (t.len < 0.4) return;
    t.dir.multiplyScalar(1 / t.len);
    t.at = 0; t.on = true;
    t.m.quaternion.setFromUnitVectors(Z, t.dir);
    t.m.visible = true;
    place(t);
  }
  function place(t) {
    const head = Math.min(t.len, t.at + TRACER_LEN), tail = Math.max(0, t.at);
    const len = Math.max(0.05, head - tail);
    t.m.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
    t.m.scale.set(1, 1, len);
  }

  // ── парчета: кръв, пръст, искри (тетраедри с плосък цвят) и гилзи ──
  const shardGeo = new THREE.TetrahedronGeometry(1, 0);
  const shardMats = {};
  for (const [k, d] of Object.entries(KINDS)) shardMats[k] = k === 'spark' ? new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false }) : new THREE.MeshLambertMaterial({ color: d.color });
  const shards = [];
  const SHARDS = quest ? 60 : 110;
  for (let i = 0; i < SHARDS; i++) { const m = new THREE.Mesh(shardGeo, shardMats.blood); m.visible = false; group.add(m); shards.push({ m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1, size: 0.03, g: 9 }); }
  let shardI = 0;
  /** Пръска n парчета от точка; dir (по избор) е посоката на куршума: парчетата летят по нея и настрани. */
  function burst(pos, kind = 'blood', n = 5, speed = 2, dir = null) {
    const d = KINDS[kind] || KINDS.blood;
    for (let i = 0; i < n; i++) {
      const s = shards[shardI++ % shards.length];
      s.m.material = shardMats[kind] || shardMats.blood;
      s.m.position.copy(pos);
      s.vel.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      if (dir) s.vel.addScaledVector(dir, speed * 0.6 * Math.random());
      s.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      s.size = d.size * (0.6 + Math.random() * 0.9); s.g = d.g;
      s.life = s.max = d.life * (0.7 + Math.random() * 0.6);
      s.m.scale.setScalar(s.size);
      s.m.visible = true;
    }
  }
  const casingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 6);
  const casingMat = new THREE.MeshLambertMaterial({ color: 0xc9a23f });
  const casings = [];
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(casingGeo, casingMat); m.visible = false; group.add(m); casings.push({ m, vel: new THREE.Vector3(), life: 0, bounced: false }); }
  let casingI = 0;
  function casing(pos, quat) {
    const c = casings[casingI++ % casings.length];
    c.m.position.copy(pos).add(v.set(0, 0.01, 0.12).applyQuaternion(quat));
    c.vel.set(1.2 + Math.random() * 0.8, 1.4 + Math.random() * 0.8, 0.2 * (Math.random() - 0.5)).applyQuaternion(quat);
    c.m.quaternion.copy(quat);
    c.life = 1.6; c.bounced = false;
    c.m.visible = true;
  }

  // ── краят на погледа: червен пръстен пред очите (алфа по върховете), тъмен диск, когато играчът е паднал ──
  const ring = (() => {
    const g = new THREE.RingGeometry(0.1, 0.75, 40, 2);
    const n = g.attributes.position.count, col = new Float32Array(n * 4), p = g.attributes.position;
    for (let i = 0; i < n; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = r < 0.12 ? 0 : r < 0.5 ? 0.85 : 1; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xb00a0a, vertexColors: true, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    m.renderOrder = 50; m.frustumCulled = false; m.visible = false;
    return m;
  })();
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0x1a0304, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  veil.renderOrder = 49; veil.frustumCulled = false; veil.visible = false;
  group.add(ring, veil);
  let hurtT = 0, hp = 100, downK = 0, beat = 0;
  function hurt(strength = 1) { hurtT = Math.min(1, hurtT + 0.55 * strength); }
  function vitals(hpNow, isDown) { hp = hpNow; downK = isDown ? 1 : 0; }

  function update(dt, now) {
    for (const f of flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.m.visible = false; }
    if (lightT > 0) { lightT -= dt; if (lightT <= 0) light.intensity = 0; else light.intensity *= 0.6; }
    for (const t of tracers) {
      if (!t.on) continue;
      t.at += TRACER_SPEED * dt;
      if (t.at >= t.len) { t.on = false; t.m.visible = false; continue; }
      place(t);
    }
    for (const s of shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.vel.y -= s.g * dt;
      s.m.position.addScaledVector(s.vel, dt);
      if (s.m.position.y < 0.01) { s.m.position.y = 0.01; s.vel.set(0, 0, 0); s.spin.set(0, 0, 0); }
      s.m.rotation.x += s.spin.x * dt; s.m.rotation.y += s.spin.y * dt; s.m.rotation.z += s.spin.z * dt;
      s.m.scale.setScalar(s.size * Math.min(1, s.life / (s.max * 0.4)));
    }
    for (const c of casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.m.visible = false; continue; }
      c.vel.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += 14 * dt; c.m.rotation.z += 9 * dt;
      if (c.m.position.y < 0.012) { c.m.position.y = 0.012; if (!c.bounced) { c.bounced = true; c.vel.y = -c.vel.y * 0.35; c.vel.x *= 0.5; c.vel.z *= 0.5; } else c.vel.set(0, 0, 0); }
    }
    // пред очите
    hurtT = Math.max(0, hurtT - dt * 1.3);
    let low = 0;
    if (hp < 40 && !downK) { beat += dt * (1.6 + (40 - hp) / 40 * 1.4); low = (0.25 + 0.2 * Math.max(0, Math.sin(beat * Math.PI * 2))) * (1 - hp / 40); }
    const a = Math.min(0.85, hurtT * 0.8 + low + downK * 0.5);
    ring.visible = a > 0.01; veil.visible = downK > 0;
    if (ring.visible || veil.visible) {
      const h = ctx.head;
      ring.position.copy(h.pos).add(v.set(0, 0, -0.3).applyQuaternion(h.quat)); ring.quaternion.copy(h.quat);
      veil.position.copy(h.pos).add(v.set(0, 0, -0.32).applyQuaternion(h.quat)); veil.quaternion.copy(h.quat);
      ring.material.opacity = a; veil.material.opacity = downK * 0.62;
    }
    void q; void now;
  }

  function dispose() {
    root.remove(group);
    for (const g of [flashGeo, tracerGeo, shardGeo, casingGeo, ring.geometry, veil.geometry]) g.dispose();
    for (const m of [flashMat, tracerMat, casingMat, ring.material, veil.material, ...Object.values(shardMats)]) m.dispose();
  }

  return { flash, tracer, burst, casing, hurt, vitals, update, dispose, get lowBeat() { return hp < 40 && !downK ? beat : -1; } };
}

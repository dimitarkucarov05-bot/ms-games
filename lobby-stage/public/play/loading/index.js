// The transition into and out of a game (S7). play.js loads this once at boot and calls it instead of its plain fade:
//
//   const loading = createLoading({ THREE, scene, renderer, camera, view, sfx, haptic, panel, fallback });
//   await loading.into({ title, cover, start, load });   // load(progress) builds the game and swaps the world
//   await loading.out({ swap });                          // swap() disposes the game and shows the waiting room
//
// What the player sees going in:
//   1. the MS Games hub sinks: the night rises from the ground to over the head, with an arena-green glow on its edge;
//   2. in the dark the game's key art comes out of the black, the MS Games mark and the title land in bold type with a real sound and a
//      short pulse in both hands, and one thin green line under it fills as the game loads;
//   3. everything is loaded BEFORE the reveal: shaders are compiled and textures uploaded while it is still dark;
//   4. the title leaves and the night drains back down: the game world stands there, from the sky to the ground.
//
// Rules it keeps: nothing here waits on a drawn frame (all waits are timers, so a page that is not drawing still
// loads); the visuals are one sphere, two planes and two thin bars (no extra passes, no lights, no shadows), all
// driven from the sphere's onBeforeRender by the clock; the art and title are placed once and stay in the world, so the
// headset's reprojection keeps them steady while the loader hitches.
//
// Sound hooks (S8): 'loading.dissolve', 'loading.title', 'loading.reveal', 'loading.out' in
// /play/assets/sfx/lobby/hooks.json. Until a hook is listed there, the title uses the waiting room's own recorded
// whoosh-impact ('countdown.go') and the others stay silent.

const FONT_NUM = '"Sofia Sans XC", "Sofia Sans", "Segoe UI", sans-serif';
const HOOKS_URL = '/play/assets/sfx/lobby/hooks.json';
// MS Games brand (design 0b): arena green, signal yellow, white. Hex values are the sRGB of the oklch tokens.
const BRAND = { white: '#f3f8ef', green: '#3fcf6b', yellow: '#f2e23a', greenHex: 0x3fcf6b };
const FALLBACK_SOUND = { 'loading.title': 'countdown.go' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const smooth = k => k * k * (3 - 2 * k);
const outCubic = k => 1 - (1 - k) ** 3;

export function createLoading(env) {
  const { THREE, scene, renderer, sfx, haptic } = env;
  const view = () => { try { return env.view() || env.camera; } catch { return env.camera; } };

  // ---------- sound: by hook name, with a recorded default ----------
  let listed = null;
  try { fetch(HOOKS_URL, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { listed = j && typeof j === 'object' ? j : {}; }).catch(() => { listed = {}; }); } catch { listed = {}; }
  function sound(hook, opts) {
    try {
      if (listed && listed[hook]) return sfx.play(hook, opts);
      if (FALLBACK_SOUND[hook]) sfx.play(FALLBACK_SOUND[hook], opts);
    } catch { /* no sound is not a reason to stop a game */ }
  }
  const pulse = (strength, ms) => { try { haptic('l', strength, ms); haptic('r', strength, ms); } catch { /* no controllers */ } };

  // ---------- the pieces ----------
  // The night: a sphere around the head. `level` 0 = clear, 1 = everything dark; the dark climbs from below.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: { level: { value: 0 }, glow: { value: 1 } },
      vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float level; uniform float glow; varying float h;
        void main() {
          float e = mix(-1.45, 1.45, level);
          float dark = 1.0 - smoothstep(e - 0.42, e, h);
          float band = exp(-pow((h - (e - 0.05)) / 0.07, 2.0)) * glow * (1.0 - smoothstep(0.86, 1.0, level)) * smoothstep(0.0, 0.1, level);
          gl_FragColor = vec4(vec3(0.03, 0.42, 0.13) * band, max(dark, band * 0.42));      // arena green on the rising edge
        }`,
      side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    }),
  );
  shell.renderOrder = 30; shell.frustumCulled = false; shell.visible = false;

  // The key art: fades into black at its edges, drifts very slowly.
  const artMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, opacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec2 vUv;
      void main() {
        vec2 d = (vUv - 0.5) * vec2(2.0, 2.0);
        float edge = (1.0 - smoothstep(0.55, 1.0, abs(d.x))) * (1.0 - smoothstep(0.5, 1.0, abs(d.y)));
        vec4 c = texture2D(map, vUv);
        gl_FragColor = vec4(c.rgb * 0.8, edge * opacity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6 * 9 / 16), artMat);
  art.renderOrder = 31; art.frustumCulled = false; art.visible = false;

  // The title: bold white letters, thin dark outline, nothing behind them.
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 768;
  const g = canvas.getContext('2d');
  const titleTex = new THREE.CanvasTexture(canvas);
  titleTex.colorSpace = THREE.SRGBColorSpace; titleTex.anisotropy = 4;
  const titleMat = new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const title = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.975), titleMat);
  title.renderOrder = 33; title.frustumCulled = false; title.visible = false;
  let titleSig = '';
  function drawTitle(text) {
    const t = String(text || '').toUpperCase().slice(0, 28);
    if (t === titleSig) return;
    titleSig = t;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    let px = 330;
    const spacing = () => { try { g.letterSpacing = `${Math.round(px * 0.045)}px`; } catch { /* older canvas */ } };
    g.font = `900 ${px}px ${FONT_NUM}`; spacing();
    const w = g.measureText(t).width;
    if (w > canvas.width * 0.92) { px = Math.floor(px * canvas.width * 0.92 / w); g.font = `900 ${px}px ${FONT_NUM}`; spacing(); }
    g.lineWidth = Math.max(4, px * 0.05); g.strokeStyle = 'rgba(0, 0, 0, 0.8)'; g.fillStyle = BRAND.white;
    const y = 256 + 270 + px * 0.04;
    g.strokeText(t, canvas.width / 2, y); g.fillText(t, canvas.width / 2, y);
    // the MS Games mark above the title (brand option C "Stack": white M, green left pillar, yellow right pillar)
    try { g.letterSpacing = '0px'; } catch { /* older canvas */ }
    const k = 150 / 112;
    g.save(); g.translate(canvas.width / 2 - 64 * k, 44); g.scale(k, k);
    g.fillStyle = BRAND.white; g.fill(new Path2D('M4 108 L4 4 L26 4 L64 52 L102 4 L124 4 L124 108 L102 108 L102 46 L64 94 L26 46 L26 108 Z'));
    g.fillStyle = BRAND.green; g.fill(new Path2D('M4 108 L4 4 L26 4 L26 108 Z'));
    g.fillStyle = BRAND.yellow; g.fill(new Path2D('M102 108 L102 4 L124 4 L124 108 Z'));
    g.restore();
    titleTex.needsUpdate = true;
  }

  // Progress: one thin line. The track is barely there; the fill is white.
  const BAR_W = 1.1;
  const barMat = new THREE.MeshBasicMaterial({ color: BRAND.greenHex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const trackMat = barMat.clone(); trackMat.color.setHex(0xffffff);
  const barGeo = new THREE.PlaneGeometry(1, 0.007);
  barGeo.translate(0.5, 0, 0);      // grows from its left end
  const track = new THREE.Mesh(barGeo, trackMat), bar = new THREE.Mesh(barGeo, barMat);
  for (const m of [track, bar]) { m.renderOrder = 34; m.frustumCulled = false; }
  track.scale.x = BAR_W;

  const stage = new THREE.Group();      // art, title and line: placed once in front of the player, then left in the world
  art.position.set(0, 0.25, -0.9);
  title.position.set(0, 0.12, 0);
  track.position.set(-BAR_W / 2, -0.5, 0.001); bar.position.set(-BAR_W / 2, -0.5, 0.002);
  stage.add(art, title, track, bar);
  stage.visible = false;
  let added = false;
  function mount() { if (!added) { scene.add(shell, stage); added = true; } }

  // ---------- clock-driven motion ----------
  const S = { level: 0, art: 0, title: 0, bar: 0, pct: 0, shown: 0, drift: 0, pop: 1 };
  const tweens = new Map();
  function to(key, value, ms, ease = smooth) {
    tweens.set(key, { from: S[key], to: value, t0: performance.now(), ms: Math.max(1, ms), ease });
    return sleep(ms);
  }
  let lastTick = 0;
  function tick() {
    const now = performance.now();
    if (now === lastTick) return;      // second eye of the same frame
    const dt = Math.min(0.1, (now - (lastTick || now)) / 1000);
    lastTick = now;
    for (const [key, w] of tweens) {
      const k = Math.min(1, (now - w.t0) / w.ms);
      S[key] = w.from + (w.to - w.from) * w.ease(k);
      if (k >= 1) tweens.delete(key);
    }
    S.shown += (S.pct - S.shown) * Math.min(1, dt * 5);
    S.drift += dt;
    shell.material.uniforms.level.value = S.level;
    view().getWorldPosition(shell.position);
    artMat.uniforms.opacity.value = S.art;
    art.visible = S.art > 0.004 && !!artMat.uniforms.map.value;
    art.scale.setScalar(1 + 0.05 * Math.min(1, S.drift / 14));
    titleMat.opacity = S.title;
    title.visible = S.title > 0.004;
    title.scale.setScalar(S.pop);
    trackMat.opacity = S.bar * 0.16; barMat.opacity = S.bar * 0.92;
    track.visible = bar.visible = S.bar > 0.004;
    bar.scale.x = Math.max(0.0001, BAR_W * S.shown);
    if (S.level <= 0.001 && !tweens.size && S.title <= 0.004 && S.art <= 0.004 && !busy) { shell.visible = false; stage.visible = false; }
  }
  shell.onBeforeRender = tick;
  let busy = false;

  const _p = new THREE.Vector3(), _d = new THREE.Vector3();
  function place() {
    const cam = view();
    cam.getWorldPosition(_p); cam.getWorldDirection(_d); _d.y = 0;
    if (_d.lengthSq() < 1e-4) _d.set(0, 0, -1);
    _d.normalize();
    stage.position.copy(_p).addScaledVector(_d, 2.7);
    stage.position.y = _p.y - 0.02;
    stage.lookAt(_p.x, stage.position.y, _p.z);
  }

  // ---------- art ----------
  const artCache = new Map();
  function loadArt(url) {
    if (!url) return Promise.resolve(null);
    if (!artCache.has(url)) {
      artCache.set(url, new Promise(res => {
        try { new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => { artCache.delete(url); res(null); }); } catch { res(null); }
      }));
    }
    return artCache.get(url);
  }

  // ---------- everything on the GPU before the reveal ----------
  async function warm() {
    const cam = env.camera;
    // shaders: compiled in the background where the browser can, with a limit so a slow driver never holds the game
    try { if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, cam), sleep(5000)]); else renderer.compile(scene, cam); } catch { /* the first frame compiles what is left */ }
    // textures: uploaded a few at a time, so no single step is long
    try {
      const seen = new Set();
      let n = 0;
      const stack = [scene];
      while (stack.length) {
        const o = stack.pop();
        if (!o.visible) continue;
        for (const c of o.children) stack.push(c);
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          for (const key of ['map', 'emissiveMap', 'normalMap', 'alphaMap']) {
            const t = m && m[key];
            if (!t || !t.isTexture || seen.has(t) || !t.image) continue;
            seen.add(t);
            try { renderer.initTexture(t); } catch { /* uploaded on first use */ }
            if (++n % 3 === 0) await sleep(0);
          }
        }
      }
    } catch { /* uploaded on first use */ }
  }

  function reset() {
    tweens.clear();
    S.level = S.art = S.title = S.bar = S.pct = S.shown = 0; S.pop = 1;
    shell.visible = false; stage.visible = false;
    tick();
  }

  // ---------- the hook ----------
  async function into({ title: name, cover, load }) {
    mount();
    busy = true;
    const artReady = loadArt(cover);
    try { await Promise.race([document.fonts.load(`900 100px ${FONT_NUM}`), sleep(800)]); } catch { /* the fallback face */ }
    drawTitle(name);
    S.pct = S.shown = 0; S.drift = 0; S.pop = 1.07;
    shell.visible = true;

    // 1. the waiting room sinks into the night
    sound('loading.dissolve');
    await to('level', 1, 850);

    // 2. the branded moment
    place();
    stage.visible = true;
    const tex = await Promise.race([artReady, sleep(400).then(() => null)]);
    if (tex) { artMat.uniforms.map.value = tex; to('art', 1, 1400); } else artReady.then(t => { if (t && busy) { artMat.uniforms.map.value = t; to('art', 1, 1400); } });
    await sleep(140);
    sound('loading.title', { gain: 0.9 });
    pulse(0.55, 90);
    to('pop', 1, 620, outCubic);
    to('bar', 1, 900);
    await to('title', 1, 420, outCubic);
    const shownAt = performance.now();

    // 3. the game loads in the dark
    let result;
    try {
      result = await load(async (pct) => { S.pct = Math.max(S.pct, Math.min(1, Number(pct) || 0)); await sleep(30); });
      S.pct = 1;
      await warm();
    } catch (e) {
      busy = false;
      to('title', 0, 250); to('art', 0, 250); to('bar', 0, 200);
      await to('level', 0, 450);
      reset();
      throw e;
    }
    const held = performance.now() - shownAt;
    if (held < 1500) await sleep(1500 - held);      // a cached game still gets its moment: never a flicker

    // 4. the reveal
    to('bar', 0, 300);
    to('art', 0, 550);
    await to('title', 0, 420);
    sound('loading.reveal');
    pulse(0.25, 50);
    busy = false;
    to('level', 0, 2000).then(() => { if (!busy && !tweens.size) reset(); });      // not awaited: the game starts while the night drains
    return result;
  }

  async function out({ swap }) {
    mount();
    busy = true;
    shell.visible = true;
    S.title = S.art = S.bar = 0;
    sound('loading.out');
    await to('level', 1, 480);
    try { await swap(); } finally {
      busy = false;
      to('level', 0, 1300).then(() => { if (!busy && !tweens.size) reset(); });
    }
  }

  return { into, out, get state() { return { ...S, busy }; } };
}

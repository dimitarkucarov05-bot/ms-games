// What does this headset's browser really give a web game? Run it on every model (Pico, Quest, Vive Focus) and read data/probes.jsonl
// (or GET /api/probes) on the arena PC. Nothing here changes anything: it only looks.
const $ = id => document.getElementById(id);
const R = { at: new Date().toISOString(), page: location.href, ua: navigator.userAgent, platform: navigator.platform, secure: isSecureContext, cores: navigator.hardwareConcurrency || null, memGB: navigator.deviceMemory ?? null, screen: [screen.width, screen.height, devicePixelRatio], notes: [] };
const log = t => { $('log').textContent += `\n${t}`; $('log').scrollTop = 1e9; };
const note = t => { R.notes.push(t); log(t); };
const r2 = v => Math.round(v * 100) / 100;

function gpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    R.gl = { version: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), xrCompatible: typeof gl.makeXRCompatible === 'function' };
  } catch (e) { R.gl = { error: String(e) }; }
}

async function check() {
  $('log').textContent = 'Проверявам…';
  gpu();
  R.xr = { present: !!navigator.xr };
  if (navigator.xr) {
    for (const mode of ['immersive-vr', 'immersive-ar', 'inline']) { try { R.xr[mode] = await navigator.xr.isSessionSupported(mode); } catch (e) { R.xr[mode] = `error: ${e.message}`; } }
  }
  R.api = { XRWebGLBinding: typeof XRWebGLBinding !== 'undefined', XRHand: typeof XRHand !== 'undefined', XRAnchor: typeof XRAnchor !== 'undefined', XRPlane: typeof XRPlane !== 'undefined', XRMesh: typeof XRMesh !== 'undefined', XRDepthInformation: typeof XRDepthInformation !== 'undefined' };
  note(`Браузър: ${R.ua}`);
  note(`Защитена връзка (HTTPS): ${R.secure ? 'да' : 'НЕ — WebXR няма да тръгне'}`);
  note(`WebGL: ${R.gl?.renderer || R.gl?.error} (${R.gl?.version || ''})`);
  note(`WebXR: ${navigator.xr ? `immersive-vr ${R.xr['immersive-vr']}, immersive-ar ${R.xr['immersive-ar']}` : 'няма navigator.xr'}`);
  note(`Възможности в страницата: ${Object.entries(R.api).map(([k, v]) => `${k} ${v ? 'да' : 'не'}`).join(', ')}`);
  $('enter').disabled = !navigator.xr || R.xr['immersive-vr'] !== true;
  await send();
}

async function enter() {
  R.session = { poses: [], frames: 0 };
  const optional = ['bounded-floor', 'hand-tracking', 'anchors', 'plane-detection', 'mesh-detection', 'layers', 'dom-overlay', 'depth-sensing', 'unbounded', 'secondary-views', 'high-fixed-foveation-level'];
  let session;
  try { session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: optional, domOverlay: undefined }); }
  catch (e) { try { session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: optional.filter(f => f !== 'dom-overlay') }); R.session.fallback = 'without local-floor'; } catch (e2) { note(`Не стартира сесия: ${e2.message}`); await send(); return; } }
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { xrCompatible: true }) || canvas.getContext('webgl', { xrCompatible: true });
  await gl.makeXRCompatible?.();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
  R.session.enabledFeatures = session.enabledFeatures ? [...session.enabledFeatures] : null;
  R.session.blend = session.environmentBlendMode; R.session.visibility = session.visibilityState;
  R.session.frameRate = session.frameRate ?? null; R.session.supportedFrameRates = session.supportedFrameRates ? [...session.supportedFrameRates] : null;
  let local = null; try { local = await session.requestReferenceSpace('local-floor'); } catch { local = await session.requestReferenceSpace('local'); R.session.space = 'local (no floor)'; }
  R.session.space ||= 'local-floor';
  try {
    const bounded = await session.requestReferenceSpace('bounded-floor');
    const g = bounded.boundsGeometry || [];
    if (g.length) { const xs = g.map(p => p.x), zs = g.map(p => p.z); R.session.bounds = { points: g.length, width: r2(Math.max(...xs) - Math.min(...xs)), depth: r2(Math.max(...zs) - Math.min(...zs)) }; }
    else R.session.bounds = { points: 0 };
  } catch (e) { R.session.bounds = `no bounded-floor: ${e.message}`; }
  let unb = null; try { unb = await session.requestReferenceSpace('unbounded'); } catch { /* not given */ }
  const t0 = performance.now(); let last = t0, sec = 0, anchorTried = false, fpsN = 0, fpsT = t0;
  $('enter').disabled = true;
  session.requestAnimationFrame(function frame(t, xrFrame) {
    const s = xrFrame.session; R.session.frames++;
    const g = s.renderState.baseLayer; gl.bindFramebuffer(gl.FRAMEBUFFER, g.framebuffer);
    const k = (Math.sin((t - t0) / 500) + 1) / 2; gl.clearColor(0.3 + 0.3 * k, 0.05, 0.4 + 0.2 * k, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    fpsN++;
    const pose = xrFrame.getViewerPose(local);
    if (pose && t - last > 1000) {
      last = t; sec++;
      const p = pose.transform.position, q = pose.transform.orientation;
      const rec = { s: sec, pos: [r2(p.x), r2(p.y), r2(p.z)], quat: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)], fps: Math.round(fpsN * 1000 / (t - fpsT)), views: pose.views.length };
      fpsN = 0; fpsT = t;
      if (unb) { const u = xrFrame.getViewerPose(unb); if (u) rec.unbounded = [r2(u.transform.position.x), r2(u.transform.position.y), r2(u.transform.position.z)]; }
      R.session.poses.push(rec);
      if (sec === 1) {
        R.session.inputs = [...s.inputSources].map(i => ({ hand: i.handedness, ray: i.targetRayMode, profiles: [...(i.profiles || [])], mapping: i.gamepad?.mapping || null, buttons: i.gamepad?.buttons?.length ?? null, axes: i.gamepad?.axes?.length ?? null, hasHand: !!i.hand }));
        note(`Първа поза: x ${rec.pos[0]}, y ${rec.pos[1]}, z ${rec.pos[2]} (пространство: ${R.session.space})`);
        note(`Контролери: ${R.session.inputs.map(i => `${i.hand}/${i.mapping || 'без mapping'}/${i.buttons} бутона`).join('; ') || 'няма'}`);
        note(`Разрешени възможности: ${R.session.enabledFeatures ? R.session.enabledFeatures.join(', ') : 'браузърът не казва'}`);
        note(`Граница: ${typeof R.session.bounds === 'string' ? R.session.bounds : JSON.stringify(R.session.bounds)}`);
      } else log(`${sec} с: x ${rec.pos[0]} y ${rec.pos[1]} z ${rec.pos[2]}  ${rec.fps} кадъра/с`);
    }
    if (!anchorTried && sec >= 2 && xrFrame.createAnchor) {
      anchorTried = true;
      xrFrame.createAnchor(new XRRigidTransform({ x: 0, y: 0, z: -1 }), local).then(() => { R.session.anchor = 'създаден'; note('Котва (anchor): създаде се'); }, e => { R.session.anchor = `отказ: ${e.message}`; note(`Котва (anchor): ${e.message}`); });
    }
    if (sec >= 10) { R.session.anchor ||= xrFrame.createAnchor ? 'не се разбра' : 'няма създаване на котви'; s.end(); return; }
    s.requestAnimationFrame(frame);
  });
  session.addEventListener('end', async () => { $('enter').disabled = false; note('Сесията приключи. Пращам резултата…'); await send(); });
}

async function send() {
  R.sentAt = new Date().toISOString();
  try {
    const r = await fetch('/api/probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(R) });
    log(r.ok ? 'Резултатът е пратен към компютъра.' : `Компютърът отказа резултата (HTTP ${r.status}).`);
  } catch (e) { log(`Резултатът не се прати: ${e.message}. Препиши редовете горе на ръка.`); }
}
$('check').onclick = check; $('enter').onclick = enter; $('send').onclick = send;

// Setup wizard, server side (design section 3): the USB headset list and install, the preset play area placed from
// the two floor marks, and the two-point calibration with per-headset progress and the A–B distance check.
//
// Arena coordinates (same as zone.js): metres, the play rectangle centred on (0, 0), X along its width w, Z along its depth d.
//
// Preset rectangle from the marks. In the "mark frame" A is (0, 0) and B is (0, L) (L = measured A–B distance, "towards
// the back"); +u is to the right of the line A→B. With rotation 0 the rectangle is u ∈ [0, w], v ∈ [0, d]: A is its
// front-left corner and B lies on its left edge. Rotation 90/180/270 turns the rectangle clockwise about A.
// The entrance is a point on the front edge (left / middle / right), shown on the console and in the waiting room.

export const PRESET_SIZES = ['4x4', '5x5', '6x6', '6x8', '8x8', '8x10', '10x10'];
export const MIN_MARK_GAP = 2.0;     // the marks must be at least 2 m apart
export const AB_TOLERANCE = 0.05;    // over 5 cm difference from the first headset → amber "Redo"

const r3 = v => Math.round(v * 1000) / 1000;
const rot = (a, x, z) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
const pair = p => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x), Number(p?.z)]);

export function cleanPreset({ w, d, rotation = 0, entrance = 'middle' } = {}) {
  const W = Number(w), Dp = Number(d);
  if (!PRESET_SIZES.includes(`${W}x${Dp}`) && !PRESET_SIZES.includes(`${Dp}x${W}`)) throw new Error(`Size is one of ${PRESET_SIZES.join(', ')} (metres)`);
  const R = ((Math.round(Number(rotation) / 90) * 90) % 360 + 360) % 360;
  if (![0, 90, 180, 270].includes(R) || !Number.isFinite(Number(rotation))) throw new Error('Rotation is 0, 90, 180 or 270');
  const e = ['left', 'middle', 'right'].includes(entrance) ? entrance : 'middle';
  return { kind: 'preset', w: W, d: Dp, rotation: R, entrance: e };
}

/** The zone (arena coordinates) for a preset rectangle and the measured A–B distance L. */
export function presetZone(spec, L) {
  const { w, d, rotation, entrance } = cleanPreset(spec);
  const a = -rotation * Math.PI / 180;                       // clockwise seen from above (u right, v back)
  const corners = [[0, 0], [w, 0], [w, d], [0, d]].map(([u, v]) => rot(a, u, v));
  const cu = corners.reduce((s, p) => s + p[0], 0) / 4, cv = corners.reduce((s, p) => s + p[1], 0) / 4;
  const xAxis = rot(a, 1, 0);
  const ang = Math.atan2(xAxis[1], xAxis[0]);
  // mark frame → arena: subtract the centre, turn so the rectangle's width runs along X
  const toArena = ([u, v]) => rot(-ang, u - cu, v - cv).map(r3);
  const poly = corners.map(toArena);
  const markers = [toArena([0, 0]), toArena([0, L])];
  const ex = entrance === 'left' ? w * 0.2 : entrance === 'right' ? w * 0.8 : w / 2;
  return {
    poly, obstacles: [], blocked: [], hall: { w, d }, rooms: [{ id: 'a', x: 0, z: 0, w, d }], doors: [], markers, ownMarkers: true,
    area: w * d, preset: { w, d, rotation, entrance }, entrancePoint: toArena(rot(a, ex, 0)),
  };
}

export const abDistance = touched => { const [a, b] = touched.map(pair); return Math.hypot(b[0] - a[0], b[1] - a[1]); };

/**
 * Progress of the two-point calibration, per headset: 'waiting' (asked, page not there yet) → 'p1' (touch mark A)
 * → 'p2' (A done, touch mark B) → 'done' | 'failed'. check[id] = { abDelta (m), ok }.
 */
export function createSetupTracker(saved = {}) {
  const st = {
    step: saved.step || null, entry: saved.entry || null, area: saved.area || null,
    ref: saved.ref || null, refAB: Number.isFinite(saved.refAB) ? saved.refAB : null,
    points: {}, check: {}, touched: {}, errors: {},
  };
  return {
    st,
    view: () => ({ step: st.step, entry: st.entry, area: st.area, ref: st.ref, refAB: st.refAB != null ? r3(st.refAB) : null, points: { ...st.points }, check: { ...st.check }, errors: { ...st.errors } }),
    saved: () => ({ step: st.step, entry: st.entry, area: st.area, ref: st.ref, refAB: st.refAB }),
    ask(id, online) { st.points[id] = online ? 'p1' : 'waiting'; st.touched[id] = []; delete st.errors[id]; delete st.check[id]; },
    pending: id => ['waiting', 'p1', 'p2'].includes(st.points[id]),
    /** A touched point. Returns { done, points } when both are in. */
    touch(id, index, x, z) {
      if (!this.pending(id)) return { done: false, ignored: true };
      const t = st.touched[id] ||= [];
      const i = index === 1 || (index == null && t.length === 1) ? 1 : 0;
      t[i] = [Number(x), Number(z)];
      if (i === 0) { st.points[id] = 'p2'; t.length = 1; return { done: false }; }
      if (!t[0]) { st.points[id] = 'p1'; return { done: false }; }
      return { done: true, points: [t[0], t[1]] };
    },
    /** Marks the result of a headset's two points; for the first headset this sets the reference distance. */
    finish(id, points, { isRef = false } = {}) {
      const ab = abDistance(points);
      if (ab < MIN_MARK_GAP - 0.1) { st.points[id] = 'failed'; st.errors[id] = `The marks are ${ab.toFixed(2)} m apart: they must be at least ${MIN_MARK_GAP} m`; return { ok: false, ab }; }
      if (isRef || st.refAB == null) { st.ref = id; st.refAB = ab; }
      const delta = Math.abs(ab - st.refAB);
      st.check[id] = { abDelta: r3(delta), ab: r3(ab), ok: delta <= AB_TOLERANCE };
      st.points[id] = 'done';
      return { ok: true, ab, delta };
    },
    fail(id, why) { st.points[id] = 'failed'; st.errors[id] = String(why || 'failed'); },
    done(id) { st.points[id] = 'done'; },
    reset() { st.points = {}; st.check = {}; st.touched = {}; st.errors = {}; st.ref = null; st.refAB = null; },
  };
}

// ---------- USB headsets (adb) ----------

export const MODELS = { hollywood: 'Quest 2', eureka: 'Quest 3', panther: 'Quest 3S', seacliff: 'Quest Pro', monterey: 'Quest' };

/** `adb devices -l` → [{ serial, state, model, product }]. Wireless serials (ip:port) are left out: install is by cable. */
export function parseAdbDevices(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/).slice(1)) {
    const m = /^(\S+)\s+(device|unauthorized|offline|no permissions|recovery|sideload|authorizing)\b(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, serial, state, rest] = m;
    if (serial.includes(':') || serial.startsWith('emulator-')) continue;
    const kv = Object.fromEntries([...rest.matchAll(/(\w+):(\S+)/g)].map(x => [x[1], x[2]]));
    out.push({ serial, state, product: kv.product || null, model: MODELS[kv.product] || (kv.model ? kv.model.replace(/_/g, ' ') : null) });
  }
  return out;
}

/** The console's state word for a USB row. */
export function usbState(dev, job) {
  if (job?.state === 'installing') return { state: 'installing', text: job.text || 'Installing' };
  if (job?.state === 'done') return { state: 'done', text: 'Done' };
  if (job?.state === 'failed') return { state: 'failed', text: 'Failed', error: job.error };
  if (dev.state === 'unauthorized' || dev.state === 'authorizing') return { state: 'allow', text: 'Allow USB debugging in the headset' };
  if (dev.state === 'offline' || dev.state === 'no permissions') return { state: 'plug', text: 'Unplug and plug the cable in again' };
  return { state: 'ready', text: 'Ready to install' };
}

export const HEADSET_PACKAGE = 'bg.arena.play';

/**
 * Installs the headset app and writes its identity. run(args) → Promise<{ ok, out, err }> runs adb with `-s serial` already
 * applied by the caller. onStep(text) reports progress. Throws with a one-line reason on failure.
 *   1. install the APK (pm can exit 0 on failure, so the output is read)  2. identity file /sdcard/msgames/id.json
 *   3. overlay permission (keep the game in front)  4. Wi-Fi adb on 5555  5. start the app
 */
export async function installHeadset({ run, apk, identity, pushFile, onStep = () => {} }) {
  const must = async (args, what, okTest = r => r.ok) => {
    const r = await run(args);
    if (!okTest(r)) throw new Error(`${what}: ${(r.err || r.out || 'failed').split(/\r?\n/).filter(Boolean).pop()?.slice(0, 120) || 'failed'}`);
    return r;
  };
  if (apk) {
    onStep('Installing the headset app');
    await must(['install', '-r', '-g', apk], 'Install failed', r => /Success/i.test(r.out + r.err) && !/Failure/i.test(r.out + r.err));
  }
  onStep('Writing the identity');
  await must(['shell', 'mkdir', '-p', '/sdcard/msgames'], 'Storage');
  await pushFile('/sdcard/msgames/id.json', JSON.stringify(identity));
  onStep('Allowing the app to stay in front');
  await run(['shell', 'appops', 'set', HEADSET_PACKAGE, 'SYSTEM_ALERT_WINDOW', 'allow']);
  onStep('Turning on Wi-Fi control');
  await run(['tcpip', '5555']);
  onStep('Starting the app');
  await new Promise(r => setTimeout(r, 1500));      // adb restarts in TCP mode; the USB link comes back by itself
  await run(['shell', 'monkey', '-p', HEADSET_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1']);
  return true;
}

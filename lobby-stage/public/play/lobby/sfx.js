// Real recorded sounds of the waiting room, the vote, the countdown and the operator's messages, played by HOOK name.
// Every default file in ./sfx/ is a cut of a downloaded library recording (./sfx/SOURCES.txt); nothing is synthesized.
//
// Sound hooks (S8 fills them): put files under /play/assets/sfx/lobby/ and list them in /play/assets/sfx/lobby/hooks.json,
//   { "vote.pick": "vote-pick.ogg", "countdown.tick": ["tick-a.ogg", "tick-b.ogg"], "ambience.fire": "fire-loop.ogg" }
// (a list = a random pick each time). A hook missing from hooks.json keeps the default below.
//
//   const sfx = createSfx();  sfx.wake() on input;  sfx.play('countdown.tick', { gain, rate });  sfx.volume(0..1)
//   const fire = sfx.loop('ambience.fire', { gain, at: () => worldPosition });  fire.stop();  sfx.listener(camera)

export const HOOKS = {
  'vote.hover': 'hover',        // the laser moves onto a vote object
  'vote.pick': 'vote',          // the trigger casts the vote
  'vote.win': 'go',             // the vote ended: this one won
  'vote.last': 'hover',         // the last three seconds of the vote, once a second
  'countdown.tick': 'tick',     // 3, 2, 1
  'countdown.go': 'go',         // GO
  'results.show': 'results',    // the score appears
  'message.in': 'bell',         // an operator message
  'endmessage.in': 'bell',      // the end message (take off the headset, thank you ...)
  'pause.toggle': 'click',      // paused / resumed
  'ui.click': 'click',          // small confirmations (hands swapped, height set)
  'setup.point': 'tick',        // a calibration mark touched
  'setup.done': 'go',           // calibration finished
  'identify': 'bell',           // the operator looks for this headset
  'range.shot': 'shot',         // the waiting room's shooting range: a pistol shot
  'range.hit': 'hit',           // a target hit (metal)
  'range.best': 'go',           // a new best score on the range
  'portal.open': 'portal',      // a game portal opens for the countdown (a starship hatch)
  'ambience.hub': 'hum',        // loop: the station's low hum in the hub
  'ambience.fire': 'fire',      // loop: the fire barrel / fire pit, placed in the world
  'ambience.night': 'night',    // loop: crickets and a quiet forest, everywhere
  'ambience.wind': 'wind',      // loop: wind in the trees, far
};
const OVERRIDE = '/play/assets/sfx/lobby/';

export function createSfx(base = new URL('./sfx/', import.meta.url).href) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, master = null;
  const buf = new Map(), loading = new Map();
  let map = Object.fromEntries(Object.entries(HOOKS).map(([k, v]) => [k, [`${base}${v}.ogg`]]));
  try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination); } catch { ac = null; }

  function load(url) {
    if (!ac) return Promise.resolve(null);
    if (!loading.has(url)) {
      loading.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then(a => ac.decodeAudioData(a)).then(b => { buf.set(url, b); return b; })
        .catch(e => { console.warn('[sfx]', url, e.message || e); return null; }));
    }
    return loading.get(url);
  }
  const urlsOf = hook => map[hook] || map[Object.keys(HOOKS).find(k => HOOKS[k] === hook)] || [`${base}${hook}.ogg`];
  const pick = hook => { const l = urlsOf(hook); return l[Math.floor(Math.random() * l.length)]; };
  const preload = () => { for (const k of Object.keys(map)) for (const u of map[k]) load(u); };
  // S8's hooks.json, when there is one, replaces the defaults hook by hook
  fetch(`${OVERRIDE}hooks.json`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => {
    if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) { const l = (Array.isArray(v) ? v : [v]).filter(x => typeof x === 'string' && x); if (l.length) map[k] = l.map(f => (/^\/|^https?:/.test(f) ? f : OVERRIDE + f)); }
  }).catch(() => {}).finally(preload);

  const _p = { x: 0, y: 0, z: 0 };
  return {
    hooks: HOOKS,
    wake() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); },
    volume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },
    /** One shot by hook name. */
    play(hook, { gain = 1, rate = 1 } = {}) {
      if (!ac) return;
      if (ac.state !== 'running') ac.resume().catch(() => {});
      const url = pick(hook), b = buf.get(url);
      if (!b) { load(url); return; }
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = b; src.playbackRate.value = rate; g.gain.value = gain;
      src.connect(g); g.connect(master);
      src.start();
    },
    /**
     * A looping bed. at(): world position {x, y, z} for a sound that sits somewhere (fire), or null for one that is
     * everywhere (night, wind). fadeMs: fade in and out. Returns { stop(), gain(v) }.
     */
    loop(hook, { gain = 1, at = null, fadeMs = 1500, ref = 1.5, roll = 1.4 } = {}) {
      if (!ac) return { stop() {}, gain() {}, update() {} };
      const g = ac.createGain(); g.gain.value = 0;
      let pan = null, src = null, dead = false;
      if (at) { pan = ac.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = roll; pan.maxDistance = 60; g.connect(pan); pan.connect(master); } else g.connect(master);
      load(pick(hook)).then(b => {
        if (!b || dead) return;
        src = ac.createBufferSource(); src.buffer = b; src.loop = true;
        src.connect(g); src.start(0, Math.random() * Math.max(0, b.duration - 0.1));
        g.gain.setTargetAtTime(gain, ac.currentTime, fadeMs / 3000);
      });
      return {
        update() { if (pan && at) { const p = at(_p); if (p) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } } },
        gain(v) { g.gain.setTargetAtTime(v, ac.currentTime, 0.3); },
        stop() { dead = true; g.gain.setTargetAtTime(0, ac.currentTime, fadeMs / 3000); setTimeout(() => { try { src?.stop(); } catch { /* already */ } g.disconnect(); pan?.disconnect(); }, fadeMs + 200); },
      };
    },
    /** Where the ears are (call every frame with the headset camera) so placed loops sound from their place. */
    listener(cam) {
      if (!ac || !cam) return;
      const L = ac.listener, e = cam.matrixWorld.elements;
      const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
      if (L.positionX) { L.positionX.value = e[12]; L.positionY.value = e[13]; L.positionZ.value = e[14]; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz; }
      else { L.setPosition(e[12], e[13], e[14]); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    },
    get ready() { return Object.values(HOOKS).every(n => buf.has(`${base}${n}.ogg`)); },
  };
}

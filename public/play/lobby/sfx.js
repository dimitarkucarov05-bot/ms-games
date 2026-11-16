// Real recorded sounds for the waiting room, the vote, the countdown and the operator messages.
// Every file in ./sfx/ is a cut of a downloaded library recording (see ./sfx/SOURCES.txt); nothing is synthesized.
//
//   const sfx = createSfx();   sfx.wake() on any user input;   sfx.play('tick', { gain: 0.8 });   sfx.volume(0..1)

const NAMES = ['vote', 'hover', 'tick', 'go', 'bell', 'results', 'click'];

export function createSfx(base = new URL('./sfx/', import.meta.url).href) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, master = null;
  const buf = new Map(), loading = new Map();
  try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination); } catch { ac = null; }

  function load(name) {
    if (!ac) return Promise.resolve(null);
    if (!loading.has(name)) {
      loading.set(name, fetch(`${base}${name}.ogg`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then(a => ac.decodeAudioData(a)).then(b => { buf.set(name, b); return b; })
        .catch(e => { console.warn('[sfx]', name, e.message || e); return null; }));
    }
    return loading.get(name);
  }
  for (const n of NAMES) load(n);

  return {
    wake() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); },
    volume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },
    /** Plays a cut once. gain 0..1.5, rate for small pitch changes (the hover tick varies a little so it never sounds like a loop). */
    play(name, { gain = 1, rate = 1 } = {}) {
      if (!ac) return;
      if (ac.state !== 'running') ac.resume().catch(() => {});
      const b = buf.get(name);
      if (!b) { load(name); return; }
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = b; src.playbackRate.value = rate; g.gain.value = gain;
      src.connect(g); g.connect(master);
      src.start();
    },
    get ready() { return NAMES.every(n => buf.has(n)); },
  };
}

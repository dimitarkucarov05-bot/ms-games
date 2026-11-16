// Звукът на „Мъртвият мотел", подреден по именувани събития (списъкът е в sfx-events.json до този файл).
//
// Всяко събитие първо търси истински записи от /play/assets/sfx/motel/map.json (банката, която прави S8):
//   { "events": { "shot.pistol": { "files": ["guns/pistol_01.ogg", ...], "gain": 1, "pitch": [0.96, 1.04],
//                                  "cooldown": 0, "loop": false, "kids": ["..."] }, ... } }
// Пътищата на файловете са спрямо map.json. Ако събитието няма записи, звучи досегашният синтез (временно, докато
// дойдат файловете); музиката и фонът са само от записи и без тях мълчат.
//
// Браузърът пуска звук едва след действие на играча: wake() се вика при всяко натискане.

export function createAudio(ctx, opts = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, master = null, noiseBuf = null, comp = null;
  let voices = 0;
  const MAX_VOICES = 14;
  try {
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }

  function wake() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); for (const el of pending) el.play().then(() => pending.delete(el)).catch(() => {}); }
  let held = false, soft = 1;      // held: пауза (нищо ново не звучи); soft: детски режим (по-тихи писъци и удари)
  const ok = () => ac && !held && ac.state === 'running' && voices < MAX_VOICES;
  /** Пауза: звукът заглъхва за половин секунда и нищо ново не започва, докато играта стои. */
  function pause(on) {
    held = !!on;
    if (!ac || !master) return;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(on ? 0.0001 : 0.85, t + (on ? 0.5 : 0.8));
  }

  /** Изход с посока: x, z в залата (null: в главата на играча). */
  function out(x, z, gain = 1) {
    const g = ac.createGain();
    g.gain.value = gain;
    if (x == null) { g.connect(master); return g; }
    const p = ac.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.maxDistance = 60; p.rolloffFactor = 1.1;
    p.positionX.value = x; p.positionY.value = 1.2; p.positionZ.value = z;
    g.connect(p); p.connect(master);
    return g;
  }
  // ── банката със записи (S8: /play/assets/sfx/motel/map.json) ──
  // Паметта на Quest 2 е малка: при зареждане се декодират само звуците на боя ('core'). Гласът, акцентите, точките, хеликоптерът
  // се декодират при първа нужда (или по prefetch) и се освобождават 40 с след последната употреба ('lazy'). Музиката и фонът
  // ('bed') не се декодират изобщо: текат през <audio> елемент.
  const BANK = String(opts.bank || '/play/assets/sfx/motel/map.json');
  const bank = new Map();      // име → { files, kids, gain, pitch, cooldown, cls, bufs, kidsBufs, state, last, wantAt, used }
  let bankState = 'none', base = null;
  const LAZY = /^(voice\.|stinger\.|riser\.|score\.|award\.|end\.|world\.heli\.|radio\.|boss\.siren|wave\.(start|clear))/;
  const BED = /^(music\.|ambience\.)/;
  const decodeFile = async file => { try { const b = await fetch(new URL(file, base)).then(q => (q.ok ? q.arrayBuffer() : null)); return b && ac ? await ac.decodeAudioData(b) : null; } catch { return null; } };
  /** Декодира записите на събитието (веднъж); връща обещание. */
  function ensure(e) {
    if (e.state === 'ready') return Promise.resolve(e);
    if (!e.loading) {
      e.state = 'loading';
      e.loading = Promise.all([Promise.all(e.files.map(decodeFile)), Promise.all(e.kids.map(decodeFile))]).then(([a, k]) => { e.bufs = a.filter(Boolean); e.kidsBufs = k.filter(Boolean); e.state = 'ready'; e.loading = null; return e; });
    }
    return e.loading;
  }
  async function loadBank() {
    if (!ac) return;
    bankState = 'loading';
    try {
      const r = await fetch(BANK);
      if (!r.ok) { bankState = 'missing'; return; }
      const map = await r.json();
      base = new URL(BANK, location.href);
      for (const [name, e] of Object.entries(map.events || {})) {
        const files = Array.isArray(e?.files) ? e.files : [];
        if (!files.length) continue;
        bank.set(name, { name, files, kids: Array.isArray(e.kids) ? e.kids : [], gain: Number.isFinite(e.gain) ? e.gain : 1, pitch: Array.isArray(e.pitch) ? e.pitch : [0.97, 1.03], cooldown: +e.cooldown || 0,
          cls: BED.test(name) ? 'bed' : LAZY.test(name) ? 'lazy' : 'core', bufs: [], kidsBufs: [], state: 'idle', last: -9, wantAt: -9, used: 0, text: e.text || '' });
      }
      bankState = bank.size + ' events';
      if (wantMusic) music(wantMusic, true);
      if (wantAmb) ambience(wantAmb);
      // звуците на боя: по четири наведнъж, за да не задавят мрежата и процесора на каската
      const core = [...bank.values()].filter(e => e.cls === 'core');
      for (let i = 0; i < core.length; i += 4) await Promise.all(core.slice(i, i + 4).map(ensure));
      bankState = bank.size + ' events, core ready';
    } catch { bankState = 'error'; }
  }
  /** Освобождава редките записи, които не са свирили отдавна. */
  function release() {
    if (!ac) return;
    const t = ac.currentTime;
    for (const e of bank.values()) if (e.cls === 'lazy' && e.state === 'ready' && t - e.used > 40) { e.bufs = []; e.kidsBufs = []; e.state = 'idle'; }
  }
  function start(e, x, z, gain, rate) {
    const list = soft < 1 && e.kidsBufs.length ? e.kidsBufs : e.bufs;
    if (!list.length) return null;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = (e.pitch[0] + Math.random() * Math.max(0, e.pitch[1] - e.pitch[0])) * rate;
    src.connect(out(x, z, e.gain * gain));
    src.start(t);
    e.last = t; e.used = t;
    voices++; src.onended = () => { voices--; };
    return src;
  }
  /**
   * Пуска запис за събитието; true, ако събитието е в банката (тогава синтезът мълчи). x, z: откъде (null: в главата).
   * Рядко събитие, което още не е декодирано, звучи, ако декодирането свърши до 0.4 с; иначе този път се пропуска.
   */
  function sample(name, x = null, z = null, gain = 1, rate = 1) {
    if (!ac || held) return false;
    const e = bank.get(name);
    if (!e || e.cls === 'bed') return false;
    if (soft < 1 && name === 'impact.gore') return true;
    if (ac.state !== 'running' || voices >= MAX_VOICES + 8) return true;
    const t = ac.currentTime;
    if (t - e.last < e.cooldown) return true;
    if (e.state === 'ready') { start(e, x, z, gain, rate); return true; }
    e.wantAt = t; e.last = t;
    ensure(e).then(() => { if (ac && ac.currentTime - e.wantAt < 0.4) start(e, x, z, gain, rate); });
    return true;
  }
  /** Подготвя редки записи предварително (напр. гласа за следващата вълна, звуците на шефа). */
  function prefetch(names) { for (const n of names) { const e = bank.get(n); if (e && e.cls !== 'bed') { ensure(e); e.used = ac ? ac.currentTime : 0; } } }

  // ── безкрайни: музика и фон през <audio>, в своя шина (гласът я снишава) ──
  let musicBus = null;
  function busOf() { if (!musicBus && ac) { musicBus = ac.createGain(); musicBus.gain.value = 1; musicBus.connect(master); } return musicBus; }
  function loopOf(name, gain, fade) {
    const e = bank.get(name);
    if (!e || !ac || !base) return null;
    const el = new Audio(new URL(e.files[0], base).href);
    el.loop = true; el.preload = 'auto';
    const src = ac.createMediaElementSource(el), g = ac.createGain(), t = ac.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, e.gain * gain), t + fade);
    src.connect(g); g.connect(busOf());
    el.play().catch(() => { /* без жест на играча: опитва пак при wake() */ pending.add(el); });
    return { el, stop(fd = 1.5) { if (!ac) return; const n = ac.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + fd); setTimeout(() => { el.pause(); el.removeAttribute('src'); el.load(); try { src.disconnect(); } catch { /* вече */ } pending.delete(el); }, fd * 1000 + 100); } };
  }
  const pending = new Set();
  // Музиката на пластове: 'calm', 'wave', 'intense', 'boss', '' (тишина). Сцената казва кой; смяната е плавно преливане.
  let wantMusic = '', curMusic = '', musicNode = null;
  function music(layer, force = false) {
    wantMusic = layer || '';
    if (!force && wantMusic === curMusic) return;
    curMusic = wantMusic;
    if (musicNode) musicNode.stop(curMusic ? 1.8 : 0.9);
    musicNode = curMusic ? loopOf('music.' + curMusic, 1, 1.6) : null;
  }
  let wantAmb = '', ambNode = null;
  /** Фонът: 'night' (цялата игра), 'rain' (последната вълна), '' (нищо). */
  function ambience(kind) {
    kind = kind === true ? 'night' : kind || '';
    if (kind === wantAmb && ambNode) return;
    wantAmb = kind;
    if (ambNode) ambNode.stop(3);
    ambNode = kind ? loopOf('ambience.' + kind, 1, 3) : null;
  }

  // ── говорителят (RAVEN): един ред наведнъж, един чака, поне 4 с между редовете, музиката се снишава с 6 dB ──
  let sayEnd = 0, queued = null, saying = null;
  /** prio: 3 шеф/тъмно/порта; 2 паднал/зад теб; 1 вълни; 0 похвала. */
  function say(id, prio = 1) {
    const e = bank.get('voice.' + id);
    if (!e || !ac || held) return false;
    ensure(e);
    const t = ac.currentTime;
    if (!saying && t >= sayEnd + 4) { speak(e); return true; }
    if (!queued || prio > queued.prio) queued = { e, prio, at: t };
    return true;
  }
  function speak(e) {
    saying = e;
    ensure(e).then(() => {
      if (!ac || saying !== e) return;
      const src = start(e, null, null, 1, 1);
      const len = src ? src.buffer.duration : 1;
      const bus = busOf(), t = ac.currentTime;
      if (bus) { bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.5, t, 0.08); bus.gain.setTargetAtTime(1, t + len, 0.3); }
      sayEnd = t + len; saying = null;
    });
  }
  function voiceTick() {
    if (!ac || saying || !queued) return;
    const t = ac.currentTime;
    if (t - queued.at > 6) { queued = null; return; }      // старо: вече не важи
    if (t >= sayEnd + 4) { const q = queued; queued = null; speak(q.e); }
  }

  function noise(dst, t0, dur, { type = 'lowpass', f0 = 2000, f1 = 400, q = 0.7, gain = 1, attack = 0.001 } = {}) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const filt = ac.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0); filt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(dst);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.02);
    voices++; src.onended = () => { voices--; };
  }
  function tone(dst, t0, dur, { type = 'sine', f0 = 120, f1 = 50, gain = 1, attack = 0.002, vib = 0, vibHz = 6 } = {}) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.02); }
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dst);
    o.start(t0); o.stop(t0 + dur + 0.02);
    voices++; o.onended = () => { voices--; };
    return g;
  }

  const SHOT = {
    pistol: { n: [0.16, 5200, 700, 0.9], t: [0.11, 210, 60, 0.9], crack: 0.5 },
    smg: { n: [0.10, 6200, 1100, 0.75], t: [0.07, 260, 90, 0.6], crack: 0.4 },
    shotgun: { n: [0.42, 3200, 240, 1.0], t: [0.30, 130, 36, 1.0], crack: 0.7 },
    rifle: { n: [0.22, 4600, 520, 0.95], t: [0.16, 180, 48, 0.95], crack: 0.65 },
    revolver: { n: [0.26, 3800, 420, 1.0], t: [0.2, 150, 42, 1.0], crack: 0.7 },
    carbine: { n: [0.18, 5000, 640, 0.9], t: [0.13, 200, 56, 0.85], crack: 0.6 },
    hunting: { n: [0.5, 3000, 200, 1.0], t: [0.36, 120, 30, 1.0], crack: 0.8 },
    lmg: { n: [0.14, 5200, 800, 0.85], t: [0.1, 190, 60, 0.8], crack: 0.5 },
  };
  /** Изстрел. pos: [x, z] на чужд изстрел, null за моя. */
  function shot(kind, pos) {
    if (!ok()) return;
    const s = SHOT[kind] || SHOT.pistol, t = ac.currentTime, dst = out(pos ? pos[0] : null, pos ? pos[1] : null, pos ? 0.8 : 1);
    noise(dst, t, s.n[0], { type: 'lowpass', f0: s.n[1], f1: s.n[2], gain: s.n[3] });
    tone(dst, t, s.t[0], { type: 'sine', f0: s.t[1], f1: s.t[2], gain: s.t[3] });
    noise(dst, t, 0.025, { type: 'highpass', f0: 3000, f1: 2500, gain: s.crack });
    if (kind === 'shotgun') noise(dst, t + 0.03, 0.5, { type: 'bandpass', f0: 900, f1: 200, q: 0.5, gain: 0.35 });
  }
  function dry() { if (!ok()) return; const t = ac.currentTime, d = out(null); noise(d, t, 0.02, { type: 'highpass', f0: 4000, f1: 3000, gain: 0.35 }); tone(d, t, 0.03, { type: 'square', f0: 1400, f1: 900, gain: 0.08 }); }
  function click(t, d, f = 2400, g = 0.3) { noise(d, t, 0.03, { type: 'bandpass', f0: f, f1: f * 0.6, q: 3, gain: g }); tone(d, t, 0.04, { type: 'triangle', f0: f * 0.4, f1: f * 0.2, gain: g * 0.5 }); }
  function reload(total = 1.4) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(null);
    click(t + 0.02, d, 1800, 0.3);                       // пълнителят излиза
    noise(d, t + 0.1, 0.12, { type: 'bandpass', f0: 900, f1: 500, q: 1, gain: 0.12 });
    click(t + Math.max(0.2, total * 0.6), d, 2600, 0.35);      // новият влиза
  }
  function loaded() { if (!ok()) return; const t = ac.currentTime, d = out(null); click(t, d, 3200, 0.4); click(t + 0.07, d, 2200, 0.35); }
  function pickup() { if (!ok()) return; const t = ac.currentTime, d = out(null); click(t, d, 1500, 0.4); click(t + 0.09, d, 2800, 0.4); tone(d, t + 0.02, 0.18, { type: 'triangle', f0: 320, f1: 520, gain: 0.12 }); }

  /** Попадение в зомби (моето): тупване; в главата: по-мокро и по-високо. */
  function hit(head) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(null);
    noise(d, t, 0.06, { type: 'lowpass', f0: head ? 1800 : 900, f1: 200, gain: head ? 0.5 : 0.3 });
    if (head) tone(d, t, 0.09, { type: 'triangle', f0: 900, f1: 1500, gain: 0.16 });
  }
  function splat(pos) {
    if (!ok()) return;
    if (soft < 1) return;      // детски режим: без жвакане
    const t = ac.currentTime, d = out(pos.x, pos.z, 1.2);
    noise(d, t, 0.22, { type: 'lowpass', f0: 1400, f1: 120, gain: 0.9 });
    tone(d, t, 0.14, { type: 'sine', f0: 240, f1: 60, gain: 0.5 });
  }
  let groanAt = 0;
  function groan(x, z, type = 'walker') {
    if (!ok() || ac.currentTime - groanAt < 0.5) return;
    groanAt = ac.currentTime;
    const t = ac.currentTime, d = out(x, z, (type === 'boss' ? 1.6 : 0.9) * soft), dur = 0.7 + Math.random() * 0.8;
    const f = (type === 'boss' ? 52 : type === 'runner' ? 120 : 82) * (0.85 + Math.random() * 0.3);
    // гърлен звук: трион през движеща се лента + малко дъх
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass'; filt.Q.value = 4;
    filt.frequency.setValueAtTime(420, t); filt.frequency.linearRampToValueAtTime(760 + Math.random() * 300, t + dur * 0.5); filt.frequency.linearRampToValueAtTime(380, t + dur);
    filt.connect(d);
    tone(filt, t, dur, { type: 'sawtooth', f0: f, f1: f * 0.8, gain: 0.9, attack: 0.08, vib: f * 0.12, vibHz: 17 + Math.random() * 9 });
    noise(d, t, dur, { type: 'bandpass', f0: 700, f1: 500, q: 1.2, gain: 0.07, attack: 0.1 });
  }
  let stepAt = 0;
  function step(x, z, heavy) {
    if (!ok() || ac.currentTime - stepAt < 0.09) return;
    stepAt = ac.currentTime;
    const t = ac.currentTime, d = out(x, z, heavy ? 1.6 : 0.5);
    noise(d, t, heavy ? 0.16 : 0.07, { type: 'lowpass', f0: heavy ? 300 : 500, f1: 70, gain: 0.8 });
    if (heavy) tone(d, t, 0.2, { type: 'sine', f0: 70, f1: 34, gain: 0.9 });
  }
  function scream(x, z) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(x, z, 1.4 * soft);
    const filt = ac.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 6; filt.frequency.setValueAtTime(1500, t); filt.frequency.linearRampToValueAtTime(2600, t + 0.5); filt.frequency.linearRampToValueAtTime(1300, t + 1.8);
    filt.connect(d);
    tone(filt, t, 1.9, { type: 'sawtooth', f0: 520, f1: 760, gain: 0.9, attack: 0.05, vib: 60, vibHz: 28 });
    noise(d, t, 1.8, { type: 'bandpass', f0: 2400, f1: 1800, q: 2, gain: 0.12, attack: 0.05 });
  }
  /** Зомби удря мен. */
  function bite() {
    if (!ok()) return;
    const t = ac.currentTime, d = out(null, null, 1.1 * soft);
    noise(d, t, 0.14, { type: 'lowpass', f0: 700, f1: 90, gain: 1 });
    tone(d, t, 0.22, { type: 'sine', f0: 150, f1: 45, gain: 0.9 });
  }
  function heart() {
    if (!ok()) return;
    const t = ac.currentTime, d = out(null, null, 0.9);
    tone(d, t, 0.12, { type: 'sine', f0: 62, f1: 40, gain: 0.9, attack: 0.01 });
    tone(d, t + 0.17, 0.14, { type: 'sine', f0: 54, f1: 36, gain: 0.7, attack: 0.01 });
  }
  function down() { if (!ok()) return; const t = ac.currentTime, d = out(null); tone(d, t, 1.2, { type: 'sawtooth', f0: 220, f1: 40, gain: 0.35, attack: 0.02 }); noise(d, t, 0.5, { type: 'lowpass', f0: 500, f1: 60, gain: 0.6 }); }
  function up() { if (!ok()) return; const t = ac.currentTime, d = out(null); tone(d, t, 0.5, { type: 'triangle', f0: 180, f1: 520, gain: 0.3, attack: 0.02 }); }
  /** Сирена: нова вълна. */
  function siren(boss = false) {
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime, d = out(null, null, boss ? 0.5 : 0.32), dur = boss ? 3.2 : 2.2;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1100;
    o.frequency.setValueAtTime(boss ? 180 : 300, t);
    o.frequency.linearRampToValueAtTime(boss ? 300 : 640, t + dur * 0.45);
    o.frequency.linearRampToValueAtTime(boss ? 150 : 320, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.25); g.gain.setValueAtTime(0.5, t + dur - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(d);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function roar(x, z) {
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime, d = out(x, z, 2.2), dur = 2.4;
    const filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.setValueAtTime(260, t); filt.frequency.linearRampToValueAtTime(900, t + 0.7); filt.frequency.linearRampToValueAtTime(220, t + dur);
    filt.connect(d);
    tone(filt, t, dur, { type: 'sawtooth', f0: 58, f1: 40, gain: 1, attack: 0.15, vib: 9, vibHz: 23 });
    tone(filt, t, dur, { type: 'square', f0: 87, f1: 55, gain: 0.5, attack: 0.2, vib: 12, vibHz: 31 });
    noise(d, t, dur, { type: 'bandpass', f0: 500, f1: 260, q: 0.8, gain: 0.35, attack: 0.2 });
  }
  function clear() { if (!ok()) return; const t = ac.currentTime, d = out(null); tone(d, t, 0.25, { type: 'triangle', f0: 392, f1: 392, gain: 0.2 }); tone(d, t + 0.16, 0.4, { type: 'triangle', f0: 587, f1: 587, gain: 0.22 }); }
  function ending(won) {
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime, d = out(null), notes = won ? [262, 330, 392, 523] : [262, 233, 196, 147];
    notes.forEach((f, i) => tone(d, t + i * 0.22, won ? 0.9 : 1.1, { type: won ? 'triangle' : 'sawtooth', f0: f, f1: f, gain: 0.22, attack: 0.02 }));
  }

  let beatSeen = -1;
  /** Удар по дъските на портата. */
  /** Сандъкът се отваря: скърцане на панта и глух удар на капака. */
  function chest(x, z) { if (!ok()) return; const t = ac.currentTime, d = out(x, z, 1.3); tone(d, t, 0.32, { type: 'sawtooth', f0: 210, f1: 420, gain: 0.22, attack: 0.02, vib: 12, vibHz: 24 }); tone(d, t + 0.33, 0.16, { type: 'sine', f0: 120, f1: 46, gain: 0.9 }); noise(d, t + 0.33, 0.12, { type: 'lowpass', f0: 1400, f1: 260, gain: 0.5 }); }
  /** Оръжие пада на земята: кратко метално тракване. */
  function clack(x, z) { if (!ok()) return; const t = ac.currentTime, d = out(x, z, 1.1); noise(d, t, 0.05, { type: 'bandpass', f0: 2600, f1: 1500, q: 2.5, gain: 0.55 }); tone(d, t, 0.07, { type: 'triangle', f0: 520, f1: 260, gain: 0.35 }); noise(d, t + 0.09, 0.03, { type: 'bandpass', f0: 2200, f1: 1400, q: 3, gain: 0.25 }); }
  /** Брадвата влиза: тъп удар и кратък мокър шум. */
  function chop() { if (!ok()) return; const t = ac.currentTime, d = out(null); tone(d, t, 0.12, { type: 'sine', f0: 170, f1: 60, gain: 0.9 }); noise(d, t, 0.09, { type: 'lowpass', f0: 1800, f1: 300, gain: 0.7 }); }
  /** Резачката: кратко бръмчене на мотора; в месо е по-ниско и по-шумно. */
  function saw(cut) { if (!ok()) return; const t = ac.currentTime, d = out(null); tone(d, t, 0.13, { type: 'sawtooth', f0: cut ? 96 : 132, f1: cut ? 84 : 124, gain: cut ? 0.5 : 0.3, attack: 0.004, vib: 9, vibHz: 31 }); noise(d, t, 0.12, { type: 'bandpass', f0: cut ? 900 : 2200, f1: cut ? 500 : 1800, q: 1.2, gain: cut ? 0.5 : 0.16 }); }
  function bang(x, z) { if (!ok()) return; const t = ac.currentTime, d = out(x, z, 1.5); tone(d, t, 0.17, { type: 'sine', f0: 135, f1: 48, gain: 0.95 }); noise(d, t, 0.09, { type: 'bandpass', f0: 950, f1: 320, q: 1.1, gain: 0.5 }); }
  /** Дъска се кърти и пада; big: шефът отнася цялата порта. */
  function crack(x, z, big) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(x, z, big ? 2.2 : 1.6);
    noise(d, t, 0.05, { type: 'highpass', f0: 5200, f1: 2400, gain: 0.8 });
    noise(d, t + 0.02, big ? 0.5 : 0.24, { type: 'bandpass', f0: 1700, f1: 380, q: 0.9, gain: 0.7 });
    tone(d, t, big ? 0.5 : 0.22, { type: 'triangle', f0: big ? 110 : 170, f1: 40, gain: 0.9 });
    if (big) tone(d, t + 0.12, 0.4, { type: 'sine', f0: 70, f1: 30, gain: 0.9 });
  }
  /** Чукът забива пирон; done: портата е цяла. */
  function hammer(x, z, done) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(x, z, 1.3);
    for (const [at, g] of [[0, 0.55], [0.13, 0.45]]) { noise(d, t + at, 0.035, { type: 'bandpass', f0: 2900, f1: 1500, q: 2.5, gain: g }); tone(d, t + at, 0.07, { type: 'triangle', f0: 620, f1: 240, gain: g * 0.7 }); }
    if (done) tone(d, t + 0.26, 0.3, { type: 'triangle', f0: 392, f1: 587, gain: 0.16 });
  }
  /** Варелът гърми. */
  function boom(x, z) {
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime, d = out(x, z, 2.6);
    tone(d, t, 1.1, { type: 'sine', f0: 86, f1: 26, gain: 1.3, attack: 0.004 });
    noise(d, t, 1.3, { type: 'lowpass', f0: 2600, f1: 70, gain: 1.1, attack: 0.003 });
    noise(d, t, 0.08, { type: 'highpass', f0: 3000, f1: 900, gain: 0.7 });
  }
  /** Гръм след светкавица: дълъг тътен отвсякъде. */
  function thunder() {
    if (!ok()) return;
    const t = ac.currentTime, d = out(null, null, 0.8);
    noise(d, t, 2.8, { type: 'lowpass', f0: 420, f1: 45, q: 0.5, gain: 0.6, attack: 0.07 });
    noise(d, t + 0.35, 2.2, { type: 'lowpass', f0: 240, f1: 40, q: 0.5, gain: 0.4, attack: 0.3 });
    tone(d, t, 1.6, { type: 'sine', f0: 58, f1: 30, gain: 0.35, attack: 0.1 });
  }
  /** Токът спира (on = false) или идва. */
  function power(on) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(null);
    click(t, d, on ? 1800 : 900, 0.45);
    if (on) { tone(d, t + 0.05, 0.9, { type: 'sawtooth', f0: 48, f1: 118, gain: 0.12, attack: 0.2 }); click(t + 0.5, d, 2600, 0.3); }
    else tone(d, t, 1.1, { type: 'sawtooth', f0: 190, f1: 32, gain: 0.22, attack: 0.01 });
  }

  let relAt = 0;
  function update(dt, head, lowBeat) {
    if (!ac) return;
    voiceTick();
    if ((relAt += dt) > 10) { relAt = 0; release(); }
    if (head && ac.listener) {
      const l = ac.listener, p = head.pos;
      const f = fwd.set(0, 0, -1).applyQuaternion(head.quat);
      if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
      else { l.setPosition?.(p.x, p.y, p.z); l.setOrientation?.(f.x, f.y, f.z, 0, 1, 0); }
    }
    // пулс при малко кръв: по един удар на всеки такт
    if (lowBeat >= 0) { const b = Math.floor(lowBeat); if (b !== beatSeen) { beatSeen = b; if (!sample('player.heart')) heart(); } } else beatSeen = -1;
  }
  const fwd = new ctx.THREE.Vector3();

  function dispose() { try { musicNode?.stop(0.2); ambNode?.stop(0.2); for (const el of pending) { el.pause(); el.removeAttribute('src'); } pending.clear(); bank.clear(); ac?.close(); } catch { /* вече е затворен */ } ac = null; }

  // ── нови събития: без запис ползват най-близкия досегашен звук или мълчат ──
  function leap(x, z) { if (!ok()) return; const t = ac.currentTime, d = out(x, z, 1.2); noise(d, t, 0.35, { type: 'bandpass', f0: 600, f1: 1800, q: 0.8, gain: 0.35, attack: 0.08 }); }
  function dig(x, z) { if (!ok()) return; const t = ac.currentTime, d = out(x, z, 1.4); noise(d, t, 0.9, { type: 'lowpass', f0: 700, f1: 120, gain: 0.7, attack: 0.05 }); }
  function alarm(x, z) {
    if (!ok()) return;
    const t = ac.currentTime, d = out(x, z, 1.6);
    for (let i = 0; i < 8; i++) tone(d, t + i * 0.42, 0.38, { type: 'square', f0: i % 2 ? 900 : 1250, f1: i % 2 ? 900 : 1250, gain: 0.18, attack: 0.01 });
  }

  // Име на събитието за всяка функция и откъде звучи. Записът (ако го има) печели; иначе досегашният звук.
  const named = (name, synth, where = () => [null, null]) => (...a) => { const n = typeof name === 'function' ? name(...a) : name; if (n && sample(n, ...where(...a))) return; synth(...a); };
  const at = (x, z) => [x, z];
  const api = {
    // своят изстрел е в главата; чуждият е в залата и по-тих; rate: последните патрони на пълнителя са по-високи
    shot: (k, pos, rate = 1) => { if (sample('shot.' + k, pos ? pos[0] : null, pos ? pos[1] : null, pos ? 0.6 : 1, rate)) return; shot(k, pos); },
    dry: named('gun.dry', dry), reload: named('gun.reload', reload), loaded: named('gun.loaded', loaded), pickup: named('gun.pickup', pickup),
    hit: named(h => (h ? 'impact.head' : 'impact.body'), hit),
    splat: named(() => (soft < 1 ? '' : 'impact.gore'), splat, p => [p.x, p.z]),
    groan: named((x, z, type = 'walker') => (bank.has('zombie.idle.' + type) ? 'zombie.idle.' + type : type === 'boss' || type === 'brute' ? 'zombie.idle.big' : 'zombie.idle'), groan, at),
    step: named((x, z, heavy) => (heavy ? 'zombie.step.heavy' : 'zombie.step'), step, at),
    scream: named('screamer.scream', scream, at),
    bite: named('player.hurt', bite), down: named('player.down', down), up: named('player.up', up),
    siren: named(boss => (boss ? 'boss.siren' : 'wave.start'), siren),
    roar: named('boss.roar', roar, at),
    clear: named('wave.clear', clear),
    ending: named(won => (won ? 'end.win' : 'end.lose'), ending),
    bang: named('gate.bang', bang, at), crack: named((x, z, big) => (big ? 'gate.smash' : 'gate.crack'), crack, at),
    hammer: (x, z, done) => { if (sample('gate.hammer', x, z)) { if (done) sample('gate.sealed', x, z); return; } hammer(x, z, done); },
    boom: named('barrel.boom', boom, at),
    chop: named('melee.chop', chop), saw: named(cut => (cut ? 'melee.saw.cut' : 'melee.saw.idle'), saw),
    chest: named('chest.open', chest, at), clack: named('chest.drop', clack, at),
    thunder: named('world.thunder', thunder), power: named(on => (on ? 'world.power.on' : 'world.power.off'), power),
    leap: named('leaper.leap', leap, at), land: named('leaper.land', bang, at),
    dig: named('digger.rise', dig, at), alarm: named('world.alarm', alarm, at),
    brute: named('brute.roar', roar, at),
    // само записи: без тях мълчат (синтезът не се добавя повече)
    attack: (x, z, big) => { sample(big ? 'zombie.attack.big' : 'zombie.attack', x, z); },
    death: (x, z, big) => { sample(big ? 'zombie.death.big' : 'zombie.death', x, z); },
    headshot: () => { sample('impact.headshot'); },
    combo: n => { sample(n >= 5 ? 'player.combo.big' : 'player.combo', null, null, Math.min(1, 0.5 + n * 0.1)); },
    take: () => { sample('gun.take'); },
  };
  loadBank();

  return { pause, setSoft(on) { soft = on ? 0.55 : 1; }, wake, ...api, play: sample, prefetch, say, music, ambience, has: n => bank.has(n), text: n => bank.get(n)?.text || '', update, dispose, get state() { return ac ? ac.state : 'none'; }, get bank() { return bankState; } };
}

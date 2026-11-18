// Пазач на Pico каските: щом Pico е на кабела (adb), програмата сама му вдига тунела към сървъра и отваря играта в браузъра му.
// Пипа само устройства с Pico в името, и само с тези команди: devices, getprop, reverse на НАШИТЕ два порта, am start на браузъра
// с адреса на играта. Никога не чисти данни, не пипа системни настройки, не излиза от LBE и не вади нищо отпред насила:
// ако каската е заета (LBE „Retrieving boundary“, граница, настройка), пробва пак след малко.
//
// Каската влиза в лобито с id = серийния номер (?id=), затова пултът я познава веднага и номерът ѝ е един и същ.
// Тунелът (adb reverse) пада при всяко прекъсване на USB, затова се вдига наново на всеки кръг — каската вижда сървъра като localhost,
// без Wi-Fi и без да е в една мрежа с компютъра.
//
//   const pk = startPicoKeeper({ adb, port, tlsPort, isOnline, nameFor, say });
//   pk.status()  → [{ serial, model, state, detail }]     pk.stop()

import { execFile } from 'node:child_process';

export const PICO_BROWSER = 'com.pico.browser.overseas';
const EVERY = 4000;
const RELAUNCH_MS = 15_000;
const MAX_TRIES = 24;           // ~6 минути на връзка; после чака нова връзка или бутона
const GONE_MS = 9_000;          // толкова време без устройството = нова връзка (ще се отвори пак)

/** Pico ли е: производител, марка или модел с „pico“. */
export function isPicoProps({ manufacturer = '', brand = '', model = '' } = {}) {
  return /pico/i.test(`${manufacturer} ${brand} ${model}`);
}

/** Адресът на играта за каската през тунела: localhost е сигурен контекст, затова върви и без HTTPS. */
export function picoPageUrl({ port, serial, name }) {
  const q = v => encodeURIComponent(v).replace(/'/g, '%27');      // адресът отива в кавички за shell на каската
  return `http://localhost:${port}/play/?app=1&id=${q(serial)}&name=${q(name)}`;
}

/** `adb devices` → [{ serial, status }] */
export function parseDevices(out) {
  return String(out || '').split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(p => p.length >= 2 && p[0] && !p[0].startsWith('*')).map(p => ({ serial: p[0], status: p[1] }));
}

/** Какво казва `am start`: пуснато, или каската е заета. */
export function launchResult(out) {
  const s = String(out || '');
  if (/kept for the user|not started/i.test(s)) return { ok: false, busy: true };
  if (/error|exception|unable to resolve/i.test(s)) return { ok: false, busy: false, error: s.split('\n').find(l => /error|exception|unable/i.test(l)) || 'грешка' };
  return { ok: /starting/i.test(s) || s === '', busy: false };
}

function runner(adb, exec) {
  if (exec) return exec;
  return (args, timeout = 12_000) => new Promise(res => execFile(adb, args, { timeout, windowsHide: true, maxBuffer: 2 << 20 },
    (err, out, errOut) => res({ ok: !err, out: String(out || '').trim(), err: String(errOut || err?.message || '').trim() })));
}

export function startPicoKeeper({ adb, port, tlsPort, exec, isOnline = () => false, nameFor = s => s, say = () => {}, now = () => Date.now() } = {}) {
  const run = runner(adb, exec);
  const devs = new Map();       // serial → { serial, model, pico, state, detail, tries, lastLaunch, lastSeen }
  let stopped = false, timer = null, adbOk = null;

  async function props(serial) {
    const r = await run(['-s', serial, 'shell', 'getprop ro.product.manufacturer; echo ---; getprop ro.product.brand; echo ---; getprop ro.product.model'], 8000);
    const [manufacturer = '', brand = '', model = ''] = r.out.replace(/\r/g, '').split('\n---\n').map(s => s.trim());
    return { manufacturer, brand, model };
  }

  async function cycle() {
    if (stopped) return;
    const t = now();
    const list = await run(['devices'], 8000);
    if (!list.ok) {
      if (adbOk !== false) say('Pico: adb не работи на този компютър — каските на кабел няма да се отварят сами', 'warn');
      adbOk = false;
      return;
    }
    adbOk = true;
    const seen = new Set();
    for (const { serial, status } of parseDevices(list.out)) {
      seen.add(serial);
      let d = devs.get(serial);
      if (!d) { d = { serial, model: '', pico: null, state: 'looking', detail: '', tries: 0, lastLaunch: 0, lastSeen: t }; devs.set(serial, d); }
      d.lastSeen = t;
      if (status === 'unauthorized') {
        if (d.state !== 'allow') say('Пико на кабела чака разрешение: сложи каската и натисни „Allow“ за USB дебъгването', 'warn');
        d.state = 'allow'; d.detail = 'позволи USB дебъгването в каската'; continue;
      }
      if (status !== 'device') { d.state = status; continue; }
      if (d.pico === null) {
        const p = await props(serial);
        d.pico = isPicoProps(p); d.model = p.model || p.brand || '';
        if (!d.pico) { d.state = 'other'; d.detail = 'не е Pico — не се пипа'; continue; }
      }
      if (!d.pico) continue;
      // тунелът: каската вижда сървъра като localhost (пада при всяко прекъсване на USB, затова на всеки кръг)
      await run(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], 6000);
      if (tlsPort) await run(['-s', serial, 'reverse', `tcp:${tlsPort}`, `tcp:${tlsPort}`], 6000);
      if (isOnline(serial)) {
        if (d.state !== 'lobby') say(`${nameFor(serial)}: влезе в лобито`, 'ok');
        d.state = 'lobby'; d.detail = 'в лобито'; d.tries = 0; continue;
      }
      if (d.tries >= MAX_TRIES || t - d.lastLaunch < RELAUNCH_MS) continue;
      d.tries++; d.lastLaunch = t;
      const url = picoPageUrl({ port, serial, name: nameFor(serial) });
      const r = await run(['-s', serial, 'shell', `am start -a android.intent.action.VIEW -d '${url}' ${PICO_BROWSER}`], 10_000);
      const res = launchResult(r.out || r.err);
      if (res.busy) { d.state = 'busy'; d.detail = 'каската е заета (граница, LBE или настройка) — пробвам пак'; }
      else if (!res.ok) { d.state = 'error'; d.detail = res.error || 'не се отвори'; }
      else { if (d.state !== 'opened') say(`${nameFor(serial)}: играта е отворена в каската — сложи я и натисни Enter`, 'ok'); d.state = 'opened'; d.detail = 'играта е отворена в каската'; }
    }
    // каска, която липсва достатъчно дълго, при връщане се отваря наново (кабелът е вадян)
    for (const [serial, d] of devs) if (!seen.has(serial) && t - d.lastSeen > GONE_MS) { d.state = 'gone'; d.detail = 'няма кабел'; d.tries = 0; d.lastLaunch = 0; if (d.pico === false) devs.delete(serial); }
  }

  async function loop() {
    try { await cycle(); } catch (e) { console.warn('[pico-keeper]', e.message); }
    if (!stopped) timer = setTimeout(loop, EVERY);
  }
  loop();

  return {
    status: () => [...devs.values()].filter(d => d.pico).map(d => ({ serial: d.serial, model: d.model, state: d.state, detail: d.detail })),
    /** Бутон „Отвори играта“: пак, веднага. */
    reopen: serial => { const d = devs.get(serial); if (d) { d.tries = 0; d.lastLaunch = 0; } },
    stop: () => { stopped = true; clearTimeout(timer); },
  };
}

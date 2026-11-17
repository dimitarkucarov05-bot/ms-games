// Без кабел: казва на каската да презареди страницата (нов код), чака я да влезе пак във VR,
// после пуска чертането само на препятствията. Щом те се запишат, играта тръгва сама.
//
//   node tools/after-reload.mjs <номер на каската>      например Q2-228d05cd09e3bff1

const PORT = 47801, id = process.argv[2], WANT = Number(process.argv[3]) || 6;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const post = (p, b) => fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()).catch(e => ({ error: e.message }));
const me = async () => (await fetch(`http://127.0.0.1:${PORT}/api/state`).then(r => r.json()).catch(() => null))?.headsets?.find(h => h.id === id) || null;

let asked = 0, last = '';
const say = s => { if (s !== last) { last = s; log(s); } };
const until = Date.now() + 30 * 60_000;
while (Date.now() < until) {
  const h = await me();
  if (!h?.online) say('каската не е свързана');
  else if ((h.build || 0) < WANT) {
    say(`каската е със стар код (версия ${h.build || 0}): пращам презареждане`);
    if (Date.now() - asked > 20_000) { asked = Date.now(); await post('/api/headset/reload', { headsetId: id }); }
  } else if (!h.inVR) say(`новият код е зареден (версия ${h.build}): чака „Влез" в каската`);
  else if (h.anchor !== 'ok' || (h.anchorN || 0) < 2) say(`във VR, котви ${h.anchorN || 0}/2 (${h.anchor || 'няма'}): чака подравняване по двете точки`);
  else {
    const r = await post('/api/zone/obstacles', { headsetId: id, launch: true });
    if (r.ok) { log('във VR: препятствията са изтрити, чертането им е пуснато; играта тръгва след записа'); break; }
    say(`препятствията не тръгнаха: ${r.error || JSON.stringify(r)}`);
  }
  await sleep(1500);
}

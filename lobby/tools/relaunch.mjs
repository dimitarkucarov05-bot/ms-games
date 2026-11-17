// Без кабел: праща на каската новата версия на страницата, чака я да влезе пак във VR с намерени котви
// и пуска играта.
//
//   node tools/relaunch.mjs <номер на каската> <версия на кода (BUILD в play.js)> [игра: backroom (по подразбиране) или motel]

const PORT = 47801, id = process.argv[2], WANT = Number(process.argv[3]) || 0, GAME = process.argv[4] || 'backroom';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const post = (p, b) => fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()).catch(e => ({ error: e.message }));
const state = () => fetch(`http://127.0.0.1:${PORT}/api/state`).then(r => r.json()).catch(() => null);

let asked = 0, last = '', steady = 0;      // steady: колко проверки подред каската е във VR със залата на място
const say = s => { if (s !== last) { last = s; log(s); } };
const until = Date.now() + 60 * 60_000;
while (Date.now() < until) {
  const st = await state(), h = st?.headsets?.find(x => x.id === id);
  const ready = !!h?.online && (h.build || 0) >= WANT && h.inVR && h.anchor === 'ok' && (h.anchorN || 0) >= 2;
  steady = ready ? steady + 1 : 0;
  if (!h?.online) say('каската не е свързана');
  else if ((h.build || 0) < WANT) {
    say(`каската е със стар код (версия ${h.build || 0}): пращам презареждане`);
    if (Date.now() - asked > 20_000) { asked = Date.now(); await post('/api/headset/reload', { headsetId: id }); }
  } else if (!h.inVR) say(`новият код е зареден (версия ${h.build}): чака „Влез" в каската`);
  else if (h.anchor !== 'ok' || (h.anchorN || 0) < 2) say(`във VR, котви ${h.anchorN || 0}/2: чака подравняване по двете точки`);
  else if (st.session) { log('играта вече върви'); break; }
  else if (steady < 4) say('във VR, залата е на място: изчаквам няколко секунди да е стабилно');      // два раздела, които се избутват, не минават оттук
  else {
    const r = await post('/api/launch', { gameId: GAME, headsetIds: [id], theme: 'night', fast: false });
    if (r.ok) { log('във VR, залата е на място: играта е пусната'); break; }
    say(`играта не тръгна: ${r.error || JSON.stringify(r)}`);
  }
  await sleep(1500);
}

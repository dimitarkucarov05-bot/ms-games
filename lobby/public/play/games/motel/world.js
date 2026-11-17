import { createFire } from '../../lib/fire.js';
// „Мъртвият мотел": светът.
//
//   createWorld(ctx, start) → { group, update(dt, t), attach({ weapons, audio, fx }), onSnapshot(snap), event(e), bombs, dispose(), info }
//
// 1. Картата: паркингът пред изоставения мотел от Synty „Woodland Apocalypse Map", изпечена с /play/tools/bake-map.html
//    (motel.bin за компютър, motel-lite.bin за Quest 2) плюс земята от височинната карта на Unity (terrain.bin).
// 2. Нощ: гъста тъмна мъгла, слаба лунна светлина, огньове във варели и фенер на оръжието. Нито една своя текстура.
// 3. Реквизитът се нарежда около ИСТИНСКАТА зона, каквато и да е начертана: барикади по оградата (start.fence) с отвори
//    при портите (start.gates) и при сандъка с оръжията (start.stand), огньове по ъглите и разхвърляни останки от лагера
//    наоколо. Пътеките на зомбитата (start.routes) остават свободни. Всичко е оригинали на Synty в естествен размер.
// 4. Живото: всяка порта е рамка от два стълба и шест отделни дъски (SM_Wep_Plank_01). Зомбитата ги къртят една по
//    една и те падат навътре; при коване се връщат на мястото си (snap.gates). В ръката, която кове, се появява чукът
//    (SM_Wep_Hammer_01) вместо оръжието. Варелите с гориво край пътеките гърмят при изстрел (snap.bombs, boom); при спрян ток
//    (snap.dark) надписът и лампите гаснат; от време на време светкавица осветява всичко за миг.
//    createWorld връща още onSnapshot(snap), event(e) и bombs (за лъча на оръжията).
//
// Изпичане (координати на арената; център Unity −1.5, −86.2: паркингът пред мотела, надписът MOTEL на 12 м западно;
// завъртане 0, дупка 14 × 14 м за зоната и реквизита):
//   …/bake-map.html?map=woodland-apocalypse&cx=-1.5&cz=-86.2&yaw=0&r=46&lod=8,18,32&hole=-7,7,-7,7&small=0.8&near=18&far=Bush@26;Grass|Flower|GroundCover@15&name=motel&save=1
//   …&r=30&lod=0,8,16&hole=-7,7,-7,7&small=2&near=8&far=Bush@10;Grass|Flower|GroundCover@6&skip=Sky|Cloud|Water|Caustic&name=motel-lite&save=1   (леката, за Quest 2)
//   …&r=60&lod=0,8,16&hole=0,0,0,0&small=0&near=99&skip=^(?!.*(Motel_Sign|Light_Roof|Gas_Sign))&name=motel-glow&save=1   (само светещото)
// Зоната се побира до около 11 × 11 м около центъра; за по-голяма се пече наново с по-голяма дупка.

const MAP_DIR = '/play/assets/maps/woodland-apocalypse/';
const GROUND = 0.25;            // асфалтът на паркинга в картата е на тази височина: тя става подът на арената
const CLEAR = 7;                // половината от разчистения квадрат в изпичането
const APO = 'apocalypse-pack';
const NIGHT = 0x0a1a1f;         // тъмен синьо-зелен здрач, както на корицата на картата: силуетите на боровете и мотела се четат
// Големият надпис MOTEL от картата (SM_Bld_Motel_Sign_01, 14 м висок) стои на 12 м западно от центъра; червеното му сияние пада по паркинга.
const SIGN = { x: -11.4, y: 8.5, z: 0.8 };

// барикадите по оградата: ниски, за да се стреля над тях. len: дължина по оградата; axis: коя ос на модела е дългата.
const WALLS = [
  { m: 'SM_Prop_Sandbag_Wall_02', len: 2.35, axis: 'z' },
  { m: 'SM_Prop_Sandbag_Wall_End_01', len: 2.27, axis: 'z' },
  { m: 'SM_Prop_Barrier_Concrete_01', len: 1.99, axis: 'x' },
  { m: 'SM_Prop_Barricade_Concrete_01', len: 2.0, axis: 'z' },
  { m: 'SM_Prop_Barrier_Long_01', len: 2.29, axis: 'x' },
  { m: 'SM_Prop_Barrier_Concrete_Broken_01', len: 1.98, axis: 'x' },
  { m: 'SM_Prop_Barrier_Plastic_01', len: 1.8, axis: 'x' },
  { m: 'SM_Prop_Sandbag_Wall_01', len: 3.97, axis: 'z' },
  // къси парчета: при зона с чупки отсечките на оградата са по метър-два
  { m: 'SM_Prop_Barrier_Concrete_Broken_02', len: 1.1, axis: 'x' },
  { m: 'SM_Prop_Barrier_Concrete_Bare_Broken_02', len: 1.1, axis: 'x' },
];
// дребното, с което се запълва остатък под 1.6 м
const FILL = ['SM_Prop_Barrel_Old_01', 'SM_Prop_Crate_02', 'SM_Prop_Barrel_Coloured_01', 'SM_Prop_Crate_03', 'SM_Prop_Tire_Pile_01', 'SM_Prop_Keg_01', 'SM_Prop_Keg_01'];
// високи парчета стена: стоят по-навън и режат гледката на места
const TALL = ['SM_Prop_Barricade_01', 'SM_Prop_Barricade_02', 'SM_Prop_Barricade_Corrugated_01', 'SM_Prop_Barricade_Wired_01', 'SM_Prop_Crate_Wall_01', 'SM_Prop_Barricade_05'];
// останките от лагера около зоната
const SCATTER = [
  'SM_Prop_BodyBag_01', 'SM_Prop_BodyBag_02', 'SM_Prop_BodyBag_03', 'SM_Prop_BodyBag_04', 'SM_Prop_BodyBag_Pile_01',
  'SM_DeadBody_Male_04', 'SM_DeadBody_Female_05', 'SM_DeadBody_Male_12', 'SM_DeadBody_Female_10', 'SM_DeadBody_Male_17',
  'SM_Prop_TrashBag_01', 'SM_Prop_TrashBag_04', 'SM_Prop_TrashBag_07', 'SM_Prop_TrashPile_03', 'SM_Prop_TrashPile_06',
  'SM_Prop_Tire_01', 'SM_Prop_Tire_Pile_01', 'SM_Prop_Tractor_Tire_01', 'SM_Prop_Car_Wrecked_Wheel_03',
  'SM_Prop_Barrel_Old_01', 'SM_Prop_Barrel_Coloured_01', 'SM_Prop_Barrel_Nuke_01', 'SM_Prop_Barrel_Water_01', 'SM_Prop_BarrelStack_01',
  'SM_Prop_Crate_01', 'SM_Prop_Crate_02', 'SM_Prop_Crate_03', 'SM_Prop_Crate_Open_03', 'SM_Prop_Pallet_01', 'SM_Prop_Pallet_02', 'SM_Prop_CardboardBox_02',
  'SM_Prop_Cart_01', 'SM_Prop_Sleeping_Bag_01',
  'SM_Prop_Tent_Dome_Damaged_01', 'SM_Prop_Tent_Long_Damaged_01', 'SM_Prop_Bed_Gurney_BodySheet_01', 'SM_Prop_Dumpster_01',
  'SM_Prop_Rubble_Concrete_02', 'SM_Env_Rubble_Pebbles_01', 'SM_Env_Rubble_Pebbles_02', 'SM_Prop_Sandbag_01', 'SM_Prop_CarBattery_Table',
  'SM_Prop_Ammo_Box_01', 'SM_Item_Ammo_Crate_01', 'SM_Prop_MedicalBox_02', 'SM_Prop_Generator_01', 'SM_Prop_Radio_01',
];
const BLOOD = 'SM_Prop_BloodPool_01', SITTING = ['SM_Prop_DeadBody_Sitting_Male_01', 'SM_Prop_DeadBody_Sitting_Male_02'];
const BARREL = 'SM_Prop_Barrel_Open_01', FLAME = 'SM_Flame_FX', FLOOD = 'SM_Prop_Floodlights_01', SIGNS = ['SM_Prop_Sign_KeepOut_01', 'SM_Prop_Sign_Military_01'];
// Портата: два стълба на GATE_POSTS м от средата и дъски по 1.10 м, заковани от вътрешната страна на стълбовете.
const GATE_POST = 'SM_Prop_Fence_Wood_Post_01', GATE_PLANK = 'SM_Wep_Plank_01', HAMMER = 'SM_Wep_Hammer_01';
const GATE_POSTS = 0.55;        // стълбовете са на толкова от средата на портата (отворът между тях е около 0.96 м)
const GATE_GAP = 0.68;          // барикадите на оградата спират на толкова от средата на портата
const BOMB_BARREL = 'SM_Prop_Barrel_Coloured_01', BOMB_CAN = 'SM_Prop_GasCan_01', BOMB_TANK = 'SM_Prop_Propane_01', BOMB_RIG = 'SM_Wep_Bomb_GasCan_01';
const BOLT = 0x9db4c4;          // небето в мига на светкавицата

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function createWorld(ctx, start) {
  const { THREE, root, assets } = ctx;
  const qs = new URLSearchParams(location.search);
  const lite = qs.get('lite') === '1' || (qs.get('lite') !== '0' && /Quest 2/.test(navigator.userAgent));
  const group = new THREE.Group();
  group.name = 'motel-world';
  root.add(group);
  const own = { geos: [], mats: [], lights: [], fires: [] };
  const stats = { map: '', tris: 0, chunks: 0, terrain: 0, props: 0, walls: 0, fires: 0 };

  // ── нощта ──
  let scene = root;
  while (scene.parent) scene = scene.parent;
  const hemi = ctx.lights?.hemi, sun = ctx.lights?.sun;
  const before = { fog: scene.fog, bg: scene.background, hemi: hemi ? [hemi.intensity, hemi.color.getHex(), hemi.groundColor?.getHex()] : null, sun: sun ? [sun.intensity, sun.color.getHex()] : null };
  scene.fog = new THREE.FogExp2(NIGHT, lite ? 0.064 : 0.057);
  scene.background = new THREE.Color(NIGHT);
  // Осветлението е на контраст: студена тъмна нощ, в която светят само топлите огньове, червеният неон и лъчът на фенера.
  if (hemi) { hemi.color.set(0x4a7f92); hemi.groundColor?.set(0x05080a); hemi.intensity = 0.27; }
  if (sun) { sun.color.set(0x8fbfe0); sun.intensity = 0.22; }
  const sunShadow = sun ? sun.castShadow : false;
  if (sun) sun.castShadow = false;      // нищо в играта не хвърля сянка: картата на сенките само би се смятала напразно

  // ── картата ──
  let meta = null, signLight = null;
  const glow = [];
  try {
    let buf = null;
    for (const nm of (qs.get('map') ? [qs.get('map')] : lite ? ['motel-lite', 'motel'] : ['motel', 'motel-lite'])) {
      meta = await fetch(`${MAP_DIR}${nm}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      buf = meta?.chunks?.length ? await fetch(`${MAP_DIR}${nm}.bin`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
      if (buf) { stats.map = nm; break; }
    }
    if (buf) {
      const land = new THREE.Group();
      land.name = 'map';
      land.position.y = -GROUND;
      group.add(land);
      const dv = new DataView(buf), stride = meta.stride || 20;
      for (const ch of meta.chunks) {
        if (/Sky|Cloud|Caustic/i.test(`${ch.name || ''} ${ch.tex || ''}`)) continue;      // нощ е: небето е цветът на мъглата; езерото не се вижда
        const n = ch.verts, P = new Uint16Array(n * 3), N = new Int8Array(n * 3), U = new Float32Array(n * 2);
        for (let i = 0, o = ch.offset; i < n; i++, o += stride) {
          P[i * 3] = dv.getUint16(o, true); P[i * 3 + 1] = dv.getUint16(o + 2, true); P[i * 3 + 2] = dv.getUint16(o + 4, true);
          N[i * 3] = dv.getInt8(o + 8); N[i * 3 + 1] = dv.getInt8(o + 9); N[i * 3 + 2] = dv.getInt8(o + 10);
          U[i * 2] = dv.getFloat32(o + 12, true); U[i * 2 + 1] = dv.getFloat32(o + 16, true);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3, true));
        geo.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
        geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        const cut = ch.tex ? ch.tex.indexOf('/') : -1;
        const src = cut > 0 ? assets.material(ch.tex.slice(0, cut), ch.tex.slice(cut + 1)) : null;
        const mat = new THREE.MeshLambertMaterial({ map: src ? src.map : null });
        const c = ch.color || [1, 1, 1];
        mat.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        if (ch.glass) { mat.transparent = true; mat.opacity = ch.opacity || 0.3; mat.depthWrite = false; }
        if (ch.alpha) { mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(ch.min[0], ch.min[1], ch.min[2]);
        mesh.scale.setScalar(ch.span);
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        geo.computeBoundingSphere();
        mesh.frustumCulled = !!ch.part;
        if (ch.glass) mesh.renderOrder = 2;
        land.add(mesh);
        own.geos.push(geo); own.mats.push(mat);
        stats.tris += n / 3; stats.chunks++;
      }
      // Светещото: надписът MOTEL, лампите по мотела и табелата на бензиностанцията са изпечени още веднъж в отделен малък
      // файл (motel-glow) и се рисуват без осветление, с цветовете на оригиналната си текстура, точно върху тъмното копие.
      try {
        const gm = await fetch(`${MAP_DIR}motel-glow.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
        const gb = gm?.chunks?.length ? await fetch(`${MAP_DIR}motel-glow.bin`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
        if (gb && gm.cx === meta.cx && gm.cz === meta.cz) {
          const gv = new DataView(gb), gs = gm.stride || 20;
          for (const ch of gm.chunks) {
            const cut = ch.tex ? ch.tex.indexOf('/') : -1;
            if (cut <= 0) continue;
            const slug = ch.tex.slice(0, cut), file = ch.tex.slice(cut + 1);
            // Свети само каквото е нарисувано като светещо в оригиналната текстура на Synty: червените букви, жълтото табло,
            // белите плафони. Цветът на всеки триъгълник се чете от текстурата (палитра: един триъгълник, един цвят).
            // Картинката се чете с createImageBitmap: img.decode() чака кадър на страницата, а във VR или в скрит раздел
            // такъв не идва и играта увисва на зареждането.
            const bmp = await createImageBitmap(await (await fetch(`/play/assets/synty/${slug}/${file}`)).blob());
            const cv = document.createElement('canvas');
            cv.width = bmp.width; cv.height = bmp.height;
            const c2 = cv.getContext('2d', { willReadFrequently: true });
            c2.drawImage(bmp, 0, 0);
            bmp.close?.();
            const px = c2.getImageData(0, 0, cv.width, cv.height).data;
            // Табелата на бензиностанцията е единственото в този файл с текстурата 01_A: по нея светят само светодиодните цифри
            // на цените (чисто червено и зелено). Стълбовете, основата, плакатът и петната не светят.
            const led = /PolygonApocalypse_01_A/i.test(file);
            const hot = (u, v) => {
              const x = Math.min(cv.width - 1, Math.floor((((u % 1) + 1) % 1) * cv.width)), y = Math.min(cv.height - 1, Math.floor((((v % 1) + 1) % 1) * cv.height));
              const o = (y * cv.width + x) * 4, r = px[o], g = px[o + 1], bl = px[o + 2];
              if (led) return (r > 225 && g < 40 && bl < 40) || (g > 195 && r < 165 && bl < 80);
              return (r > 80 && r > bl * 1.6 && r > g * 1.35) || (r > 150 && g > 110 && bl < 110 && r > bl * 1.5) || (r > 205 && g > 205 && bl > 185);      // червено, жълто-оранжево, бяло
            };
            const n = ch.verts;
            let P = new Uint16Array(n * 3), U = new Float32Array(n * 2), k = 0;
            for (let i = 0, o = ch.offset; i + 2 < n; i += 3, o += gs * 3) {
              const u = (gv.getFloat32(o + 12, true) + gv.getFloat32(o + gs + 12, true) + gv.getFloat32(o + gs * 2 + 12, true)) / 3;
              const v = (gv.getFloat32(o + 16, true) + gv.getFloat32(o + gs + 16, true) + gv.getFloat32(o + gs * 2 + 16, true)) / 3;
              if (!hot(u, v)) continue;
              for (let j = 0; j < 3; j++, k++) {
                const q = o + gs * j;
                P[k * 3] = gv.getUint16(q, true); P[k * 3 + 1] = gv.getUint16(q + 2, true); P[k * 3 + 2] = gv.getUint16(q + 4, true);
                U[k * 2] = gv.getFloat32(q + 12, true); U[k * 2 + 1] = gv.getFloat32(q + 16, true);
              }
            }
            cv.width = cv.height = 0;
            if (!k) continue;
            P = P.slice(0, k * 3); U = U.slice(0, k * 2);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(P, 3, true));
            geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
            const src = assets.material(slug, file);
            const mat = new THREE.MeshBasicMaterial({ map: src ? src.map : null, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });      // неонът пробива мъглата
            if (led) mat.color.setRGB(1.15, 1.3, 1.1); else mat.color.setRGB(3.2, 1.9, 1.5);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(ch.min[0], ch.min[1], ch.min[2]);
            mesh.scale.setScalar(ch.span);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            mesh.renderOrder = 1;
            land.add(mesh);
            glow.push(mesh);
            own.geos.push(geo); own.mats.push(mat);
            stats.glow = (stats.glow || 0) + k / 3;
          }
          const neon = new THREE.PointLight(0xff3a2a, lite ? 26 : 36, 30, 1.45);
          neon.position.set(SIGN.x, SIGN.y, SIGN.z);
          group.add(neon); own.lights.push(neon);
          signLight = neon;
        }
      } catch (e) { console.warn('[motel] glowing signs missing:', e.message); }
      // земята: височинната карта на терена от Unity (в картата асфалтът и предметите лежат върху нея)
      try {
        const tj = await fetch(`${MAP_DIR}terrain.json`).then(r => r.json());
        const tb = new Uint16Array(await (await fetch(`${MAP_DIR}terrain.bin`)).arrayBuffer());
        const ya = -(meta.yaw || 0) * Math.PI / 180, cy = Math.cos(ya), sy = Math.sin(ya);
        const R = (meta.r || 40) + 26, st = lite ? 3 : 2;
        const i0 = Math.max(0, Math.floor((meta.cx - R - tj.x0) / tj.step)), i1 = Math.min(tj.w - 1, Math.ceil((meta.cx + R - tj.x0) / tj.step));
        const j0 = Math.max(0, Math.floor((meta.cz - R - tj.z0) / tj.step)), j1 = Math.min(tj.h - 1, Math.ceil((meta.cz + R - tj.z0) / tj.step));
        const is = [], js = [];
        for (let i = i0; i < i1; i += st) is.push(i);
        is.push(i1);
        for (let j = j0; j < j1; j += st) js.push(j);
        js.push(j1);
        const pos = new Float32Array(is.length * js.length * 3);
        let k = 0;
        for (const j of js) for (const i of is) {
          const dx = tj.x0 + i * tj.step - meta.cx, dz = tj.z0 + j * tj.step - meta.cz;
          pos[k++] = -(dx * cy + dz * sy); pos[k++] = tj.y0 + tb[j * tj.w + i] * tj.yScale - 0.015; pos[k++] = -dx * sy + dz * cy;
        }
        const idx = [], w = is.length;
        for (let b = 0; b + 1 < js.length; b++) for (let a = 0; a + 1 < w; a++) {
          const p = b * w + a;
          idx.push(p, p + 1, p + w, p + 1, p + w + 1, p + w);      // огледалото по X обръща посоката: така лицето гледа нагоре
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        if (geo.attributes.normal.getY(0) < 0) { for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
        const mat = new THREE.MeshLambertMaterial({ color: 0x85735b });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.matrixAutoUpdate = false;
        land.add(mesh);
        own.geos.push(geo); own.mats.push(mat);
        stats.terrain = idx.length / 3;
      } catch (e) { console.warn('[motel] ground missing:', e.message); }
    } else console.warn('[motel] baked map missing: only the props remain');
  } catch (e) { console.warn('[motel] the map did not load:', e); }
  if (!stats.chunks) {      // без карта: поне асфалт под краката
    const g = new THREE.PlaneGeometry(300, 300), m = new THREE.MeshLambertMaterial({ color: 0x2a2d30 });
    const p = new THREE.Mesh(g, m);
    p.rotation.x = -Math.PI / 2; p.position.y = -0.003;
    group.add(p); own.geos.push(g); own.mats.push(m);
  }

  // ── реквизитът около зоната ──
  const rooms = Array.isArray(start.rooms) && start.rooms.length ? start.rooms : [{ x: 0, z: 0, w: start.hall?.w || 4, d: start.hall?.d || 4 }];
  const F = start.fence || {
    x0: Math.min(...rooms.map(r => r.x - r.w / 2)) - 0.9, x1: Math.max(...rooms.map(r => r.x + r.w / 2)) + 0.9,
    z0: Math.min(...rooms.map(r => r.z - r.d / 2)) - 0.9, z1: Math.max(...rooms.map(r => r.z + r.d / 2)) + 0.9,
  };
  const gates = Array.isArray(start.gates) ? start.gates : [];
  const stand = start.stand || null;
  const lanes = (start.routes || start.lanes || []).map(l => l.points).filter(p => p && p.length > 1);
  const rand = rng(Math.round((F.x1 - F.x0) * 1000) * 31 + Math.round((F.z1 - F.z0) * 1000) * 17 + Math.round((F.x0 + F.z0) * 100) + 7);
  const pickOf = list => list[Math.floor(rand() * list.length)];
  const made = [], busy = [];      // поставените предмети (сливат се накрая) и заетите места { x, z, r }
  const fireGeos = new Map();
  /** Пламъкът е оригиналният модел на Synty, оцветен по височина: светло жълто в основата, тъмно оранжево на върха. */
  function fireGeo(mesh) {
    let g = fireGeos.get(mesh.geometry.uuid);
    if (g) return g;
    g = mesh.geometry.clone();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), ys = new Float32Array(pos.count), p = new THREE.Vector3();
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); ys[i] = p.y; y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    for (let i = 0; i < pos.count; i++) { const k = (ys[i] - y0) / ((y1 - y0) || 1); col[i * 3] = 1; col[i * 3 + 1] = 0.9 - 0.62 * k; col[i * 3 + 2] = 0.5 - 0.44 * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    fireGeos.set(mesh.geometry.uuid, g);
    return g;
  }
  const fires = [];
  if (assets) {
    try { await assets.loadPack(APO); } catch (e) { console.warn('[motel] prop pack missing:', e.message); }
  }
  const info = name => (assets ? assets.info(APO, name) : null);
  /** Слага модел така, че средата на кутията му да е на (x, z); ry е завъртането. Връща радиуса на отпечатъка. */
  async function put(name, x, z, ry, opt = {}) {
    const d = info(name);
    if (!d) return 0;
    let o = null;
    try { o = await assets.get(APO, name); } catch { return 0; }
    const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2, c = Math.cos(ry), s = Math.sin(ry);
    o.position.set(x - (cx * c + cz * s), (opt.y || 0) + (d.min[1] < -0.3 ? -d.min[1] : 0), z - (-cx * s + cz * c));
    o.rotation.y = ry;
    if (opt.tilt) o.rotation.z = opt.tilt;
    made.push(o);
    stats.props++;
    return Math.max(d.size[0], d.size[2]) / 2;
  }
  const segDist = (x, z, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1e-9; const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)); return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t); };
  const laneDist = (x, z) => { let d = Infinity; for (const pts of lanes) for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i], pts[i + 1])); return d; };
  // Оградата върви по очертанието на зоната (start.edges) на OFF метра от нея; по-стари правила дават само кутията F.
  const OFF = Number.isFinite(start.fenceOff) ? start.fenceOff : 0.9;
  const byEdges = Array.isArray(start.edges) && start.edges.length > 0;
  const inFence = (x, z, m) => (byEdges
    ? rooms.some(r => x > r.x - r.w / 2 - OFF - m && x < r.x + r.w / 2 + OFF + m && z > r.z - r.d / 2 - OFF - m && z < r.z + r.d / 2 + OFF + m)
    : x > F.x0 - m && x < F.x1 + m && z > F.z0 - m && z < F.z1 + m);
  const free = (x, z, r) => busy.every(b => Math.hypot(b.x - x, b.z - z) > b.r + r);
  const solid = Array.isArray(start.solid) ? start.solid : [];
  const inSolid = (x, z, r) => solid.some(q => x > q[0] - r && x < q[1] + r && z > q[2] - r && z < q[3] + r);      // там стои нещо от картата (ъгълът на мотела, площадката)

  if (assets && info(WALLS[0].m)) {
    // 0. рамките на портите: два стълба и една дъска, закована отгоре (дъските по тях са живи и се правят по-долу)
    if (info(GATE_POST)) {
      for (const g of gates) {
        const tx = -g.nz, tz = g.nx;
        for (const k of [-1, 1]) await put(GATE_POST, g.x + tx * GATE_POSTS * k, g.z + tz * GATE_POSTS * k, rand() * 0.3);
        const top = info(GATE_PLANK) ? await assets.get(APO, GATE_PLANK).catch(() => null) : null;
        if (top) {
          const d = info(GATE_PLANK), c = (d.min[0] + d.max[0]) / 2;
          top.rotation.y = Math.atan2(-g.nx, -g.nz);
          top.position.set(g.x - g.nx * 0.085 - tx * c, 1.93, g.z - g.nz * 0.085 - tz * c);
          made.push(top);
        }
      }
    }
    // 1. барикадите по оградата, страна по страна; отвори при портите и при сандъка с оръжията
    // всяка отсечка: начало (ax, az), посока по дължината (tx, tz) и нормала навън; посоката е (−nz, nx), както при кутията
    const sides = byEdges ? start.edges.map(e => {
      const tx = -e.nz, tz = e.nx;
      return { ax: tx > 0 ? Math.min(e.x0, e.x1) : tx < 0 ? Math.max(e.x0, e.x1) : e.x0, az: tz > 0 ? Math.min(e.z0, e.z1) : tz < 0 ? Math.max(e.z0, e.z1) : e.z0, tx, tz, nx: e.nx, nz: e.nz, len: e.len };
    }) : [
      { ax: F.x0, az: F.z0, tx: 1, tz: 0, nx: 0, nz: -1, len: F.x1 - F.x0 },
      { ax: F.x1, az: F.z0, tx: 0, tz: 1, nx: 1, nz: 0, len: F.z1 - F.z0 },
      { ax: F.x1, az: F.z1, tx: -1, tz: 0, nx: 0, nz: 1, len: F.x1 - F.x0 },
      { ax: F.x0, az: F.z1, tx: 0, tz: -1, nx: -1, nz: 0, len: F.z1 - F.z0 },
    ];
    for (const sd of sides) {
      const along = (x, z) => (x - sd.ax) * sd.tx + (z - sd.az) * sd.tz;
      const gaps = [];
      const off = (x, z) => Math.abs((x - sd.ax) * sd.nx + (z - sd.az) * sd.nz);      // колко е встрани от правата на тази отсечка
      for (const g of gates) if (g.nx === sd.nx && g.nz === sd.nz && off(g.x, g.z) < 0.06) { const s = along(g.x, g.z); if (s > -0.01 && s < sd.len + 0.01) gaps.push([s - GATE_GAP, s + GATE_GAP]); }
      if (stand && stand.nx === sd.nx && stand.nz === sd.nz && off(stand.x, stand.z) < 1.6) { const s = along(stand.x, stand.z); if (s > -1 && s < sd.len + 1) gaps.push([s - 1.45, s + 1.45]); }
      gaps.sort((a, b) => a[0] - b[0]);
      const runs = [];
      let from = 0.3;
      for (const g of gaps) { if (g[0] > from + 0.4) runs.push([from, Math.min(g[0], sd.len - 0.3)]); from = Math.max(from, g[1]); }
      if (sd.len - 0.3 > from + 0.4) runs.push([from, sd.len - 0.3]);
      for (const [a, b] of runs) {
        let s = a;
        while (b - s > 0.38) {
          const room = b - s, fit = WALLS.filter(w => w.len <= room + 0.12 && (w.len < 3 || room > 5.2));
          if (fit.length) {
            const w = pickOf(fit), mid = s + w.len / 2;
            const ry = w.axis === 'z' ? Math.atan2(sd.tx, sd.tz) : Math.atan2(-sd.tz, sd.tx);
            await put(w.m, sd.ax + sd.tx * mid, sd.az + sd.tz * mid, ry + (rand() - 0.5) * 0.05);
            stats.walls++;
            // тук-там седнал мъртвец, облегнат отвън на барикадата
            if (rand() < 0.3) await put(pickOf(SITTING), sd.ax + sd.tx * mid + sd.nx * 0.85, sd.az + sd.tz * mid + sd.nz * 0.85, Math.atan2(sd.nx, sd.nz) + (rand() - 0.5) * 0.5);
            s += w.len + 0.07;
          } else {
            // каквото се побира в остатъка: варел, сандък или буре
            const fits = FILL.filter(n => { const q = info(n); return q && Math.max(q.size[0], q.size[2]) <= room + 0.12; });
            if (!fits.length) break;
            const name = pickOf(fits), d = info(name), r = Math.max(d.size[0], d.size[2]) / 2;
            await put(name, sd.ax + sd.tx * (s + r), sd.az + sd.tz * (s + r), rand() * 6.28);
            s += r * 2 + 0.08;
          }
        }
      }
    }
    busy.push({ x: (F.x0 + F.x1) / 2, z: (F.z0 + F.z1) / 2, r: 0 });      // само за да не е празен списъкът
    for (const b of start.bombs || []) busy.push({ x: b.x, z: b.z, r: 1.1 });                // варелите с гориво: около тях е чисто

    // 2. огън във варел при ъглите отвън (светлината им трепти) и по един до всяка порта
    const spots = [[F.x0 - 0.75, F.z0 - 0.75], [F.x1 + 0.75, F.z1 + 0.75], [F.x1 + 0.75, F.z0 - 0.75], [F.x0 - 0.75, F.z1 + 0.75]];
    const nFire = 2;      // два огъня на срещуположни ъгли: локви топла светлина, между тях е тъмно
    for (let i = 0; i < spots.length && fires.length < nFire; i++) {
      const [x, z] = spots[i];
      if (laneDist(x, z) < 0.9 || inFence(x, z, 0.3)) continue;
      const o = info(BARREL) ? await assets.get(APO, BARREL).catch(() => null) : null;
      if (!o) break;
      o.position.set(x, 0, z); o.rotation.y = rand() * 6.28;
      group.add(o);
      busy.push({ x, z, r: 0.6 });
      const light = new THREE.PointLight(0xff8a3c, 0, lite ? 9 : 10.5, 1.5);
      let flameProto = null;
      try { flameProto = info(FLAME) ? await assets.get(APO, FLAME) : null; } catch { flameProto = null; }
      light.position.set(x, 1.5, z);
      group.add(light); own.lights.push(light);
      // пламъкът: много малки копия на оригиналния модел на Synty, които се издигат и изстиват (lib/fire.js)
      let fire = null;
      if (flameProto) {
        fire = createFire(THREE, flameProto, { count: lite ? 18 : 24, sparks: lite ? 4 : 7 });
        if (fire) { fire.mesh.position.set(x, 0.9, z); group.add(fire.mesh); own.fires.push(fire); }
        flameProto = null;
      }
      fires.push({ light, fire, base: lite ? 12 : 14, ph: rand() * 20 });
      stats.fires++;
    }

    // 3. прожекторите на ремарке с генератор: гледат навън към най-дългата пътека (на компютър светят наистина)
    const box = CLEAR + 0.25;
    {
      const side = (F.x1 - F.x0) > (F.z1 - F.z0) ? { x: (F.x0 + F.x1) / 2 + 1.6, z: F.z0 - 2.6, ry: 0 } : { x: F.x1 + 2.6, z: (F.z0 + F.z1) / 2 - 1.8, ry: Math.PI / 2 };
      if (Math.abs(side.x) < box && Math.abs(side.z) < box && laneDist(side.x, side.z) > 1.9 && !inSolid(side.x, side.z, 1.6) && info(FLOOD)) {
        const r = await put(FLOOD, side.x, side.z, side.ry);
        busy.push({ x: side.x, z: side.z, r: r * 0.8 });
      }
    }

    // 4. високи парчета стена по-навън и останките от лагера: чували с трупове, варели, палатки, колички, боклук
    const want = lite ? 26 : 52, tall = lite ? 3 : 6;
    let tries = 0, done = 0, tallDone = 0;
    const band = () => {      // случайна точка в ивицата между оградата и края на разчистеното
      for (let i = 0; i < 30; i++) {
        const x = (rand() * 2 - 1) * box, z = (rand() * 2 - 1) * box;
        if (!inFence(x, z, 0.75)) return [x, z];
      }
      return null;
    };
    while (done < want && tries++ < want * 30) {
      const p = band();
      if (!p) break;
      const isTall = tallDone < tall && !inFence(p[0], p[1], 2.2);
      const name = isTall ? pickOf(TALL) : pickOf(SCATTER), d = info(name);
      if (!d) continue;
      const r = Math.max(d.size[0], d.size[2]) / 2 * 0.92;
      if (inFence(p[0], p[1], 0.35 + r) || laneDist(p[0], p[1]) < r + 0.75 || !free(p[0], p[1], r + 0.12) || inSolid(p[0], p[1], r)) continue;
      if (stand && Math.hypot(p[0] - stand.x, p[1] - stand.z) < r + 1.9) continue;
      await put(name, p[0], p[1], rand() * 6.28);
      busy.push({ x: p[0], z: p[1], r });
      done++;
      if (isTall) tallDone++;
    }
    // 5. локви кръв: плоски, може и по пътеките
    for (let i = 0; i < (lite ? 6 : 12); i++) { const p = band(); if (p && !inSolid(p[0], p[1], 0.4)) await put(BLOOD, p[0], p[1], rand() * 6.28, { y: 0.008 }); }

    // всичко неподвижно се слива в по една мрежа на материал: малко рисувания, колкото и да са предметите
    if (made.length) {
      const merged = assets.merge(made);
      merged.name = 'props';
      merged.traverse(m => { if (m.isMesh) { own.geos.push(m.geometry); stats.tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
      group.add(merged);
    }
  }

  // ── портите: шест отделни дъски на порта; зомбитата ги къртят една по една, чукът ги връща ──
  const GATE = start.gate || { boards: 6, start: 3, half: 1.2, reachIn: 1.05, reachOut: 0.45, calm: 0.6 };
  const PER = GATE.boards || 6;
  const gateObjs = [];
  const stripGeo = new THREE.PlaneGeometry(1, 1);
  own.geos.push(stripGeo);
  let planks = null;      // всички дъски на всички порти са една мрежа с копия: едно рисуване, колкото и да са портите
  const mQ = new THREE.Quaternion(), mE = new THREE.Euler(), mM = new THREE.Matrix4(), mP = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  if (assets && info(GATE_PLANK) && gates.length) {
    let src = null;
    try { src = await assets.get(APO, GATE_PLANK); } catch { src = null; }
    let mesh = null;
    src?.updateMatrixWorld(true);
    src?.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (mesh) {
      // дъската в свои оси: дългата страна по X, широката по Y, дебелината по Z, средата в началото
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
      own.geos.push(geo);
      planks = new THREE.InstancedMesh(geo, mesh.material, gates.length * PER);
      planks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      planks.frustumCulled = false;
      planks.name = 'gate-planks';
      group.add(planks);
    }
  }
  for (const [gi, g] of gates.entries()) {
    const tx = -g.nz, tz = g.nx, yaw = Math.atan2(-g.nx, -g.nz);      // X на дъската ляга по дължината на портата
    const rec = { g, boards: -1, busy: 0, shake: 0, planks: [], strip: null, mat: null, ph: rand() * 6 };
    // в какъв ред падат: разбъркан за всяка порта, за да не изглеждат еднакво
    const rank = [...Array(PER).keys()];
    for (let i = rank.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rank[i], rank[j]] = [rank[j], rank[i]]; }
    for (let i = 0; i < PER; i++) {
      const y = 0.3 + i * (1.42 / Math.max(1, PER - 1)), flip = rand() < 0.5 ? Math.PI : 0, lat = (rand() - 0.5) * 0.05;
      const up = new THREE.Vector3(g.x - g.nx * 0.085 + tx * lat, y, g.z - g.nz * 0.085 + tz * lat);
      const upQ = new THREE.Quaternion().setFromEuler(mE.set(0, yaw + flip, (rand() - 0.5) * 0.16, 'YXZ'));
      // на земята: навътре от портата, легнала по широката си страна, под случаен ъгъл
      const far = 0.3 + rand() * 0.5, side = (rand() - 0.5) * 0.9;
      const down = new THREE.Vector3(g.x - g.nx * far + tx * side, 0.018 + i * 0.004, g.z - g.nz * far + tz * side);
      const downQ = new THREE.Quaternion().setFromEuler(mE.set(Math.PI / 2, rand() * 6.28, 0, 'YXZ'));
      rec.planks.push({ id: gi * PER + i, rank: rank[i], up, upQ, down, downQ, k: 0, to: 0, vel: 0, spin: (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 2)), dirty: true });
    }
    // тънка ивица на ръба на зоната пред портата (като линията на зоната): тук се застава, за да се кове
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    own.mats.push(mat);
    const strip = new THREE.Mesh(stripGeo, mat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(g.nx, -g.nz);
    strip.scale.set(1.1, 0.06, 1);
    strip.position.set(g.x - g.nx * (OFF - 0.06), 0.014, g.z - g.nz * (OFF - 0.06));
    strip.renderOrder = 1; strip.visible = false;
    group.add(strip);
    rec.strip = strip; rec.mat = mat;
    gateObjs.push(rec);
  }
  stats.gates = gateObjs.length;
  /** Колко дъски има портата: дъска с ред под това число е закована, останалите лежат на земята. */
  function setBoards(rec, n, quiet) {
    if (rec.boards === n) return;
    rec.boards = n;
    for (const b of rec.planks) {
      b.to = b.rank < n ? 0 : 1;
      if (quiet) { b.k = b.to; b.vel = 0; }
      b.dirty = true;
    }
  }
  /** Слага дъската там, където е в момента: между закованото място и земята, по дъга и с премятане. */
  function placePlank(rec, b) {
    const k = b.k, e = k * k * (3 - 2 * k);
    mP.lerpVectors(b.up, b.down, e);
    mP.y += Math.sin(Math.PI * k) * 0.28;
    mP.x -= rec.g.nx * Math.sin(Math.PI * k) * 0.25; mP.z -= rec.g.nz * Math.sin(Math.PI * k) * 0.25;
    mQ.copy(b.upQ).slerp(b.downQ, e);
    if (k > 0 && k < 1) mQ.multiply(qSpin.setFromAxisAngle(AX, b.spin * Math.PI * 2 * e));
    else if (k === 0 && rec.shake) mQ.multiply(qSpin.setFromAxisAngle(AZ, Math.sin(time * 47 + b.id) * 0.07 * rec.shake));
    planks.setMatrixAt(b.id, mM.compose(mP, mQ, ONE));
  }
  const qSpin = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
  for (const rec of gateObjs) setBoards(rec, Math.min(PER, GATE.start ?? 3), true);

  // ── чукът: появява се в ръката, която кове, вместо оръжието ──
  const hammers = {};
  let meDown = false;
  if (assets && info(HAMMER)) {
    // дръжката на модела е по неговата ос X, главата е в края ѝ: в ръката дръжката сочи нагоре и напред
    const fit = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
    for (const side of ['l', 'r']) {
      const o = await assets.get(APO, HAMMER).catch(() => null);
      if (!o) continue;
      const hold = new THREE.Group(), swing = new THREE.Group();
      o.quaternion.copy(fit);
      swing.add(o); hold.add(swing); hold.visible = false;
      group.add(hold);
      hammers[side] = { hold, swing, ph: 0, on: false, struck: false };
    }
  }

  // ── варелите с гориво: червен варел с туби до него; гърмят при изстрел ──
  const bombs = [], bombObjs = [];      // bombs: { x, y, z, r, alive } за лъча на оръжията
  const beaconGeo = new THREE.SphereGeometry(0.04, 8, 6), beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  own.geos.push(beaconGeo); own.mats.push(beaconMat);
  if (assets && info(BOMB_BARREL)) {
    for (const b of start.bombs || []) {
      const holder = new THREE.Group();
      holder.position.set(b.x, 0, b.z);
      holder.rotation.y = rand() * 6.28;
      // на каската само варелът: всяка отделна мрежа е още едно рисуване
      for (const [name, dx, dz, ry] of (lite ? [[BOMB_BARREL, 0, 0, 0]] : [[BOMB_BARREL, 0, 0, 0], [info(BOMB_TANK) ? BOMB_TANK : BOMB_CAN, 0.55, 0.1, 0.7], [info(BOMB_RIG) ? BOMB_RIG : BOMB_CAN, -0.2, 0.52, 2.2]])) {
        if (!info(name)) continue;
        const o = await assets.get(APO, name).catch(() => null);
        if (!o) continue;
        o.position.set(dx, 0, dz); o.rotation.y = ry;
        holder.add(o);
      }
      const dot = new THREE.Mesh(beaconGeo, beaconMat);      // червена лампичка върху варела: мига, за да се вижда в тъмното
      dot.position.set(0, 1.08, 0);
      holder.add(dot);
      holder.userData.dot = dot;
      group.add(holder);
      bombObjs.push(holder);
      bombs.push({ x: b.x, y: 0.55, z: b.z, r: 0.5, alive: true });
    }
  }
  stats.bombs = bombs.length;
  const BLAST = start.blast || 3.6;
  const blastGeo = new THREE.SphereGeometry(1, 20, 12);
  // огнената топка: най-ярка в средата, към ръба се стопява (без текстура: яркостта идва от ъгъла към окото)
  const fireball = hex => new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(hex) }, opacity: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV; void main() { float f = max(dot(normalize(vN), normalize(vV)), 0.0); gl_FragColor = vec4(color * opacity * f * f * f, 1.0);\n#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const blastMat = fireball(0xff8a2a), coreMat = fireball(0xfff0c4);
  own.geos.push(blastGeo); own.mats.push(blastMat, coreMat);
  const blast = new THREE.Mesh(blastGeo, blastMat), core = new THREE.Mesh(blastGeo, coreMat);
  blast.visible = core.visible = false; blast.renderOrder = 3; core.renderOrder = 4;
  group.add(blast, core);
  // светлината на взрива: на компютър е отделна, на каската се взима назаем неонът на надписа (нова светлина там тежи на всичко)
  const blastLight = lite ? null : new THREE.PointLight(0xffa24a, 0, 24, 1.3);
  if (blastLight) { group.add(blastLight); own.lights.push(blastLight); }
  const blastAt = new THREE.Vector3();
  let blastT = -1, borrowed = false;
  let audio = null, fx = null;
  function boom(e) {
    const i = e.b, b = bombs[i];
    if (b) b.alive = false;
    if (bombObjs[i]) bombObjs[i].visible = false;
    blastAt.set(e.x ?? b?.x ?? 0, 0.9, e.zz ?? b?.z ?? 0);
    blastT = 0;
    blast.position.copy(blastAt); core.position.copy(blastAt);
    blast.visible = core.visible = true;
    if (blastLight) blastLight.position.copy(blastAt);
    else if (signLight) { borrowed = true; signLight.position.copy(blastAt); signLight.color.setHex(0xffa24a); signLight.distance = 22; }
    try { fx?.burst(blastAt, 'dirt', 28, 7.5); fx?.burst(blastAt, 'dirt', 14, 3.5); } catch { /* без ефектите взривът пак се вижда */ }
  }

  // ── токът и светкавиците ──
  let darkOn = false, darkK = 0, flickUntil = 0, boltT = -1, boltAt = 14 + Math.random() * 10, thunderAt = 0, hapticAt = 0;
  const skyC = new THREE.Color(NIGHT), nightC = new THREE.Color(NIGHT), boltC = new THREE.Color(BOLT);
  const HEMI = 0.27, SUN = 0.22, NEON = lite ? 26 : 36;

  function onSnapshot(snap) {
    if (Array.isArray(snap.gates)) snap.gates.forEach((v, i) => { const rec = gateObjs[i]; if (!rec) return; setBoards(rec, v[0], false); rec.busy = v[1] ? 1 : 0; });
    if (Array.isArray(snap.bombs)) snap.bombs.forEach((a, i) => { const b = bombs[i]; if (!b) return; if (!!a !== b.alive) { b.alive = !!a; bombObjs[i].visible = !!a; } });
    if (!!snap.dark !== darkOn) { darkOn = !!snap.dark; flickUntil = time + (darkOn ? 0.8 : 1.2); }
    const me = snap.players?.find(q => q.id === ctx.viewId);
    meDown = !!(me && me.down > 0);
  }
  function event(e) {
    if (e.k === 'bang') { const rec = gateObjs[e.g]; if (rec) { rec.shake = e.big ? 1.6 : 1; try { fx?.burst(v.set(rec.g.x + rec.g.nx * 0.3, 0.9, rec.g.z + rec.g.nz * 0.3), 'dirt', e.big ? 16 : 6, e.big ? 4 : 2.2); } catch { /* само прах */ } } }
    else if (e.k === 'boom') boom(e);
    else if (e.k === 'boss') { boltAt = 0; flickUntil = time + 2.4; }      // шефът идва: светкавица и токът примигва
  }
  /** Всичко, което се движи само: панелите на портите, ивиците пред тях, взривът, токът, светкавицата. */
  function live(dt) {
    // портите: дъските падат и се връщат
    let moved = false;
    for (const rec of gateObjs) {
      const shaking = rec.shake > 0;
      rec.shake = Math.max(0, rec.shake - dt * 3);
      if (planks) {
        for (const b of rec.planks) {
          if (b.k < b.to) { b.vel += dt * 9; b.k = Math.min(1, b.k + b.vel * dt); b.dirty = true; }            // откъртена: лети навътре и пада
          else if (b.k > b.to) { b.vel = 0; b.k = Math.max(0, b.k - dt * 3.8); b.dirty = true; }                // закована обратно
          else b.vel = 0;
          if (b.dirty || (shaking && b.k === 0)) { placePlank(rec, b); b.dirty = b.k !== b.to; moved = true; }
        }
      }
      const full = rec.boards >= PER;
      rec.strip.visible = !full;
      if (!full) {
        const open = rec.boards <= 0;
        rec.mat.color.setHex(rec.busy ? 0x8dffb0 : open ? 0xff4a2e : 0xffb13c);
        rec.mat.opacity = rec.busy ? 0.85 : 0.45 + 0.35 * Math.sin(time * (open ? 9 : 4) + rec.ph);
      }
    }
    if (moved) planks.instanceMatrix.needsUpdate = true;
    // чукът: в ръката, която е при недозакована порта и не е стреляла току-що
    for (const side of ['l', 'r']) {
      const hm = hammers[side];
      if (!hm) continue;
      const h = ctx.hands?.[side], gun = weapons?.mine?.[side];
      let at = null;
      if (h?.active && gun && !meDown && !gun.onTarget && (weapons.sinceShot?.(side) ?? 9) >= (GATE.calm ?? 0.6)) {
        for (const rec of gateObjs) {
          if (rec.boards >= PER) continue;
          const along = (h.pos.x - rec.g.x) * -rec.g.nz + (h.pos.z - rec.g.z) * rec.g.nx, out = (h.pos.x - rec.g.x) * rec.g.nx + (h.pos.z - rec.g.z) * rec.g.nz;
          if (Math.abs(along) <= GATE.half && out <= GATE.reachOut && out >= -GATE.reachIn && h.pos.y > 0.25 && h.pos.y < 2.2) { at = rec; break; }
        }
      }
      if (!!at !== hm.on) { hm.on = !!at; hm.ph = 0; hm.struck = false; try { weapons.stow?.(side, hm.on); } catch { /* оръжието остава */ } }
      hm.hold.visible = hm.on;
      if (!hm.on) continue;
      // стои на мястото на оръжието и удря: бърз замах напред, по-бавно връщане
      hm.hold.position.copy(gun.holder.position);
      hm.hold.quaternion.copy(gun.holder.quaternion);
      hm.ph += dt * 2.9;
      const q = hm.ph % 1, sw = q < 0.28 ? q / 0.28 : 1 - (q - 0.28) / 0.72;
      hm.swing.rotation.x = 0.35 - 1.15 * sw * sw;
      if (q >= 0.28 && !hm.struck) { hm.struck = true; try { ctx.haptic(side, 0.6, 28); } catch { /* без вибрация */ } }
      if (q < 0.28) hm.struck = false;
    }
    // варелите: лампичката мига
    const blink = Math.sin(time * 5.2) > 0.2;
    for (const o of bombObjs) if (o.visible) o.userData.dot.visible = blink;
    // взривът
    let fire = 0;
    if (blastT >= 0) {
      blastT += dt;
      const k = blastT / 0.55;
      if (k >= 1) {
        blastT = -1; blast.visible = core.visible = false;
        if (blastLight) blastLight.intensity = 0;
        if (borrowed && signLight) { borrowed = false; signLight.position.set(SIGN.x, SIGN.y, SIGN.z); signLight.color.setHex(0xff3a2a); signLight.distance = 26; }
      } else {
        const e = 1 - (1 - k) * (1 - k);
        blast.scale.setScalar(0.6 + e * BLAST * 1.1); blastMat.uniforms.opacity.value = 1.6 * (1 - k) * (1 - k);
        core.scale.setScalar(0.4 + e * 2.1); coreMat.uniforms.opacity.value = Math.max(0, 2.4 * (1 - k * 2.2));
        fire = (1 - k) * (1 - k);
        if (blastLight) blastLight.intensity = 110 * fire;
      }
    }
    // токът: надписът и лампите примигват и гаснат; после пак така идват
    let power = darkOn ? 0 : 1;
    if (time < flickUntil) power = Math.sin(time * 61) * Math.sin(time * 17.3) > 0 ? 1 : 0;
    darkK += ((darkOn ? 1 : 0) - darkK) * Math.min(1, dt * 1.8);
    for (const m of glow) m.visible = power > 0.5;
    if (signLight) {
      if (borrowed) signLight.intensity = 70 * fire;
      else { const q = Math.sin(time * 31.7) * Math.sin(time * 2.3 + 1.1); signLight.intensity = NEON * power * (q > 0.93 ? 0.35 : 0.92 + 0.08 * Math.sin(time * 9.1)); }
    }
    // светкавицата: два-три къси блясъка, после гръм
    if (time >= boltAt) { boltT = 0; boltAt = time + (darkOn ? 7 + Math.random() * 7 : 17 + Math.random() * 19); thunderAt = time + 0.5 + Math.random() * 1.8; }
    let bolt = 0;
    if (boltT >= 0) {
      boltT += dt;
      const q = boltT;
      bolt = q < 0.07 ? 1 : q < 0.13 ? 0.08 : q < 0.21 ? 0.7 : q < 0.3 ? 0.04 : q < 0.36 ? 0.4 : 0;
      if (q > 0.5) boltT = -1;
    }
    if (thunderAt && time >= thunderAt) { thunderAt = 0; try { audio?.thunder?.(); } catch { /* без звук */ } }
    if (hemi) hemi.intensity = HEMI * (1 - 0.38 * darkK) + bolt * 1.1;
    if (sun) sun.intensity = SUN * (1 - 0.4 * darkK) + bolt * 0.75;
    skyC.copy(nightC).multiplyScalar(1 - 0.35 * darkK).lerp(boltC, bolt * 0.3);
    scene.fog.color.copy(skyC);
    if (scene.background?.isColor) scene.background.copy(skyC);
  }

  // ── фенерът: на оръжието в дясната ръка, а докато го няма, от главата ──
  const LAMP = lite ? 15 : 17;
  const lamp = new THREE.SpotLight(0xfff0d2, LAMP, 42, 0.38, 0.6, 1.05);      // слаб спад: да не прегаря отблизо, а да стига до 20–25 м
  const lampTo = new THREE.Object3D();
  root.add(lamp, lampTo);
  lamp.target = lampTo;
  own.lights.push(lamp);
  let weapons = null;
  const v = new THREE.Vector3(), d = new THREE.Vector3();

  let time = 0;
  function update(dt, t) {
    time = t ?? time + dt;
    for (const f of fires) {
      const n = 0.72 + 0.16 * Math.sin(time * 11.3 + f.ph) + 0.12 * Math.sin(time * 23.7 + f.ph * 1.7) + 0.06 * Math.sin(time * 5.1 + f.ph * 0.3);
      f.light.intensity = f.base * n;
      if (f.fire) f.fire.update(dt);
    }
    live(dt);
    const g = weapons?.mine?.r;
    if (g && g.holder?.visible !== false && g.dir && g.muzzle && (g.active || ctx.hands?.r?.active)) { v.copy(g.muzzle); d.copy(g.dir); }
    else { v.copy(ctx.head.pos); d.set(0, -0.06, -1).applyQuaternion(ctx.head.quat).normalize(); v.addScaledVector(d, 0.1); }
    lamp.position.copy(v);
    { const q = weapons?.sinceShot ? Math.min(weapons.sinceShot('r'), weapons.sinceShot('l')) : 9; lamp.intensity = LAMP * (1 + (q < 0.07 ? 1.1 * (1 - q / 0.07) : 0)); }
    lampTo.position.copy(v).addScaledVector(d, 10);
  }
  update(0, 0);

  function dispose() {
    root.remove(group, lamp, lampTo);
    for (const g of own.geos) g.dispose();
    for (const g of fireGeos.values()) g.dispose();
    for (const f of own.fires) f.dispose();
    for (const m of own.mats) m.dispose();
    for (const l of own.lights) l.dispose?.();
    scene.fog = before.fog; scene.background = before.bg;
    if (hemi && before.hemi) { hemi.intensity = before.hemi[0]; hemi.color.setHex(before.hemi[1]); if (hemi.groundColor && before.hemi[2] != null) hemi.groundColor.setHex(before.hemi[2]); }
    if (sun && before.sun) { sun.intensity = before.sun[0]; sun.color.setHex(before.sun[1]); sun.castShadow = sunShadow; }
  }

  return {
    group, update, dispose,
    attach(parts) { weapons = parts?.weapons || weapons; audio = parts?.audio || audio; fx = parts?.fx || fx; },
    onSnapshot, event, bombs,
    strike() { boltAt = 0; },      // за проби: светкавица веднага
    lamp,
    get info() { return { ...stats, tris: Math.round(stats.tris), lite, fence: F, gates: gateObjs.map(r => r.boards), planks: planks ? planks.count : 0, hammer: Object.fromEntries(Object.entries(hammers).map(([k, v]) => [k, v.on])), bombsAlive: bombs.filter(b => b.alive).length, dark: darkOn }; },
  };
}

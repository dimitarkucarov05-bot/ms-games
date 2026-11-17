// Игровите предмети и станции на „Задната стая" от Synty моделите (SPEC т. 11).
//
//   await installSyntyKinds({ THREE, assets, models, theme, start })
//
// Зарежда нужните модели през assets (createAssets()) и подава provider на models.setAssetProvider.
// Всеки модел се смалява до размера от SPEC т. 3, началото е в центъра на основата, лицето гледа към +Z.
// Нищо тук не хвърля грешка навън: при проблем се пише в конзолата и видът остава без Synty модел (make връща null).

const SHOPS = 'shops-pack';
const KIDS = 'kids-pack';
const GW = 'gang-warfare-pack';
const GW_MAP = 'tex/PolygonGangWarfare_Texture_01_A.png';
const FARM = 'farm-pack', FARM_MAP = 'tex/PolygonFarm_Texture_01_A.png';     // в pack.json на този пакет материалите са без текстура: слагаме я тук
const CHAR_BASE = '/play/assets/synty/_characters/';
const GLTF_URL = '/play/vendor/addons/loaders/GLTFLoader.js';
const SKEL_URL = '/play/vendor/addons/utils/SkeletonUtils.js';
const TAU = Math.PI * 2;

/** Размерите от SPEC т. 3: ширина × височина × дълбочина (м). */
export const SPEC_SIZE = {
  pizza: [0.33, 0.14, 0.33], sauce: [0.14, 0.03, 0.11], cheese: [0.12, 0.10, 0.28], veg: [0.18, 0.07, 0.15], meat: [0.11, 0.05, 0.11],
  cup: [0.07, 0.12, 0.07], tray: [0.76, 0.13, 0.57], meatbox: [0.76, 0.2, 0.57],
  white: [0.14, 0.03, 0.11], mustard: [0.14, 0.03, 0.11], shrimp: [0.15, 0.06, 0.20], ham: [0.12, 0.04, 0.16], bacon: [0.07, 0.03, 0.32],
  pineapple: [0.19, 0.02, 0.19], onion: [0.11, 0.07, 0.27], greens: [0.24, 0.06, 0.24],
  bin: [0.30, 0.85, 0.30], oven: [0.70, 0.85, 0.50], drinks: [0.50, 1.40, 0.40],
  prep: [0.80, 0.85, 0.50], counter: [6, 0.85, 0.50], trash: [0.35, 0.60, 0.35], grinder: [0.60, 0.85, 0.50], hopper: [0.70, 1.60, 0.50],
  wall: [2.4, 2.4, 0.10], door: [1.20, 2.0, 0.08], shutter: [6, 1.2, 0.05], sign: [1.6, 0.5, 0.05], customer: [0.6, 1.7, 0.4],
  elevator: [1.6, 2.3, 1.6], button: [0.14, 0.10, 0.06],
};

const SURFACE_Y = 0.85;
const SHADOW = new Set(['bin', 'oven', 'drinks', 'prep', 'counter', 'trash', 'grinder', 'hopper', 'door', 'customer', 'elevator']);

/** Всички Synty модели, които този файл ползва: [пакет, модел]. */
function modelList(theme) {
  const s = n => [SHOPS, `SM_Prop_${n}`], gen = n => [SHOPS, `SM_Gen_Prop_${n}`];
  return [
    s('Food_Pizza_Dough_01'),
    ...[1, 2, 3, 4, 5, 6, 8].flatMap(i => ['Raw', 'Cooked', 'Burnt'].map(k => s(`Food_Pizza_${k}_0${i}`))),
    s('Food_Sauce_Bowl_01'), s('Food_Cheese_Grated_01'), s('Food_Mushroom_Sliced_01'), s('Food_Salami_Sliced_01'), s('Food_Cup_01'),
    s('Food_Oven_Tray_01'), s('Food_Salami_Whole_01'), gen('Food_Meat_01'), gen('Food_Meat_06'),
    s('Cardboard_Box_02'), s('Kitchen_Pizza_Oven_01'), s('Kitchen_Stove_Oven_01'), s('Kitchen_Drinks_Machine_01'),
    s('Kitchen_Prep_Table_01'), s('Kitchen_Prep_Table_02'), s('Kitchen_Counter_Section_01'), s('Rubbish_Bin_03'),
    gen('Button_02'), gen('Lever_02'),
    [SHOPS, 'SM_Bld_Wall_Shutter_01'], s('Notice_Board_01'),
    [SHOPS, 'SM_Bld_Wall_Elevator_Insert_01'], s('Elevator_Buttons_01'), s('Elevator_Arrows_01'),
    ...['Table_Metal_01', 'CardboardBox_Open_01', 'Shelf_01', 'Lab_Tank_01', 'Lab_Bulb_03', 'Lab_MachinePanel_01', 'Manhole_01'].map(n => [GW, `SM_Prop_${n}`]),
    // 1.1: filled sauce bowls, more toppings
    s('Food_Sauce_Ketchup_01'), s('Food_Sauce_Mayo_01'), s('Food_Sauce_Mustard_01'), s('Food_Fish_Shrimp_01'), s('Food_Luncheon_Sliced_01'),
    s('Food_Bacon_Cooked_01'), s('Food_Pineapple_Ring_01'), s('Food_Onion_Sliced_01'), s('Food_Lettuce_Leaves_01'),
    // 1.1: the cellar lab (not in the kids theme)
    ...(theme === 'kids' ? [] : [s('Market_Freezer_03'), s('Blender_01'), s('Computer_TV_Wall_01'), [FARM, 'SM_Prop_SeedPacket_01'], [FARM, 'SM_Prop_Cabbage_01_S'], [GW, 'SM_Prop_Box_01'],
      ...['Plant_01', 'Plant_Bucket_01', 'Plant_Light_01', 'Blender_01', 'Blender_Jug_01', 'Lab_Bulb_02', 'Chemical_03', 'Chemical_05', 'ZipBag_Green_S_01',
        'ZipBag_Blue_S_01', 'ZipBag_White_S_01', 'Pills_01', 'Cigarette_Long_01', 'Cigarette_Pack_01', 'Bottle_Small_01'].map(n => [GW, `SM_Prop_${n}`])]),
  ];
}

// Ръцете на играчите (Sidekick, изпечени от characters.mjs). Има ги след като installSyntyKinds приключи.
// Ставите на пръстите идват от tools/synty/hand_rig.py (hands/hand_l|r.json): с тях ръката стои отпусната и хваща.
let handProtos = null, handRigs = null;

// ъгли на свиване (радиани) по пръсти: [първа става, втора става]; палецът: [прибиране под дланта, свиване, към показалеца]
const HAND_REST = { index: [0.08, 0.30], middle: [0.13, 0.36], ring: [0.18, 0.40], pinky: [0.24, 0.44], thumb: [0.12, 0.18, 0.05] };
const HAND_HOLD = { index: [0.80, 1.05], middle: [0.88, 1.12], ring: [0.95, 1.16], pinky: [1.00, 1.20], thumb: [0.70, 0.55, 0.25] };

/** Движи пръстите на едно копие на ръката: връща pose(dt, grip, trigger, веднага). grip и trigger са от 0 до 1. */
function handPoser(THREE, geo, rig, side) {
  const P = geo.attributes.position, N = geo.attributes.normal, p0 = Float32Array.from(P.array), n0 = Float32Array.from(N.array);
  const joints = rig.joints, n = joints.length, by = {}, J = rig.J, W = rig.W, count = P.count;
  joints.forEach((q, i) => { by[q.name] = i; });
  const pos = joints.map(q => new THREE.Vector3(q.pos[0], q.pos[1], q.pos[2]));
  const axis = joints.map(() => new THREE.Vector3(1, 0, 0)), up = new THREE.Vector3(0, 1, 0);
  const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
  for (const f of FINGERS) {                          // оста на свиване: напречно на пръста, успоредно на кокалчетата
    const a = by[`${f}_01`], b = by[`${f}_02`];
    if (a === undefined) continue;
    const d = b !== undefined ? pos[b].clone().sub(pos[a]).normalize() : pos[a].clone().normalize();
    const ax = new THREE.Vector3().crossVectors(up, d).normalize();
    for (const k of [a, b, by[`${f}_03`]]) if (k !== undefined) axis[k].copy(ax);
  }
  const sgn = side === 'r' ? 1 : -1;
  const opp = by.index_01 !== undefined ? pos[by.index_01].clone().normalize().negate() : new THREE.Vector3(0, 0, 1);   // палецът се прибира около посоката към показалеца
  const M = joints.map(() => new THREE.Matrix4()), L = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v = new THREE.Vector3();
  const ang = new Float32Array(n), cur = { grip: 0, trig: 0, done: false };
  const mix = (a, b, t) => a + (b - a) * t;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.02, -0.09), 0.2);

  function solve(grip, trig) {
    let o1 = 0, o3 = 0;
    for (const f of FINGERS) {
      const a = by[`${f}_01`], b = by[`${f}_02`], R = HAND_REST[f], H = HAND_HOLD[f];
      const g = f === 'index' ? Math.max(grip * 0.92, trig) : grip;
      if (f === 'thumb') { o1 = mix(R[0], H[0], g); o3 = mix(R[2], H[2], g); if (a !== undefined) ang[a] = 0; if (b !== undefined) ang[b] = mix(R[1], H[1], g); continue; }
      if (a !== undefined) ang[a] = mix(R[0], H[0], g);
      if (b !== undefined) ang[b] = mix(R[1], H[1], g);
      const c = by[`${f}_03`]; if (c !== undefined) ang[c] = mix(R[1], H[1], g) * 0.7;
    }
    for (let i = 0; i < n; i++) {
      const par = joints[i].parent;
      if (par < 0) { M[i].identity(); continue; }
      q.setFromAxisAngle(axis[i], ang[i]);
      if (i === by.thumb_01) { q.setFromAxisAngle(opp, sgn * o1); q2.setFromAxisAngle(up, -sgn * o3); q.premultiply(q2); }
      L.makeRotationFromQuaternion(q);
      v.copy(pos[i]).applyQuaternion(q);
      L.setPosition(pos[i].x - v.x, pos[i].y - v.y, pos[i].z - v.z);       // въртене около мястото на ставата
      M[i].multiplyMatrices(M[par], L);
    }
    const pa = P.array, na = N.array;
    for (let i = 0; i < count; i++) {
      const x = p0[i * 3], y = p0[i * 3 + 1], z = p0[i * 3 + 2], nx = n0[i * 3], ny = n0[i * 3 + 1], nz = n0[i * 3 + 2];
      let ox = 0, oy = 0, oz = 0, mx = 0, my = 0, mz = 0;
      for (let k = 0; k < 4; k++) {
        const w = W[i * 4 + k];
        if (w <= 0) continue;
        const e = M[J[i * 4 + k]].elements;
        ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
        mx += w * (e[0] * nx + e[4] * ny + e[8] * nz); my += w * (e[1] * nx + e[5] * ny + e[9] * nz); mz += w * (e[2] * nx + e[6] * ny + e[10] * nz);
      }
      const l = Math.hypot(mx, my, mz) || 1;
      pa[i * 3] = ox; pa[i * 3 + 1] = oy; pa[i * 3 + 2] = oz; na[i * 3] = mx / l; na[i * 3 + 1] = my / l; na[i * 3 + 2] = mz / l;
    }
    P.needsUpdate = true; N.needsUpdate = true;
  }

  return function pose(dt, grip, trig, now) {
    const g = Math.max(0, Math.min(1, +grip || 0)), t = Math.max(0, Math.min(1, +trig || 0));
    const k = now ? 1 : 1 - Math.exp(-(dt || 0.016) * 22);
    const ng = cur.grip + (g - cur.grip) * k, nt = cur.trig + (t - cur.trig) * k;
    if (cur.done && Math.abs(ng - cur.grip) < 0.002 && Math.abs(nt - cur.trig) < 0.002) return;
    cur.grip = ng; cur.trig = nt; cur.done = true;
    solve(ng, nt);
  };
}

/**
 * Ръка на играч: side е 'l' или 'r'. Началото е в китката, пръстите сочат към −Z, дланта гледа надолу,
 * дължината е 0.19 м. userData.pose(dt, grip, trigger) свива пръстите (без него ръката е отпусната).
 * Преди installSyntyKinds (или ако ръцете липсват) връща null.
 */
export function makeHand(THREE, side) {
  const k = side === 'l' ? 'l' : 'r', p = handProtos && handProtos[k];
  if (!p) return null;
  const g = new THREE.Group(), rig = handRigs && handRigs[k];
  if (rig && rig.J.length === p.geometry.attributes.position.count * 4) {
    const geo = p.geometry.clone();         // свои върхове: пръстите се местят
    const m = new THREE.Mesh(geo, p.material);
    m.name = p.name;
    g.add(m);
    g.userData.pose = handPoser(THREE, geo, rig, k);
    g.userData.pose(0, 0, 0, true);
    g.userData.dispose = () => geo.dispose();
  } else g.add(p.clone());                  // без ставите: неподвижна (геометрията и материалът са общи)
  g.userData.kind = 'hand'; g.userData.synty = true; g.userData.tris = p.userData.tris;
  return g;
}

let avatarMaker = null, walkerMaker = null;
/** Минувач за града: герой със скелет, който върви на място (мести го този, който го ползва). { group, update(dt, върви), dispose() } или null. */
export function makeWalker(i) { try { return walkerMaker ? walkerMaker(i) : null; } catch (e) { console.warn('[synty-kinds] минувач', e); return null; } }
/**
 * Тяло за друг играч (герой със скелет): n е номерът на каската и избира героя. Връща
 * { group, update(head, l, r, dt), dispose() } или null преди installSyntyKinds. Групата се слага в координатите на залата.
 */
export function makeAvatarBody(n) { try { return avatarMaker ? avatarMaker(n) : null; } catch (e) { console.warn('[synty-kinds] тяло на играч', e); return null; } }

export async function installSyntyKinds({ THREE, assets, models, theme, start } = {}) {
  try {
    if (!THREE || !assets) throw new Error('трябват THREE и assets');
    const kit = createKit(THREE, assets, theme || start?.theme || 'night', models || null);
    await kit.load();
    if (models && typeof models.setAssetProvider === 'function') models.setAssetProvider(kit.provider);
    return kit.provider;
  } catch (e) {
    console.warn('[synty-kinds] Synty моделите не са заредени:', e);
    return null;
  }
}

function createKit(THREE, A, theme, models) {
  const protos = new Map();        // ключ → Group образец (слети мешове, общи геометрии и материали)
  const mats = new Map();          // собствени материали (течности, оцветени варианти)
  const warned = new Set();
  const warn = (what, e) => { if (!warned.has(what)) { warned.add(what); console.warn('[synty-kinds]', what, e?.message || e || ''); } };

  async function load() {
    const list = modelList(theme);
    await Promise.all([...new Set(list.map(m => m[0]))].map(s => A.loadPack(s).catch(e => warn(`пакет ${s}`, e))));
    await Promise.all([A.preload(list), loadCrowd().catch(e => warn('клиенти', e)), loadHands().catch(e => warn('ръце', e))]);
    await loadAvatars().catch(e => warn('играчи', e));
  }

  /** Описът на героите и зареждачите за тях (веднъж). */
  let lib = null;
  function charLib() {
    return lib ||= (async () => {
      const res = await fetch(`${CHAR_BASE}characters.json`);
      if (!res.ok) throw new Error('няма _characters/characters.json (пусни node tools/synty/characters.mjs)');
      const man = await res.json();
      const [{ GLTFLoader }, skel] = await Promise.all([import(GLTF_URL), import(SKEL_URL)]);
      return { man, loader: new GLTFLoader(), clone: skel.clone, texLoader: new THREE.TextureLoader() };
    })();
  }
  function charTexture(texLoader, file, palette) {
    const t = texLoader.load(CHAR_BASE + file);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    if (palette) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }   // малка палитра: без преливане между цветовете
    return t;
  }

  async function loadHands() {
    const { man, loader, texLoader } = await charLib();
    if (!man.hands) return;
    const out = {};
    await Promise.all(['l', 'r'].map(async side => {
      const h = man.hands[side]; if (!h) return;
      const src = firstMesh((await loader.loadAsync(CHAR_BASE + h.file)).scene);
      if (!src) return;
      const mat = ownMat(`hand:${h.tex}`, () => new THREE.MeshLambertMaterial({ map: h.tex ? charTexture(texLoader, h.tex, true) : null }));
      const m = new THREE.Mesh(src.geometry, mat);
      m.name = `hand_${side}`; m.userData.tris = h.tris;
      out[side] = m;
    }));
    if (out.l || out.r) handProtos = out;
    const rigs = {};
    await Promise.all(['l', 'r'].map(async side => {
      const r = await fetch(`${CHAR_BASE}hands/hand_${side}.json`).then(x => (x.ok ? x.json() : null)).catch(() => null);
      if (r && Array.isArray(r.joints) && Array.isArray(r.J) && Array.isArray(r.W)) rigs[side] = r;
    }));
    handRigs = rigs;
  }

  /** Показание от models.js (игла, лента, рецепта, текст, търпение): закача се за модела, а го кара models.js. */
  function indicator(obj, kind, opts) {
    try {
      const ind = models && typeof models.makeIndicator === 'function' ? models.makeIndicator(THREE, kind, { theme, ...opts }) : null;
      if (ind) { obj.add(ind); obj.userData.indicator = ind; }
    } catch (e) { warn(`показание ${kind}`, e); }
    return obj;
  }

  // ---------- помощници ----------

  /**
   * Копие на Synty модел, наместено в кутия: o = { w, h, d, x, y, z, yaw, fit }.
   * (x, y, z) е центърът на основата на кутията. fit: 'uniform' (влиза цял, равномерно), 'fill' (равномерно по
   * отпечатъка, височината се сплесква само ако стърчи), 'box' (опъва се точно по кутията).
   */
  function place(slug, name, o) {
    const src = A.getSync(slug, name), info = A.info(slug, name);
    if (!src || !info) throw new Error(`липсва ${slug}/${name}`);
    const mat = o.mat || (o.map && typeof A.material === 'function' ? A.material(slug, o.map) : null);
    if (mat) src.traverse(x => { if (x.isMesh) x.material = mat; });
    const q = Math.round((o.yaw || 0) / (Math.PI / 2)) & 3;
    let [x0, y0, z0] = info.min, [x1, y1, z1] = info.max;
    for (let i = 0; i < q; i++) [x0, x1, z0, z1] = [z0, z1, -x1, -x0];
    if (o.up) [y0, y1, z0, z1] = [z0, z1, -y1, -y0];             // легнал модел се изправя: неговото +Z става нагоре (само при yaw = 0)
    const bx = Math.max(1e-5, x1 - x0), by = Math.max(1e-5, y1 - y0), bz = Math.max(1e-5, z1 - z0);
    let kx, ky, kz;
    if (o.fit === 'box') { kx = o.w / bx; ky = o.h / by; kz = o.d / bz; }
    else {
      const s = o.fit === 'fill' ? Math.min(o.w / bx, o.d / bz) : Math.min(o.w / bx, o.h / by, o.d / bz);
      kx = ky = kz = s;
      if (o.fit === 'fill' && by * s > o.h) ky = o.h / by;
    }
    src.rotation.y = q * Math.PI / 2;
    if (o.up) { src.rotation.x = -Math.PI / 2; src.scale.set(kx, kz, ky); }
    else if (q & 1) src.scale.set(kz, ky, kx); else src.scale.set(kx, ky, kz);
    src.position.set((o.x || 0) - (x0 + x1) / 2 * kx, (o.y || 0) - y0 * ky, (o.z || 0) - (z0 + z1) / 2 * kz);
    src.userData.top = (o.y || 0) + by * ky;
    return src;
  }

  /** Наместен модел, разделен на части по името на възела: { ключ: [самостоятелни мешове] } (за врати и други движещи се части). */
  function placedParts(slug, name, o, keyOf) {
    const src = place(slug, name, o), out = {};
    src.updateMatrixWorld(true);
    src.traverse(n => {
      if (!n.isMesh) return;
      const m = new THREE.Mesh(n.geometry, n.material);
      m.matrixAutoUpdate = false; m.matrix.copy(n.matrixWorld);
      (out[keyOf(n.name)] ||= []).push(m);
    });
    return out;
  }

  /** Образец: частите се сливат в по един Mesh на материал; копията делят геометрията. */
  function proto(key, build) {
    let p = protos.get(key);
    if (!p) {
      const parts = [].concat(build()).filter(Boolean);
      p = A.merge(parts);
      let tris = 0, top = 0;
      p.traverse(o => {
        if (!o.isMesh) return;
        tris += o.geometry.attributes.position.count / 3;
        o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
        top = Math.max(top, o.geometry.boundingBox.max.y);
      });
      p.userData.tris = tris; p.userData.top = top;
      protos.set(key, p);
    }
    return p;
  }
  function inst(key, build) {
    const p = proto(key, build), c = p.clone(true);
    c.userData.tris = p.userData.tris; c.userData.top = p.userData.top;
    return c;
  }
  const firstMesh = obj => { let m = null; obj.traverse(o => { if (!m && o.isMesh) m = o; }); return m; };

  function ownMat(key, make) { let m = mats.get(key); if (!m) { m = make(); m.name = `synty-kinds:${key}`; mats.set(key, m); } return m; }
  const flat = (key, color) => ownMat(key, () => new THREE.MeshLambertMaterial({ color }));
  /** Оцветен вариант на общ материал от пакета (една и съща текстура). */
  function tinted(base, key, color, emissive = 0x000000) {
    return ownMat(`${base.uuid}:${key}`, () => { const m = base.clone(); m.color.set(color); if (m.emissive) m.emissive.set(emissive); return m; });
  }
  let geoCache = null;
  function geos() {
    return geoCache ||= {
      box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),            // началото е в основата
      liquid: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
      disc: new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),          // радиус 1, гледа нагоре
    };
  }

  const item = (kind, model, fit = 'fill') => () => {
    const [w, h, d] = SPEC_SIZE[kind];
    return inst(kind, () => place(SHOPS, `SM_Prop_${model}`, { w, h, d, fit }));
  };

  // ---------- предмети ----------

  const cookStage = c => (c >= 2 ? 2 : c >= 1 ? 1 : 0);

  // ---------- пицата ----------
  // Оригиналните пици на Shops Pack в мащаб 1 (0.58 м). Всяка наредба от добавки има свой модел, суров, изпечен и изгорял:
  // 1 само тесто, 2 със сос, 3 сос и кашкавал, 4 с месо, 5 с двойно месо, 6 месо и гъби, 8 двойно месо и гъби.
  const PIZZA_STAGE = ['Raw', 'Cooked', 'Burnt'];
// Where the stack has no model of its own, the nearest original pizza is the base and the rest is laid on it:
  // a flat layer for white or mustard sauce, and the original topping models in a ring.
  const SAUCE_COL = { sauce: 0xa8281c, white: 0xf1e7cf, mustard: 0xd8a31e };
  const SCATTER = {
    cheese: ['SM_Prop_Food_Cheese_Grated_01', 3], veg: ['SM_Prop_Food_Mushroom_Sliced_01', 4], meat: ['SM_Prop_Food_Salami_Sliced_01', 5],
    shrimp: ['SM_Prop_Food_Fish_Shrimp_01', 4], ham: ['SM_Prop_Food_Luncheon_Sliced_01', 4], bacon: ['SM_Prop_Food_Bacon_Cooked_01', 4],
    pineapple: ['SM_Prop_Food_Pineapple_Ring_01', 3], onion: ['SM_Prop_Food_Onion_Sliced_01', 4], greens: ['SM_Prop_Food_Lettuce_Leaves_01', 3],
  };
  /** [number of the original model, what still has to be laid on it]. */
  function pizzaBase(stack) {
    if (!stack.length || stack[0] !== 'sauce') return [1, stack.slice()];          // plain dough; another sauce is a layer on it
    if (!stack.includes('cheese')) return [2, stack.filter(k => k !== 'sauce')];
    const n = stack.filter(k => k === 'meat').length, v = stack.includes('veg'), used = new Set(['sauce', 'cheese']);
    let base = 3;
    if (n) { base = n === 1 ? (v ? 6 : 4) : (v ? 8 : 5); used.add('meat'); if (v) used.add('veg'); }
    return [base, stack.filter(k => !used.has(k))];
  }
  const pizzaProto = key => proto(`pizza:${key}`, () => {
    if (key === 'ball') return natural(SHOPS, 'SM_Prop_Food_Pizza_Dough_01');
    const [base, stage, ex] = key.split(':');
    const model = `SM_Prop_Food_Pizza_${PIZZA_STAGE[+stage]}_0${base}`, top = (A.info(SHOPS, model)?.size?.[1] || 0.03);
    const parts = [natural(SHOPS, model)];
    let ring = 0;
    for (const k of ex ? ex.split(',') : []) {
      if (SAUCE_COL[k]) {
        const layer = new THREE.Mesh(geos().disc, flat(`sauce:${k}:${stage}`, +stage === 2 ? 0x241a14 : SAUCE_COL[k]));
        layer.scale.set(0.245, 1, 0.245);
        layer.position.y = top + 0.0015;
        layer.updateMatrixWorld(true);
        parts.push(layer);
        continue;
      }
      const sc = SCATTER[k];
      if (!sc || !A.info(SHOPS, sc[0])) continue;
      const [w, h, d] = A.info(SHOPS, sc[0]).size, n = sc[1], r = Math.max(w, d) > 0.25 ? 0.12 : 0.155;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU + ring * 0.85;
        parts.push(place(SHOPS, sc[0], { w, h, d, fit: 'uniform', x: Math.sin(an) * r, y: top + 0.003 + ring * 0.006, z: Math.cos(an) * r, yaw: (i + ring) * Math.PI / 2 }));
      }
      ring++;
    }
    return parts;
  });
  function setPizza(obj, st) {
    const stack = Array.isArray(st.stack) ? st.stack : [];
    const [base, extras] = pizzaBase(stack);
    const key = st.ball && !stack.length ? 'ball' : `${base}:${cookStage(Number(st.cook) || 0)}:${extras.join(',')}`;
    if (obj.userData.key === key) return true;
    obj.userData.key = key;
    obj.clear();
    const p = pizzaProto(key);
    obj.add(p.clone(true));
    obj.userData.top = p.userData.top; obj.userData.tris = p.userData.tris;
    return true;
  }
  function makePizza(opts = {}) { const g = new THREE.Group(); setPizza(g, opts.state || { stack: [], cook: 0, ball: false }); return g; }
  // добавките в ръка: купичка сос, настърган кашкавал, нарязани гъби, нарязан салам (всичко в мащаб 1)
  const natItem = (key, model) => () => inst(key, () => natural(SHOPS, model));

  const DRINK = { cola: 0x3a1c10, orange: 0xff9a1f };
  function makeCup() {
    const g = item('cup', 'Food_Cup_01', 'uniform')();
    const h = g.userData.top || SPEC_SIZE.cup[1], k = h / 0.265;          // мащабът спрямо Synty чашата (0.265 м)
    // Нивото е плосък диск вътре в чашата: радиусът следва стената ѝ (0.05 на дъното, 0.08 горе в Synty мерки),
    // затова никъде не я пробива и няма трептене.
    const liquid = new THREE.Mesh(geos().disc, flat('cola', DRINK.cola));
    liquid.userData.r0 = 0.046 * k; liquid.userData.r1 = 0.074 * k; liquid.userData.y0 = 0.012 * k; liquid.userData.y1 = h * 0.9;
    liquid.visible = false;
    g.add(liquid);
    g.userData.liquid = liquid; g.userData.fill = 0;
    return g;
  }
  function setCup(obj, st, dt) {
    const liquid = obj.userData.liquid; if (!liquid) return true;
    const target = Math.max(0, Math.min(1, Number(st.fill) || 0));
    const k = dt === undefined ? 1 : Math.min(1, dt * 8);
    const fill = obj.userData.fill += (target - obj.userData.fill) * k;
    liquid.visible = fill > 0.02;
    if (liquid.visible) {
      const u = liquid.userData, r = u.r0 + (u.r1 - u.r0) * fill;
      liquid.scale.set(r, 1, r);
      liquid.position.y = u.y0 + (u.y1 - u.y0) * fill;
      liquid.material = flat(st.drink === 'orange' ? 'orange' : 'cola', DRINK[st.drink] || DRINK.cola);
    }
    return true;
  }

  // ---------- мазето: предмети ----------
  const gw = (model, o) => place(GW, `SM_Prop_${model}`, { map: GW_MAP, ...o });
  const natGW = (model, o = {}) => natural(GW, `SM_Prop_${model}`, { map: GW_MAP, ...o });
  // празната тава и тавата с месо: оригиналната дълбока тава за фурна (0.76 x 0.13 x 0.57) с оригинални меса и колбаси в нея
  const makeTray = () => inst('tray', () => natural(SHOPS, 'SM_Prop_Food_Oven_Tray_01'));
  const makeMeatbox = () => inst('meatbox', () => [
    natural(SHOPS, 'SM_Prop_Food_Oven_Tray_01'),
    ...(theme === 'kids' ? [] : [
      natural(SHOPS, 'SM_Gen_Prop_Food_Meat_01', { x: -0.15, y: 0.03, front: 0.03 }),
      natural(SHOPS, 'SM_Gen_Prop_Food_Meat_06', { x: 0.13, y: 0.03, front: 0.24 }),
    ]),
    natural(SHOPS, 'SM_Prop_Food_Salami_Whole_01', { x: 0.06, y: 0.035, front: -0.10 }),
    natural(SHOPS, 'SM_Prop_Food_Salami_Whole_01', { x: -0.07, y: 0.035, front: -0.19 }),
  ]);

  // ---------- пещта, масата за редене, копчето за пода ----------
  // Пещта в естествен размер е тухлената пещ на Shops Pack върху масата си; пицата влиза в устието ѝ.
  const makeOven = (opts = {}) => (opts.nat
    ? inst('oven:nat', () => natural(SHOPS, 'SM_Prop_Kitchen_Pizza_Oven_01', { front: NAT_FRONT }))
    : raised('oven', 'SM_Prop_Kitchen_Stove_Oven_01', 0.74)(opts));
  const makePrep = (opts = {}) => (opts.nat
    ? inst('prep:nat', () => natural(SHOPS, 'SM_Prop_Kitchen_Prep_Table_01', { front: NAT_FRONT }))
    : boxed('prep', 'SM_Prop_Kitchen_Prep_Table_02')(opts));
  // Копчето: оригиналното червено копче (SM_Gen_Prop_Button_02). Свети силно, когато срещу него стои грубиян (или доставчик).
  function makeButton(opts = {}) {
    const g = new THREE.Group();
    const b = inst('button', () => natural(SHOPS, 'SM_Gen_Prop_Button_02'));
    if (!opts.nat) { b.rotation.x = Math.PI / 2; b.position.set(0, 0.05, -0.03); }      // на лицето на тезгяха: върхът му гледа към човека
    g.add(b);
    const mesh = firstMesh(b);
    g.userData.button = { mesh, base: mesh ? mesh.material : null, t: 0 };
    g.userData.tris = b.userData.tris;
    return g;
  }
  function setButton(obj, st, dt) {
    const e = obj.userData.button; if (!e || !e.mesh) return true;
    e.t += dt > 0 ? dt : 0;
    if (st.lit) {
      const m = tinted(e.base, 'btnLit', 0xffffff, 0xff2a1a);
      m.emissiveIntensity = 0.6 + 0.4 * Math.sin(e.t * 7);
      e.mesh.material = m;
    } else e.mesh.material = st.armed ? tinted(e.base, 'btnArmed', 0xffffff, 0x5a0e08) : e.base;
    return true;
  }
  // Капакът в пода под клиента (оригиналният капак на шахта от Gang Warfare) и сандъкът на доставчика в детската тема.
  const makeCover = () => inst('cover', () => natGW('Manhole_01'));
  const makeCrate = () => inst('crate', () => natural(SHOPS, 'SM_Prop_Cardboard_Box_02'));

  // ---------- мелачката и казанът ----------
  // Оригиналната стоманена маса (Gang Warfare), на нея лостът (SM_Gen_Prop_Lever_02), кутията на мотора и лампата.
  // Лампата свети зелено, когато лостът трябва да се дръпне; тъмночервено, когато има товар, но не е моментът; иначе е угаснала.
  // С всеки точен удар в тавата пада по едно парче месо; на третия тавата е пълна.
  function makeGrinder(opts = {}) {
    const g = new THREE.Group();
    const nat = !!opts.nat, top = nat ? (opts.h || 0.92) : SURFACE_Y;
    const lx = nat ? 0.35 : 0.20, sx = nat ? -0.45 : -0.13;
    const body = inst(`grinder:${nat ? 'nat' : 'box'}:${opts.rack ? 1 : 0}`, () => (nat ? [
      opts.rack ? natGW('Table_Metal_01', { front: NAT_FRONT }) : null,
      natural(SHOPS, 'SM_Gen_Prop_Lever_02', { x: lx, y: top, front: 0.10 }),
      natGW('Lab_MachinePanel_01', { x: 0.85, y: top, front: -0.05 }),
    ] : [
      gw('Table_Metal_01', { w: SPEC_SIZE.grinder[0], h: top, d: SPEC_SIZE.grinder[2], fit: 'box' }),
      place(SHOPS, 'SM_Gen_Prop_Lever_02', { w: 0.12, h: 0.22, d: 0.14, x: lx, y: top, fit: 'uniform' }),
    ]));
    const lamp = inst('grinder:lamp', () => (nat
      ? natGW('Lab_Bulb_03', { x: lx, y: top, front: -0.12 })
      : gw('Lab_Bulb_03', { w: 0.07, h: 0.10, d: 0.07, x: lx, y: top, z: -0.17, fit: 'uniform' })));
    const bits = nat ? [0, 1].map(i => {
      const m = inst(`grinder:bit${i}`, () => natural(SHOPS, i ? 'SM_Gen_Prop_Food_Meat_06' : 'SM_Gen_Prop_Food_Meat_01', { x: sx + (i ? 0.13 : -0.15), y: top + 0.03, front: i ? 0.24 : 0.03 }));
      m.visible = false;
      return m;
    }) : [];
    g.add(body, lamp, ...bits);
    const lm = firstMesh(lamp);
    g.userData.grinder = { lamp: lm, base: lm ? lm.material : null, bits };
    g.userData.tris = body.userData.tris;
    return g;
  }
  function setGrinder(obj, st) {
    const e = obj.userData.grinder; if (!e) return true;
    const z = Array.isArray(st.zone) ? st.zone : [0, 0], n = Number(st.needle) || 0;
    const loaded = (st.load | 0) > 0 && st.on !== false, go = loaded && n >= z[0] && n <= z[1];
    if (e.lamp && e.base) e.lamp.material = !loaded ? tinted(e.base, 'lampOff', 0x4a4a4a) : go ? tinted(e.base, 'lampGo', 0xffffff, 0x2cff5a) : tinted(e.base, 'lampWait', 0xffffff, 0x8a1408);
    e.bits.forEach((m, i) => { m.visible = (st.hits | 0) > i; });
    return true;
  }
  // Казанът, в който падат отгоре: оригиналният резервоар на Gang Warfare (1.37 x 2.07 x 1.27).
  const makeHopper = (opts = {}) => (opts.nat
    ? inst('hopper:nat', () => natGW('Lab_Tank_01', { front: NAT_FRONT }))
    : inst('hopper', () => gw('Lab_Tank_01', { w: SPEC_SIZE.hopper[0], h: SPEC_SIZE.hopper[1], d: SPEC_SIZE.hopper[2], fit: 'box' })));

  function makeSign(opts) {
    const w = opts.w || SPEC_SIZE.sign[0], h = opts.h || SPEC_SIZE.sign[1], d = opts.d || SPEC_SIZE.sign[2];
    const g = inst(`sign:${w}:${h}:${d}`, () => place(SHOPS, 'SM_Prop_Notice_Board_01', { w, h, d, fit: 'box' }));
    return indicator(g, 'sign', { w, h, d, text: opts.text ?? opts.state?.text ?? '' });
  }

  // ---------- станции ----------

  // Кашон със стока: затворен кашон отдолу, отворен отгоре, а в него се вижда това, което се взима.
  const BIN_OPEN_Y = 0.50, BIN_FLOOR_Y = 0.62;
  function makeBin(opts) {
    const gives = opts.gives || opts.state?.gives || null;
    const [w, h, d] = SPEC_SIZE.bin;
    const g = inst('bin', () => [
      place(SHOPS, 'SM_Prop_Cardboard_Box_02', { w, h: BIN_OPEN_Y, d, fit: 'box' }),
      gw('CardboardBox_Open_01', { w, h: h - BIN_OPEN_Y, d, y: BIN_OPEN_Y, fit: 'box' }),
    ]);
    g.userData.gives = null;
    setBin(g, { gives });
    return g;
  }
  /** В отворения кашон са наредени няколко броя от това, което дава; най-горният е на височината за взимане. */
  function setBin(obj, st) {
    if (obj.userData.shelf) {                                 // продукт на рафт: купчинката му е сложена при създаването
      if (obj.userData.pile && st.stock != null) obj.userData.pile.visible = st.stock > 0;      // месото го има само докато има запас
      return true;
    }
    const gives = st.gives || obj.userData.gives;
    if (!gives || gives === obj.userData.gives) return true;
    obj.userData.gives = gives;
    if (obj.userData.sample) obj.remove(obj.userData.sample);
    if (!makers[gives] || gives === 'bin') return true;
    // стоката в кашона е слята в един меш на материал (една и съща за всички кашони с този вид)
    const sample = inst(`bin:${gives}`, () => {
      const [sw, sh] = SPEC_SIZE[gives] || [0.1, 0.05];
      const flatThing = sh < 0.06;                                // плоските неща са на купчинки, високите са прави едно до друго
      const spots = sw > 0.15 ? [[0, 0]] : flatThing ? [[-0.065, -0.06], [0.065, -0.05], [0, 0.065]] : [[-0.07, -0.07], [0.07, -0.06], [-0.06, 0.07], [0.07, 0.07]];
      const layers = flatThing ? 3 : 1, parts = [];
      for (const [x, z] of spots) for (let l = 0; l < layers; l++) {
        const it = gives === 'pizza' ? pizzaProto('ball').clone(true) : make(gives, {});
        if (!it) break;
        const top = it.userData.top || sh;
        // най-горният е малко над ръба на кашона, на височината за взимане
        it.position.set(x, SURFACE_Y + 0.012 - (flatThing ? (layers - l) * top * 0.9 : top), z);
        it.rotation.y = (parts.length * 2.4) % TAU;
        const hidden = [];                                        // скритите части (празно ниво в чашата и пр.) не се сливат
        it.traverse(o => { if (o !== it && o.visible === false) hidden.push(o); });
        for (const o of hidden) o.parent?.remove(o);
        parts.push(it);
      }
      return parts;
    });
    obj.add(sample); obj.userData.sample = sample;
    return true;
  }

  // ---------- естествен размер ----------
  // Станция с nat: 1 е оригиналният модел в мащаб 1, без мачкане. Началото на станцията е в средата на ивицата ѝ в зоната
  // (0.40 м дълбока), +Z е лицето към човека: лицето на модела е на +0.20, а тялото му продължава назад зад ръба на зоната.
  const NAT_FRONT = 0.20;
  function natural(slug, name, o = {}) {
    const info = A.info(slug, name);
    if (!info) throw new Error(`липсва ${slug}/${name}`);
    const [w, h, d] = info.size;
    return place(slug, name, { w, h, d, fit: 'uniform', x: o.x || 0, y: o.y || 0, z: (o.front ?? d / 2) - d / 2, map: o.map });
  }
  const natOr = (kind, model, old) => (opts = {}) => (opts.nat ? inst(`${kind}:nat`, () => natural(SHOPS, model, { front: NAT_FRONT })) : old(opts));
  /** Купчинка от продукта, стъпила на y = 0 (на рафта). */
  function pile(gives) {
    return inst(`pile:${gives}`, () => {
      const [sw, sh] = SPEC_SIZE[gives] || [0.1, 0.05];
      const flatThing = sh < 0.06;
      const spots = sw > 0.15 ? [[0, 0]] : flatThing ? [[-0.085, -0.03], [0.085, -0.02], [0, 0.08]] : [[-0.08, -0.05], [0.08, -0.04], [-0.07, 0.07], [0.08, 0.08]];
      const layers = sw > 0.15 ? Math.max(1, Math.min(4, Math.floor(0.40 / sh))) : flatThing ? 3 : 1, parts = [];
      for (const [x, z] of spots) for (let l = 0; l < layers; l++) {
        const it = gives === 'pizza' ? pizzaProto('ball').clone(true) : make(gives, {});      // тестото стои на топки
        if (!it) break;
        const top = it.userData.top || sh;
        it.position.set(x, l * top * 0.9, z);
        it.rotation.y = (parts.length * 2.4) % TAU;
        const hidden = [];
        it.traverse(o => { if (o !== it && o.visible === false) hidden.push(o); });
        for (const o of hidden) o.parent?.remove(o);
        parts.push(it);
      }
      return parts;
    });
  }
  /** Продукт на рафт от стелажа; този с rack носи и самия стелаж (Gang Warfare, SM_Prop_Shelf_01), стъпил на пода. */
  function makeShelfBin(opts) {
    const g = new THREE.Group();
    if (opts.rack) {
      const i = A.info(GW, 'SM_Prop_Shelf_01');
      const rack = inst('rack', () => gw('Shelf_01', { w: i.size[0], h: i.size[1], d: i.size[2], fit: 'uniform', z: NAT_FRONT - i.size[2] / 2 }));
      rack.position.y = -(opts.y || 0);
      g.add(rack);
    }
    const gives = opts.gives || opts.state?.gives || null;
    if (gives && makers[gives]) { const p = pile(gives); p.position.z = NAT_FRONT - 0.22; g.add(p); g.userData.pile = p; if (gives === 'meat') p.visible = false; }
    g.userData.gives = gives;
    let tris = 0; g.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
    g.userData.tris = tris;
    return g;
  }
  /** Ролетката в естествен размер: цялото крило 2.5 × 3.02 м; отворена се вдига нагоре зад гредата. */
  function makeShutterNat() {
    const g = new THREE.Group();
    const leaf = inst('shutter:nat', () => natural(SHOPS, 'SM_Bld_Wall_Shutter_01'));
    g.add(leaf);
    g.userData.leaf = leaf; g.userData.open = 0; g.userData.nat = true; g.userData.tris = leaf.userData.tris;
    return g;
  }

  const boxed = (kind, model, extra) => (opts = {}) => {
    const [w, h, d] = SPEC_SIZE[kind];
    return inst(kind, () => [place(SHOPS, model, { w, h, d, fit: 'box' })].concat(extra ? extra() : []));
  };

  // Машината за напитки стои на шкаф така, че решетката ѝ (9% от височината ѝ) е точно на 0.85: там стъпват чашите
  // (гнездата са на x = ±0.12, z = +0.08).
  function makeDrinks() {
    const [w, h, d] = SPEC_SIZE.drinks;
    const mh = (h - SURFACE_Y) / (1 - 0.087), base = h - mh;
    return inst('drinks', () => [
      place(SHOPS, 'SM_Prop_Kitchen_Counter_Section_01', { w, h: base, d, fit: 'box' }),
      place(SHOPS, 'SM_Prop_Kitchen_Drinks_Machine_01', { w, h: mh, d: d * 0.85, y: base, z: -d * 0.075, fit: 'box' }),
    ]);
  }
  // Скарата: плочата е на 78% от височината на модела (отзад има борд), затова моделът е по-висок от 0.85.
  // Фритюрникът: ръбът на ваните е на 47%, отгоре е лампата за топлене.
  const raised = (kind, model, surface) => () => {
    const [w, h, d] = SPEC_SIZE[kind];
    return inst(kind, () => place(SHOPS, model, { w, h: h / surface, d, fit: 'box' }));
  };

  function makeCounter(opts) {
    const w = opts.w || SPEC_SIZE.counter[0], h = opts.h || SPEC_SIZE.counter[1], d = opts.d || SPEC_SIZE.counter[2];
    const n = Math.max(1, Math.round(w / 1.2)), seg = w / n;
    return inst(`counter:${w}:${h}:${d}`, () => Array.from({ length: n }, (_, i) =>
      place(SHOPS, 'SM_Prop_Kitchen_Counter_Section_01', { w: seg, h, d, x: -w / 2 + seg * (i + 0.5), fit: 'box' })));
  }

  function makeWall(opts) {
    const w = opts.w || SPEC_SIZE.wall[0], h = opts.h || SPEC_SIZE.wall[1], d = opts.d || SPEC_SIZE.wall[2];
    const g = new THREE.Group();
    // Двете лица на преградата ги облича декорът (мазилка, хладилници); тук е само тялото ѝ, малко по-тънко,
    // за да не трепти с неговите плоскости, и в цвета на стената на магазина.
    const m = new THREE.Mesh(geos().box, flat('wall', theme === 'kids' ? 0xf3e2b8 : 0x2f5f5c));
    m.scale.set(w, h, Math.max(0.02, d - 0.012));
    m.castShadow = true;
    g.add(m);
    g.userData.tris = 12;
    return g;
  }

  // Вратата към задната стая е скрита зад хладилник: два високи хладилника за напитки един до друг (като тези на декора
  // по същата стена). Първо хлътва назад (−Z, към лабораторията), после се плъзга към +X зад стената.
  const DOOR_DEPTH = 0.30, DOOR_FRONT = 0.24, DOOR_SINK = 0.34, DOOR_SLIDE = 1.22;
  function makeDoor() {
    const [w, h] = SPEC_SIZE.door;
    const g = new THREE.Group();
    const z = DOOR_FRONT - DOOR_DEPTH / 2;
    const leaf = inst('door', () => [
      place(SHOPS, 'SM_Prop_Market_Drinks_Fridge_01', { w: w / 2, h, d: DOOR_DEPTH, x: -w / 4, z, fit: 'box' }),
      place(SHOPS, 'SM_Prop_Market_Drinks_Fridge_02', { w: w / 2, h, d: DOOR_DEPTH, x: w / 4, z, fit: 'box' }),
    ]);
    g.add(leaf);
    g.userData.leaf = leaf; g.userData.open = 0; g.userData.tris = leaf.userData.tris;
    return g;
  }
  function setDoor(obj, st, dt) {
    const leaf = obj.userData.leaf; if (!leaf) return true;
    const target = Math.max(0, Math.min(1, Number(st.open) || 0));
    const open = obj.userData.open += (target - obj.userData.open) * (dt === undefined ? 1 : Math.min(1, dt * 6));
    leaf.position.z = -DOOR_SINK * Math.min(1, open / 0.15);
    leaf.position.x = DOOR_SLIDE * Math.max(0, (open - 0.15) / 0.85);
    return true;
  }

  // Ролетката: началото е долу в средата; при open = 1 е събрана под горния ръб.
  function makeShutter(opts) {
    const w = opts.w || SPEC_SIZE.shutter[0], h = opts.h || SPEC_SIZE.shutter[1], d = opts.d || SPEC_SIZE.shutter[2];
    const g = new THREE.Group();
    const n = Math.max(1, Math.round(w / 1.5)), seg = w / n;
    const leaf = inst(`shutter:${w}:${h}:${d}`, () => Array.from({ length: n }, (_, i) =>
      place(SHOPS, 'SM_Bld_Wall_Shutter_01', { w: seg, h, d: Math.max(d, 0.05), x: -w / 2 + seg * (i + 0.5), y: -h, fit: 'box' })));
    leaf.position.y = h;                      // върти се около горния ръб
    g.add(leaf);
    g.userData.leaf = leaf; g.userData.open = 0; g.userData.tris = leaf.userData.tris;
    return g;
  }
  function setShutter(obj, st, dt) {
    const leaf = obj.userData.leaf; if (!leaf) return true;
    const target = Math.max(0, Math.min(1, Number(st.open) || 0));
    const open = obj.userData.open += (target - obj.userData.open) * (dt === undefined ? 1 : Math.min(1, dt * 5));
    if (obj.userData.nat) { leaf.position.y = 2.85 * open; return true; }      // естествен размер: вдига се цялото зад гредата (тя е на 2.77), без мачкане
    leaf.scale.y = 1 - 0.94 * open;
    return true;
  }

  // ---------- асансьорът (SPEC т. 12) ----------
  // Кабината е SM_Bld_Wall_Elevator_Insert_01 от Shops Pack: стени, таван, под и две отделни крила на вратата.
  // Началото е в центъра на пода, вратата е на лицето +Z. Мащабът е такъв, че подът вътре е 1.6 × 1.6 м, отворът на
  // вратата е 1.10 м широк и 2.0 м висок (отвън кабината е 1.72 × 2.63 × 1.72).
  const LIFT = { model: 'SM_Bld_Wall_Elevator_Insert_01', kx: 0.743, ky: 0.826, leaf: 0.75, jamb: 0.35, doorTop: 2.42 };
  function liftPart(key) {
    return proto(`lift:${key}`, () => {
      const i = A.info(SHOPS, LIFT.model);
      const parts = placedParts(SHOPS, LIFT.model, { w: i.size[0] * LIFT.kx, h: i.size[1] * LIFT.ky, d: i.size[2] * LIFT.kx, y: i.min[1] * LIFT.ky, fit: 'box' },
        n => (/Door_L$/.test(n) ? 'l' : /Door_R$/.test(n) ? 'r' : 'body'));
      if (key !== 'body') return parts[key] || [];
      const front = i.size[2] * LIFT.kx / 2, px = (LIFT.leaf + LIFT.jamb / 2) * LIFT.kx;
      return [
        ...(parts.body || []),
        // бутон за повикване отвън, вдясно от вратата, на височината на ръката (вътре кабината си има свои табла от двете страни на вратата)
        place(SHOPS, 'SM_Prop_Elevator_Buttons_01', { w: 0.12, h: 0.20, d: 0.05, x: -px, y: 1.05, z: front + 0.022, fit: 'uniform' }),
        place(SHOPS, 'SM_Prop_Elevator_Arrows_01', { w: 0.30, h: 0.13, d: 0.06, y: LIFT.doorTop * LIFT.ky + 0.07, z: front + 0.025, fit: 'uniform' }),
      ];
    });
  }
  function makeElevator() {
    const i = A.info(SHOPS, LIFT.model);
    if (!i) throw new Error('няма модел на кабината');
    const g = new THREE.Group(), inner = new THREE.Group();
    const front = i.size[2] * LIFT.kx / 2, px = (LIFT.leaf + LIFT.jamb / 2) * LIFT.kx;
    const body = liftPart('body').clone(true), l = liftPart('l').clone(true), r = liftPart('r').clone(true);
    // лампата: зелено при отворени врати, червено при затворени, кехлибар (мига) при возене
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x45ff7a, toneMapped: false });
    const lamps = [[-px, 1.33, front + 0.012, 0], [0, LIFT.doorTop * LIFT.ky + 0.08, front - 0.105, Math.PI]].map(([x, y, z, yaw]) => {
      const m = new THREE.Mesh(geos().lamp ||= new THREE.CircleGeometry(0.022, 12), lampMat);
      m.position.set(x, y, z); m.rotation.y = yaw;
      return m;
    });
    inner.add(body, l, r, ...lamps);
    g.add(inner);
    g.userData.lift = { inner, l, r, lampMat, doors: 1, t: 0 };
    g.userData.tris = liftPart('body').userData.tris + liftPart('l').userData.tris + liftPart('r').userData.tris;
    // къде са бутоните (местни координати), за да знае сцената какво натиска играчът
    g.userData.buttons = [{ side: 'in', x: px, y: 1.2, z: front - 0.14 }, { side: 'in', x: -px, y: 1.2, z: front - 0.14 }, { side: 'out', x: -px, y: 1.15, z: front + 0.05 }];
    g.userData.floor = { w: 1.6, d: 1.6 };
    setElevator(g, { doors: 1 });
    return g;
  }
  function setElevator(obj, st, dt) {
    const e = obj.userData.lift; if (!e) return true;
    const target = st.doors == null ? e.doors : Math.max(0, Math.min(1, Number(st.doors) || 0));
    e.doors += (target - e.doors) * (dt === undefined ? 1 : Math.min(1, dt * 10));
    // крилата се прибират в стената до отвора: вътрешният ръб тръгва от средата и стига ръба на отвора
    const L = LIFT.leaf * LIFT.kx, s = 1 - e.doors * (1 - LIFT.jamb / LIFT.leaf), edge = e.doors * (L - 0.012);
    e.l.scale.x = e.r.scale.x = s;
    e.l.position.x = -edge; e.r.position.x = edge;
    e.t += dt > 0 ? dt : 0;
    const moving = !!st.moving;
    if (moving) e.inner.position.set(Math.sin(e.t * 47) * 0.003, Math.sin(e.t * 61 + 1) * 0.002, Math.sin(e.t * 53 + 2) * 0.002);
    else e.inner.position.set(0, 0, 0);
    e.lampMat.color.setHex(moving ? (Math.sin(e.t * 9) > 0 ? 0xffb52e : 0x6a4a10) : e.doors > 0.5 ? 0x45ff7a : 0xff4a36);
    return true;
  }

  // ---------- клиенти ----------
  // Герои със скелет и истински клипове (tools/synty/characters.mjs ги приготвя в _characters/).

  let crowd = null;      // { man, names, protos: Map(име → { scene, info, hipLocal, toLocal }), clips, clone, data }
  const LOOKS = {
    night: ['SK_Character_Biker', 'SK_Character_PunkGirl', 'SK_Character_HipsterGuy', 'SK_Character_GamerGirl', 'SK_Character_Jock', 'SK_Character_Grandma'],
  };
  const CLIP_OF = { in: 'walk', out: 'walk', wait: 'idle', happy: 'happy', angry: 'angry', fall: 'fall' };

  function lookNames(man) {
    const allowed = n => man.characters[n] && !(theme === 'kids' && man.characters[n].notForKids);
    const want = man.looks?.[theme] || LOOKS[theme] || man.looks?.night || LOOKS.night;
    const ok = want.filter(allowed);
    return ok.length ? ok : Object.keys(man.characters).filter(allowed);
  }

  async function loadCrowd() {
    const { man, loader, texLoader, clone } = await charLib();
    const looks = lookNames(man);
    if (!looks.length) throw new Error('няма герои за тази тема');
    // специалният клиент е отделен герой с шапка и очила (туристът), еднакъв за всички look
    const sp = man.special?.[theme] || man.special?.night;
    const special = sp && man.characters[sp] && !(theme === 'kids' && man.characters[sp].notForKids) ? sp : null;
    const names = special && !looks.includes(special) ? [...looks, special] : looks;
    const bin = man.clips ? await fetch(CHAR_BASE + man.clips.file).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
    const skel = { clone };
    const protos = new Map();
    await Promise.all(names.map(async name => {
      const info = man.characters[name];
      try {
        const gltf = await loader.loadAsync(CHAR_BASE + info.file);
        const scene = gltf.scene;
        // една текстура и един материал за всички герои, които я ползват
        const mat = ownMat(`char:${info.tex}`, () => new THREE.MeshLambertMaterial({ map: info.tex ? charTexture(texLoader, info.tex) : null }));
        scene.traverse(o => {
          if (o.isBone) o.name = o.name.toLowerCase();              // едни и същи имена на костите за всички пакети
          if (o.isMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; }
        });
        scene.updateMatrixWorld(true);
        const pelvis = scene.getObjectByName('pelvis');
        const toLocal = pelvis ? new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(pelvis.parent.matrixWorld).invert()) : null;
        protos.set(name, { scene, info, hipLocal: pelvis ? pelvis.position.clone() : null, toLocal });
      } catch (e) { warn(`герой ${name}`, e); }
    }));
    if (!protos.size) throw new Error('нито един герой не се зареди');
    const ready = looks.filter(n => protos.has(n));
    if (!ready.length) throw new Error('нито един герой за тази тема не се зареди');
    crowd = { man, names: ready, special: special && protos.has(special) ? special : null, protos, clips: new Map(), clone: skel.clone, data: bin ? new Int16Array(bin) : null };
  }

  /** Клип за даден герой: завъртанията са общи за всички герои, само пътят на таза зависи от ръста. */
  function clipFor(alias, p) {
    const c = crowd.man.clips, def = c?.list?.[alias];
    if (!def || !crowd.data || !p.toLocal) return null;
    const scale = (p.info.hip - p.info.ankle) / (c.refHip - c.refAnkle);
    const key = `${alias}|${scale.toFixed(3)}`;
    let clip = crowd.clips.get(key);
    if (clip) return clip;
    const nb = c.bones.length, stride = c.stride, n = def.frames, d = crowd.data, base = def.offset;
    let shared = crowd.clips.get(`q:${alias}`);
    if (!shared) {
      const times = new Float32Array(n);
      for (let f = 0; f < n; f++) times[f] = f / c.fps;
      const quats = c.bones.map((_, k) => {
        const v = new Float32Array(n * 4);
        for (let f = 0; f < n; f++) {
          const o = base + f * stride + k * 4;
          v[f * 4] = d[o] / 32767; v[f * 4 + 1] = d[o + 1] / 32767; v[f * 4 + 2] = d[o + 2] / 32767; v[f * 4 + 3] = d[o + 3] / 32767;
        }
        return v;
      });
      shared = { times, quats };
      crowd.clips.set(`q:${alias}`, shared);
    }
    const tracks = c.bones.map((b, k) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, shared.times, shared.quats[k]));
    const pos = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let f = 0; f < n; f++) {
      const o = base + f * stride + nb * 4;
      v.set(d[o], d[o + 1], d[o + 2]).multiplyScalar(c.hipUnit * scale).applyMatrix3(p.toLocal).add(p.hipLocal);
      pos[f * 3] = v.x; pos[f * 3 + 1] = v.y; pos[f * 3 + 2] = v.z;
    }
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', shared.times, pos));
    clip = new THREE.AnimationClip(alias, def.duration, tracks);
    crowd.clips.set(key, clip);
    return clip;
  }

  function dress(g, look, special) {
    const c = g.userData.cust;
    if (c.body) { c.mixer?.stopAllAction(); g.remove(c.body); }
    const name = special && crowd.special ? crowd.special : crowd.names[((look % crowd.names.length) + crowd.names.length) % crowd.names.length];
    const p = crowd.protos.get(name);
    const body = crowd.clone(p.scene);
    body.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    g.add(body);
    Object.assign(c, { look, special, body, name, mixer: null, actions: {}, cur: null });
    g.userData.tris = p.info.tris; g.userData.height = p.info.height;
    const sex = p.info.sex === 'f' ? 'f' : 'm';
    const mixer = new THREE.AnimationMixer(body);
    for (const a of ['idle', 'walk', 'happy', 'angry', 'bored', 'fall']) {
      const clip = clipFor(`${a}_${sex}`, p) || clipFor(`${a}_m`, p);
      if (clip) c.actions[a] = mixer.clipAction(clip);
    }
    if (!c.actions.fall && c.actions.happy) c.actions.fall = c.actions.happy;      // без клип за падане: с вдигнати ръце
    if (c.actions.idle) { c.mixer = mixer; play(c, 'idle', 0); mixer.update(0); }
    else restPose(body);
  }
  /** Без клипове: поне ръцете да са спуснати, а не в T-поза. */
  function restPose(body) {
    const q = new THREE.Quaternion(), pw = new THREE.Quaternion(), bw = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1);
    body.updateMatrixWorld(true);
    for (const [n, a] of [['upperarm_l', -1.25], ['upperarm_r', 1.25]]) {
      const b = body.getObjectByName(n); if (!b) continue;
      b.parent.getWorldQuaternion(pw); b.getWorldQuaternion(bw);
      b.quaternion.copy(pw.invert().multiply(q.setFromAxisAngle(axis, a).multiply(bw)));
    }
  }
  function play(c, name, fade = 0.25) {
    const next = c.actions[name] || c.actions.idle;
    if (!next || next === c.cur) return;
    next.reset().setEffectiveWeight(1).play();
    if (c.cur) { if (fade > 0) next.crossFadeFrom(c.cur, fade, false); else c.cur.stop(); }
    c.cur = next;
  }
  function makeCustomer(opts) {
    if (!crowd) return null;
    const st = opts.state || {};
    const g = new THREE.Group();
    g.userData.cust = { look: -1, special: false, body: null, mixer: null, actions: {}, cur: null };
    dress(g, Number(opts.look ?? st.look ?? 0) | 0, !!(opts.special ?? st.special));
    indicator(g, 'customer', { h: g.userData.height });
    return g;
  }
  function setCustomer(obj, st, dt) {
    const c = obj.userData.cust; if (!c) return true;
    const look = st.look == null ? c.look : Number(st.look) | 0, special = st.special == null ? c.special : !!st.special;
    if (look !== c.look || special !== c.special) dress(obj, look, special);
    let want = CLIP_OF[st.state] || 'idle';
    if (want === 'idle' && st.mark && theme !== 'kids') want = 'angry';      // грубиянът се кара, докато чака
    else if (want === 'idle' && st.patience != null && st.patience < 0.3) want = 'bored';
    play(c, want);
    if (c.mixer) c.mixer.update(dt > 0 ? dt : 0);
    return true;
  }

  // ---------- 1.1: the cellar lab ----------
  const natGWItem = (key, model) => () => inst(key, () => natGW(model));
  // The plant: its first part is the leaves (their own texture with holes), the second the stem.
  function plantParts() {
    const src = natGW('Plant_01');
    const leaf = ownMat('gw:leaf', () => { const m = A.material(GW, 'tex/PolygonGangWarfare_Leaves_Diff.png').clone(); m.alphaTest = 0.5; m.side = THREE.DoubleSide; return m; });
    let i = 0;
    src.traverse(x => { if (x.isMesh && i++ === 0) x.material = leaf; });
    return src;
  }
  // The blue flask: the original round flask, tinted blue; once shaken it glows.
  function makeBlue() {
    const g = inst('blue', () => natGW('Lab_Bulb_02'));
    const list = [];
    g.traverse(o => { if (o.isMesh) list.push([o, o.material]); });
    g.userData.blue = { list, on: -1 };
    setBlue(g, { shake: 0 });
    return g;
  }
  function setBlue(obj, st) {
    const e = obj.userData.blue; if (!e) return true;
    const on = st.shake ? 1 : 0;
    if (on === e.on) return true;
    e.on = on;
    for (const [o, base] of e.list) o.material = on ? tinted(base, 'blueHot', 0x7fb4ff, 0x1746c8) : tinted(base, 'blue', 0x4d8dff, 0x06113a);
    return true;
  }
  function makeIce() {
    const g = inst('ice', () => natGW('ZipBag_Blue_S_01'));
    const list = [];
    g.traverse(o => { if (o.isMesh) list.push([o, o.material]); });
    g.userData.ice = { list, on: 0 };
    return g;
  }
  function setIce(obj, st) {
    const e = obj.userData.ice; if (!e) return true;
    const on = st.pure ? 1 : 0;
    if (on === e.on) return true;
    e.on = on;
    for (const [o, base] of e.list) o.material = on ? tinted(base, 'icePure', 0xffffff, 0x1a4fb0) : base;
    return true;
  }
  /** The place of the station's i-th slot (or tap) in the station's own frame. */
  const localOf = (def, q) => {
    const c = Math.cos(def.yaw || 0), sn = Math.sin(def.yaw || 0), dx = q.x - def.x, dz = q.z - def.z;
    return [dx * c - dz * sn, q.y - (def.y || 0), dx * sn + dz * c];
  };
  // The secret cabinet: the original two-door freezer. The doors are separate parts of the model and swing on their outer
  // edge. In every empty shelf spot that belongs to a supply stands a dark sample of it: touching it orders the supply.
  function makeStash(opts = {}) {
    const g = new THREE.Group(), name = 'SM_Prop_Market_Freezer_03';
    const [w, h, d] = A.info(SHOPS, name).size;
    const parts = placedParts(SHOPS, name, { w, h, d, fit: 'uniform', z: NAT_FRONT - d / 2 }, n => (/Door_01/.test(n) ? 'a' : /Door_02/.test(n) ? 'b' : 'body'));
    const doors = [];
    let tris = 0;
    for (const key of ['body', 'a', 'b']) {
      const list = parts[key] || [];
      for (const m of list) tris += m.geometry.attributes.position.count / 3;
      if (key === 'body') { for (const m of list) g.add(m); continue; }
      const box = new THREE.Box3();
      for (const m of list) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix)); }
      if (box.isEmpty()) continue;
      const mid = (box.min.x + box.max.x) / 2, hx = mid < 0 ? box.min.x : box.max.x, hz = box.max.z - 0.02;
      const pivot = new THREE.Group();
      pivot.position.set(hx, 0, hz);
      const back = new THREE.Matrix4().makeTranslation(-hx, 0, -hz);
      for (const m of list) { m.matrix.premultiply(back); pivot.add(m); }
      g.add(pivot);
      doors.push({ pivot, dir: mid < 0 ? -1 : 1 });
    }
    const ghosts = [], def = opts.def || null;
    if (def && Array.isArray(def.slots) && Array.isArray(def.shelf)) {
      def.slots.forEach((sl, i) => {
        const kind = def.shelf[i];
        const m = kind ? make(kind, {}) : null;
        if (!m) return;
        m.position.set(...localOf(def, sl));
        m.traverse(o => { if (o.isMesh) o.material = tinted(o.material, 'sample', 0x2c3138); });
        m.visible = false;
        g.add(m);
        ghosts.push({ m, i });
      });
    }
    g.userData.stash = { doors, ghosts, open: 0, t: 0 };
    g.userData.tris = tris;
    return g;
  }
  function setStash(obj, st, dt) {
    const e = obj.userData.stash; if (!e) return true;
    e.t += dt > 0 ? dt : 0;
    const tgt = Math.max(0, Math.min(1, Number(st.open) || 0));
    e.open += (tgt - e.open) * (dt === undefined ? 1 : Math.min(1, dt * 12));
    for (const q of e.doors) q.pivot.rotation.y = q.dir * e.open * 1.7;
    const free = Array.isArray(st.free) ? st.free : [], pend = Array.isArray(st.pend) ? st.pend : [];
    for (const gh of e.ghosts) {
      const coming = pend.includes(gh.i);
      gh.m.visible = e.open > 0.3 && (free[gh.i] !== false || coming);
      gh.m.scale.setScalar(coming ? 0.85 + 0.15 * Math.abs(Math.sin(e.t * 5)) : 1);
    }
    return true;
  }
  // The plants: two buckets under the grow lamp; a grown plant stands in each until it is pulled out.
  function makeGrow(opts = {}) {
    const g = new THREE.Group(), def = opts.def || null;
    const xs = def && Array.isArray(def.slots) && def.slots.length ? def.slots.map(sl => localOf(def, sl)[0]) : [-0.34, 0.34];
    const rig = inst(`grow:${xs.join(',')}`, () => [
      ...xs.map(x => natGW('Plant_Bucket_01', { x })),
      place(GW, 'SM_Prop_Plant_Light_01', { w: 1.27, h: 1.0, d: 0.65, fit: 'uniform', yaw: Math.PI / 2, y: 1.78, map: GW_MAP }),
    ]);
    g.add(rig);
    const plants = xs.map(x => { const q = inst('plant', () => plantParts()); q.position.set(x, 0.36, 0); g.add(q); return q; });
    g.userData.grow = { plants };
    g.userData.tris = rig.userData.tris;
    return g;
  }
  function setGrow(obj, st) {
    const e = obj.userData.grow; if (!e) return true;
    const pots = Array.isArray(st.pots) ? st.pots : [];
    e.plants.forEach((q, i) => {
      const v = Number(pots[i]);
      q.visible = !(v <= 0.02);
      q.scale.setScalar(v >= 1 || Number.isNaN(v) ? 1 : 0.2 + 0.8 * Math.max(0, v));
    });
    return true;
  }
  // The bench: the original steel prep table with the shredder (the Gang Warfare blender: base and jug) on the left and the
  // mixer (the Shops Pack blender) on the right. A running machine shakes; the mixer glows in the colour of what is in it.
  const MIX_COL = { blue: [0.10, 0.36, 1.0], clear: [0.62, 0.68, 0.74], red: [1.0, 0.22, 0.14] };
  function makeBench(opts = {}) {
    const g = new THREE.Group(), def = opts.def || null, top = opts.h || 1.05;
    const T = def && Array.isArray(def.taps) ? def.taps.map(q => localOf(def, q)) : [[-0.27, top + 0.1, 0.17], [0.27, top + 0.1, 0.17]];
    const sx = T[0][0], mx = T[1][0];
    const body = inst(`bench:${sx}`, () => [natural(SHOPS, 'SM_Prop_Kitchen_Prep_Table_02', { front: NAT_FRONT }), natGW('Blender_01', { x: sx, y: top })]);
    const jug = inst('bench:jug', () => natGW('Blender_Jug_01'));
    jug.position.set(sx, top + 0.20, 0);
    const mixer = inst('bench:mixer', () => natural(SHOPS, 'SM_Prop_Blender_01'));
    mixer.position.set(mx, top, 0);
    g.add(body, jug, mixer);
    const mm = [];
    mixer.traverse(o => { if (o.isMesh) mm.push([o, o.material]); });
    g.userData.bench = { jug, mixer, mm, sx, mx, t: 0, key: '' };
    g.userData.tris = body.userData.tris;
    return g;
  }
  function setBench(obj, st, dt) {
    const e = obj.userData.bench; if (!e) return true;
    e.t += dt > 0 ? dt : 0;
    const sh = (Number(st.shred) || 0) > 0, mx = (Number(st.mixing) || 0) > 0;
    e.jug.rotation.y = sh ? e.t * 26 : 0;
    e.jug.position.x = e.sx + (sh ? Math.sin(e.t * 71) * 0.004 : 0);
    e.mixer.position.x = e.mx + (mx ? Math.sin(e.t * 83) * 0.005 : 0);
    const mix = Array.isArray(st.mix) ? st.mix : [0, 0, 0], sum = (mix[0] || 0) + (mix[1] || 0) + (mix[2] || 0);
    const key = sum > 0 ? `${Math.round(mix[0] / sum * 10)}:${Math.round(mix[1] / sum * 10)}:${mx ? 1 : 0}` : '';
    if (key !== e.key) {
      e.key = key;
      let col = null;
      if (sum > 0) {
        const c = [0, 0, 0];
        ['blue', 'clear', 'red'].forEach((k, i) => { const q = MIX_COL[k], f = (mix[i] || 0) / sum; c[0] += q[0] * f; c[1] += q[1] * f; c[2] += q[2] * f; });
        col = new THREE.Color(c[0], c[1], c[2]).multiplyScalar(mx ? 0.9 : 0.5).getHex();
      }
      for (const [o, base] of e.mm) o.material = col == null ? base : tinted(base, `mix:${col}`, 0xffffff, col);
    }
    return true;
  }
  // 1.2: seeds are the original seed packet, a bud is a small green head from the Farm Pack, the carry box is the open
  // wooden box of the Gang Warfare Pack with what is packed in it lying inside, the big screen is the wall TV.
  const farm = (model, k = 1) => { const [w, h, d] = A.info(FARM, model).size; return place(FARM, model, { w: w * k, h: h * k, d: d * k, fit: 'uniform', map: FARM_MAP }); };
  function makeBox() {
    const g = new THREE.Group();
    g.add(inst('box', () => natGW('Box_01')));
    const inside = new THREE.Group();
    g.add(inside);
    g.userData.box = { inside, key: '' };
    return g;
  }
  function setBox(obj, st) {
    const e = obj.userData.box; if (!e) return true;
    const n = Array.isArray(st.n) ? st.n : [], key = n.join(',');
    if (key === e.key) return true;
    e.key = key;
    e.inside.clear();
    n.slice(-3).forEach((kind, i) => {
      const m = make(kind, {});
      if (!m) return;
      m.position.set(-0.09 + i * 0.09, 0.025 + i * 0.012, 0);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.8);
      e.inside.add(m);
    });
    return true;
  }
  const makeScreen = () => inst('screen', () => { const [w, h, d] = A.info(SHOPS, 'SM_Prop_Computer_TV_Wall_01').size; return place(SHOPS, 'SM_Prop_Computer_TV_Wall_01', { w, h, d, fit: 'uniform', z: d / 2 }); });
  const BOWL = { white: 'SM_Prop_Food_Sauce_Mayo_01', mustard: 'SM_Prop_Food_Sauce_Mustard_01', sauce: 'SM_Prop_Food_Sauce_Ketchup_01' };

  // ---------- таблици ----------

  const makers = {
    pizza: makePizza,
    sauce: natItem('sauce', 'SM_Prop_Food_Sauce_Ketchup_01'), cheese: natItem('cheese', 'SM_Prop_Food_Cheese_Grated_01'),
    white: natItem('white', 'SM_Prop_Food_Sauce_Mayo_01'), mustard: natItem('mustard', 'SM_Prop_Food_Sauce_Mustard_01'),
    shrimp: natItem('shrimp', 'SM_Prop_Food_Fish_Shrimp_01'), ham: natItem('ham', 'SM_Prop_Food_Luncheon_Sliced_01'), bacon: natItem('bacon', 'SM_Prop_Food_Bacon_Cooked_01'),
    pineapple: natItem('pineapple', 'SM_Prop_Food_Pineapple_Ring_01'), onion: natItem('onion', 'SM_Prop_Food_Onion_Sliced_01'), greens: natItem('greens', 'SM_Prop_Food_Lettuce_Leaves_01'),
    plant: () => inst('plant', () => plantParts()), seeds: () => inst('seeds', () => farm('SM_Prop_SeedPacket_01')), papers: natGWItem('papers', 'Cigarette_Pack_01'),
    blue: makeBlue, clear: natGWItem('clear', 'Chemical_03'), red: natGWItem('red', 'Chemical_05'),
    buds: () => inst('buds', () => farm('SM_Prop_Cabbage_01_S', 0.5)), box: makeBox, screen: makeScreen, joint: natGWItem('joint', 'Cigarette_Long_01'), ice: makeIce,
    pills: natGWItem('pills', 'Pills_01'), powder: natGWItem('powder', 'ZipBag_White_S_01'),
    stash: makeStash, grow: makeGrow, bench: makeBench,
    veg: natItem('veg', 'SM_Prop_Food_Mushroom_Sliced_01'), meat: natItem('meat', 'SM_Prop_Food_Salami_Sliced_01'),
    cup: makeCup, tray: makeTray, meatbox: makeMeatbox,
    // tray: тава с добавка на оригиналния тезгях на мапа: вече е нарисувана там, тук няма какво
    bin: (opts = {}) => { if (opts.bowl && BOWL[opts.gives]) { const b = inst(`bowl:${opts.gives}`, () => natural(SHOPS, BOWL[opts.gives])); b.userData.shelf = true; return b; } if (opts.tray) return new THREE.Group(); if (!opts.nat) return makeBin(opts); const g = makeShelfBin(opts); g.userData.shelf = true; return g; },
    oven: makeOven, prep: makePrep, button: makeButton, cover: makeCover, crate: makeCrate,
    grinder: makeGrinder, hopper: makeHopper,
    drinks: natOr('drinks', 'SM_Prop_Kitchen_Drinks_Machine_01', makeDrinks),
    // оригиналният тезгях е в самия мап (изпечен): за него нищо не се рисува
    counter: (opts = {}) => (opts.nat ? new THREE.Group() : makeCounter(opts)),
    trash: (opts = {}) => (opts.nat ? inst('trash:nat', () => natural(SHOPS, 'SM_Prop_Rubbish_Bin_03')) : boxed('trash', 'SM_Prop_Rubbish_Bin_03')(opts)),
    wall: makeWall,
    door: makeDoor,
    shutter: (opts = {}) => (opts.nat ? makeShutterNat() : makeShutter(opts)),
    customer: makeCustomer,
    sign: makeSign,
    elevator: makeElevator,
  };
  const states = {
    pizza: setPizza, cup: setCup, bin: setBin, door: setDoor, shutter: setShutter, customer: setCustomer,
    elevator: setElevator, button: setButton, grinder: setGrinder,
    blue: setBlue, ice: setIce, stash: setStash, grow: setGrow, bench: setBench, box: setBox,
  };

  // ---------- играчите: истински герои вместо манекени ----------
  // Тялото стои под каската и гледа накъдето гледа главата; главата му следва каската, а ръцете му стигат до
  // контролерите (двуставна сметка за лакътя). Героите са тези, които темата не ползва за клиенти.
  let avatarNames = null;
  async function loadAvatars() {
    if (!crowd) return;
    const { man, loader, texLoader } = await charLib();
    const taken = new Set([...crowd.names, crowd.special]);
    const names = Object.keys(man.characters).filter(n => !taken.has(n) && !(theme === 'kids' && man.characters[n].notForKids)).slice(0, 6);
    await Promise.all(names.map(async name => {
      if (crowd.protos.has(name)) return;
      const info = man.characters[name];
      try {
        const scene = (await loader.loadAsync(CHAR_BASE + info.file)).scene;
        const mat = ownMat(`char:${info.tex}`, () => new THREE.MeshLambertMaterial({ map: info.tex ? charTexture(texLoader, info.tex) : null }));
        scene.traverse(o => {
          if (o.isBone) o.name = o.name.toLowerCase();
          if (o.isMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; }
        });
        scene.updateMatrixWorld(true);
        const pelvis = scene.getObjectByName('pelvis');
        const toLocal = pelvis ? new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(pelvis.parent.matrixWorld).invert()) : null;
        crowd.protos.set(name, { scene, info, hipLocal: pelvis ? pelvis.position.clone() : null, toLocal });
      } catch (e) { warn(`герой ${name}`, e); }
    }));
    avatarNames = names.filter(n => crowd.protos.has(n));
    if (!avatarNames.length) avatarNames = crowd.names.slice();
    avatarMaker = makeBody;
    walkerMaker = makeWalkerBody;
  }
  const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3(), _a4 = new THREE.Vector3();
  const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _r4 = new THREE.Vector3(), _r5 = new THREE.Vector3();
  const _b1 = new THREE.Quaternion(), _b2 = new THREE.Quaternion(), _b3 = new THREE.Quaternion();
  const _fw = new THREE.Vector3(), _tg = new THREE.Vector3(), _pl = new THREE.Vector3(), _pq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _iq = new THREE.Quaternion();
  const Q_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  /** Завърта костта така, че детето ѝ да сочи към точката to (световни координати). */
  function aimBone(bone, child, to) {
    bone.getWorldPosition(_a1); child.getWorldPosition(_a2);
    _a3.copy(_a2).sub(_a1).normalize(); _a4.copy(to).sub(_a1).normalize();
    _b1.setFromUnitVectors(_a3, _a4);
    bone.getWorldQuaternion(_b2).premultiply(_b1);
    bone.parent.getWorldQuaternion(_b3).invert();
    bone.quaternion.copy(_b3.multiply(_b2));
    bone.updateWorldMatrix(false, true);
  }
  /** Ръка от две кости: китката отива в target, лакътят се огъва по посока на pole. */
  function reach(up, lo, hand, target, pole) {
    up.getWorldPosition(_r1); lo.getWorldPosition(_r2); hand.getWorldPosition(_r3);
    const L1 = _r1.distanceTo(_r2), L2 = _r2.distanceTo(_r3);
    _r4.copy(target).sub(_r1);
    const d = Math.min(Math.max(_r4.length(), Math.abs(L1 - L2) + 0.02), L1 + L2 - 0.004);
    _r4.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _r5.copy(pole).addScaledVector(_r4, -pole.dot(_r4));
    if (_r5.lengthSq() < 1e-6) _r5.set(0, -1, 0);
    _r5.normalize();
    _r2.copy(_r1).addScaledVector(_r4, a).addScaledVector(_r5, h);      // лакътят
    _r3.copy(_r1).addScaledVector(_r4, d);                               // китката
    aimBone(up, lo, _r2);
    aimBone(lo, hand, _r3);
  }
  function makeBody(n) {
    if (!crowd || !avatarNames || !avatarNames.length) return null;
    const name = avatarNames[(((((n | 0) || 1) - 1) % avatarNames.length) + avatarNames.length) % avatarNames.length];
    const p = crowd.protos.get(name);
    if (!p) return null;
    const body = crowd.clone(p.scene);
    body.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false; } });
    const g = new THREE.Group();
    g.add(body);
    const sex = p.info.sex === 'f' ? 'f' : 'm';
    const mixer = new THREE.AnimationMixer(body);
    const cIdle = clipFor(`idle_${sex}`, p) || clipFor('idle_m', p), cWalk = clipFor(`walk_${sex}`, p) || clipFor('walk_m', p);
    const aIdle = cIdle ? mixer.clipAction(cIdle) : null, aWalk = cWalk ? mixer.clipAction(cWalk) : null;
    if (aIdle) aIdle.play(); else restPose(body);
    if (aWalk) { aWalk.play(); aWalk.setEffectiveWeight(0); }
    mixer.update(0);
    const bone = k => body.getObjectByName(k);
    const B = { head: bone('head'), ul: bone('upperarm_l'), ll: bone('lowerarm_l'), hl: bone('hand_l'), ur: bone('upperarm_r'), lr: bone('lowerarm_r'), hr: bone('hand_r') };
    g.updateMatrixWorld(true);
    const eye = B.head ? B.head.getWorldPosition(new THREE.Vector3()).y + 0.08 : (p.info.height || 1.8) * 0.92;
    // как стои костта на главата, когато героят гледа право напред (+Z): спрямо това се върти с каската
    const headFix = B.head ? Q_BACK.clone().invert().multiply(B.head.getWorldQuaternion(new THREE.Quaternion())) : null;
    const st = { yaw: 0, first: true, tall: 1.55, walk: 0, px: 0, pz: 0 };
    /** head, l, r: { pos, quat } в координатите на родителя на групата (залата); l.on / r.on: проследява ли се ръката. */
    function update(head, l, r, dt) {
      _fw.set(0, 0, -1).applyQuaternion(head.quat);
      const want = Math.atan2(_fw.x, _fw.z);
      if (st.first) { st.first = false; st.yaw = want; st.px = head.pos.x; st.pz = head.pos.z; }
      let dy = want - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw += dy * Math.min(1, dt * (Math.abs(dy) > 0.6 ? 6 : 2.5));          // торсът следва главата със закъснение
      st.tall = Math.max(st.tall, Math.min(2.05, head.pos.y));                   // ръстът: най-високото положение на главата
      const s = Math.min(1.12, Math.max(0.8, st.tall / eye));
      g.scale.setScalar(s);
      const bx = Math.sin(st.yaw), bz = Math.cos(st.yaw);
      g.position.set(head.pos.x - bx * 0.07, Math.max(-1.0, Math.min(0, head.pos.y - eye * s)), head.pos.z - bz * 0.07);      // клекнал играч: тялото потъва
      g.rotation.set(0, st.yaw, 0);
      const sp = Math.hypot(head.pos.x - st.px, head.pos.z - st.pz) / Math.max(dt, 1e-3);
      st.px = head.pos.x; st.pz = head.pos.z;
      st.walk += ((sp > 0.25 ? 1 : 0) - st.walk) * Math.min(1, dt * 6);
      if (aWalk && aIdle) { aWalk.setEffectiveWeight(st.walk); aIdle.setEffectiveWeight(1 - st.walk); }
      mixer.update(dt);
      g.updateMatrixWorld(true);
      const par = g.parent;
      if (!par) return;
      par.getWorldQuaternion(_pq);
      if (B.head && headFix) {       // главата следва каската
        _tq.copy(_pq).multiply(head.quat).multiply(headFix);
        B.head.parent.getWorldQuaternion(_iq).invert();
        B.head.quaternion.copy(_iq.multiply(_tq));
        B.head.updateWorldMatrix(false, true);
      }
      for (let i = 0; i < 2; i++) {      // ръцете стигат до контролерите
        const h = i ? r : l, up = i ? B.ur : B.ul, lo = i ? B.lr : B.ll, hand = i ? B.hr : B.hl;
        if (!h || !h.on || !up || !lo || !hand) continue;
        _tg.set(0, 0, 0.07).applyQuaternion(h.quat).add(h.pos).applyMatrix4(par.matrixWorld);      // китката е малко зад дланта
        const out = i ? 1 : -1;                                                                    // дясната ръка: лакътят надясно (−X при поглед към +Z)
        _pl.set(-bz * out * 0.45 - bx * 0.35, -0.7, bx * out * 0.45 - bz * 0.35).applyQuaternion(_pq);
        reach(up, lo, hand, _tg, _pl);
      }
    }
    return { group: g, name, tris: p.info.tris, update, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(body); } };
  }

  // ---------- минувачи: героите, които вървят из града ----------
  function makeWalkerBody(i) {
    if (!crowd) return null;
    const names = [...crowd.names, ...(avatarNames || [])].filter(n => crowd.protos.has(n));
    if (!names.length) return null;
    const p = crowd.protos.get(names[((i % names.length) + names.length) % names.length]);
    const body = crowd.clone(p.scene);
    body.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
    const g = new THREE.Group();
    g.add(body);
    const sex = p.info.sex === 'f' ? 'f' : 'm';
    const mixer = new THREE.AnimationMixer(body);
    const cw = clipFor(`walk_${sex}`, p) || clipFor('walk_m', p), ci = clipFor(`idle_${sex}`, p) || clipFor('idle_m', p);
    const aw = cw ? mixer.clipAction(cw) : null, ai = ci ? mixer.clipAction(ci) : null;
    if (aw) { aw.play(); aw.time = (i * 0.37) % (cw.duration || 1); }
    if (ai) { ai.play(); ai.setEffectiveWeight(aw ? 0 : 1); }
    if (!aw && !ai) restPose(body);
    mixer.update(0);
    return {
      group: g, tris: p.info.tris,
      update(dt, walking = true) { if (aw && ai) { aw.setEffectiveWeight(walking ? 1 : 0); ai.setEffectiveWeight(walking ? 0 : 1); } mixer.update(dt); },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(body); },
    };
  }

  function make(kind, opts) {
    const f = makers[kind];
    if (!f) return null;
    try {
      const obj = f(opts || {});
      if (obj) {
        obj.userData.kind = kind; obj.userData.synty = true;
        // сенки: станциите и клиентите хвърлят, плотовете приемат (показанията и течностите не участват)
        if (SHADOW.has(kind)) obj.traverse(o => { if (o.isMesh && !o.material?.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = kind !== 'customer'; } });
      }
      return obj;
    } catch (e) { warn(`модел ${kind}`, e); return null; }
  }

  const provider = {
    make(_THREE, kind, opts) { return make(kind, opts); },
    setState(_THREE, obj, kind, state, dt) {
      if (!obj || !obj.userData.synty) return false;
      const f = states[kind];
      try { if (f) f(obj, state || {}, dt); } catch (e) { warn(`състояние ${kind}`, e); }
      return !obj.userData.indicator;       // показанията (ако има) ги кара models.js: за тях връщаме false
    },
    kinds: () => Object.keys(makers),
    theme,
  };
  return { load, provider };
}

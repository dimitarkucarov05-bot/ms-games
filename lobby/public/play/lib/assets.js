// Зарежда Synty моделите, приготвени от tools/synty/build.mjs.
//
// Моделите са GLB без вградена текстура. Всеки пакет има една-две общи текстури (атласи);
// тук всяка текстура се зарежда веднъж и всички модели от пакета делят един материал.
// Затова стотици предмети от един пакет могат да се слеят в един-единствен draw call (merge).
//
// Страницата трябва да има import map за 'three' и 'three/addons/' (вж. play/index.html).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export function createAssets(base = '/play/assets/synty/') {
  const loader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const packs = new Map();       // slug → Promise(pack.json)
  const packNow = new Map();     // slug → pack.json (когато е зареден)
  const models = new Map();      // slug/name → Promise(Object3D образец)
  const modelNow = new Map();    // slug/name → образец
  const materials = new Map();   // път на текстура или цвят → материал

  function loadPack(slug) {
    if (!packs.has(slug)) {
      packs.set(slug, fetch(`${base}${slug}/pack.json`).then(r => {
        if (!r.ok) throw new Error(`няма пакет ${slug}`);
        return r.json();
      }).then(p => {
        // текстурата по подразбиране: най-често срещаната в пакета (за материали без посочена)
        const count = {};
        for (const m of Object.values(p.models)) for (const mat of m.materials) if (mat.map) count[mat.map] = (count[mat.map] || 0) + 1;
        p.defaultMap = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        packNow.set(slug, p);
        return p;
      }));
    }
    return packs.get(slug);
  }

  /** Общ материал за дадена текстура от пакета. */
  function material(slug, map, opts = {}) {
    const key = `${slug}/${map}|${opts.emissive ? 'e' : ''}|${opts.skinned ? 's' : ''}`;
    let m = materials.get(key);
    if (m) return m;
    m = opts.emissive ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    if (map) {
      const tex = texLoader.load(`${base}${slug}/${map}`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;                       // glTF: UV началото е горе
      tex.anisotropy = 2;
      m.map = tex;
    } else m.color.set(0x9a9a92);
    m.name = key;
    materials.set(key, m);
    return m;
  }

  function prepare(slug, name, gltf, pack) {
    const info = pack.models[name];
    const root = gltf.scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const out = list.map(src => {
        const meta = info?.materials.find(x => x.name === src.name) || null;
        return material(slug, meta?.map || pack.defaultMap, { skinned: o.isSkinnedMesh });
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = o.receiveShadow = false;
      o.frustumCulled = !o.isSkinnedMesh;
    });
    root.userData.asset = { slug, name, skinned: !!info?.skinned, clips: gltf.animations || [] };
    return root;
  }

  function loadModel(slug, name) {
    const key = `${slug}/${name}`;
    if (!models.has(key)) {
      models.set(key, loadPack(slug).then(pack => loader.loadAsync(`${base}${slug}/${name}.glb`).then(g => {
        const proto = prepare(slug, name, g, pack);
        modelNow.set(key, proto);
        return proto;
      })));
    }
    return models.get(key);
  }

  function instance(proto) {
    const c = proto.userData.asset.skinned ? cloneSkinned(proto) : proto.clone(true);   // геометриите и материалите остават общи
    c.userData.asset = proto.userData.asset;
    return c;
  }

  return {
    loadPack,
    material,
    /** Ново копие на модела (чака зареждането). */
    async get(slug, name) { return instance(await loadModel(slug, name)); },
    /** Ново копие, ако вече е зареден; иначе null. */
    getSync(slug, name) { const p = modelNow.get(`${slug}/${name}`); return p ? instance(p) : null; },
    /** Зарежда предварително: [[slug, name], …]. Липсващ модел не спира останалите. */
    preload(list) { return Promise.all(list.map(([s, n]) => loadModel(s, n).catch(e => { console.warn('модел', s, n, e.message); return null; }))); },
    /** Размери и триъгълници от pack.json (след loadPack): { tris, size:[w,h,d], min, max }. */
    info(slug, name) { return packNow.get(slug)?.models[name] || null; },
    has(slug, name) { return !!packNow.get(slug)?.models[name]; },

    /**
     * Слива много неподвижни обекти в по един Mesh на материал (static batching).
     * objects: вече разположени Object3D (позиция, завъртане, мащаб). Връща Group; оригиналите не се пипат.
     */
    merge(objects) {
      const byMat = new Map();
      const m4 = new THREE.Matrix4();
      for (const obj of objects) {
        obj.updateMatrixWorld(true);
        obj.traverse(o => {
          if (!o.isMesh || o.isSkinnedMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const src = o.geometry;
          const groups = mats.length > 1 && src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
          for (const g of groups) {
            const geo = new THREE.BufferGeometry();
            const pick = name => { const a = src.attributes[name]; if (a) geo.setAttribute(name, a); };
            pick('position'); pick('normal'); pick('uv');
            if (src.index) geo.setIndex(Array.from(src.index.array.slice(g.start, g.start + g.count)));
            const flat = src.index ? geo.toNonIndexed() : sliceNonIndexed(src, g);
            m4.copy(o.matrixWorld);
            flat.applyMatrix4(m4);
            for (const k of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(k)) flat.deleteAttribute(k);
            if (!flat.attributes.uv) flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
            if (!flat.attributes.normal) flat.computeVertexNormals();
            const mat = mats[g.materialIndex] || mats[0];
            if (!byMat.has(mat)) byMat.set(mat, []);
            byMat.get(mat).push(flat);
          }
        });
      }
      const group = new THREE.Group();
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      return group;
    },
  };

  function sliceNonIndexed(src, g) {
    const geo = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = src.attributes[name];
      if (a) geo.setAttribute(name, new THREE.BufferAttribute(a.array.slice(g.start * a.itemSize, (g.start + g.count) * a.itemSize), a.itemSize));
    }
    return geo;
  }
}

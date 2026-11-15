// The Motel: другите играчи са истински герои на Synty (City Characters), не заместителите на страницата
// (топка и цилиндър). Тялото стои под каската и гледа накъдето гледа главата, главата му следва каската,
// а ръцете му стигат до контролерите (двуставна сметка за лакътя). Оръжията в ръцете рисува weapons.js.
//
// Страницата вика installSyntyKinds() при зареждане на играта и после makeAvatarBody(n) за всеки друг играч;
// върнатото { group, update(head, l, r, dt), dispose } се слага в групата на играча.

const CHAR_BASE = '/play/assets/synty/_characters/';
const GLTF_URL = '/play/vendor/addons/loaders/GLTFLoader.js';
const SKEL_URL = '/play/vendor/addons/utils/SkeletonUtils.js';
// само възрастни герои; играч номер n получава (n − 1)-ия по ред
const WHO = ['SK_Character_Biker', 'SK_Character_PunkGirl', 'SK_Character_Jock', 'SK_Character_GamerGirl', 'SK_Character_HipsterGuy', 'SK_Character_Father_01'];

let maker = null;
export function makeAvatarBody(n) { try { return maker ? maker(n) : null; } catch (e) { console.warn('[motel] player body', e); return null; } }

export async function installSyntyKinds({ THREE } = {}) {
  maker = null;
  if (!THREE) return;
  try {
    const res = await fetch(`${CHAR_BASE}characters.json`);
    if (!res.ok) return;
    const man = await res.json();
    const [{ GLTFLoader }, skel] = await Promise.all([import(GLTF_URL), import(SKEL_URL)]);
    const loader = new GLTFLoader(), texLoader = new THREE.TextureLoader();
    const mats = new Map(), protos = new Map();
    await Promise.all(WHO.map(async name => {
      const info = man.characters?.[name];
      if (!info) return;
      try {
        const scene = (await loader.loadAsync(CHAR_BASE + info.file)).scene;
        let mat = mats.get(info.tex);
        if (!mat) {
          const t = info.tex ? texLoader.load(CHAR_BASE + info.tex) : null;
          if (t) { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; }
          mat = new THREE.MeshLambertMaterial({ map: t });
          mats.set(info.tex, mat);
        }
        scene.traverse(o => {
          if (o.isBone) o.name = o.name.toLowerCase();
          if (o.isMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; }
        });
        scene.updateMatrixWorld(true);
        protos.set(name, { scene, info });
      } catch (e) { console.warn('[motel] character', name, e.message); }
    }));
    const names = WHO.filter(n => protos.has(n));
    if (!names.length) return;

    const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3(), _a4 = new THREE.Vector3();
    const _b1 = new THREE.Quaternion(), _b2 = new THREE.Quaternion(), _b3 = new THREE.Quaternion();
    const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _r4 = new THREE.Vector3(), _r5 = new THREE.Vector3();
    const _fw = new THREE.Vector3(), _tg = new THREE.Vector3(), _pl = new THREE.Vector3();
    const _pq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _iq = new THREE.Quaternion();
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
    /** Ръцете от позата „Т" се спускат до тялото (за ръка, която не се следи). */
    function restPose(body) {
      const q = new THREE.Quaternion(), pw = new THREE.Quaternion(), bw = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1);
      body.updateMatrixWorld(true);
      for (const [n, a] of [['upperarm_l', -1.25], ['upperarm_r', 1.25]]) {
        const b = body.getObjectByName(n); if (!b) continue;
        b.parent.getWorldQuaternion(pw); b.getWorldQuaternion(bw);
        b.quaternion.copy(pw.invert().multiply(q.setFromAxisAngle(axis, a).multiply(bw)));
      }
    }

    maker = function makeBody(n) {
      const name = names[(((((n | 0) || 1) - 1) % names.length) + names.length) % names.length];
      const p = protos.get(name);
      if (!p) return null;
      const body = skel.clone(p.scene);
      body.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      const g = new THREE.Group();
      g.add(body);
      restPose(body);
      const bone = k => body.getObjectByName(k);
      const B = { head: bone('head'), ul: bone('upperarm_l'), ll: bone('lowerarm_l'), hl: bone('hand_l'), ur: bone('upperarm_r'), lr: bone('lowerarm_r'), hr: bone('hand_r') };
      g.updateMatrixWorld(true);
      const eye = B.head ? B.head.getWorldPosition(new THREE.Vector3()).y + 0.08 : (p.info.height || 1.8) * 0.92;
      // как стои костта на главата, когато героят гледа право напред (+Z): спрямо това се върти с каската
      const headFix = B.head ? Q_BACK.clone().invert().multiply(B.head.getWorldQuaternion(new THREE.Quaternion())) : null;
      const st = { yaw: 0, first: true, tall: 1.55 };
      /** head, l, r: { pos, quat } в координатите на залата; l.on / r.on: следи ли се ръката. */
      function update(head, l, r, dt) {
        _fw.set(0, 0, -1).applyQuaternion(head.quat);
        const want = Math.atan2(_fw.x, _fw.z);
        if (st.first) { st.first = false; st.yaw = want; }
        let dy = want - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        st.yaw += dy * Math.min(1, dt * (Math.abs(dy) > 0.6 ? 6 : 2.5));          // торсът следва главата със закъснение
        st.tall = Math.max(st.tall, Math.min(2.05, head.pos.y));                   // ръстът: най-високото положение на главата
        const s = Math.min(1.12, Math.max(0.8, st.tall / eye));
        g.scale.setScalar(s);
        const bx = Math.sin(st.yaw), bz = Math.cos(st.yaw);
        g.position.set(head.pos.x - bx * 0.07, Math.max(-1.0, Math.min(0, head.pos.y - eye * s)), head.pos.z - bz * 0.07);      // клекнал или паднал играч: тялото потъва
        g.rotation.set(0, st.yaw, 0);
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
          const out = i ? 1 : -1;                                                                    // дясната ръка: лакътят надясно
          _pl.set(-bz * out * 0.45 - bx * 0.35, -0.7, bx * out * 0.45 - bz * 0.35).applyQuaternion(_pq);
          reach(up, lo, hand, _tg, _pl);
        }
      }
      return { group: g, name, tris: p.info.tris, update, dispose() { /* общите мрежи и материалът остават за следващия играч */ } };
    };
  } catch (e) { console.warn('[motel] player bodies', e); }
}

// Първа стая за оглед: закусвалнята, наредена със Synty модели, докато истинската игра се сглобява.
// Показва се в лобито (преди да е пусната игра). Всичко неподвижно е слято в един-два draw call-а.

const PACK = 'shops-pack';

// [модел, x, z, завъртане в градуси, y, мащаб]; x и z са в части от половината зала (−1 … 1), после се отместват навътре
function layout(hw, hd) {
  const L = [];
  const add = (name, x, z, rot = 0, y = 0, s = 1) => L.push({ name, x, z, rot, y, s });
  const wall = 0.08;

  // предна стена: тезгяхът към улицата
  for (const x of [-2.1, 0, 2.1]) if (Math.abs(x) < hw - 0.9) add('SM_Prop_Cafe_Counter_Outdoor_02', x, hd - 0.3, 180);
  add('SM_Prop_Shop_Cash_Register_01', 1.3, hd - 0.3, 180, 0.98, 0.6);
  add('SM_Prop_Food_Plastic_Tray_01', -0.6, hd - 0.3, 0, 0.98);
  add('SM_Prop_Food_Burger_01', -0.7, hd - 0.28, 0, 1.02, 0.7);
  add('SM_Prop_Food_Cup_Closed_01', -0.45, hd - 0.3, 0, 1.02, 0.6);
  add('SM_Prop_Food_Fries_01', -0.58, hd - 0.38, 0, 1.02, 0.7);
  add('SM_Prop_Food_Burger_Box_01', 0.4, hd - 0.3, 20, 0.98, 0.7);
  add('SM_Prop_Cafe_Menu_Board_02', 2.3, hd - 0.3, 180, 0.98);

  // лява стена: скара и маса за редене
  add('SM_Prop_Kitchen_Grill_01', -hw + 0.62, 1.1, 90, 0, 0.85);
  add('SM_Prop_Kitchen_Prep_Table_02', -hw + 0.55, -0.3, 90, 0, 0.85);
  add('SM_Prop_Food_Oven_Tray_01', -hw + 0.55, -0.3, 90, 0.9, 0.8);

  // дясна стена: напитки и фритюрник
  add('SM_Prop_Kitchen_Drinks_Machine_01', hw - 0.5, 1.2, -90, 0, 0.85);
  add('SM_Prop_Kitchen_Self_Serve_Machine_02', hw - 0.38, 0.0, -90);
  add('SM_Prop_Rubbish_Bin_01', hw - 0.32, -1.0, -90);

  // задна стена: рафтове, екран с менюто, каси
  add('SM_Prop_Shop_Shelf_01', -1.45, -hd + 0.3, 0);
  add('SM_Prop_Shop_Shelf_02', 1.45, -hd + 0.3, 0);
  add('SM_Prop_Kitchen_Menu_Screen_01', 0, -hd + 0.3, 0, 1.9);
  add('SM_Gen_Prop_Crate_02', -hw + 0.6, -hd + 0.75, 15, 0, 0.6);
  add('SM_Prop_Cardboard_Box_02', hw - 0.6, -hd + 0.65, -10, 0, 0.7);
  add('SM_Prop_Warehouse_Cardboard_Box_01', hw - 0.6, -hd + 0.65, 25, 0.44, 0.7);

  // ъгли: зеленина
  add('SM_Env_Plant_01', -hw + 0.5, hd - 0.9, 0, 0, 0.6);
  add('SM_Env_Plant_01', hw - 0.5, -hd + 1.6, 40, 0, 0.5);
  return { items: L, wall };
}

export async function createShowroom({ THREE, root, assets, hall }) {
  const hw = hall.w / 2, hd = hall.d / 2;
  const group = new THREE.Group();
  root.add(group);
  let pack;
  try { pack = await assets.loadPack(PACK); } catch { return { dispose() { root.remove(group); } }; }
  const { items } = layout(hw, hd);
  const have = items.filter(i => pack.models[i.name]);
  await assets.preload([...new Set(have.map(i => i.name))].map(n => [PACK, n]));

  const placed = [];
  for (const it of have) {
    const obj = assets.getSync(PACK, it.name);
    if (!obj) continue;
    const info = pack.models[it.name];
    // моделите на Synty са с начало на различни места: центрираме основата по размерите от pack.json
    obj.position.set(-(info.min[0] + info.max[0]) / 2, -info.min[1], -(info.min[2] + info.max[2]) / 2);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.scale.setScalar(it.s);
    holder.rotation.y = it.rot * Math.PI / 180;
    holder.position.set(it.x, it.y, it.z);
    placed.push(holder);
  }
  const merged = assets.merge(placed);
  group.add(merged);

  // под и стени: прости плоскости, за да не виси стаята в нищото
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hall.w, hall.d), new THREE.MeshLambertMaterial({ color: 0x3b3a36 }));
  floor.rotation.x = -Math.PI / 2;
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x6f6a5c, side: THREE.DoubleSide });
  const mk = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.8), wallMat); m.position.set(x, 1.4, z); m.rotation.y = ry; return m; };
  group.add(floor, mk(hall.w, 0, -hd, 0), mk(hall.d, -hw, 0, Math.PI / 2), mk(hall.d, hw, 0, -Math.PI / 2));
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(hall.w, 0.9), new THREE.MeshLambertMaterial({ color: 0x8a2f2a, side: THREE.DoubleSide }));
  stripe.position.set(0, 2.35, hd);
  group.add(stripe);

  return {
    count: placed.length,
    dispose() {
      root.remove(group);
      group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
}

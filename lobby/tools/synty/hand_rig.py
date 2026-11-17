# hand_rig.py: ставите на пръстите за ръцете на играча.
# characters.mjs пече ръката като неподвижен модел (hands/hand_l|r.glb). Тук от същия изходен файл на Synty (Sidekick)
# се вадят костите на пръстите и тежестите на върховете в същата координатна система и същия ред на върховете:
# hands/hand_l|r.json = { joints: [{ name, parent, pos }], J: [по 4 на връх], W: [по 4 на връх] }.
# Пускане:  python -I tools/synty/hand_rig.py [път до библиотеката]
import json, struct, sys, os, math
sys.stdout.reconfigure(encoding='utf-8')

LIB = sys.argv[1] if len(sys.argv) > 1 else '//192.168.1.40/synty'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'play', 'assets', 'synty', '_characters')
cfg = None
for e in json.load(open(os.path.join(HERE, 'want', 'kinds.json'), encoding='utf-8')):
    if isinstance(e, dict) and e.get('hands'): cfg = e['hands']
if cfg is None:
    for e in json.load(open(os.path.join(HERE, 'want', 'kinds.json'), encoding='utf-8')):
        if isinstance(e, dict) and e.get('characters') and e.get('hands'): cfg = e['hands']
assert cfg, 'няма hands в want/kinds.json'

def sub(a, b): return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
def dot(a, b): return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
def mul(a, k): return [a[0]*k, a[1]*k, a[2]*k]
def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return [a[0]/l, a[1]/l, a[2]/l]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

def inv_translation(m):
    # m: 16 числа по колони (glTF). Мястото на костта в покой = преводът на обратната матрица = -R^T t
    r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]
    t = [m[12], m[13], m[14]]
    # общ случай (с мащаб): обръщане на 3x3
    a, b, c = r[0]; d, e, f = r[1]; g, h, i = r[2]
    det = a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g)
    inv = [[(e*i-f*h)/det, (c*h-b*i)/det, (b*f-c*e)/det], [(f*g-d*i)/det, (a*i-c*g)/det, (c*d-a*f)/det], [(d*h-e*g)/det, (b*g-a*h)/det, (a*e-b*d)/det]]
    return [-(inv[0][0]*t[0] + inv[0][1]*t[1] + inv[0][2]*t[2]), -(inv[1][0]*t[0] + inv[1][1]*t[1] + inv[1][2]*t[2]), -(inv[2][0]*t[0] + inv[2][1]*t[1] + inv[2][2]*t[2])]

for side in ('l', 'r'):
    b = open(os.path.join(LIB, cfg[side]), 'rb').read()
    ln = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20+ln]); binoff = 20 + ln + 8
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        off = binoff + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        fmt = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
        stride = bv.get('byteStride', struct.calcsize(fmt) * n)
        return [struct.unpack_from('<' + fmt * n, b, off + k * stride) for k in range(a['count'])]
    skin = j['skins'][0]; names = [j['nodes'][k]['name'] for k in skin['joints']]
    ibm = acc(skin['inverseBindMatrices'])
    at = lambda n: inv_translation(ibm[names.index(n)])
    Wp = at('hand_' + side)
    f = norm(sub(at('middle_01_' + side), Wp))
    t = sub(at('thumb_01_' + side), Wp); s = norm(sub(t, mul(f, dot(t, f))))
    X = mul(s, -1) if side == 'r' else s[:]; Z = mul(f, -1); Y = norm(cross(Z, X)); X = norm(cross(Y, Z))
    prim = j['meshes'][0]['primitives'][0]
    P = acc(prim['attributes']['POSITION']); JJ = acc(prim['attributes']['JOINTS_0']); WW = acc(prim['attributes']['WEIGHTS_0'])
    reach = max(dot(sub(p, Wp), f) for p in P)
    k = (cfg.get('length') or 0.19) / reach
    to_hand = lambda p: [round(dot(X, sub(p, Wp)) * k, 4), round(dot(Y, sub(p, Wp)) * k, 4), round(dot(Z, sub(p, Wp)) * k, 4)]
    par = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): par[c] = i
    order = ['hand'] + [f'{fg}_0{n}' for fg in ('thumb', 'index', 'middle', 'ring', 'pinky') for n in (1, 2, 3)]
    joints, index = [], {}
    for base in order:
        nm = f'{base}_{side}'
        if nm not in names: continue
        node = skin['joints'][names.index(nm)]
        pn = j['nodes'][par[node]]['name'] if node in par else None
        index[names.index(nm)] = len(joints)
        joints.append({'name': base, 'parent': next((i for i, q in enumerate(joints) if f"{q['name']}_{side}" == pn), -1) if base != 'hand' else -1, 'pos': to_hand(at(nm))})
    J, Wt = [], []
    for jj, ww in zip(JJ, WW):
        acc_w = {}
        for a, w in zip(jj, ww):
            if w <= 0: continue
            q = index.get(a, 0)                       # костите на ръката над китката водят към самата китка
            acc_w[q] = acc_w.get(q, 0) + w
        items = sorted(acc_w.items(), key=lambda x: -x[1])[:4]
        tot = sum(w for _, w in items) or 1
        items += [(0, 0)] * (4 - len(items))
        J += [q for q, _ in items]; Wt += [round(w / tot, 3) for _, w in items]
    mn = [min(to_hand(p)[i] for p in P) for i in range(3)]; mx = [max(to_hand(p)[i] for p in P) for i in range(3)]
    out = {'joints': joints, 'J': J, 'W': Wt}
    with open(os.path.join(OUT, 'hands', f'hand_{side}.json'), 'w', encoding='utf-8', newline='\n') as fo: json.dump(out, fo, separators=(',', ':'))
    print(side, len(P), 'върха,', len(joints), 'стави, от', mn, 'до', mx)
    for q in joints: print('   ', q['name'], q['parent'], q['pos'])

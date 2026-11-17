# Превръща сцена на Unity (.unity) в списък „кой модел къде стои" за играта.
#
#   python -I tools/synty/unity_scene.py <папка, извадена с unitypack.py> <път до .unity> <изход.json>
#
# Чете сцената и префабите ѝ (и вложените), смята световната матрица на всяка мрежа и я записва като
#   { "models": ["PolygonShops/SM_Bld_...", ...], "items": [[номер на модела, m00..m23 (12 числа: 3x4, по редове)], ...] }
# в координатите на Unity (лява система, Y нагоре). Обръщането към three.js става при зареждане (огледало по X).
# Без външни библиотеки: YAML-ът на Unity е достатъчно прост, чете се с регулярни изрази.
import io
import json
import math
import os
import re
import sys

root_dir, scene_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

guid_path = {}
for line in io.open(os.path.join(root_dir, 'guids.tsv'), encoding='utf-8'):
    g, _, p = line.rstrip('\n').partition('\t')
    if g and p:
        guid_path[g] = p

HEAD = re.compile(r'^--- !u!(\d+) &(-?\d+)( stripped)?\s*$', re.M)
NUM = r'(-?[\d.]+(?:e[-+]?\d+)?)'
VEC3 = re.compile(r'\{x: %s, y: %s, z: %s\}' % (NUM, NUM, NUM))
VEC4 = re.compile(r'\{x: %s, y: %s, z: %s, w: %s\}' % (NUM, NUM, NUM, NUM))
REF = re.compile(r'\{fileID: (-?\d+)(?:, guid: ([0-9a-f]+))?')


def field(body, name):
    m = re.search(r'^\s*%s: (.*)$' % re.escape(name), body, re.M)
    return m.group(1) if m else None


def ref(body, name):
    v = field(body, name)
    m = REF.search(v) if v else None
    return (int(m.group(1)), m.group(2)) if m else (0, None)


def mat_trs(p, q, s):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[i][0] * s[0], r[i][1] * s[1], r[i][2] * s[2], p[i]] for i in range(3)]


def mat_mul(a, b):
    out = []
    for i in range(3):
        row = [sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)]
        row.append(sum(a[i][k] * b[k][3] for k in range(3)) + a[i][3])
        out.append(row)
    return out


IDENT = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]
cache = {}


class Doc:
    """Един файл на Unity: обектите му по fileID."""

    def __init__(self, text):
        self.tr = {}        # fileID на Transform → { go, p, q, s, father, stripped, inst }
        self.go = {}        # fileID на GameObject → { name, active }
        self.mesh = {}      # fileID на GameObject → (fileID на мрежата, guid на модела)
        self.shown = set()  # GameObject-и с включен MeshRenderer
        self.mats = {}      # fileID на GameObject → [guid на материал за всяка част на мрежата]
        self.rend = {}      # fileID на GameObject → fileID на неговия MeshRenderer
        self.inst = {}      # fileID на PrefabInstance → { guid, parent, mods }
        heads = list(HEAD.finditer(text))
        for i, h in enumerate(heads):
            cls, fid, stripped = int(h.group(1)), int(h.group(2)), bool(h.group(3))
            body = text[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(text)]
            if cls == 1:
                self.go[fid] = {'name': (field(body, 'm_Name') or '').strip(), 'active': (field(body, 'm_IsActive') or '1').strip() != '0'}
            elif cls == 4 or cls == 224:
                p = VEC3.search(field(body, 'm_LocalPosition') or '')
                q = VEC4.search(field(body, 'm_LocalRotation') or '')
                s = VEC3.search(field(body, 'm_LocalScale') or '')
                self.tr[fid] = {
                    'go': ref(body, 'm_GameObject')[0],
                    'p': [float(v) for v in p.groups()] if p else [0, 0, 0],
                    'q': [float(v) for v in q.groups()] if q else [0, 0, 0, 1],
                    's': [float(v) for v in s.groups()] if s else [1, 1, 1],
                    'father': ref(body, 'm_Father')[0], 'stripped': stripped, 'inst': ref(body, 'm_PrefabInstance')[0],
                    'src': ref(body, 'm_CorrespondingSourceObject'),
                }
            elif cls == 33:
                self.mesh[ref(body, 'm_GameObject')[0]] = ref(body, 'm_Mesh')
            elif cls == 23:
                go = ref(body, 'm_GameObject')[0]
                self.rend[go] = fid
                if (field(body, 'm_Enabled') or '1').strip() != '0':
                    self.shown.add(go)
                mm = re.search(r'm_Materials:\s*\n((?:\s*- \{[^}]*\}\s*\n)+)', body)
                self.mats[go] = [g.group(1) for g in re.finditer(r'guid: ([0-9a-f]+)', mm.group(1))] if mm else []
            elif cls == 1001:
                mods = {}
                for m in re.finditer(r'- target: \{fileID: (-?\d+)(?:, guid: ([0-9a-f]+))?[^}]*\}\s*\n\s*propertyPath: (\S+)\s*\n\s*value: ?(.*)\n\s*objectReference: \{fileID: (-?\d+)(?:, guid: ([0-9a-f]+))?', body):
                    val = m.group(4).strip()
                    if not val and m.group(6):
                        val = 'ref:' + m.group(6)
                    mods.setdefault(int(m.group(1)), {})[m.group(3)] = val
                self.inst[fid] = {'guid': ref(body, 'm_SourcePrefab')[1], 'parent': ref(body, 'm_TransformParent')[0], 'mods': mods}

    def world(self, fid, memo):
        """Световната матрица на Transform (в рамките на този файл)."""
        if fid in memo:
            return memo[fid]
        t = self.tr.get(fid)
        if not t:
            memo[fid] = IDENT
            return IDENT
        if t['stripped']:      # корен (или вътрешна кост) на вложен префаб: взимаме мястото на самия префаб
            m = self.inst_matrix(t['inst'], memo)
        else:
            local = mat_trs(t['p'], t['q'], t['s'])
            m = mat_mul(self.world(t['father'], memo), local) if t['father'] else local
        memo[fid] = m
        return m

    def inst_matrix(self, iid, memo):
        key = ('i', iid)
        if key in memo:
            return memo[key]
        ins = self.inst.get(iid)
        if not ins:
            memo[key] = IDENT
            return IDENT
        sub = load(ins['guid'])
        p, q, s = [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]
        if sub and sub.roots:
            r = sub.tr[sub.roots[0]]
            p, q, s = list(r['p']), list(r['q']), list(r['s'])
            mod = ins['mods'].get(sub.roots[0], {})
        else:
            mod = {}
            for m in ins['mods'].values():
                if any(k.startswith('m_LocalPosition') for k in m):
                    mod = m
                    break
        for k, v in mod.items():
            try:
                f = float(v)
            except ValueError:
                continue
            a = k.split('.')
            if len(a) != 2:
                continue
            tgt = p if a[0] == 'm_LocalPosition' else q if a[0] == 'm_LocalRotation' else s if a[0] == 'm_LocalScale' else None
            if tgt is not None and a[1] in 'xyzw':
                tgt['xyzw'.index(a[1])] = f
        local = mat_trs(p, q, s)
        m = mat_mul(self.world(ins['parent'], memo), local) if ins['parent'] else local
        memo[key] = m
        return m


def load(guid):
    """Префаб по guid (с кеш). roots: трансформите без баща."""
    if guid in cache:
        return cache[guid]
    path = guid_path.get(guid)
    doc = None
    if path and path.endswith('.prefab'):
        full = os.path.join(root_dir, path.replace('/', os.sep))
        if os.path.exists(full):
            doc = Doc(io.open(full, encoding='utf-8', errors='replace').read())
            doc.roots = [f for f, t in doc.tr.items() if not t['stripped'] and not t['father']]
    cache[guid] = doc
    return doc


def meshes(doc, base, out, depth=0, hidden=frozenset()):
    """Всички видими мрежи във файла (и във вложените префаби), умножени по base."""
    memo = {}
    for go, (mfid, mguid) in doc.mesh.items():
        if go not in doc.shown or not doc.go.get(go, {}).get('active', True) or not mguid:
            continue
        tid = next((f for f, t in doc.tr.items() if t['go'] == go and not t['stripped']), None)
        if tid is None:
            continue
        out.append((mguid, mfid, mat_mul(base, doc.world(tid, memo)), doc.mats.get(go, []), doc.rend.get(go, 0), doc.go.get(go, {}).get('name', '')))
    if depth > 6:
        return
    for iid, ins in doc.inst.items():
        sub = load(ins['guid'])
        if not sub:
            # префабът е самият модел (FBX, сложен направо в сцената)
            p = guid_path.get(ins['guid'] or '', '')
            if p.lower().endswith('.fbx'):
                order = []
                for _tgt, m2 in ins['mods'].items():
                    for k2 in sorted(m2):
                        if k2.startswith('m_Materials.Array.data[') and m2[k2].startswith('ref:'):
                            order.append(m2[k2][4:])
                out.append((ins['guid'], 0, mat_mul(base, doc.inst_matrix(iid, memo)), order, 0, ''))
            continue
        # изключен ли е коренът му с промяна
        off = any(m.get('m_IsActive') == '0' for m in ins['mods'].values())
        if off:
            continue
        m = doc.inst_matrix(iid, memo)
        # коренът на вложения префаб вече е в m: неговите мрежи се смятат спрямо корена
        inner = []
        meshes(sub, IDENT, inner, depth + 1)
        if sub.roots:
            rm = sub.world(sub.roots[0], {})
        else:      # вариант на префаб: коренът му е друг префаб
            top = [i for i, q in sub.inst.items() if not q['parent']]
            rm = sub.inst_matrix(top[0], {}) if top else IDENT
        inv = invert(rm)
        for g, f, mm, mt, rid, part in inner:
            over = ins['mods'].get(rid)
            if over:      # сцената е сменила материала на тази част
                mt = list(mt)
                for k, v in over.items():
                    q = re.match(r'm_Materials\.Array\.data\[(\d+)\]$', k)
                    if q and v.startswith('ref:'):
                        i = int(q.group(1))
                        while len(mt) <= i:
                            mt.append(v[4:])
                        mt[i] = v[4:]
            out.append((g, f, mat_mul(base, mat_mul(m, mat_mul(inv, mm))), mt, rid, part))


def invert(m):
    a = [row[:3] for row in m]
    det = (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])) or 1e-12
    inv = [[(a[(j + 1) % 3][(i + 1) % 3] * a[(j + 2) % 3][(i + 2) % 3] - a[(j + 1) % 3][(i + 2) % 3] * a[(j + 2) % 3][(i + 1) % 3]) / det for j in range(3)] for i in range(3)]
    t = [m[0][3], m[1][3], m[2][3]]
    return [inv[i] + [-(inv[i][0] * t[0] + inv[i][1] * t[1] + inv[i][2] * t[2])] for i in range(3)]


scene = Doc(io.open(scene_path, encoding='utf-8', errors='replace').read())
found = []
meshes(scene, IDENT, found)

# ── материалите: коя текстура и какъв цвят (от .mat файловете на Unity) ──
TEX_SKIP = ('normal', 'emiss', 'metal', 'mask', 'rough', 'occlu', 'height', 'detail', 'spec', 'bump', 'ao', 'noise', 'overlay', 'grunge', 'dirt')
mat_cache = {}


def material(guid):
    if guid in mat_cache:
        return mat_cache[guid]
    path = guid_path.get(guid, '')
    info = {'name': os.path.splitext(os.path.basename(path))[0] or guid, 'tex': None, 'pack': None, 'color': [1, 1, 1], 'alpha': 1}
    full = os.path.join(root_dir, path.replace('/', os.sep)) if path else ''
    if full and os.path.exists(full):
        text = io.open(full, encoding='utf-8', errors='replace').read()
        cands = []
        for m in re.finditer(r'- (\w+):\s*\n\s*m_Texture: \{fileID: \d+, guid: ([0-9a-f]+)', text):
            slot, tg = m.group(1), m.group(2)
            tp = guid_path.get(tg)
            if not tp or any(k in slot.lower() for k in TEX_SKIP):
                continue
            low = slot.lower()
            rank = 0 if ('albedo' in low or 'basemap' in low or 'maintex' in low or 'base_texture' in low or 'diffuse' in low) else 1 if ('base' in low or 'texture' in low or 'color' in low or 'colour' in low) else 2
            cands.append((rank, tp))
        if cands:
            tp = sorted(cands)[0][1]
            parts = tp.split('/')
            info['tex'] = os.path.basename(tp)
            info['pack'] = parts[2] if len(parts) > 3 else ''
        for key in ('_BaseColor', '_Color', '_Base_Color', '_Colour', '_Albedo_Tint', '_Color_Tint'):
            m = re.search(r'- %s: \{r: %s, g: %s, b: %s, a: %s\}' % (key, NUM, NUM, NUM, NUM), text)
            if m:
                info['color'] = [round(float(m.group(i)), 3) for i in (1, 2, 3)]
                info['alpha'] = round(float(m.group(4)), 3)
                break
        low = info['name'].lower()
        if 'glass' in low or 'transparent' in low or 'window' in low and 'frame' not in low:
            info['glass'] = True
    mat_cache[guid] = info
    return info


names, index, items, missing = [], {}, [], {}
mats, mat_index = [], {}
parts_list, part_index = [], {}
model_path = {}
for guid, fid, m, mt, _rid, part in found:
    p = guid_path.get(guid)
    if not p or not p.lower().endswith('.fbx'):
        missing[p or guid] = missing.get(p or guid, 0) + 1
        continue
    parts = p.split('/')
    key = (parts[2] if len(parts) > 3 else '') + '/' + os.path.splitext(parts[-1])[0]
    if key not in index:
        index[key] = len(names)
        names.append(key)
        model_path[index[key]] = p
    ids = []
    for g in mt:
        if g not in mat_index:
            mat_index[g] = len(mats)
            mats.append(material(g))
        ids.append(mat_index[g])
    if part not in part_index:
        part_index[part] = len(parts_list)
        parts_list.append(part)
    items.append([index[key]] + [round(v, 4) for row in m for v in row] + [part_index[part]] + ids)

# Модели без материали от префаб (сложени направо или през вариант): материалите им са в настройките на самия модел
# (.fbx.meta, externalObjects: име на материала във файла → материал на Unity).
defaults = {}
for it in items:
    if len(it) > 14 or it[0] in defaults:
        continue
    table = {}
    full = os.path.join(root_dir, model_path[it[0]].replace('/', os.sep)) + '.meta'
    if os.path.exists(full):
        text = io.open(full, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r'type: UnityEngine:Material\s*\n\s*assembly: [^\n]*\n\s*name: ([^\n]+)\n\s*second: \{fileID: \d+, guid: ([0-9a-f]+)', text):
            g = m.group(2)
            if g not in mat_index:
                mat_index[g] = len(mats)
                mats.append(material(g))
            table[m.group(1).strip()] = mat_index[g]
    defaults[it[0]] = table

with io.open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump({'scene': os.path.basename(scene_path), 'models': names, 'mats': mats, 'parts': parts_list, 'defaults': {str(k): v for k, v in defaults.items() if v}, 'items': items}, f, separators=(',', ':'))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
xs = [it[4] for it in items]
zs = [it[12] for it in items]
print('objects:', len(items), 'models:', len(names), 'materials:', len(mats), 'not meshes:', sum(missing.values()), 'models with own materials:', sum(1 for v in defaults.values() if v), 'of', len(defaults))
tex = {}
for q in mats:
    tex[(q['pack'], q['tex'])] = tex.get((q['pack'], q['tex']), 0) + 1
for k, v in sorted(tex.items(), key=lambda kv: -kv[1]):
    print('  tex', v, k)
if items:
    print('x: %.1f .. %.1f   z: %.1f .. %.1f' % (min(xs), max(xs), min(zs), max(zs)))
for k, v in sorted(missing.items(), key=lambda kv: -kv[1])[:8]:
    print('  skipped', v, k)

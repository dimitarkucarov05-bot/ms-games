"""List the connected shells of a converted GLB model with their bounding boxes: python glbparts.py <file.glb> [min tris]"""
import json, struct, sys
import numpy as np

f = open(sys.argv[1], 'rb').read()
jl = struct.unpack_from('<I', f, 12)[0]
J = json.loads(f[20:20 + jl])
bo = 20 + jl + 8
B = f[bo:]
CT = {5120: 'i1', 5121: 'u1', 5122: 'i2', 5123: 'u2', 5125: 'u4', 5126: 'f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = np.dtype('<' + CT[a['componentType']])
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride') or dt.itemsize * n
    raw = np.frombuffer(B, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * n, offset=off)
    out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(stride, 1)).copy().view(dt).reshape(a['count'], n)
    return out


print('nodes:', [(n.get('name'), n.get('mesh'), n.get('translation'), n.get('scale')) for n in J['nodes']][:12])
for mi, m in enumerate(J['meshes']):
    for pi, p in enumerate(m['primitives']):
        pos = acc(p['attributes']['POSITION']).astype(np.float64)
        idx = acc(p['indices']).reshape(-1) if 'indices' in p else np.arange(len(pos))
        tri = idx.reshape(-1, 3)
        key = np.round(pos * 2000).astype(np.int64)
        _, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        t = inv[tri]
        parent = np.arange(inv.max() + 1)

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]; x = parent[x]
            return x
        for a, b, c in t:
            ra, rb, rc = find(a), find(b), find(c)
            parent[rb] = ra; parent[find(c)] = ra
        root = np.array([find(x) for x in t[:, 0]])
        print(f'mesh {mi} prim {pi}: {len(tri)} tris, material {p.get("material")}, bbox {pos.min(0).round(2).tolist()} .. {pos.max(0).round(2).tolist()}')
        rows = []
        for r in np.unique(root):
            sel = tri[root == r].reshape(-1)
            q = pos[sel]
            rows.append((len(sel) // 3, q.min(0).round(3).tolist(), q.max(0).round(3).tolist()))
        mn = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        for n, a, b in sorted(rows, key=lambda r: -r[0]):
            if n >= mn: print(f'   shell {n:4d} tris  x {a[0]:6.2f}..{b[0]:6.2f}  y {a[1]:6.2f}..{b[1]:6.2f}  z {a[2]:6.2f}..{b[2]:6.2f}')

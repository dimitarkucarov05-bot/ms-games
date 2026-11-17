# Вади земята (Unity Terrain) на готова карта на Synty: парче от височинната карта около игралната зона.
#
#   python -I tools/synty/terrain.py <TerrainData.asset> <x> <y> <z на терена в сцената> <cx> <cz> <радиус м> <изходна папка> [layout.json за проверка]
#
# TerrainData е двоичен файл на Unity. Височините са масив SInt16 (m_Heightmap.m_Heights), разделителната способност и
# мащабът стоят малко след него. Масивът се намира по дължината си (res*res) и после полетата се четат подред:
#   m_Heights, m_Holes, m_HolesLOD, m_EnableHolesTextureCompression, m_PrecomputedError, m_MinMaxPatchHeights, m_Resolution, m_Levels, m_Scale
# Свят (Unity): x = X0 + i*sx, z = Z0 + j*sz, y = Y0 + h[j*res + i] / 32766 * sy
# Изход: terrain.bin (Int16, ред по ред) и terrain.json (откъде започва парчето, стъпка, мащаб).
import array
import io
import json
import math
import os
import struct
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
asset, X0, Y0, Z0, cx, cz, R, out_dir = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7]), sys.argv[8]
b = open(asset, 'rb').read()


def vec(o, size):
    n = struct.unpack_from('<i', b, o)[0]
    start = o + 4
    return n, start, (start + n * size + 3) & ~3


found = None
for res in (4097, 2049, 1025, 513, 257, 129):
    i = b.find(struct.pack('<i', res * res))
    while i >= 0 and not found:
        try:
            n, hs, o = vec(i, 2)
            _, _, o = vec(o, 1)
            _, _, o = vec(o, 1)
            o += 4
            _, _, o = vec(o, 4)
            _, _, o = vec(o, 4)
            r2, levels = struct.unpack_from('<ii', b, o)
            sx, sy, sz = struct.unpack_from('<fff', b, o + 8)
            if r2 == res and 0 < sx < 100 and 0 < sy < 100000:
                found = (res, hs, sx, sy, sz)
        except struct.error:
            pass
        i = b.find(struct.pack('<i', res * res), i + 1)
    if found:
        break
if not found:
    raise SystemExit('не намерих височинната карта')
res, hs, sx, sy, sz = found
h = array.array('h')
h.frombytes(b[hs:hs + res * res * 2])
print('терен: %d x %d, стъпка %.4f м, височина до %.1f м, размер %.0f м' % (res, res, sx, max(h) / 32766 * sy, (res - 1) * sx))


def height(ux, uz):
    fx, fz = (ux - X0) / sx, (uz - Z0) / sz
    i, j = int(math.floor(fx)), int(math.floor(fz))
    if i < 0 or j < 0 or i >= res - 1 or j >= res - 1:
        return None
    a, c = fx - i, fz - j
    v = lambda ii, jj: h[jj * res + ii] / 32766.0 * sy
    return Y0 + (v(i, j) * (1 - a) + v(i + 1, j) * a) * (1 - c) + (v(i, j + 1) * (1 - a) + v(i + 1, j + 1) * a) * c


# проверка: растенията от сцената стоят на земята
if len(sys.argv) > 9:
    d = json.load(io.open(sys.argv[9], encoding='utf-8'))
    err = []
    for it in d['items']:
        name = d['models'][it[0]]
        if not any(k in name for k in ('Pine', 'Bush', 'Grass', 'GroundCover', 'Flower')):
            continue
        if math.hypot(it[4] - cx, it[12] - cz) > R:
            continue
        y = height(it[4], it[12])
        if y is not None:
            err.append(it[8] - y)
    err.sort()
    if err:
        n = len(err)
        print('проверка с %d растения: средна разлика %.3f м, медиана %.3f, 5%% %.3f, 95%% %.3f' % (n, sum(err) / n, err[n // 2], err[n // 20], err[n - 1 - n // 20]))

i0, i1 = max(0, int((cx - R - X0) / sx)), min(res - 1, int(math.ceil((cx + R - X0) / sx)))
j0, j1 = max(0, int((cz - R - Z0) / sz)), min(res - 1, int(math.ceil((cz + R - Z0) / sz)))
w, hh = i1 - i0 + 1, j1 - j0 + 1
part = array.array('h', (h[j * res + i] for j in range(j0, j1 + 1) for i in range(i0, i1 + 1)))
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, 'terrain.bin'), 'wb').write(part.tobytes())
meta = {'w': w, 'h': hh, 'x0': X0 + i0 * sx, 'z0': Z0 + j0 * sz, 'y0': Y0, 'step': sx, 'yScale': sy / 32766.0, 'note': 'Unity координати; y = y0 + стойност * yScale; редовете са по z'}
json.dump(meta, io.open(os.path.join(out_dir, 'terrain.json'), 'w', encoding='utf-8', newline='\n'), ensure_ascii=False)
print('terrain.bin: %d x %d (%d байта), от (%.2f, %.2f)' % (w, hh, len(part) * 2, meta['x0'], meta['z0']))
for ax, az in ((0, 0), (0, -1), (1.5, 0.3), (-1.5, -1.4), (-1.8, -4.5), (0.4, -4.5), (0.4, -2.5), (-1, -3), (3, 0), (0, 3), (0, -7), (6, -3), (-3, -2)):
    print('  зона (%.1f, %.1f): %.3f' % (ax, az, height(cx - ax, cz + az)))

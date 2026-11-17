"""Top view of the baked city map in the coordinates of the play zone.
usage: python mapview.py <city-lite|city> <out.png> [x0 z0 x1 z1] [px per metre]
Ground height is shown as grey (darker = lower), anything standing between 0.25 m and 2.3 m above y=0 is red, things higher
than that only are blue (roofs, canopies). Grid lines every 5 m, a thick line at 0. The zone (two rooms) is drawn in yellow."""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

D = 'C:/Users/Martiness/Downloads/vr-arena/lobby/public/play/assets/maps/shopping-plaza/'
name = sys.argv[1]; out = sys.argv[2]
x0, z0, x1, z1 = (float(v) for v in sys.argv[3:7]) if len(sys.argv) >= 7 else (-45, -45, 45, 45)
ppm = float(sys.argv[7]) if len(sys.argv) >= 8 else 10
meta = json.load(open(D + name + '.json', encoding='utf-8'))
buf = np.fromfile(D + name + '.bin', dtype=np.uint8)
stride = meta.get('stride', 20)
W, H = int((x1 - x0) * ppm), int((z1 - z0) * ppm)
ground = np.full((H, W), -9.0, np.float32)      # highest surface at or below 0.25 m
low = np.zeros((H, W), bool)                    # something between 0.25 and 2.3 m
high = np.zeros((H, W), bool)                   # something above 2.3 m
rs = np.random.default_rng(1)
for ch in meta['chunks']:
    if ch.get('unlit'):
        continue
    n = ch['verts']; o = ch['offset']
    raw = buf[o:o + n * stride].reshape(n, stride)
    P = raw[:, :6].copy().view('<u2').astype(np.float32) * (ch['span'] / 65535.0) + np.array(ch['min'], np.float32)
    T = P.reshape(-1, 3, 3)
    c = T.mean(axis=1)
    keep = (c[:, 0] > x0 - 6) & (c[:, 0] < x1 + 6) & (c[:, 2] > z0 - 6) & (c[:, 2] < z1 + 6)
    T = T[keep]
    if not len(T):
        continue
    a, b, cc = T[:, 0], T[:, 1], T[:, 2]
    area = 0.5 * np.linalg.norm(np.cross(b - a, cc - a), axis=1)
    k = np.clip(np.ceil(area * ppm * ppm * 2.5), 1, 4000).astype(int)
    idx = np.repeat(np.arange(len(T)), k)
    u = rs.random(len(idx), dtype=np.float32); v = rs.random(len(idx), dtype=np.float32)
    f = u + v > 1; u[f] = 1 - u[f]; v[f] = 1 - v[f]
    S = a[idx] + (b[idx] - a[idx]) * u[:, None] + (cc[idx] - a[idx]) * v[:, None]
    px = ((S[:, 0] - x0) * ppm).astype(int); pz = ((S[:, 2] - z0) * ppm).astype(int)
    ok = (px >= 0) & (px < W) & (pz >= 0) & (pz < H)
    px, pz, y = px[ok], pz[ok], S[ok, 1]
    g = y <= 0.25
    np.maximum.at(ground, (pz[g], px[g]), y[g])
    m = (y > 0.25) & (y <= 2.3)
    low[pz[m], px[m]] = True
    high[pz[y > 2.3], px[y > 2.3]] = True
img = np.zeros((H, W, 3), np.uint8)
gv = np.clip((ground + 0.6) / 0.9, 0, 1)
img[..., 0] = img[..., 1] = img[..., 2] = (40 + gv * 150).astype(np.uint8)
img[ground < -8] = (0, 0, 0)
img[high] = (img[high] * 0.5 + np.array([40, 60, 160]) * 0.5).astype(np.uint8)
img[low] = (200, 50, 40)
im = Image.fromarray(img[::-1])      # z grows upward in the picture: the counter side (+z) is at the top
d = ImageDraw.Draw(im)
X = lambda x: (x - x0) * ppm
Z = lambda z: H - (z - z0) * ppm
for g5 in range(int(np.ceil(x0 / 5) * 5), int(x1) + 1, 5):
    d.line([X(g5), 0, X(g5), H], fill=(255, 255, 255) if g5 == 0 else (90, 110, 90), width=2 if g5 == 0 else 1)
    d.text((X(g5) + 2, 2), str(g5), fill=(255, 255, 0))
for g5 in range(int(np.ceil(z0 / 5) * 5), int(z1) + 1, 5):
    d.line([0, Z(g5), W, Z(g5)], fill=(255, 255, 255) if g5 == 0 else (90, 110, 90), width=2 if g5 == 0 else 1)
    d.text((2, Z(g5) + 2), str(g5), fill=(255, 255, 0))
for (cx, cz, w, dd) in [(0, 0, 2.4, 2.3), (-0.7, -2.7, 1.6, 3.1)]:
    d.rectangle([X(cx - w / 2), Z(cz + dd / 2), X(cx + w / 2), Z(cz - dd / 2)], outline=(255, 230, 0), width=2)
# spots to try: SPOTS env = "name:cx:cz:thetaDeg;..." ; the zone is drawn there and what stands inside it is counted
import os, math
for sp in filter(None, os.environ.get('SPOTS', '').split(';')):
    nm, cx, cz, th = sp.split(':'); cx, cz, th = float(cx), float(cz), math.radians(float(th))
    def M(lx, lz): return (cx + lx * math.cos(th) - lz * math.sin(th), cz + lx * math.sin(th) + lz * math.cos(th))
    bad = 0; tot = 0; gs = []
    for (rx, rz, w, dd) in [(0, 0, 2.4, 2.3), (-0.7, -2.7, 1.6, 3.1)]:
        cs = [M(rx - w / 2, rz - dd / 2), M(rx + w / 2, rz - dd / 2), M(rx + w / 2, rz + dd / 2), M(rx - w / 2, rz + dd / 2)]
        d.polygon([(X(x), Z(z)) for x, z in cs], outline=(255, 230, 0))
        for lx in np.arange(rx - w / 2 - 0.3, rx + w / 2 + 0.31, 0.1):
            for lz in np.arange(rz - dd / 2 - 0.3, rz + dd / 2 + 0.31, 0.1):
                x, z = M(lx, lz); ix, iz = int((x - x0) * ppm), int((z - z0) * ppm)
                if 0 <= ix < W and 0 <= iz < H:
                    tot += 1; bad += bool(low[iz, ix]); 
                    if ground[iz, ix] > -8: gs.append(float(ground[iz, ix]))
    fx, fz = M(0, 1.15); kx, kz = M(-0.7, -4.25)
    d.text((X(fx), Z(fz)), nm + ' front', fill=(0, 255, 255)); d.text((X(kx), Z(kz)), 'lift', fill=(0, 255, 255))
    print(nm, 'obstructed cells', bad, 'of', tot, 'ground min/median/max', round(min(gs), 3), round(float(np.median(gs)), 3), round(max(gs), 3))
im.save(out)
print(out, im.size)

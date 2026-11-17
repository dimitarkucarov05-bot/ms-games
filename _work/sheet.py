"""Contact sheet of Synty catalogue models: python sheet.py <out.jpg> <regex on 'pack|name'> [more regexes...]"""
import csv, os, re, sys
from PIL import Image, ImageDraw

rows = list(csv.DictReader(open('C:/Users/Martiness/Downloads/vr-arena/_work/catalog.csv', encoding='utf-8-sig')))
out, pats = sys.argv[1], [re.compile(p, re.I) for p in sys.argv[2:]]
want = [r for r in rows if r['category'] != 'animation' and any(p.search(r['pack'] + '|' + r['name']) for p in pats)][:70]
T, cols = 200, 10
sheet = Image.new('RGB', (cols * T, max(1, (len(want) + cols - 1) // cols) * (T + 28)), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, r in enumerate(want):
    p = '//192.168.1.40/synty/' + r['glb'].replace(chr(92), '/')[:-4] + '.png'
    x, y = (i % cols) * T, (i // cols) * (T + 28)
    if os.path.exists(p):
        im = Image.open(p).convert('RGB'); im.thumbnail((T, T)); sheet.paste(im, (x, y))
    d.text((x + 2, y + T + 2), r['name'].replace('SM_Prop_', '')[:32], fill=(255, 255, 255))
    d.text((x + 2, y + T + 14), r['pack'][:22] + ' ' + r['tris'], fill=(160, 200, 255))
sheet.save(out, quality=88)
print(len(want), 'models ->', out)

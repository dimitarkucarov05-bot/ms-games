"""Рисува иконата на „Арена": графитена плочка, светло очертание на стая с врата, една жълто-зелена точка.

    python make_icons.py

Прави res/mipmap-*/ic_launcher.png за всички плътности и res/drawable-nodpi/logo.png
(същата рисунка без плочката, за началния екран). Нужен е Pillow (pip install pillow).
Готовите PNG файлове стоят в папката, така че сглобяването не иска Python.
"""
import os
from PIL import Image, ImageDraw

TILE = (0x13, 0x14, 0x11, 255)
INK = (0xE9, 0xEC, 0xE2, 255)
DOT = (0xC8, 0xF0, 0x3C, 255)
CLEAR = (0, 0, 0, 0)

HERE = os.path.dirname(os.path.abspath(__file__))
SS = 8  # рисуваме 8 пъти по-едро и смаляваме, за да са гладки ръбовете


def draw(size, tile=True):
    n = size * SS
    bg = TILE if tile else CLEAR
    img = Image.new("RGBA", (n, n), bg)
    d = ImageDraw.Draw(img)
    u = lambda v: v * n  # координати от 0 до 1

    # Стаята: очертание със заоблени ъгли.
    x0, y0, x1, y1 = u(0.215), u(0.235), u(0.785), u(0.765)
    w = u(0.056)
    d.rounded_rectangle((x0, y0, x1, y1), radius=u(0.07), outline=INK, width=round(w))

    # Вратата: отвор в долната стена, със заоблени краища.
    gx0, gx1 = u(0.555), u(0.715)
    d.rectangle((gx0, y1 - w - 2, gx1, y1 + 2), fill=bg)
    cy, r = y1 - w / 2, w / 2
    for cx in (gx0, gx1):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=INK)

    # Играчът: една точка.
    px, py, pr = u(0.405), u(0.44), u(0.078)
    d.ellipse((px - pr, py - pr, px + pr, py + pr), fill=DOT)

    return img.resize((size, size), Image.LANCZOS)


def save(img, *parts):
    path = os.path.join(HERE, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(os.path.relpath(path, HERE), img.size)


for name, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
    save(draw(px).convert("RGB"), "res", f"mipmap-{name}", "ic_launcher.png")

save(draw(384, tile=False), "res", "drawable-nodpi", "logo.png")
save(draw(512).convert("RGB"), "icon-512.png")  # за преглед и за магазини, не влиза в APK

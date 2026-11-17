import io
p = 'public/play/games/backroom/synty-kinds.js'
s = io.open(p, encoding='utf-8').read()
a = "const farm = model => { const [w, h, d] = A.info(FARM, model).size; return place(FARM, model, { w, h, d, fit: 'uniform', map: FARM_MAP }); };"
b = "const farm = (model, k = 1) => { const [w, h, d] = A.info(FARM, model).size; return place(FARM, model, { w: w * k, h: h * k, d: d * k, fit: 'uniform', map: FARM_MAP }); };"
assert s.count(a) == 1; s = s.replace(a, b)
a = "buds: () => inst('buds', () => farm('SM_Prop_Cabbage_01_S'))"
b = "buds: () => inst('buds', () => farm('SM_Prop_Cabbage_01_S', 0.42))"
assert s.count(a) == 1; s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')

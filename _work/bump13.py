import io, json, sys
p = sys.argv[1]
j = json.load(io.open(p, encoding='utf-8'))
j['version'] = '1.3.0'
j['tagline'] = 'Cook at night, sell by day'
j['description'] = ("Night, 00:00 to 08:00 (five minutes): the cellar works. Order supplies on the wall screen, grow and shred, pour five liquids into the mixer by the recipe book, roll joints by shaking both hands, pack the carry box. "
                    "Day, 08:00 to 20:00 (six minutes): pull the lever to open the pizzeria for customers, or take the box in the lift to the street and walk three blocks of the town to the buyers. "
                    "What you make can be taken yourself, for an effect that helps. One clear goal is always on the screens and marked in the room.")
j['tags'] = ['cooking', 'co-op', 'two levels', 'street', 'secret lab', 'dark humour']
io.open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(j, ensure_ascii=False, indent=2) + '\n')
print(p, j['version'])

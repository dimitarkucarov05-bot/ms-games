import io, json, sys
p = sys.argv[1]
j = json.load(io.open(p, encoding='utf-8'))
j['version'] = '1.2.0'
j['description'] = ("Your team runs a pizzeria in the mall: dough, three sauces, toppings from shrimp to pineapple, the oven, drinks from the tap, customers at the counter. "
                    "From midnight to eight the shop is shut and the cellar works: order supplies on the wall screen, grow and shred, pour the liquids into the mixer by the recipe book, pack the packets in the carry box. "
                    "By day the box goes upstairs for the buyers. When the screen says the police are a minute away, the box goes back down the lift.")
io.open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(j, ensure_ascii=False, indent=2) + '\n')
print(p, j['version'])

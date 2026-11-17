"""The Back Room 1.2, second pass on the rules: bought things stay on the floor, a box at the outlet packs by itself. Run from lobby-stage."""
import io


def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, s.count(a), a[:80])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('game/backroom.js', [
    ("    it.poofAt = it.kind === 'box' || (phase === 'raid' && LAB.has(it.kind)) ? Infinity : time + S(RULES.poof);      // the box never vanishes",
     "    // what was bought or made in the cellar is never lost by putting it down: only kitchen things vanish from the floor\n"
     "    it.poofAt = LAB.has(it.kind) && it.kind !== 'tray' && it.kind !== 'meatbox' ? Infinity : time + S(RULES.poof);"),
    ("    if (mixer.out.length && benchRec.slots[1].item == null && items.size < RULES.maxItems) {\n"
     "      const got = mixer.out.shift(), out = newItem(got.kind, 1);\n"
     "      out.by = mixer.by;\n"
     "      if (got.pure) out.state.pure = 1;\n"
     "      putInSlot(out, benchRec.slots[1]);\n"
     "    }",
     "    if (mixer.out.length) {\n"
     "      // a box standing at the outlet takes the packets by itself, one after another\n"
     "      let box = null;\n"
     "      for (const q of items.values()) {\n"
     "        if (q.kind !== 'box' || q.holder != null || itemLevel(q) !== benchRec.level || q.state.n.length >= RULES.lab.box) continue;\n"
     "        if (dist(itemPos(q), benchRec.slots[1]) <= RULES.lab.pack) { box = q; break; }\n"
     "      }\n"
     "      if (box) {\n"
     "        const got = mixer.out.shift(), bp = itemPos(box);\n"
     "        box.state.n.push([got.kind, got.pure ? 1 : 0]);\n"
     "        emit('packed', { x: bp.x, y: bp.y, z: bp.z, level: benchRec.level, player: mixer.by });\n"
     "      } else if (benchRec.slots[1].item == null && items.size < RULES.maxItems) {\n"
     "        const got = mixer.out.shift(), out = newItem(got.kind, 1);\n"
     "        out.by = mixer.by;\n"
     "        if (got.pure) out.state.pure = 1;\n"
     "        putInSlot(out, benchRec.slots[1]);\n"
     "      }\n"
     "    }"),
])

s = io.open('game/backroom.test.js', encoding='utf-8').read()
anchor = "test('the police patrol: announced a minute ahead;"
assert s.count(anchor) == 1
new = r'''test('a box standing at the outlet takes the packets by itself; bought things do not vanish from the floor', () => {
  const k = play({ skipTo: 'night' });
  k.ride();
  assert.ok(k.take('box').ok);
  const out = k.slot('bench', 1);
  k.drop({ x: out.x, y: out.y, z: out.z });
  assert.ok(batch(k, 2, 1.33, false).ok);
  k.run(M.RULES.lab.mix + 0.6);
  assert.deepEqual(k.item('box').state.n, ['ice', 'ice'], 'both packets are in the box');
  assert.ok(!k.item('ice'), 'nothing lies loose');
  assert.ok(k.take('red').ok);
  assert.equal(k.drop({ x: 0, y: 0.3, z: 0 }).rule, 5, 'the bottle is put on the floor');
  k.run(M.RULES.poof + 2);
  assert.ok(k.item('red'), 'it is still there');
});

'''
s = s.replace(anchor, new + anchor)
io.open('game/backroom.test.js', 'w', encoding='utf-8', newline='\n').write(s)
print('rules 1.2b patched')

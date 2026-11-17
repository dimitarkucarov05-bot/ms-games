import re, io, json, sys

# Разделя файл на код и коментари (груба, но безопасна евристика) и вади фразите на кирилица само от кода.
PH = re.compile(r"[А-Яа-яЁё][А-Яа-яЁё0-9 ,.!?:;()„“\-–—·%°×/+]*[А-Яа-яЁё.!?:)]|[А-Яа-яЁё]")
COMMENT = re.compile(r"<!--.*?-->|/\*.*?\*/|(?<![:\"'`\\])//[^\n]*", re.S)
OUT = 'tools/translate/phrases.json'      # the list command writes here (run from the lobby folder)


def segments(src):
    out = []
    i = 0
    for m in COMMENT.finditer(src):
        if m.start() > i:
            out.append((True, src[i:m.start()]))
        out.append((False, m.group(0)))
        i = m.end()
    if i < len(src):
        out.append((True, src[i:]))
    return out


def phrases(path):
    s = io.open(path, encoding='utf-8').read()
    found = {}
    for code, t in segments(s):
        if not code:
            continue
        for m in PH.finditer(t):
            p = m.group(0).strip()
            if p:
                found[p] = found.get(p, 0) + 1
    return found


def apply(path, table):
    """Заменя фразите в кода (не в коментарите), най-дългите първи. Връща броя на непреведените фрази."""
    s = io.open(path, encoding='utf-8').read()
    keys = sorted(table, key=len, reverse=True)
    left = {}

    def sub(m):
        p = m.group(0)
        core = p.strip()
        if core in table:
            return p.replace(core, table[core])
        left[core] = left.get(core, 0) + 1
        return p

    parts = []
    for code, t in segments(s):
        parts.append(PH.sub(sub, t) if code else t)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(''.join(parts))
    return left


if __name__ == '__main__':
    if sys.argv[1] == 'list':
        res = {}
        for f in sys.argv[2:]:
            res[f] = phrases(f)
        json.dump(res, io.open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        allp = set()
        for f, d in res.items():
            print(f, len(d))
            allp |= set(d)
        print('unique total', len(allp), 'chars', sum(len(p) for p in allp))
    elif sys.argv[1] == 'apply':
        table = json.load(io.open(sys.argv[2], encoding='utf-8'))
        for f in sys.argv[3:]:
            left = apply(f, table)
            print(f, 'непреведени:', len(left))
            for k in sorted(left, key=len, reverse=True)[:40]:
                print('   ', k)

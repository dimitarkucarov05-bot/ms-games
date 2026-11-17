# Чете Unity пакет (.unitypackage е tar.gz с папка на всеки файл: <guid>/pathname, <guid>/asset, <guid>/asset.meta).
#
#   python -I tools/synty/unitypack.py list  <пакет.unitypackage>                 → всички пътища (guid<TAB>път)
#   python -I tools/synty/unitypack.py pull  <пакет.unitypackage> <папка> [.unity .prefab ...]
#       → вади файловете с тези разширения в <папка>/<път> и пише <папка>/guids.tsv (guid<TAB>път за ВСИЧКИ файлове)
#
# Ползва се за готовите карти на Synty: сцената (.unity) казва кой модел къде стои.
import io
import os
import sys
import tarfile


def paths(pkg):
    out = {}
    with tarfile.open(pkg, 'r:gz') as tar:
        for m in tar:
            if m.name.endswith('/pathname'):
                guid = m.name.split('/')[-2]
                out[guid] = tar.extractfile(m).read().decode('utf-8', 'replace').split('\n')[0].strip()
    return out


def pull(pkg, dest, exts):
    names = paths(pkg)
    os.makedirs(dest, exist_ok=True)
    with io.open(os.path.join(dest, 'guids.tsv'), 'a', encoding='utf-8', newline='\n') as f:
        for g, p in sorted(names.items(), key=lambda kv: kv[1]):
            f.write(g + '\t' + p + '\n')
    want = {g for g, p in names.items() if os.path.splitext(p)[1].lower() in exts}
    # 'meta:.fbx' = само настройките (.meta) на тези файлове, без самите файлове (моделите са големи)
    meta_only = {g for g, p in names.items() if ('meta:' + os.path.splitext(p)[1].lower()) in exts}
    want |= meta_only
    n = 0
    with tarfile.open(pkg, 'r:gz') as tar:
        for m in tar:
            parts = m.name.split('/')
            if len(parts) < 2 or parts[-1] not in ('asset', 'asset.meta') or parts[-2] not in want:
                continue
            if parts[-2] in meta_only and parts[-1] == 'asset':
                continue
            target = os.path.join(dest, names[parts[-2]].replace('/', os.sep)) + ('.meta' if parts[-1] == 'asset.meta' else '')
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as out:
                out.write(tar.extractfile(m).read())
            n += 1
    return len(names), n


if __name__ == '__main__':
    cmd, pkg = sys.argv[1], sys.argv[2]
    if cmd == 'list':
        for g, p in sorted(paths(pkg).items(), key=lambda kv: kv[1]):
            print(g + '\t' + p)
    else:
        exts = set(sys.argv[4:]) or {'.unity', '.prefab'}
        total, got = pull(pkg, sys.argv[3], exts)
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        print('файлове в пакета:', total, '· извадени:', got)

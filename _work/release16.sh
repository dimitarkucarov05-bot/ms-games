#!/bin/bash
# MS Games VR app: the live lobby side. Run only with the owner's yes and when no session runs; then restart the lobby
# (MS Games tray). server.js is patched, not copied: staging's server.js also carries keeper.js, which is not released.
set -e
cd /c/Users/Martiness/Downloads/vr-arena
B=_release-backup/$(date +%Y%m%d-%H%M%S)-msgamesvr
mkdir -p "$B/public/play"
cp lobby/server.js "$B/server.js"; cp lobby/public/play/play.js lobby/public/play/index.html "$B/public/play/"
grep -q "domainSni" lobby/server.js || python _work/patch_server16.py lobby/server.js
python _work/patch_play16.py lobby
cp lobby-stage/public/play/manifest.webmanifest lobby-stage/public/play/app-icon-512.png lobby/public/play/
cp lobby-stage/tools/acme.mjs lobby/tools/acme.mjs 2>/dev/null || true
node --check lobby/server.js && node --check lobby/public/play/play.js
echo "backup: $B"

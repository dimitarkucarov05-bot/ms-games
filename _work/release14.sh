#!/bin/bash
# The Back Room 1.4 (career): staging -> live, with a backup. Run only when no session runs on the live lobby.
set -e
cd /c/Users/Martiness/Downloads/vr-arena
B=_release-backup/$(date +%Y%m%d-%H%M%S)-backroom14
FILES="game/backroom.js game/backroom.test.js game/backroom.game.json public/play/games/backroom/scene.js public/play/games/backroom/synty-kinds.js public/play/games/backroom/decor.js public/play/games/backroom/hud.js"
for f in $FILES public/play/play.js server.js; do mkdir -p "$B/$(dirname $f)"; cp "lobby/$f" "$B/$f"; done
for f in $FILES; do cp "lobby-stage/$f" "lobby/$f"; done
python -X utf8 _work/patch_server14.py lobby/server.js
node --check lobby/server.js
sed -i 's/^const BUILD = 32;/const BUILD = 33;/' lobby/public/play/play.js
grep -n "^const BUILD" lobby/public/play/play.js | cut -c1-30
echo "backup: $B"

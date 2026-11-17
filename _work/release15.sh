#!/bin/bash
# The Back Room 1.5: staging -> live, with a backup. Run only when no session runs on the live lobby.
set -e
cd /c/Users/Martiness/Downloads/vr-arena
B=_release-backup/$(date +%Y%m%d-%H%M%S)-backroom15
FILES="game/backroom.js game/backroom.test.js game/backroom.game.json public/play/games/backroom/scene.js public/play/games/backroom/synty-kinds.js public/play/games/backroom/decor.js public/play/games/backroom/hud.js"
for f in $FILES public/play/play.js; do mkdir -p "$B/$(dirname $f)"; cp "lobby/$f" "$B/$f"; done
for f in $FILES; do cp "lobby-stage/$f" "lobby/$f"; done
sed -i 's/^const BUILD = 33;/const BUILD = 34;/' lobby/public/play/play.js
grep -n "^const BUILD" lobby/public/play/play.js | cut -c1-30
echo "backup: $B"

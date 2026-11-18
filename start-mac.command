#!/bin/bash
# MS Games on a Mac: double-click this file (Terminal opens). It updates itself from GitHub, installs what is missing and starts the FULL server:
# console + games + TV + scan page over HTTP (port 47801) and HTTPS (port 47843: the phone camera and the headsets need it), and the beacon the headsets find the PC by.
# LabCoin: put the key in lobby-stage/data-mac/labcoin.json (see docs/LABCOIN-LINK.md). Stop with Ctrl+C.
cd "$(dirname "$0")" || exit 1

if [ -d .git ] && command -v git >/dev/null 2>&1; then echo "Updating from GitHub ..."; git pull --ff-only; echo; fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Opening nodejs.org: install Node 24, then double-click this file again."
  open https://nodejs.org
  read -r -n 1 -p "Press any key to close "; exit 1
fi

[ -d lobby/node_modules/ws ] || (echo "Installing packages in lobby/ ..."; cd lobby && npm install --no-audit --no-fund)
[ -e lobby-stage/node_modules ] || ln -s ../lobby/node_modules lobby-stage/node_modules
[ -e lobby-stage/public/play/assets ] || ln -s ../../../lobby/public/play/assets lobby-stage/public/play/assets

cd lobby-stage || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
# the HTTPS certificate names the addresses the Mac had when it was made: a new Wi-Fi or hotspot means a new certificate
mkdir -p data-mac/tls
if [ "$(cat data-mac/tls/ip.txt 2>/dev/null)" != "$IP" ]; then rm -f data-mac/tls/cert.pem data-mac/tls/key.pem; echo "$IP" > data-mac/tls/ip.txt; fi
echo "Console (this Mac):        http://localhost:47801"
echo "Staff phone, camera works: https://${IP:-<IP of this Mac>}:47843/scan/   (accept the certificate warning once)"
echo "Staff phone, typed code:   http://${IP:-<IP of this Mac>}:47801/scan/"
echo "Headsets open the game at: https://${IP:-<IP of this Mac>}:47843/play/"
echo "Stop with Ctrl+C."
echo
(sleep 3; open http://localhost:47801) &
# caffeinate: the Mac must not fall asleep while the arena runs. NO_KEEPER: the USB installer needs adb (not on a Mac unless you add it).
exec caffeinate -i env ARENA_DATA="$PWD/data-mac" NO_KEEPER=1 node server.js

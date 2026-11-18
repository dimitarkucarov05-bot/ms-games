#!/bin/zsh
# Прави „VR Varna Карти.app“ (редактор на карти отгоре). Джак, 13.11.2026.
#   ./build.sh            → ~/VR-Arena/Builds/VR Varna Карти.app
#   ./build.sh --install  → и копие в ~/Applications
set -e
HERE="${0:A:h}"
ROOT="${HERE:h:h}"
OUT="$ROOT/Builds"
APP="$OUT/VR Varna Карти.app"
mkdir -p "$OUT"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -target arm64-apple-macos13 -framework Cocoa -framework WebKit \
  "$HERE/main.swift" -o "$APP/Contents/MacOS/VRVarnaMaps"
cp "$HERE/editor.html" "$APP/Contents/Resources/editor.html"
# каталогът и иконките (team/maps) — ако ги има
KAT="$ROOT/team/maps"
[[ -f "$KAT/katalog_obekti.json" ]] && cp "$KAT/katalog_obekti.json" "$APP/Contents/Resources/"
[[ -d "$KAT/ikoni" ]] && cp -R "$KAT/ikoni" "$APP/Contents/Resources/ikoni"

# иконата от VR_Varna.ico (ако sips може да я прочете)
ICON=""
if [[ -f "$ROOT/VR_Varna.ico" ]]; then
  T="$(mktemp -d)"; mkdir "$T/i.iconset"
  if sips -s format png "$ROOT/VR_Varna.ico" --out "$T/src.png" >/dev/null 2>&1; then
    for s in 16 32 64 128 256 512; do
      sips -z $s $s "$T/src.png" --out "$T/i.iconset/icon_${s}x${s}.png" >/dev/null
      sips -z $((s*2)) $((s*2)) "$T/src.png" --out "$T/i.iconset/icon_${s}x${s}@2x.png" >/dev/null
    done
    iconutil -c icns "$T/i.iconset" -o "$APP/Contents/Resources/AppIcon.icns" && ICON="AppIcon"
  fi
  rm -rf "$T"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>VR Varna Карти</string>
  <key>CFBundleDisplayName</key><string>VR Varna Карти</string>
  <key>CFBundleIdentifier</key><string>com.vrvarna.mapeditor</string>
  <key>CFBundleExecutable</key><string>VRVarnaMaps</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>$(date +%Y%m%d%H%M)</string>
  <key>CFBundleIconFile</key><string>${ICON}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoads</key><true/></dict>
  <key>NSLocalNetworkUsageDescription</key><string>Панелът говори с лобито на арената в мрежата на залата.</string>
</dict></plist>
PLIST

codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
echo "Готово: $APP"
if [[ "$1" == "--install" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/VR Varna Карти.app"
  cp -R "$APP" "$HOME/Applications/"
  echo "Копие: $HOME/Applications/VR Varna Карти.app"
fi

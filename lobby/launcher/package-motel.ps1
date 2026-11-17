# Portable MS Games with only The Motel, to send to another arena (owner, 2026-11-15).
#   powershell -ExecutionPolicy Bypass -File launcher\package-motel.ps1
# Output: launcher\dist\MS-Games-Motel-Setup-<version>.exe  (setup program + zip of the packed folder)
# What differs from package.ps1: only the motel's rules, pages and Synty packs; adb + the English headset app
# (tools\apk-lan\MSGames-Headset.apk) in app\headset; a ready self-signed certificate in app\tls-default;
# launcher\lan_patch.py applied to the packed copy (The Motel starts by itself, Install button for headsets).
# Uses the MS Games.exe already in launcher\dist (it is locked while the arena runs; rebuild with build.ps1 if needed).
# This file is kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$lobby = Split-Path -Parent $here

$apk = Join-Path $lobby 'tools\apk-lan\MSGames-Headset.apk'
if (-not (Test-Path $apk)) { throw "MISSING: $apk (build it with tools\apk-lan\build.ps1)" }
$adbDir = 'C:\Android\sdk\platform-tools'
if (-not (Test-Path "$adbDir\adb.exe")) { throw "MISSING: $adbDir\adb.exe" }

$out = Join-Path $here 'dist\MS Games Motel'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $out 'runtime'), (Join-Path $out 'app') | Out-Null
Copy-Item (Join-Path $here 'dist\MS Games.exe') $out
Copy-Item (Get-Command node -ErrorAction Stop).Source (Join-Path $out 'runtime\node.exe')

$app = Join-Path $out 'app'
foreach ($f in 'server.js', 'zone.js', 'package.json') { Copy-Item (Join-Path $lobby $f) $app }
New-Item -ItemType Directory -Force (Join-Path $app 'game') | Out-Null
foreach ($f in 'motel.game.json', 'motel.js', 'motel.map.json') { Copy-Item (Join-Path $lobby "game\$f") (Join-Path $app 'game') }
New-Item -ItemType Directory -Force (Join-Path $app 'node_modules') | Out-Null
Copy-Item (Join-Path $lobby 'node_modules\ws') (Join-Path $app 'node_modules\ws') -Recurse

# pages and assets of The Motel only
$pub = Join-Path $lobby 'public'
$skipDirs = @(
    (Join-Path $pub 'live'), (Join-Path $pub 'play\tools'), (Join-Path $pub 'play\games\backroom'),
    (Join-Path $pub 'play\assets\maps\shopping-plaza'), (Join-Path $pub 'play\assets\maps\_shots')
)
foreach ($p in 'city-pack', 'fantasy-village', 'farm-pack', 'gang-warfare-pack', 'horror-movie-set', 'kids-pack',
               'nightclubs', 'office-pack', 'police-station', 'shopping-plaza-map', 'shops-pack', 'town-pack') {
    $skipDirs += (Join-Path $pub "play\assets\synty\$p")
}
$rc = @($pub, (Join-Path $app 'public'), '/E', '/NFL', '/NDL', '/NJH', '/NJS',
        '/XF', '*.prev', '*.prev2', '*.prev3', '*-preview.html', 'assets-test.html', 'showroom.js', '/XD', '_shots') + $skipDirs
& robocopy @rc | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }

# headset tools: adb + the headset app
$hs = Join-Path $app 'headset'
New-Item -ItemType Directory -Force $hs | Out-Null
foreach ($f in 'adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'libwinpthread-1.dll', 'NOTICE.txt') {
    if (Test-Path "$adbDir\$f") { Copy-Item "$adbDir\$f" $hs }
}
Copy-Item $apk $hs

# self-signed certificate for PCs without OpenSSL (made once here, kept in launcher\tls-default)
$tlsSrc = Join-Path $here 'tls-default'
if (-not (Test-Path (Join-Path $tlsSrc 'cert.pem'))) {
    New-Item -ItemType Directory -Force $tlsSrc | Out-Null
    $ossl = @('C:\Program Files\Git\mingw64\bin\openssl.exe', 'C:\Program Files\Git\usr\bin\openssl.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $ossl) { throw 'MISSING: openssl (Git for Windows) to make the default certificate' }
    $ErrorActionPreference = 'Continue'      # openssl prints its progress on stderr
    & $ossl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout (Join-Path $tlsSrc 'key.pem') `
        -out (Join-Path $tlsSrc 'cert.pem') -days 3650 -subj '/CN=MS Games' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $tlsSrc 'cert.pem'))) { throw 'openssl failed' }
}
Copy-Item $tlsSrc (Join-Path $app 'tls-default') -Recurse

& python (Join-Path $here 'lan_patch.py') $app
if ($LASTEXITCODE -ne 0) { throw 'lan_patch.py failed' }
& node --check (Join-Path $app 'server.js')
if ($LASTEXITCODE -ne 0) { throw 'server.js does not parse after the patch' }

$version = ((Get-Item (Join-Path $out 'MS Games.exe')).VersionInfo.FileVersion -split '\.')[0..2] -join '.'
$size = [Math]::Round((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "packed: $out ($size MB)"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $here 'dist\payload-motel.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($out, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$setup = Join-Path $here ("dist\MS-Games-Motel-Setup-{0}.exe" -f $version)
$dst = [System.IO.File]::Create($setup)
try {
    foreach ($part in (Join-Path $here 'dist\setup-stub.exe'), $zip) {
        $src = [System.IO.File]::OpenRead($part)
        try { $src.CopyTo($dst, 1MB) } finally { $src.Close() }
    }
    $len = (Get-Item $zip).Length
    $dst.Write([System.BitConverter]::GetBytes([Int64]$len), 0, 8)
    $magic = [System.Text.Encoding]::ASCII.GetBytes('MSGPAYLD')
    $dst.Write($magic, 0, 8)
} finally { $dst.Close() }
Remove-Item $zip -Force
Write-Host "setup:  $setup ($([Math]::Round((Get-Item $setup).Length / 1MB)) MB)"

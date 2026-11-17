# MS Games 2: packs the new app (vr-arena\lobby-stage) into one installer.
#   powershell -ExecutionPolicy Bypass -File launcher\package-v2.ps1 [-NoBuild]
# Output: launcher\dist2\MS-Games-Setup-<version>.exe  (setup program + zip of the packed folder + its length + "MSGPAYLD")
#         launcher\dist2\MS Games\                     (the packed folder: MS Games.exe, runtime\node.exe, app\...)
#
# It NEVER writes to launcher\dist: the live arena's launcher runs from there. It only READS lobby-stage and the
# live lobby's assets (lobby-stage\public\play\assets is a junction into lobby\public\play\assets).
#
# What goes in:
#   MS Games.exe + setup-stub.exe   built by build.ps1 -OutDir dist2 (skip with -NoBuild)
#   runtime\node.exe                the Node on this PC
#   app\                            server.js, zone.js, keeper.js, package.json (version set), lib\, game\motel*, node_modules\ws
#   app\public\                     console, play, tv, brand, scorecard, board, fonts; no dev or test pages
#   app\public\play\assets\         sfx (without the credit-only alternatives), and only the Synty packs / maps / ui
#                                   folders that the packed code names
#   app\headset\                    adb.exe + its DLLs, MSGames-Headset.apk + .json (the launcher points the server at them)
#   app\tls-default\                a ready self-signed certificate for PCs without OpenSSL (the launcher copies it)
#
# The Synty licence covers the LabCoin team only: the installer is for the team's own arenas, never for upload.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
param([switch]$NoBuild, [string]$AppName = 'MS Games')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$lobby = Split-Path -Parent $here
$stage = Join-Path (Split-Path -Parent $lobby) 'lobby-stage'
$dist = Join-Path $here 'dist2'
$liveDist = Join-Path $here 'dist'
if (-not (Test-Path (Join-Path $stage 'server.js'))) { throw "MISSING: $stage\server.js" }
New-Item -ItemType Directory -Force $dist | Out-Null
if ((Resolve-Path $dist).Path -ieq (Resolve-Path $liveDist -ErrorAction SilentlyContinue).Path) { throw 'dist2 must not be the live dist folder' }
$liveExe = Join-Path $liveDist 'MS Games.exe'
$liveStamp = if (Test-Path $liveExe) { (Get-Item $liveExe).LastWriteTimeUtc.Ticks } else { 0 }

$apkDir = Join-Path $lobby 'tools\apk-lan'
$apk = Join-Path $apkDir 'MSGames-Headset.apk'
$apkInfo = Join-Path $apkDir 'MSGames-Headset.json'
if (-not (Test-Path $apk)) { throw "MISSING: $apk (build it with tools\apk-lan\build.ps1)" }
$adbDir = 'C:\Android\sdk\platform-tools'
if (-not (Test-Path "$adbDir\adb.exe")) { throw "MISSING: $adbDir\adb.exe" }
$tlsSrc = Join-Path $here 'tls-default'
if (-not (Test-Path (Join-Path $tlsSrc 'cert.pem'))) { throw "MISSING: $tlsSrc\cert.pem (package-motel.ps1 makes it)" }
$node = (Get-Command node -ErrorAction Stop).Source

if (-not $NoBuild) { & (Join-Path $here 'build.ps1') -OutDir $dist -AppName $AppName }
$exe = Join-Path $dist ($AppName + '.exe')
$stub = Join-Path $dist 'setup-stub.exe'
if (-not (Test-Path $exe) -or -not (Test-Path $stub)) { throw "MISSING: $exe or $stub (run without -NoBuild)" }
$version = ((Get-Item $exe).VersionInfo.FileVersion -split '\.')[0..2] -join '.'

function Robo {
    # robocopy with quiet output; exit codes 0..7 are success
    & robocopy @args /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE ($($args[0]))" }
}

# ---------- the packed folder ----------
$out = Join-Path $dist $AppName
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $out 'runtime'), (Join-Path $out 'app') | Out-Null
Copy-Item $exe $out
Copy-Item $node (Join-Path $out 'runtime\node.exe')

$app = Join-Path $out 'app'
foreach ($f in 'server.js', 'zone.js', 'keeper.js', 'package.json') { Copy-Item (Join-Path $stage $f) $app }
Robo (Join-Path $stage 'lib') (Join-Path $app 'lib') *.js /XF *.test.js
New-Item -ItemType Directory -Force (Join-Path $app 'game') | Out-Null
Get-ChildItem (Join-Path $stage 'game') -File -Filter 'motel*' | Where-Object { $_.Name -notmatch '\.test\.js$' } | Copy-Item -Destination (Join-Path $app 'game')
Robo (Join-Path $stage 'node_modules\ws') (Join-Path $app 'node_modules\ws') /E

# pages; the assets folder is a junction into the live lobby and is copied separately below (read only)
$pub = Join-Path $stage 'public'
$pubOut = Join-Path $app 'public'
Robo $pub $pubOut /E /XJ `
    /XF *.prev *.prev2 *.prev3 *-preview.html assets-test.html showroom.js options.html *.test.js *.md `
    /XD (Join-Path $pub 'play\assets') (Join-Path $pub 'play\tools') (Join-Path $pub 'live') _shots tools

# ---------- assets: sounds, and only the packs the packed code names ----------
$assets = (Resolve-Path (Join-Path $pub 'play\assets')).Path
$assetsOut = Join-Path $pubOut 'play\assets'
$code = ''
Get-ChildItem $app -Recurse -File -Include *.js, *.mjs, *.json, *.html, *.css |
    Where-Object { $_.FullName -notmatch '\\node_modules\\|\\vendor\\|\\play\\assets\\' } |
    ForEach-Object { $code += [System.IO.File]::ReadAllText($_.FullName) + "`n" }

$mapsKeep = @(); $mapsDrop = @()
foreach ($d in Get-ChildItem (Join-Path $assets 'maps') -Directory) {
    if ($d.Name -ne '_shots' -and $code -match ('maps/' + [regex]::Escape($d.Name) + "['""/]")) { $mapsKeep += $d.Name } else { $mapsDrop += $d.Name }
}
foreach ($m in $mapsKeep) { Robo (Join-Path $assets "maps\$m") (Join-Path $assetsOut "maps\$m") /E /XF *.prev *.prev2 *.prev3 /XD _shots }
Write-Host ("maps kept: " + ($mapsKeep -join ', ') + "; left out: " + ($mapsDrop -join ', '))
# a baked map names the Synty textures it draws with: its JSON files count as code for the pack scan
foreach ($m in $mapsKeep) {
    Get-ChildItem (Join-Path $assets "maps\$m") -File -Filter *.json | ForEach-Object { $code += [System.IO.File]::ReadAllText($_.FullName) + "`n" }
}

$keep = @(); $drop = @()
foreach ($d in Get-ChildItem (Join-Path $assets 'synty') -Directory) {
    $n = [regex]::Escape($d.Name)
    if ($code -match ("['""/]" + $n + "['""/]")) { $keep += $d.Name } else { $drop += $d.Name }
}
foreach ($must in '_characters', '_zombies', 'sci-fi-space-pack', 'apocalypse-pack', 'woodland-apocalypse-map') {
    if ($keep -notcontains $must) { throw "the pack scan did not find '$must': the scan is broken, not packing" }
}
foreach ($p in $keep) { Robo (Join-Path $assets "synty\$p") (Join-Path $assetsOut "synty\$p") /E /XF *.prev *.prev2 *.prev3 /XD _shots }
Write-Host ("synty packs kept:    " + ($keep -join ', '))
Write-Host ("synty packs left out: " + ($drop -join ', '))

Robo (Join-Path $assets 'sfx') (Join-Path $assetsOut 'sfx') /E
foreach ($d in Get-ChildItem $assets -Directory | Where-Object { 'synty', 'maps', 'sfx' -notcontains $_.Name }) {
    if ($code -match ('assets/' + [regex]::Escape($d.Name) + '/')) { Robo $d.FullName (Join-Path $assetsOut $d.Name) /E; Write-Host "assets\$($d.Name) kept" }
    else { Write-Host "assets\$($d.Name) left out (no page names it)" }
}
Get-ChildItem $assets -File | Copy-Item -Destination $assetsOut
if (-not (Test-Path (Join-Path $assetsOut 'sfx\motel\map.json'))) { throw 'MISSING in the package: sfx\motel\map.json' }

# ---------- headset tools and the default certificate ----------
$hs = Join-Path $app 'headset'
New-Item -ItemType Directory -Force $hs | Out-Null
foreach ($f in 'adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'libwinpthread-1.dll', 'NOTICE.txt') {
    if (Test-Path "$adbDir\$f") { Copy-Item "$adbDir\$f" $hs }
}
Copy-Item $apk $hs
if (Test-Path $apkInfo) { Copy-Item $apkInfo $hs; Write-Host ("headset app: " + (Get-Content $apkInfo -Raw).Trim()) }
Copy-Item $tlsSrc (Join-Path $app 'tls-default') -Recurse

# what exactly was packed (lobby-stage changes under parallel sessions): app\BUILD.txt
$commit = '?'; $dirty = ''
try {
    $ErrorActionPreference = 'Continue'
    $commit = (& git -C $stage rev-parse --short HEAD 2>$null)
    if (& git -C $stage status --porcelain 2>$null) { $dirty = ' + uncommitted changes' }
} catch { } finally { $ErrorActionPreference = 'Stop' }
$motel = (Get-Content (Join-Path $app 'game\motel.game.json') -Raw | ConvertFrom-Json).version
$stamp = "$AppName $version, packed $(Get-Date -Format 'yyyy-MM-dd HH:mm'), lobby-stage $commit$dirty, The Motel $motel"
Set-Content (Join-Path $app 'BUILD.txt') $stamp -Encoding ascii
Write-Host $stamp

# ---------- version, credit-only sounds out, syntax check with the bundled Node ----------
$bundled = Join-Path $out 'runtime\node.exe'
& $bundled (Join-Path $here 'v2-prune.mjs') $app $version
if ($LASTEXITCODE -ne 0) { throw 'v2-prune.mjs failed' }
foreach ($f in 'server.js', 'zone.js', 'keeper.js', 'game\motel.js') {
    & $bundled --check (Join-Path $app $f)
    if ($LASTEXITCODE -ne 0) { throw "$f does not parse" }
}
$leftovers = Get-ChildItem $out -Recurse -File | Where-Object { $_.Name -match '-preview\.html$|^assets-test\.html$|\.test\.js$|ccby|\.prev\d?$' -or $_.FullName -match '\\_shots\\|\\play\\tools\\|\\backroom\\' }
if ($leftovers) { throw ("dev or excluded files got into the package: " + (($leftovers | Select-Object -First 5 | ForEach-Object { $_.FullName }) -join ', ')) }

$size = [Math]::Round((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "packed: $out ($size MB, version $version)"

# ---------- the installer: setup program + zip of the packed folder + its length + a marker ----------
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $dist 'payload-v2.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($out, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$setup = Join-Path $dist ("MS-Games-Setup-{0}.exe" -f $version)
$dst = [System.IO.File]::Create($setup)
try {
    foreach ($part in $stub, $zip) {
        $src = [System.IO.File]::OpenRead($part)
        try { $src.CopyTo($dst, 1MB) } finally { $src.Close() }
    }
    $len = (Get-Item $zip).Length
    $dst.Write([System.BitConverter]::GetBytes([Int64]$len), 0, 8)
    $magic = [System.Text.Encoding]::ASCII.GetBytes('MSGPAYLD')
    $dst.Write($magic, 0, 8)
} finally { $dst.Close() }
Remove-Item $zip -Force

if ($liveStamp -ne 0 -and (Get-Item $liveExe).LastWriteTimeUtc.Ticks -ne $liveStamp) { throw 'the live dist\MS Games.exe changed during packaging: this must never happen' }
Write-Host "setup:  $setup ($([Math]::Round((Get-Item $setup).Length / 1MB)) MB)"

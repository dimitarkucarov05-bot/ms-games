# Packs MS Games into one folder that runs on a PC without Node installed, and zips it.
#   powershell -ExecutionPolicy Bypass -File launcher\package.ps1
# Output: launcher\dist\MS Games\  (MS Games.exe + runtime\node.exe + app\...)  and  launcher\dist\MS-Games-<version>.zip
# In the packed layout the launcher keeps the hall's data in %LOCALAPPDATA%\MS Games\data, not next to the program.
#   -NoBuild  keeps the already built MS Games.exe (needed while the program is running and its file is locked)
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$lobby = Split-Path -Parent $here
if (-not $NoBuild) { & (Join-Path $here 'build.ps1') }

$out = Join-Path $here 'dist\MS Games'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $out 'runtime'), (Join-Path $out 'app') | Out-Null
Copy-Item (Join-Path $here 'dist\MS Games.exe') $out

$node = (Get-Command node -ErrorAction Stop).Source
Copy-Item $node (Join-Path $out 'runtime\node.exe')

$app = Join-Path $out 'app'
foreach ($f in 'server.js', 'zone.js', 'package.json') { Copy-Item (Join-Path $lobby $f) $app }
# rules and manifests of the games (no tests, no old copies)
New-Item -ItemType Directory -Force (Join-Path $app 'game') | Out-Null
Get-ChildItem (Join-Path $lobby 'game') -File | Where-Object { $_.Name -notmatch '\.test\.js$|\.before-|README' } | Copy-Item -Destination (Join-Path $app 'game')
# the only dependency
New-Item -ItemType Directory -Force (Join-Path $app 'node_modules') | Out-Null
Copy-Item (Join-Path $lobby 'node_modules\ws') (Join-Path $app 'node_modules\ws') -Recurse
# pages and assets; bake backups and preview pages stay out
robocopy (Join-Path $lobby 'public') (Join-Path $app 'public') /E /NFL /NDL /NJH /NJS /XF *.prev *.prev2 *.prev3 *-preview.html /XD live _shots | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }

$version = ((Get-Item (Join-Path $out 'MS Games.exe')).VersionInfo.FileVersion -split '\.')[0..2] -join '.'
$size = [Math]::Round((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "packed: $out ($size MB)"

# --- the installer: setup program + zip of the packed folder + its length + a marker ---
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $here 'dist\payload.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($out, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$setup = Join-Path $here ("dist\MS-Games-Setup-{0}.exe" -f $version)
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

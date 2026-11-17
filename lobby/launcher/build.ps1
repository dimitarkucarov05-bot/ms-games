# Builds "MS Games.exe" and the installer program with the C# compiler that ships with Windows (.NET Framework 4.x).
# No downloads, no SDK.
#   powershell -ExecutionPolicy Bypass -File launcher\build.ps1 [-OutDir <folder>] [-Brand]
# Output: <OutDir>\MS Games.exe and <OutDir>\setup-stub.exe. OutDir defaults to launcher\dist2 (the v2 builds).
# The live arena's launcher runs from launcher\dist: that folder is written only with an explicit  -OutDir dist
# (a relative OutDir is taken from this script's folder). The exe name is "<AppName>.exe" (-AppName).
# Artwork: launcher\brand2\ (msgames.ico, logo.png, art.png), drawn from lobby-stage\public\brand\*.svg by
# brand2\brand.ps1; it is drawn again when a file is missing or with -Brand.
# The version-1 sources and the old icon are kept in launcher\_v1-2026-11-16.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
param([string]$OutDir, [switch]$Brand, [string]$AppName = 'MS Games')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = if ($OutDir) { if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $here $OutDir } } else { Join-Path $here 'dist2' }
New-Item -ItemType Directory -Force $dist | Out-Null
$dist = (Resolve-Path $dist).Path

$brandDir = Join-Path $here 'brand2'
$ico = Join-Path $brandDir 'msgames.ico'
$logo = Join-Path $brandDir 'logo.png'
$art = Join-Path $brandDir 'art.png'
if ($Brand -or -not ((Test-Path $ico) -and (Test-Path $logo) -and (Test-Path $art))) {
    & (Join-Path $brandDir 'brand.ps1')
}

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe (.NET Framework 4.x) was not found on this PC' }

$out = Join-Path $dist ($AppName + '.exe')
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 "/win32icon:$ico" "/out:$out" "/resource:$logo,logo.png" /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $here 'MSGames.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }
Write-Host "built: $out ($([Math]::Round((Get-Item $out).Length / 1KB)) KB)"

# the installer program (without its payload; package-v2.ps1 glues the packed app to it)
$stub = Join-Path $dist 'setup-stub.exe'
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 "/win32icon:$ico" "/out:$stub" "/resource:$art,art.png" "/resource:$logo,logo.png" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Core.dll /r:Microsoft.CSharp.dll (Join-Path $here 'Setup.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed on Setup.cs with exit code $LASTEXITCODE" }
Write-Host "built: $stub ($([Math]::Round((Get-Item $stub).Length / 1KB)) KB)"

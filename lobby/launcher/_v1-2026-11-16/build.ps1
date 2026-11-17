# Builds "MS Games.exe" with the C# compiler that ships with Windows (.NET Framework 4.x). No downloads, no SDK.
#   powershell -ExecutionPolicy Bypass -File launcher\build.ps1
# Output: launcher\dist\MS Games.exe  (development build: it finds server.js by walking up from its own folder)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $here 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null

# --- icon: the same mark as the page favicon (dark tile, light visor outline, signal dot), drawn here ---
Add-Type -AssemblyName System.Drawing
function New-MarkPng([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = $size / 32.0
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = 6 * $s; $d = 2 * $r; $w = $size - 0.01
    $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($w - $d, 0, $d, $d, 270, 90)
    $path.AddArc($w - $d, $w - $d, $d, $d, 0, 90); $path.AddArc(0, $w - $d, $d, $d, 90, 90); $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0x13, 0x14, 0x11))), $path)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(0xe9, 0xec, 0xe2)), ([Math]::Max(1.2, 2 * $s))
    $visor = New-Object System.Drawing.Drawing2D.GraphicsPath
    $vx = 6.5 * $s; $vy = 8.5 * $s; $vw = 19 * $s; $vh = 15 * $s; $vr = 2 * $s; $vd = 2 * $vr
    $visor.AddArc($vx, $vy, $vd, $vd, 180, 90); $visor.AddArc($vx + $vw - $vd, $vy, $vd, $vd, 270, 90)
    $visor.AddArc($vx + $vw - $vd, $vy + $vh - $vd, $vd, $vd, 0, 90); $visor.AddArc($vx, $vy + $vh - $vd, $vd, $vd, 90, 90); $visor.CloseFigure()
    $g.DrawPath($pen, $visor)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0xc8, 0xf0, 0x3c))), 16.5 * $s, 13 * $s, 6 * $s, 6 * $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    return ,$ms.ToArray()
}
$sizes = 16, 24, 32, 48, 64, 256
$pngs = @(); foreach ($sz in $sizes) { $pngs += ,(New-MarkPng $sz) }
$ico = Join-Path $here 'msgames.ico'
$fs = [System.IO.File]::Create($ico)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = $sizes[$i]; $len = $pngs[$i].Length
    $dim = if ($sz -ge 256) { 0 } else { $sz }
    $bw.Write([Byte]$dim); $bw.Write([Byte]$dim); $bw.Write([Byte]0); $bw.Write([Byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$len); $bw.Write([UInt32]$offset)
    $offset += $len
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Close(); $fs.Close()

# --- compile ---
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe (.NET Framework 4.x) was not found on this PC' }
$out = Join-Path $dist 'MS Games.exe'
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 "/win32icon:$ico" "/out:$out" /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $here 'MSGames.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }
Write-Host "built: $out ($([Math]::Round((Get-Item $out).Length / 1KB)) KB)"

# --- the installer program (without its payload; package.ps1 glues the packed app to it) ---
$stub = Join-Path $dist 'setup-stub.exe'
$art = Join-Path (Split-Path -Parent $here) 'public\play\games\backroom\cover.jpg'
$res = @(); if (Test-Path $art) { $res = @("/resource:$art,art.jpg") }
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 "/win32icon:$ico" "/out:$stub" $res /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Core.dll /r:Microsoft.CSharp.dll (Join-Path $here 'Setup.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed on Setup.cs with exit code $LASTEXITCODE" }
Write-Host "built: $stub ($([Math]::Round((Get-Item $stub).Length / 1KB)) KB)"

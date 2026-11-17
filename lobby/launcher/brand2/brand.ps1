# Rasterises the MS Games brand (lobby-stage\public\brand\mark.svg + logo.svg) for the launcher and the installer.
#   powershell -ExecutionPolicy Bypass -File launcher\brand2\brand.ps1
# Output, next to this file: msgames.ico (16..256), logo.png (wordmark, transparent), art.png (installer welcome page).
# Headless Edge draws sheet.html; System.Drawing crops the icon sizes. ASCII-only on purpose (Windows PowerShell 5.1).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'MISSING: Microsoft Edge (needed once, to draw the SVG logo)' }
$prof = Join-Path $env:TEMP ('msgames-brand-' + $PID)
$page = 'file:///' + (Join-Path $here 'sheet.html').Replace([char]92, [char]47).Replace(' ', '%20')

function Shot([string]$view, [int]$w, [int]$h, [string]$out) {
    if (Test-Path $out) { Remove-Item $out -Force }
    $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files',
           '--default-background-color=00000000', '--force-device-scale-factor=1', "--user-data-dir=`"$prof`"",
           "--window-size=$w,$h", "--screenshot=`"$out`"", "`"$page`?v=$view`"")
    $p = Start-Process -FilePath $edge -ArgumentList $a -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(60000)) { $p.Kill(); throw "Edge did not finish drawing $view" }
    for ($i = 0; $i -lt 40 -and -not (Test-Path $out); $i++) { Start-Sleep -Milliseconds 250 }
    if (-not (Test-Path $out)) { throw "Edge did not write $out" }
}

Shot 'logo' 1040 224 (Join-Path $here 'logo.png')
Shot 'art' 1280 816 (Join-Path $here 'art.png')
$sheet = Join-Path $here 'icons-sheet.png'
Shot 'icons' 520 256 $sheet

Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($sheet)
$sizes = 256, 64, 48, 32, 24, 16
$pngs = @(); $x = 0
foreach ($n in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $n, $n, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $n, $n), (New-Object System.Drawing.Rectangle $x, 0, $n, $n), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    $pngs += ,($ms.ToArray()); $x += $n + 8
}
$src.Dispose()
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
Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "brand: $ico, logo.png, art.png"

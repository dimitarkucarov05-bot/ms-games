# Runs the forwarder and discovery checks as plain Java on this PC (no headset needed).
#   powershell -ExecutionPolicy Bypass -File test\run.ps1            against the game server on 127.0.0.1:47801
#   powershell -ExecutionPolicy Bypass -File test\run.ps1 -Game -    skip the part that needs the game server
# ASCII-only on purpose (Windows PowerShell 5.1).
param(
    [string]$Game = '127.0.0.1:47801',
    [string]$Jdk = $(if ($env:ARENA_JDK) { $env:ARENA_JDK } else { 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot' })
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root 'build\pctest'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null

& "$Jdk\bin\javac.exe" -encoding UTF-8 -nowarn -d $out "$root\src\bg\arena\play\Discovery.java" "$root\src\bg\arena\play\Forwarder.java" "$root\test\PcTest.java" "$root\test\ForwardCli.java"
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
& "$Jdk\bin\java.exe" '-Dfile.encoding=UTF-8' '-Dstdout.encoding=UTF-8' -cp $out PcTest $Game
$failed = $LASTEXITCODE

# WebSocket through the same forwarder, against a private ws server (needs node and lobby\node_modules\ws).
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host '8. WebSocket'
    $env:ARENA_JAVA = "$Jdk\bin\java.exe"
    & node "$root\test\ws-check.mjs"
    if ($LASTEXITCODE -ne 0) { $failed = 1 }
} else {
    Write-Host '8. WebSocket: skipped (node not found)'
}
exit $failed

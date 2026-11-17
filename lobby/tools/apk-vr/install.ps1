# Puts MS Games VR on every Quest on the cable (or one: -Serial <id>) and arms it: the permission to bring the game
# back from the background (appops SYSTEM_ALERT_WINDOW), then starts it. After this the headset opens the game by
# itself at power-on and whenever it is put on.
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Serial 1WMHHA64JS2493]
# ASCII only on purpose (Windows PowerShell 5.1).
param([string]$Serial = '', [string]$Sdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\sdk' }))
$adb = "$Sdk\platform-tools\adb.exe"
$apk = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'MSGamesVR.apk'
$list = if ($Serial) { @($Serial) } else { @(& $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' } | ForEach-Object { ($_ -split '\t')[0] }) }
if (-not $list) { Write-Host 'No headset on the cable.'; exit 1 }
foreach ($s in $list) {
    Write-Host "== $s"
    & $adb -s $s install -r $apk
    & $adb -s $s shell appops set bg.arena.vr SYSTEM_ALERT_WINDOW allow
    & $adb -s $s shell am start -n bg.arena.vr/.LauncherActivity
}

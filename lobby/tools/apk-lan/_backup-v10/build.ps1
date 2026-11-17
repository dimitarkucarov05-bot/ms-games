# Builds MSGames-Headset.apk by hand with the Android SDK command-line tools. No Gradle (its daemon does not start on this PC).
#
#   powershell -ExecutionPolicy Bypass -File build.ps1
#   powershell -ExecutionPolicy Bypass -File build.ps1 -VersionCode 2 -VersionName 1.1
#
# Steps: aapt2 compile/link -> javac (against android.jar) -> d8 -> add classes.dex -> zipalign -> apksigner.
# Output: MSGames-Headset.apk next to this script. Intermediate files go to .\build (safe to delete).
# This file is kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
param(
    [int]$VersionCode = 1,
    [string]$VersionName = '1.0',
    [string]$Sdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\sdk' }),
    [string]$Jdk = $(if ($env:ARENA_JDK) { $env:ARENA_JDK } else { 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot' })
)
$ErrorActionPreference = 'Stop'
$MinSdk = 29

$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$build = Join-Path $root 'build'
$out   = Join-Path $root 'MSGames-Headset.apk'
$ks    = Join-Path $root 'debug.keystore'

function Step($text) { Write-Host "== $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "FAILED: $what (exit code $LASTEXITCODE)" } }
function Need($path, $what) { if (-not (Test-Path $path)) { throw "MISSING: $what ($path)" } }

# ---- tools ---------------------------------------------------------------
Need "$Jdk\bin\javac.exe" 'JDK (javac)'
$env:JAVA_HOME = $Jdk
$env:Path = "$Jdk\bin;$env:Path"

$bt = Get-ChildItem "$Sdk\build-tools" -Directory |
    Where-Object { (Test-Path "$($_.FullName)\aapt2.exe") -and (Test-Path "$($_.FullName)\d8.bat") -and
                   (Test-Path "$($_.FullName)\zipalign.exe") -and (Test-Path "$($_.FullName)\apksigner.bat") } |
    Sort-Object { [version]($_.Name -replace '[^0-9.].*$', '') } | Select-Object -Last 1
if (-not $bt) { throw "MISSING: no build-tools with aapt2, d8, zipalign and apksigner under $Sdk\build-tools" }

$platform = Get-ChildItem "$Sdk\platforms" -Directory |
    Where-Object { $_.Name -match '^android-(\d+)$' -and (Test-Path "$($_.FullName)\android.jar") } |
    Sort-Object { [int]($_.Name -replace '^android-', '') } | Select-Object -Last 1
if (-not $platform) { throw "MISSING: no platforms\android-<n>\android.jar under $Sdk\platforms" }

$api        = [int]($platform.Name -replace '^android-', '')
$androidJar = "$($platform.FullName)\android.jar"
$aapt2      = "$($bt.FullName)\aapt2.exe"
$d8         = "$($bt.FullName)\d8.bat"
$zipalign   = "$($bt.FullName)\zipalign.exe"
$apksigner  = "$($bt.FullName)\apksigner.bat"
Write-Host "build-tools $($bt.Name), platform $($platform.Name) (compile and target $api, min $MinSdk), JDK $Jdk"

# ---- inputs --------------------------------------------------------------
Need "$root\AndroidManifest.xml" 'AndroidManifest.xml'
if (-not (Test-Path "$root\res\mipmap-xxxhdpi\ic_launcher.png")) {
    Step 'icons are missing: drawing them (python make_icons.py)'
    & python "$root\make_icons.py"; Check 'make_icons.py (needs Python with Pillow)'
}

if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force "$build\gen", "$build\classes", "$build\dex" | Out-Null

# ---- resources -----------------------------------------------------------
Step 'aapt2 compile'
& $aapt2 compile --dir "$root\res" -o "$build\res.zip"; Check 'aapt2 compile'

Step 'aapt2 link'
& $aapt2 link -o "$build\base.apk" -I $androidJar --manifest "$root\AndroidManifest.xml" --java "$build\gen" `
    --min-sdk-version $MinSdk --target-sdk-version $api --version-code $VersionCode --version-name $VersionName `
    "$build\res.zip"
Check 'aapt2 link'

# ---- java ----------------------------------------------------------------
Step 'javac'
$sources = @(Get-ChildItem "$root\src", "$build\gen" -Recurse -Filter *.java | ForEach-Object { '"' + ($_.FullName -replace '\\', '/') + '"' })
[IO.File]::WriteAllLines("$build\sources.txt", $sources)
& "$Jdk\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -bootclasspath $androidJar -Xlint:-options -nowarn `
    -d "$build\classes" "@$build\sources.txt"
Check 'javac'
& "$Jdk\bin\jar.exe" cfM "$build\classes.jar" -C "$build\classes" .; Check 'jar'

Step 'd8'
& $d8 --release --min-api $MinSdk --lib $androidJar --output "$build\dex" "$build\classes.jar"; Check 'd8'
Need "$build\dex\classes.dex" 'classes.dex from d8'

# ---- package -------------------------------------------------------------
Step 'package'
Copy-Item "$build\base.apk" "$build\unsigned.apk" -Force
& "$Jdk\bin\jar.exe" ufM "$build\unsigned.apk" -C "$build\dex" classes.dex; Check 'adding classes.dex'

# resources.arsc must stay uncompressed or Android 11+ refuses to install the APK.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead("$build\unsigned.apk")
try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })
    $arsc = $zip.Entries | Where-Object { $_.FullName -eq 'resources.arsc' }
    if (-not $arsc) { throw 'FAILED: resources.arsc is not in the APK' }
    if ($arsc.CompressedLength -ne $arsc.Length) { throw 'FAILED: resources.arsc got compressed while adding classes.dex' }
    if ($names -notcontains 'classes.dex') { throw 'FAILED: classes.dex is not in the APK' }
} finally { $zip.Dispose() }

Step 'zipalign'
& $zipalign -f -p 4 "$build\unsigned.apk" "$build\aligned.apk"; Check 'zipalign'

# ---- sign ----------------------------------------------------------------
if (-not (Test-Path $ks)) {
    Step 'creating debug.keystore (keep this file: the headset id and updates depend on the same key)'
    & "$Jdk\bin\keytool.exe" -genkeypair -keystore $ks -storetype PKCS12 -storepass android -keypass android `
        -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Arena Debug,O=Arena,C=BG'
    Check 'keytool'
}

Step 'apksigner'
& $apksigner sign --ks $ks --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android `
    --min-sdk-version $MinSdk --v4-signing-enabled false --out $out "$build\aligned.apk"
Check 'apksigner sign'
& $apksigner verify --min-sdk-version $MinSdk $out; Check 'apksigner verify'
& $zipalign -c -p 4 $out; Check 'zipalign check'

$size = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host ''
Write-Host "APK: $out ($size KB)" -ForegroundColor Green
Write-Host "Install: `"$Sdk\platform-tools\adb.exe`" install -r `"$out`""

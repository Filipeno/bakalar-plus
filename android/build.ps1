# Builds Bakalari-Plus.apk without Gradle or Android Studio: web build -> aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Needs Node, JDK 17 and the Android SDK packages "platforms;android-35" and "build-tools;35.0.1".
#
#   .\build.ps1 -CloudUrl https://bakalar-plus.<account>.workers.dev
#
# -CloudUrl is the Worker (shared class calendar). It's remembered in cloud-url.txt for the next build.
# The signing key (release.keystore + keystore.pass) is created on the first run and must be KEPT: Android only
# installs an update over the old app when both are signed with the same key. Never commit those two files.
param([string]$CloudUrl = '', [string]$Version = '')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$bt = "$sdk\build-tools\35.0.1"
$jar = "$sdk\platforms\android-35\android.jar"
$jdk = if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\javac.exe")) { $env:JAVA_HOME } else { 'C:\Program Files\Eclipse Adoptium\jdk-17.0.7.7-hotspot' }
$env:PATH = "$jdk\bin;$env:PATH"
$out = Join-Path $here 'build'

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed with exit code $LASTEXITCODE" }
}

$cloudFile = Join-Path $here 'cloud-url.txt'
if ($CloudUrl) { [IO.File]::WriteAllText($cloudFile, $CloudUrl.TrimEnd('/')) }
elseif (Test-Path $cloudFile) { $CloudUrl = (Get-Content $cloudFile -Raw).Trim() }
if (-not $CloudUrl) { Write-Warning 'No -CloudUrl: the shared class calendar will be off in this build.' }

$pkg = Get-Content (Join-Path $here '..\web\package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
$p = $Version.Split('.') | ForEach-Object { [int]$_ }
$versionCode = $p[0] * 10000 + $p[1] * 100 + $p[2]      # 1.2.3 -> 10203

# 0. the web app, built with the Worker address baked in
Push-Location (Join-Path $here '..\web')
try {
    $env:VITE_CLOUD_URL = $CloudUrl
    Run 'npm.cmd' @('run', 'build')
} finally { Remove-Item Env:VITE_CLOUD_URL -ErrorAction SilentlyContinue; Pop-Location }

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\gen", "$out\classes", "$out\dex", "$out\assets\web" | Out-Null
Copy-Item (Join-Path $here '..\web\dist\*') "$out\assets\web" -Recurse
Remove-Item "$out\assets\web\sw.js" -ErrorAction SilentlyContinue      # the APK has its files locally

# 1. resources + manifest (assets are added in step 3: aapt2 -A on Windows writes 'assets/web\x' entry names)
Run "$bt\aapt2.exe" @('compile', '--dir', "$here\res", '-o', "$out\res.zip")
Run "$bt\aapt2.exe" @('link', '-o', "$out\base.apk", '-I', $jar, '--manifest', "$here\AndroidManifest.xml",
    '--java', "$out\gen", '--min-sdk-version', '26', '--target-sdk-version', '35',
    '--version-code', "$versionCode", '--version-name', $Version, "$out\res.zip")

# 2. Java -> classes -> dex (options go through an argument file: no quoting trouble with spaces in paths)
$argLines = @('-source', '8', '-target', '8', '-bootclasspath', "$jar;$bt\core-lambda-stubs.jar", '-Xlint:-options', '-encoding', 'UTF-8',
    '-d', "$out\classes") + @(Get-ChildItem "$here\src", "$out\gen" -Recurse -Filter *.java | ForEach-Object FullName)
[IO.File]::WriteAllLines("$out\javac.args", @($argLines | ForEach-Object { '"' + ($_ -replace '\\', '/') + '"' }))
Run "$jdk\bin\javac.exe" @("@$out\javac.args")
$classes = @(Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName)
Run "$bt\d8.bat" (@('--release', '--lib', $jar, '--min-api', '26', '--output', "$out\dex") + $classes)

# 3. add classes.dex, align, sign
Copy-Item "$out\base.apk" "$out\unaligned.apk"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$out\unaligned.apk", 'Update')
[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$out\dex\classes.dex", 'classes.dex')
$assetRoot = (Resolve-Path "$out\assets").Path
foreach ($f in Get-ChildItem $assetRoot -Recurse -File) {
    $name = 'assets/' + $f.FullName.Substring($assetRoot.Length + 1).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $name)
}
$zip.Dispose()
Run "$bt\zipalign.exe" @('-p', '-f', '4', "$out\unaligned.apk", "$out\aligned.apk")

$ks = Join-Path $here 'release.keystore'
$passFile = Join-Path $here 'keystore.pass'
if (-not (Test-Path $ks)) {
    $pass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    [IO.File]::WriteAllText($passFile, $pass)
    Run "$jdk\bin\keytool.exe" @('-genkeypair', '-keystore', $ks, '-alias', 'bakalarplus', '-keyalg', 'RSA', '-keysize', '3072',
        '-validity', '10000', '-storepass', $pass, '-keypass', $pass, '-dname', 'CN=Bakalari Plus')
    Write-Warning "New signing key created: back up $ks and $passFile (without them you can't publish updates)."
}
$apk = Join-Path $here 'Bakalari-Plus.apk'
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-key-alias', 'bakalarplus', '--ks-pass', "file:$passFile", '--out', $apk, "$out\aligned.apk")
Run "$bt\apksigner.bat" @('verify', $apk)
Write-Host "Built $apk ($Version, code $versionCode, $([int]((Get-Item $apk).Length / 1KB)) KB)"

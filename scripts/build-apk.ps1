# build-apk.ps1 —— 构建人生记趣录 release APK（含签名），并把产物复制到仓库根目录。
#
# 依赖（可用环境变量覆盖）：
#   LJ_JDK    JDK17+ 根目录        默认 C:\Users\Ryany\.jdks\temurin-24
#   LJ_SDK    Android SDK 根目录   默认 C:\Users\Ryany\.lj-android\android-sdk（须与 android/local.properties 一致）
#   LJ_GRADLE gradle.bat 路径      默认 C:\Users\Ryany\.lj-android\gradle-8.14.3\bin\gradle.bat
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 [-Version 0.6.11] [-VersionCode 9]
# 说明：-Version / -VersionCode 会临时改写 android/app/build.gradle，构建后还原（正式发版请先提交版本号再构建）。
param(
    [string]$Version,
    [int]$VersionCode
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$android = Join-Path $repo "android"
$gradleFile = Join-Path $android "app\build.gradle"

$jdk = if ($env:LJ_JDK) { $env:LJ_JDK } else { "C:\Users\Ryany\.jdks\temurin-24" }
$sdk = if ($env:LJ_SDK) { $env:LJ_SDK } else { "C:\Users\Ryany\.lj-android\android-sdk" }
$gradle = if ($env:LJ_GRADLE) { $env:LJ_GRADLE } else { "C:\Users\Ryany\.lj-android\gradle-8.14.3\bin\gradle.bat" }

foreach ($p in @($jdk, $sdk, $gradle)) {
    if (-not (Test-Path $p)) { throw "缺少构建依赖: $p（可用 LJ_JDK / LJ_SDK / LJ_GRADLE 覆盖）" }
}

$original = Get-Content $gradleFile -Raw
$tempRewrite = $false
try {
    if ($Version -or $VersionCode) {
        $v = if ($Version) { $Version } else { "0.0.0" }
        $vc = if ($VersionCode) { $VersionCode } else { 1 }
        $patched = $original -replace 'versionCode\s+\d+', "versionCode $vc" -replace 'versionName\s+"[^"]*"', "versionName `"$v`""
        Set-Content -Path $gradleFile -Value $patched -NoNewline
        $tempRewrite = $true
        Write-Host "临时版本号: $v ($vc)"
    }

    # 前端产物打进 APK：gradle 的 syncWebAssets 会把 dist 复制到 assets
    Push-Location $repo
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "前端构建失败，退出码 $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $env:JAVA_HOME = $jdk
    $env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"
    Push-Location $android
    try {
        & $gradle assembleRelease -x lintVitalRelease --console=plain
        if ($LASTEXITCODE -ne 0) { throw "gradle 构建失败，退出码 $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $out = Join-Path $android "app\build\outputs\apk\release"
    $meta = (Get-Content (Join-Path $out "output-metadata.json") -Raw | ConvertFrom-Json).elements[0]
    $name = "LifeJournal-v$($meta.versionName).apk"
    $dest = Join-Path $repo $name
    Copy-Item (Join-Path $out "app-release.apk") $dest -Force

    $bytes = [System.IO.File]::ReadAllBytes($dest)
    $signed = [System.Text.Encoding]::ASCII.GetString($bytes).Contains("APK Sig Block 42")
    Write-Host "产物: $dest"
    Write-Host "版本: $($meta.versionName) (versionCode $($meta.versionCode))  大小: $($bytes.Length) 字节  签名: $signed"
    if (-not $signed) { throw "APK 未签名，请检查 android/app/keystore.properties" }
}
finally {
    if ($tempRewrite) { Set-Content -Path $gradleFile -Value $original -NoNewline }
}

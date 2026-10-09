param([string]$OutputRoot = 'D:\Desktop', [string]$PreviousApk = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$projectRoot = (Get-Location).Path
$version = [regex]::Match((Get-Content -Raw -LiteralPath 'web\src\meta.ts'), "APP_VERSION\s*=\s*'([^']+)'").Groups[1].Value
if (-not $version) { throw '未找到版本号' }
$changes = @(& git status --porcelain)
if ($LASTEXITCODE -ne 0 -or $changes.Count -gt 0) { throw '请先提交本轮源码与文档；源码压缩包只从已提交的 Git 版本生成' }
$destination = Join-Path $OutputRoot "Dolphin-Calendar-$version"
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$apk = Join-Path $projectRoot 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw '请先构建签名 release APK' }
& (Join-Path $PSScriptRoot 'check-release.ps1') -ApkPath $apk -PreviousApk $PreviousApk
Copy-Item -LiteralPath $apk -Destination (Join-Path $destination "dolphin-calendar-$version.apk") -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function New-FilteredArchive([string]$archivePath, [string]$basePath, [array]$files) {
    $stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $files) {
            $rootWithSeparator = $basePath.TrimEnd('\','/') + [System.IO.Path]::DirectorySeparatorChar
            if (-not $item.FullName.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) { throw "源文件超出项目目录：$($item.FullName)" }
            $relative = $item.FullName.Substring($rootWithSeparator.Length).Replace('\','/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
}
$webBase = Join-Path $projectRoot 'web\dist'
New-FilteredArchive (Join-Path $destination "dolphin-calendar-$version-web.zip") $webBase (Get-ChildItem -LiteralPath $webBase -File -Recurse)
$sourceZip = Join-Path $destination "dolphin-calendar-$version-sourcecode.zip"
& git archive --format=zip "--output=$sourceZip" HEAD
if ($LASTEXITCODE -ne 0) { throw '生成已提交源码压缩包失败' }
Copy-Item -LiteralPath 'docs\STATUS.md' -Destination (Join-Path $destination '验证与使用说明.md') -Force
Copy-Item -LiteralPath "docs\UI_$version.md" -Destination (Join-Path $destination '界面与升级说明.md') -Force
Copy-Item -LiteralPath 'README.md' -Destination (Join-Path $destination 'README.md') -Force
$evidenceBase = Join-Path $projectRoot 'build\evidence'
$evidenceNames = @(
    "$version-responsive-navigation-results.json", "$version-calendar-swipe-results.json",
    "$version-native-final-results.json", "$version-native-debug-cdp-results.json", "$version-upgrade-results.json",
    "$version-release-identity.json", "$version-build.json", "$version-apk-web-assets.json", "$version-final-rebuild-results.json", "$version-publication.json",
    "$version-navigation-390x844.png", "$version-navigation-320x568.png", "$version-navigation-844x390.png", "$version-navigation-1280x800.png",
    "$version-calendar-swipe-portrait.png", "$version-calendar-swipe-landscape.png", "$version-calendar-year-swipe.png",
    "$version-native-final-portrait.png", "$version-native-final-landscape.png", "$version-native-final-calendar.png",
    "$version-native-debug-cdp-portrait.png", "$version-native-debug-cdp-landscape.png",
    "$version-upgrade-before-saved-course.png", "$version-upgrade-after-saved-course.png", "$version-upgrade-after-preferences.png",
    "$version-calendar-picker-results.json", "$version-holidays-results.json", "$version-layout-results.json",
    "$version-background-results.json", "$version-offline-results.json", "$version-onboarding-results.json",
    "$version-experience-results.json", "$version-course-experience.json", "$version-home-search-experience-results.json",
    "$version-master-glass-results.json", 'browser-ci-results.json', 'home-interaction-results.json', 'schedule-ui-results.json',
    'primary-navigation-results.json', 'toolbar-import-results.json', 'ui-results.json', 'source-guards.json', 'assets-results.json',
    'current-time-line-results.json'
)
$evidenceFiles = @($evidenceNames | ForEach-Object {
    $evidencePath = Join-Path $evidenceBase $_
    if (Test-Path -LiteralPath $evidencePath -PathType Leaf) { Get-Item -LiteralPath $evidencePath }
})
if ($evidenceFiles.Count -gt 0) { New-FilteredArchive (Join-Path $destination "dolphin-calendar-$version-verification.zip") $evidenceBase $evidenceFiles }
$hashes = Get-ChildItem -LiteralPath $destination -File | Where-Object Extension -In '.apk','.zip' | Get-FileHash -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  $([System.IO.Path]::GetFileName($_.Path))" }
[System.IO.File]::WriteAllLines((Join-Path $destination 'SHA256SUMS.txt'), $hashes, [System.Text.UTF8Encoding]::new($false))
Get-ChildItem -LiteralPath $destination -File | Select-Object Name,Length

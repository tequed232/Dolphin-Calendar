param([string]$OutputRoot = 'D:\Desktop', [string]$PreviousApk = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$projectRoot = (Get-Location).Path
$meta = Get-Content -Raw -LiteralPath 'web\src\meta.ts'
$version = [regex]::Match($meta, "APP_VERSION\s*=\s*'([^']+)'").Groups[1].Value
if (-not $version) { throw '未找到版本号' }
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
$excludedDirectories = @('node_modules','.git','.gradle','.kotlin','.signing','.idea','build','dist','releases','codex-deepseek-pet')
function Get-SourceFiles([string]$folder) {
    foreach ($entry in Get-ChildItem -LiteralPath $folder -Force) {
        if ($entry.PSIsContainer) {
            if ($entry.Name -in $excludedDirectories) { continue }
            if ($entry.FullName -eq (Join-Path $projectRoot 'app\src\main\assets')) { continue }
            if ($entry.FullName -eq (Join-Path $projectRoot '.idea\caches')) { continue }
            if ($entry.FullName -eq (Join-Path $projectRoot '.idea\shelf')) { continue }
            Get-SourceFiles $entry.FullName
        } elseif ($entry.Name -notin @('signing.local.properties','local.properties','workspace.xml') -and $entry.Extension -notin @('.jks','.keystore','.log','.iml')) { $entry }
    }
}
$sourceRootFiles = @('.gitattributes','.gitignore','README.md','RELEASE_NOTES.md','THIRD_PARTY_NOTICES.md','release-identity.json','package.json','package-lock.json','build.gradle.kts','settings.gradle.kts','gradle.properties','gradlew','gradlew.bat')
$sourceDirectories = @('web','app','gradle','scripts','docs','legal','.github')
$sourceFiles = @($sourceRootFiles | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) })
$sourceFiles += @($sourceDirectories | ForEach-Object { Get-SourceFiles (Join-Path $projectRoot $_) })
New-FilteredArchive (Join-Path $destination "dolphin-calendar-$version-源码.zip") $projectRoot $sourceFiles
Copy-Item -LiteralPath 'docs\STATUS.md' -Destination (Join-Path $destination '验证与使用说明.md') -Force
Copy-Item -LiteralPath 'docs\GOAL_AUDIT.md' -Destination (Join-Path $destination '目标改进核对.md') -Force
Copy-Item -LiteralPath 'README.md' -Destination (Join-Path $destination 'README.md') -Force
$evidenceBase = Join-Path $projectRoot 'build\evidence'
$evidenceNames = @(
    "$version-android-journey.txt", "$version-android-notifications.json", "$version-android-dates.json",
    "$version-emulator-notification.png", "$version-home-light.png", "$version-home-dark.png",
    "$version-appearance.png", "$version-visual-results.json", 'device-dock-results.json',
    "$version-android-calendar.json", "$version-calendar-events.txt", "$version-calendar-open.json", "$version-calendar-android.png", "$version-calendar-browser.png", "$version-home-actions.png",
    "$version-android-keyboard.json", "$version-android-keyboard-import.png", "$version-android-keyboard-dialog.png", "$version-android-keyboard-lyrics.png", "$version-android-notification.png",
    "$version-android-dock-results.json", "$version-android-home-redesign.png", "$version-android-dock-pressed.png", "$version-android-dock-drag.png", "$version-android-settings-redesign.png",
    "$version-home-lyrics.png", "$version-home-lyrics.json",
    "$version-release-identity.json", "$version-build.json", "$version-android-upgrade.json", "$version-android-upgraded-home.png", "$version-android-icon.png", "$version-new-icon-browser.png", "$version-icon-browser.json",
    "$version-android-arrival.png",
    "$version-background-results.json", "$version-calendar-picker-results.json", "$version-layout-results.json",
    "$version-editor-collapsed-light.png", "$version-term-fields-dark-narrow.png", "$version-term-calendar-light.png", "$version-term-calendar-dark-narrow.png",
    "$version-default-background-home.png", "$version-default-background-settings.png",
    "$version-offline-results.json", "$version-offline.png",
    "$version-onboarding-results.json", "$version-experience-results.json", "$version-course-experience.json", "$version-home-search-experience-results.json", "$version-liquid-modes-results.json",
    "$version-onboarding-1-light.png", "$version-onboarding-3-light.png", "$version-onboarding-dark-narrow.png", "$version-book-editor-narrow-keyboard.png",
    "$version-liquid-partial.png", "$version-liquid-full-light.png", "$version-liquid-full-dark-narrow.png", "$version-publish-preparation.json",
    "$version-liquid-full-home-light.png", "$version-liquid-full-settings-light.png", "$version-liquid-full-calendar-light.png", "$version-liquid-full-calendar-dark.png", "$version-journey-restoration-stress.json",
    "$version-background-settings.png", "$version-background-home-light.png", "$version-background-home-dark.png", "$version-background-home-narrow.png",
    "$version-calendar-picker-light.png", "$version-calendar-picker-dark-narrow.png",
    "$version-compact-home.png", "$version-compact-import.png", "$version-compact-background.png", "$version-background-preview.png",
    "$version-android-background.json", "$version-android-background.png", "$version-android-calendar-picker.png", "$version-android-native-document-picker.png", "$version-android-background-keyboard.png",
    "$version-holidays-results.json", "$version-holidays-home-light.png", "$version-holidays-home-dark-narrow.png", "$version-holidays-calendar-light.png", "$version-holidays-calendar-dark-narrow.png",
    "$version-android-holidays.json", "$version-holidays-android.png",
    '1.2.7-android-notifications.json', '1.2.7-android-journey.txt', '1.2.7-android-arrival.png',
    '1.2.6-android-upgrade.json', '1.2.6-release-identity.json',
    '1.2.5-home-lyrics.json', '1.2.5-home-lyrics.png',
    '1.2.4-home-actions.png', '1.2.4-visual-results.json',
    '1.2.4-android-keyboard.json', '1.2.4-android-keyboard-import.png', '1.2.4-android-keyboard-dialog.png', '1.2.4-android-keyboard-lyrics.png',
    '1.2.4-android-calendar.json', '1.2.4-calendar-events.txt', '1.2.4-calendar-open.json', '1.2.4-calendar-android.png',
    '1.2.4-android-notifications.json', '1.2.4-android-journey.txt', '1.2.4-android-notification.png', '1.2.4-android-dock-results.json',
    '1.2.2-android-dates.json', '1.2.2-android-notifications.json', '1.2.2-emulator-notification.png',
    'device-home-redesign.png', 'device-dock-pressed.png', 'device-dock-drag.png', 'device-settings-redesign.png',
    'source-guards.json', 'ui-results.json', 'glass-results.json', 'assets-results.json'
)
$evidenceFiles = @($evidenceNames | ForEach-Object {
    $path = Join-Path $evidenceBase $_
    if (Test-Path -LiteralPath $path -PathType Leaf) { Get-Item -LiteralPath $path }
})
$evidenceFiles = @($evidenceFiles + @(Get-ChildItem -LiteralPath $evidenceBase -File -Filter "$version-*")) | Sort-Object FullName -Unique
if ($evidenceFiles.Count -gt 0) {
    New-FilteredArchive (Join-Path $destination "dolphin-calendar-$version-验证记录.zip") $evidenceBase $evidenceFiles
}
$hashes = Get-ChildItem -LiteralPath $destination -File | Where-Object Extension -In '.apk','.zip' | Get-FileHash -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  $([System.IO.Path]::GetFileName($_.Path))" }
[System.IO.File]::WriteAllLines((Join-Path $destination 'SHA256SUMS.txt'), $hashes, [System.Text.UTF8Encoding]::new($false))
Get-ChildItem -LiteralPath $destination -File | Select-Object Name,Length

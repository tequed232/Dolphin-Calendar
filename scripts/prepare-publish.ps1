param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$meta = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'web/src/meta.ts')
$version = [regex]::Match($meta, "APP_VERSION\s*=\s*'([^']+)'").Groups[1].Value
if (-not $version) { throw '缺少版本号' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot ("build/publish/Dolphin-Calendar-$version-" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$publishRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'build/publish')).TrimEnd('\','/') + [System.IO.Path]::DirectorySeparatorChar
if (-not $publishRoot.StartsWith($allowedRoot,[System.StringComparison]::OrdinalIgnoreCase)) { throw '发布准备目录必须位于本项目 build/publish 内' }
if (Test-Path -LiteralPath $publishRoot) { throw '目录已存在；不覆盖已有发布准备内容，请使用新的目录名' }
New-Item -ItemType Directory -Path $publishRoot -Force | Out-Null
$files = @('.gitattributes','.gitignore','README.md','RELEASE_NOTES.md','THIRD_PARTY_NOTICES.md','release-identity.json','source-policy.json','package.json','package-lock.json','build.gradle.kts','settings.gradle.kts','gradle.properties','gradlew','gradlew.bat')
$directories = @('web','app','gradle','scripts','docs','legal','.github','.githooks')
$excludedDirectories = @('node_modules','build','dist','.gradle','.kotlin','.git','.idea','.signing','releases')
$excludedFiles = @('local.properties','signing.local.properties','workspace.xml')
function Copy-PublishDirectory([string]$source,[string]$target) {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $source -Force) {
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw '不接受符号链接或联接目录' }
        if ($item.PSIsContainer) {
            if ($item.Name -in $excludedDirectories -or $item.FullName -eq (Join-Path $projectRoot 'app/src/main/assets')) { continue }
            Copy-PublishDirectory $item.FullName (Join-Path $target $item.Name)
        } elseif ($item.Name -notin $excludedFiles -and $item.Extension -notin @('.jks','.keystore','.log','.iml','.apk','.zip')) {
            Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $target $item.Name)
        }
    }
}
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $publishRoot $file) }
if (Test-Path -LiteralPath (Join-Path $projectRoot 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination (Join-Path $publishRoot 'LICENSE') }
foreach ($directory in $directories) { Copy-PublishDirectory (Join-Path $projectRoot $directory) (Join-Path $publishRoot $directory) }
& node (Join-Path $projectRoot 'scripts/check-source-files.mjs') --directory $publishRoot
if ($LASTEXITCODE -ne 0) { throw '源码准入校验失败；不允许上传该快照' }
$contents = @(Get-ChildItem -LiteralPath $publishRoot -Recurse -File -Force)
if ($contents | Where-Object { $_.Name -in $excludedFiles -or $_.Extension -in @('.jks','.keystore','.apk','.zip') }) { throw '发布目录包含不允许的本地配置或发行文件' }
$report = [ordered]@{version=$version;path=$publishRoot;files=$contents.Count;containsSigningKeys=$false;containsUserDatabase=$false;containsIDEWorkspace=$false;containsOriginalPrompt=$false;uploaded=$false;sourceAdmissionPassed=$true}
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'build/evidence') -Force | Out-Null
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot "build/evidence/$version-publish-preparation.json") -Encoding utf8
$report | ConvertTo-Json

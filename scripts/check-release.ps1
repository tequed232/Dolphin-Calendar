param(
    [string]$ApkPath = 'app\build\outputs\apk\release\app-release.apk',
    [string]$PreviousApk = '',
    [string]$SdkRoot = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'D:\Android\Sdk' })
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$identity = Get-Content -Raw -LiteralPath 'release-identity.json' | ConvertFrom-Json
$buildTools = Join-Path $SdkRoot 'build-tools\36.0.0'
function Read-ApkIdentity([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "缺少 APK：$path" }
    $badging = & (Join-Path $buildTools 'aapt.exe') dump badging $path
    if ($LASTEXITCODE -ne 0) { throw '读取 APK 身份失败' }
    $package = [regex]::Match(($badging -join "`n"), "package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'")
    if (-not $package.Success) { throw 'APK 身份格式不完整' }
    $certificate = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs $path
    if ($LASTEXITCODE -ne 0) { throw 'APK 签名验证失败，不能作为覆盖升级包交付' }
    $signers = [regex]::Matches(($certificate -join "`n"), 'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})')
    if ($signers.Count -ne 1) { throw '预期只有一个原有发行签名' }
    return [pscustomobject]@{applicationId=$package.Groups[1].Value;versionCode=[int]$package.Groups[2].Value;versionName=$package.Groups[3].Value;signerSha256=$signers[0].Groups[1].Value.ToLower()}
}
$current = Read-ApkIdentity $ApkPath
if ($current.applicationId -ne $identity.applicationId -or $current.signerSha256 -ne $identity.signerSha256) { throw '正式包名或发行签名发生变化，拒绝交付无法覆盖现有正式版的 APK' }
$version = [regex]::Match((Get-Content -Raw -LiteralPath 'web\src\meta.ts'), "APP_VERSION\s*=\s*'([^']+)'").Groups[1].Value
$parts = $version.Split('.') | ForEach-Object { [int]$_ }
if ($parts.Count -ne 3 -or $parts[1] -gt 99 -or $parts[2] -gt 99) { throw '版本号超出当前 versionCode 编码范围' }
$expectedCode = $parts[0]*10000 + $parts[1]*100 + $parts[2]
if ($current.versionName -ne $version -or $current.versionCode -ne $expectedCode) { throw 'APK 版本号与源码不一致' }
$previous = $null
if ($PreviousApk) {
    $previous = Read-ApkIdentity $PreviousApk
    if ($current.applicationId -ne $previous.applicationId -or $current.signerSha256 -ne $previous.signerSha256 -or $current.versionCode -le $previous.versionCode) { throw '新旧 APK 的包名、签名或递增版本号不满足覆盖升级条件' }
}
New-Item -ItemType Directory -Force -Path 'build\evidence' | Out-Null
$record = [ordered]@{current=$current;previous=$previous;identityPinned=$true;signatureVerified=$true;completed=$true}
$json = $record | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "build\evidence\$version-release-identity.json"),$json,[System.Text.UTF8Encoding]::new($false))
"PASS 正式包名、原发行签名、版本号与升级身份校验：$($current.applicationId) $version ($expectedCode)"

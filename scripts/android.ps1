param([string]$Task = ':app:assembleDebug')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $env:JAVA_HOME -and (Test-Path 'D:\Android\jdk-17')) { $env:JAVA_HOME = 'D:\Android\jdk-17' }
if (Test-Path 'D:\Android\gradle-8.13\bin\gradle.bat') {
    & 'D:\Android\gradle-8.13\bin\gradle.bat' $Task --console=plain
} else {
    & '.\gradlew.bat' $Task --console=plain
}
exit $LASTEXITCODE

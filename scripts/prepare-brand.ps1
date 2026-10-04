param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$source = (Resolve-Path -LiteralPath $ImagePath).Path
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($source)
try {
    if ($image.Width -ne $image.Height) { throw '品牌图标应为正方形，以免缩放产生拉伸。' }
    Copy-Item -LiteralPath $source -Destination (Join-Path $projectRoot 'web\src\assets\brand\app-icon.png') -Force
    Copy-Item -LiteralPath $source -Destination (Join-Path $projectRoot 'app\src\main\res\drawable-nodpi\app_icon.png') -Force
    $icon = [System.Drawing.Bitmap]::new(256,256,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($icon)
    $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
    try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $graphics.DrawImage($image,[System.Drawing.Rectangle]::new(0,0,256,256),0,0,$image.Width,$image.Height,[System.Drawing.GraphicsUnit]::Pixel,$attributes)
        $icon.Save((Join-Path $projectRoot 'app\src\main\res\drawable-nodpi\live_icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $attributes.Dispose(); $graphics.Dispose(); $icon.Dispose() }
} finally { $image.Dispose() }
Write-Output '原图已覆盖网页与启动器，实时通知彩色图标已生成 256×256 PNG。'

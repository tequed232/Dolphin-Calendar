param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$source = (Resolve-Path -LiteralPath $ImagePath).Path
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($source)
try {
    if ($image.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid) { throw '正式品牌原图必须是 PNG，才能保留原始像素与透明度。' }
    if ($image.Width -ne $image.Height) { throw '品牌图标应为正方形，以免缩放产生拉伸。' }
    $originals = @('web/src/assets/brand/app-icon.png','app/src/main/res/drawable-nodpi/app_icon.png')
    foreach ($relative in $originals) {
        $destination = Join-Path $projectRoot $relative
        if (-not $source.Equals($destination,[System.StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item -LiteralPath $source -Destination $destination -Force
        }
    }
    $variants = @(
        @{Path='app/src/main/res/drawable-nodpi/live_icon.png';Size=256},
        @{Path='web/src/assets/brand/favicon.png';Size=32},
        @{Path='web/src/assets/brand/apple-touch-icon.png';Size=180}
    )
    foreach ($variant in $variants) {
        $size = $variant.Size
        $icon = [System.Drawing.Bitmap]::new($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($icon)
        $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
        try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $graphics.DrawImage($image,[System.Drawing.Rectangle]::new(0,0,$size,$size),0,0,$image.Width,$image.Height,[System.Drawing.GraphicsUnit]::Pixel,$attributes)
            $icon.Save((Join-Path $projectRoot $variant.Path),[System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $attributes.Dispose(); $graphics.Dispose(); $icon.Dispose() }
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'app/src/main/res/drawable-nodpi/live_icon.png') -Destination (Join-Path $projectRoot 'docs/images/app-icon.png') -Force
} finally { $image.Dispose() }
Write-Output 'PNG 原图已同步网页与启动器；已生成实时通知/GitHub 展示 256×256、网页 favicon 32×32、主屏幕图标 180×180，保留原设计与透明度。'

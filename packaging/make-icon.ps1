param([string]$Source = (Join-Path (Split-Path $PSScriptRoot -Parent) '奶龙.png'), [string]$Destination = (Join-Path $PSScriptRoot 'shuaiqi.ico'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sourceImage = [Drawing.Image]::FromFile($Source)
try {
    $images = @()
    foreach ($size in @(16,24,32,48,64,128,256)) {
        $bitmap = New-Object Drawing.Bitmap($size,$size)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $buffer = New-Object IO.MemoryStream
        try {
            $graphics.Clear([Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $ratio = [Math]::Min($size / $sourceImage.Width, $size / $sourceImage.Height)
            $w = [int][Math]::Round($sourceImage.Width * $ratio)
            $h = [int][Math]::Round($sourceImage.Height * $ratio)
            $graphics.DrawImage($sourceImage, [int](($size-$w)/2), [int](($size-$h)/2), $w, $h)
            $bitmap.Save($buffer,[Drawing.Imaging.ImageFormat]::Png)
            $images += @{ Size=$size; Bytes=$buffer.ToArray() }
        } finally { $graphics.Dispose(); $bitmap.Dispose(); $buffer.Dispose() }
    }
    $writer = New-Object IO.BinaryWriter([IO.File]::Create($Destination))
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
        $offset = 6 + 16 * $images.Count
        foreach ($entry in $images) {
            $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$entry.Bytes.Length); $writer.Write([uint32]$offset)
            $offset += $entry.Bytes.Length
        }
        foreach ($entry in $images) { $writer.Write([byte[]]$entry.Bytes) }
    } finally { $writer.Dispose() }
} finally { $sourceImage.Dispose() }
Write-Output "Created icon: $Destination"

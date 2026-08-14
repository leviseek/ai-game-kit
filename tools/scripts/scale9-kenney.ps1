# 一次性加工脚本：为自动战斗样本生成 UI 素材成品 PNG。
# - 按钮/面板/槽位：Kenney Pixel UI（CC0）scale9 放大为 XML 成品尺寸
# - 进度条轨道/填充：palette 锁定程序化渐变（无边框，横向按 value 拉伸自然）
# 用途：assets/samples/game_auto_battle 视觉升级（素材归档在 arts/auto-battle-art）。
# 运行：pwsh tools/scripts/scale9-kenney.ps1（本脚本为一次性工具，不进入 CI；执行后产物已提交）
Add-Type -AssemblyName System.Drawing

function New-Rect {
    param([int]$X, [int]$Y, [int]$W, [int]$H)
    return New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
}

function Scale9-Copy {
    param(
        [string]$Source,
        [string]$Dest,
        [int]$W,
        [int]$H,
        [int]$Left,
        [int]$Top,
        [int]$Right,
        [int]$Bottom
    )
    $src = New-Object System.Drawing.Bitmap($Source)
    $dst = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.Clear([System.Drawing.Color]::Transparent)
    $midSW = $src.Width - $Left - $Right
    $midSH = $src.Height - $Top - $Bottom
    $midDW = $W - $Left - $Right
    $midDH = $H - $Top - $Bottom
    if ($midSW -le 0 -or $midSH -le 0 -or $midDW -le 0 -or $midDH -le 0) { throw "scale9 目标过小" }
    # 四角
    $g.DrawImage($src, (New-Rect 0 0 $Left $Top), (New-Rect 0 0 $Left $Top), [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawImage($src, (New-Rect ($W - $Right) 0 $Right $Top), (New-Rect ($src.Width - $Right) 0 $Right $Top), [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawImage($src, (New-Rect 0 ($H - $Bottom) $Left $Bottom), (New-Rect 0 ($src.Height - $Bottom) $Left $Bottom), [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawImage($src, (New-Rect ($W - $Right) ($H - $Bottom) $Right $Bottom), (New-Rect ($src.Width - $Right) ($src.Height - $Bottom) $Right $Bottom), [System.Drawing.GraphicsUnit]::Pixel)
    # 上下边
    $g.DrawImage($src, (New-Rect $Left 0 $midDW $Top), (New-Rect $Left 0 $midSW $Top), [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawImage($src, (New-Rect $Left ($H - $Bottom) $midDW $Bottom), (New-Rect $Left ($src.Height - $Bottom) $midSW $Bottom), [System.Drawing.GraphicsUnit]::Pixel)
    # 左右边
    $g.DrawImage($src, (New-Rect 0 $Top $Left $midDH), (New-Rect 0 $Top $Left $midSH), [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawImage($src, (New-Rect ($W - $Right) $Top $Right $midDH), (New-Rect ($src.Width - $Right) $Top $Right $midSH), [System.Drawing.GraphicsUnit]::Pixel)
    # 中心
    $g.DrawImage($src, (New-Rect $Left $Top $midDW $midDH), (New-Rect $Left $Top $midSW $midSH), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $dst.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
    $src.Dispose()
}

function New-GradientBar {
    param([string]$Dest, [int]$W, [int]$H, [string]$TopHex, [string]$BottomHex)
    $dst = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $top = [System.Drawing.ColorTranslator]::FromHtml($TopHex)
    $bottom = [System.Drawing.ColorTranslator]::FromHtml($BottomHex)
    for ($y = 0; $y -lt $H; $y++) {
        $t = if ($H -gt 1) { $y / ($H - 1) } else { 0 }
        $c = [System.Drawing.Color]::FromArgb(255,
            [int](($top.R * (1 - $t)) + ($bottom.R * $t)),
            [int](($top.G * (1 - $t)) + ($bottom.G * $t)),
            [int](($top.B * (1 - $t)) + ($bottom.B * $t)))
        for ($x = 0; $x -lt $W; $x++) { $dst.SetPixel($x, $y, $c) }
    }
    $dst.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
}

$repo = "D:\ai-work\ai-game-kit"
# Kenney 源素材取自仓库归档（arts/auto-battle-art/source/kenney），
# 目录结构对齐原始 9-Slice 包；如需重新下载：https://kenney.nl/assets/pixel-ui-pack
$kenney = "$repo\arts\auto-battle-art\source\kenney"
$out = "$repo\arts\auto-battle-art\processed"
# 按钮三态：up=blue（原色），down=blue_pressed（按下变暗），over=blue（hover 复用原色）
Scale9-Copy "$kenney\Colored\blue.png" "$out\btn_common_up.png" 240 112 3 3 3 3
Scale9-Copy "$kenney\Colored\blue_pressed.png" "$out\btn_common_down.png" 240 112 3 3 3 3
Scale9-Copy "$kenney\Colored\blue.png" "$out\btn_common_over.png" 240 112 3 3 3 3
# 面板（850x560 候选面板区）：space 深色面板
Scale9-Copy "$kenney\space.png" "$out\panel_lineup_bg.png" 850 560 8 8 8 8
# 槽位：list 白色边框（180x150 布阵格）
Scale9-Copy "$kenney\list.png" "$out\formation_slot.png" 180 150 8 8 8 8
# 进度条：palette 锁定渐变（无边框，横向拉伸自然）
New-GradientBar "$out\progress_track.png" 200 20 "#3a3a3a" "#2a2a2a"
New-GradientBar "$out\progress_fill.png" 200 20 "#5aa0f2" "#2f6db3"
New-GradientBar "$out\progress_fill_hp.png" 200 20 "#d95f59" "#b04a44"
"done:"
Get-ChildItem $out -Filter *.png | Select-Object Name, Length

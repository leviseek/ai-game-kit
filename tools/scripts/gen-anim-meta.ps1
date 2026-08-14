# 一次性生成脚本：为 assets/animations/auto-battle 下的动画帧 PNG 生成 Cocos 图片 .meta。
# Cocos 图片资源由编辑器导入生成 .meta（importer image，含 texture + spriteFrame 子资源）；
# 本脚本按 Cocos 3.8 标准格式生成（uuid 随机、尺寸从 PNG 头读取），供 loader
# `bundle.load(path + "/spriteFrame")` 加载。生成后由 Cocos 编辑器首次打开工程时确认导入。
# 运行：pwsh tools/scripts/gen-anim-meta.ps1（一次性工具，不进入 CI；产物已提交）
Add-Type -AssemblyName System.Drawing

$repo = "D:\ai-work\ai-game-kit"
$dir = "$repo\assets\animations\auto-battle"
$pngs = Get-ChildItem $dir -Filter "*.png" | Where-Object { -not (Test-Path "$($_.FullName).meta") }

function New-RandomSubId {
    $chars = "0123456789abcdef"
    $sb = [System.Text.StringBuilder]::new()
    for ($i = 0; $i -lt 5; $i++) { [void]$sb.Append($chars[[System.Random]::new().Next(0, 16)]) }
    return $sb.ToString()
}

foreach ($png in $pngs) {
    $bitmap = New-Object System.Drawing.Bitmap($png.FullName)
    $w = $bitmap.Width
    $h = $bitmap.Height
    $bitmap.Dispose()

    $uuid = [guid]::NewGuid().ToString()
    $texId = New-RandomSubId
    $sfId = New-RandomSubId
    while ($sfId -eq $texId) { $sfId = New-RandomSubId }
    $name = $png.BaseName

    $meta = @{
        ver      = "1.0.27"
        importer = "image"
        imported = $true
        uuid     = $uuid
        files    = @(".json", ".png")
        subMetas = @{
            $texId = @{
                importer   = "texture"
                uuid       = "$uuid@$texId"
                displayName = "texture"
                id         = $texId
                name       = "texture"
                userData   = @{
                    wrapModeS          = "clamp-to-edge"
                    wrapModeT          = "clamp-to-edge"
                    imageUuidOrDatabaseUri = $uuid
                    isUuid             = $true
                    visible            = $false
                    minfilter          = "linear"
                    magfilter          = "linear"
                    mipfilter          = "none"
                    anisotropy         = 0
                }
                ver        = "1.0.22"
                imported   = $true
                files      = @(".json")
                subMetas   = @{}
            }
            $sfId = @{
                importer    = "sprite-frame"
                uuid        = "$uuid@$sfId"
                displayName = "spriteFrame"
                id          = $sfId
                name        = "spriteFrame"
                userData    = @{
                    trimThreshold = 1
                    rotated       = $false
                    offsetX       = 0
                    offsetY       = 0
                    trimX         = 0
                    trimY         = 0
                    width         = $w
                    height        = $h
                    rawWidth      = $w
                    rawHeight     = $h
                    borderTop     = 0
                    borderBottom  = 0
                    borderLeft    = 0
                    borderRight   = 0
                    packable      = $true
                    pixelsToUnit  = 100
                    pivotX        = 0.5
                    pivotY        = 0.5
                    meshType      = 0
                    isUuid        = $true
                    imageUuidOrDatabaseUri = "$uuid@$texId"
                    atlasUuid     = ""
                    trimType      = "auto"
                }
                ver         = "1.0.12"
                imported    = $true
                files       = @(".json")
                subMetas    = @{}
            }
        }
        userData = @{
            type                        = "sprite-frame"
            fixAlphaTransparencyArtifacts = $false
            hasAlpha                    = $true
            redirect                    = "$uuid@$texId"
        }
    }

    $json = $meta | ConvertTo-Json -Depth 10
    Set-Content -Path "$($png.FullName).meta" -Value $json -Encoding utf8
}

Write-Output "generated $($pngs.Count) meta files in $dir"

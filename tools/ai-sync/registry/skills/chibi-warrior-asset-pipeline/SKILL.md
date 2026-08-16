---
name: chibi-warrior-asset-pipeline
description: Generate reusable Q-version chibi Chinese warrior portraits, remove backgrounds into clean RGBA cutouts, and validate/register them through the project asset pipeline.
license: MIT
compatibility: Requires the repository ComfyUI endpoint for generation and the Bun content assetgen CLI for validation and ingestion.
metadata:
  author: ai-game-kit
  version: "1.0"
---

# Q版武将立绘生成与透明切图

用于自动战斗、卡牌、布阵和武将详情页中的 Q 版全身武将立绘。目标不是生成“好看的单张概念图”，而是生成**可直接进入游戏的完整角色切图**。

## 设计原则

- 优先使用 Q 版卡通/赛璐璐风，不把写实金属光影当作默认方案。
- 轮廓优先于材质：粗黑描边、清晰色块、完整外轮廓比复杂反光更重要。
- 生成阶段就约束完整度：双手、双臂、双腿、双脚、披风和武器必须明确可见。
- 棋盘格图只能用于质检预览，不能作为正式资源；正式资源必须是真正的 RGBA PNG。
- 所有外部生成产物必须经过 staging、契约校验和 ingest，不得直接复制进 `assets/`。

## 推荐生成参数

- 源图尺寸：`1024x1536`，作为唯一高清美术源图。
- 构图：单角色、全身、居中、四周留安全边距；角色主体高度约占画布 `88%~96%`。
- 背景：纯色深蓝或纯色中性背景；禁止环境、地面和投影。
- 风格：Q版、二次元、赛璐璐、块面上色、清晰深色描边。
- 角色：金色铠甲、红色披风/羽饰、完整中国古代武器；具体武将身份可替换。

## 游戏派生尺寸契约

所有游戏尺寸都从同一张 `1024x1536` RGBA 源图自动派生，不为不同用途重新生成角色，避免姿态、装备和配色漂移：

| 资源用途 | 输出尺寸 | 处理方式 |
| --- | ---: | --- |
| 全身大立绘 | `512x768` | 等比缩放，保留完整透明留白 |
| 全身小立绘 | `256x384` | 等比缩放，适合战场/布阵单位 |
| 大头像 | `256x256` | 以头肩安全框裁切，不拉伸 |
| 小图标 | `64x64` | 从头像中心缩放并保留清晰轮廓 |
| 半身卡牌 | `320x480` | 以胸口至头顶为主的半身裁切，不拉伸 |

派生脚本必须统一处理：等比缩放、透明留白、裁切锚点、PNG RGBA 输出、命名和 manifest 登记。源图进入美术资产目录，派生图进入游戏资源目录。

## 正向提示词模板

```text
masterpiece, best quality, polished chibi anime game character,
cute heroic Chinese Three Kingdoms general, Q-version warrior,
full body, complete body, three-head-tall proportions,
centered standing pose, both arms fully visible, both hands visible,
both legs fully visible, both feet fully visible,
complete ornate golden lamellar armor,
red cape with clear silhouette, red sash,
round heroic helmet with feather,
holding a complete Chinese dao sword with visible handle and full blade,
thick clean dark outline, cel shading, flat separated colors,
simple shapes, high contrast, isolated character,
plain solid deep blue background, no environment, no floor,
no cast shadow, game asset, character sheet quality
```

可替换字段：

- `Chinese Three Kingdoms general`：武将身份或阵营；
- `golden lamellar armor`：职业/兵种护甲；
- `red cape`：阵营色、披风、旗帜或肩甲饰物；
- `Chinese dao sword`：刀、枪、戟、弓等武器；
- `three-head-tall proportions`：可改为更 Q 或更接近正常比例。

## 负面提示词模板

```text
photorealistic, realistic human proportions, realistic lighting,
cinematic lighting, soft edges, painterly, watercolor,
fog, glow, bloom, particles, scenery, landscape,
battlefield, castle, floor, cast shadow, vignette,
gradient background, low contrast, dark character,
cropped, cut off head, cut off feet, missing hands,
missing arms, missing legs, missing sword, incomplete blade,
fused limbs, hidden limbs, extra limbs, extra fingers,
deformed anatomy, blurry, low quality, watermark, text, logo
```

## 工作流

### 1. 生成候选源图

使用固定尺寸、固定 seed 和批量候选，避免只凭一张图进入抠图阶段。ComfyUI 工作流的 `EmptyLatentImage` 必须设置为 `1024x1536`，项目内生成入口：

```powershell
$env:COMFYUI_ENDPOINT='http://127.0.0.1:8188'
bun run content assetgen generate comfyui `
  --workflow-file tools/content/examples/comfyui-warrior-chibi.json `
  --id warrior_ai_idle_chibi_candidates `
  --name warrior_ai_idle_chibi_candidate
```

候选图先检查以下内容，再选择一张：

- 头、手、腕、手臂、腿、大腿、脚和鞋底完整；
- 披风主体与下摆没有被身体或背景吞掉；
- 武器有完整握柄、刃身和尖端；
- 没有两把武器融合、手指粘连或四肢融合；
- 角色缩小到游戏显示尺寸后仍能识别。

### 2. 透明切图

推荐顺序：

1. 纯色背景候选使用 GrabCut 或颜色分割获得初始前景；
2. 轮廓复杂时加入人工前景种子，特别是手、脚、披风和剑身；
3. 保留轻微抗锯齿边缘，但不要保留大面积半透明光晕；
4. 输出 `RGBA PNG`，源图保持 `1024x1536`；
5. 生成白底、黑底、洋红底和棋盘格预览分别检查边缘。

不要直接依赖以下方案作为最终结果：

- 写实黑背景 + 单一硬阈值：容易产生黑边并丢失暗色铠甲；
- 纯绿背景 + 未校验的通道反转：容易产生绿边或把主体孔洞抠掉；
- 只看 checker 预览判断透明质量：checker 本身可能是全不透明合成图。

### 3. 质量门禁

正式 ingest 前必须确认：

- 源图 PNG color type 为 RGBA，尺寸为 `1024x1536`；派生图尺寸必须分别符合输出契约；
- Alpha 同时存在 `0` 和 `255`，不能全透明或全不透明；
- 边界和四角 Alpha 为 `0`；
- 半透明像素主要集中在边缘，不能覆盖手、脚、剑身等主体内部；
- 白底、黑底、洋红底合成图中没有明显黑边、白边、绿边或背景光晕；
- 最大前景连通域包含头盔、身体、披风、双腿和脚；
- 剑身/枪杆等独立细长部件没有被组件过滤误删；
- 原图、遮罩、RGBA 成品和 checker 预览均保留在 staging 以便复盘。

### 4. 派生并登记资源

建议目录与命名：

```text
arts/auto-battle-art/source/warriors/<warrior-id>_source_1024x1536.png
assets/animations/auto-battle/<warrior-id>_full_512x768.png
assets/animations/auto-battle/<warrior-id>_small_256x384.png
assets/animations/auto-battle/<warrior-id>_portrait_256x256.png
assets/animations/auto-battle/<warrior-id>_icon_64x64.png
assets/animations/auto-battle/<warrior-id>_card_320x480.png
```

派生脚本应从同一源图一次性生成全部目标尺寸，使用等比缩放和透明留白；头像、图标和半身卡牌使用固定裁切锚点，不允许拉伸变形。所有派生图在同一 staging 中完成契约校验后再登记：

```powershell
bun run content assetgen validate <staging-dir>
bun run content assetgen ingest <staging-dir> `
  --target assets/animations/auto-battle `
  --id <warrior-id> `
  --keep
bun run content validate
```

如果替换已有资源，必须确认 `generated-assets.json` 的登记仍指向目标文件，并检查 Cocos `.png.meta` 的尺寸与 PNG 一致。源图只进入美术资产目录，游戏运行时只加载派生图。

## 常见失败与修复

| 现象 | 根因 | 修复 |
| --- | --- | --- |
| 手腕、脚底、披风缺失 | 前景种子过于保守或暗部被当背景 | 加人工前景种子，扩大局部 GrabCut 前景区域 |
| 剑身断裂 | 细长结构被连通域过滤 | 独立保留武器组件，降低组件面积门槛 |
| 黑色/绿色边 | 背景颜色污染 Alpha 边缘 | 使用纯色背景、轻微羽化和边缘去污染，检查多种底色 |
| 背景圆环残留 | 只做全局阈值，没有检查连通域 | 重新分割并删除主体外孤立连通域 |
| 棋盘格被导入游戏 | 把检查预览当成正式 PNG | 正式资源只能使用真 RGBA，checker 仅作证据图 |
| 缩小后角色糊成一团 | 材质细节过多、轮廓对比不足 | 回到 Q 版赛璐璐风，强化描边和大色块 |

## 后续扩展

- 将 Alpha、连通域、边缘污染和关键部件完整度加入 `assetgen validate`；
- 为不同兵种维护正向提示词片段和统一颜色规范；
- 生成角色头像、战斗立绘和卡牌半身像的统一构图模板；
- 通过固定 seed 与候选评分，建立可回归的角色资产生成测试集。

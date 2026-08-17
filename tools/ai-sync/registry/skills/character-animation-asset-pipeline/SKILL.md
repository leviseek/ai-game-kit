---
name: character-animation-asset-pipeline
description: Generate a complete identity-consistent chibi character animation asset pack from one character-description prompt: source candidates, clean RGBA cutout, chibi pose skeletons, img2img action frames, per-frame alpha cleanup, normalization, validation, and assetgen registration.
license: MIT
compatibility: Requires the repository ComfyUI setup, Animagine XL 3.1, SDXL IP-Adapter and OpenPose models, Python 3 with OpenCV/Pillow, and the Bun content assetgen CLI.
metadata:
  author: ai-game-kit
  version: "1.0"
---

# 通用 Q 版角色帧动画资产流水线

将用户的一段角色特征描述扩展为可执行的角色美术规格，并自动产出一套可进入游戏的透明逐帧动画资源。用户不需要手写 ComfyUI 工作流、逐帧提示词、抠图参数或资源登记命令。

默认产物为 `256x384` RGBA PNG，动作契约如下：

| 动作 | 帧数 | 产生方式 |
| --- | ---: | --- |
| idle | 10 | 从确认源图确定性派生呼吸循环 |
| walk | 8 | Animagine + img2img + Q 版 OpenPose |
| run | 8 | 基于 walk 确定性增强 |
| attack | 6 | Animagine + img2img + Q 版 OpenPose |
| slash | 8 | 基于 attack 确定性增强 |
| hit | 4 | Animagine + img2img + Q 版 OpenPose |
| weak | 6 | 确定性下沉、弯腰、呼吸 |
| stun | 4 | 确定性摆动 |
| death | 10 | 画布中心旋转并逐步缩放，禁止出界 |
| skillRaise | 8 | Animagine + img2img + Q 版 OpenPose |

## 用户输入

用户只需提供一句角色描述，例如：

```text
生成角色 animationId=flame-priest：可爱的 Q 版火焰女祭司，红金祭司长袍，白色短发，琥珀色眼睛，头戴小型金冠，双手持一根完整的红宝石法杖，友方单位，轮廓清楚，不要火焰粒子。
```

最低必填信息：

- `animationId`：小写英文、数字和连字符组成；若用户没写，根据角色名称生成语义化 ID；
- 角色身份或职业；
- 主色；
- 服装；
- 武器或施法道具。

其余信息由技能自动补齐：

- Q 版头身比；
- 完整身体约束；
- 画布安全留白；
- 2D 赛璐璐风格；
- 武器完整性；
- 正向与负面提示词；
- 源图候选数、seed 和采样参数；
- Q 版姿态骨骼；
- img2img 身份锁定参数；
- Alpha 清理和归一规则；
- 命名、Meta 和逐帧登记。

如果用户没有明确要求人工确认，默认自动完成候选筛选和整套动作生产；只有全部候选连续失败质量门禁时才向用户报告具体阻塞条件。

## 角色规格归一

先把自然语言整理成内部规格，至少包含：

```json
{
  "animationId": "flame-priest",
  "displayRole": "cute chibi flame priestess",
  "body": "three-head-tall, big head, short limbs",
  "face": "cute round face, amber eyes, white short hair",
  "headwear": "small matte golden crown",
  "outfit": "red and gold priest robes, clear large color blocks",
  "weapon": "exactly one complete tall staff with a ruby head",
  "palette": "red, matte gold, white, amber",
  "teamReadability": "friendly fantasy caster",
  "forbidden": ["fire particles", "glow", "floor shadow"]
}
```

不要让同一个重要特征只存在于自然语言中；脸、发型、头饰、服装、武器和主色必须分别落入结构化字段。

## 正向提示词模板

加载 `references/prompt-template.md`，把结构化字段填入模板。最终提示词必须同时覆盖身份、构图、完整度、风格和背景职责。

默认源图正向提示词：

```text
masterpiece, best quality, very aesthetic, polished anime game character,
solo, {displayRole}, cute Q-version chibi character,
super deformed, three-head-tall proportions, big head, short torso, short legs,
{face}, {headwear},
{outfit}, clear large color blocks, readable silhouette,
holding {weapon}, exactly one weapon,
complete full body, centered standing pose,
small centered character occupying about 76 percent of the canvas,
wide empty safety margins on every side,
full headwear entirely inside canvas,
both arms fully visible, both hands fully visible,
both legs fully visible, both feet fully visible,
full weapon shaft, handle and tip entirely inside canvas,
clean anime lineart, thick clean dark outline,
flat 2D cel animation, flat separated colors, uniform neutral lighting,
matte materials, isolated character, simple empty neutral background,
game sprite source art, production character asset
```

正向提示词不得把最终 Alpha 透明度交给扩散模型；`transparent background` 只能作为弱语义，最终透明背景必须由抠图和后处理产生。

## 负面提示词模板

默认负面提示词：

```text
worst quality, low quality, blurry, pixelated,
photorealistic, realistic human proportions, 3d render, figurine, doll,
painterly, watercolor, sketch, soft edges,
cinematic lighting, dramatic lighting, rim light,
glow, bloom, aura, particles, smoke, fog, magic circle,
reflection, refraction, glossy material, metallic glare,
scenery, landscape, room, battlefield, floor, pedestal,
cast shadow, contact shadow, vignette, gradient background,
multiple characters, duplicate character, multiple views,
character sheet grid, sprite sheet, comic panels,
cropped, close-up, out of frame, cut off head, cut off headwear,
cut off weapon, cut off weapon tip, cut off hands, cut off feet,
missing arms, missing hands, missing fingers, missing legs, missing feet,
hidden limbs, fused limbs, extra arms, extra hands, extra legs, extra fingers,
deformed anatomy, broken weapon, bent weapon, floating weapon,
extra weapon, duplicated weapon, sword unless requested, shield unless requested,
different character, different face, different hairstyle,
different headwear, different outfit, different weapon,
blank face, faceless, masked face, face covered, missing eyes,
text, watermark, logo, border, frame
```

根据角色描述追加专用负面词：

- 用户明确“无粒子”时，将相应粒子放在负面词中；
- 武器不是剑时加入 `sword`；
- 没有盾牌时加入 `shield`；
- 非亡灵角色加入 `skull, skeletal body, undead skin`；
- 非绿色角色禁止为了抠图添加 `green screen`，避免角色颜色污染；
- 不把角色真实需要的颜色或部件误放进负面词。

## 阶段一：环境和模型门禁

生成前必须验证：

```powershell
bun run comfyui-setup status
```

若未运行，使用：

```powershell
bun run comfyui-setup start
```

必须通过仓库工具管理 ComfyUI；不得直接启动其他实例。

需要的模型：

- `animagine-xl-3.1.safetensors`；
- `ip-adapter-plus_sdxl_vit-h.safetensors`；
- `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`；
- `OpenPoseXL2.safetensors`。

不要使用 SD Turbo 生成动作表，不要让扩散模型一次生成 sprite sheet。

## 阶段二：源图候选

默认生成 3 张候选：

```text
Checkpoint: Animagine XL 3.1
Size: 1024x1536
Sampler: DPM++ 2M SDE
Scheduler: Karras
Steps: 20
CFG: 5.0
Batch: 3
Denoise: 1.0
```

候选必须单角色、全身、完整武器和安全留白。候选依次经过：

1. 原图尺寸和签名检查；
2. 四边裁切检查；
3. 主体完整度视觉检查；
4. 武器数量和完整性检查；
5. 脸、头饰、服装与角色描述匹配检查；
6. 无候选通过时修改 seed 重新生成，不能降低完整性门槛。

自动筛选优先级：

```text
完整身体和武器 > 身份匹配 > 清晰外轮廓 > 风格美观 > 装饰细节
```

## 阶段三：源图抠图

最终背景不得依赖扩散模型输出。先尝试前景分割模型，但必须检查蒙版统计：

- 四角与边缘 Alpha 应接近 0；
- 角色中心 Alpha 应明显高于背景；
- 前景和背景中位数差不足 20 时，判定蒙版无效；
- 禁止对近似全灰蒙版直接做硬阈值。

前景分割模型异常时，回退到：

```text
边缘背景采样 + GrabCut + 连通区域清理 + 窄边缘抗锯齿
```

Alpha 规则：

- 背景尽量为 `0`；
- 角色内部尽量为 `255`；
- `1..254` 只允许集中在轮廓抗锯齿区域；
- 禁止在角色中心仅因颜色接近背景就删除浅色脸、白发、手套和衣纹；
- 细长武器组件面积阈值必须低于普通噪点清理阈值，避免武器断裂。

必须生成白底、黑底、洋红底和棋盘格质检预览。正式资源只能是真 RGBA PNG，不能导入预览图。

## 阶段四：身份参考图

将确认的 RGBA 源图确定性合成到纯白画布：

- 源图身份参考：`1536x1536` 方形白底，避免 CLIP Vision 中心裁切；
- img2img 参考：`512x768` 白底，角色等比缩放并保持脚底锚点；
- IP-Adapter 不能看到原始背景、地面、阴影、辉光和粒子。

白底必须通过 Alpha 合成产生，不得重新调用扩散模型生成。

## 阶段五：Q 版动作骨骼

不要直接复用普通人体比例骨骼。Q 版姿态必须满足：

- 大头；
- 短躯干；
- 短腿；
- 窄肩；
- 脸部区域有简化眼、鼻、嘴关键点；
- 所有骨骼画布固定为 `512x768`；
- 逻辑位移不得烘焙进 walk/run 图片。

核心骨骼数量：walk 8、attack 6、hit 4、skillRaise 8。

职业化骨骼需要根据武器调整：

- 长法杖：至少一只手围绕稳定的握持区域，杖尖始终保留画布安全边距；
- 刀剑：攻击手腕轨迹控制挥砍方向；
- 弓：双手分别控制弓身和拉弦，不使用法杖骨骼；
- 枪戟：双手握持点保持杆身方向一致；
- 徒手施法：禁止模型自行添加武器。

## 阶段六：单帧身份测试

在批量生成前，先生成角色的 `walk_00` 测试帧。默认使用：

```text
Checkpoint: Animagine XL 3.1
Source: 512x768 img2img identity reference
Denoise: 0.50
IP-Adapter weight: 0.45
IP-Adapter weight type: composition
IP-Adapter end: 0.65
OpenPose strength: 0.42
OpenPose end: 0.72
Steps: 20
CFG: 5.0
Sampler: DPM++ 2M SDE
Scheduler: Karras
```

测试帧必须与源图比较：

- 脸和眼睛颜色；
- 发型；
- 头饰；
- 服装主色和大块纹样；
- 武器类型、数量和完整性。

偏差处理顺序：

1. 骨骼比例不符：先修骨骼；
2. 身份漂移：降低 denoise；
3. 姿态不足：小幅提高 OpenPose，不先提高 denoise；
4. 武器变化：加强武器正负面词并降低 denoise；
5. 禁止仅靠提高 IP-Adapter 到极高权重解决身份问题，过高权重会压制动作。

## 阶段七：核心动作逐帧生成

测试帧通过后，逐帧生成核心动作。每次请求只生成一帧；不要让 ComfyUI 同时初始化多个 Animagine 队列，也不要让模型生成整张 sprite sheet。

同一角色固定：

- checkpoint；
- seed；
- 源图；
- 正向和负面身份描述；
- img2img denoise；
- IP-Adapter 参数。

逐帧只改变：

- OpenPose 图；
- 动作阶段描述；
- 输出 ID。

原始动作帧写入 staging，并生成 raw manifest，至少包含：

```json
{
  "character": "flame-priest",
  "action": "walk",
  "index": 0,
  "raw": "temp/assetgen/staging/comfyui-.../flame-priest_final_walk_00.png"
}
```

## 阶段八：逐帧抠图与归一

使用项目生成器：

```powershell
bun run content assetgen generate python-character-actions `
  --character <animation-id> `
  --reference <confirmed-rgba-source.png> `
  --rawManifest <raw-manifest.json>
```

该阶段负责：

- 动作帧抠图；
- 保护浅色脸、白发、手套和衣纹；
- 删除外圈背景；
- 连通区域清理；
- Alpha 抗锯齿；
- 归一到 `256x384`；
- 固定脚底中心锚点；
- 补齐派生动作；
- death 围绕画布中心旋转并逐步缩放，禁止裁切。

不要在角色中心全局执行“接近背景色即确定背景”。背景色强制删除只允许发生在外圈安全区域。

## 阶段九：质量门禁

每帧必须满足：

- PNG 签名正确；
- 模式为 RGBA；
- 尺寸为 `256x384`；
- Alpha 最小值为 0，最大值为 255；
- 四角 Alpha 为 0；
- 主体内部没有大面积半透明；
- 最大前景连通区域有效；
- 角色未触碰不允许触碰的画布边缘；
- 武器未断裂；
- `.png.meta` 存在且 UUID 唯一。

序列门禁：

- 脸、发型、头饰、服装和武器跨帧一致；
- 角色缩放不跳动；
- 脚底锚点稳定；
- walk/run 的逻辑位移未烘焙进帧；
- death 所有帧完整位于画布内；
- 白底、黑底、洋红底和棋盘格预览无明显黑边、白边、绿边或光晕。

若某个动作失败，仅重生成该动作或该帧，不要推翻已通过的整套源图身份。

## 阶段十：逐帧登记和接入

一个 generated-assets ID 只能对应一个文件。禁止使用一个 ID 连续登记整个72帧目录，否则最终只会保留最后一帧记录。

每帧使用独立 ID：

```text
<animation-id>_ai_idle_00
<animation-id>_ai_walk_00
<animation-id>_ai_attack_00
...
<animation-id>_ai_skill_raise_07
```

执行 `assetgen validate → ingest`，目标目录默认为：

```text
assets/animations/auto-battle
```

随后更新：

- `assets/game-content/auto-battle/heroes.json` 中的 `animationId`；
- `assets/game-content/auto-battle/unit-animations.json`；
- 对应示例镜像表；
- 配置契约测试。

最后必须执行：

```powershell
bun run content validate
bun run typecheck
bun run lint
bun run test:foundation
```

并额外验证产物数、登记数、Meta 数相等。

## 自动重试策略

| 问题 | 自动修复 |
| --- | --- |
| 源图身体或武器裁切 | 缩小角色占画布比例、扩大安全留白并换 seed |
| 角色颜色被绿幕污染 | 禁用 green screen，改用中性背景和后处理抠图 |
| 前景模型输出近似全灰蒙版 | 禁止阈值，回退 GrabCut |
| 浅色脸或白发被抠除 | 仅在外圈标记确定背景，中心改为可能前景 |
| 动作帧脸部变化 | 降低 denoise，检查 Q 版骨骼头身比 |
| 动作变化不足 | 小幅提高 OpenPose 或调整骨骼，不先提高 denoise |
| 法杖变剑或武器增加 | 强化武器正负面词，降低 denoise |
| death 出界 | 改用画布中心旋转并随角度缩放 |
| generated-assets 只剩最后一帧 | 将 staging 拆成单产物并逐帧唯一 ID 登记 |

## 完成报告

完成后向用户报告：

- 最终角色源图选择；
- 实际使用的正向和负面提示词；
- checkpoint、seed、denoise、IP-Adapter 和 OpenPose 参数；
- 动作及帧数；
- PNG、Meta 和 generated-assets 登记数量；
- 配置接入位置；
- 验证命令和结果；
- 提交哈希；
- 建议用户在 Cocos 中重点复查 attack、skillRaise 和 death 的播放节奏与脚底锚点。

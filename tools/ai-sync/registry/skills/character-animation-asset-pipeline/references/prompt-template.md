# 角色提示词模板

## 用户输入模板

复制下面模板并只填写方括号内容：

```text
生成角色 animationId=[英文资源ID]：
角色身份：[职业、种族、阵营或世界观身份]
性别与年龄感：[可爱少女、青年男性、无性别亡灵等]
脸与发型：[脸型、肤色、眼睛颜色、发色、发型]
头饰：[帽子、皇冠、头盔、无头饰]
服装：[服装类型、主色、辅色、重要装饰]
武器：[武器种类、颜色、材质、顶端造型、单手或双手]
整体风格：[Q版程度、可爱/威严/阴森等]
必须保留：[关键身份特征]
必须禁止：[粒子、光效、盾牌、第二把武器等]
用途：[友方/敌方、近战/远程/施法者]
```

最短输入示例：

```text
生成角色 animationId=frost-oracle：可爱的 Q 版冰霜先知，浅蓝皮肤、白色长发、紫色眼睛，深蓝和银白长袍，戴雪花银冠，双手持一根完整冰晶法杖，敌方远程施法者，不要粒子和地面阴影。
```

## 正向提示词组装顺序

不要把用户输入原样直接塞进模型。按下列顺序组装：

1. 质量标签；
2. 单角色和 Q 版比例；
3. 身份、脸、头发和头饰；
4. 服装和配色；
5. 武器类型、数量和完整性；
6. 全身完整度；
7. 构图和安全留白；
8. 2D 赛璐璐风格；
9. 中性背景职责；
10. 游戏资产用途。

```text
masterpiece, best quality, very aesthetic, polished anime game character,
solo, [角色身份英文描述], cute Q-version chibi character,
super deformed, three-head-tall proportions, big head, short torso, short legs,
[脸型与肤色], [眼睛], [发色与发型], [头饰],
[服装], [主色与辅色], clear large color blocks, readable silhouette,
holding exactly one [完整武器描述],
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

## 通用负面提示词

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
extra weapon, duplicated weapon,
different character, different face, different hairstyle,
different headwear, different outfit, different weapon,
blank face, faceless, masked face, face covered, missing eyes,
text, watermark, logo, border, frame
```

## 职业追加片段

### 持杖施法者

正向追加：

```text
holding exactly one complete tall staff, stable grip,
full staff shaft and staff tip entirely inside canvas
```

负面追加：

```text
sword, shield, handheld orb, broken staff, extra staff, floating staff
```

### 刀剑近战

正向追加：

```text
holding exactly one complete sword, visible handle, full blade and blade tip
```

负面追加：

```text
staff, wand, shield unless requested, broken blade, extra sword
```

### 枪戟长兵器

正向追加：

```text
holding exactly one complete polearm with both hands,
full pole, blade and tip entirely inside canvas
```

负面追加：

```text
short weapon, broken pole, detached blade, extra polearm
```

### 弓箭手

正向追加：

```text
holding one complete bow, one hand on bow grip, one hand near bow string,
full bow limbs entirely visible
```

负面追加：

```text
staff, sword, gun, broken bow, duplicated bow, floating arrow bundle
```

## 提示词审查清单

提交到 ComfyUI 前确认：

- 正向词中只有一个角色和一种武器；
- 正向词明确完整头饰、完整手脚和完整武器；
- 正向词包含安全留白；
- 负面词没有误伤角色真实肤色、服装颜色或武器；
- 非绿色角色没有使用 green screen；
- 用户禁止的粒子、光效和副武器均已进入负面词；
- 没有要求扩散模型承担最终透明背景。 

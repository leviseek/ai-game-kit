# 自动战斗样本视觉升级设计（开源像素素材接入）

> 状态：设计提案（素材调研 + 接入方案）
> 适用范围：`assets/samples/game_auto_battle` + `ui/demo/assets/AutoBattle/` + `ui/demo/assets/Common/`
> 素材归档：`arts/auto-battle-art/`（含许可证全文与加工产物）

## 1. 背景与目标

自动战斗样本当前视觉为**程序化纯色占位图**（`bg_battle.png` 1x1、`btn_common_up.png` 1x1 等，
组件按 XML 尺寸拉伸成纯色块）。目标：通过接入**许可宽松、可商用可再分发**的开源像素素材，
提升视觉完成度，覆盖四类：战斗背景、UI（按钮/面板/进度条）、动效（爆炸序列帧）、单位动画
（idle/attack/hit/death）。

### 已确认素材（全部可商用可再分发）

| 类别 | 素材                                             | 来源                                         | 许可      | 规模   | 用途                                   |
| ---- | ------------------------------------------------ | -------------------------------------------- | --------- | ------ | -------------------------------------- |
| 背景 | Battle Background - Hazy Hills (1280x832 x4)     | OpenGameArt `battle-background-hazy-hills-0` | CC-BY 3.0 | 23KB   | 战场/编队/挂机三页共用 `bg_battle.png` |
| UI   | Kenney Pixel UI Pack（750× 像素 UI）             | kenney.nl `pixel-ui-pack`                    | CC0       | 141KB  | 按钮三态/面板/槽位 9-slice 素材        |
| 动效 | Pixel Explosion (12 Frames) 96x96                | OpenGameArt `pixel-explosion-12-frames`      | CC-BY 3.0 | 10.6KB | 死亡/技能命中爆炸序列帧                |
| 单位 | Animated Warrior 320x320（male/female × 5 动画） | OpenGameArt `animated-warrior`               | CC-BY 3.0 | 16KB   | UnitSlot 单位形象（idle/attack/death） |

CC0 无署名要求；CC-BY 3.0 已在归档 README 记录署名（作者与来源），满足可再分发义务。

## 2. 已落地改动（主会话完成，零 XML 修改）

原则：**同名覆盖源 PNG，不触碰组件 XML 与 package.xml**——资源 id 不变、fileName 不变，
FGUI 编辑器重新发布后即生效（AGENTS：确定性操作一律用 fgui CLI；发布产物由编辑器生成）。

### 2.1 背景 `bg_battle.png`（AutoBattle 包）

- 处理：Hazy Hills x4（1280x832）裁剪为 1280x720（保留天空/山峦/草地，裁底部深色地面）
- 接入：覆盖 `ui/demo/assets/AutoBattle/img/bg_battle.png`
- 影响：AutoBattleView / LineupEditorView / IdleRewardsView 三处 `<image src="ab000">` 自动生效

### 2.2 UI 素材（Common 包按钮/进度条 + AutoBattle 面板/槽位）

- 按钮三态 `btn_common_{up,down,over}.png`：Kenney `Colored/blue`（up/over）与 `blue_pressed`（down）
  按 scale9 放大为 **240x112 成品**（1:1 匹配 CommonButton 组件 size，无需运行时缩放）
- 进度条 `progress_{track,fill,fill_hp}.png`：palette 锁定程序化渐变（无边框，FGUI 按 value
  横向缩放 fill 时观感自然；`fill_hp` 顶 `#ff5252`→底 `#d95f59`，均在 palette.json）
- 面板 `panel_lineup_bg.png`（850x560）：Kenney `space.png` 深色面板 scale9 放大
- 槽位 `formation_slot.png`（180x150）：Kenney `list.png` 白色边框 scale9 放大
- 校验：`bun run fgui validate --strict` AutoBattle/Common 均通过（与覆盖前基线一致）

### 2.3 素材归档

- `arts/auto-battle-art/source/`：原始下载文件 + 许可证全文（hazy_hills /
  kenney_pixel_ui / CC-BY 声明）
- `arts/auto-battle-art/processed/`：裁剪/scale9 放大产物与爆炸帧拆分
- `arts/auto-battle-art/README.md`：素材清单/许可/排除原因/署名记录

## 3. 已委派 fgui-designer 的接入（FGUI 组件修改，已完成）

以下改动已由 fgui-designer 完成（XML/package.xml/PNG 落位 + `validate --strict` 通过）：

### 3.1 爆炸动效（UnitHitFeedbackCom 增加 loader 序列帧，已完成）

- 素材：`arts/auto-battle-art/processed/explosion_frames/fx_explosion_00..11.png`（96x96 × 12 帧，已拆分）
- 组件：`AutoBattle/UnitHitFeedbackCom.xml` 增加 `loader_effect` loader 节点（96x96 居中，
  alpha=0 起始），运行时经 GLoader.setUrl 切帧；资源登记到 AutoBattle 包
  `img/fx_explosion_*.png`（`next-id` 续编，id `fx001..fx012`）
- 驱动：`EffectAnimator` 新增 `explosion` kind（经注入 timeSource 逐帧 setUrl，禁 transition），
  `unit-dead` 事件投影触发；节点名 `loader_effect` → 常量 `FX_EXPLOSION_NODE`
- 完成状态：TS 侧已接入（见 3.4），`validate --strict` 通过

### 3.2 单位形象动画（Common/UnitSlot 增加 loader，已完成）

- 素材：`arts/auto-battle-art/source/warrior_spritesheet_calciumtrice.png`
- **帧网格（fgui-designer 目视确认）：10x10，单帧 32x32**；行=动画
  （idle/gesture/walk/attack/death）、列=帧序（每动画 10 帧）、上/下各 5 行为两套变体
- 组件：`Common/UnitSlot.xml` 增加 `loader_unit` loader 节点（32x32 居中，血条之下）
- 驱动：`UnitAnimator` 新增（常驻 idle 循环 + attack/death 一次性，时间源注入 GameClock）；
  变体按单位阵营映射（己方 f / 敌方 m）；节点名 `loader_unit` → 常量 `UNIT_IMAGE_NODE`
- 资源：帧图已拆分登记到 Common 包 `img/warrior_{f|m}_{anim}_{00..09}.png`
  （`next-id --prefix w` 续编，id `w0000..w0099`，整表另存 `w0100`）
- 完成状态：TS 侧已接入（见 3.4），`validate --strict` 通过

### 3.3 按钮 scale9grid 登记（可选优化）

- 当前按钮为 240x112 成品，1:1 显示无缩放；若后续按钮实例尺寸变化，建议在 package.xml
  为 `btn_common_*.png` 登记 `scale9grid`（Kenney 边框 3px：`3,3,237,109`），
  避免非等比拉伸变形（`fgui sprite --scale9grid` 或 fgui-designer 编辑器设置）

### 3.4 TS 侧动画器接入（已完成）

- `view/animUrls.ts`：帧 URL 常量表（爆炸 12 帧 + warrior 变体/动画矩阵，`bundle://animations/auto-battle/<资源名>` 名字格式）
- `view/UnitAnimator.ts`：常驻单位形象动画器（idle 循环 / attack 播完回 idle / death 播完隐去，
  变体按阵营映射，时间源注入）
- `view/EffectAnimator.ts`：新增 `explosion` kind（定位 + 逐帧 setUrl + alpha 终态 0）
- `view/effects.ts`：投影新增 `explosion`（unit-dead）与 `unit-anim`（attack/skill/death）意图
- `view/UiNodes.ts` / `view/UnitNodeMapping.ts`：新增 `FX_EXPLOSION_NODE` / `UNIT_IMAGE_NODE` 常量与节点模式
- `view/presenter.ts`：装配 UnitAnimator，stepEffects 分发 unit-anim 意图，restart/dispose 清理
- `framework/contracts/IViewModelNode.ts` + `FairyGuiViewHandle.ts`：新增可选 `setUrl?`（loader 切帧），
  解析 `bundle://<bundle>/<path>` 前缀经 `GLoader.setUrlWithBundle` 从动画 bundle 加载
- `assembly.ts`：`AutoBattleViewNode` 增加 url 记录与 setUrl 写入
- 测试：`game-auto-battle-hit-feedback.test.ts` 新增爆炸投影/动画器用例；
  `game-auto-battle-unit-animator.test.ts` 新增单位动画器用例（idle/attack/death/回收/reset）

### 3.5 动画帧迁移到独立 Cocos bundle（已完成）

- **动机**：动画帧是运行时逐帧 `setUrl` 的动态资源，登记在 FGUI 包会膨胀 bin/atlas（用户手动发布
  时发现产物未含动画切图）。改为：FGUI 包内只留一帧占位（编辑器预览 + 发布占位），完整动画帧由
  独立 Cocos AssetBundle 承载。
- **动画 bundle**：`assets/animations/`（`isBundle: true`，bundle 名 `animations`），帧 PNG 位于
  `assets/animations/auto-battle/`（爆炸 12 帧 + warrior 100 帧，共 112 张，均含 Cocos image meta）；
  含 placeholder 哨兵（与 audio/game-content 模式一致，供 loadBundle 触发）。
- **FGUI 侧**（fgui-designer 委派 + 用户手改）：loader 组件**保持为 loader（不替换成 image）**，
  加 **`clearOnPublish="true"`** 属性（FGUI 编辑器 loader 属性面板"发布时清理"勾选）——发布时 FGUI
  清理 loader 引用的资源（动画帧不打包进 bin/atlas）；loader url 用 **`url="ui://<包id><资源id>"`**
  短 id 形式引用包内占位图（`UnitSlot.xml` loader_unit → `ui://cmn00001w0000`；
  `UnitHitFeedbackCom.xml` loader_effect → `ui://abpk0001fx001`）；package.xml 保留占位帧登记
  （`warrior_f_idle_00`/`warrior_spritesheet.png`/`fx_explosion_00`），其余动画帧已从包移除。
- **TS 侧**：`animUrls.ts` URL 改为 `bundle://animations/auto-battle/<资源名>`；适配层 `setUrl` 解析
  `bundle://` 前缀 → `GLoader.setUrlWithBundle(path, bundle)`（内部 `bundle.load(path + "/spriteFrame")`）。
- **bundle 预加载**：`GameLobbyHostImpl.ensureSharedUiDependencies` 在加载 Common 后预加载
  `BUNDLES.animations`（经 loadBundle 哨兵 placeholder）——GLoader 只认 `assetManager.bundles`
  已注册的 bundle，未预加载时 fallback 到 resources 报 "Bundle resources doesn't contain ..."；
  真实路径（openEntryPage）与冒烟路径（ensureSharedDependencies）统一覆盖。
- **发布待办**：FGUI 编辑器发布 AutoBattle/Common 时确认 loader 的"发布时清理"（clearOnPublish）
  勾选生效，动画帧不进 bin/atlas；编辑器内可预览占位帧（loader url 引用包内占位图）。

### 3.6 单位战斗布局重排（已完成）

- **动机**：血条/蓝条偏大、角色 32x32 过小。调整为竖版立绘式单位：角色约 120x240、血条/蓝条移到角色头顶。
- **UnitSlot.xml**（fgui-designer 委派）：组件尺寸 `140x110` → **`120x240`**；`loader_unit` 角色 loader
  放大为 `100x200` 居中（`fill="scale"` 等比缩放，`center-center` relation，保留
  `url="ui://cmn00001w0000" clearOnPublish="true"`）；`txt_name`（16px）/`bar_hp`（120x12）/
  `bar_energy`（120x8）/`txt_hp`（12px 覆盖血条）移至角色头顶区（顶部 36px），均加 `width-width`
  relation。
- **view.ts**（主会话）：战场网格紧凑行距适配 240 高单位——`GRID_TOP 100→20`、`GRID_ROW_STRIDE`
  保持紧凑（相邻行轻微重叠，角色居中缩放视觉可接受）；列距 140 适配 120 宽单位。
- **验证**：`bun run fgui gen-types` 重新生成（UnitSlot 改尺寸/节点后产物过期）；`validate --strict`
  Common 通过；`bun test` 全量 pass / 0 fail；typecheck/lint 通过。
- **需人工确认**：角色缩放观感（32x32 像素素材放大 100px 锯齿）、血条宽度、头顶区紧凑度。

## 4. 测试与验证

- 主会话零 XML 改动不破坏现有绑定：`bun run test:foundation` 全量 pass / 0 fail
- `bun run fgui validate --strict` AutoBattle + Common 通过（已跑，仅既有跨包引用 warnings）
- 发布产物（bin/atlas）由 FGUI 编辑器重新发布后提交（禁止手改 bin）
- 冒烟：`[auto-battle]` headless 冒烟经 boot 装配验证真实 fgui 路径（素材替换不改变节点名契约）
- TS 侧动画器接入后：`bun test` 全量 1532+ pass / 0 fail（新增爆炸投影/动画器 + 单位动画器用例），
  `bun run typecheck` / `bun run lint` 通过

## 5. 风险

- [背景非等比缩放] → 裁剪为 1280x720 精确匹配组件 size，1:1 显示无缩放
- [Kenney 按钮色彩与 palette 不一致] → palette 锁定约束仅约束 `fgui sprite` 生成图；
  外部素材颜色不受 palette.json 校验（AGENTS 第 11 条语义），风格以素材为准
- [单位动画帧切分不确定] → 精灵表帧网格已在 README 记录推断，fgui-designer 编辑器目视确认
- [编辑器发布缺失] → bin/atlas 与源不一致时冒烟可能加载旧图；发布列为人工待办
- [动画 bundle 未随主包加载] → 已在 `ensureSharedUiDependencies` 预加载 `BUNDLES.animations`
  （真实与冒烟路径统一覆盖）；GLoader 只认 `assetManager.bundles` 已注册 bundle，未预加载时
  fallback 到 resources 报 "Bundle resources doesn't contain ..."（此错误已修复）
- [占位帧与 bundle 帧重复] → FGUI 包内占位帧仅编辑器预览用，运行时被 TS setUrl 覆盖为 bundle 帧；
  两份首帧视觉一致（同源素材）

## 6. 落地方式

本设计作为素材升级的独立交付：主会话完成「调研 + 背景/UI 素材落地 + 归档」，动效/单位动画
拆分为 fgui-designer 委派任务（3.1/3.2），完成后发布并冒烟。回滚 = 恢复被覆盖的源 PNG
（原文件为 1x1/2x2 纯色占位，git 历史可恢复）。

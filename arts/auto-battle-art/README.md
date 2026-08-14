# 自动战斗样本 · 第三方美术素材归档

本目录归档 `assets/samples/game_auto_battle` 视觉升级引入的开源素材：
`source/` 为原始下载文件（含许可全文），`processed/` 为仓库内实际使用的加工产物。
加工规则与接入位置见本文件；许可证全文见各 `source/*_license.txt`。

> 位置约定：原始美术素材统一存放于仓库根目录 `arts/`（不进入 `assets/`，避免被 Cocos
> 资源系统扫描与 .meta 污染）；运行时实际引用的 PNG 位于 `ui/demo/assets/**/img/`，
> 由 FGUI 编辑器发布生成 bin/atlas。

## 素材清单与许可

### 1. 战斗背景（已接入）

- 素材：Battle Background - Hazy Hills（x4 版本，1280x832）
- 来源：OpenGameArt https://opengameart.org/content/battle-background-hazy-hills-0
- 作者：Luis Zuno（@ansimuz）
- 许可：CC-BY 3.0（http://creativecommons.org/licenses/by/3.0/），可商用可再分发，须署名
- 原始文件：`source/hazy_hills_license.txt`
- 加工：`processed/bg_battle.png` 裁剪为 1280x720（保留天空/山峦/草地，裁底部深色地面）
- 接入：同名覆盖 `ui/demo/assets/AutoBattle/img/bg_battle.png`（资源 id `ab000`，XML 无需改动），
  由 AutoBattleView / LineupEditorView / IdleRewardsView 三处背景共用
- 署名：背景图 by Luis Zuno（ansimuz），CC-BY 3.0

### 2. UI 像素包（按钮/面板/槽位，待 fgui-designer 接入）

- 素材：Kenney Pixel UI Pack（750× 像素 UI，9-slice 按钮/面板 48x48）
- 来源：https://kenney.nl/assets/pixel-ui-pack
- 作者：Kenney Vleugels（kenney.nl）
- 许可：CC0（http://creativecommons.org/publicdomain/zero/1.0/），无署名要求
- 许可全文：`source/kenney_pixel_ui_license.txt`
- 内容：`9-Slice/Colored/*.png` 彩色按钮三态、`9-Slice/Ancient/*.png` 复古面板、
  `9-Slice/space.png` 深色面板、`Spritesheet/UIpackSheet_*.png` 16x16 tile 图标
- 用到的源文件已归档：`source/kenney/`（Colored/blue、blue_pressed、space、list），
  目录结构对齐原始 9-Slice 包，供 `tools/scripts/scale9-kenney.ps1` 可复现加工
- 接入建议：按钮覆盖 `ui/demo/assets/Common/img/btn_common_{up,down,over}.png`
  （Kenney 48x48，需登记 scale9grid 后替换引用，属 FGUI 组件修改，委派 fgui-designer）；
  面板覆盖 `panel_lineup_bg.png` / `formation_slot.png` 同理
- 备注：因 scale9grid 登记与 XML 引用变更属组件修改，主会话不直接覆盖，
  待 `/fgui-edit` 委派执行（见 `docs/superpowers/specs/` 整合方案）

### 3. 命中/死亡动效（爆炸 12 帧，已接入）

- 素材：Pixel Explosion (12 Frames)，96x96/帧，横向 12 帧序列
- 来源：OpenGameArt https://opengameart.org/content/pixel-explosion-12-frames
- 作者：JROB774
- 许可：CC-BY 3.0（http://creativecommons.org/licenses/by/3.0/），须署名
- 原始文件：`source/explosion_12f_jrob774.png`（1152x96）
- 接入：拆分为 12 帧 PNG 登记到 AutoBattle 包 `img/fx_explosion_00..11.png`
  （资源 id `fx001..fx012`，`next-id` 续编）；`UnitHitFeedbackCom.xml` 增加
  `loader_effect` loader 节点（96x96 居中，初始 alpha=0），TS 动画器按注入
  timeSource 逐帧 `setUrl` 切帧播放，禁 transition
- 署名：爆炸动画 by JROB774，CC-BY 3.0

### 4. 单位战斗动画（warrior 精灵表，已接入）

- 素材：Animated Warrior（male/female，各含 idle/gesture/walk/attack/death）
- 来源：OpenGameArt https://opengameart.org/content/animated-warrior
- 作者：Calciumtrice（@Calciumtrice）
- 许可：CC-BY 3.0（http://creativecommons.org/licenses/by/3.0/），须署名
- 原始文件：`source/warrior_spritesheet_calciumtrice.png`（320x320）
- **帧网格（fgui-designer 目视确认）：10x10，单帧 32x32**；行=动画类型
  （idle/gesture/walk/attack/death），列=帧序（每动画 10 帧）；上 5 行/下 5 行
  为两套角色变体（当前按 f/m 命名，外观差异小，是否互换需人工确认）
- 接入：拆分为 100 帧 PNG 登记到 Common 包 `img/warrior_{f|m}_{anim}_{00..09}.png`
  （资源 id `w0000..w0099`，`next-id --prefix w` 续编；整表另存 `warrior_spritesheet.png`
  id `w0100`）；`Common/UnitSlot.xml` 增加 `loader_unit` loader 节点（32x32 居中，
  血条之下），TS 动画器按单位阵营/职业选帧并经 GameClock 逐帧 `setUrl`，禁 transition
- 署名：Animated Warrior by Calciumtrice，CC-BY 3.0

## 排除的候选素材与原因

- Kenney "Backgrounds: Pixel"：链接 404（页面不存在），未纳入
- OGA 其它背景（Mountain at Dusk / Forest 等）：Hazy Hills 提供 1280x832 的 x4 版本，
  与 1280x720 画布最匹配且构图（天空+山峦+草地）契合战场，故优先选中
- OGA 其它角色（Animated Wizard/Rogue/Slime）：同作者同风格，可后续按阵容扩展；
  当前 demo 阵容（坦克/法师/牧师 vs 骷髅/巫妖/萨满）先用 warrior 一套验证链路

## 使用约束

- 仓库内禁止提交未经确认授权的素材；CC0 / CC-BY 3.0 已满足可商用可再分发要求
- CC-BY 3.0 素材须保留本文件署名记录；CC0 素材不要求署名
- 加工图（processed/）不修改原始下载文件；原始文件保留在 source/ 便于追溯

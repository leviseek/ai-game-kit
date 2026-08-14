# AutoBattle “像素进化”三页美化设计

> 状态：已确认设计，待用户复核书面规格
> 风格：像素进化（Pixel Evolution）/ B 方案“霓虹档案”
> 范围：`LineupEditorView`、`AutoBattleView`、`IdleRewardsView`

## 1. 背景与目标

AutoBattle 当前包含编队、战斗和挂机收益三个 1280x720 页面。现有页面已具备完整业务节点和基础像素素材，但页面仍以大块背景、简单面板和零散控件为主，三个页面之间缺少统一的信息层级和明确的视觉焦点。

本次美化采用“像素进化”中的“霓虹档案”方向：保留现有像素素材和战斗内容，在其上增加阴影、高光、发光、材质和扫描层，把三个页面统一为一套深海军蓝战斗终端。允许重做页内布局和交互表达，但保留三个独立页面及既有业务流程。

目标如下：

- 三页形成统一、可辨识的“霓虹档案”视觉系统。
- 编队、战斗、挂机收益分别突出配置、观测、结算三个任务焦点。
- 保留现有导出组件名、运行时节点名和业务操作，不破坏 presenter、resolver 与事件绑定。
- 使用项目已有 FGUI 工作流完成设计、校验、截图和发布闭环。
- 在 1280x720 下无裁切、重叠、低对比文本或明显九宫格拉伸瑕疵。

## 2. 范围与边界

### 2.1 包含范围

- 重排 `ui/demo/assets/AutoBattle/LineupEditorView.xml` 的视觉层和操作区。
- 重排 `ui/demo/assets/AutoBattle/AutoBattleView.xml` 的 HUD、战场、日志和控制区。
- 重排 `ui/demo/assets/AutoBattle/IdleRewardsView.xml` 的结算数据与操作区。
- 复用已登记的 `pixel_*` 图片资源构建阴影、高光、发光、材质、扫描和装饰层。
- 必要时新增语义化视觉节点，并同步更新 FGUI 生成类型。
- 中等强度的进入、选中、按钮、领取和结果反馈。

### 2.2 不包含范围

- 不合并或删除编队、战斗、挂机收益页面。
- 不改变进入编队、开始战斗、查看收益、领取收益和返回编队的业务流程。
- 不修改战斗规则、编队规则、收益计算、持久化数据或游戏配置。
- 不删除或替换工作区内现有 `sakura_*` 资源；它们不参与本次皮肤。
- 不处理 `debug_null_probe.png` 等与本次视觉设计无关的工作区改动。
- 不直接编辑 `assets/ui/*/*.bin`、atlas 或其他 FGUI 发布产物。
- 不增加跨业务包引用，不引用 Basic/Builder 官方库资源。
- AutoBattle 继续只跨包引用 `Common`；每个被引用的 Common 组件/资源必须在 `Common/package.xml` 中登记为 `exported="true"`，当前 `CommonButton.xml`（`com00`）与 `CandidateItem.xml`（`com04`）均满足该条件。

## 3. 方案选择

采用“FGUI 源 XML 重做三页”方案：以既有业务节点契约为边界，直接在三个页面中建立完整的背景、装饰、面板、内容、操作和反馈层。

选择原因：

- 与只换图片相比，可以完整重建视觉层级和页内体验。
- 与运行时动态创建装饰相比，FGUI 编辑器预览更真实，页面结构更易维护。
- 可以直接复用工作区中已登记的 `pixel_*` 资源，避免引入额外运行时依赖。
- 视觉结构归属 FGUI，动态状态继续归属 TS，职责边界清晰。

## 4. 统一视觉系统

### 4.1 风格定位

“霓虹档案”是一套冷色战斗终端：以深海军蓝作为空间底色，以青色像素描边表达终端结构，以青白文字承载信息，以淡黄色标记当前操作和关键收益。像素轮廓保持硬边，现代质感来自分层光影，而不是模糊或大面积渐变。

情绪关键词：冷静、精密、可观测、战术化、轻未来感。

### 4.2 色彩

- 背景：`pixel_bg_navy` `#0B1830`
- 深面板：`pixel_panel_deep` `#102944`
- 主强调：`pixel_cyan` `#44DDEB`
- 高光：`pixel_cyan_light` `#A8F6FF`
- 主文字：`pixel_text` `#EAFBFF`
- 次文字：`pixel_text_muted` `#9FC8D6`
- 关键操作与数值：`pixel_yellow_light` `#FFF0A0`

现有 `ui/demo/palette.json` 已包含上述颜色。新增 sprite 时颜色必须保持在该允许集合内；确需新色时先更新 palette，再由 CLI 生成资源。

### 4.3 视觉层级

每页采用以下固定层级，具体节点数量按页面内容裁剪：

1. Background：现有 `bg_battle.png`。
2. Atmosphere：`pixel_bg_tint`、`pixel_bg_scanlines`、`pixel_vignette`。
3. Decorative：`pixel_block_cluster`、`pixel_chevron`、`pixel_chevron_right`、`pixel_star_mask`。
4. Panel：`pixel_panel_shadow`、`pixel_panel_material`、`pixel_panel_frame`、`pixel_inner_surface`。
5. Content：列表、槽位、单位、日志和收益数据等业务内容。
6. ActionDock：`pixel_action_dock`、按钮框和按钮发光层。
7. Feedback：选中、VS、战斗结果、领取结果和其他短时反馈。

装饰节点默认 `touchable="false"`，不得遮挡按钮、列表或运行时动态单位。内容层的文本和角色始终高于材质层，反馈层仅在必要状态出现。

### 4.4 资源复用

优先复用 AutoBattle 包中已经登记的以下资源：

- 背景：`pixel_bg_tint`、`pixel_bg_scanlines`、`pixel_vignette`、`pixel_top_hud_light`
- 面板：`pixel_panel_shadow`、`pixel_panel_material`、`pixel_panel_frame`、`pixel_inner_surface`
- 槽位：`pixel_slot_shadow`、`pixel_slot_surface`、`pixel_slot_highlight`、`pixel_slot_frame`、`pixel_slot_selected`、`pixel_slot_nameplate`
- 标题与分隔：`pixel_title_plate`、`pixel_section_divider`
- 操作：`pixel_action_dock`、`pixel_button_glow_mask`、`pixel_button_frame_mask`
- 装饰：`pixel_chevron`、`pixel_chevron_right`、`pixel_block_cluster`、`pixel_star_mask`、`pixel_double_arrow_mask`

使用前通过 `bun run fgui list-resources --package AutoBattle` 再次确认真实 id 和登记状态。不得在 XML 中臆造资源 id。

## 5. 页面设计

### 5.1 编队页：战术配置台

页面任务是完成布阵并进入战斗。布局采用左主右辅：

- 顶部 HUD 显示“自动战斗 / 战术配置”标题、3x3 阵型说明和当前上阵数量。
- 左侧主面板承载 3x3 槽位；槽位在空闲、已占用、当前选中三种状态下有明确差异。
- 右侧候选面板承载 `candidate_list`，列表标题、当前候选和方向标记形成独立终端区域。
- 底部操作 dock 放置“挂机收益”和“开始战斗”，主操作使用黄色或更强青色焦点，次操作保持低一级亮度。
- 槽位点击区域仍由现有透明 `CommonButton` 节点承担，视觉图片层不接管交互。

保留的关键业务节点包括 `slot_0` 至 `slot_8`、`slot_selected_0` 至 `slot_selected_8`、`txt_slot_0_name` 至 `txt_slot_8_name`、`candidate_list`、`btn_idle_rewards`、`btn_start`。

### 5.2 战斗页：实时观测台

页面任务是观察战斗、调整速度并在结束后重开：

- 顶部 HUD 显示当前回合，保持在任何战斗背景下都可读。
- 中央战场区域尽量完整保留给 `container_units` 和 `container_effects`，装饰不得侵入单位动态区域。
- 左下档案流面板承载 `txt_log`，降低文字亮度和面板存在感，避免与战场争夺焦点。
- 右下操作 dock 聚合 `btn_speed` 和 `btn_restart`，速度按钮持续显示当前倍率，重新开始在结果态提升为主要操作。
- `vs_left`、`vs_right`、`vs_badge` 与 `txt_result` 保持中央反馈层，获得独立的像素标题板或发光承托，但不改变既有动画驱动。

保留的关键业务节点包括 `container_units`、`container_effects`、`txt_round`、`txt_log`、`txt_result`、`btn_restart`、`btn_speed`、`vs_left`、`vs_right`、`vs_badge`。

### 5.3 挂机收益页：结算档案

页面任务是读取离线结果、领取收益并返回编队：

- 顶部 HUD 显示“自动战斗 / 挂机档案”。
- 中央结算面板将离线时长、可领收益、累计收益分为三个一致的数据行。
- 每行采用标签、数值和视觉分隔；标签使用次文字色，普通数值使用主文字色，可领收益使用淡黄色焦点。
- 底部操作 dock 聚合“领取”和“返回编队”；领取是主操作，返回是次操作。
- 不可领取时通过按钮弱化和数值状态表达，不依靠额外弹窗。

保留的关键业务节点包括 `txt_offline_label`、`txt_offline_minutes`、`txt_claimable_label`、`txt_claimable`、`txt_total_label`、`txt_total_rewards`、`btn_claim`、`btn_back`。

## 6. 交互与动效

### 6.1 强度

采用中等动态：界面持续存在轻量扫描与呼吸光，用户操作和重要状态变化有明确反馈，但不得妨碍文本读取或战斗观察。

### 6.2 动效职责

- FGUI XML 只定义静态视觉节点和初始状态，不手写 transition。
- 表现层动画通过 TS 驱动，并读取 framework 的 `GameClock` 注入 time source。
- 动画器只读取 `now()`，不自行乘 rate，不独立处理 jump 或 pause。
- 现有 VS 入场、单位攻击/受击/死亡和结果反馈继续复用现有动画链路。
- 新增扫描、呼吸、领取强调等动画时，复用 `effect-animator` / `vs-entrance` 的 timeSource 注入模式。

### 6.3 状态反馈

- 编队：槽位选择、候选选择、上阵上限和开始战斗可用态。
- 战斗：回合变化、速度倍率、VS 入场、战斗结果和重开可用态。
- 收益：可领数值强调、领取成功短时发光、不可领取弱化和返回反馈。

## 7. 组件与数据流

FGUI 页面仍由现有入口和 resolver 打开：

- `AUTO_BATTLE_LINEUP_ENTRY` -> `LineupEditorView`
- `AUTO_BATTLE_BATTLE_ENTRY` -> `AutoBattleView`
- `AUTO_BATTLE_IDLE_REWARDS_ENTRY` -> `IdleRewardsView`

页面业务节点继续由现有 view/presenter 读取和更新。新增装饰节点不进入业务数据流；只有需要 TS 驱动的扫描或反馈节点才加入生成类型和节点常量。新增节点常量必须先搜索 `assets/ui/generated/` 和 AutoBattle 模块内既有常量表，禁止在消费点裸写外部契约字符串。

`CommonButton`、`candidate_list`、`BattlefieldUnitsCom`、`UnitHitFeedbackCom` 等既有组件继续复用。若公共按钮本身不足以表达新的按钮状态，优先在 AutoBattle 页面中增加非触摸视觉承托层，不直接扩大 Common 包改造范围；只有三页都需要且页面层无法正确表达时，才单独评估 Common 组件变更。

## 8. 错误处理与约束

- 组件 XML 不得出现 `<graph>`。
- 单条 `<relation>` 的 `sidePair` 最多两项。
- 图片引用必须来自 `package.xml` 的真实资源 id，`fileName` 必须与登记路径一致。
- 不使用 FGUI transition；所有动态表现由 TS 驱动。
- 不新增 AutoBattle 指向其他业务包或 Basic/Builder 的跨包引用。
- Common 包依赖继续按现有宿主流程优先加载。
- 跨包组件引用在 FGUI 编辑器中依赖源包资源导出；新增跨包引用前必须先在 Common 包登记并导出资源，禁止把 AutoBattle 内部图片当作跨包共享资源。
- 不手改 FGUI 发布产物；源 XML/PNG 修改后由编辑器发布 AutoBattle 包。
- 工作区现有未提交资产不得被回滚、删除或覆盖；实现时仅修改本设计明确涉及的文件。

若新增节点无法被现有类型和 presenter 安全访问，应先通过 `bun run fgui gen-types` 更新生成类型，再做最小 TS 接入和对应测试，禁止使用 `as any` 或 `@ts-ignore` 绕过。

## 9. 实施流程

1. 通过 `bun run fgui list-resources --package AutoBattle` 确认现有 `pixel_*` 资源。
2. 以 `/fgui-edit` 流程委派 `fgui-designer` 修改三个既有组件，主会话不直接手写 XML。
3. 每完成一页即保存，并运行 `bun run fgui validate --strict`。
4. 如节点结构变化，运行 `bun run fgui gen-types` 并同步最小 TS 接入与测试。
5. 在 FGUI 编辑器刷新并打开三个页面，确认 XML 可读取且关系未导致编辑器异常。
6. 分别截取三页预览，由 `visual-verifier` 使用 `mode=fgui` 进行视觉检查。
7. 修复视觉问题后再次 validate、截图和视觉复核。
8. 运行 AutoBattle 相关测试、`bun run typecheck` 和 `bun run lint`。
9. 由 FGUI 编辑器发布 AutoBattle 包，并检查发布源一致性。

## 10. 验证与验收

### 10.1 自动验证

- `bun run fgui validate --strict`
- `bun run fgui gen-types`
- AutoBattle 相关 foundation 测试
- `bun run typecheck`
- `bun run lint`

若 `gen-types` 未产生差异，应确认生成产物已与 XML 同步，而不是省略该检查。

### 10.2 编辑器与视觉验证

- FGUI 编辑器可正常刷新并打开三个页面。
- `LineupEditorView` 的 3x3 槽位、候选列表和底部按钮无重叠。
- `AutoBattleView` 的动态单位、特效、日志、速度和结果反馈互不遮挡。
- `IdleRewardsView` 的三组数据在最大预期位数下仍完整可读。
- 九宫格资源边角无拉伸，像素边缘保持清晰。
- 扫描线、暗角和发光不降低文本对比度。
- 装饰节点不截获点击，不遮挡滚动列表或动态组件。
- 三页截图在色彩、标题、面板和操作 dock 上具有一致识别度。

### 10.3 完成标准

- 三页达到统一“霓虹档案”视觉，且各自主任务一眼可辨。
- 所有现有业务操作仍可用，运行时节点绑定无缺失。
- 无 graph、transition、非法 relation 或失效资源引用。
- 自动检查通过，三页视觉复核通过，发布一致性检查通过。

## 11. 风险与缓解

- 装饰层遮挡动态单位：战斗页先锁定 `container_units` / `container_effects` 安全区域，装饰只放外围 HUD 与底部控制区。
- 扫描线导致可读性下降：降低扫描层 alpha，并以截图检查青白文字和黄色关键数值的对比度。
- 公共按钮风格不统一：先用 AutoBattle 页面承托层统一外观，避免无必要扩大 Common 包影响面。
- 节点重排破坏绑定：保留既有业务节点名；新增节点使用语义化名称；生成类型和相关测试作为门禁。
- 未发布导致运行时仍显示旧页面：源修改完成后必须由 FGUI 编辑器发布，并运行发布一致性检查。
- 工作区存在并行资产改动：只复用 `pixel_*` 资产，不处理 `sakura_*` 与调试资源，不回滚用户已有工作。

## 12. 未来扩展

- 可将同一视觉系统扩展到 AutoBattle 的角色详情、战斗统计或关卡选择页面。
- 若多个业务包开始复用“霓虹档案”，再评估将稳定的面板、标题和操作 dock 抽取到 `Common_xxx`，本次不提前抽象。
- 可在不改变 FGUI 静态结构的前提下，通过统一 `GameClock` 动画器增加更精细的扫描、故障闪烁和状态切换。
- 可补充窄屏适配方案；本次验收基准固定为现有 1280x720 页面。

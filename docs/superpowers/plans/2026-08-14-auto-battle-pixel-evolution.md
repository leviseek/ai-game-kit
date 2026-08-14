# AutoBattle “像素进化”三页美化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏 AutoBattle 既有业务节点和页面入口的前提下，将编队、战斗、挂机收益三页重做为统一的“霓虹档案”像素进化界面。

**Architecture:** FGUI 源 XML 负责三页的静态视觉层、材质层、布局和交互承载；现有 presenter/VM 继续负责业务文本、列表、按钮和战斗动态。新增的扫描/呼吸表现使用一个引擎无关、注入 `ITimeSource` 的小型动画器，页面 presenter 只负责装配和生命周期，不把业务状态写入视觉层。

**Tech Stack:** FairyGUI XML、Cocos Creator 3.8.8、TypeScript strict、Bun、`tools/fgui` CLI、FGUI 编辑器、`fgui-mcp` 截图/发布检查。

## Global Constraints

- 组件 XML 不得出现 `<graph>`。
- FGUI 自建组件禁止手写 transition；所有动态表现由 TS 驱动。
- 单个 `<relation>` 的 `sidePair` 最多声明 2 项。
- 图片引用必须是 `package.xml` 已登记的真实资源 id，`fileName` 必须与登记路径一致。
- 跨资源包引用只允许指向 `Common` 或 `Common_xxx`，禁止引用业务包及 Basic/Builder；被引用的 Common 组件/资源必须在 Common `package.xml` 中使用 `exported="true"` 登记。
- 不修改 `assets/ui/*/*.bin`、atlas 或其他编辑器发布产物。
- 注释使用简体中文，标识符、API 名和资源契约字符串保持英文。
- 不引入第三方运行时依赖，不使用 `as any`、`@ts-ignore` 或 `@ts-expect-error` 绕过类型问题。
- 工作区已有未提交改动不可回滚、删除或覆盖；只复用已存在的 `pixel_*` 资源。
- 生成文件 `assets/ui/generated/ui-autobattle*.ts` 只能通过 `bun run fgui gen-types` 更新，禁止手改。
- 未经用户明确要求不执行 `git commit`、push、reset、checkout 或其他历史改写操作。

## 文件边界

### FGUI 源文件

- Modify: `ui/demo/assets/AutoBattle/LineupEditorView.xml`，编队页背景、HUD、面板、槽位、候选列表和操作 dock。
- Modify: `ui/demo/assets/AutoBattle/AutoBattleView.xml`，战斗页背景、观测 HUD、战场安全区、日志面板和控制 dock。
- Modify: `ui/demo/assets/AutoBattle/IdleRewardsView.xml`，收益页背景、结算面板、数据行和操作 dock。
- Verify only: `ui/demo/assets/AutoBattle/package.xml`，确认 `pixel_*` 资源登记和 fileName 映射，不重排无关资源。
- Verify only: `ui/demo/assets/Common/package.xml`，确认 AutoBattle 使用的 `com00`/`com04` 均为 `exported="true"`。

### TypeScript

- Create: `assets/samples/game_auto_battle/view/PixelHudAnimator.ts`，驱动扫描线/呼吸光的纯表现动画器。
- Modify: `assets/samples/game_auto_battle/view/LineupPresenter.ts`，装配编队页 HUD 动画并清理生命周期。
- Modify: `assets/samples/game_auto_battle/view/presenter.ts`，复用现有 `GameClock` 驱动战斗页 HUD 动画。
- Modify: `assets/samples/game_auto_battle/view/IdleRewardsPresenter.ts`，装配收益页 HUD 动画并清理生命周期。
- Modify: `assets/samples/game_auto_battle/view/UiNodes.ts`，仅在新增动态视觉节点需要运行时寻址时加入常量。
- Generated: `assets/ui/generated/ui-autobattle.ts`、`assets/ui/generated/ui-autobattle-types.ts`，由 CLI 生成，不手改。

### Tests and docs

- Create: `tests/framework/foundation/game-auto-battle-pixel-hud-animator.test.ts`，覆盖 HUD 动画时间推进、边界和 dispose。
- Modify only if node contract changes: `tests/framework/foundation/game-auto-battle-presenter.test.ts`、`game-auto-battle-lineup-presenter.test.ts`、相关收益 presenter 测试。
- Existing design: `docs/superpowers/specs/2026-08-14-auto-battle-pixel-evolution-design.md`，作为本计划的需求基线，不重复改写。

---

### Task 1: 确认像素资源与节点契约

**Files:**
- Verify: `ui/demo/assets/AutoBattle/package.xml`
- Verify: `assets/ui/generated/ui-autobattle-types.ts`
- Verify: `assets/samples/game_auto_battle/view/UiNodes.ts`
- Verify: `assets/samples/game_auto_battle/view/lineup.ts`
- Verify: `assets/samples/game_auto_battle/view/IdleRewards.ts`

**Interfaces:**
- Consumes: 现有 `pixel_*` 图片登记、三页现有节点名、现有绑定表和动态容器。
- Produces: 一份实施时使用的资源 id 映射和不得重命名的节点清单。

- [ ] **Step 1: 列出真实资源**

运行：

```powershell
bun run fgui list-resources --package AutoBattle
```

确认以下资源均存在且 `path=/img/`：`pixel_bg_tint.png`、`pixel_bg_scanlines.png`、`pixel_vignette.png`、`pixel_top_hud_light.png`、`pixel_panel_shadow.png`、`pixel_panel_material.png`、`pixel_panel_frame.png`、`pixel_inner_surface.png`、`pixel_slot_shadow.png`、`pixel_slot_surface.png`、`pixel_slot_highlight.png`、`pixel_slot_frame.png`、`pixel_slot_selected.png`、`pixel_slot_nameplate.png`、`pixel_title_plate.png`、`pixel_section_divider.png`、`pixel_action_dock.png`、`pixel_button_glow_mask.png`、`pixel_button_frame_mask.png`、`pixel_chevron.png`、`pixel_chevron_right.png`、`pixel_block_cluster.png`、`pixel_star_mask.png`、`pixel_double_arrow_mask.png`。

同时运行 `bun run fgui list-resources --package Common`，确认 `CommonButton.xml`（`com00`）和 `CandidateItem.xml`（`com04`）存在并显示 `export`。

- [ ] **Step 2: 固定业务节点契约**

不得重命名或删除：

- `LineupEditorView`：`slot_0..slot_8`、`slot_selected_0..slot_selected_8`、`txt_slot_0_name..txt_slot_8_name`、`candidate_list`、`btn_idle_rewards`、`btn_start`。
- `AutoBattleView`：`container_units`、`container_effects`、`txt_round`、`txt_log`、`txt_result`、`btn_restart`、`btn_speed`、`vs_left`、`vs_right`、`vs_badge`。
- `IdleRewardsView`：`txt_offline_minutes`、`txt_claimable`、`txt_total_rewards`、`btn_claim`、`btn_back`。

- [ ] **Step 3: 记录当前工作区状态**

运行 `git status --short`，确认实现时避开已有 `package.xml`、`palette.json` 和未提交 PNG 的并行改动；不得为本任务清理这些改动。

---

### Task 2: 委派 fgui-designer 重做三页源 XML

**Files:**
- Modify: `ui/demo/assets/AutoBattle/LineupEditorView.xml`
- Modify: `ui/demo/assets/AutoBattle/AutoBattleView.xml`
- Modify: `ui/demo/assets/AutoBattle/IdleRewardsView.xml`

**Interfaces:**
- Consumes: Task 1 资源 id 映射和节点契约；设计文档第 4、5、8 节。
- Produces: 三个可被 FGUI 编辑器读取的 1280x720 XML，含静态视觉层和可交互业务骨架。

实现必须通过 `fgui-designer`，主 agent 不直接手写已有组件 XML。使用 `/fgui-edit`，一次委派一页，完成一页后再进入下一页。

- [ ] **Step 1: 编辑 LineupEditorView**

按以下顺序组织 display list：`bg_lineup`、`bg_atmosphere_tint`、`bg_scanlines`、`bg_vignette`、顶部 HUD 材质层、左右主面板材质层、槽位视觉层、候选列表、透明槽位按钮、槽位选中层、文本、底部 action dock、两个操作按钮和非交互装饰。

保持 3x3 槽位点击区域与现有槽位坐标一致或在同一面板内等距重排；`slot_selected_*` 必须位于对应槽位视觉之上但低于名称文本；`candidate_list` 必须保持 `name="candidate_list"` 和列表类型；装饰图片设置 `touchable="false"`。

标题改成“自动战斗 · 战术配置”，候选区和阵型区使用清晰的青白色标题与次文字色。底部 dock 不遮挡列表滚动区域。

- [ ] **Step 2: 编辑 AutoBattleView**

按以下顺序组织 display list：背景与 atmosphere 层、顶部回合 HUD、战场外围装饰、`container_units`、`container_effects`、左下日志面板与 `txt_log`、右下控制 dock、`btn_speed`、`btn_restart`、中央 VS/结果反馈层。

保证 `container_units` 和 `container_effects` 覆盖完整动态安全区，装饰不得压住动态单位。`txt_result`、`vs_left`、`vs_right`、`vs_badge` 初始可见性和 alpha 必须兼容现有 presenter 的入场/结果动画。

- [ ] **Step 3: 编辑 IdleRewardsView**

按以下顺序组织 display list：背景与 atmosphere 层、顶部 HUD、中央结算面板四层材质、三组数据行和 `pixel_section_divider`、底部 action dock、`btn_claim`、`btn_back`、非交互装饰。

标题改成“自动战斗 · 挂机档案”；`txt_claimable` 使用 `pixel_yellow_light`，其他数值使用 `pixel_text`，标签使用 `pixel_text_muted`。在最大合理数值长度下保留左右内边距，不让文本溢出面板。

- [ ] **Step 4: 复核 XML 静态约束**

三页均检查：没有 `<graph>` 或 `<transition>`；所有新 `<image>` 的 `src` 来自 Task 1；所有 `fileName` 与 `package.xml` 一致；每条 relation 不超过两个 `sidePair`；装饰节点不可交互；既有业务节点名未变。

---

### Task 3: 生成类型并确保业务绑定不回归

**Files:**
- Generated: `assets/ui/generated/ui-autobattle.ts`
- Generated: `assets/ui/generated/ui-autobattle-types.ts`
- Verify/Modify only when required: `assets/samples/game_auto_battle/view/UiNodes.ts`
- Verify: `assets/samples/game_auto_battle/view/LineupPresenter.ts`
- Verify: `assets/samples/game_auto_battle/view/IdleRewardsPresenter.ts`
- Verify: `assets/samples/game_auto_battle/view/presenter.ts`

**Interfaces:**
- Consumes: Task 2 三页 XML。
- Produces: 与 XML 同步的生成类型；现有业务节点仍能由 presenter 按名称访问。

- [ ] **Step 1: 生成类型**

运行：

```powershell
bun run fgui gen-types
```

不得直接编辑生成文件。检查新节点是否因有 id 被生成；静态节点若未被业务访问，不需要加入 `UiNodes.ts`。

- [ ] **Step 2: 检查现有绑定名**

运行：

```powershell
bun test ./tests/framework/foundation/game-auto-battle-lineup-presenter.test.ts
bun test ./tests/framework/foundation/game-auto-battle-presenter.test.ts
bun test ./tests/framework/foundation/game-auto-battle-idle-rewards.test.ts
```

若测试因 XML 结构导致缺少既有节点失败，修复源 XML 的节点名或类型；不得通过放宽测试、改成可选节点或吞掉绑定错误绕过。

- [ ] **Step 3: 仅在需要时补充节点常量**

只有当扫描线或 glow 节点需要 TS 动画时，才在 `UiNodes.ts` 增加语义化常量，例如 `PIXEL_SCANLINES_NODE`、`PIXEL_HUD_GLOW_NODE`，并在 presenter 中引用常量；静态装饰不进入运行时契约。

---

### Task 4: 添加可注入时间源的 HUD 动画器

**Files:**
- Create: `assets/samples/game_auto_battle/view/PixelHudAnimator.ts`
- Create: `tests/framework/foundation/game-auto-battle-pixel-hud-animator.test.ts`
- Modify: `assets/samples/game_auto_battle/view/LineupPresenter.ts`
- Modify: `assets/samples/game_auto_battle/view/presenter.ts`
- Modify: `assets/samples/game_auto_battle/view/IdleRewardsPresenter.ts`

**Interfaces:**
- Consumes: `ITimeSource`, `IViewModelNode`, `GameClock`，以及 Task 3 生成的动态节点名。
- Produces: `createPixelHudAnimator(options)`，返回 `{ step(): void; dispose(): void }`；`step` 只读取注入时钟并更新扫描/呼吸节点 alpha。

- [ ] **Step 1: 写失败测试**

测试应使用可控 fake time source 和 recording nodes，锁定以下行为：

```typescript
test("scanline alpha follows injected time and stays bounded", () => {
    let now = 0;
    const scanline = recordingNode();
    const animator = createPixelHudAnimator({
        timeSource: { now: () => now },
        node: (name) => name === "bg_scanlines" ? scanline : undefined,
        scanlineNode: "bg_scanlines",
    });

    animator.step();
    now = 900;
    animator.step();

    expect(scanline.alpha).toBeGreaterThanOrEqual(0);
    expect(scanline.alpha).toBeLessThanOrEqual(1);
    animator.dispose();
});
```

另测：缺失节点不抛错；dispose 后 step 不再写入；时间跳跃直接取当前相位，不补播历史帧。

- [ ] **Step 2: 运行测试确认失败**

运行：

```powershell
bun test ./tests/framework/foundation/game-auto-battle-pixel-hud-animator.test.ts
```

预期：因 `PixelHudAnimator.ts` 和工厂函数尚不存在而失败。

- [ ] **Step 3: 实现最小动画器**

实现约束：

- `timeSource.now()` 是唯一时间输入；不得在动画器内部乘 `GameClock` rate。
- alpha 使用有界正弦或三角相位，结果 clamp 到 `[0, 1]`。
- 默认扫描节点 alpha 保持在低强度范围，不能覆盖文本对比度。
- 节点缺失时静默跳过，符合 `IViewModelNode` 可选 setter 语义。
- `dispose` 只改变内部 disposed 状态，不清空业务节点或改变 VM。

- [ ] **Step 4: 接入三个 presenter**

战斗页复用已有 `GameClock`，在现有 timer 每次推进时钟后调用 `hudAnimator.step()`。编队页和收益页各自创建轻量 `GameClock`，在已有刷新 timer 中按 elapsed 推进后调用 `step()`；不得新增第二个独立时间来源。三个 presenter 的 `dispose` 必须先停止 timer，再 dispose 动画器。

- [ ] **Step 5: 运行动画与 presenter 测试**

运行：

```powershell
bun test ./tests/framework/foundation/game-auto-battle-pixel-hud-animator.test.ts ./tests/framework/foundation/game-auto-battle-lineup-presenter.test.ts ./tests/framework/foundation/game-auto-battle-presenter.test.ts
```

预期：新增动画器测试和既有 presenter 测试全部通过。

---

### Task 5: 严格校验 FGUI 源和生成产物

**Files:**
- Verify: `ui/demo/assets/AutoBattle/package.xml`
- Verify: `ui/demo/assets/AutoBattle/LineupEditorView.xml`
- Verify: `ui/demo/assets/AutoBattle/AutoBattleView.xml`
- Verify: `ui/demo/assets/AutoBattle/IdleRewardsView.xml`
- Verify: `assets/ui/generated/ui-autobattle.ts`
- Verify: `assets/ui/generated/ui-autobattle-types.ts`

**Interfaces:**
- Consumes: Task 2 XML、Task 3 生成文件、Task 4 运行时接入。
- Produces: 通过严格语义校验且源/类型一致的 AutoBattle UI。

- [ ] **Step 1: 列资源并做严格校验**

运行：

```powershell
bun run fgui list-resources --package AutoBattle
bun run fgui validate --strict --package AutoBattle
```

预期：无 error；重点检查资源 id、fileName、组件骨架、controller/gear、relation、image fill、transition 和跨包引用。

- [ ] **Step 2: 检查源 XML 禁令**

运行：

```powershell
rg -n "<graph|<transition|sidePair=|pkg=|fileName=|src=" ui/demo/assets/AutoBattle/*.xml
```

逐项确认没有 graph/transition，单条 relation 没有第三个约束，跨包仅为 Common，所有图片资源登记存在；AutoBattle XML 的跨包 `pkg="cmn00001"` 资源只使用 Common 中 `exported="true"` 的 `com00`/`com04`。

- [ ] **Step 3: 确认生成文件新鲜**

运行：

```powershell
bun run fgui gen-types
git diff --exit-code -- assets/ui/generated/ui-autobattle.ts assets/ui/generated/ui-autobattle-types.ts
```

若有 diff，说明 XML 与生成产物未同步；保存生成结果后重新执行类型检查。

---

### Task 6: 编辑器刷新、截图和视觉回归

**Files:**
- Verify in editor: `AutoBattle/LineupEditorView`
- Verify in editor: `AutoBattle/AutoBattleView`
- Verify in editor: `AutoBattle/IdleRewardsView`
- Capture output: temporary preview PNG paths returned by `fgui-mcp_fgui_capture_preview`

**Interfaces:**
- Consumes: Task 5 通过校验的源 XML 和生成产物。
- Produces: 三页可复查截图和 visual-verifier 视觉检查结论。

- [ ] **Step 1: 刷新并打开页面**

在 FGUI 编辑器中刷新 AutoBattle 包，依次打开三个组件。若编辑器报 XML、relation 或资源读取错误，回到对应源 XML 修复后重跑 Task 5，不在编辑器内留下无法落盘的临时修补。

- [ ] **Step 2: 截取三页预览**

使用 `fgui-mcp_fgui_capture_preview` 分别采集三个页面，记录返回 PNG 路径。截图必须覆盖完整 1280x720 画布。

- [ ] **Step 3: 委派 visual-verifier 检查**

委派 `visual-verifier`，传入三张截图和设计文档，要求使用 `mode=fgui` 检查：三页统一性、文本对比度、槽位/列表/按钮布局、战场动态安全区、收益最大位数、九宫格边角、装饰遮挡和像素清晰度。

- [ ] **Step 4: 修复视觉问题并复验**

只修改源 XML 或源 PNG，不直接修改 bin/atlas。每次视觉修复后重复 `validate --strict`、编辑器刷新和截图；直到 verifier 无阻断项。

---

### Task 7: 自动测试、类型检查、lint 和发布一致性

**Files:**
- Verify: all files changed by Tasks 2-4
- Verify in editor: AutoBattle package publish output

**Interfaces:**
- Consumes: Task 6 视觉复核通过的源和截图。
- Produces: 自动检查通过、编辑器发布完成、发布源一致性有证据的交付状态。

- [ ] **Step 1: 运行 AutoBattle 相关测试**

运行：

```powershell
bun test ./tests/framework/foundation/game-auto-battle-pixel-hud-animator.test.ts
bun test ./tests/framework/foundation/game-auto-battle-lineup-presenter.test.ts
bun test ./tests/framework/foundation/game-auto-battle-presenter.test.ts
bun test ./tests/framework/foundation/game-auto-battle-idle-rewards.test.ts
```

- [ ] **Step 2: 运行类型检查和 lint**

运行：

```powershell
bun run typecheck
bun run lint
```

失败时定位当前变更引入的问题，不删除测试、不放宽类型、不吞异常。

- [ ] **Step 3: 运行 foundation 回归**

运行：

```powershell
bun run test:foundation
```

确认 AutoBattle 页面改造没有影响共享 presenter、FGUI adapter、GameClock 或动态单位动画契约。

- [ ] **Step 4: 在 FGUI 编辑器发布 AutoBattle**

由用户在 FGUI 编辑器执行 AutoBattle 包发布。发布前确认编辑器已保存三个页面；不得手改发布产物。

- [ ] **Step 5: 检查发布一致性**

发布完成后调用 `fgui-mcp_fgui_check_publish`，指定 `packages: ["AutoBattle"]`。必须同时取得编辑器发布信号、产物 mtime 新鲜度和 `validate --strict` 三重证据；任一缺失均视为未完成。

- [ ] **Step 6: 交付前审查工作区**

运行：

```powershell
git status --short
```

确认只包含本任务源 XML、相关 TypeScript、测试、生成文件和设计/计划文档；不包含手改 bin/atlas、真实凭据或无关格式化改动。

## Spec Coverage Self-Review

- 视觉系统：Task 2 明确背景、扫描、材质、面板、槽位、标题、操作 dock 和三页布局。
- 页面边界：Task 2 保留三个页面及既有业务节点，未引入页面合并。
- 运行时职责：Task 4 明确 `ITimeSource` 注入、GameClock 复用、dispose 和不改 VM 业务。
- FGUI 约束：Global Constraints、Task 2 和 Task 5 覆盖 graph、transition、relation、资源 id、fileName、跨包引用和生成文件。
- 测试：Task 4 覆盖新增动画器，Task 3/7 覆盖既有 presenter、foundation、typecheck 和 lint。
- 视觉验收：Task 6 覆盖编辑器刷新、三页截图、FGUI 专项视觉检查和复验。
- 发布闭环：Task 7 覆盖用户编辑器发布与三重发布一致性证据。
- 风险与扩展：设计文档的风险和未来扩展作为实施约束；本计划不扩大 Common 包或业务规则范围。

## ADR Check

完成实施前检查本次工作是否引入新的架构决策。若只是按已确认设计在现有 FGUI/`GameClock` 模式内接入，无需新增 ADR；若将霓虹视觉层抽取为跨业务包公共组件、改变运行时动画架构或改变资源包加载边界，必须先创建 `doc/decisions/ADR-NNN-<slug>.md`，再标记实施完成。

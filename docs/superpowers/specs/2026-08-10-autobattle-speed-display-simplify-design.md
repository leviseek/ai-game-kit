# AutoBattleView 速度挡位显示简化 设计

日期：2026-08-10
状态：Approved（用户已确认设计）

## 背景与目标

`AutoBattleView` 观战页的速度挡位显示存在两个问题：

1. **`txt_speed` 状态文本不更新**：点击 `btn_speed` 后挡位确实切换（`AutoBattleClock.timeScale` 随之变化），但页面上的 `txt_speed` 文本一直停留在 `x1`。绑定声明本身正确（`view.ts:162-166` 有 `txt_speed` 的 text 绑定），且 `txt_round`/`txt_log` 均能实时更新，说明通用绑定机制正常；txt_speed 独有不更新最可能是运行时该节点绑定未真正生效（节点解析失败或装配差异），静态层面无法 100% 锁定根因。
2. **`btn_speed` 按钮标题不更新**：`btn_speed` 目前只有 command 绑定（点击触发 `cycleSpeed`），没有 text 绑定，标题永远停在初始 `x1`。这是确定的问题。

用户希望简化：`txt_speed` 与按钮标题是重复信息，只保留一处即可——**在 `btn_speed` 按钮标题上实时显示当前挡位 `x1`/`x2`/`x3`**，删除 `txt_speed` 文本节点。

## 现状与根因

- `ui/demo/assets/AutoBattle/AutoBattleView.xml`：根下直接子节点含 `txt_speed`（id=ab_txt_speed，text 类型，初始 `x1`）与 `btn_speed`（id=ab_btn_speed，`CommonButton` 组件，标题初始 `x1`）。
- `assets/samples/game_auto_battle/view/view.ts`：
  - `txt_speed` text 绑定（view.ts:162-166）。
  - `btn_speed` command 绑定（view.ts:168），无 text 绑定。
- 绑定机制：`wrapFairyGuiObject.setText` → `child.text = value`；fgui 的 `GButton` 有 `set text → set title`（fairygui.mjs:13006-13011），因此对按钮节点加 text 绑定即可更新标题。

根因结论：txt_speed 绑定未生效的根因不阻塞本改动——本次直接删除该节点，从根源消除问题；同时用验证过的 text 绑定机制（`GButton.text` → 标题）解决按钮标题不更新的确定问题。

## 关键决策（已确认）

### D1 删除 `txt_speed`，挡位只在按钮标题显示

- 删除 `AutoBattleView.xml` 中的 `txt_speed` 节点。
- `btn_speed` 上移到原 `txt_speed` 位置（y 448），保持原区域紧凑。
- `btn_speed` 标题初始值保持 `x1`，运行时由绑定覆盖。

### D2 给 `btn_speed` 增加 text 绑定

- `view.ts` 的 `createAutoBattleBindings`：
  - 移除 `txt_speed` 的 text 绑定。
  - 新增 `{ kind: "text", node: "btn_speed", get: (vm) => \`x${vm.speed}\` }`。
- 与现有 command 绑定共存（不同 index，无冲突；命令去重按节点名，不重复注册 onClick）。

## 具体改动清单

### 视图层（纯 TS）

- `assets/samples/game_auto_battle/view/view.ts`：`createAutoBattleBindings` 删除 `txt_speed` text 绑定，新增 `btn_speed` text 绑定。

### FGUI（委派 fgui-designer）

- `ui/demo/assets/AutoBattle/AutoBattleView.xml`：删除 `txt_speed` 节点；`btn_speed` 上移到 y 448。
- `bun run fgui validate --strict` 通过。
- 发布产物由 FGUI 编辑器生成（bin 更新，不手改）。

### 测试同步更新

- `tests/framework/foundation/game-auto-battle-presenter.test.ts`：`txt_speed` 断言 → `btn_speed`（96, 113-120 行）。
- `tests/framework/foundation/game-auto-battle-speed-control.test.ts`：`txt_speed` 断言 → `btn_speed`（88-102 行）。
- `assets/samples/game_auto_battle/smoke.ts`：`txt_speed` 断言 → `btn_speed`（211 行）。
- `tests/framework/foundation/game-auto-battle-view.test.ts`：静态绑定断言补充/调整按钮文本。

## 边界与约束

- 不改变挡位循环语义（1x→2x→3x→1x）、`AutoBattleClock.timeScale` 驱动、`AutoBattleSpeed` 类型与 VM `speed` 字段。
- 不引入新依赖、不改公共接口；改动局限在 AutoBattleView 呈现层与组件。
- FGUI 组件修改委派 fgui-designer，不主会话手写 XML；发布产物由编辑器生成。
- 修改逻辑时同步更新中文注释。

## 验证方式

- `bun run typecheck`（strict 全量）。
- `bun test ./tests/framework/foundation`：既有不回归 + 更新后的 `btn_speed` 标题断言。
- `bun run fgui validate --strict`（AutoBattle 包）。
- 冒烟/运行时：点击 `btn_speed` 后按钮标题随挡位实时显示 `x2`/`x3`。

## 风险与回退

- **绑定未生效根因未 100% 锁定**：本改动删除 txt_speed，绕开该问题；按钮标题走同一已验证 text 绑定机制（`GButton.text` → title），并有测试断言兜底。若运行时按钮标题仍不更新，可回退到保留 txt_speed 方案并深挖节点解析路径。
- **发布产物陈旧**：改动源 XML 后必须重新发布 AutoBattle 包，否则运行时加载旧 bin（无按钮标题更新/仍含 txt_speed）。

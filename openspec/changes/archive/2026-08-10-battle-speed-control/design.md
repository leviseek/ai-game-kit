## Context

`game_auto_battle` 的战场驱动链路：presenter（`view/presenter.ts`）以固定 100ms interval 驱动——每个 interval `clock.advance(now - lastTick)` 推进模拟时间，随后 `battle.tick()` 推进一个行动，再 `render()` 按状态快照刷新页面。`AutoBattleClock`（`logic/clock.ts`）是最小可控模拟时钟，只有 `now()`/`advance()`，无倍率语义。`view/view.ts` 的绑定声明当前只有重开命令 `btn_restart` 与单位/轮次/日志/结果节点。约束：战斗逻辑层保持引擎无关与确定性，挡位只改驱动节拍不改 tick 内容；FGUI 源改动必须委派 fgui-designer 产出并 `bun run fgui validate --strict` 通过；产品是纯观战加速，不引入暂停等额外能力。

## Goals / Non-Goals

**Goals:**

- 提供 1x/2x/3x 挡位循环切换，改变 presenter 驱动节拍（模拟时间推进倍率 + 每 interval 行动 tick 次数），观战节奏可调。
- 挡位只改驱动节拍：tick 内容（行动/结算/事件生成）不变，同一对局不同挡位事件序列（除 `time` 字段外）与终局结果一致，确定性由测试锁定。
- 挡位状态与切换命令经 ViewModel 绑定到 FGUI 页面（`txt_speed` 状态文本 + `btn_speed` 循环按钮）。

**Non-Goals:**

- 不改战斗逻辑、tick 内容、结算规则、事件类型与数据模型（`logic/battle.ts` / `skills.ts` / `formation.ts` / `config.ts` / `models.ts` 零改动，仅新增挡位类型）。
- 不做暂停/倍率渐变/自定义速率（roadmap 只要求 1x/2x/3x）。
- 不引入框架 `SimulationClock` 替换 `AutoBattleClock`（框架根入口不导出它，夹具层自实现最小可控时钟是既有约定；本 change 仅在其上增加倍率语义）。

## Decisions

**决策 1：挡位倍率落在 `AutoBattleClock` 上，presenter 按挡位换算驱动节拍**

- `AutoBattleClock` 增加 `timeScale` 语义：`setTimeScale(rate)` 校验有限正数，`advance(ms)` 按当前倍率推进 `ms * timeScale` 的模拟时间（对齐框架 `SimulationClock` 的既有语义）。事件 `time` 字段随挡位变化是预期行为（加速时模拟时间流逝更快），故确定性断言以"除 `time` 外的事件序列一致"为准。
- presenter 持有一个内部挡位状态（`AutoBattleSpeed`），每个 interval：`clock.advance(delta * rate)` 推进模拟时间，再按挡位 `rate` 次循环调用 `battle.tick()`（1x→1 次、2x→2 次、3x→3 次），最后 `render()`。挡位切换命令 `cycleSpeed` 更新挡位状态并调用 `clock.setTimeScale`，随后立即 render 刷新挡位文本。
- 备选：presenter 直接按挡位缩短 interval 间隔（如 2x 时 50ms）——**否决**：受浏览器/运行时最小间隔抖动影响，确定性不如"同一 interval 内放大 tick 次数 + 模拟时间"直观，且 tick 次数与模拟时间同步推进更贴近"驱动节拍"语义。

**决策 2：挡位命令用"循环切换 + 状态文本"而非三个独立按钮**

- 采用单个 `btn_speed` 按钮（复用 `CommonButton`，标题可显示挡位）+ `txt_speed` 状态文本（显示 `x1`/`x2`/`x3`）。点击 `cycleSpeed`：1x→2x→3x→1x。减少 FGUI 节点与绑定声明，观战页右下/日志区放置不干扰布局。
- 备选：三个独立挡位按钮——**否决**：节点多、绑定多，MVP 观战加速无需多选；循环按钮 + 状态文本足够清晰。

**决策 3：挡位状态由 presenter 持有，VM 只做派生**

- `AutoBattleViewModel` 增加只读 `speed` 字段（当前挡位），`AutoBattleCommands` 增加 `cycleSpeed()`；presenter 作为命令注入方，在创建 bindings 时注入 `cycleSpeed`，持有挡位状态，切换后调 `clock.setTimeScale` 并重渲染。fixture（`assembly.ts`）同理暴露 `speed` 状态与 `cycleSpeed` 供测试驱动。
- 这样逻辑层（battle/clock 之外）不新增业务状态：挡位是**呈现/驱动层**状态，只存在于 presenter 与 clock 的 timeScale。

## Risks / Trade-offs

- [挡位误改 tick 内容导致确定性漂移] → 确定性测试锁定：同一配置以 1x/2x/3x（不同 timeScale 时钟 + 相同 tick 序列）驱动到终局，断言除 `time` 外的事件序列与终局结果一致；`logic/` 零改动范围写进 tasks。
- [3x 每 interval 3 tick 使单帧渲染跳过中间状态] → 可接受：渲染永远基于 tick 后的状态快照，事件日志保序完整（冒烟断言事件数一致）；后续表现层（change 07/08）按事件增量播放，不依赖逐 tick 渲染。
- [FGUI 改动违反工作流产生无效产物] → `AutoBattleView.xml` 改动委派 fgui-designer 产出，`bun run fgui validate --strict` 通过后才发布；发布走编辑器路径并 `fgui check-publish` 核对。
- [冒烟/既有测试假设单 tick 驱动] → 冒烟与既有测试仍以单 tick 驱动（1x 语义），挡位相关断言只在新增用例中触发 `cycleSpeed` 并继续驱动，不破坏既有断言。

## Migration Plan

1. `logic/clock.ts` 增加 `timeScale`/`setTimeScale`（含校验），`advance` 按倍率推进；更新 `AutoBattleClock` 接口注释。既有调用（`advance` 无倍率场景，timeScale=1）行为不变。
2. `view/view.ts` 增加 `AutoBattleSpeed` 类型（或复用 models）、VM `speed` 字段、commands `cycleSpeed`、绑定 `txt_speed` + `btn_speed`。
3. `view/presenter.ts` 持挡位状态，interval 内按挡位推进 `advance` 量并循环 `tick`；命令 `cycleSpeed` 更新挡位与 `clock.setTimeScale`。
4. `assembly.ts` 暴露 `speed`/`cycleSpeed`（测试驱动），命令注入 `cycleSpeed`；`smoke.ts` 增加挡位切换 + 状态显示断言 + 切换后终局一致性断言。
5. 委派 fgui-designer：`AutoBattleView.xml` 增加 `txt_speed` 与 `btn_speed` 节点 → `bun run fgui validate --strict` → 编辑器发布 + `fgui check-publish`。
6. 新增测试：挡位循环切换、`timeScale` 推进、确定性（三挡事件序列除 time 外一致、终局一致）；跑全量 `bun test` 与 `?smoke=auto-battle` 冒烟回归。
7. 回滚策略：删除挡位节点/绑定与 `timeScale` 扩展即可还原，逻辑层零改动无数据迁移。

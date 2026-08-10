## Why

`game_auto_battle` 战场页当前只有固定播放速度：presenter 以固定 100ms 节拍每 tick 推进一个行动，观战者无法加快节奏，长对局等待感明显。自动战斗玩法进化的 change-03（Stage 0）目标是在**不触碰战斗逻辑与 tick 内容**的前提下，提供 1x / 2x / 3x 挡位切换，改变 presenter 的驱动节拍，让观战节奏可调且**同一对局在任何挡位下事件序列与终局结果完全一致**（确定性不因加速而漂移）。

## What Changes

- **挡位类型与时钟倍率**：新增 `AutoBattleSpeed = 1 | 2 | 3` 挡位类型；`AutoBattleClock` 增加 `timeScale` 倍率语义（`setTimeScale` / `timeScale` getter，`advance(ms)` 按当前倍率推进模拟时间），对齐框架 `SimulationClock` 语义但不直接复用（框架根入口不导出 `SimulationClock`，夹具层自实现最小可控时钟的既有约定不变）。
- **节拍驱动**：presenter 按当前挡位换算驱动节拍——每个 interval 内推进的模拟时间（`advance` 量）与行动数（`tick` 次数）按挡位倍率放大；挡位**只改驱动节拍，不改 tick 内容**（每 tick 仍是一个行动，行动序列/结算不变）。
- **挡位 UI**：`AutoBattleView.xml` 增加挡位按钮与状态文本（委派 fgui-designer 产出 + `bun run fgui validate --strict` 通过）：单个 `btn_speed` 循环切换 1x→2x→3x→1x + `txt_speed` 显示当前挡位；不引入新组件类型，复用 `CommonButton`。
- **VM/绑定**：`AutoBattleViewModel` 增加 `speed` 字段；`AutoBattleCommands` 增加挡位切换命令（`cycleSpeed`）；绑定声明增加 `txt_speed` 文本与 `btn_speed` 命令绑定，既有节点绑定不变。
- **夹具/冒烟**：`assembly.ts` 暴露挡位状态与切换能力（`speed` + `cycleSpeed`，联动 `clock.setTimeScale`）；`smoke.ts` 冒烟增加挡位切换与显示断言，并确认切换挡位后终局结果不变。
- **确定性测试**：新增测试——同一战斗配置以 1x/2x/3x 挡位（不同 `timeScale` 时钟 + 相同 tick 序列）驱动到终局，断言事件序列（除 `time` 字段外）与终局结果完全一致。

## Capabilities

### New Capabilities

- `auto-battle-speed-control`: 加速挡位切换语义——`game_auto_battle` 战场页 SHALL 提供 1x/2x/3x 挡位切换，挡位只改变驱动节拍（模拟时间推进倍率与 tick 频率），不改变战斗逻辑、tick 内容、事件序列（除 `time` 字段外）与终局结果；挡位状态与切换命令经 ViewModel 绑定到页面呈现。

### Modified Capabilities

- `auto-battle-playable`: 扩展"战场 ViewModel 绑定"要求——战场页绑定除既有节点外，还须映射当前加速挡位文本与挡位切换按钮命令（新增场景）；挡位切换不得改变战斗推进的事件序列与终局结果（新增场景）。

## Impact

- **FGUI 源**：`ui/demo/assets/AutoBattle/AutoBattleView.xml`（新增 `btn_speed` / `txt_speed` 节点）；改动须委派 fgui-designer 产出 + `bun run fgui validate --strict` 通过。
- **逻辑层**：`logic/clock.ts`（`AutoBattleClock` 增加 `timeScale` 倍率语义与校验）。`logic/battle.ts`、`logic/skills.ts`、`logic/formation.ts`、`logic/config.ts` 零改动（tick 内容与结算不变）。
- **呈现层**：`view/presenter.ts`（挡位驱动换算）、`view/view.ts`（VM 字段 + 命令 + 绑定）。
- **装配/冒烟**：`assembly.ts`（挡位状态与命令接线）、`smoke.ts`（冒烟挡位断言）。
- **测试**：`tests/framework/foundation/game-auto-battle-*.test.ts`（新增挡位切换与确定性断言）。
- **发布产物**：`assets/ui/AutoBattle/*`（`.bin`/atlas 由 FGUI 编辑器发布生成，不手改，发布后 `fgui check-publish` 核对）。
- **不触碰**：`models/models.ts` 单位/技能/战斗状态模型（仅新增挡位类型）、数值模型、战斗事件类型。
- **风险**：挡位若误改 tick 内容或结算会导致确定性漂移，由"不同挡位事件序列一致"测试锁定；FGUI 改动若违反工作流产生无效产物，须走 fgui-designer + `validate --strict` 通道。

## Why

五类 `game_*` 品类夹具目录目前平铺，UI 呈现层完成度不一致（tycoon 有 VM 派生、idle/fight 连 VM 类型都没有）。MVP 将新增 `view/` 下的 VM 派生与绑定声明，平铺结构会让品类内文件数与职责混杂失控（.ai 每文件 ≤300 行约束）。先做目录分级重构，为后续品类复用"类型/逻辑/呈现"分层提供统一形态。

## What Changes

- 将五类 `assets/game_*`（card/rpg/idle/tycoon/fight）统一为子目录形态：
  - `assembly.ts` 留根（组合根）
  - `models/`：类型（业务模型 + action + route + ViewModel 类型）
  - `logic/`：能力实现（battle/config/clock/input/resource/save/scene/state 等）
  - `view/`：UI 呈现（VM 派生 + 绑定声明）与 route 登记
- 同步更新依赖这些文件路径的引用：`assets/game/fixture/registry.ts` 五处 import、五类夹具测试（`tests/framework/foundation/game-*-fixture.test.ts`）。
- 纯重构：无行为变化，无新能力。

## Capabilities

### New Capabilities

无——本 change 是纯目录重构，行为不变化。

### Modified Capabilities

无——不修改任何 spec 行为。

## Impact

- 受影响的目录：`assets/game_card`、`assets/game_rpg`、`assets/game_idle`、`assets/game_tycoon`、`assets/game_fight`。
- 受影响的文件：`assets/game/fixture/registry.ts`（五处 import 路径）、`tests/framework/foundation/game-*-fixture.test.ts`（五处 assembly.ts 路径断言与动态 import）。
- public-boundary 按顶层 `game_*` 前缀识别游戏层文件且递归收集，子目录不影响边界检查；但新增文件的导入须遵守"只经 `../framework` 根入口"红线。
- 无新增依赖；`framework/core` + `contracts` 零改动。

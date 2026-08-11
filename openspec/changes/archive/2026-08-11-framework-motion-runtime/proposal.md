## Why

品类动画（`effect-animator` / `vs-entrance`）当前用 presenter 的 `Date.now()` 散落驱动，无法支持全局 pause / resume / 加速减速 / 时间跳跃。framework 已有 SimulationClock（模拟钟，pause/rate/advance）与 WallClock（墙钟），但缺少**表现层时间控制点**。用户需求：全局时间控制（暂停/倍速/时间跳跃），且动画（含装饰动画）统一跟随倍速、菜单与战斗分层暂停。

本 change 在 framework 新增 `GameClock`（表现时间控制点）：统一动画 timeSource 注入物，支持全局 rate、分层 pause（menu/combat 域）、jumpTo；动画器零感知（只读 `now(domain)`）。这为后续全局时间控制铺路，且不改变逻辑层确定性（模拟钟保持纯净）。

## What Changes

- **framework core/time 新增 `GameClock`**（纯 TS，实现 `TimeSource`）：
  - `now(domain)`：当且仅当该域被暂停时冻结；`rate` 全局（含在 now 计算）。
  - `pause(domain)` / `resume(domain)`：`PauseDomain` 枚举（`menu` / `combat`，支持层级 menu ⊃ combat）；**menu 暂停不冻结 combat**。
  - `advance(ms)`：由引擎 update dt 或外部节拍驱动。
  - `jumpTo(t)`：显式时间跳跃（动画 seek 终态）。
  - 应用级 pause（切后台）= 冻结全部域（最顶层）。
- **framework contracts 新增 `MotionTween` 契约**：`timeSource: TimeSource` 必填（禁默认 Date.now），动画器只读 `now(domain)` 插值、不自行乘 rate/判跳变；可选 `timeScale` 覆盖。
- **动画接入**：`effect-animator` / `vs-entrance` 的 timeSource 改注入 GameClock（动画器零感知，仅换注入源）。
- **presenter 挡位收敛**：`GameClock.rate = 挡位倍率` + 用 GameClock delta 驱动 `clock.advance`，替代"每 interval 推多次"。
- **不引入引擎动画桥**：framework 无 GTween/Transition/GMovieClip 封装轨（装饰/行为动画均 TS 驱动）。
- **ADR**：创建 ADR-029（global time control & animation time source，含 C-01~C-20 约束）。
- **约束补充**：AGENTS/.ai 说明"动画优先用 framework 动画 API 与 GameClock，游戏层禁直接 import cc 做 tween"。

## Capabilities

### New Capabilities

- `framework-game-clock`: 表现层时间控制点——`GameClock` 支持全局 rate、分层 pause（menu/combat 域）、jumpTo、advance；作为动画/表现层唯一 timeSource 注入物；动画器零感知。

### Modified Capabilities

- `platform-time-scheduling`: 时间域语义扩展——表现时间域（GameClock）与模拟钟（SimulationClock）/墙钟（WallClock）并列；应用级 pause（切后台）冻结全部域；分层 pause 只冻结目标域。

## Impact

- `assets/framework/core/time/`：新增 `GameClock.ts`（含 `PauseDomain` 枚举）；`assets/framework/contracts/time/` 新增 `MotionTween.ts` 契约。
- `assets/framework/index.ts`：根入口导出 GameClock/PauseDomain/MotionTween；`tests/framework/foundation/public-boundary.test.ts` 白名单同步。
- `assets/samples/game_auto_battle/view/`：effect-animator / vs-entrance 注入 GameClock（动画器零感知）；presenter 挡位用 GameClock.rate。
- 测试：`tests/framework/foundation/game-clock.test.ts`（新，GameClock rate/pause 分层/jumpTo/advance 行为）；既有动画器测试换注入源后回归。
- ADR-029 创建；AGENTS/.ai 动画约束补充。
- 不涉及 FGUI 资源；不改变逻辑层确定性（模拟钟保持纯净）。

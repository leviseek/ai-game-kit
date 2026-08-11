# framework-game-clock Specification

## Purpose

为 Framework 提供表现层时间控制点 `GameClock`：统一动画/表现层的 timeSource 注入物，支持全局倍率（rate）、分层暂停（menu/combat 域）、时间跳跃（jumpTo）与受控推进（advance）；动画器零感知（只读 `now(domain)` 插值，不自行乘 rate 或判跳变），为全局 pause / resume / 加速减速 / 时间跳跃提供单一控制点，且不改变逻辑层确定性。

## Requirements

### Requirement: GameClock 表现时间控制

`GameClock` SHALL 实现 `TimeSource` 契约，提供表现时间 `now(domain)`：当且仅当该域被暂停时冻结；`rate` 为全局倍率（有限正数），含在 now 计算中；支持 `advance(ms)` 受控推进与 `jumpTo(t)` 显式时间跳跃。倍率非法（0/负数/非有限）SHALL 拒绝。

#### Scenario: now 随 rate 缩放推进

- **WHEN** GameClock 以 rate=2 推进 100ms
- **THEN** `now()` 返回值增加 200ms（rate 缩放）

#### Scenario: 暂停域冻结该域 now

- **WHEN** 某域被暂停后调用 `advance`
- **THEN** 该域的 `now(domain)` 不推进，其它未暂停域继续推进

#### Scenario: 非法倍率被拒绝

- **WHEN** 设置 rate 为 0、负数或非有限值
- **THEN** GameClock 拒绝该倍率（抛错或忽略，保持现有 SimulationClock 语义）

#### Scenario: jumpTo 显式跳跃

- **WHEN** 调用 `jumpTo(t)`
- **THEN** `now()` 返回 t，动画消费者按"seek 终态"语义处理（不补播中间帧）

### Requirement: 分层暂停域

`GameClock` SHALL 提供 `PauseDomain` 枚举（至少 `menu` / `combat`），`pause(domain)` / `resume(domain)` 按域独立冻结/恢复；域支持层级（menu ⊃ combat）；**menu 域暂停不冻结 combat 域**（悬浮菜单时战斗表现继续）；应用级暂停（生命周期/切后台）冻结全部域。

#### Scenario: menu 暂停不冻结 combat

- **WHEN** `pause(menu)` 后推进
- **THEN** `now(combat)` 继续推进，`now(menu)` 冻结

#### Scenario: combat 暂停冻结战斗表现

- **WHEN** `pause(combat)` 后推进
- **THEN** `now(combat)` 冻结（行为与装饰动画一并冻结）

#### Scenario: 应用级暂停冻结全部域

- **WHEN** 应用级暂停（如切后台）
- **THEN** 全部域的 `now(domain)` 冻结

### Requirement: 动画器零感知

`GameClock` 作为动画/表现层唯一 timeSource 注入物：动画器（effect-animator / vs-entrance / MotionTween）SHALL 只读 `now(domain)` 做插值，不自行乘 rate、不自行判跳变阈值；`MotionTween` 契约 `timeSource` 必填（禁止默认内置 Date.now()）。

#### Scenario: 动画器只消费注入 now

- **WHEN** 动画器经注入的 GameClock 驱动
- **THEN** 动画器只读 `now(domain)`，倍速/暂停/跳跃语义全部由 GameClock 承担

#### Scenario: timeSource 必填

- **WHEN** 创建动画器（MotionTween / effect-animator 等）
- **THEN** timeSource 必须显式注入，不得内置 Date.now() 默认值（测试注入可控源）

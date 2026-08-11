## ADDED Requirements

### Requirement: 表现时间域（GameClock）

Framework SHALL 提供表现时间域 `GameClock`（实现 `TimeSource`），与 simulation clock / wall clock 并列：表现时间服务动画插值与表现层节拍，支持全局倍率、分层暂停（`PauseDomain`：menu/combat）、受控推进与显式跳跃；`GameClock` 是动画/表现层唯一 timeSource 注入物，动画器只读 `now(domain)` 不自行乘 rate 或判跳变。逻辑层（tick/事件/战斗判定）SHALL 只读 simulation clock，禁止读表现时间或系统时间。

#### Scenario: 动画消费 GameClock 表现时间

- **WHEN** 动画器注入 GameClock 并读取 `now(domain)`
- **THEN** 动画器按表现时间插值，倍速/暂停/跳跃语义由 GameClock 承担，动画器零感知

#### Scenario: 逻辑层只读 simulation clock

- **WHEN** 战斗逻辑推进（tick/事件/判定）
- **THEN** 只读取 simulation clock，表现时间/墙钟变化不改变逻辑行为与事件序列（确定性保持）

#### Scenario: 应用级暂停冻结全部时间域

- **WHEN** 应用级暂停（如切后台）
- **THEN** simulation clock、GameClock 各域均冻结，恢复后只继续因自身暂停的部分

## Purpose

固化挡位加速下的事件时间戳一致性：模拟时钟倍率恰应用一次，事件时间戳与行动 tick 进度线性一致，不随挡位按 speed² 膨胀。

## ADDED Requirements

### Requirement: 挡位下事件时间戳与行动进度一致

`game_auto_battle` 战场页驱动 SHALL 以原始墙钟增量推进模拟时钟（倍率由模拟时钟内部恰应用一次），不得把已含表现时钟（GameClock）倍率的增量再次传入模拟时钟；事件时间戳 SHALL 等于模拟时钟读数，与每 interval 的 tick 数量（按挡位线性）保持一致，不得按 speed² 膨胀。

#### Scenario: 2x 挡位下推进量与 tick 数一致

- **WHEN** 战场以 2x 挡位驱动，单次墙钟增量 500ms
- **THEN** 模拟时钟推进 1000ms（500 × 2，恰一次倍率），该 interval 内 tick 次数为挡位倍数，事件时间戳不超过模拟时钟读数

#### Scenario: 三挡位时间戳增长率与 tick 数成正比

- **WHEN** 同一战斗分别以 1x/2x/3x 挡位按相同墙钟节拍驱动
- **THEN** 事件序列（除 `time` 字段外）与终局结果一致，且单位 tick 消耗的模拟时间在各挡位下相同

### Requirement: 呈现器驱动可注入

`createAutoBattlePresenter` SHALL 提供可选 `now`/`drive` 注入接缝（缺省 `Date.now` + 100ms `setInterval`），供测试确定性推进阶段与战斗节拍；缺省路径生产行为不变。

#### Scenario: 注入驱动确定性推进

- **WHEN** 测试注入自增墙钟与手动驱动回调
- **THEN** 阶段切换与模拟时钟推进可按固定墙钟增量确定性驱动，无需等待真实定时器

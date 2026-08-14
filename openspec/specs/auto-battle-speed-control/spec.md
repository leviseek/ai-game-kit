# auto-battle-speed-control Specification

## Purpose

定义 `game_auto_battle` 战场页加速挡位切换语义：提供 1x/2x/3x 挡位，只改变驱动节拍而不改变战斗逻辑与事件序列，并保证确定性不被加速破坏。

## Requirements

### Requirement: 加速挡位切换

`game_auto_battle` 战场页 SHALL 提供 1x / 2x / 3x 三个加速挡位；挡位只改变驱动节拍（模拟时间推进倍率与每 interval 推进的行动 tick 次数），不改变战斗逻辑、tick 内容、事件序列（除 `time` 字段外）与终局结果。

#### Scenario: 挡位循环切换

- **WHEN** 玩家触发挡位切换命令
- **THEN** 当前挡位按 1x → 2x → 3x → 1x 循环推进，页面状态文本同步显示当前挡位

#### Scenario: 挡位不改变战斗结果

- **WHEN** 同一战斗配置分别以 1x / 2x / 3x 挡位驱动到终局
- **THEN** 三种挡位下的事件序列除 `time` 字段外完全一致，终局结果（胜利/战败）与终局轮次一致

### Requirement: 挡位经 ViewModel 呈现

`game_auto_battle` 战场页 SHALL 经 ViewModel 绑定声明把当前加速挡位映射到页面节点：挡位状态文本节点显示当前挡位（如 `x1` / `x2` / `x3`），挡位按钮节点绑定挡位切换命令。

#### Scenario: 挡位状态反映到页面

- **WHEN** 战场页初始化渲染且当前挡位为 1x
- **THEN** 挡位状态文本节点显示初始挡位，点击挡位按钮触发挡位切换命令

#### Scenario: 切换后状态刷新

- **WHEN** 玩家点击挡位按钮切换挡位
- **THEN** 挡位状态文本节点更新为新挡位，战斗推进继续按新挡位节拍驱动

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

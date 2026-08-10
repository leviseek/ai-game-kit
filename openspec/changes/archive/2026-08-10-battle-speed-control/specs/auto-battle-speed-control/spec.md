## Purpose

定义 `game_auto_battle` 战场页加速挡位切换语义：提供 1x/2x/3x 挡位，只改变驱动节拍而不改变战斗逻辑与事件序列，并保证确定性不被加速破坏。

## ADDED Requirements

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

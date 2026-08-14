# card-playable-battle Specification

## Purpose

让 game_card 品类具备真实可玩的对战闭环：玩家点击手牌出牌、敌方阶段自动攻击、胜负终局判定，并经 ViewModel 绑定到真实 FairyGUI 战场页呈现。

## Requirements

### Requirement: 敌方自动攻击

game_card 敌方阶段 SHALL 每间隔配置时长（enemyAttackIntervalMs）对玩家造成配置伤害（enemyDamage）；跳帧时按已过时长一次性结算多次攻击（惰性同步）。

#### Scenario: 敌方按间隔攻击

- **WHEN** 玩家结束回合进入敌方阶段且时钟推进超过一个攻击间隔
- **THEN** 玩家 HP 减少配置的 enemyDamage

#### Scenario: 跳帧一次性结算

- **WHEN** 时钟一次推进跨越多个攻击间隔
- **THEN** 玩家 HP 一次性扣除对应次数的伤害

#### Scenario: 玩家 HP 不为负

- **WHEN** 累计伤害超过玩家当前 HP
- **THEN** 玩家 HP 最低为 0

### Requirement: 胜负终局判定

game_card SHALL 在敌方 HP ≤ 0 时判定胜利、玩家 HP ≤ 0 时判定战败；终局后战斗进入 over 阶段，出牌与结束回合被拒绝。

#### Scenario: 胜利终局

- **WHEN** 出牌使敌方 HP 降到 0
- **THEN** 战斗进入 over 阶段且结果标记为胜利（win）

#### Scenario: 战败终局

- **WHEN** 敌方攻击使玩家 HP 降到 0
- **THEN** 战斗进入 over 阶段且结果标记为战败（lose）

#### Scenario: 终局后拒绝操作

- **WHEN** 战斗已进入 over 阶段后尝试出牌或结束回合
- **THEN** 操作被拒绝且战斗状态不变

### Requirement: 战场 ViewModel 绑定

game_card 战场页 SHALL 经 ViewModel 绑定声明把战斗状态映射到 FairyGUI 页面节点：敌我 HP 文本与进度条、mana 文本、手牌按钮点击命令、结束回合按钮命令、胜负提示显隐、重开按钮命令。

#### Scenario: 战斗状态反映到页面

- **WHEN** 战斗状态变化（HP/mana/回合/胜负）
- **THEN** 对应页面节点经绑定自动更新

#### Scenario: 点击手牌驱动出牌

- **WHEN** 玩家点击手牌按钮
- **THEN** 调用 playCard 对应下标并刷新页面

#### Scenario: 点击结束回合

- **WHEN** 玩家点击结束回合按钮
- **THEN** 调用 endTurn 进入敌方阶段

#### Scenario: 胜负提示与重开

- **WHEN** 战斗终局
- **THEN** 胜负提示显示；点击重开按钮重置对局到初始状态

### Requirement: Cocos 冒烟驱动

Cocos 运行环境 SHALL 提供 `?smoke=card-battle` 冒烟入口，装配渲染器与 BattleView 并驱动完整对局，console 输出 `[card-battle]` 标记，验证真实页面可用。

#### Scenario: 冒烟完整对局

- **WHEN** 以 `?smoke=card-battle` 启动 Cocos 预览
- **THEN** 装配成功、输出 `[card-battle]` 标记、页面可打开并驱动出牌到终局

### Requirement: 呈现器时间源可注入

`createCardBattlePresenter` SHALL 提供可选 `now`（墙钟读数，缺省 `Date.now`）与 `drive`（驱动循环，缺省 100ms `setInterval`）注入接缝；呈现层墙钟读数 SHALL 经注入的 `now` 取得，SHALL NOT 在实现内直接调用 `Date.now`；模拟时钟 SHALL 以原始墙钟增量推进（1x，无倍率叠加），墙钟回拨的负增量 SHALL 收敛为 0（时间单调）；`drive` 返回释放句柄，dispose 时清理。

#### Scenario: 注入驱动确定性推进

- **WHEN** 测试注入自增墙钟与手动驱动回调，并推进固定墙钟增量
- **THEN** 模拟时钟按该增量精确推进（如 250ms → +250），无需等待真实定时器

#### Scenario: 墙钟回拨不倒退

- **WHEN** 注入墙钟读数回拨
- **THEN** 模拟时钟不倒退（负增量收敛为 0），时间保持单调

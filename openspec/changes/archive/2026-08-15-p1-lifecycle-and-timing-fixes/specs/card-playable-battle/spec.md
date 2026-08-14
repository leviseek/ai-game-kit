## Purpose

card 战场呈现器的时间源注入：弃用 `Date.now()` 直接驱动，改为可注入 `now`/`drive` 接缝（缺省行为不变），以原始墙钟增量（负值收敛 0）推进模拟时钟，对齐 ADR-029 时间域纪律并使呈现推进可确定性测试。

## ADDED Requirements

### Requirement: 呈现器时间源可注入

`createCardBattlePresenter` SHALL 提供可选 `now`（墙钟读数，缺省 `Date.now`）与 `drive`（驱动循环，缺省 100ms `setInterval`）注入接缝；呈现层墙钟读数 SHALL 经注入的 `now` 取得，SHALL NOT 在实现内直接调用 `Date.now`；模拟时钟 SHALL 以原始墙钟增量推进（1x，无倍率叠加），墙钟回拨的负增量 SHALL 收敛为 0（时间单调）；`drive` 返回释放句柄，dispose 时清理。

#### Scenario: 注入驱动确定性推进

- **WHEN** 测试注入自增墙钟与手动驱动回调，并推进固定墙钟增量
- **THEN** 模拟时钟按该增量精确推进（如 250ms → +250），无需等待真实定时器

#### Scenario: 墙钟回拨不倒退

- **WHEN** 注入墙钟读数回拨
- **THEN** 模拟时钟不倒退（负增量收敛为 0），时间保持单调

## Purpose

`IApplicationContext.state` 真实反映 Application 生命周期状态：由 Application 在状态转移时反向同步（Symbol 写入器，模块不可见），取代恒为 `created` 的失真实现，同时保持"只读、无 Service Locator"的窄契约不变。

## ADDED Requirements

### Requirement: ApplicationContext.state 反映真实应用生命周期

`IApplicationContext.state` SHALL 随 Application 生命周期转移真实更新（created → initializing → running ↔ paused → stopping → disposed），不再恒为 `created`；状态更新 SHALL 由 Application 在每次状态转移时经内部（Symbol 键）写入器同步，模块侧 SHALL 只读且不可见写入器；未携带写入器的外部 context 实现（测试 mock）SHALL 为 no-op，不破坏既有行为。

#### Scenario: 应用启动后 context 反映 running

- **WHEN** 组合根创建 context 并注入 Application，Application.start 成功完成
- **THEN** `context.state` 为 `running`（与 `Application.state` 一致）

#### Scenario: 暂停/恢复/释放同步

- **WHEN** 应用依次执行 pause、resume、dispose
- **THEN** `context.state` 依次为 `paused`、`running`、`disposed`

#### Scenario: 模块侧只读且无修改器

- **WHEN** 模块持有 `IApplicationContext` 并枚举其键
- **THEN** 仅可见 Logger 与只读 `state` getter，无任何状态修改入口（Symbol 写入器不入可枚举键）

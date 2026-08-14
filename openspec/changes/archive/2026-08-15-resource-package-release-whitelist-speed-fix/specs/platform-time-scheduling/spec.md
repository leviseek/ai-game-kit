## Purpose

时间/调度/动画原语经框架根入口公开，供品类层与组合根复用，消除因白名单缺口导致的逐品类自实现副本，同时保持语义等价与既有局部类型面。

## ADDED Requirements

### Requirement: 时间/调度/动画原语经根入口公开

Framework 根入口 SHALL 公开 `SimulationClock`（含 `SimulationClockOptions`）、`WallClock`、`PassiveScheduler`（含 `PassiveSchedulerOptions`/`ScheduleOptions`）、`createMotionTween`/`easeOutQuad`/`easeOutCubic`（含 `EaseCurve`/`MotionTween`/`MotionTweenRuntimeOptions`）与 `createApplicationContext`；品类层与组合根 SHALL 经根入口复用这些原语，不重复实现等价副本；公开面 SHALL 与 `public-boundary.test.ts` 的 `expectedRootExports` 精确一致。

#### Scenario: 品类时钟委托框架 SimulationClock

- **WHEN** 品类夹具（card/fight/idle/tycoon/rpg/auto_battle）创建可控模拟时钟
- **THEN** 工厂返回框架 `SimulationClock` 实例（拒绝负值推进、timeScale 约束语义等价），局部接口签名不变

#### Scenario: 品类调度器委托框架 PassiveScheduler

- **WHEN** 品类（idle/tycoon）创建被动任务调度器
- **THEN** 工厂返回框架 `PassiveScheduler` 实例（schedule/tick/dispose 面一致，任务回调失败隔离）

#### Scenario: 组合根经根入口取上下文与墙钟

- **WHEN** 组合根（boot/assembly、dev 模块）创建应用上下文、墙钟或运动缓动
- **THEN** 经根入口导入对应工厂/类，不深导入框架内部模块

### Requirement: 白名单扩展最小化

新增根入口导出 SHALL 仅覆盖存在真实消费方的原语；不因重构或预留导出尚无消费方的实现（如内存平台适配器、版本化存储工厂），不破坏 root → adapters 分层边界。

#### Scenario: 无消费方的适配器不进入白名单

- **WHEN** 评估 `MemoryPlatform` 是否纳入根入口
- **THEN** 因 root 不能依赖 adapters/memory 的分层约束且无真实消费方，保持内部适配器身份，品类层局部存储实现不迁移

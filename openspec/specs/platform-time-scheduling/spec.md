# platform-time-scheduling Specification

## Purpose

为 Framework 提供跨平台、可替换且可确定性测试的时间与任务调度语义，避免业务逻辑直接依赖 Cocos 或系统时间，并确保任务随所有者释放而停止执行。

## Requirements

### Requirement: Platform boundaries are narrow and replaceable

平台能力 MUST 通过窄契约暴露应用前后台状态、最小存储访问、设备信息和时间来源。契约 MUST 可由内存测试适配器替换；本能力 MUST NOT 要求业务代码依赖 Cocos 或平台全局 API。

#### Scenario: In-memory platform adapter replaces runtime platform

- **WHEN** 测试使用内存平台适配器提供前后台状态、存储、设备信息和时间来源
- **THEN** 使用方可以在不启动 Cocos 的情况下执行相同的契约操作

#### Scenario: Platform contract does not predefine unrelated services

- **WHEN** 调用方使用平台契约
- **THEN** 契约不要求支付、广告、账号、分享或其他未确认的平台 SDK 能力

### Requirement: Time sources expose distinct semantics

时间系统 MUST 区分 wall clock、monotonic clock 和 simulation clock。Wall clock MUST 表达可用于时间戳的系统时间；monotonic clock MUST 在同一进程内保持单调不减；simulation clock MUST 提供独立于系统时间的可控模拟时间。

#### Scenario: Wall clock provides timestamp semantics

- **WHEN** 调用方读取 wall clock
- **THEN** 返回值表达当前系统时间戳，且不被当作耗时或模拟推进时间使用

#### Scenario: Monotonic clock remains monotonic

- **WHEN** 系统 wall clock 发生回拨或调用方连续读取 monotonic clock
- **THEN** monotonic clock 的读数不会倒退

#### Scenario: Simulation clock is independently controllable

- **WHEN** 调用方读取 simulation clock 并手动推进时间
- **THEN** 读数只按明确的推进、暂停和倍率规则变化，不直接跟随系统 wall clock

### Requirement: Simulation time supports pause, rate and controlled advancement

simulation clock MUST 支持暂停、恢复、正倍率和显式推进。暂停期间时间 MUST 不推进；倍率 MUST 按规则缩放推进量；无效倍率 MUST 被拒绝，而不是静默转换为默认值。

#### Scenario: Paused simulation does not advance

- **WHEN** simulation clock 已暂停且调用方推进 1000 毫秒
- **THEN** simulation clock 的读数保持不变

#### Scenario: Simulation rate scales elapsed time

- **WHEN** simulation clock 以 2 倍倍率推进 500 毫秒
- **THEN** simulation clock 增加 1000 毫秒

#### Scenario: Invalid simulation rate is rejected

- **WHEN** 调用方设置零或负的 simulation rate
- **THEN** 操作失败并保留原有有效倍率

### Requirement: Schedulers are clock-bound and passively driven

任务调度 MUST 显式绑定一个时间来源，并由调用方通过推进或 tick 驱动。调度系统 MUST NOT 隐式创建全局时钟、依赖 Cocos `schedule` 或使用 ApplicationContext 作为时钟服务定位入口。

#### Scenario: Task waits for its bound clock

- **WHEN** 调度器绑定 simulation clock，任务延迟为 500 毫秒，且绑定时钟尚未推进 500 毫秒
- **THEN** 任务不执行

#### Scenario: Task runs after clock reaches due time

- **WHEN** 绑定时钟推进到任务到期时间并驱动调度器
- **THEN** 任务执行一次，并按任务类型决定是否移除或安排下一次执行

#### Scenario: Paused bound clock blocks task execution

- **WHEN** 调度器绑定的 simulation clock 处于暂停状态
- **THEN** 调度器驱动不会使依赖该时钟的任务执行

### Requirement: Scheduled work has explicit idempotent disposal

每个调度任务 MUST 返回同步、幂等的释放句柄。任务被释放、调度器被释放或其所有者释放后，任务 MUST NOT 再执行，包括已经到期但尚未被驱动的任务。一个任务回调失败 MUST 不阻断其他到期任务的处理，并 MUST 通过既有诊断边界保留错误信息。

#### Scenario: Disposed task does not execute

- **WHEN** 调用方释放任务句柄后再推进时钟并驱动调度器
- **THEN** 该任务不执行

#### Scenario: Disposed scheduler cancels pending work

- **WHEN** 调度器被释放后再推进绑定时钟并驱动调度器
- **THEN** 所有尚未执行的任务都不执行，重复释放不会产生额外副作用

#### Scenario: Failing task does not block other tasks

- **WHEN** 同一批到期任务中一个回调抛出错误
- **THEN** 其他到期任务仍按调度规则处理，且失败信息可被诊断边界观察

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

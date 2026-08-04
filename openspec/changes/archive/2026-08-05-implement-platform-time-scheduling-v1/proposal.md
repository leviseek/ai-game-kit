## Why

Foundation 已经具备应用生命周期和 Cocos 前后台适配，但 Framework 仍缺少跨平台的时间来源与任务调度边界。现在补齐最小平台契约、wall/monotonic/simulation 三种时钟和可释放调度器，可以让挂机、经营、回合制和格斗等后续能力使用可测试且不依赖 Cocos 的时间语义。

## What Changes

- 新增窄平台契约和内存测试适配器，覆盖应用前后台、最小存储、设备信息和可替换时钟来源。
- 新增统一的 `TimeSource` 契约及 wall、monotonic、simulation 三种时钟实现。
- 新增支持暂停、倍率和手动推进的 `SimulationClock`。
- 新增绑定时钟、被动 `tick` 驱动的引擎无关调度器。
- 新增同步、幂等的 `DisposeHandle`，用于取消调度任务并验证释放后的任务不会执行。
- 保持 `ApplicationContext` 最小边界，不加入服务注册表、`get<T>()` 或 Service Locator。
- 保持 Framework 核心不依赖 Cocos；不修改已完成 Foundation 生命周期实现和 `startup.scene` 序列化内容。

## Capabilities

### New Capabilities

- `platform-time-scheduling`: 定义窄平台契约、三种时间语义以及可释放的被动任务调度行为。

### Modified Capabilities

- 无。

## Impact

- 影响 `assets/framework/contracts`、`assets/framework/core` 及其纯 TypeScript 实现和测试入口。
- 扩展现有 Bun foundation 测试与 Foundation 类型检查门禁，不新增运行时依赖。
- 新增最小公开契约和工厂导出，后续事件、资源和游戏 Feature 可以复用 `TimeSource` 与 `DisposeHandle`。
- 本 Change 不实现真实平台存储、Cocos 调度适配、离线收益、存档迁移、通用 Scope 或 Service Locator；这些能力留给后续独立 Change。

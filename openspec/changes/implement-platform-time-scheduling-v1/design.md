## Context

Foundation 已提供纯 TypeScript 的 Application 生命周期、Module 编排、结构化 Logger 和 Cocos 前后台 Adapter。当前 `assets/framework` 没有平台契约、时间来源或调度器；`ApplicationContext` 仅包含 Logger 与只读生命周期状态，不允许扩展为 Service Locator。实现必须延续现有 Bun 测试、Creator strict 类型检查和 Framework 不依赖 Game/Cocos 核心的边界。

本设计对应 `proposal.md` 和 `specs/platform-time-scheduling/spec.md`，并承接父级 change `create-game-framework-v1` 的任务 4.1–4.3。

## Goals / Non-Goals

**Goals:**

- 以窄契约表达当前已确认的平台替换需求，并提供无需 Cocos 的内存测试替身。
- 以统一的最小 `TimeSource` 形状隔离 wall、monotonic 和 simulation 时间语义。
- 让 simulation time 具备暂停、恢复、正倍率和显式推进能力。
- 让调度器绑定调用方提供的时钟，并采用被动 tick，保证纯 TypeScript 下可确定性测试。
- 通过同步、幂等的 `DisposeHandle` 管理任务取消和调度器释放。
- 仅从公开入口导出稳定契约和必要工厂，保持实现细节内部化。

**Non-Goals:**

- 不建立通用 Scope、父子作用域或异步释放抽象。
- 不把时钟、调度器或平台服务放入 `ApplicationContext`，不实现服务注册表或 `get<T>()`。
- 不使用 Cocos `schedule`、`director` 或 Component 生命周期作为公共调度机制。
- 不实现真实 Web/Native/小游戏存储、设备信息适配或 Cocos 时间 Adapter。
- 不实现存档 schema、迁移、备份、原子替换、离线收益、网络可信时间或防作弊。

## Decisions

### 1. 使用窄平台契约和内存适配器

平台契约按能力拆分，至少包括应用可见性、最小存储、设备信息和时钟来源。内存适配器只用于测试和组合验证，不伪装成真实平台实现。存储契约限制在最小的异步键值读写/删除边界，DTO、版本迁移、原子替换和备份策略留给第 7 章。

**理由：** 父级设计要求只抽象已经存在的替换需求；窄接口便于替换并避免预建未知渠道 SDK。将存储契约做厚会与存档系统职责重叠。

**未采用方案：** 不建立包含支付、广告、账号、分享或完整存档能力的 `PlatformManager`；不在本 Change 接入 Cocos 全局 API。

### 2. 三种时钟共享 `TimeSource`，但保持语义独立

所有时钟提供只读的当前时间读取能力。Wall clock 表达系统时间戳；monotonic clock 使用可注入的单调来源，防止 wall clock 回拨影响耗时测量；simulation clock 使用独立的可控内部时间，支持 `pause`、`resume`、正 `timeScale` 和 `advance(milliseconds)`。

Simulation clock 的推进规则为：暂停时 `advance` 不改变时间；运行时增加 `milliseconds * timeScale`；倍率必须为有限且大于零的数。simulation clock 不自动监听 Application 状态，由使用方在 Module 的 pause/resume 边界显式控制。

**理由：** 三类游戏时间需求不可互换；将暂停和倍率隐式绑定全局 Application 会让 UI、音频或不同玩法模拟相互影响。

**未采用方案：** 不使用单一 `Date.now()`，不把 Cocos `deltaTime` 当作通用时间来源，不让业务规则直接调用系统时间。

### 3. 调度器采用被动 tick 并绑定显式时钟

调度器创建时接收一个 `TimeSource`，任务注册后返回 `DisposeHandle`。调用方显式调用 `tick()`，调度器比较绑定时钟当前值与任务到期值，执行到期任务；一次性任务移除，重复任务计算下一次到期时间。调度器不创建线程、定时器或隐式全局实例。

调度器优先使用简单的按到期时间排序结构；本 Change 不为未知规模引入复杂时间轮。任务回调在调度边界被隔离：一个回调失败时保留错误诊断并继续处理同一批其他到期任务。

**理由：** 被动驱动可以精确测试、支持手动推进和确定性模拟，也让未来 Cocos 集成只需薄 Adapter 调用 tick。

**未采用方案：** 不直接调用 Cocos `schedule`/`director`，不在调度器内部使用 `setTimeout` 或 `setInterval` 作为核心语义。

### 4. 销毁使用最小同步幂等句柄，不提前固定通用 Scope

`DisposeHandle` 只有同步幂等的 `dispose()` 操作。释放任务句柄会取消该任务；释放调度器会取消全部未执行任务；已释放对象重复释放不会执行回调或产生额外副作用。

该句柄是任务、未来事件订阅和资源引用可以共享的最小交集，但本 Change 不声明它们共享完整生命周期模型。事件和资源真实需求出现后，可以在不破坏句柄契约的前提下定义更高层 Scope 或引用计数。

**理由：** `DisposeHandle` 的形状已由父级设计中的事件订阅和资源 handle 需求明确，而通用 Scope 的父子关系、异步释放和错误聚合尚未确定。

**未采用方案：** 不新增通用 Scope、自动发现所有者或隐式依赖 Application 生命周期的清理机制。

### 5. 公开入口保持最小导出面

公开入口只导出平台、时间、调度和释放所需的稳定契约，以及经过验证的创建函数。具体内存适配器、调度队列数据结构和错误记录细节保持内部；Framework 内部不通过根 barrel 反向导入。

**理由：** 延续 Foundation 的根入口白名单，避免测试和后续模块依赖内部实现。

## Risks / Trade-offs

- **[平台契约仍可能遗漏未来渠道差异]** → 保持契约窄小；新增平台能力通过独立 Change 扩展，不在本 Change 预建接口。
- **[SimulationClock 的手动推进与真实帧驱动语义不一致]** → 明确由使用方控制 `advance`/`tick`；未来 Cocos Adapter 只负责把已确认的帧增量转换到契约，不改变核心时间语义。
- **[重复任务大量到期导致单次 tick 工作量突增]** → 本 Change 使用确定的到期排序和任务隔离；性能优化仅在组合验证有数据后处理。
- **[任务回调错误缺少统一诊断入口]** → 调度器接收可选的错误报告回调或使用现有 Logger 边界，测试验证错误隔离；不吞掉错误。
- **[未来事件/资源系统需要比 DisposeHandle 更强的 Scope]** → 只锁定最小句柄，推迟父子 Scope、异步 dispose 和引用计数，避免错误公共抽象扩散。
- **[开发者误把 simulation time 用于存档时间戳]** → 契约和命名明确区分 wall/monotonic/simulation，并在测试中覆盖不可互换语义。

## Migration Plan

1. 先新增失败测试和纯 TypeScript 契约，确认现有 Foundation 测试仍可运行。
2. 实现内存平台适配器、三种时钟和 `DisposeHandle`，再实现被动调度器。
3. 通过 Bun foundation 测试、Foundation 类型检查和依赖边界检查验证，不改动 `ApplicationContext`、AppRoot 或 `startup.scene`。
4. 归档本 Change 前，将父级 `create-game-framework-v1/tasks.md` 的 `4.1–4.3` 与实际证据同步；如引入新的长期架构决策，先按项目规则创建 ADR。

回滚时移除新增 Platform/Time/Scheduler 代码和测试，保留 Foundation 已完成的 Application、Cocos Adapter 和 AppRoot；不需要迁移现有业务数据。

## Context

Foundation 已有结构化日志契约（`contracts/logging/Logger.ts`、`diagnostics/logging/ScopedLogger.ts`）和两个应用层错误类（`ApplicationStateError`、`ModuleLifecycleError`，均支持构造 cause）。`core/errors` 目录仅剩空的目录 meta，无任何错误基类或分类工具。`ApplicationContext` 已实现为仅含 Logger 与只读生命周期状态的最小接口，但缺少显式测试锁定该边界。`assets/framework/index.ts` 只导出了 logging/application/module 相关符号，第 4 章已归档的平台、时间、释放契约尚未从根入口导出。

本设计对应 `proposal.md` 与 `specs/{diagnostics,scoped-events}/spec.md`，承接父级 change `create-game-framework-v1` 的任务 2.7 与 3.1–3.4，并顺带落实第 4 章公开导出收口。

## Goals / Non-Goals

**Goals:**

- 提供统一的类型化框架错误基类，支持嵌套 cause、来源上下文与可恢复性分类，并保持与现有错误类兼容。
- 提供敏感字段过滤，保证日志记录不泄漏密钥/令牌等数据。
- 提供类型化作用域事件通道，支持发布/订阅、同步幂等取消、单处理器失败隔离与作用域关闭。
- 显式测试锁定 `ApplicationContext` 无服务解析能力（2.7 收口）。
- 将第 4 章稳定契约补入根入口导出面。

**Non-Goals:**

- 不建立通用 Scope、父子作用域或异步释放抽象（沿用 DisposeHandle 最小句柄）。
- 不引入事件总线或任意字符串形式的全局业务事件 API。
- 不实现真实平台错误上报、崩溃采集或分布式追踪。
- 不实现服务注册表、类型化 token 或 `get<T>()`（2.8 推迟，需独立 change 批准）。
- 不引入新依赖、不修改 ApplicationContext 行为、AppRoot 或 `startup.scene`。

## Decisions

### 1. 类型化错误基于单一基类并保持现有错误类构造兼容

在 `core/errors` 下提供 `FrameworkError` 基类与 `FrameworkErrorOptions`，承载 cause、来源上下文（如 moduleId/phase/component）、可恢复标记与分类。`ApplicationStateError` 与 `ModuleLifecycleError` 改为继承 `FrameworkError`，保持现有构造签名与字段（`currentState`、`moduleId`、`phase`）不变，避免破坏既有导入与测试。

**理由：** 现有两个错误类已各自处理 cause 与上下文，统一基类可消除重复并为资源/存档错误提供一致入口；保持构造兼容避免不必要的破坏性迁移。

**未采用方案：** 不引入多重继承或装饰器元数据；不为每个领域单独建基类（避免层级膨胀）。

### 2. 可恢复性用显式分类而非仅靠错误类型推断

`FrameworkError` 携带 `recoverable: boolean` 与可选的 `recoverableError` 判断工具。可恢复错误用于重试/降级路径，不可恢复错误用于终止路径。分类由抛出方显式声明，不靠 `instanceof` 链或错误名猜测。

**理由：** 同一底层异常在不同上下文可恢复性不同（例如资源缺失在加载失败时可重试，在存档损坏时不可恢复），显式声明比推断可靠。

### 3. 敏感字段过滤在诊断写入点收敛

提供 `redact(record)` 或等价过滤工具，在 `LogRecord` 上下文与错误上下文写入前过滤已知敏感键（如 `token`、`secret`、`password`、`apiKey`）。过滤规则集中定义，日志 sink 不感知过滤细节。`ScopedLogger` 通过可注入的过滤函数保持纯 TypeScript 与无全局状态。

**理由：** 过滤收敛在单一写入点可避免每个业务调用方重复处理；与既有 `ScopedLogger` 的 sink 注入风格一致。

### 4. 作用域事件通道采用最小发布/订阅模型

`ScopedEventChannel` 以泛型事件类型（如 `EventMap`）提供类型化 `on/off/emit` 或 `subscribe/publish`；订阅返回同步幂等 `DisposeHandle`；单个处理器失败经错误报告回调（对齐调度器 `onTaskError` 模式）隔离；通道提供 `dispose()` 关闭作用域并清空订阅。事件负载类型在编译期静态校验，运行时不做字符串事件名分发。

**理由：** 沿用调度器已验证的"同步幂等句柄 + 失败隔离"模式，保持一致性；类型化事件避免字符串拼接错误。

**未采用方案：** 不采用发布订阅的全局事件总线或中介者模式（无跨模块全局分发需求）；不做异步队列/背压处理。

### 5. 根入口导出只收口稳定契约

在 `index.ts` 增补第 4 章契约导出：`contracts/platform/Platform`（类型）、`contracts/time/TimeSource`、`core/scheduling/DisposeHandle`、以及本 Change 的错误与事件稳定符号。不导出事件内部队列、错误记录内部结构。`public-boundary.test.ts` 的 `expectedRootExports` 同步更新。

**理由：** 落实公开 API 收口目标，让后续模块从根入口导入，避免深层相对路径。

## Risks / Trade-offs

- **[敏感字段过滤可能漏配键]** → 过滤规则集中且用测试锁定已知键；采用"默认保守"，对未来新键按清单补齐。
- **[统一错误基类可能影响既有错误类行为]** → 保持构造签名与字段兼容，用既有测试回归验证。
- **[事件处理器失败隔离缺统一诊断入口]** → 通道接收可选错误报告回调，默认 `console.error` 兜底（与调度器一致），不吞错误。
- **[泛型事件映射的类型复杂度]** → 限制为单层 `EventMap`，不为复杂协变/逆变提供抽象。
- **[index.ts 导出面扩大]** → 只加稳定契约与必要工厂，`expectedRootExports` 显式断言，防止内部实现泄漏。

## Migration Plan

1. 先新增失败测试与纯 TypeScript 契约，确认现有 Foundation 测试仍可运行。
2. 实现错误基类与诊断过滤，迁移既有错误类；再实现作用域事件通道。
3. 补齐 `index.ts` 稳定导出并同步 `expectedRootExports` 断言。
4. 通过 Bun foundation 测试、Foundation 类型检查和依赖边界检查验证，不改动 `ApplicationContext` 行为、AppRoot 或 `startup.scene`。
5. 归档前将父级 `create-game-framework-v1/tasks.md` 的 2.7、3.1–3.4 与实际证据同步；如产生新的长期架构决策，先按项目规则创建 ADR。

回滚时移除新增 Diagnostics/Events 代码与导出、保留已归档 Foundation 的 Application、Cocos Adapter 和 AppRoot；不需要迁移现有业务数据。

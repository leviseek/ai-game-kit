# ADR-007 Typed Errors and Scoped Events

## 状态

Accepted


## 背景

Foundation 已有结构化日志契约（`contracts/logging/Logger.ts`）、`ScopedLogger` 和两个应用层错误类（`ApplicationStateError`、`ModuleLifecycleError`，均支持构造 cause）。第 5/6/7 章的资源协调器、SceneFlow、UI、存档全部依赖"带 cause 的错误分类"和"类型化发布/订阅/取消"，因此第 3 章诊断与事件是后续能力的公共前置。同时第 4 章已归档的平台、时间、释放契约尚未从根入口导出。

本 ADR 记录 change `implement-diagnostics-and-events-v1` 产生的三个长期架构决策：统一类型化错误体系、作用域事件通道，以及根入口导出中 "Platform" 一词的指代澄清。


## 决策

### 1. 类型化错误统一基类与显式可恢复性分类

在 `core/errors` 提供单一基类 `FrameworkError` 与 `FrameworkErrorOptions`，承载 cause、来源上下文（moduleId/phase/component）与可恢复标记；`ApplicationStateError`、`ModuleLifecycleError` 改为继承基类并保持现有构造签名与字段兼容。

可恢复性采用**显式分类**（`FrameworkError.recoverable` + `isRecoverableError` 工具），不靠 `instanceof` 链或错误名猜测：同一底层异常在不同上下文可恢复性不同（资源缺失在加载时可重试、在存档损坏时不可恢复），显式声明比推断可靠。

`isRecoverableError` 只检查顶层错误的显式分类，不沿 `cause` 链解包：被普通包装错误（`new Error("wrapped", { cause })`）包裹的 FrameworkError 不会被识别，调用方需自行解包 `cause` 后判定。框架内所有错误（含 `ModuleCleanupError`）均继承 `FrameworkError`，保证 `isRecoverableError` 可对框架抛出的任何错误一致分类。

敏感字段过滤在诊断写入点收敛：`diagnostics/logging/redact.ts` 在 `LogRecord` 上下文写入前过滤已知敏感键，`ScopedLogger` 通过可注入过滤函数保持无全局状态，日志 sink 不感知过滤细节。过滤边界：非纯对象（Date、Map、类实例、Error）原样透传，不展开过滤；含凭据的 Map 或 Error.message 由调用方负责脱敏。

### 2. 作用域事件通道，不引入全局事件总线

`core/events/ScopedEventChannel.ts` 以泛型 `EventMap` 提供类型化 `on/emit`，订阅返回同步幂等 `DisposeHandle`，单处理器失败经错误报告回调隔离，`dispose()` 关闭作用域并清空订阅。不提供字符串形式的全局业务事件 API，不建立跨模块全局事件总线。

**理由：** 沿用调度器已验证的"同步幂等句柄 + 失败隔离"模式；类型化事件避免字符串拼接错误；当前无跨模块全局分发需求，避免中介者模式复杂度。

### 3. 根入口 "Platform" 指代澄清

`contracts/platform/Platform.ts` 仅导出四个窄契约符号：`ApplicationVisibilityState`、`ApplicationVisibility`、`PlatformStorage`、`DeviceInfo`，不存在名为 `Platform` 的导出。task 原文、design.md 与 spec 场景中出现的 "Platform" 均指**平台契约族文件**而非符号名。

根入口按**平铺方式**导出这四个符号（连同 `TimeSource`、`DisposeHandle` 及本 change 的错误/事件稳定符号），不新增 `Platform` 聚合接口或 namespace：

- 四类型是三个独立窄能力契约 + 一个辅助字面量类型，父级 design 明确反对"平台=单一对象"的聚合心智模型；
- 现有导出风格全部为平铺 `export type { ... }`，无 namespace 先例；
- `extractRootExportNames` 正则不支持 `namespace` 形式，聚合需改测试工具并破坏现有导入路径。

`expectedRootExports` 白名单随之扩展为 26 项，作为根入口公开 API 面的精确断言。


## 理由

- 统一错误基类消除现有两个错误类各自的 cause/上下文处理重复，为资源、存档等后续错误提供一致入口，同时构造兼容避免破坏性迁移。
- 显式可恢复性分类比类型推断更可靠，适合同一异常在不同上下文语义不同的场景。
- 过滤收敛在单一写入点，避免每个业务调用方重复处理，且与既有 `ScopedLogger` 的 sink 注入风格一致。
- 作用域事件通道满足"类型化发布/订阅/取消"的公共需求，无全局状态、无字符串事件分发，契合边界测试对实例隔离的要求。
- 平铺导出保持公开面精确可控，白名单每项都是永久公开契约（破坏性移除需独立 change），聚合仅省 3 个顶层项但引入新先例并违背父级设计。


## 影响

- 后续资源/存档/UI 错误应继承 `FrameworkError` 并显式声明可恢复性；新增错误不应绕过统一基类。
- 跨模块业务事件仍禁止使用字符串全局事件 API；类型化事件一律经 `createScopedEventChannel` 的作用域通道。
- `createApplicationContext` 返回收窄的只读 `ApplicationContext` 契约，不暴露状态变更方法；应用状态机由 `Application` 内部私有状态驱动，`ApplicationContext.state` 始终为只读视角。
- 根入口新增导出一律平铺并同步 `expectedRootExports`；新平台能力走"独立窄契约 + 平铺"路径，不扩大 `Platform` 聚合。
- 未来如需真正意义上的 `Platform` 命名空间分组或"追赶式"调度语义，应作为独立 change 引入并明确选项，不改变本 ADR 既定默认行为。
- 敏感字段过滤采用"默认保守"：新敏感键按集中清单补齐。

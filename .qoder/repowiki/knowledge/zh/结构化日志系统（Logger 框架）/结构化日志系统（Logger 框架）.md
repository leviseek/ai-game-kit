---
kind: logging_system
name: 结构化日志系统（Logger 框架）
category: logging_system
scope:
    - '**'
source_files:
    - assets/framework/contracts/logging/Logger.ts
    - assets/framework/diagnostics/logging/ScopedLogger.ts
    - assets/framework/diagnostics/logging/ConsoleLogger.ts
    - assets/framework/diagnostics/logging/redact.ts
    - assets/boot/AppRoot.ts
    - tests/framework/support/MemoryLogger.ts
---

该框架实现了一套基于 TypeScript 的结构化日志系统，核心由契约定义、作用域化日志器、控制台输出与敏感信息脱敏四部分组成。

**系统与架构**
- 契约层：`assets/framework/contracts/logging/Logger.ts` 定义了 `LogLevel`（debug/info/warn/error）、`LogContext`（只读键值对）、`LogRecord`（包含 level/message/timestamp/scope/context/error）以及 `Logger` 接口（含 `child(scope, context)` 子日志器工厂方法）。
- 实现层：`assets/framework/diagnostics/logging/ScopedLogger.ts` 通过 `createScopedLogger(sink, scope, context, filter)` 工厂函数生成具备作用域继承和上下文合并能力的 Logger；`ConsoleLogger` 将其适配到浏览器/引擎的 `console` 对象。
- 安全层：`redact.ts` 提供 `redactRecord` 过滤器，按正则匹配 token/secret/password/api-key 等键名进行脱敏，并处理循环引用。
- 入口装配：`assets/boot/AppRoot.ts` 在应用启动时 `new ConsoleLogger()` 注入 `ApplicationContext`，作为全局日志出口。

**设计约定**
- 所有日志记录必须通过 `Logger` 接口调用，禁止直接调用 `console.*`。
- 作用域通过 `child()` 链式组合，使用 `.` 拼接形成层级路径（如 `module.subsystem`）。
- 上下文字段采用浅合并策略：`baseContext` 与调用时传入的 `callContext` 合并，后者覆盖前者。
- 默认过滤器为 `redactRecord`，确保敏感信息不会泄露到输出。
- 测试环境通过 `tests/framework/support/MemoryLogger.ts` 捕获 `LogRecord[]` 进行断言。

**约束与规范**
- `LogRecord.context` 为 `Readonly<Record<string, unknown>>`，禁止修改已记录上下文。
- `error` 字段类型为 `Error & { readonly cause?: unknown }`，支持嵌套错误原因。
- 时间戳统一使用 `Date.now()` 获取，保证可排序性。
- 日志级别固定为四种字符串字面量，无动态扩展机制。
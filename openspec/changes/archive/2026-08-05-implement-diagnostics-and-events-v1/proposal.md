## Why

Foundation 已有结构化日志契约（Logger/ScopedLogger）和生命周期/模块错误类型，但缺少统一的类型化错误体系与作用域事件通道。第 5/6/7 章的资源协调器、SceneFlow、UI、存档全部依赖"带 cause 的错误分类"和"类型化发布/订阅/取消"，因此第 3 章诊断与事件是后续能力的公共前置；同时第 2.7 的 ApplicationContext 服务边界已隐式满足，需要显式测试与文档收口。

## What Changes

- 新增类型化框架错误体系：嵌套 cause 支持、可恢复性分类、模块/阶段/来源上下文、敏感字段过滤。
- 将现有 `core/errors` 空目录落实为错误基类与分类工具的权威来源，供诊断、事件、资源和未来存档复用。
- 新增作用域事件通道：类型化发布/订阅、订阅释放句柄、单个处理器失败隔离、作用域关闭后不再触发。
- 补齐 `assets/framework/index.ts` 对第 4 章已归档契约（Platform、TimeSource、DisposeHandle 等）的稳定导出，落实公开入口收口。
- 显式确认并测试 `ApplicationContext` 只提供 Logger 与只读生命周期状态，不提供 token、服务解析或 `get<T>()`。

## Capabilities

### New Capabilities

- `diagnostics`: 类型化框架错误、嵌套 cause、可恢复性分类、敏感字段过滤与诊断记录边界。
- `scoped-events`: 类型化作用域事件发布/订阅/取消，处理器失败隔离与作用域关闭语义。

### Modified Capabilities

<!-- 无：platform-time-scheduling 主 spec 已归档且行为不变 -->

## Impact

- 影响 `assets/framework/contracts`（新增错误/事件契约）、`assets/framework/core/errors`（错误基类）、`assets/framework/application`（错误类迁移对齐）、`assets/framework/index.ts`（导出收口）及对应测试。
- 扩展现有 Bun foundation 测试与类型检查门禁，不新增运行时依赖，不触碰 ApplicationContext 行为、AppRoot 或 `startup.scene`。
- `ApplicationStateError`/`ModuleLifecycleError` 保持既有构造签名兼容，`index.ts` 导出为增量新增，不破坏现有导入。
- 本 Change 不实现真实平台错误上报、不建立通用 Scope、不引入 FairyGUI 或事件总线之外的任何全局事件 API。

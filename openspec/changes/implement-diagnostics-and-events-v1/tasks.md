## 1. 类型化错误与诊断

- [x] 1.1 先编写类型化错误测试，覆盖嵌套 cause、可恢复性分类、模块/阶段上下文和敏感字段过滤（诊断记录与错误上下文均过滤）。
- [x] 1.2 实现 `core/errors` 下的 `FrameworkError` 基类与可恢复性分类，并将 `ApplicationStateError`、`ModuleLifecycleError` 迁移为继承基类且保持构造签名与字段兼容，使 1.1 通过。
- [x] 1.3 在诊断写入点实现敏感字段过滤工具并接入 `ScopedLogger`（可注入过滤函数），确认过滤收敛且不改变既有日志记录形状。

## 2. ApplicationContext 边界收口

- [x] 2.1 先编写契约测试：`ApplicationContext` 类型上无 token、服务解析或 `get<T>()`，仅含 Logger 与只读生命周期状态；确认 contracts 不依赖实现。
- [x] 2.2 若 2.1 暴露缺失，最小修正 contracts/application 定义；预期现状已满足，仅以测试锁定边界。

## 3. 作用域事件通道

- [x] 3.1 先编写作用域事件测试，覆盖类型化发布/订阅、订阅释放、单个处理器失败隔离和作用域关闭。
- [x] 3.2 实现类型化 `ScopedEventChannel`，返回同步幂等 `DisposeHandle`，失败经错误报告回调隔离，作用域关闭后不再触发，不提供字符串全局事件 API。
- [x] 3.3 补充事件通道边界测试：作用域关闭后无残留订阅、实例间无共享状态、无静态单例；确认无全局事件总线。

## 4. 公开导出收口与集成验证

- [ ] 4.1 在 `assets/framework/index.ts` 增补第 4 章稳定契约导出（Platform、TimeSource、DisposeHandle 等）与本 Change 错误/事件稳定符号，并同步 `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 断言。
- [ ] 4.2 运行完整 `bun run test:foundation`，记录原有 Foundation 测试与新增诊断/事件测试通过数量与零失败结果。
- [ ] 4.3 运行 `bun run test:foundation:types`、项目可用的 Framework 类型检查和 `git diff --check`，确认 `strict: false` 工具链基线与本 Change 结果。
- [ ] 4.4 审查公开 API 与依赖边界，确认只导出稳定契约/工厂，不修改 ApplicationContext 行为、AppRoot 或 `startup.scene`。
- [ ] 4.5 将父级 `create-game-framework-v1/tasks.md` 的 2.7、3.1–3.4 与实现证据同步；执行 ADR 检查，必要时创建 ADR。

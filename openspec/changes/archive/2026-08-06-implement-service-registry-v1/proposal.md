## Why

父级总计划 `create-game-framework-v1` 的任务 2.7 已将 `ApplicationContext` 锁定为只提供 Logger 与只读生命周期状态（typecheck 断言无 `get/resolve/registry/container/provide`），任务 2.8 明确"后续服务注册能力仅在独立 change 明确批准后实现"。当前组合根只能手工把服务传给模块构造函数，缺少统一的类型化 token 注册/解析与启动前校验机制，模块间服务依赖的重复注册、缺失 token 和依赖循环只能到运行期才暴露。

## What Changes

- 新增引擎无关的**类型化服务注册表**能力：`ServiceToken`、`ServiceRegistry`、注册/解析/查询/释放与类型化错误，不引入通用 IoC 容器、反射或装饰器扫描。
- 注册表**独立于 `ApplicationContext` 接入**：保持任务 2.7 的契约锁定不变（`ApplicationContext` 仍只有 `logger` 与 `state`），服务注册表不属于 Context，不提供全局 `get<T>()` 式 Service Locator。
- 组合根显式创建注册表并注册服务；模块/业务对象在装配阶段由组合根注入所需服务契约，业务代码不直接依赖 `ApplicationContext` 或注册表全局实例。
- 注册重复、token 缺失、依赖循环与解析期校验失败必须在应用进入 `running` 前以类型化错误失败，并携带可诊断的 token/模块上下文。
- 从 `assets/framework/index.ts` 导出稳定契约与工厂，同步公开入口白名单断言。

## Capabilities

### New Capabilities
- `service-registry`: 类型化 token、服务注册/解析/查询、重复注册拒绝、缺失 token 拒绝、解析期依赖循环检测、重复解析防护与公开入口收口。

### Modified Capabilities
<!-- 无：ApplicationContext 与 Module 契约锁定保持不变，现有 specs 行为不变 -->

## Impact

- 新增 `assets/framework/contracts/services`（契约）与 `assets/framework/core/services`（纯 TypeScript 实现），归属 `core`/`contracts` 依赖层，不导入 `cc`、`fgui` 或 `game`。
- 组合根 `assets/boot/AppRoot.ts` 的 `assembleApp`/`createModules` 可选接入注册表并显式装配最小验证服务；如接入则同步扩展 AppAssembly，不改 `startup.scene` 与 `ApplicationContext`/`Module` 契约。
- 不修改 `ApplicationContext`、`Module`、`Application` 的既有行为与 typecheck 锁定；不新增运行时依赖；不触碰 FairyGUI 适配层、资源/场景模块或既有 Foundation 测试。
- 扩展现有 Bun foundation 测试与类型检查门禁，新增 `service-registry` 契约测试、错误路径测试与公开边界断言。

<!-- 本 change 是否产生新的长期架构决策由 tasks 末位 ADR 检查确认 -->

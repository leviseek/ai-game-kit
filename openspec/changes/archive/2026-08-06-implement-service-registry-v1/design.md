## Context

父级总计划 `create-game-framework-v1` 已锁定两条边界：任务 2.7 断言 `ApplicationContext` 只含 `logger` 与 `state`（`application-context-contract.typecheck.ts` 校验无 `get/resolve/registry/container/provide`），`contracts.typecheck.ts` 同时锁定 `Module` 无 `register/create/configure` 等方法、phase 签名固定为 `(context: ApplicationContext) => void | Promise<void>`。因此服务注册能力**不能**通过扩展 `ApplicationContext` 或 `Module` 契约实现，必须作为独立实体由组合根装配。

现有组合模式：`boot/AppRoot.ts` 的 `assembleApp` 创建 `Application` 与模块列表，`createModules` 返回 `Module[]`。`core` 层已有多份"接口 + 工厂 + 错误类型"同文件实现并经根入口导出的先例（`ScopedEventChannel`、`ObjectPool`、`StateMachine`），服务注册表采用同层模式。

## Goals / Non-Goals

**Goals:**

- 提供类型化 `ServiceToken<T>` 与最小 `ServiceRegistry`，支持实例注册、工厂注册、按 token 解析与注册状态查询。
- 在应用进入 `running` 前完成缺失 token、重复注册与解析期依赖循环的校验，错误携带可诊断 token 上下文。
- 保持 `ApplicationContext`、`Module` 契约与既有 typecheck 锁定不变，注册表不作为全局单例、不进 Context。
- 由组合根显式把服务注入模块与业务对象，业务代码不接触注册表或 Context。

**Non-Goals:**

- 不引入通用 IoC 容器、反射、装饰器扫描、自动单例或作用域（scoped/singleton/transient）生命周期容器。
- 不把注册表纳入 `Application`/`ModuleRunner` 生命周期，不修改 `Module` phase 签名。
- 不支持运行时动态注册/解绑后的热替换、并发注册、异步工厂或服务卸载引用计数。
- 不为未确定的网络、存档、UI 等服务预建 token；token 由具体使用方在组合根声明。

## Decisions

### 1. 注册表位于 `core/services`，接口、错误与工厂同文件导出

服务注册表实现放 `assets/framework/core/services/ServiceRegistry.ts`，包含 `ServiceToken` 类型、`ServiceRegistry` 契约、`ServiceRegistrationError`/`ServiceResolutionError` 与 `createServiceToken`/`createServiceRegistry` 工厂。`core` 层是纯 TypeScript、不导入 `cc`，与 `ScopedEventChannel`/`ObjectPool` 同层模式一致，也从根入口 `index.ts` 导出。

**理由：** 注册表不依赖 Application、Module 或 Logger，放 `core` 可被组合根、测试替身与未来能力独立复用；同文件导出减少跨目录碎片。

**未采用方案：** 不拆 `contracts/services` + `core/services` 两层，因为本能力没有"实现反向依赖接口"的演进压力，单文件更贴近既有 `core` 工具惯例。

### 2. `ServiceToken<T>` 用泛型 + 结构唯一标识，编译期绑定服务类型

`createServiceToken<T>(description: string)` 返回带唯一 brand 的 token：

```ts
export interface ServiceToken<T> {
    readonly description: string;
    readonly __serviceTokenBrand: unique symbol;
}
```

类型参数 `T` 是服务静态类型；`description` 仅用于日志与错误诊断。token 每次调用 `createServiceToken` 独立（brand 经 unique symbol 保证结构唯一，不依赖字符串相等）。

**理由：** 泛型让 `resolve` 返回类型与注册时一致，缺失/错误类型在编译期被拒绝；`description` 让运行期错误可读，不引入字符串 key 查询。

**未采用方案：** 不使用字符串常量 key（会丢失类型绑定、易拼错）；不引入 class 构造器作为 token（强耦合具体类、阻碍接口替身）。

### 3. `ServiceRegistry` 只提供注册/解析/查询与工厂，错误即抛

契约最小化为：

```ts
export interface ServiceRegistry {
    register<T>(token: ServiceToken<T>, instance: T): void;
    registerFactory<T>(token: ServiceToken<T>, factory: (resolve: <U>(token: ServiceToken<U>) => U) => T): void;
    resolve<T>(token: ServiceToken<T>): T;
    isRegistered<T>(token: ServiceToken<T>): boolean;
}
```

- `register` 重复注册同一 token 抛 `ServiceRegistrationError`，不覆盖已有注册。
- `resolve` 未注册 token 抛 `ServiceResolutionError`（携带 `description`）；已注册实例重复解析返回同一实例。
- `registerFactory` 的工厂接收受限 `resolve` 函数以解析其依赖，从而构成可检测的依赖链；工厂每次解析按当前实现求值一次（本 change 不承诺缓存策略，简单求值）。
- 所有错误继承 `FrameworkError`，携带 `token` 描述与 cause。

**理由：** 显式注册 + 即抛错误与父级"注册重复、token 缺失和依赖循环必须在进入 running 前失败"一致；工厂解析依赖链让缺失/循环在解析期（早于 running）暴露。

**未采用方案：** 不返回 `Result`（解析失败属于编程/装配错误，抛类型化错误更符合既有 `FrameworkError` 约定）；不做实例缓存与生命周期管理，避免把注册表变成容器。

### 4. 依赖循环用"进行中解析集合"检测，解析失败保持无副作用

`resolve` 遇到工厂 token 时，将 token 加入进行中集合（resolving set）再调用工厂；若工厂解析的依赖又在进行中集合中，抛 `ServiceResolutionError` 标识循环链。解析失败时清理进行中集合，不残留部分状态。

**理由：** 工厂依赖构成有向图，循环只有在解析期可被可靠识别；进行中集合开销小、无需预先建图。

**未采用方案：** 不预扫描所有注册建立依赖图（增加实现复杂度且无法覆盖全部运行期路径）；不把循环错误降级为日志。

### 5. 组合根在装配阶段显式注册与校验，模块经构造注入服务

组合根（`boot/AppRoot.ts` 的 `assembleApp`）创建注册表，注册服务实例/工厂，然后在创建模块时把已解析服务显式传入模块构造函数或绑定函数。业务代码只接收所需服务契约，不导入注册表类型、不依赖 `ApplicationContext`。

应用进入 `running` 前校验的实现：组合根在 `Application.start()` 调用之前对模块声明依赖的每个 token 执行一次 `resolve`（缺失/循环在此同步抛错），`app.start().catch` 的既有失败路径按 `ApplicationStateError`/回滚规则处理。若 `resolve` 校验在装配阶段完成，则 `Application` 无需感知注册表。

**理由：** 保持 `Module` phase 签名 `(context)` 不变（typecheck 锁定），服务注入在创建侧而非生命周期侧完成；组合根是唯一"知道具体实现"的位置，符合父级 Decision 4 与风险治理条款。

**未采用方案：** 不给 `Module` 增加 `register`/`configure` 方法（破坏 `contracts.typecheck.ts` 锁定）；不让 `ApplicationContext` 携带注册表（破坏 2.7 锁定）；不在 `Application` 内嵌注册表生命周期（扩大内核、违背最小内核原则）。

### 6. 根入口按白名单导出稳定符号并同步断言

`assets/framework/index.ts` 新增导出 `ServiceToken`（类型）、`ServiceRegistry`（类型）、`ServiceRegistrationError`、`ServiceResolutionError`、`createServiceToken`、`createServiceRegistry`。同步 `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 白名单，并在 `contracts.typecheck.ts` 增补断言：`ApplicationContext` 仍无服务成员、`Module` 仍无 register 成员。

**理由：** 延续既有公开入口收口规则；typecheck 断言防止未来把注册表误塞回 Context/Module。

### 7. AppRoot 最小接入演示，不改 `startup.scene`

`assembleApp` 增加最小服务注册/解析演示（例如注册一个无副作用的 `TimeSource` 或空 `Logger` 别名 token），并把注册表实例暴露在 `AppAssembly` 或仅在装配函数内使用；`createModules` 不依赖注册表，`startup.scene` 不修改。若接入暴露设计问题，回退为仅提供能力与测试、不改 AppRoot。

**理由：** 用真实装配路径验证注册表可被组合根使用，同时避免扩大场景/组件改动面。

## Risks / Trade-offs

- **[注册表退化为全局 Service Locator]** → 注册表不进 Context、不做全局单例，只由组合根创建并注入；`ApplicationContext` typecheck 锁定继续拦截。
- **[token 类型绑定被 `as any` 绕过]** → 严格类型检查门禁与编译期泛型保证；测试覆盖类型不匹配在编译期被拒。
- **[工厂求值语义（每次解析重算）与未来生命周期需求冲突]** → 本 change 不承诺缓存；若出现真实生命周期需求，通过独立 change 扩展，不破坏当前契约。
- **[组合根手动注入易漏 token]** → 在装配函数内对模块依赖显式 `resolve` 校验，缺失立即抛 `ServiceResolutionError`，错误可定位到具体模块/token。
- **[范围膨胀到把注册表接入 Application 生命周期]** → 明确 Non-Goal，注册表保持纯 `core` 工具；Application/ModuleRunner 不改。

## Migration Plan

1. 先在 `core/services` 编写 `ServiceToken`/`ServiceRegistry` 类型与工厂，并用失败测试锁定重复注册、缺失 token、循环依赖、重复解析同一实例等行为。
2. 在 `index.ts` 导出稳定符号并同步 `public-boundary.test.ts` 白名单；在 `contracts.typecheck.ts` 增补"Context/Module 仍无服务成员"断言。
3. 在 `boot/AppRoot.ts` 的 `assembleApp` 接入最小注册/解析演示与装配前校验；不改 `startup.scene`。
4. 运行 `bun run test:foundation`、`test:foundation:types` 与 `git diff --check` 验证；执行 ADR 检查并同步父级总计划任务 2.8。

回滚以文件组为单位：移除 `core/services`、根入口导出增量与 AppRoot 接入演示，恢复 `index.ts`/`public-boundary` 白名单到基线；`ApplicationContext`/`Module`/`Application`/`startup.scene` 不涉及破坏性改动，无需迁移。

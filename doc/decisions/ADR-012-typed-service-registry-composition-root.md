# ADR-012 Typed Service Registry with Composition-Root Injection

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 任务 2.7/2.8 锁定 `ApplicationContext` 只提供 Logger 与只读生命周期状态（typecheck 断言无 `get<T>()`/token/服务解析），并明确服务注册能力必须在独立 change 批准后实现、不得把 Context 退化为全局 Service Locator。组合根此前只能手工把服务传给模块构造函数，模块间服务依赖的重复注册、缺失 token 与循环只能到运行期才暴露。

本 ADR 记录 change `implement-service-registry-v1` 产生的长期架构决策：类型化 token 服务注册表、组合根显式装配与注入、装配前 token 校验，以及"注册表独立于 Context、非全局单例"的边界保持方式。

## 决策

### 1. 注册表位于 core/services，接口、错误与工厂同文件导出

`assets/framework/core/services/ServiceRegistry.ts` 同文件导出 `ServiceToken` 类型、`ServiceRegistry` 契约、`ServiceRegistrationError`/`ServiceResolutionError` 与 `createServiceToken`/`createServiceRegistry` 工厂，纯 TypeScript 不导入 `cc`，与 `ScopedEventChannel`/`ObjectPool`/`StateMachine` 的 `core` 工具惯例一致。

**理由：** 注册表不依赖 Application、Module 或 Logger，放 `core` 可被组合根、测试替身与未来能力独立复用；单文件贴近既有 `core` 工具惯例，避免跨目录碎片。

**未采用方案：** 不拆 `contracts/services` + `core/services` 两层（本能力无"实现反向依赖接口"演进压力）。

### 2. `ServiceToken<T>` 用泛型 + 结构唯一标识，编译期绑定服务类型

`createServiceToken<T>(description)` 返回带 brand 键的 token；类型参数 `T` 是服务静态类型，`description` 仅用于日志与错误诊断。token 每次调用独立，不依赖字符串相等。`resolve` 返回类型与注册时一致，缺失/错误类型在编译期被拒绝。

**理由：** 泛型让注册/解析类型一致且错配在编译期被拒；`description` 让运行期错误可读，不引入字符串 key 查询。

**未采用方案：** 不使用字符串常量 key（丢失类型绑定、易拼错）；不引入 class 构造器作为 token（强耦合具体类、阻碍接口替身）。

### 3. `ServiceRegistry` 最小契约，错误即抛

契约只有 `register`/`registerFactory`/`resolve`/`isRegistered`。重复注册抛 `ServiceRegistrationError` 且不覆盖；`resolve` 缺失 token 抛 `ServiceResolutionError`（携带 `description`），已注册实例重复解析返回同一实例；工厂每次解析按当前实现求值。错误继承 `FrameworkError`。

**理由：** 显式注册 + 即抛错误与父级"注册重复、token 缺失和依赖循环必须在进入 running 前失败"一致；解析失败属编程/装配错误，抛类型化错误符合既有 `FrameworkError` 约定。

**未采用方案：** 不返回 `Result`；不做实例缓存与生命周期管理，避免把注册表变成容器。

### 4. 依赖循环用"进行中解析集合"检测，解析失败保持无副作用

`resolve` 遇到工厂 token 时加入进行中集合再调用工厂；若工厂解析的依赖又在进行中集合中，抛 `ServiceResolutionError` 标识循环链。`finally` 清理进行中集合，解析失败不残留部分状态。

**理由：** 工厂依赖构成有向图，循环只在解析期可被可靠识别；进行中集合开销小、无需预先建图。

**未采用方案：** 不预扫描所有注册建立依赖图（增加复杂度且无法覆盖全部运行期路径）；不把循环错误降级为日志。

### 5. 注册表独立于 Context，由组合根显式装配并注入，非全局单例

注册表不进 `ApplicationContext`、不做全局单例；组合根（`boot/AppRoot.ts` 的 `assembleApp`）创建注册表并注册服务，`AppAssembly` 暴露 `registry`。每次 `assembleApp` 创建独立注册表实例。业务对象经构造接收已解析服务契约，不导入注册表类型、不依赖 Context；`createModules` 不依赖注册表。

**理由：** 保持 `Module` phase 签名 `(context)` 与 `ApplicationContext` 锁定不变（typecheck 断言继续拦截）；组合根是唯一"知道具体实现"的位置，符合父级风险治理条款。

**未采用方案：** 不给 `Module` 增加 `register`/`configure`（破坏 `contracts.typecheck.ts` 锁定）；不让 `ApplicationContext` 携带注册表（破坏 2.7 锁定）；不在 `Application` 内嵌注册表生命周期（扩大内核）。

### 6. 装配前 token 校验在 `Application.start` 前执行，失败走既有失败路径

`assembleApp` 以 `validateRequiredTokens` 对必需 token 逐个 `resolve`，缺失/循环同步抛 `ServiceResolutionError`。`AppRoot.start` 先于 `adapter.bind`/`initializeUiRoot` 执行校验，失败不进入 `running`（保持 `created`）、不留已绑定/已初始化的全局状态，并走既有 `launch().catch` 失败路径经 `logger` 上报类型化错误（app.start 失败仍由 Application 内部记录模块生命周期错误）。

**理由：** 缺失/循环在装配期同步暴露（早于 running）；`Application` 无需感知注册表；失败路径与既有 `app.start().catch` 语义一致，且校验前置避免失败后残留全局副作用。

**未采用方案：** 不把校验推迟到模块初始化期（破坏"进入 running 前失败"目标）；不让 `Application` 感知注册表。

### 7. 根入口按白名单导出稳定符号并同步断言

`assets/framework/index.ts` 导出 `ServiceToken`（类型）、`ServiceRegistry`（类型）、`ServiceRegistrationError`、`ServiceResolutionError`、`createServiceToken`、`createServiceRegistry`；`public-boundary.test.ts` 的 `expectedRootExports` 白名单同步。`contracts.typecheck.ts` 断言 `ApplicationContext` 仍无服务成员、`Module` 仍无 register 成员。

**理由：** 延续既有公开入口收口规则；typecheck 断言防止未来把注册表误塞回 Context/Module。

## 理由

- 组合根显式装配 + 构造注入是本 change 最核心的长期行为契约：一旦未来引入全局单例注册表或把解析能力塞进 Context，现有 typecheck 断言与测试会立即失败。
- 类型化 token + 编译期类型绑定是安全接入的关键：错误类型在编译期被拒，运行期错误可读。
- 装配前校验前置 + 失败走既有 `launch().catch`，既满足"非法装配不进入 running"，又不扩大 `Application` 内核。
- `service-registry` 属于框架能力，新增公开符号必须在根入口白名单收口（既有约定）。

## 影响

- 未来新增业务服务一律在 `assembleApp` 以 token 注册，模块/业务对象经构造注入，不直接导入注册表。
- 当出现真实模块依赖时，应在 `validateRequiredTokens` 的必要 token 列表扩展并补充"真实缺失 token"的失败路径用例。
- 注册表不承诺缓存与生命周期管理；若出现真实生命周期需求，通过独立 change 扩展，不破坏当前契约。
- 根入口新增稳定符号一律同步 `expectedRootExports`；移除公开符号属破坏性变更，需独立 change。

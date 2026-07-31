## Context

本 change 是 `create-game-framework-v1` 的第一个实施切片。父级设计已经确定：Framework 使用单一应用根、显式 Application 生命周期、模块依赖拓扑和结构化日志；Composition Root 与 Module 生命周期边界是仅有的 ApplicationContext 使用位置。ApplicationContext 的公开契约归属 `contracts/application`，具体创建与实现归属 `application`，避免 Module 契约反向依赖 Application 实现。

当前实施已完成 Bun foundation 测试基线、Framework 目录骨架和空的根公开入口，但尚未创建 Application、Logger、Module 或 AppRoot 运行时实现。现有 `tsconfig.json` 当前为 `strict: false`，本 change 不扩大范围调整该项目设置，但新增公共类型和实现仍不得使用 `as any`、`@ts-ignore` 或吞掉类型错误。

父级设计中的 UI、FairyGUI、资源、场景、配置、存档、时间、通用事件总线、网络和游戏 Feature 均不属于本切片。此处只建立未来能力可以接入的运行骨架，不为尚未实施的系统创建接口或空 Manager。

## Goals / Non-Goals

**Goals:**

- 建立最小且方向明确的 Framework 目录和公开导出面。
- 让 Application 在无任何业务模块时也能完成启动、暂停、恢复和释放。
- 定义可异步执行的 Module 接口，以及确定、可测试的依赖和初始化顺序。
- 在模块校验、初始化或启动失败时逆序清理已经成功的模块。
- 让 AppRoot 只承担 Composition Root，并通过可替换的 `adapters/cocos/application` 把 Web、Native 或小游戏运行时生命周期事件转换为纯 TypeScript Application 调用。
- 在 Application 创建前建立 Logger，使最早期启动失败也有结构化诊断信息。
- 将 ApplicationContext 限制为 Logger 和只读 lifecycle state，避免提前承诺应用身份或服务定位能力。
- 固定 `core -> contracts -> application -> adapters/cocos` 的构建层次，并以架构测试阻止反向依赖和 Framework 对 Game 的依赖。

**Non-Goals:**

- 不实现通用服务注册表、事件总线、时间系统、配置对象或超出 Application 生命周期转换所需的通用平台抽象。
- 不实现可选模块降级；本切片中所有注册模块都是启动必需模块。
- 不实现运行时动态添加/移除模块、热重载、模块重启或并行初始化。
- 不实现 Logger 的复杂安全序列化、循环引用检测、深度限制或敏感字段自动脱敏；调用方不得把凭据放入日志上下文。
- 不实现 UI、FairyGUI、Resource、Asset Bundle、Scene 或任何 Cocos 原生业务 UI。
- 不实现 ECS、Network、战斗、角色、卡牌、经营、挂机或其他游戏 Feature。
- 不引入第三方运行时依赖，不修改 Creator/引擎配置，不手工编辑 scene/meta 文件。

## Decisions

### 1. 目录只为当前切片建立，不预建未来系统

**决定：** 实施后的目标目录为：

```text
assets/
├─ boot/
│  ├─ AppRoot.ts
│  └─ startup.scene
└─ framework/
   ├─ index.ts
   ├─ core/
   │  ├─ errors/
   │  └─ lifecycle/
   ├─ contracts/
   │  ├─ application/
   │  ├─ module/
   │  └─ logging/
   ├─ application/
   │  ├─ Application.ts
   │  ├─ ApplicationContext.ts
   │  ├─ ModuleGraph.ts
   │  └─ ModuleRunner.ts
   ├─ diagnostics/
   │  └─ logging/
   └─ adapters/
      └─ cocos/
         └─ application/
```

测试放在不参与 Cocos 资源导入的仓库级测试目录，并按 `framework/foundation` 聚合。

目录职责进一步限定为：

- `contracts/application`：放置 ApplicationContext interface、ApplicationState 和只读生命周期查询契约，不包含创建逻辑或可变实现。
- `application`：放置 Application、ApplicationContext implementation、Context 创建 API、ModuleGraph 和 ModuleRunner；Composition Root 调用这里的创建 API，但实际装配仍由 AppRoot 显式完成。
- `adapters/cocos/application`：放置 Cocos Runtime 生命周期事件适配，不包含 Module 创建、Game 业务或 AppRoot 组合逻辑。
- `diagnostics/logging`：实现 `contracts/logging`，不得反向依赖 Application 或 Cocos Adapter。

**理由：** 当前切片只有 Application、Module、Logger 和启动适配，预先创建 `ui`、`resource`、`scene` 等目录会暗示存在未实现能力并诱导空抽象。

**未采用方案：** 不一次性复制父级设计的完整目录树；不使用 `manager/utils/common` 等无法表达依赖方向的横向目录。

**结果：** 新目录必须有本切片的实际类型、实现或公开职责；空目录和未来系统占位文件不进入提交。

### 2. Framework 根入口只导出稳定契约和必要启动类型

**决定：** `assets/framework/index.ts` 是根公开入口，只导出 Application 构建所需类型、`contracts/application` 中的 ApplicationContext/ApplicationState/只读生命周期契约、Module 契约、Logger 契约和明确允许外部使用的错误类型。ModuleGraph、ModuleRunner、ApplicationContext 可变实现、MemoryLogger 和 Console 格式化细节保持内部实现。

**理由：** 首批 API 一旦被 Game 或后续模块深层导入就会快速固化。最小导出面可以在不破坏消费者的情况下调整内部编排。

**未采用方案：** 不建立导出整个目录的巨型 barrel，也不允许 `boot` 从 Framework 内部路径导入具体实现。

**结果：** AppRoot 和 Game 消费者只通过根入口完成装配或引用稳定契约；Framework 内部不得反向导入根 barrel，架构检查拒绝跨边界深层导入并校验根导出白名单。

### 3. Framework 内部使用固定单向依赖规则

**决定：** Framework 的构建层次固定为：

```text
core
  ↓
contracts
  ↓
application
  ↓
adapters/cocos
```

图中箭头表示“由底层能力构建上层能力”。实际 TypeScript import 只允许上层指向下层：

- `core` 只依赖语言标准能力，不导入 `cc`、contracts、application、adapter 或 Game。
- `contracts` 只依赖必要的 `core` 或同层 contract，不依赖 Application、diagnostics、adapter 或具体实现。
- `application` 依赖 `contracts` 和 `core`，只面向 Logger、Module、ApplicationContext contract 编排，不依赖 Game、Cocos 或具体 Logger 实现。
- `diagnostics/logging` 依赖 `contracts/logging` 和必要的 `core`，不得依赖 Application、adapter 或 Game。
- `adapters/cocos` 可以依赖 Application 的稳定公开生命周期 API、contracts 和 `cc`，不得依赖 Game 或 boot。
- `framework` 任何目录都禁止导入 `assets/game`、Game Feature、业务实体或业务服务。

外部消费者只能从 `assets/framework/index.ts` 导入；Framework 内部使用明确的相对 contract/implementation 路径，不经根入口反向导入，以避免 barrel 循环。

**理由：** 公开入口限制只能阻止外部深层导入，不能阻止 contracts 依赖实现、Application 导入 Cocos 或 Framework 导入 Game。显式依赖矩阵让纯 TypeScript 内核、实现和运行时适配可独立测试与替换。

**未采用方案：** 不依赖目录命名约定或人工 review 作为唯一门禁，不允许通过根 barrel 隐藏反向依赖，也不引入新的依赖分析第三方库。

**结果：** Foundation 架构测试必须同时扫描 Framework 内部和外部消费者，覆盖允许/禁止依赖矩阵、Framework 禁止依赖 Game、core 禁止依赖 Cocos，以及合法根导入与非法深层导入。

### 4. Application 使用六状态生命周期和四个公共操作

**决定：** Application 状态固定为：

```text
created → initializing → running ⇄ paused → stopping → disposed
```

公共操作仅包含：

- `start`：从 `created` 完成模块校验、initialize 和 start，成功后进入 `running`。
- `pause`：从 `running` 进入 `paused`。
- `resume`：从 `paused` 返回 `running`。
- `dispose`：从可清理状态进入 `stopping`，逆序 stop/dispose，最终进入 `disposed`。

启动失败路径为 `initializing → stopping → disposed`，错误继续抛给 AppRoot 记录和处理，不额外增加 `failed` 状态。

**理由：** 该状态模型与父级设计一致，同时避免为尚无使用场景的 initialized/stopped/restarting 状态增加转换复杂度。完整释放后的对象不可重新启动，可以减少残留订阅和重复模块实例。

**未采用方案：** 不把 Application 生命周期直接等同于 Cocos Component 的 `onLoad/start/onEnable/onDisable`；不在 v1 支持 restart。

**结果：** 每次状态变化都有唯一入口和可测试前置条件；`disposed` 是终态，除重复 dispose 外的后续操作都返回明确错误。

### 5. 生命周期操作串行化，同一操作支持 single-flight

**决定：** Application 内部串行执行生命周期操作。并发调用 `start` 或 `dispose` 时返回同一个进行中的结果；对已经达到目标状态的重复 `pause`、`resume` 和 `dispose` 视为安全 no-op；违反时序的操作返回类型化 `ApplicationStateError`。

**理由：** Cocos 前后台和销毁事件可能与异步启动交错。如果每次调用都创建新流程，会发生模块重复初始化或初始化未完成就被释放。

**未采用方案：** 不依靠调用方自行加锁，也不通过静默吞掉所有非法操作制造“幂等”。

**结果：** 第一阶段测试重点覆盖 start/start、start/dispose、dispose/dispose 和 disposed/start；pause/resume 只保留基础状态转换与 Cocos Application Adapter 事件映射验证，完整竞争和失败矩阵延后。

### 6. Module 是声明信息加可选生命周期钩子，不使用继承基类

**决定：** Module 契约包含稳定 `id`、只读 `dependencies` 和生命周期钩子：initialize、start、pause、resume、stop、dispose。钩子允许同步或异步返回；没有工作要做的钩子可以省略。Module 生命周期签名只能通过 `import type` 依赖 `contracts/application` 的 ApplicationContext contract，不得导入 `application/ApplicationContext` 实现。Module 运行状态由 ModuleRunner 维护，Module 实现不自行修改全局状态。

接口保持完整，但第一阶段验收优先级为 initialize/start/stop/dispose；pause/resume 只验证基本调用顺序和无钩子模块兼容性，不穷举失败回滚与并发组合。

**理由：** 组合式接口比 BaseModule 继承更适合不同类型的后续能力，也减少空 override。Runner 持有状态可以统一阻止重复调用并生成一致日志。

**未采用方案：** 不使用装饰器扫描、Cocos Component 作为 Module 基类或模块自行注册全局单例。

**结果：** Module id、依赖和钩子在注册后视为不可变；生命周期错误统一包装为带 module id 与 phase 的 `ModuleLifecycleError`。

### 7. ApplicationContext 公开契约与实现分离

**决定：** `contracts/application` 拥有 ApplicationContext interface、ApplicationState 和只读生命周期查询契约。ApplicationContext contract 仅暴露 Logger 与 readonly lifecycle state，不包含 application identity、服务注册表、任意依赖查询、Application 实例或 Game 对象。

`application` 提供 ApplicationContext 的创建 API 和内部实现。AppRoot 作为 Composition Root 调用该 API 并显式装配 Logger、Application、Module 列表与 Cocos Application Adapter；Context 仅传给 Module 生命周期钩子，具体实现不从 Framework 根入口导出。

每个 Module 获得基于 module id 的 child logger，而不是自行创建 Logger 或读取全局 Logger。

**理由：** Module 契约本身需要引用 ApplicationContext。如果 contract 放在 `application`，就会形成 `contracts/module -> application` 的反向依赖。分离公开 contract 与内部实现既保持依赖方向，也为启动日志提供一致上下文。

**未采用方案：** 不让 contracts 导入 application 实现；不把 ApplicationContext 保存到业务单例，不提供 `get<T>()` 式通用 Service Locator，也不让 Module 修改 Application 状态。

**结果：** `contracts/module` 只依赖 ApplicationContext contract，`application` 实现该 contract；后续服务注册机制必须通过独立 change 扩展，不能借本切片偷偷加入 Context。

### 8. 模块图使用稳定拓扑排序并在执行前一次性校验

**决定：** Application 接收显式 Module 数组，启动前完成以下校验：

1. id 非空且唯一。
2. 每个 dependency id 都存在。
3. 依赖图无循环。
4. 独立模块按注册顺序保持稳定。

初始化和启动按拓扑正序逐个执行；stop 和 dispose 按已成功模块的逆序执行。接口层仍规定 pause 逆序、resume 正序，但其完整异常矩阵不作为第一阶段门禁。

**理由：** 依赖模块必须先可用，依赖者必须先停止。稳定的顺序让日志、测试和问题复现一致；顺序执行比并行初始化更容易回滚和定位失败。

**未采用方案：** 不按目录名或类名隐式排序，不并行初始化独立模块，不允许缺失依赖在运行中才被发现。

**结果：** 重复 id、缺失依赖和循环依赖在任何 Module initialize 执行前失败，并由 Logger 输出结构化诊断。

### 9. 初始化和启动失败执行分阶段逆序回滚

**决定：** Runner 分别记录 initializedModules 与 startedModules：

- initialize 失败：逆序 dispose 已 initialize 成功的模块。
- start 失败：逆序 stop 已 start 成功的模块，再逆序 dispose 已 initialize 成功的模块。
- pause/resume 失败：行为仍定义为记录错误并由 Application 进入统一 dispose 流程，避免维持部分暂停状态；第一阶段只做基本冒烟覆盖，详细失败组合延后。
- dispose 中单个模块失败：继续清理剩余模块，最终聚合并报告所有清理错误。

原始错误作为 cause 保留；回滚错误不能覆盖最先导致启动失败的错误。

**理由：** 模块可能在 initialize 阶段建立内存状态，在 start 阶段注册监听。分开记录才能调用正确的补偿钩子，并确保一个清理失败不阻塞其他模块释放。

**未采用方案：** 不在失败后继续启动后续模块，不用空 catch 吞掉回滚错误，也不依赖每个模块自行发现整个应用失败。

**结果：** Application 无论启动成功后释放还是启动中失败，最终都进入 `disposed`，且日志可以还原原始失败和回滚结果。

### 10. Logger 在 Application 之前创建且不是普通 Module

**决定：** AppRoot/Composition Root 先创建 Logger，再创建 ApplicationContext、Application 和 Module 列表。Logger 不参与 ModuleGraph，因为模块图校验失败本身也需要日志。

Logger 契约提供 debug、info、warn、error 和 child；每条记录包含 level、message、timestamp、scope、结构化 context 与可选 error。ConsoleLogger 是运行时默认实现，MemoryLogger 仅用于测试断言。

**理由：** 若 Logger 也是 Module，重复 id、循环依赖或首个模块 initialize 失败时可能没有可用诊断通道。child logger 可以自动附加 application/module/phase，而不需要每次手工拼字符串。

**未采用方案：** 不提供全局静态 Logger，不在本切片实现文件写入、远程上传、持久化缓冲或性能埋点。

**结果：** AppRoot、Application 和每个 Module 使用同一 Logger 树；测试可以通过 MemoryLogger 验证日志而不拦截 console。

### 11. Logger 只保留浅层结构化记录

**决定：** 日志记录保持最小结构：timestamp、level、scope、message 和可选 context/error。ConsoleLogger 把结构化记录直接交给对应 console level；MemoryLogger 保存同一记录用于测试。child logger 只负责合并 scope 与浅层 context。

**理由：** 当前目标是让启动和 Module 生命周期可观察，不是建设完整日志平台。复杂递归序列化、循环检测、深度限制和自动脱敏会显著扩大实现与测试范围，且尚无真实日志载荷证明必要性。

**未采用方案：** 本切片不递归克隆或 JSON stringify 任意对象，不自动展开 Error cause 链，不扫描敏感键，也不引入日志 SDK。调用方必须只传可安全输出的浅层数据，并继续遵守凭据只存在于环境变量的规则。

**结果：** Logger 第一阶段只验收结构化字段、level、scope、child context 和 Console/Memory 输出；安全序列化与脱敏由后续独立 change 在真实载荷出现后设计。

### 12. AppRoot 只负责 Composition Root，Cocos Adapter 负责平台生命周期

**决定：** `assets/boot/AppRoot.ts` 是唯一 Cocos Component 组合入口，但不监听 Cocos hide/show 事件，也不负责平台生命周期转换：

- onLoad：创建 Logger、ApplicationContext implementation、Application、Module 列表和当前平台的 Cocos Application Adapter，并把自身节点设为唯一持久应用根。
- start：触发异步 Application.start，并用 Logger 捕获未处理的启动错误。
- onDestroy：先要求 Adapter 解除运行时事件绑定，再调用 Application.dispose。

AppRoot 通过一个显式 `createModules` 组合函数返回当前模块数组；本切片默认允许空数组或仅测试模块，不创建 Game、UI、资源或场景模块。AppRoot 只调用 Adapter 的绑定/解绑入口，不直接了解 `game.EVENT_HIDE`、`game.EVENT_SHOW` 等事件。

`adapters/cocos/application` 负责订阅 Cocos Runtime 生命周期事件，并把 hide/show 等平台事件转换为 Application pause/resume 调用。Adapter 只依赖 Application 稳定生命周期 API，不获取 Module 列表、ApplicationContext 或 Game 对象。Web、Native 和小游戏平台可以替换不同 Adapter，而不改变 Application、Module 或 AppRoot 的组合职责。

**理由：** Composition Root 与平台事件适配是不同职责。AppRoot 需要看见具体实现以完成装配，但不应包含随平台变化的事件名称、订阅方式和转换规则；Adapter 隔离这些变化后，纯 TypeScript Application 无需了解 Cocos 或具体发布平台。

**未采用方案：** 不在 AppRoot 直接注册 hide/show，不让 Adapter 创建 Application 或 Module，不创建多个常驻 Manager，不把 onEnable/onDisable 当成应用前后台事件，不手工编辑 scene JSON 挂载脚本。

**结果：** AppRoot 只负责 Composition Root 和显式 Application 生命周期入口；Cocos 平台变化局限在 Adapter。Framework 核心测试不需要启动 Cocos，场景只承担宿主职责且不引入任何 UI。

### 13. 纯 TypeScript 测试保留 Bun，Cocos 行为仍由 Creator 验证

**决定：** 重新核对本机和项目工具链后，继续使用 Bun 验证依赖矩阵、ModuleGraph、Application、Runner 和 Logger；使用 Cocos Creator 3.8.8 Web Desktop 预览或构建验证 AppRoot 挂载、Cocos Application Adapter 前后台映射和销毁流程。

当前证据是：Bun 1.3.13 已安装并可直接执行 TypeScript；项目没有 Vitest、Jest、tsx、ts-node、独立 tsc 或 lockfile。Node 原生 test runner 不能直接运行当前 TypeScript，需要额外转换配置；Vitest/Jest 需要新增开发依赖。基础内核不导入 `cc`，因此 Bun 的直接 TypeScript 执行和零新增依赖是明确收益。

单元测试使用可编程测试 Module 和 MemoryLogger，不依赖 Cocos。Cocos 冒烟测试只验证空应用启动和释放，不加入任何明确禁止的系统。

**理由：** 绝大多数基础骨架是纯 TypeScript，Bun 可以低成本精确模拟失败；AppRoot 挂载与 Cocos Adapter 事件映射仍必须由引擎环境证明。将两类验证分开，比为了“接近 Cocos”而让所有单元测试启动编辑器更可靠。

**未采用方案：** 暂不引入 Vitest/Jest；不为 Node test runner 额外建立 TypeScript emit 链；不让所有测试启动编辑器；也不把 Bun 或类型检查结果当作 Cocos 场景挂载成功的替代证据。

**结果：** review 后实施必须提供 Bun 纯 TypeScript 与 Cocos Creator 两类独立证据。若后续测试需要 `cc`、Cocos 路径别名或编辑器装饰器语义，再通过独立工具链 change 重新评估 Vitest 或 Cocos 专用测试宿主。

## Risks / Trade-offs

- **[父级设计范围再次膨胀]** → 目录、公开 API 和任务清单都设置禁止项扫描，不创建 UI/资源/场景等占位类型。
- **[当前 strict 为 false 掩盖类型问题]** → 新代码仍按严格风格编写并运行项目现有类型检查；恢复 strict 作为独立配置 change，不在本切片混改。
- **[ApplicationContext 后续变成 Service Locator]** → 当前不提供任意查询 API，只允许 Composition Root 和 Module 生命周期持有。
- **[contracts 反向依赖 ApplicationContext 实现]** → 公开 Context、ApplicationState 与只读查询契约固定放在 `contracts/application`，Module 只允许 type-only 依赖该 contract。
- **[Framework 内部发生反向依赖]** → 架构测试覆盖内部依赖矩阵；core、contracts、application、diagnostics 和 adapters 分别使用明确 allowlist，Framework 全局禁止依赖 Game。
- **[异步生命周期竞争]** → 所有操作串行化并对 start/dispose 使用 single-flight，测试覆盖交错调用。
- **[模块回滚再次失败]** → 继续清理剩余模块，保留原始 cause 并聚合回滚错误。
- **[浅层 Logger 收到循环对象或敏感数据]** → 第一阶段明确禁止传入凭据和复杂对象，只记录受控生命周期字段；复杂安全处理延后到有真实载荷的独立 change。
- **[AppRoot 与 Cocos Adapter 重复监听或事件未解绑]** → 只有 Adapter 注册平台事件；startup.scene 只挂载一个 AppRoot，onDestroy 先要求 Adapter 解绑再 dispose，并通过场景冒烟测试检查。
- **[过早承诺公共 API]** → 根入口只导出当前消费者必需类型，内部 Graph/Runner 不公开。

## Migration Plan

1. 建立测试目录和最小 Framework 目录，通过 Cocos Creator 生成对应 `.meta`，不手工创建或复制 UUID。
2. 先补齐 Framework 内外依赖矩阵测试，再以失败测试定义 Logger contract、ApplicationContext contract、ModuleGraph、ModuleRunner 和 Application 行为，逐项实现纯 TypeScript 内核。
3. 在空 Module 数组和测试 Module 数组下验证完整生命周期及失败回滚。
4. 新增可替换的 Cocos Application Adapter，再新增只承担 Composition Root 的 AppRoot，并通过 Cocos Creator 编辑器挂载到 `startup.scene`；不修改现有 Canvas 为业务 UI。
5. 执行 Bun 纯 TypeScript 测试、项目类型检查和 Cocos Web Desktop 启动/销毁冒烟验证；pause/resume 只验证 Adapter 的基础前后台映射，不阻塞 initialize/start/stop/dispose 主路径 review。
6. 审查最终差异，确认不存在明确禁止系统、空 Manager、第三方运行时依赖或生成目录修改。

回滚以文件组为单位：若纯 TypeScript 内核未通过测试，移除新 Framework 文件并保持原场景可打开；若 AppRoot 集成失败，通过 Cocos Creator 编辑器移除组件并恢复启动场景引用。当前没有业务代码、玩家数据或既有 Framework API，因此不需要数据迁移或兼容层。

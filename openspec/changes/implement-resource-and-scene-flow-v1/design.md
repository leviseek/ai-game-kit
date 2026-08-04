## Context

Foundation 已提供 Application 生命周期、Module 编排、`DisposeHandle`、结构化日志、FSM 与对象池，且 `assets/framework` 保持纯 TypeScript 内核与 Cocos Adapter 分层。`platform-time-scheduling` 已完成平台契约、三种时钟与被动调度器。当前 Framework 缺少资源所有权与场景流转边界：业务只能直接调用 Cocos `assetManager.loadBundle()` 或 `resources.load`，无法表达并发去重、作用域释放和 Bundle 卸载判断。ADR-004 已确立 Bundle First 策略与 Bundle 规划（`boot`/`common`/`ui`/`audio`/`game-content`），`create-game-framework-v1` 总计划第 5 节要求以"引擎无关资源层 + Cocos Bundle 适配器 + SceneFlow"补齐该能力。

本设计对应 `proposal.md`、`specs/resource-management/spec.md` 与 `specs/scene-flow/spec.md`，承接总计划任务 5.1–5.7。

## Goals / Non-Goals

**Goals:**

- 以引擎无关的资源 handle 表达加载结果，业务只通过统一 `IResourceProvider` 访问资源。
- 以加载协调器实现并发去重、失败传播、取消等待者和多作用域共享底层加载结果。
- 以资源作用域表达所有权，支持页面/场景/应用逆序释放，引用保留与 Bundle 可卸载判断。
- 以 Cocos Asset Bundle 适配器落地 ADR-004，保留底层错误 cause 与资源标识，禁止业务直接调 `assetManager.loadBundle()`。
- 以 `SceneFlow` 编排预加载、进度、切换、失败保留、重试与作用域释放，并通过 Cocos 场景适配器映射到 `cc.director.loadScene`。
- 通过 Cocos Creator 建立最小 `common`、`ui`、`audio` 与游戏内容 Bundle，保持 `resources` 仅含启动资源。

**Non-Goals:**

- 不实现 FairyGUI package 注册与 View 生命周期、页面级资源自动释放联动，该能力依赖后续 UI change。
- 不实现通用 Scope 父子关系、异步 dispose、资源缓存驱逐策略或 LRU。
- 不实现加载优先级、进度条 UI、跨场景业务状态迁移或场景名路由注册表。
- 不修改 `ApplicationContext`、`startup.scene` 序列化、既有 `.meta` UUID 与 Creator 生成目录。
- 不实现音频分组策略、配置 Bundle 加载或存档存储；这些能力分属总计划第 6、7 节。

## Decisions

### 1. 资源 handle 只表达加载结果，不暴露引擎 Asset

资源 handle 携带资源标识、归属 Bundle 标识、加载状态与已解析的底层资源（Cocos 侧为 `Asset` 的窄包装）。handle 由加载协调器返回，业务持有 handle 参与作用域计数；跨模块协作只依赖 handle 与标识，不直接传递 `cc.Asset` 类型。

**理由：** 让规则层在纯 TypeScript 下可测试，并把"拿到底层资源"延迟到 Adapter 边界，避免 `cc` 类型泄漏进 `core` 与 `contracts`。

**未采用方案：** 不把 `cc.Asset` 直接作为公共契约；不按 `load(path)` 单函数抽象，因为那无法表达 Bundle 归属与作用域所有权（对应总计划设计 6 的未采用方案）。

### 2. 加载协调器以"资源键 → 共享加载期"去重，失败广播给全部等待者

协调器维护资源键到共享加载期的映射。本 Change 资源键为 Bundle + 路径的单文件模型，但键结构 MUST 为 FairyGUI package 预留类型维度（如 `kind: "asset" | "fairygui-package"`），使后续 package 可复用协调器、作用域与引用计数，只是键空间不同。首个请求触发底层加载，后续请求复用同一加载期；加载完成后分发结果给所有等待者。失败只分发一次并通知全部等待者，保留 cause 与资源标识。等待者的取消（所属作用域释放或显式取消）只移除其自身回调，不影响其他等待者。

**理由：** 并发去重与失败广播是资源系统的核心可测试行为；共享加载期同时天然支持多作用域共享同一底层资源。

**未采用方案：** 不使用每请求独立加载（会导致重复下载与多份实例）；不引入依赖图调度（本 Change 无跨资源依赖，FairyGUI 依赖排序留给 UI change）。

### 3. 资源作用域以"持有列表 + 全局引用计数"实现，Bundle 引用归零才可卸载

每个作用域记录自身持有的资源 handle 并可按逆序释放；框架维护每个底层资源/Bundle 的全局引用计数。作用域释放时释放其持有项，引用计数递减；Bundle 引用归零后允许卸载并实际卸载（由 Adapter 执行）。仍被其他作用域引用的资源不被释放。作用域之间无父子关系，"从内到外逆序释放"是调用方的约定顺序而非结构层级。

所有权转移（如 SceneFlow 成功切换时把预加载资源交给目标场景作用域）MUST 采用"先在新作用域增持、再在旧作用域释放"的顺序，避免中间引用归零触发误卸载；该顺序 MUST 由测试显式锁定。

**理由：** 总计划设计 6 明确"以页面/场景作用域为主、引用计数为辅"；该模型可独立测试且能避免过早释放仍被使用的资源，转移采用先增后减保证过程不中断所有权。

**未采用方案：** 不建立通用 Scope 父子树（DisposeHandle 已足够表达释放，父子与异步聚合在 UI change 前不锁定）；不做自动所有者发现或隐式引用计数。

### 4. `IResourceProvider` 是唯一入口，Cocos Asset Bundle 适配器负责引擎交互

`contracts/resource` 定义 `IResourceProvider`：创建资源作用域、加载、预加载、释放作用域、查询 Bundle 可卸载状态。资源作用域由 Provider 的创建入口产生，Provider 持有作用域集合；业务不直接实例化作用域对象。Cocos Adapter 内部使用 `assetManager`，把 Bundle 卸载判断映射到引用计数与 `bundle.releaseAll`/`assetManager.removeBundle` 语义，并在失败时包装保留 cause 与资源标识。业务与框架核心只依赖契约。

**理由：** ADR-004 明确禁止业务直接调 `assetManager.loadBundle()`；契约边界让纯 TypeScript 测试可以注入内存适配器。

**未采用方案：** 不把 `assetManager` 包装成全局单例静态类；不把 Cocos Bundle 对象本身作为公共契约暴露。

### 5. `SceneFlow` 用既有 FSM 表达流转状态，场景适配器只做薄映射

`SceneFlow` 复用 `core/fsm/StateMachine` 表达 `idle -> preloading -> transitioning -> active`（含 `failed`）的确定性转移，实现预加载、进度上报、成功激活、失败保留当前场景与重试。`core/scene` 编排逻辑不依赖 Cocos；Cocos 场景适配器仅把激活/释放映射到 `cc.director.loadScene` 与场景资源持有。

FSM 只表达已确认的离散状态转移（同步 `send` 且转移期间禁止重入）；预加载与场景激活是异步过程，其完成或失败 MUST 由回调转换为 FSM 事件再 `send`，FSM 内部不管理异步期。流转作用域释放负责取消异步任务并解除订阅，且释放后 FSM 停止接收事件、不再回退状态。

**理由：** FSM 已通过 27 个测试锁定状态一致性、失败回滚与重入拒绝，直接复用可保证场景流转在失败后不残留半激活状态，避免为流程再造一套状态管理。

**未采用方案：** 不在 `SceneFlow` 内置切换动画、渐变或异步队列；不把场景名注册表做进内核（属于游戏层组合，见总计划第 9 节收口）。

### 6. Bundle 划分落地 ADR-004，`resources` 仅保留启动资源

在 Cocos Creator 中按 ADR-004 建立 `common`、`ui`、`audio` 与游戏内容 Bundle；`boot` 与 `resources` 只保留启动所需的最小配置/诊断资源。本 Change 只建立最小占位资源与目录结构，具体游戏内容由后续能力填充。

**理由：** ADR-004 的 Bundle First 策略要求资源访问统一走 Provider；先落目录与最小 Bundle 可尽早暴露加载/释放路径，避免后期大迁移。

**未采用方案：** 不把所有内容继续放入 `resources`（违反 ADR-004）；不在本 Change 引入 FairyGUI package 资源清单（留给 UI change）。

## Risks / Trade-offs

- **[引用计数与作用域释放顺序错误导致资源泄漏或过早释放]** → 以作用域为主、引用计数为辅，并用 5.3 的逆序释放与共享引用测试锁定；Cocos 侧卸载只发生在引用归零后。
- **[加载中取消与失败广播竞态]** → 取消只移除等待者回调，共享加载期仍由首个请求持有；测试覆盖"取消后其他等待者仍收到结果/失败"。
- **[SceneFlow 复用 FSM 增加状态转移理解成本]** → 转移表保持窄小，`failed` 与 `idle` 语义在测试中显式锁定，避免与业务 FSM 混用。
- **[Cocos 场景切换是异步且引擎细节多]** → 适配器只做映射，失败经编排层转为场景保留；Web Desktop 冒烟验证作为最终门禁。
- **[`resources` 清理与 Creator 编辑器操作耦合]** → 只手工建立 Bundle 目录和最小资源，不编辑 `.meta` 与 scene 序列化；Bundle 归属差异记录为验证结果。

## Migration Plan

1. 先新增失败测试与纯 TypeScript 契约（资源 handle、协调器、作用域、`IResourceProvider`、SceneFlow），确认现有 Foundation 测试仍可运行。
2. 实现引擎无关资源层与内存适配器，再实现 Cocos Asset Bundle 适配器与场景适配器。
3. 在 Cocos Creator 中建立最小 Bundle 目录并完成 Web Desktop 场景切换冒烟验证。
4. 通过 Bun foundation 测试、Foundation 类型检查与依赖边界检查；归档前同步总计划 5.1–5.7 证据，若产生新的长期架构决策则按项目规则创建 ADR。

回滚按模块移除新增资源/场景代码与测试，保留 Foundation 已完成的 Application、FSM、对象池与 AppRoot；`startup.scene` 与既有 `.meta` 不做破坏性迁移。

## Open Questions

- 资源加载是否需要优先级/并发上限：当前无性能数据，推迟到第 8 节组合验证后再定，不改变本设计契约。
- SceneFlow 是否需要在切换完成后保留上一场景短暂驻留：涉及具体游戏体验，留到 UI 与组合验证阶段决定。
- FairyGUI package handle 与单文件 handle 的关系：本 Change 只在资源键上预留 `kind` 维度，package 的依赖排序、注册与 View 生命周期由后续 UI change 定义，两者如何共享引用计数届时确认。

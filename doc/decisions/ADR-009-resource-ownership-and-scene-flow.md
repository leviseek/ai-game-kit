# ADR-009 Resource Ownership, Coordination and Scene Transition

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 第 5 节需要资源所有权与场景流转边界。ADR-004 已确立 Bundle First 资源策略（`IResourceProvider` 唯一入口、禁止业务直接调用 `assetManager.loadBundle()`、Bundle 规划 `boot`/`common`/`ui`/`audio`/`game-content`），但只声明了"生命周期清晰"，从未定义资源所有权模型、加载协调语义与场景流转编排。本 ADR 记录 change `implement-resource-and-scene-flow-v1` 产生的长期架构决策，并显式标注与 ADR-004（Bundle First 落地）、ADR-008（FSM 复用基础）、ADR-002（FairyGUI package 选型）的关系。

不记录这些决策的风险与 ADR-006 背景一致：未来重构（如 UI/音频/存档引入重载、驱逐或缓存策略）可能在无感中改变既定行为预期。

## 决策

### 1. 资源加载协调语义：键去重共享加载 + 终态缓存 + invalidate

`contracts/resource/Resource.ts` 定义资源 handle：资源键（`kind`/`bundle`/`path` 三要素）、加载状态（`loading`/`ready`/`failed`/`cancelled`）、`done` 永不 reject（读取 `state` 与 `error` 判断结果）、`cancel()` 只 detach 自身等待。

`core/resource/LoadCoordinator.ts` 以资源键为维度维护共享加载期：同一键并发请求共享一次底层加载；失败广播给全部等待者并保留 cause 与资源标识；等待者取消不影响其他等待者。已落定的终态（`ready`/`failed`）缓存在协调器实例生命周期内，或经显式 `invalidate` 失效。

`invalidate(key)` 是精妙且反直觉的失效语义：**只驱逐 `ready`/`failed` 终态；`loading` 中的共享加载不做驱逐（避免破坏并发去重）；未知键为 no-op**。场景重试与卸载后同键重载必须先 `invalidate` 再 `load`，保证走新的底层加载。

资源键保留 `kind` 维度（`"asset" | "fairygui-package"`），为 FairyGUI package 键空间预留（呼应 ADR-002），后续 package 可复用协调器、作用域与引用计数，只是键空间不同。

**理由：** 并发去重与失败广播是资源系统的核心可测试行为；终态缓存让晚加入等待者立即获得结果；失效策略显式交付给有真实重载需求的场景流转，避免在错误假设上过早实现驱逐。

**未采用方案：** 不使用每请求独立加载（导致重复下载与多份实例）；不引入依赖图调度（本 Change 无跨资源依赖，FairyGUI 依赖排序留给 UI change）。

### 2. 资源作用域所有权模型：持有列表 + 全局引用计数

`contracts/resource/ResourceScope.ts` 与 `core/resource/ResourceScope.ts` 定义作用域所有权：每个作用域记录自身持有的资源 handle 并可按逆序释放；框架维护每个底层资源/Bundle 的全局引用计数。Bundle 在"已就绪资源引用全部归零 **且无进行中加载**"时才执行卸载（由 Adapter 注入的 `unloadBundle` 执行器完成）。

作用域之间无父子关系，"从内到外逆序释放"是调用方的约定顺序而非结构层级。所有权转移（如 SceneFlow 成功切换时把预加载资源交给目标场景作用域）MUST 采用"先在新作用域增持、再在旧作用域释放"的顺序，避免中间引用归零触发误卸载。

**理由：** 以作用域为主、引用计数为辅；引用归零且无进行中加载才卸载，避免过早释放仍被使用或仍在加载的资源。所有权转移先增后减保证过程不中断持有。

**未采用方案：** 不建立通用 Scope 父子树（`DisposeHandle` 已足够表达释放）；不做自动所有者发现或隐式引用计数。

### 3. 资源访问契约边界：ADR-004 的契约落地

`contracts/resource/ResourceProvider.ts` 定义 `IResourceProvider` 为业务访问资源的唯一入口，形态为 `createScope`/`load`/`preload`/`canUnload`/`invalidate`/`dispose`。`ResourceProviderOptions` 定义引擎接缝：`loader`（按资源键执行一次真实加载）与 `unloadBundle`（Bundle 无持有且无进行中加载时执行引擎级卸载）。

Cocos Asset Bundle 适配器（`adapters/cocos/resource/CocosResourceProvider.ts`）把 bundle 加载映射到 `assetManager.loadBundle` + `bundle.load`，卸载映射到 `bundle.releaseAll` + `assetManager.removeBundle`；失败保留底层 cause 与资源标识。Cocos 场景适配器（`adapters/cocos/scene/CocosSceneAdapter.ts`）把 `SceneFlow` 的激活映射到 `cc.director.loadScene`，只做薄映射。

唯一入口与 Bundle 划分属 ADR-004 落地，本决策只补充其未定义的契约形态。

**理由：** 契约边界让纯 TypeScript 测试可注入内存适配器；引擎交互只在 Adapter 层，`core` 与 `contracts` 不依赖 Cocos。

**未采用方案：** 不把 `assetManager` 包装成全局单例静态类；不把 Cocos Bundle 对象本身作为公共契约暴露。

### 4. SceneFlow 场景流转编排：复用 FSM，失败保留当前场景

`core/scene/SceneFlow.ts` 复用 ADR-008 的 `StateMachine` 表达确定性状态转移：状态集 `idle`/`preloading`/`transitioning`/`active`/`failed`。转移表为 `idle --start--> preloading`、`preloading --preloaded--> transitioning`、`preloading --preloadDone--> idle`（预加载完成不切换时回 idle）、`preloading --failed--> failed`、`transitioning --activated--> active`、`transitioning --failed--> failed`、`active/failed --start--> preloading`（再次发起切换或失败后重试）。预加载与激活是异步过程，其完成或失败由回调转换为 FSM 事件再 `send`；FSM 内部不管理异步期，释放后停止接收事件、不回退状态。

关键编排语义：

- **失败保留当前场景**：切换失败时当前场景对象不被释放，编排层回到可再次发起切换的状态（`failed --start--> preloading`），失败上报带原因与场景标识。
- **重试重新走流程**：重试重新执行预加载与切换，上一次失败期间创建的预加载资源随流转作用域释放，不残留半激活状态。
- **切换中拒绝重复请求**：`preloading`/`transitioning` 期间重复 `switchTo` 被拒绝并返回原因。
- **每次切换（非复用路径）/预加载先 `invalidate` 再 `load`**：命中决策 1 的失效语义，保证重试与切换走新的底层加载；命中 preload 复用分支时跳过 invalidate 与重新加载。
- **单 FSM 下 preload 与 switchTo 互斥**：`preloading`/`transitioning` 期间重复 `switchTo` 被拒绝、进行中 preload 期间再次 `preload` 被跳过（`SceneFlow` 以单一 FSM 状态表达流转，不区分"后台预加载"与"前台切换"）。"后台预加载的同时发起切换"在本决策下不可行，如未来需要真正后台化须为 preload 引入独立状态。
- **preload 结果跨 switchTo 复用**：预加载完成的资源保留在流转作用域；`switchTo` 命中同场景（`sceneId` + `bundle`/`paths` 一致且全部 `ready`）时跳过 invalidate/重新加载，直接激活并转移所有权。该行为修复"预加载结果被丢弃 + 卸载 → 重载抖动"缺陷，是 `switchTo` 的默认行为契约。

Cocos 场景适配器只做 `cc.director.loadScene` 薄映射，场景资源所有权与释放仍由 `SceneFlow` 通过资源提供者管理。

复用 FSM 本身是 ADR-008 落地，本决策只记录编排语义。

**理由：** FSM 已锁定状态一致性、失败回滚与重入拒绝，直接复用保证场景流转失败后不残留半激活状态，避免为流程再造一套状态管理。

**未采用方案：** 不在 `SceneFlow` 内置切换动画、渐变或异步队列；不把场景名注册表做进内核（属于游戏层组合，见总计划第 9 节收口）。

## 理由

- 资源 handle 契约、终态缓存与 `invalidate` 失效语义是跨模块必须遵循的公开 API 语义；未来 UI/音频/存档重载若不知此语义，可能无感改变行为（呼应 ADR-006 的判断标准）。
- 资源作用域所有权模型（引用归零 + 无进行中加载才卸载、所有权转移先增后减）影响所有后续能力对资源生命周期的预期。
- `IResourceProvider` 契约形态与引擎接缝是 ADR-004 未定义的公开 API 面，必须成文以明确边界。
- SceneFlow 编排语义（失败保留、重试、切换拒绝、preload 复用）是长期行为契约，非实现细节。

## 影响

- 后续 UI、音频、配置与存档 Change 必须经 `IResourceProvider` 与资源作用域访问资源，不得绕过或直接调用引擎 Bundle API。
- 未决能力作为独立 change：LRU/驱逐策略、加载优先级、FairyGUI package 生命周期与 View 注册、跨场景业务状态迁移。
- 根入口新增稳定符号一律同步 `expectedRootExports` 白名单（既有约定，不再展开）。
- AppRoot 作为 persist root 持有 SceneFlow 属组合根装配细节，不进本 ADR；单向冒烟约定与已知限制（回切需 `removePersistRootNode`、`builder.json` 场景注册）记录于 change 任务清单。

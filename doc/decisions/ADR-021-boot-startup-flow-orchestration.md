# ADR-021 Boot Startup Flow Orchestration and Preload Layering

## 状态

Accepted

## 背景

`assets/boot/AppRoot.ts` 长期同时承载装配、启动编排、UI 根初始化、GameLobbyHost 宿主、URL 冒烟分派与四个大型冒烟序列（1043 行），启动流程也不合理：startup 场景立即初始化 fgui 的 GRoot（GRoot 随场景切换销毁、全生命周期重复创建），列表页打开时机与场景归属混乱，且没有预加载分层。需求是把组合根瘦身为"装配 + 委托 + 清理"，并建立清晰的启动流程：logo（纯原生）→ startup 阶段（热更 + 框架级预加载，零 GRoot）→ game 场景（GRoot 首次初始化 + 默认主入口 + 按需会话加载）。

本 ADR 记录 change `refactor-boot-startup-flow` 产生的长期架构决策：启动编排器放 boot 层、场景映射显式清单、GRoot 初始化时机分叉、框架级预加载分层与默认单向切换。既有 ADR-009（SceneFlow 语义）、ADR-010（导航/模态）、ADR-018（夹具内核边界）、ADR-020（大厅编排）分别覆盖资源流转、导航、夹具边界与品类会话；本 ADR 只记录本次新增的启动编排层与 UI 根初始化时机约束。

## 决策

### 1. 启动编排器 BootFlow 放 `assets/boot/flow/BootFlow.ts`，场景映射放 `assets/game/fixture/scene.ts` 显式清单

`BootFlow` 是状态机驱动的启动编排器（`logo → hotupdate(占位) → framework-preload → dispatch`），消费 UI 宿主能力与场景流转（boot 装配对象），故放 boot 层；不能放 framework（framework 禁依赖 game）、不能放 game（game 禁反向依赖 boot）。场景映射（sceneId → bundle/paths）是游戏层元数据，放 `assets/game/fixture/scene.ts` 显式清单，AppRoot/BootFlow 经 `game/fixture` 薄转发消费，延续 ADR-020 口径。

**理由：** 编排逻辑直接留 AppRoot 会复现"组合根承载业务编排"的反模式；放 framework/game 都违反依赖方向（ADR-005）。场景映射作为单一数据源，保证 `preload` 与 `switchTo` 使用同一份 bundle/paths 清单，避免复用判定因两处不一致而失效。

**未采用方案：** 编排逻辑留在 AppRoot（现状，耦合不解决）；放 framework 或 game（违反依赖方向）。

### 2. GRoot 初始化时机分叉：默认流程推迟到 game 首次呈现，冒烟路径保持 startup

默认流程下 BootFlow 不在 startup 初始化 GRoot：logo 为纯原生 cc 节点，框架级预加载走资源层操作（`provider.loadPackage`/`load`，与 GRoot 无关）；`switchTo("game")` 后由 game 场景激活回调触发首次 `UiHost.init` + 打开列表页。冒烟路径（URL 带 smoke/fixture）在 startup 立即 `UiHost.init` 照旧执行。

**理由：** fgui 的 GRoot 挂在当前场景 Canvas 下、随场景切换销毁（`GRoot.create` 挂 `director.getScene()`，`onDestroy` 置 `_inst=null`）。startup 建一次、切 game 销毁重建一次会让 UI 根全生命周期重复创建；推迟到 game 后默认流程只初始化一次。`CocosUiRoot` 的 GRoot 获取接缝已支持 `try GRoot.inst catch → GRoot.create()`，scene 切换后首次调用即重建、幂等，无需额外基础设施。

**未采用方案：** 保持 startup 立即初始化（旧行为，GRoot 重复创建）；引入第三个过渡场景做 UI 根重建（本 change 不做多段切换）。

### 3. 框架级预加载分层：L0 常驻走 uiScope，L1 场景流转走 SceneFlow 单槽位，L2 会话按需

- **L0 常驻**（Common/config）：logo 期经 `ensureSharedUiDependencies` 模式加载进全局 `uiScope` 常驻（同 key 幂等，`LoadCoordinator` 缓存终态），**不走 SceneFlow**，不随场景切换释放。
- **L1 场景流转**（game 场景资源）：logo 期或切换前经 `SceneFlow.preload("game", sceneMap.game)`（单槽位）预加载、`switchTo` 复用。
- **L2 会话**（品类包）：进入品类时经会话作用域加载、退出全量释放（ADR-020 决策 3 既定模型），不预加载。
- **L3 不预加载**：其余内容不做预加载。

**理由：** `SceneFlow.preload` 是单槽位（`preloadedSceneId`/`preloadedHandles` 仅一组），`SceneResources` 是单 bundle；常驻资源（Common/config）若走 SceneFlow 会占槽位且随流转作用域释放。品类包预加载会破坏会话卸载模型（`canUnload` 恒 false）。

**未采用方案：** 全部预加载走 SceneFlow（占单槽位 + 常驻资源随流转释放）；品类包提前预加载（破坏 L2 会话卸载）。

### 4. 默认流程单向 startup → game，不提供回切

`AppRoot` 经 `addPersistRootNode` 常驻跨场景存活；默认流程 `switchTo("game")` 单向切换，game 场景不挂 AppRoot。回切 startup 会重复实例化组合根（第二个 AppRoot），不在支持范围；game 场景激活后 BootFlow 执行"UiHost.init → 打开列表页"。

**理由：** 单次切换规避 GRoot 重复创建与组合根重复实例化；回切语义依赖"场景激活 → UI 根重建 → 页面重开"基础设施，留待未来真实需求（如新场景）时再引入。

**未采用方案：** 支持 startup ↔ game 双向切换（回切会重复实例化组合根，风险大于收益）。

## 理由

- 启动编排层归属（boot）与场景映射归属（game/fixture）是本次重构最核心的长期边界决策：编排器消费 boot 装配对象、映射是游戏层元数据，二者各归其位，延续 ADR-005/018/020 的依赖方向与薄转发约定。
- GRoot 初始化时机分叉直接影响 UI 根全生命周期创建次数，是后续场景增多时必须遵守的约束（默认流程只初始化一次）。
- 预加载分层（L0/L1/L2）定义了资源何时、以何种作用域加载，是资源生命周期模型的补充，与 ADR-009/020 的 SceneFlow 与会话作用域语义互补。

## 影响

- 新增场景需在 `assets/game/fixture/scene.ts` 登记（sceneId → bundle/paths），默认流程的单向切换不变；未来引入第三个场景须先建"场景激活 → UI 根重建 → 页面重开"基础设施。
- 默认流程下 GRoot 只在 game 首次呈现时初始化一次；冒烟路径（URL smoke/fixture）保持 startup 立即初始化（dev 分叉）。CDP 冒烟命令依赖的 `[ui-smoke]`/`[scene-smoke]` 等 console 标记保持不变。
- 热更下载引擎（version.manifest/增量/回滚）不实现，热更阶段为启动流程占位（Web 静默跳过），归独立 OpenSpec change。
- 新增启动编排与宿主模块（`boot/flow|host|smoke/`、`game/fixture/scene.ts`）不违反 public-boundary 与 task68-scope-review 机械约束；`framework/core` + `contracts` 零改动（ADR-018 口径）。

## Context

动机见 proposal.md - Why。当前 `assets/boot/AppRoot.ts`（1043 行）承担装配、启动编排、UI 根初始化、GameLobbyHost 宿主、URL 冒烟分派与四个大型冒烟序列。关键约束：

- 依赖方向被 `public-boundary.test.ts` 与 `task68-scope-review.test.ts` 机械锁定：`boot` 目录整体放行（public-boundary 只放行组合根所在目录），`task68-scope-review` 只锁 `AppRoot.ts` 单文件的 import 白名单（禁 import `game_`/`fairygui`/非 fixture 的 `game`）。因此新增 `assets/boot/flow|host|smoke/` 子模块不违反机械约束，但 `AppRoot.ts` 自身 import 白名单必须守住。
- FairyGUI `GRoot` 挂在当前场景 Canvas 下、随场景切换销毁（`fairygui.mjs` 中 `GRoot.create` 挂 `director.getScene()` 下，`onDestroy` 置 `_inst=null`）。切场景后必须重建 UI 根。
- `SceneFlow.preload` 是单槽位（`preloadedSceneId`/`preloadedHandles` 仅一组），`SceneResources` 是单 bundle。常驻资源（Common/config）不应走 SceneFlow，否则占槽位且随流转作用域释放。
- `ResourceScope` + 引用计数：Common/列表页走全局 `uiScope` 常驻；品类包走会话 scope，退出全量释放、退出后 `canUnload`（ADR-020）。
- 现有 `runSceneFlowSmoke` 只做单向 startup → game（回切 startup 会实例化第二个 AppRoot）。
- `.ai/instructions.md` 第 2 条：新文件 ≤300 行。
- 冒烟 console 标记（`[ui-smoke]`/`[scene-smoke]`/`[modal-click]`/`[card-battle]`/`[fixture-*]`）被 `tools/creator/commands/*.ts` CDP 命令依赖，必须原样保留。

## Goals / Non-Goals

**Goals:**

- AppRoot 瘦身为"装配 + 委托 + 清理"（~250 行），职责外移。
- 建立启动流程：startup（logo 纯原生、热更占位、框架级预加载，零 GRoot）→ 默认单向 `switchTo("game")` → game 首次呈现初始化 GRoot 并打开默认主入口。
- GRoot 在默认流程下全生命周期只初始化一次；冒烟路径保持 startup 立即初始化（dev 分叉）。
- 预加载分层：L0 常驻（Common/config，uiScope/应用生命周期）、L1 场景流转（game 场景资源，SceneFlow 单槽位）、L2 会话（品类包，按需）、L3 不预加载。

**Non-Goals:**

- 不实现热更新下载引擎（version.manifest/增量/回滚）——热更仅启动流程占位阶段，归独立 OpenSpec change。
- 不做多段场景切换基础设施（startup→preload→game 的中间 preload 场景不引入；hall 场景不引入）。
- 不改 `framework/core` + `contracts`（ADR-018 口径）。
- 不改 `startup.scene` / `game.scene` 内容与名称（冒烟断言锁定 `"game"` 名称）。

## Decisions

### D1. 启动编排器 BootFlow 放 `assets/boot/flow/BootFlow.ts`，场景映射放 `assets/game/fixture/scene.ts`

BootFlow 是状态机驱动的启动编排器：`logo → hotupdate(占位) → framework-preload → dispatch`。它需要调用 UI 宿主能力与场景流转（boot 装配对象），又不能放 framework（framework 禁依赖 game）、不能放 game（game 禁反向依赖 boot），故放 boot。场景映射（`game` 场景 + `ui` bundle 资源路径）是游戏层元数据，放 `game/fixture/scene.ts` 显式清单（仿 `LOBBY_LIST_ENTRY`/`gameTypeCatalog` 模式），AppRoot/BootFlow 经 `game/fixture` 薄转发消费，延续 ADR-020 口径。

**替代方案：** 编排逻辑直接留 AppRoot（现状，耦合不解决）；放 framework 或 game（都违反依赖方向）。

### D2. URL 冒烟分派抽到 `boot/flow/SmokeRouter.ts`，冒烟序列拆到 `boot/smoke/*.ts`

`SmokeRouter` 解析 URL，命中冒烟参数则执行对应 `boot/smoke/<name>.ts` 序列，否则走默认流程。冒烟序列运行在 startup 场景、可初始化 GRoot（dev 分叉）。`[xx-smoke]` console 标记原样保留。

**理由：** 把"分派"与"序列实现"从 AppRoot 剥离，AppRoot 只持 BootFlow 引用。冒烟需要 GRoot/页面适配器（boot 装配对象），不能下沉 game。

### D3. UI 宿主抽到 `boot/host/UiHost.ts`，GameLobbyHost 抽到 `boot/host/GameLobbyHostImpl.ts`

`UiHost` 封装 `initializeUiRoot` + `ensurePageAdapter`（GRoot 七层容器 + resize 订阅），AppRoot 与 BootFlow 共用。`GameLobbyHostImpl` 实现 `openEntryPage`/`closeEntryPage`/`ensureSharedUiDependencies`（Common 加载），AppRoot 保留薄代理（现有测试锁定 AppRoot 有 `openEntryPage`/`closeEntryPage`/`ensureSharedUiDependencies`）。两者依赖 resourceProvider/pageAdapter/navigator（boot 装配对象），不能下沉 game。

### D4. GRoot 初始化时机分叉：默认流程推迟到 game，冒烟路径保持 startup

默认流程下 BootFlow 不在 startup 初始化 GRoot——logo 纯原生 cc 节点，框架级预加载走 `provider.loadPackage`/`load`（资源层操作，与 GRoot 无关）；`switchTo("game")` 后由 game 场景激活回调触发首次 `UiHost.init` + 打开列表页。冒烟路径（URL 带 smoke/fixture）在 startup 立即 `UiHost.init` 照旧执行。

**理由：** 避免 GRoot 在 startup 建一次、切 game 销毁重建一次；默认流程下全生命周期只初始化一次。fgui 的 GRoot 获取接缝已支持 `try GRoot.inst catch → GRoot.create()`（`CocosUiRoot.ts:63-69`），scene 切换后首次调用即重建，幂等。

### D5. 框架级预加载走 uiScope 常驻，不走 SceneFlow

`Common/Common` 与框架配置在 logo 期经 `ensureSharedUiDependencies` 模式加载进全局 `uiScope` 常驻（同 key 幂等，`LoadCoordinator` 缓存终态）；game 场景资源在 logo 期或切换前经 `SceneFlow.preload("game", ...)`（单槽位）预加载、`switchTo` 复用。品类包不预加载，进入品类时按会话 scope 加载。

**理由：** SceneFlow.preload 单槽位且流转作用域随切换释放；Common/config 需要跨场景常驻，混入会占槽位 + 反复重载。品类包预加载会破坏会话卸载模型（`canUnload` 恒 false）。

### D6. 默认流程单向，不提供回切

startup → game 单向切换，game 场景不挂 AppRoot（AppRoot 经 `addPersistRootNode` 常驻）；回切 startup 会重复实例化组合根，不在支持范围。game 场景激活后 BootFlow 执行"UiHost.init → 打开列表页"。

## Risks / Trade-offs

- **测试源码字符串锁定（最大风险）**：`approot-composition.test.ts` 用 `toMatch` 锁 URL 分支、`runSceneFlowSmoke`、`openListPageWithRetry`、`LOBBY_LIST_ENTRY`、`lobbyItemNodeName`、`ensureSharedUiDependencies` 调用顺序与 smoke 方法存在性。迁移必须同步改测试，把断言迁到新模块测试（`boot/smoke/router.test.ts`、`boot/host/*.test.ts`），否则 `test:foundation` 红。 → 任务拆分中显式包含"迁移断言"，逐模块同步改。
- **GRoot 随场景销毁**：默认流程下 startup 不建 GRoot、game 首次呈现重建一次，规避了重复重建；冒烟路径保持现状。若未来引入第三个场景，须先建"场景激活 → UI 根重建 → 页面重开"基础设施。 → 本 change 不做多段切换。
- **`switchTo` 复用判定**：默认流程若 logo 期 `preload("game")` 后再 `switchTo("game")`，需保证 bundle/paths 清单一致才能命中复用；若只 `switchTo` 不 preload，则全走加载流程（可接受）。 → 场景映射清单作为单一数据源（`game/fixture/scene.ts`），避免两处不一致。
- **AppRoot 薄代理与 task68 白名单**：抽取后 AppRoot 仍须守住 import 白名单（禁 `game_`/`fairygui`/非 fixture 的 `game`）；薄代理只委托 host/flow 模块，白名单反而更易满足。 → 任务里含 scope-review 断言保留验证。
- **CDP 冒烟标记**：抽取冒烟序列时 `[xx-smoke]` 标记若改动，headless 验证脚本断言失败。 → 冒烟序列纯搬移，标记逐字保留。

## Migration Plan

1. **阶段 1（零行为拆解）**：抽 `boot/host/` + `boot/smoke/` + `boot/flow/SmokeRouter.ts`，AppRoot 改薄代理。每个模块迁移同步改对应测试断言。门禁：`test:foundation` 全量、`typecheck`、`public-boundary`、`task68-scope-review`、CDP 冒烟（ui/scene/modal/card/fixture）。行为与现状等价，可单独回滚。
2. **阶段 2（BootFlow 编排）**：新增 `game/fixture/scene.ts` 场景映射 + `boot/flow/BootFlow.ts` 状态机（logo/热更占位/框架级预加载/默认 switchTo game + game 激活后初始化 UI 打开列表页）。默认无参启动行为从"startup 立即打开列表页"变为"logo → 预加载 → 切 game → 打开列表页"。门禁同阶段 1 + BootFlow 单测（memory 适配器驱动）+ `openspec validate --specs --strict`。
3. **阶段 3（预加载分层，可选）**：logo 期后台 preload game 场景资源（L1）+ Common/config（L0）加载时机确认。门禁同阶段 2。

回滚：阶段 1 为纯搬移，撤销 diff 即回滚；阶段 2 若启动流程出问题，回退 `AppRoot.start` 默认分支到 `openListPageWithRetry`。

## Open Questions

- logo 呈现素材（静态图 vs Tween 淡入动画）由美术/运营决定，不改变本设计（纯 cc 节点即可，native splash 由构建配置承担）。可在阶段 2 落地时确认，不影响 spec/任务拆解。
- 热更下载引擎的具体接入（何时检测 version、下载到 writablePath 后是否进程级重启）待独立 OpenSpec change 设计；本 change 仅预留阶段位与纯原生进度 UI 占位。

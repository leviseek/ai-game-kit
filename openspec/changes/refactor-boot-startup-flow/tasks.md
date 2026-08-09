## 1. 阶段 1：零行为拆解（AppRoot 1043 → ~400 行）

- [x] 1.1 新建 `assets/boot/host/UiHost.ts`：迁移 `initializeUiRoot`/`ensurePageAdapter`/`smokeUiInit`/`smokeUiReady` 实现（GRoot 七层容器 + resize 订阅），保持幂等与失败上报语义；AppRoot 改为薄代理。
- [x] 1.2 新建 `assets/boot/host/GameLobbyHostImpl.ts`：迁移 `openEntryPage`/`closeEntryPage`/`ensureSharedUiDependencies`/`ensureLobby` 实现；AppRoot 保留 `openEntryPage`/`closeEntryPage` 薄代理。
- [x] 1.3 新建 `assets/boot/smoke/ui-smoke.ts`：迁移 `runUiSmoke`，`[ui-smoke]` 标记逐字保留。
- [x] 1.4 新建 `assets/boot/smoke/scene-smoke.ts`：迁移 `runSceneFlowSmoke`，`[scene-smoke]` 标记逐字保留。
- [x] 1.5 新建 `assets/boot/smoke/modal-click.ts`：迁移 `runModalClickSmoke` 及 `__modalClick` 钩子清理逻辑，`[modal-click]` 标记逐字保留。
- [x] 1.6 新建 `assets/boot/smoke/card-battle.ts`：迁移 `runCardBattleSmoke`，`[card-battle]` 标记逐字保留。
- [x] 1.7 新建 `assets/boot/smoke/perf.ts`：迁移 `runFixturePerf` 分派与 `sampleProfilerStats`，`[fixture-perf]` 标记逐字保留。
- [x] 1.8 新建 `assets/boot/flow/SmokeRouter.ts`：迁移 `start()` 中 6 个 URL 分支解析（smoke=fairygui-ui/scene-flow/modal-click/card-battle、fixture、fixture-perf），分派到 `boot/smoke/*`。
- [x] 1.9 同步迁移 `tests/framework/foundation/approot-composition.test.ts` 中对 URL 分支、`runUiSmoke`/`runSceneFlowSmoke` 等方法名、`ensureSharedUiDependencies` 调用顺序与 `Common/Common` 路径的源码字符串断言到新模块测试（`tests/boot/` 或就近目录），保证 `test:foundation` 全绿。
- [x] 1.10 验证门禁：`bun run test:foundation`、`bun run test:foundation:types`、`bun run typecheck`、`public-boundary.test.ts`、`task68-scope-review.test.ts` 全绿；`framework/core` + `contracts` 零改动；AppRoot ≤400 行。
- [x] 1.11 运行 CDP 冒烟验证（ui-smoke / scene-smoke / modal-click / card-battle / fixture / fixture-perf），各 console 标记输出与迁移前一致。

## 2. 阶段 2：BootFlow 启动编排（AppRoot → ~250 行）

- [x] 2.1 新建 `assets/game/fixture/scene.ts`：显式场景映射清单（sceneId → bundle/paths），登记 `game` 场景的 `ui` bundle 资源；经 `assets/game/fixture/lobby.ts` 薄重导出，AppRoot/BootFlow 经 `game/fixture` 消费。
- [x] 2.2 新建 `assets/boot/flow/BootFlow.ts`：状态机编排 `logo → hotupdate(占位) → framework-preload → dispatch`；默认分支经 `sceneFlow.switchTo("game", sceneMap.game)` 单向切换，game 激活后触发 `UiHost.init` + 打开默认列表页（`openListPageWithRetry` 语义保留）；不提供回切 startup。
- [x] 2.3 BootFlow 框架级预加载：logo 期后台经 `ensureSharedUiDependencies` 模式加载 `Common/Common` 与框架配置到全局 `uiScope` 常驻（不走 SceneFlow）；game 场景资源经 `sceneFlow.preload`（单槽位）预加载、`switchTo` 复用。
- [x] 2.4 热更阶段占位：原生平台探测（Web no-op 静默跳过）+ 纯原生进度 UI 呈现占位（不依赖 fgui/Common）；下载引擎不实现（留待独立 change）。
- [x] 2.5 默认流程 GRoot 推迟：AppRoot 默认启动不再在 startup `initializeUiRoot`，UI 初始化推迟到 game 首次呈现；冒烟路径经 SmokeRouter 保持 startup 立即初始化（dev 分叉）。
- [x] 2.6 AppRoot 收尾：`onLoad/start/onDestroy` 改为委托 BootFlow + UiHost + GameLobbyHostImpl 薄代理；`openListPageWithRetry`/`openListPage` 移入 BootFlow 或 host 模块；AppRoot 收敛至 ~250 行，import 白名单不违反 task68。
- [x] 2.7 新增 BootFlow 单测（memory 适配器驱动）：默认无参启动走 logo → 预加载 → switchTo game → 打开列表页；URL smoke 参数优先；热更阶段 Web 跳过；GRoot 默认推迟到 game 首次呈现。
- [x] 2.8 同步修改 `game-lobby`/`fairygui-ui-adapter` delta 相关测试断言（默认入口打开时机、UI 根初始化时机分叉）。
- [x] 2.9 验证门禁：`bun run test:foundation`、`typecheck`、`public-boundary`、`task68-scope-review`、`openspec validate --specs --strict`；CDP 冒烟全通过。

## 3. 阶段 3：预加载分层与回归（可选，依赖阶段 2）

- [ ] 3.1 确认 L0 常驻（Common/config）与 L1 场景流转（game 资源 preload）加载时机与进度上报体验，必要时调整 logo 期预加载顺序。
- [ ] 3.2 验证资源释放闭环：默认流程切 game 后 startup 场景资源作用域已释放（canUnload 断言）；退出品类后品类包可卸载、列表包常驻。
- [ ] 3.3 全量回归：`bun run test:foundation`、`typecheck`、`public-boundary`、`task68-scope-review`、CDP 冒烟（默认 + smoke + fixture）全绿。

## 4. ADR 检查与归档

- [ ] 4.1 ADR 检查：检查本次重构是否产生新的架构决策（如"启动编排器放 boot 层"、"GRoot 初始化时机分叉"）；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 约定创建 ADR；如无，在归档说明中明确记录无需 ADR。
- [ ] 4.2 归档：`openspec archive-change`（或按 `openspec/config.yaml` 的 archive operations 执行），同步 delta specs 到主 specs，`openspec validate --specs --strict` 通过后归档。

## Why

AppRoot.ts（1043 行）同时承载装配、启动编排、UI 根初始化、GameLobbyHost 宿主、冒烟分派与四个大型冒烟序列，耦合过高且启动流程不合理：startup 场景立即初始化 fgui 的 GRoot（随场景销毁、全生命周期重复创建），列表页打开时机与场景归属混乱，无预加载分层。需要把组合根瘦身为"装配 + 委托 + 清理"，并建立清晰的启动流程：logo（纯原生）→ startup 阶段（热更 + 框架级预加载，零 GRoot）→ game 场景（GRoot 首次初始化 + 默认主入口 + 按需会话加载）。

## What Changes

- **BREAKING** 启动流程改为两场景单次切换：`startup.scene`（挂 AppRoot，纯引擎路径，零 GRoot）→ 默认分派 `SceneFlow.switchTo("game")` → `game.scene`（空壳，不挂 AppRoot）首次呈现时初始化 GRoot 并打开默认主入口（列表页）。
- GRoot / 页面适配器初始化从 AppRoot.start 推迟到 game 场景首次呈现，全生命周期只初始化一次；冒烟特殊路径（?smoke=* / ?fixture=*）保留在 startup 场景照旧初始化 GRoot 后执行（dev 分叉）。
- 启动编排抽到 `assets/boot/flow/BootFlow.ts`（状态机：logo → 热更阶段占位 → 框架级预加载 → 分派）；场景映射元数据（sceneId → bundle/paths）放 `assets/game/fixture/scene.ts` 显式清单，AppRoot 经 `game/fixture` 薄转发消费。
- 冒烟序列（runUiSmoke / runSceneFlowSmoke / runModalClickSmoke / runCardBattleSmoke）抽到 `assets/boot/smoke/*.ts`；URL 冒烟分派抽到 `SmokeRouter`。
- UI 根 / 页面适配器抽到 `assets/boot/host/UiHost.ts`；GameLobbyHost 宿主（openEntryPage / closeEntryPage / ensureSharedUiDependencies）抽到 `assets/boot/host/GameLobbyHostImpl.ts`。
- 预加载分层：logo 期后台加载 Common/Common 与框架配置（全局 uiScope / 应用生命周期常驻，不走 SceneFlow）；game 场景停留期经 `SceneFlow.preload`（单槽位）后台加载正式游戏内容；品类包保持会话作用域按需加载、不预加载。
- AppRoot 瘦身至 ~250 行，仅保留 assembleApp / onLoad / start（委托 BootFlow）/ onDestroy（逆序清理）/ 对 UiHost 与 GameLobbyHostImpl 的薄代理。
- 热更阶段占位：仅原生平台启用（Web no-op），UI 纯原生呈现（不依赖将被热更的 Common），不实现下载引擎（后续独立 change）。

## Capabilities

### New Capabilities

- `boot-startup-flow`: 启动编排流程：logo（纯原生零 GRoot）、热更阶段（占位）、框架级预加载、URL 冒烟分派、默认两场景单次切换、game 场景首次呈现时 GRoot 初始化与默认主入口打开。

### Modified Capabilities

- `game-lobby`: 默认入口打开列表页的时机与场景归属变化——默认无参启动先经启动流程切换到 game 场景，列表页在 game 场景 GRoot 首次初始化后打开，不再于 startup 场景立即打开。
- `fairygui-ui-adapter`: 新增 UI 根初始化时机约束——默认流程下推迟到 game 场景首次呈现时初始化（唯一一次）；冒烟特殊路径保持立即初始化。（scene-flow 能力本身不变，默认启动仅消费其现有 switchTo。）

## Impact

- `assets/boot/AppRoot.ts`：从 1043 行瘦身至 ~250 行，职责收敛。
- 新增 `assets/boot/flow/`（BootFlow、SmokeRouter）、`assets/boot/host/`（UiHost、GameLobbyHostImpl）、`assets/boot/smoke/`（4 个冒烟序列）、`assets/game/fixture/scene.ts`（场景映射清单）。
- `tests/framework/foundation/approot-composition.test.ts` 与 `service-registry-composition.test.ts` 等测试有源码字符串断言锁定 AppRoot 实现细节，需同步迁移/修改。
- `framework/core` + `contracts` 零改动（ADR-018 口径）；public-boundary / task68-scope-review 机械约束保持不破坏。
- `assets/boot/startup.scene` 内容不变（logo 由运行时 cc 节点呈现）；`assets/game/game.scene` 保持空壳（不挂 AppRoot）。
- 冒烟 console 标记（`[ui-smoke]` / `[scene-smoke]` / `[modal-click]` / `[card-battle]` / `[fixture-*]`）保持不变，CDP 命令依赖不受影响。

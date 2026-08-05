## 1. 资源 handle 与加载协调器

- [x] 1.1 先编写加载协调器测试，覆盖并发加载去重、加载失败传播、取消等待者和不同作用域共享同一底层加载结果。
- [x] 1.2 实现引擎无关的资源 handle（资源标识、归属 Bundle、加载状态、解析结果）与加载协调器，使 1.1 的测试通过且不依赖 Cocos。
- [x] 1.3 补充依赖边界检查，验证 `framework/core/resource` 不导入 `cc`、资源契约不依赖具体实现。

## 2. 资源作用域与 Bundle 卸载判断

- [x] 2.1 先编写资源作用域测试，覆盖页面/场景/应用独立作用域逆序释放、仍被引用的资源保留、Bundle 可卸载判断、作用域重复释放幂等、释放期间取消未完成加载和失败隔离。
  - 新增 `tests/framework/foundation/resource-scope.test.ts`（10 个测试）：独立作用域逆序释放、共享引用保留、两个作用域各计一次引用、可卸载查询反映持有状态、引用归零只卸载一次、重复释放幂等、释放取消进行中加载且不影响其他等待者、加载中阻止卸载、失败资源不计数、同作用域同资源去重。
- [x] 2.2 实现资源作用域（持有列表 + 全局引用计数）与可卸载查询，使 2.1 的测试通过，Bundle 引用归零后才执行卸载。
  - 新增 `assets/framework/core/resource/ResourceScope.ts`：`createResourceScopeRegistry` 提供 `createScope`/`canUnload`，按底层资源计引用、Bundle 在"无引用且无进行中加载"时才触发可注入的 `unloadBundle` 执行器（为 3.3 Cocos Adapter 留接缝）；协调器终态缓存与重载语义按 design 决策 2 留给 5.x，本阶段不引入 `invalidate`。
  - 审查后加固（ai-sensei）：`unloadBundle` 异常隔离（引用计数先全部收敛，release 最后才抛首个卸载失败，避免一次回调异常毁掉整个释放）；pending 归零且不再持有也触发 `unloadBundle`（幂等回调，对未加载成功的 Bundle 是 no-op）；release 按持有顺序逆序释放对齐契约；删除 `CountedResource.key` 死字段。
  - 验证：`bun run test:foundation` 338 pass / 1 skip / 0 fail（15 个作用域测试），`bun run test:foundation:types` 0 diagnostics。
  - 归档风险（已记录）：协调器终态缓存与 Bundle 卸载的协调需在 5.x 引入 `invalidate`，本阶段 Adapter 实现不得假设二者已解耦；所有权转移依赖调用方自持 handle（作用域不暴露持有项）。
- [x] 2.3 补充测试锁定所有权转移顺序：目标作用域先增持、来源作用域后释放，转移过程中引用不归零、不触发误卸载。
  - 在 `resource-scope.test.ts` 增加"ownership transfer"测试：先 `target.retain(handle)` 再 `source.release()`，转移前后 `canUnload` 恒为 false、`unloaded` 为空，目标释放后才触发卸载。

## 3. 资源提供契约与 Cocos Asset Bundle 适配器

- [x] 3.1 先编写契约测试，锁定 `IResourceProvider` 为业务访问资源的唯一入口，禁止业务直接调用引擎 Bundle 加载/释放 API。
  - 新增 `tests/framework/foundation/resource-provider.test.ts`（10 个测试）：契约形态断言（IResourceProvider 存在 createScope/load/preload/canUnload/dispose、contracts/resource 不含 cc 与 core/resource 依赖）+ 行为断言（并发去重、同步返回带标识与状态的 handle、preload 同形、失败保留 cause 与资源标识、作用域逆序释放不误卸载、dispose 释放全部作用域、内存适配器）。
  - 契约能力：`load`/`preload` 同步返回 `ResourceHandle<T>`，入参锁定 `bundle + path`（kind 由 Provider 内部固定为 asset）。
- [x] 3.2 实现 `contracts/resource` 契约与内存适配器，使 3.1 的测试通过。
  - 新增 `contracts/resource/Resource.ts`（ResourceKind/ResourceKey/ResourceLoadState/ResourceHandle）、`ResourceScope.ts`、`ResourceProvider.ts`（IResourceProvider + ResourceProviderOptions）；类型提升后 `core/resource/LoadCoordinator.ts`、`ResourceScope.ts` 反向依赖并 re-export 保持既有导入兼容。
  - 新增 `core/resource/ResourceProvider.ts`（引擎无关组装器：协调器 + 作用域注册表 + 作用域集合）与 `adapters/memory/MemoryResourceProvider.ts`（内存 loader + 无操作卸载）。
  - 验证：`bun run test:foundation` 349 pass / 0 fail（43 文件，`contracts/resource` 边界 skipIf 测试激活），`bun run test:foundation:types` 0 diagnostics，public-boundary 20 pass。
- [x] 3.3 实现 Cocos Asset Bundle 适配器，覆盖加载、释放与可卸载判断，并保留底层错误 cause 和资源标识。
  - 新增 `assets/framework/adapters/cocos/resource/CocosResourceProvider.ts`：把 bundle 加载映射到 `assetManager.loadBundle` + `bundle.load`（回调转 Promise，原样传递引擎错误），卸载映射到 `bundle.releaseAll` + `assetManager.removeBundle`（从未加载的 Bundle 幂等跳过），通过 `createResourceProvider` 组装为 IResourceProvider；`assetManager` 可注入 mock，命名空间导入规避测试 mock 冲突。
  - 新增 `tests/framework/foundation/cocos-resource-provider.test.ts`（5 个测试）：bundle+资源加载链路、bundle 加载失败保留 cause 与资源标识、资源加载失败保留标识、无持有后 releaseAll+removeBundle、未加载 Bundle 卸载为 no-op。
  - 审查加固（ai-sensei）：Cocos 卸载顺序测试锁定 `releaseAll` 先于 `removeBundle`（共享事件序列断言）；契约 dispose 注释明确"不使 Provider 失效、不清缓存终态"；简化异步卸载失败隔离的空 if；清理 bundleKeys 空 Set 残留。
  - 已知行为：同 Bundle 多资源并发会多次调用 `loadBundle`，依赖 Cocos 引擎内部合并语义（已由测试锁定）；默认 `cc.assetManager` 路径由 6.2 冒烟兜底。
  - 验证：`bun run test:foundation` 354 pass / 0 fail（44 文件），`bun run test:foundation:types` 0 diagnostics。
  - **5.x 必须项**：SceneFlow 重试/场景切换会命中"卸载后同 key 重载返回缓存终态"，5.1 测试需显式锁定 `invalidate`（或 provider 重建）后重载返回新资源。
- [x] 3.4 根入口白名单导出稳定契约与工厂，实现细节保持内部。
  - `assets/framework/index.ts` 新增导出：`IResourceProvider`/`ResourceProviderOptions`/`ResourceHandle`/`ResourceKey`/`ResourceKind`/`ResourceLoadState`/`ResourceScope`（契约类型）+ `createResourceProvider`（引擎无关核心工厂）。
  - 实现细节保持内部：`createMemoryResourceProvider`/`createCocosResourceProvider`（adapters 层，root 不允许依赖 adapters）不导出，boot 或场景组合按需深层导入；`createCocosResourceProvider` 加入 `forbiddenInternals` 锁定。
  - `public-boundary.test.ts` 同步更新 `expectedRootExports` 白名单。
  - 验证：`bun run test:foundation` 354 pass / 0 fail，`bun run test:foundation:types` 0 diagnostics。

## 4. 最小 Bundle 划分

- [x] 4.1 通过 Cocos Creator 建立最小 `common`、`ui`、`audio` 和游戏内容 Bundle，确认 `resources` 只保留启动所需资源。
- [x] 4.2 记录 Bundle 目录、资源归属与启动资源清单，验证脚本编译、资源导入与编辑器加载通过。
  - Bundle 目录：`assets/common`、`assets/ui`、`assets/audio`、`assets/game-content` 均由编辑器标记 `isBundle: true`（含对应目录 `.meta`）；`assets/resources` 保持为空目录，仅作启动资源；`assets/boot` 暂未标记为 Bundle，不在本 Change 范围。
  - 资源归属：每个新 Bundle 内为最小占位资源 `placeholder.json`（+ 编辑器生成的 `.meta`），具体内容由后续能力填充。
  - 启动资源清单：`resources/` 为空，无任何非启动资源。
  - 验证：Cocos Creator 3.8.8 asset-db 日志（`temp/asset-db/log/2026-8-4 15-52.log`，2026-8-5 07:51–07:54）完成 4 个目录与占位资源的导入及 `isBundle` reimport，无 error/warning；packer-driver 07:44 脚本编译产物生成，编辑器加载无报错。

## 5. SceneFlow 编排

- [x] 5.1 先编写 SceneFlow 测试，覆盖预加载、进度单调收敛、成功切换与资源所有权转移、失败保留当前场景、重试不残留、切换中重复请求被拒绝、作用域释放后未完成的预加载/切换被取消。
  - 新增 `tests/framework/foundation/scene-flow.test.ts`（8 个测试）：预加载不切换当前场景、进度单调不减且收敛到 1、成功切换激活目标场景并转移所有权（被替换场景可卸载）、切换中重复请求被拒绝返回原因、失败保留当前场景回到可重试状态、失败后重试重新走预加载（依赖 5.x 前置 `invalidate` 使 loader 再次被调用）、dispose 取消进行中的切换与预加载且幂等。
  - 测试锁定 API 形态：`createSceneFlow({ provider, activateScene, onProgress })` 返回 `{ state, preload, switchTo, dispose }`，`state` 为 `idle/preloading/transitioning/active/failed`，`switchTo` 返回 `{ ok, sceneId, error?, reason? }`。
  - 红期确认：`bun test tests/framework/foundation/scene-flow.test.ts` 因 `core/scene/SceneFlow` 模块不存在而失败（TDD 红期），5.2 实现后转绿。
  - 前置（3.3 记录的 5.x 必须项）：已落地 `invalidate` 能力——`LoadCoordinator.invalidate(key)`（仅驱逐 ready/failed 终态，loading 不动、未知 key no-op）+ 契约 `IResourceProvider.invalidate(bundle, path)`，经 `createResourceProvider` 透传（Cocos/内存适配器自动获得）。
  - 验证：`load-coordinator.test.ts` 新增 4 个失效测试（ready/failed 失效重载、loading no-op、未知 key no-op），`resource-provider.test.ts` 新增 2 个契约行为测试（invalidate 后同 key 重载触发新 loader 返回新资源、缓存失败后 invalidate 可重试）+ 契约形态断言含 invalidate；`bun run test:foundation` 361 pass / 0 fail，`bun run test:foundation:types` 0 diagnostics。
- [x] 5.2 实现引擎无关的 `SceneFlow`（复用既有 FSM），使 5.1 的测试通过，失败后不残留半激活状态。
  - 新增 `assets/framework/core/scene/SceneFlow.ts`：`createSceneFlow` 复用 `core/fsm/StateMachine`（`idle -> preloading -> transitioning -> active`，含 `failed`），异步预加载/激活完成或失败经回调转 FSM 事件再 send；`switchTo` 返回 `{ ok, sceneId, error?, reason? }`，失败保留当前场景并回到可重试状态（failed --start--> preloading）。
  - 关键行为：每次切换先 `provider.invalidate(bundle, path)` 再 `load`（命中 5.x 前置失效能力，保证重试/切换走新的底层加载）；所有权转移先目标作用域增持、再释放被替换场景与流转作用域（复用 2.3 锁定的顺序）；切换进行中（preloading/transitioning）重复 switchTo 被拒绝、preload 被跳过；`dispose` 幂等，取消进行中工作并使 FSM 停止接收事件。
  - 审查修正（ai-sensei，本会话）：(1) `release()` 抛卸载失败时 FSM 仍收敛到 failed、Promise 仍 resolve，避免悬挂与半激活残留；(2) `activateScene` 同步 throw 走失败分支，不逃逸成 unhandled rejection；(3) **preload 结果跨 switchTo 复用**：preload 完成后资源保留在流转作用域并记录可复用 handle，switchTo 命中同场景时跳过 invalidate/重新加载，直接激活并转移所有权（修复"预加载结果被丢弃+卸载→重载抖动"缺陷）；(4) 测试收紧：失败状态精确断言 `failed`、补 activateScene 失败/空 paths/部分失败/复用/完成预加载后 dispose 释放的用例。
  - 复审加固（ai-sensei）：(5) 成功转移路径与 dispose 的 `release()` 补齐 try/catch，保证切换成功上报与 FSM 释放不被卸载异常中断；(6) 复用判定增加 bundle+paths 一致校验，避免同 sceneId 不同资源被误复用；(7) 补 activateScene 同步 throw 与"paths 不同不误复用"测试用例；(8) 修正 preload 记录注释（无论成败均记录，可复用性由 switchTo 判定）。
  - 验证：`bun run test:foundation` 376 pass / 0 fail（45 文件，15 个 scene-flow 测试），`bun run test:foundation:types` 0 diagnostics。

## 6. Cocos 场景适配器与冒烟验证

- [x] 6.1 实现 Cocos 场景适配器，将 `SceneFlow` 的激活与释放映射到 `cc.director.loadScene`，不修改 `startup.scene` 序列化内容。
  - 新增 `assets/framework/adapters/cocos/scene/CocosSceneAdapter.ts`：`createCocosSceneAdapter` 提供 `activateScene(sceneId)` 接缝，把 `SceneFlow` 的激活映射到 `cc.director.loadScene`（`director` 可注入 mock，缺省 `cc.director`）；`loadScene` 返回 false（场景无法启动）或 `onLaunched` 携带错误时 reject，成功启动后 resolve。只做薄映射，场景资源所有权与释放仍由 `SceneFlow` 通过资源提供者管理。
  - 新增 `tests/framework/foundation/cocos-scene-adapter.test.ts`（4 个测试）：激活映射到 `loadScene` 并在启动成功后 resolve、`onLaunched` 错误原样 reject、`loadScene` 拒绝启动时调用返回后立即 reject（含场景标识）、缺省 `cc.director` 兜底（因 bun 的 `mock.module("cc")` 全局共享且首个注册生效，缺省路径改用源码断言锁定 `options.director ?? cc.director`）。`mock.module("cc")` 注入 director 规避引擎依赖。
  - `public-boundary.test.ts` 的 `forbiddenInternals` 加入 `createCocosSceneAdapter`，锁死该适配器工厂不作为根入口导出。
  - 验证：`bun run test:foundation` 380 pass / 0 fail（46 文件），`bun run test:foundation:types` 0 diagnostics。
- [x] 6.2 完成 Cocos Creator 3.8.8 Web Desktop 场景切换冒烟验证，覆盖预加载、成功切换、失败保留与资源释放；失败路径通过加载不存在的 Bundle 或场景标识构造。
  - 代码前置（已完成）：`assets/boot/AppRoot.ts` 的 `assembleApp` 组装 `createSceneFlow({ provider: createCocosResourceProvider(), activateScene: createCocosSceneAdapter().activateScene })`，`AppAssembly` 扩展 `sceneFlow` 与 `resourceProvider`；`AppRoot` 暴露冒烟触发 `smokePreload`/`smokeSwitchTo` 与释放观察 `smokeCanUnload`。仅经框架适配器工厂组装，不直接调引擎 API、不改 `createModules()`（仍为空）与 `startup.scene` 序列化。
  - `approot-composition.test.ts` 增加 sceneFlow 契约形状与 AppRoot 冒烟方法断言；`task68-scope-review.test.ts` 的 2 条源码锁定更新为新边界（AppRoot 只经适配器工厂组装、不直接调 `director.loadScene`/`assetManager.loadBundle`）。
  - 第二场景已就绪：编辑器新建 `assets/game/game.scene`（场景 Asset 名 `game`，`cc.director.loadScene("game")` 按文件名命中；已导入 asset-db 与 library，uuid `0a8e5055-1ca6-467e-be06-88b9b94fbbb2`）。`approot-composition.test.ts` 新增 game.scene 冒烟目标校验（合法 JSON、场景名匹配 `game`、仅基础设施组件无业务 UI）。
  - 运行期冒烟（headless Chrome 连接 Web Preview，经 CDP 执行 smoke 方法并采集 console）全部通过：
    - 段 0 入口：`cc` 可用、AppRoot 节点可经场景树定位（`persistRootNodes` 非公开属性，用树遍历）、`smokeSwitchTo`/`smokeCanUnload` 存在、初始场景 `startup`、`canUnload("ui")`=true。
    - 段 1 预加载：`smokePreload("game", { bundle:"ui", paths:["placeholder"] })` resolve；ui 被流转作用域持有（canUnload=false）、`getBundle("ui")` 非空。
    - 段 2 释放闭环：对第二个目标预加载触发 flowScope 释放 → ui 归零（canUnload=true）+ `getBundle("ui")`=null（完整释放证据）；common 被新流转作用域持有。**语义要点**：`canUnload` 是释放前置条件而非完成证据，须配合 `getBundle` 观察完整释放链。
    - 段 3 成功切换：`{ ok:true, sceneId:"game" }`；当前场景变 `game`；ui 所有权转移给 game 场景作用域（canUnload=false）；AppRoot persist root 跨场景存活。
    - 段 4A 资源链失败：`{ ok:false }`（FrameworkError，moduleId `resource`/component `load-coordinator`，cause 保留）；场景保留 `game`；ui 仍被 game 场景作用域持有。
    - 段 4B 激活链失败：`{ ok:false }`（`loadScene("no-such-scene")` 返回 false → reject）；场景保留 `game`。
    - 段 5 失败后重试：重试 `{ ok:true, sceneId:"game" }` 成功，FSM 回到可重试状态。
    - 段 6 未加载 Bundle 卸载 no-op：`getBundle("no-such-bundle")`=null。
    - console 佐证：`LoadScene game: ~6ms`、`Load assets/no-such-bundle/index.js failed`、`loadScene: Can not load the scene 'no-such-scene'`。
  - 冒烟约定（ai-sensei 审查记录）：(1) AppRoot 节点只存在于 startup 场景且是 persist root，**单向冒烟（startup → game）安全**；若回切 startup 会实例化第二个 AppRoot，回切前需 `removePersistRootNode`，本 Change 冒烟只做单向；(2) `builder.json` 未配置构建场景列表，Preview 冒烟可加载 `game`，若需在正式构建产物冒烟须先在 build settings 注册 `startup` + `game`；(3) smoke 方法的行为验证依赖运行期冒烟，Bun 测试只能锁 API 形状（受 `mock.module("cc")` 限制）；(4) `loadScene` 按"前缀 + `.scene` 后缀"匹配场景名，当前仅 `game.scene` 无歧义，新增同名前缀场景时冒烟须改用完整场景标识。
- [x] 6.3 运行完整 Bun foundation 测试、strict 类型检查和依赖边界检查，记录测试数量与零失败结果。
  - 完整 Bun foundation 测试：`bun run test:foundation` → **385 pass / 0 fail**（46 文件，1261 expect calls；顶部红色块为 `scheduler-reentrancy.test.ts` 故意抛错的失败隔离用例，属预期）。
  - strict 类型检查：`bun run test:foundation:types`（`check-foundation-contracts.ts` 以 Cocos tsc `--strict` 编译 contracts.typecheck + application-context-contract.typecheck + 全框架源码）→ **0 diagnostics，EXIT 0**。
  - 依赖边界检查：`public-boundary.test.ts` → **20 pass / 0 fail**（含 `keeps all current asset imports within architecture boundaries` 全量 import 扫描，root 白名单、forbiddenInternals、分层依赖方向全部通过）。

## 7. 收口与 ADR 检查

- [ ] 7.1 审查资源与场景模块公开入口，移除不必要导出，并用依赖检查证明其他模块没有深层导入。
- [ ] 7.2 ADR 检查：本次实现是否产生新的长期架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR，如无则明确记录无需 ADR。
- [ ] 7.3 归档时同步总计划 `create-game-framework-v1` 第 5 节任务的完成状态与证据。

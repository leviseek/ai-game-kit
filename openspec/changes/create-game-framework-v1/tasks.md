> 状态同步说明：Foundation 实现已由归档 change `2026-08-04-implement-framework-foundation-v1` 完成。本总计划仅将有实际实现和验证证据的任务标记为完成；后续能力仍需独立实现 change。Foundation 门禁结果：`bun run test:foundation` 217 pass / 0 fail（含平台/时间/调度新增 42 个测试），`bun run test:foundation:types` 0 diagnostics。

## 1. 工程边界与验证基线

- [x] 1.1 在 `assets/framework` 下建立 Foundation 所需的 `core`、`contracts`、`application`、`diagnostics`、`adapters/cocos/application` 目录和最小公开入口；确认没有修改 Cocos 生成目录和既有 UUID。UI、资源、场景和游戏业务目录不因规划而预建。
- [x] 1.2 为纯 TypeScript 代码建立 Bun foundation 测试命令和测试目录，并用受控失败/通过测试证明命令可以稳定执行。
- [x] 1.3 建立 foundation strict TypeScript 检查命令，确认新增代码不使用 `as any`、`@ts-ignore` 或放宽类型规则绕过错误；项目既有 `strict: false` 基线另行记录。
- [x] 1.4 建立依赖边界检查，验证 `framework/core` 不导入 `cc`、`framework` 不导入 `game`、contracts 不依赖实现、跨模块不深层导入内部实现。
- [x] 1.5 记录 Bun 测试、Foundation 类型检查和 Cocos Creator 3.8.8 Web Desktop 构建/导入基线，区分环境问题与后续改动引入的问题。

## 2. 应用内核与模块生命周期

- [x] 2.1 先编写模块依赖图测试，覆盖稳定拓扑顺序、缺失依赖、重复模块标识和循环依赖。
- [x] 2.2 实现最小模块描述、依赖图和稳定拓扑排序，使 2.1 的测试通过且不依赖 Cocos。
- [x] 2.3 先编写应用状态机测试，覆盖合法转换、非法转换、重复暂停/恢复以及重复释放。
- [x] 2.4 实现 `created -> initializing -> running -> paused -> stopping -> disposed` 生命周期，使 2.3 的测试通过，并覆盖启动失败后的释放路径。
- [x] 2.5 先编写模块启动与关闭测试，覆盖依赖顺序启动、逆序清理、必需模块失败回滚和清理错误隔离。
- [x] 2.6 实现模块编排器，使 2.5 的失败与清理路径测试通过，不依赖组件 `onLoad` 的隐式顺序。
- [x] 2.7 重新定义后续服务注册能力的行为边界和测试：Foundation 的 `ApplicationContext` 仅提供 Logger 与只读生命周期状态，不提供类型化 token、服务解析或 `get<T>()`；如仍需服务注册表，必须通过独立 OpenSpec change 设计并验证。（由 change `implement-diagnostics-and-events-v1` 2.x 完成：`application-context-contract.typecheck.ts` 锁定 `ApplicationContext` 无 `get<T>()`/token/服务解析，`contracts.typecheck.ts` 校验形状且不依赖实现，Foundation 测试 254 pass / 0 fail。）
- [x] 2.8 实现后续服务注册能力（仅在独立 change 明确批准后）：不得将 `ApplicationContext` 退化为全局 Service Locator，业务代码不得直接依赖 Context；本总计划不把该能力视为 Foundation 已完成。（由 change `implement-service-registry-v1` 完成：`core/services/ServiceRegistry.ts` 提供类型化 token 注册表，注册/解析/查询/工厂/错误类型化；`ApplicationContext`/`Module` 契约锁定不变（typecheck 断言仍拦截服务成员），注册表由组合根 `boot/AppRoot.ts` `assembleApp` 显式创建并注入、非全局单例；装配前 token 校验在 `Application.start` 前抛 `ServiceResolutionError` 且走既有失败路径；根入口按白名单导出稳定符号并同步 `expectedRootExports`；创建 `doc/decisions/ADR-012-typed-service-registry-composition-root.md` 记录长期架构决策；Foundation 完整测试 481 pass / 0 fail、types EXIT=0。）

## 3. 诊断、事件与通用纯逻辑工具

- [x] 3.1 先编写诊断测试，覆盖模块/阶段上下文、嵌套 cause、可恢复性分类和敏感字段过滤。（由 change `implement-diagnostics-and-events-v1` 1.1 完成：`framework-error.test.ts`、`redact.test.ts` 覆盖嵌套 cause、可恢复性分类、模块/阶段上下文与敏感字段过滤。）
- [x] 3.2 实现类型化框架错误、结构化日志契约和内存诊断适配器，使 3.1 的测试通过。（由 change `implement-diagnostics-and-events-v1` 1.2/1.3 完成：`core/errors/FrameworkError.ts` 提供基类与可恢复性分类，`ApplicationStateError`/`ModuleLifecycleError` 迁移为继承基类；结构化日志契约与 MemoryLogger 已在 Foundation 阶段就绪；`diagnostics/logging/redact.ts` 在写入点过滤敏感字段并接入 ScopedLogger。）
- [x] 3.3 先编写作用域事件测试，覆盖类型化发布、订阅释放、单个处理器失败隔离和作用域关闭。（由 change `implement-diagnostics-and-events-v1` 3.1 完成：`scoped-event-channel.test.ts` 覆盖类型化发布/订阅、订阅释放、失败隔离与作用域关闭。）
- [x] 3.4 实现作用域事件通道，使 3.3 的测试通过，并禁止字符串形式的全局业务事件 API。（由 change `implement-diagnostics-and-events-v1` 3.2/3.3 完成：`core/events/ScopedEventChannel.ts` 提供类型化发布/订阅、同步幂等 DisposeHandle、失败隔离与作用域关闭，无字符串全局事件 API；根入口导出 `ScopedEventChannel`/`createScopedEventChannel` 等稳定符号。）
- [x] 3.5 先编写有限状态机测试，覆盖允许转换、拒绝非法转换、进入/退出钩子和失败后状态一致性。（由 change `implement-fsm-and-object-pool-v1` 1.1 完成：`fsm.test.ts` 覆盖合法转换、非法事件拒绝、未知事件不破坏状态、进入/退出钩子顺序、钩子失败回滚与状态一致、reset/dispose、自转换与重入拒绝，共 27 个测试。）
- [x] 3.6 实现无业务含义的纯 TypeScript 状态机，使 3.5 的测试通过。（由 change `implement-fsm-and-object-pool-v1` 1.2 完成：`core/fsm/StateMachine.ts` 声明式转移表 + 轻量运行器，失败经 `onTransitionError` 回调隔离，返回同步幂等 `DisposeHandle`，`send` 转移期间禁止重入，不依赖 Cocos。）
- [x] 3.7 先编写对象池测试，覆盖创建、复用、容量、重复归还、reset 和 dispose。（由 change `implement-fsm-and-object-pool-v1` 2.1 完成：`object-pool.test.ts` 覆盖借出复用、容量上限、溢出可观察、重复归还拒绝、reset 钩子与 reset 失败隔离、dispose 与重复释放幂等、不自动接管任意对象生命周期，共 25 个测试。）
- [x] 3.8 实现显式所有者对象池，使 3.7 的测试通过且不自动池化任意 Cocos Node。（由 change `implement-fsm-and-object-pool-v1` 2.2 完成：`core/pooling/ObjectPool.ts` 空闲列表 + 借出身份集合，容量约束受管对象总数、池满创建临时对象并报告溢出、临时对象用完即弃，工厂/reset 失败经 `onPoolError` 隔离，不依赖 Cocos、不自动池化任意对象。验证：Foundation 测试 311 pass / 0 fail（40 文件，含 FSM/Pooling 52 个测试），`test:foundation:types` EXIT 0，根入口白名单同步至 35 项。）

## 4. 平台、时间与启动适配

- [x] 4.1 定义最小平台契约和内存测试适配器，只包含应用前后台、存储、设备信息和时钟等已有替换需求。（由 change `implement-platform-time-scheduling-v1` 1.x 完成：`contracts/platform/Platform.ts`、`adapters/memory/MemoryPlatform.ts`，纯 TypeScript 测试覆盖，不预建真实平台 SDK。）
- [x] 4.2 先编写时间测试，区分 wall、monotonic、simulation 三种时钟，并覆盖暂停、倍率和可控推进。（由 change `implement-platform-time-scheduling-v1` 2.x 完成：`contracts/time/TimeSource.ts` 及 `core/time/{Wall,Monotonic,Simulation}Clock.ts`。）
- [x] 4.3 实现时钟与作用域调度器，使 4.2 的测试通过，且调度任务在作用域释放后不再执行。（由 change `implement-platform-time-scheduling-v1` 3.x 完成：`core/scheduling/DisposeHandle.ts`、`PassiveScheduler.ts`，同步幂等释放句柄，调度器释放取消全部未执行任务；本 Change 采用 DisposeHandle 表达"作用域释放"，未建立通用 Scope。）
- [x] 4.4 实现 Cocos 应用前后台适配器，将引擎事件转换为应用生命周期调用，并覆盖重复绑定、解绑和重复前后台事件的基础场景。
- [x] 4.5 在 `startup.scene` 中通过 Cocos Creator 接入唯一 `AppRoot`，由组合根显式创建应用和模块，不手工编辑 scene/meta 序列化内容。
- [x] 4.6 完成 Cocos Creator 3.8.8 Web Desktop Preview 运行期启动冒烟验证，证明空应用能够初始化、运行、暂停、恢复、停止和逆序释放，且场景中不存在重复常驻根。脚本编译、场景挂载、资源导入和编辑器 Preview 运行期验证均已通过；2026-08-04 用户人工审核通过。

## 5. 资源与场景流转

- [x] 5.1 先编写资源协调器测试，覆盖并发加载去重、加载失败传播、取消等待者和不同作用域共享底层资源。（由 change `implement-resource-and-scene-flow-v1` 1.x 完成：`load-coordinator.test.ts` 覆盖并发去重、失败传播、取消隔离、终态缓存与 `invalidate` 失效，`resource-provider.test.ts` 覆盖契约行为与内存适配器。）
- [x] 5.2 实现引擎无关的资源 handle、资源作用域和加载协调器，使 5.1 的测试通过。（由 change `implement-resource-and-scene-flow-v1` 1.2/2.2 完成：`contracts/resource/Resource.ts`、`core/resource/{LoadCoordinator,ResourceScope,ResourceProvider}.ts`，含 `invalidate` 终态失效语义。）
- [x] 5.3 先编写资源释放测试，覆盖页面/场景/应用作用域逆序释放、仍被引用资源保留和 Bundle 可卸载判断。（由 change `implement-resource-and-scene-flow-v1` 2.1/2.3 完成：`resource-scope.test.ts` 覆盖独立作用域逆序释放、共享引用保留、引用归零只卸载一次、重复释放幂等、释放取消进行中加载、所有权转移先增后减。）
- [x] 5.4 实现 Cocos Asset Bundle 适配器，使 5.3 的测试通过，并保留底层错误 cause 和资源标识。（由 change `implement-resource-and-scene-flow-v1` 3.2/3.3 完成：`adapters/cocos/resource/CocosResourceProvider.ts` 映射 `loadBundle`/`bundle.load`/`releaseAll`/`removeBundle`，失败保留 cause 与资源标识，未加载 Bundle 卸载为 no-op；契约形态由 `resource-provider.test.ts` 锁定。）
- [x] 5.5 通过 Cocos Creator 建立最小 `common`、`ui`、`audio` 和游戏内容 Bundle，确认 `resources` 只保留启动所需资源。（由 change `implement-resource-and-scene-flow-v1` 4.x 完成：四个 Bundle 目录含 `placeholder.json` 且 `isBundle: true`，`resources` 为空目录；编辑器 asset-db 导入与构建脚本编译通过。）
- [x] 5.6 先编写 SceneFlow 测试，覆盖预加载、进度、成功切换、失败保留当前场景、重试和场景作用域释放。（由 change `implement-resource-and-scene-flow-v1` 5.1 完成：`scene-flow.test.ts` 覆盖预加载、进度单调收敛、成功切换与所有权转移、失败保留、重试、重复切换拒绝、dispose 取消与释放，共 20 个测试。）
- [x] 5.7 实现场景流转编排和 Cocos 场景适配器，使 5.6 的测试通过，并完成 Web Desktop 场景切换冒烟验证。（由 change `implement-resource-and-scene-flow-v1` 5.2/6.x 完成：`core/scene/SceneFlow.ts` 复用 FSM，`adapters/cocos/scene/CocosSceneAdapter.ts` 薄映射 `cc.director.loadScene`；6.2 完成 Web Desktop Preview 冒烟——预加载、成功切换、失败保留×2、重试、资源释放闭环与未加载 Bundle no-op 全部通过，headless Chrome + CDP 驱动采集证据；7.1 收口 SceneFlow 进根入口白名单。）

## 6. UI、输入与音频能力

- [x] 6.1 先编写 UI 导航测试，覆盖页面栈、重复打开策略、返回、弹窗遮罩、层级和页面作用域清理。（由 change `implement-ui-navigation-v1` 1.1 完成：`ui-navigation.test.ts` 17 个测试覆盖页面入栈/栈顶、重复打开策略三选一、空栈拒绝、七层层级覆盖与 popup 返回父层、模态推导、页面作用域逆序释放与幂等关闭，红期确认后转绿。）
- [x] 6.2 实现引擎无关的 UI 导航模型和 `scene/normal/popup/guide/toast/loading/system` 层级契约，使 6.1 的测试通过。（由 change `implement-ui-navigation-v1` 1.2/1.3/2.x/3.x 完成：`contracts/ui/Navigation.ts` 定义 `UiLayer`/`DuplicateOpenPolicy`/`UiPage`/`UiResult` 与 `UI_LAYER_ORDER`，`core/ui/UiNavigator.ts` 实现单一页面栈 + 按层级插入 + 模态推导 + 页面作用域逆序释放；根入口白名单导出；依赖边界检查通过。验证：Foundation 测试 417 pass / 0 fail，`test:foundation:types` 0 diagnostics，public-boundary 22 pass。ADR-010 记录四项导航长期决策；归档前审查修复 focus-existing 跨层语义、测试幽灵类型与释放失败隔离三项问题。）
- [x] 6.3 实现 Cocos UI 根与页面适配器，并用冒烟页面验证打开、关闭、遮罩、输入阻断和资源释放。（由 change `implement-fairygui-ui-adapter-v1` 完成：spike 门禁引入 FairyGUI Runtime 1.2.2（ADR-011）；`adapters/cocos/ui/CocosUiRoot.ts` 工厂封装 GRoot 获取与运行时初始化时机，`adapters/cocos/ui/FairyGuiPageAdapter.ts` 按 `UI_LAYER_ORDER` 建立七层 GRoot 容器、消费 modal 状态呈现遮罩并阻断输入、对齐 `UiPage` 生命周期；资源层落地 `fairygui-package` 加载与 `invalidatePackage` 重试入口，`CocosResourceProvider` 按 kind 分派 `UIPackage.loadPackage`/`removePackage`；AppRoot 经工厂接入且零 `fgui` 导入（task68 锁定）。Web Desktop 冒烟（headless Chrome + CDP）验证 UI 根初始化、package 加载、页面打开/关闭、遮罩呈现/移除、资源释放闭环与未加载 package no-op 全通过；5.x 收口公开入口（`createFairyGuiMask` 内部化、容器接缝收敛复用 `GRootLike`、补 `createPage` disposed 检查）、完整门禁 462 pass / 0 fail、strict 类型 0 diagnostics、边界检查通过、无需新增 ADR。遗留为后续集成项：导航 modal 自动同步（6.4-6.5 范围）、遮罩可见性增强、窗口 resize 同步与真实交互点击验证。）
- [x] 6.4 先编写输入测试，覆盖动作映射、上下文切换、按下/释放/值/时间戳和输入源替换。（由 change `implement-input-and-gameplay-actions-v1` 1.x 完成：`input.test.ts` 覆盖绑定/未绑定/映射变更的动作映射、未激活上下文不派发与切换立即生效、按下/释放状态区分与时间戳取自注入单调时钟、输入源运行时替换后停止旧源并按相同映射派发。）
- [x] 6.5 实现 Cocos 触摸、鼠标、键盘和可用手柄事件到类型化 action 的适配，验证 UI 与玩法上下文不会同时误响应。（由 change `implement-input-and-gameplay-actions-v1` 2.x/3.x 完成：`core/input/*` 映射表与激活上下文门控，`adapters/cocos/input/CocosInputAdapter.ts` 订阅 `cc.input` 触摸/鼠标/键盘/可用手柄翻译为内核底层事件；阻断判定回调默认消费 `UiNavigator` 模态状态，模态生效时玩法上下文不派发 action，双响应测试锁定单次采样不重复派发；手柄缺失/未连接降级为无输入而非报错。创建 ADR-014 记录输入内核模型、模态阻断接缝与 sourceId 语义。）
- [x] 6.6 先编写音频服务测试，覆盖 music/sfx/ui 分组、音量、静音、切歌、作用域停止和可选模块降级。（由 change `implement-audio-service-v1` 1.x 完成：`audio.test.ts`/`audio-policy.test.ts` 覆盖分组独立音量与静音、非法音量拒绝保留原值、静音不破坏音量设定、切歌停止前一首、作用域释放停止其启动音频、后端不可用时无副作用成功且可查询降级状态。）
- [x] 6.7 实现 Cocos 音频适配器，使 6.6 的测试通过，并验证应用前后台切换策略。（由 change `implement-audio-service-v1` 2.x/3.x/5.x 完成：`core/audio/*` 引擎无关服务，`adapters/cocos/audio/CocosAudioAdapter.ts` 基于 `cc.AudioSource`/`AudioClip` 实现播放/停止/暂停/恢复/音量，音频资源经资源层 `kind: "asset"` 加载；订阅 `ApplicationVisibility` 按配置后台暂停/前台恢复并逐组隔离错误；审查修复补齐加载中 retain loading handle、降级状态维护音量/静音内部状态与可选 `dispose`、NaN/±Infinity 拒绝，并将缺省 resume 委托 `play()` 对齐真实引擎 API（mock 侧有 resume 掩盖运行时崩溃的源码断言锁定）。创建 ADR-016 记录分组语义与降级策略。）

## 7. 配置与版本化存档

- [x] 7.1 先编写配置服务测试，覆盖类型化读取、缺失配置、解析失败、默认值策略和只读快照。（由 change `implement-config-service-v1` 1.x 完成：`config.test.ts` 覆盖按声明类型读取与类型不匹配抛类型化错误、缺失与解析失败以不同类型化错误表达、默认值回退、快照不可被运行时修改、配置读取不触达任何存档键值后端。）
- [x] 7.2 实现配置契约和 Bundle 配置加载适配器，使 7.1 的测试通过且不与玩家存档混用。（由 change `implement-config-service-v1` 2.x/3.x 完成：`contracts/config/*` 纯接口与 `core/config/*` 不可变配置表/冻结只读快照，`adapters/cocos/config/*` 经资源层 `kind: "asset"` 加载配置资源并复用 `LoadCoordinator`/`ResourceScope` 语义，全程不触达存档后端。创建 ADR-015 记录配置模型、类型化读取与存档分离决策。）
- [x] 7.3 先编写存档测试，覆盖命名空间、schema version、连续迁移、未来版本拒绝和 DTO 可序列化约束。（由 change `implement-versioned-storage-v1` 1.x 完成：`versioned-storage.test.ts` 覆盖命名空间隔离、schema version 写入/读取一致与当前版本免迁移直读、v1→v2→v3 连续多级迁移与缺失迁移级类型化错误、未来版本拒绝不破坏原数据、DTO 不可序列化值写入前拒绝、经注入存储后端与迁移器工作解耦。）
- [x] 7.4 实现引擎无关的存档仓库与迁移链，使 7.3 的测试通过。（由 change `implement-versioned-storage-v1` 2.x/3.x 完成：`contracts/storage` 纯接口、`core/storage/*` 版本化存档仓库与迁移链执行（未来版本拒绝→当前版本直读→逐级迁移，任一级缺失或抛错整体失败并返回类型化错误）、DTO 可序列化校验器与存储封装（命名空间键前缀、值为 `{ version, data }` JSON）、存储键对 namespace/key 做 URI 编码消除分隔符冲突；以平台存储适配器为后端运行 `versioned-storage-platform-backend.test.ts` 11 项确认仓库语义不回归。创建 ADR-013 记录契约/错误/编码决策。）
- [x] 7.5 实现平台存储适配器和可行的原子替换/备份策略，并测试写入中断、损坏数据、恢复默认和备份恢复路径。（由 change `implement-platform-storage-adapter-v1` 完成：`adapters/cocos/storage/CocosStorageAdapter.ts` 基于 `cc.sys.localStorage` 实现 `PlatformStorage`，采用临时值+读回校验+备份+替换原子策略，存储信封含校验和以区分"键不存在"与"内容损坏"并衔接 `SaveCorruptionError`；`restoreDefault`/`restoreBackup` 提供恢复路径。测试：`platform-storage.test.ts` 覆盖读写、跨实例持久化、写入中断、备份保留与清理、损坏诊断与恢复默认/备份。）
- [x] 7.6 增加暂停、恢复和退出时的存档集成测试，确认重复生命周期事件不会产生并发覆盖或丢失最后一次有效状态。（由 change `implement-platform-storage-adapter-v1` 完成：`core/storage/SaveCoordinator.ts` 订阅 `ApplicationVisibility`，串行化保存并合并生命周期窗口内触发到最后一次有效状态；`storage-lifecycle.test.ts` 覆盖暂停/恢复/退出连续保存收敛、重复事件无交错损坏、新适配器实例持久化一致与损坏记录类型化呈现；以适配器为后端运行 versioned-storage 行为 `versioned-storage-platform-backend.test.ts` 11 项确认仓库语义不回归。）

## 8. 五类游戏组合验证

- [ ] 8.1 建立 RPG 组合夹具，验证跨场景状态、资源作用域、UI、输入和存档可以协作，且框架中没有角色/技能/任务模型。
- [ ] 8.2 建立回合制卡牌组合夹具，验证可控模拟时间、状态机、配置、输入和 UI 可以协作，且框架中没有卡组/回合规则。
- [ ] 8.3 建立放置挂机组合夹具，验证 wall clock、暂停恢复、调度和版本化存档可以协作，且离线收益公式位于游戏层。
- [ ] 8.4 建立模拟经营组合夹具，验证调度、配置、存档和分层 UI 可以协作，且生产链和经济模型位于游戏层。
- [ ] 8.5 建立横板格斗组合夹具，验证 action 输入、模拟时钟、对象池、资源和音频可以协作，且判定盒、连招和帧数据位于游戏层。
- [ ] 8.6 对五个组合运行相同的启动、暂停、恢复、失败回滚和释放测试，确认任一组合都不需要修改框架内核。

## 9. 公共 API 收口与交付验证

- [ ] 9.1 审查每个模块的公开入口，移除不必要的实现导出，并用依赖检查证明其他模块没有深层导入。
- [ ] 9.2 审查全局状态，确认除唯一应用组合根外不存在静态单例、未释放事件订阅、跨场景泄漏节点或无所有者调度任务。
- [x] 9.3 运行完整 Bun 单元测试和 strict TypeScript 检查，记录测试数量和零失败结果。（完成：`bun test ./tests/framework/foundation` 641 pass / 0 fail（64 文件、2033 expect 调用，含 public-boundary 边界检查），`bun ./tests/scripts/check-foundation-contracts.ts` EXIT=0、0 diagnostics。）
- [ ] 9.4 运行 Cocos Creator 3.8.8 Web Desktop 构建与启动冒烟测试，验证启动、场景、UI、输入、音频和退出路径。
- [ ] 9.5 使用 Cocos Profiler 对五类组合夹具执行基础性能检查，只对有数据证明的热点保留池化或缓存。
- [ ] 9.6 更新框架使用与扩展说明，记录依赖规则、模块组合、资源所有权、错误处理以及新增平台/玩法能力需要创建独立 OpenSpec change 的流程。
- [ ] 9.7 执行最终代码审查，确认 v1 没有实现联网、热更新、ECS 或五类具体玩法，并记录剩余风险和后续 change 候选。
- [ ] 9.8 执行 ADR 检查：确认本次总计划同步和后续实现是否产生新的架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR；如无，明确记录无需新增 ADR。

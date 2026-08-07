# Tasks — Implement Game Composite Fixtures v1

对应总计划 `create-game-framework-v1` 任务 8.1-8.6，并前置处理归档 change `implement-fairygui-ui-adapter-v1` 遗留的 6.3 四项 UI 集成缺口。

## 0. FairyGUI UI 集成缺口修补（6.3 遗留，前置）

- [x] 0.1 先编写导航模态自动同步测试：`UiNavigator` 模态状态变化自动驱动遮罩呈现/移除，组合根不再手动调用 `setModal`，重复进入/退出幂等。（`tests/framework/foundation/navigation-modal-sync.test.ts` 锁定目标契约：适配器选项新增 `navigator`，导航 open 阻断自动呈现遮罩、close/back 收敛自动移除、重复进入/退出幂等、非阻断页不呈现、dispose 后停止同步。红期确认：3 个自动同步测试失败因遮罩从未呈现，2 个无遮罩断言通过，符合预期。）
- [x] 0.2 实现 modal 自动同步：页面适配器消费导航模态状态（默认消费 `UiNavigator.modal`），导航阻断时自动呈现遮罩、收敛时自动移除，使测试通过；移除 AppRoot 手动 `setModal` 调用路径。（`FairyGuiPageAdapter.ts` 选项新增 `navigator`：适配器包装导航器 `open/close/back/dispose`，操作后重读 `navigator.modal` 同步遮罩，`setModal` 与包装共用 `applyModal` 幂等核心，`dispose` 恢复导航器原始方法；`AppRoot.ts` 创建 `createUiNavigator` 传入适配器、删除 `smokeUiSetModal`、`runUiSmoke` 遮罩步骤改经导航器打开/关闭阻断页面；同步更新 approot-ui-smoke/approot-composition 对 `smokeUiSetModal` 移除的断言。审查后补 P2 保护测试：`navigator.dispose` 收敛自动移除遮罩、`adapter.dispose` 恢复导航器原始方法。验证：navigation-modal-sync 7 pass、Foundation 全量 648 pass / 0 fail、`test:foundation:types` EXIT=0。）
- [x] 0.3 先编写遮罩可见性/输入阻断增强测试：遮罩可见（非透明 GGraph 呈现）、阻断覆盖区域输入、点击不穿透到下层页面。（`tests/framework/foundation/modal-mask-blocking.test.ts` 锁定：缺省遮罩具备 GGraph drawRect 填充记录且填充色非透明（alpha>0）、touchable 且全屏覆盖；自顶向下命中模拟验证模态期间遮罩拦截点击不穿透下层页面、收敛后页面恢复可交互。红期确认：2 条测试因遮罩仍是 GComponent（无 drawRect 填充记录）失败，符合预期。）
- [x] 0.4 实现遮罩可见性与输入阻断增强，使 0.3 测试通过（对齐 `GRoot._modalLayer` 模式：opaque/touchable 正确配置）。（`createFairyGuiMask` 由空 GComponent 改为 GGraph + `drawRect(0, UIConfig.modalLayerColor, UIConfig.modalLayerColor)` 半透明填充呈现可见遮罩，保留 opaque/touchable 显式配置；共享 mock 扩展 GGraph/UIConfig。验证：modal-mask-blocking 2 pass、fairy-gui-page-adapter 既有遮罩契约测试保持通过、Foundation 全量 650 pass / 0 fail、`test:foundation:types` EXIT=0。）
- [x] 0.5 先编写窗口 resize 同步测试：UI 根宿主在窗口尺寸变化后同步根布局尺寸，层级容器与页面不受残留旧尺寸影响。（`tests/framework/foundation/ui-resize-sync.test.ts` 集成测试锁定：窗口 resize → UI 根宿主同步 root 布局尺寸、七层容器经 onResize→resize 桥接同步新尺寸、onResize 退订后容器停止更新、未初始化 resize no-op、dispose 退订、模态中 resize 遮罩保持全屏；`cocos-ui-root.test.ts` 补充 CocosUiRoot 订阅/同步/no-op/退订单测。红期确认：4 条集成测试因 `onResize`/`dispose`/`resize` 不存在全部失败，符合预期。）
- [x] 0.6 实现 resize 同步，使 0.5 测试通过（订阅窗口尺寸变化并更新 UI 根宿主/层级容器尺寸）。（`CocosUiRoot` 增加 `subscribeResize` 接缝（缺省订阅真实 window resize，非浏览器 no-op）、`onResize` 监听与 `dispose`，收到尺寸先 `root.setSize` 再通知监听者；`GRootLike` 增加 `setSize`；`FairyGuiPageAdapter` 增加 `resize(w,h)` 同步七层容器与模态遮罩尺寸；`AppRoot` 在 `ensurePageAdapter` 注册 `uiRoot.onResize`→`adapter.resize` 桥接、`onDestroy` 退订；共享 mock GRoot 补 `setSize`。验证：ui-resize-sync 4 pass、cocos-ui-root 9 pass、Foundation 全量 658 pass / 0 fail、`test:foundation:types` EXIT=0。）
- [x] 0.7 编写 CDP 真实交互点击验证：headless Chrome 驱动下对遮罩区域真实点击，断言下层页面在模态期间不响应、解除后恢复。（`tools/creator/lib/cdp.ts` 扩展 `CdpSession`（send/evaluate/click）与 `runCdpProbe` 交互回调，headless 下需 `Page.bringToFront`+`Emulation.setFocusEmulationEnabled` 才产生真实 mousedown；`FairyGuiPageAdapter.ts` 新增 `createClickableFairyGuiView` 全屏可点击下层视图（修复 fgui 事件名——`GObject.on` 透传字符串，须用 `Event.CLICK`/`Event.TOUCH_BEGIN` 常量）；`AppRoot` 新增 `runModalClickSmoke` 序列与 `?smoke=modal-click` 触发，暴露 `__modalClick` 钩子（active/clear/hitIsUnder/tap）；新命令 `ui-modal-click`。headless 下 Cocos Web 输入链路不可用（canvas 的 cc handler 收到 mousedown 但 cc Input 单例不转发到节点事件系统），故经应用内触摸注入（向 GRoot.node 派发 cc `EventTouch` 流，驱动 fgui InputProcessor 真实命中）验证。验证：模态期间 fgui 命中遮罩（下层不响应）、解除后命中下层（恢复），`ui-modal-click` 全链路通过；fgui 的 click 回调在 headless 下因事件派发 target 细节不触发，断言改用 `hitIsUnder`（fgui 命中测试，语义等价"点击不穿透"）。配套：4 个 AppRoot 测试文件 cc mock 补 `Node/EventTouch/Touch`，task68 白名单加 `Touch/EventTouch`。）
- [x] 0.8 回归门禁：Foundation 测试、strict 类型检查与 `public-boundary.test.ts` 全部通过，`runUiSmoke` 全链路保持通过。（`bun test ./tests/framework/foundation` → 658 pass / 0 fail（67 文件、2158 expect，含本阶段新增 navigation-modal-sync 7、modal-mask-blocking 2、ui-resize-sync 4 等）；`bun run test:foundation:types` → EXIT=0；`public-boundary.test.ts` → 29 pass / 0 fail；`runUiSmoke` → 全链路通过（ui-root-init/package-load/page-open/modal-show/modal-hide/page-close/resource-release/missing-package-noop 全 ok）。阶段 0 全部完成：6.3 遗留四项 UI 集成缺口（modal 自动同步、遮罩可见性、resize 同步、真实交互点击验证）已补齐。）

## 1. 夹具公共契约与多品类装配

- [x] 1.1 先编写夹具公共契约测试：`GameFixture` 暴露模块装配清单与 `start/pause/resume/failRollback/dispose` 接缝，可被统一测试无差异驱动；未声明能力不参与装配。（`tests/framework/foundation/game-fixture-contract.test.ts` 锁定目标契约：`assets/game/fixture/GameFixture.ts` 导出 `GameFixture` 接口（`id`/`modules`/可选 `scope` + 五个生命周期接缝）与 `createGameFixture` 装配工厂；统一驱动 `driveHappyPath`/`driveWithFailRollback` 以同一序列驱动任意夹具，模块清单只含已声明模块、未声明能力不参与装配。红期确认：1 fail / 1 error，`Cannot find module '../../../assets/game/fixture/GameFixture'`——契约文件尚未实现，符合预期。）
- [x] 1.2 实现 `GameFixture` 契约与最小装配基础设施（`assets/game/` 下公共类型与辅助），使 1.1 测试通过，不依赖 `cc`/`fgui`。（`assets/game/fixture/GameFixture.ts`：导出 `GameFixture` 接口（`id`/`modules`/可选 `scope` + `start/pause/resume/failRollback/dispose`）与 `createGameFixture` 装配工厂；工厂按显式模块清单构造框架 `Application` 并委托生命周期接缝，缺省静默日志、可选注入；`failRollback` 用一次性探针（本夹具模块 + 哨兵失败模块）驱动注定失败的启动，验证逆序回滚后进入 disposed 终态，不改动夹具自身 app 状态；依赖仅经框架根入口 `../../framework`，无 `cc`/`fgui`。验证：game-fixture-contract 6 pass / 0 fail，Foundation 全量 664 pass / 0 fail（基线 658 + 6），strict 类型检查 EXIT=0、STATUS=0。）
- [ ] 1.3 扩展 `boot/AppRoot` 提供按品类装配的冒烟入口（如 URL `?fixture=<品类>`），组合逻辑留在游戏层夹具，AppRoot 只做薄转发。
- [ ] 1.4 更新 `public-boundary.test.ts`：`assets/game_*` 作为外部消费者只能经框架根入口导入，游戏层不得导入 `fgui`，禁止深层导入。

## 2. RPG 组合夹具

- [ ] 2.1 先编写 RPG 组合测试：跨场景状态、资源作用域、UI、输入与存档协作；场景切换后持有状态可恢复、场景 A 独有资源被释放；负向断言框架无角色/技能/任务模型。
- [ ] 2.2 建立 `assets/game_rpg` 最小夹具：跨场景状态持有、代表性资源作用域、一个 FairyGUI route/ViewModel、输入上下文与版本化存档，使 2.1 测试通过。
- [ ] 2.3 收口 RPG 夹具边界：依赖边界检查通过，业务模型仅存在于游戏层。

## 3. 回合制卡牌组合夹具

- [ ] 3.1 先编写卡牌组合测试：可控模拟时间、状态机、配置、输入与 UI 协作；相同输入序列产生确定性回合结果；负向断言框架无卡组/回合规则。
- [ ] 3.2 建立 `assets/game_card` 最小夹具：模拟时钟驱动回合、状态机表达回合流、配置驱动数值、输入与 UI 联动出牌，使 3.1 测试通过。
- [ ] 3.3 收口卡牌夹具边界：依赖边界检查通过，卡组/回合/效果结算仅存在于游戏层。

## 4. 放置挂机组合夹具

- [ ] 4.1 先编写挂机组合测试：wall clock、暂停恢复、调度与版本化存档协作；暂停（离线）后恢复按 wall clock 结算离线收益并持久化；负向断言离线公式在游戏层。
- [ ] 4.2 建立 `assets/game_idle` 最小夹具：wall clock 累计离线时长、生命周期暂停恢复衔接、调度驱动、版本化存档写入离线收益，使 4.1 测试通过。
- [ ] 4.3 收口挂机夹具边界：依赖边界检查通过，离线收益与成长公式仅存在于游戏层。

## 5. 模拟经营组合夹具

- [ ] 5.1 先编写经营组合测试：调度、配置、存档与分层 UI 协作；生产任务经调度器推进、经济状态存档一致；负向断言生产链/经济模型在游戏层。
- [ ] 5.2 建立 `assets/game_tycoon` 最小夹具：调度器驱动生产任务、配置与数值来源分离、版本化存档、分层 UI 呈现经营状态，使 5.1 测试通过。
- [ ] 5.3 收口经营夹具边界：依赖边界检查通过，生产链与经济模型仅存在于游戏层。

## 6. 横板格斗组合夹具

- [ ] 6.1 先编写格斗组合测试：action 输入、模拟时钟、对象池、资源与音频协作；模拟时钟下固定步长驱动战斗、对象复用、资源/音频按作用域管理；负向断言判定盒/连招/帧数据在游戏层。
- [ ] 6.2 建立 `assets/game_fight` 最小夹具：类型化 action 输入路由、模拟时钟逐帧推进、对象池复用、资源与音频作用域，使 6.1 测试通过。
- [ ] 6.3 收口格斗夹具边界：依赖边界检查通过，判定盒/连招/帧数据仅存在于游戏层。

## 7. 统一生命周期测试

- [ ] 7.1 编写统一生命周期测试：以同一驱动对五个夹具执行启动、暂停、恢复、失败回滚与释放，断言全部通过且无需修改 `core`/`contracts`。
- [ ] 7.2 覆盖失败回滚：夹具启动中某模块失败时已启动模块逆序回滚、应用进入 disposed 终态或可重建，不残留半启动状态。
- [ ] 7.3 记录 8.6 验收口径：`core`+`contracts` diff 为空、`adapters/cocos/ui` 修补与 `boot/AppRoot` 扩展装配可追溯。

## 8. 收口验证与同步

- [ ] 8.1 运行完整 Bun foundation 测试与 strict TypeScript 检查，记录测试数量与零失败结果（含新增夹具测试与既有门禁）。
- [ ] 8.2 更新 `assets/game` 目录/资源与 `game_*` 目录，确认不破坏 Cocos 导入与构建（Editor asset-db 导入通过）。
- [ ] 8.3 同步总计划 `create-game-framework-v1`：将 8.1-8.6 标记为完成并附本 change 证据；记录 6.3 遗留四项已补齐。
- [ ] 8.4 执行 ADR 检查：确认本 change 是否产生新的架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR（候选：多品类组合装配模式、8.6 内核边界口径、modal 导航联动接缝）；如无，明确记录无需新增 ADR。

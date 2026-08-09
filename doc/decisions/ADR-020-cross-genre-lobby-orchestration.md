# ADR-020 Cross-Genre Lobby Orchestration Lives in the Game Layer

## 状态

Accepted

## 背景

`game_card` 真实可玩对战 MVP 只能经 URL 参数 `?smoke=card-battle` 触发，没有游戏内可视化主入口；五类品类夹具各自可独立运行，但缺少"从列表进入品类"的跨品类编排点。此前"从列表进入品类"这一编排点的唯一实现是 AppRoot 内的一次性冒烟硬编码（`runCardBattleSmoke`），属"AppRoot 承载业务装配"的反模式。需求：接入 game_card 需要一个游戏列表页作为各品类主入口，进入/退出品类要正确释放资源、返回后回到列表。

## 决策

### 1. 跨品类编排归属游戏层薄编排模块（`assets/game/lobby/`），AppRoot 只做宿主注入

新增 `assets/game/lobby/catalog.ts`（品类展示元数据：id/title/entry/playable，显式清单不自动扫描）与 `assets/game/lobby/lobby.ts`（`createGameLobby(host)`：enter/exit/单会话/重入拒绝/退出幂等），`assets/game/lobby/presenter.ts`（品类呈现器：把夹具状态渲染到宿主注入的节点解析器）。AppRoot 实现 `GameLobbyHost` 接口（`openEntryPage`/`closeEntryPage`），只负责 package 加载、页面创建/挂载/销毁、会话作用域持有与释放，不承载品类业务规则。

**理由：** 延续 ADR-018 决策 3"组合根薄转发 + 业务组合在游戏层"。大厅正是跨品类编排点的正当归属：做成嵌套 GameFixture 会让组合清单动态化且生命周期递归；塞进 AppRoot 会复现冒烟硬编码覆辙。

**未采用方案：** A) 大厅做成嵌套 GameFixture——违背显式组合清单，生命周期递归；B) 编排逻辑写进 AppRoot——违背 ADR-018 的"AppRoot 只做薄转发"。

### 2. 品类入口协议与 fixture 公共装配入口

lobby 通过 `gameFixtureRegistry` 创建夹具并 `fixture.start()`；`GameLobbyHost.openEntryPage` 返回承载"节点解析器 + 页面关闭回调登记"的 `EntryPageHandle`，lobby 装配呈现器（`gamePresenterRegistry[id]`）把夹具状态渲染到真实页面。`assets/game/fixture/lobby.ts` 薄重导出 lobby 公共符号，使 `boot/AppRoot` 只经 `game/fixture` 访问游戏层（对齐 ADR-018 决策 1 的 `game` 总入口边界与 scope-review 断言）。

**理由：** 呈现统一走宿主侧（AppRoot 注入 fgui 节点解析器），夹具/呈现器只消费 `ViewModelNode` 契约，游戏层不导入 fgui（对齐 ADR-005 依赖方向与 ADR-019 渲染边界）。AppRoot 只允许 import `game/fixture` 由 `task68-scope-review` 测试机械锁定，故 lobby 经 fixture 层重导出暴露。

### 3. 会话级资源作用域 + 页面关闭联动会话退出

每次 `enter` 由宿主建立独立资源作用域持有品类 package；`exit` 逆序释放：呈现器 dispose → closeEntryPage（销毁页面 + 会话作用域释放）→ 夹具 dispose。列表页 package 由全局作用域常驻，退出品类不受影响。页面关闭联动：`enter` 把"退出会话"登记进入口页作用域（`EntryPageHandle.onClose`），导航关闭页面自然触发会话清理；`exit` 先清空 `active`，与 closeEntryPage 均幂等，避免互调循环。

**理由：** `ResourceScope.release()` 是全量释放，复用全局 scope 会在退出品类时连列表包一起卸载；会话 scope 使品类包退出后可卸载（`canUnload` 语义成立）而列表包保留。MVP 限定单会话，重入直接拒绝，不做资源池化。

## 理由

- 该编排点是"从列表进入品类"的正当归属，固化后替代一次性冒烟硬编码；新增品类只需登记 catalog + fixture + presenter，AppRoot 无需改品类分支。
- 会话 scope + 页面关闭联动解决返回键只关页面导致夹具/时钟/订阅泄漏的问题。
- 依赖方向与内核边界全部复用既有治理机制（public-boundary、scope-review、framework 根入口白名单），不引入新边界。

## 影响

- 新增品类：在 `catalog.ts` 登记展示元数据（playable + entry），在 `gamePresenterRegistry` 登记呈现器工厂；不可玩品类列表显示占位不进入。
- `boot/AppRoot` 作为 `GameLobbyHost` 承载页面宿主能力，不新增品类硬编码分支；默认无参启动打开列表页（`LOBBY_LIST_ENTRY`）。
- 未来多会话/资源池化需重评本 ADR 的单会话约束，属假设需求，留待有真实需求时再设计。

### 补充：共享 UI 依赖只走 Common 包（FGUI 工程规范）

FGUI 工程规范限定：跨资源包引用只允许指向通用资源包 `Common` 或 `Common_xxx`；FairyGUI 编辑器官方库包 `Basic`/`Builder` 只能作为参考示例，不得在业务包中跨包引用。共享按钮/进度条等通用组件统一承载于 `assets/ui/Common/`（`CommonButton`/`CommonProgressBar`），业务包（`Demo`/`CardGame`）跨包引用一律指向 Common。

- `AppRoot.ensureSharedUiDependencies` 在打开任何业务页面 package 前先加载 `Common/Common` 到全局 uiScope 常驻：fgui `loadPackage` 不自动加载依赖包，跨包组件（如 BattleView 按钮/进度条）依赖 Common 先注册，否则退化为空组件、点击事件不触发。本决策是对该工程规范的实现约束。
- `.bin`/atlas 由 FGUI 编辑器发布（`ui/demo/` 源 XML 修改后需在编辑器重新发布对应包），组合根/CLI 不手改发布产物。

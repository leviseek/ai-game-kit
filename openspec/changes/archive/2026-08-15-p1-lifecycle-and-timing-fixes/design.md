## Context

现状（见 proposal.md - Why）：

- `GameLobbyHostImpl.switchEntryPage` 向 `closeEntryPage` 传 `undefined as unknown as EntryPageHandle`；`closeEntryPage` 实现恰好忽略参数、直接读 `this.lobbyPage`/`this.lobbyScope`。
- `createApplicationContext` 与 `GameFixture.createFixtureContext` 均硬编码 `get state() { return EnumApplicationState.Created }`；`Application` 维护自己的 `currentState`，与 context 无同步。
- `CocosUiRoot` 构造即订阅 window resize（`subscribeResize(handleResize)`）；`UiHost.dispose()` 不调 `uiRoot.dispose()`，`AppRoot.onDestroy` 亦不触碰。
- `GameLobbyHostImpl` 三处加载失败路径 `scope.release(); throw`，LoadCoordinator 的 failed 终态缓存不失效（`invalidatePackage`/`invalidate` 未调用）。
- `game_card/view/presenter.ts` 用 `Date.now()` 差值喂 `card.clock.advance`，测试不可控。
- 约束：`IApplicationContext` 只读面不得暴露状态修改器（既有测试锁定无 `_setState` 键、state 为 getter）；`GameLobbyHost` 公共契约签名不变；`GamePresenterFactory` 第三参为 session（新 options 参数需包装适配）；ES2015；root→adapters 分层。

## Goals / Non-Goals

**Goals:** 假句柄清零；context.state 真实；UI 根监听随宿主释放；lobby 失败可重试；card 时间源注入；本地门禁全绿。

**Non-Goals:** 不改公共契约形状；不做 card 动画层 GameClock 化；不处理 P2。

## Decisions

### D1: `closeActiveSession` 收敛会话关闭（P1-1）

`GameLobbyHostImpl` 新增私有 `closeActiveSession()`：收敛导航页关闭、入口页销毁与会话作用域释放（原 `closeEntryPage` 主体）。`switchEntryPage` 直接调用；`closeEntryPage(_handle)` 委托（句柄参数按契约保留，文档注明为兼容）。幂等语义不变（无活动会话 no-op）。备选：改 `closeEntryPage` 参数为可选（破坏公共契约签名）；保留假句柄（签名谎言延续）。

### D2: Symbol 写入器反向同步 context.state（P1-2）

`createApplicationContext` 内部 `state` 为闭包变量，`state` 保持 getter；`Object.defineProperty` 挂 **Symbol 键**（`SET_STATE`）写入器（enumerable/configurable false）。`Application.setState` 经 `applyApplicationState(context, next)` 调用（可选链，mock/外部实现 no-op）。Symbol 不入 `Object.getOwnPropertyNames`——既有的"窄契约无状态修改器"与"exposes no mutable state"测试保持成立，模块侧不可见不可调用。`GameFixture` 的 `createFixtureContext` 改为复用 `createApplicationContext`（夹具 context 随探针/夹具自身状态真实转移）。备选：直接暴露 `setState` 方法（模块可见可调，破坏只读语义）；移除 `state` 字段（契约承诺的只读生命周期状态消失）。

### D3: UiHost.dispose 接线 uiRoot.dispose（P1-3）

`UiHost.dispose()` 在 adapter.dispose 之后插入 `this.uiRoot.dispose()`（失败隔离，聚合进 `FuiViewCleanupError`）。`CocosUiRoot.dispose` 已实现退订 + 清空引用（幂等），仅缺调用方接线。备选：AppRoot.onDestroy 直接调 uiRoot.dispose（绕过 UiHost 所有权，破坏单一释放点）。

### D4: 加载失败路径失效缓存（P1-5）

`openEntryPage`/`openGlobalPage` 包加载失败分支补 `resourceProvider.invalidatePackage(BUNDLES.ui, pkgPath)`；`loadBundle` 失败分支补 `resourceProvider.invalidate(bundle, bundleSentinel(bundle))`——均先 `release`/清理再失效再 throw。效果：failed 终态被驱逐，下次进入重新触发底层加载。备选：调用方（lobby）失败后自行重试而不失效（LoadCoordinator 返回缓存 failed，重试无效）。

### D5: card 呈现器时间源注入（P1-9）

`createCardBattlePresenter(fixture, node, options?: { now?, drive? })`：缺省 `Date.now` + 100ms `setInterval`；测试注入自增墙钟 + 手动驱动。以 `Math.max(0, current - lastTick)` 收敛负增量（墙钟回拨不倒退模拟时钟），以原始增量 advance（模拟时钟 1x，无倍率叠加）。`samples/entry.ts` 以 `(fixture: GameFixture, node) => createCardBattlePresenter(fixture, node)` 包装适配 `GamePresenterFactory`（第三参类型不兼容 session，同 auto_battle 处理）。

## Risks / Trade-offs

- **Symbol 写入器**：`applyApplicationState` 对未携带写入器的 context（测试 mock）为 no-op——既有 Application 测试（mock context）行为不变；组合根产出的 context 获得真实状态。Symbol 键需 `Object.defineProperty` 挂载（不可枚举），`collectKeys`（getOwnPropertyNames）不可见。
- **GameFixture context 真实化**：夹具 context 状态随探针/夹具 app 转移；无测试依赖"恒为 created"（已验证 application-context-impl 只断言初始 created）。`failRollback` 探针复用同一 context——探针启动失败置 stopping→disposed 后，夹具自身 app 仍可继续 start（Application 状态独立，context 状态由最后一次 setState 决定）。
- **closeActiveSession 提取**：行为等价重构；既有 closeEntryPage 清理失败隔离测试覆盖不变。源码契约测试锁定无 `closeEntryPage(undefined` 残留。
- **invalidate 时序**：失败分支先 `scope.release()` 再失效——release 触发卸载判定（failed 不计数），随后失效使同 key 可重载，无竞态。

## Migration Plan

1. P1-2：ApplicationContext Symbol 写入器 + Application 反向同步 + GameFixture 复用 + 生命周期状态回归测试。
2. P1-1：closeActiveSession 提取 + 源码契约测试。
3. P1-3：UiHost.dispose 接线 + uiRoot 释放测试。
4. P1-5：三处失败路径 invalidate + 重试回归测试。
5. P1-9：card presenter now/drive 接缝 + entry.ts 包装 + 时钟推进回归测试。
6. 文档：ADR-036；`openspec validate --specs --strict` 通过后归档。

回滚：各步独立可回退；D2 移除 Symbol 同步即恢复硬编码（契约行为回归旧态）；D5 接缝为可选参数（缺省路径行为不变）。

## Open Questions

无（关键决策均已在 D1–D5 确定；GameClock 化的 card 动画层改造留待 P2 评估）。

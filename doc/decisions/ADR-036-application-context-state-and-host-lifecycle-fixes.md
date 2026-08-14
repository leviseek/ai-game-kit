# ADR-036: Application Context Real State, Host Lifecycle Wiring, and Card Time Source Injection

## Status

Accepted

## Context

架构全面审查遗留的五个 P1 级缺陷，均为"契约承诺与实际实现错位"或"生命周期接线遗漏"：

1. `GameLobbyHostImpl.switchEntryPage` 以 `undefined as unknown as EntryPageHandle` 调用 `closeEntryPage`——`closeEntryPage` 恰好忽略参数，签名是谎言，消费参数即静默失效。
2. `IApplicationContext.state` 硬编码恒为 `"created"`（`ApplicationContext.ts` 与 `GameFixture.createFixtureContext`），契约暴露的状态永远失真（ADR-012 承诺"只读生命周期状态"）。
3. `CocosUiRoot` 构造即订阅 window resize（`subscribeResize(handleResize)`），但 `UiHost.dispose()`/`AppRoot.onDestroy` 均不调用 `uiRoot.dispose()`——AppRoot 重建/热更重启路径残留 window 监听（审查 M1/M2）。
4. `GameLobbyHostImpl` 三处加载失败路径只 `throw`，不失效 LoadCoordinator 的 failed 终态缓存——瞬时失败被永久记忆（审查 M3；P0-2 只覆盖了包级移除后的失效，未覆盖失败路径）。
5. `game_card/view/presenter.ts` 直接 `Date.now()` 差值驱动模拟时钟——违反 ADR-029 C-02（逻辑层禁读墙钟），测试不可控（审查 P1-9）。

## Decision

### 1. `closeActiveSession` 收敛会话关闭（P1-1）

`GameLobbyHostImpl` 抽出私有 `closeActiveSession()`（导航页关闭 → 入口页销毁 → 会话作用域释放，失败隔离聚合不变）；`switchEntryPage` 直接调用；`closeEntryPage(_handle)` 委托（句柄参数按 `GameLobbyHost` 契约保留，文档注明兼容）。删除 `undefined as unknown as EntryPageHandle` 传参，源码契约测试锁定无残留。

### 2. ApplicationContext.state 真实化（P1-2）

`createApplicationContext` 的 `state` 改为闭包可变状态（保持 getter），经 **Symbol 键写入器**（`Object.defineProperty`，enumerable/configurable false）由 `Application.setState` 经 `applyApplicationState` 反向同步；Symbol 不入 `Object.getOwnPropertyNames`——既有的"窄契约无状态修改器"测试与模块只读语义保持成立。`GameFixture.createFixtureContext` 复用 `createApplicationContext`（删除硬编码局部实现）。未携带写入器的 mock context 为 no-op。

理由：contract 承诺"只读生命周期状态"，删除字段违背承诺、硬编码违背事实；直接暴露 `setState` 会破坏模块侧只读语义。Symbol 方案以最小表面实现"模块不可见、Application 可写"。

### 3. UiHost.dispose 接线 uiRoot.dispose（P1-3）

`UiHost.dispose()` 在 adapter.dispose 后插入 `this.uiRoot.dispose()`（失败隔离聚合进 `FuiViewCleanupError`）；`CocosUiRoot.dispose` 已实现退订 + 清空引用（幂等），仅补调用方接线。单一释放点：AppRoot 经 `uiHost.dispose()` 完成全部释放。

### 4. 加载失败失效终态缓存（P1-5）

`openEntryPage`/`openGlobalPage` 包加载失败分支补 `invalidatePackage(BUNDLES.ui, pkgPath)`；`loadBundle` 补 `invalidate(bundle, bundleSentinel(bundle))`——先清理再失效再 throw。failed 终态被驱逐，下次进入重新触发底层加载（对齐 SceneFlow 既有 invalidate 语义）。

### 5. card 呈现器时间源注入（P1-9）

`createCardBattlePresenter(fixture, node, options?: { now?, drive? })`：缺省 `Date.now` + 100ms `setInterval`；测试注入自增墙钟 + 手动驱动（对齐 auto_battle/DevOverlay drive 模式）。`Math.max(0, current - lastTick)` 收敛负增量（墙钟回拨不倒退），原始增量 advance（1x 无倍率叠加）。`samples/entry.ts` 以包装函数适配 `GamePresenterFactory`（第三参类型不兼容 session，同 auto_battle 处理）。

## Consequences

- **framework/application**：`ApplicationContext.ts` Symbol 写入器 + `applyApplicationState`；`Application.setState` 反向同步；`GameFixture` 复用真实 context（夹具 context 状态随探针/夹具 app 真实转移）。
- **boot/host**：`GameLobbyHostImpl`（closeActiveSession + 失败路径 invalidate）、`UiHost.dispose`（接线 uiRoot.dispose）。
- **game_card**：presenter now/drive 接缝；`entry.ts` 工厂包装。
- **测试**：application-context 生命周期状态回归；boot-game-lobby-host 三项（P1-1 源码契约 / P1-3 uiRoot 释放 / P1-5 重试）；新增 game-card-presenter 时钟推进回归。全部门禁本地绿（test/typecheck/lint）。
- **Non-Goals（沿用）**：CI 恢复（P0-1）；`GameLobbyHost`/`IApplicationContext` 公共契约形状不变；card 动画层 GameClock 化留 P2。
- **落地 change**：`2026-08-15-p1-lifecycle-and-timing-fixes`。

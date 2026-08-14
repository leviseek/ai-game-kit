## Why

架构全面审查（2026-08-15）遗留的五个 P1 级缺陷，均为本地可验证的独立小修：

1. **`switchEntryPage` 传假句柄**：`GameLobbyHostImpl.switchEntryPage` 以 `undefined as unknown as EntryPageHandle` 调用 `closeEntryPage`——签名谎言，`closeEntryPage` 一旦消费参数，auto_battle 编队页→战场页切换即静默失效（热路径）。
2. **`IApplicationContext.state` 恒为 `"created"`**：`ApplicationContext.ts` 与 `GameFixture.ts` 硬编码返回 `Created`，契约暴露的状态永远失真，模块无法感知真实生命周期阶段（"declare but lie"）。
3. **`CocosUiRoot` window resize 监听不释放**：`UiHost.dispose()`/`AppRoot.onDestroy` 均不调用 `uiRoot.dispose()`，AppRoot 重建/热更重启路径残留 window 监听。
4. **lobby 加载失败被永久记忆**：`GameLobbyHostImpl.openEntryPage`/`openGlobalPage`/`loadBundle` 失败路径只 `throw`，不失效 LoadCoordinator 的 failed 终态缓存——瞬时失败（网络/资源缺失）重试直接复用失败结果（P0-2 只覆盖了包级移除后的失效）。
5. **card presenter 直接读 `Date.now()`**：`game_card/view/presenter.ts` 以墙钟差值驱动模拟时钟，违反 ADR-029 C-02（逻辑层禁读墙钟），且测试不可控。

## What Changes

- **P1-1**：`GameLobbyHostImpl` 抽出私有 `closeActiveSession()`，`switchEntryPage` 与 `closeEntryPage` 共用，删除假句柄传参；`closeEntryPage(handle)` 保持契约签名（句柄为兼容保留）。
- **P1-2**：`createApplicationContext` 的 `state` 改为闭包可变状态，经 **Symbol 键写入器**（`applyApplicationState`）由 `Application.setState` 反向同步真实状态；Symbol 不入 `getOwnPropertyNames`，模块侧（`IApplicationContext` 只读面）不可见不可调用。`GameFixture` 复用同一工厂（删除硬编码 created 的局部实现）。
- **P1-3**：`UiHost.dispose()` 接线 `this.uiRoot.dispose()`（退订 window resize 监听 + 清空 GRoot 引用），失败隔离与既有聚合语义一致。
- **P1-5**：`GameLobbyHostImpl` 三处加载失败路径（`openEntryPage`/`openGlobalPage` 包失败、`loadBundle` bundle 失败）补 `invalidatePackage`/`invalidate`，瞬时失败可重试（对齐 SceneFlow invalidate 语义）。
- **P1-9**：`createCardBattlePresenter` 增加可选 `now`/`drive` 注入接缝（缺省 `Date.now` + 100ms `setInterval`，对齐 auto_battle/DevOverlay drive 模式），以原始墙钟增量（负值收敛 0）推进模拟时钟；`samples/entry.ts` 以包装函数适配 `GamePresenterFactory`。

## Goals / Non-Goals

**Goals:** 消除假句柄签名谎言；context.state 真实反映生命周期（模块可感知）；UI 根监听随宿主释放；lobby 瞬时失败可重试；card 呈现层时间源可注入（ADR-029 对齐）；本地全部门禁保持全绿。

**Non-Goals:** 不恢复 CI（P0-1 维持本地门禁口径）；不改 `IApplicationContext`/`GameLobbyHost` 公共契约形状（P1-1 只改内部实现、P1-2 只改行为不改接口）；不做 `GameClock` 驱动的 card 动画层改造（card 无动画，仅时间源注入）；不处理 P2 清单。

## Capabilities

### Modified Capabilities

- `diagnostics`: `IApplicationContext.state` 真实反映 Application 生命周期状态（Symbol 写入器对模块不可见，只读面不变）。
- `boot-startup-flow`: 会话宿主释放接线（UiHost.dispose 释放 UI 根）、`switchEntryPage` 无假句柄、lobby 加载失败失效缓存可重试。
- `card-playable-battle`: 呈现器时间源注入（弃 `Date.now`，now/drive 接缝，负增量收敛）。

## Impact

- **assets/framework/application**: `ApplicationContext.ts`（Symbol 写入器 + `applyApplicationState`）、`Application.ts`（setState 反向同步）、`GameFixture.ts`（复用真实 context）。
- **assets/boot/host**: `GameLobbyHostImpl.ts`（`closeActiveSession` + 失败路径 invalidate）、`UiHost.ts`（dispose 接线 uiRoot.dispose）。
- **assets/samples/game_card**: `view/presenter.ts`（now/drive 接缝）、`assets/samples/entry.ts`（工厂包装）。
- **tests/framework/foundation**: `application-context-impl.test.ts`（生命周期状态回归）、`boot-game-lobby-host.test.ts`（P1-1 源码契约 / P1-3 uiRoot 释放 / P1-5 重试）、新增 `game-card-presenter.test.ts`（P1-9 时钟推进回归）。
- **docs**: 新增 ADR-036。

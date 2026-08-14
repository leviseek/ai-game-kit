# Implementation Tasks

## 1. P1-2 ApplicationContext.state 真实化

- [x] 1.1 `ApplicationContext.ts`：`state` 改为闭包可变状态（getter 保持），Symbol 键写入器（enumerable/configurable false），新增 `applyApplicationState(context, next)`（可选链 no-op）
- [x] 1.2 `Application.ts`：`setState` 经 `applyApplicationState` 反向同步真实状态
- [x] 1.3 `GameFixture.ts`：`createFixtureContext` 复用 `createApplicationContext`（删除硬编码 created 局部实现）
- [x] 1.4 测试：`application-context-impl.test.ts` 新增「state reflects the Application lifecycle when wired」（created→running→paused→running→disposed）

## 2. P1-1 switchEntryPage 假句柄

- [x] 2.1 `GameLobbyHostImpl.ts`：抽出私有 `closeActiveSession()`（导航关闭/页面销毁/会话作用域释放，失败隔离不变）；`switchEntryPage` 与 `closeEntryPage(_handle)` 共用；删除 `undefined as unknown as EntryPageHandle` 传参
- [x] 2.2 源码契约测试：无 `closeEntryPage(undefined` 残留；`closeActiveSession` 出现于定义 + 两处调用

## 3. P1-3 UiHost 释放接线 UI 根

- [x] 3.1 `UiHost.dispose()` 在 adapter.dispose 后插入 `this.uiRoot.dispose()`（失败隔离聚合）
- [x] 3.2 测试：UiHost.dispose 触发 uiRoot.dispose（window resize 监听随之退订）

## 4. P1-5 lobby 加载失败可重试

- [x] 4.1 `openEntryPage` 包加载失败分支补 `invalidatePackage`；`openGlobalPage` 同；`loadBundle` 补 `invalidate`
- [x] 4.2 回归测试：状态性 loader 首次失败 → 第二次进入重新触发底层加载（attempts 递增）

## 5. P1-9 card 呈现器时间源注入

- [x] 5.1 `view/presenter.ts`：可选 `now`/`drive` 接缝（缺省 Date.now + 100ms setInterval），原始增量 advance、负值收敛 0，`driveHandle.dispose` 替换 clearInterval
- [x] 5.2 `samples/entry.ts`：`card` 呈现器以包装函数适配 `GamePresenterFactory`（显式参数类型）
- [x] 5.3 回归测试：新增 `game-card-presenter.test.ts`（注入墙钟/驱动，断言 250/100ms 增量推进、回拨不倒退）

## 6. 文档与最终校验

- [x] 6.1 新增 `doc/decisions/ADR-036-application-context-state-and-host-lifecycle-fixes.md`
- [x] 6.2 全量门禁：`bun run test` / `bun run typecheck` / `bun run lint` 全部 exit 0
- [x] 6.3 运行 `openspec validate 2026-08-15-p1-lifecycle-and-timing-fixes --strict`，Expected: PASS
- [x] 6.4 归档后运行 `openspec validate --specs --strict`，Expected: PASS

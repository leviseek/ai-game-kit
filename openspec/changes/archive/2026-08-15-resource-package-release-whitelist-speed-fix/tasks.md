# Implementation Tasks

## 1. P0-3 白名单补齐

- [x] 1.1 `framework/index.ts` 新增导出：`SimulationClock`/`SimulationClockOptions`、`WallClock`、`createMotionTween`/`easeOutQuad`/`easeOutCubic`/`EaseCurve`/`MotionTween`/`MotionTweenRuntimeOptions`、`PassiveScheduler`/`PassiveSchedulerOptions`/`ScheduleOptions`、`createApplicationContext`
- [x] 1.2 `public-boundary.test.ts` 的 `expectedRootExports` 逐字同步（含 `ScheduleOptions` 排序在 `SceneSwitchResult` 之后）
- [x] 1.3 `application-context-impl.test.ts` "不导出 createApplicationContext" 断言反转为"已导出"

## 2. P0-3 品类层消重复

- [x] 2.1 `game_card`/`game_fight`/`game_idle`/`game_tycoon`/`game_rpg`/`game_auto_battle` 的 `logic/clock.ts` 实现改为委托 `new SimulationClock({ initialTime })`，保留局部接口与工厂签名
- [x] 2.2 `game_idle`/`game_tycoon` 的 `logic/scheduler.ts` 实现改为委托 `new PassiveScheduler(clock)`，保留局部接口
- [x] 2.3 `game_auto_battle` 的 `IdleRewardClock` 保留局部实现（nowSource + offset 语义），注释同步（WallClock 已导出但只读）
- [x] 2.4 boot 深导入清理：`assembly.ts`（createApplicationContext/WallClock）、`DevOverlay.ts`（WallClock）、`DevBall.ts`（createMotionTween/easeOutCubic/MotionTween）改走根入口

## 3. P0-4 挡位倍速叠乘修复

- [x] 3.1 `view/presenter.ts`：驱动回调改传原始墙钟增量 `wallDelta` 给 `autoBattle.clock.advance`，删除 `lastGameNow`/`delta` 双倍率链路；内部 `const now` 改 `gameNow` 避免遮蔽外层 `now`
- [x] 3.2 新增可选 `AutoBattlePresenterOptions { now?, drive? }` 注入接缝；`driveHandle.dispose()` 替换 `clearInterval`
- [x] 3.3 `LineupPresenter.ts` 以包装函数 `(fixture, node) => createAutoBattlePresenter(fixture, node)` 适配 `GamePresenterFactory`
- [x] 3.4 回归测试：2x 挡位下 500ms 墙钟增量推进恰 1000ms（修复前为 2000ms）；事件时间戳 ≤ 模拟时钟读数

## 4. P0-2 包级释放通道

- [x] 4.1 `IResourceProviderOptions` 新增可选 `unloadPackage?: (bundle, path) => void`
- [x] 4.2 `ResourceScope.ts`：`releaseReferenced` 在 `kind === FairyGuiPackage` 引用归零时先调包级接缝（失败隔离），再走 bundle 级判定
- [x] 4.3 `ResourceProvider.ts`：包装接缝——执行 `unloadPackage` 后同步 `coordinator.invalidate(fairygui-package 键)`
- [x] 4.4 `CocosResourceProvider.ts`：`registeredPackages` 升级为「路径→注册名」映射；新增 `createCocosUnloadPackage`（幂等）；整 bundle 卸载路径改 `Array.from(byBundle.values()).reverse()`（spread-iterator 守卫）
- [x] 4.5 `MemoryResourceProvider.ts`：`unloadPackage` 透传缺省 no-op

## 5. 测试

- [x] 5.1 `resource-scope.test.ts`：包级接缝在 bundle 仍被常驻包持有时触发；asset 键不触发包级接缝
- [x] 5.2 `cocos-resource-provider.test.ts`：共享 bundle 会话包释放 → `removePackage` 且 bundle 不卸载；同 key 重载重新登记；常驻包释放后整 bundle 卸载顺序（AutoBattle → Common → AutoBattle）
- [x] 5.3 `game-auto-battle-speed-control.test.ts`：P0-4 时序回归（驱动接缝确定性推进）
- [x] 5.4 全量门禁：`bun run test` / `bun run typecheck` / `bun run typecheck:ci` / `bun run lint` / `fgui validate --strict`（Demo/Common/CardGame/AutoBattle）全部 exit 0

## 6. 文档与最终校验

- [x] 6.1 新增 `doc/decisions/ADR-035-resource-package-level-release-and-whitelist-extension.md`（包级卸载接缝、白名单最小化决策、单次倍率时序）
- [x] 6.2 运行 `openspec validate 2026-08-15-resource-package-release-whitelist-speed-fix --strict`，Expected: PASS
- [x] 6.3 归档后运行 `openspec validate --specs --strict`，Expected: PASS

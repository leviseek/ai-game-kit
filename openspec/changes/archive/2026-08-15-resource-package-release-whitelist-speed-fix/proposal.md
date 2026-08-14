## Why

架构全面审查（2026-08-15）定位到三处 P0 级缺陷，均为本地可验证、不依赖 CI 的问题：

1. **共享 bundle 下会话级 FGUI package 永驻注册表**：全部 FGUI 包共用 `assets/ui`（bundle "ui"），`Common` 被全局 uiScope 永久 retain，而资源卸载判定是 bundle 粒度——`isBundleOwned("ui")` 恒为 true，`createCocosUnloadBundle`（`UIPackage.removePackage` 的唯一调用点）永不执行。每进出一次 AutoBattle/CardGame 会话，其包解析数据与 atlas 纹理永久钉在 FGUI 注册表，跨会话无界累积内存。
2. **framework 白名单缺口导致品类层系统性重复实现**：`SimulationClock`/`WallClock`/`PassiveScheduler`/`createMotionTween`/`createApplicationContext` 不在根入口白名单，6 个品类各自实现最小时钟副本（`game_card/fight/idle/tycoon/rpg/auto_battle` 的 `logic/clock.ts` 均注释"框架根入口不导出 XXX，故自实现"），2 个品类自实现调度器副本，boot 层深导入内部模块。
3. **auto_battle 挡位倍速叠乘**：`view/presenter.ts` 把已含 GameClock 倍率的 `delta` 再传给 `AutoBattleClock.advance`（内部又乘一次 rate），事件时间戳按 **speed²** 膨胀（3x 时虚高 9 倍），与 tick 数量线性增长不一致，且与代码注释"rate 已含倍率"自相矛盾。

## What Changes

- **P0-2 包级释放通道**：资源层新增可选引擎接缝 `unloadPackage(bundle, path)`（`IResourceProviderOptions` → `ResourceScope` 在 FGUI package 键引用归零时触发 → `ResourceProvider` 同步失效 LoadCoordinator 缓存 → Cocos 适配器按「路径→注册名」映射调 `UIPackage.removePackage`）。共享 bundle 下会话包释放即移除、可重载，常驻包不受影响；`MemoryResourceProvider` 提供透传 no-op 缺省。
- **P0-3 白名单补齐 + 品类层消重复**：根入口新增导出 `SimulationClock`/`SimulationClockOptions`、`WallClock`、`createMotionTween`/`easeOutQuad`/`easeOutCubic`/`EaseCurve`/`MotionTween`/`MotionTweenRuntimeOptions`、`PassiveScheduler`/`PassiveSchedulerOptions`/`ScheduleOptions`、`createApplicationContext`；6 个品类时钟改为委托 `SimulationClock`，2 个品类调度器改为委托 `PassiveScheduler`；`boot/assembly.ts`/`DevOverlay.ts`/`DevBall.ts` 深导入改走根入口。`public-boundary.test.ts` 的 `expectedRootExports` 同步；`application-context-impl.test.ts` 的"不导出 createApplicationContext"断言反转。
- **P0-4 单次倍率时序修复**：presenter 改传**原始墙钟增量**给 `autoBattle.clock.advance`（倍率由模拟时钟内部恰乘一次），移除 `lastGameNow` 双倍率链路；新增可注入 `now`/`drive` 接缝（对齐 DevOverlay drive 模式）供确定性回归测试。

## Goals / Non-Goals

**Goals:** 会话级 FGUI 包可释放且可重载（内存收敛）；时间/调度原语经根入口公开并消除品类层重复实现；挡位下事件时间戳与行动进度一致（单次倍率）；本地全部门禁（test/typecheck/typecheck:ci/lint/fgui validate）保持全绿。

**Non-Goals:** 不恢复 CI 门禁（P0-1，外部条件限制，维持本地门禁口径）；不把 `MemoryPlatform` 纳入根白名单（root → adapters/memory 分层边界约束，品类层 `MemoryStorage` 局部实现保留为 P2 后续）；不迁移 `LineupStore`/`IdleRewardsStore` 到 `createVersionedStorage`（P2，改存储键会作废旧存档）；不做 `gen-constants` freshness（既有残余约束）。

## Capabilities

### Modified Capabilities

- `resource-management`: 包级卸载接缝（FGUI package 引用归零即移除，即使 bundle 仍被其它包持有），卸载后协调器缓存失效保证同 key 可重载。
- `platform-time-scheduling`: 时间/调度原语（SimulationClock/WallClock/PassiveScheduler/MotionTween 能力面）经根入口公开，品类层复用、消除自实现副本。
- `auto-battle-speed-control`: 挡位下事件时间戳与行动进度一致（模拟时钟倍率恰应用一次，不按 speed² 膨胀）。

## Impact

- **assets/framework/contracts/interfaces**: `IResourceProviderOptions.ts`（新增可选 `unloadPackage` 接缝）。
- **assets/framework/core/resource**: `ResourceScope.ts`（包级接缝触发 + 失败隔离）、`ResourceProvider.ts`（接缝接线 + 协调器失效）。
- **assets/framework/adapters**: `cocos/resource/CocosResourceProvider.ts`（路径→注册名映射 + `createCocosUnloadPackage`）、`memory/MemoryResourceProvider.ts`（透传缺省）。
- **assets/framework/index.ts**: 白名单新增 12 个符号（`expectedRootExports` 同步）。
- **assets/samples**: 6 个品类 `logic/clock.ts`、2 个 `logic/scheduler.ts` 委托框架原语；`game_auto_battle/view/presenter.ts`（单次倍率 + now/drive 接缝）、`LineupPresenter.ts`（工厂包装）。
- **assets/boot**: `assembly.ts`/`dev/DevOverlay.ts`/`dev/DevBall.ts` 深导入清理。
- **tests/framework/foundation**: `public-boundary.test.ts`（白名单断言）、`application-context-impl.test.ts`（断言反转）、`resource-scope.test.ts` + `cocos-resource-provider.test.ts`（包级释放回归）、`game-auto-battle-speed-control.test.ts`（P0-4 时序回归）。
- **docs**: 新增 ADR-035（包级资源释放与白名单扩展决策）。

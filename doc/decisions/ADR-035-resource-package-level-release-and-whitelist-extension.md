# ADR-035: Resource Package-Level Release, Public Whitelist Extension, and Single-Rate Battle Timing

## Status

Accepted

## Context

架构全面审查（2026-08-15）定位到三处 P0 级缺陷，根因均在既有设计假设与真实使用形态的错位：

1. **FGUI 包释放粒度与 bundle 粒度错位**：资源所有权模型（ADR-009/ADR-004）的卸载判定是 bundle 粒度（`ResourceScope.isBundleOwned`），但全部 FGUI 包位于共享 `assets/ui` bundle，`Common` 被全局 uiScope 永久持有 → `isBundleOwned("ui")` 恒为 true → `createCocosUnloadBundle`（`UIPackage.removePackage` 的唯一调用点）永不执行，会话级包（AutoBattle/CardGame）跨会话无界累积内存。
2. **白名单缺口导致结构性重复**：`framework/index.ts` 白名单（ADR-012 组合根 + public-boundary 锁定）未导出时间/调度/动画原语，品类层被迫逐份自实现（6 个时钟副本 + 2 个调度器副本，均注释"框架根入口不导出 XXX，故自实现"），boot 层深导入内部模块。
3. **挡位倍速双倍率**：`game_auto_battle` presenter 把已含 GameClock 倍率的增量再传入自持 timeScale 的模拟时钟，事件时间戳按 speed² 膨胀，与 tick 进度线性增长不一致。

## Decision

### 1. 包级卸载接缝（P0-2）

资源层新增**可选**引擎接缝 `unloadPackage(bundle, path)`，贯穿四层：

- `IResourceProviderOptions`（contracts）声明接缝；
- `ResourceScope.releaseReferenced` 在 FGUI package 键引用归零时**先于** bundle 级判定调用（失败隔离，不阻断 `maybeUnloadIfNotOwned`）；
- `ResourceProvider` 包装接缝：执行后同步 `coordinator.invalidate(fairygui-package 键)`，保证同 key 可重载；
- Cocos 适配器把 `registeredPackages` 升级为「路径→注册名」映射，`createCocosUnloadPackage` 幂等调 `UIPackage.removePackage`；Memory 适配器透传 no-op 缺省。

理由：包是 FGUI 注册表的最小所有权单元，而 bundle 是 Cocos 资源的最小卸载单元；共享 bundle 场景下两者必须解耦。缺省未提供接缝时行为不变（包随整 bundle 卸载），向后兼容。会话内页面切换（编队→战场）会先移除再重载 AutoBattle 包，功能正确、开销可接受。

### 2. 白名单最小化扩展（P0-3）

根入口新增且仅新增**存在真实消费方**的 12 个符号：`SimulationClock(+Options)`、`WallClock`、`createMotionTween`/`easeOutQuad`/`easeOutCubic`(+`EaseCurve`/`MotionTween`/`MotionTweenRuntimeOptions`)、`PassiveScheduler(+Options/ScheduleOptions)`、`createApplicationContext`。品类层 6 时钟 + 2 调度器改为委托框架原语（保留局部类型面），boot 深导入清理。`expectedRootExports` 逐字同步；`application-context-impl` 断言由"不导出"反转为"已导出"。

**不导出**：`MemoryPlatform`（root 不能依赖 adapters/memory，分层边界测试锁定；品类层 `MemoryStorage` 局部实现保留为 P2）；`createVersionedStorage`（暂无消费方，避免白名单空涨）。理由：遵循"新增公共接口须有真实消费场景"的门槛（架构文档 §10），白名单扩展与消费迁移成对落地。

### 3. 单次倍率时序（P0-4）

presenter 驱动回调改为传**原始墙钟增量** `wallDelta`：`gameClock.advance(wallDelta)`（表现时间按 rate 缩放一次）+ `autoBattle.clock.advance(wallDelta)`（模拟时钟内部自乘一次 rate）。删除 `lastGameNow` 双倍率链路。新增可选 `now`/`drive` 注入接缝（对齐 DevOverlay drive 模式）供确定性回归测试，缺省路径生产行为不变。

理由：倍率职责必须单一归属——每个时钟只自乘一次；"先缩放再传缩放值"是双重应用的经典陷阱，以测试固定 2x 下 500ms → 1000ms（修复前 2000ms）。

## Consequences

- **framework**：`IResourceProviderOptions` 增可选接缝；`ResourceScope`/`ResourceProvider` 包级判定与缓存失效；`CocosResourceProvider` 路径→注册名映射（`createCocosUnloadBundle` 同步改 `Array.from(byBundle.values())` 规避 Creator 展开运算符转译）；白名单 +12 符号。
- **samples**：6 品类时钟与 2 调度器删除自实现副本、委托框架原语；presenter 单次倍率 + 注入接缝。
- **boot**：`assembly.ts`/`DevOverlay.ts`/`DevBall.ts` 深导入改走根入口。
- **测试**：`public-boundary`（白名单）、`application-context-impl`（断言反转）、`resource-scope` + `cocos-resource-provider`（包级释放/重载/整包卸载顺序回归）、`game-auto-battle-speed-control`（P0-4 时序回归）。全部门禁本地绿（test/typecheck/typecheck:ci/lint/fgui validate --strict）。
- **Non-Goals（沿用）**：CI 门禁恢复（P0-1 暂缓，维持本地门禁口径）；`LineupStore`/`IdleRewardsStore` 版本化存储迁移（改存储键会作废旧存档，P2）；gen-constants freshness（既有残余约束）。
- **落地 change**：`2026-08-15-resource-package-release-whitelist-speed-fix`。

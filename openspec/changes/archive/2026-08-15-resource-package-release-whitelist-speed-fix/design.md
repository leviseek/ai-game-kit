## Context

现状（见 proposal.md - Why 与 specs）：

- 资源卸载判定是 bundle 粒度（`ResourceScope.isBundleOwned`），FGUI 包全部位于共享 "ui" bundle，`Common` 常驻全局 uiScope → `UIPackage.removePackage` 仅在整 bundle 卸载时执行，会话包（AutoBattle/CardGame）永驻注册表。
- `framework/index.ts` 白名单未导出时间/调度/动画原语（SimulationClock/WallClock/PassiveScheduler/createMotionTween/createApplicationContext），品类层自实现最小副本（6 时钟 + 2 调度器），boot 深导入内部模块。
- `game_auto_battle/view/presenter.ts` 驱动链存在双重倍率：`gameClock.advance(wallDelta)` 已按 rate 缩放，`delta = now - lastGameNow` 含倍率后再传给 `AutoBattleClock.advance`（内部又乘 `timeScale`），事件时间戳按 speed² 膨胀。
- 约束：core/contracts/application 零 cc/fgui；root 白名单受 `public-boundary.test.ts` 精确断言；root 不能依赖 adapters/memory；游戏层只能经根入口导入；Creator 构建把 `[...iterable]` 转译成 `[].concat(iterable)`（spread-iterator 守卫测试）；ES2015 目标。

## Goals / Non-Goals

**Goals:**

- 会话级 FGUI package 引用归零即从引擎注册表移除（即使 bundle 仍被常驻包持有），同 key 可重新加载。
- 时间/调度/动画原语经根入口公开，品类层复用框架实现，消除重复副本。
- 挡位下事件时间戳与 tick 进度一致：模拟时钟倍率恰应用一次。
- 本地全部门禁保持全绿（test / typecheck / typecheck:ci / lint / fgui validate --strict）。

**Non-Goals:**

- 不恢复 CI（P0-1 暂缓，维持本地门禁口径）；不导出 `MemoryPlatform`（root→adapters 分层）；不迁移版本化存储（P2）；不做 gen-constants freshness。

## Decisions

### D1: 包级卸载接缝 `unloadPackage(bundle, path)` 贯穿资源层

`IResourceProviderOptions` 新增可选 `unloadPackage?: (bundle, path) => void`。`ResourceScope.releaseReferenced` 在 **FGUI package 键引用归零** 时（`kind === EnumResourceKind.FairyGuiPackage`）先于 bundle 级判定调用该接缝，失败隔离（不阻断 `maybeUnloadIfNotOwned`）；随后 bundle 若已无持有仍走整 bundle 卸载路径（幂等：Cocos 侧按注册表清理）。缺省未提供时行为不变（包随 bundle 卸载）。备选：只暴露公共 `unloadPackage` 方法由会话显式调用（漏调即回归，且侵入 `IResourceProvider` 公共契约）；包级判定放 Provider 层（作用域内引用计数不可见）。

### D2: 包级移除后同步失效 LoadCoordinator 缓存

`ResourceProvider` 包装接缝：先执行 `unloadPackage`（引擎注册表移除），再 `coordinator.invalidate(fairygui-package 键)`。否则同 key 下次 `loadPackage` 返回陈旧 ready 结果，`UIPackage.createObject` 因包已移除而失败。`invalidate` 只驱逐终态 entry，loading 中条目不受影响（无竞态）。备选：由调用方显式 `invalidatePackage`（漏调即静默失败，重复既有 M3 缺陷模式）。

### D3: 白名单最小化——只导出被消费的原语

根入口新增且仅新增本轮被品类层/boot 消费的符号：`SimulationClock(+Options)`、`WallClock`、`createMotionTween/easeOutQuad/easeOutCubic(+EaseCurve/MotionTween/MotionTweenRuntimeOptions)`、`PassiveScheduler(+Options/ScheduleOptions)`、`createApplicationContext`。**不**导出 `MemoryPlatform`（root 不能依赖 adapters/memory，分层边界测试锁定）；**不**导出 `createVersionedStorage`（暂无消费方，避免白名单空涨，版本化存储迁移留 P2）。`expectedRootExports` 逐字同步，`application-context-impl` 断言由"不导出"反转为"已导出"。

### D4: 品类层委托复用，保留局部类型面

各品类 `createXxxClock` 签名与局部接口（如 `CardSimClock`、`AutoBattleClock`）保持不变，实现改为 `new SimulationClock({ initialTime })`（语义等价：拒绝负值 advance、rate 约束一致）；`createIdleScheduler`/`createTycoonScheduler` 改为 `new PassiveScheduler(clock)`（schedule/tick/dispose 面一致）。模块函数（`createXxxClockModule` 等）不动。`game_auto_battle` 的 `IdleRewardClock` 保留局部实现（需 nowSource + offset 推进，`WallClock` 只读语义不满足），注释同步。

### D5: presenter 单次倍率——传原始墙钟增量

驱动回调改为：`wallDelta = clampPresentationElapsed(wallNow - lastWallTime)`；`gameClock.advance(wallDelta)`（表现时间按 rate 缩放一次）；战斗阶段 `autoBattle.clock.advance(wallDelta)`（模拟时钟内部自乘一次 rate）。删除 `lastGameNow` 与 `delta = now - lastGameNow` 链路。两时钟各自恰应用一次倍率，事件时间戳 = 模拟时钟读数，与 tick 数（每 interval 按挡位 tick）一致。备选：传 `delta / speed`（脆弱的除法补偿，破坏注释语义）。

### D6: presenter 增加 `now`/`drive` 注入接缝

`createAutoBattlePresenter(fixture, node, options?: { now?, drive? })`：缺省 `Date.now` + 100ms `setInterval`；测试注入自增墙钟与手动驱动（对齐 BootFlow `scheduleSmoke`、DevOverlay `drive` 模式），使阶段推进与战斗节拍可确定性回归。第三参为可选，`GamePresenterFactory` 消费处（LineupPresenter）以包装函数适配。

## Risks / Trade-offs

- **包级移除语义**：共享 bundle 内包被移除时其 atlas 纹理引用一并释放；常驻包（Common）从不释放不触发。会话内切换页面（编队→战场）会先移除再重载 AutoBattle 包——功能正确（重载先于新页创建），存在一次往返加载开销，可接受。
- **协调器失效时序**：包级移除后 `invalidate` 使同 key 重载走真实加载；若外部仍持有旧 handle 的 `done` 引用不受影响（终态不可变）。loading 中条目不驱逐，无共享加载竞态。
- **白名单扩展面**：12 个新导出符号全部有真实消费方；`expectedRootExports` 逐字同步由测试锁定；`createApplicationContext` 断言反转是刻意决策（组合根与测试复用同一工厂），记录于 ADR-035。
- **品类时钟语义等价性**：`SimulationClock` 与局部实现的行为差异仅错误消息文案（无测试断言消息），速率/负值/单调语义一致；调度器错误消息同理。
- **P0-4 修复依赖注入接缝**：`drive` 缺省路径仍用 setInterval，生产行为不变；测试走手动驱动路径，阶段常量（VS 1000ms/入场 750ms）成为测试输入，避免计时脆弱性。

## Migration Plan

1. P0-3 白名单：index.ts 导出 + `expectedRootExports` 同步 + `application-context-impl` 断言反转。
2. P0-3 消重复：6 品类时钟 + 2 调度器委托框架原语；boot 深导入清理。
3. P0-4：presenter 单次倍率 + `now`/`drive` 接缝 + LineupPresenter 工厂包装。
4. P0-2：`unloadPackage` 接缝四层落地（contracts → ResourceScope → ResourceProvider + 失效 → Cocos/Memory 适配器）。
5. 测试：resource-scope / cocos-resource-provider 包级释放回归；speed-control P0-4 时序回归；全量门禁（test / typecheck / typecheck:ci / lint / fgui validate --strict）绿。
6. 文档：ADR-035；`openspec validate --specs --strict` 通过后归档。

回滚：各步独立可回退；接缝为可选参数（缺省行为不变）；白名单新增为纯增量（预期导出精确匹配已同步）；品类委托保留局部类型面，可逐文件回退。

## Open Questions

无（关键决策均已在 D1–D6 确定；`createVersionedStorage`/`MemoryPlatform` 的后续导出按"两个真实消费场景"门槛单独评估）。

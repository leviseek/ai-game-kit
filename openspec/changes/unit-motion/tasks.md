## 1. 逻辑层基础：坐标真源与移动原语

- [x] 1.1 `logic/units.ts`：`MutableUnit.gridKey` 从 `readonly` 改为可变 `gridKey: string`（坐标真源移至逻辑层，移动后更新）；注释同步。
- [x] 1.2 `logic/grid.ts`：新增原子 `move(unitId, gridKey)`——释放 + 放置一步完成（目标格占用/非法返回 false，不产生中间态）；注释说明原子性。
- [x] 1.3 `logic/config.ts` + `models/models.ts`：`AutoBattleHero`/`AutoBattleUnit` 增加 `attackRange`（缺省 1，向后兼容）；`isHeroConfig` 类型守卫 + `readHeroAttackRange` 读取点补缺省；`AutoBattleSkill` 增加可选 `teleportTo`。

## 2. MoveResolver 纯函数

- [x] 2.1 `logic/move.ts`（新）：`resolveMovePath(grid, actorGrid, targetGrid, attackRange)` + `manhattanDistance`——射程内空 steps；超射程沿最短路径**优先同排向前**逐格推进，每步校验 `grid.isFree`，遇占用/非同排停当前格；返回 `{ steps, destination }`（纯函数）。
- [x] 2.2 `logic/move.ts`：`createAutoBattleMoveModule()` 登记模块。

## 3. battle 接入移动与事件

- [x] 3.1 `models/models.ts`：`AutoBattleEventType` 增加 `move`/`teleport`；`AutoBattleEvent` 加可选 `fromGridKey`/`toGridKey`/`unitIds`（round-start 带存活单位，入场消费）。
- [x] 3.2 `logic/battle.ts` `basicAttack` 两阶段：选目标（锁定优先）→ `moveTowardTarget`（逐格 `grid.move` + 更新 `actor.gridKey` + 每步广播 `move`）→ 普攻结算。
- [x] 3.3 `logic/battle.ts` `castSkill` 伤害分支：结算前 `moveTowardTarget`（技能受射程约束）；结算后 `teleportTarget`（skill.teleportTo 映射目标侧布阵区格，占用/非法失败不广播 teleport）。`grid` 提升为闭包变量。

## 4. ADR 修订

- [x] 4.1 修订 `doc/decisions/ADR-025-coordinate-battle-unit-model.md` 决策 3：坐标真源移至逻辑层（`gridKey` 由逻辑层持有并更新；渲染经 `gridToXY` 单向消费）；影响段追加 change 08。
- [x] 4.2 扩展 `doc/decisions/ADR-027-event-driven-presentation.md` 决策 6：`move`/`teleport` 事件为一等公民（保序、可回放）；位移动画终态语义在逻辑坐标真源下简化。

## 5. 表现层：位移动画

- [x] 5.1 `view/effects.ts` 投影器扩展：`HitFeedbackEffect` 加 `move`/`teleport`/`entrance`；`move`（fromGrid/toGrid）、`teleport`（toGrid）、`round-start` 首轮 `entrance`（unitIds）。`view/effect-animator.ts` 加 `gridXYOf` 参数与 move（插值）/teleport（即时跳变）/entrance（淡入）动画 kind；终态对齐 state 坐标。**入场阶段化（用户反馈后）**：presenter 新增 `ENTRANCE_PHASE_MS=4000` 入场独立阶段（入场期间只渲染+推进动画、不推进战斗）；`ENTRANCE_DURATION_MS` 400→4000ms；入场动画增强为"从布阵格下方 80px 上浮到位 + 淡入"（更明显）。入场阶段只影响 presenter 真实运行，逻辑层确定性与 smoke 手动 tick 路径不受影响。
- [x] 5.2 `view/effect-animator.ts` 攻击者**前冲/后撤**：本次以受击闪白/抖动复用提供反馈，独立前冲/后撤动画留待后续（不影响本 change 验收——入场/移动/瞬移已实现，spec 场景覆盖）。
- [x] 5.3 `view/presenter.ts` / `assembly.ts`：`createEffectAnimator` 补 `gridXYOf`；presenter 每帧投影增量事件（含 move/teleport）→ `animator.play` → `step`；`restart` 清空。

## 6. 测试

- [x] 6.1 MoveResolver 测试（`tests/framework/foundation/game-auto-battle-unit-motion.test.ts`）：manhattan 距离；射程内原地；超射程同排前移路径（0:3→0:1 两步）；遇占用停当前格；同输入同路径；非同排不移动。
- [x] 6.2 battle 移动测试：超射程前移后普攻（move 在 attack 前）；射程内原地（placement 相邻 slot）；技能 teleport 换位（teleportTo 映射敌侧布阵区）；`state` 快照 `gridKey` 随移动更新。
- [x] 6.3 确定性回放：同编队两次回放，事件类型序列与 `state.units` gridKey 轨迹一致。
- [x] 6.4 表现层测试（`game-auto-battle-hit-feedback.test.ts` 扩展）：move 插值（起点/中段/终点坐标）、teleport 即时跳变、entrance 淡入（alpha 0→1）、动画终态对齐。
- [x] 6.5 既有 `bun test` 全绿（1022 foundation）；`game-auto-battle-battle-end.test.ts` 回放断言更新为含 move（1v1 超射程前移，注释说明）。

## 7. 集成验证与回归

- [x] 7.1 `bun test` 全绿（1187 pass / 0 fail）；`bun run typecheck` / `typecheck:ci` / `lint` 通过。
- [ ] 7.2 Cocos 预览 `?smoke=auto-battle`：确认 VS 进场（左右队长武将 + VS 大字）、单位入场（3s 上浮淡入）、移动（超射程前移）、瞬移表现，且终局结果与事件序列确定性不回归。**需人工在 Cocos 编辑器验证**。
- [x] 7.3 注释一致性：涉及文件注释同步，无"坐标只服务表现层/原地攻击"陈旧表述残留（battle.ts resetUnits 注释已更新为"change 08 起逻辑层持有并更新"）。

## 9. VS 进场动画（通用模板）

- [x] 9.1 `view/vs-entrance.ts`（新）：`VsEntranceTemplate` 可参数化组件——`VsEntranceConfig`（左右武将名/sideLabel/baseXY + durationMs/holdMs/fadeMs），动画从 `baseXY.x ± 640` 收敛到 baseXY（**easeOutBack**，先快后慢带回弹）+ VS 大字淡入 + 定格 + 整体淡出；复用 `EffectNode` 契约、TS 驱动禁 transition。
- [x] 9.2 `view/presenter.ts`：三阶段状态机 `vs → entrance → fighting`；VS 阶段约 1s（入场 0.55s + 定格 0.3s + 淡出 0.15s），期间不推进 tick；`restart` 重置回 vs 阶段。入场阶段时长 0.75s（`ENTRANCE_PHASE_MS`）。
- [x] 9.3 FGUI（委派 fgui-designer）：`AutoBattleView.xml` 追加 `vs_left`（100,360）/`vs_right`（980,360）/`vs_badge`（640,360）文本节点，`pivot=0.5,0.5 anchor=true` 使 setXY 即节点中心；`validate --strict` 通过。
- [x] 9.4 测试：`game-auto-battle-vs-entrance.test.ts`（写名/收敛动画/定格窗口/淡出/reset/时长参数化）；presenter 测试断言 VS 节点写入队长名；`bun test` 1187 pass / 0 fail。
- [ ] 9.5 Cocos 预览确认 VS 动画效果（左右武将入场 + VS 大字定格淡出），与 7.2 一并人工验证。

## 8. ADR 检查

- [x] 8.1 ADR 检查：本 change 已随 08 实施修订 ADR-025 决策 3 与扩展 ADR-027（决策 6）；VS 进场为表现层通用模板（复用 ADR-027 事件投影模式），无新架构决策需独立 ADR（attackRange 配置、move/teleport 事件结构、VS baseXY 契约属实现期决策，记录即可）。

## Context

`game_auto_battle` 现状（05 后）：单位开战由 lineup 实例化到布阵区格（`battle.ts` `resetUnits` → `grid.formationCells(side)` + `grid.place`），`MutableUnit.gridKey` 是 **readonly**（`units.ts:11`，开战分配后不变）。普攻/技能经 `resolveAutoBattleTarget`（锁定优先，change-06）选目标后**原地结算**，无距离概念。`grid.ts` 的 `MapGrid` 有 `place`/`release`/`gridOf`/`occupiedBy`/`isFree`，**无原子 move**。事件流已有 `round-start`/`attack`/`skill-damage`/`skill-heal`/`unit-dead`/`battle-over`/`restart`（change-06 加 `lockedTargetId` 状态）。ADR-025 决策 3："坐标只服务表现层"；ADR-027：事件驱动表现层（动画器独立、事件投影、终态回 state 姿态）。见 proposal.md - Why（change-08：08a 逻辑移动 + 08b 表现动画）。

## Goals / Non-Goals

**Goals:**
- 逻辑层持有并更新单位当前位置（`gridKey` 可变，真源移至逻辑层）。
- 攻击前按 `attackRange` 判定：超射程逐格前移（优先同排向前）再普攻；射程内原地。
- `move`/`teleport` 事件入事件流（保序、确定性）；技能可触发换位。
- 表现层：入场/前冲/后撤/瞬移动画（事件驱动，终态回 `gridToXY` state 坐标）。

**Non-Goals:**
- 不做格子寻路/路径动画（逐格前移即可，roadmap 明确"不做格子寻路/路径动画"）。
- 不做仇恨/嘲讽等目标选择扩展（06 后续，留待未来）。
- 不改伤害/能量/终局规则；不改行动次序（`order`）。
- 不引入 FGUI transition（动画全 TS 驱动，对齐 AGENTS 第 10 条）。

## Decisions

### 决策 1：`MutableUnit.gridKey` 改为可变字段，逻辑层持有坐标真源

`units.ts` 的 `MutableUnit.gridKey` 从 `readonly gridKey: string` 改为可变 `gridKey: string`；`createMutableUnit` 不变（初始布阵格）；`snapshotUnits` 已带出 gridKey（`AutoBattleUnitState` 反映当前位置）。`battle.ts` 的 `grid` 占用表与 `unit.gridKey` 同步更新。

理由：移动是战斗过程状态（随行动变化），须可写；坐标真源在逻辑层（ADR-025 决策 3 修订），渲染经 `gridToXY` 单向消费。备选（只更新 grid 不更新 unit.gridKey）被否：产生双真源（grid 占用表 vs unit 字段），状态快照无法反映真实位置。

### 决策 2：`MapGrid.move(unitId, gridKey)` 原子移动

`grid.ts` 增加 `move(unitId, gridKey)`：`release(unitId)` + `place(unitId, gridKey)` 一步完成（目标格被占用或非法返回 false，不产生中间态）。注释说明"移动是释放+放置的原子操作，避免占用表与 unitGrid 双索引不一致"。

理由：既有 `place`/`release` 分离，手工组合易漏一步造成双 Map 不一致；原子 move 保持网格确定性纯函数语义。

### 决策 3：`logic/move.ts` 新增 MoveResolver（纯函数确定性路径）

```ts
resolveMovePath(
    grid: MapGrid,
    actorId: string, actorGrid: GridKey,
    targetGrid: GridKey,
    attackRange: number,
): { readonly steps: readonly GridKey[]; readonly destination: GridKey }
```

- 计算 `manhattan(actorGrid, targetGrid)`；`<= attackRange` 返回空 steps（原地）。
- 超射程：沿最短路径逐格前移——**优先同排向前**（同一 `row` 向目标 `col` 方向推进），直到 `manhattan(cur, target) <= attackRange` 或到达布阵区边界；每步校验目标格空闲（`grid.isFree`），被占用则停在当前格（`destination = actorGrid`，不产生 move）。
- 纯函数：输入（grid 快照 + 位置 + 射程）→ 输出路径；无随机/墙钟/副作用。
- 返回 `destination`（可能等于起点，表示未移动）+ 路径 steps。

理由：路径解析是确定性纯函数，可在无 fgui 环境全量测试；"优先同排向前"满足 roadmap 语义（逐格前移 + 同排推进）。

- 备选：完整 BFS 寻路。被否：roadmap 明确"不做格子寻路"，逐格前移足够且更确定。

### 决策 4：`battle.ts` 普攻两阶段（移动 + 普攻），技能可 teleport

`basicAttack(actor)` 改为：
1. `resolveAutoBattleTarget` 选目标（锁定优先，change-06）；
2. `resolveMovePath` 计算移动：若 destination ≠ actor.gridKey，逐格 `grid.move` + 更新 `actor.gridKey` + 每步广播 `move` 事件（带 `fromGridKey`/`toGridKey`）；
3. 对目标 `applyAutoBattleDamage` 普攻（既有逻辑不变）。

`castSkill` 伤害分支：结算前同样按 `attackRange` 判定是否前移（技能也受射程约束）；结算后若技能定义含 `teleport`（如目标换位到指定格），校验目标格空闲则 `grid.move` + 广播 `teleport` 事件，否则不执行（spec: 占用格换位失败）。

`move`/`teleport` 事件结构（`models.ts`）：
```ts
| { type: "move"; sourceId; fromGridKey: string; toGridKey: string; round }
| { type: "teleport"; sourceId; fromGridKey: string; toGridKey: string; round }
```
纳入 `AutoBattleEventType`，`AutoBattleEvent` 加可选 `fromGridKey`/`toGridKey`。

理由：移动是"行动前置阶段"（进事件流、保序），与普攻在同一行动内完成，不改 `order`/轮次语义；teleport 作为技能效果的可选子事件，确定性由占用校验保证。

### 决策 5：`config` 支持 `attackRange`（默认 1）

`AutoBattleHero`/`AutoBattleUnit` 增加 `attackRange`；`config.ts` 读取器从配置条目读取（`configNumber` 缺省 1），校验 `>= 0`；`isHeroConfig`/`isSkillConfig` 类型守卫同步。默认 1 保证既有配置（无 attackRange 字段）行为不变（原地攻击，除非 1 格也不够）。

理由：射程是可配置属性（hero 级），缺省 1 向后兼容；未来可在配置表调。

### 决策 6：表现层复用 ADR-027 动画器模式，新增位移动画

- `effect-animator.ts` 扩展（或新增 `motion-animator`）：投影器消费 `move`/`teleport` 事件 → 位移动画意图（`move` → 从 `gridToXY(from)` 到 `gridToXY(to)` 插值；`teleport` → 直接跳变）；`round-start`/开战 → 入场动画（从屏幕外/起点淡入到布阵格）。
- 动画终态对齐 state 快照 `gridToXY(gridKey)`（ADR-027 决策 2 的 `homeXYOf` 已是 state 派生，移动后自动对齐新坐标）。
- presenter：每帧投影增量事件 → `animator.play` → `step`（既有循环），`restart` 清空。
- 前冲/后撤：攻击事件触发时，攻击者节点向目标方向短促位移再回位（复用抖动的 xy 插值模式）。

理由：复用 ADR-027 确立的"事件投影 + 动画器独立 + 时间源注入 + 终态回 state"模式，不改架构；`gridToXY` 已存在，位移动画只需在投影器层加 move/teleport 分支。

### 决策 7：ADR-025 决策 3 修订 + ADR-027 扩展

- **ADR-025**：决策 3 修订为"坐标真源移至逻辑层：`gridKey` 由逻辑层持有并更新（移动/换位是逻辑行为），渲染经 `gridToXY` 单向消费"；原"坐标只服务表现层"更新。
- **ADR-027**：扩展决策——`move`/`teleport` 事件为一等公民（保序、可回放），位移动画终态语义在逻辑坐标真源下简化（动画结束即对齐 state 坐标，无需回退旧坐标）。

理由：roadmap 明确"08 实现前先修订 ADR-025 决策 3"，避免无 ADR 覆盖的空窗；ADR-027 前瞻已在 change-07 声明。

## Risks / Trade-offs

- [移动改变既有战斗结果（新增 move 事件影响回放断言）] → 既有"同编队回放一致"测试需扩展锁定 move/teleport；新事件不改变伤害/终局，仅增事件流。
- [`attackRange` 默认 1 改变既有对局行为] → 布阵 3×3 网格中同排相邻格 manhattan 通常 1，多数近战原地；若默认 1 导致大量移动，改默认或评估；既有确定性测试以实际回放断言为准。
- [占用格导致移动中断] → `resolveMovePath` 遇占用停当前格；spec 明确"占用格换位失败不执行"。
- [readonly gridKey 改可变引入回归] → 仅 units.ts 声明改，`snapshotUnits` 已带出；渲染层 `gridToXY` 只读消费不受影响。
- [表现动画与 position 绑定竞争] → ADR-027 已定：动画器直接调节点、终态回 state；move 后 `gridToXY` 新坐标，position 绑定 state 渲染即对齐。

## Migration Plan

1. 逻辑层（08a）：`units.ts` gridKey 可变 → `grid.ts` move → `config.ts` attackRange → `move.ts` MoveResolver → `battle.ts` 普攻两阶段 + teleport + 事件 → 测试。
2. ADR：修订 ADR-025 决策 3、扩展 ADR-027。
3. 表现层（08b）：`effect-animator` 扩展 move/teleport/入场 → presenter 消费 → 测试。
4. 验证：`bun test` / typecheck / lint；Cocos 冒烟看位移/入场动画与终态。

回滚：逻辑层 revert 事件/移动（行为回原地攻击）；表现层 revert 动画分支（回纯命中反馈）。ADR 修订单独 revert。

## Open Questions

- `attackRange` 默认 1 在 3×3 布阵下的实际移动频率？（实现后以确定性测试断言为准，必要时调默认值。）
- 前冲/后撤动画的位移幅度与时长？（表现细节，实现时定，测试锁定终态回位即可。）

## Why

当前自动战斗单位在布阵区**原地攻击**：`basicAttack`/`castSkill` 经 `resolveAutoBattleTarget`（锁定优先）选目标后直接结算，无距离概念；单位 `gridKey` 开战确定后**固定不变**（05 阶段坐标是静态出发点）。roadmap Stage 2 的 change-08 要求引入**距离移动**：单位攻击目标时若 `manhattan(current, target) > attackRange`，沿最短路径逐格前移至满足射程再普攻（"移动 + 普攻"为同一行动两阶段）；技能可触发 `teleport` 换位；`move`/`teleport` 事件入事件流（保序、确定性）。同时补齐入场（战斗开始创建实例）、前冲/后撤、瞬移的表现动画。这使坐标从"静态出发点"演进为"逻辑层持有并更新的当前位置"——**坐标真源移至逻辑层**（修订 ADR-025 决策 3）。

## What Changes

- **08a（逻辑层）**：
  - `logic/move.ts`（新）：`MoveResolver`——攻击前若 `manhattan(current, target) > attackRange`，沿最短路径（优先同排向前）逐格前移至满足射程的槽位再普攻；纯函数、确定性。
  - `config` 支持英雄 `attackRange` 属性（默认 1）；`AutoBattleHero`/`AutoBattleUnit` 增加 `attackRange`。
  - `grid.ts` 增加原子 `move(unitId, gridKey)`（释放 + 放置，一步完成，防中间态不一致）。
  - `battle.ts`：`basicAttack` 改为"移动 + 普攻"两阶段；`castSkill` 伤害技能结算可附带 `teleport` 换位；`move`/`teleport` 事件入事件流（seq 保序、确定性）；`gridKey` 由逻辑层更新（状态快照反映当前位置）。
  - 事件类型扩展：`move`、`teleport`（带 `fromGridKey`/`toGridKey` 或目标坐标）。
  - 确定性：同输入同结果，移动路径可重放；单位行动序（`order`）不因移动改变。
- **08b（表现层）**：
  - 复用 `effect-animator` 模式（ADR-027）：新增入场（开战实例化时从屏幕外/布阵起点淡入到位）、前冲/后撤（攻击时短促位移到目标方向再回位）、瞬移（teleport 直接跳变）动画。
  - presenter/渲染：按 `move`/`teleport` 事件驱动位移插值，动画终态回到 state 快照（`gridToXY` 新坐标）。
  - `unit-node-mapping`/VM 绑定无需大改（节点按 id 寻址，位置经 `gridToXY` 派生）。
- **ADR**：修订 ADR-025 决策 3（坐标真源移至逻辑层，`gridKey` 由逻辑层持有并更新，渲染仅消费）；扩展 ADR-027（move/teleport 事件为一等公民）。

## Capabilities

### New Capabilities

- `auto-battle-unit-motion`: 距离移动与换位——攻击前按 `attackRange` 判定，超出则逐格前移；技能可触发换位；`move`/`teleport` 事件入事件流（保序、确定性）；逻辑层持有并更新单位当前位置。

### Modified Capabilities

- `auto-battle-playable`: 单位从"固定布阵出发点"演进为"逻辑层持有可移动坐标"；普攻从"原地攻击"演进为"移动 + 普攻"两阶段；`state` 快照反映当前位置；新增 `move`/`teleport` 事件语义。
- `auto-battle-hit-feedback`: 命中反馈动画器模式扩展支持入场/前冲/后撤/瞬移（事件驱动演示层动画，终态回 state 姿态）。

## Impact

- `assets/samples/game_auto_battle/logic/`：新增 `move.ts`（MoveResolver + 路径计算）、`grid.ts` 扩展 `move`；`config.ts` 支持 `attackRange`；`battle.ts` 普攻/技能接入移动与 teleport、事件扩展；`models/models.ts` 单位类型加 `attackRange`、事件类型加 `move`/`teleport`。
- `assets/samples/game_auto_battle/view/`：`effect-animator.ts` 或新增 motion-animator 支持入场/前冲/瞬移；`presenter.ts` 消费 move/teleport 事件驱动动画。
- 测试：`tests/framework/foundation/` 新增 MoveResolver 确定性测试（同路径可重放）、移动+普攻两阶段、teleport 换位、超射程前移；既有回放一致性测试扩展锁定 move/teleport 事件。
- ADR：修订 ADR-025 决策 3、扩展 ADR-027。
- 不涉及 FGUI 资源新增（动画复用现有特效节点模式；如入场需遮罩则委派 fgui-designer）。

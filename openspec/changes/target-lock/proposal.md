## Why

当前自动战斗每行动都重新按"前排优先"选目标，敌方前排存活时所有攻击永远落在同一目标上，观战单调且缺乏针对性。让每个单位锁定目标直至其死亡/不可攻击，战斗更有层次，也为后续 08 移动进攻（移动后普攻同一锁定目标）铺路。

## What Changes

- 战斗单位新增 `lockedTargetId` 状态：普攻与伤害技能的目标选择从"每次行动重新选前排"改为"锁定目标优先、目标死亡后按前排优先重选"。
- `formation` 选择策略更新：新增锁定优先的选择入口，目标仍存活时复用既有锁定；锁定目标死亡/不可攻击时按前排优先（front > mid > back，同排取最靠前）顺延重选。
- `state` 快照暴露各单位的锁定关系（`lockedTargetId`），供渲染/日志/测试断言消费。
- `restart` 重开对局时清空全部锁定状态（重开幂等语义保持）。
- 治疗技能目标选择（己方 HP 最低）不受影响，不引入锁定。
- 保持确定性：同输入同结果，事件序列可重放；不改变伤害/能量公式与终局规则。

## Capabilities

### New Capabilities

- `auto-battle-target-lock`: 战斗单位锁定目标直至其死亡/不可攻击，目标死亡后按前排优先顺延重选；锁定状态进入战斗状态快照并在重开时重置。

### Modified Capabilities

- `auto-battle-playable`: 目标选择需求从"每次行动按前排优先重选"改为"锁定优先、目标死亡后顺延重选"；`state` 快照新增锁定关系字段。

## Impact

- `assets/samples/game_auto_battle/logic/formation.ts`：`selectAutoBattleTarget` 目标选择策略更新，新增锁定优先语义。
- `assets/samples/game_auto_battle/logic/battle.ts`：普攻（`basicAttack`）与伤害技能（`castSkill`）改为使用/维护锁定目标。
- `assets/samples/game_auto_battle/logic/units.ts` / `models/models.ts`：`MutableUnit` 与 `AutoBattleUnitState` 新增 `lockedTargetId`。
- 测试：`tests/framework/foundation/game-auto-battle-battle-formation.test.ts` 既有目标选择断言需更新，并新增锁定行为测试。
- 不涉及 FGUI 资源改动（纯逻辑层）。

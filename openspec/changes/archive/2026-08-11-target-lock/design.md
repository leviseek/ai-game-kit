## Context

现状目标选择是"每次行动重新按前排优先选目标"（`formation.ts` 的 `selectAutoBattleTarget`，在 `battle.ts` 的 `basicAttack` 与 `castSkill` 伤害分支各调用一次）。战斗单位是可变状态（`MutableUnit`），静态属性经 getter 委托只读 `def`；`state` 快照由 `snapshotUnits` 展开。坐标仍是静态出发点（05 阶段），距离移动留 08，故本 change 的锁定语义只基于 position 标签与存活判定。见 proposal.md - Why 与 `auto-battle-target-lock` / `auto-battle-playable` specs。

## Goals / Non-Goals

**Goals:**

- 单位锁定攻击目标直至其死亡/不可攻击，目标死亡后按前排优先顺延重选。
- 锁定关系进入状态快照，重开对局清空。
- 保持确定性（同输入同结果）、不改伤害/能量/终局规则、不改事件语义。

**Non-Goals:**

- 不改治疗目标选择（治疗仍按己方 HP 比例最低，不参与锁定）。
- 不引入仇恨/嘲讽等额外目标优先级（留待未来）。
- 不引入距离/移动语义（08 前锁定只基于 position 标签）。
- 不涉及 FGUI 资源（纯逻辑层，无 UI 表现）。

## Decisions

### 决策 1：锁定状态挂在 `MutableUnit` 上，作为可变字段而非静态属性

`MutableUnit` 新增 `lockedTargetId: string | null`（可变），静态定义不变。理由：锁定是战斗过程状态（随行动变化、随重开清空），与 `def`（静态配置）语义分离；`snapshotUnits` 展开时带入 `AutoBattleUnitState.lockedTargetId`。

- 备选：把锁定放在 `battle.ts` 的独立 `Map<unitId, targetId>`。放弃理由：锁定是单位自己的状态，挂单位上让快照/重开/未来 08 移动沿用更直接，避免两处数据真源。

### 决策 2：目标解析拆为"锁定优先 + 前排回退"两层纯函数

`formation.ts` 保留 `selectAutoBattleTarget`（前排优先，语义不变，作为无锁定/目标死亡后的回退），新增纯函数：

```ts
resolveAutoBattleTarget(
    enemies: readonly AutoBattleUnitView[],
    lockedTargetId: string | null,
): AutoBattleUnitView | undefined
```

逻辑：若 `lockedTargetId` 对应单位存活则返回之；否则（空锁定/目标死亡/不可攻击）返回 `selectAutoBattleTarget(enemies)`。

理由：锁定优先语义是"在前排优先之上的覆盖"，而非新目标排序规则；拆成两层让既有前排优先纯函数与测试继续复用，锁定规则单点可测。

- 备选：在 `selectAutoBattleTarget` 内改签名加锁定参数。放弃理由：会污染既有纯函数语义、破坏现有调用方（治疗不需要）；新增解析函数更贴合"锁定是可选覆盖"。

### 决策 3：锁定在 `basicAttack` 与 `castSkill`（伤害分支）各行动解析一次并写回

两处行动点统一改为：

```ts
const target = resolveAutoBattleTarget(sideUnits(opposingSide), actor.lockedTargetId);
actor.lockedTargetId = target?.id ?? null;
```

锁定目标死亡时，该次行动即重选新目标并锁定（"锁定目标死亡后顺延"在一个行动内完成）；治疗分支不触碰锁定。

理由：行动即解析与写回，无需额外"每轮开始时统一重锁"的相位；与现状"每次行动选目标"的最小改动对齐。

- 备选：每轮 `beginRound` 统一重算锁定。放弃理由：会引入"轮内单位锁定与轮间重锁"两套时间语义，与 06 roadmap"目标死亡后重选"的即时语义不符，且增加事件面。

### 决策 4：重开清空锁定由 `resetUnits` 天然保证

`resetUnits` 每次用 `createMutableUnit` 重建单位（初始 `lockedTargetId = null`），`restart` 调用它即清空全部锁定，无需额外代码。保持重开幂等（spec: 重开清空锁定）。

### 决策 5：治疗技能与锁定解耦

`castSkill` 治疗分支继续走 `selectAutoBattleHealTarget`，不读不写 `lockedTargetId`。理由：治疗目标语义与攻击锁定无关，引入锁定会制造无意义约束（spec: 治疗不参与锁定）。

## Risks / Trade-offs

- [既有目标选择测试断言依赖"每行动前排优先"] → 更新 `game-auto-battle-battle-formation.test.ts` 中目标选择断言为锁定语义；新增锁定专项测试锁定新行为。
- [锁定字段改变 `AutoBattleUnitState` 形状，下游渲染/断言消费快照] → 新增字段为可选（`lockedTargetId?: string` 或 `string | null`），渲染层暂不消费不影响现有页面；`validate --strict` 与既有测试跑通为准。
- [确定性破坏（同输入同结果）] → 锁定解析是纯函数（决策 2），行动写回仅依赖单位自身状态，不引入随机/墙钟；既有"同编队回放事件序列一致"测试继续锁定。
- [08 移动引入后锁定语义需与距离移动协调] → 本 change 锁定只依赖 position 标签与存活，字段名用 `lockedTargetId`（不含距离语义），为 08 演进留余地（08 修订 ADR-025 决策 3 时一并确认）。

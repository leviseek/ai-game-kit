## 1. 模型层：锁定状态字段

- [x] 1.1 `models/models.ts`：`AutoBattleUnitState` 新增 `lockedTargetId: string | null` 字段（可选命名按 design 决策 4 保持 `lockedTargetId`，注释说明"当前锁定攻击目标，null 表示未锁定；目标死亡后由下一行动重选"）。
- [x] 1.2 `logic/units.ts`：`MutableUnit` 新增可变字段 `lockedTargetId: string | null`；`createMutableUnit` 初始化为 `null`（满血零能量基础上补锁定空值）；`snapshotUnits` 展开时把 `lockedTargetId` 带入状态快照。

## 2. 逻辑层：锁定优先目标解析

- [x] 2.1 `logic/formation.ts`：新增纯函数 `resolveAutoBattleTarget(enemies, lockedTargetId)`：锁定目标存活则返回该目标，否则回退 `selectAutoBattleTarget(enemies)`（前排优先）；返回 undefined 表示无可攻击目标。注释说明锁定是前排优先之上的覆盖、治疗不走此函数。
- [x] 2.2 `logic/battle.ts`：`basicAttack` 与 `castSkill` 伤害分支改用 `resolveAutoBattleTarget(sideUnits(opposingSide), actor.lockedTargetId)`，并把解析结果写回 `actor.lockedTargetId = target?.id ?? null`；治疗分支不触碰锁定。既有 `selectAutoBattleTarget` 调用移除。

## 3. 测试：锁定行为锁定

- [x] 3.1 `tests/framework/foundation/game-auto-battle-battle-formation.test.ts`：新增测试组"目标锁定"——首次攻击锁定前排目标；锁定目标存活期间敌方出现更靠前目标仍不换目标；锁定目标死亡后顺延重选并重新锁定；治疗技能不受锁定影响；`state.units` 快照暴露 `lockedTargetId`；`restart` 后锁定清空。**审查增强（ai-sensei）**：补技能秒杀后顺延重选、他杀后同轮顺延（2v1：b 杀 x、a 顺延 y）、攻击落点持续为锁定目标断言、确定性回放追加完整快照比较（含 `lockedTargetId`）。
- [x] 3.2 更新既有目标选择断言为锁定语义（若断言假设"每行动重新选前排"则改为"首次行动锁定后持续攻击同一目标"）；确认同编队回放事件序列一致性测试在锁定引入后仍通过（确定性不回归）。既有 `game-auto-battle-battle.test.ts` 的 `target selection prefers the front row and falls back as rows die` 断言 `["x","y","y","z"]` 与锁定语义一致（锁 y 后连打两次致死），无需修改。

## 4. 集成验证与回归

- [x] 4.1 `bun test` 全绿：logic 目标锁定 + 既有战斗/编队测试无回归；`bun run typecheck` 通过（`lockedTargetId` 字段类型全链闭合）。
- [x] 4.2 `?smoke=auto-battle` 冒烟驱动完整对局到终局，确认战斗正常推进、无渲染回归（锁定为纯逻辑，页面表现不变）。Cocos 编辑器预览冒烟通过：battle-open/render-initial(round=1 units=6)/battle-end(round=12 result=win)/speed-cycle/restart/speed-result-unchanged 全部 ok。
- [x] 4.3 注释一致性：涉及文件（models/units/formation/battle）注释同步，无"每行动重新按前排选目标"陈旧表述残留；`tests/framework/support/auto-battle-fixture.ts` 镜像类型 `AutoBattleUnitState` 已同步补 `lockedTargetId`。

## 5. ADR 检查

- [x] 5.1 ADR 检查：目标锁定为战斗规则层玩法语义变化（纯函数 + 战斗运行时状态字段），不涉及框架边界/跨包契约/持久化 schema/渲染层；roadmap 第 5 节仅预判 ADR-025/026/027/028，target-lock 无 ADR 预判。按 change-04 7.2 先例（玩法与实现局部决策无需单独 ADR），本 change 无需创建 ADR。

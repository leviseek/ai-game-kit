# auto-battle-unit-motion Specification

## Purpose

让自动战斗（`game_auto_battle`）单位具备距离移动与换位能力：攻击前按 `attackRange` 判定，超出射程则沿最短路径逐格前移至满足射程的槽位再普攻；技能结算可触发换位；`move`/`teleport` 事件入事件流（保序、确定性）；逻辑层持有并更新单位当前位置（`gridKey` 真源在逻辑层），渲染仅消费坐标。

## Requirements

### Requirement: 距离移动与攻击射程

战斗单位 SHALL 持有 `attackRange` 属性；普攻前 SHALL 计算与目标单位的曼哈顿距离（`manhattan(current, target)`），若超出射程则沿最短路径（优先同排向前）逐格前移至满足射程的槽位再执行普攻；"移动 + 普攻"为同一行动的两阶段，不改变行动次序。

#### Scenario: 超射程前移后普攻

- **WHEN** 单位行动时与锁定目标曼哈顿距离大于其 `attackRange`
- **THEN** 该单位沿最短路径逐格前移至满足射程的槽位，广播 `move` 事件，随后对目标执行普攻

#### Scenario: 射程内原地普攻

- **WHEN** 单位行动时与目标曼哈顿距离不超过其 `attackRange`
- **THEN** 该单位不移动，原地对目标执行普攻（无 `move` 事件）

#### Scenario: 前移不改变行动次序

- **WHEN** 单位因超射程前移
- **THEN** 移动只更新单位当前位置，行动序列（`order`）与同轮行动次序不变（移动与行动解耦）

### Requirement: 技能触发换位

伤害技能结算 SHALL 可附带 `teleport` 换位：技能效果触发时把目标（或施法者）移动到指定网格格，广播 `teleport` 事件；换位后单位位置更新，目标选择/后续行动基于新位置。

#### Scenario: 技能换位

- **WHEN** 伤害技能结算触发换位效果
- **THEN** 目标（或施法者）被移动到指定格，广播 `teleport` 事件，单位 `gridKey` 更新

#### Scenario: 换位目标格被占用

- **WHEN** 换位目标格已被其它单位占用
- **THEN** 换位不执行（位置不变），不广播 `teleport` 事件

### Requirement: move/teleport 事件与确定性

`move`/`teleport` SHALL 作为一等公民事件入事件流（`seq` 保序、可回放）；移动与换位为纯函数结算，同一编队与配置对局两次回放，`move`/`teleport` 事件序列完全一致（同输入同结果）。

#### Scenario: 事件保序回放

- **WHEN** 同一编队与配置对局两次回放
- **THEN** 两次对局的 `move`/`teleport` 事件与全部事件序列一致，单位位置轨迹一致

#### Scenario: 状态快照反映当前位置

- **WHEN** 读取进行中的战斗状态快照
- **THEN** 快照中每个单位暴露其当前所在网格格（`gridKey`），移动/换位后更新

### Requirement: 跨排目标可移动

`resolveMovePath` SHALL 在目标与单位不在同一行时仍可推进：每步优先向目标行方向推进一行（列不变），行对齐后沿目标列方向推进，直到满足射程或到达边界；每步 SHALL 校验目标格空闲（占用即停在当前格）；路径解析 SHALL 保持确定性（纯函数、无随机、同输入同输出）；默认前排布阵下行为 SHALL 与既有同排移动一致。

#### Scenario: 跨排目标推进

- **WHEN** 单位在 0:3、目标在 1:0、射程 1
- **THEN** 路径为先向 1 行推进（1:3）再沿列推进（1:2、1:1），落点 1:1 距目标 1

#### Scenario: 跨排首步被占用则不动

- **WHEN** 跨排推进的垂直首步格被占用
- **THEN** 单位停在当前格，不移动

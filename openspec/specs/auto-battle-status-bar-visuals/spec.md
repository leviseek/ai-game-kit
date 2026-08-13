# auto-battle-status-bar-visuals Specification

## Purpose

定义 `game_auto_battle` 战场页状态条的视觉区分语义：各单位 HP 条与能量条以可区分的视觉呈现（颜色/尺寸/标签至少一项不同），区分属于渲染层表现，不改变进度值绑定、数据模型与战斗逻辑。

## Requirements

### Requirement: 血条与能量条视觉可区分

`game_auto_battle` 战场页 SHALL 以可区分的视觉呈现各单位 HP 条与能量条（颜色、尺寸或标签至少一项存在差异），使观战者无需阅读数值即可辨别血量与能量。

#### Scenario: 血条与能量条呈现差异

- **WHEN** 战场页初始化渲染单位组
- **THEN** 每个单位的 HP 条与能量条在颜色、尺寸或标签上存在可辨识的差异，二者不会混淆

#### Scenario: 区分不改变进度绑定

- **WHEN** 战场页以区分样式渲染血条与能量条
- **THEN** 血条/能量条节点仍按既有节点名（`bar_unit_{index}_hp` / `bar_unit_{index}_energy`）绑定，progress 值与单位 `hp/energy` 数据一致

### Requirement: 状态条样式与战斗逻辑解耦

状态条视觉区分 SHALL 为纯渲染层表现：改变血/能量条的呈现样式不改变战斗逻辑（伤害/治疗/能量规则、行动序列、胜负判定），逻辑层不感知状态条样式。

#### Scenario: 样式调整不改变逻辑结果

- **WHEN** 同一战斗配置分别以区分样式与未区分样式渲染状态条
- **THEN** 两种呈现下战斗推进的事件序列与终局结果完全一致（样式不进入逻辑输入）

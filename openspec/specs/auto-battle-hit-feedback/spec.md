# auto-battle-hit-feedback Specification

## Purpose

让自动战斗（`game_auto_battle`）战场页提供像素风命中反馈特效：战斗事件（普攻/技能伤害、治疗）经事件投影（event projection）驱动伤害飘字、受击闪白与抖动、治疗飘字；特效是叠加在 state 渲染之上的演示层动画，动画结束后回到 state 快照对应的姿态，不进入逻辑层、不改变事件序列与战斗结果。

## Requirements

### Requirement: 事件驱动命中反馈

战场页 SHALL 监听战斗事件并以事件驱动特效：`attack` 与 `skill-damage` 事件在目标屏幕坐标处触发**伤害飘字**（数值 = 事件 `value`，上浮淡出）并令目标节点**闪白 + 抖动**；`skill-heal` 事件在目标坐标触发**治疗飘字**（数值 = 事件 `value`）；`unit-dead` 事件不触发飘字/闪白（阵亡由渲染层回收）。特效由 TS 驱动（alpha/xy 插值），不依赖 FGUI transition。

#### Scenario: 普攻触发伤害飘字与受击闪白抖动

- **WHEN** 战斗中广播 `attack` 事件
- **THEN** 目标节点屏幕坐标处显示等于事件 `value` 的伤害飘字并上浮淡出，目标节点短时闪白并抖动，随后回到原姿态

#### Scenario: 伤害技能触发同类反馈

- **WHEN** 战斗中广播 `skill-damage` 事件
- **THEN** 目标坐标显示技能伤害数值飘字并上浮淡出，目标节点短时闪白并抖动

#### Scenario: 治疗触发治疗飘字

- **WHEN** 战斗中广播 `skill-heal` 事件
- **THEN** 目标坐标显示治疗数值飘字并上浮淡出（视觉上与伤害飘字区分），不触发闪白/抖动

#### Scenario: 阵亡不触发飘字闪白

- **WHEN** 战斗中广播 `unit-dead` 事件
- **THEN** 不产生新的飘字或闪白/抖动特效

### Requirement: 特效为演示层且终态回到状态

命中反馈与位移动画 SHALL 是叠加在 state 全量渲染之上的增量动画：特效播放不改变战斗状态、不产生新事件、不改变事件序列与终局结果；动画结束后目标节点姿态（坐标/透明度）回到 state 快照对应的值，无状态漂移。位移动画（入场/前冲/后撤/瞬移）SHALL 由 `move`/`teleport`/`round-start` 等事件驱动（事件投影），动画终态对齐 `gridToXY` 派生的 state 坐标。

#### Scenario: 特效不进入逻辑层

- **WHEN** 战斗推进产生攻击/技能/移动事件的同时播放命中反馈或位移动画
- **THEN** 战斗状态与事件序列不受特效影响，同一对局在有无特效渲染下回放一致（确定性不回归）

#### Scenario: 动画终态回到 state 姿态

- **WHEN** 飘字/闪白/抖动/位移动画结束
- **THEN** 目标节点坐标与透明度回到 state 快照对应的姿态（位移动画终态对齐 `gridToXY` 派生的新坐标），不残留动画位移或透明度

#### Scenario: move/teleport 事件驱动位移动画

- **WHEN** 战斗中广播 `move`/`teleport` 事件
- **THEN** 对应单位节点播放位移/瞬移动画（插值过渡或直接跳变），动画结束后节点坐标对齐 state 快照中的新位置

### Requirement: 特效节点与像素资源

战场页 SHALL 提供命中反馈所需的 FGUI 特效节点与像素资源：伤害/治疗飘字数字、受击闪白遮罩；像素图颜色取自 `ui/demo/palette.json` 允许集合，资源经 `bun run fgui sprite` 生成并登记，产出 XML 后 `bun run fgui validate --strict` 通过。

#### Scenario: 特效像素资源可用

- **WHEN** 战场页装配命中反馈
- **THEN** 飘字数字与闪白遮罩的像素资源已生成并登记，节点可经绑定/寻址访问

#### Scenario: 特效资源校验通过

- **WHEN** 完成特效节点 XML 与像素图改动
- **THEN** `bun run fgui validate --strict` 校验通过（引用完整、控制器/骨架合法、颜色在 palette 内）

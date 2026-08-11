## Why

当前自动战斗观战缺少命中反馈：攻击/技能只更新数值与血条，玩家无法从视觉上感知"谁打中谁、打了多少"。第一版（D4 决策）用**像素风命中反馈**补足战斗表现：伤害飘字 + 受击闪白/抖动，作为事件投影（event projection）叠加在 state 渲染之上，不进入逻辑层、不破坏确定性。

## What Changes

- 新增**事件→特效投影器**（presenter/view 层）：监听 `attack` / `skill-damage`（伤害飘字 + 受击闪白/抖动）与 `skill-heal`（治疗飘字），按事件 `value` 与 `targetId` 驱动特效。
- 新增**飘字**动画：伤害数值从目标屏幕坐标上浮淡出；**闪白**：目标节点短时变白；**抖动**：目标节点短时位移。全部由 TS 驱动（alpha/xy 插值），**禁止 FGUI transition**（AGENTS 约束）。
- 新增 FGUI 特效节点（委派 fgui-designer）：像素风数字/闪白遮罩，像素图经 `bun run fgui sprite` 生成并在 palette 登记。
- 渲染语义演进：presenter 从"每 tick 全量重建 VM"保持（state 全量渲染），特效作为**事件增量动画**叠加其上，动画结束后回到 state 快照姿态（无状态漂移）。
- 不改变战斗逻辑层与事件流；加速挡位下特效播放节奏跟随事件产生频率，不改变事件序列。

## Capabilities

### New Capabilities

- `auto-battle-hit-feedback`: 命中反馈特效投影——监听战斗事件驱动伤害飘字、受击闪白与抖动、治疗飘字；特效为演示层叠加，动画终态回到 state 快照姿态，不进入逻辑层。

### Modified Capabilities

- `auto-battle-playable`: 战场 ViewModel 渲染语义从"纯 state 全量刷新"演进为"state 全量渲染 + 事件增量动画"（特效叠加不改变 state 渲染结果与绑定节点名）。

## Impact

- `assets/samples/game_auto_battle/view/effects.ts`（新）：事件→特效投影器（引擎无关纯逻辑，输出特效意图列表）。
- `assets/samples/game_auto_battle/view/effect-animator.ts`（新，可选拆分）：TS 驱动的飘字/闪白/抖动动画调度（alpha/xy 插值）。
- `assets/samples/game_auto_battle/view/presenter.ts`：接入投影器，按事件增量触发动画。
- `assets/samples/game_auto_battle/assembly.ts`：装配特效相关能力，测试暴露投影器钩子。
- FGUI：`AutoBattle`/`Common` 包新增飘字与闪白遮罩节点与像素图（委派 fgui-designer + `bun run fgui sprite` + `validate --strict`）。
- 测试：`tests/framework/foundation/game-auto-battle-hit-feedback.test.ts`（新）——事件触发特效意图、动画终态回退到 state 姿态、确定性不回归。

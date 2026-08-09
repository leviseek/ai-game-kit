## Why

框架 v1 与五类夹具全部完成，但 `assets/game_*` 下没有任何真实 FairyGUI 页面，品类不可"玩"。C1 已完成目录分级、C2 已交付 ViewModel 自动 diff 渲染管线。C3 以 `game_card` 交付第一个真实可玩 MVP：真实 FairyGUI 战场页 + 点击出牌驱动战斗 + 敌方自动攻击 + 胜负终局，验证框架真实玩法闭环。

## What Changes

- `game_card` 玩法规则扩展（`logic/battle.ts`）：
  - 敌方阶段自动攻击：每间隔 `enemyAttackIntervalMs` 对玩家造成 `enemyDamage`（惰性同步补扣，对齐既有 syncPhase 模式）。
  - 玩家 HP ≤ 0 → 战败终局；敌方 HP ≤ 0 → 胜利终局（`CardBattleState` 增加 `result: "win" | "lose" | undefined`）。
- 配置扩展（`logic/config.ts`）：`enemyAttackIntervalMs`、`enemyDamage`。
- 真实 FGUI 页面（`ui/demo/assets/CardGame/` 包）：`BattleView.xml`——背景 + 敌我 HP 条 + mana 文本 + 3 手牌按钮 + 结束回合按钮 + 胜负提示层 + 重开按钮。创建委派 fgui-designer，id 前缀 `cg` 续编，sprite 颜色 ⊆ palette.json，`fgui validate --strict` 通过。
- UI 呈现层（`game_card/view/`）：新增 `view.ts` 定义 ViewModel + 绑定声明（VM 派生 + text/progress/visible/command 绑定），`ui.ts` 保留 route 登记。
- AppRoot 冒烟入口（`boot/AppRoot.ts`）：`?smoke=card-battle` 装配渲染器 + BattleView，驱动完整对局，console 输出 `[card-battle]` 标记。

## Capabilities

### New Capabilities

- `card-playable-battle`: game_card 真实可玩对战——敌方自动攻击、胜负终局判定、ViewModel 绑定声明到 FairyGUI 战场页、Cocos 冒烟驱动。

### Modified Capabilities

- `view-model-rendering`: 新管线在本 change 首次被真实页面消费（绑定声明 + FairyGuiViewHandle 接入），但无 spec 行为变化，不改 delta。

## Impact

- 游戏层：`game_card/logic/battle.ts`、`game_card/logic/config.ts`（扩展）、`game_card/models/models.ts`（状态扩展）、`game_card/view/view.ts`（新增）、`game_card/assembly.ts`（装配）。
- 框架层：无 core/contracts 改动（C2 已交付管线）；boot/AppRoot 扩展冒烟入口。
- FGUI 资产：`ui/demo/assets/CardGame/` 新包（BattleView.xml + sprite），经 fgui-designer 创建，`list-resources`/`next-id`/`sprite`/`validate --strict` 全流程。
- 测试：`game-card-fixture.test.ts` 扩展（敌攻/战败/胜利/VM 渲染）；fgui validate 通过。
- 无第三方依赖；`framework/core`+`contracts` 零改动。

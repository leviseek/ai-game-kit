## 1. 玩法规则扩展（TDD）

- [x] 1.1 在 `tests/framework/foundation/game-card-fixture.test.ts` 增加失败测试：敌方按间隔攻击、跳帧一次性结算、玩家 HP clamp 0、战败终局、胜利终局、终局后拒绝操作
- [x] 1.2 扩展 `models/models.ts`：`CardBattleState` 增加 `result: "win" | "lose" | undefined`，配置接口补充 `enemyAttackIntervalMs`、`enemyDamage`
- [x] 1.3 扩展 `logic/config.ts`：读取 `enemyAttackIntervalMs`、`enemyDamage`（configNumber 缺省）
- [x] 1.4 扩展 `logic/battle.ts`：`syncPhase` 惰性结算敌方攻击（lastAttackAt 防重）、战败终局、`restart()` 重建
- [x] 1.5 运行 `bun run test:foundation` 目标测试转绿

## 2. ViewModel 绑定层

- [x] 2.1 新增 `game_card/view/view.ts`：`createCardBattleViewModel(state, config)` VM 派生 + 绑定声明数组（text/progress/visible/command）
- [x] 2.2 扩展 `game_card/assembly.ts`：暴露 `restart()`；装配 view.ts 的 VM 与绑定供冒烟消费
- [x] 2.3 运行 `bun run test:foundation` 确认既有测试全绿

## 3. FGUI 页面（委派 fgui-designer）

- [x] 3.1 委派 fgui-designer 创建 `ui/demo/assets/CardGame/` 包 `BattleView.xml`（背景 + HP 条 + mana + 3 手牌按钮 + 结束回合 + 胜负层 + 重开）；id 前缀 `cg` 续编，sprite 颜色 ⊆ palette.json，禁 `<graph>`/transition，relation sidePair ≤ 2
- [x] 3.2 运行 `bun run fgui list-resources --package CardGame` 确认资源；`bun run fgui validate --strict --package CardGame` 通过
- [x] 3.3 确认 BattleView 子元素名与 view.ts 绑定声明节点名一致（txt_/bar_/btn_ 前缀）

## 4. Cocos 冒烟

- [x] 4.1 扩展 `boot/AppRoot.ts`：`?smoke=card-battle` 分支，装配渲染器 + BattleView，驱动完整对局，console 输出 `[card-battle]` 标记
- [x] 4.2 运行 `bun run typecheck`（含 tools/creator）通过

## 5. 收口验证

- [x] 5.1 运行 `bun run test:foundation`、`bun run test:foundation:types`、`bun run test:fgui` 全绿
- [x] 5.2 运行 `bun run typecheck` 通过；public-boundary 依赖扫描通过（game 层仍禁 import fgui）
- [x] 5.3 Cocos 预览 `?smoke=card-battle` 手动冒烟：页面可打开、点击出牌生效、敌攻扣血、胜负终局显示、重开可重置
- [x] 5.4 ADR 检查：本 change 消费 C2 管线并扩展玩法规则，未引入新架构决策（渲染/冒烟沿用 ADR-019/既有约定）；记录无需 ADR

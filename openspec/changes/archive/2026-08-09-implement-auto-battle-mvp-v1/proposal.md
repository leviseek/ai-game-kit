## Why

现有五个品类示例中只有 `game_card` 真实可玩，且它是炉石式（手牌+mana+逐张出牌）。仓库缺少"我叫MT/刀塔传奇"类自动战斗卡牌 RPG 的可玩样板，无法验证 tick 驱动的多单位自动战斗推进（该推进方式比 game_card 的回合 FSM 更接近真实手游品类）。本 change 新增第六品类 `game_auto_battle`，交付第一个完整可玩的自动战斗卡牌 RPG demo。

## What Changes

- 新增品类 `assets/samples/game_auto_battle/`（纯新增，不改任何现有文件）：
    - `models/`：`AutoBattleUnit`/`AutoBattleSkill`/`AutoBattleState`/`AutoBattleEvent` 业务类型。
    - `logic/`：`clock`（可控模拟时钟）、`config`（配置表读取）、`battle`（tick 驱动自动战斗）、`skills`（技能结算）、`formation`（阵列查询/排序/目标选择）。
    - `view/`：`view.ts`（ViewModel 派生 + 绑定声明）、`ui.ts`（route 登记）、`presenter.ts`（真实页面呈现）。
    - `assembly.ts`（组合夹具）、`smoke.ts`（冒烟入口）。
- 玩法范围（Phase 1 MVP）：3v3 多单位阵列、速度降序行动队列、普攻 + 能量自动放技能（伤害/治疗）、前排优先目标选择、胜负终局判定、`restart()` 重开。玩家零操作观战。
- 新增测试 `tests/framework/foundation/game-auto-battle-fixture.test.ts`（行为锁定，TDD 先行）。
- 新增 FGUI 资源包 `ui/demo/assets/AutoBattle/`（`BattleView.xml` + sprite），创建委派 fgui-designer，`validate --strict` 通过。
- 最小侵入扩展点（仅追加条目/分支，不删改现有行为）：
    - `assets/samples/entry.ts`：追加 `fixtures.auto_battle`/`presenters.auto_battle`/`smokes.autoBattle` 三条键。
    - `assets/boot/flow/SmokeRouter.ts`：追加 `?smoke=auto-battle` 分支。
    - `assets/boot/smoke/smoke-proxy.ts`：追加 `autoBattle` 键与 `runAutoBattleSmoke()` 方法。
    - `assets/game/lobby/catalog.ts`：追加 `auto_battle` 条目（playable: true）。
    - `ui/demo/assets/Demo/LobbyView.xml`：经 fgui-designer `/fgui-edit` 追加 `btn_auto_battle` 按钮节点（用户已放行）。
    - `README.md`：追加运行说明。
- **既有测试快照断言更新**（用户已放行）：`tests/framework/foundation/game-lobby-catalog.test.ts` 的 `playable === ["card"]` 断言更新为包含 `auto_battle`（新增可玩品类导致快照过期，属正常维护）。

## Capabilities

### New Capabilities

- `auto-battle-playable`: 自动战斗卡牌 RPG 品类真实可玩——多单位阵列按速度自动行动、能量积满自动放技能、前排优先目标选择、胜负终局判定、ViewModel 绑定到 FairyGUI 战场页、Cocos 冒烟驱动。

### Modified Capabilities

<!-- 无现有 spec 的行为需求变化；lobby catalog 快照断言更新属测试维护而非 spec 需求变更。 -->

## Impact

- 游戏层：`assets/samples/game_auto_battle/` 全新增（models/logic/view/assembly/smoke）。
- 框架层：零改动（复用 `createGameFixture`/`createViewModelRenderer`/`createUiNavigator`/`createConfigTable` 等既有接缝）。
- 扩展点：`entry.ts`、`SmokeRouter.ts`、`smoke-proxy.ts`、`catalog.ts`、`LobbyView.xml`、`README.md`（均只追加）。
- FGUI 资产：`ui/demo/assets/AutoBattle/` 新包（BattleView.xml + sprite），经 fgui-designer 创建。
- 测试：新增 `game-auto-battle-fixture.test.ts`；更新 `game-lobby-catalog.test.ts` 快照断言。
- 无第三方依赖；不触碰 `game_card`/`game_fight`/`game_idle`/`game_rpg`/`game_tycoon` 任何现有文件。

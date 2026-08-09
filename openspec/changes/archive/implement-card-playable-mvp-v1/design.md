## Context

C1 已把 `game_card` 分级为 `models/`、`logic/`、`view/`、`assembly.ts` 留根；C2 已交付 `contracts/ui/ViewModel.ts` + `core/ui/ViewModelRenderer.ts` + `adapters/cocos/ui/FairyGuiViewHandle.ts`。`game_card/logic/battle.ts` 目前 enemy 阶段只超时回 player，无攻击、无战败；`FairyGuiPageAdapter` 经 `createFairyGuiView` 打开静态页面，无真实交互绑定。

## Goals / Non-Goals

**Goals:**
- `game_card` 单战场页真实可玩：点击出牌、敌攻、胜负终局、重开。
- 经 C2 渲染管线驱动页面，游戏层不导入 fgui（public-boundary 锁定）。
- Cocos `?smoke=card-battle` 冒烟验证真实页面。

**Non-Goals:**
- 不做存档、抽卡、牌库、技能、AI（扩展方向，不在 MVP）。
- 不改框架 core/contracts（C2 已交付管线，本 change 只消费）。
- 不做多页导航（单战场页，重开即重置）。

## Decisions

### 1. 敌方攻击用惰性同步（对齐既有 syncPhase）

`battle.ts` 的 `syncPhase()` 已按"读取时惰性同步"推进 enemy 阶段。敌方攻击复用该模式：`syncPhase` 时按 `clock.now() - phaseEnteredAt` 已过时长计算攻击次数 `floor(elapsed / enemyAttackIntervalMs)`，一次性补扣 `count * enemyDamage`，并记录 lastAttackAt 防止重复结算。玩家 HP clamp 到 0。

**替代方案：** 固定次数攻击（`turnDurationMs / enemyAttackIntervalMs`）——无法对齐惰性推进语义，跳帧时确定性差。

### 2. 终局扩展 `CardBattleState`

`models/models.ts` 增加 `result: "win" | "lose" | undefined`。`finish` 事件区分来源：出牌结算 `enemyHp <= 0` → win；敌方攻击结算 `playerHp <= 0` → lose。终局后 `playCard`/`endTurn` 因 `fsm.state !== "player"` 天然拒绝（over 无出站转移）。

**替代方案：** 新增单独终局字段标志——与 phase 冗余，fsm over 已表达终局。

### 3. 重开 = 重建控制器

重开按钮命令触发 `assembly` 暴露的 `restart()`：重新 `createCardBattle(clock, config)` 并重建渲染器 VM。复用既有 `createCardFixture` 的组合逻辑（闭包重建），不新增模块。

### 4. ViewModel 绑定声明（`game_card/view/view.ts`）

纯数据声明，映射 CardBattleState → 节点名：
```
txt_player_hp  text    `HP ${playerHp}`
txt_enemy_hp   text    `HP ${enemyHp}`
txt_mana       text    `${mana}`
bar_enemy_hp   progress enemyHp / config.enemyHp
btn_card_0/1/2 command playCard(0/1/2)（禁用语义由 battle 返回 false 体现）
btn_end_turn   command endTurn()
txt_result     visible result !== undefined；text `胜利`/`战败`
btn_restart    command restart()
```
VM 派生函数 `createCardBattleViewModel(state)` 返回扁平 VM；绑定数组由 view.ts 导出。

### 5. FGUI 页面委托 fgui-designer

BattleView.xml 创建走 `/fgui-create`（fgui-designer subagent），主会话不手写 XML。确定性操作用 fgui CLI：`list-resources --package CardGame` 确认资源、`next-id --prefix cg` 分配 id、`sprite` 生成像素图（颜色 ⊆ palette.json）、`register-component`、`validate --strict` 通过。禁 `<graph>`、禁 transition、relation sidePair ≤ 2。

### 6. AppRoot 冒烟入口

`boot/AppRoot.ts` 新增 `?smoke=card-battle` 分支：初始化 UI 根 + pageAdapter，加载 CardGame 包，`createFairyGuiViewHandle` + `createViewModelRenderer` 装配到 BattleView，驱动出牌→敌攻→终局，console 输出 `[card-battle]` 标记。复用既有 `smokeUiLoadPackage`/`smokeUiOpenPage` 基础设施。

## Risks / Trade-offs

- [惰性补扣在终局边界重复结算] → lastAttackAt 记录防重；playerHp clamp 0 后进入 lose。
- [ViewModel 绑定与实际 FGUI 节点名不一致] → 绑定声明节点名与 fgui-designer 产出对齐（BattleView.xml 子元素名语义化 `txt_/bar_/btn_` 前缀），validate --strict 校验引用完整。
- [冒烟在真实 Cocos 环境的时序] → 复用既有 `?smoke=fairygui-ui` 的延迟到引擎 ready 后驱动模式（setTimeout 1s）。
- [renderer diff 对重开（新 battle 实例）的状态刷新] → restart 后 setViewModel 新 VM 全量渲染。

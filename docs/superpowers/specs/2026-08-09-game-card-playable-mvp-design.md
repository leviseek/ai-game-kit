# 2026-08-09 game_card 真实可玩 MVP 设计

## 目标

在 `ai-game-kit` 上交付第一个**真实可玩**的品类 MVP：`game_card` 卡牌对战单战场页。玩家通过真实 FairyGUI 页面点击出牌，敌方回合自动攻击，胜利/战败终局可见。作为框架价值最直接的验证，并确立"真实玩法 + 真实页面 + 渲染管线"的样板。

## 现状与缺口

- 框架 v1 完成：`game_card` 已有回合流状态机（`battle.ts`）、配置句柄、可控时钟、输入、UI 导航器，全部经 `GameFixture` 契约装配。
- 缺口 1：`FairyGuiPageAdapter.createPage` 返回的 `FairyGuiViewLike` 只有 `name`/`dispose`，无读取子元素/绑定点击的能力——真实玩法的"点击出牌→驱动战斗"无接缝。
- 缺口 2：`game_card/battle.ts` 的 enemy 阶段只会超时回到 player，**无攻击、无战败**；`finish` 只在 enemyHp≤0 触发，玩家 HP 永不下降。
- 缺口 3：`assets/game_*` 下没有任何真实 FairyGUI 页面引用，UI 协作全部走 ViewModel + 引擎无关导航器。
- 缺口 4：五类 `game_*` 目录结构平铺，UI 呈现层完成度不一致（tycoon 有 VM 派生、idle/fight 连 VM 类型都没有）。

## 边界与关键决策

### 1. 三个独立 change 拆分（C1 → C2 → C3）

| Change | 内容 | 交付物 |
|---|---|---|
| C1 目录分级重构 | 五类 `game_*` 统一子目录形态 | 纯重构，无行为变化，`test:foundation` 全绿验证 |
| C2 MVVM 渲染管线 | 框架通用自动 diff 渲染能力 | 新增 contracts/core/adapter 文件 + 新 ADR |
| C3 game_card 真实可玩 MVP | 玩法规则 + 真实 FGUI 页面 + 冒烟 | 可玩的单战场页 |

每步走 `openspec-propose → openspec-apply-change → openspec-archive-change` 完整闭环，避免互相阻塞。

### 2. C2 渲染管线的内核边界

- `core` + `contracts` 现有文件**零修改**（ADR-018 口径延续）。
- **新增**契约文件 `contracts/ui/ViewModel.ts` 与核心实现 `core/ui/ViewModelRenderer.ts`——这是新增能力而非修改既有文件。
- **新增 ADR**：允许在 `contracts/ui/` 与 `core/ui/` 新增文件，同时保持既有文件不变；同步登记 `expectedRootExports` 白名单供 public-boundary 检查。
- FGUI 类型只存在于 `adapters/cocos/ui` 边界的视图接缝文件（新增 `FairyGuiViewHandle.ts`），游戏层与 core 不接触 fgui。

### 3. 游戏层分级：子目录重构

C1 将五类 `game_*` 统一为子目录形态，`assembly.ts` 留根：

```
assets/game_card/（其余四类同形）
├── assembly.ts     ← 组合根，留根
├── models/         ← 类型（业务模型 + action + route + ViewModel 类型）
├── logic/          ← battle / config / clock / input 能力实现
└── view/           ← view.ts（VM 派生 + 绑定声明）+ ui.ts（route 登记）
```

- ViewModel 类型留在 `models/`（延续 card/rpg/tycoon 先例）。
- `view.ts` 承载 VM 派生 + 绑定声明（纯数据映射，不导入 fgui）；`ui.ts` 保留装配职责（登记 route），二者不合并。
- 影响面：5 处夹具测试路径（`game-card-fixture`/`game-rpg-fixture`/`game-idle-fixture`/`game-tycoon-fixture`/`game-fight-fixture`）+ `assets/game/fixture/registry.ts` 五处 import 需同步。public-boundary 递归扫描自动纳入新文件。

### 4. C3 玩法规则

- **玩家阶段**：点击手牌按钮出牌（`playCard`）——扣 mana、对敌方造成伤害；`end-turn` 进入敌方阶段。
- **敌方阶段**：惰性同步（对齐现有 `syncPhase()`），每间隔 `enemyAttackIntervalMs` 对玩家造成 `enemyDamage`；enemy 阶段总时长 `turnDurationMs` 内可多次攻击。
- **攻击时钟语义**：每次 `syncPhase` 时按已过时长一次性结算多次伤害（与现有惰性推进模式一致，跳帧确定性可测）。
- **终局**：
  - `enemyHp <= 0` → 胜利（`result: "win"`，进入 `over`）
  - `playerHp <= 0` → 战败（`result: "lose"`，进入 `over`）
  - `CardBattleState` 增加 `result: "win" | "lose" | undefined`；UI 展示胜负提示 + 重开按钮。
- 配置扩展：`enemyAttackIntervalMs`、`enemyDamage`。

### 5. ViewModel 绑定声明（view.ts）

```
CardBattleState → 绑定声明：
  txt_player_hp   ← `HP ${playerHp}`
  txt_enemy_hp    ← `HP ${enemyHp}`
  txt_mana        ← `${mana}`
  bar_enemy_hp    ← enemyHp/max (progress 0..1)
  btn_card_0/1/2  ← onClick → playCard(0/1/2)；disabled 由 phase/mana 派生
  btn_end_turn    ← onClick → endTurn()
  txt_result      ← win/lose 时显示，否则 hidden
  btn_restart     ← onClick → 重置对局（new game）
```

绑定声明只描述"VM 字段 → 呈现元素名"的映射关系，不含渲染逻辑，不导入 fgui。

### 6. FGUI 资产

`ui/demo/assets/CardGame/` 包，`BattleView.xml`：背景 + 敌我 HP 条 + mana 文本 + 3 手牌按钮 + 结束回合按钮 + 胜负提示层。

- 创建/修改委派 `fgui-designer` subagent（禁主会话手写 XML）。
- id 前缀 `cg` 续编（`next-id --prefix`）；sprite 颜色 ⊆ `ui/demo/palette.json`；禁 `<graph>`、禁手写 transition；`relation` sidePair ≤ 2。
- 产出后 `bun run fgui validate --strict` 到通过。

### 7. Cocos 冒烟验证

AppRoot 新增 `?smoke=card-battle` 入口：装配渲染器 + BattleView，驱动完整对局（出牌→敌攻→胜负），console 输出 `[card-battle]` 标记。测试侧继续用 memory 适配器锁玩法规则。

## 测试策略

TDD，全部 memory 适配器，不加载 fgui/cc：

- **C1**：重构后 `test:foundation` 全绿即验证无行为漂移。
- **C2** `view-model-renderer.test.ts`：
  - 全量渲染：setViewModel 后所有绑定写入视图节点
  - diff 渲染：字段变化只更新对应绑定（记录型 mock 视图断言只调用变化的 node）
  - subscribe 自动刷新：VM 变化触发自动 diff
  - 命令绑定：节点点击事件 → 业务回调
  - dispose：清理订阅、重复 dispose 幂等
  - 边界：未知 node 名优雅处理
- **C3** `game-card-fixture.test.ts` 扩展：
  - 敌方攻击：advance 时钟跨间隔，playerHp 逐次扣减
  - 跳帧补扣：一次 advance 跨多间隔，一次性结算多次
  - 战败终局：playerHp≤0 → over + result "lose"
  - 胜利终局：enemyHp≤0 → over + result "win"
  - ViewModel 经渲染器反映战斗状态（绑定到记录型视图断言）

## 错误处理

- 渲染器绑定到未知 node：按 view 契约容错（no-op 或记录），不中断战斗逻辑。
- battle 终局后非法操作沿用现有 `playCard` 返回 false 的静默拒绝语义。
- 敌方攻击在 disposed 后 no-op（沿用幂等契约）。

## 质量门禁

每实现单元运行：`bun run test:foundation`、`bun run test:foundation:types`、`bun run test:fgui`、`bun run typecheck`、`public-boundary.test.ts`、五类夹具目录独立 strict 类型检查。C3 完成后 `fgui validate --strict` 通过 + Cocos 预览手动冒烟。

## 扩展方向

- view.ts 绑定声明数据结构供后续品类复用（rpg/idle/fight 回填 VM 派生与 VM 类型）。
- ViewModelRenderer：后续可加双向绑定、列表渲染、动画驱动。
- battle.ts：未来可加抽卡、牌库、技能、AI 决策。

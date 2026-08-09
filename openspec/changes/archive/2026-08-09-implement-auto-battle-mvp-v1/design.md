## Context

框架 v1 已交付品类无关接缝（`createGameFixture`/`createViewModelRenderer`/`createUiNavigator`/`createConfigTable`/`createObjectPool`/`createAudioService`，白名单见 `assets/framework/index.ts`），`game_card`/`game_fight` 确立了组合夹具、ViewModel 绑定、smoke 冒烟的成熟模式。现有五个品类中 `game_card` 是炉石式（手牌+mana+回合 FSM，`game_card/logic/battle.ts:31-43`），与"我叫MT/刀塔传奇"自动战斗品类结构不符（见 proposal.md - Why）。`game_fight` 的逐帧 `tick()`（`game_fight/logic/battle.ts:129-167`）提供了手动单步推进的先例，可升级为多单位行动队列推进。

本 change 纯新增品类，不触碰任何现有源文件；对现有文件的改动仅限于最小侵入的追加条目/分支（见 proposal.md - What Changes）。

## Goals / Non-Goals

**Goals:**
- 交付 `game_auto_battle` 完整可玩 MVP：3v3 阵列、速度排序自动行动、能量自动放技能、前排优先目标选择、胜负终局、重开。
- 复用框架既有接缝，游戏层不导入 fgui/cc（public-boundary 保持）。
- 行为经 TDD 锁定（新增测试文件），smoke 驱动真实页面。

**Non-Goals:**
- 不做养成/收集/关卡/组队/资源经济（Phase 2 扩展方向）。
- 不做玩家操作（MVP 观战型，无玩法输入）。
- 不做可变编队/列表渲染绑定（MVP 固定 3v3 静态槽位）。
- 不改框架 core/contracts（消费既有管线，零改动）。

## Decisions

### 1. tick 驱动行动队列，而非回合 FSM

`battle.ts` 采用 `tick()` 单行动推进：每次 `tick()` 执行行动序列中的下一个行动；序列耗尽则轮次 +1、按存活单位速度降序重建序列。每轮 = 存活单位各行动一次。

**替代方案：** game_card 的 player/enemy 双阶段 FSM——该语义表达"玩家/敌方阶段"，本品类无玩家阶段，且 FSM 使测试需经时钟 advance 触发阶段转移，不如 `tick()` 单步直观。tick 驱动的确定性（序列固定、同输入同结果）也更适合自动战斗。

### 2. 每轮按速度降序构建稳定行动序列

行动序列在轮次开始时快照：存活单位按 `speed` 降序，同速以稳定次序（`side` 后阵列 index）保证确定性。行动中阵亡的单位执行时跳过（不重排，保证该轮次序固定）。

**替代方案：** 实时重排——会引入隐藏时序，破坏确定性测试。

### 3. 能量规则与技能释放

单位行动时：能量未满 → 普攻（伤害 = `attack`），攻击者 +10 能量、受击者 +5 能量（配置驱动，默认值）；能量达到 `skill.energyCost` → 释放技能（damage 对敌方前排优先目标、heal 对己方 HP 最低存活单位），能量清零。技能结算独立在 `logic/skills.ts`，battle 经选项注入（对齐 fight battle 注入 pool/onHit 模式）。

### 4. 前排优先目标选择（`formation.ts` 纯函数）

`selectTarget` 按站位优先级 front > mid > back，同排取阵列最靠前者；敌方全灭返回 undefined。胜负判定先于目标选择（终局后不再行动）。

### 5. 固定 3v3 静态槽位 ViewModel 绑定

单位节点命名 `unit_{index}_*`（index 0-5，先己方后敌方），VM 派生函数扁平化单位数组按静态槽位绑定。**不引入列表绑定框架能力**——若 Phase 2 需要可变编队再评估（届时需 ADR）。

### 6. FGUI 页面委派 fgui-designer

新包 `ui/demo/assets/AutoBattle/`（BattleView.xml + sprite），走 `/fgui-create`（fgui-designer subagent），主会话不手写 XML。确定性操作用 fgui CLI：`list-resources`/`next-id --prefix ab`/`sprite`（颜色 ⊆ palette.json）/`validate --strict`。禁 `<graph>`/transition、relation sidePair ≤ 2；跨包引用仅允许 Common。

### 7. 既有快照断言更新与 LobbyView 追加（用户已放行）

`tests/framework/foundation/game-lobby-catalog.test.ts:15-20` 的 `playable === ["card"]` 快照断言随新增可玩品类过期，更新为包含 `auto_battle`（新增能力更新过期快照断言属正常维护，非削弱验证）。`LobbyView.xml` 经 fgui-designer `/fgui-edit` 追加 `btn_auto_battle` 按钮节点。

## Risks / Trade-offs

- [tick 步长与 UI 刷新频率错位] → 渲染永远基于不可变 `state` 快照 + 事件回放；presenter 每次 interval 先 `clock.advance` 再 `tick()` 再 `render()`；冒烟用手动 tick 保证确定性。
- [能量节奏平衡导致战斗卡死/超快] → 能量规则全进 config 表、测试锁定增长语义；冒烟验证战斗能自然终局。
- [测试确定性被隐藏随机破坏] → 速度稳定排序、目标选择纯函数、battle 只依赖注入 clock；确定性测试双跑逐字段一致。
- [数组操作边界（全灭后 tick、heal 无伤员）] → 终局先于行动结算；`selectTarget` 无目标时行动退化为 no-op；防御性守卫覆盖。
- [文件超 300 行（`.ai/instructions.md:2`）] → battle/view 超限时把行动结算拆入 skills.ts、VM 派生拆独立函数。
- [既有快照断言冲突] → 已放行更新 `game-lobby-catalog.test.ts`；列入 tasks 显式处理。
- [UI 包发布产物] → 新包需 FGUI 编辑器发布 `.bin`/atlas，编辑器不可用时 CI 只验 XML；复现 card 流程，发布步骤人工执行并禁止提交陈旧 bin。

## Migration Plan

纯新增品类，无既有行为迁移。实施顺序：TDD 测试 → models → skills/formation → battle → assembly → view → fgui-designer 页面 → smoke → 扩展点接入 → 收口验证。回滚 = 删除新增文件与追加条目。

## Open Questions

无（规格、方案与任务拆解均已在本 change 内定案）。

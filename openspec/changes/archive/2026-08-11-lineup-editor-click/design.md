## Context

`game_auto_battle` 目前开战单位来自配置表固定 `teams.ally/enemy`（`logic/config.ts` 的 `AutoBattleConfigHandle`，每队 1..6，`MAX_TEAM_SIZE=6`）；战场页绑定预置 `2*MAX_TEAM_SIZE` 个全局槽位（`view/view.ts` 的 `createAutoBattleBindings` + `slotToXY`），按显隐控制规模。持久化复用 framework `createVersionedStorage`（namespace + key + schema 迁移）。本 change 落地 roadmap Stage 1 的布阵编辑（D3 点击选择）与战场模型（MapGrid + 布阵区），动机见 `proposal.md`。坐标本阶段仍静态（布阵只决定出发点），距离移动留 change 08。

## Goals / Non-Goals

**Goals:**
- 建立 HeroPool（静态英雄配置）+ Lineup（可变编队）数据模型，versioned-storage 持久化。
- 引入平铺网格（MapGrid + 占用表）与布阵区（己方边缘 3×3=9），`MAX_TEAM_SIZE` 语义拆分为"上阵上限 6 / 布阵区容量 9"。
- 编队页面点击选择填充/替换/卸下，开战由 lineup 实例化单位到布阵区对应格，战斗实例化后与 lineup 解耦。
- UnitSlot 可复用组件（Common 跨包）+ 战场页运行时动态实例化。

**Non-Goals:**
- 不做距离移动、逻辑层动态坐标消费（change 08）。
- 不做拖拽（D3）、英雄成长/解锁、战力预估。
- 不回溯 `battle-scale-config` 已归档语义（`MAX_TEAM_SIZE=6` 保留为上阵上限）。
- 战斗逻辑本体（tick/伤害/能量/胜负）不变。

## Decisions

### D1 数据模型三层：HeroPool / Lineup / 战斗实例快照

`HeroPool` 为不可变静态配置（英雄 id/名称/站位/属性/技能），形状沿用 `AutoBattleUnit`（无 side/index）。`Lineup` 为可变编队（槽位序列 slot 0..N-1 → heroId），唯一可变真源。开战时由 lineup 实例化战斗单位，`createAutoBattleBattle` 内部持有**快照**（战斗单位副本），与存档 lineup 解耦——战斗内改动不回流存档。
理由：避免"战斗引用 live lineup"造成存档被战斗污染；对齐 roadmap 3.3。备选（战斗直接引用 lineup）被否：破坏存档独立性，测试难隔离。

**slot ↔ index 映射契约**：玩家编队 `AutoBattleLineup.slots` 是定长（0..布阵区容量-1，即 0..8 共 9 格，含空槽），决定"上哪些英雄、布阵出发点"；开战实例化时按 slots 的非空项（保持槽位升序）导出 placement（slot + heroId），战斗单位 `index` = 压缩序（0..上阵数-1），决定同排行动次序与渲染寻址（与既有 `AutoBattleUnit.index` 语义一致）。slot 与 index 解耦：布阵位置由 slot 决定，战斗内寻址由 index 决定。初始编队 `config.lineups` 为压缩 id 数组（无空槽，语义 = 已上阵序），开战时按已上阵序映射到布阵区前段格（slot=0..n-1），与玩家编队定长结构互为转换。

### D2 配置演进：heroes 池 + lineup 取代 teams

`logic/config.ts` 从读 `teams.ally/enemy` 演进为读 `heroes` 池 + `lineups`（ally/enemy 初始编队，引用池内 heroId）。为控制迁移面，保留一层**兼容读取器**：无 `heroes` 键时把旧 `teams` 转成池 + 编队，标记 deprecated，测试逐步收敛后删除。
理由：fixtures/冒烟测试量大，一步替换易碎；兼容层保持确定性语义不变（`MAX_TEAM_SIZE` 校验沿用）。备选（直接删除 teams）被否：破坏性迁移风险高，与"不回溯已归档"原则冲突。

### D3 MapGrid 纯函数网格 + 占用表

新增 `logic/grid.ts`：`MapGrid` 为 rows×cols 逻辑网格，维护 `occupied: Map<gridKey, unitId>`；布阵区 = 己方边缘 `FORMATION_GRID_COLS×ROWS`（首版 3×3=9，常量）。`gridKey` = `row:col` 字符串。操作（place/release/query）为纯函数结算。
理由：坐标是逻辑数据，为 08 的 MoveResolver 留接口；纯函数保确定性。本阶段**逻辑层只读出发点**，屏幕坐标由 `gridToXY` 单向推导（沿用 `slotToXY` 的思路，改为网格坐标输入）。

### D4 MAX_TEAM_SIZE 语义拆分

保留 `MAX_TEAM_SIZE=6`（`config.ts` 常量，上阵上限，校验语义不变）；新增 `FORMATION_GRID_SIZE`（布阵区容量 9）。两者解耦：布阵区允许空余格，上阵数仍受上限约束。
理由：草案评审结论——不破坏 change 04 的超规模断言与既有测试。

### D5 持久化：LineupStore 自持版本化（对齐 game_idle 先例）

`createVersionedStorage` 不在 framework 公开 API 白名单（`assets/framework/index.ts` 明确"不直接深层导入"），故对齐同层挂机品类 `game_idle/logic/save.ts` 的 `createIdleSave` 自持模式：LineupStore 自编码 `{ version, data }` 记录（version=1），namespace `auto_battle` / key `lineup`，payload 为 `{ slots: (string|null)[] }`；迁移器映射按版本注册（v1 为空，预留）。损坏/未来版本拒绝抛错，旧版本逐级迁移。
理由：遵循白名单边界与 sample 层既有模式；schema 版本化保证未来 09 挂机消费兼容。

### D6 呈现抽离：UnitSlot 动态实例化

`UnitSlot`（名称/HP 文本/HP 条/能量条，引用 Common 进度条）放 `ui/demo/assets/Common/`，位置经 `ViewModelNode.setXY` 写入。战场页从"预置固定槽位 + visible 显隐"演进为"容器 + 运行时按网格存活单位动态装配 UnitSlot"（`assembly` 遍历存活单位 → createObject → 绑定 + setXY）。编队页为独立页面 `LineupEditorView`（候选英雄区 + 布阵区）。
理由：草案的组件化方向；跨包复用避免多页面重复。绑定节点名从全局索引（`unit_{globalIndex}`）演进为运行时实例名（`unit_{id}`），需同步更新绑定声明、fixture 与冒烟断言。

### D7 编队交互为纯函数 reducer

lineup 编辑（填充/替换/卸下）为纯函数状态变换（`editLineup(lineup, action)`），命令绑定注入到编队页 VM；持久化在每次编辑提交时触发。
理由：可测性；与既有"纯函数逻辑层"约定一致。

## Risks / Trade-offs

- **配置迁移面大（teams→heroes+lineup）** → 兼容读取器 + 既有测试在迁移期全绿，收敛后删兼容层。
- **FGUI 动态实例化与跨包引用（UnitSlot 放 Common）** → 委派 fgui-designer；`bun run fgui validate --strict` 通过才发布；发布产物由编辑器生成。
- **节点命名契约变化（预置槽位 → 动态实例名）** → 绑定声明、fixture `viewNodes`、冒烟断言同步更新；测试锁定动态增删行为。
- **上阵上限与布阵区容量混淆** → 两个常量显式分离，测试分别覆盖"超上限拒绝"与"布阵区空余格"。
- **持久化 schema 演进** → versioned-storage v1 + 迁移预留；测试覆盖 schema 迁移场景。
- **确定性被编队引入破坏** → 编队只影响开战快照实例化，tick 内逻辑不变；测试断言"同一 lineup 对局事件序列可重放"。

## Migration Plan

1. 先落 `logic/grid.ts`（MapGrid + 布阵区）与数据模型（HeroPool/Lineup），纯逻辑单测先行。
2. config 兼容读取器过渡，更新既有 fixture 配置为新格式。
3. FGUI：UnitSlot + LineupEditorView + AutoBattleView 容器化（fgui-designer），validate 通过后发布。
4. assembly 接线编队→开战→布阵区；冒烟/截图更新。
5. ADR-026 落档（编队 + 战场模型边界、持久化 schema、MAX_TEAM_SIZE 语义）。

## Open Questions

- 敌方编队来源：本 change 采用配置固定敌方 lineup（默认阵容）；是否允许玩家配置敌方（如挑战关卡）属 09 挂机/后续提案，不阻塞本 change。

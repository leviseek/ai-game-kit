## Why

`game_auto_battle` 目前是纯观战 demo：玩家只能看，不能选择上阵单位。roadmap Stage 1 的"可操作"玩法核心从布阵编辑开始——本 change 落地 HeroPool + Lineup 数据模型、战场模型（MapGrid + 布阵区）与点击布阵交互（D3），并把开战装配从固定 teams 配置演进为由 lineup 实例化。这是后续锁定目标（06）、位移（08）、挂机（09）的共同底座，故优先实施。

## What Changes

- **编队数据模型（3.3）**：新增 `HeroPool`（静态英雄配置，不可变）与 `Lineup`（玩家可变编队 = 槽位序列 → hero id），经 versioned-storage（ADR-013）持久化，schema 版本化。
- **战场模型（平铺网格）**：新增 `MapGrid`（rows×cols 网格 + 占用表），**布阵区** = 己方边缘 3×3=9 格（可配置常量）；`MAX_TEAM_SIZE` 语义拆分——"布阵区容量（9，网格常量）"与"实际上阵上限（保留 `MAX_TEAM_SIZE=6`，配置可调）"，不回溯 change 04。
- **呈现抽离**：新增 `UnitSlot` 可复用组件（放 `ui/demo/assets/Common/`，含名称/HP 文本/HP 条/能量条），位置经 `setXY` 写入（复用 ADR-025 决策 3 契约）；战场页从固定 12 槽演进为"一个空战场容器 + 运行时按网格实例化 UnitSlot"。
- **编队页面**：候选英雄区 + 布阵区；**点击选择**（D3）：点击候选英雄填入空槽/替换选中槽，点击已上阵英雄卸下。
- **开战装配**：由 lineup 实例化战斗单位到布阵区对应格，战斗实例化后与 lineup 解耦（战斗内修改不影响存档编队）。
- **坐标先静态**：本 change 逻辑层只读静态出发点（布阵决定出发点），**不做**距离移动与逻辑层动态坐标消费（留 change 08）。

## Capabilities

### New Capabilities

- `auto-battle-lineup-editor`: 编队编辑与持久化——HeroPool 静态配置、Lineup 可变槽位序列、点击选择填充/替换/卸下交互、从编队开战、versioned-storage 持久化与恢复。

### Modified Capabilities

- `auto-battle-battlefield-layout`: 战场从"每侧固定 ≤6 槽纵向排列"演进为"平铺网格（MapGrid）+ 布阵区 + 运行时动态实例化 UnitSlot"；敌左我右与"布局属纯渲染层、不改变战斗逻辑"的基础语义保留。
- `auto-battle-playable`: 开战装配从固定 teams 配置改为由 lineup 实例化到布阵区格；战场 ViewModel 绑定从固定 12 槽预置演进为按网格存活单位动态实例化 UnitSlot（槽位显隐语义被动态实例化取代）。

## Impact

- `assets/samples/game_auto_battle/logic/`：新增 `grid.ts`（MapGrid + 占用表）、`formation.ts`（布阵区 + lineup 实例化）；`config.ts` 从固定 teams 演进为 heroes 池 + 初始 lineup；`models/models.ts` 增加 HeroPool/Lineup/战场网格相关类型。
- `assets/samples/game_auto_battle/`：`view/`（UnitSlot 装配与 setXY 写入）、`assembly.ts`（编队→开战接线）、`smoke.ts`/fixtures（布阵场景）。
- 持久化：复用 `platform-storage` + `versioned-storage`（ADR-013），lineup 存档 schema 兼容 09 挂机消费。
- FGUI：`ui/demo/assets/Common/UnitSlot.xml`（新组件，跨包）、`ui/demo/assets/AutoBattle/LineupEditorView.xml`（编队页）、`AutoBattleView.xml` 战场容器化——**均委派 fgui-designer**，产物经 `bun run fgui validate --strict`，发布产物由编辑器生成。
- **ADR-026**：编队 + 战场模型（Lineup↔布阵区映射、UnitSlot 契约、MAX_TEAM_SIZE 语义、持久化 schema）。
- 测试：`logic/` 单测（MapGrid 占用/布阵区容量、lineup 填充/卸下/持久化恢复）、装配冒烟。

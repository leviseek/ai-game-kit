# ADR-026 Lineup Data Model

## 状态

Accepted

## 背景

`game_auto_battle` 目前是纯观战 demo：开战单位来自配置表固定 `teams.ally/enemy`（`logic/config.ts` 的 `AutoBattleConfigHandle`，每队 1..6），战场页绑定预置 `2*MAX_TEAM_SIZE` 个全局槽位（`view/view.ts` 的 `createAutoBattleBindings` + `slotToXY`）按显隐控制规模，玩家只能看、不能选择上阵单位。roadmap Stage 1 的"可操作"玩法核心从布阵编辑开始，需要落地 HeroPool + Lineup 数据模型、战场模型（MapGrid + 布阵区）与点击布阵交互（D3），并把开战装配从固定 teams 配置演进为由 lineup 实例化。这是后续锁定目标（06）、位移（08）、挂机（09）的共同底座，故优先实施。

ADR-025 已把 `side+index` 定义为队内逻辑槽位身份、`slotToXY` 单向表现映射，并在决策 5 预留了"平铺网格 + 布阵区 + 动态坐标"的演进方向。本 ADR 落地该演进的第一阶段：编队数据模型、平铺网格与布阵区、点击布阵交互、由 lineup 实例化开战；坐标本阶段仍静态（布阵只决定出发点），距离移动与逻辑层动态坐标消费留 change 08。

## 决策

### 1. 数据模型三层：HeroPool / Lineup / 战斗实例快照

`HeroPool` 为不可变静态配置（英雄 id/名称/站位/属性/技能），形状沿用 `AutoBattleUnit`（无 side/index）。`Lineup` 为可变编队（槽位序列 slot 0..N-1 → heroId），唯一可变真源。开战时由 lineup 实例化战斗单位，`createAutoBattleBattle` 内部持有**快照**（战斗单位副本），与存档 lineup 解耦——战斗内改动不回流存档。

理由：避免"战斗引用 live lineup"造成存档被战斗污染。备选（战斗直接引用 lineup）被否：破坏存档独立性，测试难隔离。

**slot ↔ index 映射契约**：玩家编队 `AutoBattleLineup.slots` 是定长（0..MAX_TEAM_SIZE-1，含空槽），决定"上哪些英雄、布阵出发点"；开战实例化时按 slots 的**非空序**（保持槽位升序）导出压缩 id 序列，战斗单位 `index` = 压缩序（0..上阵数-1），决定同排行动次序与渲染寻址（与既有 `AutoBattleUnit.index` 语义一致）。slot 与 index 解耦：布阵位置由 slot 决定，战斗内寻址由 index 决定。初始编队 `config.lineups` 为压缩 id 数组（无空槽，语义 = 已上阵序），与玩家编队定长结构互为转换。

### 2. 配置演进：heroes 池 + lineup 取代 teams

`logic/config.ts` 从读 `teams.ally/enemy` 演进为读 `heroes` 池 + `lineups`（ally/enemy 初始编队，引用池内 heroId）。为控制迁移面，保留一层**兼容读取器**：无 `heroes` 键时把旧 `teams` 转成池 + 编队，标记 deprecated，测试逐步收敛后删除。

理由：fixtures/冒烟测试量大，一步替换易碎；兼容层保持确定性语义不变（`MAX_TEAM_SIZE` 校验沿用）。备选（直接删除 teams）被否：破坏性迁移风险高，与"不回溯已归档"原则冲突。

### 3. MapGrid 纯函数网格 + 占用表

新增 `logic/grid.ts`：`MapGrid` 为 rows×cols 逻辑网格，维护 `occupied: Map<gridKey, unitId>`；布阵区 = 己方边缘 `FORMATION_GRID_COLS×ROWS`（首版 3×3=9，常量）。`gridKey` = `row:col` 字符串。操作（place/release/query）为纯函数结算。

理由：坐标是逻辑数据，为 08 的 MoveResolver 留接口；纯函数保确定性。本阶段**逻辑层只读出发点**，屏幕坐标由 `gridToXY` 单向推导（沿用 `slotToXY` 的思路，改为网格坐标输入）。

### 4. MAX_TEAM_SIZE 语义拆分

保留 `MAX_TEAM_SIZE=6`（`config.ts` 常量，上阵上限，校验语义不变）；新增 `FORMATION_GRID_SIZE`（布阵区容量 9）。两者解耦：布阵区允许空余格，上阵数仍受上限约束。

理由：草案评审结论——不破坏 change 04 的超规模断言与既有测试。

### 5. 持久化：LineupStore 自持版本化（对齐 game_idle 先例）

`createVersionedStorage` 不在 framework 公开 API 白名单（`assets/framework/index.ts` 明确"不直接深层导入"），故对齐同层挂机品类 `game_idle/logic/save.ts` 的 `createIdleSave` 自持模式：LineupStore 自编码 `{ version, data }` 记录（version=1），namespace `auto_battle` / key `lineup`，payload 为 `{ slots: (string|null)[] }`；迁移器映射按版本注册（v1 为空，预留）。损坏/未来版本拒绝抛错，旧版本逐级迁移。

理由：遵循白名单边界与 sample 层既有模式；schema 版本化保证未来 09 挂机消费兼容。

### 6. 呈现抽离：UnitSlot 动态实例化

`UnitSlot`（名称/HP 文本/HP 条/能量条，引用 Common 进度条）放 `ui/demo/assets/Common/`，位置经 `ViewModelNode.setXY` 写入。战场页从"预置固定槽位 + visible 显隐"演进为"容器 + 运行时按网格存活单位动态装配 UnitSlot"（`assembly` 遍历存活单位 → createObject → 绑定 + setXY）。编队页为独立页面 `LineupEditorView`（候选英雄区 + 布阵区）。

理由：组件化方向；跨包复用避免多页面重复。绑定节点名从全局索引（`unit_{globalIndex}`）演进为运行时实例名（`unit_{id}`），需同步更新绑定声明、fixture 与冒烟断言。

### 7. 编队交互为纯函数 reducer

lineup 编辑（填充/替换/卸下）为纯函数状态变换（`editLineup(lineup, action)`），命令绑定注入到编队页 VM；持久化在每次编辑提交时触发。

理由：可测性；与既有"纯函数逻辑层"约定一致。

## 理由

- 真源唯一：HeroPool 不可变静态、Lineup 可变唯一真源、战斗持快照，三者边界清晰，存档不被战斗污染。
- 与 ADR-025 演进路径一致：slot↔index 解耦延续既有 `index` 语义，MapGrid 为 change 08 位移预留接口。
- 迁移面可控：teams 兼容读取器保证既有 fixture/冒烟在迁移期全绿。
- 遵循白名单边界：LineupStore 自持版本化对齐 `game_idle` 先例，不深层导入 framework 内部 API。
- 可测性：MapGrid/lineup reducer 均为纯函数；确定性对局事件序列可重放。

## 影响

- `models.ts` 新增 HeroPool/Lineup 与战场网格相关类型；`config.ts` 演进 heroes + lineups（teams 兼容读取器标记 deprecated）。
- `logic/` 新增 `grid.ts`（MapGrid + 布阵区）、`formation.ts`（布阵区 + lineup 实例化）、`lineup.ts`（编辑 reducer）、`lineup-store.ts`（持久化封装）。
- `view/` 新增网格坐标→屏幕坐标映射（`gridToXY`）与编队页 VM；`assembly.ts` 编队→开战→布阵区接线。
- FGUI：`Common/UnitSlot.xml`（新组件，跨包）、`AutoBattle/LineupEditorView.xml`（编队页）、`AutoBattleView.xml` 战场容器化——均委派 fgui-designer，产物经 `bun run fgui validate --strict`，发布产物由编辑器生成。
- 持久化：复用 `platform-storage` + 自持版本化 schema，lineup 存档兼容未来 09 挂机消费。
- 后续 change 08（距离移动 / MoveResolver）将让逻辑层开始消费坐标，届时修订本 ADR 决策 3 的"坐标只服务表现层"边界。

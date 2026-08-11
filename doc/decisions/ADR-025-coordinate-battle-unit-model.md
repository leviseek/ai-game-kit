# ADR-025 Coordinate Battle Unit Model

## 状态

Accepted

## 背景

`game_auto_battle` 从固定 3v3 演进为 NvN 可配置（每队 1..6）时，需要统一的"战斗单元在哪里、谁先行动、渲染到哪"的身份模型。既有代码用 `index`（队内序号）兼作实例化顺序与渲染槽位寻址，`position` 标签（front/mid/back）兼作目标选择优先级；二者边界模糊，且渲染侧固定在 6 槽（`view.ts` 固定循环 `index < 6`、`AutoBattleView.xml` 每侧 3 槽硬编码坐标），规模放开后无法表达动态槽位与坐标。

路线图（`docs/roadmap/auto-battle-evolution-umbrella.md`）将 04（逻辑槽位）、01/05（渲染映射/布阵）、07/08（表现坐标/位移）分层推进；本 ADR 落地 04 的逻辑槽位模型与 01 推迟的 slot→xy 渲染映射，为后续位移/特效提供坐标锚点。

## 决策

### 1. 真源划分：`position` 标签保留为目标选择语义，`side+index` 为逻辑槽位身份

- `position`（front/mid/back）仍是目标选择优先级的**唯一**语义（`selectAutoBattleTarget` 依 `POSITION_ORDER` 排序）。
- `side + index` 是**队内**逻辑槽位身份（`index` 为 0..N-1），决定实例化顺序与同排稳定次序（`sortAutoBattleOrder` 以 `SIDE_ORDER` + `index` 保证确定性）。
- 二者由配置直接给定，无相互推导，避免双真源。渲染寻址时 `index` 是队内序号，绑定节点名 `unit_{全局索引}` 用**全局索引**（先己方后敌方拼接）：全局索引 = side 偏移（己方 0、敌方 `MAX_TEAM_SIZE`）+ 队内 `index`。渲染层显式做偏移转换，避免 6v6 时敌我两侧队内 index 均为 0..5 拼出相同节点名冲突。

**未采用方案：** 为 unit 新增独立 `slotIndex` 字段替代 `index`——`formation.ts`/`sortAutoBattleOrder`/`battle.ts` 均已消费 `index`，物理改名属无关重构且增大回归面（决策 2）。

### 2. `index` 保留字段名，仅正式化语义与注释

不改名 `index → slotIndex`；通过注释把语义锁定为"队内逻辑槽位序号 0..N-1（实例化顺序与同排稳定次序身份），与 position（目标选择语义）分工"。物理改名留待 05 布阵建模时统一评估。

### 3. 坐标真源：逻辑层持有并更新（change 08 修订后）

- **本阶段（change 04-07，已归档）**：`view/view.ts` 新增 `slotToXY(side, slotIndex, teamSize) → {x, y}` 纯函数，由槽位序推导屏幕坐标（敌左、己右），不反向回写逻辑；坐标**只服务表现层**，逻辑层（battle/formation/units）不消费 xy。
- **change 08 修订（本文件更新）**：坐标真源**移至逻辑层**——`MutableUnit.gridKey` 改为可变字段（`units.ts`），由逻辑层持有并更新；`MapGrid` 增加原子 `move(unitId, gridKey)`；普攻/伤害技能按 `attackRange` 判定，超射程经 `resolveMovePath`（`logic/move.ts`）逐格前移（`move` 事件入事件流），技能可触发 `teleport` 换位；`state` 快照反映当前位置。渲染仍经 `gridToXY` 单向消费坐标，不反向回写逻辑。
- 为此框架 `ViewModelNode` 契约向后兼容扩展可选 `setXY?(x, y)`，`Binding` 判别联合新增 `PositionBinding<VM>`（kind `"position"`）；渲染器 `applyBinding` 对 position 绑定做 x/y 分量结构比较 diff，节点未实现 `setXY` 时忽略不中断。FGUI 适配器（`FairyGuiViewHandle`）实现 `setXY` 写 `GObject` 坐标，fgui 类型仅限 adapter 边界。

**未采用方案：** 把 setXY 设为必需方法——所有实现点（GameLobbyHostImpl/CardGame/测试 toNode）都要改，跨品类波及面大；新增独立 `ViewModelPositionNode` 接口——额外接口层级收益有限。

### 4. 规模上限常量 `MAX_TEAM_SIZE = 6` 置于逻辑层 `config.ts`

单队上限统一为常量导出，配置解析校验 `raw.length <= MAX_TEAM_SIZE` 且非空；`teamSize` 由数组长度派生，不新增配置字段。上限是战斗常量而非可调数据。

### 5. FGUI 预置每侧 6 槽 + `teamSize` 显隐

`AutoBattleView.xml` 每侧预置 6 槽（`unit_0..11` 共 12 槽组），按当前规模显隐（渲染器 `visible` 绑定按"单位是否存在"驱动超规模槽位整组隐藏）。槽位 y 垂直排布在 1280×720 内与日志区/按钮区协调（单槽内容压缩至 72px 步进内）。

**待演进（非本阶段）：** 真实刀塔传奇式平铺地图模型——战场为覆盖全地图的密集网格槽位（远多于 12 个），布阵时仅在靠近己方边缘的若干槽位（如 3×3=9 格）放置英雄；战斗中近战/远程按攻击距离自动向前移动到满足射程的槽位才普攻，技能可触发换位。该模型下单位坐标变为**动态**（逻辑层须持有并更新位置），`slotToXY` 从"固定单向映射"演进为"网格槽位 + 移动/换位规则"，逻辑层开始消费坐标。此演进由后续 change（05 布阵、07/08 表现坐标与位移）落地，本 ADR 的"坐标只服务表现层"与"每侧 ≤6 槽"为阶段决策。

## 理由

- 逻辑层与渲染层解耦：战斗推进（纯 TS，可测）不依赖坐标，坐标映射集中在 `view/` 纯函数，框架只提供 `setXY` 契约，符合"core 纯 TS、adapter 只对接引擎"的既有边界。
- 向后兼容：`setXY?` 可选方法与 `position` 新绑定 kind 使既有实现零改动通过编译，public-boundary 契约清单同步。
- 节点名全局索引方案避免 6v6 敌我冲突，且与 FGUI 预置 12 槽布局一一对应。

## 影响

- `models.ts` `index` 语义注释更新为逻辑槽位；`config.ts` 引入 `MAX_TEAM_SIZE`；`view/view.ts` 引入 `slotToXY` 与动态槽位绑定；框架 `ViewModel.ts`/`ViewModelRenderer.ts` 增加 position 能力；`FairyGuiViewHandle.ts` 实现 `setXY`。
- **change 08 追加影响**：`models.ts`/`units.ts` 单位增加 `attackRange`、`gridKey` 变可写；`config.ts` 支持 `attackRange`；`grid.ts` 增加原子 `move`；`logic/move.ts` 新增 `MoveResolver`；`battle.ts` 普攻两阶段 + 技能 teleport + `move`/`teleport` 事件；`state` 快照反映当前位置。
- 后续布阵编辑（05）在平铺网格上定义布阵区，`index` 语义（队内槽位）届时可能物理改名，需单独 ADR 评估。

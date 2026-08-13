# LineupEditorView 编队页：9 槽全可操作 + 候选英雄 GList 虚拟列表 设计

日期：2026-08-10
状态：Approved（用户已确认调整后方案）

## 背景与目标

`game_auto_battle` 编队页（`LineupEditorView`）存在两个实现缺陷：

1. **布阵区 9 格但只有 6 格可操作**：`LineupEditorView.xml` 只给前 6 格预置了按钮组件 `slot_0..slot_5`，第 3 排 `slot_6/7/8` 只有背景图/选中高亮/文字、没有按钮；绑定层 `createLineupEditorBindings` 按 `MAX_TEAM_SIZE`（6）循环，第 3 排完全不可点。
2. **候选英雄固定 6 个**：`LINEUP_CANDIDATE_SLOTS=6` 硬编码 + XML 预置 6 个候选槽，英雄池超过 6 个候选显示不下。

目标：

1. **布阵区 9 格全部可操作**（都有按钮、可选中、可填武将），但**上阵上限保持 `MAX_TEAM_SIZE=6`**——9 格里最多同时上 6 个武将，其余为空余格。
2. **候选英雄区改为 GList 虚拟列表**：数量动态、可滚动，已上阵英雄在候选项上呈现部署态。
3. 存档 schema 兼容：`MAX_TEAM_SIZE` 与槽位数解耦后 `AutoBattleLineup.slots` 定长 6 → 9，旧存档经 schema v1→v2 迁移补齐。

用户已明确：编队页槽位数（9）与实际上阵上限（6）是两回事；战斗规模仍为 1v1..6v6，战场平铺格是另一套 MapGrid 网格系统，本次不动。

## 现状与根因

- `logic/grid.ts:11`：`FORMATION_GRID_SIZE = 3×3 = 9`（布阵区容量），与 `MAX_TEAM_SIZE=6`（上阵上限）语义分离（design.md D4）。
- `logic/config.ts:20`：`MAX_TEAM_SIZE = 6`。
- `assets/samples/game_auto_battle/models/models.ts:56`：`AutoBattleLineup.slots` 定长 `MAX_TEAM_SIZE`。
- `view/lineup.ts`：`LINEUP_CANDIDATE_SLOTS=6`；槽位绑定循环 `slot < MAX_TEAM_SIZE`（6）。
- `logic/lineup.ts` reducer：slot 越界检查 `slot >= MAX_TEAM_SIZE`（6）。
- `logic/lineup-store.ts`：`isLineupRecord` 校验 `slots.length !== MAX_TEAM_SIZE`（6）；`LINEUP_SAVE_VERSION=1`。
- `ui/demo/assets/AutoBattle/LineupEditorView.xml`：仅 `slot_0..5` 有 `<component>` 按钮；`slot_selected_0..8`（9 个）与 `txt_slot_0..8_name`（9 个）已齐全；候选区预置 `candidate_0..5` + `txt_candidate_0..5_name`。

根因不是"槽位不能复用"，而是当时按 `MAX_TEAM_SIZE=6` 实现时只预置了 6 个按钮与 6 个候选槽，未对齐布阵区容量 9 与动态列表需求。

## 关键决策（已确认）

### D1 槽位数据模型：slots 扩到 9，上限 6 约束

- `AutoBattleLineup.slots` 定长由 `MAX_TEAM_SIZE`（6）改为 `FORMATION_GRID_SIZE`（9），0..8 全部可填。
- `MAX_TEAM_SIZE=6` 保留为上阵上限：fill 空槽时若当前非空数已达 6 则拒绝（返回原对象，幂等拒绝语义）；fill 已占槽（替换）不增加数量、允许。
- reducer `editLineup` slot 越界检查改用 `FORMATION_GRID_SIZE`。
- `assembly.ts` `toFullLineup` 定长改用 `FORMATION_GRID_SIZE`；`selectHero` 空槽查找范围与选中槽合法范围同步扩到 9。
- 开战压缩序（slots 非空升序 → 压缩 id 序列）逻辑不变：战斗实例化仍取非空英雄，规模 ≤ 6。

### D2 存档 schema v1→v2 迁移

- `LINEUP_SAVE_VERSION` 1 → 2。
- 注册 v1→v2 迁移器：把 6 长度 `slots` 补齐到 9（尾部补 `null`）。
- `isLineupRecord` 校验改为 `slots.length === FORMATION_GRID_SIZE`（9）。
- 迁移链沿用 `createLineupStore.migrate` 既有机制；测试覆盖 v1 存档 → v2 恢复。

### D3 候选区 GList 虚拟列表 + 独立适配层句柄

- 适配层新增 `FairyGuiListHandle`（对齐 `DynamicComponentViewHandle` 先例）：包装 fgui GList，暴露 `setItems(items)`；内部管理 `numItems` 与 `itemRenderer`，把 fgui item 对象包装成 `ViewModelNode` 交给游戏层（fgui 类型不出适配层）。
- `boot/host/GameLobbyHostImpl.ts` 对 `LineupEditorView` 页面装配候选 GList 句柄（对齐 `AutoBattleView` 动态单位映射装配路径，`GameLobbyHostImpl.ts:109-120`）。
- 编队页 presenter 接收候选 GList 句柄，`render()` 时 `setItems(vm.candidates)`；候选项显示名称 + 已上阵态（deployed 置灰）。
- `createLineupEditorBindings` 删除 `candidate_{i}` 预置绑定与 `LINEUP_CANDIDATE_SLOTS` 常量。
- 无列表句柄时（纯内存测试环境）候选区渲染退化：不渲染候选（或保留候选数量 0），槽位区/开战不受影响。

### D4 FGUI 组件改造（委派 fgui-designer）

- `ui/demo/assets/AutoBattle/LineupEditorView.xml`：
    - 补第 3 排 `slot_6/7/8` 三个按钮 `<component>`（`CommonButton`，alpha=0 透明覆盖，对齐既有 6 个）。
    - 候选区：6 个预置候选槽 → GList 列表组件（带滚动容器）。
    - 新建候选 item 模板组件（名称文本 + 已上阵态），放 `ui/demo/assets/Common/` 跨包复用。
- 组件创建/编辑委派 fgui-designer；`bun run fgui validate --strict` 通过；发布产物由编辑器生成（不手改 bin/atlas）。

## 具体改动清单

### 逻辑层（纯 TS，引擎无关）

- `logic/grid.ts`：无改动（`FORMATION_GRID_SIZE` 已存在）。
- `logic/config.ts`：无改动（`MAX_TEAM_SIZE=6` 保持）。注释如需澄清"上阵上限/布阵区容量"语义可补充。
- `logic/lineup.ts`：
    - slot 越界检查 `slot >= MAX_TEAM_SIZE` → `slot >= FORMATION_GRID_SIZE`。
    - fill 时新增"非空数 ≥ MAX_TEAM_SIZE 且目标槽为空 → 拒绝"约束。
- `logic/lineup-store.ts`：
    - `LINEUP_SAVE_VERSION = 2`。
    - 新增 v1→v2 迁移器（补 3 个 `null`）。
    - `isLineupRecord` 长度校验改用 `FORMATION_GRID_SIZE`。
- `assembly.ts`：`toFullLineup` 定长、`selectHero` 的选中槽/空槽范围改用 `FORMATION_GRID_SIZE`。

### 视图层

- `view/lineup.ts`：
    - 删除 `LINEUP_CANDIDATE_SLOTS` 与 `candidate_{i}` 绑定。
    - 槽位绑定循环 `slot < MAX_TEAM_SIZE` → `slot < FORMATION_GRID_SIZE`。
    - `LineupEditorViewModel` 候选渲染数据保留（供 GList 句柄消费）。
- `view/lineup-presenter.ts`：
    - `createLineupEditorPresenter` 增加可选候选列表句柄参数。
    - `render()` 把候选数据喂给列表句柄（`setItems`）。
- 新增 `view/lineup-candidate-item.ts`（或并入现有文件）：候选 item 渲染映射（名称文本字段、deployed 置灰字段、点击命令），供列表句柄 itemRenderer 消费。

### 适配层

- 新增 `assets/framework/adapters/cocos/ui/FairyGuiListHandle.ts`：
    - `createFairyGuiListHandle(view, options)` 包装 GList。
    - `setItems(items)` 设置 `numItems`；`itemRenderer` 内把 item 对象包装为 `ViewModelNode`。
    - 命令注册去重（对齐 `ViewModelRenderer.registeredCommandNodes` 思路），避免 item 复用重复注册 onClick。

### 装配层

- `boot/host/GameLobbyHostImpl.ts`：`LineupEditorView` 页面装配候选 GList 句柄（经 `lookupBundle("samples")` 读取候选 item 映射配置，对齐 `unitNodeMappings` 模式）。

### FGUI（委派 fgui-designer）

- `LineupEditorView.xml`：补 slot_6/7/8 按钮 + 候选区 GList 化 + Common 候选 item 模板。
- `bun run fgui validate --strict` 通过。

## 边界与约束

- 战斗规模仍 ≤ 6（`MAX_TEAM_SIZE`），战场 MapGrid 网格不动（敌左己右、3×3 布阵区、动态实例化 UnitSlot 均不变）。
- `MAX_TEAM_SIZE` 语义保持"上阵上限"，不回溯 `battle-scale-config` 已归档语义。
- 候选 GList 只在真实 fgui 路径生效；内存测试环境无列表句柄时候选区渲染退化但不破坏槽位/开战逻辑。
- fgui 类型不出适配层边界（对齐 design decision 7）。
- FGUI 组件创建/编辑委派 fgui-designer，不主会话手写 XML。
- 修改逻辑时同步更新中文注释。

## 验证方式

- `bun run typecheck`（strict 全量）。
- `bun test ./tests/framework/foundation`：既有不回归 + 新增：
    - reducer：slots 9 长度、fill 超 6 拒绝、替换允许、slot 越界 9。
    - store：v1(6 长度)→v2(9 长度) 迁移、损坏记录拒绝。
    - presenter：9 槽绑定齐全、候选 GList 渲染（有句柄）/退化（无句柄）。
- `bun run fgui validate --strict`（AutoBattle 包，含新增 Common 候选 item）。
- 冒烟/截图：`?smoke=auto-battle` 链路验证编队→开战；LineupEditorView 截图核对 9 槽按钮与候选列表渲染。

## 分阶段实施

- 阶段 A：逻辑层 slots 9 + 上限 6 约束 + 存档迁移 v2（纯 TS，单测先行）。
- 阶段 B：视图层绑定扩 9 槽 + 候选 GList 句柄接口 + presenter 接线（含内存退化路径）。
- 阶段 C：适配层 FairyGuiListHandle + boot 装配（真实 fgui 路径）。
- 阶段 D：FGUI 组件改造（fgui-designer：补按钮、候选 GList、Common item 模板）+ validate + 发布。
- 每阶段跑 typecheck + 对应单测；阶段 D 后全量验证与冒烟截图。

## 风险与回退

- **slots 定长变化波及存档**：v1→v2 迁移器补齐到 9；迁移缺失/损坏记录拒绝（对齐既有语义），不静默降级。
- **GList itemRenderer 复用导致点击重复注册**：句柄内按 item 实例去重注册，绑定重建时保留已注册命令节点（对齐 `ViewModelRenderer` 思路）。
- **跨包组件引用**：Common 候选 item 模板须注册依赖包（`ensureSharedUiDependencies` 已确保 Common 常驻）；fgui-designer 校验。
- **候选区退化路径**：无列表句柄的测试/回退环境候选不渲染，槽位与开战不依赖候选渲染，互不阻塞。

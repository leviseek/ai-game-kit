## Why

`game_auto_battle` 当前战斗固定 3v3（`logic/config.ts` 每队上限 3、`view/view.ts` 固定 6 槽位），限制了观战规模自由度，也是后续布阵编辑（05）、锁定目标（06）、命中反馈（07）、位移（08）的共同前置约束。本 change 把战斗从固定规模演进为 NvN 可配置，并落地路线图 3.4 的逻辑槽位模型（`side + slotIndex`）与渲染映射表（ADR-025 决策点）。

## What Changes

- **放开规模上限**：`logic/config.ts` 的 `readTeam` 从 `raw.length > 3` 抛错改为按可配置上限（首版常量 `MAX_TEAM_SIZE = 6`）校验，任意数量单位（1..6）可开战。
- **逻辑槽位模型**：把 `models.ts` 的 `index` 正式化为 `slotIndex` 语义（队内槽位序号 0..N-1），作为实例化顺序与目标选择优先级（同 position 内的稳定次序）的身份；`position` 标签保留为目标选择优先级语义，不引入双真源。
- **动态渲染绑定**：`view/view.ts` 从固定 `index < 6` 循环演进为按 `VM.units` 规模绑定，槽位显隐由数据驱动；绑定节点名约定不变（`txt_unit_{slotIndex}_*` / `bar_unit_{slotIndex}_*`）。
- **坐标渲染映射**：落地 `slot→xy` 渲染映射表（敌左、己右），映射由槽位索引单向推导；为此向后兼容扩展 framework `ViewModelNode` 契约（新增 `setXY`，实现于 FGUI adapter 边界），解决 01 决策 2 推迟的坐标渲染缺口（ADR-025）。
- **FGUI 槽位预置**：`AutoBattleView.xml` 预置每侧最大 6 槽位（`unit_0..11`）并规划垂直排布，按 `teamSize` 显隐（fgui-designer 委派 + `bun run fgui validate --strict`）。

## Capabilities

### New Capabilities

<!-- Capabilities being introduced. Replace <name> with kebab-case identifier (e.g., user-auth, data-export, api-rate-limiting). Each creates specs/<name>/spec.md -->

- 无（规模可配置属于对既有战斗能力的扩展，不新增独立 capability）。

### Modified Capabilities

- `auto-battle-playable`: 战斗规模从固定每队 3 单位演进为 N 可配置（上限 6），单位身份引入逻辑槽位 `side+slotIndex`，观战规模不限 3v3。
- `view-model-rendering`: 视图节点接缝 `ViewModelNode` 新增坐标写入能力（`setXY`），渲染管线支持把 VM 位置数据映射到节点坐标（向后兼容扩展，不影响既有文本/进度/显隐/命令绑定）。

## Impact

- `assets/samples/game_auto_battle/logic/config.ts`：`readTeam` 上限放开 + 配置校验；新增 `MAX_TEAM_SIZE` 常量。
- `assets/samples/game_auto_battle/models/models.ts`：`index` 语义注释更新为 `slotIndex`（0..N-1），字段名保持 `index` 以最小化波及面（由 ADR-025 决策是否改名）。
- `assets/samples/game_auto_battle/view/view.ts`：动态槽位绑定，去掉固定 6 槽循环。
- `assets/framework/contracts/ui/ViewModel.ts` + `assets/framework/core/ui/ViewModelRenderer.ts`：`ViewModelNode` 增加 `setXY`（可选实现，向后兼容）。
- `assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts`：`setXY` 的 fgui 实现（写节点 xy）。
- `assets/samples/game_auto_battle/assembly.ts` / `smoke.ts` / 测试 fixture：支持任意规模配置注入与断言。
- `ui/demo/assets/AutoBattle/AutoBattleView.xml`：预置 6 槽/侧 + 显隐 + 垂直排布（**fgui-designer 委派**，产物经 `bun run fgui validate --strict` 与编辑器发布）。
- **ADR-025**：随本 change 一并落地（坐标式战斗单元模型：position 标签保留 + `side+slotIndex` 逻辑槽位 + slot→xy 映射表单向推导）。
- **BREAKING**：无破坏性改动；逻辑层只放开约束，既有 3v3 配置行为不变。

## Context

现状约束（参见 proposal.md - Why）：
- `logic/config.ts` `readTeam` 对每队 `raw.length > 3` 抛错，注释"MVP 固定 6 静态槽位"；`models.ts` 的 `index` 注释为"队内阵列序号 0-2"。
- `view/view.ts` 绑定固定循环 `index < 6`，注释明示"Phase 2 可变编队需另行评估"。
- `ViewModelNode` 契约仅 `setText/setProgress/setVisible/onClick`，无坐标写入；01（battle-layout-enemy-left）design.md 决策 2 明确把 `setXY` + slot→xy 映射表推迟到本 change 与 ADR-025 统一落地。
- `AutoBattleView.xml` 每侧 3 槽（`unit_0/1/2` 己方 x=1040，`unit_3/4/5` 敌方 x=20），槽位 y 硬编码（60/170/280），`advanced="true"` 组支持整体显隐。
- 路线图 3.4 分层：逻辑槽位（04）→ 渲染映射（01/05）→ 表现坐标（07/08）。

## Goals / Non-Goals

**Goals:**
- 战斗规模从固定 3v3 演进为 NvN（1..6），配置层校验上限，逻辑层任意数量可开战。
- 确立 `side+slotIndex` 逻辑槽位身份，目标选择/实例化顺序/渲染均以槽位序寻址，规模动态化不再依赖固定 6 槽。
- 落地 slot→xy 渲染映射表（敌左、己右）与 `ViewModelNode.setXY` 契约，为 07/08 表现坐标提供锚点（ADR-025）。
- FGUI 预置每侧最大 6 槽位并按 `teamSize` 显隐，既有 3v3 配置行为不变。

**Non-Goals:**
- 不实现 HeroPool/Lineup 编队模型（05 的职责）；编队只影响"上阵哪些英雄"，规模由战斗配置驱动。
- 不改变伤害/能量/技能数值模型与目标选择优先级语义（`position` 标签保留为选择语义真源）。
- 不做 `slotIndex` 字段物理改名的大范围重构（见 D3）。
- 不实现特效/位移（07/08），映射表与 setXY 仅为后续锚点。

## Decisions

**决策 1（ADR-025）：坐标式战斗单元模型——`position` 标签保留 + 逻辑槽位 `side+slotIndex` 单向推导**
- 真源划分：`position`（front/mid/back）仍是目标选择优先级的唯一语义；`side+index`（index 即队内逻辑槽位序号）是实例化顺序与渲染寻址的身份。二者由配置直接给定，无相互推导，避免双真源。
- 渲染映射 `slotToXY(side, slotIndex, teamSize) → {x, y}` 为**单向纯函数**：由槽位序推导屏幕坐标（敌左、己右），不反向回写逻辑。坐标只服务表现层，逻辑层不消费 xy。
- 落点：`models.ts` 注释将 `index` 语义正式化为"队内逻辑槽位序号 0..N-1"；`view/view.ts` 新增映射表纯函数。
- 备选：为 unit 新增独立 `slotIndex` 字段替代 `index`——波及 `formation/battle/config/测试` 全部消费点，收益仅是命名更直白，本 change 不做（D3 解释）。

**决策 2：`index` 保留字段名，仅正式化语义与注释**
- 不改名 `index → slotIndex`：该字段已被 `formation.ts`（同排次序）、`sortAutoBattleOrder`（side+index）、`battle.ts`（实例化）消费，物理改名属无关重构且增大回归面。通过注释与类型注释把语义锁定为"逻辑槽位序号"，供 05/06 复用。
- 备选：物理改名——纳入 05 lineup 建模时再统一评估，本 change 拒绝。

**决策 3：`ViewModelNode` 增加可选 `setXY` + 新增 `position` 绑定 kind（向后兼容扩展）**
- 契约扩展方式：`ViewModelNode` 增加可选方法 `setXY?(x: number, y: number): void`；`Binding` 判别联合新增 `PositionBinding<VM>`（kind `"position"`，get 返回 `{x, y}`）。渲染器 `applyBinding` 对 `position` kind 调用 `view.setXY?.(x, y)`，节点未实现则忽略（符合 spec 的"不支持坐标的节点不中断"）。
- 兼容性：可选方法使既有实现（GameLobbyHostImpl、CardGame/auto-battle assembly 的 `toViewModelNode`、测试 `toNode`）零改动通过编译；仅 `FairyGuiViewHandle` 的节点实现补 `setXY`（写 `GObject.xy`）。
- 备选 A：把 setXY 设为必需方法——所有实现点都要改，跨品类波及面大，且会破坏现有测试/冒烟最小改动原则。备选 B：新增独立 `ViewModelPositionNode` 接口 + 类型守卫——额外接口层级，收益有限。
- diff 语义：`position` 绑定同样走 lastValues diff（坐标未变不重复写入），复用渲染器既有 diff 管线。

**决策 4：规模上限常量 `MAX_TEAM_SIZE = 6` 置于逻辑层 `config.ts`**
- 单队上限统一为常量导出，配置解析校验 `raw.length <= MAX_TEAM_SIZE` 且非空；`teamSize` 由数组长度派生，不新增配置字段。
- 备选：上限下沉到配置表数据——过度设计，规模是战斗常量而非可调数据，后续若需配置化再演进。

**决策 5：FGUI 预置每侧 6 槽 + `teamSize` 显隐**
- `AutoBattleView.xml` 每侧预置 `unit_0..5`（己方）/`unit_6..11`（敌方）共 12 槽组，按当前 `teamSize` 显隐（`advanced` 组 + 渲染器 `visible` 绑定或组显隐）。
- 槽位 y 垂直排布需在 1280×720 下与日志区（y≈520）、按钮区协调；每槽约 92px + 间距，6 槽需 fgui-designer 评估排布与命名规则（沿用 `txt_unit_{slotIndex}_*` / `bar_unit_{slotIndex}_*`）。
- 渲染绑定循环改为按 `MAX_TEAM_SIZE` 预置，`visible` 由"单位是否存在"驱动；超出 `teamSize` 的槽隐藏。

**决策 6：ADR-025 随本 change 落档**
- `doc/decisions/ADR-025-coordinate-battle-unit-model.md` 在本 change 归档前完成，记录决策 1/2/3/5 的坐标分层与真源划分，避免后续 07/08 返工。

## Risks / Trade-offs

- [FGUI 槽位排布在 720 高度内不足（6 槽/侧 + 日志区/按钮区）] → 委派 fgui-designer 评估排布（间距/字号/条高可微调），必要时压缩槽间距或调整日志区位置；`validate --strict` 通过后再发布。
- [setXY 契约扩展影响 framework 公共接口（跨品类 CardGame 也消费）] → 采用可选方法 + 新绑定 kind，向后兼容，既有实现零改动；public-boundary 测试需更新契约清单。
- [12 槽 XML 使槽位寻址从"固定 6"变为"按规模"可能引入索引错位] → 统一以 `slotIndex`（side 内 0..N-1）命名与绑定，`unit_{sideIndex}` 全局索引仅在 FGUI 内部，view 层映射函数单向转换，测试覆盖 1v1/3v3/6v6。
- [`position` 标签与 slotIndex 并存的双语义被误用] → 决策 1 明确真源划分并在注释中强调"position=选择语义、slotIndex=布局/实例化语义"，渲染/逻辑边界测试锁定。
- [超过上限的配置报错破坏既有冒烟] → 上限校验仅对超限输入抛错，既有 3v3 配置合法；冒烟回归兜底。

## Migration Plan

1. `models.ts` / `config.ts`：`index` 语义注释更新 + `MAX_TEAM_SIZE` 常量 + 上限校验（逻辑层先行，现有 3v3 配置回归）。
2. framework 契约：`ViewModelNode.setXY?` + `PositionBinding` + 渲染器 `position` 分发；public-boundary/渲染器测试更新。
3. `FairyGuiViewHandle`：节点实现补 `setXY`。
4. `view/view.ts`：slot→xy 映射表 + 动态槽位绑定（按 MAX_TEAM_SIZE 预置、visible 显隐）。
5. `AutoBattleView.xml`：fgui-designer 预置 12 槽 + 排布 + `bun run fgui validate --strict` → 编辑器发布 → `fgui check-publish`。
6. 测试：1v1/5v5/6v6 开战与渲染、超上限拒绝、坐标映射、槽位显隐；冒烟与截图回归。
7. 归档前落 `doc/decisions/ADR-025-coordinate-battle-unit-model.md`。

## Open Questions

- 6 槽/侧在 1280×720 下的精确垂直排布（槽间距/日志区位置）需 fgui-designer 实测后定稿，属实现期微调，不影响 specs 与任务拆解。

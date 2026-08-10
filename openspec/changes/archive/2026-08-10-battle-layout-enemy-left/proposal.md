## Why

当前 `AutoBattleView.xml` 采用**上下对阵**（敌方 y=88 顶部、己方 y=440 底部），观感接近上下棋盘，不符合项目决策 D2（敌方在左、己方在右，依据"自古对波左边输"的梗）。同时这是自动战斗玩法进化的第一个 change，需要把战场渲染从"固定上下"拉平为"左右对阵"，为后续坐标式渲染（slot→xy 映射、入场/移动/瞬移）打下布局锚点。

## What Changes

- **战场布局重构为左右对阵（敌左我右）**：修改 `AutoBattleView.xml`，把敌方三列（`unit_3/4/5`）移到屏幕左侧、己方三列（`unit_0/1/2`）移到屏幕右侧，保留同一侧的纵向列分布结构；节点名（`txt_unit_{n}_*` / `bar_unit_{n}_*`）与绑定顺序不变。
- **绑定与逻辑层不动**：`view/view.ts` 的绑定声明按节点名索引（`unit_0..5`），只随单位顺序绑定文本/进度/显隐，不承载坐标，故**无需改动**；`logic/`（side 语义、目标选择、行动序列）完全不触碰。
- **不引入 TS 坐标驱动**：本 change 只做 FGUI 布局重构，坐标仍由 XML 决定，**不扩展 ViewModelNode 契约（不新增 setXY）**；slot→xy 渲染映射表作为坐标演进主线，留给 change-04（规模可配置 + ADR-025）统一落地，避免本 change 引入与 XML 双真源。
- **冒烟与截图验证**：`?smoke=auto-battle` 冒烟（页面可开、驱动到终局、节点名对齐校验）保持通过；布局视觉确认经截图 + `visual-verifier`（mode=fgui）核对敌左我右。
- **发布产物**：源 XML 修改后由 FGUI 编辑器重新发布 `AutoBattle` 包，产物（`.bin`/atlas）由编辑器生成，不手改。

## Capabilities

### New Capabilities

- `auto-battle-battlefield-layout`: 战场呈现的布局语义——`game_auto_battle` 战场页 SHALL 以**敌左我右**的左右对阵呈现双方单位组，单位按槽位序在各自阵营侧纵向排列；布局是渲染层表现，不影响战斗逻辑与绑定节点名。

### Modified Capabilities

- `auto-battle-playable`: 扩展"战场 ViewModel 绑定"要求——战场页不仅把战斗状态映射到节点，还须以敌左我右的布局呈现单位组（新增布局方向场景），冒烟驱动仍须在重构布局后通过。

## Impact

- **FGUI 源**：`ui/demo/assets/AutoBattle/AutoBattleView.xml`（坐标重构，委派 fgui-designer 产出 + `bun run fgui validate --strict` 通过后才可发布）。
- **发布产物**：`assets/ui/AutoBattle/*`（`.bin`/atlas 由 FGUI 编辑器发布生成）。
- **验证链路**：`assets/samples/game_auto_battle/smoke.ts`（冒烟保持通过，无需改动）；`assets/boot/smoke/smoke-proxy.ts`（`?smoke=auto-battle` 入口不变）；视觉核对走截图 + visual-verifier。
- **不触碰**：`logic/`、`view/view.ts` 绑定声明、`assembly.ts`、`models/`、测试断言（无坐标断言）。
- **风险**：FGUI 布局改动若节点名/组关系出错会破坏冒烟节点名对齐校验，须在改动后跑全量 validate 与冒烟回归。

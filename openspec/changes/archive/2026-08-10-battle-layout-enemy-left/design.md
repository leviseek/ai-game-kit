## Context

`AutoBattleView.xml` 当前为 1280x720 上下对阵：敌方三列（`unit_3/4/5`）在顶部 y=88，己方三列（`unit_0/1/2`）在底部 y=440，x 均为 180/520/860。节点名为 `txt_unit_{index}_*` / `bar_unit_{index}_*`，绑定在 `view/view.ts` 按 `unit_0..5` 索引声明，仅承载文本/进度/显隐，不承载坐标。测试断言只涉及节点名绑定，无坐标断言（见 proposal.md - Impact）。约束：FGUI 源 XML 改动必须委派 fgui-designer 产出并 `bun run fgui validate --strict` 通过，产物由编辑器发布（AGENTS.md）。

## Goals / Non-Goals

**Goals:**

- 战场单位组重构为敌左我右（敌方左、己方右），为后续坐标式渲染（slot→xy、位移、入场）提供稳定锚点。
- 保持绑定节点名与单位槽位序不变，逻辑层零改动，冒烟与既有测试不回归。
- 布局坐标仍由 FGUI XML 承载，本 change 不扩展 framework 契约。

**Non-Goals:**

- 不引入 slot→xy 渲染映射表 / ViewModelNode.setXY 契约（归 change-04 + ADR-025）。
- 不调整侧内单位顺序语义（`unit_0..2` 己方、`unit_3..5` 敌方，先己方后敌方）。
- 不改变战斗逻辑（side 语义、目标选择、行动序列、胜负判定）。

## Decisions

**决策 1：敌左我右布局坐标方案**

- 屏幕 1280x720 内，敌方三列置于左半区、己方三列置于右半区，保留"同一侧三列"结构；建议敌方列 x 与己方列 x 相对中线镜像，y 沿用侧内纵向排布（参考现有 y=88/440 基础上调整），具体坐标由 fgui-designer 在编辑器中定稿并保证可读。
- 备选：只做水平翻转（原顶部→左侧、原底部→右侧）——**否决**：会破坏"同侧三列纵向分布"的战场纵深语义，且与后续位移表现（两侧对进）不符。
- 布局是表现层数据，单位顺序、绑定、逻辑均不受影响。

**决策 2：不扩展 ViewModelNode 契约（本 change 不引入 setXY）**

- 现状 `ViewModelNode` 只有 setText/setProgress/setVisible/onClick，坐标全在 XML。布局重构只需改 XML 坐标，绑定声明无需感知坐标。
- 备选：本 change 即引入 setXY + slot→xy 映射表，让 TS 驱动坐标——**否决**：这是 framework 契约 + 渲染器 + 适配器三层联动改动，且会与 XML 双真源；坐标演进主线（ADR-025）在 change-04 统一落地更稳，本 change 保持最小可交付。

**决策 3：验证路径**

- 布局为纯表现，用冒烟（`?smoke=auto-battle`，节点名对齐校验 + 驱动到终局）+ 截图 + visual-verifier（mode=fgui）核对敌左我右；不新增单元测试（无逻辑行为变化）。

## Risks / Trade-offs

- [fgui-designer 产出坐标不合理/节点关系出错] → 产出后 `bun run fgui validate --strict` 全量校验，冒烟回归，截图经 visual-verifier 核对后再发布产物。
- [发布产物陈旧导致渲染与源 XML 失配] → 严格走"编辑器发布"路径（AGENTS.md 第 14 条），不手改产物，发布后 `fgui check-publish` 三重证据核对。
- [布局方向后续调整] → 本 change 只动坐标、不动绑定与逻辑，后续微调成本低；映射表化延迟到 change-04 是为避免过早抽象。

## Migration Plan

1. 委派 fgui-designer 重构 `AutoBattleView.xml` 坐标（敌左我右），`validate --strict` 通过。
2. 编辑器重新发布 `AutoBattle` 包，产物一致性核对。
3. 跑 `?smoke=auto-battle` 冒烟回归 + 截图视觉核对。
4. 回滚策略：坐标改动可还原 git diff，绑定与逻辑未动，无数据迁移。

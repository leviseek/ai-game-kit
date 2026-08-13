## Context

`AutoBattleView.xml` 中各单位血条与能量条均引用 `CommonProgressBar.xml`（`src="com01"`，fill 调色板 `fill` 蓝色），`view/view.ts` 以 `bar_unit_{index}_hp` / `bar_unit_{index}_energy` 两个 progress 绑定驱动。约束（见 proposal.md - Impact）：FGUI 源改动必须委派 fgui-designer 产出并 `bun run fgui validate --strict` 通过；新增纯色像素图走 `bun run fgui sprite` 且颜色 ⊆ `palette.json`；跨包引用只允许指向 `Common`/`Common_xxx`；产物由编辑器发布。

## Goals / Non-Goals

**Goals:**

- 战场页血条与能量条视觉可区分（颜色/尺寸/标签至少一项不同），观战者可凭视觉辨别血量与能量。
- 区分仅落在 FGUI 样式层；绑定节点名与 progress 语义、`view/view.ts` 绑定声明、`logic/`、数据模型零改动（或仅对齐）。

**Non-Goals:**

- 不新增进度条**组件类型**语义（不造 `CommonHpBar`/`CommonEnergyBar` 两个独立 exported 组件造成接口膨胀）；优先在既有 `CommonProgressBar` 的**样式变体**内表达差异。
- 不改变进度值语义、不引入颜色/样式运行时绑定（颜色静态定在 XML/资源，不由 VM 驱动）。
- 不改战斗逻辑与数据模型（hp/energy 字段已具备）。

## Decisions

**决策 1：区分方式用"样式变体 + 填充色不同"为主，尺寸/标签为辅**

- 血条 fill 用暖色（如红色，需先加入 `palette.json`）、能量条保留现有蓝色 `fill`，两者颜色不同；可辅以尺寸差异（能量条略窄）或标签（`txt_unit_{n}_hp` 已带 `HP` 前缀，能量条可加 `MP`/能量标签）强化辨识。
- 实现形态由 fgui-designer 定稿：a) 在 `Common` 包内复制 `CommonProgressBar.xml` 为样式变体（如 `CommonBarHp.xml`，同一 `extention="ProgressBar"`），或 b) 在 `AutoBattleView.xml` 内就地换 fill 资源（若能以 `<image>` 显式指定不同 fill）。**倾向 a**：样式可复用、跨页面一致，且不改 `AutoBattleView` 的 `src` 引用语义之外的结构。
- 备选：在 `AutoBattleView.xml` 中直接改 fill 资源引用、不动 Common——**否决**：与既有"共享通用组件承载于 Common"的 AGENTS 约定相悖，跨页面无法复用。
- 备选：TS 运行时改进度条子节点颜色——**否决**：颜色应由 FGUI 资源静态表达，运行时改色绕过 validate 语义检查且与"表现层只消费状态"原则冲突。

**决策 2：像素图/调色板走 CLI 确定性通道**

- 新增色先写 `palette.json`（如 `fill_hp: #d64545`），再 `bun run fgui sprite` 生成纯色 fill 像素图并登记（`next-id --prefix` 续编）；禁止手写色值绕过调色板。
- 若 fgui-designer 判定无需新增图（沿用现有 `progress_fill.png` 仅换 bar 底色/叠加），则保持零新增资源。

**决策 3：绑定与逻辑零改动，验证走冒烟 + 视觉核对**

- `view/view.ts` 绑定声明不变（节点名、progress 语义、`HP x/y` 文本均不动），保证冒烟节点名对齐校验与既有测试通过。
- 新增视觉断言不写进单元测试（颜色/尺寸是像素表现，非逻辑行为）；由 `?smoke=auto-battle` 冒烟回归 + 截图 + `visual-verifier`（mode=fgui）核对"血条与能量条可辨识"。

## Risks / Trade-offs

- [fgui-designer 产出样式变体后 `AutoBattleView` 引用出错/资源 id 冲突] → 产出后 `bun run fgui validate --strict` 全量校验（含跨包引用、资源 id 续编冲突、fileName 一致），冒烟回归。
- [新增 fill 色未进调色板即被 sprite 使用] → sprite 生成强制校验 `palette.json` 允许集合，先加色再生成（AGENTS 既有约束）。
- [样式变体使 Common 包资源膨胀/双份进度条样式漂移] → 变体仅差 fill 颜色与尺寸，命名遵循 `Common*` 前缀，后续若过度可合并为单组件 + 多 fill 资源；本 change 不做抽象，保持最小交付。
- [发布产物陈旧导致渲染与源 XML 失配] → 严格走"编辑器发布"路径，发布后 `fgui check-publish` 三重证据核对（AGENTS 第 14 条）。
- [颜色辨识对色弱不友好] → 辅以尺寸/标签差异（能量条略窄 + 能量标签），不单靠颜色表达。

## Migration Plan

1. 委派 fgui-designer：评估样式变体方案 → （如需新色）先入 `palette.json` + `bun run fgui sprite` 生成/登记 fill 资源 → 产出 `Common` 样式变体（如 `CommonBarHp.xml`）并在 `AutoBattleView.xml` 中切换血条引用 → `bun run fgui validate --strict` 通过。
2. 编辑器重新发布 `Common` 与 `AutoBattle` 包，`fgui check-publish` 核对产物一致性。
3. 跑 `?smoke=auto-battle` 冒烟回归 + 截图 + `visual-verifier`（mode=fgui）核对血/能量条可辨识。
4. 回滚策略：`AutoBattleView.xml` 血条引用改回 `com01` + 删除新增变体/资源即可还原，绑定与逻辑未动，无数据迁移。

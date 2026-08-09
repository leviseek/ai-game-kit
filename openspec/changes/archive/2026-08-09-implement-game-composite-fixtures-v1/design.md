# Design — Implement Game Composite Fixtures v1

## Context

总计划 `create-game-framework-v1` 已完成 Foundation 与全部可选能力（资源、UI、输入、音频、配置、存档、平台/时间/调度、服务注册），`assets/game` 目前零业务代码（仅有 `game.scene`），`AppRoot.assembleApp()` 是单一硬编码装配。归档 change `implement-fairygui-ui-adapter-v1` 明确遗留 4 项 UI 集成缺口。本 change 的目标是建立五类游戏层组合夹具，证明框架能力可协作、业务模型留在游戏层，并补齐遗留缺口。动机见 proposal.md - Why，行为契约见 specs。

## Goals / Non-Goals

**Goals:**
- 建立品类夹具公共契约与多品类装配机制，让五类夹具可由统一生命周期测试驱动。
- 在 `assets/game_<品类>` 下建立五类最小可验证夹具，验证框架能力组合协作与游戏层边界。
- 补齐 6.3 遗留 4 项 UI 集成缺口（modal 自动同步、遮罩可见性、resize 同步、真实交互点击验证）。
- 保持 `core` + `contracts` 零改动，`adapters/cocos/ui` 允许修补，`boot/AppRoot` 扩展装配。

**Non-Goals:**
- 不实现任何可玩的完整示例游戏；夹具取"最小可验证"而非玩法原型（对齐总计划 design 决策 16"不要求完整示例游戏作为 v1 验收条件"）。
- 不把任何品类业务模型（角色/技能/任务、卡组/回合、离线收益、生产链/经济、判定盒/连招/帧数据）放入框架层。
- 不引入自动扫描装配；组合清单保持显式。
- 不实现联网、热更新、ECS 或可信时间。
- 不在本 change 完成 9.4/9.5/9.6/9.7（构建冒烟、Profiler、文档、最终审查）——它们依赖本 change 的夹具但属总计划第 9 章收尾。

## Decisions

### 1. 品类夹具目录：`assets/game_<品类>` + `assets/game` 总入口

每个品类独立顶层目录（`assets/game_rpg`、`game_card`、`game_idle`、`game_tycoon`、`game_fight`），`assets/game` 保留为总入口（总计划已声明的目录）。

**理由：** 顶层目录即 Cocos Bundle 边界（`isBundle: true`），`game_*` 拆分天然支持后续把每个玩法独立成 Bundle 按需加载；`game` 作为总入口承载 scene 与装配，避免玩法代码挤在同一目录形成无序耦合。

**未采用：** 单一 `assets/game/features/*`——同一 Bundle 内拆分不解决按玩法独立加载问题，且会让 `game` 目录语义混杂（总入口 + 全部玩法）。

### 2. 品类夹具公共契约：组合清单 + 统一生命周期接缝

定义 `game-composite-fixtures` 契约：`GameFixture` 接口包含 `modules`（该品类模块装配清单）、`scope`（资源作用域）/资源映射、以及 `start/pause/resume/failRollback/dispose` 接缝。五类夹具与 8.6 统一测试共用此接口。

**理由：** 8.6 需要以同一驱动执行五类夹具的生命周期断言；显式契约让夹具装配可测试、可审查，也防止每类各自发明装配约定。契约只表达"装配什么 + 生命周期怎么走"，不规定品类内部实现。

**未采用：** 让 `AppRoot` 硬编码五类装配开关——会把夹具组合细节污染常驻组合根，且每类玩法仍需要自己的组合入口。

### 3. 多品类装配：夹具级组合函数，经 `AppRoot` 冒烟入口接入

每类夹具提供自己的组合函数（如 `assets/game_rpg/assembly.ts` 导出 `createRpgFixture`），构造 `GameFixture`；`AppRoot` 提供按品类装配的冒烟入口（如 URL `?fixture=rpg`），但业务组合逻辑本身留在游戏层夹具内。

**理由：** 组合根 `boot` 允许"知道所有具体实现"，但把夹具的模块清单与生命周期留在游戏层，符合"组合清单显式 + 业务规则在游戏层"的边界；`AppRoot` 只做薄转发，避免组合根为五类玩法各自维护装配细节。

**未采用：** 把五类装配全部塞进 `AppRoot.assembleApp`——常驻根会随玩法增长失控，违背"boot 不承载业务规则"的总计划约束。

### 4. 8.6 内核边界口径：`core`+`contracts` 禁改

8.6 验收口径写死为：`assets/framework/core` 与 `contracts` 在夹具建设中不得修改；`adapters/cocos/ui` 允许修补 6.3 遗留缺口；`boot/AppRoot` 允许扩展装配。

**理由：** 阶段 0 的 6.3 修补必然改动 `adapters/cocos/ui`，若 8.6 要求整个 `framework` 都不动则自相矛盾；把"内核"定义为 `core`+`contracts` 让"夹具不修改框架内核"成为可机械验证的断言（public-boundary 层依赖不变 + `core`/`contracts` diff 为空）。

**未采用：** "整个 framework 不得修改"——与 6.3 修补冲突；"夹具可以随便改框架"——失去验收意义。

### 5. 夹具深度：最小可验证

每类夹具为证明能力协作所需的最小代码：模块 + 代表性业务模型 + 1-2 个测试文件。预估每类 4-8 个 TS 文件，全 change 25-50 文件量级。不实现玩法细节（如格斗的完整招式系统、卡牌的完整效果结算）。

**理由：** 夹具是"组合证明"不是"游戏原型"（总计划设计决策 16）；最小可验证降低体量与维护成本，同时覆盖 8.1-8.5 的所有能力组合点与负向边界断言。

**未采用：** 玩法原型深度——工作量放大 3-5 倍，且与 9.7"v1 没有实现五类具体玩法"的 Non-Goal 审查冲突。

### 6. 6.3 遗留 4 项并入阶段 0，前置实施

modal 自动同步、遮罩可见性、resize 同步、真实交互点击验证作为阶段 0 先于夹具实施，每项配测试（含 CDP 真实点击）。

**理由：** 这 4 项是框架层集成修补，夹具会建立在它们的适配之上；不先补齐则 8.6 的"不修改框架内核"会与已知缺陷纠缠。

### 7. FairyGUI package 资源按品类准备

每类夹具需要 1 个最小 FairyGUI package（用户侧 Editor 制作，参考 `ui/Demo` 流程），作为代表性 route 的运行载体。

**理由：** 总计划设计决策 16 要求每类"运行最小生命周期与一个代表性 FairyGUI route"；package 是 route 的运行时依赖，需用户前置准备。

## Risks / Trade-offs

- **[单 change 体量接近 foundation]** → 按 8 阶段逐项交付，每阶段保持 `startup.scene` 可运行；夹具取最小可验证控制单类体量。
- **[品类夹具退化为玩具导致验证失真]** → 以能力组合点清单（spec 的 Requirement）为验收，不追求玩法完整度；每类固定验证点可回溯。
- **[`game_*` 目录导致 public-boundary 扫描范围扩大]** → 明确 `game_*` 属于"外部消费者"（只能经框架根入口导入），把新目录加入边界测试的允许导入方向；禁止游戏层导入 `fgui`。
- **[6.3 修补改动 adapter 影响既有冒烟]** → 阶段 0 先补回归测试再改实现，`runUiSmoke` 全链路保持通过。
- **[多品类装配增加 boot 复杂度]** → 组合逻辑留在游戏层夹具，`AppRoot` 只做按品类冒烟转发，不承载业务规则。

## Open Questions

- 五类夹具各自代表性 FairyGUI route 的具体 package 内容与 ViewModel 划分：可在夹具实现阶段按品类逐一确定，不影响本 change 的契约与任务拆分。
- `game_*` 是否立即标记 `isBundle: true`：目录拆分即预留 Bundle 边界；是否纳入构建可由 9.4 构建冒烟时确认，不阻塞本 change。

# ADR-018 Game Fixture Composite Assembly and Kernel Boundary

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 第 8 章要求以可执行证据证明五类目标游戏（RPG、回合制卡牌、放置挂机、模拟经营、横板格斗）能在框架上组合各自所需模块并运行最小生命周期，而不是只靠目录命名声明"可支持"。此前 `assets/game` 只有 `game.scene`，无任何业务代码，`AppRoot.assembleApp()` 是单一硬编码装配；五类玩法如何各自组合模块、如何被同一验收测试驱动、以及"不修改框架内核"如何机械验证，均未定义。

本 ADR 记录 change `implement-game-composite-fixtures-v1` 产生的长期架构决策：品类夹具目录边界、`GameFixture` 公共契约、多品类装配经组合根薄转发，以及 8.6 内核边界口径。

## 决策

### 1. 品类夹具目录：`assets/game_<品类>` + `assets/game` 总入口

每个品类独立顶层目录（`assets/game_rpg`、`game_card`、`game_idle`、`game_tycoon`、`game_fight`），`assets/game` 保留为总入口，承载 scene 与品类夹具装配登记（`assets/game/fixture/`）。

**理由：** 顶层目录即 Cocos Bundle 边界（`isBundle: true`），`game_*` 拆分天然支持后续把每个玩法独立成 Bundle 按需加载；`game` 作为总入口避免玩法代码挤在同一目录形成无序耦合。

**未采用方案：** 单一 `assets/game/features/*`——同一 Bundle 内拆分不解决按玩法独立加载问题，且会让 `game` 目录语义混杂。

### 2. 品类夹具公共契约：模块清单 + 统一生命周期接缝

`GameFixture` 接口（`assets/game/fixture/GameFixture.ts`）包含 `id`、`modules`（该品类模块装配清单）、可选 `scope`，以及 `start/pause/resume/failRollback/dispose` 五个生命周期接缝；`createGameFixture` 装配工厂按显式模块清单构造框架 `Application` 并委托生命周期，依赖仅经框架根入口 `../../framework`，无 `cc`/`fgui`。清单只含该品类已声明模块，未声明能力不参与装配。

**理由：** 8.6 需要以同一驱动执行五类夹具的生命周期断言；显式契约让夹具装配可测试、可审查，也防止每类各自发明装配约定。契约只表达"装配什么 + 生命周期怎么走"，不规定品类内部实现。

**未采用方案：** 让 `AppRoot` 硬编码五类装配开关——会把夹具组合细节污染常驻组合根；自动扫描装配——违背"组合清单显式"的总计划约束。

### 3. 多品类装配：夹具级组合函数，经 `AppRoot` 冒烟入口薄转发

每类夹具提供自己的组合函数（如 `assets/game_rpg/assembly.ts` 导出 `createRpgFixture`），构造 `GameFixture` 并在 `assets/game/fixture/registry.ts` 的显式登记表 `gameFixtureRegistry` 登记；`AppRoot.start` 解析 URL `?fixture=<品类>` 只做薄转发到 `runFixtureSmoke`（统一序列 start→pause→resume→failRollback→dispose），业务组合逻辑留在游戏层夹具内。

**理由：** 组合根 `boot` 允许"知道所有具体实现"，但把夹具的模块清单与生命周期留在游戏层，符合"组合清单显式 + 业务规则在游戏层"的边界；`AppRoot` 只做薄转发，避免组合根为五类玩法各自维护装配细节。

**未采用方案：** 把五类装配全部塞进 `AppRoot.assembleApp`——常驻根会随玩法增长失控，违背"boot 不承载业务规则"的总计划约束。

### 4. 8.6 内核边界口径：`core`+`contracts` 禁改，`adapters/cocos/ui` 可修补，`boot/AppRoot` 可扩展

8.6 验收口径写死为：`assets/framework/core` 与 `contracts` 在夹具建设中不得修改；`adapters/cocos/ui` 允许修补 6.3 遗留集成缺口；`boot/AppRoot` 允许扩展装配。内核边界以 `git diff --name-only` 机械验证：`core`+`contracts` diff 为空 + public-boundary 层依赖不变。

**理由：** 阶段 0 的 6.3 修补必然改动 `adapters/cocos/ui`，若 8.6 要求整个 `framework` 都不动则自相矛盾；把"内核"定义为 `core`+`contracts` 让"夹具不修改框架内核"成为可机械验证的断言。

**未采用方案：** "整个 framework 不得修改"——与 6.3 修补冲突；"夹具可以随便改框架"——失去验收意义。

## 理由

- 多品类组合装配模式是本 change 最核心的长期行为契约：五类夹具共用 `GameFixture` 契约与统一生命周期驱动，未来新增品类只需登记 `gameFixtureRegistry` 并提供组合函数，无需改框架或组合根。
- `game_*` 顶层目录 + Bundle 边界是后续按玩法独立加载的目录前提；拆目录即预留边界，避免未来玩法膨胀后再迁移。
- 内核边界口径（`core`+`contracts` 禁改）定义了"夹具不修改框架内核"的可验证含义，与 ADR-005 的 framework/game 边界互补（ADR-005 规定依赖方向，本 ADR 规定夹具建设期内核改动边界）。
- 组合根薄转发 + 游戏层自持组合延续 ADR-012 的"组合根显式装配、业务不承载规则"约定。

## 影响

- 未来新增游戏品类：在 `assets/game_<新品类>` 建夹具，实现 `GameFixture` 契约，在 `gameFixtureRegistry` 登记，并在统一生命周期测试登记表扩展断言；不得改 `core`+`contracts`。
- `game_*` 目录作为外部消费者只能经框架根入口导入框架能力，禁止导入 `fgui` 与深层导入框架内部（public-boundary 持续检查）。
- `boot/AppRoot` 只做按品类冒烟转发（`?fixture=`），不承载品类业务规则；`?smoke=modal-click` 等冒烟入口属组合根扩展装配范畴。
- 模态遮罩自动同步接缝（适配器消费 `UiNavigator.modal` 状态自动呈现/移除遮罩）不单独成 ADR：其语义已由 ADR-010 决策 3（模态由栈顶阻断页面推导、真实拦截属 Adapter 层）覆盖，本 change 是 ADR-010 的实现兑现。
- 根入口新增稳定符号一律同步 `expectedRootExports` 白名单（既有约定，不再展开）。

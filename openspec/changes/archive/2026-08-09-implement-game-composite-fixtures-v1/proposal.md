# Proposal — Implement Game Composite Fixtures v1

## Why

总计划 `create-game-framework-v1` 第 8 章要求以可执行证据证明五类目标游戏（RPG、回合制卡牌、放置挂机、模拟经营、横板格斗）能在框架上组合各自所需模块并运行最小生命周期，而不是只靠目录命名声明"可支持"。同时归档 change `implement-fairygui-ui-adapter-v1` 明确遗留了 4 项 UI 集成缺口（导航 modal 自动同步、遮罩可见性、窗口 resize 同步、真实交互点击验证），需在建立组合夹具前补齐，否则夹具会建立在已知缺陷上。

## What Changes

- 补齐 FairyGUI UI 适配层遗留集成缺口（6.3 遗留 4 项）：`UiNavigator` 模态状态到遮罩的自动同步、遮罩可见性/输入阻断增强、窗口 resize 同步、CDP 真实交互点击验证。
- 引入"品类夹具"公共契约：定义组合夹具的统一装配与生命周期接缝（模块清单 + `start/pause/resume/failRollback/dispose`），供五类夹具与 8.6 统一测试复用。
- 建立五类游戏层夹具：在 `assets/game_<品类>` 目录（RPG 用 `assets/game_rpg` 等）为每类组合最小可验证的游戏层模块与业务模型，验证跨场景状态、可控时间、调度、action 输入、对象池、资源作用域、UI、音频、配置、存档等框架能力可协作，且角色/技能/任务、卡组/回合、离线收益公式、生产链/经济模型、判定盒/连招/帧数据均位于游戏层。
- `assets/game` 保留为总入口；`game_*` 按顶层目录拆分，为后续把每个玩法独立成 Bundle 按需加载保留边界。
- 建立 8.6 统一生命周期测试：对五个组合运行相同的启动、暂停、恢复、失败回滚和释放测试，断言任一组合都不需要修改框架内核（口径：`core` + `contracts` 禁改，`adapters/cocos/ui` 允许修补，`boot/AppRoot` 允许扩展装配）。
- 同步总计划 `create-game-framework-v1` 第 8 章任务，收口公开边界与依赖检查，执行 ADR 检查。

## Capabilities

### New Capabilities
- `game-composite-fixtures`: 品类组合夹具的公共契约、五类游戏层夹具装配、业务模型留在游戏层的负向断言，以及五类组合统一生命周期测试。

### Modified Capabilities
- `fairygui-ui-adapter`: 导航模态状态到遮罩的自动同步（从手动 `setModal` 接缝改为消费 `UiNavigator` 模态状态自动呈现/移除遮罩）、遮罩可见性与输入阻断增强、窗口 resize 同步、真实交互点击验证下的模态输入阻断断言。

## Impact

- **代码**：`assets/game_rpg`、`assets/game_card`、`assets/game_idle`、`assets/game_tycoon`、`assets/game_fight` 新增游戏层夹具；`assets/game` 作为总入口；`assets/boot/AppRoot.ts` 扩展多品类装配；`assets/framework/adapters/cocos/ui/*` 修补遗留缺口；`assets/framework/core` + `contracts` 不改动。
- **测试**：Foundation Bun 测试、`test:foundation:types`、`public-boundary.test.ts` 依赖边界检查持续生效；8.6 新增统一生命周期测试。
- **资源**：每类夹具需要一个最小 FairyGUI package（用户侧 Editor 制作，参考 `ui/Demo` 流程）。
- **文档**：总计划 `create-game-framework-v1` 第 8 章任务将同步为完成并附证据；预期新增 ADR（多品类组合装配模式，8.6 内核边界口径）。

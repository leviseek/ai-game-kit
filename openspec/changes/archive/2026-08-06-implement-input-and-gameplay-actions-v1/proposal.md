# Implement Input And Gameplay Actions v1

## Why

主框架 change `create-game-framework-v1` 的第 6 章规划了输入能力：当前只有 FairyGUI UI 输入（走 View→ViewModel），缺少独立于 UI 的玩法输入通道。格斗、RPG 等品类需要把触摸、鼠标、键盘和手柄事件转换为带时间戳的类型化 gameplay action，并保证 UI 与玩法上下文不会同时误响应。本 change 补齐 6.4/6.5：先建立引擎无关的输入内核与测试，再实现 Cocos 输入适配器。

## What Changes

- 新增 `input` 能力，提供引擎无关的类型化 gameplay action 输入模型：
    - action 映射：底层输入源到类型化 action 的映射表，映射规则由调用方提供
    - 上下文切换：定义 `ui` / `gameplay` 等输入上下文，同一底层输入在激活上下文下才产生 action
    - 输入采样：每次采样携带按下/释放状态、连续值（如摇杆）与单调时间戳
    - 输入源替换：运行时替换底层输入源（真实设备或测试替身）而不改变上层 action 语义
- 新增 Cocos 输入适配器：把触摸、鼠标、键盘和可用手柄事件转换为类型化 action，遵循薄映射与引擎接缝可注入 mock 的既有模式
- UI/玩法双响应防护：消费导航 modal 状态（ADR-010 预留接缝），模态或 UI 阻断时玩法上下文不得响应同一输入
- 根入口白名单同步：按既有 `expectedRootExports` 机制收口新公开符号

## Capabilities

### New Capabilities

- `input`: 类型化 gameplay action 输入，覆盖 action 映射、输入上下文切换、采样（按下/释放/值/时间戳）、输入源替换与 UI/玩法阻断

### Modified Capabilities

无。既有 `ui-navigation` 的 modal 状态仅被消费，不改变其行为需求。

## Impact

- 新增代码：`assets/framework/contracts/input/*`（纯契约）、`assets/framework/core/input/*`（action 映射与上下文切换器）、`assets/framework/adapters/cocos/input/*`（Cocos 输入适配器）
- 新增测试：`tests/framework/foundation/input.test.ts` 覆盖 6.4 全部点（映射、上下文切换、按下/释放/值/时间戳、输入源替换）；Cocos 适配器集成测试覆盖 6.5 双响应防护
- 依赖：内核为纯 TypeScript，无 Cocos 依赖；适配器依赖 `cc` 与 `ui-navigation` 的模态状态
- 影响公开入口：`index.ts` 白名单需同步新增输入契约与核心符号

## Why

上层 `create-game-framework-v1` 已确定轻量内核、单一应用根和显式模块生命周期，但当前工程仍没有任何 Framework 运行时代码。先实现一个不包含上层业务能力的最小骨架，可以用可验证的启动、回滚和日志链路建立后续模块的稳定承载面，避免第一轮实现同时引入 UI、资源或场景复杂度。

## What Changes

- 在 `assets/framework` 下建立最小目录和公开边界，只包含核心类型、契约、应用编排、Logger 和 `adapters/cocos` 启动适配位置。
- 实现 Application 生命周期模型：`created -> initializing -> running -> paused -> stopping -> disposed`，并定义重复调用、并发调用和非法转换的处理规则。
- 在 `assets/boot` 提供唯一 `AppRoot` 组合入口，由它创建 Logger、Application、ApplicationContext 实现和模块清单，并调用 Application 启动/释放；Cocos 前后台事件监听与平台生命周期转换由 `adapters/cocos/application` 独立承担。
- 定义完整 Module 生命周期接口、模块描述信息和模块状态；第一阶段重点验证 initialize/start/stop/dispose，pause/resume 保留接口但降低测试优先级。
- 将 ApplicationContext 缩减为 logger 和 readonly lifecycle state：公开接口、ApplicationState 与只读生命周期查询契约归属 `contracts/application`，`application` 只提供 Context 创建和内部实现；Module 契约只能依赖该公开 contract。
- 固定 Framework 内部依赖方向：`core -> contracts -> application -> adapters/cocos`，其中箭头表示由底层能力构建上层能力；代码 import 只能由上层指向下层，`diagnostics/logging` 只依赖 `contracts/logging` 和必要的 `core` 原语。
- 增加架构门禁，禁止 core 依赖 Cocos、contracts 依赖具体实现、application 依赖 game，以及任何 Framework 代码依赖业务代码或从外部消费者深层导入 Framework 内部路径。
- 实现确定性的模块校验与初始化流程：模块标识检查、依赖检查、循环依赖检测、稳定拓扑顺序、顺序初始化/启动、逆序停止/释放和失败回滚。
- 提供最小 Logger 契约，只覆盖结构化日志记录、scope、level、Console 实现和内存测试实现；复杂安全序列化、循环检测与敏感字段脱敏延后。
- 建立纯 TypeScript 单元测试和最小 Cocos 启动冒烟验证。经工具链核对，Bun 已安装且可直接运行 TypeScript，而项目没有其他测试运行器或转换依赖，因此本切片保留 Bun 以避免新增开发依赖；Cocos 行为仍以 Creator 冒烟验证为准。
- 明确排除 UI、FairyGUI、Resource、Asset Bundle、Scene、ECS、Network、战斗和任何游戏业务；本 change 不为这些系统创建接口、占位 Manager 或空实现。

## Capabilities

### New Capabilities

- 无。本 change 通过 `skip_specs: true` 不创建 delta specs；生命周期、架构依赖和模块流程的可验收行为由 `design.md` 与 `tasks.md` 约束，后续如需正式能力规格应拆分独立规格 change。

### Modified Capabilities

- 无。当前 `openspec/specs` 没有既有能力规格，本 change 不修改主规格。

## Impact

- 实施主要影响 `assets/framework`、`assets/boot`、`assets/boot/startup.scene` 及测试/验证脚本。
- 将新增 Application、Module、Logger 和 AppRoot 的首批公共契约，后续 Framework 能力必须通过这些生命周期边界接入。
- ApplicationContext 公共契约与具体实现将分离；AppRoot 只承担 Composition Root，Cocos 生命周期 Adapter 可按 Web、Native 和小游戏平台替换，而不改变 Application 或 Module 契约。
- 不引入第三方运行时依赖；纯 TypeScript 测试复用本机已有 Bun，Cocos 集成继续由 Cocos Creator 3.8.8 验证。
- 不修改 Creator 版本、项目 UUID、已有 `.meta` UUID、Cocos 生成目录或引擎模块配置。
- `startup.scene` 的 AppRoot 挂载必须通过 Cocos Creator 编辑器完成，禁止手工修改序列化 JSON。
- 上层 change 中规划的 Framework UI Layer、FairyGUI Adapter、资源、场景、配置、存档等能力全部延后到独立 change。

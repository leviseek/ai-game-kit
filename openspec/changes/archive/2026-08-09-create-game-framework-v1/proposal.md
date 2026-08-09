## Why

当前工程只有 Cocos Creator 3.8.8 的空白 2D 场景和预留目录，尚未建立可复用的运行时边界。现在先确定轻量内核、FairyGUI 单一游戏 UI 技术栈、可选能力与品类组合方式，可以避免五类游戏分别堆叠全局 Manager、混用 Cocos 原生 UI 与 FairyGUI，最终形成相互耦合且无法复用的业务框架。

## What Changes

- 建立 `boot -> application -> framework/game` 的分层结构和单向依赖规则，由启动层完成装配，框架层不得反向依赖具体游戏。
- 将框架划分为不依赖 Cocos 的纯 TypeScript 内核、面向上层的契约以及依赖 `cc` 的 Cocos 适配层，使规则逻辑可以独立测试。
- 定义单一应用根和确定性的启动、运行、暂停、恢复、重启、关闭生命周期，避免多个常驻节点和隐式单例争夺初始化顺序。
- 规划模块注册与显式组合机制，让每个游戏只启用所需能力，并通过品类组合清单验证五类目标游戏，而不是在框架内建立统一的角色、战斗或经济模型。
- 规划首批通用服务边界：资源与 Asset Bundle、FairyGUI package、场景流转、UI 导航与分层、音频、输入、配置、存档、时间、事件、状态机、对象池、平台适配和诊断。
- 将游戏 UI 技术方案固定为 FairyGUI；Cocos 原生 UI 仅保留启动宿主和必要引擎集成职责，不作为页面、弹窗、HUD 或业务组件的实现方案。
- 将 UI 拆为不依赖具体渲染库的 Framework UI Layer 与依赖 FairyGUI Runtime 的 FairyGUI Adapter，避免页面导航和生命周期直接耦合 `fgui` 对象。
- 使用 ViewModel 隔离 FairyGUI View 与 Game 逻辑：View 只绑定展示状态和调用显式命令，Game 逻辑不引用 FairyGUI、Cocos UI 节点或具体页面类型。
- 扩展资源系统，使 Asset Bundle 可以承载 FairyGUI package 及其纹理、字体、音频等依赖，并统一管理 Bundle、Package 和 View 实例的加载与释放顺序。
- 约束跨模块通信、错误分类、资源所有权、服务降级和清理顺序，避免事件总线滥用、资源泄漏和失败后留下半初始化状态。
- 建立面向纯 TypeScript 单元测试、ViewModel/UI Layer 测试、FairyGUI Adapter 集成测试、Cocos 冒烟测试和五类品类组合验证的质量门禁。
- 保持 `resources` 为最小启动资源集合，业务内容通过独立 Asset Bundle 组织和释放。
- 明确 v1 不包含联网、热更新、编辑器扩展、ECS、具体战斗系统、卡牌规则、挂机收益、经营生产链或横板动作判定；这些能力由后续 change 在本架构上定义。

## Capabilities

### New Capabilities

- 无。本 change 只建立框架架构、设计约束和实施计划，并通过 `skip_specs: true` 按用户要求不创建 delta specs。具体运行时能力在进入对应实现 change 前单独定义行为规格。

### Modified Capabilities

- 无。`openspec/specs` 当前为空，本 change 不修改既有行为需求。

## Impact

- 后续主要影响 `assets/boot`、`assets/framework`、`assets/game`、FairyGUI 导出资源以及新增的 UI Asset Bundle 目录；本 change 本身不修改这些运行时代码或资源。
- 后续会形成框架公开契约、应用装配入口、模块生命周期、Framework UI Layer、ViewModel 边界、FairyGUI Adapter 和资源/场景等服务接口，新增能力必须遵守既定依赖方向。
- 后续实施会引入并锁定与 Cocos Creator 3.8.8 兼容的 FairyGUI Runtime SDK，同时要求使用对应 FairyGUI Editor 工作流；引入前需确认版本兼容性、License、包体和目标平台支持。
- Cocos 原生 UI 组件不会作为游戏 UI 公共 API；现有 `Canvas` 只作为启动和引擎宿主，不能演变为另一套业务 UI 技术栈。
- Cocos 自动生成的 `library`、`temp`、`profiles`，已有 `.meta` UUID、项目 UUID 和 Creator 版本不在本 change 的修改范围内。
- 后续实施会采用增量交付：先建立可验证的最小内核，再逐项加入可选服务，避免一次性完成“万能框架”。

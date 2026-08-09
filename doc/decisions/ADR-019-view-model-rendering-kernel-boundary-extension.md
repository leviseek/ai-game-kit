# ADR-019 ViewModel Rendering Capability and Kernel Boundary Extension

## 状态

Accepted

## 背景

`FairyGuiPageAdapter.createPage` 返回的 `FairyGuiViewLike` 只有 `name`/`dispose`，无读取子元素/绑定点击能力，游戏层又禁 import fgui——真实玩法（点击出牌→驱动战斗→状态刷新页面）没有呈现接缝。本 change 引入自动 diff 渲染管线（ViewModel→视图绑定）作为框架通用能力，供所有品类的 UI 呈现层复用。

ADR-018 将 `core`+`contracts` 定义为"夹具建设中禁改"的内核边界。新增渲染能力需要在 `contracts/ui/` 与 `core/ui/` 下新增文件，这与"内核禁改"口径存在张力，需要明确边界。

## 决策

### 1. 新增能力文件，既有文件零修改

在 `contracts/ui/ViewModel.ts`（契约）、`core/ui/ViewModelRenderer.ts`（纯 TS 渲染器）、`adapters/cocos/ui/FairyGuiViewHandle.ts`（fgui 视图接缝）新增能力文件；既有 `core`/`contracts` 文件保持零修改。根入口 `framework/index.ts` 白名单扩展登记新增符号，`expectedRootExports` 同步。

**理由：** ADR-018 的"内核禁改"约束针对既有文件的稳定性，防止夹具建设破坏已锁定能力；新增能力文件不与既有文件冲突，且经根入口白名单受 public-boundary 依赖扫描约束，边界不失效。

**未采用方案：** 把渲染逻辑塞进既有 `FairyGuiPageAdapter`——会让 adapter 承担引擎对接之外的渲染职责，且需修改既有文件。

### 2. 渲染管线分层

- `contracts/ui/ViewModel.ts`：`Bindable<T>`（可观察状态）、`ViewModelNode`（视图节点接缝）、`Binding<VM>` 判别联合（text/progress/visible/command）。
- `core/ui/ViewModelRenderer.ts`：`createBindable`、`createViewModelRenderer`（setViewModel 全量 + 绑定级 diff + dispose）。
- `adapters/cocos/ui/FairyGuiViewHandle.ts`：把 fgui `GComponent` 子元素包装为 `ViewModelNode`，fgui 类型仅此文件可见。

**理由：** 分层延续"core 纯 TS 可测、adapter 只做引擎对接"的既有边界（对齐 ADR-010 的 UiNavigator/Adapter 分工）。渲染器 diff 逻辑不依赖 fgui，可用 memory mock 全量单测。

**未采用方案：** 在 adapter 内实现 diff——破坏"adapter 只对接引擎"边界，且 core 层无法独立测试。

### 3. 自动 diff 语义

渲染器以绑定为单位 diff：每个绑定记录上次 get 结果，值未变化则不重复写入节点（`Object.is` 比较）；命令绑定首次渲染时经 `onClick` 注册一次。dispose 后不再渲染，幂等。

**理由：** 以绑定为单位而非节点为单位，同一节点绑定多字段时各自独立判断，避免重复写入，符合"只更新变化项"的 spec。

## 理由

- 渲染管线是五类 UI 呈现层（C1 已分级为 `view/`）缺的通用能力：游戏层定义可观察 ViewModel + 绑定声明，呈现自动 diff，为 C3 卡牌 MVP 等真实页面提供基础。
- 新增文件 + 白名单登记使能力受既有边界机制约束（public-boundary 依赖扫描、根入口隔离），不引入新的边界治理成本。

## 影响

- 未来新增渲染能力（双向绑定、列表、动画）在 `contracts/ui/` 与 `core/ui/` 新增文件，保持既有文件零修改。
- 游戏层 `view/` 文件可定义 ViewModel + 绑定声明，经 `createViewModelRenderer` 与 `createFairyGuiViewHandle` 装配；不导入 fgui。
- `framework/index.ts` 白名单与 `expectedRootExports` 需随新增公共符号同步。

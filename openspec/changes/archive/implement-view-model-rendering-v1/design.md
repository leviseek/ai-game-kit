## Context

C1 已完成目录分级（五类 `game_*` 子目录形态）。`FairyGuiPageAdapter` 的 `FairyGuiViewLike` 只有 `name`/`dispose`，无子元素访问/事件绑定。游戏层禁 import fgui（.ai 约束 + public-boundary 机械锁定）。ADR-018 口径：既有 `core`+`contracts` 文件零修改，`adapters/cocos/ui` 可修补，`boot/AppRoot` 可扩展。

## Goals / Non-Goals

**Goals:**
- 新增通用自动 diff 渲染管线：游戏层定义可观察 ViewModel + 绑定声明 → 渲染器 diff 驱动视图。
- fgui/cc 类型隔离在 adapter 边界；core 渲染器纯 TS 可测。

**Non-Goals:**
- 不实现双向绑定、列表渲染、动画驱动（扩展方向，非本 change）。
- 不修改既有 `UiNavigator`/`FairyGuiPageAdapter`/`PassiveScheduler` 行为。
- 不做 C3 玩法绑定（本 change 只交付管线本身 + 单元测试）。

## Decisions

### 1. 契约文件 `contracts/ui/ViewModel.ts`（新增，零改既有）

定义：
- `Bindable<T>`：`get(): T`、`set(value: T): void`、`subscribe(fn): DisposeHandle`；相同值 set 不触发。
- `ViewModel`：绑定声明载体（`bindings: readonly Binding<unknown>[]`）。
- `ViewModelNode` 接缝接口：`setText`/`setProgress`/`setVisible`/`onClick`；实际读写由 adapter 实现。
- `Binding<T>` 判别联合：`{ kind: "text"; node: string; get(vm): string }` | `{ kind: "progress"; node; get(vm): number }` | `{ kind: "visible"; node; get(vm): boolean }` | `{ kind: "command"; node; run(vm): void }`。

**替代方案：** 契约放 `contracts/ui/Navigation.ts` 扩展——违背"既有文件零修改"，且职责不同（导航 vs 渲染）。

### 2. 核心渲染器 `core/ui/ViewModelRenderer.ts`（新增，纯 TS）

- `createBindable(initial)`：可观察状态。
- `createViewModelRenderer(options)`：`setViewModel(vm)` 全量渲染 + 订阅自动 diff；内部维护"上次渲染值"表，字段变化才写节点；`refresh()` 强制全量；`dispose()` 清理订阅。
- diff 以绑定为单位：每个 binding 记录上次 get 结果，render 时对比，变化才调节点 setter。
- 未知节点：接缝 `node(name)` 返回 undefined 时跳过该绑定（spec 容错要求）。

**替代方案：** 在 adapter 内实现 diff——把纯逻辑留在 adapter 会破坏"adapter 只做引擎对接"边界，且 core 无法用 memory mock 测。

### 3. 视图接缝 `adapters/cocos/ui/FairyGuiViewHandle.ts`（新增，fgui 类型仅此文件）

- `createFairyGuiViewHandle(view: GObject)`：`node(name)` 用 `getChildByName` 查找；返回实现 `ViewModelNode` 的包装（text→`asTextField.text`、progress→`asProgress.value`、visible→`asGObject.visible`、onClick→`view.on(Event.CLICK, ...)`）；节点不存在返回 undefined。

**替代方案：** 直接扩展 `FairyGuiViewLike`——会改既有文件且污染现有契约。

### 4. 白名单登记

`framework/index.ts` 追加导出：`createBindable`、`createViewModelRenderer`、`type ViewModel`、`type Binding`、`type ViewModelNode`、`type Bindable`；同步 `expectedRootExports`（public-boundary 测试中）。

### 5. ADR-019

新增 ADR：允许在 `contracts/ui/` 与 `core/ui/` 新增能力文件，既有文件保持零修改；根入口白名单扩展为新增能力的登记渠道。

## Risks / Trade-offs

- [核心渲染器与 fgui 视图形状耦合] → 经 `ViewModelNode` 接口解耦，adapter 实现引擎细节，渲染器仅依赖接口。
- [diff 以绑定为单位导致重复渲染] → 同一节点多绑定时分字段独立判断，各绑定独立比较，符合 spec。
- [新增 contracts/core 文件挑战 ADR-018 口径] → 新 ADR-019 明确"新增允许、既有禁改"，避免与夹具建设口径混淆。
- [公共符号名冲突] → 登记前检查 framework/index.ts 既有导出，新增符号唯一命名。

## Why

`FairyGuiPageAdapter.createPage` 返回的 `FairyGuiViewLike` 只有 `name`/`dispose`，无读取子元素/绑定点击能力，游戏层禁 import fgui——真实玩法（点击出牌→驱动战斗→状态刷新页面）目前无接缝。需要一个通用 ViewModel→视图自动 diff 渲染管线，作为所有品类的 UI 呈现层统一能力（C2，为 C3 卡牌 MVP 提供呈现基础）。

## What Changes

- 新增框架通用能力：自动 diff 渲染管线（ViewModel→视图绑定）。
    - `contracts/ui/ViewModel.ts`（新增）：`Bindable<T>`（get/set/subscribe）、`ViewModelNode`（读 text/progress/visible/点击）、绑定声明 `Binding<T>` 等契约。
    - `core/ui/ViewModelRenderer.ts`（新增）：纯 TS 渲染器，`setViewModel` 全量渲染、字段变化自动 diff 只更新对应绑定、dispose 清理。
    - `adapters/cocos/ui/FairyGuiViewHandle.ts`（新增）：视图接缝，包装 fgui 视图暴露 `node(name)` → `ViewModelNode`，fgui 类型仅此文件可见。
- `framework/index.ts` 白名单登记新增稳定符号（只增不改）。
- 保持既有 `core`+`contracts` 文件零修改（ADR-018 口径延续）；新增 ADR 记录"允许在 contracts/ui/ 与 core/ui/ 新增文件，既有文件不变"。

## Capabilities

### New Capabilities

- `view-model-rendering`: 通用 ViewModel→视图自动 diff 渲染管线——ViewModel 可观察状态、绑定声明、渲染器 diff 刷新、视图节点接缝、dispose 清理。

### Modified Capabilities

无——既有 `fairygui-ui-adapter` 与 `ui-navigation` 的行为不变，新管线是独立能力。

## Impact

- 新增文件：`contracts/ui/ViewModel.ts`、`core/ui/ViewModelRenderer.ts`、`adapters/cocos/ui/FairyGuiViewHandle.ts`。
- 修改文件：`framework/index.ts`（白名单登记）、`tests/`（新增 `view-model-renderer.test.ts`）、ADR 文档（新增 ADR-019）。
- 不修改既有 `core`/`contracts` 文件；不引入第三方库；`expectedRootExports` 白名单同步。
- 无依赖变更。

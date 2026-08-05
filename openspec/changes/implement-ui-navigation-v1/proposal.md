## Why

Framework 已具备应用生命周期、时间调度、资源作用域与场景流转，但游戏 UI 仍无统一边界：业务没有 route、页面栈、层级、模态、焦点与页面作用域的约定，FairyGUI 尚未引入，页面生命周期也无法纳入资源所有权模型。现在按总计划第 6 节先建立引擎无关的 UI 导航模型与层级契约，可以让后续 FairyGUI Adapter、输入上下文阻断和五类组合验证建立在统一 UI 所有权模型之上，且不依赖 FairyGUI Runtime 引入决策。

## What Changes

- 新增引擎无关的 UI 导航模型，覆盖 route 标识、页面栈、打开/关闭/返回策略、重复打开语义与页面作用域清理，不依赖 `cc` 或 `fgui`。
- 新增 `scene/normal/popup/guide/toast/loading/system` 七层层级契约，定义层间覆盖关系、同层互斥/共存策略与遮罩语义。
- 新增模态与焦点契约，声明路由激活时的输入阻断策略，为后续 gameplay action 上下文切换（总计划 6.5）预留统一控制点。
- 新增页面作用域模型，复用既有 `DisposeHandle`/`ScopedEventChannel`/`ResourceScope` 语义，页面关闭时逆序清理事件订阅与资源持有。
- 在根入口白名单导出导航模型稳定契约与工厂；本 Change 不引入 FairyGUI Runtime，不实现 FairyGUI View 创建、挂载与渲染映射。

## Capabilities

### New Capabilities

- `ui-navigation`: 定义引擎无关的 UI 导航行为，覆盖 route、页面栈、层级契约、打开/关闭/返回/重复打开策略、模态与输入阻断声明、页面作用域逆序清理，不依赖任何 UI 运行时。

### Modified Capabilities

- 无。

## Impact

- 影响 `assets/framework/contracts` 与 `assets/framework/core` 新增导航模型与契约，扩展现有 Bun foundation 测试与类型检查门禁，不新增运行时依赖。
- 新增最小公开契约与工厂导出；Cocos UI 根与 FairyGUI Adapter（总计划 6.3）作为后续独立 Change 实现，其工厂进 `forbiddenInternals` 不进白名单。
- 本 Change 不引入 FairyGUI SDK、不建立 `ui` Bundle 页面资源、不实现 View 生命周期与输入动作映射；这些能力留给后续 UI Adapter 与输入 Change。

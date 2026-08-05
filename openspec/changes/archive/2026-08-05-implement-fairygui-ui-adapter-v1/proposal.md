## Why

总计划第 6 节 6.1/6.2 已完成引擎无关的 UI 导航模型（`createUiNavigator`，七层层级契约、模态推导、页面作用域），但导航规则尚未与真实 UI 运行时接通：业务无法创建、挂载、卸载页面，`modal` 状态没有对应的遮罩与输入阻断实现，FairyGUI 也尚未引入。现在启动 6.3，将 Framework UI Layer 落到 FairyGUI Adapter，为第 8 章五类组合验证提供首个真实 UI 页面能力；同时以 spike 门禁前置处理 FairyGUI Runtime 引入的版本、License、包体与兼容性验证，避免 Adapter 实现返工。

## What Changes

- 引入 FairyGUI Runtime SDK 到项目并完成兼容性验证（spike Task 0 门禁），记录版本、来源、License、包体与 Creator 3.8.8 兼容矩阵结论。
- 新增 Cocos UI 根宿主适配器，管理 GRoot 初始化与运行时初始化时机，保持 `AppRoot` 不直接 `import fgui`（对齐 task68 约束）。
- 新增 FairyGUI 页面适配器，实现页面创建、挂载、卸载、销毁，并按 `UI_LAYER_ORDER` 将框架层级映射到 `GRoot` 下容器，消费导航 `modal` 状态执行遮罩与真实输入阻断。
- 扩展资源加载能力以支持 `ResourceKind = "fairygui-package"`，实现 View → package → Bundle 逆序释放（设计决策 6 / ADR-004 落地）。
- 用 FairyGUI Editor 制作最小页面 package 导出到 `ui` Bundle，并完成 Web Desktop 冒烟验证（打开/关闭/遮罩/输入阻断/资源释放）。
- **BREAKING**: 无。现有 `contracts/ui` 导航契约与根入口白名单保持不变，Adapter 只作为新消费方接入。

## Capabilities

### New Capabilities

- `fairygui-ui-adapter`: 定义 FairyGUI 页面适配行为，覆盖 UI 根宿主、`GRoot` 容器层级映射、页面创建/挂载/卸载/销毁、模态遮罩与输入阻断、以及 View → package → Bundle 逆序资源释放。

### Modified Capabilities

- 无（`resource-management` 的 `ResourceKind` 已预留 `fairygui-package` 维度，本 Change 落地实现；`ui-navigation` 导航契约行为不变，仅新增 Adapter 消费方）。

## Impact

- 新增第三方运行时依赖 FairyGUI Runtime，vendor 到 `assets/third-party/fairygui`（含 License 文件）；spike 未通过时本 Change 不进入正式实现。
- 影响 `assets/framework/adapters/cocos/ui`、`assets/framework/core/resource`（package 加载能力）、`assets/boot/AppRoot.ts`（组合根经 Adapter 工厂接入）及根入口白名单。
- 通过 Cocos Creator 建立/更新 `ui` Bundle 内的 FairyGUI package 资源；不手工编辑 `.meta` UUID、`startup.scene` 序列化或 Creator 生成目录。
- 保持 `core`/`contracts` 零 `fgui` 导入；`fgui` 类型仅存在于 Adapter 与具体 View 边界。
- 不实现页面转场动画、业务页面内容、FairyGUI 全局事件总线或 gameplay action 输入映射；这些能力留给后续 change。

## 0. FairyGUI Runtime 引入与兼容性验证（spike 门禁）

- [ ] 0.1 确认支持 Cocos Creator 3.8.8 的 FairyGUI 版本与官方来源（GitHub 发布 / Cocos Store），冻结版本号。
- [ ] 0.2 核对 License 条款（编辑器 vs Runtime 分发、商业授权边界）并记录结论；若条款不允许目标分发方式，停止本 Change 并回总计划复审设计决策 7。
- [ ] 0.3 vendor 引入 SDK 到 `assets/third-party/fairygui`（含 License 文件，与 `library`/`temp` 隔离），Creator 3.8.8 类型检查 + Web Desktop 构建通过。
- [ ] 0.4 最小运行验证：GRoot 初始化 → package 加载 → GComponent 创建/销毁 → 卸载；记录包体与启动时间基线。
- [ ] 0.5 产出 spike 结论，新建 `doc/decisions/ADR-011-fairygui-runtime-introduction.md`（版本、来源、License、兼容矩阵、引入方式、包体基线）；未通过则本 Change 不进入正式实现。

## 1. 资源层扩展：fairygui-package 加载能力

- [ ] 1.1 先编写 package 加载契约测试，覆盖 `ResourceKind = "fairygui-package"` 的加载、失败保留标识/cause 与逆序释放接缝。
- [ ] 1.2 扩展资源层（协调器/作用域）支持 package 键空间，使 1.1 的测试通过；`core` 与 `contracts` 保持零 `fgui` 导入。
- [ ] 1.3 补充依赖边界检查，验证资源层 package 扩展不导入 `fgui`、不绕过 Provider。

## 2. Cocos UI 根宿主

- [ ] 2.1 先编写 UI 根契约测试，锁定初始化入口、重复初始化幂等、失败上报与 GRoot 接缝可注入。
- [ ] 2.2 实现 `adapters/cocos/ui/CocosUiRoot.ts` 的 `createCocosUiRoot` 工厂，封装 GRoot 获取与运行时初始化时机。
- [ ] 2.3 组合根 `AppRoot` 经 Adapter 工厂接入 UI 根宿主；`task68-scope-review.test.ts` 断言（AppRoot 不 `import fgui`、scene 无 FairyGUI 组件）保持通过。

## 3. FairyGUI 页面适配器

- [ ] 3.1 先编写页面适配契约测试，锁定按 `UI_LAYER_ORDER` 映射 GRoot 容器、页面创建/挂载/卸载/销毁与逆序释放。
- [ ] 3.2 实现 `adapters/cocos/ui/FairyGuiPageAdapter.ts`：按七层层级建立 GRoot 容器映射，对齐 `UiPage` 生命周期，消费导航 `modal` 状态呈现遮罩并阻断输入。
- [ ] 3.3 接入 package 资源作用域，实现 View → package → Bundle 逆序释放与共享引用保留；`core`/`contracts`/导航内核保持零 `fgui` 导入。

## 4. 冒烟页面与 Web Desktop 验证

- [ ] 4.1 用 FairyGUI Editor 制作最小 package 导出到 `ui` Bundle（用户侧外部前置；现有 `ui` Bundle 仅有 placeholder.json）。
- [ ] 4.2 完成 Cocos Creator 3.8.8 Web Desktop 冒烟验证（headless Chrome + CDP）：UI 根初始化、页面打开/关闭、遮罩呈现/移除、输入阻断、资源释放闭环与未加载 package no-op。
- [ ] 4.3 根入口白名单收口：Adapter 工厂进 `forbiddenInternals` 不进白名单；`public-boundary.test.ts` 全量 import 扫描通过。

## 5. 收口与门禁

- [ ] 5.1 审查 UI 根/页面适配器公开入口，移除不必要导出，用依赖检查证明无深层导入。
- [ ] 5.2 运行完整 Bun foundation 测试、strict 类型检查与依赖边界检查，记录测试数量与零失败结果。
- [ ] 5.3 ADR 检查：本次工作是否产生新的长期架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR，如无则明确记录无需 ADR。
- [ ] 5.4 归档时同步总计划 `create-game-framework-v1` 第 6 节 6.3 任务的完成状态与证据。

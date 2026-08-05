## 0. FairyGUI Runtime 引入与兼容性验证（spike 门禁）

- [x] 0.1 确认支持 Cocos Creator 3.8.8 的 FairyGUI 版本与官方来源（GitHub 发布 / Cocos Store），冻结版本号。
  - 冻结 `fairygui-cc@1.2.2`（2024-05-21 发布，npm 最新版）：官方 GitHub `fairygui/FairyGUI-cocoscreator` 默认分支 `ccc3.0`（README 明确适用于 Creator 3.4+，含 3.8.8）经官方 npm registry 发布；vendor 文件与参考项目 `ccc_lab`（Creator 3.8.8 已在用）node_modules 中同一版本 SHA-256 逐字节一致。
- [x] 0.2 核对 License 条款（编辑器 vs Runtime 分发、商业授权边界）并记录结论；若条款不允许目标分发方式，停止本 Change 并回总计划复审设计决策 7。
  - 官方仓库 LICENSE 为 MIT（Copyright (c) 2015 fairygui.com），无编辑器/Runtime 之分、无商业授权限制；允许修改、分发、商用与再分发。vendor 目录已含 LICENSE 原文；结论：条款允许目标分发方式，不触发停止条件。
- [x] 0.3 vendor 引入 SDK 到 `assets/third-party/fairygui`（含 License 文件，与 `library`/`temp` 隔离），Creator 3.8.8 类型检查 + Web Desktop 构建通过。
  - vendor：`fairygui.mjs`(620,735B)/`fairygui.min.mjs`(314,528B)/`fairygui.d.ts`(91,826B)/LICENSE；Creator 自动生成 meta（.mjs→javascript、.d.ts→typescript importer）。
  - 接线：项目根 `import-map.json` 映射裸包名 `fairygui-cc` → `./assets/third-party/fairygui/fairygui.mjs`；`settings/v2/packages/project.json` 的 `script.importMap` 声明 `project://import-map.json`（**必须 project:// 形式**，绝对路径会静默降级 `foo:/bar` 导致解析失败且无报错；配置变更后需重启 Creator）。重启后 packer-driver 日志确认 `Our import map(file:///...import-map.json)` 且 `Resolve fairygui-cc ... as ...fairygui.mjs`（editor/preview 两个 target 均成功）。
  - 类型检查：Creator tsc（strict + 项目 cc declarations）对 `fairygui-cc` 的 `GRoot`/`UIPackage`/`GComponent`/`GObject`/`UIConfig` 解析 EXIT 0；`bun run test:foundation` 417 pass / 0 fail，`test:foundation:types` 0 diagnostics（既有门禁未破坏）。
  - Web Desktop 构建：`CocosCreator.exe --nologin --project <proj> --build "platform=web-desktop;..."` 通过（首次 43s，增量 9-12s）；stderr 仅 BABEL >500KB deoptimise 提示（非失败）；spike 场景含 fairygui 引用时打包进 `assets/main/index.js`。
- [x] 0.4 最小运行验证：GRoot 初始化 → package 加载 → GComponent 创建/销毁 → 卸载；记录包体与启动时间基线。
  - headless Chrome + CDP 加载 Web Desktop 构建（spike-smoke 场景挂 SpikeFairyGuiSmoke 组件），console 零错误：`GRoot created, size=1280x960` → `UIPackage.createObject returned null (no package)`（未加载 package 时 no-op）→ `GComponent added, childCount=1` → `removed+disposed, childCount=0` → `spike smoke complete`。
  - 基线：debug 构建总包体 7.51MB；`assets/main/index.js`（含 fairygui）1.26MB；引擎 `_virtual_cc` 5.26MB；启动 Init Base 2.7ms / Init SubSystem 35.8ms / Init Project 41.5ms / LoadScene 17.8ms。
  - spike 临时产物（spike-smoke.scene、SpikeFairyGuiSmoke.ts）验证后已清理。
- [x] 0.5 产出 spike 结论，新建 `doc/decisions/ADR-011-fairygui-runtime-introduction.md`（版本、来源、License、兼容矩阵、引入方式、包体基线）；未通过则本 Change 不进入正式实现。
  - 已创建 `doc/decisions/ADR-011-fairygui-runtime-introduction.md`：版本冻结 1.2.2、来源（官方 GitHub ccc3.0 / npm）、License（MIT，允许目标分发）、兼容矩阵（Creator 3.8.8 类型检查/构建/运行均通过）、引入方式（vendor + import-map 裸包名映射，project:// 形式要求）、包体与启动基线；spike 门禁通过，本 Change 进入正式实现。

## 1. 资源层扩展：fairygui-package 加载能力

- [x] 1.1 先编写 package 加载契约测试，覆盖 `ResourceKind = "fairygui-package"` 的加载、失败保留标识/cause 与逆序释放接缝。
  - `tests/framework/foundation/fairygui-package-loading.test.ts` 7 个测试锁定 `IResourceProvider.loadPackage(bundle, path)` 契约：`fairygui-package` 标识与去重加载、失败保留 bundle:path + kind 与 cause、失败隔离、package 参与作用域逆序释放接缝（package/asset 混合逆序、共享 package 引用保留）。红期确认：`bun test tests/framework/foundation/fairygui-package-loading.test.ts` 0 pass / 7 fail，全部因 `loadPackage` 尚不存在（方案 B：经 `contracts/resource` 扩展 Provider 入口，符合 design 决策 5）。
- [x] 1.2 扩展资源层（协调器/作用域）支持 package 键空间，使 1.1 的测试通过；`core` 与 `contracts` 保持零 `fgui` 导入。
  - `IResourceProvider` 新增 `loadPackage(bundle, path)` 契约（`contracts/resource/ResourceProvider.ts`）；`createResourceProvider` 内部将 `assetKey` 泛化为按 `ResourceKind` 生成键的 `key()`，`loadPackage` 以 `kind: "fairygui-package"` 复用同一协调器/作用域（并发去重、失败保留 cause 与标识、逆序释放接缝全部继承）。`core`/`contracts` 无 `fairygui-cc` 导入；`bun test tests/framework/foundation/fairygui-package-loading.test.ts` 0→7 pass；`test:foundation` 427 pass / 0 fail（= 417 基线 + 7 fgui + 3 boundary），`test:foundation:types` 0 diagnostics，public-boundary 与 task68 边界检查通过。协调器/作用域本身零改动——`serializeKey` 已含 kind 维度，键空间天然支持 package。
  - 衔接记录（审查补充）：(a) `invalidate` 当前固定 `kind: "asset"`，package 键尚无失效/重载入口；协调器已支持任意 key，缺口仅在 Provider 入口，随 task 3.3 落地 `invalidatePackage` 或按 kind 泛化 `invalidate`；(b) Cocos 适配器 `createCocosLoader` 只按 bundle+path 当普通 asset 加载，task 3.3 需让 loader 按 `key.kind` 分派到 `UIPackage.addPackage`，并在卸载路径实现 `removePackage`（见 design.md Open Questions 更新）。
- [x] 1.3 补充依赖边界检查，验证资源层 package 扩展不导入 `fgui`、不绕过 Provider。
  - `tests/framework/foundation/public-boundary.test.ts` 新增三个断言：资源层（`core/resource` 与 `contracts/resource`）零 `fairygui-cc` 导入；package kind 只由 `ResourceProvider` 的 `loadPackage` 入口固定（协调器/作用域不自行构造 package 键，避免绕过 Provider）；`fairygui-cc` 导入仅允许出现在 `adapters/cocos` 层。public-boundary 25 pass / 0 fail。

## 2. Cocos UI 根宿主

- [x] 2.1 先编写 UI 根契约测试，锁定初始化入口、重复初始化幂等、失败上报与 GRoot 接缝可注入。
  - `tests/framework/foundation/cocos-ui-root.test.ts` 5 个测试锁定 `createCocosUiRoot` 契约：经工厂初始化入口（`init()` 后 GRoot 就绪、`initialized`/`root` 状态）、重复初始化幂等（接缝仅调用一次、不重复获取根）、失败上报（`getRoot` 抛错时 `init()` 透传且保持未初始化）、失败后重试可成功、缺省读引擎 GRoot 单例（源码断言 `GRoot.(inst|create)` 与 `options.getRoot ??`）。红期确认：`bun test tests/framework/foundation/cocos-ui-root.test.ts` 0 pass / 5 fail，全部因 `adapters/cocos/ui/CocosUiRoot.ts` 尚不存在（方案 B：task 2.2 实现工厂后转绿）；`bun run test:foundation` 427 pass / 5 fail（5 个失败即本红期测试，既有门禁未破坏）。
- [x] 2.2 实现 `adapters/cocos/ui/CocosUiRoot.ts` 的 `createCocosUiRoot` 工厂，封装 GRoot 获取与运行时初始化时机。
  - `adapters/cocos/ui/CocosUiRoot.ts` 实现 `createCocosUiRoot` 工厂：缺省接缝经 `GRoot.inst` 读取单例、未 create 时捕获异常走 `GRoot.create()` 完成首次初始化（引擎启动后首次可用时初始化）；`init()` 幂等（已初始化直接返回），`getRoot()` 抛错时透传上报且不置 `initialized`，保留调用方在引擎 ready 后重试的路径；`fgui` 类型仅存在于 Adapter 边界。目录与文件 meta（`ui.meta`/`CocosUiRoot.ts.meta`）按既有 directory/typescript importer 模式建立。
  - 验证：`bun test tests/framework/foundation/cocos-ui-root.test.ts` 5 pass / 0 fail（红期转绿）；`bun run test:foundation` 432 pass / 0 fail；`bun run test:foundation:types` EXIT 0（`adapters/cocos` 按既有排除规则不参与该检查）；Creator 3.8.8 tsc strict（基于 `temp/tsconfig.cocos.json` + fairygui.d.ts ambient）对 `CocosUiRoot.ts` EXIT 0。
- [x] 2.3 组合根 `AppRoot` 经 Adapter 工厂接入 UI 根宿主；`task68-scope-review.test.ts` 断言（AppRoot 不 `import fgui`、scene 无 FairyGUI 组件）保持通过。
  - `AppRoot.ts` 经 `createCocosUiRoot` 工厂创建并持有 `uiRoot`（`AppAssembly` 增加 `uiRoot` 字段）；`start()` 内引擎 ready 后调用 `init()`，GRoot 未就绪时上报（console.error）并保持未初始化以便重试；`fgui` 类型不进入组合根，AppRoot 源码仍零 `fgui` 导入。
  - `approot-composition.test.ts`/`smoke-approot-lifecycle.test.ts` 补充 `mock.module("fairygui-cc")` 空桩（AppRoot 经工厂间接依赖 fairygui-cc，与 `cocos-ui-root.test.ts` 一致，不加载真实运行时）。
  - 验证：`task68-scope-review.test.ts`、`approot-composition.test.ts`、`smoke-approot-lifecycle.test.ts`、`cocos-ui-root.test.ts` 43 pass / 0 fail；`bun run test:foundation` 432 pass / 0 fail；`test:foundation:types` EXIT 0；Creator 3.8.8 tsc strict 对 AppRoot+CocosUiRoot 依赖链（含 fairygui.d.ts ambient）EXIT 0。

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

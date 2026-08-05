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

- [x] 3.1 先编写页面适配契约测试，锁定按 `UI_LAYER_ORDER` 映射 GRoot 容器、页面创建（显式参数化 `packageName`/`resName`，不内建 route→资源路由表）/挂载/卸载/销毁、失败保留诊断与模态遮罩/输入阻断接缝（`setModal`）；逆序释放与共享引用保留属资源作用域行为，由 `fairygui-package-loading.test.ts` 覆盖，adapter 测试不再锁定 provider 行为（审查 A2 决策 a）。
  - `tests/framework/foundation/fairy-gui-page-adapter.test.ts` 9 个测试锁定 `createFairyGuiPageAdapter` 契约：七层 GRoot 容器按 `UI_LAYER_ORDER` 顺序建立且 `init` 幂等、`createPage(route, layer, { packageName, resName })` 显式参数化（createView 接缝收到 package/resName、失败保留 cause 且视为已销毁、createView 未配置同样视为已销毁）、`mount` 落入声明层容器、`unmount`/`destroy` 幂等、`destroy` 先移除挂载再销毁 View（容器无残留）、`setModal` 在 system 层呈现遮罩且收敛时精确移除不误删其它子对象、`dispose` 移除遮罩与全部容器且页面逆序销毁。
  - 前置确认：design.md Open Questions 补充页面创建显式参数化（route 仅作标识，package/resName 由调用方传入）与 modal 消费接缝（显式 `setModal`，3.2 由 AppRoot/导航回调驱动）两项决策；tasks.md 3.1 描述同步并入 modal 契约。
  - 红期确认：`bun test tests/framework/foundation/fairy-gui-page-adapter.test.ts` 0 pass / 9 fail，全部因 `adapters/cocos/ui/FairyGuiPageAdapter.ts` 尚不存在；`bun run test:foundation` 433 pass / 9 fail（9 个失败即本红期测试，既有门禁未破坏）。
- [x] 3.2 实现 `adapters/cocos/ui/FairyGuiPageAdapter.ts`：按七层层级建立 GRoot 容器映射，对齐 `UiPage` 生命周期，消费导航 `modal` 状态呈现遮罩并阻断输入。
  - `adapters/cocos/ui/FairyGuiPageAdapter.ts` 实现 `createFairyGuiPageAdapter`：`init()` 按 `UI_LAYER_ORDER` 建立七层 GRoot 子容器（复用 `root.addChild` 返回值作容器引用，真实 GRoot.addChild 亦返回子对象）且幂等；`createPage(route, layer, { packageName, resName })` 显式参数化，创建失败保留 cause 且页面视为已销毁（未配置 createView 同语义）；`mount`/`unmount` 挂载/移除到声明层容器、重复操作幂等；`destroy` 先移除挂载再销毁 View、重复销毁幂等；`setModal` 在 system 层呈现遮罩、收敛时 `removeChild(mask)` 精确移除（不误删 system 层其它页面）且幂等；`dispose` 逆序销毁页面、移除遮罩与全部容器（从 root 移除）、dispose 后不可重建；handle 可变状态经 WeakMap 存取保持接口只读；`fgui` 类型仅存在于 Adapter 边界。
  - 测试 harness 修正：recording root 的 `addChild` 返回记录型容器包装，使容器级调用（mount/unmount/setModal/dispose）可观测；四处 fairygui-cc mock 统一改用共享 fixture `tests/framework/foundation/helpers/fairygui-mock.ts`（GRoot 忠实语义 + UIPackage + GComponent），因 bun mock.module 全局共享首个生效，保证全量运行下值导入符号齐全。
  - 验证：`bun test tests/framework/foundation/fairy-gui-page-adapter.test.ts` 9 pass / 0 fail（红期转绿）；`bun run test:foundation` 442 pass / 0 fail；`test:foundation:types` EXIT 0；Creator 3.8.8 tsc strict 对 `FairyGuiPageAdapter.ts` EXIT 0。
- [x] 3.3 落地 package 资源层能力（kind 分派 + 卸载清理 + 失效重试入口），View → package → Bundle 逆序释放的**编排留 4.x**（AppRoot 集成时经资源作用域驱动，adapter 的 `provider` 为预留参数不直接读取）；`core`/`contracts`/导航内核保持零 `fgui` 导入。
  - `contracts/resource/ResourceProvider.ts` 新增 `invalidatePackage(bundle, path)`（loadPackage 失败后的公共重试入口，kind 固定 `"fairygui-package"`，协调器键空间已支持任意 key）；`core/resource/ResourceProvider.ts` 落地实现，与 `invalidate` 仅 kind 不同。
  - `adapters/cocos/resource/CocosResourceProvider.ts` 落地 kind 分派：loader 对 `key.kind === "fairygui-package"` 分派到 `UIPackage.loadPackage`（经 `uiPackage` 接缝注入，缺省用 fairygui-cc 静态 API，bundle 类型断言集中在 Adapter 边界），记录按 Bundle 注册的 package 名；`unloadBundle` 先按注册逆序 `UIPackage.removePackage` 清理注册表，再 `releaseAll` + `removeBundle`（同 bundle 多 package 逆序移除；跨 bundle 依赖排序为已知限制，待 4.x 依赖拓扑成立后处理）。`core`/`contracts`/导航内核保持零 `fgui` 导入（public-boundary 锁定）。
  - 红期测试：`fairygui-package-loading.test.ts` 增 2 个 `invalidatePackage` 契约测试；`cocos-resource-provider.test.ts` 增 kind 分派测试（UIPackage mock 双路 settle 使红期快速失败而非挂起）、package 失败路径锁定走 UIPackage 分派、卸载先 removePackage 再 releaseAll、多 package 逆序移除。红期 14 pass / 4 fail，转绿 18 pass / 0 fail。
  - 验证：`bun run test:foundation` 447 pass / 0 fail；`test:foundation:types` EXIT 0；Creator 3.8.8 tsc strict 对 `CocosResourceProvider.ts`（含 `cc.AssetManager.Bundle` 断言与 fairygui UIPackage 类型）EXIT 0。

## 4. 冒烟页面与 Web Desktop 验证

- [x] 4.1 用 FairyGUI Editor 制作最小 package 导出到 `ui` Bundle（用户侧外部前置；现有 `ui` Bundle 仅有 placeholder.json）。
  - 用户经 FairyGUI Editor 制作最小工程 `ui/demo`（组件 `DemoView`：1280x720，子元件 `img_bg`（image，引用 `img/background.png`，9-grid）+ `txt_title`（text），package id `4q9x2uij`，name `Demo`，无跨包依赖），发布到 `assets/ui/Demo/Demo.bin`（599B，binaryFormat + compressDesc）+ `Demo_atlas0.png`（1835B，9-grid 背景图集），经 `buffer`/`image` importer 导入生成 meta，`ui` Bundle `isBundle` 保持 true）；加载路径语义 `provider.loadPackage("ui", "Demo/Demo")` 由 4.2 冒烟实测通过。误发布的 FairyGUI 内置工程产物（`assets/ui/Basic`、`assets/ui/Builder`）已清理。源工程 `ui/` 含编辑器自动注入的 Basic/Builder 内置资源（保证跨机可打开，`.objs/` 已忽略）。验证：`bun run test:foundation` 448 pass / 0 fail，`test:foundation:types` 0 diagnostics（既有门禁未破坏）。
- [x] 4.2 完成 Cocos Creator 3.8.8 Web Desktop 冒烟验证（headless Chrome + CDP）：UI 根初始化、页面打开/关闭、遮罩呈现/移除、输入阻断、资源释放闭环与未加载 package no-op。
  - **代码前置（AppRoot 装配）**：`AppRoot` 经工厂装配 `FairyGuiPageAdapter`（`ensurePageAdapter` 在 uiRoot init 成功后按需创建，root 延迟可用；`createFairyGuiView` 位于 Adapter 边界，组合根不直接 `import fgui`）；新增冒烟方法 `smokeUiInit`/`smokeUiReady`/`smokeUiLoadPackage`/`smokeUiOpenPage`/`smokeUiClosePage`/`smokeUiSetModal`/`smokeUiRelease`/`runUiSmoke`；`GRootLike` 扩展对齐 `FairyGuiRootLike` 容器形状（addChild/removeChild/removeChildren/getChildAt/numChildren/width/height）。`AppRoot` 检测 URL `?smoke=fairygui-ui` 延迟触发 `runUiSmoke`，每步输出 `[ui-smoke]` 标记，CDP 采集验证。
  - **转译 bug 修复**：Creator 构建把 `[...set]`/`[...iterable]` 转译为 `[].concat(set)`，concat 不展开 Set/迭代器，导致 `LoadCoordinator.settleEntry` 遍历 waiters 时报 `finish is not a function`（冒烟红期复现）、`ResourceScope.release` 逆序释放静默失效。改用 `Array.from`（转译后语义不变）：`LoadCoordinator.ts` waiters 快照、`ResourceScope.ts` held.values() 逆序、`FairyGuiPageAdapter.ts` pages 快照/findPage、`MemoryPlatform.ts` visibilityListeners（审查 M1 补充）。
  - 新增 `tools/creator/commands/ui-smoke.ts` 冒烟命令（校验 import-map → 构建 → serve → headless Chrome 加载 `?smoke=fairygui-ui` → 断言关键标记 + 零错误）。
  - 测试：`fairy-gui-page-adapter.test.ts` 增遮罩尺寸/touchable/opaque 断言与缺省遮罩工厂测试；`approot-ui-smoke.test.ts` 6 个测试覆盖 smokeUi 方法形状与 mock 引擎下序列执行；`approot-composition.test.ts` 增 smokeUi 方法形状断言；`resource-provider.test.ts` 转译防御升级为全库 Set/Map 迭代器展开扫描；task68 豁免 `new Error`/`new URLSearchParams`（通用构造，非 Module 实例化）。
  - **审查修复（ai-sensei B1/M1/M3）**：`setModal` 遮罩从空 `GComponent` 改为 `GGraph`（`drawRect` 半透明填充对齐官方 `GRoot._modalLayer` 模式），并设 `opaque=true`（空图形命中自身需 `_opaque`，否则触摸穿透到下层页面、阻断失效）与 `touchable=true`；遮罩创建抽为可注入 `createMask` 接缝，缺省工厂 `createFairyGuiMask` 供 AppRoot 使用。转译防御测试从 3 文件正则升级为全库扫描（`[...x.values()]`/`[...x.keys()]`/`[...x.entries()]` + 已知 Set/Map 变量名展开）。
  - 验证：`bun run ccc ui-smoke` 全链路通过——`ui-root-init: ok` → `package-load: ok (ready)`（Demo package 加载）→ `page-open: ok` → `modal-show/hide: ok` → `page-close: ok` → `resource-release: ok`（ui Bundle 可卸载）→ `missing-package-noop: ok (failed)` → `complete`，页面零 console error；`bun run test:foundation` 458 pass / 0 fail，`test:foundation:types` 0 diagnostics，Creator strict tsc（DOM lib + fairygui.d.ts ambient）对 AppRoot + adapter 依赖链 EXIT 0。
- [x] 4.3 根入口白名单收口：Adapter 工厂进 `forbiddenInternals` 不进白名单；`public-boundary.test.ts` 全量 import 扫描通过。
  - `framework/index.ts` 根入口白名单不导出 `createFairyGuiPageAdapter`/`createFairyGuiView`（`expectedRootExports` 快照锁定）；AppRoot 经深路径导入 adapter 工厂（与既有 `createCocosUiRoot` 模式一致，组合根仍零 `fgui` 导入，task68 断言保持通过）。
  - `public-boundary.test.ts` 的 `forbiddenInternals` 加入 `createFairyGuiPageAdapter`、`createFairyGuiView`，锁定这两个工厂不得作为根入口导出。
  - 全量 import 扫描（`locks fairygui-cc imports to the cocos adapter layer`）通过：frameworkRoot 非 cocos adapter 文件零 `fairygui-cc` 导入，资源层（core/contracts/resource）零 fgui 导入、package kind 仅由 Provider 入口固定；AppRoot 深路径导入只发生在 boot 层，不在 frameworkRoot 扫描范围。
  - 验证：`public-boundary.test.ts` 25 pass / 0 fail（54 expect，含新增 forbiddenInternals 断言）；`bun run test:foundation` 458 pass / 0 fail。

## 5. 收口与门禁

- [x] 5.1 审查 UI 根/页面适配器公开入口，移除不必要导出，用依赖检查证明无深层导入。
  - **审查遗留待办（ai-sensei 4.1-4.3 审查，非阻断）**：(a) M2 真实交互验证——`modal-show: ok` 目前是自证（`setModal` 不抛错即 ok），未做 CDP 点击注入断言下层页面在模态期间不响应；后续冒烟增强可在 DemoView 加可点击元素并用 CDP 派发点击验证阻断。(b) M4 导航自动同步——当前 `setModal` 是显式接缝，AppRoot 冒烟直接调用，未与 `UiNavigator.modal` 状态联动（spec 要求"阻断状态随导航状态自动同步"）；导航联动属总计划 6.4-6.5 集成范围，归档时明确为后续集成项。(c) S3 遮罩可见性——缺省 `createFairyGuiMask` 用 GComponent（阻断正确但透明不可见），可见半透明遮罩需 GGraph（引入 cc.Color 依赖）留给后续。(d) S4 `dispose()` 后 `createPage`/`mount`/`unmount` 未检查 disposed，行为不一致，建议补检查。(e) S5 遮罩尺寸为快照，窗口 resize 不同步。(f) S6 `CocosUiRoot.ts:74` 收尾格式多余空格、`GRootLike` 与 `FairyGuiRootLike` 形状重复可收敛、`approot-ui-smoke.test.ts` 死变量。
  - 实施（5.1）：(d) 已补——`createPage` 增加 `disposed` 早退，返回已销毁句柄并保留诊断，与 mount/unmount/destroy/setModal 一致。(f) 已收敛——`FairyGuiPageAdapter` 删除重复的 `FairyGuiContainerLike` 形状，改为复用 `CocosUiRoot` 的权威 `GRootLike`（`FairyGuiContainerLike = GRootLike`，同层 type-only 导入）；`CocosUiRoot.ts:74` 收尾多余空格修复；`approot-ui-smoke.test.ts` 未使用的 `makeRecordingRoot` 死代码与死变量删除。(a)(b)(c)(e) 保持归档前记录，不阻塞本 Change。
  - 公开入口收口：`createFairyGuiMask` 无外部消费者（AppRoot 依赖 adapter 内部默认接缝），降为模块内部函数不导出；对外仍只保留 `createFairyGuiPageAdapter`/`createFairyGuiView`/`createCocosUiRoot` 及契约类型，组合根经深路径导入（task68 与 forbiddenInternals 断言保持通过）。
  - 依赖检查证明无深层导入：`public-boundary.test.ts` 新增测试锁定 UI 适配器模块只能被自身目录内引用（框架内部其它层不得深层导入 `adapters/cocos/ui`），组合根 AppRoot 是唯一外部消费者（boot 层深路径导入，frameworkRoot 扫描范围外）；既有 `locks fairygui-cc imports to the cocos adapter layer` 与 `keeps all current asset imports within architecture boundaries` 保持通过。
- [x] 5.2 运行完整 Bun foundation 测试、strict 类型检查与依赖边界检查，记录测试数量与零失败结果。
  - `bun run test:foundation` 462 pass / 0 fail（= 458 基线 + 4 新增/收敛后的边界断言，含 5.1 补的 `createPage` disposed 路径）；`test:foundation:types` EXIT 0（0 diagnostics）；`public-boundary.test.ts` 26 pass / 0 fail（55 expect，含新增 UI 适配器深层导入锁定）；`ccc typecheck`（Creator 3.8.8 strict + fairygui.d.ts ambient）0 diagnostics。
- [x] 5.3 ADR 检查：本次工作是否产生新的长期架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR，如无则明确记录无需 ADR。
  - 结论：**无需新增 ADR**。本 Change 的长期架构决策均已成文——ADR-002（FairyGUI 选择）、ADR-011（FairyGUI runtime 引入，本 Change spike 0.5 产出）、ADR-004（资源策略，package 经资源层扩展）、ADR-010（UI 导航层级契约，GRoot 容器映射）、ADR-005（framework-game 边界，task68 零 fgui 导入）。5.1 的容器接缝收敛与 `createFairyGuiMask` 内部化属实现层重构，不改变既有决策；厂商决策（视图创建显式参数化、modal 显式接缝、provider 预留不直接读取、package 编排留 4.x）已记录于 design.md Open Questions，非长期架构决策。
- [x] 5.4 归档时同步总计划 `create-game-framework-v1` 第 6 节 6.3 任务的完成状态与证据。
  - 已同步：`openspec/changes/create-game-framework-v1/tasks.md` 6.3 标记 `[x]`，记录完成 evidence（spike 门禁与 ADR-011、CocosUiRoot/FairyGuiPageAdapter 工厂、fairygui-package 资源层能力、AppRoot 零 fgui 装配、Web Desktop 冒烟验证、5.x 收口与门禁数字、遗留集成项）。

## Context

`implement-ui-navigation-v1` 已完成引擎无关的 UI 导航模型（`core/ui/UiNavigator.ts` + `contracts/ui/Navigation.ts`），七层层级契约由 `UI_LAYER_ORDER` 固定，模态状态由栈顶 `blocking` 推导，页面作用域按逆序释放。ADR-010 已规定 FairyGUI Adapter 必须按 `UI_LAYER_ORDER` 映射 `GRoot` 子容器、消费 `modal` 状态做真实阻断。`task68-scope-review.test.ts` 锁死 `startup.scene` 零 FairyGUI 组件、`AppRoot` 禁止 `import fgui`。资源层 `ResourceKind` 已预留 `"fairygui-package"` 键空间，但 `core/resource/ResourceProvider.ts` 当前只加载 asset，package 加载能力不存在。FairyGUI Runtime 是仓库第一个外部运行时依赖，proposal 要求引入前确认版本、License、包体与兼容性。本设计对应 `proposal.md` 与 `specs/fairygui-ui-adapter/spec.md`，承接总计划任务 6.3。

## Goals / Non-Goals

**Goals:**

- 以 spike 门禁前置 FairyGUI Runtime 引入验证（版本、来源、License、包体、Creator 3.8.8 兼容），结论成文并固定版本。
- 建立 Cocos UI 根宿主适配器，经工厂在组合根接入，保持 `AppRoot` 不直接 `import fgui`。
- 建立 FairyGUI 页面适配器：按 `UI_LAYER_ORDER` 映射 GRoot 容器、消费 `modal` 状态实现遮罩与输入阻断、对齐 `UiPage` 生命周期。
- 落地 `ResourceKind = "fairygui-package"` 的加载与 View → package → Bundle 逆序释放（设计决策 6 / ADR-004）。
- 用最小 FairyGUI package 完成 Web Desktop 冒烟验证，复用 headless Chrome + CDP 模式。

**Non-Goals:**

- 不实现页面转场动画、业务页面内容、FairyGUI 全局事件总线、路由参数匹配或导航历史。
- 不实现 gameplay action 输入映射（总计划 6.4–6.5）；只提供 UI 侧遮罩与输入阻断。
- 不实现 FairyGUI 编辑器工作流自动化；package 制作属于用户侧外部前置。
- 不修改 `startup.scene` 序列化、既有 `.meta` UUID、`contracts/ui` 导航契约或根入口已有白名单符号。
- 不预建多平台适配矩阵（原生/小游戏留给后续 change，本 Change 只验证 Web Desktop）。

## Decisions

### 1. FairyGUI 引入以 spike 门禁，vendor 到 `assets/third-party/fairygui`

Task 0 是独立 spike：确认支持 Creator 3.8.8 的版本与官方来源、核对 License（编辑器 vs Runtime 分发、商业授权）、引入到 `assets/third-party/fairygui`（含 License 文件，与 `library`/`temp` 生成目录隔离）、Creator 类型检查 + Web Desktop 构建 + 最小运行（GRoot 初始化 → package 加载 → GComponent 创建/销毁 → 卸载）通过，并记录包体与启动基线。spike 结论写入 ADR-011；未通过则回总计划复审设计决策 7，本 Change 不进入正式实现。

**理由：** FairyGUI 是首个外部运行时依赖，proposal 要求引入前确认版本/License/包体/平台；vendor 方式符合"不引入新 npm 依赖"的项目纪律，目录固定且可审计。把最大不确定性前置到 spike，避免 Adapter 写完后返工。

**未采用方案：** 不直接复制官方示例进仓库（引入混乱且难以隔离）；不在 spike 前并行写 Adapter（违反"先验证再依赖"原则）。

### 2. UI 根宿主经 Adapter 工厂接入，AppRoot 保持零 fgui 导入

`adapters/cocos/ui/CocosUiRoot.ts` 提供 `createCocosUiRoot` 工厂：封装 GRoot 获取、运行时初始化时机（引擎启动后首次可用时初始化）与可测试的初始化入口；`fgui` 类型只存在于 Adapter 边界。组合根 `AppRoot` 经工厂创建并持有，`task68` 禁止 `import fgui` 的断言保持成立。

**理由：** task68 与 design 决策 7 要求 FairyGUI 类型限制在 Adapter 和具体 View 内；工厂注入让纯 TypeScript 测试可 mock GRoot 初始化路径。

**未采用方案：** 不让 AppRoot 直接 `import fgui` 初始化（违反 task68 与分层）；不把 GRoot 暴露为全局单例访问器。

### 3. 页面适配器按 `UI_LAYER_ORDER` 建立 GRoot 容器映射

`adapters/cocos/ui/FairyGuiPageAdapter.ts` 在初始化时按 `UI_LAYER_ORDER` 顺序建立 `scene/normal/popup/guide/toast/loading/system` 七个 GRoot 子容器（创建或定位）。页面挂载映射到其声明层级的容器；关闭时按 View 销毁 → package 卸载 → Bundle 释放的逆序执行，复用/接入资源作用域与引用计数。

**理由：** ADR-010 已规定层级映射为 Adapter 硬约束；容器顺序与导航层级契约一致，保证遮挡关系确定。

**未采用方案：** 不让页面自行创建/移除 GRoot 容器（所有权与顺序必须由 Adapter 统一管理）。

### 4. 模态遮罩与输入阻断由 Adapter 消费导航状态

Adapter 订阅/轮询导航 `modal` 状态（或经导航回调）：进入阻断时在 `system` 层下创建遮罩节点并阻断下层输入，模态收敛后移除。遮罩呈现与输入拦截完全由 Adapter 执行，导航只负责状态推导。

**理由：** design 决策 10 与 ADR-010 规定 Framework UI Layer 统一控制模态，真实拦截在 Adapter 层；与 6.5 输入上下文阻断衔接时以模态状态为 UI 侧依据。

**未采用方案：** 不让页面自行维护遮罩或输入拦截；不把遮罩逻辑打进 `core/ui` 导航内核。

### 5. package 加载能力经资源层扩展，不绕过 Provider

`ResourceKind = "fairygui-package"` 的加载经 `contracts/resource` 扩展（或 Adapter 内封装的 package loader 接入协调器与作用域），禁止业务直接调用 FairyGUI package 注册/卸载 API。View 生命周期持有 package handle，参与作用域引用计数。

**理由：** ADR-004 禁止业务直接操作引擎 Bundle/package API；`ResourceKind` 键空间已预留，本 Change 落地实现使 package 复用既有并发去重、作用域与引用计数。

**未采用方案：** 不让 Adapter 脱离资源层自行加载 package（破坏所有权模型，导致 Bundle 已卸载仍引用纹理的风险）。

### 6. 冒烟验证复用 headless Chrome + CDP，package 为最小样例

用 FairyGUI Editor 制作最小 package 导出到 `ui` Bundle（用户侧前置），Web Desktop Preview 经 headless Chrome + CDP 验证：UI 根初始化、页面打开/关闭、遮罩呈现/移除、输入阻断、资源释放闭环。Bun 测试只锁 Adapter 契约形状与纯逻辑行为，引擎集成以运行期冒烟为门禁。

**理由：** 对齐 5.7/6.2 已验证的冒烟模式；引擎运行期行为无法仅凭 Bun 测试证明。

**未采用方案：** 不要求所有测试启动 Cocos 编辑器；不用完整示例游戏作为验收条件。

## Risks / Trade-offs

- **[FairyGUI 版本与 Creator 3.8.8 不兼容]** → spike Task 0 门禁前置验证；未通过则回总计划复审决策 7，不进入实现。
- **[License 条款不允许目标分发方式]** → spike 0.2 核对并记录；这是唯一可能推翻 ADR-002 的风险，必须前置确认。
- **[strict TypeScript 与 FairyGUI 导出类型摩擦]** → `core`/`contracts`/导航内核不放宽；可空引用与类型断言集中在 Adapter 与具体 View 边界（design 决策 7 风险预案）。
- **[包体或启动成本超预算]** → spike 0.4 记录基线，作为 9.5 性能检查的既有数据；只在有证据时优化。
- **[package 加载扩展破坏资源所有权模型]** → 严格经协调器/作用域接入，禁止旁路；用共享引用保留测试锁定。
- **[AppRoot 或 scene 泄漏 fgui 类型]** → task68 断言继续生效，Adapter 工厂为唯一入口；冒烟额外检查场景无 FairyGUI 组件。
- **[冒烟 package 制作依赖编辑器操作]** → 作为用户侧外部前置记录在任务清单，阻塞路径在任务说明中标注。

## Migration Plan

1. Task 0 spike：FairyGUI 版本/License/引入/最小运行验证，产出 ADR-011；未通过则停止本 Change。
2. 扩展资源层支持 `fairygui-package`，先写失败测试再实现，保持既有 Foundation 门禁通过。
3. 实现 UI 根宿主与页面适配器（GRoot 容器映射、模态遮罩、页面生命周期），纯逻辑部分用 Bun 测试锁定。
4. 组合根接入 Adapter 工厂；制作最小 FairyGUI package 并完成 Web Desktop 冒烟。
5. 根入口白名单收口、依赖边界检查、完整门禁；归档前同步总计划 6.3 状态并做 ADR 检查。

回滚以模块为单位：spike 未通过时不引入任何 FairyGUI 代码；Adapter 问题则移除 UI 模块装配，保留无业务 UI 的启动诊断状态。`startup.scene`、既有 `.meta` 与导航契约不做破坏性迁移。

## Open Questions

- FairyGUI package 与单文件 handle 在协调器中的具体键空间复用方式：本 Change 决定 package 经资源层扩展接入，但 package 注册/依赖排序的精确语义（FairyGUI 全局注册表移除时机）需在 spike 确认 API 后细化，不改变 spec 与任务拆解。
- 遮罩节点由谁创建（Adapter 自建 vs 预置在 package 中）：spike 确认 GRoot 能力后定，属于实现细节，不改变契约。
- package 键空间的失效/重载入口：`IResourceProvider.invalidate` 当前固定 `kind: "asset"`，`loadPackage` 失败后无公共 API 清缓存或重试。协调器底层已支持任意 key，缺口仅在 Provider 入口，随 task 3.3 落地 `invalidatePackage` 或按 kind 泛化 `invalidate`。
- Cocos loader 的 kind 分派：`createCocosLoader` 当前只按 bundle+path 当普通 asset 加载，task 3.3 需让 loader 按 `key.kind === "fairygui-package"` 分派到 `UIPackage.addPackage`，并在 `unloadBundle` 卸载路径实现 `removePackage`；同 bundle 多 package 的注册/卸载顺序与跨 bundle 依赖排序需在 task 3.3 细化。
- 页面创建参数化（task 3.1 前置确认）：route 到 package/资源名的定位不做 adapter 内建路由表。`createPage(route, layer, { packageName, resName })` 显式参数化，route 仅作标识（对齐 `UiPage.route`），package/resName 由调用方显式传入；route → 资源映射留给游戏层或后续配置，不进入 adapter 边界。
- modal 消费接缝（task 3.1 前置确认）：adapter 提供显式 `setModal(modal)` 状态入口，消费导航模态状态呈现遮罩并阻断输入；3.2 集成时由 AppRoot/导航回调驱动，测试直接调用锁定契约。

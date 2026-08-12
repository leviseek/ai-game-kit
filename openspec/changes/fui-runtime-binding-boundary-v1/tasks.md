# Implementation Tasks

## 1. URL 契约贯穿绑定链

- [x] 1.1 定义 `FuiComponentUrl = \`ui://${string}/${string}\`` 与 `FuiBindOptions`（`runtimeBinding: "required" | "none"` 必填），internal `createFuiComponentUrl(packageName, componentName)` 工厂不导出
- [x] 1.2 修改 `FUIBind(url, fields, options)`：首参数改为 `FuiComponentUrl`，直接消费 `ui/generated` 常量，无旧三参数兼容重载
- [x] 1.3 `FuiComponentRegistry.register/lookup` 参数改为 `FuiComponentUrl`
- [x] 1.4 `FuiViewHost` 内部单点调用 `createFuiComponentUrl`，Registry 查询、错误与 binder 复用同一 URL，无散落类型断言
- [x] 1.5 CloseDialog 迁移：`@FUIBind(UiDemoCloseDialog, fields, { runtimeBinding })` 消费生成常量
- [x] 1.6 收窄根入口导出：仅新增 `FuiComponentUrl`/`FuiBindOptions`；同步 `expectedRootExports`
- [x] 1.7 写失败测试（fui-view / fui-view-host / contracts.typecheck / public-boundary）并迁移 Registry 隔离 helper 为保存/恢复原对象

## 2. FUI 类型化错误

- [x] 2.1 新建 `core/fui/FuiErrors.ts`：`FuiViewCleanupError extends FrameworkError`（冻结 `errors`、携带组件上下文与首个 cause）；注册/创建/绑定错误内部化
- [x] 2.2 迁移错误导入：`fui-view.test.ts` 等改从 `FuiErrors.ts` 导入；Registry 删除旧错误 re-export
- [x] 2.3 `FuiViewSeam.child` 改为非可选返回，缺失节点抛 `FuiBindingError(url, nodeName, "field"|"click")`
- [x] 2.4 失败测试：`FuiViewCleanupError` 继承/冻结/首个 cause；Host 创建错误传播规则固定为「createObject null/ctor 抛错 → FuiViewCreationError；字段/点击缺失且回滚成功 → 原 FuiBindingError；回滚也失败 → 聚合错误」

## 3. View 与 Host 清理隔离

- [x] 3.1 `FuiView.__own(handle)`：disposables 逆序全部执行，`onClose` 最后；有错误抛 `FuiViewCleanupError`；重复 dispose 幂等
- [x] 3.2 Host 分别执行 View 与 GComponent dispose，同一错误类汇总；创建回滚覆盖 ctor 抛错、binder/attach 失败；回滚异常不覆盖 primary error
- [x] 3.3 失败测试：三个 disposer 中第二个抛错时其余全部执行；View 与 GComponent 同时抛错时两个错误均保留

## 4. 页面、UiHost 与会话资源清理隔离

- [x] 4.1 页面状态先标记 disposed；adapter.dispose 继续清理其它页面/容器；容器 removeChild 失败不阻断其余
- [x] 4.2 `closeEntryPage` 始终 release scope；`navigator.close` 与 page destroy 同时失败时 scope.release 仍执行且两个错误均保留
- [x] 4.3 UiHost.dispose 始终释放 navigator 与 uiScope；resize unsubscribe 与 adapter.dispose 同时失败时仍执行且错误集合完整
- [x] 4.4 失败测试四组（fairy-gui-page-adapter / boot-game-lobby-host）

## 5. 事务式 binder registry

- [x] 5.1 新建 `core/fui/FuiViewBinderRegistry.ts`：公共导出 `FuiViewBindingScope`/`FuiViewBinding`/`FuiViewBindingRegistrar`/`defineFuiViewBinding`
- [x] 5.2 内部 `FuiViewBindingResolver.bindRequired(url, view, scope)`：缺失/ctor 不匹配/binder 抛错抛类型化错误，不 dispose scope
- [x] 5.3 失败测试：正确/错误 ctor、重复 URL、registration dispose、binder 中途抛错时已登记句柄留在调用方 scope 中
- [x] 5.4 根入口仅导出四个公共符号；`createFuiViewBinderRegistry`/resolver 不走根白名单

## 6. Host required binder 与事务回滚

- [x] 6.1 `createBoundView(packageName, resName, componentRegistry, bindingResolver, createObject?)` 与 `createFairyGuiBoundView(bindingResolver, options?)`
- [x] 6.2 required entry 无 binder 时创建失败并回滚；binder own 两个非幂等句柄后抛错时 Host 逆序各释放一次
- [x] 6.3 无依赖 entry 必须显式声明 `runtimeBinding: "none"` 才能创建成功
- [x] 6.4 迁移所有调用参数（fui-view-host / fui-demo-integration）显式传依赖，禁止可选参数错位

## 7. assembleApp 产出已接线 UiHost

- [x] 7.1 `UiHostDeps` 接收内部 resolver 与可选 `FuiObjectFactory`；`AppAssembly` 直接返回已接线 `uiHost` 与 public `fuiViewBindingRegistrar`
- [x] 7.2 `assembleApp(options?)` 创建单一 registry 并以 registrar 暴露 Feature 安装接缝；resolver 保持内部局部值；`AppRoot.onLoad` 使用 `assembly.uiHost`
- [x] 7.3 失败测试：`assembleApp({ fuiObjectFactory })` 产出 uiHost 创建 required 页面，未注册 binder 时 page.disposed 且 error 为 runtime binding missing；两次 assembly 的 registrar 实例隔离

## 8. CloseDialog Application facade 与 Feature assembly

- [x] 8.1 新建 `game_fui_demo/assembly.ts`：`CloseDialogApplication { confirm(); cancel() }` 执行外部 effect；`createCloseDialogFeature(registrar, effects)` 返回 Feature Store handle、registration 与 `dispose()`
- [x] 8.2 CloseDialog 依赖改为 `bind({ store, application })`，端口与 effect 不进入 View
- [x] 8.3 `store.ts` 收敛为单一装配入口：删除 `CloseDialogStoreHandle`/`createCloseDialogStoreModule` 及旧 Module 装配测试
- [x] 8.4 `assets/samples/entry.ts` 导出冻结 `SAMPLES_BUNDLE_DESCRIPTOR` 并经 `registerBundle` 暴露 `createCloseDialogFeature`
- [x] 8.5 测试隔离：`bundle-module-registration.test.ts` 用 try/finally 恢复 descriptor；`bundle-module-registry.test.ts` 用唯一名 `bundle-registry-test`；`fui-demo-integration.test.ts` 复用生产 Registry（保存/恢复引用）

## 9. 生产链集成验收与收尾

- [x] 9.1 生产链测试：经 `assembly.uiHost.ensurePageAdapter()`/`pageAdapter.createPage()` + 注入的 `fuiObjectFactory` 创建记录型 GComponent；断言 dispatch → project → 节点更新、facade 调用、重开页面仍可 dispatch
- [x] 9.2 Feature dispose 后再次创建 required 页面 fail-fast：page.disposed、错误类型正确、监听与 GComponent 全部回滚
- [x] 9.3 删除 `getBoundView` 并 `rg "getBoundView"` 归零
- [x] 9.4 运行完整门禁：`bun run typecheck`、`bun run lint`、`bun run test:foundation`、`bun run test:fgui`、`bun run test:foundation:types`、`bun run fgui validate --package Demo --strict`、`git diff --check`

## 10. 文档与最终校验

- [x] 10.1 同步 ADR-032 与架构文档（`doc/architecture/ui-store-mvvm-architecture.md`、`doc/architecture/fgui-mvvm-binding-governance.md`）：generated URL、required binder、transaction scope、Application facade、页面/Module Store 所有权与端到端清理
- [x] 10.2 运行 `openspec validate fui-runtime-binding-boundary-v1 --strict`，Expected: PASS

- [x] 审查并同步 ADR-032 的 URL、required binder、装配所有权和清理语义。

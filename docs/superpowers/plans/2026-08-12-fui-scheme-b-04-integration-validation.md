# FUI Scheme B Integration and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实 Feature assembly 注册 CloseDialog Store + Application facade，并经 AppRoot/UiHost/pageAdapter 生产链完成验收。

**Architecture:** `game_fui_demo/assembly.ts` 创建 Store 与 `CloseDialogApplication`，向组合根 registrar 注册 binder。集成测试使用 `assembleApp()` 直接产出的已接线 uiHost 与 registrar；resolver 不暴露给测试或 Feature，也不直接调用 Adapter Host 或读取绑定实例。

**Tech Stack:** Bun integration tests、Bundle registry、OpenSpec、FGUI validate。

## Global Constraints

- 遵守总计划全部约束。
- View 依赖类型中不得出现网络、存储、资源端口或匿名业务 callback。
- 删除 `getBoundView`，不保留调试兼容入口。

---

### Task 1: CloseDialog Application facade 与 Feature assembly

**Files:**

- Create: `assets/samples/game_fui_demo/assembly.ts`
- Modify: `assets/samples/game_fui_demo/view/CloseDialog.ts`
- Modify: `assets/samples/game_fui_demo/store.ts`
- Modify: `assets/samples/entry.ts`
- Modify: `tests/framework/foundation/fui-demo-integration.test.ts`
- Modify: `tests/framework/foundation/bundle-module-registration.test.ts`
- Modify: `tests/framework/foundation/bundle-module-registry.test.ts`

**Interfaces:**

- Produces: `CloseDialogApplication { confirm(): void; cancel(): void }`。
- Produces: `createCloseDialogFeature(registrar, effects)`，返回 Feature 级 Store handle、registration 与 `dispose()`。

- [ ] **Step 1: 写失败测试**

测试先 import `assets/samples/entry.ts`，使 `CloseDialog` 装饰器注册组件元数据，并从 `lookupBundle("samples")` 保存真实 descriptor/factory，但暂不安装 Feature。随后调用 `assembleApp({ fuiObjectFactory })` 取得已接线 uiHost 与 registrar：首次创建断言 required binder missing；再调用 factory 安装 Feature并用同一 assembly.uiHost 创建页面，断言成功与首次投影。

`fui-demo-integration.test.ts` 不建立新的空 Registry，直接复用当前生产 Registry：保存当前引用，import samples entry 后显式断言 `getFuiComponentRegistry().lookup(UiDemoCloseDialog)` 存在，再进入 binder missing 场景，finally 确认并恢复原引用。`fui-view.test.ts` 与 `fui-view-host.test.ts` 的局部 Registry 必须在 finally 恢复原对象，因此不会删除生产 Registry 中已由缓存 ESM 模块登记的元数据。

CloseDialog 依赖改为：

```ts
bind(deps: {
    readonly store: Store<CloseDialogState, CloseDialogAction>;
    readonly application: CloseDialogApplication;
}): void;
```

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/fui-demo-integration.test.ts`

Expected: FAIL，Feature assembly 与 Application facade 不存在。

- [ ] **Step 3: 实现 Application facade**

facade 的 `confirm/cancel` 执行外部 effect；View 点击先 dispatch 纯 UI close action，再调用 facade。effect 由 Feature assembly 参数注入，端口不进入 View。

- [ ] **Step 4: 实现 Feature assembly**

创建 Feature/Module 级 Store 与 facade，注册：

```ts
defineFuiViewBinding(UiDemoCloseDialog, CloseDialog, (view, scope) => {
    view.bind({ store, application });
});
```

页面 scope 只拥有 View 订阅和页面局部句柄，不拥有 Feature Store。`createCloseDialogFeature().dispose()` 先注销 registration，再 dispose Store。测试关闭后重新打开页面并再次 dispatch，证明未绑定已释放 Store。

删除 `store.ts` 中的 `CloseDialogStoreHandle`、`createCloseDialogStoreModule` 以及旧 Module 装配测试；`createCloseDialogFeature` 成为唯一装配入口，不保留无实际消费者的兼容层。测试必须先销毁所有打开页面，再调用 Feature dispose，保持 `FuiView.dispose -> Store.dispose` 顺序。

- [ ] **Step 5: 通过 bundle descriptor 暴露 factory**

`assets/samples/entry.ts` 导出冻结的 `SAMPLES_BUNDLE_DESCRIPTOR`，再调用 `registerBundle("samples", SAMPLES_BUNDLE_DESCRIPTOR)`；descriptor 增加 `createCloseDialogFeature`，并与 fixtures/presenters/smokes/unitNodeMappings 共存。修改 `bundle-module-registration.test.ts`：覆盖真实 `samples` 时用 `try/finally` 恢复 `SAMPLES_BUNDLE_DESCRIPTOR`。修改 `bundle-module-registry.test.ts`：通用注册测试改用唯一名 `bundle-registry-test`，不得污染真实 `samples`。

---

### Task 2: 生产链集成验收与删除 `getBoundView`

**Files:**

- Modify: `tests/framework/foundation/fui-demo-integration.test.ts`
- Modify: `assets/framework/adapters/cocos/ui/FuiViewHost.ts`

**Interfaces:**

- Produces: AppAssembly registrar 与 UiHost resolver 同源的全链路证据。

- [ ] **Step 1: 完成生产链测试**

测试不得调用 `createBoundView`、`getBoundView` 或用类型断言注入依赖。通过 `assembly.uiHost.ensurePageAdapter()`、`pageAdapter.createPage()` 和注入的 `fuiObjectFactory` 创建记录型 GComponent；断言 dispatch → project → 节点更新、confirm/cancel facade、页面关闭后重开仍可 dispatch，以及 Feature dispose。

- [ ] **Step 2: 注销后 fail-fast**

Feature dispose 后再次创建 required 页面，断言 page.disposed、错误类型正确、点击监听和 GComponent 全部回滚；Store 由 Feature dispose 释放，不声称由页面创建回滚。

- [ ] **Step 3: 删除实例提取 API**

Run: `rg "getBoundView" assets tests`

Expected before deletion: 仅函数定义。删除定义后再次运行，Expected: 0 matches。

- [ ] **Step 4: 验证**

Run: `bun test tests/framework/foundation/fui-demo-integration.test.ts tests/framework/foundation/fui-view-host.test.ts tests/framework/foundation/approot-composition.test.ts`

Expected: PASS。

Run: `bun run test:foundation`

Expected: PASS，证明 ESM 缓存与 bundle registry 顺序不污染集成测试。

---

### Task 3: 文档、OpenSpec 与最终门禁

**Files:**

- Modify: `doc/decisions/ADR-032-store-data-flow-fuiview-binding.md`
- Modify: `doc/architecture/ui-store-mvvm-architecture.md`
- Modify: `doc/architecture/fgui-mvvm-binding-governance.md`
- Modify: `openspec/changes/fui-runtime-binding-boundary-v1/tasks.md`

**Interfaces:**

- Produces: 方案 B 门禁标记为已实现，保留 Store 非重入与 gen-constants freshness 残余约束。

- [ ] **Step 1: 同步 ADR 与架构文档**

记录 generated URL、required binder、transaction scope、Application facade、页面/Module Store 所有权和端到端清理。

- [ ] **Step 2: 完成并校验 OpenSpec**

Run: `openspec validate fui-runtime-binding-boundary-v1 --strict`

Expected: PASS。

- [ ] **Step 3: 运行完整门禁**

```powershell
bun run typecheck
bun run lint
bun run test:foundation
bun run test:fgui
bun run test:foundation:types
bun run fgui validate --package Demo --strict
git diff --check
```

Expected: 全部退出码 0。

- [ ] **Step 4: 检查新增文件长度**

Run: PowerShell 统计本 change 新文件行数；Expected: 每个文件 ≤300 行。

- [ ] **Step 5: 请求独立审阅**

审阅重点：生产 registry 非空且同源；required binder 缺失 fail-fast；View 只接收 Store/facade；事务回滚无泄漏；页面和资源清理不中断；公共 API 最小。

- [ ] **Step 6: 提交（仅获授权时）**

先运行 `git status --short`、`git diff`、`git diff --cached`，只按本 change 精确文件列表暂存，不使用目录级 `git add`。

## Self-Review

- Spec coverage: Feature assembly、Application facade、生产链、required binder、回滚、清理和文档均有验收。
- Placeholder scan: 无未定义实现步骤。
- Type consistency: View 只接收 Store + `CloseDialogApplication`；binder 使用事务式 scope。

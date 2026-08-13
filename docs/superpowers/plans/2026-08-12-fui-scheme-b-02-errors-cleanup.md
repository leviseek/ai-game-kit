# FUI Scheme B Errors and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FUI 错误继承 `FrameworkError`，并把清理失败隔离覆盖到 View、GComponent、页面 Adapter、UiHost 和会话资源作用域。

**Architecture:** FUI 错误集中在 `core/fui/FuiErrors.ts`。`FuiViewCleanupError` 代替 ES2021 `AggregateError`，兼容 foundation ES2015。每层清理均逐项 try/catch，完成状态先收敛，再聚合抛出或记录。

**Tech Stack:** FrameworkError、Bun test、FairyGUI mock、ES2015 type gate。

## Global Constraints

- 遵守总计划全部约束。
- 不使用原生 `AggregateError`。
- 不保留 Registry 的旧错误 re-export。

---

### Task 1: FUI 类型化错误

**Files:**

- Create: `assets/framework/core/fui/FuiErrors.ts`
- Modify: `assets/framework/core/fui/FuiComponentRegistry.ts`
- Modify: `assets/framework/contracts/ui/FuiView.ts`
- Modify: `assets/framework/adapters/cocos/ui/FuiViewHost.ts`
- Modify: `assets/framework/index.ts`
- Modify: `tests/framework/foundation/framework-error.test.ts`
- Modify: `tests/framework/foundation/fui-view.test.ts`
- Modify: `tests/framework/foundation/fui-view-host.test.ts`
- Modify: `tests/framework/foundation/public-boundary.test.ts`

**Interfaces:**

- Internal: `FuiComponentRegistrationError`、`FuiViewBindingRegistrationError`、`FuiViewCreationError`、`FuiBindingError`。
- Public: `FuiViewCleanupError extends FrameworkError`，`errors: readonly unknown[]`。

- [ ] **Step 1: 写失败测试**

在 `framework-error.test.ts` 断言 `FuiViewCleanupError` 继承 `FrameworkError`、冻结 errors、保留首个 cause。Host 测试断言创建空组件、ctor 抛错、字段/点击缺失的错误传播规则。

规则固定为：

```text
createObject null / ctor throws -> FuiViewCreationError
field or click missing and rollback succeeds -> original FuiBindingError
rollback also fails -> FuiViewCreationError with primary + cleanup errors
```

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/framework-error.test.ts tests/framework/foundation/fui-view-host.test.ts`

Expected: FAIL，错误类不存在。

- [ ] **Step 3: 创建错误类并迁移导入**

`FuiViewCleanupError`：

```ts
export class FuiViewCleanupError extends FrameworkError {
    readonly errors: readonly unknown[];

    constructor(component: string, errors: readonly unknown[]) {
        super("FUI cleanup failed", {
            component,
            cause: errors[0],
            recoverable: false,
        });
        this.name = "FuiViewCleanupError";
        this.errors = Object.freeze([...errors]);
    }
}
```

其它错误按相同模式实现但不从根入口导出。`fui-view.test.ts` 的注册错误 import 改到 `FuiErrors.ts`；Registry 不保留兼容 re-export。

- [ ] **Step 4: 节点缺失由 seam 抛类型化错误**

`FuiViewSeam.child` 改为非可选返回。生产 seam 用 `FuiBindingError(url, nodeName, "field"|"click")`；测试 seam 缺失时同样抛错误。

- [ ] **Step 5: 验证**

Run: `bun test tests/framework/foundation/framework-error.test.ts tests/framework/foundation/fui-view.test.ts tests/framework/foundation/fui-view-host.test.ts tests/framework/foundation/public-boundary.test.ts`

Expected: PASS。

---

### Task 2: View 与 Host 清理隔离

**Files:**

- Modify: `assets/framework/contracts/ui/FuiView.ts`
- Modify: `assets/framework/adapters/cocos/ui/FuiViewHost.ts`
- Modify: `tests/framework/foundation/fui-view.test.ts`
- Modify: `tests/framework/foundation/fui-view-host.test.ts`

**Interfaces:**

- Produces: `FuiView.__own(handle: { dispose(): void }): void`。
- Behavior: View disposables 逆序全部执行；Host 始终销毁 GComponent。

- [ ] **Step 1: 写失败测试**

FuiView 注册三个 disposer，第二个抛错；断言 `third, second, first, onClose` 全部执行，最终抛 `FuiViewCleanupError`。Host 测试 View 和 GComponent 同时抛错，断言两个错误均保留。

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/fui-view.test.ts tests/framework/foundation/fui-view-host.test.ts`

Expected: FAIL，第一个异常会中断清理。

- [ ] **Step 3: 实现逆序聚合清理**

`FuiView.dispose` 先标记 disposed，再逆序执行全部 owner，最后执行 onClose；有错误抛 `FuiViewCleanupError(this.constructor.name, errors)`。Host 分别执行 View 与 GComponent dispose，最后按同一错误类汇总。

- [ ] **Step 4: 覆盖创建回滚**

增加 ctor 抛错时 GComponent 仍 dispose；binder/attach 失败时 View 与 GComponent 均清理；回滚异常不覆盖 primary error。

---

### Task 3: 页面、UiHost 与会话资源清理

**Files:**

- Modify: `assets/framework/adapters/cocos/ui/FairyGuiPageAdapter.ts`
- Modify: `assets/boot/host/UiHost.ts`
- Modify: `assets/boot/host/GameLobbyHostImpl.ts`
- Modify: `tests/framework/foundation/fairy-gui-page-adapter.test.ts`
- Modify: `tests/framework/foundation/boot-game-lobby-host.test.ts`

**Interfaces:**

- Behavior: 页面状态先标记 disposed；adapter.dispose 继续清理其它页面/容器；closeEntryPage 始终 release scope；UiHost.dispose 始终释放 navigator 与 uiScope。

- [ ] **Step 1: 写四组失败测试**

断言：View dispose 抛错后页面仍 disposed；一个页面失败不阻断其它页面/容器；`navigator.close` 与 page destroy 同时失败时 session scope.release 仍执行且两个错误均保留；resize unsubscribe 与 adapter.dispose 同时失败时 navigator.dispose 和全局 scope.release 仍执行且错误集合完整；容器 removeChild 失败不阻断其余容器清理。

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/fairy-gui-page-adapter.test.ts tests/framework/foundation/boot-game-lobby-host.test.ts`

Expected: FAIL，现有顺序会短路。

- [ ] **Step 3: 逐层实现 try/finally 与错误收集**

每层先把自身引用/状态收敛为 disposed/undefined，再逐项清理。同步 API 有错误时抛 `FuiViewCleanupError`；已有 Logger 边界按现有模式逐项记录后继续。

- [ ] **Step 4: 验证与提交（仅获授权时）**

Run: `bun test tests/framework/foundation/fui-view.test.ts tests/framework/foundation/fui-view-host.test.ts tests/framework/foundation/fairy-gui-page-adapter.test.ts tests/framework/foundation/boot-game-lobby-host.test.ts tests/framework/foundation/framework-error.test.ts`

Run: `bun run test:foundation:types`

Expected: PASS，无 `AggregateError` 类型错误。提交前检查 status/diff，只暂存本计划列出的文件。

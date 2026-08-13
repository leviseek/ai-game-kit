# FUI Scheme B Runtime Binder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供实例级、required、事务式运行时 binder，使页面只接收 Store 与 Application facade，并在失败时回滚每个已登记资源。

**Architecture:** 公共面仅暴露 binding 描述与只写 registrar；内部 registry 同时实现 resolver。Host 在 binder 前创建 `FuiViewBindingScope`，binder 每获得一个句柄立即 `scope.own`；required binder 缺失直接 fail-fast。

**Tech Stack:** TypeScript generics、Bun test、UiHost/AppRoot composition root。

## Global Constraints

- 遵守总计划全部约束。
- runtime registry 非 globalThis，不进入 ApplicationContext。
- 端口实现只注入 Application facade，不暴露给 View。

---

### Task 1: 事务式 binder registry

**Files:**
- Create: `assets/framework/core/fui/FuiViewBinderRegistry.ts`
- Modify: `assets/framework/index.ts`
- Create: `tests/framework/foundation/fui-view-binder-registry.test.ts`
- Modify: `tests/framework/foundation/public-boundary.test.ts`

**Interfaces:**
- Public: `FuiViewBindingScope`、`FuiViewBinding<V>`、`FuiViewBindingRegistrar`、`defineFuiViewBinding`。
- Internal: `FuiViewBindingResolver`、`createFuiViewBinderRegistry`。

- [ ] **Step 1: 写失败测试**

覆盖：正确 ctor；错误 ctor；重复 URL；registration dispose；binder 建立第一个 handle 后抛错时错误向上传播，已登记句柄仍留在调用方提供的受控 scope 中。Registry/resolver 不执行回滚。

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/fui-view-binder-registry.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现窄接口**

```ts
export interface FuiViewBindingScope {
    own(handle: { dispose(): void }): void;
}

export interface FuiViewBinding<V extends object> {
    readonly url: FuiComponentUrl;
    readonly ctor: new () => V;
    readonly bind: (view: V, scope: FuiViewBindingScope) => void;
}

export interface FuiViewBindingRegistrar {
    register<V extends object>(binding: FuiViewBinding<V>): { dispose(): void };
}
```

内部 resolver 的 `bindRequired(url, view, scope)` 在缺失或 ctor 不匹配时抛类型化错误；binder 抛错时原样传播（保持错误身份，Host 据此识别原始失败）。resolver 不 dispose scope；Host 是唯一回滚所有者。

- [ ] **Step 4: 公共导出最小化**

根入口只导出四个 Public 符号。`createFuiViewBinderRegistry` 与 resolver 不进根白名单，由 boot 内部深层导入。

- [ ] **Step 5: 验证**

Run: `bun test tests/framework/foundation/fui-view-binder-registry.test.ts tests/framework/foundation/public-boundary.test.ts`

Expected: PASS。

---

### Task 2: Host required binder 与事务回滚

**Files:**
- Modify: `assets/framework/adapters/cocos/ui/FuiViewHost.ts`
- Modify: `tests/framework/foundation/fui-view-host.test.ts`

**Interfaces:**
- `createBoundView(packageName, resName, componentRegistry, bindingResolver, createObject?)`。
- `createFairyGuiBoundView(bindingResolver, options?)`，`options.componentRegistry` 缺省为 `getFuiComponentRegistry()`，`options.createObject` 缺省为 `UIPackage.createObject`。

- [ ] **Step 1: 写失败测试**

`runtimeBinding: "required"` entry 无 binder 时创建失败并回滚；binder own 两个非幂等句柄后抛错时 Host 逆序各释放一次；无依赖 entry 必须显式声明 `runtimeBinding: "none"` 才能创建成功。

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/fui-view-host.test.ts`

Expected: FAIL，Host 尚不执行 required binder。

- [ ] **Step 3: 实现绑定 scope**

Host 在 `__attach` 后创建幂等 scope；`scope.own` 立即登记到底层非幂等 handle 栈。binder 成功后把 scope 作为单一 handle 转交 `view.__own`；失败时只有 Host 逆序清理 scope、View、GComponent，各底层 handle 最多执行一次。

- [ ] **Step 4: 迁移所有调用参数**

`fui-view-host.test.ts` 与 `fui-demo-integration.test.ts` 全部显式传 component registry、binding resolver、createObject，禁止可选参数错位。

---

### Task 3: assembleApp 产出已接线 UiHost

**Files:**
- Modify: `assets/boot/host/UiHost.ts`
- Modify: `assets/boot/AppRoot.ts`
- Modify: `tests/framework/foundation/boot-game-lobby-host.test.ts`
- Modify: `tests/framework/foundation/approot-composition.test.ts`

**Interfaces:**
- `UiHostDeps` 接收 internal resolver 与可选 `FuiObjectFactory` 测试接缝。
- `AppAssembly` 直接返回已接线 `uiHost` 和 public `fuiViewBindingRegistrar`；resolver 保持 assembleApp 内部局部值。
- `assembleApp(options?: { fuiObjectFactory?: FuiObjectFactory })` 仅允许测试覆盖对象创建；生产无参调用使用 `UIPackage.createObject`。

- [ ] **Step 1: 写生产接线失败测试**

`assembleApp({ fuiObjectFactory })` 直接产出 `uiHost`，通过该 host 的 pageAdapter.createPage 创建 required 页面；未注册 binder 时 page.disposed 且 error 为 runtime binding missing。两次 assembly 的 registrar 实例隔离。`AppRoot.onLoad` 测试断言直接使用 `assembly.uiHost`，源码中不再重复调用 `createUiHost`。

- [ ] **Step 2: 运行红灯**

Run: `bun test tests/framework/foundation/approot-composition.test.ts tests/framework/foundation/boot-game-lobby-host.test.ts`

Expected: FAIL，AppAssembly/UiHost 尚无 binder 接缝。

- [ ] **Step 3: 实现组合根接线**

`assembleApp` 创建单一 registry，以 resolver 创建 UiHost，以 registrar 暴露 Feature 安装接缝；`UiHost.ensurePageAdapter` 调用 `createFairyGuiBoundView(this.resolver, { createObject: this.fuiObjectFactory })`。AppRoot 只保存返回的 uiHost，不重复装配。不得注册业务端口。

- [ ] **Step 4: 验证与提交（仅获授权时）**

Run: `bun run test:foundation && bun run test:foundation:types`

Expected: PASS。提交前检查 status/diff，只暂存本计划列出的文件。

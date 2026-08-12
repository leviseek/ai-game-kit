# FUI Scheme B OpenSpec and URL Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立独立 OpenSpec change，并让 FUI 组件元数据、Registry 与 Host 全链路使用生成 URL 契约。

**Architecture:** `FuiComponentUrl` 是 `ui://包/组件` 模板字面量；业务装饰器消费 `ui/generated` 常量，Adapter 仅通过单一内部工厂从 package/resName 构造 URL。

**Tech Stack:** OpenSpec、TypeScript decorators、Bun test、FGUI 生成常量。

## Global Constraints

- 遵守总计划全部约束。
- 不保留旧三参数 `FUIBind` 兼容重载。
- 不修改生成文件内容或 `gen-constants` 格式。

---

### Task 1: 创建 OpenSpec change

**Files:**
- Create: `openspec/changes/fui-runtime-binding-boundary-v1/proposal.md`
- Create: `openspec/changes/fui-runtime-binding-boundary-v1/design.md`
- Create: `openspec/changes/fui-runtime-binding-boundary-v1/tasks.md`
- Create: `openspec/changes/fui-runtime-binding-boundary-v1/specs/fui-view-binding/spec.md`
- Create: `openspec/changes/fui-runtime-binding-boundary-v1/specs/fgui-type-codegen/spec.md`
- Create: `openspec/changes/fui-runtime-binding-boundary-v1/specs/framework-diagnostics/spec.md`

**Interfaces:**
- Produces: 已校验 change，覆盖 URL、required runtime binding、事务式 scope、端到端清理和 ADR 检查。

- [ ] **Step 1: 使用 `openspec-propose` 创建 change**

Proposal 明确：

```markdown
Goals: generated URL binding; required instance-scoped runtime binder; transactional binding scope; typed FUI errors; end-to-end cleanup isolation.
Non-Goals: no EventBus; no Store redesign; no gen-constants freshness; no migration beyond CloseDialog demonstration.
```

- [ ] **Step 2: 写入 delta spec 场景**

```markdown
- @FUIBind consumes a generated ui:// package/resource constant.
- A component explicitly declares whether runtime binding is required.
- Missing required binding fails creation and rolls back View, listeners and GComponent.
- Runtime binder receives a scope and registers every acquired handle immediately.
- Ports are injected into Application facade only; View receives Store and facade.
- View, page adapter, UiHost and session resource cleanup attempt every step and report all failures.
```

- [ ] **Step 3: 在 tasks.md 末尾加入 ADR 检查**

```markdown
- [ ] 审查并同步 ADR-032 的 URL、required binder、装配所有权和清理语义。
```

- [ ] **Step 4: 校验**

Run: `openspec validate fui-runtime-binding-boundary-v1 --strict`

Expected: PASS，0 errors。

- [ ] **Step 5: 提交（仅获授权时）**

先运行 `git status --short`、`git diff`，只暂存上述 change 文件。

---

### Task 2: URL 契约贯穿绑定链

**Files:**
- Modify: `assets/framework/core/fui/FuiBindings.ts`
- Modify: `assets/framework/core/fui/FuiComponentRegistry.ts`
- Modify: `assets/framework/adapters/cocos/ui/FuiViewHost.ts`
- Modify: `assets/framework/index.ts`
- Modify: `assets/samples/game_fui_demo/view/CloseDialog.ts`
- Modify: `tests/framework/foundation/fui-view.test.ts`
- Modify: `tests/framework/foundation/fui-view-host.test.ts`
- Modify: `tests/framework/foundation/contracts.typecheck.ts`
- Modify: `tests/framework/foundation/public-boundary.test.ts`

**Interfaces:**
- Produces: `FuiComponentUrl = \`ui://${string}/${string}\``。
- Produces: internal `createFuiComponentUrl(packageName, componentName): FuiComponentUrl`。
- Produces: `FUIBind(url, fields, options)`，其中 `options.runtimeBinding: "required" | "none"` 必填。

- [ ] **Step 1: 写失败测试**

先把 `fui-view.test.ts` 与 `fui-view-host.test.ts` 的 Registry 隔离 helper 改为保存并恢复 `globalThis["__ai_game_kit_fui_components__"]` 原对象；禁止测试结束后无条件 delete，以免删除已由其它 ESM 模块登记的生产组件元数据。

```ts
const LOGIN_VIEW_URL = ("ui" + "://Login/LoginView") as FuiComponentUrl;

@FUIBind(LOGIN_VIEW_URL, fields, { runtimeBinding: "required" })
class LoginView extends FuiView<LoginState, LoginViewShape> { /* 现有类体 */ }
```

在 `contracts.typecheck.ts` 增加真实 tsc 门禁：`FuiComponentRegistry.register/lookup` 只接收 `FuiComponentUrl`；非 `ui://包/组件` 字符串用 `@ts-expect-error` 断言拒绝；不传第三参数的 `FUIBind(TEST_URL, fields)` 用 `@ts-expect-error` 断言拒绝；entry 记录 `runtimeBinding`。

Run: `bun test tests/framework/foundation/fui-view.test.ts tests/framework/foundation/fui-view-host.test.ts`

Run: `bun run test:foundation:types`

Expected: 两条命令均 FAIL；类型门禁报告旧 Registry 仍接受 string、旧 FUIBind 不要求显式策略，或新类型尚不存在。

- [ ] **Step 2: 实现 URL 与元数据 API**

```ts
export type FuiComponentUrl = `ui://${string}/${string}`;

export interface FuiBindOptions {
    readonly runtimeBinding: "required" | "none";
}
```

`FUIBind` 直接把 URL 和必填 `runtimeBinding` 写入组件 Registry。Registry 的 `register/lookup` 参数改为 `FuiComponentUrl`。

- [ ] **Step 3: Host 单点构造 URL**

`FuiViewHost.ts` 内部只调用一次 `createFuiComponentUrl(packageName, resName)`，后续 Registry、错误和 binder 均复用该值，不散落类型断言。

- [ ] **Step 4: 迁移 CloseDialog**

```ts
import { UiDemoCloseDialog } from "../../../ui/generated/ui-demo";

@FUIBind(UiDemoCloseDialog, CloseDialogFields, { runtimeBinding: "required" })
```

- [ ] **Step 5: 收窄公共导出**

根入口只新增 `FuiComponentUrl` 和 `FuiBindOptions` 类型；internal URL 工厂不导出。同步 `expectedRootExports`。

- [ ] **Step 6: 验证**

Run: `bun test tests/framework/foundation/fui-view.test.ts tests/framework/foundation/fui-view-host.test.ts tests/framework/foundation/public-boundary.test.ts`

Run: `bun run typecheck`

Run: `bun run test:foundation:types`

Expected: 全部 PASS。

Run: `rg '@FUIBind\(\s*["'']' assets tests`

Expected: 0 matches，不再有裸字符串首参数。

- [ ] **Step 7: 提交（仅获授权时）**

检查 status/diff 后只暂存本 Task 列出的文件。

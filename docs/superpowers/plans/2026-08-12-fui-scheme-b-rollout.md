# FUI Scheme B Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐方案 B 的类型安全页面装配、生成 URL 绑定、FUI 类型化错误和清理失败隔离，使新静态业务页可以只注入 Store 与 Use Case/Application facade。

**Architecture:** 保留 `@FUIBind` 的类定义期组件注册与 `FuiViewHost` 包装器模式，新增实例级 `FuiViewBinderRegistry` 承载运行时依赖。组件 URL 直接消费 `ui/generated` 常量；端口实现只注入 Use Case；FuiView 与 Host 按逆序逐项清理并聚合错误。

**Tech Stack:** TypeScript 5.9 strict、Bun 1.x、Cocos Creator 3.8.8、FairyGUI Adapter、OpenSpec。

## Global Constraints

- 注释使用简体中文；标识符、API 名、错误消息和路径保持英文。
- 不引入第三方运行时依赖。
- 新增文件不得超过 300 行。
- 游戏层不得导入 `cc`、`fairygui-cc` 或 Cocos Adapter。
- 不引入全局 EventBus、Service Locator 或运行时业务依赖单例。
- reducer 保持同步纯函数；页面只接收 Store 与 Use Case/Application facade。
- 生成文件禁止手改；本计划不修改 FGUI XML、`.bin` 或 atlas。
- 实现前创建独立 OpenSpec change；产生的新决策同步 ADR-032 与架构文档。
- 所有提交步骤仅在用户明确授权 Git 提交时执行。

---

## Plan Map

1. [OpenSpec 与 URL 绑定 API](./2026-08-12-fui-scheme-b-01-openspec-url-binding.md)
2. [FUI 错误与清理失败隔离](./2026-08-12-fui-scheme-b-02-errors-cleanup.md)
3. [类型安全运行时页面装配](./2026-08-12-fui-scheme-b-03-runtime-binder.md)
4. [示范页迁移与最终门禁](./2026-08-12-fui-scheme-b-04-integration-validation.md)

## Dependency Order

```text
OpenSpec
  -> FUIBind(URL constant)
  -> typed FUI errors
  -> cleanup isolation
  -> FuiViewBinderRegistry
  -> UiHost/AppRoot composition seam
  -> CloseDialog integration migration
  -> full verification and ADR/docs sync
```

## File Structure

- `assets/framework/core/fui/FuiErrors.ts`: FUI 注册、创建、绑定与清理错误。
- `assets/framework/core/fui/FuiViewBinderRegistry.ts`: 实例级运行时页面 binder registrar/resolver。
- `assets/framework/core/fui/FuiBindings.ts`: `@FUIBind(url, fields)` 元数据 API。
- `assets/framework/contracts/ui/FuiView.ts`: 绑定字段、订阅和清理所有权。
- `assets/framework/adapters/cocos/ui/FuiViewHost.ts`: Adapter 创建、binder 执行、回滚和引擎销毁。
- `assets/boot/host/UiHost.ts`: 从组合根接收 binder registry 并接入页面创建闭包。
- `assets/boot/AppRoot.ts`: 创建实例级 binder registry，不注册业务端口到 View。
- `assets/samples/game_fui_demo/view/CloseDialog.ts`: 使用生成 URL 常量。
- `tests/framework/foundation/`: 单元、Host 和全链路回归测试。

## Completion Gate

Run:

```powershell
bun run typecheck
bun run lint
bun test tests/framework/foundation/fui-view.test.ts tests/framework/foundation/fui-view-host.test.ts tests/framework/foundation/fui-demo-integration.test.ts tests/framework/foundation/framework-error.test.ts
bun run test:foundation
bun run test:fgui
bun run test:foundation:types
bun run fgui validate --package Demo --strict
git diff --check
```

Expected: 所有命令退出码为 0；新集成测试不再调用 `getBoundView` 或执行类型断言来注入依赖。

## Self-Review

- Spec coverage: URL 归口、错误类型化、清理隔离、运行时 binder、UiHost 接入、示范页迁移和 ADR/docs 均有对应子计划。
- Scope: 不实现 `gen-constants` freshness，不迁移其它存量页，不增加异步框架或 EventBus。
- Type consistency: 四个子计划统一使用公开 `FuiViewBindingRegistrar`/`FuiViewBindingScope`/`FuiViewBinding` 与内部 `FuiViewBindingResolver`；registry factory 和 resolver 不进入根公共 API。

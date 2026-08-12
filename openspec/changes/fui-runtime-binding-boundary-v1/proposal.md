## Why

FUI 绑定链路目前存在三类边界缺口：组件 URL 由 `@FUIBind(packageName, componentName, ...)` 自行拼接裸字符串，拼错或资源改名即静默断裂；页面运行期依赖（Store、Use Case 端口）经匿名业务回调传入 View，无实例级、required 的事务式装配；View/GComponent/页面 Adapter/UiHost/会话资源清理遇首个异常即短路，失败不可聚合诊断。

## What Changes

- `FUIBind` 首参数改为 `FuiComponentUrl`（`ui://<包>/<组件>` 模板字面量），直接消费 `ui/generated` 生成常量；新增必填 `options.runtimeBinding: "required" | "none"`，注册表 `register/lookup` 以 `FuiComponentUrl` 为键，移除裸字符串拼接（**BREAKING**，不保留旧三参数重载）。
- 新增 `FuiViewBinderRegistry`（实例级、非 globalThis、不进 ApplicationContext）：公共面暴露 `FuiViewBindingScope`/`FuiViewBinding`/`FuiViewBindingRegistrar`/`defineFuiViewBinding`，内部 resolver `bindRequired` 缺失即 fail-fast。
- Host 创建页面时先建事务式 scope：binder 每获得一个句柄立即 `scope.own`；binder 抛错时由 Host 逆序回滚 scope/View/GComponent；required 组件缺 binder 创建失败并标记页面 disposed。
- 端口注入只到 Application facade：View 依赖仅含 Store 与 Application facade（Use Case 端口），网络/存储/资源端口与匿名业务回调不进入 View。
- 新增类型化 FUI 错误（`core/fui/FuiErrors.ts`）：公共导出 `FuiViewCleanupError extends FrameworkError`（含冻结 `errors` 数组），替代 ES2021 `AggregateError`；注册/创建/绑定错误内部化，Registry 不保留旧 re-export。
- 端到端清理失败隔离：View、页面 Adapter、UiHost、会话资源作用域每层先收敛 disposed 状态再逐项清理，单步失败不阻断后续步骤，结束时聚合报告全部失败；重复清理幂等。
- 示范迁移：CloseDialog 使用生成 URL 常量 + Feature assembly（`createCloseDialogFeature(registrar, effects)`）装配 Store 与 facade，作为唯一装配入口；删除 `getBoundView` 调试入口。
- 收窄根入口公共导出：仅新增 `FuiComponentUrl`/`FuiBindOptions` 与 binder 四个公共符号；internal URL 工厂与 resolver 不导出。

## Goals / Non-Goals

**Goals:** generated URL binding；required instance-scoped runtime binder；transactional binding scope；typed FUI errors；end-to-end cleanup isolation。

**Non-Goals:** no EventBus；no Store redesign；no gen-constants freshness；no migration beyond CloseDialog demonstration。

## Capabilities

### New Capabilities

- `fui-view-binding`: 绑定链的 URL 契约（生成常量消费）、required runtime binding 声明、事务式绑定作用域与回滚、端口只注入 Application facade。
- `fgui-type-codegen`: 生成 URL 常量以 `FuiComponentUrl` 形态作为绑定链唯一 URL 契约。
- `framework-diagnostics`: 类型化 FUI 错误（继承 FrameworkError）与 View/Adapter/UiHost/会话资源端到端清理失败隔离。

## Impact

- **assets/framework/core/fui**: `FuiBindings.ts`（FUIBind 签名与 URL 类型）、`FuiComponentRegistry.ts`（FuiComponentUrl 键）、新增 `FuiErrors.ts`、新增 `FuiViewBinderRegistry.ts`。
- **assets/framework/contracts/ui**: `FuiView.ts` 新增 `__own` 清理所有权与逆序聚合 dispose。
- **assets/framework/adapters/cocos/ui**: `FuiViewHost.ts` 单点构造 URL、required binder 执行与事务回滚、清理聚合；`FairyGuiPageAdapter.ts` 清理隔离。
- **assets/framework/index.ts**: 根白名单与 `expectedRootExports` 同步收窄/新增。
- **assets/boot**: `AppRoot.ts`/`UiHost.ts` 从组合根接收 resolver/registrar，产出已接线 uiHost；`GameLobbyHostImpl` 清理隔离。
- **assets/samples/game_fui_demo**: `CloseDialog.ts` 迁移生成 URL 常量与 facade 依赖，新增 `assembly.ts` Feature 装配；`store.ts` 收敛为单一装配入口。
- **tests/framework/foundation**: 失败测试先行（fui-view / fui-view-host / binder-registry / framework-error / page-adapter / boot-host / approot-composition / fui-demo-integration / contracts.typecheck / public-boundary）。
- **docs**: 同步 ADR-032 与架构文档（URL、required binder、装配所有权、清理语义）。

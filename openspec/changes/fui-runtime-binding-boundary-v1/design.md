## Context

现状（见 proposal.md - Why 与 specs）：
- `@FUIBind(packageName, componentName, fields)` 在类定义期自行拼接 `ui://${包}/${组件}` 裸字符串并登记 `FuiComponentRegistry`（globalThis 单例，ADR-032 C-14），Registry 的 `register/lookup` 以 string 为键。
- `FuiViewHost.createFairyGuiBoundView()` 按「包+组件名」组合闭包：命中注册表则创建 GComponent + 注入字段，未命中回退 `createFairyGuiView`。
- 页面运行期依赖经 `bind(store, callbacks)` 匿名回调传入示范页，非实例级、非 required、不可事务回滚。
- 错误：`FuiComponentRegistrationError` 定义在 Registry 内；清理遇首个异常即短路（无聚合）。
- 约束：fgui/cc 类型只在 `adapters/cocos/ui/` 边界；生成产物禁止手改；仓库禁运行时依赖；装饰器 legacy 语义；ES2015 目标禁用原生 `AggregateError`；根公共导出白名单受 `public-boundary.test.ts` 约束。

## Goals / Non-Goals

**Goals:**
- 绑定链 URL 类型贯穿：`FuiComponentUrl` 模板字面量，`@FUIBind` 消费 `ui/generated` 常量，Registry/Host/错误全部复用同一 URL 值。
- 实例级 required 运行时 binder：组件显式声明 `runtimeBinding`，required 缺 binder 创建即 fail-fast。
- 事务式绑定作用域：binder 每获得句柄立即登记，失败时由 Host 逆序完整回滚。
- 类型化 FUI 错误 + 端到端清理失败隔离：单步失败不短路，聚合报告全部失败。
- 端口注入只到 Application facade；View 依赖仅 Store + facade。

**Non-Goals:**
- 不引入 EventBus、不重设计 Store、不做 `gen-constants` freshness 校验、不迁移 CloseDialog 之外的存量页（双轨共存延续 ADR-032 C-12）。

## Decisions

### D1: URL 契约贯穿绑定链（`FuiComponentUrl` 模板字面量）

`export type FuiComponentUrl = \`ui://${string}/${string}\``；`FUIBind(url, fields, options)` 直接接收生成常量。Registry `register/lookup` 参数改为 `FuiComponentUrl`。`FuiViewHost` 内部只调用一次 internal `createFuiComponentUrl(packageName, resName)`，后续 Registry 查询、错误与 binder 复用该值。备选：保留三参数重载（违反总计划约束，不保留旧重载）；错误定位时临时拼接（散落类型断言，违背单一来源）。

### D2: 错误集中于 `core/fui/FuiErrors.ts`

`FuiViewCleanupError extends FrameworkError` 公共导出（携带 component 上下文、`cause: errors[0]`、冻结 `errors` 数组），替代 ES2021 `AggregateError`（ES2015 类型门禁）。`FuiComponentRegistrationError`/`FuiViewBindingRegistrationError`/`FuiViewCreationError`/`FuiBindingError` 内部化，Registry 删除旧 re-export。节点缺失由 seam `child` 抛 `FuiBindingError(url, nodeName, "field"|"click")`（非可选返回）。备选：留在各文件内（错误语义分散、无法统一聚合）；用 AggregateError（破坏 ES2015 门禁）。

### D3: 清理失败隔离——先收敛状态，再逐项聚合

每层清理先把自身引用/状态收敛为 disposed/undefined，再逐项执行（View disposables 逆序、onClose 最后；Host 分别 dispose View 与 GComponent；页面/容器/UiHost/会话资源逐层 try/finally）。同步 API 有错误抛 `FuiViewCleanupError` 聚合；已有 Logger 边界按现有「逐项记录后继续」模式。重复清理幂等。回滚异常不覆盖 primary error（primary 优先，cleanup 错误并入聚合）。备选：首异常即抛（现有短路行为，失败不可见）。

### D4: 实例级 binder registry（非 globalThis、不进 ApplicationContext）

`FuiViewBinderRegistry` 承载运行时依赖装配。公共面（root 导出）：`FuiViewBindingScope`（`own(handle)`）、`FuiViewBinding<V>`（url/ctor/bind）、`FuiViewBindingRegistrar`（`register` 返回 registration dispose）、`defineFuiViewBinding`。内部：`FuiViewBindingResolver.bindRequired(url, view, scope)` 缺失/ctor 不匹配/binder 抛错时抛类型化错误，但**不 dispose scope**——Host 是唯一回滚所有者。`createFuiViewBinderRegistry` 由组合根创建并经内部深层导入传入 UiHost；不进 ApplicationContext（ADR 约束：不退化 Service Locator）。备选：binder 进 globalThis（跨 assembly 实例泄漏）；进 ApplicationContext（提供解析入口，违反约束）。

### D5: 事务式 scope 的转交与回滚

Host 在 `__attach` 后创建幂等 scope；`scope.own` 立即登记到底层非幂等 handle 栈。binder 成功后把 scope 作为单一 handle 转交 `view.__own`（View 逆序清理，含 onClose）；binder 失败时只有 Host 逆序清理 scope → View → GComponent，各底层 handle 至多执行一次。required 组件缺 binder：创建失败并回滚，页面标记 disposed。

### D6: 端口只注入 Application facade

Feature assembly（`createCloseDialogFeature(registrar, effects)`）创建 Feature/Module 级 Store 与 `CloseDialogApplication`（confirm/cancel 执行外部 effect），以 `defineFuiViewBinding` 注册 binder：`view.bind({ store, application })`。端口与 effect 由 assembly 注入，不进入 View。页面 scope 只拥有 View 订阅与页面局部句柄，不拥有 Feature Store；`feature.dispose()` 先注销 registration 再 dispose Store。View 依赖类型 SHALL 不含网络/存储/资源端口或匿名业务回调。

### D7: assembleApp 产出已接线 UiHost

`assembleApp(options?)` 创建单一 binder registry，以 resolver 创建 UiHost、以 registrar 暴露 Feature 安装接缝，直接返回已接线 `uiHost` 与 public `fuiViewBindingRegistrar`；resolver 保持 assembleApp 内部局部值。`options.fuiObjectFactory` 仅供测试覆盖对象创建。`AppRoot.onLoad` 使用 `assembly.uiHost`，不再重复调用 `createUiHost`。删除 `getBoundView`（不留调试兼容入口）。

## Risks / Trade-offs

- **装饰器注册期与 binder 装配期分离** → required 声明在创建期 fail-fast，错误携带 URL 与 missing 语义；`runtimeBinding` 编译期必填防漏声明。
- **清理语义变化**（首异常短路 → 聚合）→ 错误规则写进测试固定（createObject null/ctor 抛错 → `FuiViewCreationError`；回滚成功 → 原 `FuiBindingError`；回滚也失败 → `FuiViewCreationError` 含 primary + cleanup 错误），避免调用方依赖旧语义。
- **runtime registry 不暴露给 View** → resolver 经组合根内部传递，公共面仅 registrar/scope/binding 四个符号，白名单测试守护。
- **`framework-diagnostics` 与既有 `diagnostics` 能力边界** → 新能力聚焦 FUI 清理聚合与错误继承，不与既有通用错误/脱敏能力重叠；归档时作为独立能力落主 spec。
- **gen-constants freshness 非目标** → 本 change 不扩展该校验，URL 常量过期风险沿用既有 validate 体系，写入 Non-Goals 防范围蔓延。
- **示范页迁移破坏测试缓存**（ESM 模块缓存登记的元数据）→ 测试改用「保存/恢复全局注册表引用」，不无条件 delete。

## Migration Plan

1. URL 契约贯穿绑定链：`FuiComponentUrl` + `FUIBind(url, fields, options)` + Host 单点构造 + CloseDialog 迁移 + 收窄导出。
2. FUI 类型化错误：`FuiErrors.ts` + 错误导入迁移 + seam 类型化抛错。
3. View/Host 清理隔离：`__own` 逆序聚合 + 创建回滚。
4. 页面/会话/UiHost 清理隔离：Adapter/UiHost/GameLobbyHost 逐层 try/finally 聚合。
5. 事务式 binder registry：窄接口 + 公共导出最小化。
6. Host required binder 与事务回滚；assembleApp 接线 UiHost/registrar。
7. CloseDialog Feature assembly + 生产链集成验收 + 删除 `getBoundView`。
8. 同步 ADR-032 与架构文档；最终门禁（typecheck/lint/foundation/fgui/types/validate）。

回滚：各步独立可回退；required 缺 binder 默认 fail-fast，未迁移存量页不受影响；`runtimeBinding` 编译期必填保证迁移期不漏。

## Open Questions

无（关键决策均已在 D1–D7 确定；端口类型族的后续扩展不改变 spec/approach/task 拆分）。

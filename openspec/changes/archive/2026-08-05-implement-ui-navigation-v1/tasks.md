## 1. UI 导航模型契约与测试

- [x] 1.1 先编写导航契约与测试，覆盖页面栈、重复打开策略、返回、弹窗遮罩、层级和页面作用域清理。
  - 新增 `tests/framework/foundation/ui-navigation.test.ts`：页面打开入栈、栈顶变化；重复打开策略（focus-existing/reject/allow-stack 三选一）各自行为；空栈返回/关闭被拒绝；七层层级 `scene/normal/popup/guide/toast/loading/system` 覆盖关系；popup 关闭返回父层可交互；声明阻断页面成为栈顶时进入模态、关闭后收敛；页面关闭逆序释放订阅与资源、重复关闭幂等、导航 dispose 后拒绝新请求。
  - 红期确认：`bun test tests/framework/foundation/ui-navigation.test.ts` 因 `core/ui/UiNavigator` 模块不存在而失败（0 pass / 1 fail，Cannot find module，feature missing 而非 typo）。
  - 测试锁定 API 形状：`createUiNavigator({ duplicatePolicy })` 返回 `{ pages, top, modal, open, close, back, dispose }`；`open(route, { layer, blocking })` 返回 `{ ok, page?, reason? }`；页面持有 `addDisposable`/`disposed`，关闭时逆序释放。
- [x] 1.2 实现引擎无关的 `contracts/ui` 与 `core/ui` 导航模型，使 1.1 的测试通过且不依赖 Cocos。
  - 新增 `contracts/ui/Navigation.ts`（`UiLayer`/`DuplicateOpenPolicy`/`UiPage`/`UiResult` 契约 + `UI_LAYER_ORDER` 层级顺序常量，仅类型导入 `core/scheduling` 的 `DisposeHandle`）与 `core/ui/UiNavigator.ts`（单一页面栈 + 层级字段 + 模态状态推导），重复打开策略在建立时锁定，页面作用域契约提供关闭释放入口。
  - 实现行为：`open`/`focus-existing` 均按 `UI_LAYER_ORDER` 层级插入（层高页面在上、同层后开在上），保证层级覆盖关系与打开顺序无关；`modal` 由栈顶 `blocking` 推导；`close(pageId?)` 缺省关闭栈顶、重复关闭幂等；`dispose` 逆序释放全部页面并使后续请求返回 `{ ok: false, reason: "disposed" }`。
  - 验证：`ui-navigation.test.ts` 17 pass（含补写的层级插入测试——先 RED 确认再实现转绿），`bun run test:foundation` 全量通过。
- [x] 1.3 补充依赖边界检查，验证 `framework/core/ui` 与 `framework/contracts/ui` 不导入 `cc`、导航契约不依赖具体实现。
  - `public-boundary.test.ts` 新增 2 项：`keeps ui contracts free of core implementations and Cocos`（`skipIf` contracts/ui 不存在时跳过，扫描 `contracts/ui` 无 `core/ui` 与 `cc` 导入）、`keeps the ui core layer engine-agnostic and free of service locators`（`core/ui` 无 `cc`/`getInstance`/`singleton`/`ServiceLocator`/`globalThis`/`window`）。边界测试 22 pass。

## 2. 根入口收口与门禁

- [x] 2.1 根入口白名单导出导航模型稳定契约与工厂，实现细节保持内部。
  - `assets/framework/index.ts` 新增导出：`UiLayer`/`DuplicateOpenPolicy`/`UiPage`/`UiResult`（契约类型）、`UI_LAYER_ORDER`（层级常量）、`UiNavigator`/`UiNavigatorOptions`（导航接口）+ `createUiNavigator`（核心工厂）；`public-boundary.test.ts` 的 `expectedRootExports` 白名单同步新增 8 个符号。
- [x] 2.2 运行完整 Bun foundation 测试、Foundation strict 类型检查与依赖边界检查，记录测试数量与零失败结果。
  - 完整 `bun run test:foundation` → **410 pass / 0 fail**（47 文件，1349 expect calls；顶部红色块为 `scheduler-reentrancy.test.ts` 故意抛错的失败隔离用例，属预期）。
  - strict 类型检查：`bun run test:foundation:types` → **0 diagnostics，EXIT 0**。
  - 依赖边界检查：`public-boundary.test.ts` → **22 pass / 0 fail**（含新增 2 项 UI 边界测试与全量 import 扫描）。

## 3. 收口与 ADR 检查

- [x] 3.1 审查导航模块公开入口，移除不必要导出，并用依赖检查证明其他模块没有深层导入。
  - 冗余导出审查：`UiNavigator.ts` 定义但未使用的 `NOOP_HANDLE` 常量与文件尾 `export { NOOP_HANDLE, UI_LAYER_ORDER }` re-export 已移除（`UI_LAYER_ORDER` 由 index.ts 直接从 `contracts/ui` 导出，`NOOP_HANDLE` 无消费者）；`DisposeHandle` 类型导入保留（供 `addDisposable` 签名使用）。
  - 依赖检查证明：`public-boundary.test.ts` 全量 import 扫描通过（`keeps all current asset imports within architecture boundaries`），`expectedRootExports` 白名单含 8 个导航符号，无深层导入泄漏。
  - 验证：`bun run test:foundation:types` 0 diagnostics，`public-boundary.test.ts` 22 pass。
  - **归档前审查修复（ai-sensei，gpt-5.6-sol high）**：终审发现 3 项阻塞项并已全部修复——(1) R1 focus-existing 跨层提升语义与文档不符：修正 design.md 决策 3、ADR-010 决策 2 与 `DuplicateOpenPolicy` 注释为"提升到其层级内的最高位置（受层级覆盖约束）"，并新增 2 个跨层 focus 测试锁定 top/modal 按层级契约推导；(2) R2 测试文件幽灵类型导入（`UiOpenResult` TS2305、`UiPage` TS2459）：改为从 `contracts/ui` 导入 `UiResult`/`UiPage`，经 Cocos tsc 单独验证仅剩 `bun:test` 环境声明缺失（属门禁既有范围外）；(3) R3 spec"关闭失败隔离上报"未实现：`UiNavigatorOptions` 增加 `onError`，页面与导航释放循环 try/catch 隔离失败并上报，新增 5 个测试（抛错 disposable 不中断其余项/其余页面、dispose 后 close/back 拒绝、关闭后 addDisposable no-op、关闭非栈顶页面）。
- [x] 3.2 ADR 检查：本次实现是否产生新的长期架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR，如无则明确记录无需 ADR。
  - **产生新的长期架构决策，已创建 `doc/decisions/ADR-010-ui-navigation-layer-contract.md`**（标题 UI Navigation Layer Contract and Stack Semantics）。
  - ADR-010 记录 4 项决策：(1) 单一页面栈 + 按层级插入（`UI_LAYER_ORDER` 常量固定七层顺序，插入位置与打开顺序无关）；(2) 重复打开策略建立时全局锁定三选一（`focus-existing`/`reject`/`allow-stack`）；(3) 模态状态由栈顶 `blocking` 页面统一推导，导航只暴露状态不执行真实拦截；(4) 页面作用域按登记逆序释放、重复关闭幂等，为 FairyGUI Adapter 资源联动预留入口。
  - 判断依据（对齐 ADR-006 背景逻辑）：按层级插入是反直觉核心行为，未来重构若改成 push 会无感改变层级覆盖；重复打开策略、模态推导与页面作用域释放均为长期公开 API 语义，影响输入阻断与资源所有权接缝。
  - 与既有 ADR 关系：Framework UI Layer 职责与七层层级属总计划设计决策 7 的落地，本 ADR 只记录引擎无关导航语义（不重复总计划）；页面作用域复用 `DisposeHandle` 语义属既有 ADR 落地。
  - 仅 tasks 记录、不成 ADR 的项：根入口白名单具体导出项、`skipIf` 边界测试细节、`core/ui` 目录组织选择（`ui-layer` 目录未采纳的原因记于 design.md）。
- [x] 3.3 归档时同步总计划 `create-game-framework-v1` 第 6 节 6.1/6.2 任务的完成状态与证据。
  - 已同步 `openspec/changes/create-game-framework-v1/tasks.md` 第 6 节 6.1/6.2 标记完成，并逐条记录对应 change 任务与证据（UI 导航测试、导航模型与层级契约、根入口收口、依赖边界、410 pass / 0 fail、ADR-010）。

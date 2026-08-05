## 1. UI 导航模型契约与测试

- [ ] 1.1 先编写导航契约与测试，覆盖页面栈、重复打开策略、返回、弹窗遮罩、层级和页面作用域清理。
  - 新增 `tests/framework/foundation/ui-navigation.test.ts`：页面打开入栈、栈顶变化；重复打开策略（focus-existing/reject/allow-stack 三选一）各自行为；空栈返回/关闭被拒绝；七层层级 `scene/normal/popup/guide/toast/loading/system` 覆盖关系；popup 关闭返回父层可交互；声明阻断页面成为栈顶时进入模态、关闭后收敛；页面关闭逆序释放订阅与资源、重复关闭幂等、导航 dispose 后拒绝新请求。
  - 红期确认：`bun test tests/framework/foundation/ui-navigation.test.ts` 因 `core/ui` 模块不存在而失败。
- [ ] 1.2 实现引擎无关的 `contracts/ui` 与 `core/ui` 导航模型，使 1.1 的测试通过且不依赖 Cocos。
  - 新增 `contracts/ui/Navigation.ts`（UiLayer/RouteId/UiPageDescriptor/UiOpenResult 等契约）与 `core/ui/UiNavigator.ts`（单一页面栈 + 层级字段 + 模态状态推导），重复打开策略在建立时锁定，页面作用域契约提供关闭释放入口。
- [ ] 1.3 补充依赖边界检查，验证 `framework/core/ui` 与 `framework/contracts/ui` 不导入 `cc`、导航契约不依赖具体实现。

## 2. 根入口收口与门禁

- [ ] 2.1 根入口白名单导出导航模型稳定契约与工厂，实现细节保持内部。
  - `assets/framework/index.ts` 新增导出导航契约类型与 `createUiNavigator` 工厂；`public-boundary.test.ts` 同步更新 `expectedRootExports` 白名单。
- [ ] 2.2 运行完整 Bun foundation 测试、Foundation strict 类型检查与依赖边界检查，记录测试数量与零失败结果。
  - 完整 `bun run test:foundation`、`bun run test:foundation:types`（0 diagnostics）与 `public-boundary.test.ts` 全部通过。

## 3. 收口与 ADR 检查

- [ ] 3.1 审查导航模块公开入口，移除不必要导出，并用依赖检查证明其他模块没有深层导入。
- [ ] 3.2 ADR 检查：本次实现是否产生新的长期架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR，如无则明确记录无需 ADR。
- [ ] 3.3 归档时同步总计划 `create-game-framework-v1` 第 6 节 6.1/6.2 任务的完成状态与证据。

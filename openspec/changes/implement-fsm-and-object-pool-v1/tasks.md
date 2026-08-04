## 1. 有限状态机

- [x] 1.1 先编写状态机测试，覆盖合法转换、拒绝非法事件、未知事件不破坏状态、进入/退出钩子顺序、钩子失败回滚与状态一致、reset 与 dispose（释放后拒绝事件、重复释放幂等）。
- [x] 1.2 实现 `core/fsm` 下的纯 TypeScript 状态机（声明式转移表 + 轻量运行器），失败经错误报告回调隔离，返回同步幂等 `DisposeHandle`，使 1.1 通过且不依赖 Cocos。

## 2. 对象池

- [x] 2.1 先编写对象池测试，覆盖借出复用、容量上限、溢出可观察、重复归还拒绝、reset 钩子与 reset 失败隔离、dispose 与重复释放幂等、不自动接管任意对象生命周期。
- [x] 2.2 实现 `core/pooling` 下的显式所有者对象池（空闲列表 + 借出身份集合），使 2.1 通过且不依赖 Cocos。

## 3. 公开导出收口与集成验证

- [x] 3.1 在 `assets/framework/index.ts` 增补状态机与对象池稳定契约/工厂导出，并同步 `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 白名单断言。
- [x] 3.2 运行完整 `bun run test:foundation`，记录原有测试与新增 FSM/Pooling 测试通过数量与零失败结果。
- [x] 3.3 运行 `bun run test:foundation:types`、依赖边界检查和 `git diff --check`，确认结果干净。
- [x] 3.4 将父级 `create-game-framework-v1/tasks.md` 的 3.5–3.8 与实际证据同步，并在 tasks.md 中记录 ADR 检查结论（如产生新长期架构决策则创建 ADR，如无则明确记录无需 ADR）。父级 3.5–3.8 已标记完成并附实现证据（含 311 pass / 0 fail、types EXIT 0、白名单 35 项）。ADR 检查结论：本 Change 产生新的长期架构决策（状态机声明式转移表 + 钩子失败回滚策略；对象池显式所有者 + 容量约束受管对象总数 + 临时对象用完即弃的溢出可观察语义；工厂/reset 失败经错误回调隔离），已创建 `doc/decisions/ADR-008-fsm-and-object-pool.md`。

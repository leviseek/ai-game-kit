## 1. 平台契约与测试基线

- [x] 1.1 先编写平台契约类型测试，覆盖应用可见性、最小异步键值存储、设备信息和可替换时间来源；确认契约不依赖 `cc`、ApplicationContext 或 Game。
- [x] 1.2 实现窄平台契约和内存测试适配器，支持前后台状态、读写/删除键值、设备信息和注入时钟来源；不预建真实平台 SDK 或完整存档能力。
- [x] 1.3 扩展 Foundation 架构依赖白名单，确认新契约不引入 Service Locator、全局静态平台实例或 Framework 对 Game/Cocos 核心的反向依赖；公开 API 导出面按 4.3 收口。

## 2. 三种时间语义

- [x] 2.1 先编写 `TimeSource` 和 wall clock 测试，覆盖时间戳读取与来源替换，不把 wall clock 当作耗时或模拟时间。
- [x] 2.2 先编写 monotonic clock 测试，覆盖连续读取单调不减、注入来源和系统 wall clock 回拨不影响 monotonic 语义。
- [x] 2.3 实现统一 `TimeSource` 契约、wall clock 和 monotonic clock，使 2.1、2.2 测试通过且保持纯 TypeScript。
- [x] 2.4 先编写 simulation clock 测试，覆盖初始时间、暂停/恢复、正倍率、无效倍率拒绝和显式 `advance`。
- [x] 2.5 实现 simulation clock，使暂停时不推进、倍率按规则缩放、手动推进精确且不读取系统 wall clock。

## 3. 被动调度器与释放

- [ ] 3.1 先编写 `DisposeHandle` 测试，覆盖任务取消、调度器释放、重复释放幂等和到期但未驱动任务的取消。
- [ ] 3.2 先编写被动调度器测试，覆盖绑定时钟、延迟任务、一次性任务、重复任务、暂停时不执行和无 tick 时不执行。
- [ ] 3.3 实现同步幂等 `DisposeHandle` 和绑定 `TimeSource` 的被动调度器，使 3.1、3.2 测试通过，不使用 Cocos `schedule`/`director`、全局计时器或 ApplicationContext。
- [ ] 3.4 补充调度失败隔离测试，验证单个任务回调失败不会阻断同批其他到期任务，并通过现有诊断边界保留错误信息。
- [ ] 3.5 补充调度器边界测试，验证任务释放、调度器释放和所有者清理后没有残留执行；确认无静态单例和无所有者任务。

## 4. 集成验证与交付

- [ ] 4.1 运行完整 `bun run test:foundation`，记录原有 Foundation 测试与新增平台/时间/调度测试的通过数量和零失败结果。
- [ ] 4.2 运行 `bun run test:foundation:types`、项目可用的 Framework 类型检查和 `git diff --check`，记录既有 `strict: false` 工具链基线与本 Change 结果。
- [ ] 4.3 审查公开 API 和依赖边界，确认只导出稳定契约/工厂，不导出调度内部结构，也不修改 ApplicationContext、AppRoot 或 `startup.scene`。
- [ ] 4.4 将父级 `create-game-framework-v1/tasks.md` 的 `4.1–4.3` 与实现证据同步，区分纯 TypeScript 验证和尚未实现的真实平台适配。
- [ ] 4.5 执行 ADR 检查：确认本次工作是否产生新的架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR；如无，明确记录无需新增 ADR。

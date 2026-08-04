## 1. 资源 handle 与加载协调器

- [x] 1.1 先编写加载协调器测试，覆盖并发加载去重、加载失败传播、取消等待者和不同作用域共享同一底层加载结果。
- [x] 1.2 实现引擎无关的资源 handle（资源标识、归属 Bundle、加载状态、解析结果）与加载协调器，使 1.1 的测试通过且不依赖 Cocos。
- [x] 1.3 补充依赖边界检查，验证 `framework/core/resource` 不导入 `cc`、资源契约不依赖具体实现。

## 2. 资源作用域与 Bundle 卸载判断

- [ ] 2.1 先编写资源作用域测试，覆盖页面/场景/应用独立作用域逆序释放、仍被引用的资源保留、Bundle 可卸载判断、作用域重复释放幂等、释放期间取消未完成加载和失败隔离。
- [ ] 2.2 实现资源作用域（持有列表 + 全局引用计数）与可卸载查询，使 2.1 的测试通过，Bundle 引用归零后才执行卸载。
- [ ] 2.3 补充测试锁定所有权转移顺序：目标作用域先增持、来源作用域后释放，转移过程中引用不归零、不触发误卸载。

## 3. 资源提供契约与 Cocos Asset Bundle 适配器

- [ ] 3.1 先编写契约测试，锁定 `IResourceProvider` 为业务访问资源的唯一入口，禁止业务直接调用引擎 Bundle 加载/释放 API。
- [ ] 3.2 实现 `contracts/resource` 契约与内存适配器，使 3.1 的测试通过。
- [ ] 3.3 实现 Cocos Asset Bundle 适配器，覆盖加载、释放与可卸载判断，并保留底层错误 cause 和资源标识。
- [ ] 3.4 根入口白名单导出稳定契约与工厂，实现细节保持内部。

## 4. 最小 Bundle 划分

- [x] 4.1 通过 Cocos Creator 建立最小 `common`、`ui`、`audio` 和游戏内容 Bundle，确认 `resources` 只保留启动所需资源。
- [x] 4.2 记录 Bundle 目录、资源归属与启动资源清单，验证脚本编译、资源导入与编辑器加载通过。
  - Bundle 目录：`assets/common`、`assets/ui`、`assets/audio`、`assets/game-content` 均由编辑器标记 `isBundle: true`（含对应目录 `.meta`）；`assets/resources` 保持为空目录，仅作启动资源；`assets/boot` 暂未标记为 Bundle，不在本 Change 范围。
  - 资源归属：每个新 Bundle 内为最小占位资源 `placeholder.json`（+ 编辑器生成的 `.meta`），具体内容由后续能力填充。
  - 启动资源清单：`resources/` 为空，无任何非启动资源。
  - 验证：Cocos Creator 3.8.8 asset-db 日志（`temp/asset-db/log/2026-8-4 15-52.log`，2026-8-5 07:51–07:54）完成 4 个目录与占位资源的导入及 `isBundle` reimport，无 error/warning；packer-driver 07:44 脚本编译产物生成，编辑器加载无报错。

## 5. SceneFlow 编排

- [ ] 5.1 先编写 SceneFlow 测试，覆盖预加载、进度单调收敛、成功切换与资源所有权转移、失败保留当前场景、重试不残留、切换中重复请求被拒绝、作用域释放后未完成的预加载/切换被取消。
- [ ] 5.2 实现引擎无关的 `SceneFlow`（复用既有 FSM），使 5.1 的测试通过，失败后不残留半激活状态。

## 6. Cocos 场景适配器与冒烟验证

- [ ] 6.1 实现 Cocos 场景适配器，将 `SceneFlow` 的激活与释放映射到 `cc.director.loadScene`，不修改 `startup.scene` 序列化内容。
- [ ] 6.2 完成 Cocos Creator 3.8.8 Web Desktop 场景切换冒烟验证，覆盖预加载、成功切换、失败保留与资源释放；失败路径通过加载不存在的 Bundle 或场景标识构造。
- [ ] 6.3 运行完整 Bun foundation 测试、strict 类型检查和依赖边界检查，记录测试数量与零失败结果。

## 7. 收口与 ADR 检查

- [ ] 7.1 审查资源与场景模块公开入口，移除不必要导出，并用依赖检查证明其他模块没有深层导入。
- [ ] 7.2 ADR 检查：本次实现是否产生新的长期架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR，如无则明确记录无需 ADR。
- [ ] 7.3 归档时同步总计划 `create-game-framework-v1` 第 5 节任务的完成状态与证据。

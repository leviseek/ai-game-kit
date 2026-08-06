# Implement Platform Storage Adapter v1 — Tasks

对应总计划 `create-game-framework-v1` 任务 7.5/7.6。

## 1. 平台存储测试（红期先行）

- [x] 1.1 先编写后端读写测试：覆盖经适配器写入后新实例可取回、删除后键不可读、适配器以 `PlatformStorage` 契约形状暴露。（红期完成：`platform-storage.test.ts` 后端读写组 4 个测试，经注入 localStorage 接缝验证跨实例持久化、删除不可读、缺失返回 null 与契约形状。）
- [x] 1.2 先编写原子替换/备份测试：覆盖写入中断不留下半写入数据（读到完整旧值或备份或可识别损坏）、替换前保留可用备份、恢复后清理备份键。（红期完成：`platform-storage.test.ts` 原子替换/备份组 4 个测试，注入故障后端模拟正式键写入中断、验证旧值完整可读、后续写入可恢复、备份键保留与恢复后清理。）
- [x] 1.3 先编写损坏恢复测试：覆盖损坏记录以可诊断错误呈现、按恢复默认策略只影响损坏键、备份恢复路径可取回先前有效内容。（红期完成：`platform-storage.test.ts` 损坏恢复组 4 个测试，验证损坏记录抛 `SaveCorruptionError`、恢复默认只影响损坏键、备份恢复取回先前内容、无备份时恢复为可诊断失败。）
- [x] 1.4 先编写生命周期集成测试：覆盖暂停/恢复/退出触发连续保存时，保存串行收敛到最后一次有效状态，不出现并发覆盖或交错损坏。（红期完成：`storage-lifecycle.test.ts` 4 个测试，经 `SaveCoordinator` + 平台适配器 + `VersionedStorage` 验证生命周期保存收敛、重复事件无交错损坏、新实例读取一致与损坏记录类型化呈现。）

## 2. Cocos 平台存储适配器实现

- [x] 2.1 实现 `adapters/cocos/storage/*`：基于平台后端实现 `PlatformStorage`，内部采用临时值+校验+替换原子策略与备份键，使 1.1-1.3 测试通过。（完成：`CocosStorageAdapter.ts` 实现 `createCocosStorageAdapter`，惰性取 `cc.sys.localStorage` 支持注入接缝；set 走临时键写入→读回校验→备份旧值→替换正式键→清理临时键；get/delete 兼容缺失返回 null；配套目录与文件 `.meta`。）
- [x] 2.2 实现损坏数据诊断与恢复默认路径：区分"键不存在"与"内容损坏"，错误语义与 `versioned-storage` 的 `SaveCorruptionError` 衔接。（完成：存储信封含 FNV-1a 校验和，`get` 对非法信封/校验不一致抛 `SaveCorruptionError`，缺失返回 null 明确区分；`restoreDefault` 只清理目标键及备份/临时键，`restoreBackup` 校验备份有效后提升并清理。）
- [x] 2.3 实现 7.6 生命周期保存收敛：同一命名空间写入串行化，合并同一生命周期窗口内保存到最后一次有效状态，接 `ApplicationVisibility` 触发保存。（完成：`core/storage/SaveCoordinator.ts` 实现 `createSaveCoordinator`，订阅 `ApplicationVisibility`，`running`/`pending` 串行化并合并窗口内触发到最后一次有效状态；默认 `["background"]` 触发。）
- [x] 2.4 根入口白名单同步：新增适配器相关符号至 `expectedRootExports`，依赖边界检查通过（内核/契约不导入 `cc`）。（完成：按既有约定适配器与存储内核不导出至根入口——`createCocosStorageAdapter`/`createSaveCoordinator` 追加至 `public-boundary.test.ts` `forbiddenInternals` 锁定；`SaveCoordinator` 位于 `core/storage` 仅依赖 `contracts/platform`，`CocosStorageAdapter` 位于 `adapters/cocos` 依赖 core/contracts，`cc` 仅存在于适配器层；public-boundary 29 pass、strict 类型 0 diagnostics。）

## 3. 集成与收口

- [ ] 3.1 以平台存储适配器为后端运行 `versioned-storage` 既有测试，确认仓库行为不回归且经适配器持久化一致。
- [ ] 3.2 完成依赖边界检查与 strict 类型检查，确认配置路径与存储路径互不混用。
- [ ] 3.3 同步更新总计划 `create-game-framework-v1` tasks.md：将 7.5/7.6 标记为已完成并注明由本 change 交付。

## 4. 验证与 ADR

- [ ] 4.1 运行完整 Bun 单元测试与 strict TypeScript 检查，记录测试数量与零失败结果。
- [ ] 4.2 执行 ADR 检查：确认本次存储适配器实现是否产生新的架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR；如无，明确记录无需新增 ADR。

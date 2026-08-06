# Implement Platform Storage Adapter v1 — Tasks

对应总计划 `create-game-framework-v1` 任务 7.5/7.6。

## 1. 平台存储测试（红期先行）

- [x] 1.1 先编写后端读写测试：覆盖经适配器写入后新实例可取回、删除后键不可读、适配器以 `PlatformStorage` 契约形状暴露。（红期完成：`platform-storage.test.ts` 后端读写组 4 个测试，经注入 localStorage 接缝验证跨实例持久化、删除不可读、缺失返回 null 与契约形状。）
- [x] 1.2 先编写原子替换/备份测试：覆盖写入中断不留下半写入数据（读到完整旧值或备份或可识别损坏）、替换前保留可用备份、恢复后清理备份键。（红期完成：`platform-storage.test.ts` 原子替换/备份组 4 个测试，注入故障后端模拟正式键写入中断、验证旧值完整可读、后续写入可恢复、备份键保留与恢复后清理。）
- [x] 1.3 先编写损坏恢复测试：覆盖损坏记录以可诊断错误呈现、按恢复默认策略只影响损坏键、备份恢复路径可取回先前有效内容。（红期完成：`platform-storage.test.ts` 损坏恢复组 4 个测试，验证损坏记录抛 `SaveCorruptionError`、恢复默认只影响损坏键、备份恢复取回先前内容、无备份时恢复为可诊断失败。）
- [x] 1.4 先编写生命周期集成测试：覆盖暂停/恢复/退出触发连续保存时，保存串行收敛到最后一次有效状态，不出现并发覆盖或交错损坏。（红期完成：`storage-lifecycle.test.ts` 4 个测试，经 `SaveCoordinator` + 平台适配器 + `VersionedStorage` 验证生命周期保存收敛、重复事件无交错损坏、新实例读取一致与损坏记录类型化呈现。）

## 2. Cocos 平台存储适配器实现

- [x] 2.1 实现 `adapters/cocos/storage/*`：基于平台后端实现 `PlatformStorage`，内部采用临时值+校验+替换原子策略与备份键，使 1.1-1.3 测试通过。（完成：`CocosStorageAdapter.ts` 实现 `createCocosStorageAdapter`，惰性取 `cc.sys.localStorage` 支持注入接缝；set 走临时键写入→读回校验→备份旧值→替换正式键→清理临时键（try/finally 保证失败不残留）；get/delete 兼容缺失返回 null；配套目录与文件 `.meta`。）
- [x] 2.2 实现损坏数据诊断与恢复默认路径：区分"键不存在"与"内容损坏"，错误语义与 `versioned-storage` 的 `SaveCorruptionError` 衔接。（完成：存储信封含 FNV-1a 校验和，`get` 对非法信封/校验不一致抛 `SaveCorruptionError`，缺失返回 null 明确区分；`restoreDefault` 只清理目标键及备份/临时键，`restoreBackup` 校验备份有效后提升并清理。）
- [x] 2.3 实现 7.6 生命周期保存收敛：同一命名空间写入串行化，合并同一生命周期窗口内保存到最后一次有效状态，接 `ApplicationVisibility` 触发保存。（完成：`core/storage/SaveCoordinator.ts` 实现 `createSaveCoordinator`，订阅 `ApplicationVisibility`，`running`/`pending` 串行化并合并窗口内触发到最后一次有效状态；默认 `["background"]` 触发；`onError` 回调（缺省 `console.error`）报告保存失败并继续收敛。）
- [x] 2.4 根入口白名单同步：新增适配器相关符号至 `expectedRootExports`，依赖边界检查通过（内核/契约不导入 `cc`）。（完成：按既有约定适配器与存储内核不导出至根入口——`createCocosStorageAdapter`/`createSaveCoordinator` 追加至 `public-boundary.test.ts` `forbiddenInternals` 锁定；`SaveCoordinator` 位于 `core/storage` 仅依赖 `contracts/platform`，`CocosStorageAdapter` 位于 `adapters/cocos` 依赖 core/contracts，`cc` 仅存在于适配器层；public-boundary 29 pass、strict 类型 0 diagnostics。）

## 3. 集成与收口

- [x] 3.1 以平台存储适配器为后端运行 `versioned-storage` 既有测试，确认仓库行为不回归且经适配器持久化一致。（完成：`versioned-storage-platform-backend.test.ts` 11 项——命名空间隔离、删除互不影响、新适配器实例持久化一致、schema version、连续迁移、缺失迁移报错、未来版本拒绝、DTO 校验、损坏记录类型化呈现、损坏不影响其它命名空间、键编码不冲突；审查后补"以 .tmp/.bak 结尾键不冲突"与"合法信封内损坏记录诊断"两回归用例。）
- [x] 3.2 完成依赖边界检查与 strict 类型检查，确认配置路径与存储路径互不混用。（完成：public-boundary 29 pass——适配器/内核新增符号入 `forbiddenInternals`，`cc` 仅存在于 `adapters/cocos`，`SaveCoordinator` 仅依赖 `contracts/platform`；`test:foundation:types` 0 diagnostics，配置契约/内核/适配器路径的 `/storage/` 禁入断言均通过。）
- [x] 3.3 同步更新总计划 `create-game-framework-v1` tasks.md：将 7.5/7.6 标记为已完成并注明由本 change 交付。

## 4. 验证与 ADR

- [x] 4.1 运行完整 Bun 单元测试与 strict TypeScript 检查，记录测试数量与零失败结果。（完成：`bun test ./tests/framework/foundation` 635 pass / 0 fail（64 文件，2001 expect），`bun ./tests/scripts/check-foundation-contracts.ts` 0 diagnostics，public-boundary 29 pass。）
- [x] 4.2 执行 ADR 检查：确认本次存储适配器实现是否产生新的架构决策；如有，按 `doc/decisions/ADR-NNN-<slug>.md` 创建 ADR；如无，明确记录无需新增 ADR。（完成：产生新架构决策，创建 `doc/decisions/ADR-017-platform-storage-adapter-atomicity-recovery.md`，记录四项决策——经既有 `PlatformStorage` 契约落地不扩展契约、临时值+校验+替换原子策略与备份键、损坏诊断复用 `SaveCorruptionError`、生命周期保存收敛经 `SaveCoordinator` 串行化合并。）

## 5. 审查修复（ai-sensei 全面审查 Phase 1~4）

- [x] 5.1 修复 P1-1：临时/备份键后缀冲突导致静默丢数据。（完成：后缀由 `.tmp`/`.bak` 改为 `%tmp`/`%bak`——`encodeURIComponent` 输出中 `%` 恒为大写 `%XX` 序列，小写后缀与任何编码正式键严格不相交；补 adapter 层与仓库层回归测试，实测旧实现下必失败。）
- [x] 5.2 修复 P1-2：SaveCoordinator 保存失败静默丢失。drain 捕获 save 错误经 `onError` 报告（缺省 `console.error`，对齐 ScopedEventChannel），继续处理后续触发；补"失败后后续事件收敛到最后一次有效状态"与"缺省 onError 走 console.error 不静默"两测试。
- [x] 5.3 顺带低风险 P2：try/finally 保证失败后临时键清理；set 值相等短路并注释备份存在性依赖跨值写入历史（补语义锁定测试）；`DEFAULT_TRIGGER_STATES` 用 `as const` 模块级常量；适配器构造校验后端存在；生命周期测试中间断言改为必须读到完整记录不吞错。
- [x] 5.4 复审查确认：修复后全量 641 pass / 0 fail、strict 类型 0 diagnostics、public-boundary 29 pass，达到可归档标准。

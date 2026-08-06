# ADR-017 Platform Storage Adapter: Atomic Replace, Corruption Recovery, and Lifecycle Save Convergence

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 任务 7.5/7.6 要求把 `PlatformStorage` 契约落地到真实平台并验证存档生命周期保存语义：`versioned-storage` 已提供引擎无关的存档仓库与迁移链（7.3/7.4，ADR-013），但缺少把契约落到真实平台的适配器、写入中断的原子性保障、损坏数据恢复与生命周期保存收敛验证。本 ADR 记录 change `implement-platform-storage-adapter-v1` 落地的平台存储适配器模型、原子替换/备份策略、损坏恢复语义与生命周期保存收敛，供后续原生/小游戏平台存储适配器与存档集成能力复用。

## 决策

### 1. 适配器经既有 `PlatformStorage` 契约落地，不扩展契约

Cocos 适配器实现既有 `PlatformStorage`（`cc.sys.localStorage` 或等价平台后端），`get`/`set`/`delete` 保持契约形状；原子性由适配器内部实现，不新增契约成员。适配器额外暴露 `restoreDefault`/`restoreBackup` 恢复路径，属具体适配器能力而非契约扩展。

**理由：** `PlatformStorage` 已存在且 `versioned-storage` 依赖它；保持契约最小可替换，内存替身（`MemoryPlatform`）与真实后端同构。`cc` 只存在于 `adapters/cocos` 层，内核与契约零 `cc` 导入（`public-boundary` 锁定）。
**未采用方案：** 扩展契约增加原子写入方法（破坏既有契约形状，且原子策略属实现细节）；适配器符号导出至根入口（与既有 Cocos 适配器一致，入 `forbiddenInternals` 锁定）。

### 2. 原子替换采用"临时值 + 校验 + 替换"，保留备份键

写入流程：先在临时键写入完整新值并读回校验，校验通过后保留当前正式值到备份键，再一次性替换正式键，最后清理临时键。临时键/备份键以 `.tmp`/`.bak` 后缀派生，与正式键空间隔离。写入中断时正式键要么保持完整旧值、要么得到完整新值，不产生半写入；备份键提供可恢复回退。

**理由：** 不同平台原子性可用性不同，临时值+校验+替换把半写入窗口缩小到最小并可用备份回退；平台 `setItem` 原子写入单键，正式键替换本身不产生中间态。备份占用额外键空间，恢复路径（`restoreDefault`/`restoreBackup`）负责清理。
**未采用方案：** 依赖平台事务（多数 localStorage 后端无事务）；扩展契约加原子方法（见决策 1）。

### 3. 损坏数据诊断与恢复默认在适配器衔接仓库错误语义

存储信封（写入值 + FNV-1a 校验和）使适配器能区分"键不存在"（`get` 返回 null）与"内容损坏"（信封非法或校验不一致抛 `SaveCorruptionError`）；错误类型复用 `versioned-storage` 的 `SaveCorruptionError`，不新增重复机制。`restoreDefault` 只清理目标键及备份/临时键，不影响其它键；`restoreBackup` 校验备份有效后提升为正式值并清理。

**理由：** 仓库已定义损坏错误类型与解析语义，适配器只需正确区分缺失与损坏，由上层策略决定恢复路径；错误类型统一保证调用方错误处理路径一致。
**未采用方案：** 定义独立适配器损坏错误类型（与仓库语义分裂）；损坏时静默降级为空存档（掩盖数据丢失，违反 ADR-013 决策 3 的可诊断原则）。

### 4. 生命周期保存收敛：串行化 + 窗口合并到最后一次有效状态

`core/storage/SaveCoordinator.ts` 提供引擎无关协调器：订阅 `ApplicationVisibility`，在触发状态（默认 `background`，对应暂停与退出）变化时调度保存；同一时刻至多一个保存在途（串行化），执行期间新触发标记 pending，当前保存完成后收敛到最后一次有效状态（合并写），避免并发交错覆盖与丢失最后一次有效状态。

**理由：** Cocos 生命周期事件可能密集触发；串行化避免并发交错写入，窗口合并避免写放大，最终持久化最后一次有效状态。协调器位于 `core/storage` 仅依赖 `contracts/platform`，不依赖 `cc`，可在测试与任意平台复用。
**未采用方案：** 各平台自行实现保存触发与串行化（重复机制，破坏可测试性）。

## 理由

- 平台存储适配器模型决定后续所有平台后端（原生、小游戏）的接入方式：新平台适配器必须实现既有 `PlatformStorage` 契约、保持原子替换/备份策略与 `SaveCorruptionError` 语义，否则各平台存档行为预期漂移而不被察觉。
- 原子替换/备份、损坏恢复默认与生命周期保存收敛是公开行为契约，测试已逐项锁定（`platform-storage.test.ts`、`storage-lifecycle.test.ts`、`versioned-storage-platform-backend.test.ts`）。
- 与 ADR-013 分层一致：契约存 `contracts/storage`，错误与实现存 `core/storage`，适配器落 `adapters/cocos`。

## 影响

- 后续平台存储适配器（原生、小游戏）必须实现既有 `PlatformStorage` 契约，采用临时值+校验+替换原子策略并保留备份键，损坏语义复用 `SaveCorruptionError`。
- 存档生命周期保存收敛统一经 `core/storage/SaveCoordinator.ts` 接入 `ApplicationVisibility`，各平台不得另建保存触发链路。
- 根入口 `index.ts` 不导出适配器与协调器符号；`public-boundary.test.ts` 的 `forbiddenInternals` 已加入 `createCocosStorageAdapter`/`createSaveCoordinator` 锁定。
- 备份键占用额外键空间，恢复路径负责清理；`.tmp`/`.bak` 后缀与正式键空间隔离，不与版本化存储键冲突。
- 若出现需要"服务端权威存储"或"加密存档"的场景，通过独立 change 扩展，不破坏当前适配器契约。

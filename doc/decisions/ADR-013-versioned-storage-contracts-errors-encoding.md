# ADR-013 Versioned Storage Contracts, Errors, and Key Encoding

## 状态

Accepted

## 背景

父级 `create-game-framework-v1` 任务 7.3/7.4 要求提供引擎无关的存档仓库与迁移链：命名空间隔离、schema version、连续迁移、未来版本拒绝与 DTO 可序列化约束。本 ADR 记录 change `implement-versioned-storage-v1` 产生的长期架构决策：契约与实现的分层方式、类型化错误的归属，以及存储键的编码策略，供后续存档能力（平台存储适配器、存档集成）复用。

## 决策

### 1. 契约存于 contracts/storage，错误与实现存于 core/storage

`assets/framework/contracts/storage/VersionedStorage.ts` 只导出纯接口与类型（`SaveVersion`、`SaveMigrator`、`VersionedStorageOptions`、`SaveLoadResult`、`VersionedStorage`），不含任何值实现或错误类；`assets/framework/core/storage/VersionedStorage.ts` 导出类型化错误（`SaveVersionError`/`SaveMigrationError`/`SaveSerializationError`/`SaveCorruptionError`，继承 `FrameworkError`）与 `createVersionedStorage` 工厂。

**理由：** 与 `core/services/ServiceRegistry.ts` 先例一致——错误类与实现同层、经 `core/errors` 共享基础错误；contracts 层保持纯类型依赖，避免运行期值导入 core 实现。`public-boundary.test.ts` 的依赖矩阵对 core 层允许依赖 contracts，方向正确。

**未采用方案：** 错误类留在 contracts 层并值导入 `core/errors/FrameworkError`（会造成 contracts 值依赖 core 实现层，且偏离 ServiceRegistry 先例）。

### 2. 存储键对命名空间与键做 URI 编码，保证键空间无冲突

底层存储键由 `save:` 前缀、`encodeURIComponent(namespace)`、分隔符 `:`、`encodeURIComponent(key)` 拼接。任何含保留字符（如 `:`）或编码字符（如 `%`）的命名空间/键都能无歧义映射到独立键。

**理由：** spec 要求"不同命名空间的存档 MUST 互不可见、互不覆盖"；不做编码时 `save("a:b","c")` 与 `save("a","b:c")` 会映射到同一存储键并互相覆盖。URI 编码方案简单、可逆、覆盖任意字符，且对不含保留字符的常见输入（如玩家 ID）键格式不变，兼容性影响最小。

**未采用方案：** 前置校验拒绝含分隔符的命名空间/键（限制合法输入且破坏显式契约）；长度前缀结构化键（实现复杂，本场景无此必要）。

### 3. 损坏记录与迁移失败分别以类型化错误表达，不静默降级

`load` 对 `JSON.parse` 失败或记录形状不符（非对象、缺 `version`/`data`、版本非正整数）抛 `SaveCorruptionError`；迁移缺失级或迁移器抛错抛 `SaveMigrationError`（带 `fromVersion`/`toVersion`，迁移器失败时经 `cause` 保留底层错误）。两者都继承 `FrameworkError`，携带可诊断字段。

**理由：** 损坏数据不得被伪装成"空存档"（否则调用方无法区分空存档与数据损坏）；迁移失败的真实原因必须经 `cause` 透传以便排障。有 `cause` 时表示迁移器失败、无 `cause` 时表示缺失迁移，调用方可区分两类失败。

**未采用方案：** 迁移失败直接抛底层原始错误（丢失类型化分类与版本缺口信息）；把损坏记录静默降级为默认数据（掩盖数据丢失，违反可诊断原则）。

## 理由

- 契约/实现分层与错误类归属延续既有 `core` 工具惯例与 `public-boundary` 依赖矩阵，未来平台存储适配器（7.5）可只依赖契约类型接入存储后端，错误语义不随实现位置漂移。
- URI 编码的键空间保证是"命名空间隔离"契约的落地前提，属于长期行为契约；一旦破坏，不同命名空间的存档会互相覆盖且难以排查。
- 类型化错误 + 可诊断字段（版本缺口、损坏描述、cause）满足 spec 对错误信息的要求，并让 7.5/7.6 的失败路径（写入中断、损坏数据、备份恢复）可复用同一错误分类。

## 影响

- 未来存档相关能力（平台存储适配器、备份策略、存档集成测试）从 `core/storage` 导入错误类、从 `contracts/storage` 导入契约类型，不直接依赖实现内部结构。
- 存储键编码规则已锁定：新增能力不得绕过 `composeStorageKey` 自行拼接键，否则可能破坏隔离保证。
- 根入口 `index.ts` 暂不导出本 change 符号（`expectedRootExports` 未变）；若未来把 versioned-storage 纳入公开 API，需同步白名单并补公开边界测试。
- 若出现真实需要"跳过损坏校验"的场景（如容灾恢复），通过独立 change 扩展，不破坏当前类型化错误契约。

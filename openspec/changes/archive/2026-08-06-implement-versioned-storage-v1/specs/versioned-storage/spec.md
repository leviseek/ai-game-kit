## Purpose

提供引擎无关的版本化存档仓库与迁移链：以命名空间隔离玩家存档，用 schema version 标记记录版本，经连续迁移逐级升级旧存档，并拒绝未来版本与不可序列化 DTO，使存档层可在平台存储之上独立测试。

## ADDED Requirements

### Requirement: Saves are isolated by namespace

版本化存档仓库 MUST 支持以命名空间标识对存档进行读写，不同命名空间的存档 MUST 互不可见、互不覆盖。读取一个命名空间下的存档 MUST 只返回该命名空间内的数据，删除一个命名空间的存档 MUST 不影响其他命名空间的存档。

#### Scenario: Namespaces do not share data

- **WHEN** 调用方分别在命名空间 `A` 与 `B` 下写入内容不同但键相同的存档
- **THEN** 读取命名空间 `A` 返回 `A` 的存档内容，读取命名空间 `B` 返回 `B` 的存档内容，两者互不干扰

#### Scenario: Deleting one namespace leaves others intact

- **WHEN** 调用方删除命名空间 `A` 下的某个存档
- **THEN** 命名空间 `B` 下同键的存档仍可读取且内容保持不变

### Requirement: Saves carry a schema version

每个写入的存档 MUST 携带其 schema version，读取存档时 MUST 能返回该版本。写入 MUST 记录调用方声明的最新版本，读取 MUST 如实返回记录中的版本，不得隐式改写。

#### Scenario: Written save records its version

- **WHEN** 调用方以版本 `3` 写入一个存档
- **THEN** 再次读取该存档返回版本 `3` 与写入的数据，版本与数据一致

### Requirement: Legacy saves migrate forward step by step

存档仓库 MUST 支持为版本间注册迁移，读取一个低于当前版本的存档时 MUST 按注册的迁移链逐级升级到当前版本，最终返回当前版本的数据。迁移链 MUST 支持连续多级（如 v1→v2→v3），每一级迁移的输入为上一级迁移的输出。

#### Scenario: Save migrates through consecutive versions

- **WHEN** 仓库当前版本为 `3`，已注册 v1→v2、v2→v3 的迁移，且存储中存有版本 `1` 的存档
- **THEN** 读取该存档返回版本 `3`，数据等价于依次应用 v1→v2 与 v2→v3 迁移后的结果

#### Scenario: Current version save reads without migration

- **WHEN** 存储中的存档版本已等于当前版本
- **THEN** 读取返回该版本与数据，不执行任何迁移

### Requirement: Saves from a future version are rejected

仓库遇到高于当前支持版本的存档时 MUST 以类型化错误拒绝读取，不得尝试猜测性迁移，不得破坏或返回部分数据。拒绝错误 MUST 携带存档记录中的版本与当前支持版本等可诊断信息。

#### Scenario: Future version save fails with typed error

- **WHEN** 当前版本为 `3`，存储中存有版本 `5` 的存档
- **THEN** 读取失败并抛出携带 `5` 与 `3` 的类型化错误，原存档数据保持不变

### Requirement: Missing version migration fails with typed error

存档版本低于当前版本但缺少对应迁移时，读取 MUST 以类型化错误失败并报告缺失的迁移路径，不得静默丢弃数据或以错误版本返回。

#### Scenario: Missing migration step fails

- **WHEN** 当前版本为 `3`，已注册 v1→v2 但缺少 v2→v3，存储中存有版本 `2` 的存档
- **THEN** 读取失败并抛出指示缺失 v2→v3 迁移的类型化错误

### Requirement: DTOs must be serializable

写入存档的 DTO MUST 可序列化（可由 JSON 序列化）。不可序列化的值（如含 `undefined`、函数、循环引用的对象）MUST 在写入前被类型化错误拒绝，不得产生部分写入或损坏数据。

#### Scenario: Non-serializable DTO is rejected before write

- **WHEN** 调用方尝试写入包含 `undefined` 字段或函数引用的 DTO
- **THEN** 写入失败并抛出类型化错误，存储中不残留该存档

### Requirement: Storage backend is injected and reusable

仓库 MUST 通过显式注入的方式接收存储后端（异步键值接口）、当前版本与迁移器集合，MUST NOT 依赖全局状态或隐式单例。同一存储后端实例上创建的多个仓库实例 MUST 以命名空间隔离方式各自独立工作。

#### Scenario: Repository works over injected storage

- **WHEN** 调用方以内存实现的存储后端与迁移器集合创建仓库并读写存档
- **THEN** 存档在指定命名空间下可读写，且更换后端实现无需修改仓库调用方代码

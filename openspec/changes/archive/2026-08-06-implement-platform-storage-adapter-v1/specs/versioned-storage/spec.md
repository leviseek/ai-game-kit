# versioned-storage Specification (delta)

## ADDED Requirements

### Requirement: Platform storage adapter backs the repository

`VersionedStorage` 仓库 MUST 可在平台存储适配器之上运行：仓库的写入 MUST 经适配器的原子替换/备份策略落盘，读取到损坏记录时仓库 MUST 以可诊断的损坏错误呈现（与既有 `SaveCorruptionError` 语义衔接），并由调用方策略决定恢复默认或选择备份。仓库既有行为（命名空间、schema version、连续迁移、未来版本拒绝、DTO 序列化约束）MUST 保持不变。

#### Scenario: Repository writes through the platform adapter

- **WHEN** 调用方以平台存储适配器为后端创建仓库并写入存档
- **THEN** 存档经适配器持久化到平台后端，再次创建仓库读取可取得一致内容，且遵守命名空间与版本语义

#### Scenario: Corrupted platform record surfaces as a typed error

- **WHEN** 平台后端中某存档记录损坏，调用方读取该命名空间存档
- **THEN** 读取失败并抛出携带诊断信息的类型化损坏错误，其他命名空间存档不受影响

### Requirement: Repository writes remain safe under lifecycle events

在应用暂停、恢复与退出触发的连续保存中，仓库 MUST 保证每次写入按原子策略完成，不得出现交错覆盖或写入中途读取到半状态。最后一次有效保存 MUST 在生命周期结束后可完整读取。

#### Scenario: Consecutive lifecycle saves produce a valid last state

- **WHEN** 应用在暂停/恢复/退出序列中连续保存同一命名空间存档且内容逐步变化
- **THEN** 生命周期结束后读取该存档返回最后一次有效内容，存档记录有效、无交错损坏

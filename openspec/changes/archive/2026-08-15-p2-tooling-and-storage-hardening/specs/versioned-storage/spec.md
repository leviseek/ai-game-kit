## Purpose

版本化存储支持固定存储键（覆盖默认组合键）并经框架根入口公开全套能力（工厂 + 类型化错误 + 契约类型），使品类存储（lineup/挂机）复用单点实现、保留既有键不换键。

## ADDED Requirements

### Requirement: 可选固定存储键

`createVersionedStorage` SHALL 支持可选 `storageKey`：提供时 `save`/`load`/`delete` SHALL 使用该固定键（替代默认 `save:<编码命名空间>:<编码键>` 组合），供迁移自定键存档或精确键空间消费方；缺省 SHALL 按命名空间组合键，行为不变。

#### Scenario: 固定键覆盖默认组合

- **WHEN** 仓库配置 `storageKey: "custom:key"` 并 save/load/delete
- **THEN** 读写删除均作用于 `custom:key`，默认组合键（`save:ns:k`）不被触达

### Requirement: 版本化存储经根入口公开

Framework 根入口 SHALL 公开 `createVersionedStorage`、类型化错误（`SaveVersionError`/`SaveMigrationError`/`SaveSerializationError`/`SaveCorruptionError`）与契约类型（`IVersionedStorage`/`IVersionedStorageOptions`/`ISaveLoadResult`/`ISaveMigrator`/`ISaveVersion`）；品类存储 SHALL 经根入口复用该实现，不重复自实现版本/迁移/损坏判定。

#### Scenario: 品类存储复用单点实现

- **WHEN** 品类存储（lineup/挂机）创建版本化仓库
- **THEN** 版本/迁移/损坏判定经框架 `createVersionedStorage` 提供，品类层只保留形状校验与既有存储键

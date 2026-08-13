# platform-storage Specification

## Purpose

提供平台存储适配器：把 `PlatformStorage` 契约落地到真实平台，采用原子替换/备份策略避免写入中断留下半写入数据，并对损坏记录提供可诊断恢复路径，使版本化存档可安全持久化并在生命周期事件下不丢失最后一次有效状态。

## Requirements

### Requirement: Platform backend persists key-value data

平台存储适配器 MUST 在目标平台（Cocos 环境）提供 `PlatformStorage` 契约的读写删除实现：写入的值 MUST 在下次读取时可取回，删除 MUST 使对应键不再可读。适配器 MUST 通过既有 `PlatformStorage` 契约暴露，不得改变契约形状。

#### Scenario: Written value persists across adapter instances

- **WHEN** 调用方经适配器写入键 `k` 值 `v`，随后用新适配器实例读取
- **THEN** 读取返回 `v`，数据在平台后端持久化

#### Scenario: Deleted key is no longer readable

- **WHEN** 调用方删除键 `k` 后再次读取
- **THEN** 读取返回不存在，且不报损坏错误

### Requirement: Writes are atomic or backed up

适配器写入 MUST 采用临时值/校验/替换或平台可提供的等价原子策略。写入中断 MUST NOT 留下半写入数据：读取要么得到完整新值，要么得到可识别的旧值或备份，不得得到损坏的中间状态。适配器 MUST 在替换前保留可用的备份（平台允许时）。

#### Scenario: Interrupted write does not corrupt data

- **WHEN** 写入新值过程中发生中断，随后读取该键
- **THEN** 读取返回完整的旧值或备份，或抛出可识别的损坏错误，不会静默返回半写入内容

### Requirement: Corrupted data is diagnosed and recoverable

读取到损坏/非法记录时，适配器或上层 MUST 以可诊断错误呈现损坏，并支持按策略恢复默认或选择备份。损坏恢复 MUST 只影响损坏的键，不影响其他键的读取。

#### Scenario: Corrupted value is reported and defaults are restored

- **WHEN** 平台后端中某键的值已损坏（无法解析为合法记录），调用方按恢复默认策略读取
- **THEN** 读取以可诊断方式呈现损坏，并按策略恢复默认值；其他未损坏键仍正常读取

### Requirement: Lifecycle events preserve the last valid save

在应用暂停、恢复与退出时触发的存档保存 MUST 不会因重复生命周期事件产生并发覆盖或丢失最后一次有效状态。同一生命周期窗口内的多次保存 MUST 收敛到最后一次有效状态，且不出现交错写入破坏存档。

#### Scenario: Repeated lifecycle saves keep the last valid state

- **WHEN** 应用在暂停、恢复、退出序列中多次触发存档保存，且每次保存内容不同
- **THEN** 最终持久化的存档为最后一次有效保存的内容，存档记录有效且可读取，不出现并发覆盖或交错损坏

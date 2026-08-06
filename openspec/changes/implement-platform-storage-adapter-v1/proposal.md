# Implement Platform Storage Adapter v1

## Why

主框架 change `create-game-framework-v1` 的第 7 章规划了版本化存档，其中 7.5/7.6 要求实现平台存储适配器与存档集成：`versioned-storage` 已提供引擎无关的存档仓库与迁移链（7.3/7.4），但缺少把 `PlatformStorage` 契约落地到真实平台的适配器，以及原子替换/备份、损坏数据恢复、恢复默认和生命周期集成验证。当前只有 `MemoryPlatform` 测试替身，`adapters/cocos` 无存储实现。本 change 补齐 7.5/7.6。

## What Changes

- 新增 `platform-storage` 能力，提供平台存储适配器：
  - 平台后端：在 Cocos 平台把 `PlatformStorage` 契约落地（如 `sys.localStorage`），提供真实读写删除
  - 原子替换/备份策略：写入采用临时值/校验/替换或平台可提供的等价原子策略，避免写入中断留下半写入数据
  - 损坏数据恢复：读取到损坏/非法记录时以可诊断错误呈现，并支持恢复默认或选择备份的路径
  - 恢复默认：损坏或缺失存档时按策略恢复默认状态，不影响其他键
- 新增存档生命周期集成测试（7.6）：覆盖暂停、恢复、退出时的保存语义，确认重复生命周期事件不产生并发覆盖或丢失最后一次有效状态
- 复用 `ApplicationVisibility` 与版本化存储契约，不修改既有存档仓库行为
- 根入口白名单同步：按既有 `expectedRootExports` 机制收口新公开符号

## Capabilities

### New Capabilities

- `platform-storage`: 平台存储适配器，覆盖平台后端落地、原子替换/备份策略、损坏数据恢复与恢复默认路径

### Modified Capabilities

- `versioned-storage`: 新增与平台存储适配器的集成边界——适配器写入采用原子替换/备份策略，损坏记录与恢复默认路径与仓库的读取失败语义衔接（存档仓库行为本身不变，仅补充平台层需求）

## Impact

- 新增代码：`assets/framework/adapters/cocos/storage/*`（Cocos 平台存储适配器）及必要的契约扩展（`contracts/storage/*`）
- 新增测试：`tests/framework/foundation/platform-storage.test.ts` 覆盖写入中断、损坏数据、恢复默认与备份恢复路径；存档生命周期集成测试覆盖暂停/恢复/退出保存语义
- 依赖：适配器依赖 `cc`（`sys.localStorage` 或等价平台存储）、`PlatformStorage` 契约、`ApplicationVisibility` 与 `versioned-storage` 仓库
- 影响公开入口：`index.ts` 白名单需同步新增适配器相关符号（如需导出）

## Impact on Other Changes

- 将 `create-game-framework-v1` tasks.md 中 7.5/7.6 标记为已完成（与本 change 同步）。

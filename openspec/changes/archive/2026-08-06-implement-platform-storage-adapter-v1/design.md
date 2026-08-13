# Implement Platform Storage Adapter v1 — Design

## Context

框架已具备分层模式：`contracts/*`、`core/*`、`adapters/memory/*`、`adapters/cocos/*`、`tests/framework/foundation/*.test.ts`。`PlatformStorage` 契约（`contracts/platform/Platform.ts`）提供最小异步键值 get/set/delete；`versioned-storage` 已实现引擎无关的存档仓库与迁移链，其设计明确把"原子替换/备份、损坏恢复"划归平台存储适配器（原 7.5）；`CocosApplicationAdapter` 已把引擎前后台事件转换为 `ApplicationVisibility` 生命周期。当前无任何 `adapters/cocos/storage` 实现。本 change 落地平台存储适配器并补齐 7.6 生命周期集成验证。

## Goals / Non-Goals

**Goals:**

- 提供 Cocos 平台存储适配器：把 `PlatformStorage` 契约落地到平台后端，经既有契约暴露
- 原子替换/备份策略：写入中断不留下半写入数据，替换前保留可用备份
- 损坏数据诊断与恢复默认路径：损坏记录可诊断呈现，恢复默认只影响损坏键
- 7.6 存档生命周期集成测试：暂停/恢复/退出保存不丢失最后一次有效状态
- 严格类型化，根入口白名单同步

**Non-Goals:**

- 不修改 `versioned-storage` 仓库既有行为（命名空间、版本、迁移、DTO 校验）
- 不实现云存档、加密、防作弊或服务端权威存储
- 不实现配置服务的存储后端（配置走资源路径，见 config change）
- 不为所有平台构建完整矩阵；v1 以 Cocos Web Desktop 为验证目标，原生/小游戏在对应适配器 change 追加

## Decisions

### 1. 适配器经 `PlatformStorage` 契约落地，不扩展契约

Cocos 适配器实现既有 `PlatformStorage`（`sys.localStorage` 或等价平台后端），get/set/delete 保持契约形状；原子性由适配器内部实现，不新增契约成员。

- **理由**：`PlatformStorage` 已存在且 `versioned-storage` 依赖它；保持契约最小可替换，内存替身与真实后端同构。
- **备选**：扩展契约加原子写入方法。会破坏既有契约形状，且原子策略属实现细节。

### 2. 原子替换采用"临时值 + 校验 + 替换"或等价策略

写入时先在临时键写入完整新值并校验，校验通过后一次性替换正式键，必要时保留旧值/备份键。平台不支持事务时，以备份键提供可恢复回退。

- **理由**：设计决策 11 明确"写入采用临时值/校验/替换或平台可提供的等价原子策略"；不同平台可用性不同，策略需可配置。
- **权衡**：备份会占用额外键空间，需在恢复后清理；损坏恢复路径测试覆盖该清理。

### 3. 损坏数据与恢复默认在适配器上衔接仓库错误语义

损坏记录（JSON 非法/形状不符）以类型化损坏错误呈现；调用方按策略选择恢复默认或备份。错误语义与 `versioned-storage` 的 `SaveCorruptionError` 衔接，不新增重复机制。

- **理由**：仓库已定义损坏错误类型；适配器只需正确区分"键不存在"与"内容损坏"，由上层策略决定恢复路径。

### 4. 生命周期保存收敛策略

7.6 集成测试覆盖暂停/恢复/退出触发连续保存：保存串行化（同一命名空间的写入按序完成），最后一次有效状态可完整读取，不出现交错覆盖。

- **理由**：Cocos 生命周期事件可能密集触发；串行化避免并发交错写入，收敛到最终状态。

## Risks / Trade-offs

- [平台存储容量与配额限制] → 备份键控制数量并在恢复后清理；容量错误以类型化错误呈现。
- [非原子平台后端的半写入窗口] → 临时键+校验+替换策略缩小窗口，损坏时备份键可回退；集成测试覆盖中断路径。
- [生命周期事件高频触发写放大] → 按"最后一次有效状态"收敛，合并同一窗口内保存，避免无谓写入。
- [Web Desktop 与原生后端差异] → 适配器薄映射集中处理差异，v1 验证 Web Desktop，原生在对应 change 追加构建矩阵。

## Migration Plan

无存量数据迁移：本 change 引入新适配器，尚未有生产存档。实现顺序为 TDD：先写 `tests/framework/foundation/platform-storage.test.ts` 覆盖写入中断、损坏恢复、备份恢复路径（红期），再实现 `adapters/cocos/storage/*` 至转绿；随后实现 7.6 生命周期集成测试；最后同步根入口白名单并更新总计划任务状态。归档前执行 ADR 检查。

## Open Questions

无。原子策略、损坏恢复路径与生命周期收敛方式已在 Decisions 落定，不改变 spec 行为契约。

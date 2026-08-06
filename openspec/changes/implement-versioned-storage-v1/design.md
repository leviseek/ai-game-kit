# Implement Versioned Storage v1 — Design

## Context

框架已具备分层模式：`contracts/*`（纯接口与类型化错误）、`core/*`（引擎无关实现）、`adapters/memory/*` 与 `adapters/cocos/*`（注入接缝）、`tests/framework/foundation/*.test.ts`（bun）。现有 `PlatformStorage` 契约（`assets/framework/contracts/platform/Platform.ts`）提供最小异步键值接口 get/set/delete，其注释明确"存档 DTO/迁移属后续能力"。本 change 在其之上实现版本化存档仓库与迁移链，保持引擎无关、显式注入、无全局状态。

## Goals / Non-Goals

**Goals:**
- 提供引擎无关的版本化存档仓库：命名空间隔离、schema version、连续迁移、未来版本拒绝、DTO 可序列化校验
- 迁移链按注册版本逐级执行，迁移规则由调用方提供，框架不感知游戏数据形状
- 通过 `PlatformStorage` 契约注入存储后端，可用内存实现完成 TDD 闭环
- 严格类型化：错误以类型化错误（`FrameworkError` 子类或既有错误机制）表达

**Non-Goals:**
- 不实现平台存储适配器（`adapters/memory`/`adapters/cocos` 存储实现）——属原 7.5
- 不实现配置服务（原 7.1/7.2）、音频（6.6/6.7）、输入（6.4/6.5）
- 不接入 `index.ts` 白名单导出与 AppRoot 装配（本层为独立能力，待集成）
- 不引入 JSON schema 或其他序列化依赖

## Decisions

### 1. 迁移注册采用"版本 → 升级函数"映射表

迁移器以 `Migrator<S, T>`（`S`→`T`）或等价函数形式注册，仓库维护 `Map<sourceVersion, Migrator>`，读取时从记录版本逐级执行到当前版本。

- **理由**：比链式对象更简单直接；只支持相邻版本升级（v1→v2→v3），缺失中间版本即报错，符合 spec"Missing version migration fails"。
- **备选**：链式 `MigrationChain` 对象。映射表可表达缺失级并给出精确错误，链条结构在此规模无额外收益。

### 2. DTO 校验用手写递归检查，不引入依赖

写入前用轻量递归校验器检测不可序列化值（`undefined`、函数、symbol、循环引用、`BigInt`），拒绝后不产生任何写入。

- **理由**：项目约束不主动引入新依赖；循环引用与函数是主要风险，手写校验可控且可测。
- **备选**：`JSON.stringify` try/catch 探测。该法无法区分"不可序列化"与"部分截断"（`undefined` 字段会被静默丢弃，但不应允许写入）；递归校验在写入前即拒绝，语义更严格。
- **权衡**：递归校验对深层对象有栈开销，但存档 DTO 深度通常受限，可接受。

### 3. 存储布局：命名空间 + 存档键 → 封装记录

存储后端（`PlatformStorage`）以命名空间作为键前缀，值为封装记录 `{ version: number; data: unknown }` 的 JSON 字符串。命名空间隔离通过键前缀实现，复用既有 `PlatformStorage`，不新增存储接口。

- **理由**：`PlatformStorage` 已存在且适配器可替换；前缀方案让隔离语义落在键空间，便于未来平台适配器直接复用。
- **备选**：为每个命名空间新建子存储实例。增加适配器负担，且与最小键值契约冲突。

### 4. 读取流程为"读记录 → 拒绝未来版本 → 逐级迁移"

- 记录版本 > 当前版本：抛类型化错误（含记录版本与当前版本）
- 记录版本 == 当前版本：直接返回数据
- 记录版本 < 当前版本：按迁移映射逐级升级；某级缺失则抛类型化错误（含缺失路径）

### 5. 错误类型化与错误类归属

新增存储专属类型化错误（`SaveVersionError`、`SaveMigrationError`、`SaveSerializationError`、`SaveCorruptionError`），沿用框架既有 `FrameworkError` 机制（`core/errors/`），携带版本号、缺失迁移路径等可诊断上下文。错误类与实现同在 `core/storage`（遵循 ServiceRegistry 先例），`contracts/storage` 只保留纯接口，避免 contracts 值导入 core 实现层（见 ADR-013）。

- **理由**：与 `core/services/ServiceRegistry.ts` 的"错误类与实现同层"一致；损坏记录（JSON 非法/形状不符）抛 `SaveCorruptionError`、迁移缺失/失败抛 `SaveMigrationError`（迁移失败经 `cause` 保留底层错误），调用方可区分空存档与数据损坏。

### 6. 存储键编码

存储键由 `save:` 前缀、`encodeURIComponent(namespace)`、分隔符 `:`、`encodeURIComponent(key)` 拼接，保证不同 (namespace, key) 组合不因保留字符（`:`, `%`）冲突而互相覆盖（见 ADR-013）。

## Risks / Trade-offs

- [迁移规则未注册即静默丢档] → 缺失迁移一律类型化报错，不静默降级；测试覆盖缺失路径。
- [手写校验器漏判序列化边界] → 校验覆盖 `undefined`/函数/symbol/循环引用/BigInt，测试逐项断言；未来如需更严格可换 JSON schema 而不改 spec。
- [逐级迁移中断于单级失败] → 迁移执行中任一级抛错即整体失败并返回类型化错误，不落盘部分结果。
- [写入非原子] → 本层只保证校验前置；原子替换/备份属 7.5 平台适配器范围，spec 已按此划分。

## Migration Plan

无存量数据迁移：本 change 引入新能力，尚未有生产存档。实现顺序为 TDD：先写 `tests/framework/foundation/versioned-storage.test.ts` 覆盖 spec 场景，再实现 `contracts/storage/*` 与 `core/storage/*` 直至测试通过。

## Open Questions

无。迁移注册形状、DTO 校验方式与存储布局已在 Decisions 中落定，不改变 spec 行为契约。

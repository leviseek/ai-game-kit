# Implement Versioned Storage v1

## Why

主框架 change `create-game-framework-v1` 的第 7 章规划了配置与版本化存档，其中 7.3/7.4 要求提供引擎无关的存档仓库与迁移链：玩家存档需要命名空间隔离、schema version 标记、跨版本连续迁移与未来版本拒绝，当前仅存在最小异步键值存储契约 `PlatformStorage`（get/set/delete），不承载 DTO 校验与迁移语义。本 change 补齐这一缺失能力，为后续平台存储适配器与存档集成（7.5/7.6）提供纯 TypeScript、可独立测试的基础层。

## What Changes

- 新增 `versioned-storage` 能力，提供引擎无关的版本化存档仓库：
  - 命名空间隔离：不同命名空间的存档互不可见、互不覆盖
  - schema version：每个存档记录携带版本号，仓库按版本读取
  - 连续迁移：从任意已支持旧版本可经迁移链逐级升级到当前版本
  - 未来版本拒绝：遇到高于当前支持版本的存档，读取失败并返回类型化错误，不产生损坏数据
  - DTO 可序列化约束：写入的 DTO 须可 JSON 序列化，不可序列化对象在写入前被拒绝
- 新增迁移链：版本化迁移器注册与按序执行的机制，迁移规则由调用方提供，框架不感知具体游戏数据形状
- 依赖显式注入：仓库由调用方传入存储后端（复用 `PlatformStorage` 契约）、当前版本与迁移器集合，不引入全局状态

## Capabilities

### New Capabilities

- `versioned-storage`: 引擎无关的版本化存档仓库与迁移链，提供命名空间、schema version、连续迁移、未来版本拒绝与 DTO 可序列化约束

### Modified Capabilities

无。`PlatformStorage` 契约保持不变（仍为最小异步键值存储），本 change 在其之上新增能力而非修改其语义。

## Impact

- 新增代码：`assets/framework/contracts/storage/*`（纯契约接口）、`assets/framework/core/storage/*`（类型化错误与存档仓库实现）
- 新增测试：`tests/framework/foundation/versioned-storage.test.ts`，覆盖命名空间、schema version、连续迁移、未来版本拒绝与 DTO 可序列化约束
- 依赖：纯 TypeScript，无 Cocos 依赖；存储后端通过 `PlatformStorage` 契约注入
- 不影响既有公开 API；本 change 不接入平台存储适配器（7.5 范围），不改动 `index.ts` 白名单导出

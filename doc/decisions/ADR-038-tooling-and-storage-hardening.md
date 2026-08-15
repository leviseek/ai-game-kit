# ADR-038: Cross-Package Reference Validation, Constants Freshness, and Storage Reuse

## Status

Accepted

## Context

治理收尾批次，五项：

1. `fgui validate` 对跨包引用只发"请人工确认"警告，不解析目标包反向校验——引用断裂（目标包无该资源）不报 error。
2. gen-constants 产物不受 freshness 保护（ADR-032 残余约束）——`ui-<包>.ts` URL 常量表过期不被拦截。
3. `LineupStore`/`IdleRewardsStore` 各含约 60 行自实现版本/迁移/损坏判定；`createVersionedStorage` 不在根白名单，商店无法复用。
4. 工具链可复现性：`check-foundation-contracts.ts` 硬编码本机 Creator 路径；`fixture-perf` 默认跳过构建；arch-viewer 依赖全局 codegraph 但缺失无指引。
5. P2-5"public-boundary 正则漏检"经核实不成立——`extractModuleSpecifiers` 主路径为 `Bun.Transpiler.scan`（真解析），正则仅补充。

## Decision

### 1. 跨包引用反向校验（P2-4）

`validateComponent` 跨包分支按包 id 解析目标包（复用 list defaultItem 的目标包解析模式）：命中且 `src` 存在 → 无问题；命中但缺失 → error；目标包不可解析 → 保留 warning。真实工程 AutoBattle/CardGame → Common 引用经实跑验证全部解析成功，`validate --strict` 通过且噪音警告消除。

### 2. gen-constants freshness（P1-7）

`validate` 新增 `checkConstantFreshness`（与 `checkTypeFreshness` 对称）：重算期望清单与磁盘 `ui-<包>.ts` 逐字对比，缺失/过期/多余均报 error。生成物与源 XML 的同步义务扩大至 URL 常量表，消除 ADR-032 残余约束。

### 3. 版本化存储复用 + 固定 storageKey（P2-9）

`IVersionedStorageOptions` 新增可选 `storageKey`：`composeKey = fixedKey ?? composeStorageKey(ns, key)`，save/load/delete 统一使用。`LineupStore`/`IdleRewardsStore` 迁移为委托 `createVersionedStorage`（storageKey 保留既有键 → 真实存档原位可读、既有测试零改动），保留形状校验与 payload 前置拒绝。版本化存储全套（工厂 + 4 错误 + 5 类型）纳入根白名单。理由：storageKey 使商店保持原键，避免"换键 + 旧键迁移"的额外复杂度。

### 4. 工具链可复现性

`check-foundation-contracts.ts` 移除硬编码路径（仅 `COCOS_TSC`/`COCOS_CREATOR_HOME` 环境探测）；`fixture-perf` 默认先构建（`skip-build=false`，产物陈旧时数据失真）；`runCodeGraphCommand` 对 ENOENT 抛带安装/`codegraph init` 指引的类型化错误。

### 5. P2-5 核实关闭

import 扫描已 AST 化（`Bun.Transpiler.scan`），正则仅补充静态 import/require 边角；无代码改动，结论记录于 ADR 与 change design。

## Consequences

- **tools/fgui**：跨包反向校验 + gen-constants freshness + 两处测试；`validate --strict` 对真实包零 warning。
- **framework**：`createVersionedStorage` storageKey 可选字段；根白名单 +10 符号（`expectedRootExports` 同步）；品类商店删除自实现版本/迁移逻辑。
- **工具链**：fixture-perf 默认构建；contracts 检查仅环境变量；codegraph 缺失可诊断。
- **测试**：fgui（P2-4/gen-constants freshness）、versioned-storage（storageKey）、商店既有测试零改动全过；全部门禁本地绿。
- **Non-Goals（记录）**：P2-6 大文件拆分、P2-10 list 重试事件化、P2-11 渲染热路径、CI 恢复（P0-1）。
- **落地 change**：`2026-08-15-p2-tooling-and-storage-hardening`。

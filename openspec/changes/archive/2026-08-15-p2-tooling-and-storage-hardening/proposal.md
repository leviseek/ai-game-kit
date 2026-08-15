## Why

剩余治理项的收尾批次，覆盖工具链校验加固与存储复用：

1. **P2-4 跨包引用只单向校验**：`fgui validate` 对 `ui://<pkgid><resid>` 跨包引用只发"请在目标包确认资源存在"警告，不解析目标包反向校验——引用断裂（目标包无该资源）不报 error。
2. **P1-7 gen-constants freshness 缺失**：`validate` 只保护 `gen-types` 产物，`ui-<包>.ts` URL 常量表过期不被拦截（ADR-032 残余约束）。
3. **P2-9 版本化存储逐品类重复**：`LineupStore`/`IdleRewardsStore` 各自实现版本/迁移/损坏判定约 60 行（`createVersionedStorage` 此前不在白名单）。
4. **工具链可复现性**：`check-foundation-contracts.ts` 硬编码本机 Creator 路径；`fixture-perf` 默认 `skip-build=true`（产物陈旧时测到旧版本）；arch-viewer 依赖全局 `codegraph` 二进制但缺失时无指引。
5. **P2-5（以核实关闭）**：`public-boundary` 的 import 扫描实为 `Bun.Transpiler.scan`（真解析）为主、正则仅补充——"正则漏检"担忧不成立，无需改动。

## What Changes

- **P2-4**：`validateComponent` 跨包引用分支解析目标包（`listPackages`+`readPackage` 按包 id 匹配）后反向校验 `src` 在目标包 resources 存在：命中 → 无问题（消除噪音警告）；缺失 → error；目标包不可解析（官方库/工程外包）→ 保留人工确认警告。
- **P1-7**：`validate` 新增 `checkConstantFreshness`（与 `checkTypeFreshness` 对称）：重算 gen-constants 期望清单，与磁盘 `ui-<包>.ts` 逐字对比；缺失/过期/多余产物均报 error。
- **P2-9**：`createVersionedStorage` 新增可选 `storageKey`（固定键覆盖默认组合键）；`LineupStore`/`IdleRewardsStore` 迁移为委托 `createVersionedStorage`（保留原键不换键、保留形状校验层），删除重复的版本/迁移/损坏实现；版本化存储全套（工厂 + 类型化错误 + 契约类型）纳入根白名单。
- **工具链**：`check-foundation-contracts.ts` 移除硬编码 Creator 路径（仅环境变量探测）；`fixture-perf` 默认 `skip-build=false`（先构建再采样）；`runCodeGraphCommand` 对 ENOENT 抛带安装指引的类型化错误。
- **P2-5**：核实为已 AST 化，无代码改动（记录于 design）。

## Goals / Non-Goals

**Goals:** 跨包引用可反向校验（断裂即报错）；gen-constants 产物受 freshness 保护；版本化存储单点实现、商店复用；工具链可复现性（路径/构建默认值/缺失指引）；本地全部门禁全绿。

**Non-Goals:** 不做 P2-6 大文件拆分（纯重构、收益低、风险大）；不做 P2-10 list 重试事件化（需 UI-ready 就绪管线）；不做 P2-11 渲染热路径（需真实性能数据）；CI 恢复仍暂缓（P0-1）。

## Capabilities

### Modified Capabilities

- `fgui-type-codegen`: 跨包引用反向校验（目标包资源存在性）+ gen-constants 产物 freshness。
- `versioned-storage`: 可选固定 `storageKey`（覆盖默认组合键）+ 工厂/错误/类型经根入口公开。
- `architecture-visualization`: codegraph 缺失时提供安装/初始化指引（ENOENT 类型化错误）。

## Impact

- **tools/fgui**: `lib/fgui.ts`（validateComponent 跨包反向校验）、`commands/validate.ts`（checkConstantFreshness）、`test/fgui.test.ts`（P2-4 用例）、`test/validate-freshness.test.ts`（gen-constants freshness 用例）。
- **assets/framework**: `core/storage/VersionedStorage.ts`（storageKey）、`contracts/interfaces/IVersionedStorageOptions.ts`、`index.ts`（白名单 +9 符号）、`tests/framework/foundation/public-boundary.test.ts`（expectedRootExports 同步）、`versioned-storage.test.ts`（storageKey 用例）。
- **assets/samples/game_auto_battle/logic**: `LineupStore.ts`/`IdleRewardsStore.ts`（委托 createVersionedStorage，原键保留）。
- **tools/creator**: `commands/fixture-perf.ts`（skip-build 默认 false）。
- **tests/scripts**: `check-foundation-contracts.ts`（去硬编码路径）。
- **tools/arch-viewer**: `lib/codegraph/process.ts`（ENOENT 指引）。
- **docs**: 新增 ADR-038。

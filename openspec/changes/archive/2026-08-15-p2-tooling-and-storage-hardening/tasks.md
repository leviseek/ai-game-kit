# Implementation Tasks

## 1. P2-4 跨包引用反向校验

- [x] 1.1 `tools/fgui/lib/fgui.ts` `validateComponent`：跨包分支解析目标包（按包 id），src 存在 → 无问题；缺失 → error；目标包不可解析 → 保留 warning
- [x] 1.2 `tools/fgui/test/fgui.test.ts`：P2-4 用例（Common 目标包有效引用无问题 / 缺失资源报 error）
- [x] 1.3 真实工程验证：AutoBattle/CardGame/Demo/Common `validate --strict` 全通过，跨包警告消除

## 2. P1-7 gen-constants freshness

- [x] 2.1 `commands/validate.ts`：新增 `checkConstantFreshness`（与 checkTypeFreshness 对称，跳过 -types.ts）+ 接入 run 流程
- [x] 2.2 `test/validate-freshness.test.ts`：gen-constants freshness 用例（一致通过 / 组件增删过期失败 / 缺失提示 / 多余产物失败）

## 3. P2-9 版本化存储复用

- [x] 3.1 `IVersionedStorageOptions.storageKey?` + `VersionedStorage` composeKey 覆盖
- [x] 3.2 `index.ts` 白名单 +9（createVersionedStorage / SaveCorruptionError / SaveMigrationError / SaveSerializationError / SaveVersionError / ISaveLoadResult / ISaveMigrator / ISaveVersion / IVersionedStorage / IVersionedStorageOptions = 10 个符号）并同步 `expectedRootExports`
- [x] 3.3 `LineupStore`/`IdleRewardsStore` 迁移为委托 `createVersionedStorage`（storageKey 保留原键、形状校验保留）
- [x] 3.4 测试：`versioned-storage.test.ts` storageKey 覆盖/缺省组合用例；商店既有测试零改动全过

## 4. 工具链可复现性

- [x] 4.1 `tests/scripts/check-foundation-contracts.ts`：移除硬编码 Creator 路径（仅环境变量探测 + 指引）
- [x] 4.2 `tools/creator/commands/fixture-perf.ts`：`skip-build` 默认 false（先构建再采样）
- [x] 4.3 `tools/arch-viewer/lib/codegraph/process.ts`：ENOENT 抛类型化错误附安装/init 指引

## 5. P2-5 核实关闭

- [x] 5.1 核实 `extractModuleSpecifiers` 主路径为 `Bun.Transpiler.scan`（真解析），正则仅补充——无代码改动，结论记录于 design D5

## 6. 文档与最终校验

- [x] 6.1 新增 `doc/decisions/ADR-038-tooling-and-storage-hardening.md`
- [x] 6.2 全量门禁：`bun run test` / `bun run typecheck` / `bun run lint` / `bun run format:check` / `fgui validate --strict`（4 包）全部通过
- [x] 6.3 运行 `openspec validate 2026-08-15-p2-tooling-and-storage-hardening --strict`，Expected: PASS
- [x] 6.4 归档后运行 `openspec validate --specs --strict`，Expected: PASS
